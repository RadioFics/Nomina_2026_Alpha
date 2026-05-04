-- ============================================================================
-- 👤 SCRIPT PARA CREAR/EDITAR USUARIOS EN GN_USUAR
-- ============================================================================
-- INSTRUCCIONES:
-- 1. Edita los valores en la sección "CONFIGURACIÓN"
-- 2. Ejecuta TODO el script (no solo partes)
-- 3. Verifica los resultados al final
-- ============================================================================

PRINT '
╔══════════════════════════════════════════════════════════════════════╗
║                  CREAR USUARIO EN GN_USUAR                           ║
╚══════════════════════════════════════════════════════════════════════╝
';

-- ============================================================================
-- ⚙️ CONFIGURACIÓN - EDITA ESTOS VALORES
-- ============================================================================

DECLARE @cedula VARCHAR(20) = '1111111111';                    -- ✏️ TU CÉDULA
DECLARE @nombre VARCHAR(100) = 'Administrador';               -- ✏️ TU NOMBRE
DECLARE @email VARCHAR(100) = 'admin@mining.com';             -- ✏️ TU EMAIL
DECLARE @passHash VARCHAR(255) = '$2a$10$yG1FxHxL3nQZq8.Ao/V9g.yQmU2p9Z0UwJ0Z0UwJ0ZuJ0ZuJ0ZuJ0';
                                                               -- ✏️ HASH BCRYPT (ver instrucciones abajo)
DECLARE @nivel INT = 3;                                        -- ✏️ NIVEL: 1=Emp, 2=Sup, 3=Admin
DECLARE @depart VARCHAR(10) = 'ADMIN';                         -- ✏️ DEPARTAMENTO
DECLARE @cargo VARCHAR(10) = 'ADMIN';                          -- ✏️ CARGO
DECLARE @rol VARCHAR(20) = 'ADMIN';                            -- ✏️ ROL: ADMIN, RRHH, SUPERVISOR, EMPLEADO
DECLARE @activo BIT = 1;                                       -- ✏️ ACTIVO: 1=Sí, 0=No

-- ============================================================================
-- 📋 INSTRUCCIONES PARA GENERAR HASH BCRYPT
-- ============================================================================
/*
OPCIÓN 1: Desde PowerShell en VS Code
┌──────────────────────────────────────────────────────────────────────┐
1. Abre Terminal en VS Code (Ctrl+`)
2. Escribe: node
3. Luego copia y pega esto:
   const bcrypt = require('bcryptjs');
   bcrypt.hash('TU_CONTRASEÑA_AQUI', 10).then(h => console.log(h))
4. Te mostrará algo como: $2a$10$yG1FxHxL3nQZq8.Ao/V9g.yQmU2p9Z0UwJ...
5. Copia ese resultado y reemplaza en @passHash arriba
6. Escribe: exit
└──────────────────────────────────────────────────────────────────────┘

OPCIÓN 2: Desde Node directo
┌──────────────────────────────────────────────────────────────────────┐
node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('Admin@123456', 10).then(h => console.log(h))"
└──────────────────────────────────────────────────────────────────────┘

Luego copias el resultado en @passHash
*/

-- ============================================================================
-- 🔍 PASO 1: VERIFICAR SI EL USUARIO YA EXISTE
-- ============================================================================

PRINT '
┌──────────────────────────────────────────────────────────────────────┐
│ PASO 1: Verificando si el usuario ya existe...                       │
└──────────────────────────────────────────────────────────────────────┘
';

DECLARE @usuarioExistente INT = (SELECT COUNT(*) FROM GN_USUAR WHERE CEDULA = @cedula);

IF @usuarioExistente > 0
BEGIN
    PRINT '⚠️  El usuario con cédula ' + @cedula + ' YA EXISTE';
    PRINT '';
    PRINT 'Opciones:';
    PRINT '1. Editar el usuario existente (reemplazar contraseña)';
    PRINT '2. Crear con otra cédula';
    PRINT '';

    -- Mostrar usuario actual
    SELECT
        ID_USUAR,
        CEDULA,
        NOMBRE_USUAR,
        EMAIL,
        NIVEL_USUAR,
        ESTA_ACTIVO,
        FECH_CREACION
    FROM GN_USUAR
    WHERE CEDULA = @cedula;
END
ELSE
BEGIN
    PRINT '✓ El usuario no existe. Procederemos a crearlo.';
END

PRINT '';

-- ============================================================================
-- 🔄 PASO 2: ELIMINAR USUARIO ANTERIOR (SI EXISTE)
-- ============================================================================
-- Descomenta si quieres reemplazar el usuario anterior

/*
PRINT '
┌──────────────────────────────────────────────────────────────────────┐
│ PASO 2: Eliminando usuario anterior...                               │
└──────────────────────────────────────────────────────────────────────┘
';

-- Eliminar de GN_ROL_USUAR
DELETE FROM GN_ROL_USUAR
WHERE ID_USUAR = (SELECT ID_USUAR FROM GN_USUAR WHERE CEDULA = @cedula);

-- Eliminar de GN_USUAR
DELETE FROM GN_USUAR WHERE CEDULA = @cedula;

PRINT '✓ Usuario anterior eliminado (si existía)';
PRINT '';
*/

-- ============================================================================
-- ✅ PASO 3: CREAR NUEVO USUARIO
-- ============================================================================

PRINT '
┌──────────────────────────────────────────────────────────────────────┐
│ PASO 3: Creando usuario...                                           │
└──────────────────────────────────────────────────────────────────────┘
';

-- Solo si no existe
IF @usuarioExistente = 0
BEGIN
    DECLARE @ID_USUAR UNIQUEIDENTIFIER = NEWID();

    INSERT INTO GN_USUAR (
        ID_USUAR,
        CEDULA,
        NOMBRE_USUAR,
        PASSW_HASH,
        EMAIL,
        COD_DEPART,
        COD_CARGO,
        NIVEL_USUAR,
        ESTA_ACTIVO,
        USUAR_CREACION,
        FECH_CREACION,
        FECH_PROX_CAMBIO
    )
    VALUES (
        @ID_USUAR,
        @cedula,
        @nombre,
        @passHash,
        @email,
        @depart,
        @cargo,
        @nivel,
        @activo,
        'SISTEMA',
        GETDATE(),
        DATEADD(DAY, 90, GETDATE())
    );

    PRINT '✓ Usuario creado en GN_USUAR';
    PRINT '  ID: ' + CAST(@ID_USUAR AS VARCHAR(MAX));
    PRINT '';

    -- ========================================================================
    -- 🎯 PASO 4: ASIGNAR ROL AL USUARIO
    -- ========================================================================

    PRINT '
┌──────────────────────────────────────────────────────────────────────┐
│ PASO 4: Asignando rol...                                             │
└──────────────────────────────────────────────────────────────────────┘
';

    INSERT INTO GN_ROL_USUAR (
        ID_USUAR,
        COD_ROL,
        NOM_ROL,
        ESTA_ACTIVO,
        FECH_CREACION
    )
    VALUES (
        @ID_USUAR,
        @rol,
        CASE
            WHEN @rol = 'ADMIN' THEN 'Administrador'
            WHEN @rol = 'RRHH' THEN 'Recursos Humanos'
            WHEN @rol = 'SUPERVISOR' THEN 'Supervisor'
            WHEN @rol = 'EMPLEADO' THEN 'Empleado'
            ELSE @rol
        END,
        1,
        GETDATE()
    );

    PRINT '✓ Rol ' + @rol + ' asignado';
    PRINT '';

END
ELSE
BEGIN
    PRINT '⚠️  Usuario ya existe. Saltando creación.';
    PRINT 'Para editar, elimina el usuario primero o ejecuta esta query:';
    PRINT '';
    PRINT 'UPDATE GN_USUAR SET PASSW_HASH = ''' + @passHash + ''' WHERE CEDULA = ''' + @cedula + ''';';
    PRINT '';
END

-- ============================================================================
-- 📊 PASO 5: VERIFICAR RESULTADO
-- ============================================================================

PRINT '
┌──────────────────────────────────────────────────────────────────────┐
│ PASO 5: Verificando resultado...                                     │
└──────────────────────────────────────────────────────────────────────┘
';

SELECT
    ID_USUAR,
    CEDULA,
    NOMBRE_USUAR,
    EMAIL,
    NIVEL_USUAR AS [Nivel],
    ESTA_ACTIVO AS [Activo],
    COD_DEPART AS [Departamento],
    COD_CARGO AS [Cargo],
    FECH_CREACION AS [Creado]
FROM GN_USUAR
WHERE CEDULA = @cedula;

-- Mostrar rol
SELECT
    r.COD_ROL,
    r.NOM_ROL,
    r.ESTA_ACTIVO AS [Activo]
FROM GN_ROL_USUAR r
JOIN GN_USUAR u ON r.ID_USUAR = u.ID_USUAR
WHERE u.CEDULA = @cedula;

PRINT '';
PRINT '
╔══════════════════════════════════════════════════════════════════════╗
║                        ✅ USUARIO LISTO                              ║
╚══════════════════════════════════════════════════════════════════════╝
';

PRINT '🔐 Datos de acceso:';
PRINT '  Cédula/Email: ' + @cedula;
PRINT '  Contraseña: (la que usaste para generar el hash)';
PRINT '  Nivel: ' + CAST(@nivel AS VARCHAR);
PRINT '  Rol: ' + @rol;
PRINT '';
PRINT '🚀 Puedes acceder en: http://localhost:3000';
PRINT '';
