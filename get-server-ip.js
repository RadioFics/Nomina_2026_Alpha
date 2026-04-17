#!/usr/bin/env node

/**
 * 🔧 OBTENEDOR DE IP DEL SERVIDOR SQL
 *
 * Uso: node get-server-ip.js
 *
 * Este script obtiene la IP del servidor SQL Server basado en su hostname,
 * para usar en lugar del hostname en el archivo .env
 */

const dns = require('dns').promises;

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║         🔍 OBTENEDOR DE IP DEL SERVIDOR SQL             ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

async function getServerIP() {
  try {
    // Aquí va el hostname del servidor
    const hostname = 'CM-ITD-P-05';

    console.log(`⏳ Resolviendo hostname: ${hostname}\n`);

    const addresses = await dns.resolve4(hostname);

    if (addresses.length === 0) {
      console.log(`❌ No se encontró ninguna IP para: ${hostname}\n`);
      console.log('Posibles causas:');
      console.log('  1. El hostname no existe en la red');
      console.log('  2. El DNS no puede resolverlo');
      console.log('  3. No tienes conexión a la red corporativa\n');
      process.exit(1);
    }

    console.log(`✅ IP(s) encontrada(s):\n`);
    addresses.forEach((ip, idx) => {
      console.log(`  ${idx + 1}. ${ip}`);
    });

    console.log('\n📋 Para actualizar tu .env:\n');
    console.log('Reemplaza esta línea:');
    console.log(`  SERVER=CM-ITD-P-05\\SQLEXPRESS\n`);
    console.log('Con esta línea:');
    console.log(`  SERVER=${addresses[0]}\\SQLEXPRESS\n`);

    console.log('💡 O si prefieres usar el hostname (funciona si estás en la red):');
    console.log(`  SERVER=CM-ITD-P-05\\SQLEXPRESS\n`);

  } catch (error) {
    console.log(`❌ Error: ${error.message}\n`);

    if (error.code === 'ENOTFOUND') {
      console.log('El hostname no se puede resolver. Verifica:');
      console.log('  1. Que el nombre sea correcto: CM-ITD-P-05');
      console.log('  2. Que tengas conexión a la red corporativa');
      console.log('  3. Que el servidor esté encendido\n');
    } else if (error.code === 'ECONNREFUSED') {
      console.log('Conexión rechazada. Verifica:');
      console.log('  1. Que SQL Server esté corriendo');
      console.log('  2. Que el firewall lo permita\n');
    }

    process.exit(1);
  }
}

// Ejecutar
getServerIP();
