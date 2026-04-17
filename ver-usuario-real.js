#!/usr/bin/env node
/**
 * VER USUARIO - ADAPTADO A ESTRUCTURA REAL DE BD
 * Uso: node ver-usuario-real.js "hernandezjuanfelipe964@gmail.com"
 */

require('dotenv').config();
const { executeQuery } = require('./config/database');

async function verUsuario(identificador) {
  try {
    console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║              INFORMACIÓN DEL USUARIO (Estructura Real)               ║
╚══════════════════════════════════════════════════════════════════════╝
    `);

    // Buscar usuario en GN_USUAR por DIR_ELEC (email)
    // O por NUM_IDEN (cédula) si no tiene @
    const query = `
      SELECT TOP 1
        u.COD_USUA,
        u.COD_EMPR,
        u.NOM_USUA,
        u.ABR_USUA,
        u.DIR_ELEC,
        u.PAS_USUA,
        u.PAS_HASH,
        LEN(u.PAS_HASH) as Longitud_Hash,
        u.ACT_INAC,
        u.IND_BLOQ,
        u.INT_FALL,
        u.CAM_PASS,
        u.FEC_ACTI,
        u.FEC_EXPI,
        u.FEC_ULCA,
        u.COD_FUNCI,
        u.COD_GUSU,
        u.ACT_ESTA as Usuario_Estado,
        f.COD_CARGO,
        f.FEC_INGRES,
        f.FEC_RETIRO,
        f.ACT_ESTA as Empleado_Estado,
        t.NUM_IDEN,
        t.NOM_COMP,
        g.NOM_GUSU
      FROM GN_USUAR u
      LEFT JOIN GN_FUNCI f ON u.COD_FUNCI = f.COD_FUNCI
      LEFT JOIN GN_TERCE t ON f.COD_TERC = t.COD_TERC
      LEFT JOIN GN_GUSUA g ON u.COD_GUSU = g.COD_GUSU
      WHERE u.DIR_ELEC LIKE @id OR u.NOM_USUA LIKE @id
      ORDER BY u.ACT_USUA DESC
    `;

    const result = await executeQuery(query, { id: `%${identificador}%` });

    if (!result.recordset || result.recordset.length === 0) {
      console.log(`
❌ USUARIO NO ENCONTRADO

Búsqueda: ${identificador}

Soluciones:
1. Verifica que el email es correcto
2. Consulta en SSMS:
   SELECT COD_USUA, NOM_USUA, DIR_ELEC
   FROM GN_USUAR
   WHERE DIR_ELEC LIKE '%${identificador}%' OR NOM_USUA LIKE '%${identificador}%'

3. Si no existe, crear usuario (ver guía)
      `);
      return;
    }

    const usuario = result.recordset[0];

    console.log(`
📋 IDENTIDAD:
  └─ ID Usuario (COD_USUA):     ${usuario.COD_USUA}
  └─ Empresa (COD_EMPR):        ${usuario.COD_EMPR}
  └─ Nombre (NOM_USUA):         ${usuario.NOM_USUA}
  └─ Abreviatura (ABR_USUA):    ${usuario.ABR_USUA || '(no asignada)'}
  └─ Email (DIR_ELEC):          ${usuario.DIR_ELEC || '(no registrado)'}
  └─ Cédula (NUM_IDEN):         ${usuario.NUM_IDEN || '(no asignada)'}

🎯 ACCESO:
  └─ Activo (ACT_INAC):         ${usuario.ACT_INAC === 'S' ? '✅ SÍ' : '❌ NO'}
  └─ Bloqueado (IND_BLOQ):      ${usuario.IND_BLOQ === 'S' ? '❌ SÍ (bloqueado)' : '✅ NO'}
  └─ Intentos fallidos (INT_FALL): ${usuario.INT_FALL || 0}

🔐 CONTRASEÑA:
  └─ Texto (PAS_USUA):          ${usuario.PAS_USUA ? usuario.PAS_USUA.trim() : '(no registrada)'}
  └─ Hash (PAS_HASH):           ${usuario.PAS_HASH ? '✅ Registrado' : '❌ NO REGISTRADO'}
  └─ Longitud Hash:             ${usuario.Longitud_Hash || 0} (esperado: 60) ${usuario.Longitud_Hash >= 60 ? '✅' : '❌'}
  └─ Cambiar pass (CAM_PASS):   ${usuario.CAM_PASS === 'S' ? '⚠️ SÍ (debe cambiar)' : '✅ NO'}
  └─ Último cambio (FEC_ULCA):  ${usuario.FEC_ULCA ? new Date(usuario.FEC_ULCA).toLocaleString() : 'Nunca'}

💼 EMPLEADO:
  └─ Código (COD_FUNCI):        ${usuario.COD_FUNCI || '(no asignado)'}
  └─ Cargo (COD_CARGO):         ${usuario.COD_CARGO || '(no asignado)'}
  └─ Fecha Ingreso (FEC_INGRES):${usuario.FEC_INGRES || '(no registrada)'}
  └─ Fecha Retiro (FEC_RETIRO): ${usuario.FEC_RETIRO || '(activo)'}
  └─ Estado Empleado (ACT_ESTA):${usuario.Empleado_Estado === 'A' ? '✅ ACTIVO' : '❌ INACTIVO'}

👥 GRUPO Y PERMISOS:
  └─ Grupo (COD_GUSU):          ${usuario.COD_GUSU || '(no asignado)'}
  └─ Nombre Grupo (NOM_GUSU):   ${usuario.NOM_GUSU || '(sin grupo)'}

📅 AUDITORÍA:
  └─ Fecha Activación (FEC_ACTI): ${usuario.FEC_ACTI ? new Date(usuario.FEC_ACTI).toLocaleString() : '(no registrada)'}
  └─ Fecha Expiración (FEC_EXPI): ${usuario.FEC_EXPI ? new Date(usuario.FEC_EXPI).toLocaleString() : '(no expira)'}
    `);

    // Análisis: ¿Puede ingresar?
    console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║              ¿PUEDE INGRESAR A LA APLICACIÓN?                       ║
╚══════════════════════════════════════════════════════════════════════╝
    `);

    let problemas = [];
    let puedeIngresar = true;

    // Validaciones
    if (!usuario.DIR_ELEC || usuario.DIR_ELEC.trim() === '') {
      problemas.push('❌ Sin email (DIR_ELEC)');
      puedeIngresar = false;
    } else {
      console.log('  ✅ Tiene email');
    }

    if (!usuario.PAS_HASH || usuario.Longitud_Hash < 60) {
      problemas.push(`❌ Hash de contraseña incompleto (${usuario.Longitud_Hash || 0}/60 chars)`);
      puedeIngresar = false;
    } else {
      console.log('  ✅ Hash de contraseña válido');
    }

    if (usuario.ACT_INAC !== 'S') {
      problemas.push('❌ Usuario inactivo (ACT_INAC ≠ "S")');
      puedeIngresar = false;
    } else {
      console.log('  ✅ Usuario activo');
    }

    if (usuario.IND_BLOQ === 'S') {
      problemas.push(`❌ Usuario bloqueado (${usuario.INT_FALL} intentos fallidos)`);
      puedeIngresar = false;
    } else {
      console.log('  ✅ Usuario no bloqueado');
    }

    if (usuario.Empleado_Estado && usuario.Empleado_Estado !== 'A') {
      problemas.push('❌ Empleado inactivo (ACT_ESTA ≠ "A")');
      puedeIngresar = false;
    } else if (usuario.COD_FUNCI) {
      console.log('  ✅ Empleado activo');
    }

    console.log('');

    if (puedeIngresar && usuario.PAS_HASH) {
      console.log(`
✅ SÍ PUEDE INGRESAR

El usuario puede acceder a http://localhost:3000 con:
  Email:       ${usuario.DIR_ELEC}
  Contraseña:  (la que se estableció durante la creación)
      `);
    } else {
      console.log(`
❌ NO PUEDE INGRESAR

Problemas encontrados:
${problemas.map(p => '  ' + p).join('\n')}

SOLUCIONES:
      `);

      if (!usuario.PAS_HASH || usuario.Longitud_Hash < 60) {
        console.log(`
  1. Generar e actualizar hash de contraseña:
     node generate-bcrypt.js "NuevaContraseña123!"
     (Luego actualizar en GN_USUAR.PAS_HASH)

     UPDATE GN_USUAR SET PAS_HASH = '$2b$10$...'
     WHERE COD_USUA = ${usuario.COD_USUA};
        `);
      }

      if (usuario.ACT_INAC !== 'S') {
        console.log(`
  2. Activar usuario en GN_USUAR:
     UPDATE GN_USUAR SET ACT_INAC = 'S'
     WHERE COD_USUA = ${usuario.COD_USUA};
        `);
      }

      if (usuario.IND_BLOQ === 'S') {
        console.log(`
  3. Desbloquear usuario en GN_USUAR:
     UPDATE GN_USUAR SET IND_BLOQ = 'N', INT_FALL = 0
     WHERE COD_USUA = ${usuario.COD_USUA};
        `);
      }

      if (usuario.Empleado_Estado && usuario.Empleado_Estado !== 'A') {
        console.log(`
  4. Activar empleado en GN_FUNCI:
     UPDATE GN_FUNCI SET ACT_ESTA = 'A'
     WHERE COD_FUNCI = ${usuario.COD_FUNCI};
        `);
      }
    }

    // Mostrar eventos recientes
    console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║              ÚLTIMOS 5 EVENTOS (GN_LOG_ACCE)                        ║
╚══════════════════════════════════════════════════════════════════════╝
    `);

    const logsQuery = `
      SELECT TOP 5
        TIP_EVEN,
        EST_EVEN,
        DES_EVEN,
        IP_ORIG,
        FEC_EVEN
      FROM GN_LOG_ACCE
      WHERE COD_USUA = @usuarioId OR NUM_IDEN = @cedula
      ORDER BY FEC_EVEN DESC
    `;

    const logsResult = await executeQuery(logsQuery, {
      usuarioId: usuario.COD_USUA,
      cedula: usuario.NUM_IDEN
    });

    if (logsResult.recordset && logsResult.recordset.length > 0) {
      console.log('');
      logsResult.recordset.forEach((log, idx) => {
        const fecha = new Date(log.FEC_EVEN).toLocaleString();
        const estado = log.EST_EVEN === 'EXITOSO' ? '✅' : '❌';
        console.log(`  ${idx + 1}. ${estado} ${log.TIP_EVEN} (${log.EST_EVEN})`);
        console.log(`     ${log.DES_EVEN}`);
        if (log.IP_ORIG) console.log(`     IP: ${log.IP_ORIG}`);
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
║        VER INFORMACIÓN COMPLETA DEL USUARIO (Estructura Real)        ║
╚══════════════════════════════════════════════════════════════════════╝

Uso:
  node ver-usuario-real.js "email@example.com"
  node ver-usuario-real.js "hernandezjuanfelipe964@gmail.com"

Salida:
  ✓ Información completa del usuario (estructura REAL de BD)
  ✓ Estado de acceso (puede/no puede ingresar)
  ✓ Últimos eventos en GN_LOG_ACCE
  ✓ Sugerencias para resolver problemas

  `);
  process.exit(1);
}

verUsuario(identificador);
