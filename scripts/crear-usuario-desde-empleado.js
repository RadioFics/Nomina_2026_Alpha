#!/usr/bin/env node
/**
 * CREAR USUARIO DESDE EMPLEADO
 * Busca un empleado en GN_FUNCI y crea un usuario en GN_USUAR
 *
 * Uso: node crear-usuario-desde-empleado.js "email@example.com" "Contrasena123!"
 */

require('dotenv').config();
const { executeQuery } = require('./config/database');
const bcrypt = require('bcryptjs');

async function crearUsuario(email, contrasena) {
  try {
    console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║              CREAR USUARIO DESDE EMPLEADO EXISTENTE                  ║
╚══════════════════════════════════════════════════════════════════════╝
    `);

    // Paso 1: Validar contraseña
    console.log('\n📋 Paso 1: Validando contraseña...');
    const hasUppercase = /[A-Z]/.test(contrasena);
    const hasLowercase = /[a-z]/.test(contrasena);
    const hasNumbers = /[0-9]/.test(contrasena);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(contrasena);
    const hasMinLength = contrasena.length >= 8;

    if (!hasMinLength || !hasUppercase || !hasLowercase || !hasNumbers || !hasSpecial) {
      console.log(`
❌ La contraseña no cumple los requisitos:
   ✓ Mínimo 8 caracteres
   ✓ Al menos una mayúscula
   ✓ Al menos una minúscula
   ✓ Al menos un número
   ✓ Al menos un símbolo

Ejemplo válido: "Hernandez@2024"
      `);
      process.exit(1);
    }
    console.log('✅ Contraseña válida');

    // Paso 2: Buscar empleado
    console.log('\n📋 Paso 2: Buscando empleado en GN_FUNCI...');
    const empleadoQuery = `
      SELECT TOP 1
        f.COD_FUNCI,
        f.NUM_IDEN,
        f.COD_DEPART,
        f.COD_CARGO,
        t.NOM_COMP,
        t.DIR_MAIL,
        t.TEL_TERC
      FROM GN_FUNCI f
      JOIN GN_TERCE t ON f.COD_TERC = t.COD_TERC
      WHERE t.DIR_MAIL = @email
         OR t.NOM_COMP LIKE @email
      LIMIT 1
    `;

    const empleadoResult = await executeQuery(empleadoQuery, { email: `%${email}%` });

    if (!empleadoResult.recordset || empleadoResult.recordset.length === 0) {
      console.log(`
❌ No se encontró empleado con email: ${email}

Soluciones:
1. Verifica que el email está en GN_TERCE (tabla de personas)
2. Intenta con el nombre del empleado
3. Verifica en SSMS:
   SELECT NOM_COMP, DIR_MAIL FROM GN_TERCE
      `);
      process.exit(1);
    }

    const emp = empleadoResult.recordset[0];
    console.log(`✅ Empleado encontrado: ${emp.NOM_COMP}`);

    // Verificar que el usuario no exista ya
    console.log('\n📋 Paso 3: Verificando que el usuario no existe ya...');
    const existeQuery = `
      SELECT ID_USUAR FROM GN_USUAR
      WHERE CEDULA = @cedula OR EMAIL = @email
    `;

    const existeResult = await executeQuery(existeQuery, {
      cedula: emp.NUM_IDEN,
      email: emp.DIR_MAIL
    });

    if (existeResult.recordset && existeResult.recordset.length > 0) {
      console.log(`
❌ El usuario ya existe en GN_USUAR

Para resetearlo, usa: node ver-usuario.js "${emp.DIR_MAIL}"
      `);
      process.exit(1);
    }
    console.log('✅ El usuario no existe, se puede crear');

    // Paso 4: Generar hash
    console.log('\n📋 Paso 4: Generando hash de contraseña...');
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(contrasena, salt);
    console.log(`✅ Hash generado (${hash.length} caracteres)`);

    // Paso 5: Crear usuario
    console.log('\n📋 Paso 5: Creando usuario en GN_USUAR...');
    const crearQuery = `
      DECLARE @ID_USUAR UNIQUEIDENTIFIER = NEWID();
      DECLARE @CEDULA VARCHAR(20) = @cedula;
      DECLARE @NOMBRE VARCHAR(100) = @nombre;
      DECLARE @EMAIL VARCHAR(100) = @email;
      DECLARE @HASH VARCHAR(255) = @passHash;
      DECLARE @DEPART VARCHAR(10) = @depart;
      DECLARE @CARGO VARCHAR(10) = @cargo;

      -- Crear usuario
      INSERT INTO GN_USUAR (
        ID_USUAR, CEDULA, NOMBRE_USUAR, PASSW_HASH, EMAIL,
        COD_DEPART, COD_CARGO, NIVEL_USUAR, ESTA_ACTIVO,
        USUAR_CREACION, FECH_PROX_CAMBIO
      )
      VALUES (
        @ID_USUAR, @CEDULA, @NOMBRE, @HASH, @EMAIL,
        @DEPART, @CARGO, 1, 1,
        'SISTEMA', DATEADD(DAY, 90, GETDATE())
      );

      -- Asignar rol
      INSERT INTO GN_ROL_USUAR (ID_USUAR, COD_ROL, NOM_ROL, ESTA_ACTIVO)
      VALUES (@ID_USUAR, 'EMPLEADO', 'Empleado', 1);

      -- Registrar en auditoría
      INSERT INTO GN_LOG_ACCESO (
        ID_USUAR, CEDULA, TIPO_EVENTO, ESTADO, MENSAJE
      )
      VALUES (@ID_USUAR, @CEDULA, 'CREAR_USUARIO', 'EXITOSO', 'Usuario creado desde empleado');

      SELECT @ID_USUAR as ID_USUAR, @CEDULA as CEDULA;
    `;

    const crearResult = await executeQuery(crearQuery, {
      cedula: emp.NUM_IDEN,
      nombre: emp.NOM_COMP,
      email: emp.DIR_MAIL,
      passHash: hash,
      depart: emp.COD_DEPART || null,
      cargo: emp.COD_CARGO || null
    });

    console.log('✅ Usuario creado exitosamente');

    // Resumen
    console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                   ✅ USUARIO CREADO EXITOSAMENTE                    ║
╚══════════════════════════════════════════════════════════════════════╝

📊 DATOS DEL NUEVO USUARIO:

  ID Usuario:      ${crearResult.recordset[0]?.ID_USUAR}
  Cédula:          ${emp.NUM_IDEN}
  Nombre:          ${emp.NOM_COMP}
  Email:           ${emp.DIR_MAIL}
  Teléfono:        ${emp.TEL_TERC || 'No registrado'}
  Nivel:           1 (EMPLEADO)
  Departamento:    ${emp.COD_DEPART || 'No asignado'}
  Cargo:           ${emp.COD_CARGO || 'No asignado'}
  Estado:          Activo ✅
  Bloqueado:       No ✅

🔐 CREDENCIALES DE ACCESO:

  Email:           ${emp.DIR_MAIL}
  Contraseña:      ${contrasena}

✅ El usuario puede ingresar a: http://localhost:3000

🔄 PRÓXIMOS PASOS:

1. Abre http://localhost:3000 en tu navegador
2. Ingresa con:
   Email: ${emp.DIR_MAIL}
   Contraseña: ${contrasena}
3. El sistema te pedirá cambiar la contraseña en 90 días

    `);

  } catch (err) {
    console.error('\n❌ ERROR:', err.message);
    console.error('\nDetalles:', err);
    process.exit(1);
  }
}

// Validar argumentos
const email = process.argv[2];
const contrasena = process.argv[3];

if (!email || !contrasena) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║              CREAR USUARIO DESDE EMPLEADO EXISTENTE                  ║
╚══════════════════════════════════════════════════════════════════════╝

Uso:
  node crear-usuario-desde-empleado.js "email@example.com" "Contrasena123!"

Ejemplos:
  node crear-usuario-desde-empleado.js "hernandezjuanfelipe964@gmail.com" "Hernandez@2024"
  node crear-usuario-desde-empleado.js "juan.perez@company.com" "Password123!"

Requisitos:
  ✓ Email debe existir en GN_TERCE (tabla de personas/terceros)
  ✓ Contraseña debe tener: 8+ chars, mayúscula, minúscula, número, símbolo
  ✓ El usuario no puede existir ya en GN_USUAR

  `);
  process.exit(1);
}

crearUsuario(email, contrasena);
