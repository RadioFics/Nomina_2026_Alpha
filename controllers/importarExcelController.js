// ============================================================================
//  controllers/importarExcelController.js
//  Importación masiva de novedades ocasionales desde múltiples archivos.
//
//  Soporta selección simultánea de uno o varios archivos de distintos tipos.
//  El tipo de cada archivo se detecta automáticamente usando el registry de
//  parsers (utils/importParsers/parserRegistry.js).
//
//  Para agregar soporte a un nuevo formato de archivo:
//    1. Crear utils/importParsers/parserXYZ.js
//    2. Registrarlo en utils/importParsers/parserRegistry.js
//    ¡No es necesario tocar este controller!
//
//  Endpoint: POST /api/ocasionales/importar-excel
//    multipart/form-data, campo "archivos[]" (uno o varios archivos)
//
//  Respuesta:
//    {
//      success: boolean,
//      periodo: { codPeriod, etiqueta, inicio, fin },
//      archivos: [ResumenArchivo],   ← uno por archivo enviado
//      globalResumen: { totalFilas, procesados, insertados, acumulados, omitidos, conErrores }
//    }
//
//  ResumenArchivo = {
//    archivo: string,
//    parser:  string,       ← parser usado (ej: "Excel — Reporte Final")
//    ok:      boolean,
//    error:   string|null,  ← si el archivo no pudo parsearse
//    resumen: { totalFilas, procesados, insertados, acumulados, omitidos, conErrores },
//    detalle: [...],
//    errores: [...],
//  }
// ============================================================================

const { executeQuery, getConnection } = require('../config/database');
const { getActUsua } = require('../config/userHelper');
const sql = require('mssql');
const multer = require('multer');
const { getParser, formatosSoportados } = require('../utils/importParsers/parserRegistry');
const { decryptIfNeeded } = require('../utils/decryptOffice');

const DEFAULT_COD_EMPR = 1;

// ─── Multer: múltiples archivos en memoria ────────────────────────────────────
// Acepta hasta 20 archivos a la vez (configurable).
// Los formatos los valida el registry; aquí solo filtramos tamaño.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 52_428_800,   // 50 MB por archivo
    files:    20,           // máximo 20 archivos por request
  },
}).array('archivos[]', 20);

// ─── Queries de base de datos ─────────────────────────────────────────────────
async function resolverPeriodoActual(codEmpr) {
  const r = await executeQuery(`
    SELECT TOP 1 COD_PERIOD, PER_ANO, PER_MES, PER_QNA, PER_FINI, PER_FFIN
    FROM dbo.NO_PERIOD
    WHERE COD_EMPR = @codEmpr
      AND PER_EST  = 'A'
      AND ACT_ESTA = 'A'
      AND CONVERT(date, GETDATE()) BETWEEN PER_FINI AND PER_FFIN
    ORDER BY PER_FINI DESC
  `, { codEmpr });
  return r.recordset && r.recordset[0] ? r.recordset[0] : null;
}

async function resolverCodFunciPorCedula(cedula, codEmpr) {
  const r = await executeQuery(`
    SELECT TOP 1 f.COD_FUNCI
    FROM dbo.GN_FUNCI f
    INNER JOIN dbo.GN_TERCE t ON t.COD_TERC = f.COD_TERC
    WHERE f.COD_EMPR  = @codEmpr
      AND t.NUM_IDEN  = CAST(@cedula AS BIGINT)
      AND t.ACT_ESTA  = 'A'
      AND f.ACT_ESTA  = 'A'
  `, { codEmpr, cedula: String(cedula).trim() });
  return r.recordset && r.recordset[0] ? r.recordset[0].COD_FUNCI : null;
}

async function resolverCodCcost(nomCcost, codEmpr) {
  if (!nomCcost) return null;
  const r = await executeQuery(`
    SELECT TOP 1 COD_CCOST FROM dbo.MAE_CCOST
    WHERE COD_EMPR = @codEmpr AND NOM_CCOST = @nom AND ACT_ESTA = 'A'
  `, { codEmpr, nom: nomCcost });
  return r.recordset && r.recordset[0] ? r.recordset[0].COD_CCOST : null;
}

async function buscarNovedadExistente(codEmpr, codFunci, codConc, codPeriod) {
  // Busca activos E inactivos: preferimos activos (ORDER BY activo DESC, más reciente DESC).
  // ES_ACTIVA=true  → acumular sobre el registro vigente (comportamiento previo).
  // ES_ACTIVA=false → fue anulado; reactivar en lugar de crear un duplicado nuevo.
  const r = await executeQuery(`
    SELECT TOP 1
      n.COD_NOVED, o.CANTIDAD,
      CAST(CASE WHEN n.ACT_ESTA='A' AND o.ACT_ESTA='A' THEN 1 ELSE 0 END AS BIT) AS ES_ACTIVA
    FROM dbo.NO_NOVED n
    INNER JOIN dbo.NO_OCASI o ON o.COD_EMPR = n.COD_EMPR AND o.COD_NOVED = n.COD_NOVED
    WHERE n.COD_EMPR   = @codEmpr
      AND n.COD_FUNCI  = @codFunci
      AND n.COD_CONC   = @codConc
      AND n.COD_PERIOD = @codPeriod
    ORDER BY
      CASE WHEN n.ACT_ESTA='A' AND o.ACT_ESTA='A' THEN 0 ELSE 1 END,
      n.COD_NOVED DESC
  `, { codEmpr, codFunci, codConc, codPeriod });
  return r.recordset && r.recordset[0] ? r.recordset[0] : null;
}

async function buscarNovedadFijaExistente(codEmpr, codFunci, codConc, codPeriod) {
  const r = await executeQuery(`
    SELECT TOP 1
      n.COD_NOVED, f.VALOR,
      CAST(CASE WHEN n.ACT_ESTA='A' AND f.ACT_ESTA='A' THEN 1 ELSE 0 END AS BIT) AS ES_ACTIVA
    FROM dbo.NO_NOVED n
    INNER JOIN dbo.NO_FIJAS f ON f.COD_EMPR = n.COD_EMPR AND f.COD_NOVED = n.COD_NOVED
    WHERE n.COD_EMPR   = @codEmpr
      AND n.COD_FUNCI  = @codFunci
      AND n.COD_CONC   = @codConc
      AND n.COD_PERIOD = @codPeriod
    ORDER BY
      CASE WHEN n.ACT_ESTA='A' AND f.ACT_ESTA='A' THEN 0 ELSE 1 END,
      n.COD_NOVED DESC
  `, { codEmpr, codFunci, codConc, codPeriod });
  return r.recordset && r.recordset[0] ? r.recordset[0] : null;
}

async function buscarAusentismoExistente(codEmpr, codFunci, codConc, codPeriod) {
  const r = await executeQuery(`
    SELECT TOP 1
      n.COD_NOVED, a.DIAS_TOTAL,
      CAST(CASE WHEN n.ACT_ESTA='A' AND a.ACT_ESTA='A' THEN 1 ELSE 0 END AS BIT) AS ES_ACTIVA
    FROM dbo.NO_NOVED n
    INNER JOIN dbo.NO_AUSEN a ON a.COD_EMPR = n.COD_EMPR AND a.COD_NOVED = n.COD_NOVED
    WHERE n.COD_EMPR   = @codEmpr
      AND n.COD_FUNCI  = @codFunci
      AND n.COD_CONC   = @codConc
      AND n.COD_PERIOD = @codPeriod
    ORDER BY
      CASE WHEN n.ACT_ESTA='A' AND a.ACT_ESTA='A' THEN 0 ELSE 1 END,
      n.COD_NOVED DESC
  `, { codEmpr, codFunci, codConc, codPeriod });
  return r.recordset && r.recordset[0] ? r.recordset[0] : null;
}

async function buscarCambioExistente(codEmpr, codFunci, codConc, codPeriod) {
  const r = await executeQuery(`
    SELECT TOP 1
      n.COD_NOVED, c.VALOR_NUEVO,
      CAST(CASE WHEN n.ACT_ESTA='A' AND c.ACT_ESTA='A' THEN 1 ELSE 0 END AS BIT) AS ES_ACTIVA
    FROM dbo.NO_NOVED n
    INNER JOIN dbo.NO_CAMBI c ON c.COD_EMPR = n.COD_EMPR AND c.COD_NOVED = n.COD_NOVED
    WHERE n.COD_EMPR   = @codEmpr
      AND n.COD_FUNCI  = @codFunci
      AND n.COD_CONC   = @codConc
      AND n.COD_PERIOD = @codPeriod
    ORDER BY
      CASE WHEN n.ACT_ESTA='A' AND c.ACT_ESTA='A' THEN 0 ELSE 1 END,
      n.COD_NOVED DESC
  `, { codEmpr, codFunci, codConc, codPeriod });
  return r.recordset && r.recordset[0] ? r.recordset[0] : null;
}

// ─── Procesar un archivo ya parseado: insertar/acumular en BD ─────────────────
async function procesarEnBD({ agrupado, codEmpr, periodo, pool, usuario, nombreArchivo }) {
  const resumen = {
    totalFilas:  0,
    procesados:  0,
    insertados:  0,
    acumulados:  0,
    reactivados: 0,
    omitidos:    0,
    errores:     [],
    detalle:     [],
  };

  // totalFilas viene del parser; aquí sumamos empleados con novedades
  for (const [cedula, emp] of agrupado) {
    resumen.totalFilas++;

    if (emp.novedades.size === 0) {
      resumen.omitidos++;
      continue;
    }

    // Resolver COD_FUNCI
    let codFunci;
    try {
      codFunci = await resolverCodFunciPorCedula(cedula, codEmpr);
    } catch (e) {
      const msg = `Error buscando funcionario: ${e.message}`;
      resumen.errores.push({ cedula, error: msg });
      resumen.detalle.push({ cedula, nombre: emp.nombre, estado: 'ERROR', mensaje: msg });
      continue;
    }
    if (!codFunci) {
      const msg = 'Cédula no encontrada en la base de datos.';
      resumen.errores.push({ cedula, error: msg });
      resumen.detalle.push({ cedula, nombre: emp.nombre, estado: 'ERROR', mensaje: msg });
      continue;
    }

    // Resolver COD_CCOST (no crítico)
    let codCcost = null;
    try { codCcost = await resolverCodCcost(emp.centroCostoNom, codEmpr); } catch (_) {}

    resumen.procesados++;

    for (const [codConc, novedad] of emp.novedades) {
      // ── Compatibilidad retroactiva ─────────────────────────────────────────
      // Parsers legacy devuelven Map<codConc, number> (cantidad).
      // Parsers nuevos devuelven Map<codConc, { valor, tipo, label }>.
      // Normalizamos aquí para que el resto del código sea uniforme.
      let tipo, cantidad, valor;
      if (typeof novedad === 'object' && novedad !== null && 'tipo' in novedad) {
        tipo     = novedad.tipo;   // 'OCASIONAL' | 'FIJA'
        valor    = novedad.valor;  // monto monetario
        cantidad = 1;              // cantidad por defecto para novedades de valor
      } else {
        // Formato legacy: la "novedad" es directamente la cantidad de horas/días
        tipo     = 'OCASIONAL';
        cantidad = novedad;
        valor    = 0;
      }

      let transaction;
      try {
        transaction = new sql.Transaction(pool);
        await transaction.begin();

        if (tipo === 'FIJA') {
          // ── Novedad FIJA → NO_NOVED + NO_FIJAS ──────────────────────────
          const existente = await buscarNovedadFijaExistente(codEmpr, codFunci, codConc, periodo.COD_PERIOD);

          if (existente && existente.ES_ACTIVA) {
            // Actualizar valor acumulado (registro activo existente)
            const nuevoValor = (Number(existente.VALOR) || 0) + valor;
            const r = new sql.Request(transaction);
            r.input('codEmpr',  sql.SmallInt,      codEmpr);
            r.input('codNoved', sql.Int,           existente.COD_NOVED);
            r.input('valor',    sql.Decimal(18,2), nuevoValor);
            r.input('actUsua',  sql.NVarChar(50),  usuario);
            await r.query(`
              UPDATE dbo.NO_FIJAS
              SET VALOR = @valor, ACT_USUA = @actUsua, ACT_HORA = SYSDATETIME()
              WHERE COD_EMPR = @codEmpr AND COD_NOVED = @codNoved AND ACT_ESTA = 'A'
            `);
            await transaction.commit();
            resumen.acumulados++;
            resumen.detalle.push({
              cedula, nombre: emp.nombre, codConc, valor, tipo,
              estado: 'ACUMULADO',
              mensaje: `Valor acumulado (total: $${nuevoValor.toFixed(2)}) en NO_FIJAS #${existente.COD_NOVED}.`
            });
          } else if (existente && !existente.ES_ACTIVA) {
            // Reactivar novedad fija previamente anulada con el valor nuevo del import
            const r = new sql.Request(transaction);
            r.input('codEmpr',  sql.SmallInt,      codEmpr);
            r.input('codNoved', sql.Int,           existente.COD_NOVED);
            r.input('valor',    sql.Decimal(18,2), valor);
            r.input('actUsua',  sql.NVarChar(50),  usuario);
            await r.query(`
              UPDATE dbo.NO_NOVED
                SET ACT_ESTA='A', ACT_USUA=@actUsua, ACT_HORA=GETDATE()
              WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved;

              UPDATE dbo.NO_FIJAS
                SET ACT_ESTA='A', VALOR=@valor, CANTIDAD=1,
                    ACT_USUA=@actUsua, ACT_HORA=SYSDATETIME()
              WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved;
            `);
            await transaction.commit();
            resumen.reactivados++;
            resumen.detalle.push({
              cedula, nombre: emp.nombre, codConc, valor, tipo,
              estado: 'REACTIVADO',
              mensaje: `Novedad FIJA inactiva reactivada con VALOR=$${valor.toFixed(2)} en NO_NOVED #${existente.COD_NOVED}.`
            });
          } else {
            // Insertar nueva novedad fija
            const rN = new sql.Request(transaction);
            rN.input('codEmpr',   sql.SmallInt,      codEmpr);
            rN.input('codFunci',  sql.Int,           codFunci);
            rN.input('codConc',   sql.Int,           codConc);
            rN.input('codPeriod', sql.Int,           periodo.COD_PERIOD);
            rN.input('obs',       sql.NVarChar(500), `Importado desde "${nombreArchivo}": ${emp.nombre}`);
            rN.input('actUsua',   sql.NVarChar(50),  usuario);
            rN.input('codCcost',  sql.Int,           codCcost);

            const nr = await rN.query(`
              INSERT INTO dbo.NO_NOVED
                (COD_EMPR, COD_FUNCI, COD_CONC, COD_PERIOD,
                 FEC_REGI, OBS_NOVED, IND_APLICADO, ACT_USUA, ACT_HORA, ACT_ESTA, COD_CCOST)
              VALUES
                (@codEmpr, @codFunci, @codConc, @codPeriod,
                 CONVERT(date,GETDATE()), @obs, 'N', @actUsua, GETDATE(), 'A', @codCcost);
              SELECT CAST(SCOPE_IDENTITY() AS INT) AS COD_NOVED;
            `);

            if (!nr.recordset || nr.recordset[0].COD_NOVED == null)
              throw new Error('SCOPE_IDENTITY() nulo al insertar en NO_NOVED (FIJA).');
            const codNoved = nr.recordset[0].COD_NOVED;

            const rF = new sql.Request(transaction);
            rF.input('codEmpr',    sql.SmallInt,     codEmpr);
            rF.input('codNoved',   sql.Int,          codNoved);
            rF.input('cantidad',   sql.Decimal(18,4), 1);
            rF.input('valor',      sql.Decimal(18,2), valor);
            rF.input('aplicacion', sql.NVarChar(50), '1ra Quincena');
            rF.input('numCuotas',  sql.Int,          1);
            rF.input('actUsua',    sql.NVarChar(50), usuario);
            await rF.query(`
              INSERT INTO dbo.NO_FIJAS
                (COD_EMPR, COD_NOVED, CANTIDAD, VALOR, APLICACION, NUM_CUOTAS,
                 ACT_USUA, ACT_HORA, ACT_ESTA)
              VALUES
                (@codEmpr, @codNoved, @cantidad, @valor, @aplicacion, @numCuotas,
                 @actUsua, SYSDATETIME(), 'A')
            `);

            await transaction.commit();
            resumen.insertados++;
            resumen.detalle.push({
              cedula, nombre: emp.nombre, codConc, valor, tipo,
              estado: 'INSERTADO',
              mensaje: `Novedad FIJA registrada. NO_NOVED #${codNoved}, NO_FIJAS VALOR=$${valor.toFixed(2)}, Período ${periodo.COD_PERIOD}.`
            });
          }

        } else if (tipo === 'AUSENTISMO') {
          // ── Novedad AUSENTISMO → NO_NOVED + NO_AUSEN ─────────────────────
          const extra      = (novedad && novedad.extra) ? novedad.extra : {};
          const fecIni     = extra.fecIni     || null;
          const fecFin     = extra.fecFin     || null;
          const diasTotal  = extra.diasTotal  != null ? extra.diasTotal : (cantidad || 0);
          const diagnostico = extra.diagnostico ? String(extra.diagnostico).substring(0, 200) : null;
          // FEC_PRORRG: si prorroga es una fecha la usamos; si es "si/no", la ignoramos
          let fecProrroga = null;
          if (extra.prorroga && typeof extra.prorroga === 'string') {
            const pNorm = extra.prorroga.trim().toLowerCase().replace(/\s+/g,'');
            if (pNorm !== 'si' && pNorm !== 'no' && pNorm !== 'sí') {
              const d = new Date(extra.prorroga);
              fecProrroga = isNaN(d) ? null : d;
            }
          } else if (extra.prorroga instanceof Date) {
            fecProrroga = extra.prorroga;
          }

          const existente = await buscarAusentismoExistente(codEmpr, codFunci, codConc, periodo.COD_PERIOD);

          if (existente && existente.ES_ACTIVA) {
            // Actualizar días acumulados (registro activo existente)
            const nuevosDias = (Number(existente.DIAS_TOTAL) || 0) + diasTotal;
            const r = new sql.Request(transaction);
            r.input('codEmpr',    sql.SmallInt,      codEmpr);
            r.input('codNoved',   sql.Int,           existente.COD_NOVED);
            r.input('fecIni',     sql.Date,          fecIni);
            r.input('fecFin',     sql.Date,          fecFin);
            r.input('diasTotal',  sql.Decimal(10,2), nuevosDias);
            r.input('diagnostico',sql.NVarChar(200), diagnostico);
            r.input('fecProrroga',sql.Date,          fecProrroga);
            r.input('actUsua',    sql.NVarChar(50),  usuario);
            await r.query(`
              UPDATE dbo.NO_AUSEN
              SET FEC_INI=@fecIni, FEC_FIN=@fecFin, DIAS_TOTAL=@diasTotal,
                  DIAGNOSTICO=@diagnostico, FEC_PRORRG=@fecProrroga,
                  ACT_USUA=@actUsua, ACT_HORA=SYSDATETIME()
              WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved AND ACT_ESTA='A'
            `);
            await transaction.commit();
            resumen.acumulados++;
            resumen.detalle.push({
              cedula, nombre: emp.nombre, codConc, tipo,
              estado:  'ACUMULADO',
              mensaje: `Ausentismo actualizado (${nuevosDias} días) en NO_NOVED #${existente.COD_NOVED}.`
            });
          } else if (existente && !existente.ES_ACTIVA) {
            // Reactivar ausentismo previamente anulado con los nuevos datos del import
            const r = new sql.Request(transaction);
            r.input('codEmpr',    sql.SmallInt,      codEmpr);
            r.input('codNoved',   sql.Int,           existente.COD_NOVED);
            r.input('fecIni',     sql.Date,          fecIni);
            r.input('fecFin',     sql.Date,          fecFin);
            r.input('diasTotal',  sql.Decimal(10,2), diasTotal);
            r.input('diagnostico',sql.NVarChar(200), diagnostico);
            r.input('fecProrroga',sql.Date,          fecProrroga);
            r.input('actUsua',    sql.NVarChar(50),  usuario);
            await r.query(`
              UPDATE dbo.NO_NOVED
                SET ACT_ESTA='A', ACT_USUA=@actUsua, ACT_HORA=GETDATE()
              WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved;

              UPDATE dbo.NO_AUSEN
                SET ACT_ESTA='A',
                    FEC_INI=@fecIni, FEC_FIN=@fecFin, DIAS_TOTAL=@diasTotal,
                    DIAGNOSTICO=@diagnostico, FEC_PRORRG=@fecProrroga,
                    ACT_USUA=@actUsua, ACT_HORA=SYSDATETIME()
              WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved;
            `);
            await transaction.commit();
            resumen.reactivados++;
            resumen.detalle.push({
              cedula, nombre: emp.nombre, codConc, tipo,
              estado:  'REACTIVADO',
              mensaje: `Ausentismo inactivo reactivado (${diasTotal} días) en NO_NOVED #${existente.COD_NOVED}.`
            });
          } else {
            // Insertar nueva novedad de ausentismo
            const rN = new sql.Request(transaction);
            rN.input('codEmpr',   sql.SmallInt,      codEmpr);
            rN.input('codFunci',  sql.Int,           codFunci);
            rN.input('codConc',   sql.Int,           codConc);
            rN.input('codPeriod', sql.Int,           periodo.COD_PERIOD);
            rN.input('obs',       sql.NVarChar(500), `Importado desde "${nombreArchivo}": ${emp.nombre}`);
            rN.input('actUsua',   sql.NVarChar(50),  usuario);
            rN.input('codCcost',  sql.Int,           codCcost);

            const nr = await rN.query(`
              INSERT INTO dbo.NO_NOVED
                (COD_EMPR, COD_FUNCI, COD_CONC, COD_PERIOD,
                 FEC_REGI, OBS_NOVED, IND_APLICADO, ACT_USUA, ACT_HORA, ACT_ESTA, COD_CCOST)
              VALUES
                (@codEmpr, @codFunci, @codConc, @codPeriod,
                 CONVERT(date,GETDATE()), @obs, 'N', @actUsua, GETDATE(), 'A', @codCcost);
              SELECT CAST(SCOPE_IDENTITY() AS INT) AS COD_NOVED;
            `);
            if (!nr.recordset || nr.recordset[0].COD_NOVED == null)
              throw new Error('SCOPE_IDENTITY() nulo al insertar en NO_NOVED (AUSENTISMO).');
            const codNoved = nr.recordset[0].COD_NOVED;

            const rA = new sql.Request(transaction);
            rA.input('codEmpr',    sql.SmallInt,      codEmpr);
            rA.input('codNoved',   sql.Int,           codNoved);
            rA.input('fecIni',     sql.Date,          fecIni);
            rA.input('fecFin',     sql.Date,          fecFin);
            rA.input('diasTotal',  sql.Decimal(10,2), diasTotal);
            rA.input('diagnostico',sql.NVarChar(200), diagnostico);
            rA.input('fecProrroga',sql.Date,          fecProrroga);
            rA.input('actUsua',    sql.NVarChar(50),  usuario);
            await rA.query(`
              INSERT INTO dbo.NO_AUSEN
                (COD_EMPR, COD_NOVED, FEC_INI, FEC_FIN, DIAS_TOTAL,
                 DIAGNOSTICO, FEC_PRORRG, ACT_USUA, ACT_HORA, ACT_ESTA)
              VALUES
                (@codEmpr, @codNoved, @fecIni, @fecFin, @diasTotal,
                 @diagnostico, @fecProrroga, @actUsua, SYSDATETIME(), 'A')
            `);
            await transaction.commit();
            resumen.insertados++;
            resumen.detalle.push({
              cedula, nombre: emp.nombre, codConc, tipo,
              estado:  'INSERTADO',
              mensaje: `Ausentismo registrado. NO_NOVED #${codNoved}, ${diasTotal} días, Período ${periodo.COD_PERIOD}.`
            });
          }

        } else if (tipo === 'CAMBIO') {
          // ── Novedad CAMBIO → NO_NOVED + NO_CAMBI ─────────────────────────
          const extra      = (novedad && novedad.extra) ? novedad.extra : {};
          const fecIni     = extra.fecIni    || null;
          const valorNuevo = extra.valorNuevo != null ? String(extra.valorNuevo).substring(0, 200) : null;

          const existente = await buscarCambioExistente(codEmpr, codFunci, codConc, periodo.COD_PERIOD);

          if (existente && existente.ES_ACTIVA) {
            // Actualizar el valor nuevo del cambio (registro activo existente)
            const r = new sql.Request(transaction);
            r.input('codEmpr',    sql.SmallInt,      codEmpr);
            r.input('codNoved',   sql.Int,           existente.COD_NOVED);
            r.input('fecIni',     sql.Date,          fecIni);
            r.input('valorNuevo', sql.NVarChar(200), valorNuevo);
            r.input('actUsua',    sql.NVarChar(50),  usuario);
            await r.query(`
              UPDATE dbo.NO_CAMBI
              SET FEC_INI=@fecIni, VALOR_NUEVO=@valorNuevo,
                  ACT_USUA=@actUsua, ACT_HORA=SYSDATETIME()
              WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved AND ACT_ESTA='A'
            `);
            await transaction.commit();
            resumen.acumulados++;
            resumen.detalle.push({
              cedula, nombre: emp.nombre, codConc, tipo,
              estado:  'ACUMULADO',
              mensaje: `Cambio actualizado → "${valorNuevo}" en NO_NOVED #${existente.COD_NOVED}.`
            });
          } else if (existente && !existente.ES_ACTIVA) {
            // Reactivar cambio previamente anulado con el nuevo valor del import
            const r = new sql.Request(transaction);
            r.input('codEmpr',    sql.SmallInt,      codEmpr);
            r.input('codNoved',   sql.Int,           existente.COD_NOVED);
            r.input('fecIni',     sql.Date,          fecIni);
            r.input('valorNuevo', sql.NVarChar(200), valorNuevo);
            r.input('actUsua',    sql.NVarChar(50),  usuario);
            await r.query(`
              UPDATE dbo.NO_NOVED
                SET ACT_ESTA='A', ACT_USUA=@actUsua, ACT_HORA=GETDATE()
              WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved;

              UPDATE dbo.NO_CAMBI
                SET ACT_ESTA='A', FEC_INI=@fecIni, VALOR_NUEVO=@valorNuevo,
                    ACT_USUA=@actUsua, ACT_HORA=SYSDATETIME()
              WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved;
            `);
            await transaction.commit();
            resumen.reactivados++;
            resumen.detalle.push({
              cedula, nombre: emp.nombre, codConc, tipo,
              estado:  'REACTIVADO',
              mensaje: `Cambio inactivo reactivado → "${valorNuevo}" en NO_NOVED #${existente.COD_NOVED}.`
            });
          } else {
            // Insertar nueva novedad de cambio
            const rN = new sql.Request(transaction);
            rN.input('codEmpr',   sql.SmallInt,      codEmpr);
            rN.input('codFunci',  sql.Int,           codFunci);
            rN.input('codConc',   sql.Int,           codConc);
            rN.input('codPeriod', sql.Int,           periodo.COD_PERIOD);
            rN.input('obs',       sql.NVarChar(500), `Importado desde "${nombreArchivo}": ${emp.nombre}`);
            rN.input('actUsua',   sql.NVarChar(50),  usuario);
            rN.input('codCcost',  sql.Int,           codCcost);

            const nr = await rN.query(`
              INSERT INTO dbo.NO_NOVED
                (COD_EMPR, COD_FUNCI, COD_CONC, COD_PERIOD,
                 FEC_REGI, OBS_NOVED, IND_APLICADO, ACT_USUA, ACT_HORA, ACT_ESTA, COD_CCOST)
              VALUES
                (@codEmpr, @codFunci, @codConc, @codPeriod,
                 CONVERT(date,GETDATE()), @obs, 'N', @actUsua, GETDATE(), 'A', @codCcost);
              SELECT CAST(SCOPE_IDENTITY() AS INT) AS COD_NOVED;
            `);
            if (!nr.recordset || nr.recordset[0].COD_NOVED == null)
              throw new Error('SCOPE_IDENTITY() nulo al insertar en NO_NOVED (CAMBIO).');
            const codNoved = nr.recordset[0].COD_NOVED;

            const rC = new sql.Request(transaction);
            rC.input('codEmpr',    sql.SmallInt,      codEmpr);
            rC.input('codNoved',   sql.Int,           codNoved);
            rC.input('fecIni',     sql.Date,          fecIni);
            rC.input('valorNuevo', sql.NVarChar(200), valorNuevo);
            rC.input('actUsua',    sql.NVarChar(50),  usuario);
            await rC.query(`
              INSERT INTO dbo.NO_CAMBI
                (COD_EMPR, COD_NOVED, FEC_INI, VALOR_NUEVO, VALOR_ANTE,
                 ACT_USUA, ACT_HORA, ACT_ESTA)
              VALUES
                (@codEmpr, @codNoved, @fecIni, @valorNuevo, NULL,
                 @actUsua, SYSDATETIME(), 'A')
            `);
            await transaction.commit();
            resumen.insertados++;
            resumen.detalle.push({
              cedula, nombre: emp.nombre, codConc, tipo,
              estado:  'INSERTADO',
              mensaje: `Cambio registrado. NO_NOVED #${codNoved}, Valor nuevo: "${valorNuevo}", Período ${periodo.COD_PERIOD}.`
            });
          }

        } else {
          // ── Novedad OCASIONAL → NO_NOVED + NO_OCASI ──────────────────────
          const existente = await buscarNovedadExistente(codEmpr, codFunci, codConc, periodo.COD_PERIOD);

          if (existente && existente.ES_ACTIVA) {
            // Acumular cantidad/valor sobre el registro activo existente
            const nuevaCant = (Number(existente.CANTIDAD) || 0) + cantidad;
            const r = new sql.Request(transaction);
            r.input('codEmpr',  sql.SmallInt,       codEmpr);
            r.input('codNoved', sql.Int,            existente.COD_NOVED);
            r.input('cantidad', sql.Decimal(18, 4), nuevaCant);
            r.input('actUsua',  sql.NVarChar(50),   usuario);
            // Si el parser nuevo envía valor monetario, también actualizarlo
            if (valor > 0) {
              r.input('valor', sql.Decimal(18, 2), valor);
              await r.query(`
                UPDATE dbo.NO_OCASI
                SET CANTIDAD = @cantidad, VALOR = @valor, ACT_USUA = @actUsua, ACT_HORA = SYSDATETIME()
                WHERE COD_EMPR = @codEmpr AND COD_NOVED = @codNoved AND ACT_ESTA = 'A'
              `);
            } else {
              await r.query(`
                UPDATE dbo.NO_OCASI
                SET CANTIDAD = @cantidad, ACT_USUA = @actUsua, ACT_HORA = SYSDATETIME()
                WHERE COD_EMPR = @codEmpr AND COD_NOVED = @codNoved AND ACT_ESTA = 'A'
              `);
            }
            await transaction.commit();
            resumen.acumulados++;
            resumen.detalle.push({
              cedula, nombre: emp.nombre, codConc, cantidad, valor, tipo,
              estado: 'ACUMULADO',
              mensaje: valor > 0
                ? `Valor acumulado ($${valor.toFixed(2)}) en NO_NOVED #${existente.COD_NOVED}.`
                : `Cantidad acumulada (total: ${nuevaCant.toFixed(2)}) en NO_NOVED #${existente.COD_NOVED}.`
            });
          } else if (existente && !existente.ES_ACTIVA) {
            // Reactivar novedad ocasional anulada con los valores del import.
            // Ambas actualizaciones van en un batch único para que el trigger
            // TR_NO_OCASI_VALIDA_CONCEPTO vea NO_NOVED.ACT_ESTA='A' al dispararse.
            const rRe = new sql.Request(transaction);
            rRe.input('codEmpr',  sql.SmallInt,       codEmpr);
            rRe.input('codNoved', sql.Int,            existente.COD_NOVED);
            rRe.input('cantidad', sql.Decimal(18, 4), cantidad);
            rRe.input('valor',    sql.Decimal(18, 2), valor);
            rRe.input('actUsua',  sql.NVarChar(50),   usuario);
            await rRe.query(`
              UPDATE dbo.NO_NOVED
                SET ACT_ESTA='A', ACT_USUA=@actUsua, ACT_HORA=GETDATE()
              WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved;

              UPDATE dbo.NO_OCASI
                SET ACT_ESTA='A', CANTIDAD=@cantidad, VALOR=@valor,
                    ACT_USUA=@actUsua, ACT_HORA=SYSDATETIME()
              WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved;
            `);
            await transaction.commit();
            resumen.reactivados++;
            resumen.detalle.push({
              cedula, nombre: emp.nombre, codConc, cantidad, valor, tipo,
              estado: 'REACTIVADO',
              mensaje: valor > 0
                ? `Novedad inactiva reactivada con VALOR=$${valor.toFixed(2)} en NO_NOVED #${existente.COD_NOVED}.`
                : `Novedad inactiva reactivada (CANTIDAD=${cantidad}) en NO_NOVED #${existente.COD_NOVED}.`
            });
          } else {
            // Insertar nueva novedad ocasional.
            // IMPORTANTE: NO_NOVED y NO_OCASI se insertan en un ÚNICO batch SQL.
            // Si se usaran dos sql.Request separados (dos round-trips), el trigger
            // TR_NO_OCASI_VALIDA_CONCEPTO no puede hacer JOIN a la fila de NO_NOVED
            // recién insertada (visibilidad de scope entre requests distintos en mssql).
            // Con un batch único todo ocurre en el mismo contexto del servidor y el
            // trigger encuentra correctamente la fila en NO_NOVED.
            const rNO = new sql.Request(transaction);
            rNO.input('codEmpr',   sql.SmallInt,       codEmpr);
            rNO.input('codFunci',  sql.Int,            codFunci);
            rNO.input('codConc',   sql.Int,            codConc);
            rNO.input('codPeriod', sql.Int,            periodo.COD_PERIOD);
            rNO.input('obs',       sql.NVarChar(500),  `Importado desde "${nombreArchivo}": ${emp.nombre}`);
            rNO.input('actUsua',   sql.NVarChar(50),   usuario);
            rNO.input('codCcost',  sql.Int,            codCcost);
            rNO.input('cantidad',  sql.Decimal(18, 4), cantidad);
            rNO.input('valor',     sql.Decimal(18, 2), valor);

            const nrBatch = await rNO.query(`
              DECLARE @newNoved INT;

              INSERT INTO dbo.NO_NOVED
                (COD_EMPR, COD_FUNCI, COD_CONC, COD_PERIOD,
                 FEC_REGI, OBS_NOVED, IND_APLICADO, ACT_USUA, ACT_HORA, ACT_ESTA, COD_CCOST)
              VALUES
                (@codEmpr, @codFunci, @codConc, @codPeriod,
                 CONVERT(date,GETDATE()), @obs, 'N', @actUsua, GETDATE(), 'A', @codCcost);

              SET @newNoved = SCOPE_IDENTITY();

              INSERT INTO dbo.NO_OCASI
                (COD_EMPR, COD_NOVED, CANTIDAD, VALOR, ACT_USUA, ACT_HORA, ACT_ESTA)
              VALUES
                (@codEmpr, @newNoved, @cantidad, @valor, @actUsua, SYSDATETIME(), 'A');

              SELECT @newNoved AS COD_NOVED;
            `);

            if (!nrBatch.recordset || nrBatch.recordset[0].COD_NOVED == null)
              throw new Error('SCOPE_IDENTITY() nulo al insertar en NO_NOVED (OCASIONAL).');
            const codNoved = nrBatch.recordset[0].COD_NOVED;

            await transaction.commit();
            resumen.insertados++;
            resumen.detalle.push({
              cedula, nombre: emp.nombre, codConc, cantidad, valor, tipo,
              estado: 'INSERTADO',
              mensaje: valor > 0
                ? `Novedad OCASIONAL registrada. NO_NOVED #${codNoved}, VALOR=$${valor.toFixed(2)}, Período ${periodo.COD_PERIOD}.`
                : `Novedad registrada. NO_NOVED #${codNoved}, Período ${periodo.COD_PERIOD}.`
            });
          }
        }

      } catch (err) {
        if (transaction) { try { await transaction.rollback(); } catch (_) {} }
        const msg = err.message;
        resumen.errores.push({ cedula, codConc, error: msg });
        resumen.detalle.push({ cedula, nombre: emp.nombre, codConc, cantidad, valor, tipo, estado: 'ERROR', mensaje: msg });
      }
    }
  }

  return resumen;
}

// ─── Endpoint principal: POST /api/ocasionales/importar-excel ─────────────────
async function importarDesdeExcel(req, res) {
  upload(req, res, async (uploadErr) => {
    if (uploadErr) {
      if (uploadErr.code === 'LIMIT_FILE_COUNT') {
        return res.status(400).json({ error: 'Se superó el límite de 20 archivos por importación.' });
      }
      if (uploadErr.code === 'LIMIT_FILE_SIZE') {
        return res.status(400).json({ error: 'Uno o más archivos superan el límite de 50 MB.' });
      }
      return res.status(400).json({ error: uploadErr.message });
    }

    const archivosSubidos = req.files || [];

    // Compatibilidad: si se envió campo "archivo" (singular, modo antiguo), tratar como array
    if (archivosSubidos.length === 0 && req.file) {
      archivosSubidos.push(req.file);
    }

    if (archivosSubidos.length === 0) {
      const formatos = formatosSoportados().join(', ');
      return res.status(400).json({
        error: `No se adjuntó ningún archivo. Formatos soportados: ${formatos}`
      });
    }

    const codEmpr = DEFAULT_COD_EMPR;
    const usuario = getActUsua(req);

    // Resolver período activo (único para todos los archivos del batch)
    let periodo;
    try {
      periodo = await resolverPeriodoActual(codEmpr);
    } catch (e) {
      return res.status(500).json({ error: 'Error consultando período activo.', details: e.message });
    }
    if (!periodo) {
      return res.status(409).json({
        error: 'No hay período activo en NO_PERIOD para la fecha actual.'
      });
    }

    const pool = await getConnection();

    // Acumuladores globales
    const globalResumen = {
      totalFilas:  0,
      procesados:  0,
      insertados:  0,
      acumulados:  0,
      reactivados: 0,
      omitidos:    0,
      conErrores:  0,
    };

    const resultadosArchivos = [];

    // ── Procesar cada archivo ──────────────────────────────────────────────────
    for (const fileOrig of archivosSubidos) {
      const resultadoArchivo = {
        archivo: fileOrig.originalname,
        parser:  null,
        ok:      false,
        error:   null,
        resumen: null,
        detalle: [],
        errores: [],
      };

      // 1. Detectar parser
      const parser = getParser(fileOrig);
      if (!parser) {
        const formatos = formatosSoportados().join(', ');
        resultadoArchivo.error = `Formato no soportado. Formatos disponibles: ${formatos}`;
        resultadosArchivos.push(resultadoArchivo);
        globalResumen.conErrores++;
        continue;
      }
      resultadoArchivo.parser = parser.meta.nombre;

      // 2. Descifrar buffer si el archivo está protegido con contraseña
      //    (usa NOMINA_XLSX_PWD del .env; si no está cifrado, devuelve el buffer tal cual)
      let file;
      try {
        file = { ...fileOrig, buffer: decryptIfNeeded(fileOrig.buffer) };
      } catch (decryptErr) {
        resultadoArchivo.error = `El archivo está protegido y no se pudo descifrar: ${decryptErr.message}`;
        resultadosArchivos.push(resultadoArchivo);
        globalResumen.conErrores++;
        continue;
      }

      // 3. Parsear (extraer novedades del archivo)
      let parseResult;
      try {
        parseResult = await parser.parse(file, { codEmpr });
      } catch (parseErr) {
        resultadoArchivo.error = parseErr.message;
        resultadosArchivos.push(resultadoArchivo);
        globalResumen.conErrores++;
        continue;
      }

      // 3. Insertar/acumular en BD
      let resumen;
      try {
        resumen = await procesarEnBD({
          agrupado:     parseResult.agrupado,
          codEmpr,
          periodo,
          pool,
          usuario,
          nombreArchivo: file.originalname,
        });
      } catch (bdErr) {
        resultadoArchivo.error = `Error de base de datos: ${bdErr.message}`;
        resultadosArchivos.push(resultadoArchivo);
        globalResumen.conErrores++;
        continue;
      }

      // Usar totalFilas del parser si está disponible (más preciso)
      if (typeof parseResult.totalFilas === 'number') {
        resumen.totalFilas = parseResult.totalFilas;
      }

      // Agregar advertencias del parser como entradas informativas en detalle
      if (parseResult.advertencias && parseResult.advertencias.length > 0) {
        for (const adv of parseResult.advertencias) {
          resumen.detalle.unshift({ estado: 'AVISO', mensaje: adv });
        }
      }

      resultadoArchivo.ok      = true;
      resultadoArchivo.resumen = {
        totalFilas:  resumen.totalFilas,
        procesados:  resumen.procesados,
        insertados:  resumen.insertados,
        acumulados:  resumen.acumulados,
        reactivados: resumen.reactivados,
        omitidos:    resumen.omitidos,
        conErrores:  resumen.errores.length,
      };
      resultadoArchivo.detalle = resumen.detalle;
      resultadoArchivo.errores = resumen.errores;

      // Acumular en totales globales
      globalResumen.totalFilas  += resumen.totalFilas;
      globalResumen.procesados  += resumen.procesados;
      globalResumen.insertados  += resumen.insertados;
      globalResumen.acumulados  += resumen.acumulados;
      globalResumen.reactivados += resumen.reactivados;
      globalResumen.omitidos    += resumen.omitidos;
      globalResumen.conErrores  += resumen.errores.length;

      resultadosArchivos.push(resultadoArchivo);
    }

    // ── Respuesta ──────────────────────────────────────────────────────────────
    const hayErrores = globalResumen.conErrores > 0 ||
                       resultadosArchivos.some(a => !a.ok);

    return res.status(hayErrores ? 207 : 200).json({
      success: !hayErrores,
      periodo: {
        codPeriod: periodo.COD_PERIOD,
        etiqueta:  `${periodo.PER_ANO}-${String(periodo.PER_MES).padStart(2,'0')}-Q${periodo.PER_QNA}`,
        inicio:    periodo.PER_FINI,
        fin:       periodo.PER_FFIN,
      },
      archivos:      resultadosArchivos,
      globalResumen,
    });
  });
}

// ─── Tablas maestras para sync de empleados ───────────────────────────────────
// Carga todos los diccionarios de FK en una sola pasada para evitar N+1 queries.
async function cargarMaestras(codEmpr) {
  const Q = (sql) => executeQuery(sql, { codEmpr });

  const [tpdoc, munis, grsan, estciv, cargo, ccost, banco, tpcta,
         eps, afp, caja, cesan, terces, funcis] = await Promise.all([
    Q(`SELECT COD_TPDOC, COD_ABREV AS ABR_TPDOC, NOM_TPDOC FROM dbo.MAE_TPDOC WHERE ACT_ESTA='A'`),
    Q(`SELECT COD_MUNI AS COD_MPIO, NOM_MUNI AS NOM_MPIO FROM dbo.MAE_MUNI WHERE ACT_ESTA='A'`),
    Q(`SELECT COD_GRSAN, NOM_GRSAN, COD_LETRA, COD_FCRH FROM dbo.MAE_GRSAN WHERE ACT_ESTA='A'`),
    Q(`SELECT COD_ESTCIV, NOM_ESTCIV FROM dbo.MAE_ESTCIV WHERE ACT_ESTA='A'`),
    Q(`SELECT COD_CARGO, NOM_CARGO FROM dbo.MAE_CARGO WHERE COD_EMPR=@codEmpr AND ACT_ESTA='A'`),
    Q(`SELECT COD_CCOST, NOM_CCOST, COD_ABREV AS ABR_CCOST FROM dbo.MAE_CCOST WHERE COD_EMPR=@codEmpr AND ACT_ESTA='A'`),
    Q(`SELECT COD_BANCO, NOM_BANCO FROM dbo.MAE_BANCO WHERE ACT_ESTA='A'`),
    Q(`SELECT COD_TPCTA, NOM_TPCTA, COD_ABREV AS ABR_TPCTA FROM dbo.MAE_TPCTA WHERE ACT_ESTA='A'`),
    // EPS / AFP / CCF (=CAJA en GN_FUNCI) → GN_TERCE vía tablas MAE_
    // MAE_CEST (cesantías) y MAE_ARL no tienen COD_TERC: se buscan por nombre directo
    Q(`SELECT m.COD_EPS,  t.NOM_COMP FROM dbo.MAE_EPS m INNER JOIN dbo.GN_TERCE t ON t.COD_TERC=CAST(m.COD_TERC AS int) AND t.COD_EMPR=m.COD_EMPR WHERE m.COD_EMPR=@codEmpr AND m.ACT_ESTA='A'`),
    Q(`SELECT m.COD_AFP,  t.NOM_COMP FROM dbo.MAE_AFP m INNER JOIN dbo.GN_TERCE t ON t.COD_TERC=CAST(m.COD_TERC AS int) AND t.COD_EMPR=m.COD_EMPR WHERE m.COD_EMPR=@codEmpr AND m.ACT_ESTA='A'`),
    Q(`SELECT m.COD_CCF AS COD_CAJA, t.NOM_COMP FROM dbo.MAE_CCF m INNER JOIN dbo.GN_TERCE t ON t.COD_TERC=CAST(m.COD_TERC AS int) AND t.COD_EMPR=m.COD_EMPR WHERE m.COD_EMPR=@codEmpr AND m.ACT_ESTA='A'`),
    Q(`SELECT COD_CEST AS COD_CESAN, NOM_CEST AS NOM_COMP FROM dbo.MAE_CEST WHERE COD_EMPR=@codEmpr AND ACT_ESTA='A'`),
    // Mapa existente de terceros y funcionarios
    Q(`SELECT COD_TERC, NUM_IDEN FROM dbo.GN_TERCE WHERE COD_EMPR=@codEmpr AND ACT_ESTA='A'`),
    Q(`SELECT COD_FUNCI, COD_TERC FROM dbo.GN_FUNCI WHERE COD_EMPR=@codEmpr AND ACT_ESTA='A'`),
  ]);

  // Helper normalización para comparaciones
  function n(s) {
    return String(s || '').toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/\s+/g, ' ').trim();
  }
  // Búsqueda parcial fuzzy (primeros 8 chars)
  function buildFuzzyMap(recordset, keyField, valField) {
    const map = new Map();
    for (const r of recordset) {
      if (r[keyField]) map.set(n(r[keyField]), r[valField]);
    }
    return map;
  }
  function fuzzyGet(map, valor) {
    if (!valor) return null;
    const nv = n(valor);
    if (map.has(nv)) return map.get(nv);
    // Búsqueda parcial (primeros 8 chars)
    const prefix = nv.substring(0, 8);
    for (const [k, v] of map) {
      if (k.startsWith(prefix) || prefix.startsWith(k.substring(0, 8))) return v;
    }
    return null;
  }

  // Construir diccionarios
  const tpdocMap  = new Map(tpdoc.recordset.map(r => [n(r.ABR_TPDOC || r.NOM_TPDOC), r.COD_TPDOC]));
  const muniMap   = new Map(munis.recordset.map(r => [n(r.NOM_MPIO), r.COD_MPIO]));
  const estcivMap = new Map(estciv.recordset.map(r => [n(r.NOM_ESTCIV), r.COD_ESTCIV]));
  const cargoMap  = new Map(cargo.recordset.map(r => [n(r.NOM_CARGO), r.COD_CARGO]));
  const ccostMapN = new Map(ccost.recordset.map(r => [n(r.NOM_CCOST), r.COD_CCOST]));
  const ccostMapA = new Map(ccost.recordset.map(r => [n(r.ABR_CCOST || ''), r.COD_CCOST]));
  const bancoMap  = buildFuzzyMap(banco.recordset, 'NOM_BANCO', 'COD_BANCO');
  const tpctaMapN = new Map(tpcta.recordset.map(r => [n(r.NOM_TPCTA), r.COD_TPCTA]));
  const tpctaMapA = new Map(tpcta.recordset.map(r => [n(r.ABR_TPCTA || ''), r.COD_TPCTA]));
  const epsMap    = buildFuzzyMap(eps.recordset,   'NOM_COMP', 'COD_EPS');
  const afpMap    = buildFuzzyMap(afp.recordset,   'NOM_COMP', 'COD_AFP');
  const cajaMap   = buildFuzzyMap(caja.recordset,  'NOM_COMP', 'COD_CAJA');   // MAE_CCF alias COD_CAJA
  const cesanMap  = buildFuzzyMap(cesan.recordset, 'NOM_COMP', 'COD_CESAN');  // MAE_CEST alias COD_CESAN

  // Mapa grupo sanguíneo: (COD_LETRA trimmed, COD_FCRH trimmed) → COD_GRSAN
  // MAE_GRSAN almacena COD_LETRA como char(2) con padding (ej: 'O ', 'A ') y
  // COD_FCRH como char(1) ('+' o '-'). Normalizamos con trim para comparar.
  const grsanMap  = new Map();
  for (const r of grsan.recordset) {
    const letra = String(r.COD_LETRA || '').trim();
    const fcrh  = String(r.COD_FCRH  || '').trim();
    if (letra) grsanMap.set(letra.toUpperCase() + '|' + fcrh, r.COD_GRSAN);
  }

  // Mapa de terceros por cédula y funcionarios por COD_TERC
  const tercMap  = new Map(terces.recordset.map(r => [String(r.NUM_IDEN), r.COD_TERC]));
  const funciMap = new Map(funcis.recordset.map(r => [r.COD_TERC, r.COD_FUNCI]));

  return {
    tpdocMap, muniMap, estcivMap, cargoMap,
    ccostMapN, ccostMapA, bancoMap,
    tpctaMapN, tpctaMapA,
    epsMap, afpMap, cajaMap, cesanMap,
    grsanMap, tercMap, funciMap,
    fuzzyGet, n,
  };
}

// ─── Split de nombre completo ─────────────────────────────────────────────────
// Formato ADECCO: APE1 APE2 NOM1 NOM2 (siempre apellidos primero)
function splitNombre(nombreCompleto) {
  const partes = String(nombreCompleto || '').trim().split(/\s+/).filter(Boolean);
  if (partes.length === 0) return { ape: '', segApe: '', nom: '', segNom: '' };
  if (partes.length === 1) return { ape: partes[0], segApe: '', nom: '', segNom: '' };
  if (partes.length === 2) return { ape: partes[0], segApe: '', nom: partes[1], segNom: '' };
  if (partes.length === 3) return { ape: partes[0], segApe: partes[1], nom: partes[2], segNom: '' };
  return {
    ape:    partes[0],
    segApe: partes[1],
    nom:    partes[2],
    segNom: partes.slice(3).join(' '),
  };
}

// ─── Sync de empleados desde Maestro Original ────────────────────────────────
async function sincronizarEmpleados({ maestro, codEmpr, pool, usuario, nombreArchivo }) {
  const resumen = {
    totalFilas:  maestro.length,
    insertados:  0,
    actualizados: 0,
    inhabilitados: 0,
    omitidos:    0,
    pendientes:  [],   // filas con FK no resueltas
    errores:     [],
    detalle:     [],
  };

  if (!maestro || maestro.length === 0) {
    resumen.errores.push({ error: 'La hoja "Maestro Original" no tiene datos o no fue encontrada.' });
    return resumen;
  }

  // Cargar todas las tablas maestras de una vez
  let mae;
  try {
    mae = await cargarMaestras(codEmpr);
  } catch (e) {
    resumen.errores.push({ error: `Error cargando tablas maestras: ${e.message}` });
    return resumen;
  }

  const { tpdocMap, muniMap, estcivMap, cargoMap,
          ccostMapN, ccostMapA, bancoMap, tpctaMapN, tpctaMapA,
          epsMap, afpMap, cajaMap, cesanMap,
          grsanMap, tercMap, funciMap, fuzzyGet, n } = mae;

  // Cédulas presentes en el Excel (para inhabilitar ausentes)
  const cedulasExcel = new Set(maestro.map(e => e.cedula));

  for (const emp of maestro) {
    const ref = `Fila ${emp.fila} (${emp.cedula})`;
    const fkErrores = [];

    // ── Resolver FKs ────────────────────────────────────────────────────────
    const codTpdoc  = tpdocMap.get(n(emp.tipoDoc));
    if (emp.tipoDoc && !codTpdoc)
      fkErrores.push({ campo: 'Tipo Documento (MAE_TPDOC)', valor: emp.tipoDoc });

    const codMpio   = muniMap.get(n(emp.ciudad));
    // Ciudad no es crítica (se omite sin bloquear)

    const codCiuExp = muniMap.get(n(emp.ciudadExped));

    let codGrsan = null;
    if (emp.grupoSan || emp.factorRh) {
      // La key del mapa usa COD_LETRA trimmed (ej: 'O', 'A', 'B', 'AB') + '|' + COD_FCRH ('+' o '-')
      const letraKey = String(emp.grupoSan || '').trim().toUpperCase();
      const fcrhKey  = String(emp.factorRh  || '').trim();
      const k = letraKey + '|' + fcrhKey;
      codGrsan = grsanMap.get(k);
      if (!codGrsan)
        fkErrores.push({ campo: 'Grupo Sanguíneo+RH (MAE_GRSAN)', valor: `${emp.grupoSan} ${emp.factorRh}` });
    }

    const codEstciv = estcivMap.get(n(emp.estadoCiv));
    // Estado civil no crítico

    const codCargo  = cargoMap.get(n(emp.cargo));
    if (emp.cargo && !codCargo)
      fkErrores.push({ campo: 'Cargo (MAE_CARGO)', valor: emp.cargo });

    const codCcost  = ccostMapN.get(n(emp.centroCosto)) || ccostMapA.get(n(emp.centroCosto)) || null;
    if (emp.centroCosto && !codCcost)
      fkErrores.push({ campo: 'Centro de Costo (MAE_CCOST)', valor: emp.centroCosto });

    const codBanco  = fuzzyGet(bancoMap, emp.banco);
    // Normalizar tipo de cuenta: "CONSIG. CTA CORRIENTE" → "Cuenta Corriente"
    //                            "CONSIG. CTA AHORROS"   → "Cuenta de Ahorros"
    // Esto permite mapear los labels del Excel ADECCO a los nombres en MAE_TPCTA.
    let tipoCta = emp.tipoCta || '';
    const tipCtaNorm = n(tipoCta).replace(/consig\.\s*cta\.?\s*/i, '').trim();
    if (/corriente/i.test(tipCtaNorm)) tipoCta = 'Cuenta Corriente';
    else if (/ahorro/i.test(tipCtaNorm)) tipoCta = 'Cuenta de Ahorros';
    const codTpcta  = tpctaMapN.get(n(tipoCta)) || tpctaMapA.get(n(tipoCta)) || null;

    const codEps    = fuzzyGet(epsMap,  emp.eps);
    if (emp.eps && !codEps)
      fkErrores.push({ campo: 'EPS (MAE_EPS)', valor: emp.eps });

    const codAfp    = fuzzyGet(afpMap,  emp.afp);
    if (emp.afp && !codAfp)
      fkErrores.push({ campo: 'AFP (MAE_AFP)', valor: emp.afp });

    const codCaja   = fuzzyGet(cajaMap, emp.caja);
    if (emp.caja && !codCaja)
      fkErrores.push({ campo: 'CCF/Caja (MAE_CAJA)', valor: emp.caja });

    const codCesan  = fuzzyGet(cesanMap, emp.cesantias);
    if (emp.cesantias && !codCesan)
      fkErrores.push({ campo: 'Cesantías (MAE_CESAN)', valor: emp.cesantias });

    // FK sin resolver → se registran como pendientes pero el UPSERT continúa
    // (campos no resueltos quedarán NULL; mejor un registro parcial que omitirlo)
    if (fkErrores.length > 0) {
      resumen.pendientes.push({
        cedula:  emp.cedula,
        nombre:  emp.nombre,
        fila:    emp.fila,
        errores: fkErrores,
      });
    }

    // ── Datos calculados ─────────────────────────────────────────────────────
    const { ape, segApe, nom, segNom } = splitNombre(emp.nombre || '');
    const numIden     = parseInt(emp.cedula, 10);
    const numCta      = emp.numeroCta ? String(emp.numeroCta).replace(/\D/g, '') : null;
    const fecIngStr   = emp.fechaIngreso instanceof Date
                         ? `${String(emp.fechaIngreso.getDate()).padStart(2,'0')}/${String(emp.fechaIngreso.getMonth()+1).padStart(2,'0')}/${emp.fechaIngreso.getFullYear()}`
                         : null;
    const fecRetStr   = emp.fechaRetiro instanceof Date
                         ? `${String(emp.fechaRetiro.getDate()).padStart(2,'0')}/${String(emp.fechaRetiro.getMonth()+1).padStart(2,'0')}/${emp.fechaRetiro.getFullYear()}`
                         : null;
    const fecFinStr   = emp.fechaFinal instanceof Date
                         ? `${String(emp.fechaFinal.getDate()).padStart(2,'0')}/${String(emp.fechaFinal.getMonth()+1).padStart(2,'0')}/${emp.fechaFinal.getFullYear()}`
                         : null;
    const sexoFunc    = emp.sexo ? String(emp.sexo).toUpperCase().trim().charAt(0) : null;
    const cntHijo     = emp.hijos != null ? Math.max(0, parseInt(emp.hijos, 10) || 0) : 0;
    const tipLiquid   = emp.tipLiquid ? parseInt(emp.tipLiquid, 10) || null : null;
    const valHora     = emp.valorHora != null ? parseFloat(emp.valorHora) || null : null;

    // ── UPSERT GN_TERCE ──────────────────────────────────────────────────────
    let transaction;
    try {
      transaction = new sql.Transaction(pool);
      await transaction.begin();

      const codTercExistente = tercMap.get(emp.cedula) || null;

      let codTerc;
      if (codTercExistente) {
        // UPDATE GN_TERCE
        const rU = new sql.Request(transaction);
        rU.input('codEmpr',  sql.SmallInt,      codEmpr);
        rU.input('codTerc',  sql.Int,           codTercExistente);
        rU.input('codAlt',   sql.NVarChar(8),   emp.codigoAlt ? emp.codigoAlt.substring(0,8) : null);
        rU.input('codTpdoc', sql.SmallInt,      codTpdoc || null);
        rU.input('nomComp',  sql.NVarChar(240), emp.nombre ? emp.nombre.substring(0,240) : null);
        rU.input('nomTerc',  sql.NVarChar(40),  nom.substring(0,40) || null);
        rU.input('segNomb',  sql.NVarChar(40),  segNom ? segNom.substring(0,40) : null);
        rU.input('apeTerc',  sql.NVarChar(40),  ape.substring(0,40) || null);
        rU.input('segApel',  sql.NVarChar(40),  segApe ? segApe.substring(0,40) : null);
        rU.input('codMpio',  sql.Int,           codMpio || null);
        rU.input('tel1',     sql.NVarChar(30),  emp.telefono1 ? emp.telefono1.substring(0,30) : null);
        rU.input('tel2',     sql.NVarChar(40),  emp.telefono2 ? emp.telefono2.substring(0,40) : null);
        rU.input('dirTerc',  sql.NVarChar(120), emp.direccion ? emp.direccion.substring(0,120) : null);
        rU.input('dirMail',  sql.NVarChar(150), emp.correo ? emp.correo.substring(0,150) : null);
        rU.input('actUsua',  sql.NVarChar(50),  usuario);
        await rU.query(`
          UPDATE dbo.GN_TERCE SET
            COD_ALT=@codAlt, COD_TPDOC=@codTpdoc,
            NOM_COMP=@nomComp, NOM_TERC=@nomTerc, SEG_NOMB=@segNomb,
            APE_TERC=@apeTerc, SEG_APEL=@segApel,
            COD_MPIO=@codMpio, TEL_TERC=@tel1, TEL_TERC2=@tel2,
            DIR_TERC=@dirTerc, DIR_MAIL=@dirMail,
            ACT_USUA=@actUsua, ACT_HORA=GETDATE()
          WHERE COD_TERC=@codTerc AND COD_EMPR=@codEmpr
        `);
        codTerc = codTercExistente;
        resumen.actualizados++;
      } else {
        // INSERT GN_TERCE
        // GN_TERCE.COD_TERC es IDENTITY → no se inserta explícitamente;
        // SQL Server lo genera y lo recuperamos con SCOPE_IDENTITY().
        const rI = new sql.Request(transaction);
        rI.input('codEmpr',  sql.SmallInt,      codEmpr);
        rI.input('numIden',  sql.BigInt,        numIden);
        rI.input('codAlt',   sql.NVarChar(8),   emp.codigoAlt ? emp.codigoAlt.substring(0,8) : null);
        rI.input('codTpdoc', sql.SmallInt,      codTpdoc || null);
        rI.input('nomComp',  sql.NVarChar(240), emp.nombre ? emp.nombre.substring(0,240) : null);
        rI.input('nomTerc',  sql.NVarChar(40),  nom.substring(0,40) || null);
        rI.input('segNomb',  sql.NVarChar(40),  segNom ? segNom.substring(0,40) : null);
        rI.input('apeTerc',  sql.NVarChar(40),  ape.substring(0,40) || null);
        rI.input('segApel',  sql.NVarChar(40),  segApe ? segApe.substring(0,40) : null);
        rI.input('codMpio',  sql.Int,           codMpio || null);
        rI.input('tel1',     sql.NVarChar(30),  emp.telefono1 ? emp.telefono1.substring(0,30) : null);
        rI.input('tel2',     sql.NVarChar(40),  emp.telefono2 ? emp.telefono2.substring(0,40) : null);
        rI.input('dirTerc',  sql.NVarChar(120), emp.direccion ? emp.direccion.substring(0,120) : null);
        rI.input('dirMail',  sql.NVarChar(150), emp.correo ? emp.correo.substring(0,150) : null);
        rI.input('actUsua',  sql.NVarChar(50),  usuario);
        const nrTerc = await rI.query(`
          INSERT INTO dbo.GN_TERCE (
            COD_EMPR, NUM_IDEN, COD_ALT, COD_TPDOC,
            NOM_COMP, NOM_TERC, SEG_NOMB, APE_TERC, SEG_APEL,
            COD_MPIO, TEL_TERC, TEL_TERC2, DIR_TERC, DIR_MAIL,
            TIP_TERC, TER_EMPL, ACT_USUA, ACT_HORA, ACT_ESTA
          ) VALUES (
            @codEmpr, @numIden, @codAlt, @codTpdoc,
            @nomComp, @nomTerc, @segNomb, @apeTerc, @segApel,
            @codMpio, @tel1, @tel2, @dirTerc, @dirMail,
            'E', '1', @actUsua, GETDATE(), 'A'
          );
          SELECT CAST(SCOPE_IDENTITY() AS INT) AS COD_TERC;
        `);
        codTerc = nrTerc.recordset[0].COD_TERC;
        tercMap.set(emp.cedula, codTerc);
        resumen.insertados++;
      }

      // ── UPSERT GN_FUNCI ────────────────────────────────────────────────────
      const codFunciExistente = funciMap.get(codTerc) || null;

      const addFunciParams = (r) => {
        r.input('codEmpr',   sql.SmallInt,      codEmpr);
        r.input('codTerc',   sql.Decimal(18,0), codTerc);
        r.input('sexoFunc',  sql.NChar(1),      sexoFunc);
        r.input('codGrsan',  sql.SmallInt,      codGrsan || null);
        r.input('codEstciv', sql.SmallInt,      codEstciv || null);
        r.input('cntHijo',   sql.SmallInt,      cntHijo);
        r.input('fecNac',    sql.Date,          emp.fechaNac || null);
        r.input('ciuExped',  sql.Int,           codCiuExp || null);
        r.input('codCargo',  sql.SmallInt,      codCargo || null);
        r.input('valHora',   sql.Decimal(18,2), valHora);
        r.input('codTpcta',  sql.SmallInt,      codTpcta || null);
        r.input('codBanco',  sql.SmallInt,      codBanco || null);
        r.input('numCta',    sql.BigInt,        numCta ? parseInt(numCta, 10) || null : null);
        r.input('nomSucur',  sql.NVarChar(10),  emp.sucursal ? emp.sucursal.substring(0,10) : null);
        r.input('codCcost',  sql.Int,           codCcost || null);
        r.input('jorSabad',  sql.NVarChar(10),  emp.trabajaSab ? emp.trabajaSab.substring(0,10) : null);
        r.input('tipSalar',  sql.NVarChar(10),  emp.claseSal ? emp.claseSal.substring(0,10) : null);
        r.input('cuePensio', sql.NVarChar(10),  emp.pensionado ? emp.pensionado.substring(0,10) : null);
        r.input('modLiquid', sql.NVarChar(10),  emp.modLiquid ? emp.modLiquid.substring(0,10) : null);
        r.input('tipLiquid', sql.SmallInt,      tipLiquid);
        r.input('empForan',  sql.NVarChar(10),  emp.extranjero ? emp.extranjero.substring(0,10) : null);
        r.input('dirForan',  sql.NVarChar(10),  emp.resideExt ? emp.resideExt.substring(0,10) : null);
        r.input('fecIngres', sql.NVarChar(20),  fecIngStr);
        r.input('fecRetiro', sql.NVarChar(20),  fecRetStr);
        r.input('fecFinal',  sql.NVarChar(20),  fecFinStr);
        r.input('cauRetiro', sql.NVarChar(10),  emp.cauRetiro ? emp.cauRetiro.substring(0,10) : null);
        r.input('numContra', sql.Int,           emp.contrato ? parseInt(emp.contrato)||null : null);
        r.input('tipContra', sql.NVarChar(10),  emp.tipContrato ? emp.tipContrato.substring(0,10) : null);
        r.input('metContra', sql.NVarChar(10),  emp.metodo ? emp.metodo.substring(0,10) : null);
        r.input('porReten',  sql.NVarChar(10),  emp.pctRete ? emp.pctRete.substring(0,10) : null);
        r.input('dedVivien', sql.NVarChar(10),  emp.dedVivienda ? emp.dedVivienda.substring(0,10) : null);
        r.input('dedSalud',  sql.NVarChar(10),  emp.dedSalud ? emp.dedSalud.substring(0,10) : null);
        r.input('dedDepen',  sql.NVarChar(10),  emp.dedDepen ? emp.dedDepen.substring(0,10) : null);
        r.input('proSalud',  sql.NVarChar(10),  emp.proSalud ? emp.proSalud.substring(0,10) : null);
        r.input('codEps',    sql.Int,           codEps || null);
        r.input('codAfp',    sql.Int,           codAfp || null);
        r.input('codCaja',   sql.Int,           codCaja || null);
        r.input('codCesan',  sql.Int,           codCesan || null);
        r.input('graRiesgo', sql.NVarChar(10),  emp.riesgo ? emp.riesgo.substring(0,10) : null);
        r.input('diaVacac',  sql.NVarChar(10),  emp.diasVacac ? emp.diasVacac.substring(0,10) : null);
        r.input('actUsua',   sql.NVarChar(50),  usuario);
      };

      if (codFunciExistente) {
        const rF = new sql.Request(transaction);
        addFunciParams(rF);
        rF.input('codFunci', sql.Int, codFunciExistente);
        await rF.query(`
          UPDATE dbo.GN_FUNCI SET
            SEX_FUNC=@sexoFunc, COD_GRSAN=@codGrsan, COD_ESTCIV=@codEstciv, CNT_HIJO=@cntHijo,
            FEC_NAC=@fecNac, CIU_EXPED=@ciuExped, COD_CARGO=@codCargo, VAL_HORA=@valHora,
            COD_TPCTA=@codTpcta, COD_BANCO=@codBanco, NUM_CTA=@numCta, NOM_SUCUR=@nomSucur,
            COD_CCOST=@codCcost, JOR_SABAD=@jorSabad, TIP_SALAR=@tipSalar, CUE_PENSIO=@cuePensio,
            MOD_LIQUID=@modLiquid, TIP_LIQUID=@tipLiquid, EMP_FORAN=@empForan, DIR_FORAN=@dirForan,
            FEC_INGRES=@fecIngres, FEC_RETIRO=@fecRetiro, FEC_FINAL=@fecFinal, CAU_RETIRO=@cauRetiro,
            NUM_CONTRA=@numContra, TIP_CONTRA=@tipContra, MET_CONTRA=@metContra, POR_RETEN=@porReten,
            DED_VIVIEN=@dedVivien, DED_SALUD=@dedSalud, DED_DEPEN=@dedDepen, PRO_SALUD=@proSalud,
            COD_EPS=@codEps, COD_AFP=@codAfp, COD_CAJA=@codCaja, COD_CESAN=@codCesan,
            GRA_RIESGO=@graRiesgo, DIA_VACAC=@diaVacac,
            ACT_USUA=@actUsua, ACT_HORA=GETDATE()
          WHERE COD_FUNCI=@codFunci AND COD_EMPR=@codEmpr
        `);
      } else {
        // GN_FUNCI.COD_FUNCI es IDENTITY → SQL Server lo genera automáticamente.
        const rF = new sql.Request(transaction);
        addFunciParams(rF);
        await rF.query(`
          INSERT INTO dbo.GN_FUNCI (
            COD_EMPR, COD_TERC,
            SEX_FUNC, COD_GRSAN, COD_ESTCIV, CNT_HIJO,
            FEC_NAC, CIU_EXPED, COD_CARGO, VAL_HORA,
            COD_TPCTA, COD_BANCO, NUM_CTA, NOM_SUCUR,
            COD_CCOST, JOR_SABAD, TIP_SALAR, CUE_PENSIO,
            MOD_LIQUID, TIP_LIQUID, EMP_FORAN, DIR_FORAN,
            FEC_INGRES, FEC_RETIRO, FEC_FINAL, CAU_RETIRO,
            NUM_CONTRA, TIP_CONTRA, MET_CONTRA, POR_RETEN,
            DED_VIVIEN, DED_SALUD, DED_DEPEN, PRO_SALUD,
            COD_EPS, COD_AFP, COD_CAJA, COD_CESAN,
            GRA_RIESGO, DIA_VACAC,
            ACT_USUA, ACT_HORA, ACT_ESTA
          ) VALUES (
            @codEmpr, @codTerc,
            @sexoFunc, @codGrsan, @codEstciv, @cntHijo,
            @fecNac, @ciuExped, @codCargo, @valHora,
            @codTpcta, @codBanco, @numCta, @nomSucur,
            @codCcost, @jorSabad, @tipSalar, @cuePensio,
            @modLiquid, @tipLiquid, @empForan, @dirForan,
            @fecIngres, @fecRetiro, @fecFinal, @cauRetiro,
            @numContra, @tipContra, @metContra, @porReten,
            @dedVivien, @dedSalud, @dedDepen, @proSalud,
            @codEps, @codAfp, @codCaja, @codCesan,
            @graRiesgo, @diaVacac,
            @actUsua, GETDATE(), 'A'
          )
        `);
      }

      await transaction.commit();
      resumen.detalle.push({
        cedula:  emp.cedula,
        nombre:  emp.nombre,
        estado:  codTercExistente ? 'ACTUALIZADO' : 'INSERTADO',
        mensaje: codTercExistente
          ? `Empleado actualizado en GN_TERCE #${codTerc} / GN_FUNCI.`
          : `Empleado insertado. GN_TERCE #${codTerc} / GN_FUNCI (ID auto-generado).`,
      });

    } catch (err) {
      if (transaction) { try { await transaction.rollback(); } catch (_) {} }
      resumen.errores.push({ cedula: emp.cedula, nombre: emp.nombre, error: err.message });
      resumen.detalle.push({ cedula: emp.cedula, nombre: emp.nombre, estado: 'ERROR', mensaje: err.message });
    }
  }

  // ── Inhabilitar empleados ausentes del Excel ───────────────────────────────
  try {
    // Obtener cédulas activas en BD
    const activos = await executeQuery(
      `SELECT t.NUM_IDEN FROM dbo.GN_FUNCI f
       INNER JOIN dbo.GN_TERCE t ON t.COD_TERC=f.COD_TERC AND t.COD_EMPR=f.COD_EMPR
       WHERE f.COD_EMPR=@codEmpr AND f.ACT_ESTA='A' AND t.ACT_ESTA='A'`,
      { codEmpr }
    );
    for (const row of activos.recordset) {
      const cedBD = String(row.NUM_IDEN);
      if (!cedulasExcel.has(cedBD)) {
        await executeQuery(
          `UPDATE dbo.GN_FUNCI SET ACT_ESTA='I', ACT_USUA=@usuario, ACT_HORA=GETDATE()
           WHERE COD_EMPR=@codEmpr AND COD_TERC=(
             SELECT COD_TERC FROM dbo.GN_TERCE WHERE COD_EMPR=@codEmpr AND NUM_IDEN=@numIden AND ACT_ESTA='A'
           )`,
          { codEmpr, usuario, numIden: parseInt(cedBD, 10) }
        );
        resumen.inhabilitados++;
        resumen.detalle.push({
          cedula: cedBD, estado: 'INHABILITADO',
          mensaje: `Empleado no encontrado en el Excel — marcado como inactivo (ACT_ESTA='I').`,
        });
      }
    }
  } catch (e) {
    resumen.errores.push({ error: `Error inhabilitando ausentes: ${e.message}` });
  }

  return resumen;
}

// ─── Endpoint: POST /api/ocasionales/importar-excel ───────────────────────────
// Parámetro opcional en el body: modo = 'novedades' | 'empleados' | 'ambos'
// Por defecto 'novedades' para mantener compatibilidad con el flujo existente.
// Cuando modo ≠ 'novedades', el archivo DEBE ser reconocido por parserAdecco.
async function importarDesdeExcelConModo(req, res) {
  upload(req, res, async (uploadErr) => {
    if (uploadErr) {
      if (uploadErr.code === 'LIMIT_FILE_COUNT')
        return res.status(400).json({ error: 'Se superó el límite de 20 archivos por importación.' });
      if (uploadErr.code === 'LIMIT_FILE_SIZE')
        return res.status(400).json({ error: 'Uno o más archivos superan el límite de 50 MB.' });
      return res.status(400).json({ error: uploadErr.message });
    }

    const archivosSubidos = req.files || [];
    if (archivosSubidos.length === 0 && req.file) archivosSubidos.push(req.file);
    if (archivosSubidos.length === 0) {
      return res.status(400).json({ error: `No se adjuntó ningún archivo. Formatos soportados: ${formatosSoportados().join(', ')}` });
    }

    // Leer modo: 'novedades' | 'empleados' | 'ambos'
    const modo = (req.body && req.body.modo) ? String(req.body.modo).toLowerCase().trim() : 'novedades';
    const procesarNovedades = modo === 'novedades' || modo === 'ambos';
    const procesarEmpleados = modo === 'empleados' || modo === 'ambos';

    const codEmpr = DEFAULT_COD_EMPR;
    const usuario = getActUsua(req);
    const pool    = await getConnection();

    // Período (solo necesario si procesamos novedades)
    let periodo = null;
    if (procesarNovedades) {
      try {
        periodo = await resolverPeriodoActual(codEmpr);
      } catch (e) {
        return res.status(500).json({ error: 'Error consultando período activo.', details: e.message });
      }
      if (!periodo) {
        return res.status(409).json({ error: 'No hay período activo en NO_PERIOD para la fecha actual.' });
      }
    }

    const globalResumen = { totalFilas: 0, procesados: 0, insertados: 0, acumulados: 0, reactivados: 0, omitidos: 0, conErrores: 0 };
    const resultadosArchivos = [];

    for (const fileOrig of archivosSubidos) {
      const resultadoArchivo = {
        archivo: fileOrig.originalname,
        parser:  null,
        ok:      false,
        error:   null,
        modo,
        resumenNovedades:  null,
        resumenEmpleados:  null,
        detalle:  [],
        errores:  [],
        pendientes: [],
      };

      // 1. Detectar parser
      const parser = getParser(fileOrig);
      if (!parser) {
        resultadoArchivo.error = `Formato no soportado. Formatos disponibles: ${formatosSoportados().join(', ')}`;
        resultadosArchivos.push(resultadoArchivo);
        globalResumen.conErrores++;
        continue;
      }
      resultadoArchivo.parser = parser.meta.nombre;

      // Validar que modos de empleados solo funcionen con parserAdecco
      if (procesarEmpleados && parser.meta.id !== 'adecco-novedades') {
        resultadoArchivo.error = `El modo "${modo}" solo está disponible para archivos ADECCO (Formato Novedades CM). Este archivo fue reconocido como: ${parser.meta.nombre}.`;
        resultadosArchivos.push(resultadoArchivo);
        globalResumen.conErrores++;
        continue;
      }

      // 2. Descifrar
      let file;
      try {
        file = { ...fileOrig, buffer: decryptIfNeeded(fileOrig.buffer) };
      } catch (decryptErr) {
        resultadoArchivo.error = `El archivo está protegido y no se pudo descifrar: ${decryptErr.message}`;
        resultadosArchivos.push(resultadoArchivo);
        globalResumen.conErrores++;
        continue;
      }

      // 3. Parsear
      let parseResult;
      try {
        parseResult = await parser.parse(file, { codEmpr });
      } catch (parseErr) {
        resultadoArchivo.error = parseErr.message;
        resultadosArchivos.push(resultadoArchivo);
        globalResumen.conErrores++;
        continue;
      }

      // 4a. Sync empleados (si aplica) — PRIMERO para que las novedades puedan
      //     encontrar los COD_FUNCI recién insertados
      if (procesarEmpleados && parseResult.maestro && parseResult.maestro.length > 0) {
        try {
          const resEmp = await sincronizarEmpleados({
            maestro:       parseResult.maestro,
            codEmpr,
            pool,
            usuario,
            nombreArchivo: file.originalname,
          });
          resultadoArchivo.resumenEmpleados = {
            totalFilas:   resEmp.totalFilas,
            insertados:   resEmp.insertados,
            actualizados: resEmp.actualizados,
            inhabilitados: resEmp.inhabilitados,
            omitidos:     resEmp.omitidos,
            conErrores:   resEmp.errores.length,
            pendientes:   resEmp.pendientes.length,
          };
          resultadoArchivo.pendientes = resEmp.pendientes;
          for (const d of resEmp.detalle)   resultadoArchivo.detalle.push(d);
          for (const e of resEmp.errores)   resultadoArchivo.errores.push(e);
          globalResumen.insertados  += resEmp.insertados;
          globalResumen.acumulados  += resEmp.actualizados;
          globalResumen.omitidos    += resEmp.omitidos;
          globalResumen.conErrores  += resEmp.errores.length;
        } catch (empErr) {
          resultadoArchivo.errores.push({ error: `Error sincronizando empleados: ${empErr.message}` });
          globalResumen.conErrores++;
        }
      } else if (procesarEmpleados) {
        resultadoArchivo.errores.push({ error: 'No se encontró la hoja "Maestro Original" en el archivo.' });
        globalResumen.conErrores++;
      }

      // 4b. Importar novedades (si aplica)
      if (procesarNovedades) {
        try {
          const resNov = await procesarEnBD({
            agrupado:      parseResult.agrupado,
            codEmpr,
            periodo,
            pool,
            usuario,
            nombreArchivo: file.originalname,
          });
          if (typeof parseResult.totalFilas === 'number') resNov.totalFilas = parseResult.totalFilas;
          if (parseResult.advertencias && parseResult.advertencias.length > 0) {
            for (const adv of parseResult.advertencias)
              resNov.detalle.unshift({ estado: 'AVISO', mensaje: adv });
          }
          resultadoArchivo.resumenNovedades = {
            totalFilas:  resNov.totalFilas,
            procesados:  resNov.procesados,
            insertados:  resNov.insertados,
            acumulados:  resNov.acumulados,
            reactivados: resNov.reactivados,
            omitidos:    resNov.omitidos,
            conErrores:  resNov.errores.length,
          };
          for (const d of resNov.detalle)  resultadoArchivo.detalle.push(d);
          for (const e of resNov.errores)  resultadoArchivo.errores.push(e);
          globalResumen.totalFilas  += resNov.totalFilas;
          globalResumen.procesados  += resNov.procesados;
          globalResumen.insertados  += resNov.insertados;
          globalResumen.acumulados  += resNov.acumulados;
          globalResumen.reactivados += resNov.reactivados;
          globalResumen.omitidos    += resNov.omitidos;
          globalResumen.conErrores  += resNov.errores.length;
        } catch (novErr) {
          resultadoArchivo.errores.push({ error: `Error importando novedades: ${novErr.message}` });
          globalResumen.conErrores++;
        }
      }

      resultadoArchivo.ok = resultadoArchivo.errores.length === 0;
      resultadosArchivos.push(resultadoArchivo);
    }

    const hayErrores = globalResumen.conErrores > 0 || resultadosArchivos.some(a => !a.ok);
    return res.status(hayErrores ? 207 : 200).json({
      success: !hayErrores,
      modo,
      periodo: periodo ? {
        codPeriod: periodo.COD_PERIOD,
        etiqueta:  `${periodo.PER_ANO}-${String(periodo.PER_MES).padStart(2,'0')}-Q${periodo.PER_QNA}`,
        inicio:    periodo.PER_FINI,
        fin:       periodo.PER_FFIN,
      } : null,
      archivos:      resultadosArchivos,
      globalResumen,
    });
  });
}

// ─── Endpoint: POST /api/ocasionales/limpiar-duplicados ───────────────────────
// Elimina de la BD los registros inactivos duplicados en NO_OCASI / NO_NOVED:
// Para cada grupo (COD_EMPR, COD_FUNCI, COD_CONC, COD_PERIOD) que tenga más de
// un registro inactivo, conserva únicamente el de mayor COD_NOVED (el más reciente)
// y borra físicamente los demás (sub-tabla primero, luego cabecera huérfana).
//
// Query param ?preview=true  → solo cuenta, no borra (dry-run).
//
// IMPORTANTE: solo afecta registros donde TANTO NO_NOVED.ACT_ESTA='I' COMO
// NO_OCASI.ACT_ESTA='I'. Registros activos jamás se tocan.
async function limpiarDuplicadosInactivos(req, res) {
  const codEmpr  = DEFAULT_COD_EMPR;
  const preview  = String(req.query.preview || '').toLowerCase() === 'true';

  // CTE reutilizable: grupos con más de 1 inactivo y el COD_NOVED a conservar
  const CTE = `
    WITH DupGroups AS (
      SELECT n.COD_EMPR, n.COD_FUNCI, n.COD_CONC, n.COD_PERIOD,
             MAX(n.COD_NOVED) AS KEEP_NOVED,
             COUNT(*)         AS CNT
      FROM dbo.NO_NOVED n
      INNER JOIN dbo.NO_OCASI o
             ON o.COD_EMPR = n.COD_EMPR AND o.COD_NOVED = n.COD_NOVED
      WHERE n.ACT_ESTA = 'I'
        AND o.ACT_ESTA = 'I'
        AND n.COD_EMPR = @codEmpr
      GROUP BY n.COD_EMPR, n.COD_FUNCI, n.COD_CONC, n.COD_PERIOD
      HAVING COUNT(*) > 1
    )
  `;

  try {
    // ── Paso 1: contar cuántos registros se eliminarían ──────────────────────
    const rCount = await executeQuery(`
      ${CTE}
      SELECT SUM(dg.CNT - 1) AS TOTAL_EXTRAS,
             COUNT(*)         AS TOTAL_GRUPOS
      FROM DupGroups dg
    `, { codEmpr });

    const row         = rCount.recordset[0];
    const totalExtras = row.TOTAL_EXTRAS || 0;
    const totalGrupos = row.TOTAL_GRUPOS || 0;

    if (totalExtras === 0) {
      return res.json({
        success: true,
        preview,
        mensaje:       'No se encontraron registros inactivos duplicados para limpiar.',
        grupos:        0,
        eliminados:    0,
      });
    }

    if (preview) {
      return res.json({
        success:    true,
        preview:    true,
        mensaje:    `Preview: se eliminarían ${totalExtras} registros de ${totalGrupos} grupos duplicados inactivos.`,
        grupos:     totalGrupos,
        eliminados: totalExtras,
      });
    }

    // ── Paso 2: borrar NO_OCASI duplicadas (conserva la de KEEP_NOVED) ───────
    const rDelOcasi = await executeQuery(`
      ${CTE}
      DELETE o
      FROM dbo.NO_OCASI o
      INNER JOIN dbo.NO_NOVED n
             ON n.COD_EMPR = o.COD_EMPR AND n.COD_NOVED = o.COD_NOVED
      INNER JOIN DupGroups dg
             ON  dg.COD_EMPR   = n.COD_EMPR
             AND dg.COD_FUNCI  = n.COD_FUNCI
             AND dg.COD_CONC   = n.COD_CONC
             AND dg.COD_PERIOD = n.COD_PERIOD
      WHERE n.COD_NOVED <> dg.KEEP_NOVED
        AND n.ACT_ESTA   = 'I'
        AND o.ACT_ESTA   = 'I'
    `, { codEmpr });

    const ocasiEliminadas = rDelOcasi.rowsAffected ? rDelOcasi.rowsAffected[0] : 0;

    // ── Paso 3: borrar NO_NOVED huérfanas (sin hijo en NO_OCASI) ─────────────
    // Tras el paso 2, los NO_NOVED de los duplicados ya no tienen hijo.
    await executeQuery(`
      DELETE FROM dbo.NO_NOVED
      WHERE ACT_ESTA = 'I'
        AND COD_EMPR = @codEmpr
        AND NOT EXISTS (
          SELECT 1 FROM dbo.NO_OCASI o
          WHERE o.COD_EMPR  = dbo.NO_NOVED.COD_EMPR
            AND o.COD_NOVED = dbo.NO_NOVED.COD_NOVED
        )
    `, { codEmpr });

    return res.json({
      success:    true,
      preview:    false,
      mensaje:    `Limpieza completada: ${ocasiEliminadas} registros eliminados en ${totalGrupos} grupos duplicados inactivos (OCASIONAL).`,
      grupos:     totalGrupos,
      eliminados: ocasiEliminadas,
    });

  } catch (err) {
    return res.status(500).json({ success: false, error: err.message });
  }
}

module.exports = { importarDesdeExcel, importarDesdeExcelConModo, limpiarDuplicadosInactivos };
