// ============================================================================
//  routes/ocasionales.js
//  Rutas REST para Novedades Ocasionales (NO_NOVED + NO_OCASI).
// ============================================================================

const express = require('express');
const router = express.Router();
const ctl = require('../controllers/ocasionalesController');
const { importarDesdeExcel } = require('../controllers/importarExcelController');

// Período vigente por fecha de hoy (lee NO_PERIOD)
router.get('/periodo-actual', ctl.obtenerPeriodoActual);

// Listar registros del período (default = período vigente)
router.get('/', ctl.listarOcasionales);

// ── Importación masiva desde Excel (formato Exploración / Reporte Final) ──
// multipart/form-data: campo "archivo" = .xlsx
router.post('/importar-excel', importarDesdeExcel);

// Crear registro (NO_NOVED + NO_OCASI en una transacción)
router.post('/', ctl.crearOcasional);

// Editar CANTIDAD / VALOR / OBSERVACIONES
router.put('/:codNoved', ctl.actualizarOcasional);

// Anulación lógica (ACT_ESTA = 'I')
router.delete('/:codNoved', ctl.anularOcasional);

module.exports = router;
