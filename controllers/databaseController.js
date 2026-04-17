/**
 * Controlador de Configuración de Base de Datos
 * Maneja endpoints para consultar y reconfigurar la conexión a SQL Server
 */

const { getStatus, testConnection, reconfigure, executeQuery } = require('../config/database');

/**
 * GET /api/database/status
 * Retorna el estado actual de conexión
 * Cualquier usuario autenticado puede verlo
 */
exports.getStatus = async (req, res) => {
  try {
    const status = getStatus();

    // Medir latencia real solo si hay pool activo
    let latencyMs = null;
    if (status.connected) {
      const start = Date.now();
      try {
        await executeQuery('SELECT 1');
        latencyMs = Date.now() - start;
      } catch (_) {
        // Pool reporta conectado pero la query falla: degradado
        latencyMs = -1;
      }
    }

    return res.status(200).json({
      status: 'success',
      message: 'Estado de conexión obtenido',
      data: { ...status, latencyMs }
    });
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      message: 'Error obteniendo estado',
      error: err.message
    });
  }
};

/**
 * POST /api/database/test
 * Body: { server, database, uid, pwd }
 * Prueba una conexión sin aplicarla
 * Solo admin
 */
exports.testConnection = async (req, res) => {
  try {
    const { server, database, uid, pwd } = req.body;

    if (!server || !database || !uid || !pwd) {
      return res.status(400).json({
        status: 'error',
        message: 'Faltan campos requeridos: server, database, uid, pwd'
      });
    }

    const result = await testConnection({
      SERVER: server,
      DATABASE: database,
      UID: uid,
      PWD: pwd
    });

    return res.status(200).json({
      status: result.success ? 'success' : 'error',
      message: result.success
        ? `Conexión exitosa (${result.latencyMs}ms)`
        : `Conexión fallida: ${result.error}`,
      data: { latencyMs: result.latencyMs, success: result.success }
    });
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      message: 'Error al probar conexión',
      error: err.message
    });
  }
};

/**
 * POST /api/database/configure
 * Body: { server, database, uid, pwd }
 * Guarda y aplica la nueva configuración
 * Solo admin
 */
exports.configure = async (req, res) => {
  try {
    const { server, database, uid, pwd } = req.body;

    if (!server || !database || !uid || !pwd) {
      return res.status(400).json({
        status: 'error',
        message: 'Faltan campos requeridos: server, database, uid, pwd'
      });
    }

    // Seguridad: probar antes de aplicar
    const testResult = await testConnection({
      SERVER: server,
      DATABASE: database,
      UID: uid,
      PWD: pwd
    });

    if (!testResult.success) {
      return res.status(400).json({
        status: 'error',
        message: `No se puede guardar: la conexión de prueba falló. ${testResult.error}`,
        data: { latencyMs: testResult.latencyMs }
      });
    }

    // Aplicar
    const result = await reconfigure({
      SERVER: server,
      DATABASE: database,
      UID: uid,
      PWD: pwd
    });

    if (result.success) {
      console.log(
        `[DB CONFIG] Admin ${req.email} cambió config BD a ${server}/${database}`
      );
      return res.status(200).json({
        status: 'success',
        message: 'Configuración guardada y aplicada. El servidor ya usa la nueva base de datos.',
        data: { server, database }
      });
    } else {
      return res.status(500).json({
        status: 'error',
        message: `Config guardada en .env pero falló al reconectar: ${result.error}`,
        error: result.error
      });
    }
  } catch (err) {
    return res.status(500).json({
      status: 'error',
      message: 'Error al configurar base de datos',
      error: err.message
    });
  }
};
