#!/usr/bin/env node

/**
 * 🔧 SETUP DE SERVIDOR CENTRAL - CREAR USUARIO DE SERVICIO
 *
 * Uso: node setup-servidor.js
 *
 * Este script se ejecuta UNA SOLA VEZ en cada servidor nuevo para:
 * 1. Conectarse como 'sa' (administrador)
 * 2. Crear un usuario de servicio 'app_nomina' con contraseña fija
 * 3. Darle permisos a la BD MineDax
 * 4. Actualizar .env automáticamente
 * 5. Después de esto, 'sa' ya no se necesita
 *
 * Este script hace la aplicación escalable a múltiples máquinas/servidores
 * sin necesidad de SSMS o usuarios específicos de Windows.
 */

const fs = require('fs');
const path = require('path');
const readline = require('readline');
const sql = require('mssql');
require('dotenv').config();

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║  🔧 SETUP DE SERVIDOR CENTRAL - CREAR USUARIO DE SERVICIO ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// Crear interfaz de lectura
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

// Helper para preguntar
function preguntar(texto) {
  return new Promise((resolve) => {
    rl.question(texto, (respuesta) => {
      resolve(respuesta);
    });
  });
}

// Configuración
const USER_SERVICIO = 'app_nomina';
const PASS_SERVICIO = 'NominaApp2024#';
const SERVER = process.env.SERVER || 'DESKTOP-VEABB8R\\SQLEXPRESS';
const DATABASE = process.env.DATABASE || 'MineDax';

async function main() {
  try {
    console.log('📋 Este script creará un usuario de servicio para que la aplicación');
    console.log('   pueda conectarse a SQL Server sin necesidad de SSMS o de usuarios');
    console.log('   específicos de Windows.\n');

    console.log('⚠️  IMPORTANTE: Solo necesitas ejecutar esto UNA VEZ por servidor.\n');

    // ========================================================================
    // PASO 1: Pedir credenciales de 'sa'
    // ========================================================================

    console.log('━'.repeat(60));
    console.log('PASO 1: Credenciales del Administrador (sa)');
    console.log('━'.repeat(60) + '\n');

    console.log(`Servidor: ${SERVER}`);
    console.log(`Base de datos: ${DATABASE}\n`);

    const saPassword = await preguntar('🔐 Contraseña del usuario "sa": ');

    if (!saPassword) {
      console.log('\n❌ ERROR: La contraseña de sa no puede estar vacía');
      rl.close();
      process.exit(1);
    }

    // ========================================================================
    // PASO 2: Conectar con 'sa'
    // ========================================================================

    console.log('\n⏳ Conectando a SQL Server como "sa"...\n');

    const configSA = {
      server: SERVER,
      database: 'master',
      authentication: {
        type: 'default',
        options: {
          userName: 'sa',
          password: saPassword
        }
      },
      options: {
        encrypt: false,
        trustServerCertificate: true,
        connectionTimeout: 10000
      }
    };

    let poolSA;
    try {
      poolSA = new sql.ConnectionPool(configSA);
      await poolSA.connect();
      console.log('✅ Conectado a SQL Server como "sa"\n');
    } catch (err) {
      console.log('❌ ERROR: No se pudo conectar con "sa"');
      console.log(`   ${err.message}\n`);
      console.log('Verifica:');
      console.log('  1. La contraseña de sa es correcta');
      console.log('  2. SQL Server está corriendo');
      console.log(`  3. El servidor es: ${SERVER}\n`);
      rl.close();
      process.exit(1);
    }

    // ========================================================================
    // PASO 3: Verificar si el usuario ya existe
    // ========================================================================

    console.log(`⏳ Verificando si el usuario "${USER_SERVICIO}" ya existe...\n`);

    const checkUserQuery = `SELECT name FROM sys.sql_logins WHERE name = @username`;
    const checkResult = await poolSA.request()
      .input('username', USER_SERVICIO)
      .query(checkUserQuery);

    if (checkResult.recordset.length > 0) {
      console.log(`✅ El usuario "${USER_SERVICIO}" ya existe.\n`);
      console.log('Si deseas reconfigurarlo, elimínalo manualmente en SSMS:');
      console.log(`   DROP LOGIN [${USER_SERVICIO}];\n`);
    } else {
      // ========================================================================
      // PASO 4: Crear el usuario de servicio
      // ========================================================================

      console.log(`⏳ Creando usuario de servicio "${USER_SERVICIO}"...\n`);

      try {
        // Crear LOGIN usando sp_executesql para pasar contraseña seguramente
        const createLoginQuery = `
          DECLARE @sql NVARCHAR(MAX);
          SET @sql = N'CREATE LOGIN [${USER_SERVICIO}] WITH PASSWORD = ''' + @password + ''';';
          EXEC sp_executesql @sql;
        `;

        await poolSA.request()
          .input('password', PASS_SERVICIO)
          .query(createLoginQuery);

        console.log(`✅ LOGIN creado: ${USER_SERVICIO}\n`);

        // Crear USER en MineDax
        const createUserQuery = `
          USE [${DATABASE}];
          CREATE USER [${USER_SERVICIO}] FOR LOGIN [${USER_SERVICIO}];
        `;

        await poolSA.request().query(createUserQuery);

        console.log(`✅ USUARIO creado en ${DATABASE}\n`);

        // Asignar permisos
        const grantQuery = `
          USE [${DATABASE}];
          GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON DATABASE::[${DATABASE}] TO [${USER_SERVICIO}];
        `;

        await poolSA.request().query(grantQuery);

        console.log(`✅ PERMISOS asignados a ${USER_SERVICIO}\n`);
      } catch (err) {
        console.log('❌ ERROR al crear el usuario de servicio:');
        console.log(`   ${err.message}\n`);
        await poolSA.close();
        rl.close();
        process.exit(1);
      }
    }

    // ========================================================================
    // PASO 5: Verificar que funciona
    // ========================================================================

    console.log('⏳ Verificando que el nuevo usuario funciona...\n');

    const configAppUser = {
      server: SERVER,
      database: DATABASE,
      authentication: {
        type: 'default',
        options: {
          userName: USER_SERVICIO,
          password: PASS_SERVICIO
        }
      },
      options: {
        encrypt: false,
        trustServerCertificate: true,
        connectionTimeout: 10000
      }
    };

    try {
      const poolAppUser = new sql.ConnectionPool(configAppUser);
      await poolAppUser.connect();

      // Hacer una query de prueba
      const testResult = await poolAppUser.request().query('SELECT @@VERSION as version');

      console.log(`✅ El usuario "${USER_SERVICIO}" puede conectar a ${DATABASE}\n`);

      await poolAppUser.close();
    } catch (err) {
      console.log('❌ ERROR: El usuario no puede conectar');
      console.log(`   ${err.message}\n`);
      await poolSA.close();
      rl.close();
      process.exit(1);
    }

    // ========================================================================
    // PASO 6: Actualizar .env
    // ========================================================================

    console.log('⏳ Actualizando archivo .env...\n');

    const envPath = path.join(__dirname, '.env');
    let envContent = fs.readFileSync(envPath, 'utf8');

    // Reemplazar UID y PWD
    envContent = envContent.replace(
      /UID\s*=.*/,
      `UID=${USER_SERVICIO}`
    );

    envContent = envContent.replace(
      /PWD\s*=.*/,
      `PWD=${PASS_SERVICIO}`
    );

    fs.writeFileSync(envPath, envContent, 'utf8');

    console.log(`✅ Archivo .env actualizado:\n`);
    console.log(`   UID=${USER_SERVICIO}`);
    console.log(`   PWD=****\n`);

    // ========================================================================
    // PASO 7: Resumen y próximos pasos
    // ========================================================================

    console.log('═'.repeat(60));
    console.log('✅ SETUP COMPLETADO EXITOSAMENTE');
    console.log('═'.repeat(60) + '\n');

    console.log('📋 Resumen:');
    console.log(`   ✅ Usuario de servicio creado: ${USER_SERVICIO}`);
    console.log(`   ✅ Permisos otorgados en: ${DATABASE}`);
    console.log(`   ✅ Archivo .env actualizado\n`);

    console.log('🚀 Próximos pasos:\n');

    console.log('1. Verificar la conexión:');
    console.log('   $ node diagnostico-conexion-bd.js\n');

    console.log('2. Si todo está bien, iniciar el servidor:');
    console.log('   $ npm start\n');

    console.log('3. La aplicación ahora es escalable:');
    console.log('   ✅ Funciona en cualquier máquina');
    console.log('   ✅ No necesitas SSMS');
    console.log('   ✅ No necesitas sa');
    console.log('   ✅ La contraseña es la misma en todos los servidores\n');

    console.log('⚠️  IMPORTANTE:');
    console.log('   • Este script solo debe ejecutarse UNA VEZ por servidor');
    console.log('   • No compartas el archivo .env con la contraseña\n');

    await poolSA.close();
    rl.close();
    process.exit(0);

  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    rl.close();
    process.exit(1);
  }
}

// Ejecutar
main();
