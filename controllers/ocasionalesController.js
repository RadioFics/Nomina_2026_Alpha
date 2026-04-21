// ============================================================================
//  controllers/ocasionalesController.js
//  Novedades OCASIONALES contra NO_NOVED + NO_OCASI (convención MineDax).
//
//  Estrategia de datos (según acuerdos con el usuario):
//    • NO_NOVED guarda la cabecera trazable de TODA novedad (ocasional, fija,
//      ausentismo, cambio). Esta tabla es histórica: los registros NO se
//      borran físicamente, se anulan con ACT_ESTA = 'I' (soft-delete).
//    • NO_OCASI guarda la especialización (CANTIDAD, VALOR) para registros
//      cuya categoría es "ocasional". PK compuesta (COD_EMPR, COD_NOVED) en
//      ambas tablas; NO_OCASI.(COD_EMPR,COD_NOVED) es FK a NO_NOVED.
//    • El período se resuelve automáticamente por fecha de hoy contra
//      NO_PERIOD (PER_FINI <= GETDATE() <= PER_FFIN y PER_EST = 'A').
//    • COD_NOVED se genera con la SEQUENCE dbo.SEQ_NO_NOVED para atomicidad
//      bajo concurrencia. Si la sequence no existe, se crea al arrancar.
//
//  Endpoints implementados (ver routes/ocasionales.js):
//    GET    /api/ocasionales/periodo-actual
//    GET    /api/ocasionales                         (?codPeriod=)
//    POST   /api/ocasionales
//    PUT    /api/ocasionales/:codNoved               (cant/valor/obs)
//    DELETE /api/ocasionales/:codNoved               (anulación lógica)
// ============================================================================

const { executeQuery, getConnection } = require('../config/database');
const { getActUsua } = require('../config/userHelper');
const sql = require('mssql');

// -- Constante de empresa. Por ahora hardcoded a 1 (Collective Mining).
//    TODO: leerla del usuario autenticado cuando haya multi-empresa.
const DEFAULT_COD_EMPR = 1;

// ---------------------------------------------------------------------------
// Bootstrap idempotente: crea la SEQUENCE y la vista si no existen.
// Se invoca 1 vez al arrancar desde server.js (o en la primera request).
// ---------------------------------------------------------------------------
let bootstrapped = false;
async function ensureDbObjects() {
  if (bootstrapped) return;
  try {
    // NOTA: COD_NOVED en dbo.NO_NOVED es IDENTITY, por lo que NO se usa
    // una SEQUENCE para generar el valor — SQL Server lo autogenera
    // en el INSERT y lo capturamos con OUTPUT INSERTED.COD_NOVED.

    // Vista consolidada para el listado
    await executeQuery(`
      IF OBJECT_ID('dbo.vw_NO_OCASI_PERIODO', 'V') IS NULL
      BEGIN
        EXEC('
          CREATE VIEW dbo.vw_NO_OCASI_PERIODO AS
          SELECT
            n.COD_EMPR, n.COD_NOVED, n.COD_FUNCI, n.COD_CONC, n.COD_PERIOD,
            n.COD_CCOST, n.FEC_REGI, n.FEC_INI, n.FEC_FIN, n.OBS_NOVED,
            n.IND_APLICADO, n.ACT_USUA, n.ACT_HORA, n.ACT_ESTA,
            t.NUM_IDEN AS CEDULA, t.NOM_COMP AS NOMBRE,
            c.NOM_CONC, c.TIP_CONC, c.TIP_NATU,
            o.CANTIDAD, o.VALOR,
            p.PER_ANO, p.PER_MES, p.PER_QNA, p.PER_FINI, p.PER_FFIN
          FROM dbo.NO_NOVED n
          INNER JOIN dbo.NO_OCASI o
                 ON o.COD_EMPR = n.COD_EMPR AND o.COD_NOVED = n.COD_NOVED
          LEFT  JOIN dbo.GN_FUNCI f
                 ON f.COD_EMPR = n.COD_EMPR AND f.COD_FUNCI = n.COD_FUNCI
          LEFT  JOIN dbo.GN_TERCE t ON t.COD_TERC = f.COD_TERC
          LEFT  JOIN dbo.NO_CONCE c
                 ON c.COD_EMPR = n.COD_EMPR AND c.COD_CONC = n.COD_CONC
          LEFT  JOIN dbo.NO_PERIOD p
                 ON p.COD_EMPR = n.COD_EMPR AND p.COD_PERIOD = n.COD_PERIOD
          WHERE n.ACT_ESTA = ''A'' AND o.ACT_ESTA = ''A''
        ');
      END
    `);

    bootstrapped = true;
    console.log('[ocasionales] ✓ vw_NO_OCASI_PERIODO lista. (COD_NOVED = IDENTITY)');
  } catch (err) {
    console.error('[ocasionales] ✗ Error en bootstrap DB:', err.message);
    // No lanzamos: permitimos que la app arranque igual; las requests
    // individuales fallarán con mensaje claro si los objetos no existen.
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Devuelve el COD_PERIOD vigente para la fecha dada (hoy por defecto).
 * Asume: los períodos en NO_PERIOD no se traslapan. Si hubiera más de uno
 * elegible, tomamos el de PER_FINI mayor (el más reciente).
 */
async function resolverPeriodoActual(codEmpr = DEFAULT_COD_EMPR) {
  const q = `
    SELECT TOP 1 COD_PERIOD, PER_ANO, PER_MES, PER_QNA, PER_FINI, PER_FFIN
    FROM dbo.NO_PERIOD
    WHERE COD_EMPR = @codEmpr
      AND PER_EST = 'A'
      AND ACT_ESTA = 'A'
      AND CONVERT(date, GETDATE()) BETWEEN PER_FINI AND PER_FFIN
    ORDER BY PER_FINI DESC
  `;
  const r = await executeQuery(q, { codEmpr });
  return r.recordset && r.recordset[0] ? r.recordset[0] : null;
}

/**
 * Resuelve COD_FUNCI a partir de una cédula (NUM_IDEN en GN_TERCE).
 */
async function resolverCodFunciPorCedula(cedula, codEmpr = DEFAULT_COD_EMPR) {
  const q = `
    SELECT TOP 1 f.COD_FUNCI
    FROM dbo.GN_FUNCI f
    INNER JOIN dbo.GN_TERCE t
            ON t.COD_TERC = f.COD_TERC
    WHERE f.COD_EMPR = @codEmpr
      AND t.NUM_IDEN = CAST(@cedula AS BIGINT)
      AND t.ACT_ESTA = 'A'
      AND f.ACT_ESTA = 'A'
  `;
  const r = await executeQuery(q, { codEmpr, cedula: String(cedula).trim() });
  return r.recordset && r.recordset[0] ? r.recordset[0].COD_FUNCI : null;
}

// ===========================================================================
// GET /api/ocasionales/periodo-actual
// ===========================================================================
async function obtenerPeriodoActual(req, res) {
  try {
    const codEmpr = Number(req.query.codEmpr) || DEFAULT_COD_EMPR;
    const periodo = await resolverPeriodoActual(codEmpr);
    if (!periodo) {
      return res.status(404).json({
        error: 'No hay período activo para la fecha actual.',
        hint: 'Crea o activa una fila en NO_PERIOD cuyo rango incluya hoy.'
      });
    }
    res.json({
      codEmpr,
      codPeriod: periodo.COD_PERIOD,
      anio: periodo.PER_ANO,
      mes: periodo.PER_MES,
      quincena: periodo.PER_QNA,
      fechaInicio: periodo.PER_FINI,
      fechaFin: periodo.PER_FFIN,
      etiqueta: `${periodo.PER_ANO}-${String(periodo.PER_MES).padStart(2, '0')}-Q${periodo.PER_QNA}`
    });
  } catch (err) {
    console.error('[ocasionales] periodo-actual error:', err);
    res.status(500).json({ error: 'Error resolviendo período actual', details: err.message });
  }
}

// ===========================================================================
// GET /api/ocasionales?codPeriod=7
// Lista registros del período indicado (default = período vigente por fecha).
// ===========================================================================
async function listarOcasionales(req, res) {
  try {
    const codEmpr = Number(req.query.codEmpr) || DEFAULT_COD_EMPR;
    let codPeriod = req.query.codPeriod ? Number(req.query.codPeriod) : null;

    if (!codPeriod) {
      const p = await resolverPeriodoActual(codEmpr);
      if (!p) return res.json({ codPeriod: null, registros: [] });
      codPeriod = p.COD_PERIOD;
    }

    const q = `
      SELECT
        COD_EMPR, COD_NOVED, COD_FUNCI, COD_CONC, COD_PERIOD,
        CEDULA, NOMBRE, NOM_CONC, TIP_CONC, TIP_NATU,
        CANTIDAD, VALOR, OBS_NOVED,
        FEC_REGI, FEC_INI, FEC_FIN,
        IND_APLICADO, ACT_USUA, ACT_HORA, ACT_ESTA,
        PER_ANO, PER_MES, PER_QNA, PER_FINI, PER_FFIN
      FROM dbo.vw_NO_OCASI_PERIODO
      WHERE COD_EMPR = @codEmpr
        AND COD_PERIOD = @codPeriod
      ORDER BY ACT_HORA DESC
    `;
    const r = await executeQuery(q, { codEmpr, codPeriod });
    res.json({ codEmpr, codPeriod, registros: r.recordset || [] });
  } catch (err) {
    console.error('[ocasionales] listar error:', err);
    res.status(500).json({ error: 'Error listando ocasionales', details: err.message });
  }
}

// ===========================================================================
// POST /api/ocasionales
// Body esperado (JSON):
//   { cedula, codConc, cantidad?, valor, observaciones?, codCcost?, usuario? }
// Flujo transaccional:
//   1. Resolver COD_PERIOD actual y COD_FUNCI desde cédula.
//   2. NEXT VALUE FOR SEQ_NO_NOVED -> COD_NOVED.
//   3. INSERT en NO_NOVED (cabecera).
//   4. INSERT en NO_OCASI (cantidad, valor).
//   5. COMMIT. Si algo falla -> ROLLBACK.
// ===========================================================================
async function crearOcasional(req, res) {
  const { cedula, codConc, cantidad, valor, observaciones, codCcost } = req.body;
  const codEmpr = Number(req.body.codEmpr) || DEFAULT_COD_EMPR;
  const usuario = getActUsua(req);

  if (!cedula || !codConc) {
    return res.status(400).json({ error: 'cedula y codConc son obligatorios.' });
  }
  // Regla: al menos uno de (cantidad, valor) debe venir con dato, según la
  // naturaleza del concepto (OPC_CANT / OPC_VALU en NO_CONCE).
  const hasCant = cantidad !== undefined && cantidad !== null && cantidad !== '';
  const hasVal  = valor    !== undefined && valor    !== null && valor    !== '';
  if (!hasCant && !hasVal) {
    return res.status(400).json({ error: 'Debes indicar Cantidad o Valor (al menos uno).' });
  }

  let transaction;
  try {
    const periodo = await resolverPeriodoActual(codEmpr);
    if (!periodo) {
      return res.status(409).json({
        error: 'No hay período activo (NO_PERIOD) que incluya la fecha de hoy.'
      });
    }
    const codFunci = await resolverCodFunciPorCedula(cedula, codEmpr);
    if (!codFunci) {
      return res.status(404).json({ error: `Empleado no encontrado para cédula ${cedula}.` });
    }

    const pool = await getConnection();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // 1) Insertar cabecera en NO_NOVED.
    //    COD_NOVED es IDENTITY -> lo omitimos y lo capturamos con SCOPE_IDENTITY().
    //    NOTA: NO_NOVED tiene triggers habilitados, lo que impide usar
    //    "OUTPUT INSERTED.COD_NOVED" sin INTO @tableVar. Usamos SCOPE_IDENTITY()
    //    que es compatible con triggers y devuelve el último IDENTITY generado
    //    en el ámbito actual (el mismo batch/request).
    const reqNov = new sql.Request(transaction);
    reqNov.input('codEmpr',    sql.SmallInt,      codEmpr);
    reqNov.input('codFunci',   sql.Int,           codFunci);
    reqNov.input('codConc',    sql.Int,           Number(codConc));
    reqNov.input('codPeriod',  sql.Int,           periodo.COD_PERIOD);
    reqNov.input('obs',        sql.NVarChar(500), observaciones || null);
    reqNov.input('actUsua',    sql.NVarChar(50),  usuario);
    reqNov.input('codCcost',   sql.Int,           codCcost || null);

    const novResult = await reqNov.query(`
      INSERT INTO dbo.NO_NOVED
        (COD_EMPR, COD_FUNCI, COD_CONC, COD_PERIOD,
         FEC_REGI, OBS_NOVED, IND_APLICADO, ACT_USUA, ACT_HORA, ACT_ESTA, COD_CCOST)
      VALUES
        (@codEmpr, @codFunci, @codConc, @codPeriod,
         CONVERT(date, GETDATE()), @obs, 'N', @actUsua, GETDATE(), 'A', @codCcost);
      SELECT CAST(SCOPE_IDENTITY() AS INT) AS COD_NOVED;
    `);

    if (!novResult.recordset || !novResult.recordset[0] || novResult.recordset[0].COD_NOVED == null) {
      throw new Error('NO_NOVED no devolvió COD_NOVED (SCOPE_IDENTITY nulo).');
    }
    const codNoved = novResult.recordset[0].COD_NOVED;

    // 3) Insertar especialización en NO_OCASI
    const reqOc = new sql.Request(transaction);
    reqOc.input('codEmpr',  sql.SmallInt,    codEmpr);
    reqOc.input('codNoved', sql.Int,         codNoved);
    reqOc.input('cantidad', sql.Decimal(18,4), cantidad !== undefined && cantidad !== null && cantidad !== '' ? Number(cantidad) : null);
    reqOc.input('valor',    sql.Decimal(18,2), Number(valor));
    reqOc.input('actUsua',  sql.NVarChar(50), usuario);

    await reqOc.query(`
      INSERT INTO dbo.NO_OCASI
        (COD_EMPR, COD_NOVED, CANTIDAD, VALOR, ACT_USUA, ACT_HORA, ACT_ESTA)
      VALUES
        (@codEmpr, @codNoved, @cantidad, @valor, @actUsua, SYSDATETIME(), 'A')
    `);

    await transaction.commit();
    res.json({
      success: true,
      codEmpr, codNoved, codFunci,
      codPeriod: periodo.COD_PERIOD,
      message: 'Ocasional registrado correctamente.'
    });
  } catch (err) {
    if (transaction) { try { await transaction.rollback(); } catch (_) {} }
    console.error('[ocasionales] crear error:', err);
    res.status(500).json({ error: 'Error creando ocasional', details: err.message });
  }
}

// ===========================================================================
// PUT /api/ocasionales/:codNoved
// Edita campos editables por acuerdo:
//   • NO_NOVED: COD_FUNCI (vía cédula), COD_CONC, OBS_NOVED
//   • NO_OCASI: CANTIDAD, VALOR
// COD_PERIOD NO se edita aquí (bloqueado por diseño). Si el registro pertenece
// al período equivocado, la política es anularlo y recrearlo.
// Body: { cedula?, codConc?, cantidad?, valor?, observaciones?, usuario? }
// ===========================================================================
async function actualizarOcasional(req, res) {
  const codEmpr = Number(req.query.codEmpr) || Number(req.body.codEmpr) || DEFAULT_COD_EMPR;
  const codNoved = Number(req.params.codNoved);
  const { cedula, codConc, cantidad, valor, observaciones } = req.body;
  const usuario = getActUsua(req);

  if (!codNoved) return res.status(400).json({ error: 'codNoved inválido.' });

  let transaction;
  try {
    // Si viene cédula, resolvemos COD_FUNCI ANTES de la transacción
    // (usamos la pool principal; falla rápida si no existe el empleado).
    let nuevoCodFunci = null;
    if (cedula !== undefined && cedula !== null && String(cedula).trim() !== '') {
      nuevoCodFunci = await resolverCodFunciPorCedula(cedula, codEmpr);
      if (!nuevoCodFunci) {
        return res.status(404).json({ error: `Empleado no encontrado para cédula ${cedula}.` });
      }
    }

    const pool = await getConnection();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // -------- NO_NOVED: COD_FUNCI, COD_CONC, OBS_NOVED --------
    const reqNov = new sql.Request(transaction);
    reqNov.input('codEmpr',   sql.SmallInt,      codEmpr);
    reqNov.input('codNoved',  sql.Int,           codNoved);
    reqNov.input('codFunci',  sql.Int,           nuevoCodFunci);  // null si no cambia
    reqNov.input('codConc',   sql.Int,           codConc !== undefined && codConc !== null && codConc !== '' ? Number(codConc) : null);
    reqNov.input('obs',       sql.NVarChar(500), observaciones !== undefined ? observaciones : null);
    reqNov.input('actUsua',   sql.NVarChar(50),  usuario);

    await reqNov.query(`
      UPDATE dbo.NO_NOVED
      SET COD_FUNCI = COALESCE(@codFunci, COD_FUNCI),
          COD_CONC  = COALESCE(@codConc,  COD_CONC),
          OBS_NOVED = COALESCE(@obs,      OBS_NOVED),
          ACT_USUA  = @actUsua,
          ACT_HORA  = GETDATE()
      WHERE COD_EMPR = @codEmpr AND COD_NOVED = @codNoved AND ACT_ESTA = 'A'
    `);

    // -------- NO_OCASI: CANTIDAD, VALOR --------
    const reqOc = new sql.Request(transaction);
    reqOc.input('codEmpr',  sql.SmallInt,      codEmpr);
    reqOc.input('codNoved', sql.Int,           codNoved);
    reqOc.input('cantidad', sql.Decimal(18,4), cantidad !== undefined && cantidad !== null && cantidad !== '' ? Number(cantidad) : null);
    reqOc.input('valor',    sql.Decimal(18,2), valor    !== undefined && valor    !== null && valor    !== '' ? Number(valor)    : null);
    reqOc.input('actUsua',  sql.NVarChar(50),  usuario);

    await reqOc.query(`
      UPDATE dbo.NO_OCASI
      SET CANTIDAD = COALESCE(@cantidad, CANTIDAD),
          VALOR    = COALESCE(@valor,    VALOR),
          ACT_USUA = @actUsua,
          ACT_HORA = SYSDATETIME()
      WHERE COD_EMPR = @codEmpr AND COD_NOVED = @codNoved AND ACT_ESTA = 'A'
    `);

    await transaction.commit();
    res.json({
      success: true,
      codEmpr,
      codNoved,
      nuevoCodFunci: nuevoCodFunci || undefined,
      message: 'Ocasional actualizado.'
    });
  } catch (err) {
    if (transaction) { try { await transaction.rollback(); } catch (_) {} }
    console.error('[ocasionales] actualizar error:', err);
    res.status(500).json({ error: 'Error actualizando ocasional', details: err.message });
  }
}

// ===========================================================================
// DELETE /api/ocasionales/batch
// Anulación lógica masiva: recibe { codNoveds: [1,2,3,...] } en el body.
// Ejecuta un UPDATE ... WHERE COD_NOVED IN (...) dentro de una transacción.
// Retorna cuántos registros se anularon efectivamente.
// ===========================================================================
async function anularOcasionalBatch(req, res) {
  const codEmpr  = Number(req.query.codEmpr) || DEFAULT_COD_EMPR;
  const usuario  = getActUsua(req);
  const { codNoveds } = req.body || {};

  if (!Array.isArray(codNoveds) || codNoveds.length === 0) {
    return res.status(400).json({ error: 'Se requiere un array codNoveds con al menos un elemento.' });
  }

  // Validar que todos los IDs sean enteros positivos
  const ids = codNoveds.map(Number).filter(n => Number.isInteger(n) && n > 0);
  if (ids.length === 0) {
    return res.status(400).json({ error: 'Los codNoveds deben ser enteros positivos.' });
  }
  if (ids.length > 500) {
    return res.status(400).json({ error: 'No se pueden anular más de 500 registros en una sola operación.' });
  }

  let transaction;
  try {
    const pool = await getConnection();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // Construir parámetros TVP-style: @p0, @p1, ... para evitar SQL injection
    const paramNames = ids.map((_, i) => `@id${i}`).join(',');

    const reqNov = new sql.Request(transaction);
    reqNov.input('codEmpr',  sql.SmallInt,     codEmpr);
    reqNov.input('actUsua',  sql.NVarChar(50), usuario);
    ids.forEach((id, i) => reqNov.input(`id${i}`, sql.Int, id));
    const resNov = await reqNov.query(`
      UPDATE dbo.NO_NOVED
      SET ACT_ESTA = 'I', ACT_USUA = @actUsua, ACT_HORA = GETDATE()
      WHERE COD_EMPR = @codEmpr
        AND COD_NOVED IN (${paramNames})
        AND ACT_ESTA  = 'A'
    `);

    const reqOc = new sql.Request(transaction);
    reqOc.input('codEmpr',  sql.SmallInt,     codEmpr);
    reqOc.input('actUsua',  sql.NVarChar(50), usuario);
    ids.forEach((id, i) => reqOc.input(`id${i}`, sql.Int, id));
    await reqOc.query(`
      UPDATE dbo.NO_OCASI
      SET ACT_ESTA = 'I', ACT_USUA = @actUsua, ACT_HORA = SYSDATETIME()
      WHERE COD_EMPR = @codEmpr
        AND COD_NOVED IN (${paramNames})
        AND ACT_ESTA  = 'A'
    `);

    await transaction.commit();

    const anulados = resNov.rowsAffected[0] || 0;
    res.json({
      success: true,
      anulados,
      solicitados: ids.length,
      message: `${anulados} novedad(es) anulada(s) correctamente.`
    });
  } catch (err) {
    if (transaction) { try { await transaction.rollback(); } catch (_) {} }
    console.error('[ocasionales] anularBatch error:', err);
    res.status(500).json({ error: 'Error en anulación masiva', details: err.message });
  }
}

// DELETE /api/ocasionales/:codNoved
// Anulación lógica: ACT_ESTA = 'I' en NO_NOVED y NO_OCASI.
// La fila se conserva para trazabilidad histórica.
// ===========================================================================
async function anularOcasional(req, res) {
  const codEmpr = Number(req.query.codEmpr) || DEFAULT_COD_EMPR;
  const codNoved = Number(req.params.codNoved);
  const usuario = getActUsua(req);

  if (!codNoved) return res.status(400).json({ error: 'codNoved inválido.' });

  let transaction;
  try {
    const pool = await getConnection();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const reqNov = new sql.Request(transaction);
    reqNov.input('codEmpr',  sql.SmallInt,    codEmpr);
    reqNov.input('codNoved', sql.Int,         codNoved);
    reqNov.input('actUsua',  sql.NVarChar(50), usuario);
    await reqNov.query(`
      UPDATE dbo.NO_NOVED
      SET ACT_ESTA = 'I', ACT_USUA = @actUsua, ACT_HORA = GETDATE()
      WHERE COD_EMPR = @codEmpr AND COD_NOVED = @codNoved
    `);

    const reqOc = new sql.Request(transaction);
    reqOc.input('codEmpr',  sql.SmallInt,    codEmpr);
    reqOc.input('codNoved', sql.Int,         codNoved);
    reqOc.input('actUsua',  sql.NVarChar(50), usuario);
    await reqOc.query(`
      UPDATE dbo.NO_OCASI
      SET ACT_ESTA = 'I', ACT_USUA = @actUsua, ACT_HORA = SYSDATETIME()
      WHERE COD_EMPR = @codEmpr AND COD_NOVED = @codNoved
    `);

    await transaction.commit();
    res.json({ success: true, codEmpr, codNoved, message: 'Ocasional anulado.' });
  } catch (err) {
    if (transaction) { try { await transaction.rollback(); } catch (_) {} }
    console.error('[ocasionales] anular error:', err);
    res.status(500).json({ error: 'Error anulando ocasional', details: err.message });
  }
}

module.exports = {
  ensureDbObjects,
  obtenerPeriodoActual,
  listarOcasionales,
  crearOcasional,
  actualizarOcasional,
  anularOcasional,
  anularOcasionalBatch
};
