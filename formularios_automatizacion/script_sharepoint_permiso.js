// =====================================================================
// SCRIPT: Solicitud de Permiso — Collective Mining
// Código Formulario: CM-TH-FR-003  |  Versión: 2.0 — SharePoint
// =====================================================================
// DIFERENCIA VS VERSIÓN DRIVE:
//   En lugar de usar DriveApp para guardar el PDF, este script llama
//   a la API REST de SharePoint mediante UrlFetchApp + OAuth2 (Azure AD).
//   El formulario (Google Forms) y el envío de correo (Gmail) no cambian.
//
// PRERREQUISITO OBLIGATORIO — REGISTRO DE APLICACIÓN EN AZURE AD:
//   1. Portal Azure → Azure Active Directory → Registros de aplicaciones
//   2. Nueva Registro → nombre: "Apps_Script_TH_Collective"
//   3. Permisos API → Microsoft Graph → Sites.ReadWrite.All (o SharePoint)
//   4. Crear un "Secreto de cliente" y copiar el valor
//   5. Copiar el ID de aplicación (Client ID) y el ID de directorio (Tenant ID)
//   → Sin esto el script NO puede autenticarse en SharePoint.
// =====================================================================


// ============================================================
// CONFIGURACIÓN — EDITAR ANTES DE USAR
// ============================================================
var CONFIG_SP_PERMISO = {

  // ── Azure AD (necesario para autenticarse en SharePoint) ──────────
  TENANT_ID:     'REEMPLAZAR — ID del directorio de Azure AD',
  CLIENT_ID:     'REEMPLAZAR — ID de la aplicación registrada en Azure',
  CLIENT_SECRET: 'REEMPLAZAR — Secreto de cliente generado en Azure',

  // ── SharePoint ────────────────────────────────────────────────────
  // URL base del sitio SharePoint (sin barra al final)
  SP_SITE_URL:   'https://collectivemining.sharepoint.com/sites/TalentoHumano',

  // Ruta relativa de la carpeta donde se guardarán los PDFs
  // Ejemplo: si la carpeta está en "Documentos/Solicitudes_TH"
  SP_FOLDER_PATH: '/sites/TalentoHumano/Documentos compartidos/Solicitudes_TH',

  // ── Google Doc Plantilla (igual que la versión Drive) ────────────
  TEMPLATE_DOC_ID: 'REEMPLAZAR — ID del Google Doc plantilla',

  // ── Correo RR.HH. ─────────────────────────────────────────────────
  EMAIL_RRHH:   'talentohumano@collectivemining.com',
  ASUNTO_EMAIL: 'Nueva Solicitud de Permiso — '
};
// ============================================================


// ============================================================
// FUNCIÓN PRINCIPAL
// ============================================================
function onSubmitPermisoSP(e) {
  try {
    var respuestas = e.namedValues;

    // ── Leer campos del formulario ────────────────────────────────────
    var nombre        = obtenerValorSP(respuestas, 'Nombre completo');
    var cedula        = obtenerValorSP(respuestas, 'Cédula de ciudadanía');
    var cargo         = obtenerValorSP(respuestas, 'Cargo');
    var area          = obtenerValorSP(respuestas, 'Área');
    var correoEmp     = obtenerValorSP(respuestas, 'Correo electrónico');
    var fechaPermDe   = obtenerValorSP(respuestas, 'Fecha de permiso — Desde');
    var fechaPermHasta= obtenerValorSP(respuestas, 'Fecha de permiso — Hasta');
    var horasDe       = obtenerValorSP(respuestas, 'Hora de inicio');
    var horasHasta    = obtenerValorSP(respuestas, 'Hora de fin');
    var totalDias     = obtenerValorSP(respuestas, 'Total de días');
    var motivo        = obtenerValorSP(respuestas, 'Motivo del permiso');
    var otraCausal    = obtenerValorSP(respuestas, '¿Cuál es la otra causa?');
    var explicacion   = obtenerValorSP(respuestas, 'Explicación del motivo');
    var tipoPerm      = obtenerValorSP(respuestas, 'Tipo de permiso');
    var observaciones = obtenerValorSP(respuestas, 'Observaciones');

    var fechaHoy = new Date();
    var dia  = fechaHoy.getDate().toString().padStart(2, '0');
    var mes  = (fechaHoy.getMonth() + 1).toString().padStart(2, '0');
    var anio = fechaHoy.getFullYear().toString();

    // Marcas de selección
    var motivoEstudio       = (motivo === 'Estudio')             ? '[X]' : '[  ]';
    var motivoCalamidad     = (motivo === 'Calamidad Doméstica') ? '[X]' : '[  ]';
    var motivoMedico        = (motivo === 'Médico')              ? '[X]' : '[  ]';
    var motivoVacaciones    = (motivo === 'Vacaciones')          ? '[X]' : '[  ]';
    var motivoCompensatorio = (motivo === 'Compensatorio')       ? '[X]' : '[  ]';
    var motivoFuerzaMayor   = (motivo === 'Fuerza Mayor')        ? '[X]' : '[  ]';
    var motivoOtra          = (motivo === 'Otra Causa')          ? '[X]' : '[  ]';
    var tipoRemunerado      = (tipoPerm === 'Remunerado')        ? '[X]' : '[  ]';
    var tipoNoRemunerado    = (tipoPerm === 'No Remunerado')     ? '[X]' : '[  ]';

    // ── Copiar plantilla Google Doc y rellenar ────────────────────────
    // NOTA: La plantilla sigue siendo un Google Doc. El PDF resultante
    // es el que se sube a SharePoint. Esta es la forma más simple de
    // generar PDFs sin librerías de pago.
    var templateFile  = DriveApp.getFileById(CONFIG_SP_PERMISO.TEMPLATE_DOC_ID);
    var nombreArchivo = 'Permiso_' + nombre.replace(/ /g, '_') + '_' + dia + mes + anio;

    // Copia temporal en Drive (solo para generar el PDF; se borra al final)
    var copiaTemp = templateFile.makeCopy(nombreArchivo + '_TEMP');
    var doc  = DocumentApp.openById(copiaTemp.getId());
    var body = doc.getBody();

    body.replaceText('{{DIA}}',  dia);
    body.replaceText('{{MES}}',  mes);
    body.replaceText('{{ANIO}}', anio);
    body.replaceText('{{NOMBRE}}', nombre);
    body.replaceText('{{CEDULA}}', cedula);
    body.replaceText('{{CARGO}}',  cargo);
    body.replaceText('{{AREA}}',   area);
    body.replaceText('{{FECHA_PERM_DE}}',    fechaPermDe);
    body.replaceText('{{FECHA_PERM_HASTA}}', fechaPermHasta);
    body.replaceText('{{HORAS_DE}}',         horasDe);
    body.replaceText('{{HORAS_HASTA}}',      horasHasta);
    body.replaceText('{{TOTAL_DIAS}}',       totalDias);
    body.replaceText('{{MOTIVO_ESTUDIO}}',       motivoEstudio);
    body.replaceText('{{MOTIVO_CALAMIDAD}}',     motivoCalamidad);
    body.replaceText('{{MOTIVO_MEDICO}}',        motivoMedico);
    body.replaceText('{{MOTIVO_VACACIONES}}',    motivoVacaciones);
    body.replaceText('{{MOTIVO_COMPENSATORIO}}', motivoCompensatorio);
    body.replaceText('{{MOTIVO_FUERZA_MAYOR}}',  motivoFuerzaMayor);
    body.replaceText('{{MOTIVO_OTRA}}',          motivoOtra);
    body.replaceText('{{OTRA_CAUSA_CUAL}}',      otraCausal   || '');
    body.replaceText('{{EXPLICACION}}',          explicacion  || '');
    body.replaceText('{{TIPO_REMUNERADO}}',      tipoRemunerado);
    body.replaceText('{{TIPO_NO_REMUNERADO}}',   tipoNoRemunerado);
    body.replaceText('{{OBSERVACIONES}}',        observaciones || '');
    body.replaceText('{{NOMBRE_SOLICITANTE}}',   nombre);
    body.replaceText('{{CEDULA_SOLICITANTE}}',   cedula);
    doc.saveAndClose();

    // ── Exportar a PDF ────────────────────────────────────────────────
    var pdfBlob = DriveApp.getFileById(copiaTemp.getId())
                          .getAs('application/pdf');
    pdfBlob.setName(nombreArchivo + '.pdf');

    // Eliminar la copia temporal del Doc (ya tenemos el PDF en memoria)
    copiaTemp.setTrashed(true);

    // ── Obtener token OAuth2 de Azure AD ──────────────────────────────
    var token = obtenerTokenAzure(
      CONFIG_SP_PERMISO.TENANT_ID,
      CONFIG_SP_PERMISO.CLIENT_ID,
      CONFIG_SP_PERMISO.CLIENT_SECRET,
      CONFIG_SP_PERMISO.SP_SITE_URL
    );

    // ── Subir PDF a SharePoint ────────────────────────────────────────
    subirArchivoSharePoint(
      token,
      CONFIG_SP_PERMISO.SP_SITE_URL,
      CONFIG_SP_PERMISO.SP_FOLDER_PATH,
      nombreArchivo + '.pdf',
      pdfBlob
    );

    // ── Enviar correos ────────────────────────────────────────────────
    var asunto       = CONFIG_SP_PERMISO.ASUNTO_EMAIL + nombre;
    var cuerpoCorreo = construirCuerpoSP('permiso', nombre, cedula, cargo,
                                         fechaPermDe, fechaPermHasta, motivo);

    if (correoEmp && correoEmp !== '') {
      GmailApp.sendEmail(correoEmp, asunto, cuerpoCorreo, {
        attachments: [pdfBlob],
        name: 'Talento Humano — Collective Mining'
      });
    }
    GmailApp.sendEmail(CONFIG_SP_PERMISO.EMAIL_RRHH, asunto, cuerpoCorreo, {
      attachments: [pdfBlob],
      name: 'Sistema de Formularios — Collective Mining'
    });

    Logger.log('✅ Permiso procesado y subido a SharePoint: ' + nombreArchivo);

  } catch (err) {
    Logger.log('❌ Error en onSubmitPermisoSP: ' + err.toString());
    GmailApp.sendEmail(
      CONFIG_SP_PERMISO.EMAIL_RRHH,
      '⚠️ Error al procesar solicitud de permiso (SharePoint)',
      'Error:\n\n' + err.toString()
    );
  }
}


// ============================================================
// CAPA DE SHAREPOINT — AUTENTICACIÓN Y SUBIDA DE ARCHIVOS
// ============================================================

/**
 * Obtiene un token de acceso de Azure AD usando el flujo
 * "Client Credentials" (sin interacción del usuario).
 *
 * @param {string} tenantId     - ID del directorio de Azure AD
 * @param {string} clientId     - ID de la aplicación registrada
 * @param {string} clientSecret - Secreto de cliente
 * @param {string} siteUrl      - URL del sitio SharePoint (para el scope)
 * @returns {string} Token de acceso Bearer
 */
function obtenerTokenAzure(tenantId, clientId, clientSecret, siteUrl) {
  var tokenEndpoint = 'https://login.microsoftonline.com/' + tenantId + '/oauth2/v2.0/token';

  // El scope debe apuntar al dominio raíz de SharePoint, no al sitio específico
  var dominioSP = siteUrl.match(/https:\/\/[^\/]+/)[0];
  var scope = dominioSP + '/.default';

  var payload = 'grant_type=client_credentials'
    + '&client_id='     + encodeURIComponent(clientId)
    + '&client_secret=' + encodeURIComponent(clientSecret)
    + '&scope='         + encodeURIComponent(scope);

  var respuesta = UrlFetchApp.fetch(tokenEndpoint, {
    method: 'post',
    contentType: 'application/x-www-form-urlencoded',
    payload: payload,
    muteHttpExceptions: true
  });

  var datos = JSON.parse(respuesta.getContentText());

  if (!datos.access_token) {
    throw new Error('No se pudo obtener token de Azure AD. Respuesta: '
      + respuesta.getContentText());
  }

  return datos.access_token;
}

/**
 * Sube un archivo (Blob) a una carpeta de SharePoint usando la REST API.
 *
 * @param {string} token      - Token Bearer de Azure AD
 * @param {string} siteUrl    - URL base del sitio SharePoint
 * @param {string} folderPath - Ruta relativa del servidor (server-relative path)
 * @param {string} fileName   - Nombre del archivo a crear
 * @param {Blob}   fileBlob   - Contenido del archivo
 */
function subirArchivoSharePoint(token, siteUrl, folderPath, fileName, fileBlob) {
  // Codifica el nombre del archivo y la ruta para la URL
  var fileNameEncoded   = encodeURIComponent(fileName);
  var folderPathEncoded = encodeURIComponent("'" + folderPath + "'");

  var uploadUrl = siteUrl
    + "/_api/web/GetFolderByServerRelativePath(decodedurl=" + folderPathEncoded + ")"
    + "/Files/Add(url='" + fileNameEncoded + "',overwrite=true)";

  var opciones = {
    method: 'post',
    headers: {
      'Authorization': 'Bearer ' + token,
      'Accept':        'application/json;odata=verbose',
      'Content-Type':  'application/octet-stream'
    },
    payload:            fileBlob.getBytes(),
    muteHttpExceptions: true
  };

  var respuesta = UrlFetchApp.fetch(uploadUrl, opciones);
  var codigo    = respuesta.getResponseCode();

  if (codigo !== 200 && codigo !== 201) {
    throw new Error('Error al subir a SharePoint. HTTP ' + codigo
      + '. Respuesta: ' + respuesta.getContentText());
  }

  Logger.log('📁 Archivo subido a SharePoint: ' + fileName + ' (HTTP ' + codigo + ')');
}


// ============================================================
// FUNCIONES AUXILIARES
// ============================================================

function obtenerValorSP(respuestas, campo) {
  if (respuestas[campo] && respuestas[campo][0]) {
    return respuestas[campo][0].toString().trim();
  }
  return '';
}

function construirCuerpoSP(tipo, nombre, cedula, cargo, desde, hasta, motivo) {
  return 'Estimado/a equipo de Talento Humano,\n\n'
    + 'Se ha procesado una nueva solicitud de ' + tipo + '.\n'
    + 'El PDF ha sido guardado automáticamente en SharePoint.\n\n'
    + 'DATOS DE LA SOLICITUD:\n'
    + '────────────────────────────\n'
    + '  Nombre:  ' + nombre + '\n'
    + '  Cédula:  ' + cedula + '\n'
    + '  Cargo:   ' + cargo  + '\n'
    + '  Desde:   ' + desde  + '\n'
    + '  Hasta:   ' + hasta  + '\n'
    + '  Motivo:  ' + motivo + '\n'
    + '────────────────────────────\n\n'
    + 'El PDF también va adjunto a este correo para importarlo al sistema.\n\n'
    + '─────────────────────────────────────────────────────\n'
    + 'Mensaje automático — Sistema de Formularios Collective Mining\n';
}


// ============================================================
// FUNCIÓN DE PRUEBA DE CONEXIÓN CON SHAREPOINT
// ============================================================
// Ejecuta esto manualmente una vez para verificar que la
// autenticación y la conexión con SharePoint funcionan
// ANTES de activar el trigger del formulario.
//
function probarConexionSharePoint() {
  try {
    var token = obtenerTokenAzure(
      CONFIG_SP_PERMISO.TENANT_ID,
      CONFIG_SP_PERMISO.CLIENT_ID,
      CONFIG_SP_PERMISO.CLIENT_SECRET,
      CONFIG_SP_PERMISO.SP_SITE_URL
    );
    Logger.log('✅ Token obtenido correctamente.');
    Logger.log('   Primeros 40 chars: ' + token.substring(0, 40) + '...');

    // Prueba de lectura: listar archivos de la carpeta
    var folderEncoded = encodeURIComponent("'" + CONFIG_SP_PERMISO.SP_FOLDER_PATH + "'");
    var url = CONFIG_SP_PERMISO.SP_SITE_URL
            + '/_api/web/GetFolderByServerRelativePath(decodedurl='
            + folderEncoded + ')/Files?$select=Name';

    var resp = UrlFetchApp.fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + token,
        'Accept': 'application/json;odata=verbose'
      },
      muteHttpExceptions: true
    });

    Logger.log('✅ Conexión a SharePoint exitosa. HTTP ' + resp.getResponseCode());
    Logger.log('   Respuesta parcial: ' + resp.getContentText().substring(0, 200));

  } catch (err) {
    Logger.log('❌ Error de conexión: ' + err.toString());
  }
}
