// ============================================================================
//  controllers/solicitudesController.js
//  Formularios públicos de Permiso y Vacaciones — MineDax
//
//  Endpoints consumidos por /solicitud/permiso y /solicitud/vacaciones.
//  No requieren autenticación JWT (rutas públicas de autoservicio).
//
//  Flujo por solicitud:
//    1. Valida empleado activo en GN_TERCE + GN_FUNCI mediante cédula.
//    2. Obtiene período activo (PER_EST='A').
//    3. Registra NO_NOVED + NO_AUSEN (ACT_USUA='SELF_SVC').
//    4. Genera PDF oficial con rellenar_pdf.py (plantilla + capa de datos).
//       → Si Python no está disponible en el entorno (ej. Azure Free),
//         genera un PDF equivalente con pdfkit (Node.js puro) como respaldo.
//    5. Envía PDF al correo de RRHH y al correo del solicitante.
// ============================================================================

const { executeQuery }        = require('../config/database');
const { enviarEmail }         = require('../config/mailer');
const { subirPDFaSharePoint } = require('../config/sharepoint');
const fs                      = require('fs');
const {
  generarPermisoOficial,
  generarVacacionesOficial,
} = require('./pdfPlantillaController');
const {
  generarPDFPermiso: _pdfkitPermiso,
  generarPDFVacaciones: _pdfkitVacaciones,
} = require('./formularioController');
const path                   = require('path');

const DEFAULT_COD_EMPR = 1;
const TEMPLATES_DIR    = path.join(__dirname, '..', 'templates');
const TEMP_DIR         = path.join(__dirname, '..', 'temp');

// ─── DB helpers ──────────────────────────────────────────────────────────────

async function _resolverEmpleado(cedula) {
  // Consulta base: solo GN_FUNCI + GN_TERCE, las mismas tablas que usa
  // buscarCedulasConCoincidencia (confirmadas como existentes en la BD real).
  const r = await executeQuery(`
    SELECT TOP 1
      f.COD_FUNCI,
      t.NOM_COMP,
      f.COD_CARGO,
      f.COD_CCOST
    FROM dbo.GN_FUNCI  f
    INNER JOIN dbo.GN_TERCE t ON t.COD_TERC = f.COD_TERC
    WHERE f.COD_EMPR = @codEmpr
      AND t.NUM_IDEN = CAST(@cedula AS BIGINT)
      AND f.ACT_ESTA = 'A'
  `, { codEmpr: DEFAULT_COD_EMPR, cedula: String(cedula).trim() });

  if (!r.recordset || !r.recordset[0]) return null;

  const row = r.recordset[0];
  let cargo = '', area = '';

  // Intento opcional: traer descripción de cargo (tabla MAE_CARGO si existe)
  try {
    if (row.COD_CARGO) {
      const rc = await executeQuery(
        `SELECT TOP 1 NOM_CARGO FROM dbo.MAE_CARGO WHERE COD_CARGO = @cod`,
        { cod: row.COD_CARGO }
      );
      if (rc.recordset && rc.recordset[0]) cargo = rc.recordset[0].NOM_CARGO || '';
    }
  } catch (_) { /* tabla inexistente — no bloquea */ }

  // Intento opcional: traer descripción de centro de costo (MAE_CCOST si existe)
  try {
    if (row.COD_CCOST) {
      const rd = await executeQuery(
        `SELECT TOP 1 NOM_CCOST FROM dbo.MAE_CCOST WHERE COD_CCOST = @cod`,
        { cod: row.COD_CCOST }
      );
      if (rd.recordset && rd.recordset[0]) area = rd.recordset[0].NOM_CCOST || '';
    }
  } catch (_) { /* tabla inexistente — no bloquea */ }

  return { COD_FUNCI: row.COD_FUNCI, NOM_COMP: row.NOM_COMP, CARGO: cargo, AREA: area, COD_CCOST: row.COD_CCOST || null };
}

async function _resolverPeriodo() {
  const r = await executeQuery(`
    SELECT TOP 1
      COD_PERIOD, PER_ANO, PER_MES, PER_QNA, PER_FINI, PER_FFIN
    FROM dbo.NO_PERIOD
    WHERE COD_EMPR = @codEmpr
      AND ACT_ESTA  = 'A'
      AND PER_EST   = 'A'
      AND CONVERT(date, GETDATE()) BETWEEN PER_FINI AND PER_FFIN
    ORDER BY PER_FINI DESC
  `, { codEmpr: DEFAULT_COD_EMPR });

  if (r.recordset && r.recordset[0]) return r.recordset[0];

  const r2 = await executeQuery(`
    SELECT TOP 1
      COD_PERIOD, PER_ANO, PER_MES, PER_QNA, PER_FINI, PER_FFIN
    FROM dbo.NO_PERIOD
    WHERE COD_EMPR = @codEmpr
      AND ACT_ESTA  = 'A'
      AND PER_EST   = 'A'
    ORDER BY PER_FINI DESC
  `, { codEmpr: DEFAULT_COD_EMPR });

  return r2.recordset && r2.recordset[0] ? r2.recordset[0] : null;
}

async function _buscarDuplicado(codFunci, codConc, fechaIni, fechaFin) {
  const r = await executeQuery(`
    SELECT TOP 1 n.COD_NOVED, n.ACT_ESTA
    FROM dbo.NO_NOVED n
    LEFT JOIN dbo.NO_PERIOD p
      ON p.COD_EMPR = n.COD_EMPR AND p.COD_PERIOD = n.COD_PERIOD
    WHERE n.COD_EMPR  = @codEmpr
      AND n.COD_FUNCI = @codFunci
      AND n.COD_CONC  = @codConc
      AND n.FEC_INI   = CONVERT(date, @fechaIni)
      AND n.FEC_FIN   = CONVERT(date, @fechaFin)
      AND (n.ACT_ESTA = 'A' OR ISNULL(p.PER_EST,'') = 'A')
    ORDER BY n.ACT_ESTA DESC
  `, { codEmpr: DEFAULT_COD_EMPR, codFunci, codConc, fechaIni, fechaFin });
  return r.recordset && r.recordset[0] ? r.recordset[0] : null;
}

async function _buscarEnPeriodo(codPeriod, codFunci, codConc) {
  const r = await executeQuery(`
    SELECT TOP 1 n.COD_NOVED, n.ACT_ESTA, n.FEC_INI, n.FEC_FIN
    FROM dbo.NO_NOVED n
    WHERE n.COD_EMPR   = @codEmpr
      AND n.COD_PERIOD = @codPeriod
      AND n.COD_FUNCI  = @codFunci
      AND n.COD_CONC   = @codConc
  `, { codEmpr: DEFAULT_COD_EMPR, codPeriod, codFunci, codConc });
  return r.recordset && r.recordset[0] ? r.recordset[0] : null;
}

// ─── Insertar / actualizar NO_NOVED + NO_AUSEN ───────────────────────────────

async function _registrarNoved({ codFunci, codCcost, periodo, codConc, fechaIni, fechaFin, diasTotal, obs }) {
  const codEmpr = DEFAULT_COD_EMPR;

  const dup = await _buscarDuplicado(codFunci, codConc, fechaIni, fechaFin);
  if (dup) {
    if (dup.ACT_ESTA === 'A') {
      return { estado: 'ACUMULADO', codNoved: dup.COD_NOVED };
    }
    await executeQuery(`
      UPDATE dbo.NO_NOVED
      SET ACT_ESTA='A', ACT_USUA='SELF_SVC', ACT_HORA=GETDATE(), OBS_NOVED=@obs
      WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved
    `, { codEmpr, codNoved: dup.COD_NOVED, obs });
    await executeQuery(`
      IF EXISTS (SELECT 1 FROM dbo.NO_AUSEN WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved)
        UPDATE dbo.NO_AUSEN
        SET ACT_ESTA='A', ACT_USUA='SELF_SVC', ACT_HORA=SYSDATETIME()
        WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved;
      ELSE
        INSERT INTO dbo.NO_AUSEN (COD_EMPR,COD_NOVED,FEC_INI,FEC_FIN,DIAS_TOTAL,ACT_USUA,ACT_HORA,ACT_ESTA)
        VALUES (@codEmpr,@codNoved,CONVERT(date,@fechaIni),CONVERT(date,@fechaFin),@diasTotal,'SELF_SVC',SYSDATETIME(),'A');
    `, { codEmpr, codNoved: dup.COD_NOVED, fechaIni, fechaFin, diasTotal });
    return { estado: 'REACTIVADO', codNoved: dup.COD_NOVED };
  }

  const enPer = await _buscarEnPeriodo(periodo.COD_PERIOD, codFunci, codConc);
  if (enPer) {
    await executeQuery(`
      UPDATE dbo.NO_NOVED
      SET FEC_INI=CONVERT(date,@fechaIni), FEC_FIN=CONVERT(date,@fechaFin),
          OBS_NOVED=@obs, ACT_ESTA='A', ACT_USUA='SELF_SVC', ACT_HORA=GETDATE()
      WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved
    `, { codEmpr, codNoved: enPer.COD_NOVED, fechaIni, fechaFin, obs });
    await executeQuery(`
      IF NOT EXISTS (SELECT 1 FROM dbo.NO_AUSEN WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved)
        INSERT INTO dbo.NO_AUSEN (COD_EMPR,COD_NOVED,FEC_INI,FEC_FIN,DIAS_TOTAL,ACT_USUA,ACT_HORA,ACT_ESTA)
        VALUES (@codEmpr,@codNoved,CONVERT(date,@fechaIni),CONVERT(date,@fechaFin),@diasTotal,'SELF_SVC',SYSDATETIME(),'A');
      ELSE
        UPDATE dbo.NO_AUSEN
        SET FEC_INI=CONVERT(date,@fechaIni),FEC_FIN=CONVERT(date,@fechaFin),
            DIAS_TOTAL=@diasTotal,ACT_ESTA='A',ACT_USUA='SELF_SVC',ACT_HORA=SYSDATETIME()
        WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved;
    `, { codEmpr, codNoved: enPer.COD_NOVED, fechaIni, fechaFin, diasTotal });
    return { estado: 'ACTUALIZADO', codNoved: enPer.COD_NOVED };
  }

  // ── INSERT nuevo registro ─────────────────────────────────────────────────
  // COD_CCOST se incluye cuando la tabla lo tiene; si el valor es nulo se omite
  // de forma segura porque la columna acepta NULL.
  const ins = await executeQuery(`
    INSERT INTO dbo.NO_NOVED (
      COD_EMPR, COD_FUNCI, COD_CONC, COD_PERIOD,
      FEC_REGI, OBS_NOVED, IND_APLICADO,
      ACT_USUA, ACT_HORA, ACT_ESTA,
      FEC_INI, FEC_FIN, COD_CCOST
    ) VALUES (
      @codEmpr, @codFunci, @codConc, @codPeriod,
      CONVERT(date,GETDATE()), @obs, 'N',
      'SELF_SVC', GETDATE(), 'A',
      CONVERT(date,@fechaIni), CONVERT(date,@fechaFin), @codCcost
    );
    SELECT SCOPE_IDENTITY() AS codNoved;
  `, { codEmpr, codFunci, codConc, codPeriod: periodo.COD_PERIOD, obs, fechaIni, fechaFin, codCcost: codCcost || null });

  const codNoved = ins.recordset && ins.recordset[0] ? ins.recordset[0].codNoved : null;

  if (codNoved) {
    await executeQuery(`
      INSERT INTO dbo.NO_AUSEN (
        COD_EMPR,COD_NOVED,FEC_INI,FEC_FIN,DIAS_TOTAL,
        ACT_USUA,ACT_HORA,ACT_ESTA
      ) VALUES (
        @codEmpr,@codNoved,CONVERT(date,@fechaIni),CONVERT(date,@fechaFin),@diasTotal,
        'SELF_SVC',SYSDATETIME(),'A'
      )
    `, { codEmpr, codNoved, fechaIni, fechaFin, diasTotal });
  }

  return { estado: 'INSERTADO', codNoved };
}

// ─── Generar PDF con Python ───────────────────────────────────────────────────

function _generarPDF(tipo, datos, rutaPlantilla, rutaSalida) {
  return new Promise((resolve, reject) => {
    const tmpJson = `${rutaSalida}.json`;
    try {
      fs.writeFileSync(tmpJson, JSON.stringify(datos, null, 2), 'utf8');
    } catch (e) {
      return reject(new Error(`No se pudo escribir JSON temporal: ${e.message}`));
    }

    function cleanup() { try { fs.unlinkSync(tmpJson); } catch (_) {} }

    const isWin = process.platform === 'win32';

    // Lista de candidatos en orden de prioridad:
    //   1. PYTHON_PATH en .env  →  ruta absoluta explícita (máxima prioridad)
    //   2. python  →  ejecutable en PATH del sistema
    //   3. py      →  Windows Python Launcher
    //   4. python3 →  entornos Linux/alternativos
    //   5. .venv   →  venv del proyecto (último: puede no tener los paquetes)
    const cmds = [];

    // 1. Ruta explícita configurada en .env (más confiable en entornos con venv activo)
    const envPython = process.env.PYTHON_PATH;
    if (envPython && envPython.trim() && fs.existsSync(envPython.trim())) {
      cmds.push(envPython.trim());
    }

    // 2-4. Comandos genéricos según plataforma.
    // Azure Windows IMPORTANTE: 'py -3' invoca Python 3.x (3.6.8 en este servidor).
    // 'python' en PATH apunta a Python 2.7 → falla; 'py' sin -3 también puede ser 2.7.
    // PYTHON_ARGS permite configurar '-3' desde Azure App Settings sin tocar código.
    const pyArgs = (process.env.PYTHON_ARGS || '').trim().split(/\s+/).filter(Boolean);
    if (isWin) {
      // Si PYTHON_PATH ya fue agregado arriba con sus PYTHON_ARGS, no duplicar
      if (!cmds.length || !cmds[0].includes(process.env.PYTHON_PATH || '__')) {
        cmds.push(['py', ...pyArgs].join(' '));  // 'py -3' como string compuesto
      }
      cmds.push('py -3');   // fallback explícito
      cmds.push('python3');
    } else {
      cmds.push('python3', 'python');
    }

    // 5. Venv del proyecto como último recurso
    const venvPy = path.join(__dirname, '..', '.venv', 'Scripts', 'python.exe');
    if (isWin && fs.existsSync(venvPy) && !cmds.includes(venvPy)) {
      cmds.push(venvPy);
    }

    // PYTHONPATH: en Azure Windows los paquetes se instalan con --target
    // a D:\home\site\pythonpkgs. Sin PYTHONPATH Python no los encuentra.
    const azurePkgs = 'D:\\home\\site\\pythonpkgs';
    const pythonPathEnv = process.env.PYTHONPATH ||
      (isWin ? azurePkgs : '');

    let cmdIdx = 0;

    function tryNext() {
      if (cmdIdx >= cmds.length) {
        cleanup();
        return reject(new Error(
          `Python no encontrado. Se probaron: ${cmds.join(', ')}. ` +
          `Instale Python 3 (python.org) y marque "Add python.exe to PATH" durante la instalación.`
        ));
      }

      const pythonCmd = cmds[cmdIdx++];
      let   py, stdout = '', stderr = '';

      try {
        // ⚠️  NUNCA usar shell:true aquí.
        // Con shell:true, cmd.exe divide los argumentos en espacios y corta las
        // rutas que contengan espacios (como "OneDrive - Collective Mining...").
        // Sin shell, Node.js pasa el array de argumentos directamente al proceso
        // y los espacios en rutas no causan ningún problema.
        // Soportar comandos compuestos como 'py -3' (exe + args en string)
        const parts   = pythonCmd.split(/\s+/);
        const exe     = parts[0];
        const preArgs = parts.slice(1);
        const childEnv = {
          ...process.env,
          PYTHONUTF8:       '1',
          PYTHONIOENCODING: 'utf-8',
          ...(pythonPathEnv ? { PYTHONPATH: pythonPathEnv } : {}),
        };
        py = spawn(exe, [...preArgs, PYTHON_SCRIPT, tipo, tmpJson, rutaPlantilla, rutaSalida], {
          windowsHide: true,   // evitar ventana CMD emergente en Windows
          env: childEnv,
        });
      } catch (e) {
        return tryNext();   // el spawn en sí falló — probar siguiente
      }

      py.on('error', (err) => {
        if (err.code === 'ENOENT') return tryNext();   // comando no existe
        cleanup();
        reject(new Error(`Error ejecutando "${pythonCmd}": ${err.message}`));
      });

      py.stdout.on('data', d => { stdout += d.toString(); });
      py.stderr.on('data', d => { stderr += d.toString(); });

      py.on('close', code => {
        if (code !== 0) {
          // Windows shell devuelve 9009 o mensaje "is not recognized" cuando
          // el ejecutable no existe en PATH — en ese caso probamos el siguiente.
          const notFound = code === 9009 ||
            stderr.toLowerCase().includes('not recognized') ||
            stderr.toLowerCase().includes('no se reconoce') ||
            stderr.toLowerCase().includes('was not found');
          if (notFound) return tryNext();
          cleanup();
          return reject(new Error(
            `rellenar_pdf.py falló con "${pythonCmd}" (código ${code}):\n${stderr.slice(0, 600)}`
          ));
        }
        cleanup();
        try {
          resolve(JSON.parse(stdout.trim()));
        } catch (e) {
          reject(new Error(`Respuesta inesperada de Python ("${pythonCmd}"): ${stdout.slice(0, 300)}`));
        }
      });
    }

    tryNext();
  });
}

// ─── Email templates ──────────────────────────────────────────────────────────

function _emailConfirmacion(tipo, nombre, fechas) {
  const tipoLabel = tipo === 'permiso' ? 'Permiso' : 'Vacaciones';
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0E0E0E;padding:32px;color:#F0EDE8;border-radius:10px;border:1px solid rgba(201,168,76,0.2)">
      <h1 style="font-size:22px;color:#C9A84C;margin:0 0 8px">Collective Mining</h1>
      <p style="color:#8A857A;margin:0 0 24px;font-size:13px">Sistema de Nómina</p>
      <h2 style="color:#C9A84C;font-size:18px;margin:0 0 16px">Solicitud de ${tipoLabel} Recibida</h2>
      <p style="margin:0 0 16px">Hola <strong>${nombre}</strong>,</p>
      <p style="margin:0 0 16px">Tu solicitud de ${tipoLabel.toLowerCase()} ha sido registrada exitosamente. ${fechas}</p>
      <p style="margin:0 0 16px">Se ha generado el formato oficial y ha sido enviado al área de Talento Humano para su revisión y aprobación.</p>
      <p style="color:#8A857A;font-size:12px;margin:24px 0 0;border-top:1px solid rgba(201,168,76,0.15);padding-top:16px">
        Este es un mensaje automático. No responda a este correo.<br>
        © 2026 Collective Mining. Todos los derechos reservados.
      </p>
    </div>`;
}

function _emailRRHH(tipo, nombre, cedula, fechas, emailSolicitante) {
  const tipoLabel = tipo === 'permiso' ? 'Permiso' : 'Vacaciones';
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0E0E0E;padding:32px;color:#F0EDE8;border-radius:10px;border:1px solid rgba(201,168,76,0.2)">
      <h1 style="font-size:22px;color:#C9A84C;margin:0 0 8px">Collective Mining</h1>
      <p style="color:#8A857A;margin:0 0 24px;font-size:13px">Sistema de Nómina — Talento Humano</p>
      <h2 style="color:#C9A84C;font-size:18px;margin:0 0 16px">Nueva Solicitud de ${tipoLabel}</h2>
      <div style="background:#1E1E1E;border-left:4px solid #C9A84C;padding:16px;border-radius:6px;margin:0 0 20px">
        <p style="margin:0 0 6px"><span style="color:#8A857A;font-size:12px">Empleado</span><br><strong>${nombre}</strong></p>
        <p style="margin:6px 0 6px"><span style="color:#8A857A;font-size:12px">Cédula</span><br><strong>${cedula}</strong></p>
        <p style="margin:6px 0 0"><span style="color:#8A857A;font-size:12px">Período</span><br><strong>${fechas}</strong></p>
        ${emailSolicitante ? `<p style="margin:6px 0 0"><span style="color:#8A857A;font-size:12px">Correo</span><br><strong>${emailSolicitante}</strong></p>` : ''}
      </div>
      <p style="margin:0 0 16px">El formato oficial PDF se adjunta a este correo. El registro ya fue creado en el sistema MineDax (ACT_USUA = SELF_SVC).</p>
      <p style="color:#8A857A;font-size:12px;margin:24px 0 0;border-top:1px solid rgba(201,168,76,0.15);padding-top:16px">
        Este es un mensaje automático generado por MineDax.<br>
        © 2026 Collective Mining. Todos los derechos reservados.
      </p>
    </div>`;
}

// ─── Utilidades de fecha ──────────────────────────────────────────────────────

// YYYY-MM-DD → DD/MM/YYYY
function _isoADDMMYYYY(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

// GET /api/solicitudes/conceptos-ausentismo
// Devuelve los tipos de ausentismo/permiso disponibles en NO_CONCE.
// Ruta pública — no requiere JWT.
exports.listarConceptosAusentismo = async (req, res) => {
  try {
    const r = await executeQuery(`
      SELECT COD_CONC AS codConc, NOM_CONC AS nombre, TIP_CONC AS tipo
      FROM dbo.NO_CONCE
      WHERE TIP_NATU IN ('AUSENTISMO','PERMISO') AND ACT_ESTA = 'A'
        AND COD_CONC <> 63        -- excluir Vacaciones (tiene su propio formulario)
      ORDER BY TIP_NATU DESC, NOM_CONC ASC
    `);
    res.json({ success: true, conceptos: r.recordset || [] });
  } catch (err) {
    // Si NO_CONCE no existe o falla, devolvemos lista vacía — el form usa los hardcoded
    console.error('[solicitudes] conceptos-ausentismo:', err.message);
    res.json({ success: true, conceptos: [] });
  }
};

exports.verificarEmpleado = async (req, res) => {
  const { cedula } = req.query;
  if (!cedula || String(cedula).trim().length < 5) {
    return res.status(400).json({ success: false, error: 'Cédula inválida' });
  }
  try {
    const emp = await _resolverEmpleado(cedula);
    if (!emp) {
      return res.status(404).json({ success: false, error: 'Empleado no encontrado o inactivo' });
    }
    res.json({
      success: true,
      codFunci: emp.COD_FUNCI,
      nombre:   (emp.NOM_COMP || '').trim(),
      cargo:    (emp.CARGO   || '').trim(),
      area:     (emp.AREA    || '').trim(),
    });
  } catch (err) {
    console.error('[solicitudes] verificarEmpleado:', err.message);
    res.status(500).json({ success: false, error: 'Error al consultar la base de datos' });
  }
};

exports.enviarSolicitudPermiso = async (req, res) => {
  const {
    cedula, email_solicitante,
    fecha_desde, fecha_hasta,
    hora_inicio, hora_fin, total_dias,
    tipo_ausentismo,         // ← tipo para la BD (COD_CONC) — campo principal
    motivo_pdf,              // ← motivo para marcar checkbox en el PDF (opcional)
    cual, explicacion,
    tipo_permiso, observaciones,
    cod_conc: codConcBody,   // ← COD_CONC numérico explícito enviado por el form
  } = req.body;

  // Compatibilidad con versión anterior que usaba campo "motivo"
  const tipoAusentismo = tipo_ausentismo || req.body.motivo || '';
  const motivoPDF      = motivo_pdf      || '';

  if (!cedula || !fecha_desde || !fecha_hasta || !tipoAusentismo) {
    return res.status(400).json({ success: false, error: 'Faltan campos obligatorios: cedula, fecha_desde, fecha_hasta, tipo_ausentismo' });
  }

  let pdfSalida = null;

  try {
    // 1. Resolver empleado
    const emp = await _resolverEmpleado(cedula);
    if (!emp) {
      return res.status(404).json({ success: false, error: 'Empleado no encontrado o inactivo en la base de datos' });
    }

    // 2. Período activo
    const periodo = await _resolverPeriodo();
    if (!periodo) {
      return res.status(409).json({ success: false, error: 'No hay período de nómina activo en el sistema' });
    }

    // 3. Mapear tipo_ausentismo → COD_CONC
    // Prioridad: (a) cod_conc numérico del form; (b) mapeo por nombre; (c) default 68
    let codConc;
    if (codConcBody && !isNaN(Number(codConcBody))) {
      codConc = Number(codConcBody);
    } else {
      const upper = tipoAusentismo.toUpperCase();
      if      (upper.includes('COMPENSATORIO')) codConc = 74;
      else if (upper.includes('FAMILIA'))       codConc = 75;
      else                                      codConc = 68; // Permiso Remunerado
    }

    // 4. Registrar en BD
    const fechaIni  = fecha_desde;
    const fechaFin  = fecha_hasta;
    const diasTotal = parseFloat(total_dias) || 1;

    // OBS_NOVED: solo explicación y observaciones del solicitante.
    // Formato: "E: <texto> | O: <texto>" — omitir partes vacías.
    const obsParts = [];
    if ((explicacion  || '').trim()) obsParts.push(`E: ${explicacion.trim()}`);
    if ((observaciones|| '').trim()) obsParts.push(`O: ${observaciones.trim()}`);
    const obs = obsParts.join(' | ').slice(0, 500) || 'Permiso auto-servicio';

    const resultado = await _registrarNoved({
      codFunci:  emp.COD_FUNCI,
      codCcost:  emp.COD_CCOST || null,
      periodo,
      codConc,
      fechaIni,
      fechaFin,
      diasTotal,
      obs,
    });

    // 5. Preparar datos para el PDF
    const hoy        = new Date();
    const diaHoy     = String(hoy.getDate()).padStart(2, '0');
    const mesHoy     = String(hoy.getMonth() + 1).padStart(2, '0');
    const anioHoy    = String(hoy.getFullYear());

    const datosPDF = {
      nombre:       (emp.NOM_COMP || '').trim(),
      cedula:       String(cedula).trim(),
      cargo:        (emp.CARGO || '').trim(),
      area:         (emp.AREA  || '').trim(),
      fecha_dia:    diaHoy,
      fecha_mes:    mesHoy,
      fecha_anio:   anioHoy,
      fecha_desde:  _isoADDMMYYYY(fecha_desde),
      fecha_hasta:  _isoADDMMYYYY(fecha_hasta),
      hora_inicio:  hora_inicio  || '',
      hora_fin:     hora_fin     || '',
      total_dias:   String(total_dias || ''),
      // motivo: el campo PDF determina qué checkbox se marca en el formato.
      // Si se dejó vacío, el script no marcará ningún checkbox pero igual
      // rellena nombre, fechas y demás campos del documento.
      motivo:        motivoPDF || tipoAusentismo,
      cual:          cual         || '',
      explicacion:   explicacion  || '',
      tipo_permiso:  tipo_permiso || 'Remunerado',
      observaciones: observaciones || '',
      cod_conc:      codConc,   // ← embebido en bloque [FORMS] para import determinístico
    };

    // 6. Generar PDF
    //    Primario: pdf-lib carga la plantilla oficial y superpone los datos (Node.js puro).
    //    Respaldo: pdfkit genera un PDF con diseño corporativo sin plantilla.
    let pdfOk     = false;
    let pdfErrMsg = null;
    let pdfBuffer = null;

    try {
      pdfBuffer = await generarPermisoOficial(datosPDF);
      pdfOk     = true;
      console.log('[solicitudes] PDF generado con plantilla oficial (pdf-lib).');
    } catch (pdfErr) {
      pdfErrMsg = pdfErr.message;
      console.warn('[solicitudes] pdf-lib falló, intentando pdfkit como respaldo:', pdfErr.message);
      try {
        const datosKit = {
          nombre:         datosPDF.nombre,
          cedula:         datosPDF.cedula,
          cargo:          datosPDF.cargo,
          area:           datosPDF.area,
          tipoPermiso:    datosPDF.motivo || tipoAusentismo,
          fechaInicio:    fecha_desde,
          horaInicio:     hora_inicio || null,
          horaFin:        hora_fin    || null,
          totalHoras:     total_dias  || null,
          jefeInmediato:  null,
          motivo:         [explicacion, observaciones].filter(Boolean).join(' — ') || null,
        };
        pdfBuffer = await _pdfkitPermiso(datosKit, 'N/A');
        pdfOk     = true;
        pdfErrMsg = null;
        console.log('[solicitudes] PDF generado con pdfkit (respaldo).');
      } catch (kitErr) {
        pdfErrMsg = `pdf-lib: ${pdfErr.message} | pdfkit: ${kitErr.message}`;
        console.error('[solicitudes] pdfkit también falló:', kitErr.message);
      }
    }

    // 6b. Subir PDF a SharePoint (buffer en memoria — no bloqueante)
    const ts = Date.now();
    if (pdfOk && pdfBuffer) {
      if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
      pdfSalida = path.join(TEMP_DIR, `permiso_${cedula}_${ts}.pdf`);
      try { fs.writeFileSync(pdfSalida, pdfBuffer); } catch (_) {}
      await subirPDFaSharePoint(pdfSalida, `Permiso_${(emp.NOM_COMP||'').trim().replace(/ /g,'_')}_${ts}.pdf`);
    }

    // 7. Enviar correos
    const fechasLabel = `${_isoADDMMYYYY(fecha_desde)} al ${_isoADDMMYYYY(fecha_hasta)}`;
    const nombrePDF   = `Permiso_${(emp.NOM_COMP||'').trim()}.pdf`;
    const adjunto     = !pdfOk ? []
      : [{ filename: nombrePDF, content: pdfBuffer, contentType: 'application/pdf' }];

    const destinos = [];
    if (process.env.MAIL_RRHH) destinos.push(process.env.MAIL_RRHH);
    if (email_solicitante)      destinos.push(email_solicitante);

    if (destinos.length > 0) {
      const emailRRHH = process.env.MAIL_RRHH;

      if (emailRRHH) {
        await enviarEmail({
          from:        `"Collective Mining Nómina" <${process.env.MAIL_USER}>`,
          to:          emailRRHH,
          subject:     `Solicitud de Permiso — ${(emp.NOM_COMP||'').trim()} — ${fechasLabel}`,
          html:        _emailRRHH('permiso', (emp.NOM_COMP||'').trim(), cedula, fechasLabel, email_solicitante),
          attachments: adjunto,
        });
      }

      if (email_solicitante) {
        await enviarEmail({
          from:        `"Collective Mining Nómina" <${process.env.MAIL_USER}>`,
          to:          email_solicitante,
          subject:     `Tu Solicitud de Permiso — ${fechasLabel}`,
          html:        _emailConfirmacion('permiso', (emp.NOM_COMP||'').trim(), `Período: ${fechasLabel}`),
          attachments: adjunto,
        });
      }
    }

    res.json({
      success:     true,
      estado:      resultado.estado,
      codNoved:    resultado.codNoved,
      nombre:      (emp.NOM_COMP||'').trim(),
      pdfGenerado: pdfOk,
      pdfError:    pdfOk ? null : pdfErrMsg,
      mensaje:     `Solicitud de permiso registrada (${resultado.estado}). ` +
                   (pdfOk ? 'PDF generado y enviado por correo.' :
                    `Advertencia: el PDF no pudo generarse. Causa: ${pdfErrMsg}`),
    });

  } catch (err) {
    console.error('[solicitudes] enviarSolicitudPermiso:', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (pdfSalida && fs.existsSync(pdfSalida)) {
      try { fs.unlinkSync(pdfSalida); } catch (_) {}
    }
  }
};

exports.enviarSolicitudVacaciones = async (req, res) => {
  const {
    cedula, email_solicitante,
    fecha_inicio, fecha_fin,
    dias_vacaciones,
    actividades, reemplazo, observaciones,
  } = req.body;

  if (!cedula || !fecha_inicio || !fecha_fin) {
    return res.status(400).json({ success: false, error: 'Faltan campos obligatorios: cedula, fecha_inicio, fecha_fin' });
  }

  let pdfSalida = null;

  try {
    // 1. Resolver empleado
    const emp = await _resolverEmpleado(cedula);
    if (!emp) {
      return res.status(404).json({ success: false, error: 'Empleado no encontrado o inactivo en la base de datos' });
    }

    // 2. Período activo
    const periodo = await _resolverPeriodo();
    if (!periodo) {
      return res.status(409).json({ success: false, error: 'No hay período de nómina activo en el sistema' });
    }

    // 3. Calcular días
    const msDay    = 1000 * 60 * 60 * 24;
    const ini      = new Date(fecha_inicio);
    const fin      = new Date(fecha_fin);
    const diasCalc = Math.round((fin - ini) / msDay) + 1;
    const diasTotal = parseInt(dias_vacaciones, 10) || diasCalc || 1;

    const fechaIni = fecha_inicio;
    const fechaFin = fecha_fin;
    const obs      = `Vacaciones ${_isoADDMMYYYY(fechaIni)} al ${_isoADDMMYYYY(fechaFin)} (${diasTotal} días)`;

    // 4. Registrar en BD (COD_CONC = 63 — Vacaciones Disfrutadas)
    const resultado = await _registrarNoved({
      codFunci:  emp.COD_FUNCI,
      codCcost:  emp.COD_CCOST || null,
      periodo,
      codConc:   63,
      fechaIni,
      fechaFin,
      diasTotal,
      obs,
    });

    // 5. Preparar datos para PDF
    const datosPDF = {
      nombre:          (emp.NOM_COMP || '').trim(),
      cedula:          String(cedula).trim(),
      cargo:           (emp.CARGO || '').trim(),
      fecha_inicio:    fecha_inicio,
      fecha_fin:       fecha_fin,
      dias_vacaciones: String(diasTotal),
      actividades:     actividades  || '',
      reemplazo:       reemplazo    || '',
      observaciones:   observaciones || '',
    };

    // 6. Generar PDF
    //    Primario: pdf-lib carga la plantilla oficial (Node.js puro).
    //    Respaldo: pdfkit genera PDF con diseño corporativo.
    let pdfOk     = false;
    let pdfBuffer = null;

    try {
      pdfBuffer = await generarVacacionesOficial(datosPDF);
      pdfOk     = true;
      console.log('[solicitudes] PDF vacaciones generado con plantilla oficial (pdf-lib).');
    } catch (pdfErr) {
      console.warn('[solicitudes] pdf-lib vacaciones falló, intentando pdfkit:', pdfErr.message);
      try {
        const datosKit = {
          nombre:         datosPDF.nombre,
          cedula:         datosPDF.cedula,
          cargo:          datosPDF.cargo,
          fechaInicio:    fecha_inicio,
          fechaFin:       fecha_fin,
          diasSolicita:   diasTotal,
          anoVacacion:    new Date(fecha_inicio).getFullYear(),
          jefeInmediato:  null,
          motivo:         [actividades, observaciones].filter(Boolean).join(' — ') || null,
        };
        pdfBuffer = await _pdfkitVacaciones(datosKit, 'N/A');
        pdfOk     = true;
        console.log('[solicitudes] PDF vacaciones generado con pdfkit (respaldo).');
      } catch (kitErr) {
        console.error('[solicitudes] pdfkit vacaciones también falló:', kitErr.message);
      }
    }

    // 6b. Subir PDF a SharePoint (no bloqueante)
    const ts = Date.now();
    if (pdfOk && pdfBuffer) {
      if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
      pdfSalida = path.join(TEMP_DIR, `vacaciones_${cedula}_${ts}.pdf`);
      try { fs.writeFileSync(pdfSalida, pdfBuffer); } catch (_) {}
      await subirPDFaSharePoint(pdfSalida, `Vacaciones_${(emp.NOM_COMP||'').trim().replace(/ /g,'_')}_${ts}.pdf`);
    }

    // 7. Enviar correos
    const fechasLabel = `${_isoADDMMYYYY(fecha_inicio)} al ${_isoADDMMYYYY(fecha_fin)}`;
    const nombrePDF   = `Vacaciones_${(emp.NOM_COMP||'').trim()}.pdf`;
    const adjunto     = !pdfOk ? []
      : [{ filename: nombrePDF, content: pdfBuffer, contentType: 'application/pdf' }];

    const emailRRHH = process.env.MAIL_RRHH;
    if (emailRRHH) {
      await enviarEmail({
        from:        `"Collective Mining Nómina" <${process.env.MAIL_USER}>`,
        to:          emailRRHH,
        subject:     `Solicitud de Vacaciones — ${(emp.NOM_COMP||'').trim()} — ${fechasLabel}`,
        html:        _emailRRHH('vacaciones', (emp.NOM_COMP||'').trim(), cedula, fechasLabel, email_solicitante),
        attachments: adjunto,
      });
    }

    if (email_solicitante) {
      await enviarEmail({
        from:        `"Collective Mining Nómina" <${process.env.MAIL_USER}>`,
        to:          email_solicitante,
        subject:     `Tu Solicitud de Vacaciones — ${fechasLabel}`,
        html:        _emailConfirmacion('vacaciones', (emp.NOM_COMP||'').trim(), `Período: ${fechasLabel} (${diasTotal} días)`),
        attachments: adjunto,
      });
    }

    res.json({
      success: true,
      estado:  resultado.estado,
      codNoved: resultado.codNoved,
      nombre:  (emp.NOM_COMP||'').trim(),
      mensaje: `Solicitud de vacaciones registrada (${resultado.estado}). ${pdfOk ? 'PDF enviado por correo.' : 'Advertencia: el PDF no pudo generarse.'}`,
    });

  } catch (err) {
    console.error('[solicitudes] enviarSolicitudVacaciones:', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (pdfSalida && fs.existsSync(pdfSalida)) {
      try { fs.unlinkSync(pdfSalida); } catch (_) {}
    }
  }
};
