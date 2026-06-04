// ============================================================================
//  controllers/graficosController.js
//  Analítica y métricas — pestaña "Gráficos"
//
//  Endpoints:
//    GET /api/graficos/resumen          KPIs del período indicado (o el activo)
//    GET /api/graficos/historico        Devengos/deducciones por período
//    GET /api/graficos/novedades        Distribución de novedades por tipo/período
//    GET /api/graficos/ausentismos      Top empleados + tipos de ausentismo
//    GET /api/graficos/centros          Resumen por centro de costo
// ============================================================================

const { executeQuery } = require('../config/database');
const DEFAULT_COD_EMPR = 1;

// ── helpers ──────────────────────────────────────────────────────────────────
async function resolverPeriodoActual(codEmpr) {
  const r = await executeQuery(
    `SELECT TOP 1 COD_PERIOD FROM dbo.NO_PERIOD
     WHERE COD_EMPR = @codEmpr AND PER_EST='A' AND ACT_ESTA='A'
       AND CONVERT(date,GETDATE()) BETWEEN PER_FINI AND PER_FFIN
     ORDER BY PER_FINI DESC`,
    { codEmpr }
  );
  return r.recordset && r.recordset[0] ? r.recordset[0].COD_PERIOD : null;
}

// ── GET /api/graficos/resumen ─────────────────────────────────────────────────
async function resumen(req, res) {
  try {
    const codEmpr   = Number(req.query.codEmpr) || DEFAULT_COD_EMPR;
    let codPeriod   = req.query.codPeriod ? Number(req.query.codPeriod) : null;
    if (!codPeriod) codPeriod = await resolverPeriodoActual(codEmpr);

    const periodFilter = codPeriod ? 'AND n.COD_PERIOD = @codPeriod' : '';
    const params = codPeriod ? { codEmpr, codPeriod } : { codEmpr };

    // KPIs generales
    const kpiQ = `
      SELECT
        COUNT(*)                                                  AS total_novedades,
        COUNT(DISTINCT n.COD_FUNCI)                              AS empleados_con_novedades,
        SUM(CASE WHEN c.TIP_CONC='DEVENGO'   AND oc.VALOR IS NOT NULL THEN oc.VALOR ELSE 0 END) AS devengos,
        SUM(CASE WHEN c.TIP_CONC='DEDUCCION' AND oc.VALOR IS NOT NULL THEN oc.VALOR ELSE 0 END) AS deducciones,
        COUNT(CASE WHEN c.TIP_NATU='AUSENTISMO' THEN 1 END)      AS total_ausencias,
        SUM(CASE WHEN c.TIP_NATU='AUSENTISMO' THEN ISNULL(au.DIAS_TOTAL,0) ELSE 0 END) AS dias_ausencia
      FROM dbo.NO_NOVED n
      JOIN  dbo.NO_CONCE c  ON c.COD_CONC=n.COD_CONC  AND c.COD_EMPR=n.COD_EMPR
      LEFT JOIN dbo.NO_OCASI oc ON oc.COD_NOVED=n.COD_NOVED AND oc.COD_EMPR=n.COD_EMPR AND oc.ACT_ESTA='A'
      LEFT JOIN dbo.NO_AUSEN au ON au.COD_NOVED=n.COD_NOVED AND au.COD_EMPR=n.COD_EMPR AND au.ACT_ESTA='A'
      WHERE n.COD_EMPR=@codEmpr AND n.ACT_ESTA='A' ${periodFilter}
    `;

    // Distribución novedades por tipo
    const distQ = `
      SELECT c.TIP_NATU AS tipo, COUNT(*) AS total,
             SUM(ISNULL(oc.VALOR,0)) AS valor_total
      FROM dbo.NO_NOVED n
      JOIN  dbo.NO_CONCE c  ON c.COD_CONC=n.COD_CONC  AND c.COD_EMPR=n.COD_EMPR
      LEFT JOIN dbo.NO_OCASI oc ON oc.COD_NOVED=n.COD_NOVED AND oc.COD_EMPR=n.COD_EMPR AND oc.ACT_ESTA='A'
      WHERE n.COD_EMPR=@codEmpr AND n.ACT_ESTA='A' ${periodFilter}
      GROUP BY c.TIP_NATU
      ORDER BY total DESC
    `;

    // Top 10 ausentes del período
    const topQ = `
      SELECT TOP 10
             t.NUM_IDEN  AS cedula,
             t.NOM_COMP  AS nombre,
             COUNT(*)    AS ausencias,
             SUM(ISNULL(au.DIAS_TOTAL,0)) AS dias
      FROM dbo.NO_NOVED n
      JOIN  dbo.GN_FUNCI f  ON f.COD_FUNCI=n.COD_FUNCI AND f.COD_EMPR=n.COD_EMPR
      JOIN  dbo.GN_TERCE t  ON t.COD_TERC=f.COD_TERC
      JOIN  dbo.NO_CONCE c  ON c.COD_CONC=n.COD_CONC   AND c.COD_EMPR=n.COD_EMPR
      JOIN  dbo.NO_AUSEN au ON au.COD_NOVED=n.COD_NOVED AND au.COD_EMPR=n.COD_EMPR AND au.ACT_ESTA='A'
      WHERE n.COD_EMPR=@codEmpr AND n.ACT_ESTA='A' AND c.TIP_NATU='AUSENTISMO' ${periodFilter}
      GROUP BY t.NUM_IDEN, t.NOM_COMP
      ORDER BY dias DESC
    `;

    const [kpiRes, distRes, topRes] = await Promise.all([
      executeQuery(kpiQ, params),
      executeQuery(distQ, params),
      executeQuery(topQ, params)
    ]);

    res.json({
      codPeriod,
      kpis:          kpiRes.recordset[0]  || {},
      distribucion:  distRes.recordset    || [],
      topAusentes:   topRes.recordset     || []
    });
  } catch (err) {
    console.error('[graficos] resumen error:', err);
    res.status(500).json({ error: 'Error calculando resumen', details: err.message });
  }
}

// ── GET /api/graficos/historico ───────────────────────────────────────────────
async function historico(req, res) {
  try {
    const codEmpr = Number(req.query.codEmpr) || DEFAULT_COD_EMPR;

    // Devengos y deducciones acumulados por período (solo novedades con valor económico)
    const finQ = `
      SELECT
        p.COD_PERIOD,
        CONCAT(p.PER_ANO,'-',RIGHT('0'+CAST(p.PER_MES AS VARCHAR),2),'-Q',p.PER_QNA) AS label,
        p.PER_FINI AS fecha_inicio,
        SUM(CASE WHEN c.TIP_CONC='DEVENGO'   THEN ISNULL(oc.VALOR,0) ELSE 0 END) AS devengos,
        SUM(CASE WHEN c.TIP_CONC='DEDUCCION' THEN ISNULL(oc.VALOR,0) ELSE 0 END) AS deducciones,
        COUNT(*) AS total_novedades,
        COUNT(DISTINCT n.COD_FUNCI) AS empleados
      FROM dbo.NO_NOVED n
      JOIN  dbo.NO_PERIOD p  ON p.COD_PERIOD=n.COD_PERIOD AND p.COD_EMPR=n.COD_EMPR
      JOIN  dbo.NO_CONCE  c  ON c.COD_CONC=n.COD_CONC     AND c.COD_EMPR=n.COD_EMPR
      LEFT JOIN dbo.NO_OCASI oc ON oc.COD_NOVED=n.COD_NOVED AND oc.COD_EMPR=n.COD_EMPR AND oc.ACT_ESTA='A'
      WHERE n.COD_EMPR=@codEmpr AND n.ACT_ESTA='A'
      GROUP BY p.COD_PERIOD, p.PER_ANO, p.PER_MES, p.PER_QNA, p.PER_FINI
      ORDER BY p.COD_PERIOD
    `;

    // Ausentismos por período (días acumulados)
    const ausQ = `
      SELECT
        p.COD_PERIOD,
        CONCAT(p.PER_ANO,'-',RIGHT('0'+CAST(p.PER_MES AS VARCHAR),2),'-Q',p.PER_QNA) AS label,
        COUNT(*)  AS ausencias,
        SUM(ISNULL(au.DIAS_TOTAL,0)) AS dias_total
      FROM dbo.NO_NOVED n
      JOIN  dbo.NO_PERIOD p  ON p.COD_PERIOD=n.COD_PERIOD AND p.COD_EMPR=n.COD_EMPR
      JOIN  dbo.NO_CONCE  c  ON c.COD_CONC=n.COD_CONC     AND c.COD_EMPR=n.COD_EMPR
      JOIN  dbo.NO_AUSEN au  ON au.COD_NOVED=n.COD_NOVED   AND au.COD_EMPR=n.COD_EMPR AND au.ACT_ESTA='A'
      WHERE n.COD_EMPR=@codEmpr AND n.ACT_ESTA='A' AND c.TIP_NATU='AUSENTISMO'
      GROUP BY p.COD_PERIOD, p.PER_ANO, p.PER_MES, p.PER_QNA
      ORDER BY p.COD_PERIOD
    `;

    const [finRes, ausRes] = await Promise.all([
      executeQuery(finQ, { codEmpr }),
      executeQuery(ausQ, { codEmpr })
    ]);

    res.json({
      financiero:  finRes.recordset || [],
      ausentismos: ausRes.recordset || []
    });
  } catch (err) {
    console.error('[graficos] historico error:', err);
    res.status(500).json({ error: 'Error cargando histórico', details: err.message });
  }
}

// ── GET /api/graficos/ausentismos ─────────────────────────────────────────────
async function ausencias(req, res) {
  try {
    const codEmpr = Number(req.query.codEmpr) || DEFAULT_COD_EMPR;

    // Tipos de ausentismo más frecuentes (todos los períodos)
    const tiposQ = `
      SELECT c.NOM_CONC AS tipo, COUNT(*) AS casos,
             SUM(ISNULL(au.DIAS_TOTAL,0)) AS dias_total
      FROM dbo.NO_NOVED n
      JOIN  dbo.NO_CONCE c  ON c.COD_CONC=n.COD_CONC  AND c.COD_EMPR=n.COD_EMPR
      JOIN  dbo.NO_AUSEN au ON au.COD_NOVED=n.COD_NOVED AND au.COD_EMPR=n.COD_EMPR AND au.ACT_ESTA='A'
      WHERE n.COD_EMPR=@codEmpr AND n.ACT_ESTA='A' AND c.TIP_NATU='AUSENTISMO'
      GROUP BY c.NOM_CONC
      ORDER BY dias_total DESC
    `;

    // Top 10 empleados histórico
    const topQ = `
      SELECT TOP 10
             t.NUM_IDEN AS cedula, t.NOM_COMP AS nombre,
             COUNT(*) AS ausencias,
             SUM(ISNULL(au.DIAS_TOTAL,0)) AS dias_total
      FROM dbo.NO_NOVED n
      JOIN  dbo.GN_FUNCI f  ON f.COD_FUNCI=n.COD_FUNCI AND f.COD_EMPR=n.COD_EMPR
      JOIN  dbo.GN_TERCE t  ON t.COD_TERC=f.COD_TERC
      JOIN  dbo.NO_CONCE c  ON c.COD_CONC=n.COD_CONC   AND c.COD_EMPR=n.COD_EMPR
      JOIN  dbo.NO_AUSEN au ON au.COD_NOVED=n.COD_NOVED AND au.COD_EMPR=n.COD_EMPR AND au.ACT_ESTA='A'
      WHERE n.COD_EMPR=@codEmpr AND n.ACT_ESTA='A' AND c.TIP_NATU='AUSENTISMO'
      GROUP BY t.NUM_IDEN, t.NOM_COMP
      ORDER BY dias_total DESC
    `;

    const [tiposRes, topRes] = await Promise.all([
      executeQuery(tiposQ, { codEmpr }),
      executeQuery(topQ, { codEmpr })
    ]);

    res.json({
      tipos:       tiposRes.recordset || [],
      topEmpleados: topRes.recordset  || []
    });
  } catch (err) {
    console.error('[graficos] ausencias error:', err);
    res.status(500).json({ error: 'Error cargando ausencias', details: err.message });
  }
}

// ── GET /api/graficos/centros ─────────────────────────────────────────────────
async function centros(req, res) {
  try {
    const codEmpr = Number(req.query.codEmpr) || DEFAULT_COD_EMPR;
    const codPeriod = req.query.codPeriod ? Number(req.query.codPeriod) : null;
    const periodFilter = codPeriod ? 'AND n.COD_PERIOD = @codPeriod' : '';
    const params = codPeriod ? { codEmpr, codPeriod } : { codEmpr };

    // ── NOTA: se resuelve el CC a través de GN_FUNCI (fuente autoritativa) porque
    //   NO_NOVED.COD_CCOST se dejó NULL en el pipeline de import.
    //   Un JOIN directo sobre n.COD_CCOST excluiría >95% de las novedades.
    const q = `
      SELECT
        cc.COD_CCOST AS codigo,
        cc.NOM_CCOST AS nombre,
        cc.COD_ABREV AS abrev,
        COUNT(DISTINCT n.COD_FUNCI)  AS empleados,
        COUNT(*)                     AS novedades,
        SUM(CASE WHEN c.TIP_CONC='DEVENGO'   THEN ISNULL(oc.VALOR,0) ELSE 0 END) AS devengos,
        SUM(CASE WHEN c.TIP_CONC='DEDUCCION' THEN ISNULL(oc.VALOR,0) ELSE 0 END) AS deducciones,
        COUNT(CASE WHEN c.TIP_NATU='AUSENTISMO' THEN 1 END) AS ausencias,
        SUM(CASE WHEN c.TIP_NATU='AUSENTISMO' THEN ISNULL(au.DIAS_TOTAL,0) ELSE 0 END) AS dias_ausencia
      FROM dbo.NO_NOVED n
      JOIN  dbo.GN_FUNCI  f  ON f.COD_FUNCI=n.COD_FUNCI    AND f.COD_EMPR=n.COD_EMPR
      JOIN  dbo.MAE_CCOST cc ON cc.COD_CCOST=f.COD_CCOST   AND cc.COD_EMPR=n.COD_EMPR
      JOIN  dbo.NO_CONCE  c  ON c.COD_CONC=n.COD_CONC      AND c.COD_EMPR=n.COD_EMPR
      LEFT JOIN dbo.NO_OCASI oc ON oc.COD_NOVED=n.COD_NOVED AND oc.COD_EMPR=n.COD_EMPR AND oc.ACT_ESTA='A'
      LEFT JOIN dbo.NO_AUSEN au ON au.COD_NOVED=n.COD_NOVED AND au.COD_EMPR=n.COD_EMPR AND au.ACT_ESTA='A'
      WHERE n.COD_EMPR=@codEmpr AND n.ACT_ESTA='A' ${periodFilter}
      GROUP BY cc.COD_CCOST, cc.NOM_CCOST, cc.COD_ABREV
      ORDER BY novedades DESC
    `;

    const r = await executeQuery(q, params);
    res.json({ codPeriod, centros: r.recordset || [] });
  } catch (err) {
    console.error('[graficos] centros error:', err);
    res.status(500).json({ error: 'Error cargando centros de costo', details: err.message });
  }
}

// ── GET /api/graficos/periodos ────────────────────────────────────────────────
async function periodos(req, res) {
  try {
    const codEmpr = Number(req.query.codEmpr) || DEFAULT_COD_EMPR;
    // Solo períodos que ya iniciaron (excluye futuros pre-creados y el sentinel 0)
    const r = await executeQuery(
      `SELECT COD_PERIOD, PER_ANO, PER_MES, PER_QNA, PER_FINI, PER_FFIN, PER_EST,
              CONCAT(PER_ANO,'-',RIGHT('0'+CAST(PER_MES AS VARCHAR),2),'-Q',PER_QNA) AS etiqueta
       FROM dbo.NO_PERIOD
       WHERE COD_EMPR=@codEmpr AND ACT_ESTA='A' AND COD_PERIOD > 0
         AND CONVERT(date, PER_FINI) <= CONVERT(date, GETDATE())
       ORDER BY COD_PERIOD DESC`,
      { codEmpr }
    );
    res.json(r.recordset || []);
  } catch (err) {
    console.error('[graficos] periodos error:', err);
    res.status(500).json({ error: 'Error cargando períodos', details: err.message });
  }
}

module.exports = { resumen, historico, ausencias, centros, periodos };
