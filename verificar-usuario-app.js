#!/usr/bin/env node

/**
 * 🔍 VERIFICAR ESTADO DEL USUARIO app_nomina
 *
 * Este script conecta como 'sa' y verifica si app_nomina existe y tiene permisos
 */

const sql = require('mssql');
require('dotenv').config();
const readline = require('readline');

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function preguntar(texto) {
  return new Promise((resolve) => {
    rl.question(texto, (respuesta) => {
      resolve(respuesta);
    });
  });
}

async function main() {
  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║        🔍 VERIFICAR USUARIO app_nomina                     ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  try {
    const SERVER = process.env.SERVER || 'DESKTOP-VEABB8R\\SQLEXPRESS';
    const DATABASE = process.env.DATABASE || 'MineDax';

    // Pedir contraseña de sa
    const saPassword = await preguntar('🔐 Contraseña del usuario "sa": ');

    if (!saPassword) {
      console.log('\n❌ ERROR: La contraseña no puede estar vacía');
      rl.close();
      process.exit(1);
    }

    // Conectar como sa
    console.log('\n⏳ Conectando como "sa"...\n');

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

    const poolSA = new sql.ConnectionPool(configSA);
    await poolSA.connect();

    console.log('✅ Conectado como "sa"\n');

    // ========================================================================
    // VERIFICAR LOGIN
    // ========================================================================

    console.log('━'.repeat(60));
    console.log('VERIFICACIÓN 1: LOGIN app_nomina');
    console.log('━'.repeat(60) + '\n');

    const checkLoginQuery = `
      SELECT
        name,
        type_desc,
        create_date,
        modify_date
      FROM sys.sql_logins
      WHERE name = 'app_nomina'
    `;

    const loginResult = await poolSA.request().query(checkLoginQuery);

    if (loginResult.recordset.length > 0) {
      console.log('✅ LOGIN "app_nomina" EXISTE en el servidor:\n');
      console.log(`   Nombre: ${loginResult.recordset[0].name}`);
      console.log(`   Tipo: ${loginResult.recordset[0].type_desc}`);
      console.log(`   Creado: ${loginResult.recordset[0].create_date}`);
    } else {
      console.log('❌ LOGIN "app_nomina" NO EXISTE\n');
      console.log('Posible solución: Ejecutar setup-servidor.js de nuevo\n');
    }

    // ========================================================================
    // VERIFICAR USER EN BD
    // ========================================================================

    console.log('\n━'.repeat(60));
    console.log(`VERIFICACIÓN 2: USER app_nomina en BD ${DATABASE}`);
    console.log('━'.repeat(60) + '\n');

    const checkUserQuery = `
      USE [${DATABASE}];
      SELECT
        name,
        type_desc,
        create_date,
        authentication_type_desc
      FROM sys.database_principals
      WHERE name = 'app_nomina'
    `;

    const userResult = await poolSA.request().query(checkUserQuery);

    if (userResult.recordset.length > 0) {
      console.log(`✅ USER "app_nomina" EXISTE en ${DATABASE}:\n`);
      console.log(`   Nombre: ${userResult.recordset[0].name}`);
      console.log(`   Tipo: ${userResult.recordset[0].type_desc}`);
      console.log(`   Creado: ${userResult.recordset[0].create_date}`);
    } else {
      console.log(`❌ USER "app_nomina" NO EXISTE en ${DATABASE}\n`);
      console.log('Posible solución: El usuario solo existe en el servidor pero no en la BD\n');
    }

    // ========================================================================
    // VERIFICAR PERMISOS
    // ========================================================================

    console.log('\n━'.repeat(60));
    console.log(`VERIFICACIÓN 3: PERMISOS en ${DATABASE}`);
    console.log('━'.repeat(60) + '\n');

    const checkPermissionsQuery = `
      USE [${DATABASE}];
      SELECT
        permission_name,
        state_desc
      FROM sys.database_permissions
      WHERE grantee_principal_id = (SELECT principal_id FROM sys.database_principals WHERE name = 'app_nomina')
    `;

    const permResult = await poolSA.request().query(checkPermissionsQuery);

    if (permResult.recordset.length > 0) {
      console.log(`✅ app_nomina tiene ${permResult.recordset.length} permisos:\n`);
      permResult.recordset.forEach(perm => {
        console.log(`   • ${perm.permission_name}: ${perm.state_desc}`);
      });
    } else {
      console.log('⚠️  app_nomina tiene pocos o ningún permiso\n');
      console.log('Posible solución: Ejecutar estos comandos en SSMS:\n');
      console.log(`   USE [${DATABASE}];`);
      console.log('   GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON DATABASE::[MineDax] TO [app_nomina];');
    }

    // ========================================================================
    // INTENTAR CONECTAR CON app_nomina
    // ========================================================================

    console.log('\n━'.repeat(60));
    console.log('VERIFICACIÓN 4: Intentar conectar como app_nomina');
    console.log('━'.repeat(60) + '\n');

    try {
      const configAppNomina = {
        server: SERVER,
        database: DATABASE,
        authentication: {
          type: 'default',
          options: {
            userName: 'app_nomina',
            password: 'NominaApp2024#'
          }
        },
        options: {
          encrypt: false,
          trustServerCertificate: true,
          connectionTimeout: 10000
        }
      };

      const poolAppNomina = new sql.ConnectionPool(configAppNomina);
      await poolAppNomina.connect();

      console.log('✅ CONEXIÓN EXITOSA como app_nomina\n');

      // Hacer query de prueba
      const testResult = await poolAppNomina.request().query('SELECT COUNT(*) as [Usuarios] FROM GN_USUAR');
      console.log(`✅ Puede consultar GN_USUAR: ${testResult.recordset[0].Usuarios} usuarios encontrados\n`);

      await poolAppNomina.close();

    } catch (err) {
      console.log('❌ NO PUEDE conectar como app_nomina:\n');
      console.log(`   Error: ${err.message}\n`);
    }

    // ========================================================================
    // RESUMEN Y RECOMENDACIONES
    // ========================================================================

    console.log('\n━'.repeat(60));
    console.log('📋 RESUMEN Y PRÓXIMOS PASOS');
    console.log('━'.repeat(60) + '\n');

    if (loginResult.recordset.length === 0) {
      console.log('❌ PROBLEMA: LOGIN "app_nomina" no existe\n');
      console.log('SOLUCIÓN:\n');
      console.log('1. Ejecuta setup-servidor.js de nuevo:\n');
      console.log('   node setup-servidor.js\n');
      console.log('2. Asegúrate de que se completa sin errores');
    } else if (userResult.recordset.length === 0) {
      console.log('⚠️  PROBLEMA: USER existe en servidor pero no en la BD\n');
      console.log('SOLUCIÓN: Ejecutar en SSMS:\n');
      console.log(`   USE [${DATABASE}];`);
      console.log('   CREATE USER [app_nomina] FOR LOGIN [app_nomina];');
      console.log('   GRANT SELECT, INSERT, UPDATE, DELETE, EXECUTE ON DATABASE::[MineDax] TO [app_nomina];');
    } else {
      console.log('✅ TODO PARECE ESTAR CONFIGURADO CORRECTAMENTE\n');
      console.log('Si aún no funciona, verifica:\n');
      console.log('1. La contraseña "NominaApp2024#" es exacta');
      console.log('2. No hay caracteres especiales en el .env');
      console.log('3. El archivo .env se guardó correctamente');
    }

    await poolSA.close();
    rl.close();

  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    rl.close();
    process.exit(1);
  }
}

main();
