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
const logger           = require('../config/logger');

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
 * Solo retorna registros activos (ACT_ESTA='A') o registros inactivos cuyo
 * período siga abierto (PER_EST='A'). Los registros inactivos en períodos
 * cerrados se ignoran: intentar reactivarlos dispara TR_NO_NOVED_PERIODO_CERRADO.
 */
async function buscarDuplicadoNoved(codEmpr, codFunci, codConc, fechaIni, fechaFin) {
  const r = await executeQuery(`
    SELECT TOP 1 n.COD_NOVED, n.ACT_ESTA
    FROM dbo.NO_NOVED n
    LEFT JOIN dbo.NO_PERIOD p
      ON p.COD_EMPR  = n.COD_EMPR
     AND p.COD_PERIOD = n.COD_PERIOD
    WHERE n.COD_EMPR  = @codEmpr
      AND n.COD_FUNCI = @codFunci
      AND n.COD_CONC  = @codConc
      AND n.FEC_INI   = CONVERT(date, @fechaIni)
      AND n.FEC_FIN   = CONVERT(date, @fechaFin)
      AND (n.ACT_ESTA = 'A' OR ISNULL(p.PER_EST, '') = 'A')
    ORDER BY n.ACT_ESTA DESC
  `, { codEmpr, codFunci, codConc, fechaIni, fechaFin });
  return r.recordset && r.recordset[0] ? r.recordset[0] : null;
}


/**
 * Busca cualquier registro en NO_NOVED con el mismo concepto en el período dado,
 * sin importar las fechas. Detecta el conflicto con el índice único
 * UQ_NO_NOVED_PERIODO_FUNCI_CONC antes de intentar INSERT, evitando
 * "Cannot insert duplicate key row" cuando ADECCO ya creó un registro con
 * FEC_INI=NULL para el mismo empleado + concepto + período.
 */
async function buscarNovedEnPeriodo(codEmpr, codPeriod, codFunci, codConc) {
  const r = await executeQuery(`
    SELECT TOP 1 n.COD_NOVED, n.ACT_ESTA, n.FEC_INI, n.FEC_FIN
    FROM dbo.NO_NOVED n
    WHERE n.COD_EMPR   = @codEmpr
      AND n.COD_PERIOD = @codPeriod
      AND n.COD_FUNCI  = @codFunci
      AND n.COD_CONC   = @codConc
  `, { codEmpr, codPeriod, codFunci, codConc });
  return r.recordset && r.recordset[0] ? r.recordset[0] : null;
}


// ─── Mapeo motivo → COD_CONC ──────────────────────────────────────────────────

/**
 * Resuelve el concepto correcto según el motivo extraído del PDF.
 *  COMPENSATORIO → 74 (Compensatorio)
 *  DIA_FAMILIA   → 75 (Día de la Familia)
 *  resto         → 68 (Permiso Remunerado): MEDICO, ESTUDIO, CALAMIDAD, FUERZA_MAYOR, OTRA
 */
function resolverCodConcPermiso(motivo) {
  switch ((motivo || '').toUpperCase()) {
    case 'COMPENSATORIO': return 74;
    case 'DIA_FAMILIA':   return 75;
    default:              return 68;
  }
}

// ─── Insertar / reactivar Permiso ────────────────────────────────────────────

/**
 * Inserta en NO_NOVED usando el COD_CONC correcto según el motivo del permiso.
 * Si ya existe y está inactivo (en período abierto) → lo reactiva.
 * Si ya existe y está activo → retorna como 'ACUMULADO'.
 */
async function insertarOReactivarPermiso({ codEmpr, codFunci, periodo, datos }) {
  // Preferir COD_CONC embebido en el bloque [FORMS] del PDF (determinístico);
  // solo caer en la heurística por motivo si el PDF no lo trae.
  const COD_CONC_PERMISO = (datos.cod_conc && !isNaN(Number(datos.cod_conc)))
    ? Number(datos.cod_conc)
    : resolverCodConcPermiso(datos.motivo);

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
          INSERT INTO dbo.NO_AUSEN (COD_EMPR, COD_NOVED, FEC_INI, FEC_FIN, DIAS_TOTAL, ACT_USUA, ACT_HORA, ACT_ESTA)
          VALUES (@codEmpr, @codNoved, CONVERT(date,@fechaIni), CONVERT(date,@fechaFin), 1, 'PDF_IMP', SYSDATETIME(), 'A');
      `, {
        codEmpr,
        codNoved: duplicado.COD_NOVED,
        fechaIni,
        fechaFin
      });
      return {
        success: true,
        estado: 'REACTIVADO',
        codNoved: duplicado.COD_NOVED,
        mensaje: `Permiso reactivado (COD_NOVED=${duplicado.COD_NOVED})`
      };
    }

    // ── Verificar conflicto con índice único (mismo concepto en mismo período) ─
    // UQ_NO_NOVED_PERIODO_FUNCI_CONC impide dos registros del mismo concepto en
    // el mismo período aunque tengan fechas distintas (ADECCO importa FEC_INI=NULL).
    // Si existe tal registro se actualizan sus fechas desde el PDF.
    const enPeriodo = await buscarNovedEnPeriodo(
      codEmpr, periodo.COD_PERIOD, codFunci, COD_CONC_PERMISO
    );
    if (enPeriodo) {
      await executeQuery(`
        UPDATE dbo.NO_NOVED
        SET FEC_INI   = CONVERT(date, @fechaIni),
            FEC_FIN   = CONVERT(date, @fechaFin),
            OBS_NOVED = @obs,
            ACT_ESTA  = 'A',
            ACT_USUA  = 'PDF_IMP',
            ACT_HORA  = GETDATE()
        WHERE COD_EMPR = @codEmpr AND COD_NOVED = @codNoved
      `, {
        codEmpr,
        codNoved: enPeriodo.COD_NOVED,
        fechaIni,
        fechaFin,
        obs: construirObs(datos)
      });
      await executeQuery(`
        IF NOT EXISTS (SELECT 1 FROM dbo.NO_AUSEN WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved)
          INSERT INTO dbo.NO_AUSEN (
            COD_EMPR, COD_NOVED,
            FEC_INI, FEC_FIN, DIAS_TOTAL,
            ACT_USUA, ACT_HORA, ACT_ESTA
          ) VALUES (
            @codEmpr, @codNoved,
            CONVERT(date,@fechaIni), CONVERT(date,@fechaFin), 1,
            'PDF_IMP', SYSDATETIME(), 'A'
          );
        ELSE
          UPDATE dbo.NO_AUSEN
          SET FEC_INI   = CONVERT(date,@fechaIni),
              FEC_FIN   = CONVERT(date,@fechaFin),
              ACT_ESTA  = 'A',
              ACT_USUA  = 'PDF_IMP',
              ACT_HORA  = SYSDATETIME()
          WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved;
      `, {
        codEmpr,
        codNoved: enPeriodo.COD_NOVED,
        fechaIni,
        fechaFin
      });
      return {
        success: true,
        estado: 'ACTUALIZADO',
        codNoved: enPeriodo.COD_NOVED,
        mensaje: `Permiso actualizado con fechas del PDF (COD_NOVED=${enPeriodo.COD_NOVED})`
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
    // DIAGNOSTICO se deja en NULL (no se rellena — campo solo informativo).
    if (codNoved) {
      await executeQuery(`
        INSERT INTO dbo.NO_AUSEN (
          COD_EMPR, COD_NOVED,
          FEC_INI,  FEC_FIN,  DIAS_TOTAL,
          ACT_USUA, ACT_HORA, ACT_ESTA
        ) VALUES (
          @codEmpr, @codNoved,
          CONVERT(date, @fechaIni), CONVERT(date, @fechaFin), 1,
          'PDF_IMP', SYSDATETIME(), 'A'
        )
      `, {
        codEmpr,
        codNoved,
        fechaIni,
        fechaFin
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

    // ── Verificar conflicto con índice único (mismo concepto en mismo período) ─
    const enPeriodoVac = await buscarNovedEnPeriodo(
      codEmpr, periodo.COD_PERIOD, codFunci, COD_CONC_VACACIONES
    );
    if (enPeriodoVac) {
      await executeQuery(`
        UPDATE dbo.NO_NOVED
        SET FEC_INI   = CONVERT(date, @fechaIni),
            FEC_FIN   = CONVERT(date, @fechaFin),
            OBS_NOVED = @obs,
            ACT_ESTA  = 'A',
            ACT_USUA  = 'PDF_IMP',
            ACT_HORA  = GETDATE()
        WHERE COD_EMPR = @codEmpr AND COD_NOVED = @codNoved
      `, {
        codEmpr,
        codNoved: enPeriodoVac.COD_NOVED,
        fechaIni,
        fechaFin,
        obs: `Vacaciones disfrutadas ${fechaIni} al ${fechaFin} (${diasTotal} días)`
      });
      await executeQuery(`
        IF NOT EXISTS (SELECT 1 FROM dbo.NO_AUSEN WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved)
          INSERT INTO dbo.NO_AUSEN (
            COD_EMPR, COD_NOVED,
            FEC_INI, FEC_FIN, DIAS_TOTAL,
            ACT_USUA, ACT_HORA, ACT_ESTA
          ) VALUES (
            @codEmpr, @codNoved,
            CONVERT(date,@fechaIni), CONVERT(date,@fechaFin), @diasTotal,
            'PDF_IMP', SYSDATETIME(), 'A'
          );
        ELSE
          UPDATE dbo.NO_AUSEN
          SET FEC_INI    = CONVERT(date,@fechaIni),
              FEC_FIN    = CONVERT(date,@fechaFin),
              DIAS_TOTAL = @diasTotal,
              ACT_ESTA   = 'A',
              ACT_USUA   = 'PDF_IMP',
              ACT_HORA   = SYSDATETIME()
          WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved;
      `, {
        codEmpr,
        codNoved: enPeriodoVac.COD_NOVED,
        fechaIni,
        fechaFin,
        diasTotal
      });
      return {
        success: true,
        estado: 'ACTUALIZADO',
        codNoved: enPeriodoVac.COD_NOVED,
        mensaje: `Vacaciones actualizadas con fechas del PDF (COD_NOVED=${enPeriodoVac.COD_NOVED})`
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
        ACT_USUA, ACT_HORA, ACT_ESTA
      ) VALUES (
        @codEmpr, @codNoved,
        CONVERT(date, @fechaIni), CONVERT(date, @fechaFin), @diasTotal,
        'PDF_IMP', SYSDATETIME(), 'A'
      )
    `, {
      codEmpr,
      codNoved,
      fechaIni,
      fechaFin,
      diasTotal
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
  // Formato alineado con solicitudesController: "E: <explicacion> | O: <observaciones>"
  // Las observaciones del PDF vienen ya en ese formato desde procesar_pdf.py;
  // si llegan en formato anterior (sin prefijo) se pasan tal cual.
  const obs = (datos.observaciones || '').trim();
  return obs.slice(0, 500) || 'Permiso importado desde PDF';
}

// ─── Invocar extractor Python ─────────────────────────────────────────────────

function procesarPDFconPython(rutaArchivo) {
  return new Promise((resolve, reject) => {
    const script = path.join(__dirname, '..', 'python', 'procesar_pdf.py');
    let stdout = '';
    let stderr = '';

    // Cadena de candidatos: PYTHON_PATH (sin fs.existsSync) → py → python → python3
    // En Azure App Service Windows, fs.existsSync() sobre rutas D:\ puede dar false
    // aunque el ejecutable sí exista — por eso se confía directamente en el env var.
    const envPy = (process.env.PYTHON_PATH || '').trim();
    const candidatos = envPy
      ? [envPy, 'py', 'python', 'python3']
      : ['py', 'python', 'python3'];
    let intentoIdx = 0;

    const trySpawn = (cmd) => {
      const py = spawn(cmd, [script, rutaArchivo], { windowsHide: true });

      py.on('error', (err) => {
        if (err.code === 'ENOENT' && intentoIdx < candidatos.length - 1) {
          intentoIdx++;
          const siguiente = candidatos[intentoIdx];
          logger.warn('importarPDF',
            cmd + ' ENOENT, reintentando con: ' + siguiente,
            'Probados: ' + candidatos.slice(0, intentoIdx).join(', ') + ' | PYTHON_PATH=' + (envPy || 'no definido')
          );
          return trySpawn(siguiente);
        }
        logger.error('importarPDF',
          'Python no encontrado tras ' + (intentoIdx + 1) + ' intento(s): ' + err.message,
          'Candidatos probados: ' + candidatos.slice(0, intentoIdx + 1).join(', ') +
          '\nPYTHON_PATH=' + (envPy || 'no definido') +
          '\nVerifique la ruta en Azure App Settings o use /api/health/python para diagnosticar.'
        );
        reject(new Error(
          'Python no encontrado. Probados: ' + candidatos.slice(0, intentoIdx + 1).join(', ') +
          '. Verifique PYTHON_PATH en App Settings de Azure o consulte /api/health/python.'
        ));
      });

      py.stdout.on('data', d => { stdout += d.toString(); });
      py.stderr.on('data', d => { stderr += d.toString(); });

      py.on('close', code => {
        if (code !== 0) {
          logger.error('importarPDF',
            'Python termino con codigo ' + code,
            'stderr: ' + stderr.slice(0, 1000) + '\nstdout: ' + stdout.slice(0, 500) + '\nArchivo: ' + path.basename(rutaArchivo)
          );
          return reject(new Error('Python error (code ' + code + '): ' + stderr.slice(0, 300)));
        }
        try {
          resolve(JSON.parse(stdout.trim()));
        } catch (e) {
          logger.error('importarPDF',
            'Respuesta de Python no es JSON valido: ' + e.message,
            'stdout (primeros 500 chars): ' + stdout.slice(0, 500)
          );
          reject(new Error('JSON parse error: ' + e.message + ' | stdout: ' + stdout.slice(0, 200)));
        }
      });
    };

    trySpawn(pythonCmd2);
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
    let totalActualizados = 0;
    let totalAcumulados = 0;
    let totalReactivados = 0;
    let totalErrores = 0;

    // Directorio temporal
    const tempDir = path.join(__dirname, '..', 'temp');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    for (const file of req.files) {
      const tmpPath = path.join(tempDir, `${Date.now()}_${file.originalname}`);

      try {
        // Guardar temporalmente
        fs.writeFileSync(tmpPath, file.buffer);

        // ── Extracción Python (devuelve array; un elemento por página/empleado) ──
        const rawResult  = await procesarPDFconPython(tmpPath);
        const registros  = Array.isArray(rawResult) ? rawResult : [rawResult];

        // Resolver período activo una sola vez por archivo (se reutiliza por página)
        const periodo = await resolverPeriodo(codEmpr);

        for (const [pageIdx, datos] of registros.entries()) {
          const etiqueta = registros.length > 1
            ? `${file.originalname} (pág. ${pageIdx + 1})`
            : file.originalname;

          const resumen = {
            archivo:     etiqueta,
            tipoNovedad: null,
            cedula:      null,
            nombre:      null,
            estado:      'PENDIENTE',
            detalle:     null,
            error:       null,
          };

          if (!datos.success) {
            resumen.estado = 'ERROR';
            // Mostrar errores reales del extractor, no el genérico
            const errMsg = datos.error
              || (datos.errores && datos.errores.length > 0 ? datos.errores.join('; ') : null)
              || 'Error al procesar PDF';
            resumen.error = errMsg;
            totalErrores++;
            archivos.push(resumen);
            continue;
          }

          resumen.tipoNovedad = datos.tipo_novedad;
          resumen.cedula      = datos.cedula;
          resumen.nombre      = datos.nombre;

          // ── Validar cédula ─────────────────────────────────────────────
          if (!datos.cedula) {
            resumen.estado = 'ERROR';
            resumen.error  = 'Cédula no detectada en el PDF';
            totalErrores++;
            archivos.push(resumen);
            continue;
          }

          // ── Resolver empleado en BD ────────────────────────────────────
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

          // ── Verificar período activo ───────────────────────────────────
          if (!periodo) {
            resumen.estado = 'ERROR';
            resumen.error  = 'No existe período activo (PER_EST=A) en la base de datos';
            totalErrores++;
            archivos.push(resumen);
            continue;
          }

          // ── Insertar / reactivar ───────────────────────────────────────
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
            if (resumen.estado === 'INSERTADO')   totalInsertados++;
            if (resumen.estado === 'ACTUALIZADO') totalActualizados++;
            if (resumen.estado === 'ACUMULADO')   totalAcumulados++;
            if (resumen.estado === 'REACTIVADO')  totalReactivados++;
          } else {
            resumen.estado = 'ERROR';
            resumen.error  = resultado.error;
            totalErrores++;
          }

          archivos.push(resumen);
        }

      } catch (err) {
        logger.error('importarPDF',
          'Error al procesar ' + file.originalname + ': ' + err.message,
          err.stack,
          { usuario: req.nom_usua || req.cod_gusu || null, ruta: 'POST /api/pdf/importar' }
        );
        archivos.push({
          archivo:     file.originalname,
          tipoNovedad: null,
          cedula:      null,
          nombre:      null,
          estado:      'ERROR',
          detalle:     null,
          error:       err.message,
        });
        totalErrores++;
      } finally {
        // Limpiar temporal
        if (fs.existsSync(tmpPath)) fs.unlinkSync(tmpPath);
      }
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
        procesados:    archivos.length,
        totalFilas:    archivos.length,
        insertados:    totalInsertados,
        actualizados:  totalActualizados,
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
