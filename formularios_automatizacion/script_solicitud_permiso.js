// =====================================================================
// SCRIPT: Solicitud de Permiso — Collective Mining
// Código Formulario: CM-TH-FR-003
// Versión Script: 1.0
// Descripción: Genera un PDF del formulario de permiso a partir de una
//              respuesta de Google Forms y lo envía por correo a
//              Talento Humano y al solicitante.
// =====================================================================
// INSTRUCCIONES RÁPIDAS:
//   1. Crea el Google Doc plantilla con los marcadores {{...}} indicados.
//   2. Crea el Google Form con los nombres de campo EXACTOS de este script.
//   3. Vincula el Form a un Google Sheet (Respuestas → Hoja de cálculo).
//   4. En el Sheet: Extensiones → Apps Script → pega este código.
//   5. Reemplaza los valores de CONFIG_PERMISO con tus IDs reales.
//   6. Configura el trigger: onSubmitPermiso → Al enviar formulario.
// =====================================================================


// ============================================================
// CONFIGURACIÓN — EDITAR ESTOS VALORES ANTES DE USAR
// ============================================================
var CONFIG_PERMISO = {
  // ID del Google Doc que usarás como plantilla
  // Lo encuentras en la URL: docs.google.com/document/d/<<<ESTE_ID>>>/edit
  TEMPLATE_DOC_ID: 'REEMPLAZAR_CON_ID_DEL_GOOGLE_DOC_PLANTILLA',

  // ID de la carpeta de Google Drive donde se guardarán los PDFs generados
  // Lo encuentras en la URL de la carpeta: drive.google.com/drive/folders/<<<ESTE_ID>>>
  CARPETA_RRHH_ID: 'REEMPLAZAR_CON_ID_DE_CARPETA_DRIVE',

  // Correo electrónico del equipo de Talento Humano
  EMAIL_RRHH: 'talentohumano@collectivemining.com',

  // Prefijo del asunto del correo electrónico
  ASUNTO_EMAIL: 'Nueva Solicitud de Permiso — '
};
// ============================================================


/**
 * Función principal. Se activa automáticamente cuando alguien
 * envía el Google Form vinculado.
 *
 * IMPORTANTE: El nombre de cada campo en e.namedValues debe coincidir
 * EXACTAMENTE con el título de la pregunta en el Google Form.
 */
function onSubmitPermiso(e) {
  try {
    var respuestas = e.namedValues;

    // ── Información Personal ──────────────────────────────────────────
    var nombre       = obtenerValor(respuestas, 'Nombre completo');
    var cedula       = obtenerValor(respuestas, 'Cédula de ciudadanía');
    var cargo        = obtenerValor(respuestas, 'Cargo');
    var area         = obtenerValor(respuestas, 'Área');
    var correoEmp    = obtenerValor(respuestas, 'Correo electrónico');

    // ── Fecha de solicitud (automática) ──────────────────────────────
    var fechaHoy = new Date();
    var dia  = fechaHoy.getDate().toString().padStart(2, '0');
    var mes  = (fechaHoy.getMonth() + 1).toString().padStart(2, '0');
    var anio = fechaHoy.getFullYear().toString();

    // ── Datos del Permiso ─────────────────────────────────────────────
    var fechaPermDe    = obtenerValor(respuestas, 'Fecha de permiso — Desde');
    var fechaPermHasta = obtenerValor(respuestas, 'Fecha de permiso — Hasta');
    var horasDe        = obtenerValor(respuestas, 'Hora de inicio');
    var horasHasta     = obtenerValor(respuestas, 'Hora de fin');
    var totalDias      = obtenerValor(respuestas, 'Total de días');

    // ── Motivo y Tipo ─────────────────────────────────────────────────
    var motivo        = obtenerValor(respuestas, 'Motivo del permiso');
    var otraCausal    = obtenerValor(respuestas, '¿Cuál es la otra causa?');
    var explicacion   = obtenerValor(respuestas, 'Explicación del motivo');
    var tipoPerm      = obtenerValor(respuestas, 'Tipo de permiso');
    var observaciones = obtenerValor(respuestas, 'Observaciones');

    // ── Generar marcas de selección ───────────────────────────────────
    // El Doc plantilla usa ☑ para seleccionado y ☐ para vacío
    var motivoEstudio       = (motivo === 'Estudio')             ? '[X]' : '[  ]';
    var motivoCalamidad     = (motivo === 'Calamidad Doméstica') ? '[X]' : '[  ]';
    var motivoMedico        = (motivo === 'Médico')              ? '[X]' : '[  ]';
    var motivoVacaciones    = (motivo === 'Vacaciones')          ? '[X]' : '[  ]';
    var motivoCompensatorio = (motivo === 'Compensatorio')       ? '[X]' : '[  ]';
    var motivoFuerzaMayor   = (motivo === 'Fuerza Mayor')        ? '[X]' : '[  ]';
    var motivoOtra          = (motivo === 'Otra Causa')          ? '[X]' : '[  ]';

    var tipoRemunerado      = (tipoPerm === 'Remunerado')        ? '[X]' : '[  ]';
    var tipoNoRemunerado    = (tipoPerm === 'No Remunerado')     ? '[X]' : '[  ]';

    // ── Copiar la plantilla al Drive ──────────────────────────────────
    var templateFile  = DriveApp.getFileById(CONFIG_PERMISO.TEMPLATE_DOC_ID);
    var carpeta       = DriveApp.getFolderById(CONFIG_PERMISO.CARPETA_RRHH_ID);
    var nombreArchivo = 'Permiso_' + nombre.replace(/ /g,'_') + '_' + dia + mes + anio;
    var copia         = templateFile.makeCopy(nombreArchivo, carpeta);

    // ── Abrir la copia y reemplazar marcadores ────────────────────────
    var doc  = DocumentApp.openById(copia.getId());
    var body = doc.getBody();

    // Fecha
    body.replaceText('{{DIA}}',  dia);
    body.replaceText('{{MES}}',  mes);
    body.replaceText('{{ANIO}}', anio);

    // Información personal
    body.replaceText('{{NOMBRE}}', nombre);
    body.replaceText('{{CEDULA}}', cedula);
    body.replaceText('{{CARGO}}',  cargo);
    body.replaceText('{{AREA}}',   area);

    // Datos del permiso
    body.replaceText('{{FECHA_PERM_DE}}',    fechaPermDe);
    body.replaceText('{{FECHA_PERM_HASTA}}', fechaPermHasta);
    body.replaceText('{{HORAS_DE}}',         horasDe);
    body.replaceText('{{HORAS_HASTA}}',      horasHasta);
    body.replaceText('{{TOTAL_DIAS}}',       totalDias);

    // Motivos (marcas de selección)
    body.replaceText('{{MOTIVO_ESTUDIO}}',       motivoEstudio);
    body.replaceText('{{MOTIVO_CALAMIDAD}}',     motivoCalamidad);
    body.replaceText('{{MOTIVO_MEDICO}}',        motivoMedico);
    body.replaceText('{{MOTIVO_VACACIONES}}',    motivoVacaciones);
    body.replaceText('{{MOTIVO_COMPENSATORIO}}', motivoCompensatorio);
    body.replaceText('{{MOTIVO_FUERZA_MAYOR}}',  motivoFuerzaMayor);
    body.replaceText('{{MOTIVO_OTRA}}',          motivoOtra);
    body.replaceText('{{OTRA_CAUSA_CUAL}}',      otraCausal   || '');
    body.replaceText('{{EXPLICACION}}',          explicacion  || '');

    // Tipo de permiso
    body.replaceText('{{TIPO_REMUNERADO}}',    tipoRemunerado);
    body.replaceText('{{TIPO_NO_REMUNERADO}}', tipoNoRemunerado);

    // Observaciones
    body.replaceText('{{OBSERVACIONES}}', observaciones || '');

    // Sección de firma del solicitante (llenada; jefe y RR.HH. firman en papel)
    body.replaceText('{{NOMBRE_SOLICITANTE}}', nombre);
    body.replaceText('{{CEDULA_SOLICITANTE}}', cedula);

    doc.saveAndClose();

    // ── Exportar el Doc a PDF ─────────────────────────────────────────
    var pdfBlob = DriveApp.getFileById(copia.getId())
                          .getAs('application/pdf');
    pdfBlob.setName(nombreArchivo + '.pdf');

    // Guardar el PDF en la carpeta de RR.HH.
    carpeta.createFile(pdfBlob);

    // Opcional: eliminar la copia .docx para no acumular archivos
    // copia.setTrashed(true);

    // ── Enviar correos ────────────────────────────────────────────────
    var asunto = CONFIG_PERMISO.ASUNTO_EMAIL + nombre;
    var cuerpoCorreo = construirCuerpoCorreo(
      'permiso', nombre, cedula, cargo, fechaPermDe, fechaPermHasta, motivo
    );

    // Correo al solicitante (si proporcionó su correo en el formulario)
    if (correoEmp && correoEmp !== '') {
      GmailApp.sendEmail(correoEmp, asunto, cuerpoCorreo, {
        attachments: [pdfBlob],
        name: 'Talento Humano — Collective Mining'
      });
    }

    // Correo a Talento Humano (siempre)
    GmailApp.sendEmail(CONFIG_PERMISO.EMAIL_RRHH, asunto, cuerpoCorreo, {
      attachments: [pdfBlob],
      name: 'Sistema de Formularios — Collective Mining'
    });

    Logger.log('✅ Solicitud de permiso procesada correctamente: ' + nombre);

  } catch (err) {
    // Registrar el error y notificar al admin
    Logger.log('❌ Error en onSubmitPermiso: ' + err.toString());
    GmailApp.sendEmail(
      CONFIG_PERMISO.EMAIL_RRHH,
      '⚠️ Error al procesar solicitud de permiso',
      'Se produjo un error al intentar procesar una solicitud de permiso.\n\n'
        + 'Detalle del error:\n' + err.toString()
        + '\n\nRevisa el registro de Apps Script para más detalles.'
    );
  }
}


// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

/**
 * Extrae el valor de un campo de respuesta de forma segura.
 * Devuelve cadena vacía si el campo no existe o está vacío.
 */
function obtenerValor(respuestas, campo) {
  if (respuestas[campo] && respuestas[campo][0]) {
    return respuestas[campo][0].toString().trim();
  }
  return '';
}

/**
 * Construye el cuerpo del correo electrónico.
 */
function construirCuerpoCorreo(tipo, nombre, cedula, cargo, desde, hasta, motivo) {
  return 'Estimado/a equipo de Talento Humano,\n\n'
    + 'Se ha recibido y procesado una nueva solicitud de ' + tipo + '.\n\n'
    + 'DATOS DE LA SOLICITUD:\n'
    + '────────────────────────────\n'
    + '  Nombre:  ' + nombre + '\n'
    + '  Cédula:  ' + cedula + '\n'
    + '  Cargo:   ' + cargo  + '\n'
    + '  Desde:   ' + desde  + '\n'
    + '  Hasta:   ' + hasta  + '\n'
    + '  Motivo:  ' + motivo + '\n'
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
//     {{DIA}}   {{MES}}   {{ANIO}}
//     {{NOMBRE}}          {{CEDULA}}
//     {{CARGO}}           {{AREA}}
//
//   DATOS DEL PERMISO
//     Fecha permiso:  De: {{FECHA_PERM_DE}}   Hasta: {{FECHA_PERM_HASTA}}
//     Horas:          De: {{HORAS_DE}}         Hasta: {{HORAS_HASTA}}
//     Total de Días:  {{TOTAL_DIAS}}
//
//   MOTIVOS (aparecen como [X] o [  ])
//     {{MOTIVO_ESTUDIO}}         Estudio
//     {{MOTIVO_CALAMIDAD}}       Calamidad Doméstica
//     {{MOTIVO_MEDICO}}          Médico
//     {{MOTIVO_VACACIONES}}      Vacaciones
//     {{MOTIVO_COMPENSATORIO}}   Compensatorio
//     {{MOTIVO_FUERZA_MAYOR}}    Fuerza Mayor
//     {{MOTIVO_OTRA}}            Otra Causa — ¿Cuál? {{OTRA_CAUSA_CUAL}}
//     Explicación: {{EXPLICACION}}
//
//   TIPO DE PERMISO
//     {{TIPO_REMUNERADO}} Remunerado     {{TIPO_NO_REMUNERADO}} No Remunerado
//
//   FIRMAS
//     Solicitante: {{NOMBRE_SOLICITANTE}} / {{CEDULA_SOLICITANTE}}
//
//   OBSERVACIONES
//     {{OBSERVACIONES}}
//
// ============================================================
