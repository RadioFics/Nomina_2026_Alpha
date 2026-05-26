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
 * @param {Object} source - Objeto con claves: SERVER, DATABASE, y opcionalmente UID/PWD
 *
 * Compatibilidad dual local ↔ Azure:
 *   - Azure (NODE_ENV=production + Azure SQL): usa Managed Identity (sin contraseña)
 *   - Local (NODE_ENV=development):            usa SQL auth con UID/PWD del .env
 *   - Se puede forzar MSI con DB_USE_MSI=true en App Settings
 */
function buildConfig(source) {
  const server   = source.SERVER   || source.server;
  const database = source.DATABASE || source.database;

  if (!server || !database) {
    throw new Error(
      `Faltan parámetros de conexión: SERVER=${server ? '✓' : '✗'}, ` +
      `DATABASE=${database ? '✓' : '✗'}`
    );
  }

  const isAzureSQL    = server.includes('.database.windows.net');
  const isProduction  = (source.NODE_ENV || process.env.NODE_ENV) === 'production';
  const forceMSI      = source.DB_USE_MSI === 'true';
  const useManagedIdentity = forceMSI || (isAzureSQL && isProduction);

  // ── Azure producción: Managed Identity (sin usuario ni contraseña) ──────────
  if (useManagedIdentity) {
    console.log('[DB] Usando autenticación Managed Identity (Azure AD)');
    return {
      server,
      database,
      port: 1433,
      authentication: {
        type: 'azure-active-directory-msi-app-service'
      },
      options: {
        encrypt: true,
        trustServerCertificate: false,
        enableKeepAlive: true,
        connectionTimeout: 90000,   // 90s para tolerar resume de Azure SQL Serverless
        requestTimeout: 90000,
        connectionRetryInterval: 200,
        maxRetriesOnTransientErrors: 5,
        useUTC: true
      },
      // Pool con min:0 para permitir que Azure SQL Serverless entre en auto-pause
      // cuando no hay conexiones activas (ahorra costos fuera de horario laboral)
      pool: {
        max: 10,
        min: 0,                     // sin conexiones mínimas → BD puede auto-pausar
        idleTimeoutMillis: 60000,   // cierra conexiones inactivas tras 60s
        acquireTimeoutMillis: 90000 // espera hasta 90s al adquirir (BD puede estar reanudando)
      }
    };
  }

  // ── Desarrollo local: SQL Server auth con UID/PWD del .env ──────────────────
  const uid = source.UID || source.uid;
  const pwd = source.PWD || source.pwd;

  if (!uid || !pwd) {
    throw new Error(
      `Faltan credenciales SQL: UID=${uid ? '✓' : '✗'}, PWD=${pwd ? '✓' : '✗'}. ` +
      `En producción configura NODE_ENV=production para usar Managed Identity.`
    );
  }

  const needsEncrypt = isAzureSQL || source.DB_ENCRYPT === 'true';
  console.log('[DB] Usando autenticación SQL Server (desarrollo local)');
  return {
    server,
    database,
    port: parseInt(source.DB_PORT || process.env.DB_PORT || '1433', 10),
    authentication: {
      type: 'default',
      options: { userName: uid, password: pwd }
    },
    options: {
      encrypt: needsEncrypt,
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

/**
 * Detecta si un error es transitorio/recuperable.
 * Azure SQL Serverless genera errores de conexión/timeout mientras reanuda
 * desde auto-pause (proceso que puede tardar 30–90 segundos).
 */
function esErrorTransiente(err) {
  const msg = (err.message || '').toLowerCase();
  const cod  = err.code || '';
  return (
    msg.includes('closed')                          ||
    msg.includes('timeout')                         ||
    msg.includes('etimedout')                       ||
    msg.includes('econnrefused')                    ||
    msg.includes('econnreset')                      ||
    msg.includes('enotfound')                       ||
    msg.includes('failed to connect')               ||
    msg.includes('connection')                      ||
    msg.includes('server is not currently available') ||
    msg.includes('database is currently paused')    ||
    msg.includes('not currently available')         ||
    msg.includes('login failed')                    ||
    ['ETIMEOUT','ESOCKET','ECONNREFUSED','ECONNRESET','ENOTFOUND'].includes(cod)
  );
}

async function getConnection() {
  // Pool ya conectado → devolver directamente
  if (pool && pool.connected) {
    return pool;
  }

  // Otra llamada ya está conectando → esperar hasta 95s (cubre DB resume)
  if (isConnecting) {
    const deadline = Date.now() + 95000;
    while (Date.now() < deadline) {
      await new Promise(resolve => setTimeout(resolve, 500));
      if (pool && pool.connected) return pool;
      if (!isConnecting) break; // la otra llamada falló, salir del loop
    }
    if (pool && pool.connected) return pool;
    throw new Error('[DB] Timeout esperando que otra llamada establezca la conexión');
  }

  // Iniciar nueva conexión
  isConnecting = true;

  // Cerrar pool anterior si existe pero no está conectado
  if (pool) {
    try { await pool.close(); } catch (_) {}
    pool = null;
  }

  try {
    const newPool = new sql.ConnectionPool(runtimeConfig);

    newPool.on('error', (err) => {
      console.error('[DB] Error en pool:', err.message);
      pool = null;
      isConnecting = false;
    });

    await newPool.connect();
    pool = newPool;
    isConnecting = false;
    console.log(`[DB] Conectado: ${runtimeConfig.server} / ${runtimeConfig.database}`);
    return pool;
  } catch (err) {
    pool = null;
    isConnecting = false;
    throw err;
  }
}

/**
 * Ejecuta una query con reintentos automáticos ante errores transientes.
 * Los delays progresivos (2s → 5s → 15s → 30s) cubren el tiempo de resume
 * de Azure SQL Serverless sin bloquear indefinidamente.
 *
 * Tiempo máximo total de espera con retries=4:
 *   ~90s (1er intento) + 2s + ~90s (2do) + 5s + ... ≈ 3-4 minutos worst case
 *   En práctica: el 2do intento ya conecta porque la BD reanudó durante el 1er timeout.
 */
async function executeQuery(query, params = {}, retries = 4) {
  const delays = [2000, 5000, 15000, 30000]; // delays entre reintentos

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const conn = await getConnection();
      const request = conn.request();
      Object.keys(params).forEach(key => request.input(key, params[key]));
      return await request.query(query);
    } catch (err) {
      if (esErrorTransiente(err) && attempt < retries) {
        const delay = delays[attempt] ?? 30000;
        console.log(
          `[DB] Error transiente (intento ${attempt + 1}/${retries}): ` +
          `${(err.message || '').substring(0, 100)}`
        );
        console.log(`[DB] BD posiblemente reanudando. Reintentando en ${delay / 1000}s...`);
        pool = null; // forzar nueva conexión en próximo intento
        await new Promise(resolve => setTimeout(resolve, delay));
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
