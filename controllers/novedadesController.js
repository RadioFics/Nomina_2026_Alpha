// ============================================================================
//  controllers/novedadesController.js
//  Historial unificado de novedades (OCASI + FIJAS + AUSEN + CAMBI)
//  y cierre automático de períodos vencidos.
// ============================================================================

const { executeQuery, getConnection } = require('../config/database');
const sql = require('mssql');

const DEFAULT_COD_EMPR = 1;

// ---------------------------------------------------------------------------
// Cierre automático de períodos vencidos
// Se invoca al arrancar el servidor y cada hora via setInterval.
// Un período está vencido cuando PER_FFIN < hoy y aún tiene PER_EST = 'A'.
// ---------------------------------------------------------------------------
async function verificarYCerrarPeriodosVencidos() {
  try {
    const res = await executeQuery(`
      SELECT COD_EMPR, COD_PERIOD, PER_ANO, PER_MES, PER_QNA, PER_FINI, PER_FFIN
      FROM dbo.NO_PERIOD
      WHERE PER_EST  = 'A'
        AND ACT_ESTA = 'A'
        AND CONVERT(date, PER_FFIN) < CONVERT(date, GETDATE())
    `);

    const vencidos = res.recordset || [];
    if (vencidos.length === 0) return;

    for (const p of vencidos) {
      await executeQuery(`
        UPDATE dbo.NO_PERIOD
        SET PER_EST  = 'I',
            ACT_HORA = GETDATE()
        WHERE COD_EMPR   = @codEmpr
          AND COD_PERIOD = @codPeriod
      `, { codEmpr: p.COD_EMPR, codPeriod: p.COD_PERIOD });

      console.log(
        `[periodos] ✓ Período ${p.COD_PERIOD} (${p.PER_ANO}-${String(p.PER_MES).padStart(2,'0')}-Q${p.PER_QNA}) ` +
        `cerrado automáticamente. Fin: ${p.PER_FFIN}`
      );
    }
  } catch (err) {
    console.error('[periodos] ✗ Error en cierre automático:', err.message);
  }
}

// ---------------------------------------------------------------------------
// POST /api/novedades/periodo/:codPeriod/cerrar
// Cierra manualmente un período específico.
// ---------------------------------------------------------------------------
async function cerrarPeriodo(req, res) {
  try {
    const codEmpr  = Number(req.query.codEmpr) || DEFAULT_COD_EMPR;
    const codPeriod = Number(req.params.codPeriod);

    if (!codPeriod) return res.status(400).json({ error: 'codPeriod requerido' });

    const check = await executeQuery(`
      SELECT COD_PERIOD, PER_EST, PER_ANO, PER_MES, PER_QNA, PER_FFIN
      FROM dbo.NO_PERIOD
      WHERE COD_EMPR = @codEmpr AND COD_PERIOD = @codPeriod AND ACT_ESTA = 'A'
    `, { codEmpr, codPeriod });

    if (!check.recordset.length)
      return res.status(404).json({ error: 'Período no encontrado' });

    if (check.recordset[0].PER_EST === 'I')
      return res.status(409).json({ error: 'El período ya está cerrado' });

    await executeQuery(`
      UPDATE dbo.NO_PERIOD
      SET PER_EST  = 'I',
          ACT_HORA = GETDATE()
      WHERE COD_EMPR = @codEmpr AND COD_PERIOD = @codPeriod
    `, { codEmpr, codPeriod });

    res.json({ ok: true, mensaje: `Período ${codPeriod} cerrado correctamente` });
  } catch (err) {
    console.error('[novedades] cerrarPeriodo error:', err);
    res.status(500).json({ error: 'Error cerrando período', details: err.message });
  }
}

// ---------------------------------------------------------------------------
// GET /api/novedades/historial
// Búsqueda histórica unificada de todas las novedades (OCASI+FIJAS+AUSEN+CAMBI).
//
// Query params:
//   q          Texto libre (cédula, nombre, concepto, observación)
//   tipo       OCASIONAL | FIJA | AUSENTISMO | CAMBIO  (default: todos)
//   codPeriod  Filtrar por período específico
//   estado     A | I | todos  (default: todos)
//   desde      Fecha inicio rango (FEC_REGI o PER_FINI) YYYY-MM-DD
//   hasta      Fecha fin rango YYYY-MM-DD
//   limite     Máximo de registros (default: 200)
// ---------------------------------------------------------------------------
async function buscarHistorial(req, res) {
  try {
    const codEmpr  = Number(req.query.codEmpr)   || DEFAULT_COD_EMPR;
    const q        = (req.query.q        || '').trim();
    const tipo     = (req.query.tipo     || 'todos').toUpperCase();
    const codPeriod = req.query.codPeriod ? Number(req.query.codPeriod) : null;
    const estado   = (req.query.estado   || 'todos').toUpperCase();
    const desde    = req.query.desde || null;
    const hasta    = req.query.hasta || null;
    const limite   = Math.min(Number(req.query.limite) || 200, 500);

    // Construye el fragmento WHERE dinámico compartido por todos los UNION
    // (aplicado sobre alias n=NO_NOVED, t=GN_TERCE, p=NO_PERIOD)
    const conditions = [`n.COD_EMPR = @codEmpr`];

    if (codPeriod) conditions.push(`n.COD_PERIOD = @codPeriod`);
    if (estado === 'A') conditions.push(`n.ACT_ESTA = 'A'`);
    else if (estado === 'I') conditions.push(`n.ACT_ESTA = 'I'`);

    if (desde) conditions.push(`CONVERT(date, n.FEC_REGI) >= @desde`);
    if (hasta) conditions.push(`CONVERT(date, n.FEC_REGI) <= @hasta`);

    if (q) {
      conditions.push(`(
        CAST(t.NUM_IDEN AS NVARCHAR(30)) LIKE @q
        OR t.NOM_COMP       LIKE @q
        OR c.NOM_CONC       LIKE @q
        OR n.OBS_NOVED      LIKE @q
      )`);
    }

    const WHERE = conditions.join(' AND ');

    // Joins comunes a las 4 partes del UNION
    const JOINS = `
      LEFT JOIN dbo.GN_FUNCI  f ON f.COD_EMPR = n.COD_EMPR AND f.COD_FUNCI = n.COD_FUNCI
      LEFT JOIN dbo.GN_TERCE  t ON t.COD_TERC = f.COD_TERC
      LEFT JOIN dbo.NO_CONCE  c ON c.COD_EMPR = n.COD_EMPR AND c.COD_CONC  = n.COD_CONC
      LEFT JOIN dbo.NO_PERIOD p ON p.COD_EMPR = n.COD_EMPR AND p.COD_PERIOD = n.COD_PERIOD
    `;

    // Columnas de salida estándar (NULL para columnas que no aplican al tipo)
    const colsOcasi = `
      n.COD_NOVED, n.COD_PERIOD, 'OCASIONAL' AS TIPO_NOVED,
      t.NUM_IDEN AS CEDULA, t.NOM_COMP AS NOMBRE,
      c.NOM_CONC AS CONCEPTO, c.TIP_CONC, c.TIP_NATU,
      o.CANTIDAD, o.VALOR,
      NULL AS FEC_INI_ESP, NULL AS FEC_FIN_ESP,
      NULL AS DIAS_TOTAL, NULL AS DIAGNOSTICO, NULL AS FEC_PRORRG,
      NULL AS APLICACION, NULL AS NUM_CUOTAS, NULL AS NUM_CUENTA,
      NULL AS VALOR_NUEVO, NULL AS VALOR_ANTE,
      n.FEC_REGI, n.OBS_NOVED, n.ACT_USUA, n.ACT_HORA, n.ACT_ESTA,
      n.IND_APLICADO,
      p.PER_ANO, p.PER_MES, p.PER_QNA, p.PER_FINI, p.PER_FFIN
    `;

    const colsFijas = `
      n.COD_NOVED, n.COD_PERIOD, 'FIJA' AS TIPO_NOVED,
      t.NUM_IDEN AS CEDULA, t.NOM_COMP AS NOMBRE,
      c.NOM_CONC AS CONCEPTO, c.TIP_CONC, c.TIP_NATU,
      fi.CANTIDAD, fi.VALOR,
      fi.FEC_INI AS FEC_INI_ESP, fi.FEC_FIN AS FEC_FIN_ESP,
      NULL AS DIAS_TOTAL, NULL AS DIAGNOSTICO, NULL AS FEC_PRORRG,
      fi.APLICACION, fi.NUM_CUOTAS, fi.NUM_CUENTA,
      NULL AS VALOR_NUEVO, NULL AS VALOR_ANTE,
      n.FEC_REGI, n.OBS_NOVED, n.ACT_USUA, n.ACT_HORA, n.ACT_ESTA,
      n.IND_APLICADO,
      p.PER_ANO, p.PER_MES, p.PER_QNA, p.PER_FINI, p.PER_FFIN
    `;

    const colsAusen = `
      n.COD_NOVED, n.COD_PERIOD, 'AUSENTISMO' AS TIPO_NOVED,
      t.NUM_IDEN AS CEDULA, t.NOM_COMP AS NOMBRE,
      c.NOM_CONC AS CONCEPTO, c.TIP_CONC, c.TIP_NATU,
      NULL AS CANTIDAD, NULL AS VALOR,
      a.FEC_INI AS FEC_INI_ESP, a.FEC_FIN AS FEC_FIN_ESP,
      a.DIAS_TOTAL, a.DIAGNOSTICO, a.FEC_PRORRG,
      NULL AS APLICACION, NULL AS NUM_CUOTAS, NULL AS NUM_CUENTA,
      NULL AS VALOR_NUEVO, NULL AS VALOR_ANTE,
      n.FEC_REGI, n.OBS_NOVED, n.ACT_USUA, n.ACT_HORA, n.ACT_ESTA,
      n.IND_APLICADO,
      p.PER_ANO, p.PER_MES, p.PER_QNA, p.PER_FINI, p.PER_FFIN
    `;

    const colsCambi = `
      n.COD_NOVED, n.COD_PERIOD, 'CAMBIO' AS TIPO_NOVED,
      t.NUM_IDEN AS CEDULA, t.NOM_COMP AS NOMBRE,
      c.NOM_CONC AS CONCEPTO, c.TIP_CONC, c.TIP_NATU,
      NULL AS CANTIDAD, NULL AS VALOR,
      ch.FEC_INI AS FEC_INI_ESP, NULL AS FEC_FIN_ESP,
      NULL AS DIAS_TOTAL, NULL AS DIAGNOSTICO, NULL AS FEC_PRORRG,
      NULL AS APLICACION, NULL AS NUM_CUOTAS, NULL AS NUM_CUENTA,
      ch.VALOR_NUEVO, ch.VALOR_ANTE,
      n.FEC_REGI, n.OBS_NOVED, n.ACT_USUA, n.ACT_HORA, n.ACT_ESTA,
      n.IND_APLICADO,
      p.PER_ANO, p.PER_MES, p.PER_QNA, p.PER_FINI, p.PER_FFIN
    `;

    // Armar las partes del UNION según el filtro de tipo
    const partes = [];

    if (tipo === 'TODOS' || tipo === 'OCASIONAL') {
      partes.push(`
        SELECT ${colsOcasi}
        FROM dbo.NO_NOVED n
        INNER JOIN dbo.NO_OCASI o ON o.COD_EMPR = n.COD_EMPR AND o.COD_NOVED = n.COD_NOVED
        ${JOINS}
        WHERE ${WHERE}
      `);
    }

    if (tipo === 'TODOS' || tipo === 'FIJA') {
      partes.push(`
        SELECT ${colsFijas}
        FROM dbo.NO_NOVED n
        INNER JOIN dbo.NO_FIJAS fi ON fi.COD_EMPR = n.COD_EMPR AND fi.COD_NOVED = n.COD_NOVED
        ${JOINS}
        WHERE ${WHERE}
      `);
    }

    if (tipo === 'TODOS' || tipo === 'AUSENTISMO') {
      partes.push(`
        SELECT ${colsAusen}
        FROM dbo.NO_NOVED n
        INNER JOIN dbo.NO_AUSEN a ON a.COD_EMPR = n.COD_EMPR AND a.COD_NOVED = n.COD_NOVED
        ${JOINS}
        WHERE ${WHERE}
      `);
    }

    if (tipo === 'TODOS' || tipo === 'CAMBIO') {
      partes.push(`
        SELECT ${colsCambi}
        FROM dbo.NO_NOVED n
        INNER JOIN dbo.NO_CAMBI ch ON ch.COD_EMPR = n.COD_EMPR AND ch.COD_NOVED = n.COD_NOVED
        ${JOINS}
        WHERE ${WHERE}
      `);
    }

    if (partes.length === 0)
      return res.status(400).json({ error: 'Tipo de novedad inválido' });

    const unionQuery = `
      SELECT TOP (@limite) * FROM (
        ${partes.join('\n UNION ALL \n')}
      ) AS historial
      ORDER BY ACT_HORA DESC
    `;

    const params = { codEmpr, limite };
    if (codPeriod) params.codPeriod = codPeriod;
    if (desde) params.desde = desde;
    if (hasta) params.hasta = hasta;
    if (q)    params.q = `%${q}%`;

    const result = await executeQuery(unionQuery, params);

    res.json({
      total: result.recordset.length,
      registros: result.recordset || []
    });

  } catch (err) {
    console.error('[novedades] buscarHistorial error:', err);
    res.status(500).json({ error: 'Error buscando historial', details: err.message });
  }
}

// ---------------------------------------------------------------------------
// GET /api/novedades/periodos
// Lista todos los períodos (para el select del buscador).
// ---------------------------------------------------------------------------
async function listarPeriodos(req, res) {
  try {
    const codEmpr = Number(req.query.codEmpr) || DEFAULT_COD_EMPR;
    const r = await executeQuery(`
      SELECT COD_PERIOD, PER_ANO, PER_MES, PER_QNA, PER_FINI, PER_FFIN, PER_EST
      FROM dbo.NO_PERIOD
      WHERE COD_EMPR = @codEmpr AND ACT_ESTA = 'A'
      ORDER BY PER_FINI DESC
    `, { codEmpr });
    res.json(r.recordset || []);
  } catch (err) {
    res.status(500).json({ error: 'Error listando períodos', details: err.message });
  }
}

// ---------------------------------------------------------------------------
// GET /api/novedades/recientes?limite=10
// Últimas N novedades registradas en BD, de cualquier tipo.
// ---------------------------------------------------------------------------
async function listarRecientes(req, res) {
  try {
    const codEmpr = Number(req.query.codEmpr) || DEFAULT_COD_EMPR;
    const limite  = Math.min(Number(req.query.limite) || 10, 100);

    const r = await executeQuery(`
      SELECT TOP (@limite) *
      FROM (
        SELECT
          n.COD_NOVED, n.COD_PERIOD, 'OCASIONAL' AS TIPO_NOVED,
          t.NUM_IDEN AS CEDULA, t.NOM_COMP AS NOMBRE,
          c.NOM_CONC AS CONCEPTO,
          o.VALOR,
          n.FEC_REGI, n.ACT_USUA, n.ACT_HORA, n.ACT_ESTA,
          p.PER_ANO, p.PER_MES, p.PER_QNA
        FROM dbo.NO_NOVED n
        INNER JOIN dbo.NO_OCASI  o  ON o.COD_EMPR  = n.COD_EMPR AND o.COD_NOVED  = n.COD_NOVED
        LEFT  JOIN dbo.GN_FUNCI  f  ON f.COD_EMPR  = n.COD_EMPR AND f.COD_FUNCI  = n.COD_FUNCI
        LEFT  JOIN dbo.GN_TERCE  t  ON t.COD_TERC  = f.COD_TERC
        LEFT  JOIN dbo.NO_CONCE  c  ON c.COD_EMPR  = n.COD_EMPR AND c.COD_CONC   = n.COD_CONC
        LEFT  JOIN dbo.NO_PERIOD p  ON p.COD_EMPR  = n.COD_EMPR AND p.COD_PERIOD = n.COD_PERIOD
        WHERE n.COD_EMPR = @codEmpr

        UNION ALL

        SELECT
          n.COD_NOVED, n.COD_PERIOD, 'FIJA' AS TIPO_NOVED,
          t.NUM_IDEN, t.NOM_COMP,
          c.NOM_CONC,
          fi.VALOR,
          n.FEC_REGI, n.ACT_USUA, n.ACT_HORA, n.ACT_ESTA,
          p.PER_ANO, p.PER_MES, p.PER_QNA
        FROM dbo.NO_NOVED n
        INNER JOIN dbo.NO_FIJAS  fi ON fi.COD_EMPR = n.COD_EMPR AND fi.COD_NOVED = n.COD_NOVED
        LEFT  JOIN dbo.GN_FUNCI  f  ON f.COD_EMPR  = n.COD_EMPR AND f.COD_FUNCI  = n.COD_FUNCI
        LEFT  JOIN dbo.GN_TERCE  t  ON t.COD_TERC  = f.COD_TERC
        LEFT  JOIN dbo.NO_CONCE  c  ON c.COD_EMPR  = n.COD_EMPR AND c.COD_CONC   = n.COD_CONC
        LEFT  JOIN dbo.NO_PERIOD p  ON p.COD_EMPR  = n.COD_EMPR AND p.COD_PERIOD = n.COD_PERIOD
        WHERE n.COD_EMPR = @codEmpr

        UNION ALL

        SELECT
          n.COD_NOVED, n.COD_PERIOD, 'AUSENTISMO' AS TIPO_NOVED,
          t.NUM_IDEN, t.NOM_COMP,
          c.NOM_CONC,
          NULL AS VALOR,
          n.FEC_REGI, n.ACT_USUA, n.ACT_HORA, n.ACT_ESTA,
          p.PER_ANO, p.PER_MES, p.PER_QNA
        FROM dbo.NO_NOVED n
        INNER JOIN dbo.NO_AUSEN  a  ON a.COD_EMPR  = n.COD_EMPR AND a.COD_NOVED  = n.COD_NOVED
        LEFT  JOIN dbo.GN_FUNCI  f  ON f.COD_EMPR  = n.COD_EMPR AND f.COD_FUNCI  = n.COD_FUNCI
        LEFT  JOIN dbo.GN_TERCE  t  ON t.COD_TERC  = f.COD_TERC
        LEFT  JOIN dbo.NO_CONCE  c  ON c.COD_EMPR  = n.COD_EMPR AND c.COD_CONC   = n.COD_CONC
        LEFT  JOIN dbo.NO_PERIOD p  ON p.COD_EMPR  = n.COD_EMPR AND p.COD_PERIOD = n.COD_PERIOD
        WHERE n.COD_EMPR = @codEmpr

        UNION ALL

        SELECT
          n.COD_NOVED, n.COD_PERIOD, 'CAMBIO' AS TIPO_NOVED,
          t.NUM_IDEN, t.NOM_COMP,
          c.NOM_CONC,
          NULL AS VALOR,
          n.FEC_REGI, n.ACT_USUA, n.ACT_HORA, n.ACT_ESTA,
          p.PER_ANO, p.PER_MES, p.PER_QNA
        FROM dbo.NO_NOVED n
        INNER JOIN dbo.NO_CAMBI  ch ON ch.COD_EMPR = n.COD_EMPR AND ch.COD_NOVED = n.COD_NOVED
        LEFT  JOIN dbo.GN_FUNCI  f  ON f.COD_EMPR  = n.COD_EMPR AND f.COD_FUNCI  = n.COD_FUNCI
        LEFT  JOIN dbo.GN_TERCE  t  ON t.COD_TERC  = f.COD_TERC
        LEFT  JOIN dbo.NO_CONCE  c  ON c.COD_EMPR  = n.COD_EMPR AND c.COD_CONC   = n.COD_CONC
        LEFT  JOIN dbo.NO_PERIOD p  ON p.COD_EMPR  = n.COD_EMPR AND p.COD_PERIOD = n.COD_PERIOD
        WHERE n.COD_EMPR = @codEmpr
      ) AS todas
      ORDER BY ACT_HORA DESC
    `, { codEmpr, limite });

    res.json(r.recordset || []);
  } catch (err) {
    console.error('[novedades] recientes error:', err);
    res.status(500).json({ error: 'Error obteniendo actividad reciente', details: err.message });
  }
}

module.exports = {
  buscarHistorial,
  cerrarPeriodo,
  listarPeriodos,
  listarRecientes,
  verificarYCerrarPeriodosVencidos
};
