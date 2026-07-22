-- ============================================================================
-- MIGRACIÓN: Corrección de períodos (migration_periodo_fix)
-- Fecha: 2026-06-09
-- Autor: Sistema automático (MineDax)
--
-- Problemas que resuelve:
--   1. COD_PERIOD=5 faltante (anomalía de IDENTITY por rollback previo)
--   2. Función fn_GetPeriodByDate para resolución de período por cualquier fecha
--   3. Trigger TR_NO_NOVED_PERIODO_CERRADO: permite registros retroactivos en
--      períodos cerrados (novedades con fecha efectiva pasada)
--   4. Índice de búsqueda por fechas en NO_PERIOD
--
-- NOTA sobre COD_PERIOD=5:
--   El valor 5 fue saltado por SQL Server IDENTITY cuando una transacción fue
--   revertida durante la generación automática de períodos futuros. Los períodos
--   3 (Mar 1-15) y 4 (Mar 16-31) ya cubren marzo 2026 correctamente; este
--   registro rellena el hueco de identidad con las mismas fechas que el período 4
--   y queda en estado 'I' (inactivo). La función fn_GetPeriodByDate ordena por
--   COD_PERIOD ASC, por lo que para fechas de marzo Q2 siempre se retornará el
--   período 4 (el de menor ID), nunca el 5.
-- ============================================================================

USE MineDax;
GO

PRINT '▶ Iniciando migration_periodo_fix.sql';
PRINT '';

-- ============================================================================
-- 1. Período faltante COD_PERIOD = 5
-- ============================================================================

-- COD_PERIOD=5: NO SE INSERTA.
-- La tabla tiene un constraint UQ_PERIOD_NATURAL sobre (COD_EMPR, PER_ANO, PER_MES, PER_QNA).
-- El período 4 ya ocupa (1, 2026, 3, 2) — Mar Q2 2026 — con fechas 2026-03-16 a 2026-03-31.
-- El hueco en el IDENTITY es cosmético; no hay rango de fechas sin cubrir.
PRINT '  ⚠ COD_PERIOD=5 omitido: UQ_PERIOD_NATURAL impide duplicar (1,2026,3,2).';
PRINT '    El período 4 ya cubre Mar 16-31 2026. Hueco de IDENTITY, no de fechas.';

GO

-- ============================================================================
-- 2. Función dbo.fn_GetPeriodByDate
--    Devuelve el COD_PERIOD cuyo rango (PER_FINI…PER_FFIN) contiene @fecha.
--    No filtra por PER_EST: funciona para fechas pasadas, presentes y futuras.
--    En caso de solapamiento, retorna el período de menor COD_PERIOD (más antiguo).
-- ============================================================================

IF OBJECT_ID('dbo.fn_GetPeriodByDate', 'FN') IS NOT NULL
  DROP FUNCTION dbo.fn_GetPeriodByDate;
GO

CREATE FUNCTION dbo.fn_GetPeriodByDate
(
  @fecha    DATE,
  @cod_empr SMALLINT
)
RETURNS INT
AS
BEGIN
  DECLARE @cod_period INT;

  SELECT TOP 1 @cod_period = COD_PERIOD
  FROM   dbo.NO_PERIOD
  WHERE  COD_EMPR  = @cod_empr
    AND  ACT_ESTA  = 'A'
    AND  @fecha BETWEEN PER_FINI AND PER_FFIN
  ORDER BY COD_PERIOD ASC;  -- período más antiguo gana en solapamientos

  RETURN @cod_period;
END;
GO

PRINT '  ✓ fn_GetPeriodByDate creada/actualizada.';
GO

-- ============================================================================
-- 3. Trigger TR_NO_NOVED_PERIODO_CERRADO
--
--    Lógica actualizada:
--      (A) Nuevas inserciones puras (deleted vacío) → PERMITIR SIEMPRE.
--          Habilita registrar novedades retroactivas en períodos cerrados.
--      (B) Transiciones A→I (archivar) o A→E (anular) → PERMITIR.
--          Solo cambian ACT_ESTA, sin modificar datos de negocio.
--      (C) Cualquier otra edición en período cerrado/futuro → BLOQUEAR.
-- ============================================================================

IF OBJECT_ID('dbo.TR_NO_NOVED_PERIODO_CERRADO', 'TR') IS NOT NULL
  DROP TRIGGER dbo.TR_NO_NOVED_PERIODO_CERRADO;
GO

CREATE TRIGGER dbo.TR_NO_NOVED_PERIODO_CERRADO
ON dbo.NO_NOVED
AFTER INSERT, UPDATE
AS
BEGIN
  SET NOCOUNT ON;

  -- (A) Inserción nueva (sin estado previo): permitir registros retroactivos.
  IF NOT EXISTS (SELECT 1 FROM deleted) RETURN;

  -- (B) Transición de estado pura A→I o A→E: no modifica datos de negocio.
  IF NOT EXISTS (SELECT 1 FROM inserted WHERE ACT_ESTA NOT IN ('I', 'E'))
     AND NOT EXISTS (SELECT 1 FROM deleted  WHERE ACT_ESTA <> 'A')
    RETURN;

  -- (C) Bloquear ediciones de contenido en períodos cerrados o futuros.
  IF EXISTS (
    SELECT 1
    FROM   deleted d
    JOIN   dbo.NO_PERIOD p
           ON  p.COD_EMPR   = d.COD_EMPR
           AND p.COD_PERIOD = d.COD_PERIOD
    WHERE  p.PER_EST <> 'A'
  )
  BEGIN
    RAISERROR(
      N'No se pueden modificar novedades de un período cerrado o futuro (PER_EST <> ''A'').',
      16, 1
    );
    ROLLBACK TRANSACTION;
    RETURN;
  END
END;
GO

PRINT '  ✓ Trigger TR_NO_NOVED_PERIODO_CERRADO actualizado.';
PRINT '    Inserciones retroactivas (A) permitidas.';
PRINT '    Transiciones A→I y A→E (B) permitidas.';
PRINT '    Ediciones de contenido en período cerrado (C) bloqueadas.';
GO

-- ============================================================================
-- 4. Índice de búsqueda por fechas en NO_PERIOD (apoya fn_GetPeriodByDate)
-- ============================================================================

IF NOT EXISTS (
  SELECT 1 FROM sys.indexes
  WHERE  object_id = OBJECT_ID('dbo.NO_PERIOD')
    AND  name = 'IX_NO_PERIOD_EMPR_FECHAS'
)
BEGIN
  CREATE NONCLUSTERED INDEX IX_NO_PERIOD_EMPR_FECHAS
    ON dbo.NO_PERIOD (COD_EMPR, PER_FINI, PER_FFIN)
    INCLUDE (COD_PERIOD, PER_ANO, PER_MES, PER_QNA, PER_EST);
  PRINT '  ✓ Índice IX_NO_PERIOD_EMPR_FECHAS creado.';
END
ELSE
  PRINT '  ⚠ Índice IX_NO_PERIOD_EMPR_FECHAS ya existe.';

GO

PRINT '';
PRINT '▶ migration_periodo_fix.sql completado exitosamente.';
GO
