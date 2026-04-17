-- ============================================================================
-- MIGRACIÓN: Sistema de Novedades Centralizado
-- Fecha: 2026-04-10
-- Descripción: Agregar tabla NO_NOVED y relaciones con tablas existentes
-- ============================================================================

-- PASO 1: Crear tabla NO_NOVED (Histórico Central de Novedades)
-- ============================================================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'NO_NOVED')
BEGIN
  CREATE TABLE NO_NOVED (
    -- Identificación
    id NVARCHAR(36) PRIMARY KEY,
    numeroNovedad NVARCHAR(50) UNIQUE NOT NULL,

    -- Persona
    cedula NVARCHAR(20) NOT NULL,
    nombre NVARCHAR(255) NOT NULL,

    -- Clasificación
    categoria NVARCHAR(50) NOT NULL,           -- Ocasional, Fija, Ausencia
    tipo NVARCHAR(100),                        -- Bono, Descuento, Licencia...
    subtipo NVARCHAR(100),                     -- Enfermedad, Vacaciones...

    -- Período
    periodo NVARCHAR(50) NOT NULL,             -- "2026-04-Q1", "2026-04-Q2"
    fechaInicio DATE,
    fechaFin DATE,

    -- Valores
    cantidad DECIMAL(10, 2),
    valor DECIMAL(15, 2),
    aplicacion NVARCHAR(50),                   -- Para fijas: Nómina, Otra

    -- Control
    estado NVARCHAR(20) DEFAULT 'Activo',      -- Activo, Cancelado, Modificado
    motivoCancelacion NVARCHAR(500),

    -- Auditoría
    usuarioRegistro NVARCHAR(255),
    fechaRegistro DATETIME DEFAULT GETDATE(),
    usuarioActualizacion NVARCHAR(255),
    fechaActualizacion DATETIME,
    usuarioCancelacion NVARCHAR(255),
    fechaCancelacion DATETIME,

    -- Observaciones
    observaciones NVARCHAR(MAX),

    -- Índices para optimizar consultas
    INDEX IDX_cedula (cedula),
    INDEX IDX_periodo (periodo),
    INDEX IDX_categoria (categoria),
    INDEX IDX_estado (estado),
    INDEX IDX_fechaRegistro (fechaRegistro),
    INDEX IDX_cedula_periodo (cedula, periodo)
  );

  PRINT '✓ Tabla NO_NOVED creada exitosamente';
END
ELSE
BEGIN
  PRINT '⚠ Tabla NO_NOVED ya existe';
END

-- ============================================================================
-- PASO 2: Agregar columna novedadId a tabla Ocasionales
-- ============================================================================

IF NOT EXISTS (
  SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Ocasionales' AND COLUMN_NAME = 'novedadId'
)
BEGIN
  ALTER TABLE Ocasionales
  ADD novedadId NVARCHAR(36) NULL;

  ALTER TABLE Ocasionales
  ADD CONSTRAINT FK_Ocasionales_NO_NOVED
  FOREIGN KEY (novedadId) REFERENCES NO_NOVED(id);

  PRINT '✓ Columna novedadId agregada a Ocasionales';
END
ELSE
BEGIN
  PRINT '⚠ Columna novedadId ya existe en Ocasionales';
END

-- ============================================================================
-- PASO 3: Agregar columna novedadId a tabla Fijas
-- ============================================================================

IF NOT EXISTS (
  SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Fijas' AND COLUMN_NAME = 'novedadId'
)
BEGIN
  ALTER TABLE Fijas
  ADD novedadId NVARCHAR(36) NULL;

  ALTER TABLE Fijas
  ADD CONSTRAINT FK_Fijas_NO_NOVED
  FOREIGN KEY (novedadId) REFERENCES NO_NOVED(id);

  PRINT '✓ Columna novedadId agregada a Fijas';
END
ELSE
BEGIN
  PRINT '⚠ Columna novedadId ya existe en Fijas';
END

-- ============================================================================
-- PASO 4: Agregar columna novedadId a tabla Ausencias
-- ============================================================================

IF NOT EXISTS (
  SELECT COLUMN_NAME FROM INFORMATION_SCHEMA.COLUMNS
  WHERE TABLE_NAME = 'Ausencias' AND COLUMN_NAME = 'novedadId'
)
BEGIN
  ALTER TABLE Ausencias
  ADD novedadId NVARCHAR(36) NULL;

  ALTER TABLE Ausencias
  ADD CONSTRAINT FK_Ausencias_NO_NOVED
  FOREIGN KEY (novedadId) REFERENCES NO_NOVED(id);

  PRINT '✓ Columna novedadId agregada a Ausencias';
END
ELSE
BEGIN
  PRINT '⚠ Columna novedadId ya existe en Ausencias';
END

-- ============================================================================
-- PASO 5: Crear tabla de auditoría expandida (OPCIONAL)
-- ============================================================================

IF NOT EXISTS (SELECT * FROM sys.tables WHERE name = 'NO_NOVED_Auditoria')
BEGIN
  CREATE TABLE NO_NOVED_Auditoria (
    id NVARCHAR(36) PRIMARY KEY,
    novedadId NVARCHAR(36) NOT NULL,

    -- Cambios
    campoModificado NVARCHAR(100),
    valorAnterior NVARCHAR(MAX),
    valorNuevo NVARCHAR(MAX),

    -- Auditoría
    usuario NVARCHAR(255),
    fechaAccion DATETIME DEFAULT GETDATE(),
    accion NVARCHAR(50),                       -- CREATE, UPDATE, DELETE
    motivo NVARCHAR(500),

    -- Relación
    CONSTRAINT FK_Auditoria_NO_NOVED
    FOREIGN KEY (novedadId) REFERENCES NO_NOVED(id),

    -- Índices
    INDEX IDX_novedadId (novedadId),
    INDEX IDX_fechaAccion (fechaAccion),
    INDEX IDX_usuario (usuario)
  );

  PRINT '✓ Tabla NO_NOVED_Auditoria creada exitosamente';
END
ELSE
BEGIN
  PRINT '⚠ Tabla NO_NOVED_Auditoria ya existe';
END

-- ============================================================================
-- PASO 6: Crear vista consolidada de novedades
-- ============================================================================

IF OBJECT_ID('vw_Novedades_Consolidadas', 'V') IS NOT NULL
BEGIN
  DROP VIEW vw_Novedades_Consolidadas;
END

CREATE VIEW vw_Novedades_Consolidadas AS
SELECT
  n.id,
  n.numeroNovedad,
  n.cedula,
  n.nombre,
  n.categoria,
  n.tipo,
  n.subtipo,
  n.periodo,
  n.fechaInicio,
  n.fechaFin,
  n.cantidad,
  n.valor,
  n.aplicacion,
  n.estado,
  n.observaciones,
  n.fechaRegistro,
  n.fechaActualizacion,
  n.usuarioRegistro,
  n.usuarioActualizacion
FROM NO_NOVED n
WHERE n.estado IN ('Activo', 'Modificado')
ORDER BY n.cedula, n.fechaRegistro DESC;

PRINT '✓ Vista vw_Novedades_Consolidadas creada exitosamente';

-- ============================================================================
-- PASO 7: Crear procedimiento almacenado para crear novedad
-- ============================================================================

IF OBJECT_ID('sp_CrearNovedad', 'P') IS NOT NULL
BEGIN
  DROP PROCEDURE sp_CrearNovedad;
END

CREATE PROCEDURE sp_CrearNovedad
  @id NVARCHAR(36),
  @numeroNovedad NVARCHAR(50),
  @cedula NVARCHAR(20),
  @nombre NVARCHAR(255),
  @categoria NVARCHAR(50),
  @tipo NVARCHAR(100),
  @subtipo NVARCHAR(100),
  @periodo NVARCHAR(50),
  @fechaInicio DATE = NULL,
  @fechaFin DATE = NULL,
  @cantidad DECIMAL(10, 2) = NULL,
  @valor DECIMAL(15, 2) = NULL,
  @aplicacion NVARCHAR(50) = NULL,
  @observaciones NVARCHAR(MAX) = NULL,
  @usuarioRegistro NVARCHAR(255) = NULL
AS
BEGIN
  BEGIN TRY
    BEGIN TRANSACTION;

    -- Insertar en NO_NOVED
    INSERT INTO NO_NOVED (
      id, numeroNovedad, cedula, nombre,
      categoria, tipo, subtipo, periodo,
      fechaInicio, fechaFin, cantidad, valor,
      aplicacion, estado, observaciones, usuarioRegistro, fechaRegistro
    )
    VALUES (
      @id, @numeroNovedad, @cedula, @nombre,
      @categoria, @tipo, @subtipo, @periodo,
      @fechaInicio, @fechaFin, @cantidad, @valor,
      @aplicacion, 'Activo', @observaciones, @usuarioRegistro, GETDATE()
    );

    COMMIT TRANSACTION;
    SELECT 'Novedad creada exitosamente' AS Mensaje, @id AS NovedadId;
  END TRY
  BEGIN CATCH
    ROLLBACK TRANSACTION;
    SELECT ERROR_MESSAGE() AS ErrorMessage;
  END CATCH
END;

PRINT '✓ Procedimiento sp_CrearNovedad creado exitosamente';

-- ============================================================================
-- PASO 8: Crear procedimiento almacenado para obtener histórico
-- ============================================================================

IF OBJECT_ID('sp_ObtenerHistoricoPerson', 'P') IS NOT NULL
BEGIN
  DROP PROCEDURE sp_ObtenerHistoricoPerson;
END

CREATE PROCEDURE sp_ObtenerHistoricoPerson
  @cedula NVARCHAR(20),
  @periodo NVARCHAR(50) = NULL
AS
BEGIN
  SELECT
    numeroNovedad,
    cedula,
    nombre,
    categoria,
    tipo,
    subtipo,
    periodo,
    fechaInicio,
    fechaFin,
    cantidad,
    valor,
    aplicacion,
    estado,
    observaciones,
    fechaRegistro,
    fechaActualizacion,
    usuarioRegistro,
    usuarioActualizacion
  FROM NO_NOVED
  WHERE cedula = @cedula
    AND (ISNULL(@periodo, '') = '' OR periodo = @periodo)
  ORDER BY fechaRegistro DESC;
END;

PRINT '✓ Procedimiento sp_ObtenerHistoricoPerson creado exitosamente';

-- ============================================================================
-- RESUMEN DE MIGRACIÓN
-- ============================================================================

PRINT '';
PRINT '╔════════════════════════════════════════════════════════════════╗';
PRINT '║           MIGRACIÓN COMPLETADA EXITOSAMENTE                    ║';
PRINT '╚════════════════════════════════════════════════════════════════╝';
PRINT '';
PRINT 'Nuevas tablas creadas:';
PRINT '  • NO_NOVED (Histórico centralizado de novedades)';
PRINT '  • NO_NOVED_Auditoria (Auditoría detallada)';
PRINT '';
PRINT 'Columnas agregadas:';
PRINT '  • novedadId en Ocasionales';
PRINT '  • novedadId en Fijas';
PRINT '  • novedadId en Ausencias';
PRINT '';
PRINT 'Vistas creadas:';
PRINT '  • vw_Novedades_Consolidadas';
PRINT '';
PRINT 'Procedimientos almacenados creados:';
PRINT '  • sp_CrearNovedad';
PRINT '  • sp_ObtenerHistoricoPerson';
PRINT '';

