const express = require('express');
const router = express.Router();
const nominaController = require('../controllers/nominaController');

// Ocasionales
router.post('/ocasionales', nominaController.crearOcasional);
router.get('/ocasionales', nominaController.obtenerOcasionales);
router.put('/ocasionales/:id', nominaController.actualizarOcasional);
router.delete('/ocasionales/:id', nominaController.eliminarOcasional);

// Fijas
router.post('/fijas', nominaController.crearFija);
router.get('/fijas', nominaController.obtenerFijas);

// Ausencias
router.post('/ausencias', nominaController.crearAusencia);
router.get('/ausencias', nominaController.obtenerAusencias);

// Actividad
router.get('/actividad', nominaController.obtenerActividad);

module.exports = router;
