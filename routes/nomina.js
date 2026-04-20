const express = require('express');
const router = express.Router();

// ============================================================================
// NOTA: Importar controladores correctos (MineDax)
//
// Anteriormente este archivo usaba nominaController que accedía a tablas
// inexistentes (Ocasionales, Fijas, Ausencias, Cambios).
//
// Ahora usamos los controladores específicos que implementan la arquitectura
// correcta de MineDax:
//   - NO_NOVED (cabecera de novedades)
//   - NO_OCASI, NO_FIJAS, NO_AUSEN, NO_CAMBI (especializaciones)
// ============================================================================

const ocasionalesCtrl = require('../controllers/ocasionalesController');
const fijasCtrl = require('../controllers/fijasController');
const ausentismosCtrl = require('../controllers/ausentismosController');
const cambiosCtrl = require('../controllers/cambiosController');

// ─── OCASIONALES ───────────────────────────────────────────────────────────
router.get('/ocasionales/periodo-actual', ocasionalesCtrl.obtenerPeriodoActual);
router.get('/ocasionales', ocasionalesCtrl.listarOcasionales);
router.post('/ocasionales', ocasionalesCtrl.crearOcasional);
router.put('/ocasionales/:codNoved', ocasionalesCtrl.actualizarOcasional);
router.delete('/ocasionales/:codNoved', ocasionalesCtrl.anularOcasional);

// ─── FIJAS ─────────────────────────────────────────────────────────────────
router.get('/fijas/periodo-actual', fijasCtrl.obtenerPeriodoActual);
router.get('/fijas', fijasCtrl.listarFijas);
router.post('/fijas', fijasCtrl.crearFija);
router.put('/fijas/:codNoved', fijasCtrl.actualizarFija);
router.delete('/fijas/:codNoved', fijasCtrl.anularFija);

// ─── AUSENTISMOS ───────────────────────────────────────────────────────────
router.get('/ausentismos/periodo-actual', ausentismosCtrl.obtenerPeriodoActual);
router.get('/ausentismos', ausentismosCtrl.listarAusentismos);
router.post('/ausentismos', ausentismosCtrl.crearAusentismo);
router.put('/ausentismos/:codNoved', ausentismosCtrl.actualizarAusentismo);
router.delete('/ausentismos/:codNoved', ausentismosCtrl.anularAusentismo);

// ─── CAMBIOS ────────────────────────────────────────────────────────────────
router.get('/cambios/periodo-actual', cambiosCtrl.obtenerPeriodoActual);
router.get('/cambios', cambiosCtrl.listarCambios);
router.post('/cambios', cambiosCtrl.crearCambio);
router.put('/cambios/:codNoved', cambiosCtrl.actualizarCambio);
router.delete('/cambios/:codNoved', cambiosCtrl.anularCambio);

module.exports = router;
