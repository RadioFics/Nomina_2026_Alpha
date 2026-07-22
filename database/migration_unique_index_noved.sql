-- ============================================================================
--  migration_unique_index_noved.sql
--  Aplica unicidad de registros ACTIVOS en NO_NOVED para la clave de negocio:
--    (COD_EMPR, COD_FUNCI, COD_CONC, COD_PERIOD)
--
--  PASOS:
--    1. Identificar duplicados 'A' (si los hay) y colapsar el excedente
--       marcándolos 'I' (soft-delete, no pérdida de datos).
--    2. Crear el índice UNIQUE FILTERED sobre ACT_ESTA = 'A'.
--
--  IMPORTANTE: ejecutar en una ventana de mantenimiento con la aplicación
--  detenida (stop server.js) para evitar escrituras concurrentes durante
--  el paso 1. El paso 2 es un DDL rápido (índice filtrado, tabla pequeña).
--
--  Compatible con: SQL Server 2019+ y Azure SQL
-- ============================================================================

USE [MineDax];
GO

-- ============================================================================
--  PASO 1: Limpiar duplicados 'A' pre-existentes
--  Para cada grupo (COD_EMPR, COD_FUNCI, COD_CONC, COD_PERIOD) con más de un
--  registro activo, conserva el de mayor COD_NOVED y marca los demás como 'I'.
--  Se hace UPDATE (no DELETE) para preservar la trazabilidad.
-- ============================================================================
PRINT 'Paso 1: Detectando duplicados activos en NO_NOVED...';
GO

WITH DupActivos AS (
    SELECT
        n.COD_NOVED,
        MAX(n.COD_NOVED) OVER (
            PARTITION BY n.COD_EMPR, n.COD_FUNCI, n.COD_CONC, n.COD_PERIOD
        ) AS KEEP_NOVED,
        COUNT(*) OVER (
            PARTITION BY n.COD_EMPR, n.COD_FUNCI, n.COD_CONC, n.COD_PERIOD
        ) AS CNT
    FROM dbo.NO_NOVED n
    WHERE n.ACT_ESTA = 'A'
)
SELECT COUNT(*) AS DuplicadosActivos
FROM DupActivos
WHERE CNT > 1 AND COD_NOVED <> KEEP_NOVED;
GO

-- Marcar duplicados como 'I' (soft-delete en NO_NOVED)
WITH DupActivos AS (
    SELECT
        n.COD_NOVED,
        MAX(n.COD_NOVED) OVER (
            PARTITION BY n.COD_EMPR, n.COD_FUNCI, n.COD_CONC, n.COD_PERIOD
        ) AS KEEP_NOVED,
        COUNT(*) OVER (
            PARTITION BY n.COD_EMPR, n.COD_FUNCI, n.COD_CONC, n.COD_PERIOD
        ) AS CNT
    FROM dbo.NO_NOVED n
    WHERE n.ACT_ESTA = 'A'
)
UPDATE n
SET n.ACT_ESTA = 'I',
    n.ACT_HORA = GETDATE(),
    n.OBS_NOVED = ISNULL(n.OBS_NOVED, '') +
                  ' [migración: duplicado colapsado por migration_unique_index_noved.sql]'
FROM dbo.NO_NOVED n
INNER JOIN DupActivos d ON d.COD_NOVED = n.COD_NOVED
WHERE d.CNT > 1
  AND d.COD_NOVED <> d.KEEP_NOVED;
GO

-- Propagar ACT_ESTA='I' a las sub-tablas de los mismos registros
-- (mantener coherencia entre cabecera y sub-tabla)
UPDATE o SET o.ACT_ESTA = 'I', o.ACT_HORA = SYSDATETIME()
FROM dbo.NO_OCASI o
INNER JOIN dbo.NO_NOVED n ON n.COD_EMPR = o.COD_EMPR AND n.COD_NOVED = o.COD_NOVED
WHERE n.ACT_ESTA = 'I'
  AND o.ACT_ESTA = 'A';
GO

UPDATE f SET f.ACT_ESTA = 'I', f.ACT_HORA = SYSDATETIME()
FROM dbo.NO_FIJAS f
INNER JOIN dbo.NO_NOVED n ON n.COD_EMPR = f.COD_EMPR AND n.COD_NOVED = f.COD_NOVED
WHERE n.ACT_ESTA = 'I'
  AND f.ACT_ESTA = 'A';
GO

UPDATE a SET a.ACT_ESTA = 'I', a.ACT_HORA = SYSDATETIME()
FROM dbo.NO_AUSEN a
INNER JOIN dbo.NO_NOVED n ON n.COD_EMPR = a.COD_EMPR AND n.COD_NOVED = a.COD_NOVED
WHERE n.ACT_ESTA = 'I'
  AND a.ACT_ESTA = 'A';
GO

UPDATE c SET c.ACT_ESTA = 'I', c.ACT_HORA = SYSDATETIME()
FROM dbo.NO_CAMBI c
INNER JOIN dbo.NO_NOVED n ON n.COD_EMPR = c.COD_EMPR AND n.COD_NOVED = c.COD_NOVED
WHERE n.ACT_ESTA = 'I'
  AND c.ACT_ESTA = 'A';
GO

PRINT 'Paso 1 completado.';
GO

-- ============================================================================
--  PASO 2: Crear índice UNIQUE FILTERED
--  Solo aplica a filas con ACT_ESTA = 'A' → registros activos únicos por clave.
--  Los registros 'I' y 'E' pueden repetir la clave sin violar el índice.
-- ============================================================================
PRINT 'Paso 2: Creando índice UNIQUE FILTERED en NO_NOVED...';
GO

-- Verificar si ya existe (idempotente)
IF NOT EXISTS (
    SELECT 1 FROM sys.indexes
    WHERE object_id = OBJECT_ID('dbo.NO_NOVED')
      AND name = 'UX_NO_NOVED_ACTIVA'
)
BEGIN
    CREATE UNIQUE INDEX UX_NO_NOVED_ACTIVA
    ON dbo.NO_NOVED (COD_EMPR, COD_FUNCI, COD_CONC, COD_PERIOD)
    WHERE ACT_ESTA = 'A';

    PRINT 'Índice UX_NO_NOVED_ACTIVA creado exitosamente.';
END
ELSE
BEGIN
    PRINT 'Índice UX_NO_NOVED_ACTIVA ya existe. Nada que hacer.';
END
GO

PRINT 'Migración completada.';
GO
