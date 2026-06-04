const express = require('express');
const router = express.Router();
const {
  verificarEmpleado,
  enviarSolicitudPermiso,
  enviarSolicitudVacaciones,
  listarConceptosAusentismo,
  aprobarSolicitud,
  rechazarSolicitud,
} = require('../controllers/solicitudesController');

// Rutas públicas — sin verifyToken
router.get('/verificar-empleado',   verificarEmpleado);
router.get('/conceptos-ausentismo', listarConceptosAusentismo);
router.post('/permiso',             enviarSolicitudPermiso);
router.post('/vacaciones',          enviarSolicitudVacaciones);

// Aprobación / rechazo por jefe de área (enlace en email, sin autenticación)
// El token UUID actúa como credencial de un solo uso.
router.get('/aprobar/:token',  aprobarSolicitud);
router.get('/rechazar/:token', rechazarSolicitud);

module.exports = router;
