const express = require('express');
const router  = express.Router();
const ctl     = require('../controllers/graficosController');

router.get('/resumen',     ctl.resumen);
router.get('/historico',   ctl.historico);
router.get('/ausentismos', ctl.ausencias);
router.get('/centros',     ctl.centros);
router.get('/periodos',    ctl.periodos);
router.get('/ocasionales', ctl.ocasionales);
router.get('/fijas',       ctl.fijas);
router.get('/cambios',     ctl.cambios);

module.exports = router;
