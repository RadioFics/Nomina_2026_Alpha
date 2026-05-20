const sql = require('mssql');
const fs = require('fs');
const path = require('path');

// ──────────────────────────────────────────────────────────────────
// Configuración runtime (inicializada desde .env, sobreescribible en runtime)
// ──────────────────────────────────────────────────────────────────
let runtimeConfig = null;
let isReconfiguring = false;

/**
 * Construye un objeto de configuración válido
 * @param {Object} source - Objeto con claves: SERVER, DATABASE, UID, PWD (o minúsculas)
 *
 * Compatibilidad dual local ↔ Azure:
 *   - Local (NODE_ENV=development):  encrypt=false, trustServerCertificate=true
 *   - Azure SQL (NODE_ENV=production): encrypt=true, trustServerCertificate=false
 *   - Se puede forzar manualmente con DB_ENCRYPT=true / DB_TRUST_CERT=true en .env
 */
function buildConfig(source) {
  const server   = source.SERVER   || source.server;
  const database = source.DATABASE || source.database;
  const uid      = source.UID      || source.uid;
  const pwd      = source.PWD      || source.pwd;

  if (!server || !database || !uid || !pwd) {
    throw new Error(
      `Faltan parámetros de conexión: SERVER=${server ? '✓' : '✗'}, ` +
      `DATABASE=${database ? '✓' : '✗'}, UID=${uid ? '✓' : '✗'}, PWD=${pwd ? '✓' : '✗'}`
    );
  }

  // Azure SQL requiere encrypt:true. SQL Server Express local requiere encrypt:false.
  // Se detecta automáticamente por NODE_ENV, o se puede forzar con DB_ENCRYPT.
  const isProduction = (source.NODE_ENV || process.env.NODE_ENV) === 'production';
  const isAzureSQL   = server.includes('.database.windows.net');
  const needsEncrypt = isProduction || isAzureSQL || source.DB_ENCRYPT === 'true';

  return {
    server,
    database,
    // Puerto explícito: Azure SQL usa 1433 estándar; SQL Express local puede ser dinámico
    port: parseInt(source.DB_PORT || process.env.DB_PORT || '1433', 10),
    authentication: {
      type: 'default',
      options: { userName: uid, password: pwd }
    },
    options: {
      encrypt: needsEncrypt,
      // En Azure SQL el certificado es válido; localmente a veces no, por eso trustServerCertificate
      trustServerCertificate: !needsEncrypt || source.DB_TRUST_CERT === 'true',
      enableKeepAlive: true,
      connectionTimeout: 15000,
      requestTimeout: 30000,
      connectionRetryInterval: 100,
      maxRetriesOnTransientErrors: 3,
      useUTC: true
    }
  };
}

// Carga inicial desde process.env (que ya fue cargado por dotenv en server.js)
try {
  runtimeConfig = buildConfig(process.env);
  console.log(`[DB] Config cargada: ${runtimeConfig.server} / ${runtimeConfig.database}`);
} catch (err) {
  console.error('[DB] ERROR crítico en config inicial:', err.message);
  process.exit(1);
}

// ──────────────────────────────────────────────────────────────────
// Pool singleton
// ──────────────────────────────────────────────────────────────────
let pool = null;
let isConnecting = false;

async function getConnection() {
  // Si ya se está conectando, esperar a que termine
  if (isConnecting) {
    let attempts = 0;
    while ((pool === null || !pool.connected) && attempts < 100) {
      await new Promise(resolve => setTimeout(resolve, 100));
      attempts++;
    }
    if (pool && pool.connected) {
      return pool;
    }
  }

  // Si hay un pool conectado, devolverlo
  if (pool && pool.connected) {
    return pool;
  }

  // Reconectar si es necesario
  isConnecting = true;
  try {
    // Cerrar pool anterior si existe pero no está conectado
    if (pool && !pool.connected) {
      try {
        await pool.close();
      } catch (_) {}
      pool = null;
    }

    pool = new sql.ConnectionPool(runtimeConfig);

    pool.on('error', (err) => {
      console.error('[DB] Error en pool:', err.message);
      pool = null;
      isConnecting = false;
    });

    await pool.connect();
    isConnecting = false;
    console.log(`[DB] Conectado: ${runtimeConfig.server} / ${runtimeConfig.database}`);
    return pool;
  } catch (err) {
    pool = null;
    isConnecting = false;
    throw err;
  }
}

async function executeQuery(query, params = {}, retries = 2) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const conn = await getConnection();
      const request = conn.request();
      Object.keys(params).forEach(key => request.input(key, params[key]));
      return request.query(query);
    } catch (err) {
      // Si es "Connection is closed" y hay reintentos, esperar y reintentar
      if (err.message?.includes('closed') && attempt < retries) {
        console.log(`[DB] Reintentando query (intento ${attempt + 1}/${retries})...`);
        pool = null; // Forzar reconexión
        await new Promise(resolve => setTimeout(resolve, 500 * (attempt + 1)));
        continue;
      }
      throw err;
    }
  }
}

// ──────────────────────────────────────────────────────────────────
// API de administración: estado, prueba, reconfiguración
// ──────────────────────────────────────────────────────────────────

/**
 * Retorna el estado actual sin intentar conectar
 */
function getStatus() {
  return {
    connected: pool !== null && pool.connected,
    connecting: isConnecting,
    server:    runtimeConfig ? runtimeConfig.server : null,
    database:  runtimeConfig ? runtimeConfig.database : null,
    user:      runtimeConfig ? runtimeConfig.authentication.options.userName : null
  };
}

/**
 * Prueba una configuración alternativa sin alterar el pool activo.
 * Abre una conexión temporal, ejecuta SELECT 1, y la cierra.
 * Retorna { success, latencyMs, error }
 */
async function testConnection(configParams) {
  const testCfg = buildConfig(configParams);
  testCfg.options.connectionTimeout = 8000;
  testCfg.options.requestTimeout = 8000;

  const testPool = new sql.ConnectionPool(testCfg);
  const start = Date.now();

  try {
    await testPool.connect();
    await testPool.request().query('SELECT 1 AS ping');
    const latencyMs = Date.now() - start;
    return { success: true, latencyMs };
  } catch (err) {
    return { success: false, latencyMs: Date.now() - start, error: err.message };
  } finally {
    testPool.close().catch(() => {});
  }
}

/**
 * Cierra el pool actual, aplica la nueva config, persiste en .env, y abre un nuevo pool.
 * Retorna { success, error }
 */
async function reconfigure(newParams) {
  if (isReconfiguring) {
    throw new Error('Reconfiguración en progreso. Espera un momento.');
  }

  // Validar antes de cerrar nada
  let newCfg;
  try {
    newCfg = buildConfig(newParams);
  } catch (err) {
    return { success: false, error: err.message };
  }

  isReconfiguring = true;
  try {
    // 1. Cerrar pool existente
    if (pool) {
      try {
        await pool.close();
      } catch (_) {}
      pool = null;
      isConnecting = false;
    }

    // 2. Actualizar config en memoria
    runtimeConfig = newCfg;

    // 3. Persistir al .env
    writeEnv({
      SERVER: newCfg.server,
      DATABASE: newCfg.database,
      UID: newCfg.authentication.options.userName,
      PWD: newCfg.authentication.options.password
    });

    // 4. Abrir nuevo pool
    await getConnection();
    return { success: true };
  } catch (err) {
    return { success: false, error: err.message };
  } finally {
    isReconfiguring = false;
  }
}

/**
 * Actualiza solo las claves de BD en el archivo .env
 * sin tocar las demás variables (JWT_SECRET, PORT, etc.)
 */
function writeEnv(updates) {
  const envPath = path.join(__dirname, '..', '.env');

  let content = '';
  try {
    content = fs.readFileSync(envPath, 'utf8');
  } catch (_) {
    // .env no existe aún
  }

  // Clave -> nuevo valor
  Object.entries(updates).forEach(([key, value]) => {
    const regex = new RegExp(`^${key}=.*$`, 'm');
    const line = `${key}=${value}`;
    if (regex.test(content)) {
      content = content.replace(regex, line);
    } else {
      content = content ? `${content}\n${line}` : line;
    }
  });

  fs.writeFileSync(envPath, content, 'utf8');
  console.log('[DB] .env actualizado con nueva config de BD');
}

module.exports = {
  getConnection,
  executeQuery,
  getStatus,
  testConnection,
  reconfigure
};
