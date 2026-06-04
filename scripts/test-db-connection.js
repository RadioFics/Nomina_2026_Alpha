/**
 * Script de prueba: Conectar a SQL Server
 * Ejecutar con: node test-db-connection.js
 */

require('dotenv').config();
const { getConnection, executeQuery } = require('./config/database');

async function testConnection() {
  console.log('🔍 Probando conexión a SQL Server...\n');

  try {
    // Paso 1: Obtener conexión
    console.log('Paso 1: Conectando a BD...');
    const pool = await getConnection();
    console.log('✅ Conexión exitosa a:', process.env.DATABASE);

    // Paso 2: Hacer una consulta simple
    console.log('\nPaso 2: Ejecutando consulta de prueba...');
    const result = await executeQuery('SELECT @@VERSION as [SQL Server Version]');
    console.log('✅ Versión SQL Server:', result.recordset[0]['SQL Server Version']);

    // Paso 3: Contar usuarios
    console.log('\nPaso 3: Verificando tabla de usuarios...');
    const usersResult = await executeQuery('SELECT COUNT(*) as total FROM GN_USUAR');
    console.log('✅ Total de usuarios en BD:', usersResult.recordset[0].total);

    // Paso 4: Listar primeros usuarios
    console.log('\nPaso 4: Primeros 5 usuarios (con estructura verificada):');
    const listResult = await executeQuery(`
      SELECT TOP 5
        ID_USUAR,
        CEDULA,
        NOMBRE_USUAR,
        EMAIL,
        NIVEL_USUAR,
        ESTA_ACTIVO,
        FECH_CREACION
      FROM GN_USUAR
    `);
    console.table(listResult.recordset);

    // Paso 5: Mostrar estructura de la tabla
    console.log('\nPaso 5: Estructura de GN_USUAR:');
    const schemaResult = await executeQuery(`
      SELECT
        COLUMN_NAME,
        DATA_TYPE,
        IS_NULLABLE,
        COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'GN_USUAR'
      ORDER BY ORDINAL_POSITION
    `);
    console.table(schemaResult.recordset);

    console.log('\n✅ PRUEBA COMPLETADA: La conexión funciona correctamente\n');
    process.exit(0);

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    console.error('\nDetalles:', error);
    process.exit(1);
  }
}

testConnection();
