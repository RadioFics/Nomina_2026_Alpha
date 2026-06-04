/**
 * Ejecutor de la migración para NO_FIJAS, NO_AUSEN, NO_CAMBI y sus vistas.
 * Uso:   node run-migration-fijas-ausen-cambi.js
 *
 * Lee credenciales desde .env (SERVER, DATABASE, UID, PWD) y ejecuta el
 * script SQL en database/migration_fijas_ausen_cambi.sql respetando los
 * separadores "GO" (mssql del driver Node no los soporta nativamente).
 */

require('dotenv').config();
const fs = require('fs');
const path = require('path');
const sql = require('mssql');

const SQL_PATH = path.join(__dirname, 'database', 'migration_fijas_ausen_cambi.sql');

function splitOnGo(sqlText) {
  // Divide en batches usando líneas que son solo "GO" (case-insensitive, con
  // posible whitespace alrededor). Omite batches vacíos.
  return sqlText
    .split(/^\s*GO\s*$/mi)
    .map(s => s.trim())
    .filter(Boolean);
}

async function main() {
  const cfg = {
    server: process.env.SERVER,
    database: process.env.DATABASE,
    authentication: {
      type: 'default',
      options: { userName: process.env.UID, password: process.env.PWD }
    },
    options: {
      encrypt: false,
      trustServerCertificate: true,
      connectionTimeout: 20000,
      requestTimeout: 60000
    }
  };

  console.log(`[migrate] Conectando a ${cfg.server} / ${cfg.database} ...`);
  const pool = new sql.ConnectionPool(cfg);
  await pool.connect();
  console.log('[migrate] ✓ Conectado.');

  const raw = fs.readFileSync(SQL_PATH, 'utf8');
  const batches = splitOnGo(raw);
  console.log(`[migrate] Ejecutando ${batches.length} batch(es)...`);

  let ok = 0;
  for (let i = 0; i < batches.length; i++) {
    const b = batches[i];
    const preview = b.split('\n').slice(0, 2).join(' | ').slice(0, 90);
    try {
      await pool.request().batch(b);
      ok++;
      console.log(`  [${i + 1}/${batches.length}] ✓  ${preview}`);
    } catch (err) {
      console.error(`  [${i + 1}/${batches.length}] ✗  ${preview}`);
      console.error(`     -> ${err.message}`);
      throw err;
    }
  }

  console.log(`[migrate] ✓ ${ok}/${batches.length} batches ejecutados sin errores.`);
  await pool.close();
}

main().catch(err => {
  console.error('[migrate] ✗ ERROR:', err.message);
  process.exit(1);
});
