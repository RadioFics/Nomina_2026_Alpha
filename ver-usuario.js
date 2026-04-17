#!/usr/bin/env node
/**
 * VER INFORMACIÓN COMPLETA DEL USUARIO
 * Muestra el estado actual de un usuario y si puede ingresar
 *
 * Uso: node ver-usuario.js "email@example.com" o "cedula"
 */

require('dotenv').config();
const { executeQuery } = require('./config/database');

async function verUsuario(identificador) {
  try {
    console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                  INFORMACIÓN DEL USUARIO                             ║
╚══════════════════════════════════════════════════════════════════════╝
    `);

    // Buscar por email o cédula
    const query = `
      SELECT
        u.ID_USUAR,
        u.CEDULA,
        u.NOMBRE_USUAR,
        u.EMAIL,
        u.NIVEL_USUAR,
        u.ESTA_ACTIVO,
        u.ESTA_BLOQUEADO,
        u.INTENTOS_FALL,
        u.PASSW_HASH,
        LEN(u.PASSW_HASH) as Longitud_Hash,
        u.FECH_ULT_CAMBIO,
        u.FECH_PROX_CAMBIO,
        u.FECH_CREACION,
        u.FECH_MODIF,
        r.COD_ROL,
        r.NOM_ROL
      FROM GN_USUAR u
      LEFT JOIN GN_ROL_USUAR r ON u.ID_USUAR = r.ID_USUAR AND r.ESTA_ACTIVO = 1
      WHERE u.EMAIL = @id OR u.CEDULA = @id
      ORDER BY u.FECH_CREACION DESC
    `;

    const result = await executeQuery(query, { id: identificador });

    if (!result.recordset || result.recordset.length === 0) {
      console.log(`
❌ USUARIO NO ENCONTRADO

Búsqueda: ${identificador}

Soluciones:
1. Verifica que el email/cédula es correcto
2. Consulta en SSMS:
   SELECT CEDULA, EMAIL, NOMBRE_USUAR FROM GN_USUAR
   WHERE EMAIL LIKE '%${identificador}%' OR CEDULA LIKE '%${identificador}%'

3. Si el usuario no existe, créalo con:
   node crear-usuario-desde-empleado.js "${identificador}" "Contrasena123!"
      `);
      return;
    }

    const usuario = result.recordset[0];
    const nivel = usuario.NIVEL_USUAR === 1 ? 'EMPLEADO' :
                  usuario.NIVEL_USUAR === 2 ? 'SUPERVISOR' :
                  'ADMINISTRADOR';

    console.log(`
📋 IDENTIDAD:
  └─ ID Usuario:         ${usuario.ID_USUAR}
  └─ Cédula:             ${usuario.CEDULA}
  └─ Nombre:             ${usuario.NOMBRE_USUAR}
  └─ Email:              ${usuario.EMAIL || '(no registrado)'}

🎯 ACCESO:
  └─ Nivel:              ${nivel} (${usuario.NIVEL_USUAR})
  └─ Activo:             ${usuario.ESTA_ACTIVO === 1 ? '✅ SÍ' : '❌ NO'}
  └─ Bloqueado:          ${usuario.ESTA_BLOQUEADO === 1 ? '❌ SÍ (intentos fallidos)' : '✅ NO'}
  └─ Intentos fallidos:  ${usuario.INTENTOS_FALL}

🔐 CONTRASEÑA:
  └─ Hash length:        ${usuario.Longitud_Hash} (esperado: 60) ${usuario.Longitud_Hash >= 60 ? '✅' : '❌ INCOMPLETO'}
  └─ Último cambio:      ${usuario.FECH_ULT_CAMBIO ? new Date(usuario.FECH_ULT_CAMBIO).toLocaleString() : 'Nunca'}
  └─ Próximo cambio req: ${usuario.FECH_PROX_CAMBIO ? new Date(usuario.FECH_PROX_CAMBIO).toLocaleString() : '(no asignado)'}

👤 ROL:
  └─ Código:             ${usuario.COD_ROL || '(sin rol)'}
  └─ Descripción:        ${usuario.NOM_ROL || '(sin rol)'}

📅 AUDITORÍA:
  └─ Creado:             ${new Date(usuario.FECH_CREACION).toLocaleString()}
  └─ Modificado:         ${usuario.FECH_MODIF ? new Date(usuario.FECH_MODIF).toLocaleString() : 'Nunca'}
    `);

    // Análisis: ¿puede ingresar?
    console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║              ¿PUEDE INGRESAR A LA APLICACIÓN?                       ║
╚══════════════════════════════════════════════════════════════════════╝
    `);

    let problemas = [];
    let puedeIngresar = true;

    // Validaciones
    if (!usuario.CEDULA) {
      problemas.push('❌ Sin cédula/identificación');
      puedeIngresar = false;
    } else {
      console.log('  ✅ Tiene cédula');
    }

    if (!usuario.PASSW_HASH || usuario.Longitud_Hash < 60) {
      problemas.push(`❌ Hash de contraseña incompleto (${usuario.Longitud_Hash}/60 chars)`);
      puedeIngresar = false;
    } else {
      console.log('  ✅ Hash de contraseña válido');
    }

    if (usuario.ESTA_ACTIVO !== 1) {
      problemas.push('❌ Usuario inactivo (ESTA_ACTIVO = 0)');
      puedeIngresar = false;
    } else {
      console.log('  ✅ Usuario activo');
    }

    if (usuario.ESTA_BLOQUEADO === 1) {
      problemas.push(`❌ Usuario bloqueado (${usuario.INTENTOS_FALL} intentos fallidos)`);
      puedeIngresar = false;
    } else {
      console.log('  ✅ Usuario no bloqueado');
    }

    console.log('');

    if (puedeIngresar) {
      console.log(`
✅ SÍ PUEDE INGRESAR

El usuario puede acceder a http://localhost:3000 con:
  Email:       ${usuario.EMAIL}
  Contraseña:  (la que se estableció durante la creación)
      `);
    } else {
      console.log(`
❌ NO PUEDE INGRESAR

Problemas encontrados:
${problemas.map(p => '  ' + p).join('\n')}

Soluciones rápidas:
      `);

      if (usuario.Longitud_Hash < 60) {
        console.log(`
  1. Regenerar hash de contraseña:
     node generate-bcrypt.js "NuevaContraseña123!"
     (Luego actualiza en SSMS)
        `);
      }

      if (usuario.ESTA_ACTIVO !== 1) {
        console.log(`
  2. Activar usuario en SSMS:
     UPDATE GN_USUAR SET ESTA_ACTIVO = 1
     WHERE EMAIL = '${usuario.EMAIL}';
        `);
      }

      if (usuario.ESTA_BLOQUEADO === 1) {
        console.log(`
  3. Desbloquear usuario en SSMS:
     UPDATE GN_USUAR SET ESTA_BLOQUEADO = 0, INTENTOS_FALL = 0
     WHERE EMAIL = '${usuario.EMAIL}';
        `);
      }
    }

    // Mostrar eventos recientes
    console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║              ÚLTIMOS 5 EVENTOS (AUDITORÍA)                          ║
╚══════════════════════════════════════════════════════════════════════╝
    `);

    const logsQuery = `
      SELECT TOP 5
        TIPO_EVENTO,
        ESTADO,
        MENSAJE,
        FECH_EVENTO
      FROM GN_LOG_ACCESO
      WHERE ID_USUAR = @usuarioId OR CEDULA = @cedula
      ORDER BY FECH_EVENTO DESC
    `;

    const logsResult = await executeQuery(logsQuery, {
      usuarioId: usuario.ID_USUAR,
      cedula: usuario.CEDULA
    });

    if (logsResult.recordset && logsResult.recordset.length > 0) {
      console.log('');
      logsResult.recordset.forEach((log, idx) => {
        const fecha = new Date(log.FECH_EVENTO).toLocaleString();
        const estado = log.ESTADO === 'EXITOSO' ? '✅' : '❌';
        console.log(`  ${idx + 1}. ${estado} ${log.TIPO_EVENTO} (${log.ESTADO})`);
        console.log(`     ${log.MENSAJE}`);
        console.log(`     ${fecha}\n`);
      });
    } else {
      console.log('  (Sin eventos registrados)\n');
    }

    console.log('');

  } catch (err) {
    console.error('❌ ERROR:', err.message);
    console.error('\nDetalles:', err);
    process.exit(1);
  }
}

// Validar argumentos
const identificador = process.argv[2];

if (!identificador) {
  console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║              VER INFORMACIÓN COMPLETA DEL USUARIO                    ║
╚══════════════════════════════════════════════════════════════════════╝

Uso:
  node ver-usuario.js "email@example.com"
  node ver-usuario.js "cedula-o-id"

Ejemplos:
  node ver-usuario.js "hernandezjuanfelipe964@gmail.com"
  node ver-usuario.js "1234567890"
  node ver-usuario.js "juan"

Salida:
  ✓ Información completa del usuario
  ✓ Estado de acceso (puede/no puede ingresar)
  ✓ Últimos eventos en auditoría
  ✓ Sugerencias para resolver problemas

  `);
  process.exit(1);
}

verUsuario(identificador);
