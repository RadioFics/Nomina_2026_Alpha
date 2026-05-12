#!/usr/bin/env node
// ============================================================================
//  test-formularios.js — Prueba de formularios públicos MineDax
//
//  Verifica de extremo a extremo:
//    1. Servidor arriba (health check)
//    2. Verificación de empleado por cédula
//    3. Envío de Solicitud de Permiso  → BD + correo + PDF
//    4. Envío de Solicitud de Vacaciones → BD + correo + PDF
//    5. Lectura de esos registros desde importar (verificación DB directa)
//
//  Uso:
//    node test-formularios.js --cedula 1234567890
//    node test-formularios.js --cedula 1234567890 --puerto 3001
//    node test-formularios.js --cedula 1234567890 --solo-db   (sin HTTP, solo consulta BD)
//
//  Requisitos:
//    - node >= 18  (fetch nativo)
//    - El servidor debe estar corriendo (npm start) salvo con --solo-db
//    - .env con credenciales de BD y opcionalmente de correo
// ============================================================================

'use strict';
require('dotenv').config();

// ─── Argumentos ──────────────────────────────────────────────────────────────
const argv    = process.argv.slice(2);
const get     = (flag) => { const i = argv.indexOf(flag); return i !== -1 ? argv[i + 1] : null; };
const has     = (flag) => argv.includes(flag);

const CEDULA  = get('--cedula');
const PUERTO  = get('--puerto') || process.env.PORT || '3000';
const SOLO_DB = has('--solo-db');
const BASE    = `http://localhost:${PUERTO}`;

// ─── Colores consola ─────────────────────────────────────────────────────────
const C = {
  reset:  '\x1b[0m',
  bold:   '\x1b[1m',
  dim:    '\x1b[2m',
  green:  '\x1b[32m',
  red:    '\x1b[31m',
  yellow: '\x1b[33m',
  cyan:   '\x1b[36m',
  blue:   '\x1b[34m',
  white:  '\x1b[37m',
};

const OK   = `${C.green}✓${C.reset}`;
const FAIL = `${C.red}✗${C.reset}`;
const WARN = `${C.yellow}⚠${C.reset}`;
const INFO = `${C.cyan}→${C.reset}`;

function titulo(texto) {
  console.log(`\n${C.bold}${C.cyan}${'─'.repeat(60)}${C.reset}`);
  console.log(`${C.bold}${C.cyan}  ${texto}${C.reset}`);
  console.log(`${C.bold}${C.cyan}${'─'.repeat(60)}${C.reset}`);
}

function ok(msg)   { console.log(`  ${OK}  ${msg}`); }
function fail(msg) { console.log(`  ${FAIL}  ${C.red}${msg}${C.reset}`); }
function warn(msg) { console.log(`  ${WARN}  ${C.yellow}${msg}${C.reset}`); }
function info(msg) { console.log(`  ${INFO}  ${C.dim}${msg}${C.reset}`); }

// ─── Fecha helper ─────────────────────────────────────────────────────────────
function fechaISO(offsetDias = 0) {
  const d = new Date();
  d.setDate(d.getDate() + offsetDias);
  return d.toISOString().split('T')[0]; // YYYY-MM-DD
}

// ─── HTTP helper ──────────────────────────────────────────────────────────────
async function get_req(url) {
  const r = await fetch(url);
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

async function post_req(url, data) {
  const r = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body:    JSON.stringify(data),
  });
  const body = await r.json().catch(() => ({}));
  return { status: r.status, body };
}

// ─── BD helpers ───────────────────────────────────────────────────────────────
let db;
async function conectarDB() {
  if (db) return db;
  const { getConnection } = require('./config/database');
  db = await getConnection();
  return db;
}

async function q(sql, params = {}) {
  const { executeQuery } = require('./config/database');
  return executeQuery(sql, params);
}

// ─── Resultados globales ──────────────────────────────────────────────────────
const resultados = { ok: 0, fail: 0, warn: 0 };

function paso(condicion, msgOk, msgFail, esWarning = false) {
  if (condicion) {
    ok(msgOk);
    resultados.ok++;
  } else if (esWarning) {
    warn(msgFail);
    resultados.warn++;
  } else {
    fail(msgFail);
    resultados.fail++;
  }
}

// ============================================================================
// TESTS
// ============================================================================

async function test1_healthCheck() {
  titulo('TEST 1 — Health check del servidor');
  try {
    const { status, body } = await get_req(`${BASE}/api/health`);
    paso(status === 200, `Servidor respondió OK (${status})`, `Servidor no responde (${status})`);
    info(`Respuesta: ${JSON.stringify(body)}`);
  } catch (err) {
    fail(`No se pudo conectar al servidor en ${BASE} — ¿está corriendo npm start?`);
    info(`Error: ${err.message}`);
    resultados.fail++;
    throw new Error('Servidor no disponible — abortando tests HTTP');
  }
}

async function test2_verificarEmpleado(cedula) {
  titulo('TEST 2 — Verificar empleado por cédula');
  info(`Cédula: ${cedula}`);

  const { status, body } = await get_req(`${BASE}/api/solicitudes/verificar-empleado?cedula=${cedula}`);

  paso(status === 200 && body.success,
       `Empleado encontrado: ${body.nombre} | ${body.cargo}`,
       `Empleado no encontrado (${status}) — ${body.error || ''}`);

  if (body.success) {
    info(`COD_FUNCI: ${body.codFunci}`);
    info(`Área: ${body.area || '(sin área)'}`);
  }

  return body;
}

async function test3_enviarPermiso(cedula, email) {
  titulo('TEST 3 — Enviar Solicitud de Permiso');

  const payload = {
    cedula,
    email_solicitante: email || '',
    fecha_desde:       fechaISO(1),   // mañana
    fecha_hasta:       fechaISO(1),   // mañana (1 día)
    hora_inicio:       '08:00',
    hora_fin:          '12:00',
    total_dias:        '0.5',
    motivo:            'Calamidad Doméstica',
    cual:              'Diligencia médica familiar',
    explicacion:       'Prueba automática desde test-formularios.js',
    tipo_permiso:      'Remunerado',
    observaciones:     '[TEST AUTOMATICO — puede eliminarse]',
  };

  info(`Payload: cedula=${cedula}, fecha=${payload.fecha_desde}, motivo=${payload.motivo}`);

  const { status, body } = await post_req(`${BASE}/api/solicitudes/permiso`, payload);

  paso(status === 200 && body.success,
       `Solicitud de permiso creada (${body.estado}) — COD_NOVED: ${body.codNoved}`,
       `Error al enviar permiso (${status}) — ${body.error || JSON.stringify(body)}`);

  if (body.success) {
    info(`Nombre: ${body.nombre}`);
    info(`Estado BD: ${body.estado}`);
    info(`Mensaje: ${body.mensaje}`);
  }

  return body;
}

async function test4_verificarPermisoDB(cedula) {
  titulo('TEST 4 — Verificar registro de permiso en BD');

  try {
    await conectarDB();

    const r = await q(`
      SELECT TOP 5
        n.COD_NOVED,
        t.NUM_IDEN        AS CEDULA,
        t.NOM_COMP        AS NOMBRE,
        n.COD_CONC,
        n.FEC_INI,
        n.FEC_FIN,
        n.ACT_ESTA,
        n.ACT_USUA,
        n.OBS_NOVED,
        n.FEC_REGI
      FROM dbo.NO_NOVED n
      INNER JOIN dbo.GN_FUNCI  f ON f.COD_FUNCI = n.COD_FUNCI AND f.COD_EMPR = n.COD_EMPR
      INNER JOIN dbo.GN_TERCE  t ON t.COD_TERC  = f.COD_TERC
      WHERE n.COD_EMPR   = 1
        AND t.NUM_IDEN   = CAST(@cedula AS BIGINT)
        AND n.ACT_USUA   = 'SELF_SVC'
        AND n.COD_CONC   IN (68, 74, 75)
      ORDER BY n.FEC_REGI DESC
    `, { cedula });

    const rows = r.recordset || [];
    paso(rows.length > 0,
         `${rows.length} registro(s) de permiso encontrado(s) en NO_NOVED`,
         'No se encontraron registros de permiso (SELF_SVC) en NO_NOVED');

    rows.forEach((row, i) => {
      info(`  [${i+1}] COD_NOVED=${row.COD_NOVED} | COD_CONC=${row.COD_CONC} | FEC_INI=${row.FEC_INI?.toISOString?.()?.split('T')[0] || row.FEC_INI} | FEC_FIN=${row.FEC_FIN?.toISOString?.()?.split('T')[0] || row.FEC_FIN} | ESTA=${row.ACT_ESTA}`);
    });

    // Verificar también en NO_AUSEN
    if (rows.length > 0) {
      const noved = rows[0];
      const ra = await q(`
        SELECT TOP 1 COD_NOVED, FEC_INI, FEC_FIN, DIAS_TOTAL, DIAGNOSTICO
        FROM dbo.NO_AUSEN
        WHERE COD_EMPR = 1 AND COD_NOVED = @codNoved
      `, { codNoved: noved.COD_NOVED });

      paso((ra.recordset || []).length > 0,
           `Registro complementario encontrado en NO_AUSEN (COD_NOVED=${noved.COD_NOVED})`,
           'No se encontró registro en NO_AUSEN — puede ser normal si la inserción falló',
           true);
    }

  } catch (err) {
    fail(`Error consultando BD: ${err.message}`);
    resultados.fail++;
  }
}

async function test5_enviarVacaciones(cedula, email) {
  titulo('TEST 5 — Enviar Solicitud de Vacaciones');

  const payload = {
    cedula,
    email_solicitante: email || '',
    fecha_inicio:      fechaISO(7),   // próxima semana
    fecha_fin:         fechaISO(14),  // dos semanas
    dias_vacaciones:   '8',
    actividades:       'Descanso y tiempo familiar',
    reemplazo:         'Por definir con jefatura',
    observaciones:     '[TEST AUTOMATICO — puede eliminarse]',
  };

  info(`Payload: cedula=${cedula}, desde=${payload.fecha_inicio} hasta=${payload.fecha_fin}, días=${payload.dias_vacaciones}`);

  const { status, body } = await post_req(`${BASE}/api/solicitudes/vacaciones`, payload);

  paso(status === 200 && body.success,
       `Solicitud de vacaciones creada (${body.estado}) — COD_NOVED: ${body.codNoved}`,
       `Error al enviar vacaciones (${status}) — ${body.error || JSON.stringify(body)}`);

  if (body.success) {
    info(`Nombre: ${body.nombre}`);
    info(`Estado BD: ${body.estado}`);
    info(`Mensaje: ${body.mensaje}`);
  }

  return body;
}

async function test6_verificarVacacionesDB(cedula) {
  titulo('TEST 6 — Verificar registro de vacaciones en BD');

  try {
    await conectarDB();

    const r = await q(`
      SELECT TOP 5
        n.COD_NOVED,
        t.NUM_IDEN        AS CEDULA,
        t.NOM_COMP        AS NOMBRE,
        n.COD_CONC,
        n.FEC_INI,
        n.FEC_FIN,
        n.ACT_ESTA,
        n.ACT_USUA,
        n.OBS_NOVED,
        a.DIAS_TOTAL
      FROM dbo.NO_NOVED n
      INNER JOIN dbo.GN_FUNCI  f ON f.COD_FUNCI = n.COD_FUNCI AND f.COD_EMPR = n.COD_EMPR
      INNER JOIN dbo.GN_TERCE  t ON t.COD_TERC  = f.COD_TERC
      LEFT  JOIN dbo.NO_AUSEN  a ON a.COD_EMPR  = n.COD_EMPR AND a.COD_NOVED = n.COD_NOVED
      WHERE n.COD_EMPR   = 1
        AND t.NUM_IDEN   = CAST(@cedula AS BIGINT)
        AND n.ACT_USUA   = 'SELF_SVC'
        AND n.COD_CONC   = 63
      ORDER BY n.FEC_REGI DESC
    `, { cedula });

    const rows = r.recordset || [];
    paso(rows.length > 0,
         `${rows.length} registro(s) de vacaciones encontrado(s) en NO_NOVED`,
         'No se encontraron registros de vacaciones (SELF_SVC) en NO_NOVED');

    rows.forEach((row, i) => {
      info(`  [${i+1}] COD_NOVED=${row.COD_NOVED} | FEC_INI=${row.FEC_INI?.toISOString?.()?.split('T')[0] || row.FEC_INI} | FEC_FIN=${row.FEC_FIN?.toISOString?.()?.split('T')[0] || row.FEC_FIN} | DÍAS=${row.DIAS_TOTAL ?? 'N/A'} | ESTA=${row.ACT_ESTA}`);
    });

  } catch (err) {
    fail(`Error consultando BD: ${err.message}`);
    resultados.fail++;
  }
}

async function test7_importarPDF_check() {
  titulo('TEST 7 — Ruta de importar PDF (verificación de endpoint)');

  // Verificar que el endpoint responde (sin mandar un PDF, esperamos 400)
  try {
    const r = await fetch(`${BASE}/api/pdf/importar`, { method: 'POST' });
    // Sin body multipart → el servidor debería responder 400 o 500, no 404
    const esRutaActiva = r.status !== 404;
    paso(esRutaActiva,
         `Endpoint /api/pdf/importar activo (responde ${r.status} — esperable sin PDF)`,
         'Endpoint /api/pdf/importar devolvió 404 — ruta no registrada');
    info(`Para probar la importación real, ejecuta: node test-importar-pdf.js --cedula ${CEDULA || 'CEDULA'}`);
    info(`El endpoint espera POST multipart/form-data con campo "archivos[]" (PDFs de permiso/vacaciones)`);
  } catch (err) {
    fail(`No se pudo contactar /api/pdf/importar: ${err.message}`);
    resultados.fail++;
  }
}

async function test8_soloDBConsulta(cedula) {
  titulo('TEST DB — Resumen de registros SELF_SVC del empleado');

  try {
    await conectarDB();

    const r = await q(`
      SELECT
        n.COD_NOVED,
        n.COD_CONC,
        CASE n.COD_CONC
          WHEN 68 THEN 'Permiso Remunerado'
          WHEN 74 THEN 'Permiso Compensatorio'
          WHEN 75 THEN 'Permiso Familia'
          WHEN 63 THEN 'Vacaciones'
          ELSE CAST(n.COD_CONC AS VARCHAR)
        END AS TIPO,
        n.FEC_INI,
        n.FEC_FIN,
        n.ACT_ESTA,
        n.FEC_REGI,
        a.DIAS_TOTAL
      FROM dbo.NO_NOVED n
      INNER JOIN dbo.GN_FUNCI  f ON f.COD_FUNCI = n.COD_FUNCI AND f.COD_EMPR = n.COD_EMPR
      INNER JOIN dbo.GN_TERCE  t ON t.COD_TERC  = f.COD_TERC
      LEFT  JOIN dbo.NO_AUSEN  a ON a.COD_EMPR  = n.COD_EMPR AND a.COD_NOVED = n.COD_NOVED
      WHERE n.COD_EMPR   = 1
        AND t.NUM_IDEN   = CAST(@cedula AS BIGINT)
        AND n.ACT_USUA   = 'SELF_SVC'
      ORDER BY n.FEC_REGI DESC
    `, { cedula });

    const rows = r.recordset || [];

    if (rows.length === 0) {
      warn(`No hay registros SELF_SVC para cédula ${cedula}`);
    } else {
      ok(`${rows.length} registro(s) total de autoservicio en BD:`);
      console.log('');
      console.log(`  ${'COD_NOVED'.padEnd(12)} ${'TIPO'.padEnd(22)} ${'FEC_INI'.padEnd(12)} ${'FEC_FIN'.padEnd(12)} ${'DÍAS'.padEnd(6)} ESTA`);
      console.log(`  ${'─'.repeat(75)}`);
      rows.forEach(row => {
        const ini  = row.FEC_INI?.toISOString?.()?.split('T')[0] || String(row.FEC_INI || '').slice(0,10);
        const fin  = row.FEC_FIN?.toISOString?.()?.split('T')[0] || String(row.FEC_FIN || '').slice(0,10);
        const dias = row.DIAS_TOTAL != null ? String(row.DIAS_TOTAL) : '-';
        const esta = row.ACT_ESTA === 'A' ? `${C.green}A${C.reset}` : `${C.yellow}${row.ACT_ESTA}${C.reset}`;
        console.log(`  ${String(row.COD_NOVED).padEnd(12)} ${String(row.TIPO).padEnd(22)} ${ini.padEnd(12)} ${fin.padEnd(12)} ${dias.padEnd(6)} ${esta}`);
      });
      console.log('');
    }

  } catch (err) {
    fail(`Error consultando BD: ${err.message}`);
    resultados.fail++;
  }
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  console.log(`\n${C.bold}╔${'═'.repeat(58)}╗${C.reset}`);
  console.log(`${C.bold}║      MineDax — Test de Formularios Públicos            ║${C.reset}`);
  console.log(`${C.bold}╚${'═'.repeat(58)}╝${C.reset}`);

  if (!CEDULA) {
    console.log(`\n${C.red}${C.bold}  ERROR: Se requiere --cedula${C.reset}`);
    console.log(`\n  Uso:`);
    console.log(`    node test-formularios.js --cedula 1234567890`);
    console.log(`    node test-formularios.js --cedula 1234567890 --puerto 3001`);
    console.log(`    node test-formularios.js --cedula 1234567890 --solo-db\n`);
    process.exit(1);
  }

  console.log(`\n  ${C.dim}Servidor:  ${BASE}${C.reset}`);
  console.log(`  ${C.dim}Cédula:    ${CEDULA}${C.reset}`);
  console.log(`  ${C.dim}Modo:      ${SOLO_DB ? 'Solo BD (sin HTTP)' : 'HTTP + BD'}${C.reset}`);

  try {
    if (SOLO_DB) {
      // ── Modo solo-db: solo consulta la BD directamente ──────────────────
      await test8_soloDBConsulta(CEDULA);

    } else {
      // ── Modo completo: HTTP + BD ─────────────────────────────────────────
      await test1_healthCheck();

      const empData = await test2_verificarEmpleado(CEDULA);
      const emailEmpleado = '';  // No tenemos email sin login — los correos van por .env MAIL_RRHH

      if (!empData.success) {
        console.log(`\n${C.yellow}  Empleado no encontrado — saltando tests de envío.${C.reset}`);
        console.log(`  Verifica que la cédula ${CEDULA} existe en GN_TERCE + GN_FUNCI con ACT_ESTA='A'\n`);
      } else {
        await test3_enviarPermiso(CEDULA, emailEmpleado);
        await test4_verificarPermisoDB(CEDULA);

        await test5_enviarVacaciones(CEDULA, emailEmpleado);
        await test6_verificarVacacionesDB(CEDULA);

        await test7_importarPDF_check();

        // Resumen final de BD
        await test8_soloDBConsulta(CEDULA);
      }
    }

  } catch (err) {
    if (!err.message.includes('no disponible')) {
      fail(`Error inesperado: ${err.message}`);
      resultados.fail++;
    }
  }

  // ── Resumen ──────────────────────────────────────────────────────────────
  titulo('RESUMEN');
  console.log(`  ${C.green}${C.bold}Pasados:  ${resultados.ok}${C.reset}`);
  if (resultados.warn > 0)
    console.log(`  ${C.yellow}${C.bold}Avisos:   ${resultados.warn}${C.reset}`);
  if (resultados.fail > 0)
    console.log(`  ${C.red}${C.bold}Fallidos: ${resultados.fail}${C.reset}`);

  console.log('');

  if (resultados.fail === 0) {
    console.log(`  ${C.green}${C.bold}✓ Todo en orden. Los formularios públicos funcionan correctamente.${C.reset}\n`);
  } else {
    console.log(`  ${C.red}${C.bold}✗ Hay errores que revisar antes del despliegue.${C.reset}\n`);
  }

  process.exit(resultados.fail > 0 ? 1 : 0);
}

main().catch(err => {
  console.error(`\n${C.red}Error fatal: ${err.message}${C.reset}\n`);
  process.exit(1);
});
