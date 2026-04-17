#!/usr/bin/env node

/**
 * 🔧 SCRIPT DE GESTIÓN DE USUARIOS
 *
 * Permite:
 * 1. Listar usuarios
 * 2. Ver detalles de un usuario
 * 3. Crear nuevo usuario
 * 4. Cambiar contraseña
 * 5. Bloquear/desbloquear usuario
 * 6. Ver logs de acceso
 *
 * Uso:
 * node script-gestionar-usuarios.js [comando] [parámetros]
 */

const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');
require('dotenv').config();
const { executeQuery } = require('./config/database');

// Colores para terminal
const colors = {
  reset: '\x1b[0m',
  green: '\x1b[32m',
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  blue: '\x1b[34m',
  cyan: '\x1b[36m'
};

const log = {
  success: (msg) => console.log(`${colors.green}✅ ${msg}${colors.reset}`),
  error: (msg) => console.log(`${colors.red}❌ ${msg}${colors.reset}`),
  info: (msg) => console.log(`${colors.blue}ℹ️  ${msg}${colors.reset}`),
  warn: (msg) => console.log(`${colors.yellow}⚠️  ${msg}${colors.reset}`),
  header: (msg) => console.log(`\n${colors.cyan}╔${'═'.repeat(msg.length + 2)}╗${colors.reset}\n${colors.cyan}║ ${msg} ║${colors.reset}\n${colors.cyan}╚${'═'.repeat(msg.length + 2)}╝${colors.reset}\n`)
};

// ============================================================================
// COMANDO 1: LISTAR TODOS LOS USUARIOS
// ============================================================================

async function listarUsuarios() {
  log.header('LISTAR USUARIOS');

  try {
    const query = `
      SELECT
          CEDULA,
          NOMBRE_USUAR,
          EMAIL,
          NIVEL_USUAR,
          CASE WHEN NIVEL_USUAR = 1 THEN 'Empleado'
               WHEN NIVEL_USUAR = 2 THEN 'Supervisor'
               WHEN NIVEL_USUAR = 3 THEN 'Admin'
               ELSE 'Desconocido'
          END as Rol,
          ESTA_ACTIVO,
          ESTA_BLOQUEADO,
          LEN(PASSW_HASH) as 'Longitud_Hash',
          INTENTOS_FALL,
          FECH_CREACION
      FROM GN_USUAR
      ORDER BY FECH_CREACION DESC;
    `;

    const result = await executeQuery(query);

    if (result.recordset.length === 0) {
      log.warn('No hay usuarios registrados');
      return;
    }

    console.log(`\nTotal de usuarios: ${result.recordset.length}\n`);

    // Mostrar tabla
    console.table(result.recordset.map(u => ({
      'Cédula': u.CEDULA,
      'Nombre': u.NOMBRE_USUAR,
      'Email': u.EMAIL || 'N/A',
      'Rol': u.Rol,
      'Activo': u.ESTA_ACTIVO ? '✅' : '❌',
      'Bloqueado': u.ESTA_BLOQUEADO ? '🔒' : '🔓',
      'Hash': `${u.Longitud_Hash} chars`,
      'Intentos': u.INTENTOS_FALL,
      'Creado': new Date(u.FECH_CREACION).toLocaleDateString('es-ES')
    })));

  } catch (err) {
    log.error(`Error: ${err.message}`);
  }
}

// ============================================================================
// COMANDO 2: VER DETALLES DE UN USUARIO
// ============================================================================

async function verUsuario(cedula) {
  log.header(`DETALLES DE USUARIO: ${cedula}`);

  try {
    const query = `
      SELECT
          ID_USUAR,
          CEDULA,
          NOMBRE_USUAR,
          EMAIL,
          NIVEL_USUAR,
          CASE WHEN NIVEL_USUAR = 1 THEN 'Empleado'
               WHEN NIVEL_USUAR = 2 THEN 'Supervisor'
               WHEN NIVEL_USUAR = 3 THEN 'Admin'
               ELSE 'Desconocido'
          END as Rol,
          ESTA_ACTIVO,
          ESTA_BLOQUEADO,
          PASSW_HASH,
          LEN(PASSW_HASH) as 'Longitud_Hash',
          INTENTOS_FALL,
          FECH_PROX_CAMBIO,
          FECH_CREACION,
          FECH_MODIF
      FROM GN_USUAR
      WHERE CEDULA = @cedula OR EMAIL = @cedula;
    `;

    const result = await executeQuery(query, { cedula });

    if (result.recordset.length === 0) {
      log.error(`Usuario "${cedula}" no encontrado`);
      return;
    }

    const u = result.recordset[0];

    console.log(`
ID Usuario:         ${u.ID_USUAR}
Cédula:            ${u.CEDULA}
Nombre:            ${u.NOMBRE_USUAR}
Email:             ${u.EMAIL || 'No asignado'}
Rol:               ${u.Rol}
Estado:            ${u.ESTA_ACTIVO ? '✅ Activo' : '❌ Inactivo'}
Bloqueado:         ${u.ESTA_BLOQUEADO ? '🔒 Sí (${u.INTENTOS_FALL} intentos fallidos)' : '🔓 No'}
Hash bcrypt:       ${u.Longitud_Hash} caracteres
Hash válido:       ${u.Longitud_Hash >= 60 ? '✅ Sí' : '❌ Incompleto'}
Hash:              ${u.PASSW_HASH}
Prox. cambio:      ${u.FECH_PROX_CAMBIO ? new Date(u.FECH_PROX_CAMBIO).toLocaleDateString('es-ES') : 'N/A'}
Creado:            ${new Date(u.FECH_CREACION).toLocaleDateString('es-ES')}
Modificado:        ${u.FECH_MODIF ? new Date(u.FECH_MODIF).toLocaleDateString('es-ES') : 'Nunca'}
    `);

    // Ver último intento de login
    const logQuery = `
      SELECT TOP 5
          TIPO_EVENTO,
          ESTADO,
          MENSAJE,
          IP_DIRECCION,
          FECH_EVENTO
      FROM GN_LOG_ACCESO
      WHERE CEDULA = @cedula
      ORDER BY FECH_EVENTO DESC;
    `;

    const logs = await executeQuery(logQuery, { cedula });
    if (logs.recordset.length > 0) {
      console.log('\n📋 ÚLTIMOS 5 EVENTOS DE ACCESO:\n');
      console.table(logs.recordset.map(l => ({
        'Tipo': l.TIPO_EVENTO,
        'Estado': l.ESTADO,
        'Mensaje': l.MENSAJE.substring(0, 40),
        'IP': l.IP_DIRECCION || 'N/A',
        'Fecha': new Date(l.FECH_EVENTO).toLocaleString('es-ES')
      })));
    }

  } catch (err) {
    log.error(`Error: ${err.message}`);
  }
}

// ============================================================================
// COMANDO 3: CREAR NUEVO USUARIO
// ============================================================================

async function crearUsuario(cedula, nombre, email, contrasena, nivel = 1) {
  log.header('CREAR NUEVO USUARIO');

  try {
    // Validar entrada
    if (!cedula || !nombre || !contrasena) {
      log.error('Parámetros requeridos: cedula, nombre, email (opcional), contrasena, nivel (opcional, default 1)');
      console.log('\nEjemplo:');
      console.log('  node script-gestionar-usuarios.js crear 1234567890 "Juan Pérez" juan@email.com "Contraseña123!" 1\n');
      return;
    }

    // Verificar si usuario ya existe
    const checkQuery = `SELECT CEDULA FROM GN_USUAR WHERE CEDULA = @cedula`;
    const checkResult = await executeQuery(checkQuery, { cedula });

    if (checkResult.recordset.length > 0) {
      log.error(`El usuario con cédula "${cedula}" ya existe`);
      return;
    }

    // Generar hash
    log.info('Generando hash bcrypt...');
    const saltRounds = 12;
    const hash = await bcrypt.hash(contrasena, saltRounds);

    log.info(`Hash generado: ${hash.substring(0, 50)}...`);

    // Insertar usuario
    const insertQuery = `
      INSERT INTO GN_USUAR (
          ID_USUAR,
          CEDULA,
          NOMBRE_USUAR,
          EMAIL,
          PASSW_HASH,
          NIVEL_USUAR,
          ESTA_ACTIVO,
          FECH_PROX_CAMBIO,
          FECH_CREACION,
          USUAR_CREACION
      )
      VALUES (
          @id,
          @cedula,
          @nombre,
          @email,
          @hash,
          @nivel,
          1,
          DATEADD(DAY, 90, GETDATE()),
          GETDATE(),
          'SCRIPT'
      );
    `;

    const id = uuidv4();
    await executeQuery(insertQuery, {
      id,
      cedula,
      nombre,
      email: email || null,
      hash,
      nivel: parseInt(nivel)
    });

    log.success(`Usuario creado exitosamente`);
    console.log(`
ID Usuario:   ${id}
Cédula:      ${cedula}
Nombre:      ${nombre}
Email:       ${email || '(no asignado)'}
Rol:         ${['', 'Empleado', 'Supervisor', 'Admin'][nivel] || 'Desconocido'}
Contraseña:  ${contrasena}

⚠️  Avisa al usuario que debe cambiar su contraseña en el primer login.
    `);

  } catch (err) {
    log.error(`Error: ${err.message}`);
  }
}

// ============================================================================
// COMANDO 4: CAMBIAR CONTRASEÑA
// ============================================================================

async function cambiarContrasena(cedula, nuevaContrasena) {
  log.header('CAMBIAR CONTRASEÑA');

  try {
    if (!cedula || !nuevaContrasena) {
      log.error('Parámetros requeridos: cedula, nueva_contraseña');
      console.log('\nEjemplo:');
      console.log('  node script-gestionar-usuarios.js cambiar 1234567890 "NuevaContraseña123!"\n');
      return;
    }

    // Verificar que usuario existe
    const checkQuery = `SELECT CEDULA FROM GN_USUAR WHERE CEDULA = @cedula OR EMAIL = @cedula`;
    const checkResult = await executeQuery(checkQuery, { cedula });

    if (checkResult.recordset.length === 0) {
      log.error(`Usuario "${cedula}" no encontrado`);
      return;
    }

    // Generar nuevo hash
    log.info('Generando nuevo hash bcrypt...');
    const saltRounds = 12;
    const nuevoHash = await bcrypt.hash(nuevaContrasena, saltRounds);

    // Actualizar contraseña
    const updateQuery = `
      UPDATE GN_USUAR
      SET
          PASSW_HASH = @hash,
          INTENTOS_FALL = 0,
          ESTA_BLOQUEADO = 0,
          FECH_ULT_CAMBIO = GETDATE(),
          FECH_PROX_CAMBIO = DATEADD(DAY, 90, GETDATE()),
          FECH_MODIF = GETDATE()
      WHERE CEDULA = @cedula OR EMAIL = @cedula;
    `;

    await executeQuery(updateQuery, { cedula, hash: nuevoHash });

    log.success(`Contraseña actualizada exitosamente`);
    console.log(`
Usuario:        ${cedula}
Nueva contra:   ${nuevaContrasena}
Hash bcrypt:    ${nuevoHash.substring(0, 50)}...
Prox. cambio:   En 90 días
    `);

  } catch (err) {
    log.error(`Error: ${err.message}`);
  }
}

// ============================================================================
// COMANDO 5: BLOQUEAR/DESBLOQUEAR USUARIO
// ============================================================================

async function bloquearUsuario(cedula, bloquear = true) {
  log.header(bloquear ? 'BLOQUEAR USUARIO' : 'DESBLOQUEAR USUARIO');

  try {
    if (!cedula) {
      log.error('Parámetro requerido: cedula');
      return;
    }

    const query = `
      UPDATE GN_USUAR
      SET
          ESTA_BLOQUEADO = @bloqueado,
          INTENTOS_FALL = ${bloquear ? 0 : 'INTENTOS_FALL'},
          FECH_MODIF = GETDATE()
      WHERE CEDULA = @cedula OR EMAIL = @cedula;
    `;

    await executeQuery(query, { cedula, bloqueado: bloquear ? 1 : 0 });

    log.success(`Usuario ${bloquear ? 'bloqueado' : 'desbloqueado'} exitosamente`);

  } catch (err) {
    log.error(`Error: ${err.message}`);
  }
}

// ============================================================================
// COMANDO 6: VER LOGS DE ACCESO
// ============================================================================

async function verLogs(cedula = null, limite = 20) {
  log.header(cedula ? `LOGS DE ${cedula}` : 'ÚLTIMOS LOGS DE ACCESO');

  try {
    let query = `
      SELECT TOP ${limite}
          CEDULA,
          TIPO_EVENTO,
          ESTADO,
          MENSAJE,
          IP_DIRECCION,
          FECH_EVENTO
      FROM GN_LOG_ACCESO
      ${cedula ? 'WHERE CEDULA = @cedula' : ''}
      ORDER BY FECH_EVENTO DESC;
    `;

    const result = await executeQuery(query, cedula ? { cedula } : {});

    if (result.recordset.length === 0) {
      log.warn('No hay logs registrados');
      return;
    }

    console.log(`\nMostrando ${result.recordset.length} registros:\n`);
    console.table(result.recordset.map(l => ({
      'Cédula': l.CEDULA,
      'Evento': l.TIPO_EVENTO,
      'Estado': l.ESTADO,
      'Mensaje': l.MENSAJE.substring(0, 35),
      'IP': l.IP_DIRECCION || 'N/A',
      'Fecha': new Date(l.FECH_EVENTO).toLocaleString('es-ES')
    })));

  } catch (err) {
    log.error(`Error: ${err.message}`);
  }
}

// ============================================================================
// MOSTRAR AYUDA
// ============================================================================

function mostrarAyuda() {
  console.log(`
${colors.cyan}╔════════════════════════════════════════════════════════════╗
║   SCRIPT DE GESTIÓN DE USUARIOS - Nómina App                ║
╚════════════════════════════════════════════════════════════╝${colors.reset}

${colors.yellow}USO:${colors.reset}
  node script-gestionar-usuarios.js [comando] [parámetros]

${colors.yellow}COMANDOS:${colors.reset}

  ${colors.green}listar${colors.reset}
    Muestra todos los usuarios del sistema

    Ejemplo:
      node script-gestionar-usuarios.js listar

  ${colors.green}ver${colors.reset} <cedula>
    Muestra detalles de un usuario específico

    Ejemplo:
      node script-gestionar-usuarios.js ver 1234567890
      node script-gestionar-usuarios.js ver hernandezjuan

  ${colors.green}crear${colors.reset} <cedula> <nombre> <email> <contraseña> [nivel]
    Crea un nuevo usuario
    Nivel: 1=Empleado, 2=Supervisor, 3=Admin (default: 1)

    Ejemplo:
      node script-gestionar-usuarios.js crear 1234567890 "Juan Pérez" juan@email.com "Contraseña123!" 1

  ${colors.green}cambiar${colors.reset} <cedula> <nueva_contraseña>
    Cambia la contraseña de un usuario

    Ejemplo:
      node script-gestionar-usuarios.js cambiar 1234567890 "NuevaContraseña456!"

  ${colors.green}bloquear${colors.reset} <cedula>
    Bloquea un usuario (impide login)

    Ejemplo:
      node script-gestionar-usuarios.js bloquear 1234567890

  ${colors.green}desbloquear${colors.reset} <cedula>
    Desbloquea un usuario (permite login)

    Ejemplo:
      node script-gestionar-usuarios.js desbloquear 1234567890

  ${colors.green}logs${colors.reset} [cedula] [limite]
    Muestra logs de acceso

    Ejemplo:
      node script-gestionar-usuarios.js logs              # Últimos 20 eventos
      node script-gestionar-usuarios.js logs 1234567890   # Eventos de un usuario
      node script-gestionar-usuarios.js logs 1234567890 50 # Últimos 50 eventos

${colors.yellow}EJEMPLOS COMUNES:${colors.reset}

  # Ver todos los usuarios
  node script-gestionar-usuarios.js listar

  # Crear nuevo usuario admin
  node script-gestionar-usuarios.js crear 1234567890 "Juan Pérez" juan@email.com "JuanPerez123!" 3

  # El usuario olvidó contraseña, resetearla
  node script-gestionar-usuarios.js cambiar hernandezjuan "ContraseñaTemporal123!"

  # Usuario intenta muy seguido, bloquearlo
  node script-gestionar-usuarios.js bloquear 1234567890

  # Ver qué intentó hacer cuando fue bloqueado
  node script-gestionar-usuarios.js logs 1234567890

${colors.yellow}NOTAS IMPORTANTES:${colors.reset}

  • Las contraseñas se generan como hashes bcrypt (nunca se guardan en texto plano)
  • Después de crear/cambiar contraseña, comunica la contraseña NEW al usuario
  • El usuario debe cambiar su contraseña en el primer login (recomendado)
  • Los logs muestran TODOS los intentos (exitosos y fallidos) para auditoría
  • Un usuario se bloquea automáticamente después de 5 intentos fallidos

${colors.reset}
  `);
}

// ============================================================================
// MAIN
// ============================================================================

async function main() {
  const args = process.argv.slice(2);
  const comando = args[0];

  if (!comando) {
    mostrarAyuda();
    process.exit(0);
  }

  try {
    switch (comando.toLowerCase()) {
      case 'listar':
        await listarUsuarios();
        break;

      case 'ver':
        if (!args[1]) {
          log.error('Se requiere cedula');
          break;
        }
        await verUsuario(args[1]);
        break;

      case 'crear':
        await crearUsuario(args[1], args[2], args[3], args[4], args[5]);
        break;

      case 'cambiar':
        if (!args[1] || !args[2]) {
          log.error('Se requieren: cedula y nueva_contraseña');
          break;
        }
        await cambiarContrasena(args[1], args[2]);
        break;

      case 'bloquear':
        if (!args[1]) {
          log.error('Se requiere cedula');
          break;
        }
        await bloquearUsuario(args[1], true);
        break;

      case 'desbloquear':
        if (!args[1]) {
          log.error('Se requiere cedula');
          break;
        }
        await bloquearUsuario(args[1], false);
        break;

      case 'logs':
        await verLogs(args[1] || null, parseInt(args[2]) || 20);
        break;

      case 'ayuda':
      case '--help':
      case '-h':
        mostrarAyuda();
        break;

      default:
        log.error(`Comando desconocido: "${comando}"`);
        console.log('\nPara ver ayuda:\n  node script-gestionar-usuarios.js ayuda\n');
        break;
    }

  } catch (err) {
    log.error(`Error fatal: ${err.message}`);
  }

  process.exit(0);
}

main();
