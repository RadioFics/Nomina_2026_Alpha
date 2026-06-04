#!/usr/bin/env node
/**
 * GENERADOR DE HASH BCRYPT
 * Genera hashes seguros para almacenar contraseñas
 *
 * Uso: node generate-bcrypt.js "tu-contrasena"
 */

const bcrypt = require('bcryptjs');

async function generarHash(contrasena) {
  try {
    if (!contrasena || contrasena.trim() === '') {
      console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║               GENERADOR DE HASH BCRYPT PARA CONTRASEÑAS             ║
╚══════════════════════════════════════════════════════════════════════╝

Uso:
  node generate-bcrypt.js "tu-contrasena-aqui"

Ejemplos:
  node generate-bcrypt.js "Hernandez@2024"
  node generate-bcrypt.js "Password123!"
  node generate-bcrypt.js "Admin#Secure456"

Requisitos de contraseña:
  ✓ Mínimo 8 caracteres
  ✓ Al menos una mayúscula (A-Z)
  ✓ Al menos una minúscula (a-z)
  ✓ Al menos un número (0-9)
  ✓ Al menos un símbolo (!@#$%^&*)

      `);
      process.exit(1);
    }

    console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║               VALIDANDO CONTRASEÑA...                                ║
╚══════════════════════════════════════════════════════════════════════╝
    `);

    // Validar requisitos
    const hasUppercase = /[A-Z]/.test(contrasena);
    const hasLowercase = /[a-z]/.test(contrasena);
    const hasNumbers = /[0-9]/.test(contrasena);
    const hasSpecial = /[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]/.test(contrasena);
    const hasMinLength = contrasena.length >= 8;

    console.log(`
📋 VALIDACIÓN DE CONTRASEÑA:

  ${hasMinLength ? '✅' : '❌'} Mínimo 8 caracteres (${contrasena.length}/8)
  ${hasUppercase ? '✅' : '❌'} Al menos una mayúscula (A-Z)
  ${hasLowercase ? '✅' : '❌'} Al menos una minúscula (a-z)
  ${hasNumbers ? '✅' : '❌'} Al menos un número (0-9)
  ${hasSpecial ? '✅' : '❌'} Al menos un símbolo (!@#$%^&*)
    `);

    if (!hasMinLength || !hasUppercase || !hasLowercase || !hasNumbers || !hasSpecial) {
      console.log(`
❌ LA CONTRASEÑA NO CUMPLE LOS REQUISITOS

Intenta con: "Hernandez@2024" o "Password123!"
      `);
      process.exit(1);
    }

    // Generar hash
    console.log('\n⏳ Generando hash bcrypt (esto tarda ~1 segundo)...\n');
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(contrasena, salt);

    console.log(`
╔══════════════════════════════════════════════════════════════════════╗
║                    ✅ HASH GENERADO EXITOSAMENTE                    ║
╚══════════════════════════════════════════════════════════════════════╝

🔐 HASH BCRYPT (${hash.length} caracteres):

${hash}

📋 INSTRUCCIONES PARA USAR EN LA BD:

Opción 1: Desde SQL Server Management Studio (SSMS)
─────────────────────────────────────────────────────────────────────

DECLARE @email VARCHAR(100) = 'hernandezjuanfelipe964@gmail.com'
DECLARE @hash VARCHAR(255) = '${hash}'

UPDATE GN_USUAR
SET PASSW_HASH = @hash, INTENTOS_FALL = 0, ESTA_BLOQUEADO = 0
WHERE EMAIL = @email;

SELECT '✅ Hash actualizado' AS Resultado;


Opción 2: Usar el endpoint de API (si eres Admin)
─────────────────────────────────────────────────────────────────────

POST /api/auth/crear-usuario
{
  "cedula": "1234567890",
  "email": "hernandezjuanfelipe964@gmail.com",
  "contrasena": "${contrasena}"
}

(El sistema genera el hash automáticamente)


Opción 3: Crear usuario desde empleado existente
─────────────────────────────────────────────────────────────────────

node crear-usuario-desde-empleado.js "hernandezjuanfelipe964@gmail.com" "${contrasena}"


✅ Una vez guardado, el usuario puede ingresar con:
   Email: hernandezjuanfelipe964@gmail.com
   Contraseña: ${contrasena}
    `);

  } catch (err) {
    console.error('❌ ERROR:', err.message);
    process.exit(1);
  }
}

generarHash(process.argv[2]);
