/**
 * Rutas de Configuración de Base de Datos
 * Endpoints para consultar y modificar la conexión a SQL Server
 */

const express = require('express');
const router = express.Router();
const databaseController = require('../controllers/databaseController');
const { verifyToken } = require('../middleware/authMiddleware');

/**
 * Middleware local para verificar que el usuario es admin
 * Necesario porque checkLevel() en authMiddleware tiene un bug:
 * compara req.nivel pero verifyToken asigna req.cod_gusu
 */
const requireAdmin = (req, res, next) => {
  if (!req.cod_gusu || Number(req.cod_gusu) < 3) {
    return res.status(403).json({
      status: 'error',
      message: 'Acceso denegado. Se requiere nivel administrador.'
    });
  }
  next();
};

// Estado de conexión: cualquier usuario autenticado puede verlo
router.get('/status', verifyToken, databaseController.getStatus);

// Probar conexión: solo admin
router.post('/test', verifyToken, requireAdmin, databaseController.testConnection);

// Guardar y aplicar config: solo admin
router.post('/configure', verifyToken, requireAdmin, databaseController.configure);

module.exports = router;
