// ============================================================================
//  controllers/fijasController.js
//  Novedades FIJAS contra NO_NOVED + NO_FIJAS (convención MineDax).
//
//  Estrategia (espejo de ocasionalesController.js):
//    • NO_NOVED guarda la cabecera trazable (histórica, soft-delete).
//    • NO_FIJAS guarda la especialización: CANTIDAD, VALOR, FEC_INI, FEC_FIN,
//      APLICACION, NUM_CUOTAS, NUM_CUENTA.
//    • COD_NOVED = IDENTITY en NO_NOVED (se captura con SCOPE_IDENTITY()).
//    • El bootstrap es idempotente: crea las tablas NO_FIJAS y vistas si no
//      existen (igual que ocasionales crea su vista).
//
//  Endpoints:
//    GET    /api/fijas/periodo-actual
//    GET    /api/fijas                          (?codPeriod=)
//    GET    /api/fijas/conceptos                (TIP_NATU='FIJA')
//    POST   /api/fijas
//    PUT    /api/fijas/:codNoved
//    DELETE /api/fijas/:codNoved
// ============================================================================

const { executeQuery, getConnection } = require('../config/database');
const { getActUsua } = require('../config/userHelper');
const sql = require('mssql');

const DEFAULT_COD_EMPR = 1;

// ---------------------------------------------------------------------------
// Bootstrap idempotente: crea tabla NO_FIJAS y vista vw_NO_FIJAS_PERIODO.
// ---------------------------------------------------------------------------
let bootstrapped = false;
async function ensureDbObjects() {
  if (bootstrapped) return;
  try {
    // Tabla NO_FIJAS
    await executeQuery(`
      IF OBJECT_ID('dbo.NO_FIJAS', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.NO_FIJAS (
          COD_EMPR    SMALLINT       NOT NULL CONSTRAINT DF_NO_FIJAS_EMPR DEFAULT (1),
          COD_NOVED   INT            NOT NULL,
          CANTIDAD    DECIMAL(18, 4) NULL,
          VALOR       DECIMAL(18, 2) NULL,
          FEC_INI     DATE           NULL,
          FEC_FIN     DATE           NULL,
          APLICACION  NVARCHAR(30)   NULL,
          NUM_CUOTAS  INT            NULL,
          NUM_CUENTA  NVARCHAR(50)   NULL,
          ACT_USUA    NVARCHAR(50)   NOT NULL CONSTRAINT DF_NO_FIJAS_USUA DEFAULT (N'MineDax'),
          ACT_HORA    DATETIME2      NOT NULL CONSTRAINT DF_NO_FIJAS_HORA DEFAULT (SYSDATETIME()),
          ACT_ESTA    CHAR(1)        NOT NULL CONSTRAINT DF_NO_FIJAS_ESTA DEFAULT ('A'),
          CONSTRAINT PK_NO_FIJAS PRIMARY KEY CLUSTERED (COD_EMPR, COD_NOVED),
          CONSTRAINT FK_NO_FIJAS_NO_NOVED FOREIGN KEY (COD_EMPR, COD_NOVED)
              REFERENCES dbo.NO_NOVED (COD_EMPR, COD_NOVED)
        );
      END
    `);

    // Vista vw_NO_FIJAS_PERIODO
    await executeQuery(`
      IF OBJECT_ID('dbo.vw_NO_FIJAS_PERIODO', 'V') IS NULL
      BEGIN
        EXEC('
          CREATE VIEW dbo.vw_NO_FIJAS_PERIODO AS
          SELECT
            n.COD_EMPR, n.COD_NOVED, n.COD_FUNCI, n.COD_CONC, n.COD_PERIOD,
            n.COD_CCOST, n.FEC_REGI, n.OBS_NOVED, n.IND_APLICADO,
            n.ACT_USUA, n.ACT_HORA, n.ACT_ESTA,
            t.NUM_IDEN AS CEDULA, t.NOM_COMP AS NOMBRE,
            c.NOM_CONC, c.TIP_CONC, c.TIP_NATU,
            fj.CANTIDAD, fj.VALOR, fj.FEC_INI, fj.FEC_FIN,
            fj.APLICACION, fj.NUM_CUOTAS, fj.NUM_CUENTA,
            p.PER_ANO, p.PER_MES, p.PER_QNA, p.PER_FINI, p.PER_FFIN
          FROM dbo.NO_NOVED n
          INNER JOIN dbo.NO_FIJAS fj
                 ON fj.COD_EMPR = n.COD_EMPR AND fj.COD_NOVED = n.COD_NOVED
          LEFT  JOIN dbo.GN_FUNCI f
                 ON f.COD_EMPR = n.COD_EMPR AND f.COD_FUNCI = n.COD_FUNCI
          LEFT  JOIN dbo.GN_TERCE t ON t.COD_TERC = f.COD_TERC
          LEFT  JOIN dbo.NO_CONCE c
                 ON c.COD_EMPR = n.COD_EMPR AND c.COD_CONC = n.COD_CONC
          LEFT  JOIN dbo.NO_PERIOD p
                 ON p.COD_EMPR = n.COD_EMPR AND p.COD_PERIOD = n.COD_PERIOD
          WHERE n.ACT_ESTA = ''A'' AND fj.ACT_ESTA = ''A''
        ');
      END
    `);

    bootstrapped = true;
    console.log('[fijas] ✓ NO_FIJAS + vw_NO_FIJAS_PERIODO listas.');
  } catch (err) {
    console.error('[fijas] ✗ Error en bootstrap DB:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Helpers (reutilizamos el mismo patrón de ocasionalesController)
// ---------------------------------------------------------------------------
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

async function resolverCodFunciPorCedula(cedula, codEmpr = DEFAULT_COD_EMPR) {
  const q = `
    SELECT TOP 1 f.COD_FUNCI
    FROM dbo.GN_FUNCI f
    INNER JOIN dbo.GN_TERCE t ON t.COD_TERC = f.COD_TERC
    WHERE f.COD_EMPR = @codEmpr
      AND t.NUM_IDEN = CAST(@cedula AS BIGINT)
      AND t.ACT_ESTA = 'A'
      AND f.ACT_ESTA = 'A'
  `;
  const r = await executeQuery(q, { codEmpr, cedula: String(cedula).trim() });
  return r.recordset && r.recordset[0] ? r.recordset[0].COD_FUNCI : null;
}

// ===========================================================================
// GET /api/fijas/periodo-actual
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
    console.error('[fijas] periodo-actual error:', err);
    res.status(500).json({ error: 'Error resolviendo período actual', details: err.message });
  }
}

// ===========================================================================
// GET /api/fijas/conceptos
// Lista conceptos con TIP_NATU = 'FIJA' activos. Se usa para poblar el select.
// ===========================================================================
async function listarConceptos(req, res) {
  try {
    const r = await executeQuery(`
      SELECT COD_CONC AS codigo, COD_INTE AS codigoInterno,
             NOM_CONC AS nombre, TIP_CONC AS tipo
      FROM dbo.NO_CONCE
      WHERE TIP_NATU = 'FIJA' AND ACT_ESTA = 'A'
      ORDER BY NOM_CONC ASC
    `);
    res.json(r.recordset || []);
  } catch (err) {
    console.error('[fijas] conceptos error:', err);
    res.status(500).json({ error: 'Error listando conceptos de fijas', details: err.message });
  }
}

// ===========================================================================
// GET /api/fijas?codPeriod=7
// ===========================================================================
async function listarFijas(req, res) {
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
        CANTIDAD, VALOR, FEC_INI, FEC_FIN, APLICACION, NUM_CUOTAS, NUM_CUENTA,
        OBS_NOVED, FEC_REGI, IND_APLICADO,
        ACT_USUA, ACT_HORA, ACT_ESTA,
        PER_ANO, PER_MES, PER_QNA, PER_FINI, PER_FFIN
      FROM dbo.vw_NO_FIJAS_PERIODO
      WHERE COD_EMPR = @codEmpr
        AND COD_PERIOD = @codPeriod
      ORDER BY ACT_HORA DESC
    `;
    const r = await executeQuery(q, { codEmpr, codPeriod });
    res.json({ codEmpr, codPeriod, registros: r.recordset || [] });
  } catch (err) {
    console.error('[fijas] listar error:', err);
    res.status(500).json({ error: 'Error listando fijas', details: err.message });
  }
}

// ===========================================================================
// POST /api/fijas
// Body: { cedula, codConc, cantidad?, valor, fecIni?, fecFin?, aplicacion?,
//         numCuotas?, numCuenta?, observaciones?, usuario? }
// ===========================================================================
async function crearFija(req, res) {
  const {
    cedula, codConc, cantidad, valor, fecIni, fecFin,
    aplicacion, numCuotas, numCuenta, observaciones
  } = req.body;
  const usuario = getActUsua(req);
  const codEmpr = Number(req.body.codEmpr) || DEFAULT_COD_EMPR;

  if (!cedula || !codConc) {
    return res.status(400).json({ error: 'cedula y codConc son obligatorios.' });
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

    // Cabecera NO_NOVED
    const reqNov = new sql.Request(transaction);
    reqNov.input('codEmpr',   sql.SmallInt,      codEmpr);
    reqNov.input('codFunci',  sql.Int,           codFunci);
    reqNov.input('codConc',   sql.Int,           Number(codConc));
    reqNov.input('codPeriod', sql.Int,           periodo.COD_PERIOD);
    reqNov.input('obs',       sql.NVarChar(500), observaciones || null);
    reqNov.input('actUsua',   sql.NVarChar(50),  usuario);
    reqNov.input('fecIni',    sql.Date,          fecIni || null);
    reqNov.input('fecFin',    sql.Date,          fecFin || null);

    const novResult = await reqNov.query(`
      INSERT INTO dbo.NO_NOVED
        (COD_EMPR, COD_FUNCI, COD_CONC, COD_PERIOD,
         FEC_REGI, OBS_NOVED, IND_APLICADO, ACT_USUA, ACT_HORA, ACT_ESTA,
         FEC_INI, FEC_FIN)
      VALUES
        (@codEmpr, @codFunci, @codConc, @codPeriod,
         CONVERT(date, GETDATE()), @obs, 'N', @actUsua, GETDATE(), 'A',
         @fecIni, @fecFin);
      SELECT CAST(SCOPE_IDENTITY() AS INT) AS COD_NOVED;
    `);

    if (!novResult.recordset || !novResult.recordset[0] || novResult.recordset[0].COD_NOVED == null) {
      throw new Error('NO_NOVED no devolvió COD_NOVED (SCOPE_IDENTITY nulo).');
    }
    const codNoved = novResult.recordset[0].COD_NOVED;

    // Especialización NO_FIJAS
    const reqFj = new sql.Request(transaction);
    reqFj.input('codEmpr',    sql.SmallInt,       codEmpr);
    reqFj.input('codNoved',   sql.Int,            codNoved);
    reqFj.input('cantidad',   sql.Decimal(18, 4), cantidad !== undefined && cantidad !== null && cantidad !== '' ? Number(cantidad) : null);
    reqFj.input('valor',      sql.Decimal(18, 2), valor    !== undefined && valor    !== null && valor    !== '' ? Number(valor)    : null);
    reqFj.input('fecIni',     sql.Date,           fecIni || null);
    reqFj.input('fecFin',     sql.Date,           fecFin || null);
    reqFj.input('aplicacion', sql.NVarChar(30),   aplicacion || null);
    reqFj.input('numCuotas',  sql.Int,            numCuotas !== undefined && numCuotas !== null && numCuotas !== '' ? Number(numCuotas) : null);
    reqFj.input('numCuenta',  sql.NVarChar(50),   numCuenta || null);
    reqFj.input('actUsua',    sql.NVarChar(50),   usuario);

    await reqFj.query(`
      INSERT INTO dbo.NO_FIJAS
        (COD_EMPR, COD_NOVED, CANTIDAD, VALOR, FEC_INI, FEC_FIN,
         APLICACION, NUM_CUOTAS, NUM_CUENTA, ACT_USUA, ACT_HORA, ACT_ESTA)
      VALUES
        (@codEmpr, @codNoved, @cantidad, @valor, @fecIni, @fecFin,
         @aplicacion, @numCuotas, @numCuenta, @actUsua, SYSDATETIME(), 'A')
    `);

    await transaction.commit();
    res.json({
      success: true,
      codEmpr, codNoved, codFunci,
      codPeriod: periodo.COD_PERIOD,
      message: 'Fija registrada correctamente.'
    });
  } catch (err) {
    if (transaction) { try { await transaction.rollback(); } catch (_) {} }
    console.error('[fijas] crear error:', err);
    res.status(500).json({ error: 'Error creando fija', details: err.message });
  }
}

// ===========================================================================
// PUT /api/fijas/:codNoved
// ===========================================================================
async function actualizarFija(req, res) {
  const codEmpr = Number(req.query.codEmpr) || Number(req.body.codEmpr) || DEFAULT_COD_EMPR;
  const codNoved = Number(req.params.codNoved);
  const {
    cedula, codConc, cantidad, valor, fecIni, fecFin,
    aplicacion, numCuotas, numCuenta, observaciones
  } = req.body;
  const usuario = getActUsua(req);

  if (!codNoved) return res.status(400).json({ error: 'codNoved inválido.' });

  let transaction;
  try {
    let nuevoCodFunci = null;
    if (cedula !== undefined && cedula !== null && String(cedula).trim() !== '') {
      nuevoCodFunci = await resolverCodFunciPorCedula(cedula, codEmpr);
      if (!nuevoCodFunci) {
        return res.status(404).json({ error: `Empleado con cédula ${cedula} no encontrado en el sistema. Verifique que esté activo.` });
      }
    }

    const pool = await getConnection();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    // NO_NOVED
    const reqNov = new sql.Request(transaction);
    reqNov.input('codEmpr',   sql.SmallInt,      codEmpr);
    reqNov.input('codNoved',  sql.Int,           codNoved);
    reqNov.input('codFunci',  sql.Int,           nuevoCodFunci);
    reqNov.input('codConc',   sql.Int,           codConc !== undefined && codConc !== null && codConc !== '' ? Number(codConc) : null);
    reqNov.input('obs',       sql.NVarChar(500), observaciones !== undefined ? observaciones : null);
    reqNov.input('fecIni',    sql.Date,          fecIni !== undefined ? (fecIni || null) : null);
    reqNov.input('fecFin',    sql.Date,          fecFin !== undefined ? (fecFin || null) : null);
    reqNov.input('actUsua',   sql.NVarChar(50),  usuario);

    await reqNov.query(`
      UPDATE dbo.NO_NOVED
      SET COD_FUNCI = COALESCE(@codFunci, COD_FUNCI),
          COD_CONC  = COALESCE(@codConc,  COD_CONC),
          OBS_NOVED = COALESCE(@obs,      OBS_NOVED),
          FEC_INI   = COALESCE(@fecIni,   FEC_INI),
          FEC_FIN   = COALESCE(@fecFin,   FEC_FIN),
          ACT_USUA  = @actUsua,
          ACT_HORA  = GETDATE()
      WHERE COD_EMPR = @codEmpr AND COD_NOVED = @codNoved AND ACT_ESTA = 'A'
    `);

    // NO_FIJAS
    const reqFj = new sql.Request(transaction);
    reqFj.input('codEmpr',    sql.SmallInt,       codEmpr);
    reqFj.input('codNoved',   sql.Int,            codNoved);
    reqFj.input('cantidad',   sql.Decimal(18, 4), cantidad   !== undefined && cantidad   !== null && cantidad   !== '' ? Number(cantidad)   : null);
    reqFj.input('valor',      sql.Decimal(18, 2), valor      !== undefined && valor      !== null && valor      !== '' ? Number(valor)      : null);
    reqFj.input('fecIni',     sql.Date,           fecIni     !== undefined ? (fecIni || null) : null);
    reqFj.input('fecFin',     sql.Date,           fecFin     !== undefined ? (fecFin || null) : null);
    reqFj.input('aplicacion', sql.NVarChar(30),   aplicacion !== undefined ? (aplicacion || null) : null);
    reqFj.input('numCuotas',  sql.Int,            numCuotas  !== undefined && numCuotas  !== null && numCuotas  !== '' ? Number(numCuotas)  : null);
    reqFj.input('numCuenta',  sql.NVarChar(50),   numCuenta  !== undefined ? (numCuenta || null) : null);
    reqFj.input('actUsua',    sql.NVarChar(50),   usuario);

    await reqFj.query(`
      UPDATE dbo.NO_FIJAS
      SET CANTIDAD   = COALESCE(@cantidad,   CANTIDAD),
          VALOR      = COALESCE(@valor,      VALOR),
          FEC_INI    = COALESCE(@fecIni,     FEC_INI),
          FEC_FIN    = COALESCE(@fecFin,     FEC_FIN),
          APLICACION = COALESCE(@aplicacion, APLICACION),
          NUM_CUOTAS = COALESCE(@numCuotas,  NUM_CUOTAS),
          NUM_CUENTA = COALESCE(@numCuenta,  NUM_CUENTA),
          ACT_USUA   = @actUsua,
          ACT_HORA   = SYSDATETIME()
      WHERE COD_EMPR = @codEmpr AND COD_NOVED = @codNoved AND ACT_ESTA = 'A'
    `);

    await transaction.commit();
    res.json({ success: true, codEmpr, codNoved, message: 'Fija actualizada.' });
  } catch (err) {
    if (transaction) { try { await transaction.rollback(); } catch (_) {} }
    console.error('[fijas] actualizar error:', err);
    res.status(500).json({ error: 'Error actualizando fija', details: err.message });
  }
}

// ===========================================================================
// DELETE /api/fijas/:codNoved (anulación lógica)
// ===========================================================================
async function anularFija(req, res) {
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

    const reqFj = new sql.Request(transaction);
    reqFj.input('codEmpr',  sql.SmallInt,    codEmpr);
    reqFj.input('codNoved', sql.Int,         codNoved);
    reqFj.input('actUsua',  sql.NVarChar(50), usuario);
    await reqFj.query(`
      UPDATE dbo.NO_FIJAS
      SET ACT_ESTA = 'I', ACT_USUA = @actUsua, ACT_HORA = SYSDATETIME()
      WHERE COD_EMPR = @codEmpr AND COD_NOVED = @codNoved
    `);

    await transaction.commit();
    res.json({ success: true, codEmpr, codNoved, message: 'Fija anulada.' });
  } catch (err) {
    if (transaction) { try { await transaction.rollback(); } catch (_) {} }
    console.error('[fijas] anular error:', err);
    res.status(500).json({ error: 'Error anulando fija', details: err.message });
  }
}

// POST /api/fijas/anular-batch
// Anulación lógica masiva: body { codNoveds: [1,2,...] }
async function anularFijaBatch(req, res) {
  const codEmpr  = Number(req.query.codEmpr) || DEFAULT_COD_EMPR;
  const usuario  = getActUsua(req);
  const { codNoveds } = req.body || {};

  if (!Array.isArray(codNoveds) || codNoveds.length === 0)
    return res.status(400).json({ error: 'Se requiere un array codNoveds con al menos un elemento.' });

  const ids = codNoveds.map(Number).filter(n => Number.isInteger(n) && n > 0);
  if (ids.length === 0)
    return res.status(400).json({ error: 'Los codNoveds deben ser enteros positivos.' });
  if (ids.length > 500)
    return res.status(400).json({ error: 'No se pueden anular más de 500 registros a la vez.' });

  let transaction;
  try {
    const pool = await getConnection();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const paramNames = ids.map((_, i) => `@id${i}`).join(',');

    const reqNov = new sql.Request(transaction);
    reqNov.input('codEmpr', sql.SmallInt, codEmpr);
    reqNov.input('actUsua', sql.NVarChar(50), usuario);
    ids.forEach((id, i) => reqNov.input(`id${i}`, sql.Int, id));
    const resNov = await reqNov.query(`
      UPDATE dbo.NO_NOVED SET ACT_ESTA='I', ACT_USUA=@actUsua, ACT_HORA=GETDATE()
      WHERE COD_EMPR=@codEmpr AND COD_NOVED IN (${paramNames}) AND ACT_ESTA='A'
    `);

    const reqFj = new sql.Request(transaction);
    reqFj.input('codEmpr', sql.SmallInt, codEmpr);
    reqFj.input('actUsua', sql.NVarChar(50), usuario);
    ids.forEach((id, i) => reqFj.input(`id${i}`, sql.Int, id));
    await reqFj.query(`
      UPDATE dbo.NO_FIJAS SET ACT_ESTA='I', ACT_USUA=@actUsua, ACT_HORA=SYSDATETIME()
      WHERE COD_EMPR=@codEmpr AND COD_NOVED IN (${paramNames}) AND ACT_ESTA='A'
    `);

    await transaction.commit();
    const anulados = resNov.rowsAffected[0] || 0;
    res.json({ success: true, anulados, solicitados: ids.length, message: `${anulados} fija(s) anulada(s).` });
  } catch (err) {
    if (transaction) { try { await transaction.rollback(); } catch (_) {} }
    console.error('[fijas] anularBatch error:', err);
    res.status(500).json({ error: 'Error en anulación masiva de fijas', details: err.message });
  }
}

module.exports = {
  ensureDbObjects,
  obtenerPeriodoActual,
  listarConceptos,
  listarFijas,
  crearFija,
  actualizarFija,
  anularFija,
  anularFijaBatch
};
