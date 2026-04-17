-- ============================================================================
-- MIGRACIÓN: Tablas de especialización para Fijas, Ausentismos y Cambios
-- Fecha: 2026-04-17
-- Objetivo:
--   1) Crear NO_FIJAS       -> especialización de NO_NOVED para novedades FIJA
--   2) Crear NO_AUSEN       -> especialización de NO_NOVED para AUSENTISMO
--   3) Crear NO_CAMBI       -> especialización de NO_NOVED para CAMBIO
--   4) Crear vistas consolidadas por categoría (vw_NO_FIJAS_PERIODO, etc.)
--
-- Siguen la convención MineDax: PK compuesta (COD_EMPR, COD_NOVED), FK hacia
-- NO_NOVED, columnas ACT_USUA / ACT_HORA / ACT_ESTA para trazabilidad y
-- soft-delete. Cantidad/valor se reservan para NO_FIJAS cuando aplique; las
-- otras categorías llevan solo los campos propios de su semántica.
--
-- Idempotente: cada bloque se puede reejecutar sin efectos dañinos.
-- ============================================================================

SET NOCOUNT ON;
GO

-- ----------------------------------------------------------------------------
-- 1) NO_FIJAS — novedades FIJAS (AFC, APV, préstamos, descuentos periódicos)
--    Campos del Excel: Código/Tipo -> NO_CONCE; Valor, Fecha Inicial,
--    Fecha Final, Aplicación (Normal / Retroactivo / 1ra-2da Quincena),
--    Cuenta (texto), Cuotas (entero), Observaciones (ya en NO_NOVED).
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.NO_FIJAS', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.NO_FIJAS (
        COD_EMPR    SMALLINT        NOT NULL CONSTRAINT DF_NO_FIJAS_EMPR DEFAULT (1),
        COD_NOVED   INT             NOT NULL,
        CANTIDAD    DECIMAL(18, 4)  NULL,
        VALOR       DECIMAL(18, 2)  NULL,
        FEC_INI     DATE            NULL,
        FEC_FIN     DATE            NULL,
        APLICACION  NVARCHAR(30)    NULL,          -- 'Normal' | 'Retroactivo' | '1ra Quincena' | '2da Quincena'
        NUM_CUOTAS  INT             NULL,
        NUM_CUENTA  NVARCHAR(50)    NULL,
        ACT_USUA    NVARCHAR(50)    NOT NULL CONSTRAINT DF_NO_FIJAS_USUA DEFAULT (N'MineDax'),
        ACT_HORA    DATETIME2       NOT NULL CONSTRAINT DF_NO_FIJAS_HORA DEFAULT (SYSDATETIME()),
        ACT_ESTA    CHAR(1)         NOT NULL CONSTRAINT DF_NO_FIJAS_ESTA DEFAULT ('A'),
        CONSTRAINT PK_NO_FIJAS PRIMARY KEY CLUSTERED (COD_EMPR, COD_NOVED),
        CONSTRAINT FK_NO_FIJAS_NO_NOVED FOREIGN KEY (COD_EMPR, COD_NOVED)
            REFERENCES dbo.NO_NOVED (COD_EMPR, COD_NOVED)
    );
    PRINT '[OK] Tabla dbo.NO_FIJAS creada.';
END
ELSE
BEGIN
    PRINT '[SKIP] dbo.NO_FIJAS ya existía.';
END
GO

-- ----------------------------------------------------------------------------
-- 2) NO_AUSEN — novedades de AUSENTISMO (incapacidades, licencias, vacaciones)
--    Campos propios: Fecha Inicial, Fecha Final, Días Totales, Diagnóstico
--    (CIE-10), Prórroga (fecha). Las fechas también se reflejan en NO_NOVED
--    (FEC_INI / FEC_FIN) para consulta rápida, pero se persisten aquí como
--    fuente de verdad de la semántica del ausentismo.
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.NO_AUSEN', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.NO_AUSEN (
        COD_EMPR    SMALLINT       NOT NULL CONSTRAINT DF_NO_AUSEN_EMPR DEFAULT (1),
        COD_NOVED   INT            NOT NULL,
        FEC_INI     DATE           NOT NULL,
        FEC_FIN     DATE           NOT NULL,
        DIAS_TOTAL  INT            NULL,       -- calculado (FEC_FIN - FEC_INI + 1) por defecto
        DIAGNOSTICO NVARCHAR(20)   NULL,       -- Código CIE-10 (p. ej. S800, Z321, J00, M54.5)
        FEC_PRORRG  DATE           NULL,       -- Prórroga (opcional)
        ACT_USUA    NVARCHAR(50)   NOT NULL CONSTRAINT DF_NO_AUSEN_USUA DEFAULT (N'MineDax'),
        ACT_HORA    DATETIME2      NOT NULL CONSTRAINT DF_NO_AUSEN_HORA DEFAULT (SYSDATETIME()),
        ACT_ESTA    CHAR(1)        NOT NULL CONSTRAINT DF_NO_AUSEN_ESTA DEFAULT ('A'),
        CONSTRAINT PK_NO_AUSEN PRIMARY KEY CLUSTERED (COD_EMPR, COD_NOVED),
        CONSTRAINT FK_NO_AUSEN_NO_NOVED FOREIGN KEY (COD_EMPR, COD_NOVED)
            REFERENCES dbo.NO_NOVED (COD_EMPR, COD_NOVED),
        CONSTRAINT CK_NO_AUSEN_RANGO CHECK (FEC_FIN >= FEC_INI)
    );
    PRINT '[OK] Tabla dbo.NO_AUSEN creada.';
END
ELSE
BEGIN
    PRINT '[SKIP] dbo.NO_AUSEN ya existía.';
END
GO

-- ----------------------------------------------------------------------------
-- 3) NO_CAMBI — novedades de CAMBIO (ajustes maestros: cargo, salario, EPS,
--    AFP, CCF, centro de costos, etc.). El concepto (COD_CONC) indica QUÉ
--    cambia; "VALOR_NUEVO" registra la descripción o valor al que se cambia.
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.NO_CAMBI', 'U') IS NULL
BEGIN
    CREATE TABLE dbo.NO_CAMBI (
        COD_EMPR    SMALLINT       NOT NULL CONSTRAINT DF_NO_CAMBI_EMPR DEFAULT (1),
        COD_NOVED   INT            NOT NULL,
        FEC_INI     DATE           NOT NULL,        -- Fecha efectiva del cambio
        VALOR_NUEVO NVARCHAR(300)  NULL,            -- "Cambio a": texto libre con el nuevo valor
        VALOR_ANTE  NVARCHAR(300)  NULL,            -- (opcional) valor anterior si se captura
        ACT_USUA    NVARCHAR(50)   NOT NULL CONSTRAINT DF_NO_CAMBI_USUA DEFAULT (N'MineDax'),
        ACT_HORA    DATETIME2      NOT NULL CONSTRAINT DF_NO_CAMBI_HORA DEFAULT (SYSDATETIME()),
        ACT_ESTA    CHAR(1)        NOT NULL CONSTRAINT DF_NO_CAMBI_ESTA DEFAULT ('A'),
        CONSTRAINT PK_NO_CAMBI PRIMARY KEY CLUSTERED (COD_EMPR, COD_NOVED),
        CONSTRAINT FK_NO_CAMBI_NO_NOVED FOREIGN KEY (COD_EMPR, COD_NOVED)
            REFERENCES dbo.NO_NOVED (COD_EMPR, COD_NOVED)
    );
    PRINT '[OK] Tabla dbo.NO_CAMBI creada.';
END
ELSE
BEGIN
    PRINT '[SKIP] dbo.NO_CAMBI ya existía.';
END
GO

-- ----------------------------------------------------------------------------
-- 4) Vista consolidada NO_FIJAS (análoga a vw_NO_OCASI_PERIODO)
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.vw_NO_FIJAS_PERIODO', 'V') IS NOT NULL
    DROP VIEW dbo.vw_NO_FIJAS_PERIODO;
GO

CREATE VIEW dbo.vw_NO_FIJAS_PERIODO
AS
SELECT
    n.COD_EMPR,
    n.COD_NOVED,
    n.COD_FUNCI,
    n.COD_CONC,
    n.COD_PERIOD,
    n.COD_CCOST,
    n.FEC_REGI,
    n.OBS_NOVED,
    n.IND_APLICADO,
    n.ACT_USUA,
    n.ACT_HORA,
    n.ACT_ESTA,
    -- Persona
    t.NUM_IDEN         AS CEDULA,
    t.NOM_COMP         AS NOMBRE,
    -- Concepto
    c.NOM_CONC,
    c.TIP_CONC,                      -- DEVENGO / DEDUCCION
    c.TIP_NATU,                      -- FIJA
    -- Especialización FIJA
    fj.CANTIDAD,
    fj.VALOR,
    fj.FEC_INI,
    fj.FEC_FIN,
    fj.APLICACION,
    fj.NUM_CUOTAS,
    fj.NUM_CUENTA,
    -- Período
    p.PER_ANO, p.PER_MES, p.PER_QNA, p.PER_FINI, p.PER_FFIN
FROM dbo.NO_NOVED      n
INNER JOIN dbo.NO_FIJAS fj
       ON fj.COD_EMPR = n.COD_EMPR
      AND fj.COD_NOVED = n.COD_NOVED
LEFT  JOIN dbo.GN_FUNCI f
       ON f.COD_EMPR  = n.COD_EMPR
      AND f.COD_FUNCI = n.COD_FUNCI
LEFT  JOIN dbo.GN_TERCE t
       ON t.COD_TERC  = f.COD_TERC
LEFT  JOIN dbo.NO_CONCE c
       ON c.COD_EMPR  = n.COD_EMPR
      AND c.COD_CONC  = n.COD_CONC
LEFT  JOIN dbo.NO_PERIOD p
       ON p.COD_EMPR  = n.COD_EMPR
      AND p.COD_PERIOD = n.COD_PERIOD
WHERE n.ACT_ESTA = 'A'
  AND fj.ACT_ESTA = 'A';
GO
PRINT '[OK] Vista dbo.vw_NO_FIJAS_PERIODO creada.';
GO

-- ----------------------------------------------------------------------------
-- 5) Vista consolidada NO_AUSEN
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.vw_NO_AUSEN_PERIODO', 'V') IS NOT NULL
    DROP VIEW dbo.vw_NO_AUSEN_PERIODO;
GO

CREATE VIEW dbo.vw_NO_AUSEN_PERIODO
AS
SELECT
    n.COD_EMPR,
    n.COD_NOVED,
    n.COD_FUNCI,
    n.COD_CONC,
    n.COD_PERIOD,
    n.COD_CCOST,
    n.FEC_REGI,
    n.OBS_NOVED,
    n.IND_APLICADO,
    n.ACT_USUA,
    n.ACT_HORA,
    n.ACT_ESTA,
    -- Persona
    t.NUM_IDEN         AS CEDULA,
    t.NOM_COMP         AS NOMBRE,
    -- Concepto
    c.NOM_CONC,
    c.TIP_CONC,
    c.TIP_NATU,                      -- AUSENTISMO
    -- Especialización AUSEN
    au.FEC_INI,
    au.FEC_FIN,
    au.DIAS_TOTAL,
    au.DIAGNOSTICO,
    au.FEC_PRORRG,
    -- Período
    p.PER_ANO, p.PER_MES, p.PER_QNA, p.PER_FINI, p.PER_FFIN
FROM dbo.NO_NOVED      n
INNER JOIN dbo.NO_AUSEN au
       ON au.COD_EMPR = n.COD_EMPR
      AND au.COD_NOVED = n.COD_NOVED
LEFT  JOIN dbo.GN_FUNCI f
       ON f.COD_EMPR  = n.COD_EMPR
      AND f.COD_FUNCI = n.COD_FUNCI
LEFT  JOIN dbo.GN_TERCE t
       ON t.COD_TERC  = f.COD_TERC
LEFT  JOIN dbo.NO_CONCE c
       ON c.COD_EMPR  = n.COD_EMPR
      AND c.COD_CONC  = n.COD_CONC
LEFT  JOIN dbo.NO_PERIOD p
       ON p.COD_EMPR  = n.COD_EMPR
      AND p.COD_PERIOD = n.COD_PERIOD
WHERE n.ACT_ESTA = 'A'
  AND au.ACT_ESTA = 'A';
GO
PRINT '[OK] Vista dbo.vw_NO_AUSEN_PERIODO creada.';
GO

-- ----------------------------------------------------------------------------
-- 6) Vista consolidada NO_CAMBI
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.vw_NO_CAMBI_PERIODO', 'V') IS NOT NULL
    DROP VIEW dbo.vw_NO_CAMBI_PERIODO;
GO

CREATE VIEW dbo.vw_NO_CAMBI_PERIODO
AS
SELECT
    n.COD_EMPR,
    n.COD_NOVED,
    n.COD_FUNCI,
    n.COD_CONC,
    n.COD_PERIOD,
    n.COD_CCOST,
    n.FEC_REGI,
    n.OBS_NOVED,
    n.IND_APLICADO,
    n.ACT_USUA,
    n.ACT_HORA,
    n.ACT_ESTA,
    -- Persona
    t.NUM_IDEN         AS CEDULA,
    t.NOM_COMP         AS NOMBRE,
    -- Concepto
    c.NOM_CONC,
    c.TIP_CONC,
    c.TIP_NATU,                      -- CAMBIO
    -- Especialización CAMBI
    cb.FEC_INI,
    cb.VALOR_NUEVO,
    cb.VALOR_ANTE,
    -- Período
    p.PER_ANO, p.PER_MES, p.PER_QNA, p.PER_FINI, p.PER_FFIN
FROM dbo.NO_NOVED      n
INNER JOIN dbo.NO_CAMBI cb
       ON cb.COD_EMPR = n.COD_EMPR
      AND cb.COD_NOVED = n.COD_NOVED
LEFT  JOIN dbo.GN_FUNCI f
       ON f.COD_EMPR  = n.COD_EMPR
      AND f.COD_FUNCI = n.COD_FUNCI
LEFT  JOIN dbo.GN_TERCE t
       ON t.COD_TERC  = f.COD_TERC
LEFT  JOIN dbo.NO_CONCE c
       ON c.COD_EMPR  = n.COD_EMPR
      AND c.COD_CONC  = n.COD_CONC
LEFT  JOIN dbo.NO_PERIOD p
       ON p.COD_EMPR  = n.COD_EMPR
      AND p.COD_PERIOD = n.COD_PERIOD
WHERE n.ACT_ESTA = 'A'
  AND cb.ACT_ESTA = 'A';
GO
PRINT '[OK] Vista dbo.vw_NO_CAMBI_PERIODO creada.';
GO

-- ============================================================================
-- RESUMEN
-- ============================================================================
PRINT '';
PRINT '====================================================================';
PRINT '  Migración fijas + ausentismos + cambios: completada';
PRINT '  - dbo.NO_FIJAS                (TABLE)';
PRINT '  - dbo.NO_AUSEN                (TABLE)';
PRINT '  - dbo.NO_CAMBI                (TABLE)';
PRINT '  - dbo.vw_NO_FIJAS_PERIODO     (VIEW)';
PRINT '  - dbo.vw_NO_AUSEN_PERIODO     (VIEW)';
PRINT '  - dbo.vw_NO_CAMBI_PERIODO     (VIEW)';
PRINT '====================================================================';
GO
