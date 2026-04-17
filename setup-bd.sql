-- ============================================================================
-- SETUP DE USUARIO DE SERVICIO - ALTERNATIVA MANUAL EN SSMS
-- ============================================================================
--
-- USO: Ejecutar este script en SQL Server Management Studio si no puedes
-- ejecutar node setup-servidor.js
--
-- PASOS:
-- 1. Abre SQL Server Management Studio
-- 2. Conecta al servidor (ej: DESKTOP-VEABB8R\SQLEXPRESS)
-- 3. Copia TODO el contenido de este archivo
-- 4. Pégalo en una nueva Query
-- 5. Click en Execute (o F5)
-- 6. Si no hay errores, el usuario está creado
-- 7. Actualiza .env con:
--    UID=app_nomina
--    PWD=NominaApp2024#
-- 8. Prueba: node diagnostico-conexion-bd.js
--
-- ============================================================================

-- PASO 1: Crear el LOGIN de servicio
-- Si ya existe, esto fallará — eso es normal, ignora el error y continúa

CREATE LOGIN [app_nomina] WITH PASSWORD = 'NominaApp2024#';

GO

-- PASO 2: Cambiar a la base de datos MineDax
USE MineDax;

GO

-- PASO 3: Crear el USER en MineDax para el login
-- Si ya existe, esto fallará — eso es normal, ignora el error y continúa

CREATE USER [app_nomina] FOR LOGIN [app_nomina];

GO

-- PASO 4: Asignar permisos mínimos necesarios
-- (SELECT, INSERT, UPDATE, DELETE, EXECUTE)

GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON DATABASE::MineDax TO [app_nomina];

GO

-- PASO 5: Verificación (opcional)
-- Ejecuta esto para ver si el usuario está creado correctamente

SELECT 'LOGIN app_nomina' as [Elemento], COUNT(*) as [Existe]
FROM sys.sql_logins
WHERE name = 'app_nomina'

UNION ALL

SELECT 'USER app_nomina en MineDax', COUNT(*)
FROM sys.database_principals
WHERE name = 'app_nomina'
  AND type = 'S' -- S = Usuario de SQL

GO

-- ============================================================================
-- ✅ SI TODO SALIÓ BIEN:
-- ============================================================================
--
-- 1. Ambas líneas del SELECT deben mostrar "1" en la columna [Existe]
-- 2. Actualiza el .env con:
--    UID=app_nomina
--    PWD=NominaApp2024#
-- 3. Prueba: node diagnostico-conexion-bd.js
-- 4. El diagnóstico debe mostrar ✅ EXITOSO
-- 5. Inicia el servidor: npm start
--
-- ============================================================================

-- ALTERNATIVA: Si necesitas cambiar la contraseña del usuario

-- ALTER LOGIN [app_nomina] WITH PASSWORD = 'nueva_contraseña';

-- ============================================================================

-- ALTERNATIVA: Si necesitas eliminar el usuario y empezar de nuevo

-- USE MineDax;
-- DROP USER [app_nomina];
-- DROP LOGIN [app_nomina];

-- ============================================================================
