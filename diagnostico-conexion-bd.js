/**
 * 🔍 SCRIPT DE DIAGNÓSTICO COMPLETO
 * Ejecutar con: node diagnostico-conexion-bd.js
 *
 * Este script revisa TODOS los aspectos de la conexión a BD
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();
const sql = require('mssql');

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║         🔍 DIAGNÓSTICO DE CONEXIÓN SQL SERVER             ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// ============================================================================
// 1. VERIFICAR VARIABLES DE ENTORNO
// ============================================================================

console.log('📝 PASO 1: Verificando Variables de Entorno\n');

const requiredVars = ['SERVER', 'DATABASE', 'UID', 'PWD'];
let missingVars = [];

requiredVars.forEach(varName => {
  const value = process.env[varName];
  if (value) {
    const masked = varName === 'PWD' ? '****' : value;
    console.log(`  ✅ ${varName}: ${masked}`);
  } else {
    console.log(`  ❌ ${varName}: NO DEFINIDA`);
    missingVars.push(varName);
  }
});

if (missingVars.length > 0) {
  console.log(`\n⚠️  PROBLEMA: Variables faltantes: ${missingVars.join(', ')}`);
  console.log('   Verifica tu archivo .env\n');
  process.exit(1);
}

console.log('\n✅ Todas las variables están definidas\n');

// ============================================================================
// 2. VERIFICAR ARCHIVO .env
// ============================================================================

console.log('📁 PASO 2: Verificando Archivo .env\n');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  console.log(`  ✅ Archivo .env existe: ${envPath}`);
  const envContent = fs.readFileSync(envPath, 'utf8');
  console.log(`  ✅ Tamaño: ${envContent.length} bytes\n`);
} else {
  console.log(`  ❌ Archivo .env NO EXISTE\n`);
}

// ============================================================================
// 3. INFORMACIÓN DE CONEXIÓN
// ============================================================================

console.log('🔌 PASO 3: Información de Conexión Configurada\n');

const config = {
  server: process.env.SERVER,
  database: process.env.DATABASE,
  authentication: {
    type: 'default',
    options: {
      userName: process.env.UID,
      password: process.env.PWD
    }
  },
  options: {
    encrypt: false,
    trustServerCertificate: true,
    enableKeepAlive: true,
    connectionTimeout: 30000,
    requestTimeout: 30000
  }
};

console.log('  Configuración que se enviará a SQL Server:');
console.log(`    - Servidor: ${config.server}`);
console.log(`    - Base de datos: ${config.database}`);
console.log(`    - Usuario: ${config.authentication.options.userName}`);
console.log(`    - Autenticación: ${config.authentication.type}`);
console.log(`    - Certificado de confianza: ${config.options.trustServerCertificate}`);
console.log(`    - Timeout conexión: ${config.options.connectionTimeout}ms\n`);

// ============================================================================
// 4. INTENTAR CONECTAR
// ============================================================================

console.log('⚡ PASO 4: Intentando Conectar a SQL Server...\n');

async function attemptConnection() {
  try {
    const pool = new sql.ConnectionPool(config);

    // Escuchar eventos
    pool.on('error', (err) => {
      console.log('  ❌ Error en pool:', err.message);
    });

    console.log('  ⏳ Conectando (timeout: 30s)...');

    // Intentar conexión
    await Promise.race([
      pool.connect(),
      new Promise((_, reject) =>
        setTimeout(() => reject(new Error('Timeout después de 30 segundos')), 30000)
      )
    ]);

    console.log('  ✅ CONEXIÓN EXITOSA\n');

    // ========================================================================
    // 5. QUERIES DE PRUEBA
    // ========================================================================

    console.log('📊 PASO 5: Ejecutando Queries de Prueba\n');

    try {
      // Query 1: Versión
      const versionResult = await pool.request().query('SELECT @@VERSION as version');
      console.log('  ✅ Versión SQL Server:');
      console.log(`     ${versionResult.recordset[0].version.substring(0, 80)}...\n`);

      // Query 2: Contar usuarios
      const countResult = await pool.request().query('SELECT COUNT(*) as total FROM GN_USUAR');
      console.log(`  ✅ Total de usuarios: ${countResult.recordset[0].total}\n`);

      // Query 3: Listar BD
      const dbResult = await pool.request().query('SELECT name FROM sys.databases');
      const dbCount = dbResult.recordset.length;
      const hasMineDax = dbResult.recordset.some(db => db.name === 'MineDax');

      console.log(`  ✅ Bases de datos en servidor: ${dbCount}`);
      if (hasMineDax) {
        console.log('  ✅ BD MineDax: EXISTE\n');
      } else {
        console.log('  ❌ BD MineDax: NO EXISTE\n');
        console.log('  Bases de datos disponibles:');
        dbResult.recordset.slice(0, 10).forEach(db => {
          console.log(`     - ${db.name}`);
        });
        console.log('');
      }

      // Query 4: Tablas principales
      const tableResult = await pool.request().query(`
        SELECT TABLE_NAME
        FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA = 'dbo'
        ORDER BY TABLE_NAME
      `);

      console.log(`  ✅ Total de tablas en ${config.database}: ${tableResult.recordset.length}\n`);

      const tablesOfInterest = ['GN_USUAR', 'GN_NOVEDADES', 'GN_EMPLEADOS'];
      console.log('  Tablas de nómina encontradas:');

      tablesOfInterest.forEach(table => {
        const exists = tableResult.recordset.some(t => t.TABLE_NAME === table);
        const status = exists ? '✅' : '❌';
        console.log(`    ${status} ${table}`);
      });

      console.log('\n');

    } catch (queryError) {
      console.log('  ⚠️  Error ejecutando queries:', queryError.message, '\n');
    }

    // ========================================================================
    // 6. RESUMEN
    // ========================================================================

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                      ✅ DIAGNÓSTICO EXITOSO                ║');
    console.log('╚════════════════════════════════════════════════════════════╝');
    console.log('\n✅ Puedes ejecutar tu servidor con:');
    console.log('   npm start\n');
    console.log('✅ Prueba en navegador:');
    console.log('   http://localhost:3000/api/health\n');

    await pool.close();
    process.exit(0);

  } catch (error) {

    // ========================================================================
    // ERROR: MOSTRAR RECOMENDACIONES
    // ========================================================================

    console.log('╔════════════════════════════════════════════════════════════╗');
    console.log('║                   ❌ ERROR DE CONEXIÓN                     ║');
    console.log('╚════════════════════════════════════════════════════════════╝\n');

    console.log(`Tipo de error: ${error.code || error.name}\n`);
    console.log(`Mensaje: ${error.message}\n`);

    // Diagnosticar tipo de error
    if (error.message.includes('socket hang up') || error.code === 'ESOCKET') {
      console.log('🔴 PROBLEMA: No se puede conectar al servidor\n');
      console.log('Posibles causas:');
      console.log('  1. SQL Server no está corriendo');
      console.log('  2. El servidor no está accesible en: CM-ITD-P-05\\\\SQLEXPRESS');
      console.log('  3. Firewall bloqueando la conexión');
      console.log('  4. Instancia SQL Server no existe\n');

      console.log('Pasos para resolver:');
      console.log('  1. Abre SQL Server Management Studio (SSMS)');
      console.log('  2. Intenta conectar a: CM-ITD-P-05\\\\SQLEXPRESS');
      console.log('  3. Si falla, SQL Server no está accesible');
      console.log('  4. Si conecta OK, hay problema de configuración\n');

    } else if (error.message.includes('Invalid login') || error.code === 'ELLOGIN') {
      console.log('🔴 PROBLEMA: Credenciales incorrectas\n');
      console.log('Verifica:');
      console.log(`  - Usuario: ${process.env.UID}`);
      console.log(`  - Contraseña en .env (actual: ****)`);
      console.log(`  - Que el usuario existe en SQL Server\n`);

      console.log('Pasos para resolver:');
      console.log('  1. Abre SSMS');
      console.log('  2. Conecta como administrador');
      console.log('  3. Verifica que el usuario existe: SELECT * FROM sys.sysusers');
      console.log('  4. Actualiza las credenciales en .env\n');

    } else if (error.message.includes('Cannot open database')) {
      console.log('🔴 PROBLEMA: Base de datos no existe\n');
      console.log(`Base de datos solicitada: ${config.database}\n`);
      console.log('Pasos para resolver:');
      console.log('  1. Abre SSMS');
      console.log('  2. Verifica que MineDax existe en Object Explorer');
      console.log('  3. Si no existe, necesitas restaurarla desde un backup\n');

    } else {
      console.log('🔴 PROBLEMA: Error desconocido\n');
      console.log('Información completa del error:');
      console.log(error);
    }

    process.exit(1);
  }
}

// Ejecutar diagnóstico
attemptConnection();
