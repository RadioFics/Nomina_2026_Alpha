// ============================================================================
//  controllers/pdfPlantillaController.js
//  Generación de PDFs oficiales de Collective Mining usando las plantillas reales.
//
//  Port completo del script Python (rellenar_pdf.py) a Node.js con pdf-lib.
//  No depende de Python ni de ninguna extensión nativa — funciona en Azure
//  App Service directamente tras "npm install".
//
//  API pública:
//    generarPermisoOficial(datos)     → Promise<Buffer>
//    generarVacacionesOficial(datos)  → Promise<Buffer>
//
//  Coordenadas extraídas con pdfplumber del formulario oficial (612 × 792 pt).
//  Sistema de coordenadas pdf-lib = PDF estándar: origen abajo-izquierda, y↑.
//  Conversión desde pdfplumber (origen arriba, y↓):
//    pdf_lib_y = PAGE_H - pdfplumber_y_top + lift
// ============================================================================

'use strict';

const { PDFDocument, rgb, StandardFonts } = require('pdf-lib');
const fs   = require('fs');
const path = require('path');

const TEMPLATES_DIR = path.join(__dirname, '..', 'templates');
const PAGE_H        = 792; // US Letter, puntos

// ─── helpers ─────────────────────────────────────────────────────────────────

/** Convierte y pdfplumber (desde arriba) a y pdf-lib (desde abajo) */
function _y(yTop, lift = 4.0) {
  return PAGE_H - yTop + lift;
}

/** Trunca el texto para que quepa en maxWidth (estimación 0.55 × size por carácter) */
function _trunc(str, maxWidth, size) {
  if (!maxWidth || !str) return String(str || '');
  const maxChars = Math.floor(maxWidth / (size * 0.55));
  return String(str).slice(0, maxChars);
}

/** Parte un texto en líneas de ancho máximo en caracteres (equivalente a textwrap.wrap) */
function _wrap(text, maxChars) {
  if (!text) return [];
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';
  for (const word of words) {
    const candidate = line ? `${line} ${word}` : word;
    if (candidate.length > maxChars && line) {
      lines.push(line);
      line = word;
    } else {
      line = candidate;
    }
  }
  if (line) lines.push(line);
  return lines;
}

// ─── helpers para dibujar sobre un PDFPage ───────────────────────────────────

function _txt(page, font, x, yTop, valor, opts = {}) {
  const {
    size     = 9,
    lift     = 4.0,
    maxWidth = 0,
    color    = rgb(0, 0, 0),
  } = opts;
  if (!valor && valor !== 0) return;
  const txt = maxWidth ? _trunc(String(valor), maxWidth, size) : String(valor);
  if (!txt) return;
  page.drawText(txt, {
    x,
    y:    _y(yTop, lift),
    size,
    font,
    color,
  });
}

function _check(page, fontBold, x, top, h) {
  // Centro vertical del checkbox en coords pdfplumber:
  const centerY = top + h / 2;
  // reportlab: rl_y = (PAGE_H - centerY) - 4  →  pdf-lib: y = centerY + 4 desde abajo
  // verificación: PAGE_H - ((PAGE_H - centerY) - 4) = centerY + 4 ✓
  const y = PAGE_H - centerY - 4;
  page.drawText('X', {
    x:    x + 2.5,
    y,
    size: 10,
    font: fontBold,
    color: rgb(0, 0, 0),
  });
}

// ═════════════════════════════════════════════════════════════════════════════
//   PERMISO  —  FORMATO SOLICITUD DE PERMISO 6.pdf  (CM-TH-FR-003)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Rellena la plantilla oficial de Permiso con los datos del formulario.
 *
 * @param {object} datos — campos del formulario (ver solicitudesController)
 * @returns {Promise<Buffer>} — PDF como Buffer listo para enviar por correo
 */
async function generarPermisoOficial(datos) {
  const plantillaPath = path.join(TEMPLATES_DIR, 'FORMATO_SOLICITUD_PERMISO.pdf');
  if (!fs.existsSync(plantillaPath)) {
    throw new Error(`Plantilla no encontrada: ${plantillaPath}`);
  }

  const templateBytes = fs.readFileSync(plantillaPath);
  const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });

  const font     = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const fontBold = await pdfDoc.embedFont(StandardFonts.HelveticaBold);
  const page     = pdfDoc.getPages()[0];

  const t  = (x, yTop, val, size = 9, maxW = 0) => _txt(page, font, x, yTop, val, { size, maxWidth: maxW });
  const ck = (x, top, h)                         => _check(page, fontBold, x, top, h);

  // ── Información Personal ─────────────────────────────────────────────────
  t(95,  158.5, datos.nombre,    9, 280);
  t(418, 158.5, datos.cedula,    9, 138);
  t(95,  180.2, datos.cargo,     9, 280);
  t(418, 180.2, datos.area,      9, 138);

  // Fecha de emisión del documento
  t(215, 136.8, datos.fecha_dia,  9, 32);
  t(376, 136.8, datos.fecha_mes,  9, 32);
  t(520, 136.8, datos.fecha_anio, 9, 38);

  // ── Datos del Permiso ─────────────────────────────────────────────────────
  t(257, 223.5, datos.fecha_desde, 9, 112);
  t(418, 223.5, datos.fecha_hasta, 9, 95);
  t(257, 245.2, datos.hora_inicio, 9, 112);
  t(418, 245.2, datos.hora_fin,    9, 95);
  t(118, 267.0, String(datos.total_dias || ''), 9, 185);

  // ── Motivo del Permiso — checkboxes ───────────────────────────────────────
  const CHECKS = {
    'estudio':             [212.0, 302.4, 12.7],
    'calamidad domestica': [212.0, 315.7, 12.7],
    'medico':              [212.0, 328.4, 13.3],
    'vacaciones':          [212.0, 341.8, 13.3],
    'compensatorio':       [516.6, 302.4, 12.7],
    'fuerza mayor':        [516.6, 316.3, 12.1],
    'otra causa':          [516.6, 329.0, 12.7],
  };

  const motivoNorm = (datos.motivo || '').toLowerCase().trim();
  for (const [label, [cx, ct, ch]] of Object.entries(CHECKS)) {
    if (label.includes(motivoNorm) || motivoNorm.includes(label)) {
      ck(cx, ct, ch);
      break;
    }
  }

  t(418, 355.2, datos.cual,        9, 95);
  t(109, 381.8, datos.explicacion, 9, 450);

  // ── Tipo Permiso — checkboxes ─────────────────────────────────────────────
  const tipo = (datos.tipo_permiso || '').toLowerCase();
  if (!tipo.includes('no') && tipo.includes('remunerado')) {
    ck(131.3, 594.5, 12.7);  // Remunerado
  } else if (tipo.includes('no')) {
    ck(354.4, 593.2, 12.7);  // No Remunerado
  }

  // ── Observaciones (máx 3 líneas) ─────────────────────────────────────────
  const obs = datos.observaciones || '';
  if (obs) {
    const OBS_TOPS = [664.1, 690.8, 717.4];
    const lines    = _wrap(obs, 95);
    lines.slice(0, OBS_TOPS.length).forEach((linea, i) => {
      t(53, OBS_TOPS[i], linea, 9, 500);
    });
  }

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

// ═════════════════════════════════════════════════════════════════════════════
//   VACACIONES  —  FORMATO SOLICITUD DE VACACIONES.pdf  (CM-TH-SV-001)
// ═════════════════════════════════════════════════════════════════════════════

/**
 * Rellena la plantilla oficial de Vacaciones con los datos del formulario.
 *
 * @param {object} datos — campos del formulario (ver solicitudesController)
 * @returns {Promise<Buffer>} — PDF como Buffer listo para enviar por correo
 */
async function generarVacacionesOficial(datos) {
  const plantillaPath = path.join(TEMPLATES_DIR, 'FORMATO_SOLICITUD_VACACIONES.pdf');
  if (!fs.existsSync(plantillaPath)) {
    throw new Error(`Plantilla no encontrada: ${plantillaPath}`);
  }

  const templateBytes = fs.readFileSync(plantillaPath);
  const pdfDoc = await PDFDocument.load(templateBytes, { ignoreEncryption: true });

  const font = await pdfDoc.embedFont(StandardFonts.Helvetica);
  const page = pdfDoc.getPages()[0];

  const t = (x, yTop, val, size = 9, maxW = 0) => _txt(page, font, x, yTop, val, { size, maxWidth: maxW });

  // ── Información del empleado ──────────────────────────────────────────────
  t(251, 145, datos.nombre, 9, 290);
  t(251, 168, datos.cedula, 9, 290);
  t(251, 188, datos.cargo,  9, 290);

  // ── Período Solicitado ────────────────────────────────────────────────────
  function _parseFecha(s) {
    if (!s) return ['', '', ''];
    const str = String(s).trim();
    try {
      if (str.length === 10 && str[4] === '-') {
        const [y, m, d] = str.split('-');
        return [d, m, y.slice(2)];   // AA = últimos 2 dígitos del año
      }
      if (str.includes('/')) {
        const p = str.split('/');
        return [p[0], p[1], p[2].slice(-2)];
      }
    } catch (_) {}
    return [str, '', ''];
  }

  const [dd1, mm1, aa1] = _parseFecha(datos.fecha_inicio);
  const [dd2, mm2, aa2] = _parseFecha(datos.fecha_fin);

  t(265, 243, dd1, 8, 28);
  t(312, 243, mm1, 8, 30);
  t(365, 243, aa1, 8, 30);
  t(415, 243, dd2, 8, 28);
  t(467, 243, mm2, 8, 30);
  t(520, 243, aa2, 8, 30);

  // ── Días de vacaciones ────────────────────────────────────────────────────
  t(370, 285, String(datos.dias_vacaciones || ''), 11, 55);

  // ── Tabla Actividades / Reemplazo / Observaciones ─────────────────────────
  _wrap(datos.actividades    || '', 30).slice(0, 6).forEach((l, i) => t(78,  375 + i * 11, l, 8, 185));
  _wrap(datos.reemplazo      || '', 18).slice(0, 6).forEach((l, i) => t(277, 375 + i * 11, l, 8, 115));
  _wrap(datos.observaciones  || '', 21).slice(0, 6).forEach((l, i) => t(407, 375 + i * 11, l, 8, 138));

  const pdfBytes = await pdfDoc.save();
  return Buffer.from(pdfBytes);
}

module.exports = { generarPermisoOficial, generarVacacionesOficial };
