#!/usr/bin/env node
// Script para matar procesos Node.js y liberar puertos bloqueados
// Uso: node kill-server.js

const { exec } = require('child_process');
const { platform } = require('os');

console.log('🔍 Buscando procesos Node.js...\n');

if (platform() === 'win32') {
  // Windows
  exec('Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force', { shell: 'powershell.exe' }, (err) => {
    if (err && err.code !== 1) console.error(err);
    console.log('✓ Procesos Node.js terminados\n');
    console.log('🚀 Iniciando servidor...\n');

    // Esperar 2 segundos antes de iniciar
    setTimeout(() => {
      exec('npm start', { stdio: 'inherit', shell: true }, (err) => {
        if (err) console.error('Error:', err);
      });
    }, 2000);
  });
} else {
  // Linux/Mac
  exec('pkill -f "node"', (err) => {
    if (err && err.code !== 1) console.error(err);
    console.log('✓ Procesos Node.js terminados\n');
    console.log('🚀 Iniciando servidor...\n');

    setTimeout(() => {
      exec('npm start', { stdio: 'inherit', shell: true }, (err) => {
        if (err) console.error('Error:', err);
      });
    }, 2000);
  });
}
