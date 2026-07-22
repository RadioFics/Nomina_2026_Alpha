-- ============================================================================
-- MIGRACIÓN: Reasignación retroactiva de períodos (migration_retrofix_periodos)
-- Fecha: 2026-06-09
--
-- Problema:
--   Todos los registros de NO_NOVED fueron creados con COD_PERIOD = 10
--   (período activo en el momento de inserción), sin importar la FEC_REGI
--   real de cada novedad. Este script corrige el COD_PERIOD de cada registro
--   al período que corresponde según su FEC_REGI usando fn_GetPeriodByDate.
--
-- Registros afectados (según análisis previo):
--   • 1 904 novedades → COD_PERIOD 10 → 7  (Abr 16-30, 2026)
--   •   517 novedades → COD_PERIOD 10 → 8  (May 01-15, 2026)
--   •   399 novedades → COD_PERIOD 10 → 10 (Jun 01-15, 2026) ← sin cambio
--
-- Seguridad ante el trigger TR_NO_NOVED_PERIODO_CERRADO:
--   El trigger comprueba el período de la fila ANTES del update (tabla deleted).
--   Como todos los registros están actualmente en COD_PERIOD=10 (PER_EST='A'),
--   la condición C (bloquea ediciones en períodos cerrados) NO se activa.
--   El update pasa sin restricción.
--
-- REQUIERE: que migration_periodo_fix.sql ya haya sido ejecutado (función
--           fn_GetPeriodByDate debe existir).
-- ============================================================================

USE MineDax;
GO

PRINT '▶ migration_retrofix_periodos.sql';
PRINT '';

-- ============================================================================
-- PASO 1: Vista previa (solo lectura — no modifica datos)
-- ============================================================================

PRINT '  → Distribución ANTES del update:';

SELECT
  n.COD_PERIOD            AS periodo_actual,
  p.PER_ANO, p.PER_MES, p.PER_QNA,
  p.PER_EST,
  COUNT(*)                AS cant_novedades
FROM dbo.NO_NOVED n
JOIN dbo.NO_PERIOD p
  ON p.COD_EMPR   = n.COD_EMPR
 AND p.COD_PERIOD = n.COD_PERIOD
WHERE n.ACT_ESTA IN ('A','I','E')
GROUP BY n.COD_PERIOD, p.PER_ANO, p.PER_MES, p.PER_QNA, p.PER_EST
ORDER BY n.COD_PERIOD;

GO

-- ============================================================================
-- PASO 2: Reasignación dentro de una transacción (con rollback de seguridad)
-- ============================================================================

BEGIN TRANSACTION retrofix;

  UPDATE n
  SET    n.COD_PERIOD = dbo.fn_GetPeriodByDate(n.FEC_REGI, n.COD_EMPR)
  FROM   dbo.NO_NOVED n
  WHERE  n.ACT_ESTA IN ('A','I','E')
    AND  dbo.fn_GetPeriodByDate(n.FEC_REGI, n.COD_EMPR) IS NOT NULL
    AND  dbo.fn_GetPeriodByDate(n.FEC_REGI, n.COD_EMPR) <> n.COD_PERIOD;

  PRINT '';
  PRINT '  ✓ Filas actualizadas: ' + CAST(@@ROWCOUNT AS VARCHAR);
  PRINT '';

  -- Validación: no debe quedar ningún registro con FEC_REGI fuera de su período
  DECLARE @mal INT;
  SELECT @mal = COUNT(*)
  FROM   dbo.NO_NOVED n
  WHERE  n.ACT_ESTA IN ('A','I','E')
    AND  dbo.fn_GetPeriodByDate(n.FEC_REGI, n.COD_EMPR) IS NOT NULL
    AND  dbo.fn_GetPeriodByDate(n.FEC_REGI, n.COD_EMPR) <> n.COD_PERIOD;

  IF @mal > 0
  BEGIN
    PRINT '  ✗ Validación fallida: ' + CAST(@mal AS VARCHAR) + ' registros siguen mal. ROLLBACK.';
    ROLLBACK TRANSACTION retrofix;
  END
  ELSE
  BEGIN
    PRINT '  ✓ Validación OK: todos los registros tienen el COD_PERIOD correcto.';
    COMMIT TRANSACTION retrofix;
  END

GO

-- ============================================================================
-- PASO 3: Distribución DESPUÉS del update
-- ============================================================================

PRINT '  → Distribución DESPUÉS del update:';

SELECT
  n.COD_PERIOD,
  p.PER_ANO, p.PER_MES, p.PER_QNA,
  p.PER_EST,
  CONVERT(varchar, p.PER_FINI, 23) AS fini,
  CONVERT(varchar, p.PER_FFIN, 23) AS ffin,
  COUNT(*) AS cant_novedades
FROM dbo.NO_NOVED n
JOIN dbo.NO_PERIOD p
  ON p.COD_EMPR   = n.COD_EMPR
 AND p.COD_PERIOD = n.COD_PERIOD
WHERE n.ACT_ESTA IN ('A','I','E')
GROUP BY n.COD_PERIOD, p.PER_ANO, p.PER_MES, p.PER_QNA, p.PER_EST, p.PER_FINI, p.PER_FFIN
ORDER BY n.COD_PERIOD;

GO

PRINT '';
PRINT '▶ migration_retrofix_periodos.sql completado.';
GO
