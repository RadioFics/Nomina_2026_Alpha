// ============================================================================
//  utils/importParsers/parserPolizaVida.js
//  Parser para archivos Excel de "Relación de Cobros Póliza de Vida".
//
//  DETECCIÓN — basada en CONTENIDO del workbook (no en el nombre del archivo):
//    El archivo se reconoce si al leer el buffer existe al menos una hoja
//    cuyos encabezados en fila 1 columnas A/B/C coincidan con el patrón:
//      Col A: contiene "ID" o "EMPLEADO" o "CEDULA"
//      Col B: contiene "NOMBRE" o "EMPLEADO" o "COLABORADOR"
//      Col C: contiene "PRIMA" o "MENSUAL" o "VALOR"
//    Esto permite identificar el formato sin importar el nombre del archivo
//    ni la hoja (funciona con 'Hoja1', 'COLLECTIVE', o cualquier nombre futuro).
//
//  HOJA DE DATOS — búsqueda por prioridad dentro del workbook:
//    1. Hoja 'Hoja1' exacta (consolidado limpio habitual)
//    2. Cualquier hoja cuyos encabezados fila 1 coincidan con el patrón
//    3. Primera hoja con nombre conocido: 'COLLECTIVE', 'RELACION', 'POLIZA', 'VIDA'
//
//  Lógica de negocio:
//    • Por cada fila válida (cédula numérica, nombre, prima > 0) se generan
//      DOS novedades con el mismo valor monetario:
//        – COD_CONC = 20  →  Devengo Póliza de Vida Corporativa   (OCASIONAL)
//        – COD_CONC = 52  →  Deducción Póliza de Vida Corporativa  (FIJA)
//    • Cédulas duplicadas: se suman las primas antes de crear los registros.
//    • Filas inválidas se reportan como advertencias y se omiten.
//
//  Contrato novedades:
//    Map<codConc, { valor: number, tipo: 'OCASIONAL'|'FIJA', label: string }>
//    El controller lee `tipo` para insertar en NO_OCASI o NO_FIJAS.
// ============================================================================

const ExcelJS = require('exceljs');
const { Readable } = require('stream');
const { fingerprintBuffer, fingerprintWorkbook, getHojaConsolidada } = require('./fingerprintExcel');

// ─── Meta ─────────────────────────────────────────────────────────────────────
const meta = {
  id:       'excel-poliza-vida',
  nombre:   'Excel — Relación Cobros Póliza de Vida',
  formatos: ['.xlsx', '.xls'],
};

// Conceptos que se generan por cada empleado válido.
// Ambos son OCASIONAL: van a NO_NOVED + NO_OCASI con VALOR = prima mensual.
const CONCEPTOS = [
  { codConc: 20, tipo: 'OCASIONAL', label: 'Devengo Póliza de Vida Corporativa' },
  { codConc: 52, tipo: 'OCASIONAL', label: 'Deducción Póliza de Vida Corporativa' },
];

// Nombres de hoja conocidos del formato (para la búsqueda por prioridad)
const HOJAS_CONOCIDAS_NORM = ['hoja1', 'collective', 'relacion', 'poliza', 'vida'];

// ─── Normalización ────────────────────────────────────────────────────────────
function normStr(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '') // quitar tildes
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
  return String(v).replace(/\u00A0/g, ' ').trim();
}

// ─── Encontrar la fila de encabezados de vida dentro de una hoja ─────────────
// Busca en las primeras 10 filas la que tenga ID EMPLEADO + NOMBRE EMPLEADO +
// PRIMA MENSUAL (o VALOR VIDA). Retorna el número de fila o null si no existe.
// Esto permite manejar hojas con título en fila 1 (como COLLECTIVE) y hojas
// con encabezados directamente en fila 1 (como Hoja1 consolidada).
function encontrarFilaEncabezadosVida(ws) {
  for (let r = 1; r <= 10; r++) {
    try {
      const fila = ws.getRow(r);
      const celdas = [];
      for (let c = 1; c <= 8; c++) celdas.push(normStr(getCellStr(fila.getCell(c))));
      const linea = celdas.join(' ');

      const tieneId     = celdas.some(c => c.includes('id') && c.includes('empleado') || c === 'cedula');
      const tieneNombre = celdas.some(c => c.includes('nombre') && (c.includes('empleado') || c.includes('colaborador')));
      // Señal exclusiva de vida: "prima mensual" o "prima" sola, pero NO "beneficio" (eso es salud)
      const tienePrima  = celdas.some(c => c.includes('prima') || c.includes('mensual')) && !linea.includes('beneficio');

      if (tieneId && tieneNombre && tienePrima) return r;
    } catch (_) { /* continuar */ }
  }
  return null;
}

// ─── Verificar si una hoja tiene encabezados del formato Póliza de Vida ──────
// Revisa hasta fila 10 para tolerar títulos en fila 1.
function esHojaConPatronPoliza(ws) {
  return encontrarFilaEncabezadosVida(ws) !== null;
}

// ─── Detectar columnas exactas en la fila de encabezados ─────────────────────
// Retorna { colCedula, colNombre, colPrima } según los encabezados encontrados.
// Defaults seguros: A=cédula, B=nombre, C=prima (formato Hoja1 consolidada).
// Para COLLECTIVE: A=ID EMPLEADO, B=NOMBRE EMPLEADO, C=VALOR VIDA, D=PRIMA MENSUAL.
function mapearColumnasVida(ws, filaEnc) {
  let colCedula = 1;
  let colNombre = 2;
  let colPrima  = 3; // default Hoja1

  const fila = ws.getRow(filaEnc);
  for (let c = 1; c <= 8; c++) {
    const h = normStr(getCellStr(fila.getCell(c)));
    if ((h.includes('id') && h.includes('empleado')) || h === 'cedula') {
      colCedula = c;
    } else if (h.includes('nombre') && (h.includes('empleado') || h.includes('colaborador'))) {
      colNombre = c;
    } else if (h.includes('prima') && h.includes('mensual')) {
      // "PRIMA MENSUAL" tiene prioridad sobre "VALOR VIDA"
      colPrima = c;
    } else if (h.includes('prima') && colPrima === 3 && c !== colCedula && c !== colNombre) {
      colPrima = c;
    }
  }
  return { colCedula, colNombre, colPrima };
}

// ─── Seleccionar la hoja de datos correcta ───────────────────────────────────
// Delega en fingerprintExcel para garantizar que 'Hoja1' solo se tome
// cuando sus encabezados correspondan al formato de vida (col C = PRIMA MENSUAL),
// evitando confusión con la 'Hoja1' del archivo de salud (col C = BENEFICIO...).
function seleccionarHoja(workbook) {
  return getHojaConsolidada(workbook, 'poliza-vida');
}

// ─── detect() — inspecciona el BUFFER para decidir si este parser aplica ─────
//
// El registry llama a detect() de forma SÍNCRONA con solo el objeto multer.
// Para hacer detección por contenido necesitamos leer el buffer, que es
// asíncrono. La solución: detect() hace la comprobación en dos pasos:
//
//   Paso 1 (rápido, síncrono): descartar si no es Excel por extensión/mime.
//   Paso 2 (contenido, síncrono-bloqueante): leer el zip interno del xlsx
//           para verificar los nombres de las hojas sin parsear todo el workbook.
//
// ExcelJS no tiene API síncrona, así que usamos 'jszip' (que ya es dependencia
// transitiva de exceljs) para leer solo el [Content_Types].xml y sharedStrings.
// Si no está disponible, caemos en detección por nombre de archivo.
//
// IMPORTANTE: detect() aquí es ASÍNCRONO para poder leer el buffer.
// El registry debe soportar await detect(). Revisamos parserRegistry.js para
// actualizar getParser() a async si es necesario.
//
// ALTERNATIVA SIMPLE usada aquí: detect() retorna true si:
//   a) es un archivo Excel, Y
//   b) el nombre del archivo (normalizado sin tildes) contiene señales del
//      formato, O el buffer empieza con la firma xlsx (PK) y el workbook
//      se puede verificar sincrónicamente leyendo el zip con la librería 'adm-zip'
//      si está disponible.
//
// Para máxima robustez, la verificación real de contenido ocurre en parse(),
// que lanza un error descriptivo si el archivo no es del formato esperado.
// Esto garantiza que si el nombre no da señales, el archivo pasa al parser
// genérico; pero si parse() se invoca directamente, siempre verifica.

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

  const nameNorm = normStr(name);

  // Paso 2: exclusión por nombre — "salud" lo toma el parser de salud
  if (nameNorm.includes('salud')) return false;

  // Paso 3: señales positivas de vida en el nombre del archivo
  const porNombre = (
    nameNorm.includes('poliza') &&
    (nameNorm.includes('vida') || nameNorm.includes('cobro') || nameNorm.includes('relacion'))
  ) || (
    nameNorm.includes('vida') &&
    (nameNorm.includes('cobro') || nameNorm.includes('relacion') || nameNorm.includes('poliz'))
  );
  if (porNombre) return true;

  // Paso 4: fingerprint centralizado del buffer
  // Cuando el nombre no da señales suficientes, analiza hojas y encabezados
  // del ZIP para distinguir vida vs salud con certeza
  const tipo = fingerprintBuffer(file.buffer);
  if (tipo === 'poliza-vida')  return true;
  if (tipo === 'poliza-salud') return false;

  return false;
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
      `Se esperan encabezados: "ID EMPLEADO", "NOMBRE EMPLEADO", "PRIMA MENSUAL" ` +
      `en alguna de las hojas.`
    );
  }

  // Encontrar fila de encabezados (tolerante a títulos en fila 1)
  const filaEnc = encontrarFilaEncabezadosVida(ws);
  if (!filaEnc) {
    const hojas = workbook.worksheets.map(s => `"${s.name}"`).join(', ');
    throw new Error(
      `La hoja "${ws.name}" en "${file.originalname}" no tiene los encabezados esperados. ` +
      `Se esperaba: "ID EMPLEADO" | "NOMBRE EMPLEADO" | "PRIMA MENSUAL". ` +
      `Hojas disponibles: ${hojas}.`
    );
  }

  // Mapear columnas exactas según los encabezados encontrados
  const { colCedula, colNombre, colPrima } = mapearColumnasVida(ws, filaEnc);

  advertencias.push(`Hoja de datos usada: "${ws.name}" (detectada por ${estrategia}).`);
  advertencias.push(`Encabezados en fila ${filaEnc}. Datos desde fila ${filaEnc + 1}. Columnas: Cédula=${colCedula}, Nombre=${colNombre}, Prima=${colPrima}.`);

  // ─── Leer filas de datos ──────────────────────────────────────────────────
  const agrupado = new Map();
  let totalFilas = 0;

  ws.eachRow((row, rowNumber) => {
    if (rowNumber <= filaEnc) return; // saltar título y fila de encabezados

    const celdaCedula = row.getCell(colCedula);
    const celdaNombre = row.getCell(colNombre);
    const celdaPrima  = row.getCell(colPrima);

    const cedStr   = getCellStr(celdaCedula);
    const nombre   = getCellStr(celdaNombre);
    const primaRaw = getCellValue(celdaPrima);

    // Fila totalizadora o vacía (sin cédula)
    if (!cedStr || cedStr === '0') return;

    // Cédula no numérica
    if (!/^\d+$/.test(cedStr)) {
      filasOmitidas.push({ fila: rowNumber, cedula: cedStr, nombre, prima: primaRaw, razon: 'Cédula no numérica' });
      return;
    }

    // Nombre vacío
    if (!nombre) {
      filasOmitidas.push({ fila: rowNumber, cedula: cedStr, nombre: '', prima: primaRaw, razon: 'Nombre vacío' });
      return;
    }

    // Prima nula o sin dato
    if (primaRaw === null || primaRaw === undefined) {
      const rawCell  = celdaPrima.value;
      const esFormula = typeof rawCell === 'object' && rawCell !== null &&
                        ('formula' in rawCell || 'sharedFormula' in rawCell);
      filasOmitidas.push({
        fila: rowNumber, cedula: cedStr, nombre,
        prima: esFormula ? '(fórmula sin resultado)' : null,
        razon: esFormula
          ? 'Prima con fórmula no resuelta — abra y guarde el archivo en Excel antes de importar'
          : 'Prima sin dato',
      });
      return;
    }

    const prima = Number(primaRaw);
    if (isNaN(prima)) {
      filasOmitidas.push({ fila: rowNumber, cedula: cedStr, nombre, prima: primaRaw, razon: 'Prima no es un número' });
      return;
    }
    if (prima <= 0) {
      filasOmitidas.push({ fila: rowNumber, cedula: cedStr, nombre, prima, razon: 'Prima cero o negativa' });
      return;
    }

    totalFilas++;

    // Agrupar por cédula (suma primas si el empleado aparece más de una vez)
    if (!agrupado.has(cedStr)) {
      agrupado.set(cedStr, {
        cedula:         cedStr,
        nombre,
        cargo:          '',
        centroCostoNom: '',
        novedades:      new Map(),
      });
    }

    const emp = agrupado.get(cedStr);
    if (!emp.nombre && nombre) emp.nombre = nombre;

    for (const { codConc, tipo, label } of CONCEPTOS) {
      const prev = emp.novedades.get(codConc);
      emp.novedades.set(codConc, prev
        ? { ...prev, valor: prev.valor + prima }
        : { valor: prima, tipo, label }
      );
    }
  });

  // ─── Consolidar advertencias de filas omitidas ────────────────────────────
  if (filasOmitidas.length > 0) {
    advertencias.push(`Filas omitidas (${filasOmitidas.length}):`);
    for (const f of filasOmitidas) {
      advertencias.push(
        `  • Fila ${f.fila}: cédula="${f.cedula || '—'}", ` +
        `nombre="${f.nombre || '—'}", prima="${f.prima ?? '—'}" → ${f.razon}`
      );
    }
  }

  if (agrupado.size === 0) {
    throw new Error(
      `No se encontraron registros válidos en "${file.originalname}" (hoja "${ws.name}"). ` +
      `Verifique que haya filas con cédula numérica, nombre y prima mayor a cero.`
    );
  }

  return { agrupado, totalFilas, advertencias };
}

module.exports = { meta, detect, parse };
