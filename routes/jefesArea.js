const express = require('express');
const router  = express.Router();
const ctrl    = require('../controllers/jefesAreaController');
const { verifyToken, checkLevel } = require('../middleware/authMiddleware');

// Solo administradores (nivel 3) pueden modificar; nivel 2+ puede listar
router.get(  '/',           verifyToken, checkLevel(2), ctrl.listar);
router.get(  '/ccosts',     verifyToken, checkLevel(2), ctrl.listarCcost);
router.get(  '/:id',        verifyToken, checkLevel(2), ctrl.obtener);
router.post( '/',           verifyToken, checkLevel(3), ctrl.crear);
router.put(  '/:id',        verifyToken, checkLevel(3), ctrl.actualizar);
router.delete('/:id',       verifyToken, checkLevel(3), ctrl.desactivar);

module.exports = router;
