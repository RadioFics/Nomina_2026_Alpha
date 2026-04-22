// ============================================================================
//  routes/novedades.js
//  Historial unificado y gestión de períodos.
// ============================================================================

const express = require('express');
const router  = express.Router();
const ctl     = require('../controllers/novedadesController');

// Últimas N novedades registradas (actividad reciente)
router.get('/recientes', ctl.listarRecientes);

// Búsqueda histórica unificada (OCASI + FIJAS + AUSEN + CAMBI)
router.get('/historial', ctl.buscarHistorial);

// Lista de todos los períodos (para el select del buscador)
router.get('/periodos', ctl.listarPeriodos);

// Cerrar período manualmente
router.post('/periodo/:codPeriod/cerrar', ctl.cerrarPeriodo);

module.exports = router;
