// =====================================================================
// SCRIPT: Solicitud de Vacaciones — Collective Mining
// Código Formulario: CM-TH-SV-001
// Versión Script: 1.0
// Descripción: Genera un PDF del formulario de vacaciones a partir de
//              una respuesta de Google Forms y lo envía por correo a
//              Talento Humano y al solicitante.
// =====================================================================
// INSTRUCCIONES RÁPIDAS:
//   1. Crea el Google Doc plantilla con los marcadores {{...}} indicados.
//   2. Crea el Google Form con los nombres de campo EXACTOS de este script.
//   3. Vincula el Form a un Google Sheet (Respuestas → Hoja de cálculo).
//   4. En el Sheet: Extensiones → Apps Script → pega este código.
//   5. Reemplaza los valores de CONFIG_VACACIONES con tus IDs reales.
//   6. Configura el trigger: onSubmitVacaciones → Al enviar formulario.
// =====================================================================


// ============================================================
// CONFIGURACIÓN — EDITAR ESTOS VALORES ANTES DE USAR
// ============================================================
var CONFIG_VACACIONES = {
  // ID del Google Doc plantilla para vacaciones
  TEMPLATE_DOC_ID: 'REEMPLAZAR_CON_ID_DEL_GOOGLE_DOC_PLANTILLA',

  // ID de la carpeta de Google Drive donde se guardarán los PDFs
  CARPETA_RRHH_ID: 'REEMPLAZAR_CON_ID_DE_CARPETA_DRIVE',

  // Correo de Talento Humano
  EMAIL_RRHH: 'talentohumano@collectivemining.com',

  // Prefijo del asunto del correo
  ASUNTO_EMAIL: 'Nueva Solicitud de Vacaciones — '
};
// ============================================================


/**
 * Función principal. Se activa automáticamente cuando alguien
 * envía el Google Form de vacaciones.
 */
function onSubmitVacaciones(e) {
  try {
    var respuestas = e.namedValues;

    // ── Información Personal ──────────────────────────────────────────
    var nombre       = obtenerValorV(respuestas, 'Nombre y apellidos completos');
    var cedula       = obtenerValorV(respuestas, 'Cédula de ciudadanía');
    var cargo        = obtenerValorV(respuestas, 'Cargo');
    var correoEmp    = obtenerValorV(respuestas, 'Correo electrónico');

    // ── Periodo de Vacaciones ─────────────────────────────────────────
    var periodoDesde  = obtenerValorV(respuestas, 'Período de vacaciones — Desde (DD/MM/AAAA)');
    var periodoHasta  = obtenerValorV(respuestas, 'Período de vacaciones — Hasta (DD/MM/AAAA)');
    var diasDisfrutar = obtenerValorV(respuestas, 'Número de días a disfrutar');

    // ── Actividades y Reemplazo ───────────────────────────────────────
    var actPendientes = obtenerValorV(respuestas, 'Actividades pendientes durante la ausencia');
    var reemplazo     = obtenerValorV(respuestas, 'Persona asignada como reemplazo');
    var observaciones = obtenerValorV(respuestas, 'Observaciones');

    // ── Fecha de solicitud (automática) ──────────────────────────────
    var fechaHoy = new Date();
    var dia  = fechaHoy.getDate().toString().padStart(2, '0');
    var mes  = (fechaHoy.getMonth() + 1).toString().padStart(2, '0');
    var anio = fechaHoy.getFullYear().toString();
    var fechaFormato = dia + '/' + mes + '/' + anio;

    // ── Copiar la plantilla al Drive ──────────────────────────────────
    var templateFile  = DriveApp.getFileById(CONFIG_VACACIONES.TEMPLATE_DOC_ID);
    var carpeta       = DriveApp.getFolderById(CONFIG_VACACIONES.CARPETA_RRHH_ID);
    var nombreArchivo = 'Vacaciones_' + nombre.replace(/ /g, '_') + '_' + dia + mes + anio;
    var copia         = templateFile.makeCopy(nombreArchivo, carpeta);

    // ── Abrir la copia y reemplazar marcadores ────────────────────────
    var doc  = DocumentApp.openById(copia.getId());
    var body = doc.getBody();

    // Información personal
    body.replaceText('{{NOMBRE}}', nombre);
    body.replaceText('{{CEDULA}}', cedula);
    body.replaceText('{{CARGO}}',  cargo);

    // Periodo
    body.replaceText('{{PERIODO_DESDE}}',  periodoDesde);
    body.replaceText('{{PERIODO_HASTA}}',  periodoHasta);
    body.replaceText('{{DIAS_DISFRUTAR}}', diasDisfrutar);

    // Actividades y reemplazo
    body.replaceText('{{ACT_PENDIENTES}}', actPendientes || '');
    body.replaceText('{{REEMPLAZO}}',      reemplazo     || '');
    body.replaceText('{{OBSERVACIONES}}',  observaciones || '');

    // Fecha de solicitud
    body.replaceText('{{FECHA_HOY}}', fechaFormato);

    // Firma del solicitante
    body.replaceText('{{NOMBRE_SOLICITANTE}}', nombre);
    body.replaceText('{{CEDULA_SOLICITANTE}}', cedula);

    doc.saveAndClose();

    // ── Exportar el Doc a PDF ─────────────────────────────────────────
    var pdfBlob = DriveApp.getFileById(copia.getId())
                          .getAs('application/pdf');
    pdfBlob.setName(nombreArchivo + '.pdf');

    // Guardar el PDF en la carpeta de RR.HH.
    carpeta.createFile(pdfBlob);

    // Opcional: eliminar la copia .docx si no la necesitas
    // copia.setTrashed(true);

    // ── Enviar correos ────────────────────────────────────────────────
    var asunto = CONFIG_VACACIONES.ASUNTO_EMAIL + nombre;
    var cuerpoCorreo = construirCuerpoCorreoV(
      nombre, cedula, cargo, periodoDesde, periodoHasta, diasDisfrutar
    );

    // Correo al solicitante
    if (correoEmp && correoEmp !== '') {
      GmailApp.sendEmail(correoEmp, asunto, cuerpoCorreo, {
        attachments: [pdfBlob],
        name: 'Talento Humano — Collective Mining'
      });
    }

    // Correo a Talento Humano
    GmailApp.sendEmail(CONFIG_VACACIONES.EMAIL_RRHH, asunto, cuerpoCorreo, {
      attachments: [pdfBlob],
      name: 'Sistema de Formularios — Collective Mining'
    });

    Logger.log('✅ Solicitud de vacaciones procesada: ' + nombre);

  } catch (err) {
    Logger.log('❌ Error en onSubmitVacaciones: ' + err.toString());
    GmailApp.sendEmail(
      CONFIG_VACACIONES.EMAIL_RRHH,
      '⚠️ Error al procesar solicitud de vacaciones',
      'Se produjo un error al intentar procesar una solicitud de vacaciones.\n\n'
        + 'Detalle del error:\n' + err.toString()
        + '\n\nRevisa el registro de Apps Script para más detalles.'
    );
  }
}


// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

/**
 * Extrae el valor de un campo de forma segura.
 * Usa nombre distinto (obtenerValorV) para evitar conflicto si ambos
 * scripts están en el mismo proyecto.
 */
function obtenerValorV(respuestas, campo) {
  if (respuestas[campo] && respuestas[campo][0]) {
    return respuestas[campo][0].toString().trim();
  }
  return '';
}

/**
 * Construye el cuerpo del correo para vacaciones.
 */
function construirCuerpoCorreoV(nombre, cedula, cargo, desde, hasta, dias) {
  return 'Estimado/a equipo de Talento Humano,\n\n'
    + 'Se ha recibido y procesado una nueva solicitud de VACACIONES.\n\n'
    + 'DATOS DE LA SOLICITUD:\n'
    + '────────────────────────────\n'
    + '  Nombre:           ' + nombre + '\n'
    + '  Cédula:           ' + cedula + '\n'
    + '  Cargo:            ' + cargo  + '\n'
    + '  Período Desde:    ' + desde  + '\n'
    + '  Período Hasta:    ' + hasta  + '\n'
    + '  Días a disfrutar: ' + dias   + '\n'
    + '────────────────────────────\n\n'
    + 'El formulario PDF diligenciado se adjunta a este correo.\n'
    + 'Una vez revisado, por favor importe el archivo por la pestaña '
    + '"Importar archivos" del sistema.\n\n'
    + '─────────────────────────────────────────────────────\n'
    + 'Mensaje automático — Sistema de Formularios Collective Mining\n'
    + 'No responder a este correo.\n';
}


// ============================================================
// MARCADORES QUE DEBE CONTENER EL GOOGLE DOC PLANTILLA
// ============================================================
// Copia y pega cada uno en el lugar correspondiente del Doc:
//
//   INFORMACIÓN PERSONAL
//     {{NOMBRE}}          {{CEDULA}}
//     {{CARGO}}
//
//   PERIODO DE VACACIONES
//     Desde: {{PERIODO_DESDE}}    Hasta: {{PERIODO_HASTA}}
//     Días a disfrutar: {{DIAS_DISFRUTAR}}
//
//   ACTIVIDADES Y REEMPLAZO
//     Actividades pendientes: {{ACT_PENDIENTES}}
//     Persona de reemplazo:   {{REEMPLAZO}}
//
//   OBSERVACIONES
//     {{OBSERVACIONES}}
//
//   FECHA Y FIRMA
//     Fecha de solicitud: {{FECHA_HOY}}
//     Solicitante: {{NOMBRE_SOLICITANTE}} / {{CEDULA_SOLICITANTE}}
//
// ============================================================
