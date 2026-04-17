/**
 * Script para crear usuario admin
 * Ejecutar: node create-admin.js
 */

const bcrypt = require('bcryptjs');
const { executeQuery } = require('./config/database');

async function crearAdmin() {
  try {
    // ✏️ EDITAR ESTOS VALORES:
    const cedula = '1111111111';              // Tu cédula
    const email = 'admin@mining.com';          // Tu email
    const contrasena = 'Admin@123456';         // Tu contraseña (mín 8 caracteres)
    const nombre = 'Administrador';            // Tu nombre (opcional)

    console.log('\n🔐 Creando usuario admin...\n');
    console.log(`📋 Cédula: ${cedula}`);
    console.log(`📧 Email: ${email}`);
    console.log(`👤 Nombre: ${nombre}\n`);

    // 1. Generar hash de contraseña
    console.log('🔒 Hasheando contraseña...');
    const salt = await bcrypt.genSalt(10);
    const passHash = await bcrypt.hash(contrasena, salt);
    console.log('✓ Contraseña hasheada\n');

    // 2. Crear usuario en la BD
    console.log('💾 Insertando usuario en BD...');
    const query = `
      DECLARE @ID_USUAR UNIQUEIDENTIFIER = NEWID();
      DECLARE @NOM_FUNCI VARCHAR(100) = @nombre;
      DECLARE @COD_DEPART VARCHAR(10) = 'ADMIN';
      DECLARE @COD_CARGO VARCHAR(10) = 'ADMIN';

      -- Intenta obtener datos de GN_FUNCI si existe
      IF EXISTS (SELECT 1 FROM GN_FUNCI WHERE NUM_IDEN = @cedula)
      BEGIN
        SELECT TOP 1
          @NOM_FUNCI = NOM_COMP,
          @COD_DEPART = COD_DEPART,
          @COD_CARGO = COD_CARGO
        FROM GN_FUNCI
        WHERE NUM_IDEN = @cedula;
      END

      -- Crear usuario
      INSERT INTO GN_USUAR (
        ID_USUAR, CEDULA, NOMBRE_USUAR, PASSW_HASH, EMAIL,
        COD_DEPART, COD_CARGO, NIVEL_USUAR,
        USUAR_CREACION, FECH_PROX_CAMBIO, ESTA_ACTIVO
      )
      VALUES (
        @ID_USUAR, @cedula, @NOM_FUNCI, @passHash, @email,
        @COD_DEPART, @COD_CARGO, 3,
        'SISTEMA', DATEADD(DAY, 90, GETDATE()), 1
      );

      -- Asignar rol ADMIN
      INSERT INTO GN_ROL_USUAR (
        ID_USUAR, COD_ROL, NOM_ROL, ESTA_ACTIVO
      )
      VALUES (
        @ID_USUAR, 'ADMIN', 'Administrador', 1
      );

      SELECT @ID_USUAR AS ID_USUAR;
    `;

    const result = await executeQuery(query, {
      cedula,
      passHash,
      email,
      nombre
    });

    const usuarioId = result.recordset[0]?.ID_USUAR;

    console.log('✓ Usuario insertado\n');

    // 3. Confirmación
    console.log('✅ ¡Usuario admin creado exitosamente!\n');
    console.log('═══════════════════════════════════════════');
    console.log('📝 Datos de acceso:');
    console.log('═══════════════════════════════════════════');
    console.log(`Cédula/Email: ${cedula}`);
    console.log(`Contraseña:   ${contrasena}`);
    console.log(`Nivel:        Admin (3)`);
    console.log(`Rol:          ADMIN`);
    console.log('═══════════════════════════════════════════\n');
    console.log('🚀 Ahora puedes acceder en: http://localhost:3000\n');
    console.log(`ID del Usuario: ${usuarioId}\n`);

    process.exit(0);

  } catch (err) {
    console.error('\n❌ Error al crear usuario:\n');
    console.error(err.message);
    console.error('\nVerifica que:');
    console.error('1. SQL Server está conectado');
    console.error('2. La BD MineDax existe');
    console.error('3. El script auth_schema.sql fue ejecutado');
    process.exit(1);
  }
}

crearAdmin();
