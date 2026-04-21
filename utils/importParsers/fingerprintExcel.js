// ============================================================================
//  utils/importParsers/fingerprintExcel.js
//  Algoritmo centralizado de identificación de tipo de documento Excel.
//
//  Problema que resuelve:
//    Varios formatos de Excel comparten hojas con el mismo nombre ("Hoja1",
//    "COLLECTIVE", etc.) y encabezados parcialmente similares (todos tienen
//    "ID EMPLEADO" y "NOMBRE EMPLEADO"). La distinción correcta requiere
//    analizar el CONJUNTO de encabezados de la hoja, no solo columnas sueltas.
//
//  Tipos de documento reconocidos:
//    • 'poliza-salud' — Hoja principal: 'RELACION COBROS SALUD'
//                       Hoja consolidada Hoja1: col C = 'BENEFICIO COLLECTIVE MINING'
//                                                col D = 'VALOR A DEDUCCIR EMPLEADO'
//                       Conceptos: 19 (Auxilio Med. Prepagada Corp.)
//                                  51 (Descuento Med. Prepagada Corp.)
//                                  56 (Descuento Deuda Empleado)
//
//    • 'poliza-vida'  — Hoja principal: 'COLLECTIVE' / 'Hoja1'
//                       col A = 'ID EMPLEADO'
//                       col B = 'NOMBRE EMPLEADO'
//                       col C = 'PRIMA MENSUAL'  ← señal exclusiva de vida
//                       Conceptos: 20 (Devengo Póliza de Vida Corp.)
//                                  52 (Deducción Póliza de Vida Corp.)
//
//    • null           — No reconocido; el registry seguirá con el siguiente parser
//
//  API pública:
//    fingerprintBuffer(buffer)  → 'poliza-salud' | 'poliza-vida' | null
//      Inspección rápida del ZIP interno sin parsear el workbook completo.
//      Útil en detect() síncrono.
//
//    fingerprintWorkbook(workbook) → 'poliza-salud' | 'poliza-vida' | null
//      Inspección precisa sobre el workbook ya cargado con ExcelJS.
//      Úsala dentro de parse() para una verificación definitiva.
//
//    getHojaConsolidada(workbook, tipo) → ExcelJS.Worksheet | null
//      Devuelve la hoja de datos correcta según el tipo ya identificado.
// ============================================================================

// ─── Normalización ────────────────────────────────────────────────────────────
function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Señales exclusivas por tipo ──────────────────────────────────────────────

// Señales que, si aparecen en el buffer o encabezados, apuntan SOLO a salud
const SEÑALES_SALUD = [
  'relacion cobros salud',
  'relacion cobro salud',
  'cobros salud',
  'cobro salud',
  'beneficio collective mining',
  'valor a deduccir empleado',
  'valor a deducir empleado',
  'medicina prepagada',
];

// Señales que apuntan SOLO a vida (ausentes en el archivo de salud)
const SEÑALES_VIDA = [
  'prima mensual',
  'poliza de vida',
  'poliza vida',
  'devengo poliza',
  'deduccion poliza',
];

// Nombres de hoja que, por sí solos, identifican salud con certeza
const HOJAS_SALUD_EXCLUSIVAS = [
  'relacion cobros salud',
  'relacion cobro salud',
  'cobros salud',
];

// ─── fingerprintBuffer — inspección del ZIP con jszip ────────────────────────
// xlsx es un ZIP. Descomprimimos con jszip para leer los XML internos
// (sharedStrings.xml y workbook.xml) donde están los nombres de hojas y
// los encabezados como texto plano, sin depender del orden de bytes en el buffer.
/**
 * @param {Buffer} buffer
 * @returns {'poliza-salud' | 'poliza-vida' | null}
 */
function fingerprintBuffer(buffer) {
  if (!buffer || buffer.length < 4) return null;
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4B) return null; // magic ZIP

  try {
    const JSZip = require('jszip');
    // jszip.loadAsync es asíncrono; usamos la versión síncrona de lectura de nombres
    // Para detect() síncrono, leemos el ZIP con una inspección de texto bruto del buffer
    // que funciona porque sharedStrings.xml no está siempre comprimido en xlsx pequeños.
    // Si jszip no puede resolver síncronamente, caemos al método de texto bruto.

    // Método texto bruto: el XML de xlsx suele estar sin comprimir o con compresión mínima
    // para archivos pequeños/medianos. Buscamos en todo el buffer.
    const raw  = buffer.toString('latin1'); // latin1 preserva bytes sin decodificar
    const text = norm(raw);

    for (const señal of SEÑALES_SALUD) {
      if (text.includes(norm(señal))) return 'poliza-salud';
    }
    for (const señal of SEÑALES_VIDA) {
      if (text.includes(norm(señal))) return 'poliza-vida';
    }
  } catch (_) { /* no detectar si falla */ }

  return null;
}

// ─── fingerprintBufferAsync — versión asíncrona con lectura completa del ZIP ──
// Úsala cuando tengas contexto async (p.ej. dentro de parse()) para máxima precisión.
/**
 * @param {Buffer} buffer
 * @returns {Promise<'poliza-salud' | 'poliza-vida' | null>}
 */
async function fingerprintBufferAsync(buffer) {
  if (!buffer || buffer.length < 4) return null;
  if (buffer[0] !== 0x50 || buffer[1] !== 0x4B) return null;

  try {
    const JSZip = require('jszip');
    const zip   = await JSZip.loadAsync(buffer);

    // Extraer sharedStrings.xml (contiene los textos de las celdas)
    let textoTotal = '';
    const archivosXML = ['xl/sharedStrings.xml', 'xl/workbook.xml'];
    for (const nombre of archivosXML) {
      if (zip.files[nombre]) {
        textoTotal += await zip.files[nombre].async('text');
      }
    }
    // También buscar en hojas individuales (xl/worksheets/sheet*.xml)
    for (const [nombre, archivo] of Object.entries(zip.files)) {
      if (nombre.startsWith('xl/worksheets/') && nombre.endsWith('.xml')) {
        textoTotal += await archivo.async('text');
      }
    }

    const text = norm(textoTotal);

    for (const señal of SEÑALES_SALUD) {
      if (text.includes(norm(señal))) return 'poliza-salud';
    }
    for (const señal of SEÑALES_VIDA) {
      if (text.includes(norm(señal))) return 'poliza-vida';
    }
  } catch (_) { /* no detectar si falla */ }

  return null;
}

// ─── fingerprintWorkbook — inspección precisa sobre el workbook ExcelJS ───────
/**
 * @param {ExcelJS.Workbook} workbook
 * @returns {'poliza-salud' | 'poliza-vida' | null}
 */
function fingerprintWorkbook(workbook) {
  let tieneSalud = false;
  let tieneVida  = false;

  workbook.eachSheet(ws => {
    const nombreNorm = norm(ws.name);

    // ── Detección por nombre de hoja ──────────────────────────────────────
    if (HOJAS_SALUD_EXCLUSIVAS.some(kw => nombreNorm.includes(kw))) {
      tieneSalud = true;
      return;
    }

    // ── Detección por contenido de encabezados de la hoja ─────────────────
    // Revisar filas 1 y 2 (algunos formatos tienen título en fila 1)
    for (const filaNum of [1, 2]) {
      try {
        const fila = ws.getRow(filaNum);
        const textos = [];
        for (let c = 1; c <= 14; c++) {
          const cell = fila.getCell(c);
          const val  = cell.value;
          if (val === null || val === undefined) continue;
          let txt = '';
          if (typeof val === 'object' && Array.isArray(val.richText)) {
            txt = val.richText.map(r => r.text || '').join('');
          } else if (typeof val === 'object' && 'result' in val) {
            txt = String(val.result || '');
          } else {
            txt = String(val);
          }
          textos.push(norm(txt));
        }
        const linea = textos.join(' ');

        // Señales exclusivas de salud en encabezados
        if (SEÑALES_SALUD.some(s => linea.includes(s))) { tieneSalud = true; return; }

        // Señales exclusivas de vida en encabezados
        if (SEÑALES_VIDA.some(s => linea.includes(s))) { tieneVida = true; return; }

        // Diferenciación por col C cuando la hoja se llama 'Hoja1' o 'COLLECTIVE':
        // Vida:  col A=ID EMPLEADO, col B=NOMBRE EMPLEADO, col C=PRIMA MENSUAL
        // Salud: col A=ID EMPLEADO, col B=NOMBRE EMPLEADO, col C=BENEFICIO...
        if (textos.length >= 3) {
          const colA = textos[0] || '';
          const colB = textos[1] || '';
          const colC = textos[2] || '';

          const esIdEmpleado  = colA.includes('id') && colA.includes('empleado');
          const esNombreEmp   = colB.includes('nombre') && colB.includes('empleado');

          if (esIdEmpleado && esNombreEmp) {
            if (colC.includes('prima') || colC.includes('mensual')) {
              tieneVida = true; return;
            }
            if (colC.includes('beneficio') || colC.includes('deduci') || colC.includes('deducc')) {
              tieneSalud = true; return;
            }
          }
        }
      } catch (_) { /* continuar con la siguiente fila */ }
    }
  });

  if (tieneSalud && !tieneVida) return 'poliza-salud';
  if (tieneVida  && !tieneSalud) return 'poliza-vida';
  if (tieneSalud && tieneVida)   return 'poliza-salud'; // salud tiene prioridad (más específico)
  return null;
}

// ─── _hojaContieneEncabezadosVida — revisa hasta fila 10 buscando patrón vida ─
// ID EMPLEADO + NOMBRE EMPLEADO + PRIMA (o MENSUAL), sin señales de salud.
function _hojaContieneEncabezadosVida(ws) {
  for (let r = 1; r <= 10; r++) {
    try {
      const textos = _textosEncabezado(ws, r);
      const linea  = textos.join(' ');
      if (SEÑALES_SALUD.some(s => linea.includes(norm(s)))) return false; // es salud
      const tieneId     = textos.some(t => t.includes('id') && t.includes('empleado'));
      const tieneNombre = textos.some(t => t.includes('nombre') && t.includes('empleado'));
      const tienePrima  = textos.some(t => t.includes('prima') || t.includes('mensual'));
      if (tieneId && tieneNombre && tienePrima) return true;
    } catch (_) {}
  }
  return false;
}

// ─── getHojaConsolidada — selecciona la hoja de datos según tipo ──────────────
/**
 * @param {ExcelJS.Workbook} workbook
 * @param {'poliza-salud' | 'poliza-vida'} tipo
 * @returns {{ hoja: ExcelJS.Worksheet | null, estrategia: string }}
 */
function getHojaConsolidada(workbook, tipo) {
  let porNombreExacto  = null;
  let porNombreParcial = null;
  let porContenido     = null;

  workbook.eachSheet(ws => {
    const nombreNorm = norm(ws.name);

    if (tipo === 'poliza-salud') {
      // Para salud: preferir la hoja específica, luego Hoja1 con encabezados de salud
      if (!porNombreExacto && HOJAS_SALUD_EXCLUSIVAS.some(kw => nombreNorm.includes(kw))) {
        porNombreExacto = ws;
      }
      if (!porNombreParcial && nombreNorm.includes('salud')) {
        porNombreParcial = ws;
      }
      if (!porContenido) {
        // Hoja1 u otras con encabezados de salud
        for (const filaNum of [1, 2]) {
          try {
            const linea = _lineaEncabezados(ws, filaNum);
            if (SEÑALES_SALUD.some(s => linea.includes(s))) { porContenido = ws; break; }
            const textos = _textosEncabezado(ws, filaNum);
            if (textos[2] && (textos[2].includes('beneficio') || textos[2].includes('deduci'))) {
              if (textos[0].includes('id') && textos[1].includes('nombre')) { porContenido = ws; break; }
            }
          } catch (_) {}
        }
      }
    }

    if (tipo === 'poliza-vida') {
      // Para vida: preferir 'COLLECTIVE' o 'Hoja1', pero solo si tienen encabezados de vida.
      // La validación revisa hasta 10 filas para tolerar títulos en fila 1.
      const tieneEncabezadosVida = _hojaContieneEncabezadosVida(ws);

      if (!porNombreExacto && (nombreNorm === 'collective' || nombreNorm.includes('collective'))) {
        if (tieneEncabezadosVida) porNombreExacto = ws;
      }
      if (!porNombreParcial && ws.name.trim() === 'Hoja1') {
        if (tieneEncabezadosVida) porNombreParcial = ws;
      }
      if (!porContenido && tieneEncabezadosVida) {
        for (const filaNum of [1, 2, 3]) {
          try {
            const linea = _lineaEncabezados(ws, filaNum);
            if (SEÑALES_VIDA.some(s => linea.includes(s))) { porContenido = ws; break; }
            const textos = _textosEncabezado(ws, filaNum);
            if (textos.some(t => t.includes('prima') || t.includes('mensual'))) {
              if (textos.some(t => t.includes('id') && t.includes('empleado')) &&
                  textos.some(t => t.includes('nombre'))) { porContenido = ws; break; }
            }
          } catch (_) {}
        }
      }
    }
  });

  const hoja = porNombreExacto || porNombreParcial || porContenido;
  const estrategia =
    porNombreExacto  ? `nombre exacto "${porNombreExacto.name}"` :
    porNombreParcial ? `nombre parcial "${porNombreParcial?.name}"` :
    porContenido     ? `encabezados reconocidos en hoja "${porContenido?.name}"` :
    'no encontrada';

  return { hoja, estrategia };
}

// ─── helpers internos ─────────────────────────────────────────────────────────
function _textosEncabezado(ws, filaNum) {
  const fila   = ws.getRow(filaNum);
  const result = [];
  for (let c = 1; c <= 14; c++) {
    const cell = fila.getCell(c);
    const val  = cell.value;
    if (val === null || val === undefined) { result.push(''); continue; }
    let txt = '';
    if (typeof val === 'object' && Array.isArray(val.richText)) {
      txt = val.richText.map(r => r.text || '').join('');
    } else if (typeof val === 'object' && 'result' in val) {
      txt = String(val.result || '');
    } else {
      txt = String(val);
    }
    result.push(norm(txt));
  }
  return result;
}

function _lineaEncabezados(ws, filaNum) {
  return _textosEncabezado(ws, filaNum).join(' ');
}

module.exports = { fingerprintBuffer, fingerprintBufferAsync, fingerprintWorkbook, getHojaConsolidada };
