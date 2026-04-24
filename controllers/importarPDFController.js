// ============================================================================
//  controllers/importarPDFController.js
//  Importación de PDFs de Permisos y Vacaciones  —  MineDax
//
//  Permisos   (CM-TH-FR-003) → NO_NOVED  (COD_CONC = 68  Permiso Remunerado)
//  Vacaciones (CM-TH-SV-001) → NO_NOVED  (COD_CONC = 63  Vacaciones Disfrutadas)
//                            → NO_AUSEN  (detalle de ausentismo)
//
//  Lógica de duplicados:
//    Si ya existe un registro con el mismo empleado + concepto + fechas:
//      → se reactiva si está inactivo (ACT_ESTA = 'I')
//      → se retorna como "acumulado" si ya está activo (ACT_ESTA = 'A')
// ============================================================================

const { executeQuery } = require('../config/database');
const { spawn }        = require('child_process');
const fs               = require('fs');
const path             = require('path');
const multer           = require('multer');

const DEFAULT_COD_EMPR = 1;

// ─── Multer ──────────────────────────────────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 52_428_800, files: 20 },
  fileFilter: (req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se aceptan archivos PDF'), false);
    }
  },
}).array('archivos[]', 20);

exports.uploadMiddleware = upload;

// ─── Consultas BD ─────────────────────────────────────────────────────────────

/**
 * Resuelve el período a usar para registrar la novedad.
 *
 * Regla de negocio: las novedades PDF (permisos, vacaciones) son documentos
 * históricos que llegan con fecha propia, pero SIEMPRE se registran en el
 * período activo actual (PER_EST = 'A'). Esto es consistente con el módulo
 * manual de ausentismos y evita que el trigger TR_NO_NOVED_PERIODO_CERRADO
 * rechace la inserción por período cerrado.
 *
 * El trigger valida que COD_PERIOD tenga PER_EST = 'A'. Períodos anteriores
 * (feb, mar, abr Q1) ya están cerrados (PER_EST = 'I'), así que registrar
 * en ellos dispararía un ROLLBACK. El período activo actual es el correcto.
 */
async function resolverPeriodo(codEmpr) {
  // Período activo que cubre la fecha de hoy (el período de liquidación en curso)
  const r = await executeQuery(`
    SELECT TOP 1
      COD_PERIOD, PER_ANO, PER_MES, PER_QNA, PER_FINI, PER_FFIN
    FROM dbo.NO_PERIOD
    WHERE COD_EMPR = @codEmpr
      AND ACT_ESTA  = 'A'
      AND PER_EST   = 'A'
      AND CONVERT(date, GETDATE()) BETWEEN PER_FINI AND PER_FFIN
    ORDER BY PER_FINI DESC
  `, { codEmpr });

  if (r.recordset && r.recordset[0]) return r.recordset[0];

  // Fallback: el período activo más reciente disponible
  const r2 = await executeQuery(`
    SELECT TOP 1
      COD_PERIOD, PER_ANO, PER_MES, PER_QNA, PER_FINI, PER_FFIN
    FROM dbo.NO_PERIOD
    WHERE COD_EMPR = @codEmpr
      AND ACT_ESTA  = 'A'
      AND PER_EST   = 'A'
    ORDER BY PER_FINI DESC
  `, { codEmpr });

  return r2.recordset && r2.recordset[0] ? r2.recordset[0] : null;
}

/** COD_FUNCI a partir de cédula (NUM_IDEN en GN_TERCE). */
async function resolverCodFunci(cedula, codEmpr) {
  const r = await executeQuery(`
    SELECT TOP 1 f.COD_FUNCI
    FROM dbo.GN_FUNCI  f
    INNER JOIN dbo.GN_TERCE t ON t.COD_TERC = f.COD_TERC
    WHERE f.COD_EMPR      = @codEmpr
      AND t.NUM_IDEN       = CAST(@cedula AS BIGINT)
      AND f.ACT_ESTA       = 'A'
  `, { codEmpr, cedula: String(cedula).trim() });
  return r.recordset && r.recordset[0] ? r.recordset[0].COD_FUNCI : null;
}

/** Nombre completo a partir de cédula (para confirmar identidad). */
async function resolverNombreEmpleado(cedula, codEmpr) {
  const r = await executeQuery(`
    SELECT TOP 1 t.NOM_COMP
    FROM dbo.GN_TERCE t
    INNER JOIN dbo.GN_FUNCI f ON f.COD_TERC = t.COD_TERC
    WHERE f.COD_EMPR  = @codEmpr
      AND t.NUM_IDEN  = CAST(@cedula AS BIGINT)
      AND f.ACT_ESTA  = 'A'
  `, { codEmpr, cedula: String(cedula).trim() });
  return r.recordset && r.recordset[0] ? r.recordset[0].NOM_COMP : null;
}

/**
 * Busca duplicado en NO_NOVED para un empleado + concepto + rango de fechas.
 * Retorna el registro existente o null.
 */
async function buscarDuplicadoNoved(codEmpr, codFunci, codConc, fechaIni, fechaFin) {
  const r = await executeQuery(`
    SELECT TOP 1 COD_NOVED, ACT_ESTA
    FROM dbo.NO_NOVED
    WHERE COD_EMPR  = @codEmpr
      AND COD_FUNCI = @codFunci
      AND COD_CONC  = @codConc
      AND FEC_INI   = CONVERT(date, @fechaIni)
      AND FEC_FIN   = CONVERT(date, @fechaFin)
  `, { codEmpr, codFunci, codConc, fechaIni, fechaFin });
  return r.recordset && r.recordset[0] ? r.recordset[0] : null;
}


// ─── Insertar / reactivar Permiso ────────────────────────────────────────────

/**
 * COD_CONC = 68 → "Permiso Remunerado"
 * Inserta en NO_NOVED.
 * Si ya existe y está inactivo → lo reactiva.
 * Si ya existe y está activo  → retorna como 'ACUMULADO'.
 */
async function insertarOReactivarPermiso({ codEmpr, codFunci, periodo, datos }) {
  const COD_CONC_PERMISO = 68;   // Permiso Remunerado

  const fechaIni = datos.fecha_inicio || datos.fecha_novedad;
  const fechaFin = datos.fecha_fin    || datos.fecha_novedad || fechaIni;

  if (!fechaIni) {
    return { success: false, error: 'Fecha de permiso no detectada en el PDF' };
  }

  try {
    // ── Verificar duplicado ────────────────────────────────────────────────
    const duplicado = await buscarDuplicadoNoved(
      codEmpr, codFunci, COD_CONC_PERMISO, fechaIni, fechaFin
    );

    if (duplicado) {
      if (duplicado.ACT_ESTA === 'A') {
        return {
          success: true,
          estado: 'ACUMULADO',
          codNoved: duplicado.COD_NOVED,
          mensaje: `Permiso ya registrado (COD_NOVED=${duplicado.COD_NOVED}). Sin cambios.`
        };
      }
      // Reactivar NO_NOVED
      await executeQuery(`
        UPDATE dbo.NO_NOVED
        SET ACT_ESTA = 'A',
            ACT_USUA = 'PDF_IMP',
            ACT_HORA = GETDATE(),
            OBS_NOVED = @obs
        WHERE COD_EMPR  = @codEmpr
          AND COD_NOVED = @codNoved
      `, {
        codEmpr,
        codNoved: duplicado.COD_NOVED,
        obs: construirObs(datos)
      });
      // Reactivar NO_AUSEN si existe; insertar si no existe (puede ocurrir en
      // registros históricos creados antes de que los permisos escribieran NO_AUSEN)
      await executeQuery(`
        IF EXISTS (SELECT 1 FROM dbo.NO_AUSEN WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved)
          UPDATE dbo.NO_AUSEN
          SET ACT_ESTA='A', ACT_USUA='PDF_IMP', ACT_HORA=SYSDATETIME()
          WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved;
        ELSE
          INSERT INTO dbo.NO_AUSEN (COD_EMPR, COD_NOVED, FEC_INI, FEC_FIN, DIAS_TOTAL, DIAGNOSTICO, ACT_USUA, ACT_HORA, ACT_ESTA)
          VALUES (@codEmpr, @codNoved, CONVERT(date,@fechaIni), CONVERT(date,@fechaFin), 1, @diag, 'PDF_IMP', SYSDATETIME(), 'A');
      `, {
        codEmpr,
        codNoved: duplicado.COD_NOVED,
        fechaIni,
        fechaFin,
        diag: (datos.motivo || 'PERMISO REMUNERADO').slice(0, 20)
      });
      return {
        success: true,
        estado: 'REACTIVADO',
        codNoved: duplicado.COD_NOVED,
        mensaje: `Permiso reactivado (COD_NOVED=${duplicado.COD_NOVED})`
      };
    }

    // ── Insertar nuevo — COD_NOVED es IDENTITY, SQL Server lo genera solo ──
    const insertResult = await executeQuery(`
      INSERT INTO dbo.NO_NOVED (
        COD_EMPR, COD_FUNCI, COD_CONC, COD_PERIOD,
        FEC_REGI,  OBS_NOVED,  IND_APLICADO,
        ACT_USUA,  ACT_HORA,   ACT_ESTA,
        FEC_INI,   FEC_FIN
      ) VALUES (
        @codEmpr, @codFunci, @codConc, @codPeriod,
        CONVERT(date, GETDATE()), @obs, 'N',
        'PDF_IMP', GETDATE(), 'A',
        CONVERT(date, @fechaIni), CONVERT(date, @fechaFin)
      );
      SELECT SCOPE_IDENTITY() AS codNoved;
    `, {
      codEmpr,
      codFunci,
      codConc:   COD_CONC_PERMISO,
      codPeriod: periodo.COD_PERIOD,
      obs:       construirObs(datos),
      fechaIni,
      fechaFin
    });

    const codNoved = insertResult.recordset && insertResult.recordset[0]
      ? insertResult.recordset[0].codNoved
      : null;

    // ── Insertar detalle en NO_AUSEN ──────────────────────────────────────
    // Los permisos remunerados tienen TIP_NATU='AUSENTISMO' en NO_CONCE,
    // por eso deben aparecer en la vista de Ausentismos. La fila en NO_AUSEN
    // usa las mismas fechas del permiso; DIAS_TOTAL = 1 día (o fracción).
    // DIAGNOSTICO usa el motivo extraído del PDF (máx 20 chars).
    if (codNoved) {
      const motivoDiag = (datos.motivo || 'PERMISO REMUNERADO').slice(0, 20);
      await executeQuery(`
        INSERT INTO dbo.NO_AUSEN (
          COD_EMPR, COD_NOVED,
          FEC_INI,  FEC_FIN,  DIAS_TOTAL,
          DIAGNOSTICO,
          ACT_USUA, ACT_HORA, ACT_ESTA
        ) VALUES (
          @codEmpr, @codNoved,
          CONVERT(date, @fechaIni), CONVERT(date, @fechaFin), 1,
          @diagnostico,
          'PDF_IMP', SYSDATETIME(), 'A'
        )
      `, {
        codEmpr,
        codNoved,
        fechaIni,
        fechaFin,
        diagnostico: motivoDiag
      });
    }

    return {
      success: true,
      estado: 'INSERTADO',
      codNoved,
      mensaje: `Permiso insertado (NO_NOVED=${codNoved}, NO_AUSEN vinculado)`
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── Insertar / reactivar Vacaciones ─────────────────────────────────────────

/**
 * COD_CONC = 63 → "Vacaciones Disfrutadas"
 * Inserta en NO_NOVED (cabecera) + NO_AUSEN (detalle).
 * Maneja duplicados igual que permisos.
 */
async function insertarOReactivarVacaciones({ codEmpr, codFunci, periodo, datos }) {
  const COD_CONC_VACACIONES = 63;   // Vacaciones Disfrutadas

  const fechaIni = datos.fecha_inicio;
  const fechaFin = datos.fecha_fin;

  if (!fechaIni || !fechaFin) {
    return { success: false, error: 'Fechas de vacaciones no detectadas en el PDF' };
  }

  const diasTotal = datos.cantidad || 0;

  try {
    // ── Verificar duplicado en NO_NOVED ────────────────────────────────────
    const duplicado = await buscarDuplicadoNoved(
      codEmpr, codFunci, COD_CONC_VACACIONES, fechaIni, fechaFin
    );

    if (duplicado) {
      if (duplicado.ACT_ESTA === 'A') {
        return {
          success: true,
          estado: 'ACUMULADO',
          codNoved: duplicado.COD_NOVED,
          mensaje: `Vacaciones ya registradas (COD_NOVED=${duplicado.COD_NOVED}). Sin cambios.`
        };
      }
      // Reactivar NO_NOVED + NO_AUSEN
      await executeQuery(`
        UPDATE dbo.NO_NOVED
        SET ACT_ESTA = 'A', ACT_USUA = 'PDF_IMP', ACT_HORA = GETDATE()
        WHERE COD_EMPR = @codEmpr AND COD_NOVED = @codNoved
      `, { codEmpr, codNoved: duplicado.COD_NOVED });

      await executeQuery(`
        UPDATE dbo.NO_AUSEN
        SET ACT_ESTA = 'A', ACT_USUA = 'PDF_IMP', ACT_HORA = SYSDATETIME()
        WHERE COD_EMPR = @codEmpr AND COD_NOVED = @codNoved
      `, { codEmpr, codNoved: duplicado.COD_NOVED });

      return {
        success: true,
        estado: 'REACTIVADO',
        codNoved: duplicado.COD_NOVED,
        mensaje: `Vacaciones reactivadas (COD_NOVED=${duplicado.COD_NOVED})`
      };
    }

    // ── Insertar nuevo en NO_NOVED — COD_NOVED es IDENTITY, lo genera SQL Server ──
    const insertResult = await executeQuery(`
      INSERT INTO dbo.NO_NOVED (
        COD_EMPR, COD_FUNCI, COD_CONC, COD_PERIOD,
        FEC_REGI,  OBS_NOVED, IND_APLICADO,
        ACT_USUA,  ACT_HORA,  ACT_ESTA,
        FEC_INI,   FEC_FIN
      ) VALUES (
        @codEmpr, @codFunci, @codConc, @codPeriod,
        CONVERT(date, GETDATE()), @obs, 'N',
        'PDF_IMP', GETDATE(), 'A',
        CONVERT(date, @fechaIni), CONVERT(date, @fechaFin)
      );
      SELECT SCOPE_IDENTITY() AS codNoved;
    `, {
      codEmpr,
      codFunci,
      codConc:   COD_CONC_VACACIONES,
      codPeriod: periodo.COD_PERIOD,
      obs:       `Vacaciones disfrutadas ${fechaIni} al ${fechaFin} (${diasTotal} días)`,
      fechaIni,
      fechaFin
    });

    const codNoved = insertResult.recordset && insertResult.recordset[0]
      ? insertResult.recordset[0].codNoved
      : null;

    // ── Insertar detalle en NO_AUSEN ───────────────────────────────────────
    // NO_AUSEN.COD_NOVED referencia el mismo COD_NOVED recién generado en NO_NOVED.
    // NO_AUSEN NO es identity — se inserta el valor explícitamente.
    await executeQuery(`
      INSERT INTO dbo.NO_AUSEN (
        COD_EMPR, COD_NOVED,
        FEC_INI,  FEC_FIN,  DIAS_TOTAL,
        DIAGNOSTICO,
        ACT_USUA, ACT_HORA, ACT_ESTA
      ) VALUES (
        @codEmpr, @codNoved,
        CONVERT(date, @fechaIni), CONVERT(date, @fechaFin), @diasTotal,
        @diagnostico,
        'PDF_IMP', SYSDATETIME(), 'A'
      )
    `, {
      codEmpr,
      codNoved,
      fechaIni,
      fechaFin,
      diasTotal,
      diagnostico: `Vacaciones PDF - ${datos.nombre || ''}`.trim().slice(0, 20)
    });

    return {
      success: true,
      estado: 'INSERTADO',
      codNoved,
      mensaje: `Vacaciones insertadas (NO_NOVED=${codNoved}, NO_AUSEN vinculado)`
    };
  } catch (err) {
    return { success: false, error: err.message };
  }
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function construirObs(datos) {
  const partes = [];
  if (datos.motivo)      partes.push(datos.motivo);
  if (datos.hora_inicio) partes.push(`${datos.hora_inicio}-${datos.hora_fin || ''}`);
  if (datos.observaciones) partes.push(datos.observaciones);
  const obs = partes.join(' | ').trim();
  return obs.slice(0, 500) || 'Permiso importado desde PDF';
}

// ─── Invocar extractor Python ─────────────────────────────────────────────────

function procesarPDFconPython(rutaArchivo) {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, '..', 'python', 'procesar_pdf.py');
    let stdout = '';
    let stderr = '';

    const py = spawn('python3', [script, rutaArchivo]);
    py.stdout.on('data', d => { stdout += d.toString(); });
    py.stderr.on('data', d => { stderr += d.toString(); });

    py.on('close', code => {
      if (code !== 0) {
        return reject(new Error(`Python error (code ${code}): ${stderr.slice(0, 300)}`));
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch (e) {
        reject(new Error(`JSON parse error: ${e.message} | stdout: ${stdout.slice(0, 200)}`));
      }
    });
  });
}

// ─── Endpoint principal ───────────────────────────────────────────────────────

exports.importarPDFs = [
  upload,
  async (req, res) => {
    const codEmpr = DEFAULT_COD_EMPR;

    if (!req.files || req.files.length === 0) {
      return res.status(400).json({ success: false, error: 'No se enviaron archivos PDF' });
    }

    const archivos = [];
    let totalInsertados = 0;
    let totalAcumulados = 0;
    let totalReactivados = 0;
    let totalErrores = 0;

    // Directorio temporal
    const tempDir = path.join(__dirname, '..', 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    for (const file of req.files) {
      const resumen = {
        archivo:     file.originalname,
        tipoNovedad: null,
        cedula:      null,
        nombre:      null,
        estado:      'PENDIENTE',
        detalle:     null,
        error:       null,
      };

      const tmpPath = path.join(tempDir, `${Date.now()}_${file.originalname}`);

      try {
        // Guardar temporalmente
        fs.writeFileSync(tmpPath, file.buffer);

        // ── Extracción Python ────────────────────────────────────────────
        const datos = await procesarPDFconPython(tmpPath);

        if (!datos.success) {
          resumen.estado = 'ERROR';
          resumen.error  = datos.error || 'Error al procesar PDF';
          totalErrores++;
          archivos.push(resumen);
          continue;
        }

        resumen.tipoNovedad = datos.tipo_novedad;
        resumen.cedula      = datos.cedula;
        resumen.nombre      = datos.nombre;

        // ── Validar cédula ───────────────────────────────────────────────
        if (!datos.cedula) {
          resumen.estado = 'ERROR';
          resumen.error  = 'Cédula no detectada en el PDF';
          totalErrores++;
          archivos.push(resumen);
          continue;
        }

        // ── Resolver empleado en BD ──────────────────────────────────────
        const codFunci = await resolverCodFunci(datos.cedula, codEmpr);
        if (!codFunci) {
          resumen.estado = 'ERROR';
          resumen.error  = `Empleado con cédula ${datos.cedula} no encontrado o inactivo en BD`;
          totalErrores++;
          archivos.push(resumen);
          continue;
        }

        // Confirmar nombre desde BD
        const nombreBD = await resolverNombreEmpleado(datos.cedula, codEmpr);
        if (nombreBD) resumen.nombre = nombreBD.trim();

        // ── Resolver período activo actual ───────────────────────────────
        // Siempre se usa el período activo de hoy. Las novedades de PDFs
        // históricos (feb, mar) se registran en el período vigente para
        // no disparar el trigger TR_NO_NOVED_PERIODO_CERRADO.
        const periodo = await resolverPeriodo(codEmpr);
        if (!periodo) {
          resumen.estado = 'ERROR';
          resumen.error  = 'No existe período activo (PER_EST=A) en la base de datos';
          totalErrores++;
          archivos.push(resumen);
          continue;
        }

        // ── Insertar / reactivar ─────────────────────────────────────────
        let resultado;
        if (datos.tipo_novedad === 'PERMISO') {
          resultado = await insertarOReactivarPermiso({
            codEmpr, codFunci, periodo, datos
          });
        } else if (datos.tipo_novedad === 'VACACIONES') {
          resultado = await insertarOReactivarVacaciones({
            codEmpr, codFunci, periodo, datos
          });
        } else {
          resultado = {
            success: false,
            error: `Tipo de novedad no soportado: ${datos.tipo_novedad}`
          };
        }

        if (resultado.success) {
          resumen.estado  = resultado.estado || 'INSERTADO';
          resumen.detalle = resultado.mensaje;
          if (resumen.estado === 'INSERTADO')    totalInsertados++;
          if (resumen.estado === 'ACUMULADO')    totalAcumulados++;
          if (resumen.estado === 'REACTIVADO')   totalReactivados++;
        } else {
          resumen.estado = 'ERROR';
          resumen.error  = resultado.error;
          totalErrores++;
        }

      } catch (err) {
        resumen.estado = 'ERROR';
        resumen.error  = err.message;
        totalErrores++;
      } finally {
        // Limpiar temporal
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      }

      archivos.push(resumen);
    }

    // Periodo activo para incluirlo en la respuesta (para la UI)
    let periodoResp = null;
    try {
      const per = await resolverPeriodo(codEmpr);
      if (per) {
        const mes = String(per.PER_MES).padStart(2, '0');
        periodoResp = {
          etiqueta: `${per.PER_ANO}-${mes}-${per.PER_QNA}Q`,
          inicio:   per.PER_FINI,
          fin:      per.PER_FFIN,
        };
      }
    } catch (_) { /* no crítico */ }

    res.json({
      success: true,
      archivos,
      periodo: periodoResp,
      resumen: {
        totalArchivos: req.files.length,
        procesados:    req.files.length,
        totalFilas:    req.files.length,
        insertados:    totalInsertados,
        acumulados:    totalAcumulados,
        reactivados:   totalReactivados,
        conErrores:    totalErrores,
        errores:       totalErrores,
      }
    });
  }
];

// ─── Período actual ───────────────────────────────────────────────────────────

exports.obtenerPeriodoActual = async (req, res) => {
  try {
    const periodo = await resolverPeriodo(DEFAULT_COD_EMPR);
    if (!periodo) {
      return res.status(404).json({ success: false, error: 'No hay período activo' });
    }
    res.json({
      success: true,
      periodo: {
        codPeriod: periodo.COD_PERIOD,
        ano:       periodo.PER_ANO,
        mes:       periodo.PER_MES,
        qna:       periodo.PER_QNA,
        inicio:    periodo.PER_FINI,
        fin:       periodo.PER_FFIN,
      }
    });
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
};
