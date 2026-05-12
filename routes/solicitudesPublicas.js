const express = require('express');
const router = express.Router();
const {
  verificarEmpleado,
  enviarSolicitudPermiso,
  enviarSolicitudVacaciones,
  listarConceptosAusentismo,
} = require('../controllers/solicitudesController');

// Rutas públicas — sin verifyToken
router.get('/verificar-empleado',   verificarEmpleado);
router.get('/conceptos-ausentismo', listarConceptosAusentismo);
router.post('/permiso',             enviarSolicitudPermiso);
router.post('/vacaciones',          enviarSolicitudVacaciones);

module.exports = router;
