// ============================================================================
//  controllers/mantenimientoController.js
//  Mantenimiento preventivo automático — limpieza de tablas auxiliares.
//
//  Qué hace:
//    1. limpiarLogs()          — elimina entradas de GN_LOG_APP con más de
//                                LOG_RETENTION_DIAS días (default: 90).
//                                Borra en lotes de 2 000 filas para no bloquear.
//    2. cerrarSesiones()       — marca como cerradas ('C') las sesiones de
//                                GN_SESION que llevan más de 8 h sin actividad.
//    3. ejecutarMantenimiento() — llama a ambas y loguea el resumen.
//
//  Se invoca desde server.js:
//    • Una vez en _runBootstrapsOnce() (al arranque)
//    • Cada 24 h via setInterval
//
//  Configuración via .env (opcionales):
//    LOG_RETENTION_DIAS=90   Días de retención de logs (default: 90)
//    SESION_INACTIV_HORAS=8  Horas de inactividad para cerrar sesión (default: 8)
// ============================================================================

const { executeQuery } = require('../config/database');

const LOG_RETENTION_DIAS  = Number(process.env.LOG_RETENTION_DIAS)  || 90;
const SESION_INACTIV_HORAS = Number(process.env.SESION_INACTIV_HORAS) || 8;
const LOTE_SIZE = 2000; // filas por batch en el DELETE de logs

// ---------------------------------------------------------------------------
// limpiarLogs()
// Elimina entradas de GN_LOG_APP anteriores al período de retención.
// Usa DELETE TOP(N) en loop para evitar bloqueos en tablas grandes.
// ---------------------------------------------------------------------------
async function limpiarLogs() {
  let totalBorrados = 0;
  let lote;

  do {
    const r = await executeQuery(`
      DELETE TOP(@lote) FROM dbo.GN_LOG_APP
      WHERE FEC_EVEN < DATEADD(day, -@dias, GETDATE())
    `, { lote: LOTE_SIZE, dias: LOG_RETENTION_DIAS });

    lote = (r.rowsAffected && r.rowsAffected[0]) || 0;
    totalBorrados += lote;

    // Pausa breve entre lotes para no saturar I/O
    if (lote === LOTE_SIZE) await new Promise(r => setTimeout(r, 200));
  } while (lote === LOTE_SIZE);

  return totalBorrados;
}

// ---------------------------------------------------------------------------
// cerrarSesiones()
// Cierra sesiones 'A' cuya última actividad supera SESION_INACTIV_HORAS.
// Si FEC_ULAC es NULL se usa FEC_INIC como referencia.
// ---------------------------------------------------------------------------
async function cerrarSesiones() {
  const r = await executeQuery(`
    UPDATE dbo.GN_SESION
    SET    EST_SESI = 'C',
           FEC_CIER = GETDATE(),
           ACT_HORA = GETDATE()
    WHERE  EST_SESI  = 'A'
      AND  ACT_ESTA  = 'A'
      AND  DATEDIFF(hour,
             ISNULL(FEC_ULAC, FEC_INIC),
             GETDATE()
           ) >= @horas
  `, { horas: SESION_INACTIV_HORAS });

  return (r.rowsAffected && r.rowsAffected[0]) || 0;
}

// ---------------------------------------------------------------------------
// ejecutarMantenimiento()
// Punto de entrada principal — llama a ambas funciones y loguea el resumen.
// Diseñado para no lanzar excepciones al exterior: los errores se capturan
// internamente para no interrumpir el ciclo de bootstrap ni el setInterval.
// ---------------------------------------------------------------------------
async function ejecutarMantenimiento() {
  try {
    const logsEliminados = await limpiarLogs();
    if (logsEliminados > 0) {
      console.log(
        `[mantenimiento] 🧹 Logs eliminados: ${logsEliminados} ` +
        `(retención: ${LOG_RETENTION_DIAS} días)`
      );
    }
  } catch (err) {
    console.error('[mantenimiento] ✗ Error limpiando logs:', err.message);
  }

  try {
    const sesionesCerradas = await cerrarSesiones();
    if (sesionesCerradas > 0) {
      console.log(
        `[mantenimiento] 🔒 Sesiones cerradas: ${sesionesCerradas} ` +
        `(inactividad > ${SESION_INACTIV_HORAS}h)`
      );
    }
  } catch (err) {
    console.error('[mantenimiento] ✗ Error cerrando sesiones:', err.message);
  }
}

module.exports = { ejecutarMantenimiento };
