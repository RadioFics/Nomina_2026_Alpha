-- ============================================================================
-- 🔍 SCRIPT DE DIAGNÓSTICO - ESTADO DE USUARIOS Y AUTENTICACIÓN
-- ============================================================================

PRINT '
╔══════════════════════════════════════════════════════════════════════╗
║         DIAGNÓSTICO DE USUARIOS Y AUTENTICACIÓN                      ║
║         Base de Datos: MineDax                                       ║
╚══════════════════════════════════════════════════════════════════════╝
';

-- ============================================================================
-- 1. VERIFICAR QUE LAS TABLAS EXISTEN
-- ============================================================================

PRINT '
┌──────────────────────────────────────────────────────────────────────┐
│ 1️⃣  VERIFICAR TABLAS DE AUTENTICACIÓN                                │
└──────────────────────────────────────────────────────────────────────┘
';

SELECT
  TABLE_NAME AS [Tabla],
  CASE WHEN TABLE_NAME IN (
    'GN_USUAR', 'GN_SESION', 'GN_ROL_USUAR', 'GN_PERMISOS', 'GN_LOG_ACCESO'
  ) THEN '✓ Autenticación' ELSE '✓ Otra' END AS [Categoría]
FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_NAME IN (
  'GN_USUAR', 'GN_SESION', 'GN_ROL_USUAR', 'GN_PERMISOS', 'GN_LOG_ACCESO'
)
ORDER BY TABLE_NAME;

-- ============================================================================
-- 2. CONTAR USUARIOS EN GN_USUAR
-- ============================================================================

PRINT '
┌──────────────────────────────────────────────────────────────────────┐
│ 2️⃣  CANTIDAD DE USUARIOS REGISTRADOS                                 │
└──────────────────────────────────────────────────────────────────────┘
';

SELECT COUNT(*) AS [Total Usuarios] FROM GN_USUAR;

-- ============================================================================
-- 3. LISTAR TODOS LOS USUARIOS (SIN CONTRASEÑA)
-- ============================================================================

PRINT '
┌──────────────────────────────────────────────────────────────────────┐
│ 3️⃣  USUARIOS REGISTRADOS                                             │
└──────────────────────────────────────────────────────────────────────┘
';

SELECT
  ID_USUAR,
  CEDULA,
  NOMBRE_USUAR,
  EMAIL,
  NIVEL_USUAR AS [Nivel (1=Emp, 2=Sup, 3=Admin)],
  ESTA_ACTIVO AS [Activo],
  ESTA_BLOQUEADO AS [Bloqueado],
  INTENTOS_FALL AS [Intentos Fallidos],
  FECH_ULT_CAMBIO AS [Último Cambio Pass],
  FECH_PROX_CAMBIO AS [Próximo Cambio Requerido],
  FECH_CREACION AS [Creado]
FROM GN_USUAR
ORDER BY FECH_CREACION DESC;

-- ============================================================================
-- 4. VERIFICAR ESTRUCTURA DE GN_USUAR
-- ============================================================================

PRINT '
┌──────────────────────────────────────────────────────────────────────┐
│ 4️⃣  ESTRUCTURA DE TABLA GN_USUAR                                     │
└──────────────────────────────────────────────────────────────────────┘
';

SELECT
  COLUMN_NAME AS [Columna],
  DATA_TYPE AS [Tipo],
  IS_NULLABLE AS [Permite NULL],
  COLUMNPROPERTY(OBJECT_ID('GN_USUAR'), COLUMN_NAME, 'IsIdentity') AS [Identity]
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'GN_USUAR'
ORDER BY ORDINAL_POSITION;

-- ============================================================================
-- 5. VERIFICAR CONTRASEÑAS HASHEADAS
-- ============================================================================

PRINT '
┌──────────────────────────────────────────────────────────────────────┐
│ 5️⃣  VERIFICAR QUE CONTRASEÑAS ESTÁN HASHEADAS (bcrypt)               │
└──────────────────────────────────────────────────────────────────────┘
';

SELECT
  CEDULA,
  NOMBRE_USUAR,
  CASE
    WHEN PASSW_HASH LIKE '$2%' THEN '✓ bcrypt'
    WHEN LEN(PASSW_HASH) > 50 THEN '⚠ Hash (no bcrypt?)'
    WHEN LEN(PASSW_HASH) < 20 THEN '❌ Muy corto (¿texto plano?)'
    ELSE '❓ Desconocido'
  END AS [Tipo de Hash],
  LEN(PASSW_HASH) AS [Longitud],
  SUBSTRING(PASSW_HASH, 1, 20) + '...' AS [Primeros 20 caracteres]
FROM GN_USUAR
ORDER BY CEDULA;

-- ============================================================================
-- 6. VERIFICAR ROLES ASIGNADOS
-- ============================================================================

PRINT '
┌──────────────────────────────────────────────────────────────────────┐
│ 6️⃣  ROLES ASIGNADOS A USUARIOS                                       │
└──────────────────────────────────────────────────────────────────────┘
';

SELECT
  u.CEDULA,
  u.NOMBRE_USUAR,
  r.COD_ROL,
  r.NOM_ROL,
  r.ESTA_ACTIVO AS [Rol Activo]
FROM GN_USUAR u
LEFT JOIN GN_ROL_USUAR r ON u.ID_USUAR = r.ID_USUAR
ORDER BY u.CEDULA, r.COD_ROL;

-- ============================================================================
-- 7. VERIFICAR PERMISOS POR ROL
-- ============================================================================

PRINT '
┌──────────────────────────────────────────────────────────────────────┐
│ 7️⃣  PERMISOS CONFIGURADOS POR ROL                                    │
└──────────────────────────────────────────────────────────────────────┘
';

SELECT
  COD_ROL,
  MODULO,
  ACCION,
  TIENE_ACCESO AS [Acceso],
  ESTA_ACTIVO AS [Activo]
FROM GN_PERMISOS
WHERE ESTA_ACTIVO = 1
ORDER BY COD_ROL, MODULO, ACCION;

-- ============================================================================
-- 8. ÚLTIMAS SESIONES
-- ============================================================================

PRINT '
┌──────────────────────────────────────────────────────────────────────┐
│ 8️⃣  ÚLTIMAS SESIONES (GN_SESION)                                     │
└──────────────────────────────────────────────────────────────────────┘
';

SELECT TOP 10
  s.ID_SESION,
  s.CEDULA,
  s.FECH_INICIO,
  s.FECH_ULTIMA_ACT,
  s.FECH_CIERRE,
  s.IP_DIRECCION,
  s.DISPOSITIVO,
  s.ESTA_ACTIVA AS [Activa]
FROM GN_SESION s
ORDER BY s.FECH_INICIO DESC;

-- ============================================================================
-- 9. ÚLTIMOS ACCESOS / ERRORES
-- ============================================================================

PRINT '
┌──────────────────────────────────────────────────────────────────────┐
│ 9️⃣  ÚLTIMOS EVENTOS DE ACCESO (GN_LOG_ACCESO)                        │
└──────────────────────────────────────────────────────────────────────┘
';

SELECT TOP 20
  CEDULA,
  TIPO_EVENTO,
  ESTADO,
  MENSAJE,
  IP_DIRECCION,
  FECH_EVENTO
FROM GN_LOG_ACCESO
ORDER BY FECH_EVENTO DESC;

-- ============================================================================
-- 10. PROCEDIMIENTOS ALMACENADOS
-- ============================================================================

PRINT '
┌──────────────────────────────────────────────────────────────────────┐
│ 🔟  PROCEDIMIENTOS ALMACENADOS PARA AUTENTICACIÓN                    │
└──────────────────────────────────────────────────────────────────────┘
';

SELECT
  ROUTINE_NAME,
  ROUTINE_TYPE
FROM INFORMATION_SCHEMA.ROUTINES
WHERE ROUTINE_NAME LIKE 'SP_%'
  AND ROUTINE_SCHEMA = 'dbo'
ORDER BY ROUTINE_NAME;

-- ============================================================================
-- 11. RESUMEN Y RECOMENDACIONES
-- ============================================================================

PRINT '
╔══════════════════════════════════════════════════════════════════════╗
║                    RESUMEN Y RECOMENDACIONES                         ║
╚══════════════════════════════════════════════════════════════════════╝
';

DECLARE @totalUsuarios INT = (SELECT COUNT(*) FROM GN_USUAR);
DECLARE @usuariosActivos INT = (SELECT COUNT(*) FROM GN_USUAR WHERE ESTA_ACTIVO = 1);
DECLARE @usuariosBloqueados INT = (SELECT COUNT(*) FROM GN_USUAR WHERE ESTA_BLOQUEADO = 1);

PRINT '📊 ESTADÍSTICAS:';
PRINT '  • Total de usuarios: ' + CAST(@totalUsuarios AS VARCHAR);
PRINT '  • Usuarios activos: ' + CAST(@usuariosActivos AS VARCHAR);
PRINT '  • Usuarios bloqueados: ' + CAST(@usuariosBloqueados AS VARCHAR);
PRINT '';

IF @totalUsuarios = 0
  PRINT '⚠️  PROBLEMA: No hay usuarios registrados. Necesitas crear al menos un usuario admin.';
ELSE
  PRINT '✓ Hay usuarios registrados.';

PRINT '';
PRINT 'Para crear un usuario, ejecuta:';
PRINT '  node create-admin.js';
PRINT '';
PRINT 'Para ver esta información de nuevo, ejecuta:';
PRINT '  Este script (DIAGNOSTICO_USUARIOS.sql)';
PRINT '';

PRINT '
╔══════════════════════════════════════════════════════════════════════╗
║                        FIN DEL DIAGNÓSTICO                           ║
╚══════════════════════════════════════════════════════════════════════╝
';
