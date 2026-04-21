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
  const r = await executeQuery(`
    SELECT TOP 1 n.COD_NOVED, o.CANTIDAD
    FROM dbo.NO_NOVED n
    INNER JOIN dbo.NO_OCASI o ON o.COD_EMPR = n.COD_EMPR AND o.COD_NOVED = n.COD_NOVED
    WHERE n.COD_EMPR   = @codEmpr
      AND n.COD_FUNCI  = @codFunci
      AND n.COD_CONC   = @codConc
      AND n.COD_PERIOD = @codPeriod
      AND n.ACT_ESTA   = 'A'
      AND o.ACT_ESTA   = 'A'
  `, { codEmpr, codFunci, codConc, codPeriod });
  return r.recordset && r.recordset[0] ? r.recordset[0] : null;
}

async function buscarNovedadFijaExistente(codEmpr, codFunci, codConc, codPeriod) {
  const r = await executeQuery(`
    SELECT TOP 1 n.COD_NOVED, f.VALOR
    FROM dbo.NO_NOVED n
    INNER JOIN dbo.NO_FIJAS f ON f.COD_EMPR = n.COD_EMPR AND f.COD_NOVED = n.COD_NOVED
    WHERE n.COD_EMPR   = @codEmpr
      AND n.COD_FUNCI  = @codFunci
      AND n.COD_CONC   = @codConc
      AND n.COD_PERIOD = @codPeriod
      AND n.ACT_ESTA   = 'A'
      AND f.ACT_ESTA   = 'A'
  `, { codEmpr, codFunci, codConc, codPeriod });
  return r.recordset && r.recordset[0] ? r.recordset[0] : null;
}

// ─── Procesar un archivo ya parseado: insertar/acumular en BD ─────────────────
async function procesarEnBD({ agrupado, codEmpr, periodo, pool, usuario, nombreArchivo }) {
  const resumen = {
    totalFilas: 0,
    procesados: 0,
    insertados: 0,
    acumulados: 0,
    omitidos: 0,
    errores: [],
    detalle: [],
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

          if (existente) {
            // Actualizar valor acumulado
            const nuevoValor = (Number(existente.VALOR) || 0) + valor;
            const r = new sql.Request(transaction);
            r.input('codEmpr',  sql.SmallInt,     codEmpr);
            r.input('codNoved', sql.Int,          existente.COD_NOVED);
            r.input('valor',    sql.Decimal(18,2), nuevoValor);
            r.input('actUsua',  sql.NVarChar(50), usuario);
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

        } else {
          // ── Novedad OCASIONAL → NO_NOVED + NO_OCASI ──────────────────────
          const existente = await buscarNovedadExistente(codEmpr, codFunci, codConc, periodo.COD_PERIOD);

          if (existente) {
            // Acumular cantidad (o valor si es formato nuevo)
            const nuevaCant = (Number(existente.CANTIDAD) || 0) + cantidad;
            const r = new sql.Request(transaction);
            r.input('codEmpr',  sql.SmallInt,      codEmpr);
            r.input('codNoved', sql.Int,           existente.COD_NOVED);
            r.input('cantidad', sql.Decimal(18, 4), nuevaCant);
            r.input('actUsua',  sql.NVarChar(50),  usuario);
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
          } else {
            // Insertar nueva novedad ocasional
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
              throw new Error('SCOPE_IDENTITY() nulo al insertar en NO_NOVED (OCASIONAL).');
            const codNoved = nr.recordset[0].COD_NOVED;

            const rO = new sql.Request(transaction);
            rO.input('codEmpr',  sql.SmallInt,      codEmpr);
            rO.input('codNoved', sql.Int,           codNoved);
            rO.input('cantidad', sql.Decimal(18, 4), cantidad);
            rO.input('valor',    sql.Decimal(18, 2), valor);
            rO.input('actUsua',  sql.NVarChar(50),  usuario);
            await rO.query(`
              INSERT INTO dbo.NO_OCASI
                (COD_EMPR, COD_NOVED, CANTIDAD, VALOR, ACT_USUA, ACT_HORA, ACT_ESTA)
              VALUES
                (@codEmpr, @codNoved, @cantidad, @valor, @actUsua, SYSDATETIME(), 'A')
            `);

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
      totalFilas: 0,
      procesados: 0,
      insertados: 0,
      acumulados: 0,
      omitidos:   0,
      conErrores: 0,
    };

    const resultadosArchivos = [];

    // ── Procesar cada archivo ──────────────────────────────────────────────────
    for (const file of archivosSubidos) {
      const resultadoArchivo = {
        archivo: file.originalname,
        parser:  null,
        ok:      false,
        error:   null,
        resumen: null,
        detalle: [],
        errores: [],
      };

      // 1. Detectar parser
      const parser = getParser(file);
      if (!parser) {
        const formatos = formatosSoportados().join(', ');
        resultadoArchivo.error = `Formato no soportado. Formatos disponibles: ${formatos}`;
        resultadosArchivos.push(resultadoArchivo);
        globalResumen.conErrores++;
        continue;
      }
      resultadoArchivo.parser = parser.meta.nombre;

      // 2. Parsear (extraer novedades del archivo)
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
        totalFilas: resumen.totalFilas,
        procesados: resumen.procesados,
        insertados: resumen.insertados,
        acumulados: resumen.acumulados,
        omitidos:   resumen.omitidos,
        conErrores: resumen.errores.length,
      };
      resultadoArchivo.detalle = resumen.detalle;
      resultadoArchivo.errores = resumen.errores;

      // Acumular en totales globales
      globalResumen.totalFilas += resumen.totalFilas;
      globalResumen.procesados += resumen.procesados;
      globalResumen.insertados += resumen.insertados;
      globalResumen.acumulados += resumen.acumulados;
      globalResumen.omitidos   += resumen.omitidos;
      globalResumen.conErrores += resumen.errores.length;

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

module.exports = { importarDesdeExcel };
