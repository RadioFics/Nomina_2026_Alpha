// ============================================================================
//  routes/exportarAdecco.js
//  Rutas para la exportación al formato ADECCO (FORMATO_LIBRE).
// ============================================================================

const express = require('express');
const router  = express.Router();
const ctl     = require('../controllers/exportarAdeccoController');

// GET /api/exportar-adecco/periodos
//   → Lista los períodos disponibles para elegir en el modal del frontend.
router.get('/periodos', ctl.listarPeriodos);

// GET /api/exportar-adecco?codPeriod=6&codEmpr=1
//   → Descarga directa del Excel ADECCO.
router.get('/', ctl.exportarAdecco);

module.exports = router;
