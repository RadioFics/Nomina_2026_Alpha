// ============================================================================
//  controllers/ausentismosController.js
//  Novedades AUSENTISMOS contra NO_NOVED + NO_AUSEN.
//
//  Estrategia (espejo de ocasionalesController.js):
//    • NO_NOVED guarda la cabecera trazable (histórica, soft-delete).
//    • NO_AUSEN guarda la especialización: FEC_INI, FEC_FIN, DIAS_TOTAL,
//      DIAGNOSTICO (CIE-10), FEC_PRORRG.
//
//  Endpoints:
//    GET    /api/ausentismos/periodo-actual
//    GET    /api/ausentismos                    (?codPeriod=)
//    GET    /api/ausentismos/conceptos          (TIP_NATU='AUSENTISMO')
//    POST   /api/ausentismos
//    PUT    /api/ausentismos/:codNoved
//    DELETE /api/ausentismos/:codNoved
// ============================================================================

const { executeQuery, getConnection } = require('../config/database');
const { getActUsua } = require('../config/userHelper');
const sql = require('mssql');

const DEFAULT_COD_EMPR = 1;

// ---------------------------------------------------------------------------
// Bootstrap idempotente: crea tabla NO_AUSEN y vista vw_NO_AUSEN_PERIODO.
// ---------------------------------------------------------------------------
let bootstrapped = false;
async function ensureDbObjects(force = false) {
  if (bootstrapped && !force) return;
  try {
    await executeQuery(`
      IF OBJECT_ID('dbo.NO_AUSEN', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.NO_AUSEN (
          COD_EMPR    SMALLINT     NOT NULL CONSTRAINT DF_NO_AUSEN_EMPR DEFAULT (1),
          COD_NOVED   INT          NOT NULL,
          FEC_INI     DATE         NOT NULL,
          FEC_FIN     DATE         NOT NULL,
          DIAS_TOTAL  INT          NULL,
          DIAGNOSTICO NVARCHAR(20) NULL,
          FEC_PRORRG  DATE         NULL,
          ACT_USUA    NVARCHAR(50) NOT NULL CONSTRAINT DF_NO_AUSEN_USUA DEFAULT (N'MineDax'),
          ACT_HORA    DATETIME2    NOT NULL CONSTRAINT DF_NO_AUSEN_HORA DEFAULT (SYSDATETIME()),
          ACT_ESTA    CHAR(1)      NOT NULL CONSTRAINT DF_NO_AUSEN_ESTA DEFAULT ('A'),
          CONSTRAINT PK_NO_AUSEN PRIMARY KEY CLUSTERED (COD_EMPR, COD_NOVED),
          CONSTRAINT FK_NO_AUSEN_NO_NOVED FOREIGN KEY (COD_EMPR, COD_NOVED)
              REFERENCES dbo.NO_NOVED (COD_EMPR, COD_NOVED),
          CONSTRAINT CK_NO_AUSEN_RANGO CHECK (FEC_FIN >= FEC_INI)
        );
      END
    `);

    // La vista usa LEFT JOIN para incluir registros de NO_NOVED con TIP_NATU='AUSENTISMO'
    // aunque no tengan todavía fila en NO_AUSEN (ej: permisos remunerados históricos).
    // Se usa CREATE OR ALTER (SQL Server 2016+) para mantener siempre la definición vigente.
    await executeQuery(`
      IF OBJECT_ID('dbo.vw_NO_AUSEN_PERIODO', 'V') IS NOT NULL
        DROP VIEW dbo.vw_NO_AUSEN_PERIODO;
    `);
    await executeQuery(`
      EXEC('
        CREATE VIEW dbo.vw_NO_AUSEN_PERIODO AS
        SELECT
          n.COD_EMPR, n.COD_NOVED, n.COD_FUNCI, n.COD_CONC, n.COD_PERIOD,
          n.COD_CCOST, n.FEC_REGI, n.OBS_NOVED, n.IND_APLICADO,
          n.ACT_USUA, n.ACT_HORA, n.ACT_ESTA,
          t.NUM_IDEN AS CEDULA, t.NOM_COMP AS NOMBRE,
          c.NOM_CONC, c.TIP_CONC, c.TIP_NATU,
          au.FEC_INI, au.FEC_FIN, au.DIAS_TOTAL, au.DIAGNOSTICO, au.FEC_PRORRG,
          p.PER_ANO, p.PER_MES, p.PER_QNA, p.PER_FINI, p.PER_FFIN
        FROM dbo.NO_NOVED n
        LEFT  JOIN dbo.NO_AUSEN au
               ON au.COD_EMPR = n.COD_EMPR AND au.COD_NOVED = n.COD_NOVED
               AND au.ACT_ESTA = ''A''
        LEFT  JOIN dbo.GN_FUNCI f
               ON f.COD_EMPR = n.COD_EMPR AND f.COD_FUNCI = n.COD_FUNCI
        LEFT  JOIN dbo.GN_TERCE t ON t.COD_TERC = f.COD_TERC
        LEFT  JOIN dbo.NO_CONCE c
               ON c.COD_EMPR = n.COD_EMPR AND c.COD_CONC = n.COD_CONC
        LEFT  JOIN dbo.NO_PERIOD p
               ON p.COD_EMPR = n.COD_EMPR AND p.COD_PERIOD = n.COD_PERIOD
        WHERE n.ACT_ESTA = ''A''
          AND c.TIP_NATU = ''AUSENTISMO''
      ');
    `);

    // Ajustar el trigger para permitir transiciones de estado A→I (archivar al cerrar
    // período) y A→E (eximir/cancelar) incluso en períodos ya cerrados.
    // Solo bloquea ediciones de contenido e inserciones nuevas en períodos cerrados.
    try {
      await executeQuery(`
        ALTER TRIGGER dbo.TR_NO_NOVED_PERIODO_CERRADO
        ON dbo.NO_NOVED
        AFTER INSERT, UPDATE, DELETE
        AS
        BEGIN
          SET NOCOUNT ON;
          -- Permitir A→I (archivar) y A→E (eximir) sin restricción de período.
          -- Ninguna de estas transiciones modifica datos de negocio.
          IF EXISTS (SELECT 1 FROM inserted)
            AND NOT EXISTS (SELECT 1 FROM inserted WHERE ACT_ESTA NOT IN ('I','E'))
            AND NOT EXISTS (SELECT 1 FROM deleted  WHERE ACT_ESTA <> 'A')
            RETURN;
          IF EXISTS (
            SELECT 1 FROM inserted i
            JOIN dbo.NO_PERIOD p ON p.COD_EMPR=i.COD_EMPR AND p.COD_PERIOD=i.COD_PERIOD
            WHERE p.PER_EST <> 'A'
            UNION ALL
            SELECT 1 FROM deleted d
            JOIN dbo.NO_PERIOD p ON p.COD_EMPR=d.COD_EMPR AND p.COD_PERIOD=d.COD_PERIOD
            WHERE p.PER_EST <> 'A'
          ) BEGIN
            RAISERROR('No se pueden modificar novedades de un periodo cuyo PER_EST <> ''A'' (cerrado/inactivo).', 16, 1);
            ROLLBACK TRANSACTION;
            RETURN;
          END
        END
      `);
      console.log('[ausentismos] ✓ Trigger TR_NO_NOVED_PERIODO_CERRADO actualizado (A/I/E).');
    } catch (e) {
      console.warn('[ausentismos] ⚠ Trigger no pudo actualizarse (requiere ALTER TABLE):', e.message);
    }

    // Migrar CK_NO_NOVED_ESTA para aceptar el estado 'E' (exento/cancelado).
    // Si la constraint ya tiene 'E' en su definición se omite silenciosamente.
    try {
      await executeQuery(`
        IF EXISTS (
          SELECT 1 FROM sys.check_constraints
          WHERE name = 'CK_NO_NOVED_ESTA'
            AND parent_object_id = OBJECT_ID('dbo.NO_NOVED')
            AND definition NOT LIKE N'%''E''%'
        )
        BEGIN
          ALTER TABLE dbo.NO_NOVED DROP CONSTRAINT CK_NO_NOVED_ESTA;
          ALTER TABLE dbo.NO_NOVED ADD CONSTRAINT CK_NO_NOVED_ESTA
            CHECK (ACT_ESTA IN ('A','I','E'));
        END
        ELSE IF NOT EXISTS (
          SELECT 1 FROM sys.check_constraints WHERE name = 'CK_NO_NOVED_ESTA'
        )
        BEGIN
          ALTER TABLE dbo.NO_NOVED ADD CONSTRAINT CK_NO_NOVED_ESTA
            CHECK (ACT_ESTA IN ('A','I','E'));
        END
      `);
      console.log('[ausentismos] ✓ CK_NO_NOVED_ESTA migrado a A/I/E.');
    } catch (e) {
      console.warn('[ausentismos] ⚠ No se pudo migrar CK_NO_NOVED_ESTA:', e.message);
    }

    bootstrapped = true;
    console.log('[ausentismos] ✓ NO_AUSEN + vw_NO_AUSEN_PERIODO listas.');
  } catch (err) {
    console.error('[ausentismos] ✗ Error en bootstrap DB:', err.message);
  }
}

// ---------------------------------------------------------------------------
// Helpers
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

/**
 * Resuelve el COD_PERIOD para CUALQUIER fecha (pasada, presente o futura),
 * sin filtrar por PER_EST. Permite asignar novedades retroactivas al período
 * correcto. En caso de solapamiento retorna el de menor COD_PERIOD.
 */
async function resolverPeriodoPorFecha(fecha, codEmpr = DEFAULT_COD_EMPR) {
  const q = `
    SELECT TOP 1 COD_PERIOD, PER_ANO, PER_MES, PER_QNA, PER_FINI, PER_FFIN, PER_EST
    FROM dbo.NO_PERIOD
    WHERE COD_EMPR = @codEmpr
      AND ACT_ESTA  = 'A'
      AND @fecha BETWEEN PER_FINI AND PER_FFIN
    ORDER BY COD_PERIOD ASC
  `;
  const r = await executeQuery(q, { codEmpr, fecha });
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

function calcDiasEntre(fIni, fFin) {
  if (!fIni || !fFin) return null;
  const d1 = new Date(fIni);
  const d2 = new Date(fFin);
  if (isNaN(d1) || isNaN(d2) || d2 < d1) return null;
  const ms = 1000 * 60 * 60 * 24;
  return Math.round((d2 - d1) / ms) + 1;
}

// ===========================================================================
// GET /api/ausentismos/periodo-actual
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
    console.error('[ausentismos] periodo-actual error:', err);
    res.status(500).json({ error: 'Error resolviendo período actual', details: err.message });
  }
}

// ===========================================================================
// GET /api/ausentismos/conceptos
// ===========================================================================
async function listarConceptos(req, res) {
  try {
    const r = await executeQuery(`
      SELECT COD_CONC AS codigo, COD_INTE AS codigoInterno,
             NOM_CONC AS nombre, TIP_CONC AS tipo
      FROM dbo.NO_CONCE
      WHERE TIP_NATU = 'AUSENTISMO' AND ACT_ESTA = 'A'
      ORDER BY NOM_CONC ASC
    `);
    res.json(r.recordset || []);
  } catch (err) {
    console.error('[ausentismos] conceptos error:', err);
    res.status(500).json({ error: 'Error listando conceptos de ausentismos', details: err.message });
  }
}

// ===========================================================================
// GET /api/ausentismos?codPeriod=7
// Sin ?codPeriod → devuelve TODOS los registros activos de todos los períodos.
// Con ?codPeriod=N → filtra por ese período.
// ===========================================================================
async function listarAusentismos(req, res) {
  try {
    const codEmpr   = Number(req.query.codEmpr) || DEFAULT_COD_EMPR;
    const codPeriod = req.query.codPeriod ? Number(req.query.codPeriod) : null;

    const periodFilter = codPeriod ? 'AND COD_PERIOD = @codPeriod' : '';
    const q = `
      SELECT
        COD_EMPR, COD_NOVED, COD_FUNCI, COD_CONC, COD_PERIOD,
        CEDULA, NOMBRE, NOM_CONC, TIP_CONC, TIP_NATU,
        FEC_INI, FEC_FIN, DIAS_TOTAL, DIAGNOSTICO, FEC_PRORRG,
        OBS_NOVED, FEC_REGI, IND_APLICADO,
        ACT_USUA, ACT_HORA, ACT_ESTA,
        PER_ANO, PER_MES, PER_QNA, PER_FINI, PER_FFIN
      FROM dbo.vw_NO_AUSEN_PERIODO
      WHERE COD_EMPR = @codEmpr
        ${periodFilter}
      ORDER BY ACT_HORA DESC
    `;
    const params = codPeriod ? { codEmpr, codPeriod } : { codEmpr };
    const r = await executeQuery(q, params);
    res.json({ codEmpr, codPeriod, registros: r.recordset || [] });
  } catch (err) {
    console.error('[ausentismos] listar error:', err);
    res.status(500).json({ error: 'Error listando ausentismos', details: err.message });
  }
}

// ===========================================================================
// POST /api/ausentismos
// Body: { cedula, codConc, fecIni, fecFin, diasTotal?, diagnostico?,
//         fecProrroga?, observaciones?, usuario?,
//         fecRegi? }
//
//   fecRegi (opcional, "YYYY-MM-DD"):
//     Fecha efectiva de registro. Determina el COD_PERIOD asignado y el
//     campo FEC_REGI en NO_NOVED. Si se omite se usa fecIni (inicio del
//     ausentismo), lo que asigna la novedad al período que contiene ese día.
// ===========================================================================
async function crearAusentismo(req, res) {
  const {
    cedula, codConc, fecIni, fecFin, diasTotal,
    diagnostico, fecProrroga, observaciones, fecRegi
  } = req.body;
  const usuario = getActUsua(req);
  const codEmpr = Number(req.body.codEmpr) || DEFAULT_COD_EMPR;

  if (!cedula || !codConc) {
    return res.status(400).json({ error: 'cedula y codConc son obligatorios.' });
  }
  if (!fecIni || !fecFin) {
    return res.status(400).json({ error: 'fecIni y fecFin son obligatorias para ausentismos.' });
  }
  if (new Date(fecFin) < new Date(fecIni)) {
    return res.status(400).json({ error: 'fecFin debe ser mayor o igual que fecIni.' });
  }

  const dias = diasTotal !== undefined && diasTotal !== null && diasTotal !== ''
    ? Number(diasTotal)
    : calcDiasEntre(fecIni, fecFin);

  // Fecha efectiva: fecRegi explícita > fecIni (inicio del ausentismo) > hoy
  const fechaEfectiva = fecRegi ? new Date(fecRegi) : new Date(fecIni);

  let transaction;
  try {
    const periodo = await resolverPeriodoPorFecha(fechaEfectiva, codEmpr);
    if (!periodo) {
      const fechaStr = fechaEfectiva.toISOString().slice(0, 10);
      return res.status(409).json({
        error: `No existe período configurado en NO_PERIOD que cubra la fecha ${fechaStr}.`,
        hint: 'Verifique que exista un período con PER_FINI ≤ fecha ≤ PER_FFIN.'
      });
    }
    const codFunci = await resolverCodFunciPorCedula(cedula, codEmpr);
    if (!codFunci) {
      return res.status(404).json({ error: `Empleado con cédula ${cedula} no encontrado en el sistema. Verifique que esté activo.` });
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
    reqNov.input('actUsua',   sql.NVarChar(50),  usuario);
    reqNov.input('fecIni',    sql.Date,          fecIni);
    reqNov.input('fecFin',    sql.Date,          fecFin);
    reqNov.input('fecRegi',   sql.Date,          fecRegi || fecIni || null);

    const novResult = await reqNov.query(`
      INSERT INTO dbo.NO_NOVED
        (COD_EMPR, COD_FUNCI, COD_CONC, COD_PERIOD,
         FEC_REGI, OBS_NOVED, IND_APLICADO, ACT_USUA, ACT_HORA, ACT_ESTA,
         FEC_INI, FEC_FIN)
      VALUES
        (@codEmpr, @codFunci, @codConc, @codPeriod,
         COALESCE(@fecRegi, CONVERT(date, GETDATE())), @obs, 'N', @actUsua, GETDATE(), 'A',
         @fecIni, @fecFin);
      SELECT CAST(SCOPE_IDENTITY() AS INT) AS COD_NOVED;
    `);

    if (!novResult.recordset || !novResult.recordset[0] || novResult.recordset[0].COD_NOVED == null) {
      throw new Error('NO_NOVED no devolvió COD_NOVED (SCOPE_IDENTITY nulo).');
    }
    const codNoved = novResult.recordset[0].COD_NOVED;

    const reqAu = new sql.Request(transaction);
    reqAu.input('codEmpr',    sql.SmallInt,     codEmpr);
    reqAu.input('codNoved',   sql.Int,          codNoved);
    reqAu.input('fecIni',     sql.Date,         fecIni);
    reqAu.input('fecFin',     sql.Date,         fecFin);
    reqAu.input('diasTotal',  sql.Int,          dias);
    reqAu.input('diagnost',   sql.NVarChar(20), diagnostico || null);
    reqAu.input('fecProrrg',  sql.Date,         fecProrroga || null);
    reqAu.input('actUsua',    sql.NVarChar(50), usuario);

    await reqAu.query(`
      INSERT INTO dbo.NO_AUSEN
        (COD_EMPR, COD_NOVED, FEC_INI, FEC_FIN, DIAS_TOTAL,
         DIAGNOSTICO, FEC_PRORRG, ACT_USUA, ACT_HORA, ACT_ESTA)
      VALUES
        (@codEmpr, @codNoved, @fecIni, @fecFin, @diasTotal,
         @diagnost, @fecProrrg, @actUsua, SYSDATETIME(), 'A')
    `);

    await transaction.commit();
    res.json({
      success: true,
      codEmpr, codNoved, codFunci,
      codPeriod: periodo.COD_PERIOD,
      diasTotal: dias,
      message: 'Ausentismo registrado correctamente.'
    });
  } catch (err) {
    if (transaction) { try { await transaction.rollback(); } catch (_) {} }
    console.error('[ausentismos] crear error:', err);
    res.status(500).json({ error: 'Error creando ausentismo', details: err.message });
  }
}

// ===========================================================================
// PUT /api/ausentismos/:codNoved
// ===========================================================================
async function actualizarAusentismo(req, res) {
  const codEmpr = Number(req.query.codEmpr) || Number(req.body.codEmpr) || DEFAULT_COD_EMPR;
  const codNoved = Number(req.params.codNoved);
  const {
    cedula, codConc, fecIni, fecFin, diasTotal,
    diagnostico, fecProrroga, observaciones
  } = req.body;
  const usuario = getActUsua(req);

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

    // Recalcular dias si vienen fecIni + fecFin y no viene diasTotal explícito
    const diasRecalc = (fecIni && fecFin &&
                        (diasTotal === undefined || diasTotal === null || diasTotal === ''))
      ? calcDiasEntre(fecIni, fecFin)
      : (diasTotal !== undefined && diasTotal !== null && diasTotal !== '' ? Number(diasTotal) : null);

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
    reqNov.input('fecFin',    sql.Date,          fecFin || null);
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

    const reqAu = new sql.Request(transaction);
    reqAu.input('codEmpr',   sql.SmallInt,     codEmpr);
    reqAu.input('codNoved',  sql.Int,          codNoved);
    reqAu.input('fecIni',    sql.Date,         fecIni || null);
    reqAu.input('fecFin',    sql.Date,         fecFin || null);
    reqAu.input('diasTotal', sql.Int,          diasRecalc);
    reqAu.input('diagnost',  sql.NVarChar(20), diagnostico !== undefined ? (diagnostico || null) : null);
    reqAu.input('fecProrrg', sql.Date,         fecProrroga !== undefined ? (fecProrroga || null) : null);
    reqAu.input('actUsua',   sql.NVarChar(50), usuario);

    await reqAu.query(`
      UPDATE dbo.NO_AUSEN
      SET FEC_INI     = COALESCE(@fecIni,    FEC_INI),
          FEC_FIN     = COALESCE(@fecFin,    FEC_FIN),
          DIAS_TOTAL  = COALESCE(@diasTotal, DIAS_TOTAL),
          DIAGNOSTICO = COALESCE(@diagnost,  DIAGNOSTICO),
          FEC_PRORRG  = COALESCE(@fecProrrg, FEC_PRORRG),
          ACT_USUA    = @actUsua,
          ACT_HORA    = SYSDATETIME()
      WHERE COD_EMPR = @codEmpr AND COD_NOVED = @codNoved AND ACT_ESTA = 'A'
    `);

    await transaction.commit();
    res.json({ success: true, codEmpr, codNoved, message: 'Ausentismo actualizado.' });
  } catch (err) {
    if (transaction) { try { await transaction.rollback(); } catch (_) {} }
    console.error('[ausentismos] actualizar error:', err);
    res.status(500).json({ error: 'Error actualizando ausentismo', details: err.message });
  }
}

// ===========================================================================
// DELETE /api/ausentismos/:codNoved
// ===========================================================================
async function anularAusentismo(req, res) {
  const codEmpr = Number(req.query.codEmpr) || DEFAULT_COD_EMPR;
  const codNoved = Number(req.params.codNoved);
  const usuario = getActUsua(req);
  const estado = req.query.mode === 'eliminar' ? 'E' : 'I';

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
    reqNov.input('estado',   sql.NVarChar(1),  estado);
    await reqNov.query(`
      UPDATE dbo.NO_NOVED
      SET ACT_ESTA = @estado, ACT_USUA = @actUsua, ACT_HORA = GETDATE()
      WHERE COD_EMPR = @codEmpr AND COD_NOVED = @codNoved
    `);

    const reqAu = new sql.Request(transaction);
    reqAu.input('codEmpr',  sql.SmallInt,    codEmpr);
    reqAu.input('codNoved', sql.Int,         codNoved);
    reqAu.input('actUsua',  sql.NVarChar(50), usuario);
    reqAu.input('estado',   sql.NVarChar(1),  estado);
    await reqAu.query(`
      UPDATE dbo.NO_AUSEN
      SET ACT_ESTA = @estado, ACT_USUA = @actUsua, ACT_HORA = SYSDATETIME()
      WHERE COD_EMPR = @codEmpr AND COD_NOVED = @codNoved
    `);

    await transaction.commit();
    res.json({ success: true, codEmpr, codNoved, message: 'Ausentismo anulado.' });
  } catch (err) {
    if (transaction) { try { await transaction.rollback(); } catch (_) {} }
    console.error('[ausentismos] anular error:', err);
    res.status(500).json({ error: 'Error anulando ausentismo', details: err.message });
  }
}

// ===========================================================================
// POST /api/ausentismos/anular-batch
// Body: { codNoveds: [1, 2, 3, ...] }
// ===========================================================================
async function anularAusentismoBatch(req, res) {
  const codEmpr = Number(req.query.codEmpr) || DEFAULT_COD_EMPR;
  const usuario = getActUsua(req);
  const { codNoveds, mode } = req.body || {};
  const estado = mode === 'eliminar' ? 'E' : 'I';

  if (!Array.isArray(codNoveds) || codNoveds.length === 0) {
    return res.status(400).json({ error: 'codNoveds debe ser un arreglo no vacío.' });
  }
  if (codNoveds.length > 2000) {
    return res.status(400).json({ error: 'Máximo 2000 registros por lote.' });
  }

  const ids = codNoveds.map(Number).filter(n => Number.isInteger(n) && n > 0);
  if (ids.length === 0) {
    return res.status(400).json({ error: 'No se recibieron codNoveds válidos (enteros positivos).' });
  }

  const paramNames = ids.map((_, i) => `@id${i}`).join(',');

  let transaction;
  try {
    const pool = await getConnection();
    transaction = new sql.Transaction(pool);
    await transaction.begin();

    const reqNov = new sql.Request(transaction);
    reqNov.input('codEmpr', sql.SmallInt, codEmpr);
    reqNov.input('actUsua', sql.NVarChar(50), usuario);
    reqNov.input('estado',  sql.NVarChar(1),  estado);
    ids.forEach((id, i) => reqNov.input(`id${i}`, sql.Int, id));

    const rNov = await reqNov.query(`
      UPDATE dbo.NO_NOVED
      SET ACT_ESTA = @estado, ACT_USUA = @actUsua, ACT_HORA = GETDATE()
      WHERE COD_EMPR = @codEmpr
        AND COD_NOVED IN (${paramNames})
        AND ACT_ESTA = 'A'
    `);

    const reqAu = new sql.Request(transaction);
    reqAu.input('codEmpr', sql.SmallInt, codEmpr);
    reqAu.input('actUsua', sql.NVarChar(50), usuario);
    reqAu.input('estado',  sql.NVarChar(1),  estado);
    ids.forEach((id, i) => reqAu.input(`id${i}`, sql.Int, id));

    await reqAu.query(`
      UPDATE dbo.NO_AUSEN
      SET ACT_ESTA = @estado, ACT_USUA = @actUsua, ACT_HORA = SYSDATETIME()
      WHERE COD_EMPR = @codEmpr
        AND COD_NOVED IN (${paramNames})
        AND ACT_ESTA = 'A'
    `);

    await transaction.commit();

    const anulados = rNov.rowsAffected[0] || 0;
    const omitidos = ids.length - anulados;
    res.json({
      success: true,
      anulados,
      solicitados: ids.length,
      omitidos,
      message: `${anulados} ausentismo(s) anulado(s) correctamente.${omitidos > 0 ? ` ${omitidos} omitido(s) por período cerrado.` : ''}`
    });
  } catch (err) {
    if (transaction) { try { await transaction.rollback(); } catch (_) {} }
    console.error('[ausentismos] anularBatch error:', err);
    res.status(500).json({ error: 'Error anulando ausentismos en lote', details: err.message });
  }
}

module.exports = {
  ensureDbObjects,
  obtenerPeriodoActual,
  listarConceptos,
  listarAusentismos,
  crearAusentismo,
  actualizarAusentismo,
  anularAusentismo,
  anularAusentismoBatch
};
