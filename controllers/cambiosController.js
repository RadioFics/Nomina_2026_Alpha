// ============================================================================
//  controllers/cambiosController.js
//  Novedades CAMBIOS contra NO_NOVED + NO_CAMBI.
//
//  Estrategia (espejo de ocasionalesController.js):
//    • NO_NOVED guarda la cabecera trazable (histórica, soft-delete).
//    • NO_CAMBI guarda la especialización: FEC_INI, VALOR_NUEVO, VALOR_ANTE.
//
//  Endpoints:
//    GET    /api/cambios/periodo-actual
//    GET    /api/cambios                        (?codPeriod=)
//    GET    /api/cambios/conceptos              (TIP_NATU='CAMBIO')
//    POST   /api/cambios
//    PUT    /api/cambios/:codNoved
//    DELETE /api/cambios/:codNoved
// ============================================================================

const { executeQuery, getConnection } = require('../config/database');
const sql = require('mssql');

const DEFAULT_COD_EMPR = 1;

let bootstrapped = false;
async function ensureDbObjects() {
  if (bootstrapped) return;
  try {
    await executeQuery(`
      IF OBJECT_ID('dbo.NO_CAMBI', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.NO_CAMBI (
          COD_EMPR    SMALLINT      NOT NULL CONSTRAINT DF_NO_CAMBI_EMPR DEFAULT (1),
          COD_NOVED   INT           NOT NULL,
          FEC_INI     DATE          NOT NULL,
          VALOR_NUEVO NVARCHAR(300) NULL,
          VALOR_ANTE  NVARCHAR(300) NULL,
          ACT_USUA    NVARCHAR(50)  NOT NULL CONSTRAINT DF_NO_CAMBI_USUA DEFAULT (N'MineDax'),
          ACT_HORA    DATETIME2     NOT NULL CONSTRAINT DF_NO_CAMBI_HORA DEFAULT (SYSDATETIME()),
          ACT_ESTA    CHAR(1)       NOT NULL CONSTRAINT DF_NO_CAMBI_ESTA DEFAULT ('A'),
          CONSTRAINT PK_NO_CAMBI PRIMARY KEY CLUSTERED (COD_EMPR, COD_NOVED),
          CONSTRAINT FK_NO_CAMBI_NO_NOVED FOREIGN KEY (COD_EMPR, COD_NOVED)
              REFERENCES dbo.NO_NOVED (COD_EMPR, COD_NOVED)
        );
      END
    `);

    await executeQuery(`
      IF OBJECT_ID('dbo.vw_NO_CAMBI_PERIODO', 'V') IS NULL
      BEGIN
        EXEC('
          CREATE VIEW dbo.vw_NO_CAMBI_PERIODO AS
          SELECT
            n.COD_EMPR, n.COD_NOVED, n.COD_FUNCI, n.COD_CONC, n.COD_PERIOD,
            n.COD_CCOST, n.FEC_REGI, n.OBS_NOVED, n.IND_APLICADO,
            n.ACT_USUA, n.ACT_HORA, n.ACT_ESTA,
            t.NUM_IDEN AS CEDULA, t.NOM_COMP AS NOMBRE,
            c.NOM_CONC, c.TIP_CONC, c.TIP_NATU,
            cb.FEC_INI, cb.VALOR_NUEVO, cb.VALOR_ANTE,
            p.PER_ANO, p.PER_MES, p.PER_QNA, p.PER_FINI, p.PER_FFIN
          FROM dbo.NO_NOVED n
          INNER JOIN dbo.NO_CAMBI cb
                 ON cb.COD_EMPR = n.COD_EMPR AND cb.COD_NOVED = n.COD_NOVED
          LEFT  JOIN dbo.GN_FUNCI f
                 ON f.COD_EMPR = n.COD_EMPR AND f.COD_FUNCI = n.COD_FUNCI
          LEFT  JOIN dbo.GN_TERCE t ON t.COD_TERC = f.COD_TERC
          LEFT  JOIN dbo.NO_CONCE c
                 ON c.COD_EMPR = n.COD_EMPR AND c.COD_CONC = n.COD_CONC
          LEFT  JOIN dbo.NO_PERIOD p
                 ON p.COD_EMPR = n.COD_EMPR AND p.COD_PERIOD = n.COD_PERIOD
          WHERE n.ACT_ESTA = ''A'' AND cb.ACT_ESTA = ''A''
        ');
      END
    `);

    bootstrapped = true;
    console.log('[cambios] ✓ NO_CAMBI + vw_NO_CAMBI_PERIODO listas.');
  } catch (err) {
    console.error('[cambios] ✗ Error en bootstrap DB:', err.message);
  }
}

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
// GET /api/cambios/periodo-actual
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
    console.error('[cambios] periodo-actual error:', err);
    res.status(500).json({ error: 'Error resolviendo período actual', details: err.message });
  }
}

// ===========================================================================
// GET /api/cambios/conceptos
// ===========================================================================
async function listarConceptos(req, res) {
  try {
    const r = await executeQuery(`
      SELECT COD_CONC AS codigo, COD_INTE AS codigoInterno,
             NOM_CONC AS nombre, TIP_CONC AS tipo
      FROM dbo.NO_CONCE
      WHERE TIP_NATU = 'CAMBIO' AND ACT_ESTA = 'A'
      ORDER BY NOM_CONC ASC
    `);
    res.json(r.recordset || []);
  } catch (err) {
    console.error('[cambios] conceptos error:', err);
    res.status(500).json({ error: 'Error listando conceptos de cambios', details: err.message });
  }
}

// ===========================================================================
// GET /api/cambios?codPeriod=7
// ===========================================================================
async function listarCambios(req, res) {
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
        FEC_INI, VALOR_NUEVO, VALOR_ANTE,
        OBS_NOVED, FEC_REGI, IND_APLICADO,
        ACT_USUA, ACT_HORA, ACT_ESTA,
        PER_ANO, PER_MES, PER_QNA, PER_FINI, PER_FFIN
      FROM dbo.vw_NO_CAMBI_PERIODO
      WHERE COD_EMPR = @codEmpr
        AND COD_PERIOD = @codPeriod
      ORDER BY ACT_HORA DESC
    `;
    const r = await executeQuery(q, { codEmpr, codPeriod });
    res.json({ codEmpr, codPeriod, registros: r.recordset || [] });
  } catch (err) {
    console.error('[cambios] listar error:', err);
    res.status(500).json({ error: 'Error listando cambios', details: err.message });
  }
}

// ===========================================================================
// POST /api/cambios
// Body: { cedula, codConc, fecIni, valorNuevo?, valorAnte?, observaciones?, usuario? }
// ===========================================================================
async function crearCambio(req, res) {
  const {
    cedula, codConc, fecIni, valorNuevo, valorAnte, observaciones, usuario
  } = req.body;
  const codEmpr = Number(req.body.codEmpr) || DEFAULT_COD_EMPR;

  if (!cedula || !codConc) {
    return res.status(400).json({ error: 'cedula y codConc son obligatorios.' });
  }
  if (!fecIni) {
    return res.status(400).json({ error: 'fecIni es obligatoria para cambios.' });
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

    const reqNov = new sql.Request(transaction);
    reqNov.input('codEmpr',   sql.SmallInt,      codEmpr);
    reqNov.input('codFunci',  sql.Int,           codFunci);
    reqNov.input('codConc',   sql.Int,           Number(codConc));
    reqNov.input('codPeriod', sql.Int,           periodo.COD_PERIOD);
    reqNov.input('obs',       sql.NVarChar(500), observaciones || null);
    reqNov.input('actUsua',   sql.NVarChar(50),  usuario || 'MineDax');
    reqNov.input('fecIni',    sql.Date,          fecIni);

    const novResult = await reqNov.query(`
      INSERT INTO dbo.NO_NOVED
        (COD_EMPR, COD_FUNCI, COD_CONC, COD_PERIOD,
         FEC_REGI, OBS_NOVED, IND_APLICADO, ACT_USUA, ACT_HORA, ACT_ESTA,
         FEC_INI)
      VALUES
        (@codEmpr, @codFunci, @codConc, @codPeriod,
         CONVERT(date, GETDATE()), @obs, 'N', @actUsua, GETDATE(), 'A',
         @fecIni);
      SELECT CAST(SCOPE_IDENTITY() AS INT) AS COD_NOVED;
    `);

    if (!novResult.recordset || !novResult.recordset[0] || novResult.recordset[0].COD_NOVED == null) {
      throw new Error('NO_NOVED no devolvió COD_NOVED (SCOPE_IDENTITY nulo).');
    }
    const codNoved = novResult.recordset[0].COD_NOVED;

    const reqCb = new sql.Request(transaction);
    reqCb.input('codEmpr',    sql.SmallInt,      codEmpr);
    reqCb.input('codNoved',   sql.Int,           codNoved);
    reqCb.input('fecIni',     sql.Date,          fecIni);
    reqCb.input('valorNuevo', sql.NVarChar(300), valorNuevo || null);
    reqCb.input('valorAnte',  sql.NVarChar(300), valorAnte || null);
    reqCb.input('actUsua',    sql.NVarChar(50),  usuario || 'MineDax');

    await reqCb.query(`
      INSERT INTO dbo.NO_CAMBI
        (COD_EMPR, COD_NOVED, FEC_INI, VALOR_NUEVO, VALOR_ANTE,
         ACT_USUA, ACT_HORA, ACT_ESTA)
      VALUES
        (@codEmpr, @codNoved, @fecIni, @valorNuevo, @valorAnte,
         @actUsua, SYSDATETIME(), 'A')
    `);

    await transaction.commit();
    res.json({
      success: true,
      codEmpr, codNoved, codFunci,
      codPeriod: periodo.COD_PERIOD,
      message: 'Cambio registrado correctamente.'
    });
  } catch (err) {
    if (transaction) { try { await transaction.rollback(); } catch (_) {} }
    console.error('[cambios] crear error:', err);
    res.status(500).json({ error: 'Error creando cambio', details: err.message });
  }
}

// ===========================================================================
// PUT /api/cambios/:codNoved
// ===========================================================================
async function actualizarCambio(req, res) {
  const codEmpr = Number(req.query.codEmpr) || Number(req.body.codEmpr) || DEFAULT_COD_EMPR;
  const codNoved = Number(req.params.codNoved);
  const { cedula, codConc, fecIni, valorNuevo, valorAnte, observaciones, usuario } = req.body;

  if (!codNoved) return res.status(400).json({ error: 'codNoved inválido.' });

  let transaction;
  try {
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

    const reqNov = new sql.Request(transaction);
    reqNov.input('codEmpr',   sql.SmallInt,      codEmpr);
    reqNov.input('codNoved',  sql.Int,           codNoved);
    reqNov.input('codFunci',  sql.Int,           nuevoCodFunci);
    reqNov.input('codConc',   sql.Int,           codConc !== undefined && codConc !== null && codConc !== '' ? Number(codConc) : null);
    reqNov.input('obs',       sql.NVarChar(500), observaciones !== undefined ? observaciones : null);
    reqNov.input('fecIni',    sql.Date,          fecIni || null);
    reqNov.input('actUsua',   sql.NVarChar(50),  usuario || 'MineDax');

    await reqNov.query(`
      UPDATE dbo.NO_NOVED
      SET COD_FUNCI = COALESCE(@codFunci, COD_FUNCI),
          COD_CONC  = COALESCE(@codConc,  COD_CONC),
          OBS_NOVED = COALESCE(@obs,      OBS_NOVED),
          FEC_INI   = COALESCE(@fecIni,   FEC_INI),
          ACT_USUA  = @actUsua,
          ACT_HORA  = GETDATE()
      WHERE COD_EMPR = @codEmpr AND COD_NOVED = @codNoved AND ACT_ESTA = 'A'
    `);

    const reqCb = new sql.Request(transaction);
    reqCb.input('codEmpr',    sql.SmallInt,      codEmpr);
    reqCb.input('codNoved',   sql.Int,           codNoved);
    reqCb.input('fecIni',     sql.Date,          fecIni || null);
    reqCb.input('valorNuevo', sql.NVarChar(300), valorNuevo !== undefined ? (valorNuevo || null) : null);
    reqCb.input('valorAnte',  sql.NVarChar(300), valorAnte  !== undefined ? (valorAnte  || null) : null);
    reqCb.input('actUsua',    sql.NVarChar(50),  usuario || 'MineDax');

    await reqCb.query(`
      UPDATE dbo.NO_CAMBI
      SET FEC_INI     = COALESCE(@fecIni,     FEC_INI),
          VALOR_NUEVO = COALESCE(@valorNuevo, VALOR_NUEVO),
          VALOR_ANTE  = COALESCE(@valorAnte,  VALOR_ANTE),
          ACT_USUA    = @actUsua,
          ACT_HORA    = SYSDATETIME()
      WHERE COD_EMPR = @codEmpr AND COD_NOVED = @codNoved AND ACT_ESTA = 'A'
    `);

    await transaction.commit();
    res.json({ success: true, codEmpr, codNoved, message: 'Cambio actualizado.' });
  } catch (err) {
    if (transaction) { try { await transaction.rollback(); } catch (_) {} }
    console.error('[cambios] actualizar error:', err);
    res.status(500).json({ error: 'Error actualizando cambio', details: err.message });
  }
}

// ===========================================================================
// DELETE /api/cambios/:codNoved
// ===========================================================================
async function anularCambio(req, res) {
  const codEmpr = Number(req.query.codEmpr) || DEFAULT_COD_EMPR;
  const codNoved = Number(req.params.codNoved);
  const usuario = req.body && req.body.usuario ? req.body.usuario : 'MineDax';

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

    const reqCb = new sql.Request(transaction);
    reqCb.input('codEmpr',  sql.SmallInt,    codEmpr);
    reqCb.input('codNoved', sql.Int,         codNoved);
    reqCb.input('actUsua',  sql.NVarChar(50), usuario);
    await reqCb.query(`
      UPDATE dbo.NO_CAMBI
      SET ACT_ESTA = 'I', ACT_USUA = @actUsua, ACT_HORA = SYSDATETIME()
      WHERE COD_EMPR = @codEmpr AND COD_NOVED = @codNoved
    `);

    await transaction.commit();
    res.json({ success: true, codEmpr, codNoved, message: 'Cambio anulado.' });
  } catch (err) {
    if (transaction) { try { await transaction.rollback(); } catch (_) {} }
    console.error('[cambios] anular error:', err);
    res.status(500).json({ error: 'Error anulando cambio', details: err.message });
  }
}

module.exports = {
  ensureDbObjects,
  obtenerPeriodoActual,
  listarConceptos,
  listarCambios,
  crearCambio,
  actualizarCambio,
  anularCambio
};
