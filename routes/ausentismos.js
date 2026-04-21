// ============================================================================
//  routes/ausentismos.js
//  Rutas REST para Novedades de Ausentismos (NO_NOVED + NO_AUSEN).
// ============================================================================

const express = require('express');
const router = express.Router();
const ctl = require('../controllers/ausentismosController');

router.get('/periodo-actual',  ctl.obtenerPeriodoActual);
router.get('/conceptos',       ctl.listarConceptos);
router.get('/',                ctl.listarAusentismos);
router.post('/anular-batch',   ctl.anularAusentismoBatch);
router.post('/',               ctl.crearAusentismo);
router.put('/:codNoved',       ctl.actualizarAusentismo);
router.delete('/:codNoved',    ctl.anularAusentismo);

module.exports = router;
