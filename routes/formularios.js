// ============================================================================
//  routes/formularios.js
//  Rutas públicas para formularios de Permiso y Vacaciones.
//  No requieren autenticación JWT — son de acceso abierto.
// ============================================================================

const express = require('express');
const router  = express.Router();
const ctl     = require('../controllers/formularioController');

// POST /api/formularios/permiso
// Body JSON: { nombre, cedula, cargo?, area?, correoEmpleado?,
//              fechaInicio, horaInicio?, horaFin?, totalHoras?,
//              tipoPermiso?, motivo?, jefeInmediato? }
router.post('/permiso',     ctl.submitPermiso);

// POST /api/formularios/vacaciones
// Body JSON: { nombre, cedula, cargo?, area?, correoEmpleado?,
//              fechaInicio, fechaFin?, diasSolicita?,
//              anoVacacion?, motivo?, jefeInmediato? }
router.post('/vacaciones',  ctl.submitVacaciones);

module.exports = router;
