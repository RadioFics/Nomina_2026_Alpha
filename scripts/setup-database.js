#!/usr/bin/env node
/**
 * SETUP DE BASE DE DATOS
 * Verifica e inicializa las tablas de autenticación en MineDax
 *
 * Ejecutar con: node setup-database.js
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const { getConnection } = require('./config/database');

async function setupDatabase() {
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                    SETUP DE BASE DE DATOS NOMINA                     ║
╚══════════════════════════════════════════════════════════════════════╝
  `);

  try {
    const pool = await getConnection();
    console.log('✓ Conexión establecida con MineDax\n');

    // Paso 1: Verificar que exista la tabla GN_USUAR
    console.log('Paso 1: Verificando tablas de autenticación...');
    const checkTablesQuery = `
      SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
      WHERE TABLE_NAME IN ('GN_USUAR', 'GN_SESION', 'GN_ROL_USUAR', 'GN_PERMISOS', 'GN_LOG_ACCESO')
    `;

    const result = await pool.request().query(checkTablesQuery);
    const tablasExistentes = result.recordset.map(r => r.TABLE_NAME);

    console.log(`✓ Tablas encontradas: ${tablasExistentes.join(', ') || 'NINGUNA'}\n`);

    // Paso 2: Si faltan tablas, ejecutar el script de schema
    const tablasRequeridas = ['GN_USUAR', 'GN_SESION', 'GN_ROL_USUAR', 'GN_PERMISOS', 'GN_LOG_ACCESO'];
    const tablasFaltantes = tablasRequeridas.filter(t => !tablasExistentes.includes(t));

    if (tablasFaltantes.length > 0) {
      console.log(`⚠️  Tablas faltantes: ${tablasFaltantes.join(', ')}\n`);
      console.log('Paso 2: Ejecutando script de creación (auth_schema.sql)...\n');

      const schemaPath = path.join(__dirname, 'database', 'auth_schema.sql');
      if (!fs.existsSync(schemaPath)) {
        throw new Error(`No se encontró el archivo ${schemaPath}`);
      }

      const schema = fs.readFileSync(schemaPath, 'utf-8');
      const sqlStatements = schema.split('GO\n').filter(s => s.trim());

      for (const statement of sqlStatements) {
        try {
          if (statement.trim().length > 0) {
            await pool.request().query(statement);
          }
        } catch (err) {
          if (!err.message.includes('ya existe')) {
            console.warn(`⚠️  ${err.message}`);
          }
        }
      }

      console.log('✓ Schema de autenticación creado/actualizado\n');
    } else {
      console.log('✓ Todas las tablas de autenticación existen\n');
    }

    // Paso 3: Verificar estructura de GN_USUAR
    console.log('Paso 3: Verificando estructura de GN_USUAR...');
    const schemaQuery = `
      SELECT COLUMN_NAME, DATA_TYPE
      FROM INFORMATION_SCHEMA.COLUMNS
      WHERE TABLE_NAME = 'GN_USUAR'
      ORDER BY ORDINAL_POSITION
    `;

    const schemaResult = await pool.request().query(schemaQuery);
    const columnas = schemaResult.recordset.map(c => `${c.COLUMN_NAME} (${c.DATA_TYPE})`);

    console.log('Columnas en GN_USUAR:');
    columnas.forEach(col => console.log(`  • ${col}`));
    console.log('');

    // Paso 4: Contar usuarios
    console.log('Paso 4: Verificando datos de usuarios...');
    const countQuery = 'SELECT COUNT(*) as total FROM GN_USUAR';
    const countResult = await pool.request().query(countQuery);
    const totalUsuarios = countResult.recordset[0].total;

    console.log(`✓ Total de usuarios en BD: ${totalUsuarios}\n`);

    // Paso 5: Mostrar primeros usuarios
    if (totalUsuarios > 0) {
      console.log('Primeros usuarios registrados:');
      const usersQuery = `
        SELECT TOP 5
          CEDULA,
          NOMBRE_USUAR,
          EMAIL,
          NIVEL_USUAR,
          ESTA_ACTIVO,
          FECH_CREACION
        FROM GN_USUAR
        ORDER BY FECH_CREACION DESC
      `;

      const usersResult = await pool.request().query(usersQuery);
      console.table(usersResult.recordset);
    }

    // Paso 6: Resumen de estado
    console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                        ✅ SETUP COMPLETADO                           ║
╚══════════════════════════════════════════════════════════════════════╝

📊 ESTADO:
  • Base de datos: ✓ MineDax conectada
  • Tablas: ✓ ${tablasExistentes.length}/${tablasRequeridas.length} creadas
  • Usuarios: ✓ ${totalUsuarios} registrados

🚀 PRÓXIMOS PASOS:
  1. Ejecutar: npm start
  2. Abrir: http://localhost:3000
  3. Login con credenciales de usuario

📋 ENDPOINTS DISPONIBLES:
  • POST   /api/auth/login              - Iniciar sesión
  • POST   /api/auth/logout             - Cerrar sesión
  • GET    /api/auth/me                 - Ver usuario actual
  • POST   /api/auth/crear-usuario      - Crear usuario (Admin)
  • GET    /api/auth/usuarios            - Listar usuarios (Admin)
  • GET    /api/auth/usuarios/:id       - Obtener usuario (Admin)
  • PUT    /api/auth/usuarios/:id       - Actualizar usuario (Admin)
  • PATCH  /api/auth/usuarios/:id/estado - Cambiar estado (Admin)
  • DELETE /api/auth/usuarios/:id       - Eliminar usuario (Admin)

💡 NOTA: Todas las operaciones de usuarios requieren token JWT
         y nivel de acceso 3 (Administrador)
    `);

    await pool.close();
    process.exit(0);

  } catch (error) {
    console.error(`\n❌ ERROR EN SETUP:`, error.message);
    console.error('\nDetalles:', error);
    process.exit(1);
  }
}

setupDatabase();
