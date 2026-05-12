const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
const os = require('os');
const http = require('http');
const { execSync } = require('child_process');
require('dotenv').config();

const app = express();

// Confiar en el primer proxy/router (necesario para req.protocol y req.get('host') correcto)
app.set('trust proxy', 1);

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

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

// Manejo de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor', details: err.message });
});

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

const server = http.createServer(app);

server.listen(PORT, '0.0.0.0', async () => {
  const localIP = getLocalIP();

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
      console.log(`\n[⚠️  ADVERTENCIA] Puerto ${PORT} en uso. Intentando limpiar procesos antiguos...\n`);
      if (killNodeProcesses()) {
        console.log('[✓] Procesos Node antiguos eliminados. Reintentando...\n');
        setTimeout(() => {
          server.close();
          server.listen(PORT, '0.0.0.0');
        }, 1000);
      } else {
        setTimeout(() => {
          server.close();
          server.listen(PORT, '0.0.0.0');
        }, 2000);
      }
    } else if (retryCount < MAX_RETRIES) {
      const waitTime = 2000;
      console.log(`[⚠️  REINTENTANDO] Intento ${retryCount}/${MAX_RETRIES}...\n`);
      setTimeout(() => {
        server.close();
        server.listen(PORT, '0.0.0.0');
      }, waitTime);
    } else {
      console.error(`\n[❌ ERROR] No se pudo liberar el puerto ${PORT} después de ${MAX_RETRIES} intentos.`);
      console.error('\n📋 Soluciones manuales:');
      console.error(`  1. Ejecuta: .\kill-server.ps1`);
      console.error(`  2. O: Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force`);
      console.error(`  3. O usa otro puerto: PORT=3001 npm start\n`);
      process.exit(1);
    }
  } else {
    throw err;
  }
});
