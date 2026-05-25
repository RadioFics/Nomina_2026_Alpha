const express = require('express');
const router = express.Router();
const maestrosController = require('../controllers/maestrosController');
const { executeQuery } = require('../config/database');

router.get('/', (req, res) => {
  res.json({ message: 'Endpoint de maestros/configuración' });
});

// ENDPOINT DE DIAGNÓSTICO - Verificar estructura de tabla
router.get('/diagnostico/tabla-noconce', async (req, res) => {
  try {
    console.log('🔍 Diagnóstico: Consultando estructura de NO_CONCE...');
    const query = `
      SELECT TOP 10 *
      FROM NO_CONCE
    `;
    const result = await executeQuery(query, {});
    res.json({
      status: 'ok',
      message: 'Tabla encontrada',
      registros: result.recordset?.length || 0,
      columnas: result.recordset?.[0] ? Object.keys(result.recordset[0]) : [],
      primeros_5: result.recordset?.slice(0, 5) || []
    });
  } catch (err) {
    console.error('❌ Error en diagnóstico:', err.message);
    res.status(500).json({
      status: 'error',
      message: 'Tabla NO_CONCE no encontrada o error de conexión',
      error: err.message
    });
  }
});

// ENDPOINT DE DIAGNÓSTICO - Verificar estructura de GN_FUNCI
router.get('/diagnostico/tabla-gnfunci', async (req, res) => {
  try {
    console.log('🔍 Diagnóstico: Consultando estructura de GN_FUNCI...');
    const query = `
      SELECT TOP 10 *
      FROM GN_FUNCI
    `;
    const result = await executeQuery(query, {});
    res.json({
      status: 'ok',
      message: 'Tabla encontrada',
      registros: result.recordset?.length || 0,
      columnas: result.recordset?.[0] ? Object.keys(result.recordset[0]) : [],
      primeros_3: result.recordset?.slice(0, 3) || []
    });
  } catch (err) {
    console.error('❌ Error en diagnóstico:', err.message);
    res.status(500).json({
      status: 'error',
      message: 'Tabla GN_FUNCI no encontrada o error de conexión',
      error: err.message
    });
  }
});

// ENDPOINT DE DIAGNÓSTICO - Verificar estructura de GN_TERCE
router.get('/diagnostico/tabla-gnterce', async (req, res) => {
  try {
    console.log('🔍 Diagnóstico: Consultando estructura de GN_TERCE...');
    const query = `
      SELECT TOP 10 *
      FROM GN_TERCE
    `;
    const result = await executeQuery(query, {});
    res.json({
      status: 'ok',
      message: 'Tabla encontrada',
      registros: result.recordset?.length || 0,
      columnas: result.recordset?.[0] ? Object.keys(result.recordset[0]) : [],
      primeros_3: result.recordset?.slice(0, 3) || []
    });
  } catch (err) {
    console.error('❌ Error en diagnóstico:', err.message);
    res.status(500).json({
      status: 'error',
      message: 'Tabla GN_TERCE no encontrada o error de conexión',
      error: err.message
    });
  }
});

// ENDPOINT DE DIAGNÓSTICO AVANZADO - Ver cómo se almacenan las cédulas
router.get('/diagnostico/cedulas-raw', async (req, res) => {
  try {
    console.log('🔍 Diagnóstico: Consultando cédulas SIN CONVERSIÓN...');
    const query = `
      SELECT TOP 10
        NUM_IDEN as cedula_original,
        CAST(NUM_IDEN AS VARCHAR) as cedula_varchar,
        TRIM(CAST(NUM_IDEN AS VARCHAR)) as cedula_trimmed,
        CONVERT(VARCHAR, NUM_IDEN) as cedula_convert,
        LEN(CAST(NUM_IDEN AS VARCHAR)) as longitud_varchar,
        LEN(TRIM(CAST(NUM_IDEN AS VARCHAR))) as longitud_trimmed,
        DATALENGTH(NUM_IDEN) as datalength_original,
        NOM_COMP as nombre
      FROM GN_TERCE
      WHERE NUM_IDEN IS NOT NULL
      ORDER BY NUM_IDEN ASC
    `;
    const result = await executeQuery(query, {});
    res.json({
      status: 'ok',
      message: 'Cédulas recuperadas',
      registros: result.recordset || []
    });
  } catch (err) {
    console.error('❌ Error en diagnóstico:', err.message);
    res.status(500).json({
      status: 'error',
      message: 'Error al consultar cédulas',
      error: err.message
    });
  }
});

// Buscar cédulas con coincidencia (autocomplete)
router.get('/buscar-cedulas', maestrosController.buscarCedulasConCoincidencia);

// Empleados por cédula exacta
router.get('/empleado-cedula', maestrosController.obtenerEmpleadoPorCedula);

// Conceptos de nómina
router.get('/conceptos-ocasionales', maestrosController.obtenerConceptosOcasionales);

// Catálogos para el formulario de Maestro Original (crear)
router.get('/catalogos', maestrosController.obtenerCatalogos);

// Catálogos correctos para edición (COD_EPS, COD_AFP, COD_CCF, COD_CEST)
router.get('/catalogos-edicion', maestrosController.obtenerCatalogosEdicion);

// Crear nuevo empleado (GN_TERCE + GN_FUNCI)
router.post('/empleado', maestrosController.crearEmpleado);

// Actualizar empleado existente (GN_TERCE + GN_FUNCI)
router.put('/empleado/:codFunci', maestrosController.actualizarEmpleado);

// Listar empleados activos de la BD
router.get('/empleados', maestrosController.listarEmpleados);

// Detalle completo de un empleado (GN_TERCE + GN_FUNCI + catálogos)
router.get('/detalle-empleado', maestrosController.obtenerDetalleEmpleado);

module.exports = router;
