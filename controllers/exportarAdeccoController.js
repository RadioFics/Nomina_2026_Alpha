// ============================================================================
//  controllers/exportarAdeccoController.js
//
//  Genera el Excel de novedades usando FORMATO_LIBRE_ADECCO.xlsx como plantilla
//  base (el mismo documento que usa ADECCO). Los datos activos del período se
//  consultan directamente en MineDax y se escriben con el script Python
//  scripts/generar_adecco.py, que preserva 100% del formato original.
//
//  Endpoints:
//    GET /api/exportar-adecco/periodos   → lista períodos disponibles
//    GET /api/exportar-adecco?codPeriod= → descarga directa del Excel
// ============================================================================

const { executeQuery } = require('../config/database');
const { spawn }        = require('child_process');
const path             = require('path');
const fs               = require('fs');
const os               = require('os');

const DEFAULT_COD_EMPR = 1;
const PYTHON_SCRIPT    = path.join(__dirname, '..', 'scripts', 'generar_adecco.py');

// ─── Queries a MineDax ────────────────────────────────────────────────────────

async function queryOcasionales(codPeriod, codEmpr) {
  const r = await executeQuery(`
    SELECT
      t.NUM_IDEN   AS IDENTIFICACION,
      t.NOM_COMP   AS NOMBRE,
      c.NOM_CONC   AS NOVEDAD,
      c.TIP_CONC   AS TIPO_NOVEDAD,
      o.CANTIDAD,
      o.VALOR,
      n.OBS_NOVED  AS OBSERVACIONES
    FROM dbo.NO_NOVED n
    JOIN dbo.GN_FUNCI f  ON f.COD_EMPR = n.COD_EMPR AND f.COD_FUNCI = n.COD_FUNCI
    JOIN dbo.GN_TERCE t  ON t.COD_TERC = f.COD_TERC
    JOIN dbo.NO_CONCE c  ON c.COD_EMPR = n.COD_EMPR AND c.COD_CONC  = n.COD_CONC
    JOIN dbo.NO_OCASI o  ON o.COD_EMPR = n.COD_EMPR AND o.COD_NOVED = n.COD_NOVED
    WHERE n.COD_EMPR   = @codEmpr
      AND n.COD_PERIOD = @codPeriod
      AND n.ACT_ESTA   = 'A'
      AND o.ACT_ESTA   = 'A'
      AND c.TIP_NATU   = 'OCASIONAL'
    ORDER BY t.NOM_COMP, c.NOM_CONC
  `, { codEmpr, codPeriod });
  return r.recordset || [];
}

async function queryFijas(codPeriod, codEmpr) {
  const r = await executeQuery(`
    SELECT
      t.NUM_IDEN    AS IDENTIFICACION,
      t.NOM_COMP    AS NOMBRE,
      c.NOM_CONC    AS NOVEDAD,
      c.TIP_CONC    AS TIPO_NOVEDAD,
      fj.CANTIDAD,
      fj.VALOR,
      fj.FEC_INI,
      fj.FEC_FIN,
      fj.APLICACION,
      fj.NUM_CUENTA AS CUENTA,
      fj.NUM_CUOTAS AS CUOTAS,
      n.OBS_NOVED   AS OBSERVACIONES
    FROM dbo.NO_NOVED n
    JOIN dbo.GN_FUNCI f   ON f.COD_EMPR  = n.COD_EMPR AND f.COD_FUNCI  = n.COD_FUNCI
    JOIN dbo.GN_TERCE t   ON t.COD_TERC  = f.COD_TERC
    JOIN dbo.NO_CONCE c   ON c.COD_EMPR  = n.COD_EMPR AND c.COD_CONC   = n.COD_CONC
    JOIN dbo.NO_FIJAS fj  ON fj.COD_EMPR = n.COD_EMPR AND fj.COD_NOVED = n.COD_NOVED
    WHERE n.COD_EMPR   = @codEmpr
      AND n.COD_PERIOD = @codPeriod
      AND n.ACT_ESTA   = 'A'
      AND fj.ACT_ESTA  = 'A'
      AND c.TIP_NATU   = 'FIJA'
    ORDER BY t.NOM_COMP, c.NOM_CONC
  `, { codEmpr, codPeriod });
  return r.recordset || [];
}

async function queryAusentismos(codPeriod, codEmpr) {
  const r = await executeQuery(`
    SELECT
      t.NUM_IDEN    AS IDENTIFICACION,
      t.NOM_COMP    AS NOMBRE,
      c.NOM_CONC    AS AUSENTISMO,
      au.FEC_INI    AS FECHA_INICIAL,
      au.FEC_FIN    AS FECHA_FINAL,
      au.DIAS_TOTAL AS DIAS_TOTALES,
      au.DIAGNOSTICO,
      au.FEC_PRORRG AS PRORROGA,
      n.OBS_NOVED   AS OBSERVACIONES
    FROM dbo.NO_NOVED n
    JOIN dbo.GN_FUNCI f   ON f.COD_EMPR  = n.COD_EMPR AND f.COD_FUNCI  = n.COD_FUNCI
    JOIN dbo.GN_TERCE t   ON t.COD_TERC  = f.COD_TERC
    JOIN dbo.NO_CONCE c   ON c.COD_EMPR  = n.COD_EMPR AND c.COD_CONC   = n.COD_CONC
    JOIN dbo.NO_AUSEN au  ON au.COD_EMPR = n.COD_EMPR AND au.COD_NOVED = n.COD_NOVED
    WHERE n.COD_EMPR   = @codEmpr
      AND n.COD_PERIOD = @codPeriod
      AND n.ACT_ESTA   = 'A'
      AND au.ACT_ESTA  = 'A'
      AND c.TIP_NATU   = 'AUSENTISMO'
    ORDER BY t.NOM_COMP, c.NOM_CONC
  `, { codEmpr, codPeriod });
  return r.recordset || [];
}

async function queryCambios(codPeriod, codEmpr) {
  const r = await executeQuery(`
    SELECT
      t.NUM_IDEN     AS IDENTIFICACION,
      t.NOM_COMP     AS NOMBRE,
      c.NOM_CONC     AS CAMBIO,
      cam.FEC_INI    AS FECHA_INICIAL,
      cam.VALOR_NUEVO AS CAMBIO_A,
      n.OBS_NOVED    AS OBSERVACIONES
    FROM dbo.NO_NOVED n
    JOIN dbo.GN_FUNCI f    ON f.COD_EMPR   = n.COD_EMPR AND f.COD_FUNCI   = n.COD_FUNCI
    JOIN dbo.GN_TERCE t    ON t.COD_TERC   = f.COD_TERC
    JOIN dbo.NO_CONCE c    ON c.COD_EMPR   = n.COD_EMPR AND c.COD_CONC    = n.COD_CONC
    JOIN dbo.NO_CAMBI cam  ON cam.COD_EMPR = n.COD_EMPR AND cam.COD_NOVED = n.COD_NOVED
    WHERE n.COD_EMPR   = @codEmpr
      AND n.COD_PERIOD = @codPeriod
      AND n.ACT_ESTA   = 'A'
      AND cam.ACT_ESTA = 'A'
      AND c.TIP_NATU   = 'CAMBIO'
    ORDER BY t.NOM_COMP, c.NOM_CONC
  `, { codEmpr, codPeriod });
  return r.recordset || [];
}

async function queryPeriodo(codPeriod, codEmpr) {
  const r = await executeQuery(`
    SELECT PER_ANO, PER_MES, PER_QNA, PER_FINI, PER_FFIN
    FROM dbo.NO_PERIOD
    WHERE COD_EMPR = @codEmpr AND COD_PERIOD = @codPeriod AND ACT_ESTA = 'A'
  `, { codEmpr, codPeriod });
  return r.recordset && r.recordset[0] ? r.recordset[0] : null;
}

// ─── Helper: invocar script Python ───────────────────────────────────────────
// Se fuerza UTF-8 en toda la comunicación con el proceso hijo para garantizar
// el correcto manejo de tildes, ñ, apóstrofes y cualquier carácter Unicode
// en nombres y conceptos (lenguas romance y anglosajonas).

function invocarPython(jsonData, outputPath) {
  return new Promise((resolve, reject) => {
    const py = spawn('python3', [PYTHON_SCRIPT, outputPath], {
      // Forzar que el proceso hijo herede UTF-8 en su entorno.
      // PYTHONUTF8=1 activa el modo UTF-8 de Python (PEP 540) en Windows y Linux.
      // PYTHONIOENCODING=utf-8 es el mecanismo clásico compatible con Python 3.6+.
      env: {
        ...process.env,
        PYTHONUTF8:        '1',
        PYTHONIOENCODING:  'utf-8',
      },
    });

    // Leer stderr como UTF-8 para que los mensajes de error con tildes no se corrompan
    let stderr = '';
    py.stderr.setEncoding('utf8');
    py.stderr.on('data', d => { stderr += d; });

    py.on('close', code => {
      if (code === 0) resolve();
      else reject(new Error(`Script Python falló (code ${code}): ${stderr}`));
    });

    py.on('error', err => reject(new Error(`No se pudo lanzar Python: ${err.message}`)));

    // Escribir JSON en UTF-8 explícito (Buffer.from garantiza la codificación
    // independientemente del locale del sistema operativo).
    const jsonStr = JSON.stringify(jsonData);
    py.stdin.write(Buffer.from(jsonStr, 'utf8'));
    py.stdin.end();
  });
}

// ─── Controlador principal: exportar ─────────────────────────────────────────

async function exportarAdecco(req, res) {
  let tmpFile = null;
  try {
    const codPeriod = parseInt(req.query.codPeriod);
    const codEmpr   = parseInt(req.query.codEmpr) || DEFAULT_COD_EMPR;

    if (!codPeriod) {
      return res.status(400).json({ error: 'Parámetro codPeriod requerido.' });
    }

    // 1. Consultar datos en paralelo
    const [periodo, ocasionales, fijas, ausentismos, cambios] = await Promise.all([
      queryPeriodo(codPeriod, codEmpr),
      queryOcasionales(codPeriod, codEmpr),
      queryFijas(codPeriod, codEmpr),
      queryAusentismos(codPeriod, codEmpr),
      queryCambios(codPeriod, codEmpr),
    ]);

    if (!periodo) {
      return res.status(404).json({ error: `Período ${codPeriod} no encontrado.` });
    }

    const meses = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'];
    const etiqueta    = `${periodo.PER_ANO} - ${meses[periodo.PER_MES - 1]} - Q${periodo.PER_QNA}`;
    const nombreArchivo = `Novedades_CM_${periodo.PER_ANO}_${String(periodo.PER_MES).padStart(2,'0')}_Q${periodo.PER_QNA}.xlsx`;

    // 2. Preparar archivo temporal de salida
    tmpFile = path.join(os.tmpdir(), `adecco_${Date.now()}_${codPeriod}.xlsx`);

    // 3. Serializar fechas a ISO string para que Python las entienda
    const serializarFechas = (rows) => rows.map(r => {
      const out = {};
      for (const [k, v] of Object.entries(r)) {
        out[k] = v instanceof Date ? v.toISOString() : v;
      }
      return out;
    });

    const jsonData = {
      periodo:     { etiqueta },
      ocasionales: serializarFechas(ocasionales),
      fijas:       serializarFechas(fijas),
      ausentismos: serializarFechas(ausentismos),
      cambios:     serializarFechas(cambios),
    };

    // 4. Generar Excel (Python copia la plantilla y escribe los datos)
    await invocarPython(jsonData, tmpFile);

    // 5. Enviar archivo al cliente
    res.setHeader('Content-Type',
      'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition',
      `attachment; filename="${nombreArchivo}"`);

    const stream = fs.createReadStream(tmpFile);
    stream.pipe(res);
    stream.on('end', () => {
      fs.unlink(tmpFile, () => {});
    });
    stream.on('error', err => {
      console.error('[exportarAdecco] stream error:', err);
      if (!res.headersSent) res.status(500).end();
    });

    console.log(
      `[exportarAdecco] ✓ Período ${codPeriod} | ` +
      `Ocas:${ocasionales.length} Fijas:${fijas.length} ` +
      `Aus:${ausentismos.length} Cam:${cambios.length}`
    );

  } catch (err) {
    if (tmpFile) fs.unlink(tmpFile, () => {});
    console.error('[exportarAdecco] Error:', err);
    if (!res.headersSent) {
      res.status(500).json({ error: 'Error generando exportación ADECCO', details: err.message });
    }
  }
}

// ─── Controlador: listar períodos ─────────────────────────────────────────────

async function listarPeriodos(req, res) {
  try {
    const codEmpr = parseInt(req.query.codEmpr) || DEFAULT_COD_EMPR;
    const r = await executeQuery(`
      SELECT COD_PERIOD, PER_ANO, PER_MES, PER_QNA, PER_FINI, PER_FFIN, PER_EST
      FROM dbo.NO_PERIOD
      WHERE COD_EMPR = @codEmpr AND ACT_ESTA = 'A'
      ORDER BY PER_ANO DESC, PER_MES DESC, PER_QNA DESC
    `, { codEmpr });

    const meses = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
                   'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'];

    const lista = (r.recordset || []).map(p => ({
      codPeriod: p.COD_PERIOD,
      anio:      p.PER_ANO,
      mes:       p.PER_MES,
      quincena:  p.PER_QNA,
      estado:    p.PER_EST,
      fechaIni:  p.PER_FINI,
      fechaFin:  p.PER_FFIN,
      etiqueta:  `${p.PER_ANO} - ${meses[p.PER_MES - 1]} - Q${p.PER_QNA}`
    }));

    res.json(lista);
  } catch (err) {
    console.error('[exportarAdecco] listarPeriodos error:', err);
    res.status(500).json({ error: 'Error listando períodos', details: err.message });
  }
}

module.exports = { exportarAdecco, listarPeriodos };
