const { executeQuery } = require('../config/database');

async function buscarCedulasConCoincidencia(req, res) {
  try {
    const { q } = req.query;

    console.log('📩 Parámetro recibido (q):', q, 'Tipo:', typeof q);

    if (!q || q.trim() === '') {
      return res.status(400).json({ error: 'Búsqueda requerida' });
    }

    const busquedaInicio = `${q.trim()}%`;      // Comienza con: 13%
    const busquedaCualquier = `%${q.trim()}%`;  // Contiene en cualquier lugar: %13%

    console.log('🔍 Buscando cédulas con:', busquedaCualquier, '(prioridad al inicio)');

    // Buscar cédulas en cualquier parte, pero priorizando al inicio
    // IMPORTANTE: Usar CONVERT(VARCHAR(20)) para evitar notación científica
    const query = `
      SELECT TOP 20
        f.COD_TERC as codigo,
        t.NOM_COMP as nombre,
        t.NUM_IDEN as cedula,
        t.NOM_TERC as nombre1,
        t.APE_TERC as apellido
      FROM GN_TERCE t
      INNER JOIN GN_FUNCI f ON t.COD_TERC = f.COD_TERC
      WHERE CONVERT(VARCHAR(20), t.NUM_IDEN) LIKE @busquedaCualquier
      AND t.ACT_ESTA = 'A'
      AND f.ACT_ESTA = 'A'
      ORDER BY
        -- Prioridad 1: Que empiece con la búsqueda
        CASE WHEN CONVERT(VARCHAR(20), t.NUM_IDEN) LIKE @busquedaInicio THEN 0 ELSE 1 END,
        -- Prioridad 2: Orden numérico
        t.NUM_IDEN ASC
    `;

    console.log('📋 Ejecutando query con búsqueda flexible y prioridad');
    const resultado = await executeQuery(query, {
      busquedaInicio: busquedaInicio,
      busquedaCualquier: busquedaCualquier
    });

    const empleados = resultado.recordset || [];
    console.log(`✓ Se encontraron ${empleados.length} coincidencias`);
    if (empleados.length > 0) {
      console.log('📊 Primer resultado:', {
        cedula: empleados[0].cedula,
        nombre: empleados[0].nombre,
        codigo: empleados[0].codigo
      });
      console.log('📊 Todos los resultados:');
      empleados.forEach((emp, i) => {
        console.log(`  [${i}] Cédula: ${emp.cedula} | Nombre: ${emp.nombre}`);
      });
    }
    res.json(empleados);
  } catch (err) {
    console.error('❌ Error en buscarCedulasConCoincidencia:', err.message);
    console.error('❌ Stack:', err.stack);
    res.status(500).json({
      error: 'Error al buscar cédulas',
      details: err.message,
      stack: err.stack
    });
  }
}

async function obtenerEmpleadoPorCedula(req, res) {
  try {
    const { cedula } = req.query;

    if (!cedula || cedula.trim() === '') {
      return res.status(400).json({ error: 'Cédula requerida' });
    }

    console.log('🔍 Buscando empleado con cédula exacta:', cedula);

    // JOIN entre GN_TERCE (terceros) y GN_FUNCI (empleados)
    const query = `
      SELECT TOP 1
        f.COD_TERC as codigo,
        t.NOM_COMP as nombre,
        t.NUM_IDEN as cedula,
        t.NOM_TERC as nombre1,
        t.APE_TERC as apellido
      FROM GN_TERCE t
      INNER JOIN GN_FUNCI f ON t.COD_TERC = f.COD_TERC
      WHERE t.NUM_IDEN = CAST(@cedula AS BIGINT)
      AND t.ACT_ESTA = 'A'
      AND f.ACT_ESTA = 'A'
      ORDER BY t.NUM_IDEN ASC
    `;

    const result = await executeQuery(query, { cedula: parseInt(cedula.trim()) });

    if (!result.recordset || result.recordset.length === 0) {
      console.log('⚠️ Empleado no encontrado:', cedula);
      return res.status(404).json({ error: 'Empleado no encontrado', cedula });
    }

    const empleado = result.recordset[0];
    console.log('✓ Empleado encontrado:', empleado);
    res.json(empleado);
  } catch (err) {
    console.error('❌ Error en obtenerEmpleadoPorCedula:', err.message);
    res.status(500).json({
      error: 'Error al buscar empleado',
      details: err.message
    });
  }
}

async function obtenerConceptosOcasionales(req, res) {
  try {
    console.log('📋 Iniciando obtenerConceptosOcasionales...');

    const query = `
      SELECT
        COD_CONC as codigo,
        NOM_CONC as nombre,
        TIP_CONC as tipo
      FROM NO_CONCE
      WHERE TIP_NATU = 'OCASIONAL'
      ORDER BY NOM_CONC ASC
    `;

    console.log('🔍 Ejecutando query...');
    const result = await executeQuery(query, {});

    console.log('✓ Consulta exitosa. Registros encontrados:', result.recordset?.length || 0);
    res.json(result.recordset || []);
  } catch (err) {
    console.error('❌ Error en obtenerConceptosOcasionales:', err.message);
    console.error('   Stack:', err.stack);
    res.status(500).json({
      error: 'Error al obtener conceptos ocasionales',
      details: err.message,
      query: 'SELECT COD_CONC, NOM_CONC, TIP_CONC FROM NO_CONCE WHERE TIP_NATU = OCASIONAL'
    });
  }
}

module.exports = {
  buscarCedulasConCoincidencia,
  obtenerEmpleadoPorCedula,
  obtenerConceptosOcasionales
};
