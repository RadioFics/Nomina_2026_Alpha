const { executeQuery } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// ===== OCASIONALES =====

async function crearOcasional(req, res) {
  try {
    const { cedula, nombre, novedad, tipo, cantidad, valor, observaciones, periodo } = req.body;

    const id = uuidv4();
    const fechaRegistro = new Date();

    const query = `
      INSERT INTO Ocasionales (id, cedula, nombre, novedad, tipo, cantidad, valor, observaciones, periodo, fechaRegistro)
      VALUES (@id, @cedula, @nombre, @novedad, @tipo, @cantidad, @valor, @observaciones, @periodo, @fechaRegistro)
    `;

    const params = {
      id,
      cedula,
      nombre,
      novedad,
      tipo,
      cantidad: parseFloat(cantidad),
      valor: parseFloat(valor),
      observaciones: observaciones || '',
      periodo,
      fechaRegistro
    };

    await executeQuery(query, params);
    res.json({ success: true, id, message: 'Ocasional registrado correctamente' });
  } catch (err) {
    console.error('Error en crearOcasional:', err);
    res.status(500).json({ error: 'Error al registrar ocasional', details: err.message });
  }
}

async function obtenerOcasionales(req, res) {
  try {
    const { periodo } = req.query;
    let query = 'SELECT * FROM Ocasionales WHERE 1=1';
    const params = {};

    if (periodo) {
      query += ' AND periodo = @periodo';
      params.periodo = periodo;
    }

    query += ' ORDER BY fechaRegistro DESC';

    const result = await executeQuery(query, params);
    res.json(result.recordset || []);
  } catch (err) {
    console.error('Error en obtenerOcasionales:', err);
    res.status(500).json({ error: 'Error al obtener ocasionales', details: err.message });
  }
}

async function actualizarOcasional(req, res) {
  try {
    const { id } = req.params;
    const { cedula, nombre, novedad, tipo, cantidad, valor, observaciones } = req.body;

    const query = `
      UPDATE Ocasionales
      SET cedula = @cedula, nombre = @nombre, novedad = @novedad, tipo = @tipo,
          cantidad = @cantidad, valor = @valor, observaciones = @observaciones
      WHERE id = @id
    `;

    const params = {
      id,
      cedula,
      nombre,
      novedad,
      tipo,
      cantidad: parseFloat(cantidad),
      valor: parseFloat(valor),
      observaciones: observaciones || ''
    };

    await executeQuery(query, params);
    res.json({ success: true, message: 'Ocasional actualizado' });
  } catch (err) {
    console.error('Error en actualizarOcasional:', err);
    res.status(500).json({ error: 'Error al actualizar ocasional', details: err.message });
  }
}

async function eliminarOcasional(req, res) {
  try {
    const { id } = req.params;
    const query = 'DELETE FROM Ocasionales WHERE id = @id';
    const params = { id };

    await executeQuery(query, params);
    res.json({ success: true, message: 'Ocasional eliminado' });
  } catch (err) {
    console.error('Error en eliminarOcasional:', err);
    res.status(500).json({ error: 'Error al eliminar ocasional', details: err.message });
  }
}

// ===== FIJAS =====

async function crearFija(req, res) {
  try {
    const { cedula, nombre, novedad, tipo, aplicacion, valor, finicial, ffinal, cuotas, cuenta, observaciones, periodo } = req.body;

    const id = uuidv4();
    const fechaRegistro = new Date();

    const query = `
      INSERT INTO Fijas (id, cedula, nombre, novedad, tipo, aplicacion, valor, finicial, ffinal, cuotas, cuenta, observaciones, periodo, fechaRegistro)
      VALUES (@id, @cedula, @nombre, @novedad, @tipo, @aplicacion, @valor, @finicial, @ffinal, @cuotas, @cuenta, @observaciones, @periodo, @fechaRegistro)
    `;

    const params = {
      id,
      cedula,
      nombre,
      novedad,
      tipo,
      aplicacion,
      valor: parseFloat(valor),
      finicial: new Date(finicial),
      ffinal: ffinal ? new Date(ffinal) : null,
      cuotas: parseInt(cuotas),
      cuenta: cuenta || '',
      observaciones: observaciones || '',
      periodo,
      fechaRegistro
    };

    await executeQuery(query, params);
    res.json({ success: true, id, message: 'Deducción fija registrada' });
  } catch (err) {
    console.error('Error en crearFija:', err);
    res.status(500).json({ error: 'Error al registrar fija', details: err.message });
  }
}

async function obtenerFijas(req, res) {
  try {
    const { periodo } = req.query;
    let query = 'SELECT * FROM Fijas WHERE 1=1';
    const params = {};

    if (periodo) {
      query += ' AND periodo = @periodo';
      params.periodo = periodo;
    }

    query += ' ORDER BY fechaRegistro DESC';

    const result = await executeQuery(query, params);
    res.json(result.recordset || []);
  } catch (err) {
    console.error('Error en obtenerFijas:', err);
    res.status(500).json({ error: 'Error al obtener fijas', details: err.message });
  }
}

// ===== AUSENCIAS =====

async function crearAusencia(req, res) {
  try {
    const { cedula, nombre, tipo, diagnostico, finicial, ffinal, dias, prorroga, observaciones, periodo } = req.body;

    const id = uuidv4();
    const fechaRegistro = new Date();

    const query = `
      INSERT INTO Ausencias (id, cedula, nombre, tipo, diagnostico, finicial, ffinal, dias, prorroga, observaciones, periodo, fechaRegistro)
      VALUES (@id, @cedula, @nombre, @tipo, @diagnostico, @finicial, @ffinal, @dias, @prorroga, @observaciones, @periodo, @fechaRegistro)
    `;

    const params = {
      id,
      cedula,
      nombre,
      tipo,
      diagnostico: diagnostico || '',
      finicial: new Date(finicial),
      ffinal: new Date(ffinal),
      dias: parseInt(dias),
      prorroga: prorroga ? new Date(prorroga) : null,
      observaciones: observaciones || '',
      periodo,
      fechaRegistro
    };

    await executeQuery(query, params);
    res.json({ success: true, id, message: 'Ausencia registrada' });
  } catch (err) {
    console.error('Error en crearAusencia:', err);
    res.status(500).json({ error: 'Error al registrar ausencia', details: err.message });
  }
}

async function obtenerAusencias(req, res) {
  try {
    const { periodo } = req.query;
    let query = 'SELECT * FROM Ausencias WHERE 1=1';
    const params = {};

    if (periodo) {
      query += ' AND periodo = @periodo';
      params.periodo = periodo;
    }

    query += ' ORDER BY fechaRegistro DESC';

    const result = await executeQuery(query, params);
    res.json(result.recordset || []);
  } catch (err) {
    console.error('Error en obtenerAusencias:', err);
    res.status(500).json({ error: 'Error al obtener ausencias', details: err.message });
  }
}

// ===== ACTIVIDAD =====

async function obtenerActividad(req, res) {
  try {
    const query = `
      SELECT TOP 100
        'Ocasionales' as modulo, cedula, nombre, novedad as tipo, fechaRegistro, 'Registrado' as estado
      FROM Ocasionales
      UNION ALL
      SELECT TOP 100
        'Fijas' as modulo, cedula, nombre, novedad as tipo, fechaRegistro, 'Registrado' as estado
      FROM Fijas
      UNION ALL
      SELECT TOP 100
        'Ausencias' as modulo, cedula, nombre, tipo, fechaRegistro, 'Registrado' as estado
      FROM Ausencias
      ORDER BY fechaRegistro DESC
    `;

    const result = await executeQuery(query);
    res.json(result.recordset || []);
  } catch (err) {
    console.error('Error en obtenerActividad:', err);
    res.status(500).json({ error: 'Error al obtener actividad', details: err.message });
  }
}

module.exports = {
  crearOcasional,
  obtenerOcasionales,
  actualizarOcasional,
  eliminarOcasional,
  crearFija,
  obtenerFijas,
  crearAusencia,
  obtenerAusencias,
  obtenerActividad
};
