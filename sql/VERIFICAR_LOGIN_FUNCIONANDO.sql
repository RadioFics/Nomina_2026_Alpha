-- ============================================================================
-- 🔍 VERIFICAR QUE EL LOGIN ESTÁ FUNCIONANDO
-- Ejecuta este script MIENTRAS intentas hacer login
-- ============================================================================

PRINT '
╔══════════════════════════════════════════════════════════════════════╗
║         MONITOREO DE LOGIN EN TIEMPO REAL                            ║
║         Base de Datos: MineDax                                       ║
╚══════════════════════════════════════════════════════════════════════╝
';

-- ============================================================================
-- 1. USUARIOS REGISTRADOS (SIN CONTRASEÑA)
-- ============================================================================

PRINT '
┌──────────────────────────────────────────────────────────────────────┐
│ 1️⃣  TODOS LOS USUARIOS EN GN_USUAR                                   │
└──────────────────────────────────────────────────────────────────────┘
';

SELECT
  ID_USUAR,
  CEDULA,
  NOMBRE_USUAR,
  EMAIL,
  NIVEL_USUAR AS [Nivel],
  ESTA_ACTIVO AS [Activo],
  ESTA_BLOQUEADO AS [Bloqueado],
  INTENTOS_FALL AS [Intentos Fallidos],
  FECH_CREACION AS [Creado],
  FECH_ULT_CAMBIO AS [Último Cambio Pass]
FROM GN_USUAR
ORDER BY FECH_CREACION DESC;

-- ============================================================================
-- 2. SESIONES ACTIVAS (GN_SESION)
-- ============================================================================

PRINT '
┌──────────────────────────────────────────────────────────────────────┐
│ 2️⃣  SESIONES ACTIVAS - USUARIOS CONECTADOS AHORA MISMO               │
└──────────────────────────────────────────────────────────────────────┘
';

SELECT
  s.ID_SESION,
  u.CEDULA,
  u.NOMBRE_USUAR,
  s.FECH_INICIO AS [Conectado a las],
  s.FECH_ULTIMA_ACT AS [Última Actividad],
  DATEDIFF(MINUTE, s.FECH_INICIO, GETDATE()) AS [Min desde conexión],
  s.IP_DIRECCION AS [IP],
  s.DISPOSITIVO,
  s.ESTA_ACTIVA AS [Activa]
FROM GN_SESION s
JOIN GN_USUAR u ON s.ID_USUAR = u.ID_USUAR
WHERE s.ESTA_ACTIVA = 1
ORDER BY s.FECH_INICIO DESC;

-- ============================================================================
-- 3. TODAS LAS SESIONES (INCLUIDAS CERRADAS)
-- ============================================================================

PRINT '
┌──────────────────────────────────────────────────────────────────────┐
│ 3️⃣  HISTORIAL DE SESIONES (ÚLTIMAS 10)                               │
└──────────────────────────────────────────────────────────────────────┘
';

SELECT TOP 10
  s.ID_SESION,
  u.CEDULA,
  u.NOMBRE_USUAR,
  s.FECH_INICIO,
  s.FECH_CIERRE,
  CASE
    WHEN s.FECH_CIERRE IS NULL THEN '🟢 Activa'
    ELSE '🔴 Cerrada'
  END AS [Estado],
  DATEDIFF(MINUTE, s.FECH_INICIO, ISNULL(s.FECH_CIERRE, GETDATE())) AS [Duración Min],
  s.IP_DIRECCION,
  s.DISPOSITIVO
FROM GN_SESION s
JOIN GN_USUAR u ON s.ID_USUAR = u.ID_USUAR
ORDER BY s.FECH_INICIO DESC;

-- ============================================================================
-- 4. LOG DE ACCESOS (ÚLTIMOS EVENTOS)
-- ============================================================================

PRINT '
┌──────────────────────────────────────────────────────────────────────┐
│ 4️⃣  LOG DE ACCESOS - ÚLTIMOS 15 EVENTOS                              │
└──────────────────────────────────────────────────────────────────────┘
';

SELECT TOP 15
  CEDULA,
  TIPO_EVENTO,
  ESTADO,
  MENSAJE,
  IP_DIRECCION,
  FECH_EVENTO,
  DATEDIFF(MINUTE, FECH_EVENTO, GETDATE()) AS [Min desde evento]
FROM GN_LOG_ACCESO
ORDER BY FECH_EVENTO DESC;

-- ============================================================================
-- 5. CONTEO DE EVENTOS POR TIPO
-- ============================================================================

PRINT '
┌──────────────────────────────────────────────────────────────────────┐
│ 5️⃣  RESUMEN DE EVENTOS (últimas 24 horas)                            │
└──────────────────────────────────────────────────────────────────────┘
';

SELECT
  TIPO_EVENTO,
  ESTADO,
  COUNT(*) AS [Cantidad],
  MAX(FECH_EVENTO) AS [Último evento]
FROM GN_LOG_ACCESO
WHERE FECH_EVENTO > DATEADD(HOUR, -24, GETDATE())
GROUP BY TIPO_EVENTO, ESTADO
ORDER BY TIPO_EVENTO, ESTADO;

-- ============================================================================
-- 6. INTENTOS DE LOGIN (EXITOSOS Y FALLIDOS)
-- ============================================================================

PRINT '
┌──────────────────────────────────────────────────────────────────────┐
│ 6️⃣  INTENTOS DE LOGIN (últimas 24 horas)                             │
└──────────────────────────────────────────────────────────────────────┘
';

SELECT
  CEDULA,
  TIPO_EVENTO,
  ESTADO,
  COUNT(*) AS [Intentos],
  MIN(FECH_EVENTO) AS [Primer intento],
  MAX(FECH_EVENTO) AS [Último intento]
FROM GN_LOG_ACCESO
WHERE TIPO_EVENTO = 'LOGIN'
  AND FECH_EVENTO > DATEADD(HOUR, -24, GETDATE())
GROUP BY CEDULA, TIPO_EVENTO, ESTADO
ORDER BY CEDULA, ESTADO DESC;

-- ============================================================================
-- 7. VERIFICAR INTEGRIDAD DE DATOS
-- ============================================================================

PRINT '
┌──────────────────────────────────────────────────────────────────────┐
│ 7️⃣  VERIFICAR INTEGRIDAD DE DATOS                                    │
└──────────────────────────────────────────────────────────────────────┘
';

DECLARE @totalUsuarios INT = (SELECT COUNT(*) FROM GN_USUAR);
DECLARE @usuariosActivos INT = (SELECT COUNT(*) FROM GN_USUAR WHERE ESTA_ACTIVO = 1);
DECLARE @sesionesActivas INT = (SELECT COUNT(*) FROM GN_SESION WHERE ESTA_ACTIVA = 1);
DECLARE @totalEventos INT = (SELECT COUNT(*) FROM GN_LOG_ACCESO);
DECLARE @eventosHoy INT = (SELECT COUNT(*) FROM GN_LOG_ACCESO WHERE FECH_EVENTO > CAST(GETDATE() AS DATE));

PRINT '📊 ESTADÍSTICAS:';
PRINT '  Total de usuarios: ' + CAST(@totalUsuarios AS VARCHAR);
PRINT '  Usuarios activos: ' + CAST(@usuariosActivos AS VARCHAR);
PRINT '  Sesiones activas AHORA: ' + CAST(@sesionesActivas AS VARCHAR);
PRINT '  Total de eventos registrados: ' + CAST(@totalEventos AS VARCHAR);
PRINT '  Eventos de hoy: ' + CAST(@eventosHoy AS VARCHAR);
PRINT '';

-- Verificar usuarios sin contraseña
DECLARE @sinPass INT = (SELECT COUNT(*) FROM GN_USUAR WHERE PASSW_HASH IS NULL OR PASSW_HASH = '');
IF @sinPass > 0
  PRINT '⚠️  PROBLEMA: ' + CAST(@sinPass AS VARCHAR) + ' usuario(s) sin contraseña hasheada';
ELSE
  PRINT '✓ Todos los usuarios tienen contraseña hasheada';

-- Verificar roles asignados
DECLARE @sinRol INT = (SELECT COUNT(u.ID_USUAR) FROM GN_USUAR u
                       LEFT JOIN GN_ROL_USUAR r ON u.ID_USUAR = r.ID_USUAR
                       WHERE r.ID_USUAR IS NULL);
IF @sinRol > 0
  PRINT '⚠️  PROBLEMA: ' + CAST(@sinRol AS VARCHAR) + ' usuario(s) sin roles asignados';
ELSE
  PRINT '✓ Todos los usuarios tienen roles asignados';

PRINT '';

-- ============================================================================
-- 8. ROLES Y PERMISOS DE CADA USUARIO
-- ============================================================================

PRINT '
┌──────────────────────────────────────────────────────────────────────┐
│ 8️⃣  ROLES Y PERMISOS POR USUARIO                                     │
└──────────────────────────────────────────────────────────────────────┘
';

SELECT
  u.CEDULA,
  u.NOMBRE_USUAR,
  u.NIVEL_USUAR AS [Nivel],
  r.COD_ROL AS [Rol],
  COUNT(p.ID_PERMISO) AS [Permisos]
FROM GN_USUAR u
LEFT JOIN GN_ROL_USUAR r ON u.ID_USUAR = r.ID_USUAR AND r.ESTA_ACTIVO = 1
LEFT JOIN GN_PERMISOS p ON r.COD_ROL = p.COD_ROL AND p.ESTA_ACTIVO = 1
GROUP BY u.CEDULA, u.NOMBRE_USUAR, u.NIVEL_USUAR, r.COD_ROL
ORDER BY u.CEDULA;

-- ============================================================================
-- 9. VERIFICAR ÚLTIMAS MODIFICACIONES
-- ============================================================================

PRINT '
┌──────────────────────────────────────────────────────────────────────┐
│ 9️⃣  ÚLTIMAS MODIFICACIONES EN GN_USUAR                               │
└──────────────────────────────────────────────────────────────────────┘
';

SELECT TOP 10
  ID_USUAR,
  CEDULA,
  NOMBRE_USUAR,
  FECH_CREACION AS [Creado],
  FECH_MODIF AS [Modificado],
  USUAR_CREACION AS [Creado Por],
  USUAR_MODIF AS [Modificado Por]
FROM GN_USUAR
WHERE FECH_CREACION > DATEADD(DAY, -7, GETDATE())
   OR FECH_MODIF > DATEADD(DAY, -7, GETDATE())
ORDER BY FECH_CREACION DESC;

-- ============================================================================
-- 10. RESUMEN Y RECOMENDACIONES
-- ============================================================================

PRINT '
╔══════════════════════════════════════════════════════════════════════╗
║                  ✅ VERIFICACIÓN COMPLETADA                          ║
╚══════════════════════════════════════════════════════════════════════╝
';

PRINT '
📋 QUÉ VERIFICAR:

1. ¿Aparece tu usuario en la sección "TODOS LOS USUARIOS"?
   → SÍ: ✅ Usuario está registrado
   → NO: ❌ El usuario no se creó

2. ¿Aparece una sesión activa en "SESIONES ACTIVAS"?
   → SÍ: ✅ Login funcionando
   → NO: ❌ El login no está registrando sesiones

3. ¿Hay eventos LOGIN exitosos en "LOG DE ACCESOS"?
   → SÍ: ✅ Login funcionando correctamente
   → NO: ❌ Los logins están fallando

4. ¿El estado de "SESIONES ACTIVAS" dice "Activa = 1"?
   → SÍ: ✅ Sesión se mantiene activa
   → NO: ❌ Las sesiones se cierran automáticamente

5. ¿Hay eventos de "CAMBIO_PASS" o "ACCESO_RECURSO"?
   → SÍ: ✅ El usuario está usando la aplicación
   → NO: ❌ Podría haber problema de permisos

🚀 PRÓXIMOS PASOS:

1. Ejecuta este script MIENTRAS intentas hacer login
2. Compara los datos ANTES y DESPUÉS de hacer login
3. Verifica que aparecen nuevos registros en GN_LOG_ACCESO
4. Verifica que aparecen nuevas sesiones en GN_SESION
5. Si todo aparece, ¡el login está funcionando! ✅

💡 TIP: Ejecuta este script cada vez que hagas login para
   monitorear en tiempo real qué está pasando en la BD.
';

PRINT '';
PRINT '⏰ Última ejecución: ' + CONVERT(VARCHAR, GETDATE(), 120);
PRINT '';
