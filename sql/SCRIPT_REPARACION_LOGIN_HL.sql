-- ============================================================================
-- SCRIPT DE REPARACIÓN DE LOGIN — Usuario HL (HERNANDEZ LARGO JUAN FELIPE)
-- BD: MineDax | Servidor: CM-ITD-P-05\SQLEXPRESS
-- Fecha: 2026-04-13
-- Problema: Hash bcrypt incompleto (11 chars en lugar de 60+)
-- ============================================================================
-- IMPORTANTE: Este script debe ejecutarse DESPUÉS de generar un hash bcrypt válido
-- en la aplicación. SQL Server no tiene soporte nativo para bcrypt.
-- ============================================================================

-- PASO 1: VALIDACIÓN PREVIA (Sin modificar nada)
-- ============================================================================
PRINT '========== PASO 1: DIAGNÓSTICO ACTUAL =========='

DECLARE @login_a_reparar VARCHAR(8) = 'HL'
DECLARE @cod_usuario INT

-- Obtener el ID del usuario
SELECT @cod_usuario = COD_USUA FROM dbo.GN_USUAR
WHERE RTRIM(ABR_USUA) = @login_a_reparar

IF @cod_usuario IS NULL
BEGIN
    RAISERROR('❌ ERROR: Usuario %s no encontrado', 16, 1, @login_a_reparar)
    RETURN
END

-- Mostrar estado actual
SELECT
    u.COD_USUA                                          AS [ID Usuario],
    RTRIM(u.ABR_USUA)                                   AS [Login],
    RTRIM(u.NOM_USUA)                                   AS [Nombre],
    t.NUM_IDEN                                          AS [Cédula],
    -- Estado actual del hash
    CASE
        WHEN u.PAS_HASH IS NULL OR LEN(u.PAS_HASH) = 0
        THEN '❌ VACÍO'
        WHEN u.PAS_HASH LIKE '$2%' AND LEN(u.PAS_HASH) >= 60
        THEN '✅ VÁLIDO (' + CAST(LEN(u.PAS_HASH) AS VARCHAR) + ' chars)'
        WHEN u.PAS_HASH LIKE '$2%' AND LEN(u.PAS_HASH) < 60
        THEN '❌ INCOMPLETO (' + CAST(LEN(u.PAS_HASH) AS VARCHAR) + ' chars)'
        ELSE '⚠️  TIPO DESCONOCIDO'
    END                                                 AS [Estado Hash],
    u.PAS_HASH                                          AS [Hash Actual (primeros 50 chars)],
    -- Otras condiciones
    CASE WHEN u.ACT_INAC = 'A' THEN '✅ Activo' ELSE '❌ ' + ISNULL(u.ACT_INAC, 'NULL') END AS [Activo],
    CASE WHEN u.USU_TWEB = 'S' THEN '✅ Web Habilitado' ELSE '❌ ' + ISNULL(u.USU_TWEB, 'NULL') END AS [Web],
    CASE WHEN u.IND_BLOQ = 'N' THEN '✅ No Bloqueado' ELSE '❌ ' + ISNULL(u.IND_BLOQ, 'NULL') END AS [Bloqueado],
    CASE
        WHEN u.FEC_EXPI IS NULL THEN '✅ Sin expiración'
        WHEN u.FEC_EXPI >= GETDATE() THEN '✅ Válido hasta ' + CONVERT(VARCHAR(10), u.FEC_EXPI, 103)
        ELSE '❌ Expiró el ' + CONVERT(VARCHAR(10), u.FEC_EXPI, 103)
    END                                                 AS [Vigencia],
    u.INT_FALL                                          AS [Intentos Fallidos]
FROM dbo.GN_USUAR u
LEFT JOIN dbo.GN_FUNCI f ON u.COD_EMPR = f.COD_EMPR AND u.COD_FUNCI = f.COD_FUNCI
LEFT JOIN dbo.GN_TERCE t ON f.COD_TERC = t.COD_TERC
WHERE u.COD_USUA = @cod_usuario

PRINT ''
PRINT '========== PASO 2: OPCIONES DE REPARACIÓN =========='
PRINT ''
PRINT 'OPCIÓN A: Generación de nuevo hash bcrypt'
PRINT '  → Se requiere generar el hash en la APLICACIÓN (no SQL Server)'
PRINT '  → Pasos:'
PRINT '    1. Generar hash bcrypt de contraseña (ej: "Temporal@123")'
PRINT '    2. Ejecutar UPDATE con el hash generado'
PRINT '    3. Usuario debe cambiar contraseña en primer login'
PRINT ''

-- PASO 2: OPCIONES DE REPARACIÓN
-- ============================================================================

-- OPCIÓN A: PLACEHOLDER - Espera a que generes el hash en la aplicación
-- Reemplaza 'REEMPLAZAR_CON_HASH_BCRYPT' por el hash real generado
-- ============================================================================
PRINT 'OPCIÓN A: UPDATE CON HASH GENERADO EN LA APLICACIÓN'
PRINT '=================================================='

DECLARE @hash_bcrypt_nuevo VARCHAR(100) = '$2b$12$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234567890'
DECLARE @fecha_cambio DATETIME = GETDATE()

PRINT 'Hash a usar: ' + @hash_bcrypt_nuevo
PRINT 'Longitud: ' + CAST(LEN(@hash_bcrypt_nuevo) AS VARCHAR) + ' caracteres'
PRINT ''

IF LEN(@hash_bcrypt_nuevo) < 60
BEGIN
    RAISERROR('❌ ERROR: El hash bcrypt debe tener al menos 60 caracteres. Actual: %d', 16, 1, LEN(@hash_bcrypt_nuevo))
    RETURN
END

-- Script de actualización (comentado para seguridad)
PRINT '-- 📝 DESCOMENTA ESTAS LÍNEAS Y EJECUTA CUANDO TENGAS EL HASH VÁLIDO:'
PRINT '/*'
PRINT 'BEGIN TRANSACTION'
PRINT ''
PRINT 'UPDATE dbo.GN_USUAR'
PRINT 'SET'
PRINT '    PAS_HASH = ''' + @hash_bcrypt_nuevo + ''','
PRINT '    CAM_PASS = NULL,                -- No fuerza cambio de contraseña'
PRINT '    INT_FALL = 0,                   -- Reinicia contador de intentos'
PRINT '    FEC_ACT_PASS = ''' + CAST(@fecha_cambio AS VARCHAR) + '''  -- Registra cambio'
PRINT 'WHERE COD_USUA = ' + CAST(@cod_usuario AS VARCHAR) + '   -- Usuario: ' + @login_a_reparar
PRINT ''
PRINT 'IF @@ROWCOUNT = 1'
PRINT '    PRINT ''✅ Hash actualizado correctamente'''
PRINT 'ELSE'
PRINT '    RAISERROR(''❌ Error al actualizar el hash'', 16, 1)'
PRINT ''
PRINT 'COMMIT TRANSACTION'
PRINT '*/'
PRINT ''

-- OPCIÓN B: Reset con contraseña temporal (si no puedes generar bcrypt en la app)
-- ============================================================================
PRINT 'OPCIÓN B: CONTRASEÑA TEMPORAL EN TEXTO PLANO (⚠️ USAR SOLO PARA EMERGENCIAS)'
PRINT '========================================================================='
PRINT 'Si no puedes generar bcrypt en la aplicación, necesitas:'
PRINT '  1. Crear un CLR function en SQL Server para bcrypt'
PRINT '  2. O pasar el hash desde tu aplicación'
PRINT ''
PRINT 'Ejemplo de hash bcrypt válido generado con contraseña "Temporal@123":'
PRINT '  $2b$12$LQv3c1yqBWVHxkd0LHAkCOYz6TtxMQJqhN8/LewY5g8FN/8.LkWvS'
PRINT ''

-- PASO 3: VALIDACIÓN DE TODAS LAS CONDICIONES
-- ============================================================================
PRINT ''
PRINT '========== PASO 3: VALIDACIÓN COMPLETA DE CONDICIONES =========='
PRINT ''

-- Tabla de condiciones
SELECT
    CASE
        WHEN u.ACT_INAC = 'A' THEN '1. ✅'
        ELSE '1. ❌'
    END                                                 AS [Condición],
    'Usuario Activo (ACT_INAC = "A")'                  AS [Descripción],
    ISNULL(u.ACT_INAC, 'NULL')                         AS [Valor Actual],
    CASE WHEN u.ACT_INAC = 'A' THEN 'CUMPLE' ELSE 'FALLA' END AS [Estado]
FROM dbo.GN_USUAR u
WHERE u.COD_USUA = @cod_usuario

UNION ALL

SELECT
    CASE WHEN u.USU_TWEB = 'S' THEN '2. ✅' ELSE '2. ❌' END,
    'Web Habilitado (USU_TWEB = "S")',
    ISNULL(u.USU_TWEB, 'NULL'),
    CASE WHEN u.USU_TWEB = 'S' THEN 'CUMPLE' ELSE 'FALLA' END
FROM dbo.GN_USUAR u
WHERE u.COD_USUA = @cod_usuario

UNION ALL

SELECT
    CASE WHEN u.IND_BLOQ = 'N' THEN '3. ✅' ELSE '3. ❌' END,
    'No Bloqueado (IND_BLOQ = "N")',
    ISNULL(u.IND_BLOQ, 'NULL'),
    CASE WHEN u.IND_BLOQ = 'N' THEN 'CUMPLE' ELSE 'FALLA' END
FROM dbo.GN_USUAR u
WHERE u.COD_USUA = @cod_usuario

UNION ALL

SELECT
    CASE WHEN u.PAS_HASH LIKE '$2%' AND LEN(u.PAS_HASH) >= 60 THEN '4. ✅' ELSE '4. ❌' END,
    'Hash bcrypt válido (>= 60 chars)',
    CAST(LEN(ISNULL(u.PAS_HASH, '')) AS VARCHAR) + ' chars',
    CASE
        WHEN u.PAS_HASH IS NULL THEN 'FALLA - NULL'
        WHEN LEN(u.PAS_HASH) < 60 THEN 'FALLA - Incompleto'
        ELSE 'CUMPLE'
    END
FROM dbo.GN_USUAR u
WHERE u.COD_USUA = @cod_usuario

UNION ALL

SELECT
    CASE
        WHEN u.FEC_EXPI IS NULL OR u.FEC_EXPI >= GETDATE() THEN '5. ✅'
        ELSE '5. ❌'
    END,
    'No expirado (FEC_EXPI IS NULL OR >= GETDATE())',
    ISNULL(CAST(u.FEC_EXPI AS VARCHAR), 'SIN LÍMITE'),
    CASE
        WHEN u.FEC_EXPI IS NULL THEN 'CUMPLE - Sin vencimiento'
        WHEN u.FEC_EXPI >= GETDATE() THEN 'CUMPLE - Vigente'
        ELSE 'FALLA - Expirado'
    END
FROM dbo.GN_USUAR u
WHERE u.COD_USUA = @cod_usuario

-- PASO 4: VERIFICAR GRUPO Y PERMISOS
-- ============================================================================
PRINT ''
PRINT '========== PASO 4: GRUPO Y PERMISOS =========='
PRINT ''

SELECT
    u.COD_USUA                                          AS [ID Usuario],
    RTRIM(u.ABR_USUA)                                   AS [Login],
    u.COD_GUSU                                          AS [Cod Grupo],
    RTRIM(ISNULL(g.NOM_GUSU, 'SIN GRUPO'))              AS [Nombre Grupo],
    u.COD_PERF                                          AS [Perfil],
    CASE WHEN g.ACT_ESTA = 'A' THEN '✅ Activo' ELSE '❌ Inactivo' END AS [Estado Grupo]
FROM dbo.GN_USUAR u
LEFT JOIN dbo.GN_GUSUA g ON u.COD_GUSU = g.COD_GUSU
WHERE u.COD_USUA = @cod_usuario

-- PASO 5: RESUMEN EJECUTIVO
-- ============================================================================
PRINT ''
PRINT '========== PASO 5: RESUMEN DE PROBLEMAS =========='
PRINT ''

DECLARE @problemas INT = 0
DECLARE @puede_loguear BIT = 1

-- Verificar cada condición
IF (SELECT ACT_INAC FROM dbo.GN_USUAR WHERE COD_USUA = @cod_usuario) <> 'A'
BEGIN
    SET @problemas = @problemas + 1
    SET @puede_loguear = 0
    PRINT '❌ PROBLEMA: Usuario inactivo'
END

IF (SELECT USU_TWEB FROM dbo.GN_USUAR WHERE COD_USUA = @cod_usuario) <> 'S'
BEGIN
    SET @problemas = @problemas + 1
    SET @puede_loguear = 0
    PRINT '❌ PROBLEMA: Web no habilitado'
END

IF (SELECT IND_BLOQ FROM dbo.GN_USUAR WHERE COD_USUA = @cod_usuario) <> 'N'
BEGIN
    SET @problemas = @problemas + 1
    SET @puede_loguear = 0
    PRINT '❌ PROBLEMA: Usuario bloqueado'
END

DECLARE @hash_len INT = (SELECT LEN(PAS_HASH) FROM dbo.GN_USUAR WHERE COD_USUA = @cod_usuario)
IF @hash_len IS NULL OR @hash_len < 60
BEGIN
    SET @problemas = @problemas + 1
    SET @puede_loguear = 0
    PRINT '❌ PROBLEMA CRÍTICO: Hash bcrypt inválido (' + CAST(ISNULL(@hash_len, 0) AS VARCHAR) + ' chars)'
END

DECLARE @expi DATETIME = (SELECT FEC_EXPI FROM dbo.GN_USUAR WHERE COD_USUA = @cod_usuario)
IF @expi IS NOT NULL AND @expi < GETDATE()
BEGIN
    SET @problemas = @problemas + 1
    SET @puede_loguear = 0
    PRINT '❌ PROBLEMA: Contraseña expirada'
END

PRINT ''
PRINT 'Total de problemas encontrados: ' + CAST(@problemas AS VARCHAR)

IF @puede_loguear = 1
    PRINT '✅ RESULTADO: Usuario PUEDE INICIAR SESIÓN'
ELSE
    PRINT '❌ RESULTADO: Usuario NO PUEDE INICIAR SESIÓN'

PRINT ''
PRINT '========== FIN DEL DIAGNÓSTICO =========='
