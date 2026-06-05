// ============================================================================
//  controllers/novedadesController.js
//  Historial unificado de novedades (OCASI + FIJAS + AUSEN + CAMBI)
//  y cierre automático de períodos vencidos.
// ============================================================================

const { executeQuery, getConnection } = require('../config/database');
const sql = require('mssql');

const DEFAULT_COD_EMPR = 1;

// ---------------------------------------------------------------------------
// Cierre automático de períodos vencidos + activación del siguiente.
// Se invoca al arrancar el servidor y cada hora via setInterval en server.js.
//
// Ciclo de estados:
//   'F' (Futuro)  → 'A' (Activo) cuando llega su PER_FINI
//   'A' (Activo)  → 'I' (Inactivo/cerrado) cuando pasa su PER_FFIN
//
// Al cerrar un período 'A' se activa automáticamente el siguiente 'F'
// (el de COD_PERIOD más bajo entre los futuros del mismo COD_EMPR).
// ---------------------------------------------------------------------------
async function verificarYCerrarPeriodosVencidos() {
  try {
    // ── 1. Cerrar períodos 'A' vencidos ──────────────────────────────────────
    const res = await executeQuery(`
      SELECT COD_EMPR, COD_PERIOD, PER_ANO, PER_MES, PER_QNA, PER_FINI, PER_FFIN
      FROM dbo.NO_PERIOD
      WHERE PER_EST  = 'A'
        AND ACT_ESTA = 'A'
        AND CONVERT(date, PER_FFIN) < CONVERT(date, GETDATE())
    `);

    const vencidos = res.recordset || [];

    for (const p of vencidos) {
      await executeQuery(`
        UPDATE dbo.NO_PERIOD
        SET PER_EST  = 'I',
            ACT_HORA = GETDATE()
        WHERE COD_EMPR   = @codEmpr
          AND COD_PERIOD = @codPeriod
      `, { codEmpr: p.COD_EMPR, codPeriod: p.COD_PERIOD });

      // Archivar novedades del período cerrado: A → I (históricas, válidas para trazabilidad)
      // El trigger TR_NO_NOVED_PERIODO_CERRADO permite A→I aunque el período ya sea 'I'.
      await executeQuery(
        `UPDATE dbo.NO_NOVED SET ACT_ESTA='I', ACT_HORA=GETDATE()
         WHERE COD_EMPR=@codEmpr AND COD_PERIOD=@codPeriod AND ACT_ESTA='A'`,
        { codEmpr: p.COD_EMPR, codPeriod: p.COD_PERIOD }
      );
      await executeQuery(
        `UPDATE o SET o.ACT_ESTA='I', o.ACT_HORA=SYSDATETIME()
         FROM dbo.NO_OCASI o JOIN dbo.NO_NOVED n
           ON n.COD_EMPR=o.COD_EMPR AND n.COD_NOVED=o.COD_NOVED
         WHERE n.COD_PERIOD=@codPeriod AND n.COD_EMPR=@codEmpr AND o.ACT_ESTA='A'`,
        { codEmpr: p.COD_EMPR, codPeriod: p.COD_PERIOD }
      );
      await executeQuery(
        `UPDATE f SET f.ACT_ESTA='I', f.ACT_HORA=SYSDATETIME()
         FROM dbo.NO_FIJAS f JOIN dbo.NO_NOVED n
           ON n.COD_EMPR=f.COD_EMPR AND n.COD_NOVED=f.COD_NOVED
         WHERE n.COD_PERIOD=@codPeriod AND n.COD_EMPR=@codEmpr AND f.ACT_ESTA='A'`,
        { codEmpr: p.COD_EMPR, codPeriod: p.COD_PERIOD }
      );
      await executeQuery(
        `UPDATE a SET a.ACT_ESTA='I', a.ACT_HORA=SYSDATETIME()
         FROM dbo.NO_AUSEN a JOIN dbo.NO_NOVED n
           ON n.COD_EMPR=a.COD_EMPR AND n.COD_NOVED=a.COD_NOVED
         WHERE n.COD_PERIOD=@codPeriod AND n.COD_EMPR=@codEmpr AND a.ACT_ESTA='A'`,
        { codEmpr: p.COD_EMPR, codPeriod: p.COD_PERIOD }
      );
      await executeQuery(
        `UPDATE c SET c.ACT_ESTA='I', c.ACT_HORA=SYSDATETIME()
         FROM dbo.NO_CAMBI c JOIN dbo.NO_NOVED n
           ON n.COD_EMPR=c.COD_EMPR AND n.COD_NOVED=c.COD_NOVED
         WHERE n.COD_PERIOD=@codPeriod AND n.COD_EMPR=@codEmpr AND c.ACT_ESTA='A'`,
        { codEmpr: p.COD_EMPR, codPeriod: p.COD_PERIOD }
      );

      console.log(
        `[periodos] ✓ Período ${p.COD_PERIOD} (${p.PER_ANO}-${String(p.PER_MES).padStart(2,'0')}-Q${p.PER_QNA}) ` +
        `cerrado y novedades archivadas (A→I). Fin: ${p.PER_FFIN}`
      );

      // ── 2. Activar el siguiente período 'F' (si su fecha ya llegó) ─────────
      const sigRes = await executeQuery(`
        UPDATE dbo.NO_PERIOD
        SET PER_EST  = 'A',
            ACT_HORA = GETDATE()
        WHERE COD_EMPR  = @codEmpr
          AND ACT_ESTA  = 'A'
          AND PER_EST   = 'F'
          AND COD_PERIOD = (
            SELECT MIN(COD_PERIOD)
            FROM   dbo.NO_PERIOD
            WHERE  COD_EMPR  = @codEmpr
              AND  ACT_ESTA  = 'A'
              AND  PER_EST   = 'F'
              AND  CONVERT(date, PER_FINI) <= CONVERT(date, GETDATE())
          )
      `, { codEmpr: p.COD_EMPR });

      if (sigRes.rowsAffected && sigRes.rowsAffected[0] > 0) {
        console.log(`[periodos] ▶ Siguiente período 'F' activado para empresa ${p.COD_EMPR}`);
      }
    }

    // ── 3. Activar períodos 'F' cuya fecha ya llegó (aunque no haya cierre hoy)
    //       Cubre el arranque en frío si el servidor estuvo detenido varios días.
    await executeQuery(`
      UPDATE dbo.NO_PERIOD
      SET PER_EST  = 'A',
          ACT_HORA = GETDATE()
      WHERE ACT_ESTA = 'A'
        AND PER_EST  = 'F'
        AND CONVERT(date, PER_FINI) <= CONVERT(date, GETDATE())
        AND NOT EXISTS (
          SELECT 1 FROM dbo.NO_PERIOD p2
          WHERE p2.COD_EMPR  = dbo.NO_PERIOD.COD_EMPR
            AND p2.ACT_ESTA  = 'A'
            AND p2.PER_EST   = 'A'
        )
    `);

    // ── 4. Mantener el horizonte de períodos futuros ───────────────────────────
    await _asegurarPeriodosFuturos(DEFAULT_COD_EMPR);

  } catch (err) {
    console.error('[periodos] ✗ Error en cierre/activación automática:', err.message);
  }
}

// ---------------------------------------------------------------------------
// _asegurarPeriodosFuturos(codEmpr)
// Garantiza que siempre existan períodos 'F' pre-creados hasta HORIZONTE_MESES
// meses en el futuro, contados desde hoy.
//
// Se llama automáticamente al final de verificarYCerrarPeriodosVencidos()
// (cada 3 h). Es idempotente: usa NOT EXISTS para no duplicar quincenas.
//
// Con HORIZONTE_MESES = 36 el sistema opera sin intervención manual
// durante al menos 3 años desde la última ejecución.
// ---------------------------------------------------------------------------
async function _asegurarPeriodosFuturos(codEmpr) {
  const HORIZONTE_MESES = 36;

  // Última quincena existente (sea cual sea su estado)
  const lastRes = await executeQuery(`
    SELECT TOP 1 PER_ANO, PER_MES, PER_QNA, COD_PERIOD
    FROM dbo.NO_PERIOD
    WHERE COD_EMPR = @codEmpr AND ACT_ESTA = 'A' AND COD_PERIOD > 0
    ORDER BY COD_PERIOD DESC
  `, { codEmpr });

  if (!lastRes.recordset.length) return 0;
  const last = lastRes.recordset[0];

  // Fecha límite del horizonte (hoy + 36 meses)
  const hoy       = new Date();
  const limiteAno = hoy.getFullYear() + Math.floor((hoy.getMonth() + HORIZONTE_MESES) / 12);
  const limiteMes = ((hoy.getMonth() + HORIZONTE_MESES) % 12) + 1; // 1-12

  // Si el último período ya cubre el horizonte, no hay nada que hacer
  if (last.PER_ANO > limiteAno ||
     (last.PER_ANO === limiteAno && last.PER_MES >= limiteMes)) {
    return 0;
  }

  // Avanzador de quincena: modifica {ano, mes, qna} en el siguiente período
  const avanzar = (state) => {
    if (state.qna === 1) {
      state.qna = 2;
    } else {
      state.qna = 1;
      if (state.mes === 12) { state.mes = 1; state.ano++; }
      else { state.mes++; }
    }
  };

  // Empezar desde la quincena inmediatamente siguiente a la última
  const state = { ano: last.PER_ANO, mes: last.PER_MES, qna: last.PER_QNA };
  avanzar(state);
  let creados = 0;

  while (state.ano < limiteAno || (state.ano === limiteAno && state.mes <= limiteMes)) {
    const { ano, mes, qna } = state;
    const mm = String(mes).padStart(2, '0');
    const fini = qna === 1 ? `${ano}-${mm}-01` : `${ano}-${mm}-16`;
    const diasMes = new Date(ano, mes, 0).getDate(); // último día del mes
    const ffin = qna === 1 ? `${ano}-${mm}-15`
                           : `${ano}-${mm}-${String(diasMes).padStart(2, '0')}`;

    // COD_PERIOD es IDENTITY → se omite del INSERT y SQL Server lo auto-genera
    const ins = await executeQuery(`
      INSERT INTO dbo.NO_PERIOD
        (COD_EMPR, PER_ANO, PER_MES, PER_QNA,
         PER_FINI, PER_FFIN, PER_EST, ACT_USUA)
      SELECT @codEmpr, @ano, @mes, @qna,
             CONVERT(date, @fini), CONVERT(date, @ffin),
             'F', 'system'
      WHERE NOT EXISTS (
        SELECT 1 FROM dbo.NO_PERIOD
        WHERE COD_EMPR = @codEmpr AND PER_ANO = @ano
          AND PER_MES  = @mes    AND PER_QNA  = @qna AND ACT_ESTA = 'A'
      )
    `, { codEmpr, ano, mes, qna, fini, ffin });

    if (ins.rowsAffected && ins.rowsAffected[0] > 0) creados++;
    avanzar(state);
  }

  if (creados > 0) {
    console.log(`[periodos] ✚ ${creados} período(s) generados automáticamente` +
                ` (horizonte ${HORIZONTE_MESES} meses, hasta ${limiteAno}-${String(limiteMes).padStart(2,'0')})`);
  }
  return creados;
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

    // Archivar novedades del período cerrado: A → I
    await executeQuery(
      `UPDATE dbo.NO_NOVED SET ACT_ESTA='I', ACT_HORA=GETDATE()
       WHERE COD_EMPR=@codEmpr AND COD_PERIOD=@codPeriod AND ACT_ESTA='A'`,
      { codEmpr, codPeriod }
    );
    for (const tabla of ['NO_OCASI', 'NO_FIJAS', 'NO_AUSEN', 'NO_CAMBI']) {
      const alias = tabla.replace('NO_', '').toLowerCase().substring(0, 1);
      await executeQuery(
        `UPDATE x SET x.ACT_ESTA='I', x.ACT_HORA=SYSDATETIME()
         FROM dbo.${tabla} x JOIN dbo.NO_NOVED n
           ON n.COD_EMPR=x.COD_EMPR AND n.COD_NOVED=x.COD_NOVED
         WHERE n.COD_PERIOD=@codPeriod AND n.COD_EMPR=@codEmpr AND x.ACT_ESTA='A'`,
        { codEmpr, codPeriod }
      );
    }

    res.json({ ok: true, mensaje: `Período ${codPeriod} cerrado y novedades archivadas correctamente` });
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
    const codEmpr   = Number(req.query.codEmpr)   || DEFAULT_COD_EMPR;
    const q         = (req.query.q        || '').trim();
    const tipo      = (req.query.tipo     || 'todos').toUpperCase();
    const codPeriod = req.query.codPeriod ? Number(req.query.codPeriod) : null;
    const estado    = (req.query.estado   || 'todos').toUpperCase();
    const desde     = req.query.desde || null;
    const hasta     = req.query.hasta || null;
    const limite    = Math.min(Number(req.query.limite) || 200, 500);
    const codCcost  = req.query.codCcost ? Number(req.query.codCcost) : null;

    // Construye el fragmento WHERE dinámico compartido por todos los UNION
    // (aplicado sobre alias n=NO_NOVED, t=GN_TERCE, p=NO_PERIOD, f=GN_FUNCI)
    const conditions = [`n.COD_EMPR = @codEmpr`];

    if (codPeriod) conditions.push(`n.COD_PERIOD = @codPeriod`);
    if (codCcost)  conditions.push(`f.COD_CCOST = @codCcost`);
    // A=activo, I=histórico (período cerrado), E=exento (cancelado explícitamente)
    if      (estado === 'A')    conditions.push(`n.ACT_ESTA = 'A'`);
    else if (estado === 'I')    conditions.push(`n.ACT_ESTA = 'I'`);
    else if (estado === 'E')    conditions.push(`n.ACT_ESTA = 'E'`);
    else if (estado === 'TODOS') {/* sin filtro: muestra A+I+E */}
    else                        conditions.push(`n.ACT_ESTA IN ('A','I')`); // default: excluir exentos

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
      LEFT JOIN dbo.GN_TERCE  t ON t.COD_EMPR = n.COD_EMPR AND t.COD_TERC  = f.COD_TERC
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

    const params = { codEmpr };
    if (codPeriod) params.codPeriod = codPeriod;
    if (codCcost)  params.codCcost  = codCcost;
    if (desde) params.desde = desde;
    if (hasta) params.hasta = hasta;
    if (q)    params.q = `%${q}%`;

    // Ejecutar primero un COUNT para obtener el total real sin límite
    const countQuery = `
      SELECT COUNT(*) AS total FROM (
        ${partes.join('\n UNION ALL \n')}
      ) AS historial
    `;
    const countResult = await executeQuery(countQuery, params);
    const totalReal = countResult.recordset[0]?.total || 0;

    // Luego traer los registros con límite (usando TOP hardcodeado para evitar
    // problemas de tipo con @limite en subqueries UNION ALL de mssql)
    const limiteNum = Number(limite);
    const dataQuery = `
      SELECT TOP ${limiteNum} * FROM (
        ${partes.join('\n UNION ALL \n')}
      ) AS historial
      ORDER BY ACT_HORA DESC
    `;
    const result = await executeQuery(dataQuery, params);

    res.json({
      total: totalReal,
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
    // Se incluyen TODOS los períodos (activos e inactivos) para que el buscador
    // histórico pueda filtrar novedades de cualquier quincena, no solo la vigente.
    const r = await executeQuery(`
      SELECT COD_PERIOD, PER_ANO, PER_MES, PER_QNA, PER_FINI, PER_FFIN, PER_EST
      FROM dbo.NO_PERIOD
      WHERE COD_EMPR = @codEmpr
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

// ---------------------------------------------------------------------------
// GET /api/novedades/trazabilidad-ccost
// Resumen de novedades agrupadas por Centro de Costo.
// Devuelve por cada CC: métricas globales + lista de empleados con sus métricas.
//
// Query params:
//   codPeriod   Filtrar por período  (opcional; si omite, todos los períodos)
//   estado      A | I | todos        (default: A — solo activos)
//   codEmpr     Empresa              (default: 1)
// ---------------------------------------------------------------------------
async function trazabilidadCCost(req, res) {
  try {
    const codEmpr    = Number(req.query.codEmpr)   || DEFAULT_COD_EMPR;
    const codPeriod  = req.query.codPeriod ? Number(req.query.codPeriod) : null;
    const estado     = (req.query.estado || 'A').toUpperCase();

    // Soporte multi-CC: acepta ?codCcost=1,2,3 o ?codCcost=1&codCcost=2
    const rawCc = req.query.codCcost;
    const ccList = rawCc
      ? (Array.isArray(rawCc) ? rawCc : String(rawCc).split(','))
          .map(v => Number(v.trim())).filter(v => v > 0)
      : [];

    const params = { codEmpr };
    const estCond = estado === 'A' ? `AND n.ACT_ESTA = 'A'`
                  : estado === 'I' ? `AND n.ACT_ESTA = 'I'`
                  : '';
    const perCond = codPeriod ? `AND n.COD_PERIOD = @codPeriod` : '';

    // Genera IN (@cc0, @cc1, ...) para multi-CC o = @cc0 para uno solo
    let ccostCond = '';
    if (ccList.length === 1) {
      ccostCond = `AND f.COD_CCOST = @cc0`;
      params.cc0 = ccList[0];
    } else if (ccList.length > 1) {
      const placeholders = ccList.map((v, i) => { params[`cc${i}`] = v; return `@cc${i}`; }).join(',');
      ccostCond = `AND f.COD_CCOST IN (${placeholders})`;
    }
    if (codPeriod) params.codPeriod = codPeriod;

    // ── 1. Resumen por Centro de Costo ──────────────────────────────────────
    const qSummary = `
      SELECT
        cc.COD_CCOST,
        RTRIM(cc.NOM_CCOST)                                                AS nom_ccost,
        COUNT(DISTINCT f.COD_FUNCI)                                        AS total_empleados,
        COUNT(n.COD_NOVED)                                                 AS total_novedades,
        SUM(CASE WHEN c.TIP_CONC = 'DEVENGO'
              THEN COALESCE(o.VALOR, fi.VALOR, 0) ELSE 0 END)             AS total_devengos,
        SUM(CASE WHEN c.TIP_CONC = 'DEDUCCION'
              THEN COALESCE(o.VALOR, fi.VALOR, 0) ELSE 0 END)             AS total_deducciones,
        SUM(COALESCE(o.CANTIDAD,  fi.CANTIDAD, 0))                        AS total_cantidad,
        SUM(COALESCE(a.DIAS_TOTAL, 0))                                    AS total_dias_aus,
        SUM(CASE WHEN o.COD_NOVED  IS NOT NULL THEN 1 ELSE 0 END)        AS cnt_ocasionales,
        SUM(CASE WHEN fi.COD_NOVED IS NOT NULL THEN 1 ELSE 0 END)        AS cnt_fijas,
        SUM(CASE WHEN a.COD_NOVED  IS NOT NULL THEN 1 ELSE 0 END)        AS cnt_ausentismos,
        SUM(CASE WHEN ch.COD_NOVED IS NOT NULL THEN 1 ELSE 0 END)        AS cnt_cambios,
        MAX(n.ACT_HORA)                                                   AS ultima_actividad
      FROM dbo.NO_NOVED n
      INNER JOIN dbo.GN_FUNCI   f   ON f.COD_EMPR  = n.COD_EMPR  AND f.COD_FUNCI  = n.COD_FUNCI
      INNER JOIN dbo.MAE_CCOST  cc  ON cc.COD_EMPR = n.COD_EMPR  AND cc.COD_CCOST = f.COD_CCOST
      LEFT  JOIN dbo.NO_CONCE   c   ON c.COD_EMPR  = n.COD_EMPR  AND c.COD_CONC   = n.COD_CONC
      LEFT  JOIN dbo.NO_OCASI   o   ON o.COD_EMPR  = n.COD_EMPR  AND o.COD_NOVED  = n.COD_NOVED
      LEFT  JOIN dbo.NO_FIJAS   fi  ON fi.COD_EMPR = n.COD_EMPR  AND fi.COD_NOVED = n.COD_NOVED
      LEFT  JOIN dbo.NO_AUSEN   a   ON a.COD_EMPR  = n.COD_EMPR  AND a.COD_NOVED  = n.COD_NOVED
      LEFT  JOIN dbo.NO_CAMBI   ch  ON ch.COD_EMPR = n.COD_EMPR  AND ch.COD_NOVED = n.COD_NOVED
      WHERE n.COD_EMPR = @codEmpr ${estCond} ${perCond} ${ccostCond}
      GROUP BY cc.COD_CCOST, cc.NOM_CCOST
      ORDER BY total_novedades DESC
    `;

    // ── 2. Detalle de empleados por CC ──────────────────────────────────────
    const qEmpleados = `
      SELECT
        cc.COD_CCOST,
        t.NUM_IDEN                                                          AS cedula,
        RTRIM(t.NOM_COMP)                                                  AS nombre,
        COUNT(n.COD_NOVED)                                                 AS novedades,
        SUM(CASE WHEN c.TIP_CONC = 'DEVENGO'
              THEN COALESCE(o.VALOR, fi.VALOR, 0) ELSE 0 END)             AS devengos,
        SUM(CASE WHEN c.TIP_CONC = 'DEDUCCION'
              THEN COALESCE(o.VALOR, fi.VALOR, 0) ELSE 0 END)             AS deducciones,
        SUM(COALESCE(o.CANTIDAD,  fi.CANTIDAD, 0))                        AS cantidad,
        SUM(COALESCE(a.DIAS_TOTAL, 0))                                    AS dias_aus,
        SUM(CASE WHEN o.COD_NOVED  IS NOT NULL THEN 1 ELSE 0 END)        AS ocasionales,
        SUM(CASE WHEN fi.COD_NOVED IS NOT NULL THEN 1 ELSE 0 END)        AS fijas,
        SUM(CASE WHEN a.COD_NOVED  IS NOT NULL THEN 1 ELSE 0 END)        AS ausentismos,
        SUM(CASE WHEN ch.COD_NOVED IS NOT NULL THEN 1 ELSE 0 END)        AS cambios,
        MAX(n.ACT_HORA)                                                   AS ultima_actividad
      FROM dbo.NO_NOVED n
      INNER JOIN dbo.GN_FUNCI   f   ON f.COD_EMPR  = n.COD_EMPR  AND f.COD_FUNCI  = n.COD_FUNCI
      INNER JOIN dbo.GN_TERCE   t   ON t.COD_TERC  = f.COD_TERC
      INNER JOIN dbo.MAE_CCOST  cc  ON cc.COD_EMPR = n.COD_EMPR  AND cc.COD_CCOST = f.COD_CCOST
      LEFT  JOIN dbo.NO_CONCE   c   ON c.COD_EMPR  = n.COD_EMPR  AND c.COD_CONC   = n.COD_CONC
      LEFT  JOIN dbo.NO_OCASI   o   ON o.COD_EMPR  = n.COD_EMPR  AND o.COD_NOVED  = n.COD_NOVED
      LEFT  JOIN dbo.NO_FIJAS   fi  ON fi.COD_EMPR = n.COD_EMPR  AND fi.COD_NOVED = n.COD_NOVED
      LEFT  JOIN dbo.NO_AUSEN   a   ON a.COD_EMPR  = n.COD_EMPR  AND a.COD_NOVED  = n.COD_NOVED
      LEFT  JOIN dbo.NO_CAMBI   ch  ON ch.COD_EMPR = n.COD_EMPR  AND ch.COD_NOVED = n.COD_NOVED
      WHERE n.COD_EMPR = @codEmpr ${estCond} ${perCond} ${ccostCond}
      GROUP BY cc.COD_CCOST, t.NUM_IDEN, t.NOM_COMP
      ORDER BY cc.COD_CCOST, devengos DESC
    `;

    const [rSummary, rEmps] = await Promise.all([
      executeQuery(qSummary,   params),
      executeQuery(qEmpleados, params),
    ]);

    // Inyectar lista de empleados dentro de cada CC
    const empsByCc = {};
    for (const e of (rEmps.recordset || [])) {
      const k = e.COD_CCOST;
      if (!empsByCc[k]) empsByCc[k] = [];
      empsByCc[k].push(e);
    }

    const centros = (rSummary.recordset || []).map(cc => ({
      ...cc,
      empleados: empsByCc[cc.COD_CCOST] || []
    }));

    res.json({ centros });
  } catch (err) {
    console.error("[novedades] trazabilidadCCost error:", err);
    res.status(500).json({ error: "Error obteniendo trazabilidad por CC", details: err.message });
  }
}

module.exports = {
  buscarHistorial,
  cerrarPeriodo,
  listarPeriodos,
  listarRecientes,
  trazabilidadCCost,
  verificarYCerrarPeriodosVencidos
};
