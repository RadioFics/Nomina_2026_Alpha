// ============================================================================
//  routes/cambios.js
//  Rutas REST para Novedades de Cambios (NO_NOVED + NO_CAMBI).
// ============================================================================

const express = require('express');
const router = express.Router();
const ctl = require('../controllers/cambiosController');

router.get('/periodo-actual',  ctl.obtenerPeriodoActual);
router.get('/conceptos',       ctl.listarConceptos);
router.get('/',                ctl.listarCambios);
router.post('/anular-batch',   ctl.anularCambioBatch);
router.post('/',               ctl.crearCambio);
router.put('/:codNoved',       ctl.actualizarCambio);
router.delete('/:codNoved',    ctl.anularCambio);

module.exports = router;
