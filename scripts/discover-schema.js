/**
 * Script: Descubrir la estructura real de GN_USUAR
 * Ejecutar con: node discover-schema.js
 */

require('dotenv').config();
const { getConnection } = require('./config/database');

async function discoverSchema() {
  console.log('🔍 Descubriendo estructura de GN_USUAR...\n');

  try {
    const pool = await getConnection();

    // Paso 1: Obtener columnas de la tabla
    console.log('📋 Columnas en GN_USUAR:\n');
    const columnsResult = await pool.request().query(`
      SELECT
        COLUMN_NAME,
        DATA_TYPE,
        IS_NULLABLE,
        COLUMN_DEFAULT
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'GN_USUAR'
      ORDER BY ORDINAL_POSITION
    `);

    console.table(columnsResult.recordset);

    // Paso 2: Mostrar todos los datos de la tabla (sin filtros)
    console.log('\n📊 Datos actuales en GN_USUAR:\n');
    const dataResult = await pool.request().query('SELECT * FROM GN_USUAR');
    console.table(dataResult.recordset);

    // Paso 3: Sugerir columnas para login
    console.log('\n✨ Sugerencias basadas en los datos:\n');
    const firstRow = dataResult.recordset[0];
    if (firstRow) {
      console.log('Columnas disponibles en la tabla:');
      Object.keys(firstRow).forEach((col, idx) => {
        console.log(`  ${idx + 1}. ${col}`);
      });
      console.log('\n💡 Para login necesitas identificar:');
      console.log('   - Columna identificador único (ej: ID_USUAR, USR_ID, etc)');
      console.log('   - Columna para email o cédula (ej: EMAIL, CEDULA, USR_EMAIL)');
      console.log('   - Columna para contraseña (ej: CONTRASENA, PWD, PASSWORD)');
      console.log('   - Columna para estado activo (ej: ACTIVO, IS_ACTIVE, ESTADO)');
      console.log('   - Columna para rol/nivel (ej: ROLE, NIVEL, PERMISO)');
    }

    console.log('\n✅ Descubrimiento completado\n');
    await pool.close();
    process.exit(0);

  } catch (error) {
    console.error('❌ ERROR:', error.message);
    process.exit(1);
  }
}

discoverSchema();
