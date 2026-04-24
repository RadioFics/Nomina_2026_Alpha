// ============================================================================
//  routes/ocasionales.js
//  Rutas REST para Novedades Ocasionales (NO_NOVED + NO_OCASI).
// ============================================================================

const express = require('express');
const router = express.Router();
const ctl = require('../controllers/ocasionalesController');
const { importarDesdeExcel, importarDesdeExcelConModo } = require('../controllers/importarExcelController');

// Período vigente por fecha de hoy (lee NO_PERIOD)
router.get('/periodo-actual', ctl.obtenerPeriodoActual);

// Listar registros del período (default = período vigente)
router.get('/', ctl.listarOcasionales);

// ── Importación masiva desde Excel ──────────────────────────────────────────
// multipart/form-data: campo "archivos[]" = .xlsx
// Campo opcional "modo": 'novedades' (default) | 'empleados' | 'ambos'
// Cuando modo incluye 'empleados', el archivo debe ser formato ADECCO y se
// sincroniza la hoja "Maestro Original" → GN_TERCE + GN_FUNCI antes de las novedades.
router.post('/importar-excel', importarDesdeExcelConModo);

// Anulación lógica masiva (body: { codNoveds: [1,2,...] })
// Usa POST /anular-batch para evitar cualquier colisión con DELETE /:codNoved
router.post('/anular-batch', ctl.anularOcasionalBatch);

// Crear registro (NO_NOVED + NO_OCASI en una transacción)
router.post('/', ctl.crearOcasional);

// Editar CANTIDAD / VALOR / OBSERVACIONES
router.put('/:codNoved', ctl.actualizarOcasional);

// Anulación lógica individual (ACT_ESTA = 'I')
router.delete('/:codNoved', ctl.anularOcasional);

module.exports = router;
