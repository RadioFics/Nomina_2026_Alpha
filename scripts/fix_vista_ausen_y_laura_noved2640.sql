-- ============================================================================
--  CORRECCIÓN INMEDIATA — Ejecutar en SSMS
--
--  Problema: vw_NO_AUSEN_PERIODO usaba INNER JOIN con NO_AUSEN, lo que
--  excluía permisos remunerados (TIP_NATU='AUSENTISMO') que no tenían
--  fila en NO_AUSEN — concretamente COD_NOVED=2640 (Laura Velasquez).
--
--  Esta corrección:
--  1. Recrea la vista con LEFT JOIN (muestra todos los ausentismos aunque
--     no tengan detalle clínico en NO_AUSEN).
--  2. Inserta la fila faltante en NO_AUSEN para el permiso de Laura
--     (COD_NOVED=2640), usando sus fechas y motivo extraído del PDF.
--
--  Ejecutar en: MineDax (CM-ITD-P-05\SQLEXPRESS)
-- ============================================================================

USE MineDax;
GO

-- ─── 1. RECREAR VISTA CON LEFT JOIN ─────────────────────────────────────────

IF OBJECT_ID('dbo.vw_NO_AUSEN_PERIODO', 'V') IS NOT NULL
    DROP VIEW dbo.vw_NO_AUSEN_PERIODO;
GO

CREATE VIEW dbo.vw_NO_AUSEN_PERIODO AS
SELECT
    n.COD_EMPR, n.COD_NOVED, n.COD_FUNCI, n.COD_CONC, n.COD_PERIOD,
    n.COD_CCOST, n.FEC_REGI, n.OBS_NOVED, n.IND_APLICADO,
    n.ACT_USUA, n.ACT_HORA, n.ACT_ESTA,
    t.NUM_IDEN  AS CEDULA,
    t.NOM_COMP  AS NOMBRE,
    c.NOM_CONC, c.TIP_CONC, c.TIP_NATU,
    -- Campos de NO_AUSEN: NULL si el ausentismo no tiene detalle clínico todavía
    au.FEC_INI,   au.FEC_FIN,  au.DIAS_TOTAL,
    au.DIAGNOSTICO, au.FEC_PRORRG,
    p.PER_ANO, p.PER_MES, p.PER_QNA, p.PER_FINI, p.PER_FFIN
FROM dbo.NO_NOVED n
-- LEFT JOIN: incluye NO_NOVED aunque no exista fila en NO_AUSEN
LEFT  JOIN dbo.NO_AUSEN au
       ON  au.COD_EMPR  = n.COD_EMPR
       AND au.COD_NOVED = n.COD_NOVED
       AND au.ACT_ESTA  = 'A'
LEFT  JOIN dbo.GN_FUNCI f
       ON  f.COD_EMPR  = n.COD_EMPR
       AND f.COD_FUNCI = n.COD_FUNCI
LEFT  JOIN dbo.GN_TERCE t ON t.COD_TERC = f.COD_TERC
LEFT  JOIN dbo.NO_CONCE c
       ON  c.COD_EMPR = n.COD_EMPR
       AND c.COD_CONC = n.COD_CONC
LEFT  JOIN dbo.NO_PERIOD p
       ON  p.COD_EMPR   = n.COD_EMPR
       AND p.COD_PERIOD = n.COD_PERIOD
WHERE n.ACT_ESTA  = 'A'
  AND c.TIP_NATU  = 'AUSENTISMO';   -- solo conceptos de naturaleza AUSENTISMO
GO

-- ─── 2. INSERTAR FILA FALTANTE EN NO_AUSEN PARA LAURA (COD_NOVED=2640) ──────
--
-- El permiso remunerado de Laura ya existe en NO_NOVED pero nunca tuvo
-- fila en NO_AUSEN porque la versión anterior del importador no la creaba.

IF NOT EXISTS (
    SELECT 1 FROM dbo.NO_AUSEN
    WHERE COD_EMPR = 1 AND COD_NOVED = 2640
)
BEGIN
    INSERT INTO dbo.NO_AUSEN (
        COD_EMPR, COD_NOVED,
        FEC_INI,              FEC_FIN,              DIAS_TOTAL,
        DIAGNOSTICO,
        ACT_USUA, ACT_HORA,   ACT_ESTA
    ) VALUES (
        1, 2640,
        '2026-02-14',         '2026-02-14',         1,
        N'ESTUDIO',
        'PDF_IMP', SYSDATETIME(), 'A'
    );
    PRINT 'NO_AUSEN insertado para COD_NOVED=2640 (Laura Velasquez - Permiso)';
END
ELSE
BEGIN
    PRINT 'NO_AUSEN ya existe para COD_NOVED=2640 — sin cambios';
END
GO

-- ─── 3. VERIFICACIÓN FINAL ───────────────────────────────────────────────────

SELECT
    COD_NOVED, COD_FUNCI, COD_CONC, COD_PERIOD,
    CEDULA, NOMBRE, NOM_CONC, TIP_NATU,
    FEC_INI, FEC_FIN, DIAS_TOTAL, DIAGNOSTICO,
    ACT_ESTA
FROM dbo.vw_NO_AUSEN_PERIODO
WHERE COD_EMPR = 1
  AND COD_PERIOD = 7
ORDER BY COD_NOVED DESC;
GO
-- Resultado esperado: aparecen COD_NOVED=2640 (Laura) y 2641 (Camilo)
-- FEC_INI/FEC_FIN/DIAS_TOTAL vienen de NO_AUSEN para ambos.
