// ============================================================================
//  routes/fijas.js
//  Rutas REST para Novedades Fijas (NO_NOVED + NO_FIJAS).
// ============================================================================

const express = require('express');
const router = express.Router();
const ctl = require('../controllers/fijasController');

router.get('/periodo-actual', ctl.obtenerPeriodoActual);
router.get('/conceptos',      ctl.listarConceptos);
router.get('/',               ctl.listarFijas);
router.post('/',              ctl.crearFija);
router.put('/:codNoved',      ctl.actualizarFija);
router.delete('/:codNoved',   ctl.anularFija);

module.exports = router;
