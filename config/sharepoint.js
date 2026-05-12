// ============================================================================
//  config/sharepoint.js — MineDax
//  Sube PDFs de solicitudes a una carpeta de SharePoint via Microsoft Graph API.
//
//  Variables de entorno requeridas (.env):
//    SP_TENANT_ID      → ID del directorio de Azure AD
//    SP_CLIENT_ID      → ID de la app registrada en Azure
//    SP_CLIENT_SECRET  → Secreto de cliente generado en Azure
//    SP_DRIVE_ID       → ID del Drive de SharePoint donde se guarda
//    SP_FOLDER_PATH    → Ruta de carpeta dentro del Drive (ej: Solicitudes_TH/Permisos)
//
//  Si alguna variable SP_* falta en .env, la subida se omite silenciosamente
//  y el flujo continúa (correos se siguen enviando con normalidad).
//
//  Uso en solicitudesController.js:
//    const { subirPDFaSharePoint } = require('../config/sharepoint');
//    if (pdfOk) await subirPDFaSharePoint(pdfSalida, `Permiso_${nombre}_${ts}.pdf`);
// ============================================================================

const https    = require('https');
const qs       = require('querystring');
const fs       = require('fs');

// ─── Verificar configuración disponible ──────────────────────────────────────

function _spConfigurado() {
  return !!(
    process.env.SP_TENANT_ID &&
    process.env.SP_CLIENT_ID &&
    process.env.SP_CLIENT_SECRET &&
    process.env.SP_DRIVE_ID
  );
}

// ─── Obtener token de Azure AD (Client Credentials Flow) ─────────────────────

function _getToken() {
  return new Promise((resolve, reject) => {
    const body = qs.stringify({
      grant_type:    'client_credentials',
      client_id:     process.env.SP_CLIENT_ID,
      client_secret: process.env.SP_CLIENT_SECRET,
      scope:         'https://graph.microsoft.com/.default',
    });

    const options = {
      hostname: 'login.microsoftonline.com',
      path:     `/${process.env.SP_TENANT_ID}/oauth2/v2.0/token`,
      method:   'POST',
      headers: {
        'Content-Type':   'application/x-www-form-urlencoded',
        'Content-Length': Buffer.byteLength(body),
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        try {
          const parsed = JSON.parse(data);
          if (parsed.access_token) {
            resolve(parsed.access_token);
          } else {
            reject(new Error(`[SP] Token denegado: ${data.slice(0, 300)}`));
          }
        } catch (e) {
          reject(new Error(`[SP] Error parseando token: ${data.slice(0, 200)}`));
        }
      });
    });

    req.on('error', reject);
    req.write(body);
    req.end();
  });
}

// ─── Subir archivo a SharePoint via Graph API ────────────────────────────────

function _uploadFile(token, driveId, folderPath, fileName, fileBuffer) {
  // Graph API: PUT /drives/{id}/items/root:/{path}/{file}:/content
  const uploadPath = `/v1.0/drives/${driveId}/items/root:/${folderPath}/${fileName}:/content`;

  return new Promise((resolve, reject) => {
    const options = {
      hostname: 'graph.microsoft.com',
      path:     uploadPath,
      method:   'PUT',
      headers: {
        'Authorization': 'Bearer ' + token,
        'Content-Type':  'application/pdf',
        'Content-Length': fileBuffer.length,
      },
    };

    const req = https.request(options, (res) => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode === 200 || res.statusCode === 201) {
          try {
            const result = JSON.parse(data);
            resolve({
              success: true,
              name:    result.name,
              url:     result.webUrl,
              id:      result.id,
            });
          } catch (e) {
            // Respuesta 200/201 pero no JSON — subida OK igual
            resolve({ success: true, name: fileName });
          }
        } else {
          console.error(`[SP] Error HTTP ${res.statusCode}: ${data.slice(0, 300)}`);
          // Resolvemos (no rechazamos) para no interrumpir el flujo principal
          resolve({ success: false, error: `HTTP ${res.statusCode}` });
        }
      });
    });

    req.on('error', (err) => {
      console.error('[SP] Error de red:', err.message);
      resolve({ success: false, error: err.message });
    });

    req.write(fileBuffer);
    req.end();
  });
}

// ─── API pública ─────────────────────────────────────────────────────────────

/**
 * Sube un PDF local a la carpeta de SharePoint configurada en .env.
 *
 * @param {string} rutaLocal  Ruta absoluta del archivo en el servidor (p.ej. temp/permiso_xxx.pdf)
 * @param {string} nombreArchivo  Nombre con el que se guardará en SharePoint
 * @returns {Promise<{ success, name?, url?, skipped?, error? }>}
 */
async function subirPDFaSharePoint(rutaLocal, nombreArchivo) {
  // Si no hay configuración SP en .env, omitir sin error
  if (!_spConfigurado()) {
    console.log('[SP] Configuración incompleta — subida a SharePoint omitida.');
    return { skipped: true };
  }

  const driveId    = process.env.SP_DRIVE_ID;
  const folderPath = (process.env.SP_FOLDER_PATH || 'Solicitudes_TH').replace(/^\/+|\/+$/g, '');

  try {
    const token      = await _getToken();
    const fileBuffer = fs.readFileSync(rutaLocal);
    const resultado  = await _uploadFile(token, driveId, folderPath, nombreArchivo, fileBuffer);

    if (resultado.success) {
      console.log(`[SP] ✅ PDF guardado en SharePoint: ${resultado.name} → ${resultado.url || '(sin URL)'}`);
    } else {
      console.warn(`[SP] ⚠️  No se pudo subir a SharePoint: ${resultado.error}. El flujo continúa.`);
    }

    return resultado;

  } catch (err) {
    // Error no bloqueante: loguear y devolver fallo sin lanzar excepción
    console.error('[SP] ❌ Error inesperado al subir PDF:', err.message);
    return { success: false, error: err.message };
  }
}

module.exports = { subirPDFaSharePoint };
