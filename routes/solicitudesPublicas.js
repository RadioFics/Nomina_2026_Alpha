const express = require('express');
const router = express.Router();
const {
  verificarEmpleado,
  enviarSolicitudPermiso,
  enviarSolicitudVacaciones,
} = require('../controllers/solicitudesController');

// Rutas públicas — sin verifyToken
router.get('/verificar-empleado', verificarEmpleado);
router.post('/permiso',           enviarSolicitudPermiso);
router.post('/vacaciones',        enviarSolicitudVacaciones);

module.exports = router;
