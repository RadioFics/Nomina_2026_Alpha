const { executeQuery } = require('../config/database');
const { v4: uuidv4 } = require('uuid');

// ============================================================================
// UTILIDADES
// ============================================================================

/**
 * Genera número de novedad único: YYYY-MM-CAT-NNN
 * Ejemplo: 2026-04-OCW-001
 */
async function generarNumeroNovedad(categoria) {
  try {
    const hoy = new Date();
    const mes = String(hoy.getMonth() + 1).padStart(2, '0');
    const anio = hoy.getFullYear();

    const categoriaMap = {
      'Ocasional': 'OCW',
      'Fija': 'FIJ',
      'Ausencia': 'AUS'
    };

    const sigla = categoriaMap[categoria] || 'NOV';

    // Obtener próximo número secuencial
    const query = `
      SELECT COUNT(*) as contador
      FROM NO_NOVED
      WHERE categoria = @categoria
        AND YEAR(fechaRegistro) = @anio
        AND MONTH(fechaRegistro) = @mes
    `;

    const result = await executeQuery(query, {
      categoria,
      anio,
      mes: parseInt(mes)
    });

    const contador = result.recordset[0].contador + 1;
    const numero = String(contador).padStart(3, '0');

    return `${anio}-${mes}-${sigla}-${numero}`;
  } catch (err) {
    console.error('Error generando número novedad:', err);
    throw err;
  }
}

/**
 * Registra auditoría de cambios
 */
async function registrarAuditoria(novedadId, usuario, accion, detalles) {
  try {
    const id = uuidv4();
    const query = `
      INSERT INTO NO_NOVED_Auditoria (id, novedadId, usuario, accion, fechaAccion, motivo)
      VALUES (@id, @novedadId, @usuario, @accion, GETDATE(), @detalles)
    `;

    await executeQuery(query, {
      id,
      novedadId,
      usuario,
      accion,
      detalles
    });
  } catch (err) {
    console.error('Error registrando auditoría:', err);
    // No lanzar error, solo registrar
  }
}

// ============================================================================
// OCASIONALES
// ============================================================================

/**
 * Crear ocasional con registro en NO_NOVED
 */
async function crearOcasional(req, res) {
  try {
    const { cedula, nombre, novedad, tipo, cantidad, valor, observaciones, periodo } = req.body;
    const usuario = req.headers['x-usuario'] || 'Sistema';

    // Validaciones
    if (!cedula || !nombre) {
      return res.status(400).json({ error: 'Cédula y nombre son requeridos' });
    }

    const id = uuidv4();
    const novedadId = uuidv4();
    const numeroNovedad = await generarNumeroNovedad('Ocasional');
    const fechaRegistro = new Date();

    // Iniciar transacción
    const queryNovedadCentral = `
      INSERT INTO NO_NOVED (
        id, numeroNovedad, cedula, nombre,
        categoria, tipo, subtipo, periodo,
        cantidad, valor, estado, observaciones,
        usuarioRegistro, fechaRegistro
      )
      VALUES (
        @id, @numeroNovedad, @cedula, @nombre,
        @categoria, @tipo, @subtipo, @periodo,
        @cantidad, @valor, @estado, @observaciones,
        @usuarioRegistro, @fechaRegistro
      )
    `;

    const paramsNovedadCentral = {
      id: novedadId,
      numeroNovedad,
      cedula,
      nombre,
      categoria: 'Ocasional',
      tipo: novedad,
      subtipo: tipo,
      periodo,
      cantidad: parseFloat(cantidad),
      valor: parseFloat(valor),
      estado: 'Activo',
      observaciones: observaciones || '',
      usuarioRegistro: usuario,
      fechaRegistro
    };

    // Crear en NO_NOVED
    await executeQuery(queryNovedadCentral, paramsNovedadCentral);

    // Crear en tabla específica
    const queryOcasional = `
      INSERT INTO Ocasionales (
        id, cedula, nombre, novedad, tipo,
        cantidad, valor, observaciones, periodo,
        novedadId, fechaRegistro
      )
      VALUES (
        @id, @cedula, @nombre, @novedad, @tipo,
        @cantidad, @valor, @observaciones, @periodo,
        @novedadId, @fechaRegistro
      )
    `;

    const paramsOcasional = {
      id,
      cedula,
      nombre,
      novedad,
      tipo,
      cantidad: parseFloat(cantidad),
      valor: parseFloat(valor),
      observaciones: observaciones || '',
      periodo,
      novedadId,
      fechaRegistro
    };

    await executeQuery(queryOcasional, paramsOcasional);

    // Registrar auditoría
    await registrarAuditoria(novedadId, usuario, 'CREATE', `Ocasional creada: ${numeroNovedad}`);

    res.json({
      success: true,
      id,
      novedadId,
      numeroNovedad,
      message: 'Ocasional registrada correctamente'
    });
  } catch (err) {
    console.error('Error en crearOcasional:', err);
    res.status(500).json({
      error: 'Error al registrar ocasional',
      details: err.message
    });
  }
}

/**
 * Obtener ocasionales filtrados por período
 */
async function obtenerOcasionales(req, res) {
  try {
    const { periodo, estado } = req.query;
    let query = `
      SELECT
        o.id,
        o.cedula,
        o.nombre,
        o.novedad,
        o.tipo,
        o.cantidad,
        o.valor,
        o.observaciones,
        o.periodo,
        o.fechaRegistro,
        n.numeroNovedad,
        n.estado,
        n.usuarioRegistro
      FROM Ocasionales o
      LEFT JOIN NO_NOVED n ON o.novedadId = n.id
      WHERE 1=1
    `;

    const params = {};

    if (periodo) {
      query += ' AND o.periodo = @periodo';
      params.periodo = periodo;
    }

    if (estado) {
      query += ' AND n.estado = @estado';
      params.estado = estado;
    }

    query += ' ORDER BY o.fechaRegistro DESC';

    const result = await executeQuery(query, params);
    res.json(result.recordset || []);
  } catch (err) {
    console.error('Error en obtenerOcasionales:', err);
    res.status(500).json({
      error: 'Error al obtener ocasionales',
      details: err.message
    });
  }
}

/**
 * Actualizar ocasional con auditoría
 */
async function actualizarOcasional(req, res) {
  try {
    const { id } = req.params;
    const { cedula, nombre, novedad, tipo, cantidad, valor, observaciones } = req.body;
    const usuario = req.headers['x-usuario'] || 'Sistema';

    // Obtener novedad actual
    const queryOcasionalActual = 'SELECT novedadId FROM Ocasionales WHERE id = @id';
    const resultOcasional = await executeQuery(queryOcasionalActual, { id });

    if (!resultOcasional.recordset || resultOcasional.recordset.length === 0) {
      return res.status(404).json({ error: 'Ocasional no encontrada' });
    }

    const novedadId = resultOcasional.recordset[0].novedadId;

    // Actualizar en tabla específica
    const queryOcasional = `
      UPDATE Ocasionales
      SET cedula = @cedula, nombre = @nombre, novedad = @novedad,
          tipo = @tipo, cantidad = @cantidad, valor = @valor,
          observaciones = @observaciones
      WHERE id = @id
    `;

    const paramsOcasional = {
      id,
      cedula,
      nombre,
      novedad,
      tipo,
      cantidad: parseFloat(cantidad),
      valor: parseFloat(valor),
      observaciones: observaciones || ''
    };

    await executeQuery(queryOcasional, paramsOcasional);

    // Actualizar en NO_NOVED
    const queryNovedadCentral = `
      UPDATE NO_NOVED
      SET cedula = @cedula, nombre = @nombre, tipo = @tipo,
          subtipo = @subtipo, cantidad = @cantidad, valor = @valor,
          observaciones = @observaciones, estado = 'Modificado',
          usuarioActualizacion = @usuario, fechaActualizacion = GETDATE()
      WHERE id = @novedadId
    `;

    const paramsNovedadCentral = {
      novedadId,
      cedula,
      nombre,
      tipo: novedad,
      subtipo: tipo,
      cantidad: parseFloat(cantidad),
      valor: parseFloat(valor),
      observaciones: observaciones || '',
      usuario
    };

    await executeQuery(queryNovedadCentral, paramsNovedadCentral);

    // Registrar auditoría
    await registrarAuditoria(novedadId, usuario, 'UPDATE', `Ocasional actualizada: ${id}`);

    res.json({ success: true, message: 'Ocasional actualizada correctamente' });
  } catch (err) {
    console.error('Error en actualizarOcasional:', err);
    res.status(500).json({
      error: 'Error al actualizar ocasional',
      details: err.message
    });
  }
}

/**
 * Eliminar ocasional (soft delete)
 */
async function eliminarOcasional(req, res) {
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    const usuario = req.headers['x-usuario'] || 'Sistema';

    // Obtener novedadId
    const queryOcasional = 'SELECT novedadId FROM Ocasionales WHERE id = @id';
    const result = await executeQuery(queryOcasional, { id });

    if (!result.recordset || result.recordset.length === 0) {
      return res.status(404).json({ error: 'Ocasional no encontrada' });
    }

    const novedadId = result.recordset[0].novedadId;

    // Actualizar estado en NO_NOVED (soft delete)
    const queryNovedadCentral = `
      UPDATE NO_NOVED
      SET estado = 'Cancelado',
          usuarioCancelacion = @usuario,
          fechaCancelacion = GETDATE(),
          motivoCancelacion = @motivo
      WHERE id = @novedadId
    `;

    await executeQuery(queryNovedadCentral, {
      novedadId,
      usuario,
      motivo: motivo || 'Sin especificar'
    });

    // Eliminar de tabla específica
    const queryEliminar = 'DELETE FROM Ocasionales WHERE id = @id';
    await executeQuery(queryEliminar, { id });

    // Registrar auditoría
    await registrarAuditoria(novedadId, usuario, 'DELETE', `Ocasional eliminada: ${id}`);

    res.json({ success: true, message: 'Ocasional eliminada correctamente' });
  } catch (err) {
    console.error('Error en eliminarOcasional:', err);
    res.status(500).json({
      error: 'Error al eliminar ocasional',
      details: err.message
    });
  }
}

// ============================================================================
// FIJAS
// ============================================================================

/**
 * Crear fija con registro en NO_NOVED
 */
async function crearFija(req, res) {
  try {
    const { cedula, nombre, novedad, tipo, aplicacion, valor, finicial, ffinal, cuotas, cuenta, observaciones, periodo } = req.body;
    const usuario = req.headers['x-usuario'] || 'Sistema';

    if (!cedula || !nombre) {
      return res.status(400).json({ error: 'Cédula y nombre son requeridos' });
    }

    const id = uuidv4();
    const novedadId = uuidv4();
    const numeroNovedad = await generarNumeroNovedad('Fija');
    const fechaRegistro = new Date();

    // Crear en NO_NOVED
    const queryNovedadCentral = `
      INSERT INTO NO_NOVED (
        id, numeroNovedad, cedula, nombre,
        categoria, tipo, subtipo, periodo,
        fechaInicio, fechaFin, valor, aplicacion,
        estado, observaciones, usuarioRegistro, fechaRegistro
      )
      VALUES (
        @id, @numeroNovedad, @cedula, @nombre,
        @categoria, @tipo, @subtipo, @periodo,
        @fechaInicio, @fechaFin, @valor, @aplicacion,
        @estado, @observaciones, @usuarioRegistro, @fechaRegistro
      )
    `;

    const paramsNovedadCentral = {
      id: novedadId,
      numeroNovedad,
      cedula,
      nombre,
      categoria: 'Fija',
      tipo: novedad,
      subtipo: tipo,
      periodo,
      fechaInicio: finicial ? new Date(finicial) : null,
      fechaFin: ffinal ? new Date(ffinal) : null,
      valor: parseFloat(valor),
      aplicacion,
      estado: 'Activo',
      observaciones: observaciones || '',
      usuarioRegistro: usuario,
      fechaRegistro
    };

    await executeQuery(queryNovedadCentral, paramsNovedadCentral);

    // Crear en tabla específica
    const queryFija = `
      INSERT INTO Fijas (
        id, cedula, nombre, novedad, tipo,
        aplicacion, valor, finicial, ffinal,
        cuotas, cuenta, observaciones, periodo,
        novedadId, fechaRegistro
      )
      VALUES (
        @id, @cedula, @nombre, @novedad, @tipo,
        @aplicacion, @valor, @finicial, @ffinal,
        @cuotas, @cuenta, @observaciones, @periodo,
        @novedadId, @fechaRegistro
      )
    `;

    const paramsFija = {
      id,
      cedula,
      nombre,
      novedad,
      tipo,
      aplicacion,
      valor: parseFloat(valor),
      finicial: finicial ? new Date(finicial) : null,
      ffinal: ffinal ? new Date(ffinal) : null,
      cuotas: parseInt(cuotas),
      cuenta: cuenta || '',
      observaciones: observaciones || '',
      periodo,
      novedadId,
      fechaRegistro
    };

    await executeQuery(queryFija, paramsFija);

    // Registrar auditoría
    await registrarAuditoria(novedadId, usuario, 'CREATE', `Fija creada: ${numeroNovedad}`);

    res.json({
      success: true,
      id,
      novedadId,
      numeroNovedad,
      message: 'Deducción fija registrada correctamente'
    });
  } catch (err) {
    console.error('Error en crearFija:', err);
    res.status(500).json({
      error: 'Error al registrar fija',
      details: err.message
    });
  }
}

/**
 * Obtener fijas filtradas por período
 */
async function obtenerFijas(req, res) {
  try {
    const { periodo, estado } = req.query;
    let query = `
      SELECT
        f.id,
        f.cedula,
        f.nombre,
        f.novedad,
        f.tipo,
        f.aplicacion,
        f.valor,
        f.finicial,
        f.ffinal,
        f.cuotas,
        f.cuenta,
        f.observaciones,
        f.periodo,
        f.fechaRegistro,
        n.numeroNovedad,
        n.estado,
        n.usuarioRegistro
      FROM Fijas f
      LEFT JOIN NO_NOVED n ON f.novedadId = n.id
      WHERE 1=1
    `;

    const params = {};

    if (periodo) {
      query += ' AND f.periodo = @periodo';
      params.periodo = periodo;
    }

    if (estado) {
      query += ' AND n.estado = @estado';
      params.estado = estado;
    }

    query += ' ORDER BY f.fechaRegistro DESC';

    const result = await executeQuery(query, params);
    res.json(result.recordset || []);
  } catch (err) {
    console.error('Error en obtenerFijas:', err);
    res.status(500).json({
      error: 'Error al obtener fijas',
      details: err.message
    });
  }
}

/**
 * Actualizar fija con auditoría
 */
async function actualizarFija(req, res) {
  try {
    const { id } = req.params;
    const { cedula, nombre, novedad, tipo, aplicacion, valor, finicial, ffinal, cuotas, cuenta, observaciones } = req.body;
    const usuario = req.headers['x-usuario'] || 'Sistema';

    // Obtener novedadId
    const queryFijaActual = 'SELECT novedadId FROM Fijas WHERE id = @id';
    const resultFija = await executeQuery(queryFijaActual, { id });

    if (!resultFija.recordset || resultFija.recordset.length === 0) {
      return res.status(404).json({ error: 'Fija no encontrada' });
    }

    const novedadId = resultFija.recordset[0].novedadId;

    // Actualizar en tabla específica
    const queryFija = `
      UPDATE Fijas
      SET cedula = @cedula, nombre = @nombre, novedad = @novedad,
          tipo = @tipo, aplicacion = @aplicacion, valor = @valor,
          finicial = @finicial, ffinal = @ffinal, cuotas = @cuotas,
          cuenta = @cuenta, observaciones = @observaciones
      WHERE id = @id
    `;

    const paramsFija = {
      id,
      cedula,
      nombre,
      novedad,
      tipo,
      aplicacion,
      valor: parseFloat(valor),
      finicial: finicial ? new Date(finicial) : null,
      ffinal: ffinal ? new Date(ffinal) : null,
      cuotas: parseInt(cuotas),
      cuenta: cuenta || '',
      observaciones: observaciones || ''
    };

    await executeQuery(queryFija, paramsFija);

    // Actualizar en NO_NOVED
    const queryNovedadCentral = `
      UPDATE NO_NOVED
      SET cedula = @cedula, nombre = @nombre, tipo = @tipo,
          subtipo = @subtipo, fechaInicio = @fechaInicio,
          fechaFin = @fechaFin, valor = @valor, aplicacion = @aplicacion,
          observaciones = @observaciones, estado = 'Modificado',
          usuarioActualizacion = @usuario, fechaActualizacion = GETDATE()
      WHERE id = @novedadId
    `;

    const paramsNovedadCentral = {
      novedadId,
      cedula,
      nombre,
      tipo: novedad,
      subtipo: tipo,
      fechaInicio: finicial ? new Date(finicial) : null,
      fechaFin: ffinal ? new Date(ffinal) : null,
      valor: parseFloat(valor),
      aplicacion,
      observaciones: observaciones || '',
      usuario
    };

    await executeQuery(queryNovedadCentral, paramsNovedadCentral);

    // Registrar auditoría
    await registrarAuditoria(novedadId, usuario, 'UPDATE', `Fija actualizada: ${id}`);

    res.json({ success: true, message: 'Fija actualizada correctamente' });
  } catch (err) {
    console.error('Error en actualizarFija:', err);
    res.status(500).json({
      error: 'Error al actualizar fija',
      details: err.message
    });
  }
}

/**
 * Eliminar fija (soft delete)
 */
async function eliminarFija(req, res) {
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    const usuario = req.headers['x-usuario'] || 'Sistema';

    // Obtener novedadId
    const queryFija = 'SELECT novedadId FROM Fijas WHERE id = @id';
    const result = await executeQuery(queryFija, { id });

    if (!result.recordset || result.recordset.length === 0) {
      return res.status(404).json({ error: 'Fija no encontrada' });
    }

    const novedadId = result.recordset[0].novedadId;

    // Actualizar estado en NO_NOVED (soft delete)
    const queryNovedadCentral = `
      UPDATE NO_NOVED
      SET estado = 'Cancelado',
          usuarioCancelacion = @usuario,
          fechaCancelacion = GETDATE(),
          motivoCancelacion = @motivo
      WHERE id = @novedadId
    `;

    await executeQuery(queryNovedadCentral, {
      novedadId,
      usuario,
      motivo: motivo || 'Sin especificar'
    });

    // Eliminar de tabla específica
    const queryEliminar = 'DELETE FROM Fijas WHERE id = @id';
    await executeQuery(queryEliminar, { id });

    // Registrar auditoría
    await registrarAuditoria(novedadId, usuario, 'DELETE', `Fija eliminada: ${id}`);

    res.json({ success: true, message: 'Fija eliminada correctamente' });
  } catch (err) {
    console.error('Error en eliminarFija:', err);
    res.status(500).json({
      error: 'Error al eliminar fija',
      details: err.message
    });
  }
}

// ============================================================================
// AUSENCIAS
// ============================================================================

/**
 * Crear ausencia con registro en NO_NOVED
 */
async function crearAusencia(req, res) {
  try {
    const { cedula, nombre, tipo, diagnostico, finicial, ffinal, dias, prorroga, observaciones, periodo } = req.body;
    const usuario = req.headers['x-usuario'] || 'Sistema';

    if (!cedula || !nombre) {
      return res.status(400).json({ error: 'Cédula y nombre son requeridos' });
    }

    const id = uuidv4();
    const novedadId = uuidv4();
    const numeroNovedad = await generarNumeroNovedad('Ausencia');
    const fechaRegistro = new Date();

    // Crear en NO_NOVED
    const queryNovedadCentral = `
      INSERT INTO NO_NOVED (
        id, numeroNovedad, cedula, nombre,
        categoria, tipo, subtipo, periodo,
        fechaInicio, fechaFin, cantidad, estado,
        observaciones, usuarioRegistro, fechaRegistro
      )
      VALUES (
        @id, @numeroNovedad, @cedula, @nombre,
        @categoria, @tipo, @subtipo, @periodo,
        @fechaInicio, @fechaFin, @cantidad, @estado,
        @observaciones, @usuarioRegistro, @fechaRegistro
      )
    `;

    const paramsNovedadCentral = {
      id: novedadId,
      numeroNovedad,
      cedula,
      nombre,
      categoria: 'Ausencia',
      tipo: 'Ausencia',
      subtipo: tipo,
      periodo,
      fechaInicio: new Date(finicial),
      fechaFin: new Date(ffinal),
      cantidad: dias,
      estado: 'Activo',
      observaciones: observaciones || '',
      usuarioRegistro: usuario,
      fechaRegistro
    };

    await executeQuery(queryNovedadCentral, paramsNovedadCentral);

    // Crear en tabla específica
    const queryAusencia = `
      INSERT INTO Ausencias (
        id, cedula, nombre, tipo, diagnostico,
        finicial, ffinal, dias, prorroga, observaciones,
        periodo, novedadId, fechaRegistro
      )
      VALUES (
        @id, @cedula, @nombre, @tipo, @diagnostico,
        @finicial, @ffinal, @dias, @prorroga, @observaciones,
        @periodo, @novedadId, @fechaRegistro
      )
    `;

    const paramsAusencia = {
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
      novedadId,
      fechaRegistro
    };

    await executeQuery(queryAusencia, paramsAusencia);

    // Registrar auditoría
    await registrarAuditoria(novedadId, usuario, 'CREATE', `Ausencia creada: ${numeroNovedad}`);

    res.json({
      success: true,
      id,
      novedadId,
      numeroNovedad,
      message: 'Ausencia registrada correctamente'
    });
  } catch (err) {
    console.error('Error en crearAusencia:', err);
    res.status(500).json({
      error: 'Error al registrar ausencia',
      details: err.message
    });
  }
}

/**
 * Obtener ausencias filtradas por período
 */
async function obtenerAusencias(req, res) {
  try {
    const { periodo, estado } = req.query;
    let query = `
      SELECT
        a.id,
        a.cedula,
        a.nombre,
        a.tipo,
        a.diagnostico,
        a.finicial,
        a.ffinal,
        a.dias,
        a.prorroga,
        a.observaciones,
        a.periodo,
        a.fechaRegistro,
        n.numeroNovedad,
        n.estado,
        n.usuarioRegistro
      FROM Ausencias a
      LEFT JOIN NO_NOVED n ON a.novedadId = n.id
      WHERE 1=1
    `;

    const params = {};

    if (periodo) {
      query += ' AND a.periodo = @periodo';
      params.periodo = periodo;
    }

    if (estado) {
      query += ' AND n.estado = @estado';
      params.estado = estado;
    }

    query += ' ORDER BY a.fechaRegistro DESC';

    const result = await executeQuery(query, params);
    res.json(result.recordset || []);
  } catch (err) {
    console.error('Error en obtenerAusencias:', err);
    res.status(500).json({
      error: 'Error al obtener ausencias',
      details: err.message
    });
  }
}

/**
 * Actualizar ausencia con auditoría
 */
async function actualizarAusencia(req, res) {
  try {
    const { id } = req.params;
    const { cedula, nombre, tipo, diagnostico, finicial, ffinal, dias, prorroga, observaciones } = req.body;
    const usuario = req.headers['x-usuario'] || 'Sistema';

    // Obtener novedadId
    const queryAusenciaActual = 'SELECT novedadId FROM Ausencias WHERE id = @id';
    const resultAusencia = await executeQuery(queryAusenciaActual, { id });

    if (!resultAusencia.recordset || resultAusencia.recordset.length === 0) {
      return res.status(404).json({ error: 'Ausencia no encontrada' });
    }

    const novedadId = resultAusencia.recordset[0].novedadId;

    // Actualizar en tabla específica
    const queryAusencia = `
      UPDATE Ausencias
      SET cedula = @cedula, nombre = @nombre, tipo = @tipo,
          diagnostico = @diagnostico, finicial = @finicial,
          ffinal = @ffinal, dias = @dias, prorroga = @prorroga,
          observaciones = @observaciones
      WHERE id = @id
    `;

    const paramsAusencia = {
      id,
      cedula,
      nombre,
      tipo,
      diagnostico: diagnostico || '',
      finicial: new Date(finicial),
      ffinal: new Date(ffinal),
      dias: parseInt(dias),
      prorroga: prorroga ? new Date(prorroga) : null,
      observaciones: observaciones || ''
    };

    await executeQuery(queryAusencia, paramsAusencia);

    // Actualizar en NO_NOVED
    const queryNovedadCentral = `
      UPDATE NO_NOVED
      SET cedula = @cedula, nombre = @nombre, subtipo = @subtipo,
          fechaInicio = @fechaInicio, fechaFin = @fechaFin,
          cantidad = @cantidad, observaciones = @observaciones,
          estado = 'Modificado', usuarioActualizacion = @usuario,
          fechaActualizacion = GETDATE()
      WHERE id = @novedadId
    `;

    const paramsNovedadCentral = {
      novedadId,
      cedula,
      nombre,
      subtipo: tipo,
      fechaInicio: new Date(finicial),
      fechaFin: new Date(ffinal),
      cantidad: parseInt(dias),
      observaciones: observaciones || '',
      usuario
    };

    await executeQuery(queryNovedadCentral, paramsNovedadCentral);

    // Registrar auditoría
    await registrarAuditoria(novedadId, usuario, 'UPDATE', `Ausencia actualizada: ${id}`);

    res.json({ success: true, message: 'Ausencia actualizada correctamente' });
  } catch (err) {
    console.error('Error en actualizarAusencia:', err);
    res.status(500).json({
      error: 'Error al actualizar ausencia',
      details: err.message
    });
  }
}

/**
 * Eliminar ausencia (soft delete)
 */
async function eliminarAusencia(req, res) {
  try {
    const { id } = req.params;
    const { motivo } = req.body;
    const usuario = req.headers['x-usuario'] || 'Sistema';

    // Obtener novedadId
    const queryAusencia = 'SELECT novedadId FROM Ausencias WHERE id = @id';
    const result = await executeQuery(queryAusencia, { id });

    if (!result.recordset || result.recordset.length === 0) {
      return res.status(404).json({ error: 'Ausencia no encontrada' });
    }

    const novedadId = result.recordset[0].novedadId;

    // Actualizar estado en NO_NOVED (soft delete)
    const queryNovedadCentral = `
      UPDATE NO_NOVED
      SET estado = 'Cancelado',
          usuarioCancelacion = @usuario,
          fechaCancelacion = GETDATE(),
          motivoCancelacion = @motivo
      WHERE id = @novedadId
    `;

    await executeQuery(queryNovedadCentral, {
      novedadId,
      usuario,
      motivo: motivo || 'Sin especificar'
    });

    // Eliminar de tabla específica
    const queryEliminar = 'DELETE FROM Ausencias WHERE id = @id';
    await executeQuery(queryEliminar, { id });

    // Registrar auditoría
    await registrarAuditoria(novedadId, usuario, 'DELETE', `Ausencia eliminada: ${id}`);

    res.json({ success: true, message: 'Ausencia eliminada correctamente' });
  } catch (err) {
    console.error('Error en eliminarAusencia:', err);
    res.status(500).json({
      error: 'Error al eliminar ausencia',
      details: err.message
    });
  }
}

// ============================================================================
// HISTÓRICO Y REPORTES
// ============================================================================

/**
 * Obtener histórico centralizado de una persona
 */
async function obtenerHistorialPersona(req, res) {
  try {
    const { cedula, periodo } = req.query;

    if (!cedula) {
      return res.status(400).json({ error: 'Cédula es requerida' });
    }

    let query = `
      SELECT
        id,
        numeroNovedad,
        cedula,
        nombre,
        categoria,
        tipo,
        subtipo,
        periodo,
        fechaInicio,
        fechaFin,
        cantidad,
        valor,
        estado,
        observaciones,
        fechaRegistro,
        fechaActualizacion,
        usuarioRegistro
      FROM NO_NOVED
      WHERE cedula = @cedula
    `;

    const params = { cedula };

    if (periodo) {
      query += ' AND periodo = @periodo';
      params.periodo = periodo;
    }

    query += ' ORDER BY fechaRegistro DESC';

    const result = await executeQuery(query, params);

    // Calcular totales
    const registros = result.recordset || [];
    const ingresos = registros
      .filter(r => r.estado !== 'Cancelado' && r.valor > 0)
      .reduce((sum, r) => sum + (r.valor || 0), 0);

    const descuentos = registros
      .filter(r => r.estado !== 'Cancelado' && r.valor < 0)
      .reduce((sum, r) => sum + (r.valor || 0), 0);

    res.json({
      cedula,
      nombre: registros[0]?.nombre || '',
      novedades: registros,
      totales: {
        ingresos,
        descuentos,
        neto: ingresos + descuentos
      }
    });
  } catch (err) {
    console.error('Error en obtenerHistorialPersona:', err);
    res.status(500).json({
      error: 'Error al obtener histórico',
      details: err.message
    });
  }
}

/**
 * Obtener todas las novedades centralizadas con filtros
 */
async function obtenerNovedadesCentralizadas(req, res) {
  try {
    const { periodo, categoria, estado, cedula } = req.query;
    let query = 'SELECT * FROM NO_NOVED WHERE 1=1';
    const params = {};

    if (periodo) {
      query += ' AND periodo = @periodo';
      params.periodo = periodo;
    }

    if (categoria) {
      query += ' AND categoria = @categoria';
      params.categoria = categoria;
    }

    if (estado) {
      query += ' AND estado = @estado';
      params.estado = estado;
    }

    if (cedula) {
      query += ' AND cedula = @cedula';
      params.cedula = cedula;
    }

    query += ' ORDER BY fechaRegistro DESC';

    const result = await executeQuery(query, params);
    res.json(result.recordset || []);
  } catch (err) {
    console.error('Error en obtenerNovedadesCentralizadas:', err);
    res.status(500).json({
      error: 'Error al obtener novedades',
      details: err.message
    });
  }
}

/**
 * Obtener actividad general (mantiene compatibilidad con frontend anterior)
 */
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
    res.status(500).json({
      error: 'Error al obtener actividad',
      details: err.message
    });
  }
}

// ============================================================================
// EXPORTACIÓN
// ============================================================================

/**
 * Obtener datos para reportes (CSV, Excel, PDF)
 */
async function obtenerReporteConsolidado(req, res) {
  try {
    const { periodo } = req.query;

    let query = `
      SELECT
        numeroNovedad,
        cedula,
        nombre,
        categoria,
        tipo,
        subtipo,
        periodo,
        cantidad,
        valor,
        estado,
        fechaRegistro,
        usuarioRegistro
      FROM NO_NOVED
      WHERE 1=1
    `;

    const params = {};

    if (periodo) {
      query += ' AND periodo = @periodo';
      params.periodo = periodo;
    }

    query += ' ORDER BY cedula, fechaRegistro DESC';

    const result = await executeQuery(query, params);
    res.json(result.recordset || []);
  } catch (err) {
    console.error('Error en obtenerReporteConsolidado:', err);
    res.status(500).json({
      error: 'Error al generar reporte',
      details: err.message
    });
  }
}

// ============================================================================
// EXPORTAR FUNCIONES
// ============================================================================

module.exports = {
  // Ocasionales
  crearOcasional,
  obtenerOcasionales,
  actualizarOcasional,
  eliminarOcasional,

  // Fijas
  crearFija,
  obtenerFijas,
  actualizarFija,
  eliminarFija,

  // Ausencias
  crearAusencia,
  obtenerAusencias,
  actualizarAusencia,
  eliminarAusencia,

  // Histórico y Reportes
  obtenerHistorialPersona,
  obtenerNovedadesCentralizadas,
  obtenerActividad,
  obtenerReporteConsolidado
};
