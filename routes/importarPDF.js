// ============================================================================
//  routes/importarPDF.js
//  Rutas REST para Importación de PDFs (Permisos y Vacaciones)
//
//  Soporta:
//    - Permisos (CM-TH-FR-003) → NO_NOVED
//    - Vacaciones (CM-TH-SV-001) → NO_AUSEN
//
//  Endpoint: POST /api/pdf/importar
//    multipart/form-data, campo "archivos[]" (PDFs)
// ============================================================================

const express = require('express');
const router = express.Router();
const ctl = require('../controllers/importarPDFController');

// Importar uno o múltiples PDFs
router.post('/importar', ctl.importarPDFs);

// Obtener período actual (para validaciones)
router.get('/periodo-actual', ctl.obtenerPeriodoActual);

module.exports = router;
