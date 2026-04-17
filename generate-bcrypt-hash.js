#!/usr/bin/env node

/**
 * Generador de Hash Bcrypt para MineDax
 *
 * Uso:
 *   node generate-bcrypt-hash.js
 *   node generate-bcrypt-hash.js "TuContraseña@123"
 *
 * Requisitos:
 *   npm install bcryptjs
 */

const bcrypt = require('bcryptjs');

// Configuración
const SALT_ROUNDS = 12; // Recomendado por OWASP

async function generateHash(password) {
    if (!password) {
        console.error('❌ Error: Debes proporcionar una contraseña');
        console.log('\nUso:');
        console.log('  node generate-bcrypt-hash.js "TuContraseña@123"');
        process.exit(1);
    }

    try {
        console.log('🔐 Generando hash bcrypt...\n');
        console.log(`Password:     ${password}`);
        console.log(`Salt rounds:  ${SALT_ROUNDS}`);
        console.log('');

        const hash = await bcrypt.hash(password, SALT_ROUNDS);

        console.log('✅ Hash generado exitosamente:\n');
        console.log(`${hash}`);
        console.log(`\nLongitud: ${hash.length} caracteres`);
        console.log(`Versión bcrypt: ${hash.substring(0, 4)}`);
        console.log('\n' + '='.repeat(80));
        console.log('📋 COPIA ESTE HASH EN EL SCRIPT SQL:');
        console.log('='.repeat(80) + '\n');
        console.log(`UPDATE dbo.GN_USUAR`);
        console.log(`SET PAS_HASH = '${hash}'`);
        console.log(`WHERE ABR_USUA = 'HL';`);
        console.log('\n' + '='.repeat(80) + '\n');

        // Verificar que el hash sea válido
        console.log('🔍 Verificación:\n');
        const isValid = await bcrypt.compare(password, hash);
        console.log(`¿Hash válido? ${isValid ? '✅ Sí' : '❌ No'}`);

    } catch (error) {
        console.error('❌ Error al generar hash:', error.message);
        process.exit(1);
    }
}

// Obtener contraseña de argumentos
const password = process.argv[2] || 'Temporal@123';

if (!password) {
    console.error('❌ Error: Falta la contraseña');
    process.exit(1);
}

generateHash(password);
