// ============================================================================
//  utils/importParsers/parserPolizaSalud.js
//  Parser para archivos Excel de "Relación Cobros Póliza de Salud".
//
//  DETECCIÓN — criterios exclusivos de este formato (en orden de prioridad):
//    1. Nombre del archivo contiene "salud" (normalizado sin tildes)
//    2. El nombre contiene "cobro" o "relacion" junto con "salud"
//    3. El buffer del xlsx contiene una hoja llamada "RELACION COBROS SALUD"
//       o variantes normalizadas: "relacion cobro salud", "cobros salud", etc.
//    Este parser se registra ANTES que parserPolizaVida para capturar
//    correctamente los archivos de salud que antes eran absorbidos por aquel.
//
//  HOJA DE DATOS — búsqueda por prioridad dentro del workbook:
//    1. Hoja con nombre que contenga "cobro" Y "salud" (exacto/normalizado)
//    2. Hoja con nombre que contenga solo "salud"
//    3. Primera hoja cuyos encabezados fila 2 coincidan con el patrón salud
//
//  Estructura del Excel de salud (hoja 'RELACION COBROS SALUD'):
//    • Fila 1: título general (se ignora)
//    • Fila 2: encabezados — POLIZA | PRODUCTO | ID EMPLEADO | NOMBRE EMPLEADO |
//              PARENTESCO | EXTRA PRIMA | ANEXO ODONT | EPS SURA |
//              VALOR MENSUAL X ASEGURADO | BENEFICIO COLLECTIVE MINING |
//              VALOR A DEDUCCIR EMPLEADO | ...
//    • Datos: filas 3 en adelante con registros reales
//
//  Columnas leídas:
//    Col C (índice 3): ID EMPLEADO  → cédula
//    Col D (índice 4): NOMBRE EMPLEADO → nombre
//    Col J (índice 10): BENEFICIO COLLECTIVE MINING → valor auxilio/descuento
//    Col K (índice 11): VALOR A DEDUCCIR EMPLEADO  → valor deuda empleado
//
//  Lógica de negocio:
//    Por cada fila válida (cédula numérica, nombre, BENEFICIO > 0) se generan:
//      – COD_CONC = 19  →  Auxilio Medicina Prepagada Corporativa   (OCASIONAL)
//      – COD_CONC = 51  →  Descuento Medicina Prepagada Corporativa (OCASIONAL)
//    Adicionalmente, si VALOR A DEDUCCIR EMPLEADO > 0:
//      – COD_CONC = 56  →  Descuento Deuda Empleado                 (OCASIONAL)
//
//    Cédulas duplicadas: se suman los valores antes de crear los registros.
//    Filas inválidas se reportan como advertencias y se omiten.
//
//  Contrato novedades:
//    Map<codConc, { valor: number, tipo: 'OCASIONAL', label: string }>
// ============================================================================

const ExcelJS = require('exceljs');
const { Readable } = require('stream');
const { fingerprintBuffer, fingerprintWorkbook, getHojaConsolidada } = require('./fingerprintExcel');

// ─── Meta ─────────────────────────────────────────────────────────────────────
const meta = {
  id:       'excel-poliza-salud',
  nombre:   'Excel — Relación Cobros Póliza de Salud',
  formatos: ['.xlsx', '.xls'],
};

// Conceptos fijos que se generan por cada empleado con BENEFICIO > 0
const CONCEPTOS_BASE = [
  { codConc: 19, tipo: 'OCASIONAL', label: 'Auxilio Medicina Prepagada Corporativa',    campo: 'beneficio' },
  { codConc: 51, tipo: 'OCASIONAL', label: 'Descuento Medicina Prepagada Corporativa',  campo: 'beneficio' },
];

// Concepto adicional solo si VALOR A DEDUCCIR EMPLEADO > 0
const CONCEPTO_DEUDA = { codConc: 56, tipo: 'OCASIONAL', label: 'Descuento Deuda Empleado', campo: 'deuda' };

// Palabras clave exclusivas de este formato en nombres de hoja
const HOJAS_SALUD_KW    = ['cobros salud', 'cobro salud', 'relacion cobro', 'salud'];
const HOJAS_SALUD_EXACT = ['relacion cobros salud', 'relacion cobro salud'];

// ─── Normalización ────────────────────────────────────────────────────────────
function normStr(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Helpers de celda ────────────────────────────────────────────────────────
function getCellValue(cell) {
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
  return null;
}

function getCellStr(cell) {
  const v = getCellValue(cell);
  if (v === null || v === undefined) return '';
  return String(v).replace(/\u00A0/g, ' ').replace(/\uFEFF/g, '').trim();
}

function getCellNum(cell) {
  const v = getCellValue(cell);
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

// ─── Verificar si una hoja tiene encabezados del formato Póliza de Salud ─────
// Los encabezados están en fila 2 (fila 1 es el título general)
function esHojaConPatronSalud(ws) {
  try {
    // Intentar fila 2 (formato habitual con título en fila 1)
    for (const filaNum of [2, 1]) {
      const fila = ws.getRow(filaNum);
      const celdas = [];
      for (let c = 1; c <= 14; c++) celdas.push(normStr(getCellStr(fila.getCell(c))));
      const textoFila = celdas.join(' ');

      const tieneIdEmpleado  = celdas.some(c => (c.includes('id') && c.includes('empleado')) || c.includes('cedula'));
      const tieneNombre      = celdas.some(c => c.includes('nombre') && c.includes('empleado'));
      const tieneBeneficio   = textoFila.includes('beneficio');
      const tieneDeducir     = textoFila.includes('deduci') || textoFila.includes('deduccir') || textoFila.includes('deduccion');

      if (tieneIdEmpleado && tieneNombre && (tieneBeneficio || tieneDeducir)) return true;
    }
    return false;
  } catch (_) {
    return false;
  }
}

// ─── Seleccionar la hoja de datos correcta ───────────────────────────────────
// Delega en fingerprintExcel para buscar la hoja exclusiva de salud
// ('RELACION COBROS SALUD') antes de considerar 'Hoja1' u otras compartidas.
function seleccionarHoja(workbook) {
  return getHojaConsolidada(workbook, 'poliza-salud');
}

// ─── detect() — decide si este parser aplica al archivo ──────────────────────
function detect(file) {
  const name  = (file.originalname || '');
  const mime  = (file.mimetype || '').toLowerCase();
  const nameL = name.toLowerCase();

  // Paso 1: debe ser Excel
  const esExcel = /\.(xlsx|xls)$/.test(nameL) ||
                  mime.includes('spreadsheet') ||
                  mime.includes('excel') ||
                  mime.includes('openxmlformats');
  if (!esExcel) return false;

  // Paso 2: señal explícita en el nombre del archivo
  if (normStr(name).includes('salud')) return true;

  // Paso 3: fingerprint centralizado del buffer (inspección del ZIP interno)
  // Distingue salud vs vida analizando hojas y encabezados sin cargar el workbook
  const tipo = fingerprintBuffer(file.buffer);
  if (tipo === 'poliza-salud') return true;
  if (tipo === 'poliza-vida')  return false;

  return false;
}

// ─── Encontrar la fila de encabezados dentro de la hoja ──────────────────────
// El formato tiene título en fila 1 y encabezados en fila 2 (o a veces fila 8
// cuando el archivo mezcla secciones). Buscamos dinámicamente.
function encontrarFilaEncabezados(ws) {
  for (let r = 1; r <= 15; r++) {
    const fila = ws.getRow(r);
    const celdas = [];
    for (let c = 1; c <= 14; c++) celdas.push(normStr(getCellStr(fila.getCell(c))));
    const texto = celdas.join(' ');
    if (
      celdas.some(c => c.includes('id') && c.includes('empleado')) &&
      celdas.some(c => c.includes('nombre') && c.includes('empleado')) &&
      (texto.includes('beneficio') || texto.includes('deduci'))
    ) {
      return r;
    }
  }
  return null;
}

// ─── parse() — parseo completo del workbook ───────────────────────────────────
async function parse(file, context = {}) {
  const advertencias  = [];
  const filasOmitidas = [];

  // Cargar workbook
  const workbook = new ExcelJS.Workbook();
  await workbook.xlsx.read(Readable.from(file.buffer));

  // Seleccionar hoja de datos
  const { hoja: ws, estrategia } = seleccionarHoja(workbook);

  if (!ws) {
    const hojas = workbook.worksheets.map(s => `"${s.name}"`).join(', ');
    throw new Error(
      `No se pudo identificar la hoja de datos en "${file.originalname}". ` +
      `Hojas disponibles: ${hojas}. ` +
      `Se esperaba una hoja con nombre "RELACION COBROS SALUD" o encabezados: ` +
      `"ID EMPLEADO" | "NOMBRE EMPLEADO" | "BENEFICIO COLLECTIVE MINING" | "VALOR A DEDUCCIR EMPLEADO".`
    );
  }

  advertencias.push(`Hoja de datos usada: "${ws.name}" (detectada por ${estrategia}).`);

  // Encontrar fila de encabezados dinámicamente
  const filaEnc = encontrarFilaEncabezados(ws);
  if (!filaEnc) {
    throw new Error(
      `La hoja "${ws.name}" en "${file.originalname}" no tiene los encabezados esperados. ` +
      `Se esperaba: "ID EMPLEADO" | "NOMBRE EMPLEADO" | "BENEFICIO COLLECTIVE MINING".`
    );
  }

  advertencias.push(`Encabezados encontrados en fila ${filaEnc}. Datos desde fila ${filaEnc + 1}.`);

  // Detectar columnas exactas de los encabezados (tolerante a variaciones)
  const filaHeader = ws.getRow(filaEnc);
  let colCedula    = 3;  // default: columna C (ID EMPLEADO)
  let colNombre    = 4;  // default: columna D (NOMBRE EMPLEADO)
  let colBeneficio = 10; // default: columna J (BENEFICIO COLLECTIVE MINING)
  let colDeuda     = 11; // default: columna K (VALOR A DEDUCCIR EMPLEADO)

  for (let c = 1; c <= 17; c++) {
    const h = normStr(getCellStr(filaHeader.getCell(c)));
    if (h.includes('id') && h.includes('empleado'))                       colCedula    = c;
    else if (h.includes('nombre') && h.includes('empleado'))              colNombre    = c;
    else if (h.includes('beneficio'))                                      colBeneficio = c;
    else if (h.includes('deduci') && h.includes('empleado'))              colDeuda     = c;
  }

  advertencias.push(
    `Columnas mapeadas — Cédula: ${colCedula}, Nombre: ${colNombre}, ` +
    `Beneficio: ${colBeneficio}, Deuda: ${colDeuda}.`
  );

  // ─── Leer filas de datos ──────────────────────────────────────────────────
  const agrupado = new Map();
  let totalFilas = 0;

  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= filaEnc) return; // saltar encabezados y título

    const cedStr    = getCellStr(row.getCell(colCedula)).replace(/\uFEFF/g, '');
    const nombre    = getCellStr(row.getCell(colNombre));
    const beneficio = getCellNum(row.getCell(colBeneficio));
    const deuda     = getCellNum(row.getCell(colDeuda));

    // Fila totalizadora o vacía
    if (!cedStr || cedStr === '0') return;

    // Cédula no numérica (saltar filas de subtotal, cabeceras intermedias, etc.)
    if (!/^\d+$/.test(cedStr)) return;

    // Nombre vacío
    if (!nombre) {
      filasOmitidas.push({ fila: rowNumber, cedula: cedStr, nombre: '', razon: 'Nombre vacío' });
      return;
    }

    // Beneficio nulo o no positivo — fila sin valor útil para conceptos base
    if (beneficio === null || beneficio <= 0) {
      filasOmitidas.push({
        fila: rowNumber, cedula: cedStr, nombre,
        razon: beneficio === null ? 'Beneficio sin dato o fórmula sin resolver' : 'Beneficio cero o negativo',
      });
      return;
    }

    totalFilas++;

    // Agrupar por cédula — si el mismo empleado aparece en varias filas, sumar valores
    if (!agrupado.has(cedStr)) {
      agrupado.set(cedStr, {
        cedula:         cedStr,
        nombre,
        cargo:          '',
        centroCostoNom: '',
        novedades:      new Map(),
        _deuda:         0,  // acumulador interno de deuda
      });
    }

    const emp = agrupado.get(cedStr);
    if (!emp.nombre && nombre) emp.nombre = nombre;

    // Conceptos base: Auxilio (19) y Descuento Med. Prepagada (51) — valor = beneficio
    for (const { codConc, tipo, label } of CONCEPTOS_BASE) {
      const prev = emp.novedades.get(codConc);
      emp.novedades.set(codConc, prev
        ? { ...prev, valor: prev.valor + beneficio }
        : { valor: beneficio, tipo, label }
      );
    }

    // Concepto adicional: Deuda Empleado (56) — solo si hay valor positivo en col K
    if (deuda !== null && deuda > 0) {
      emp._deuda += deuda;
    }
  });

  // Consolidar Deuda Empleado en novedades (después de agrupar)
  for (const emp of agrupado.values()) {
    if (emp._deuda > 0) {
      const prev = emp.novedades.get(CONCEPTO_DEUDA.codConc);
      emp.novedades.set(CONCEPTO_DEUDA.codConc, prev
        ? { ...prev, valor: prev.valor + emp._deuda }
        : { valor: emp._deuda, tipo: CONCEPTO_DEUDA.tipo, label: CONCEPTO_DEUDA.label }
      );
    }
    delete emp._deuda; // limpiar campo interno antes de devolver
  }

  // ─── Consolidar advertencias de filas omitidas ────────────────────────────
  if (filasOmitidas.length > 0) {
    advertencias.push(`Filas omitidas (${filasOmitidas.length}):`);
    for (const f of filasOmitidas) {
      advertencias.push(
        `  • Fila ${f.fila}: cédula="${f.cedula || '—'}", nombre="${f.nombre || '—'}" → ${f.razon}`
      );
    }
  }

  if (agrupado.size === 0) {
    throw new Error(
      `No se encontraron registros válidos en "${file.originalname}" (hoja "${ws.name}"). ` +
      `Verifique que haya filas con cédula numérica, nombre y valor de beneficio mayor a cero.`
    );
  }

  return { agrupado, totalFilas, advertencias };
}

module.exports = { meta, detect, parse };
