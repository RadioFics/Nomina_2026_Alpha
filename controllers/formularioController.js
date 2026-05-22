// ============================================================================
//  controllers/formularioController.js
//  Maneja formularios públicos de Permiso y Vacaciones.
//
//  Flujo por envío:
//    1. Recibe datos del formulario (POST JSON)
//    2. Guarda registro en dbo.FORM_SOLICITUDES
//    3. Genera PDF en memoria con pdfkit
//    4. Devuelve el PDF al navegador para descarga inmediata
//    5. Envía copia por email a RR.HH. (MAIL_RRHH en .env)
// ============================================================================

const PDFDocument  = require('pdfkit');
const { executeQuery } = require('../config/database');
const { enviarEmail }  = require('../config/mailer');
const sql = require('mssql');

// ─── Colores corporativos ────────────────────────────────────────────────────
const GOLD   = '#C9A84C';
const DARK   = '#0E0E0E';
const GRAY   = '#8A857A';
const WHITE  = '#F0EDE8';

// ─── Bootstrap DB ────────────────────────────────────────────────────────────
let bootstrapped = false;
async function ensureDbObjects(force = false) {
  if (bootstrapped && !force) return;
  try {
    await executeQuery(`
      IF OBJECT_ID('dbo.FORM_SOLICITUDES', 'U') IS NULL
      BEGIN
        CREATE TABLE dbo.FORM_SOLICITUDES (
          ID_SOLICITUD  INT IDENTITY(1,1) NOT NULL,
          TIP_SOLICITUD NVARCHAR(20)  NOT NULL,
          NOM_SOLICIT   NVARCHAR(150) NOT NULL,
          NRO_IDENT     NVARCHAR(30)  NOT NULL,
          CARGO         NVARCHAR(100) NULL,
          AREA          NVARCHAR(100) NULL,
          CORREO_EMPL   NVARCHAR(150) NULL,
          FEC_INI       DATE          NOT NULL,
          FEC_FIN       DATE          NULL,
          HORA_INI      NVARCHAR(5)   NULL,
          HORA_FIN      NVARCHAR(5)   NULL,
          DIAS_SOLIC    INT           NULL,
          HORAS_SOLIC   DECIMAL(5,2)  NULL,
          TIP_PERMISO   NVARCHAR(50)  NULL,
          ANO_VACACION  SMALLINT      NULL,
          MOTIVO        NVARCHAR(500) NULL,
          JEFE_INMED    NVARCHAR(150) NULL,
          ESTADO        NVARCHAR(20)  NOT NULL CONSTRAINT DF_FORM_ESTADO   DEFAULT (N'PENDIENTE'),
          FEC_REGI      DATETIME2     NOT NULL CONSTRAINT DF_FORM_FEC_REGI DEFAULT (SYSDATETIME()),
          IP_ORIGEN     NVARCHAR(50)  NULL,
          CONSTRAINT PK_FORM_SOLICITUDES PRIMARY KEY CLUSTERED (ID_SOLICITUD)
        );
      END
    `);
    bootstrapped = true;
    console.log('[Formularios] Tabla FORM_SOLICITUDES verificada.');
  } catch (err) {
    console.error('[Formularios] Error en ensureDbObjects:', err.message);
  }
}

// ─── Helpers de fecha ────────────────────────────────────────────────────────
function formatFecha(dateStr) {
  if (!dateStr) return '—';
  const [y, m, d] = dateStr.split('-');
  return `${d}/${m}/${y}`;
}

function fechaHoy() {
  return new Date().toLocaleDateString('es-CO', {
    day: '2-digit', month: 'long', year: 'numeric'
  });
}

// ─── Generador de PDF: PERMISO ───────────────────────────────────────────────
function generarPDFPermiso(datos, idSolicitud) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const buffers = [];
    doc.on('data',  chunk => buffers.push(chunk));
    doc.on('end',   ()    => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const pw = doc.page.width  - 100;  // ancho útil
    const ml = 50;                      // margen izquierdo

    // ── Encabezado ──────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 90).fill('#1A1A1A');

    doc.fontSize(20).fillColor(GOLD)
       .font('Helvetica-Bold')
       .text('COLLECTIVE MINING', ml, 22, { width: pw, align: 'center' });

    doc.fontSize(10).fillColor('#AAAAAA')
       .font('Helvetica')
       .text('Sistema de Gestión de Nómina', ml, 48, { width: pw, align: 'center' });

    doc.fontSize(13).fillColor(WHITE)
       .font('Helvetica-Bold')
       .text('SOLICITUD DE PERMISO', ml, 65, { width: pw, align: 'center' });

    // ── Número y fecha ───────────────────────────────────────────────────────
    doc.moveDown(0.5);
    doc.rect(ml, doc.y + 5, pw, 28).fill('#F5F0E8').stroke('#D4C078');
    doc.fillColor('#333333').fontSize(10).font('Helvetica-Bold')
       .text(`N° Solicitud: ${idSolicitud}`, ml + 10, doc.y + 10);
    doc.text(`Fecha de solicitud: ${fechaHoy()}`,
             ml, doc.y - 14, { width: pw - 20, align: 'right' });
    doc.moveDown(1.8);

    // ── Sección: Datos del empleado ──────────────────────────────────────────
    _seccionTitulo(doc, 'DATOS DEL EMPLEADO', ml, pw);
    _filaDatos(doc, 'Nombre completo',  datos.nombre,    ml, pw);
    _filaDatos(doc, 'N° de cédula',     datos.cedula,    ml, pw);
    _filaDatos(doc, 'Cargo',            datos.cargo || '—', ml, pw);
    _filaDatos(doc, 'Área / Depto.',    datos.area  || '—', ml, pw);

    // ── Sección: Detalle del permiso ─────────────────────────────────────────
    _seccionTitulo(doc, 'DETALLE DE LA SOLICITUD', ml, pw);
    _filaDatos(doc, 'Tipo de permiso',  datos.tipoPermiso || '—', ml, pw);
    _filaDatos(doc, 'Fecha',            formatFecha(datos.fechaInicio),  ml, pw);
    _filaDatos(doc, 'Hora inicio',      datos.horaInicio  || '—', ml, pw);
    _filaDatos(doc, 'Hora fin',         datos.horaFin     || '—', ml, pw);
    _filaDatos(doc, 'Total horas',      datos.totalHoras  ? `${datos.totalHoras} h` : '—', ml, pw);
    _filaDatos(doc, 'Jefe inmediato',   datos.jefeInmediato || '—', ml, pw);

    // ── Motivo ───────────────────────────────────────────────────────────────
    _seccionTitulo(doc, 'MOTIVO', ml, pw);
    doc.fillColor('#333333').fontSize(10).font('Helvetica')
       .text(datos.motivo || 'Sin descripción.', ml + 10, doc.y + 5, {
         width: pw - 20, lineGap: 3
       });
    doc.moveDown(1.5);

    // ── Firmas ───────────────────────────────────────────────────────────────
    _seccionFirmas(doc, datos.nombre, ml, pw);

    // ── Pie de página ────────────────────────────────────────────────────────
    _piePagina(doc, ml, pw);

    doc.end();
  });
}

// ─── Generador de PDF: VACACIONES ────────────────────────────────────────────
function generarPDFVacaciones(datos, idSolicitud) {
  return new Promise((resolve, reject) => {
    const doc = new PDFDocument({ size: 'A4', margin: 50 });
    const buffers = [];
    doc.on('data',  chunk => buffers.push(chunk));
    doc.on('end',   ()    => resolve(Buffer.concat(buffers)));
    doc.on('error', reject);

    const pw = doc.page.width - 100;
    const ml = 50;

    // ── Encabezado ──────────────────────────────────────────────────────────
    doc.rect(0, 0, doc.page.width, 90).fill('#1A1A1A');

    doc.fontSize(20).fillColor(GOLD)
       .font('Helvetica-Bold')
       .text('COLLECTIVE MINING', ml, 22, { width: pw, align: 'center' });

    doc.fontSize(10).fillColor('#AAAAAA')
       .font('Helvetica')
       .text('Sistema de Gestión de Nómina', ml, 48, { width: pw, align: 'center' });

    doc.fontSize(13).fillColor(WHITE)
       .font('Helvetica-Bold')
       .text('SOLICITUD DE VACACIONES', ml, 65, { width: pw, align: 'center' });

    // ── Número y fecha ───────────────────────────────────────────────────────
    doc.moveDown(0.5);
    doc.rect(ml, doc.y + 5, pw, 28).fill('#F5F0E8').stroke('#D4C078');
    doc.fillColor('#333333').fontSize(10).font('Helvetica-Bold')
       .text(`N° Solicitud: ${idSolicitud}`, ml + 10, doc.y + 10);
    doc.text(`Fecha de solicitud: ${fechaHoy()}`,
             ml, doc.y - 14, { width: pw - 20, align: 'right' });
    doc.moveDown(1.8);

    // ── Datos del empleado ───────────────────────────────────────────────────
    _seccionTitulo(doc, 'DATOS DEL EMPLEADO', ml, pw);
    _filaDatos(doc, 'Nombre completo', datos.nombre,     ml, pw);
    _filaDatos(doc, 'N° de cédula',    datos.cedula,     ml, pw);
    _filaDatos(doc, 'Cargo',           datos.cargo || '—', ml, pw);
    _filaDatos(doc, 'Área / Depto.',   datos.area  || '—', ml, pw);

    // ── Detalle de vacaciones ────────────────────────────────────────────────
    _seccionTitulo(doc, 'PERÍODO DE VACACIONES', ml, pw);
    _filaDatos(doc, 'Fecha de inicio',         formatFecha(datos.fechaInicio), ml, pw);
    _filaDatos(doc, 'Fecha de regreso',         formatFecha(datos.fechaFin),   ml, pw);
    _filaDatos(doc, 'Días hábiles solicitados', datos.diasSolicita ? `${datos.diasSolicita} días` : '—', ml, pw);
    _filaDatos(doc, 'Año al que corresponde',   datos.anoVacacion  ? String(datos.anoVacacion) : '—', ml, pw);
    _filaDatos(doc, 'Jefe inmediato',           datos.jefeInmediato || '—', ml, pw);

    // ── Observaciones ────────────────────────────────────────────────────────
    if (datos.motivo) {
      _seccionTitulo(doc, 'OBSERVACIONES', ml, pw);
      doc.fillColor('#333333').fontSize(10).font('Helvetica')
         .text(datos.motivo, ml + 10, doc.y + 5, { width: pw - 20, lineGap: 3 });
      doc.moveDown(1.5);
    }

    // ── Firmas ───────────────────────────────────────────────────────────────
    _seccionFirmas(doc, datos.nombre, ml, pw);
    _piePagina(doc, ml, pw);

    doc.end();
  });
}

// ─── Helpers de diseño PDF ───────────────────────────────────────────────────
function _seccionTitulo(doc, titulo, ml, pw) {
  doc.rect(ml, doc.y + 5, pw, 20).fill('#2C2C2C');
  doc.fillColor(GOLD).fontSize(9).font('Helvetica-Bold')
     .text(titulo, ml + 10, doc.y + 9);
  doc.moveDown(1.4);
}

function _filaDatos(doc, etiqueta, valor, ml, pw) {
  const y = doc.y;
  doc.fillColor(GRAY).fontSize(9).font('Helvetica-Bold')
     .text(etiqueta + ':', ml + 10, y, { width: pw * 0.38 });
  doc.fillColor('#222222').fontSize(9).font('Helvetica')
     .text(valor || '—', ml + 10 + pw * 0.38, y, { width: pw * 0.58 });
  doc.rect(ml, doc.y, pw, 0.5).fill('#E0DAD0');
  doc.moveDown(0.55);
}

function _seccionFirmas(doc, nombreEmpleado, ml, pw) {
  const y = doc.y + 20;
  const colW = pw / 3 - 10;

  doc.fontSize(9).fillColor(GRAY).font('Helvetica');

  // Firma empleado
  doc.rect(ml,                   y + 30, colW, 0.5).fill('#555');
  doc.text('Firma del Empleado',  ml,                   y + 35, { width: colW, align: 'center' });
  doc.text(nombreEmpleado || '—', ml,                   y + 47, { width: colW, align: 'center' });

  // Firma jefe
  doc.rect(ml + colW + 10,       y + 30, colW, 0.5).fill('#555');
  doc.text('Jefe Inmediato',      ml + colW + 10,       y + 35, { width: colW, align: 'center' });

  // Aprobado RR.HH.
  doc.rect(ml + (colW + 10) * 2, y + 30, colW, 0.5).fill('#555');
  doc.text('Aprobado por RR.HH.', ml + (colW + 10) * 2, y + 35, { width: colW, align: 'center' });

  doc.moveDown(5);
}

function _piePagina(doc, ml, pw) {
  doc.fontSize(8).fillColor('#AAAAAA').font('Helvetica')
     .text(
       `Documento generado automáticamente — Sistema de Nómina Collective Mining — ${fechaHoy()}`,
       ml, doc.page.height - 40, { width: pw, align: 'center' }
     );
}

// ─── Guardar en BD ────────────────────────────────────────────────────────────
async function guardarSolicitud(datos, tipo, ip) {
  const result = await executeQuery(`
    INSERT INTO dbo.FORM_SOLICITUDES
      (TIP_SOLICITUD, NOM_SOLICIT, NRO_IDENT, CARGO, AREA, CORREO_EMPL,
       FEC_INI, FEC_FIN, HORA_INI, HORA_FIN, DIAS_SOLIC, HORAS_SOLIC,
       TIP_PERMISO, ANO_VACACION, MOTIVO, JEFE_INMED, IP_ORIGEN)
    OUTPUT INSERTED.ID_SOLICITUD
    VALUES
      (@tip, @nom, @ident, @cargo, @area, @correo,
       @fecIni, @fecFin, @horaIni, @horaFin, @dias, @horas,
       @tipPerm, @anoVac, @motivo, @jefe, @ip)
  `, {
    tip:     tipo,
    nom:     datos.nombre,
    ident:   datos.cedula,
    cargo:   datos.cargo    || null,
    area:    datos.area     || null,
    correo:  datos.correoEmpleado || null,
    fecIni:  datos.fechaInicio,
    fecFin:  datos.fechaFin      || null,
    horaIni: datos.horaInicio    || null,
    horaFin: datos.horaFin       || null,
    dias:    datos.diasSolicita  ? parseInt(datos.diasSolicita)  : null,
    horas:   datos.totalHoras    ? parseFloat(datos.totalHoras)  : null,
    tipPerm: datos.tipoPermiso   || null,
    anoVac:  datos.anoVacacion   ? parseInt(datos.anoVacacion)   : null,
    motivo:  datos.motivo        || null,
    jefe:    datos.jefeInmediato || null,
    ip:      ip || null,
  });
  return result.recordset[0].ID_SOLICITUD;
}

// ─── Enviar email a RR.HH. ────────────────────────────────────────────────────
async function notificarRRHH(datos, pdfBuffer, tipo, idSolicitud) {
  const destinatario = process.env.MAIL_RRHH || process.env.MAIL_USER;
  if (!destinatario) return;

  const tipoLabel = tipo === 'PERMISO' ? 'Permiso' : 'Vacaciones';
  const fileName  = tipo === 'PERMISO'
    ? `Permiso_${datos.cedula}_${datos.fechaInicio}.pdf`
    : `Vacaciones_${datos.cedula}_${datos.fechaInicio}.pdf`;

  const mailOpts = {
    from:    `"Collective Mining Nómina" <${process.env.MAIL_USER}>`,
    to:      destinatario,
    cc:      datos.correoEmpleado || undefined,
    subject: `Nueva Solicitud de ${tipoLabel} #${idSolicitud} — ${datos.nombre}`,
    html: `
      <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;
                  background:#0E0E0E;padding:30px;color:#F0EDE8;
                  border-radius:8px;border:1px solid rgba(201,168,76,0.3);">
        <h2 style="color:#C9A84C;font-size:18px;margin-top:0;">
          Nueva Solicitud de ${tipoLabel}
        </h2>
        <table style="width:100%;border-collapse:collapse;font-size:13px;">
          <tr><td style="padding:6px 0;color:#8A857A;width:40%">N° Solicitud</td>
              <td style="color:#F0EDE8;font-weight:bold;">#${idSolicitud}</td></tr>
          <tr><td style="padding:6px 0;color:#8A857A;">Empleado</td>
              <td style="color:#F0EDE8;">${datos.nombre}</td></tr>
          <tr><td style="padding:6px 0;color:#8A857A;">Cédula</td>
              <td style="color:#F0EDE8;">${datos.cedula}</td></tr>
          <tr><td style="padding:6px 0;color:#8A857A;">Cargo</td>
              <td style="color:#F0EDE8;">${datos.cargo || '—'}</td></tr>
          <tr><td style="padding:6px 0;color:#8A857A;">Tipo</td>
              <td style="color:#C9A84C;">${tipo === 'PERMISO' ? (datos.tipoPermiso || 'Permiso') : 'Vacaciones'}</td></tr>
          <tr><td style="padding:6px 0;color:#8A857A;">Fecha inicio</td>
              <td style="color:#F0EDE8;">${formatFecha(datos.fechaInicio)}</td></tr>
          ${datos.fechaFin ? `<tr><td style="padding:6px 0;color:#8A857A;">Fecha fin</td>
              <td style="color:#F0EDE8;">${formatFecha(datos.fechaFin)}</td></tr>` : ''}
        </table>
        <p style="color:#8A857A;font-size:12px;margin-top:24px;border-top:1px solid rgba(201,168,76,0.2);padding-top:14px;">
          El PDF con la solicitud completa se adjunta a este correo.<br>
          © ${new Date().getFullYear()} Collective Mining — Sistema de Nómina
        </p>
      </div>
    `,
    attachments: [{
      filename: fileName,
      content:  pdfBuffer,
      contentType: 'application/pdf'
    }]
  };

  await enviarEmail(mailOpts);
}

// ─── Endpoint: POST /api/formularios/permiso ─────────────────────────────────
async function submitPermiso(req, res) {
  try {
    const datos = req.body;

    // Validación mínima
    if (!datos.nombre || !datos.cedula || !datos.fechaInicio) {
      return res.status(400).json({ error: 'Nombre, cédula y fecha de inicio son obligatorios.' });
    }

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // 1. Guardar en BD
    const idSolicitud = await guardarSolicitud(datos, 'PERMISO', ip);

    // 2. Generar PDF
    const pdfBuffer = await generarPDFPermiso(datos, idSolicitud);

    // 3. Notificar a RR.HH. (no bloqueante)
    notificarRRHH(datos, pdfBuffer, 'PERMISO', idSolicitud).catch(err =>
      console.error('[Formularios] Error enviando email permiso:', err.message)
    );

    // 4. Devolver PDF al cliente
    const fileName = `Permiso_${datos.cedula}_${datos.fechaInicio}.pdf`;
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'X-Solicitud-ID':      String(idSolicitud),
    });
    res.send(pdfBuffer);

  } catch (err) {
    console.error('[Formularios] Error en submitPermiso:', err.message);
    res.status(500).json({ error: 'Error al procesar la solicitud de permiso.', detalle: err.message });
  }
}

// ─── Endpoint: POST /api/formularios/vacaciones ──────────────────────────────
async function submitVacaciones(req, res) {
  try {
    const datos = req.body;

    if (!datos.nombre || !datos.cedula || !datos.fechaInicio) {
      return res.status(400).json({ error: 'Nombre, cédula y fecha de inicio son obligatorios.' });
    }

    const ip = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

    // 1. Guardar en BD
    const idSolicitud = await guardarSolicitud(datos, 'VACACION', ip);

    // 2. Generar PDF
    const pdfBuffer = await generarPDFVacaciones(datos, idSolicitud);

    // 3. Notificar a RR.HH.
    notificarRRHH(datos, pdfBuffer, 'VACACION', idSolicitud).catch(err =>
      console.error('[Formularios] Error enviando email vacaciones:', err.message)
    );

    // 4. Devolver PDF al cliente
    const fileName = `Vacaciones_${datos.cedula}_${datos.fechaInicio}.pdf`;
    res.set({
      'Content-Type':        'application/pdf',
      'Content-Disposition': `attachment; filename="${fileName}"`,
      'X-Solicitud-ID':      String(idSolicitud),
    });
    res.send(pdfBuffer);

  } catch (err) {
    console.error('[Formularios] Error en submitVacaciones:', err.message);
    res.status(500).json({ error: 'Error al procesar la solicitud de vacaciones.', detalle: err.message });
  }
}

module.exports = {
  ensureDbObjects,
  submitPermiso,
  submitVacaciones,
  // Exportadas para uso como respaldo desde solicitudesController.js
  generarPDFPermiso,
  generarPDFVacaciones,
};
