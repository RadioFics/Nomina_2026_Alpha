// ============================================================================
//  controllers/jefesAreaController.js
//  CRUD para GN_JEFE_AREA — Jefes de Área / Líderes de Área
//
//  La tabla resuelve qué correo recibe la validación de solicitudes de
//  permiso y vacaciones de autoservicio, reemplazando las variables de
//  entorno JEFE_CCOST_* por registros en base de datos.
//
//  Estructura:
//    GN_JEFE_AREA (COD_JEFE PK IDENTITY, COD_EMPR, NOM_AREA, COD_CCOST FK,
//                  COD_ABREV, NOM_JEFE, COR_JEFE, ES_PRINCIP, auditoría)
//
//  Lógica de resolución (_resolverEmailJefe en solicitudesController.js):
//    1. SELECT TOP 1 por COD_CCOST (int), ORDER BY ES_PRINCIP='S' primero
//    2. Fallback: JEFE_DEFAULT env var → MAIL_RRHH
// ============================================================================

const { executeQuery } = require('../config/database');

const DEFAULT_COD_EMPR = 1;

// ─── Bootstrap ────────────────────────────────────────────────────────────────

exports.ensureDbObjects = async function ensureDbObjects() {
  try {
    // 1. Crear tabla si no existe
    await executeQuery(`
      IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='GN_JEFE_AREA'
      ) BEGIN
        CREATE TABLE dbo.GN_JEFE_AREA (
          COD_JEFE    INT           IDENTITY(1,1) PRIMARY KEY,
          COD_EMPR    SMALLINT      NOT NULL CONSTRAINT DF_GN_JEFE_AREA_EMPR DEFAULT (1),
          NOM_AREA    NVARCHAR(100) NOT NULL,
          COD_CCOST   INT           NULL,
          COD_ABREV   VARCHAR(20)   NULL,
          NOM_JEFE    NVARCHAR(200) NOT NULL,
          COR_JEFE    NVARCHAR(150) NOT NULL,
          ES_PRINCIP  CHAR(1)       NOT NULL CONSTRAINT DF_GN_JEFE_AREA_PRINCIP DEFAULT ('N'),
          ACT_USUA    CHAR(8)       NOT NULL CONSTRAINT DF_GN_JEFE_AREA_USUA    DEFAULT ('MineDax'),
          ACT_HORA    DATETIME      NOT NULL CONSTRAINT DF_GN_JEFE_AREA_HORA    DEFAULT (GETDATE()),
          ACT_ESTA    CHAR(1)       NOT NULL CONSTRAINT DF_GN_JEFE_AREA_ESTA    DEFAULT ('A')
        );
        PRINT '[jefesArea] GN_JEFE_AREA creada.';
      END
    `);

    // 2. Seeder: insertar los 13 líderes solo si la tabla está vacía
    await executeQuery(`
      IF NOT EXISTS (SELECT 1 FROM dbo.GN_JEFE_AREA WHERE COD_EMPR = 1) BEGIN

        -- Talento Humano (COD_CCOST=12 = CM0603-LEG; ES_PRINCIP='S' = ruta por defecto para LEG)
        INSERT INTO dbo.GN_JEFE_AREA (COD_EMPR,NOM_AREA,COD_CCOST,COD_ABREV,NOM_JEFE,COR_JEFE,ES_PRINCIP)
        VALUES (1,'Talento Humano',12,'CM0603-LEG','Juliana Santana','j.santana@collectivemining.com','S');

        -- Seguridad y Salud en el Trabajo (COD_CCOST=5 = CM0204-ESGHSE)
        INSERT INTO dbo.GN_JEFE_AREA (COD_EMPR,NOM_AREA,COD_CCOST,COD_ABREV,NOM_JEFE,COR_JEFE,ES_PRINCIP)
        VALUES (1,'Seguridad y Salud en el Trabajo',5,'CM0204-ESG','Mario Carmona','m.carmona@collectivemining.com','S');

        -- Protección (CM0610-PRO — no existe aún en MAE_CCOST; COD_CCOST NULL)
        INSERT INTO dbo.GN_JEFE_AREA (COD_EMPR,NOM_AREA,COD_CCOST,COD_ABREV,NOM_JEFE,COR_JEFE,ES_PRINCIP)
        VALUES (1,'Protección',NULL,'CM0610-PRO','Jaime Granada','j.granada@collectivemining.com','S');

        -- Legal (COD_CCOST=12 = CM0603-LEG; no es el principal, TH lo es)
        INSERT INTO dbo.GN_JEFE_AREA (COD_EMPR,NOM_AREA,COD_CCOST,COD_ABREV,NOM_JEFE,COR_JEFE,ES_PRINCIP)
        VALUES (1,'Legal',12,'CM0603-LEG','Alejandra Arismendy','a.arismendy@collectivemining.com','N');

        -- Tierras (COD_CCOST=12 = CM0603-LEG)
        INSERT INTO dbo.GN_JEFE_AREA (COD_EMPR,NOM_AREA,COD_CCOST,COD_ABREV,NOM_JEFE,COR_JEFE,ES_PRINCIP)
        VALUES (1,'Tierras',12,'CM0603-LEG','Santiago David','s.david@collectivemining.com','N');

        -- Ambiental (CM0202-ESG — no existe en MAE_CCOST; COD_CCOST NULL)
        INSERT INTO dbo.GN_JEFE_AREA (COD_EMPR,NOM_AREA,COD_CCOST,COD_ABREV,NOM_JEFE,COR_JEFE,ES_PRINCIP)
        VALUES (1,'Ambiental',NULL,'CM0202-ESG','Jessica Paternina','j.paternina@collectivemining.com','S');

        -- Exploración (COD_CCOST=1 = CM0100-EXP)
        INSERT INTO dbo.GN_JEFE_AREA (COD_EMPR,NOM_AREA,COD_CCOST,COD_ABREV,NOM_JEFE,COR_JEFE,ES_PRINCIP)
        VALUES (1,'Exploración',1,'CM0100-EXP','Julian Orozco','j.salgado@collectivemining.com','S');

        -- Social (COD_CCOST=3 = CM0201-ESGSOC)
        INSERT INTO dbo.GN_JEFE_AREA (COD_EMPR,NOM_AREA,COD_CCOST,COD_ABREV,NOM_JEFE,COR_JEFE,ES_PRINCIP)
        VALUES (1,'Social',3,'CM0201-ESG','Leidy Mazo','l.mazo@collectivemining.com','S');

        -- Formalización (COD_CCOST=4 = CM0203-ESGFORM)
        INSERT INTO dbo.GN_JEFE_AREA (COD_EMPR,NOM_AREA,COD_CCOST,COD_ABREV,NOM_JEFE,COR_JEFE,ES_PRINCIP)
        VALUES (1,'Formalización',4,'CM0203-ESG','Jairo Cardenas','j.cardenas@collectivemining.com','S');

        -- Logística (COD_CCOST=8 = CM0500-LOG)
        INSERT INTO dbo.GN_JEFE_AREA (COD_EMPR,NOM_AREA,COD_CCOST,COD_ABREV,NOM_JEFE,COR_JEFE,ES_PRINCIP)
        VALUES (1,'Logística',8,'CM0500-LOG','Jhon Herrera','j.herrera@collectivemining.com','S');

        -- Comunicaciones (COD_CCOST=11 = CM0602-XAC)
        INSERT INTO dbo.GN_JEFE_AREA (COD_EMPR,NOM_AREA,COD_CCOST,COD_ABREV,NOM_JEFE,COR_JEFE,ES_PRINCIP)
        VALUES (1,'Comunicaciones',11,'CM0602-XAC','Maria Juliana Ospina','m.ospina@collectivemining.com','S');

        -- Financiera (COD_CCOST=13 = CM0604-FIN)
        INSERT INTO dbo.GN_JEFE_AREA (COD_EMPR,NOM_AREA,COD_CCOST,COD_ABREV,NOM_JEFE,COR_JEFE,ES_PRINCIP)
        VALUES (1,'Financiera',13,'CM0604-FIN','Pablo Montoya','p.montoya@collectivemining.com','S');

        -- Minería (COD_CCOST=14 = CM0700-MIN)
        INSERT INTO dbo.GN_JEFE_AREA (COD_EMPR,NOM_AREA,COD_CCOST,COD_ABREV,NOM_JEFE,COR_JEFE,ES_PRINCIP)
        VALUES (1,'Minería',14,'CM0700-MIN','Raphael Maracaja','r.maracaja@collectivemining.com','S');

        PRINT '[jefesArea] 13 líderes de área insertados.';
      END
    `);
  } catch (err) {
    console.warn('[jefesArea] ensureDbObjects warning:', err.message);
  }
};

// ─── Resolver email del jefe (usado por solicitudesController) ────────────────

/**
 * Busca el jefe de área para un centro de costos dado.
 *
 * MODO BYPASS (desarrollo / pruebas):
 *   Si JEFE_BYPASS_EMAIL está definido en .env, TODOS los correos de aprobación
 *   se redirigen a esa dirección — los jefes reales no son notificados.
 *   El flujo completo (token UUID, tabla NO_SOLICITUDES_PEND, links aprobar/rechazar)
 *   funciona igual; solo cambia el destinatario del correo.
 *   Para activar los jefes reales: eliminar o dejar vacío JEFE_BYPASS_EMAIL.
 *
 * Prioridad normal (sin bypass):
 *   GN_JEFE_AREA por COD_CCOST (ES_PRINCIP='S' primero) → JEFE_DEFAULT env → MAIL_RRHH
 *
 * @param {number|null} codCcost - GN_FUNCI.COD_CCOST del empleado solicitante
 * @returns {{ emailJefe: string, nomJefe: string, bypass: boolean }}
 */
exports.resolverEmailJefe = async function resolverEmailJefe(codCcost) {
  // ── MODO BYPASS ───────────────────────────────────────────────────────────
  const bypassEmail = (process.env.JEFE_BYPASS_EMAIL || '').trim();
  if (bypassEmail) {
    const bypassNom = (process.env.JEFE_BYPASS_NOMBRE || 'Prueba — No es el jefe real').trim();
    console.log(`[jefesArea] BYPASS activo → correo redirigido a ${bypassEmail}`);
    return { emailJefe: bypassEmail, nomJefe: bypassNom, bypass: true };
  }

  // ── Consulta a GN_JEFE_AREA ───────────────────────────────────────────────
  if (codCcost != null && codCcost !== 0) {
    try {
      const r = await executeQuery(`
        SELECT TOP 1 COR_JEFE, NOM_JEFE
        FROM dbo.GN_JEFE_AREA
        WHERE COD_EMPR  = @empr
          AND COD_CCOST = @cod
          AND ACT_ESTA  = 'A'
        ORDER BY CASE WHEN ES_PRINCIP = 'S' THEN 0 ELSE 1 END, COD_JEFE
      `, { empr: DEFAULT_COD_EMPR, cod: codCcost });
      const row = r.recordset?.[0];
      if (row?.COR_JEFE) {
        return { emailJefe: row.COR_JEFE.trim(), nomJefe: (row.NOM_JEFE || 'Jefe de Área').trim(), bypass: false };
      }
    } catch (err) {
      console.warn('[jefesArea] resolverEmailJefe DB error:', err.message);
    }
  }

  // ── Fallback: variables de entorno (compatibilidad hacia atrás) ───────────
  const specificKey = codCcost != null ? `JEFE_CCOST_${codCcost}` : null;
  const emailJefe =
    (specificKey && process.env[specificKey]) ||
    process.env.JEFE_DEFAULT                  ||
    process.env.MAIL_RRHH                     ||
    '';
  const nomJefe =
    (specificKey && process.env[`${specificKey}_NOMBRE`]) ||
    process.env.JEFE_DEFAULT_NOMBRE           ||
    'Jefe de Área';
  return { emailJefe, nomJefe, bypass: false };
};

// ─── API — Listar ─────────────────────────────────────────────────────────────

exports.listar = async (req, res) => {
  try {
    const r = await executeQuery(`
      SELECT j.COD_JEFE, j.NOM_AREA, j.COD_CCOST, j.COD_ABREV,
             j.NOM_JEFE, j.COR_JEFE, j.ES_PRINCIP, j.ACT_ESTA,
             j.ACT_USUA, CONVERT(varchar(19),j.ACT_HORA,120) AS ACT_HORA,
             c.NOM_CCOST
      FROM dbo.GN_JEFE_AREA j
      LEFT JOIN dbo.MAE_CCOST c ON c.COD_EMPR = j.COD_EMPR AND c.COD_CCOST = j.COD_CCOST
      WHERE j.COD_EMPR = @empr
      ORDER BY j.NOM_AREA
    `, { empr: DEFAULT_COD_EMPR });
    res.json({ success: true, jefes: r.recordset || [] });
  } catch (err) {
    console.error('[jefesArea] listar:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── API — Obtener uno ────────────────────────────────────────────────────────

exports.obtener = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ success: false, error: 'ID inválido' });
  try {
    const r = await executeQuery(`
      SELECT j.*, c.NOM_CCOST
      FROM dbo.GN_JEFE_AREA j
      LEFT JOIN dbo.MAE_CCOST c ON c.COD_EMPR = j.COD_EMPR AND c.COD_CCOST = j.COD_CCOST
      WHERE j.COD_JEFE = @id AND j.COD_EMPR = @empr
    `, { id, empr: DEFAULT_COD_EMPR });
    const row = r.recordset?.[0];
    if (!row) return res.status(404).json({ success: false, error: 'No encontrado' });
    res.json({ success: true, jefe: row });
  } catch (err) {
    console.error('[jefesArea] obtener:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── API — Crear ──────────────────────────────────────────────────────────────

exports.crear = async (req, res) => {
  const { nom_area, cod_ccost, cod_abrev, nom_jefe, cor_jefe, es_princip } = req.body;
  if (!nom_area || !nom_jefe || !cor_jefe)
    return res.status(400).json({ success: false, error: 'Faltan campos: nom_area, nom_jefe, cor_jefe' });

  const actUsua = (req.abr_usua || req.cedula || 'ADMIN').toString().slice(0, 8).padEnd(8);
  try {
    const r = await executeQuery(`
      INSERT INTO dbo.GN_JEFE_AREA
        (COD_EMPR, NOM_AREA, COD_CCOST, COD_ABREV, NOM_JEFE, COR_JEFE, ES_PRINCIP, ACT_USUA, ACT_ESTA)
      VALUES
        (@empr, @nom, @ccost, @abrev, @njefe, @cjefe, @princip, @usua, 'A');
      SELECT SCOPE_IDENTITY() AS cod_jefe;
    `, {
      empr:    DEFAULT_COD_EMPR,
      nom:     nom_area.trim(),
      ccost:   cod_ccost != null ? parseInt(cod_ccost, 10) : null,
      abrev:   (cod_abrev || '').trim() || null,
      njefe:   nom_jefe.trim(),
      cjefe:   cor_jefe.trim().toLowerCase(),
      princip: es_princip === 'S' ? 'S' : 'N',
      usua:    actUsua,
    });
    const codJefe = r.recordset?.[0]?.cod_jefe;
    res.json({ success: true, cod_jefe: codJefe, mensaje: 'Jefe de área creado correctamente' });
  } catch (err) {
    console.error('[jefesArea] crear:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── API — Actualizar ─────────────────────────────────────────────────────────

exports.actualizar = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ success: false, error: 'ID inválido' });

  const { nom_area, cod_ccost, cod_abrev, nom_jefe, cor_jefe, es_princip, act_esta } = req.body;
  if (!nom_area || !nom_jefe || !cor_jefe)
    return res.status(400).json({ success: false, error: 'Faltan campos: nom_area, nom_jefe, cor_jefe' });

  const actUsua = (req.abr_usua || req.cedula || 'ADMIN').toString().slice(0, 8).padEnd(8);
  try {
    const r = await executeQuery(`
      UPDATE dbo.GN_JEFE_AREA SET
        NOM_AREA   = @nom,
        COD_CCOST  = @ccost,
        COD_ABREV  = @abrev,
        NOM_JEFE   = @njefe,
        COR_JEFE   = @cjefe,
        ES_PRINCIP = @princip,
        ACT_ESTA   = @esta,
        ACT_USUA   = @usua,
        ACT_HORA   = GETDATE()
      WHERE COD_JEFE = @id AND COD_EMPR = @empr;
      SELECT @@ROWCOUNT AS afectados;
    `, {
      id, empr: DEFAULT_COD_EMPR,
      nom:     nom_area.trim(),
      ccost:   cod_ccost != null ? parseInt(cod_ccost, 10) : null,
      abrev:   (cod_abrev || '').trim() || null,
      njefe:   nom_jefe.trim(),
      cjefe:   cor_jefe.trim().toLowerCase(),
      princip: es_princip === 'S' ? 'S' : 'N',
      esta:    act_esta === 'I' ? 'I' : 'A',
      usua:    actUsua,
    });
    const afectados = r.recordset?.[0]?.afectados || 0;
    if (!afectados) return res.status(404).json({ success: false, error: 'Registro no encontrado' });
    res.json({ success: true, mensaje: 'Jefe de área actualizado correctamente' });
  } catch (err) {
    console.error('[jefesArea] actualizar:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── API — Desactivar (soft delete) ──────────────────────────────────────────

exports.desactivar = async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (!id) return res.status(400).json({ success: false, error: 'ID inválido' });
  const actUsua = (req.abr_usua || req.cedula || 'ADMIN').toString().slice(0, 8).padEnd(8);
  try {
    await executeQuery(`
      UPDATE dbo.GN_JEFE_AREA
      SET ACT_ESTA='I', ACT_USUA=@usua, ACT_HORA=GETDATE()
      WHERE COD_JEFE=@id AND COD_EMPR=@empr
    `, { id, empr: DEFAULT_COD_EMPR, usua: actUsua });
    res.json({ success: true, mensaje: 'Jefe de área desactivado' });
  } catch (err) {
    console.error('[jefesArea] desactivar:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// ─── API — Listar centros de costo (para el formulario) ──────────────────────

exports.listarCcost = async (req, res) => {
  try {
    const r = await executeQuery(`
      SELECT COD_CCOST, NOM_CCOST, COD_ABREV
      FROM dbo.MAE_CCOST
      WHERE COD_EMPR = @empr AND ACT_ESTA = 'A' AND COD_CCOST > 0
      ORDER BY NOM_CCOST
    `, { empr: DEFAULT_COD_EMPR });
    res.json({ success: true, ccosts: r.recordset || [] });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
