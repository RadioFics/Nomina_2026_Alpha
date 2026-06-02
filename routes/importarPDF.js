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
const { verifyToken } = require('../middleware/authMiddleware');

// Todas las rutas requieren sesión activa
router.post('/importar',       verifyToken, ctl.importarPDFs);
router.post('/previsualizar',  verifyToken, ctl.previsualizar);
router.post('/confirmar',      verifyToken, ctl.confirmar);
router.get('/periodo-actual',  verifyToken, ctl.obtenerPeriodoActual);

module.exports = router;
