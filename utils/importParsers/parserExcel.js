// ============================================================================
//  utils/importParsers/parserExcel.js
//  Parser para archivos Excel (.xlsx / .xls) — Formato "Reporte Final".
//
//  Hoja esperada: 'Reporte Final ' (con o sin espacio)
//  Estructura (fila 4 = encabezados, fila 5+ = datos):
//    Col B: CEDULA
//    Col C: NOMBRE EL COLABORADOR
//    Col D: CARGO
//    Col E: CENTRO COSTO
//    Col F: cant HORA EXTRA DIURNA 1,25          → COD_CONC = 10
//    Col G: cant HORA EXTRA NOCTURNA 1,75        → COD_CONC = 11
//    Col H: cant HORA FESTIVA 1,75               → COD_CONC = 7
//    Col I: cant RECARGO NOCTURNO 0,35           → COD_CONC = 14
//    Col J: cant RECARGO NOCTURNO FESTIVO 2,10   → COD_CONC = 15
//    Col K: cant HORA EXTRA DIURNA FESTIVA 2,0   → COD_CONC = 8
//    Col L: cant HORA EXTRA NOCTURNA FESTIVA 2,5 → COD_CONC = 9
//    Col M: cant DOMINICAL COMPENSADO 0,75       → COD_CONC = 16
//    Col N: cant DOMINICAL NO COMPENSADO 1,75    → COD_CONC = 7 (suma con col H)
// ============================================================================

const ExcelJS = require('exceljs');
const { Readable } = require('stream');

// ─── Meta del parser ──────────────────────────────────────────────────────────
const meta = {
  id: 'excel-reporte-final',
  nombre: 'Excel — Reporte Final (Exploración)',
  formatos: ['.xlsx', '.xls'],
};

// ─── Detección ────────────────────────────────────────────────────────────────
function detect(file) {
  const name = (file.originalname || '').toLowerCase();
  const mime = (file.mimetype || '').toLowerCase();
  return /\.(xlsx|xls)$/.test(name) ||
         mime.includes('spreadsheet') ||
         mime.includes('excel') ||
         mime.includes('openxmlformats');
}

// ─── Mapeo columna Excel (1-based) → COD_CONC ────────────────────────────────
const COLUMNAS_NOVEDAD = [
  { col: 6,  codConc: 10, label: 'Hora Extra Diurna 125%' },
  { col: 7,  codConc: 11, label: 'Hora Extra Nocturna 175%' },
  { col: 8,  codConc: 7,  label: 'Hora Festiva 175% (col H)' },
  { col: 9,  codConc: 14, label: 'Recargo Nocturno 35%' },
  { col: 10, codConc: 15, label: 'Recargo Nocturno Festivo 210%' },
  { col: 11, codConc: 8,  label: 'Hora Extra Diurna Festiva 200%' },
  { col: 12, codConc: 9,  label: 'Hora Extra Nocturna Festiva 250%' },
  { col: 13, codConc: 16, label: 'Recargo Dominical Compensado 0.75%' },
  { col: 14, codConc: 7,  label: 'Hora Dominical No Compensado 175% (col N)' },
];

// ─── Resolver valor de celda (con soporte completo de fórmulas cacheadas) ────
function getCellValue(cell, workbook) {
  const val = cell.value;
  if (val === null || val === undefined) return null;
  if (typeof val !== 'object') return val;
  if (val instanceof Date) return val;
  if (Array.isArray(val.richText)) {
    return val.richText.map(rt => rt.text || '').join('').trim();
  }
  if ('result' in val && val.result !== undefined && val.result !== null) {
    return val.result;
  }
  const formula = val.formula || val.sharedFormula || '';
  if (formula) {
    const resolved = resolveFormulaRef(formula, cell.row, workbook);
    if (resolved !== null && resolved !== undefined) return resolved;
  }
  return null;
}

function resolveFormulaRef(formula, rowHint, workbook) {
  const matchSingle = formula.match(/^=?'?([^'!]+)'?!([A-Z]+)(\d+)$/);
  if (matchSingle) {
    const sheetName = matchSingle[1].trim();
    const colStr    = matchSingle[2];
    const rowNum    = parseInt(matchSingle[3], 10);
    return readCellFromSheet(workbook, sheetName, colStr, rowNum);
  }
  const matchNaked = formula.match(/^'?([^'!]+)'?!([A-Z]+)(\d+)$/);
  if (matchNaked) {
    const sheetName = matchNaked[1].trim();
    const colStr    = matchNaked[2];
    const rowNum    = parseInt(matchNaked[3], 10);
    return readCellFromSheet(workbook, sheetName, colStr, rowNum);
  }
  return null;
}

function readCellFromSheet(workbook, sheetName, colStr, rowNum) {
  let ws = null;
  workbook.eachSheet(s => {
    if (!ws && s.name.trim() === sheetName.trim()) ws = s;
  });
  if (!ws) return null;
  const colNum = colLetterToNumber(colStr);
  const cell = ws.getRow(rowNum).getCell(colNum);
  const val = cell.value;
  if (val === null || val === undefined) return null;
  if (typeof val !== 'object') return val;
  if (val instanceof Date) return val;
  if ('result' in val && val.result !== undefined) return val.result;
  return null;
}

function colLetterToNumber(col) {
  let n = 0;
  for (let i = 0; i < col.length; i++) {
    n = n * 26 + (col.charCodeAt(i) - 64);
  }
  return n;
}

function getCellNum(cell, workbook) {
  const v = getCellValue(cell, workbook);
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

function getCellStr(cell, workbook) {
  const v = getCellValue(cell, workbook);
  if (v === null || v === undefined) return '';
  return String(v).replace(/\u00A0/g, ' ').trim();
}

// ─── Función principal de parseo ──────────────────────────────────────────────
/**
 * Parsear un archivo Excel y extraer las novedades agrupadas por empleado.
 *
 * @param {object} file - Objeto multer (buffer, originalname, etc.)
 * @param {object} context - Contexto adicional (reservado para futuras extensiones)
 * @returns {Promise<ParseResult>}
 *   ParseResult = {
 *     agrupado: Map<cedula, { cedula, nombre, cargo, centroCostoNom, novedades: Map<codConc, cant> }>,
 *     totalFilas: number,
 *     advertencias: string[],
 *   }
 */
async function parse(file, context = {}) {
  const advertencias = [];

  // Leer workbook completo
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.read(Readable.from(file.buffer));

  // Detectar hoja 'Reporte Final'
  let ws = null;
  workbook.eachSheet(sheet => {
    if (!ws && sheet.name.trim() === 'Reporte Final') ws = sheet;
  });
  if (!ws) {
    const names = workbook.worksheets.map(s => `"${s.name}"`).join(', ');
    throw new Error(
      `No se encontró la hoja "Reporte Final" en "${file.originalname}". ` +
      `Hojas disponibles: ${names}.`
    );
  }

  // Validar encabezado fila 4 col B
  const hdrB = getCellStr(ws.getRow(4).getCell(2), workbook);
  if (!hdrB.toUpperCase().includes('CEDULA')) {
    throw new Error(
      `La fila 4 columna B de "${file.originalname}" no contiene "CEDULA" ` +
      `(encontrado: "${hdrB}"). Verifica el formato.`
    );
  }

  // Leer y agrupar novedades por empleado
  const agrupado = new Map();
  let totalFilas = 0;

  ws.eachRow((row, rowNumber) => {
    if (rowNumber < 5) return;

    const cedulaRaw = getCellStr(row.getCell(2), workbook);
    if (!cedulaRaw || cedulaRaw === '0') return;
    if (!/^\d+$/.test(cedulaRaw)) return;

    totalFilas++;

    if (!agrupado.has(cedulaRaw)) {
      agrupado.set(cedulaRaw, {
        cedula:         cedulaRaw,
        nombre:         getCellStr(row.getCell(3), workbook),
        cargo:          getCellStr(row.getCell(4), workbook),
        centroCostoNom: getCellStr(row.getCell(5), workbook),
        novedades:      new Map(),
      });
    }

    const emp = agrupado.get(cedulaRaw);
    for (const colDef of COLUMNAS_NOVEDAD) {
      const cant = getCellNum(row.getCell(colDef.col), workbook);
      if (cant > 0) {
        const prev = emp.novedades.get(colDef.codConc) || 0;
        emp.novedades.set(colDef.codConc, prev + cant);
      }
    }
  });

  return { agrupado, totalFilas, advertencias };
}

module.exports = { meta, detect, parse };
