const express = require('express');
const router  = express.Router();
const ctl     = require('../controllers/graficosController');

router.get('/resumen',    ctl.resumen);
router.get('/historico',  ctl.historico);
router.get('/ausentismos', ctl.ausencias);
router.get('/centros',    ctl.centros);
router.get('/periodos',   ctl.periodos);

module.exports = router;
