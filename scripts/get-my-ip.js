#!/usr/bin/env node

/**
 * 🌐 OBTENEDOR DE IP - SERVIDOR CENTRAL
 *
 * Uso: node get-my-ip.js
 *
 * Este script muestra la IP de esta máquina que debe compartirse con las sucursales
 * para que puedan acceder al servidor central de nómina.
 *
 * También genera las instrucciones para:
 * 1. Configurar Firewall de Windows
 * 2. Verificar conectividad
 * 3. Compartir acceso con sucursales
 */

const os = require('os');
const { spawn } = require('child_process');

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║         🌐 OBTENESOR DE IP - SERVIDOR CENTRAL            ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// ============================================================================
// PASO 1: OBTENER LA IP DE ESTA MÁQUINA
// ============================================================================

console.log('📍 PASO 1: Detectando IP de esta máquina...\n');

function getNetworkIPs() {
  const interfaces = os.networkInterfaces();
  const ips = {};

  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        if (!ips[name]) {
          ips[name] = [];
        }
        ips[name].push(iface.address);
      }
    }
  }

  return ips;
}

const networkIPs = getNetworkIPs();
const ipList = Object.values(networkIPs).flat();

if (ipList.length === 0) {
  console.log('❌ No se encontró ninguna IP pública en esta máquina');
  console.log('⚠️  Asegúrate de estar conectado a una red\n');
  process.exit(1);
}

console.log('✅ IPs encontradas:\n');

Object.entries(networkIPs).forEach(([name, ips]) => {
  console.log(`   ${name}:`);
  ips.forEach(ip => {
    console.log(`      • ${ip}`);
  });
});

const primaryIP = ipList[0];

console.log(`\n✅ IP Principal (para compartir): ${primaryIP}\n`);

// ============================================================================
// PASO 2: INSTRUCCIONES DE ACCESO
// ============================================================================

const PORT = process.env.PORT || 3000;

console.log('═'.repeat(60));
console.log('🔗 ACCESO PARA SUCURSALES');
console.log('═'.repeat(60));

console.log(`\n📋 Comparte esta URL con las sucursales:\n`);
console.log(`   ┌─────────────────────────────────────────┐`);
console.log(`   │  http://${primaryIP}:${PORT}`);
console.log(`   └─────────────────────────────────────────┘\n`);

console.log('📌 Instrucciones para cada sucursal:');
console.log(`   1. Abre tu navegador`);
console.log(`   2. Copia y pega: http://${primaryIP}:${PORT}`);
console.log(`   3. Inicia sesión con tu usuario`);
console.log(`   4. Los cambios se verán en tiempo real\n`);

// ============================================================================
// PASO 3: CONFIGURACIÓN DE FIREWALL
// ============================================================================

console.log('═'.repeat(60));
console.log('🔥 FIREWALL DE WINDOWS');
console.log('═'.repeat(60));

console.log(`\n⚠️  Si no pueden conectar desde otras máquinas, abre el puerto ${PORT}:\n`);

console.log('📝 OPCIÓN A: Automático (como Administrador)\n');
console.log(`   1. Abre PowerShell como Administrador`);
console.log(`   2. Pega este comando completo:\n`);

const psCommand = `New-NetFirewallRule -DisplayName "Servidor Nomina" -Direction Inbound -LocalPort ${PORT} -Protocol TCP -Action Allow`;
console.log(`   ${psCommand}\n`);

console.log('📝 OPCIÓN B: Manual en Windows Defender\n');
console.log(`   1. Abre "Firewall de Windows Defender"`);
console.log(`   2. Click en "Permitir una aplicación o característica"`);
console.log(`   3. Click en "Cambiar configuración"`);
console.log(`   4. Click en "Permitir otra aplicación"`);
console.log(`   5. Busca Node.js y marca "Privada" y "Pública"`);
console.log(`   6. Click en "Aceptar"\n`);

// ============================================================================
// PASO 4: VERIFICACIÓN
// ============================================================================

console.log('═'.repeat(60));
console.log('✅ VERIFICACIÓN');
console.log('═'.repeat(60));

console.log('\n📋 Para verificar que todo funciona:\n');

console.log('   1. Desde ESTA máquina:');
console.log(`      → Abre: http://localhost:${PORT}`);
console.log(`      → O: http://${primaryIP}:${PORT}`);
console.log(`      → Prueba: http://${primaryIP}:${PORT}/api/health\n`);

console.log('   2. Desde OTRA máquina en la red:');
console.log(`      → Abre: http://${primaryIP}:${PORT}`);
console.log(`      → Si funciona: ¡Todo está bien! ✅`);
console.log(`      → Si no funciona: Revisa Firewall ⚠️\n`);

// ============================================================================
// PASO 5: INFORMACIÓN ADICIONAL
// ============================================================================

console.log('═'.repeat(60));
console.log('ℹ️  INFORMACIÓN ADICIONAL');
console.log('═'.repeat(60));

console.log('\n🗂️  ESTRUCTURA DE ACCESO:\n');
console.log(`   Servidor Central (esta máquina):`);
console.log(`   IP: ${primaryIP}`);
console.log(`   Puerto: ${PORT}`);
console.log(`   BD: ${process.env.SERVER || 'DESKTOP-VEABB8R\\SQLEXPRESS'}\n`);

console.log(`   Sucursal A`);
console.log(`   ├─ Abre: http://${primaryIP}:${PORT}`);
console.log(`   └─ Todos comparten la misma BD\n`);

console.log(`   Sucursal B`);
console.log(`   ├─ Abre: http://${primaryIP}:${PORT}`);
console.log(`   └─ Cambios en tiempo real\n`);

// ============================================================================
// PASO 6: REDES DIFERENTES (INTER-SUCURSAL)
// ============================================================================

console.log('═'.repeat(60));
console.log('🌍 PARA REDES DIFERENTES (distintas sucursales remotas)');
console.log('═'.repeat(60));

console.log('\nSi las sucursales están en REDES DISTINTAS:');
console.log('(ej: Oficina Central en Lima, Sucursal en Arequipa)\n');

console.log('OPCIÓN 1: Port Forwarding (gratis, requiere router)');
console.log('   • Configurar el router de la oficina central');
console.log('   • Redirigir puerto externo hacia 192.168.x.x:3000');
console.log('   • Usar IP pública del router (ej: 200.50.x.x:3000)');
console.log('   • Las sucursales usan: http://200.50.x.x:3000\n');

console.log('OPCIÓN 2: VPN Site-to-Site (más seguro)');
console.log('   • Crear red privada virtual entre sucursales');
console.log('   • Usar OpenVPN (gratuito)');
console.log('   • Las máquinas se ven entre sí como si estuvieran en la misma red');
console.log('   • Contactar a IT para configuración\n');

// ============================================================================
// FINAL
// ============================================================================

console.log('═'.repeat(60));
console.log('✅ PRÓXIMOS PASOS');
console.log('═'.repeat(60));

console.log('\n1. Iniciar el servidor:');
console.log(`   npm start\n`);

console.log('2. Compartir con sucursales:');
console.log(`   URL: http://${primaryIP}:${PORT}\n`);

console.log('3. Si hay problemas de conexión:');
console.log('   → Verificar Firewall de Windows');
console.log('   → Ejecutar: node diagnostico-conexion-bd.js');
console.log('   → Ejecutar: ping 8.8.8.8 (conexión internet)\n');

console.log('━'.repeat(60) + '\n');
