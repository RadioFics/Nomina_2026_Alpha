#!/usr/bin/env node

/**
 * 🔍 VALIDADOR DE CONFIGURACIÓN .env
 *
 * Uso: node validate-env.js
 *
 * Este script verifica que todas las variables de entorno requeridas
 * estén configuradas correctamente antes de iniciar la aplicación.
 */

const fs = require('fs');
const path = require('path');
require('dotenv').config();

console.log('\n╔════════════════════════════════════════════════════════════╗');
console.log('║         🔍 VALIDADOR DE CONFIGURACIÓN .env              ║');
console.log('╚════════════════════════════════════════════════════════════╝\n');

// Variables requeridas
const required = {
  SERVER: 'Servidor SQL Server',
  DATABASE: 'Nombre de la base de datos',
  UID: 'Usuario de SQL Server',
  PWD: 'Contraseña de SQL Server',
  PORT: 'Puerto de la aplicación'
};

// Variables opcionales
const optional = {
  NODE_ENV: 'Ambiente (development/production)',
  JWT_SECRET: 'Clave secreta para JWT',
  MAIL_USER: 'Usuario de correo (opcional)',
  MAIL_PASS: 'Contraseña de correo (opcional)'
};

let allValid = true;

// ============================================================================
// PASO 1: Verificar archivo .env
// ============================================================================

console.log('📁 PASO 1: Verificando archivo .env\n');

const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  const stats = fs.statSync(envPath);
  console.log(`  ✅ Archivo encontrado: ${envPath}`);
  console.log(`  ✅ Tamaño: ${stats.size} bytes\n`);
} else {
  console.log(`  ❌ Archivo NO ENCONTRADO: ${envPath}`);
  console.log('  📋 Debes crear un archivo .env con las variables requeridas');
  console.log('  📋 Copia .env.example a .env y actualiza los valores\n');
  process.exit(1);
}

// ============================================================================
// PASO 2: Verificar variables requeridas
// ============================================================================

console.log('✔️  PASO 2: Verificando variables REQUERIDAS\n');

Object.entries(required).forEach(([varName, description]) => {
  const value = process.env[varName];

  if (value) {
    const display = varName === 'PWD' ? '****' : value;
    console.log(`  ✅ ${varName.padEnd(15)} : ${display}`);
  } else {
    console.log(`  ❌ ${varName.padEnd(15)} : NO DEFINIDA - ${description}`);
    allValid = false;
  }
});

console.log('');

// ============================================================================
// PASO 3: Verificar variables opcionales
// ============================================================================

console.log('ℹ️  PASO 3: Verificando variables OPCIONALES\n');

Object.entries(optional).forEach(([varName, description]) => {
  const value = process.env[varName];

  if (value) {
    const display = (varName === 'PWD' || varName === 'MAIL_PASS') ? '****' : value;
    console.log(`  ✅ ${varName.padEnd(15)} : ${display}`);
  } else {
    console.log(`  ⚠️  ${varName.padEnd(15)} : no definida (opcional)`);
  }
});

console.log('');

// ============================================================================
// PASO 4: Validar formato de variables
// ============================================================================

console.log('🔧 PASO 4: Validando formato de variables\n');

// Validar SERVER (debe contener \ si es instancia específica)
const server = process.env.SERVER;
if (server) {
  const hasInstanceName = server.includes('\\');
  const isSQLExpress = server.includes('SQLEXPRESS');

  if (hasInstanceName) {
    console.log(`  ✅ SERVER: Contiene instancia específica (${server})`);
  } else {
    console.log(`  ⚠️  SERVER: ${server}`);
    console.log(`     💡 Si quieres conectar a una instancia específica, usa: SERVIDOR\\INSTANCIA`);
  }
}

// Validar PORT (debe ser número)
const port = process.env.PORT;
if (port && isNaN(port)) {
  console.log(`  ❌ PORT: "${port}" no es un número válido`);
  allValid = false;
} else if (port) {
  console.log(`  ✅ PORT: ${port} es válido`);
}

// Validar NODE_ENV
const nodeEnv = process.env.NODE_ENV;
if (nodeEnv && !['development', 'production', 'test'].includes(nodeEnv)) {
  console.log(`  ❌ NODE_ENV: "${nodeEnv}" no es válido (usar: development, production, test)`);
  allValid = false;
} else if (nodeEnv) {
  console.log(`  ✅ NODE_ENV: ${nodeEnv}`);
}

// Validar JWT_SECRET (mínimo 32 caracteres en producción)
const jwtSecret = process.env.JWT_SECRET;
if (jwtSecret && nodeEnv === 'production' && jwtSecret.length < 32) {
  console.log(`  ⚠️  JWT_SECRET: Tiene ${jwtSecret.length} caracteres`);
  console.log(`     💡 En producción, usar mínimo 32 caracteres aleatorios`);
} else if (jwtSecret) {
  console.log(`  ✅ JWT_SECRET: Configurado (${jwtSecret.length} caracteres)`);
}

console.log('');

// ============================================================================
// RESUMEN
// ============================================================================

if (allValid) {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           ✅ CONFIGURACIÓN VÁLIDA - LISTO PARA IR          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('Próximos pasos:');
  console.log('  1. node diagnostico-conexion-bd.js  (Verificar conexión)');
  console.log('  2. npm start                        (Iniciar servidor)\n');

  process.exit(0);
} else {
  console.log('╔════════════════════════════════════════════════════════════╗');
  console.log('║           ❌ CONFIGURACIÓN INCOMPLETA - ERRORES           ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('⚠️  Por favor corrige los errores arriba antes de continuar.\n');

  process.exit(1);
}
