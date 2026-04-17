-- ============================================================================
-- SCHEMA DE AUTENTICACIÓN Y AUTORIZACIÓN
-- Base de datos: MineDax
-- Tablas: GN_USUAR, GN_ROL_USUAR, GN_MODULO_ACCESO
-- ============================================================================

-- ============================================================================
-- 1. CREAR TABLA GN_USUAR (Usuarios y Control de Sesiones)
-- ============================================================================

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'GN_USUAR')
BEGIN
    CREATE TABLE dbo.GN_USUAR (
        -- Identificadores
        ID_USUAR        UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        CEDULA          VARCHAR(20) NOT NULL UNIQUE,    -- Referencia a GN_FUNCI
        NOMBRE_USUAR    VARCHAR(100) NOT NULL,          -- Nombre de usuario (por defecto = cedula)

        -- Contraseña y seguridad
        PASSW_HASH      VARCHAR(255) NOT NULL,          -- Hash bcrypt de la contraseña
        EMAIL           VARCHAR(100),                    -- Email para recuperación

        -- Jerarquía y rol
        COD_DEPART      VARCHAR(10),                     -- Código departamento (de GN_FUNCI)
        COD_CARGO       VARCHAR(10),                     -- Código cargo (de GN_FUNCI)
        NIVEL_USUAR     INT DEFAULT 1,                   -- 1=Empleado, 2=Supervisor, 3=Admin
        ESTA_ACTIVO     BIT DEFAULT 1,                   -- 1=Activo, 0=Inactivo

        -- Control de cambio de contraseña
        DIAS_CAMBIO_PASS INT DEFAULT 90,                -- Días para cambiar contraseña
        FECH_ULT_CAMBIO DATETIME,                        -- Fecha último cambio de contraseña
        FECH_PROX_CAMBIO DATETIME,                       -- Fecha próximo cambio requerido
        INTENTOS_FALL   INT DEFAULT 0,                   -- Intentos fallidos de login
        ESTA_BLOQUEADO  BIT DEFAULT 0,                   -- Bloqueado por intentos fallidos

        -- Auditoría
        FECH_CREACION   DATETIME DEFAULT GETDATE(),
        USUAR_CREACION  VARCHAR(100),
        FECH_MODIF      DATETIME,
        USUAR_MODIF     VARCHAR(100),

        INDEX IX_CEDULA NONCLUSTERED (CEDULA),
        INDEX IX_ACTIVO NONCLUSTERED (ESTA_ACTIVO)
    );

    PRINT '✓ Tabla GN_USUAR creada exitosamente';
END
ELSE
    PRINT '⚠ Tabla GN_USUAR ya existe';

-- ============================================================================
-- 2. CREAR TABLA GN_SESION (Historial de Sesiones)
-- ============================================================================

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'GN_SESION')
BEGIN
    CREATE TABLE dbo.GN_SESION (
        ID_SESION       UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        ID_USUAR        UNIQUEIDENTIFIER NOT NULL,
        CEDULA          VARCHAR(20) NOT NULL,

        -- Información de sesión
        TOKEN_JWT       VARCHAR(MAX),                    -- Token JWT (opcional, para auditoría)
        FECH_INICIO     DATETIME DEFAULT GETDATE(),      -- Cuándo inició sesión
        FECH_ULTIMA_ACT DATETIME DEFAULT GETDATE(),      -- Última actividad
        FECH_CIERRE     DATETIME,                        -- Cuándo cerró sesión

        -- Información del dispositivo/navegador
        IP_DIRECCION    VARCHAR(50),
        USER_AGENT      VARCHAR(500),
        DISPOSITIVO     VARCHAR(100),

        ESTA_ACTIVA     BIT DEFAULT 1,

        FOREIGN KEY (ID_USUAR) REFERENCES GN_USUAR(ID_USUAR),
        INDEX IX_USUAR NONCLUSTERED (ID_USUAR),
        INDEX IX_ACTIVA NONCLUSTERED (ESTA_ACTIVA)
    );

    PRINT '✓ Tabla GN_SESION creada exitosamente';
END
ELSE
    PRINT '⚠ Tabla GN_SESION ya existe';

-- ============================================================================
-- 3. CREAR TABLA GN_ROL_USUAR (Asignación de Roles)
-- ============================================================================

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'GN_ROL_USUAR')
BEGIN
    CREATE TABLE dbo.GN_ROL_USUAR (
        ID_ROL_USUAR    UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        ID_USUAR        UNIQUEIDENTIFIER NOT NULL,
        COD_ROL         VARCHAR(20) NOT NULL,           -- ADMIN, SUPERVISOR, EMPLEADO, RRHH, etc.
        NOM_ROL         VARCHAR(100),
        DESC_ROL        VARCHAR(500),
        ESTA_ACTIVO     BIT DEFAULT 1,

        FECH_CREACION   DATETIME DEFAULT GETDATE(),
        FECH_MODIF      DATETIME,

        FOREIGN KEY (ID_USUAR) REFERENCES GN_USUAR(ID_USUAR),
        INDEX IX_USUAR NONCLUSTERED (ID_USUAR),
        INDEX IX_ROL NONCLUSTERED (COD_ROL)
    );

    PRINT '✓ Tabla GN_ROL_USUAR creada exitosamente';
END
ELSE
    PRINT '⚠ Tabla GN_ROL_USUAR ya existe';

-- ============================================================================
-- 4. CREAR TABLA GN_PERMISOS (Permisos Granulares)
-- ============================================================================

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'GN_PERMISOS')
BEGIN
    CREATE TABLE dbo.GN_PERMISOS (
        ID_PERMISO      UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        COD_ROL         VARCHAR(20) NOT NULL,           -- Referencia a rol
        MODULO          VARCHAR(50) NOT NULL,           -- 'nomina', 'reportes', 'maestros'
        ACCION          VARCHAR(50) NOT NULL,           -- 'view', 'create', 'edit', 'delete'
        RECURSO         VARCHAR(100),                   -- Recurso específico (tabla, función)
        TIENE_ACCESO    BIT DEFAULT 1,

        ESTA_ACTIVO     BIT DEFAULT 1,
        FECH_CREACION   DATETIME DEFAULT GETDATE(),

        UNIQUE (COD_ROL, MODULO, ACCION, RECURSO),
        INDEX IX_ROL NONCLUSTERED (COD_ROL),
        INDEX IX_MODULO NONCLUSTERED (MODULO)
    );

    PRINT '✓ Tabla GN_PERMISOS creada exitosamente';
END
ELSE
    PRINT '⚠ Tabla GN_PERMISOS ya existe';

-- ============================================================================
-- 5. CREAR TABLA GN_LOG_ACCESO (Auditoría de Acceso)
-- ============================================================================

IF NOT EXISTS (SELECT * FROM INFORMATION_SCHEMA.TABLES WHERE TABLE_NAME = 'GN_LOG_ACCESO')
BEGIN
    CREATE TABLE dbo.GN_LOG_ACCESO (
        ID_LOG          UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
        ID_USUAR        UNIQUEIDENTIFIER,
        CEDULA          VARCHAR(20),
        TIPO_EVENTO     VARCHAR(50),                    -- 'LOGIN', 'LOGOUT', 'ACCESO_RECURSO', 'ERROR', 'CAMBIO_PASS'
        RECURSO         VARCHAR(100),                   -- Qué se intentó acceder
        IP_DIRECCION    VARCHAR(50),
        ESTADO          VARCHAR(20),                    -- 'EXITOSO', 'FALLIDO', 'BLOQUEADO'
        MENSAJE         VARCHAR(500),

        FECH_EVENTO     DATETIME DEFAULT GETDATE(),

        INDEX IX_USUAR NONCLUSTERED (ID_USUAR),
        INDEX IX_TIPO NONCLUSTERED (TIPO_EVENTO),
        INDEX IX_FECHA NONCLUSTERED (FECH_EVENTO)
    );

    PRINT '✓ Tabla GN_LOG_ACCESO creada exitosamente';
END
ELSE
    PRINT '⚠ Tabla GN_LOG_ACCESO ya existe';

-- ============================================================================
-- 6. CREAR PROCEDIMIENTO: SP_CREAR_USUARIO_DESDE_FUNCI
-- ============================================================================
-- Este procedimiento crea un usuario a partir de los datos en GN_FUNCI

IF OBJECT_ID('dbo.SP_CREAR_USUARIO_DESDE_FUNCI', 'P') IS NOT NULL
    DROP PROCEDURE dbo.SP_CREAR_USUARIO_DESDE_FUNCI;
GO

CREATE PROCEDURE dbo.SP_CREAR_USUARIO_DESDE_FUNCI
    @CEDULA VARCHAR(20),
    @PASSW_HASH VARCHAR(255),
    @EMAIL VARCHAR(100) = NULL,
    @NIVEL_USUAR INT = 1,
    @USUAR_CREACION VARCHAR(100) = 'SISTEMA'
AS
BEGIN
    DECLARE @ID_USUAR UNIQUEIDENTIFIER;
    DECLARE @NOM_FUNCI VARCHAR(100);
    DECLARE @COD_DEPART VARCHAR(10);
    DECLARE @COD_CARGO VARCHAR(10);

    -- Obtener datos de GN_FUNCI
    SELECT TOP 1
        @NOM_FUNCI = NOM_COMP,  -- Ajusta el nombre de la columna según tu tabla
        @COD_DEPART = COD_DEPART,
        @COD_CARGO = COD_CARGO
    FROM GN_FUNCI
    WHERE NUM_IDEN = @CEDULA;

    IF @NOM_FUNCI IS NULL
    BEGIN
        RAISERROR('Empleado no encontrado en GN_FUNCI', 16, 1);
        RETURN;
    END

    -- Crear usuario
    INSERT INTO GN_USUAR (
        CEDULA, NOMBRE_USUAR, PASSW_HASH, EMAIL,
        COD_DEPART, COD_CARGO, NIVEL_USUAR,
        USUAR_CREACION, FECH_PROX_CAMBIO
    )
    VALUES (
        @CEDULA, @CEDULA, @PASSW_HASH, @EMAIL,
        @COD_DEPART, @COD_CARGO, @NIVEL_USUAR,
        @USUAR_CREACION, DATEADD(DAY, 90, GETDATE())
    );

    SELECT 'Usuario creado exitosamente' AS Mensaje;
END;
GO

PRINT '✓ Procedimiento SP_CREAR_USUARIO_DESDE_FUNCI creado';

-- ============================================================================
-- 7. CREAR PROCEDIMIENTO: SP_VALIDAR_LOGIN
-- ============================================================================

IF OBJECT_ID('dbo.SP_VALIDAR_LOGIN', 'P') IS NOT NULL
    DROP PROCEDURE dbo.SP_VALIDAR_LOGIN;
GO

CREATE PROCEDURE dbo.SP_VALIDAR_LOGIN
    @CEDULA_O_EMAIL VARCHAR(100),
    @IP_DIRECCION VARCHAR(50) = NULL
AS
BEGIN
    DECLARE @ID_USUAR UNIQUEIDENTIFIER;
    DECLARE @PASSW_HASH VARCHAR(255);
    DECLARE @ESTA_ACTIVO BIT;
    DECLARE @ESTA_BLOQUEADO BIT;
    DECLARE @INTENTOS_FALL INT;
    DECLARE @NOMBRE_USUAR VARCHAR(100);
    DECLARE @NIVEL_USUAR INT;

    -- Buscar usuario por cédula o email
    SELECT TOP 1
        @ID_USUAR = ID_USUAR,
        @PASSW_HASH = PASSW_HASH,
        @ESTA_ACTIVO = ESTA_ACTIVO,
        @ESTA_BLOQUEADO = ESTA_BLOQUEADO,
        @INTENTOS_FALL = INTENTOS_FALL,
        @NOMBRE_USUAR = NOMBRE_USUAR,
        @NIVEL_USUAR = NIVEL_USUAR
    FROM GN_USUAR
    WHERE CEDULA = @CEDULA_O_EMAIL OR EMAIL = @CEDULA_O_EMAIL;

    IF @ID_USUAR IS NULL
    BEGIN
        INSERT INTO GN_LOG_ACCESO (CEDULA, TIPO_EVENTO, ESTADO, MENSAJE, IP_DIRECCION)
        VALUES (@CEDULA_O_EMAIL, 'LOGIN', 'FALLIDO', 'Usuario no encontrado', @IP_DIRECCION);

        SELECT 'Usuario no encontrado' AS Resultado, NULL AS ID_USUAR;
        RETURN;
    END

    IF @ESTA_BLOQUEADO = 1
    BEGIN
        INSERT INTO GN_LOG_ACCESO (ID_USUAR, CEDULA, TIPO_EVENTO, ESTADO, MENSAJE, IP_DIRECCION)
        VALUES (@ID_USUAR, @CEDULA_O_EMAIL, 'LOGIN', 'BLOQUEADO', 'Usuario bloqueado por intentos fallidos', @IP_DIRECCION);

        SELECT 'Usuario bloqueado por intentos fallidos' AS Resultado, NULL AS ID_USUAR;
        RETURN;
    END

    IF @ESTA_ACTIVO = 0
    BEGIN
        INSERT INTO GN_LOG_ACCESO (ID_USUAR, CEDULA, TIPO_EVENTO, ESTADO, MENSAJE, IP_DIRECCION)
        VALUES (@ID_USUAR, @CEDULA_O_EMAIL, 'LOGIN', 'FALLIDO', 'Usuario inactivo', @IP_DIRECCION);

        SELECT 'Usuario inactivo' AS Resultado, NULL AS ID_USUAR;
        RETURN;
    END

    -- Si llegó aquí, el usuario existe, está activo y no está bloqueado
    SELECT
        'OK' AS Resultado,
        @ID_USUAR AS ID_USUAR,
        @PASSW_HASH AS PASSW_HASH,
        @NOMBRE_USUAR AS NOMBRE_USUAR,
        @NIVEL_USUAR AS NIVEL_USUAR;

    INSERT INTO GN_LOG_ACCESO (ID_USUAR, CEDULA, TIPO_EVENTO, ESTADO, MENSAJE, IP_DIRECCION)
    VALUES (@ID_USUAR, @CEDULA_O_EMAIL, 'LOGIN', 'EXITOSO', 'Login validado correctamente', @IP_DIRECCION);
END;
GO

PRINT '✓ Procedimiento SP_VALIDAR_LOGIN creado';

-- ============================================================================
-- 8. CREAR PROCEDIMIENTO: SP_REGISTRAR_SESION
-- ============================================================================

IF OBJECT_ID('dbo.SP_REGISTRAR_SESION', 'P') IS NOT NULL
    DROP PROCEDURE dbo.SP_REGISTRAR_SESION;
GO

CREATE PROCEDURE dbo.SP_REGISTRAR_SESION
    @ID_USUAR UNIQUEIDENTIFIER,
    @IP_DIRECCION VARCHAR(50) = NULL,
    @USER_AGENT VARCHAR(500) = NULL,
    @DISPOSITIVO VARCHAR(100) = NULL
AS
BEGIN
    DECLARE @ID_SESION UNIQUEIDENTIFIER = NEWID();
    DECLARE @CEDULA VARCHAR(20);

    SELECT @CEDULA = CEDULA FROM GN_USUAR WHERE ID_USUAR = @ID_USUAR;

    INSERT INTO GN_SESION (
        ID_SESION, ID_USUAR, CEDULA,
        IP_DIRECCION, USER_AGENT, DISPOSITIVO,
        ESTA_ACTIVA
    )
    VALUES (
        @ID_SESION, @ID_USUAR, @CEDULA,
        @IP_DIRECCION, @USER_AGENT, @DISPOSITIVO,
        1
    );

    SELECT @ID_SESION AS ID_SESION;
END;
GO

PRINT '✓ Procedimiento SP_REGISTRAR_SESION creado';

-- ============================================================================
-- 9. INSERTAR ROLES Y PERMISOS PREDETERMINADOS
-- ============================================================================

-- Limpiar datos previos (opcional)
-- DELETE FROM GN_PERMISOS;
-- DELETE FROM GN_ROL_USUAR;

-- Insertar roles base
MERGE INTO GN_PERMISOS AS TARGET
USING (
    VALUES
        ('ADMIN', 'nomina', 'view', NULL, 1),
        ('ADMIN', 'nomina', 'create', NULL, 1),
        ('ADMIN', 'nomina', 'edit', NULL, 1),
        ('ADMIN', 'nomina', 'delete', NULL, 1),
        ('ADMIN', 'reportes', 'view', NULL, 1),
        ('ADMIN', 'reportes', 'create', NULL, 1),
        ('ADMIN', 'maestros', 'view', NULL, 1),
        ('ADMIN', 'maestros', 'edit', NULL, 1),

        ('RRHH', 'nomina', 'view', NULL, 1),
        ('RRHH', 'nomina', 'create', NULL, 1),
        ('RRHH', 'nomina', 'edit', NULL, 1),
        ('RRHH', 'reportes', 'view', NULL, 1),
        ('RRHH', 'maestros', 'view', NULL, 1),

        ('SUPERVISOR', 'nomina', 'view', NULL, 1),
        ('SUPERVISOR', 'reportes', 'view', NULL, 1),

        ('EMPLEADO', 'nomina', 'view', NULL, 1)
) AS SOURCE (COD_ROL, MODULO, ACCION, RECURSO, TIENE_ACCESO)
ON TARGET.COD_ROL = SOURCE.COD_ROL
   AND TARGET.MODULO = SOURCE.MODULO
   AND TARGET.ACCION = SOURCE.ACCION
WHEN NOT MATCHED BY TARGET THEN
    INSERT (COD_ROL, MODULO, ACCION, RECURSO, TIENE_ACCESO, ESTA_ACTIVO)
    VALUES (SOURCE.COD_ROL, SOURCE.MODULO, SOURCE.ACCION, SOURCE.RECURSO, SOURCE.TIENE_ACCESO, 1);

PRINT '✓ Permisos por defecto insertados/actualizados';

-- ============================================================================
-- 10. RESUMEN
-- ============================================================================

PRINT '
========================================
✓ SCHEMA DE AUTENTICACIÓN CREADO
========================================
Tablas creadas:
- GN_USUAR (Usuarios y control de sesiones)
- GN_SESION (Historial de sesiones)
- GN_ROL_USUAR (Roles por usuario)
- GN_PERMISOS (Permisos granulares)
- GN_LOG_ACCESO (Auditoría)

Procedimientos creados:
- SP_CREAR_USUARIO_DESDE_FUNCI
- SP_VALIDAR_LOGIN
- SP_REGISTRAR_SESION

Próximos pasos:
1. Ejecutar este script en SQL Server
2. Crear usuarios iniciales con SP_CREAR_USUARIO_DESDE_FUNCI
3. Implementar backend en Node.js
4. Crear página de login en HTML
========================================
';
