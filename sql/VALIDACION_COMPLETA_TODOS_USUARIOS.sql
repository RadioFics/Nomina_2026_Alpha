-- ============================================================================
-- VALIDACIÓN COMPLETA DE LOGIN — TODOS LOS USUARIOS
-- BD: MineDax | Servidor: CM-ITD-P-05\SQLEXPRESS
-- Fecha: 2026-04-13
-- Propósito: Detectar TODOS los problemas de login en el sistema
-- ============================================================================

USE MineDax
GO

-- ============================================================================
-- SECCIÓN 1: DIAGNÓSTICO RÁPIDO DE TODOS LOS USUARIOS
-- ============================================================================

PRINT '╔════════════════════════════════════════════════════════════════════════════════╗'
PRINT '║               DIAGNÓSTICO RÁPIDO - TODOS LOS USUARIOS                          ║'
PRINT '╚════════════════════════════════════════════════════════════════════════════════╝'
PRINT ''

SELECT
    u.COD_USUA                                          AS [ID],
    RTRIM(u.ABR_USUA)                                   AS [Login],
    SUBSTRING(u.NOM_USUA, 1, 25)                        AS [Nombre],
    t.NUM_IDEN                                          AS [Cédula],
    -- Verificación 1: ¿Activo?
    CASE
        WHEN u.ACT_INAC = 'A' THEN '✅'
        ELSE '❌ (' + ISNULL(u.ACT_INAC, 'NULL') + ')'
    END                                                 AS [1.Act],
    -- Verificación 2: ¿Web habilitado?
    CASE
        WHEN u.USU_TWEB = 'S' THEN '✅'
        ELSE '❌ (' + ISNULL(u.USU_TWEB, 'NULL') + ')'
    END                                                 AS [2.Web],
    -- Verificación 3: ¿No bloqueado?
    CASE
        WHEN u.IND_BLOQ = 'N' THEN '✅'
        ELSE '❌ (' + ISNULL(u.IND_BLOQ, 'NULL') + ')'
    END                                                 AS [3.Bloq],
    -- Verificación 4: ¿Hash válido?
    CASE
        WHEN u.PAS_HASH IS NULL THEN '❌ NULL'
        WHEN LEN(u.PAS_HASH) < 60 THEN '❌ ' + CAST(LEN(u.PAS_HASH) AS VARCHAR) + 'c'
        WHEN u.PAS_HASH LIKE '$2%' THEN '✅'
        ELSE '⚠️ '
    END                                                 AS [4.Hash],
    -- Verificación 5: ¿Expirado?
    CASE
        WHEN u.FEC_EXPI IS NULL THEN '✅'
        WHEN u.FEC_EXPI >= GETDATE() THEN '✅'
        ELSE '❌ ' + CONVERT(VARCHAR(10), u.FEC_EXPI, 103)
    END                                                 AS [5.Exp],
    -- Resumen final
    CASE
        WHEN u.ACT_INAC = 'A'
         AND u.USU_TWEB = 'S'
         AND u.IND_BLOQ = 'N'
         AND u.PAS_HASH LIKE '$2%'
         AND LEN(u.PAS_HASH) >= 60
         AND (u.FEC_EXPI IS NULL OR u.FEC_EXPI >= GETDATE())
        THEN '✅ PUEDE LOGUEAR'
        ELSE '❌ NO PUEDE LOGUEAR'
    END                                                 AS [RESULTADO]
FROM dbo.GN_USUAR u
LEFT JOIN dbo.GN_FUNCI f ON u.COD_EMPR = f.COD_EMPR AND u.COD_FUNCI = f.COD_FUNCI
LEFT JOIN dbo.GN_TERCE t ON f.COD_TERC = t.COD_TERC
ORDER BY u.COD_USUA

PRINT ''
PRINT 'Leyenda:'
PRINT '  1.Act = Activo (ACT_INAC = A)'
PRINT '  2.Web = Web habilitado (USU_TWEB = S)'
PRINT '  3.Bloq = No bloqueado (IND_BLOQ = N)'
PRINT '  4.Hash = Hash bcrypt válido (>= 60 chars)'
PRINT '  5.Exp = No expirado (FEC_EXPI >= GETDATE())'
PRINT ''
PRINT ''

-- ============================================================================
-- SECCIÓN 2: ANÁLISIS DETALLADO DE PROBLEMAS
-- ============================================================================

PRINT '╔════════════════════════════════════════════════════════════════════════════════╗'
PRINT '║                     ANÁLISIS DETALLADO DE PROBLEMAS                            ║'
PRINT '╚════════════════════════════════════════════════════════════════════════════════╝'
PRINT ''

-- Problema 1: Usuarios inactivos
PRINT '❌ PROBLEMA 1: USUARIOS INACTIVOS'
PRINT '─────────────────────────────────────────────────────────────────────────────────'

SELECT
    u.COD_USUA,
    RTRIM(u.ABR_USUA) AS [Login],
    RTRIM(u.NOM_USUA) AS [Nombre],
    u.ACT_INAC AS [Estado],
    'Cambiar ACT_INAC a "A"' AS [SOLUCIÓN]
FROM dbo.GN_USUAR u
WHERE u.ACT_INAC <> 'A'

IF @@ROWCOUNT = 0 PRINT '  ✅ No hay usuarios inactivos'
PRINT ''

-- Problema 2: Web no habilitado
PRINT '❌ PROBLEMA 2: WEB NO HABILITADO'
PRINT '─────────────────────────────────────────────────────────────────────────────────'

SELECT
    u.COD_USUA,
    RTRIM(u.ABR_USUA) AS [Login],
    RTRIM(u.NOM_USUA) AS [Nombre],
    u.USU_TWEB AS [Estado Web],
    'Cambiar USU_TWEB a "S"' AS [SOLUCIÓN]
FROM dbo.GN_USUAR u
WHERE u.USU_TWEB <> 'S'

IF @@ROWCOUNT = 0 PRINT '  ✅ Todos los usuarios tienen web habilitado'
PRINT ''

-- Problema 3: Usuarios bloqueados
PRINT '❌ PROBLEMA 3: USUARIOS BLOQUEADOS'
PRINT '─────────────────────────────────────────────────────────────────────────────────'

SELECT
    u.COD_USUA,
    RTRIM(u.ABR_USUA) AS [Login],
    RTRIM(u.NOM_USUA) AS [Nombre],
    u.IND_BLOQ AS [Bloqueado],
    u.INT_FALL AS [Intentos Fallidos],
    'Cambiar IND_BLOQ a "N" y resetear INT_FALL' AS [SOLUCIÓN]
FROM dbo.GN_USUAR u
WHERE u.IND_BLOQ <> 'N'

IF @@ROWCOUNT = 0 PRINT '  ✅ No hay usuarios bloqueados'
PRINT ''

-- Problema 4: Hash inválido o incompleto
PRINT '❌ PROBLEMA 4: HASH BCRYPT INVÁLIDO O INCOMPLETO'
PRINT '─────────────────────────────────────────────────────────────────────────────────'

SELECT
    u.COD_USUA,
    RTRIM(u.ABR_USUA) AS [Login],
    RTRIM(u.NOM_USUA) AS [Nombre],
    CASE
        WHEN u.PAS_HASH IS NULL THEN 'NULL'
        WHEN u.PAS_HASH = '' THEN 'VACÍO'
        WHEN NOT u.PAS_HASH LIKE '$2%' THEN 'NO BCRYPT'
        WHEN LEN(u.PAS_HASH) < 60 THEN 'INCOMPLETO (' + CAST(LEN(u.PAS_HASH) AS VARCHAR) + 'c)'
        ELSE 'VÁLIDO'
    END                                                 AS [Estado Hash],
    'Generar nuevo hash bcrypt válido' AS [SOLUCIÓN]
FROM dbo.GN_USUAR u
WHERE u.PAS_HASH IS NULL
   OR u.PAS_HASH = ''
   OR NOT u.PAS_HASH LIKE '$2%'
   OR LEN(u.PAS_HASH) < 60

IF @@ROWCOUNT = 0 PRINT '  ✅ Todos los hashes son válidos'
PRINT ''

-- Problema 5: Contraseñas expiradas
PRINT '❌ PROBLEMA 5: CONTRASEÑAS EXPIRADAS'
PRINT '─────────────────────────────────────────────────────────────────────────────────'

SELECT
    u.COD_USUA,
    RTRIM(u.ABR_USUA) AS [Login],
    RTRIM(u.NOM_USUA) AS [Nombre],
    u.FEC_EXPI AS [Expiración],
    DATEDIFF(DAY, GETDATE(), u.FEC_EXPI) AS [Días Restantes],
    CASE
        WHEN DATEDIFF(DAY, GETDATE(), u.FEC_EXPI) <= 0 THEN 'EXPIRADO HOY O ANTES'
        WHEN DATEDIFF(DAY, GETDATE(), u.FEC_EXPI) <= 7 THEN 'EXPIRA EN ' + CAST(DATEDIFF(DAY, GETDATE(), u.FEC_EXPI) AS VARCHAR) + ' DÍAS'
        ELSE 'VIGENTE'
    END                                                 AS [Estado],
    'Extender FEC_EXPI o resetear a NULL' AS [SOLUCIÓN]
FROM dbo.GN_USUAR u
WHERE u.FEC_EXPI IS NOT NULL
  AND u.FEC_EXPI < GETDATE()

IF @@ROWCOUNT = 0 PRINT '  ✅ No hay contraseñas expiradas'
PRINT ''

-- Problema 6: Sin grupo/rol asignado
PRINT '❌ PROBLEMA 6: SIN GRUPO O GRUPO INACTIVO'
PRINT '─────────────────────────────────────────────────────────────────────────────────'

SELECT
    u.COD_USUA,
    RTRIM(u.ABR_USUA) AS [Login],
    RTRIM(u.NOM_USUA) AS [Nombre],
    u.COD_GUSU AS [Cod Grupo],
    RTRIM(ISNULL(g.NOM_GUSU, 'SIN GRUPO')) AS [Nombre Grupo],
    ISNULL(g.ACT_ESTA, 'NULL') AS [Estado Grupo],
    'Asignar grupo activo al usuario' AS [SOLUCIÓN]
FROM dbo.GN_USUAR u
LEFT JOIN dbo.GN_GUSUA g ON u.COD_GUSU = g.COD_GUSU
WHERE u.COD_GUSU IS NULL
   OR u.COD_GUSU = 0
   OR (g.ACT_ESTA IS NOT NULL AND g.ACT_ESTA <> 'A')

IF @@ROWCOUNT = 0 PRINT '  ✅ Todos los usuarios tienen grupo válido'
PRINT ''

-- ============================================================================
-- SECCIÓN 3: ESTADO DE SESIONES ACTIVAS
-- ============================================================================

PRINT '╔════════════════════════════════════════════════════════════════════════════════╗'
PRINT '║                      SESIONES ACTIVAS ACTUALMENTE                              ║'
PRINT '╚════════════════════════════════════════════════════════════════════════════════╝'
PRINT ''

SELECT
    s.COD_SESI AS [ID Sesión],
    s.COD_USUA AS [ID Usuario],
    RTRIM(u.ABR_USUA) AS [Login],
    RTRIM(u.NOM_USUA) AS [Nombre],
    s.FEC_INIC AS [Inicio],
    s.FEC_ULAC AS [Última Actividad],
    DATEDIFF(MINUTE, s.FEC_ULAC, GETDATE()) AS [Inactiva (minutos)],
    s.IP_ORIG AS [IP],
    s.DIS_TIPO AS [Dispositivo],
    s.EST_SESI AS [Estado]
FROM dbo.GN_SESION s
LEFT JOIN dbo.GN_USUAR u ON s.COD_USUA = u.COD_USUA
WHERE s.EST_SESI = 'A'
ORDER BY s.FEC_INIC DESC

IF @@ROWCOUNT = 0 PRINT '  ℹ️  No hay sesiones activas en este momento'
PRINT ''

-- ============================================================================
-- SECCIÓN 4: ÚLTIMOS EVENTOS DE LOGIN
-- ============================================================================

PRINT '╔════════════════════════════════════════════════════════════════════════════════╗'
PRINT '║                   ÚLTIMOS 20 EVENTOS DE LOGIN/ACCESO                           ║'
PRINT '╚════════════════════════════════════════════════════════════════════════════════╝'
PRINT ''

SELECT TOP 20
    l.COD_USUA AS [ID Usuario],
    RTRIM(u.ABR_USUA) AS [Login],
    l.TIP_EVEN AS [Tipo Evento],
    l.EST_EVEN AS [Estado],
    l.FEC_EVEN AS [Fecha/Hora],
    l.IP_ORIG AS [IP],
    SUBSTRING(l.DES_EVEN, 1, 50) AS [Detalle]
FROM dbo.GN_LOG_ACCE l
LEFT JOIN dbo.GN_USUAR u ON l.COD_USUA = u.COD_USUA
ORDER BY l.FEC_EVEN DESC

PRINT ''

-- ============================================================================
-- SECCIÓN 5: SCRIPT DE CORRECCIÓN AUTOMÁTICA
-- ============================================================================

PRINT '╔════════════════════════════════════════════════════════════════════════════════╗'
PRINT '║              SCRIPT DE CORRECCIÓN AUTOMÁTICA (DESCOMENTA PARA USAR)            ║'
PRINT '╚════════════════════════════════════════════════════════════════════════════════╝'
PRINT ''

PRINT '/*'
PRINT 'BEGIN TRANSACTION'
PRINT ''
PRINT '-- Reactivar usuarios'
PRINT 'UPDATE dbo.GN_USUAR SET ACT_INAC = "A" WHERE ACT_INAC <> "A"'
PRINT ''
PRINT '-- Habilitar web'
PRINT 'UPDATE dbo.GN_USUAR SET USU_TWEB = "S" WHERE USU_TWEB <> "S"'
PRINT ''
PRINT '-- Desbloquear y resetear intentos'
PRINT 'UPDATE dbo.GN_USUAR SET IND_BLOQ = "N", INT_FALL = 0 WHERE IND_BLOQ <> "N"'
PRINT ''
PRINT '-- Resetear fechas expiradas'
PRINT 'UPDATE dbo.GN_USUAR SET FEC_EXPI = NULL WHERE FEC_EXPI IS NOT NULL AND FEC_EXPI < GETDATE()'
PRINT ''
PRINT 'COMMIT TRANSACTION'
PRINT '*/'

PRINT ''
PRINT '════════════════════════════════════════════════════════════════════════════════'
PRINT 'FIN DEL DIAGNÓSTICO'
PRINT '════════════════════════════════════════════════════════════════════════════════'
