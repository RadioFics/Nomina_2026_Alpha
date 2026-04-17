// ============================================================================
//  routes/ocasionales.js
//  Rutas REST para Novedades Ocasionales (NO_NOVED + NO_OCASI).
// ============================================================================

const express = require('express');
const router = express.Router();
const ctl = require('../controllers/ocasionalesController');

// Período vigente por fecha de hoy (lee NO_PERIOD)
router.get('/periodo-actual', ctl.obtenerPeriodoActual);

// Listar registros del período (default = período vigente)
router.get('/', ctl.listarOcasionales);

// Crear registro (NO_NOVED + NO_OCASI en una transacción)
router.post('/', ctl.crearOcasional);

// Editar CANTIDAD / VALOR / OBSERVACIONES
router.put('/:codNoved', ctl.actualizarOcasional);

// Anulación lógica (ACT_ESTA = 'I')
router.delete('/:codNoved', ctl.anularOcasional);

module.exports = router;
