-- ============================================================================
-- MIGRACIÓN: Soporte para ocasionales vía interfaz web
-- Fecha: 2026-04-16
-- Objetivo:
--   1) Crear SEQUENCE SEQ_NO_NOVED para generar COD_NOVED de forma atómica.
--   2) Crear vista vw_NO_OCASI_PERIODO que una NO_NOVED + NO_OCASI +
--      GN_FUNCI + GN_TERCE + NO_CONCE + NO_PERIOD para el listado web.
-- Idempotente: cada bloque se puede reejecutar sin efectos dañinos.
-- ============================================================================

SET NOCOUNT ON;
GO

-- ----------------------------------------------------------------------------
-- 1) SEQUENCE para COD_NOVED (PK natural de NO_NOVED).
--    Arranca desde MAX(COD_NOVED)+1 si ya hay datos, o desde 1 si está vacío.
-- ----------------------------------------------------------------------------
IF NOT EXISTS (SELECT 1 FROM sys.sequences WHERE name = 'SEQ_NO_NOVED')
BEGIN
    DECLARE @start BIGINT = (SELECT ISNULL(MAX(COD_NOVED), 0) + 1 FROM dbo.NO_NOVED);
    DECLARE @sql NVARCHAR(MAX) =
        N'CREATE SEQUENCE dbo.SEQ_NO_NOVED AS INT ' +
        N'START WITH ' + CAST(@start AS NVARCHAR(20)) + N' INCREMENT BY 1 ' +
        N'MINVALUE 1 NO CYCLE CACHE 20';
    EXEC sp_executesql @sql;
    PRINT '[OK] SEQUENCE dbo.SEQ_NO_NOVED creada (start = ' + CAST(@start AS NVARCHAR) + ')';
END
ELSE
BEGIN
    PRINT '[SKIP] SEQUENCE dbo.SEQ_NO_NOVED ya existía.';
END
GO

-- ----------------------------------------------------------------------------
-- 2) Vista consolidada para el listado "Registros del período" en el frontend.
--    Une: NO_NOVED (cabecera), NO_OCASI (cant/valor), GN_FUNCI+GN_TERCE (persona),
--    NO_CONCE (concepto) y NO_PERIOD (quincena).
--    Solo filas activas (ACT_ESTA='A') en NO_NOVED.
-- ----------------------------------------------------------------------------
IF OBJECT_ID('dbo.vw_NO_OCASI_PERIODO', 'V') IS NOT NULL
    DROP VIEW dbo.vw_NO_OCASI_PERIODO;
GO

CREATE VIEW dbo.vw_NO_OCASI_PERIODO
AS
SELECT
    n.COD_EMPR,
    n.COD_NOVED,
    n.COD_FUNCI,
    n.COD_CONC,
    n.COD_PERIOD,
    n.COD_CCOST,
    n.FEC_REGI,
    n.FEC_INI,
    n.FEC_FIN,
    n.OBS_NOVED,
    n.IND_APLICADO,
    n.ACT_USUA,
    n.ACT_HORA,
    n.ACT_ESTA,
    -- Persona
    t.NUM_IDEN        AS CEDULA,
    t.NOM_COMP        AS NOMBRE,
    -- Concepto
    c.NOM_CONC        AS NOM_CONC,
    c.TIP_CONC        AS TIP_CONC,    -- DEVENGO / DEDUCCION
    c.TIP_NATU        AS TIP_NATU,    -- OCASIONAL / FIJA / ...
    -- Ocasional
    o.CANTIDAD        AS CANTIDAD,
    o.VALOR           AS VALOR,
    -- Período
    p.PER_ANO,
    p.PER_MES,
    p.PER_QNA,
    p.PER_FINI,
    p.PER_FFIN
FROM dbo.NO_NOVED     n
INNER JOIN dbo.NO_OCASI o
       ON o.COD_EMPR  = n.COD_EMPR
      AND o.COD_NOVED = n.COD_NOVED
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
  AND o.ACT_ESTA = 'A';
GO

PRINT '[OK] Vista dbo.vw_NO_OCASI_PERIODO creada.';
GO

-- ----------------------------------------------------------------------------
-- Resumen
-- ----------------------------------------------------------------------------
PRINT '';
PRINT '========================================================';
PRINT '  Migración ocasionales: completada';
PRINT '  - dbo.SEQ_NO_NOVED       (SEQUENCE)';
PRINT '  - dbo.vw_NO_OCASI_PERIODO (VIEW)';
PRINT '========================================================';
GO
