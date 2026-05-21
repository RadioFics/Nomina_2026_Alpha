const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const os = require('os');
const http = require('http');
const { execSync } = require('child_process');
require('dotenv').config();

const logger = require('./config/logger');

const app = express();

// Confiar en el primer proxy/router (necesario para req.protocol y req.get('host') correcto)
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Logging de requests con errores HTTP (4xx/5xx) hacia GN_LOG_APP
app.use(logger.middlewareRequest);

// Servir archivos estáticos (HTML, CSS, JS)
app.use(express.static(__dirname));

// Servir login.html en la raíz (página inicial)
app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Importar rutas
const authRoutes = require('./routes/auth');
const nominaRoutes = require('./routes/nomina');
const reportesRoutes = require('./routes/reportes');
const maestrosRoutes = require('./routes/maestros');
const databaseRoutes = require('./routes/database');
const ocasionalesRoutes = require('./routes/ocasionales');
const fijasRoutes = require('./routes/fijas');
const ausentismosRoutes = require('./routes/ausentismos');
const cambiosRoutes        = require('./routes/cambios');
const exportarAdeccoRoutes = require('./routes/exportarAdecco');
const changelogRoutes      = require('./routes/changelog');
const novedadesRoutes      = require('./routes/novedades');
const importarPDFRoutes      = require('./routes/importarPDF');
const solicitudesRoutes      = require('./routes/solicitudesPublicas');

// Rutas públicas de autoservicio (sin verifyToken) — antes que cualquier middleware de auth
app.get('/solicitud/permiso',     (req, res) => res.sendFile(path.join(__dirname, 'public', 'solicitud-permiso.html')));
app.get('/solicitud/vacaciones',  (req, res) => res.sendFile(path.join(__dirname, 'public', 'solicitud-vacaciones.html')));
app.use('/api/solicitudes', solicitudesRoutes);

// Usar rutas
app.use('/api/auth', authRoutes);
app.use('/api/nomina', nominaRoutes);
app.use('/api/reportes', reportesRoutes);
app.use('/api/maestros', maestrosRoutes);
app.use('/api/database', databaseRoutes);
app.use('/api/ocasionales', ocasionalesRoutes);
app.use('/api/fijas', fijasRoutes);
app.use('/api/ausentismos', ausentismosRoutes);
app.use('/api/cambios', cambiosRoutes);
app.use('/api/exportar-adecco', exportarAdeccoRoutes);
app.use('/api/changelog',      changelogRoutes);
app.use('/api/novedades',      novedadesRoutes);
app.use('/api/pdf',            importarPDFRoutes);

// Ruta de prueba
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Servidor de nómina funcionando' });
});

// Diagnóstico completo de Python: busca el ejecutable en el sistema de archivos.
// GET /api/health/python — sin autenticacion, solo para diagnostico post-deploy.
app.get('/api/health/python', (req, res) => {
  const { execSync } = require('child_process');
  const fs2 = require('fs');

  const envPy   = (process.env.PYTHON_PATH || '').trim();
  const result  = { PYTHON_PATH_configurado: envPy || '(no definido)', busqueda: {}, rutas_encontradas: [], recomendacion: '' };

  // 1. Buscar con WHERE (cmd de Windows) — encuentra ejecutables en el PATH del sistema
  try {
    const whereOut = execSync('where python py python3 2>&1', { shell: 'cmd.exe', timeout: 8000 }).toString().trim();
    result.busqueda.where = whereOut.split('\n').map(l => l.trim()).filter(Boolean);
  } catch (e) {
    result.busqueda.where = e.stdout ? e.stdout.toString().trim().split('\n').map(l=>l.trim()).filter(Boolean) : ['(ninguno en PATH)'];
  }

  // 2. Listar rutas típicas de Python en Azure App Service Windows
  const rutas_a_verificar = [
    // Python 3.8.5 x86 — extension instalada via Azure Portal
    'D:\\home\\Python385\\python.exe',
    'D:\\home\\Python38\\python.exe',
    'D:\\Python385\\python.exe',
    'D:\\Python38\\python.exe',
    'C:\\Python385\\python.exe',
    'C:\\Python38\\python.exe',
    // Python 3.9 / 3.10 (por si se actualiza)
    'D:\\home\\Python39\\python.exe',
    'D:\\Python39\\python.exe',
    'C:\\Python39\\python.exe',
    // Python 2.7 y 3.4 (disponibles pero insuficientes — solo para referencia)
    'D:\\Python34\\python.exe',
    'C:\\Python34\\python.exe',
  ];
  rutas_a_verificar.forEach(ruta => {
    if (fs2.existsSync(ruta)) result.rutas_encontradas.push(ruta);
  });

  // 3. Listar contenido de D:\ para detectar carpetas Python
  try {
    const dirD = fs2.readdirSync('D:\\').filter(n => /python/i.test(n));
    result.busqueda.carpetas_D = dirD;
  } catch(e) { result.busqueda.carpetas_D = ['(sin acceso a D:\\)' + e.message]; }

  try {
    const dirC = fs2.readdirSync('C:\\').filter(n => /python/i.test(n));
    result.busqueda.carpetas_C = dirC;
  } catch(e) { result.busqueda.carpetas_C = ['(sin acceso a C:\\)' + e.message]; }

  // 4. Recomendar
  const encontradas = [...result.busqueda.where.filter(l => l.endsWith('.exe')), ...result.rutas_encontradas];
  if (encontradas.length > 0) {
    result.recomendacion = 'Use como PYTHON_PATH: ' + encontradas[0];
  } else if (result.busqueda.carpetas_D.length > 0) {
    result.recomendacion = 'Carpeta Python detectada en D:\\. Ajuste PYTHON_PATH a la ruta completa del python.exe dentro de: ' + result.busqueda.carpetas_D.join(', ');
  } else {
    result.recomendacion = 'Python no encontrado. Instale via Azure App Service Extensions o configure la version en Portal > Configuracion > General > Python version.';
  }

  res.json(result);
});


// Middleware de errores Express no capturados hacia GN_LOG_APP
app.use(logger.middlewareError);

// ============================================================================
// INICIAR SERVIDOR CENTRAL (Accesible desde múltiples máquinas)
// ============================================================================

function getLocalIP() {
  const interfaces = os.networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      // Buscar IPv4 no-interno (la IP de la red corporativa)
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}

const PORT = process.env.PORT || 3000;

// iisnode (Azure App Service Windows) pasa el PORT como ruta de named pipe,
// p.ej. "\\.\pipe\...". En ese caso NO se puede pasar host '0.0.0.0'.
// Si PORT es numérico usamos TCP; si es string/pipe usamos solo el path.
const isNamedPipe = isNaN(Number(PORT));

const server = http.createServer(app);

// Función auxiliar para iniciar el servidor respetando el tipo de PORT
function startListen(callback) {
  if (isNamedPipe) {
    // iisnode: named pipe — sin host
    server.listen(PORT, callback);
  } else {
    // TCP local o Docker: bind a todas las interfaces
    server.listen(Number(PORT), '0.0.0.0', callback);
  }
}

// Captura de errores globales de Node.js hacia GN_LOG_APP
process.on('unhandledRejection', (reason) => {
  const detalle = reason instanceof Error ? reason.stack : String(reason);
  logger.error('node', 'Unhandled Promise Rejection', detalle);
});

process.on('uncaughtException', (err) => {
  logger.error('node', 'Uncaught Exception: ' + err.message, err.stack);
  setTimeout(() => process.exit(1), 500);
});

startListen(async () => {
  const localIP = getLocalIP();

  // Inicializar tabla GN_LOG_APP (crea si no existe)
  await logger.init().catch(() => {});

  console.log('\n╔════════════════════════════════════════════════════════════╗');
  console.log('║         ✓ SERVIDOR CENTRAL DE NÓMINA FUNCIONANDO          ║');
  console.log('╚════════════════════════════════════════════════════════════╝\n');

  console.log('  📍 UBICACIONES DE ACCESO:');
  console.log(`     Local (esta máquina):  http://localhost:${PORT}`);
  console.log(`     Desde la red:          http://${localIP}:${PORT}`);

  console.log('\n  📋 FORMULARIOS PÚBLICOS (sin inicio de sesión):');
  console.log(`     Permiso    local:  http://localhost:${PORT}/solicitud/permiso`);
  console.log(`     Permiso    red:    http://${localIP}:${PORT}/solicitud/permiso`);
  console.log(`     Vacaciones local:  http://localhost:${PORT}/solicitud/vacaciones`);
  console.log(`     Vacaciones red:    http://${localIP}:${PORT}/solicitud/vacaciones`);

  console.log('\n  🔗 COMPARTIR CON SUCURSALES:');
  console.log(`     URL de acceso: http://${localIP}:${PORT}`);
  console.log(`     BD centralizada: ${process.env.SERVER || 'DESKTOP-VEABB8R\\SQLEXPRESS'}`);

  console.log('\n  💡 INSTRUCCIONES PARA SUCURSALES:');
  console.log(`     1. Abre tu navegador`);
  console.log(`     2. Ve a: http://${localIP}:${PORT}`);
  console.log(`     3. Inicia sesión`);
  console.log(`     4. Los cambios se sincronizarán en tiempo real`);

  console.log(`\n  ✅ Verifica en: http://localhost:${PORT}/api/health\n`);

  // Asegurar que la conexión a BD está lista ANTES de los bootstraps
  const { getConnection } = require('./config/database');
  const maxWaitTime = 30000; // 30 segundos máximo
  const startTime = Date.now();

  let connectionReady = false;
  while (!connectionReady && Date.now() - startTime < maxWaitTime) {
    try {
      const pool = await getConnection();
      if (pool && pool.connected) {
        connectionReady = true;
        console.log('[DB] Pool de conexión listo para bootstraps');
      } else {
        await new Promise(resolve => setTimeout(resolve, 500));
      }
    } catch (err) {
      console.error('[DB] Error intentando conectar:', err.message);
      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }

  if (!connectionReady) {
    console.error('[DB] Timeout esperando conexión. Los bootstraps pueden fallar.');
  }

  // Bootstrap DB objects DESPUÉS de que el servidor arrancó y el pool está listo.
  // Se ejecutan en secuencia para que el pool esté activo antes de cada llamada.
  try {
    await require('./controllers/ocasionalesController').ensureDbObjects();
  } catch (_) {}
  try {
    await require('./controllers/fijasController').ensureDbObjects();
  } catch (_) {}
  try {
    await require('./controllers/ausentismosController').ensureDbObjects();
  } catch (_) {}
  try {
    await require('./controllers/cambiosController').ensureDbObjects();
  } catch (_) {}

  // Cierre automático de períodos vencidos al arrancar
  const { verificarYCerrarPeriodosVencidos } = require('./controllers/novedadesController');
  try {
    await verificarYCerrarPeriodosVencidos();
  } catch (_) {}

  // Verificar cada hora si hay períodos que vencieron durante el día
  setInterval(verificarYCerrarPeriodosVencidos, 60 * 60 * 1000);
});

// Función para matar procesos Node en Windows
function killNodeProcesses() {
  try {
    if (os.platform() === 'win32') {
      execSync('Get-Process node -ErrorAction SilentlyContinue | Where-Object { $_.Id -ne $PID } | Stop-Process -Force',
               { shell: 'powershell.exe', stdio: 'pipe' });
    } else {
      execSync('pkill -f "node" --inverse -u $USER', { stdio: 'pipe' });
    }
    return true;
  } catch (e) {
    return false;
  }
}

// Manejo de errores del servidor con reintentos automáticos e intentos de limpiar puerto
let retryCount = 0;
const MAX_RETRIES = 3;

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    retryCount++;

    if (retryCount === 1) {
      console.log(`\n[⚠️  ADVERTENCIA] Puerto/pipe ${PORT} en uso. Intentando limpiar procesos antiguos...\n`);
      if (killNodeProcesses()) {
        console.log('[✓] Procesos Node antiguos eliminados. Reintentando...\n');
        setTimeout(() => {
          server.close();
          startListen();
        }, 1000);
      } else {
        setTimeout(() => {
          server.close();
          startListen();
        }, 2000);
      }
    } else if (retryCount < MAX_RETRIES) {
      const waitTime = 2000;
      console.log(`[⚠️  REINTENTANDO] Intento ${retryCount}/${MAX_RETRIES}...\n`);
      setTimeout(() => {
        server.close();
        startListen();
      }, waitTime);
    } else {
      console.error(`\n[❌ ERROR] No se pudo liberar el puerto/pipe ${PORT} después de ${MAX_RETRIES} intentos.`);
      console.error('\n📋 Soluciones manuales:');
      console.error(`  1. Ejecuta: .\\kill-server.ps1`);
      console.error(`  2. O: Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force`);
      console.error(`  3. O usa otro puerto: PORT=3001 npm start\n`);
      process.exit(1);
    }
  } else {
    console.error('[ERROR] Error inesperado del servidor:', err.message);
    logger.error('node', 'Error inesperado del servidor HTTP: ' + err.message, err.stack);
    throw err;
  }
});
