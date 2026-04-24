// ============================================================================
//  utils/importParsers/parserAdecco.js
//  Parser para archivos Excel del formato ADECCO / Collective Mining.
//  (FORMATO_NOVEDADES_CM_<n>Q_<MES>_<AÑO>.xlsx)
//
//  DETECCIÓN — señales exclusivas de este formato (cualquiera basta):
//    • Nombre del archivo contiene "FORMATO" + "NOVEDADES" (o "FORMATO NOV")
//    • Nombre del archivo contiene "ADECCO"
//    • El buffer del xlsx contiene la hoja "Ocasionales" Y "Maestro Original"
//    • El buffer contiene la cadena "FORMATO GENERAL DE REPORTE DE NOVEDADES"
//
//  HOJAS PROCESADAS (cada una mapea a su subtabla en BD):
//    • Ocasionales        → NO_NOVED + NO_OCASI
//    • Fijas              → NO_NOVED + NO_FIJAS  (devueltas como tipo FIJA)
//    • Ausentismos Vacaciones → NO_NOVED + NO_AUSEN (devueltas como tipo AUSENTISMO)
//    • Cambios e Ingresos → NO_NOVED + NO_CAMBI  (devueltas como tipo CAMBIO)
//
//  ESTRUCTURA DE CADA HOJA:
//    Ocasionales (datos desde fila 9):
//      Col B: Identificación (cédula)
//      Col C: Nombre
//      Col D: Novedad (nombre del concepto)
//      Col F: Cantidad
//      Col G: Valor
//      Col H: Observaciones
//
//    Fijas (datos desde fila 9):
//      Col B: Identificación  Col C: Nombre  Col D: Novedad
//      Col F: Cantidad  Col G: Valor  Col H: Fecha Inicial
//      Col I: Fecha Final  Col J: Aplicación  Col K: Cuenta  Col L: Cuotas
//      Col M: Observaciones
//
//    Ausentismos Vacaciones (datos desde fila 10):
//      Col B: Identificación  Col C: Nombre  Col D: Ausentismo
//      Col E: Fecha Inicial  Col F: Fecha Final  Col G: Días totales
//      Col H: Diagnóstico  Col I: Prórroga  Col J: Observaciones
//
//    Cambios e Ingresos (datos desde fila 9):
//      Col B: Identificación  Col C: Nombre  Col D: Cambio
//      Col E: Fecha Inicial  Col F: Cambio a  Col G: Observaciones
//
//  CONTRATO DE SALIDA (parseResult):
//    {
//      agrupado: Map<cedula, { cedula, nombre, novedades: Map<codConc, Novedad> }>,
//      advertencias: string[],
//      totalFilas: number,
//    }
//    donde Novedad = { valor, cantidad, tipo, label, extra: {} }
//
//  Los campos extra (fechas, diagnóstico, etc.) se pasan en la propiedad `extra`
//  para que el controller los persista en las subtablas correctas.
// ============================================================================

'use strict';

const ExcelJS    = require('exceljs');
const { Readable } = require('stream');

// ─── Meta ─────────────────────────────────────────────────────────────────────
const meta = {
  id:       'adecco-novedades',
  nombre:   'Excel — Formato Novedades ADECCO (Collective Mining)',
  formatos: ['.xlsx'],
};

// ─── Señales de detección (normalizadas) ──────────────────────────────────────
const SEÑALES_ADECCO = [
  'formato general de reporte de novedades',
  'collective mining',          // encabezado de todas las hojas
  'maestro original',           // hoja exclusiva de este formato
];

// Nombres de hoja que, en conjunto, identifican el formato sin ambigüedad
const HOJAS_ADECCO = ['ocasionales', 'fijas', 'maestro original'];

function norm(s) {
  return String(s || '')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Detección rápida (síncrona) ──────────────────────────────────────────────
// Inspecciona el nombre del archivo y el contenido binario del buffer.
// Se ejecuta ANTES de parsear el workbook completo.
function detect(file) {
  const nombre = norm(file.originalname || '');

  // 1. Nombre del archivo contiene patrones inequívocos
  const esFormatoNov = nombre.includes('formato') &&
                       (nombre.includes('novedad') || nombre.includes('nov'));
  const esAdecco     = nombre.includes('adecco');
  if (esFormatoNov || esAdecco) return true;

  // 2. Inspección del buffer (texto bruto del ZIP interno)
  const buf = file.buffer;
  if (!buf || buf.length < 4) return false;
  // Los xlsx sin cifrar son ZIP (magic PK); los cifrados ya vienen descifrados
  // por decryptIfNeeded() en el controller, así que aquí siempre es ZIP.
  if (buf[0] !== 0x50 || buf[1] !== 0x4B) return false;

  try {
    // Buscar en el contenido binario como texto latin1 (preserva bytes)
    const raw  = buf.toString('latin1');
    const text = norm(raw);

    // ¿Contiene señales exclusivas del formato ADECCO?
    for (const señal of SEÑALES_ADECCO) {
      if (text.includes(norm(señal))) return true;
    }

    // ¿Contiene las tres hojas clave?
    const hojasPresentas = HOJAS_ADECCO.filter(h => text.includes(h));
    if (hojasPresentas.length >= 2) return true;

  } catch (_) { /* no bloquear si falla */ }

  return false;
}

// ─── Helpers ──────────────────────────────────────────────────────────────────
function getCellVal(cell) {
  const v = cell.value;
  if (v === null || v === undefined) return null;
  if (v instanceof Date) return v;
  if (typeof v === 'object') {
    if (Array.isArray(v.richText)) return v.richText.map(r => r.text || '').join('').trim();
    if ('result' in v) return v.result;
    if ('text'   in v) return v.text;
  }
  return v;
}

function getCellStr(cell) {
  const v = getCellVal(cell);
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s === '' ? null : s;
}

function getCellNum(cell) {
  const v = getCellVal(cell);
  if (v === null || v === undefined) return null;
  const n = Number(v);
  return isNaN(n) ? null : n;
}

function getCellDate(cell) {
  const v = getCellVal(cell);
  if (!v) return null;
  if (v instanceof Date) return v;
  // Intentar parsear string de fecha
  const s = String(v).trim();
  if (!s) return null;
  for (const fmt of ['DD/MM/YYYY', 'YYYY-MM-DD', 'MM/DD/YYYY']) {
    // Parseo manual simple
    const parts = s.split(/[-\/]/);
    if (parts.length === 3) {
      const [a, b, c] = parts.map(Number);
      // DD/MM/YYYY
      if (b >= 1 && b <= 12 && a >= 1 && a <= 31) {
        const d = new Date(c, b - 1, a);
        if (!isNaN(d)) return d;
      }
    }
  }
  const d = new Date(s);
  return isNaN(d) ? null : d;
}

function parseCedula(cell) {
  const v = getCellVal(cell);
  if (!v) return null;
  const s = String(v).trim().split('.')[0].replace(/\D/g, '');
  return s.length > 0 ? s : null;
}

// ─── Registrar / acumular novedad en el Map agrupado ─────────────────────────
function registrarNovedad(agrupado, cedula, nombre, codConc, novedad, advertencias) {
  if (!agrupado.has(cedula)) {
    agrupado.set(cedula, { cedula, nombre, novedades: new Map() });
  }
  const emp = agrupado.get(cedula);
  // Actualizar nombre si está vacío
  if (!emp.nombre && nombre) emp.nombre = nombre;

  if (!codConc) return; // concepto no encontrado — ya fue reportado como advertencia

  if (emp.novedades.has(codConc)) {
    // Acumular cantidades numéricas
    const existing = emp.novedades.get(codConc);
    if (typeof novedad.cantidad === 'number') {
      existing.cantidad = (existing.cantidad || 0) + novedad.cantidad;
    }
    if (typeof novedad.valor === 'number') {
      existing.valor = (existing.valor || 0) + novedad.valor;
    }
  } else {
    emp.novedades.set(codConc, { ...novedad });
  }
}

// ─── Parse ────────────────────────────────────────────────────────────────────
async function parse(file, context) {
  const wb = new ExcelJS.Workbook();
  await wb.xlsx.read(Readable.from(file.buffer));

  const advertencias = [];
  const agrupado     = new Map();  // Map<cedula, { cedula, nombre, novedades }>
  let   totalFilas   = 0;

  // Mapa de conceptos: nombre normalizado → COD_CONC
  // Se carga dinámicamente desde la BD si está disponible en context,
  // o se usa el mapa estático de respaldo.
  const concMap = await buildConcMap(context);

  // ── 1. Ocasionales ──────────────────────────────────────────────────────────
  const wsOcasi = wb.getWorksheet('Ocasionales');
  if (wsOcasi) {
    wsOcasi.eachRow((row, rowNum) => {
      if (rowNum < 9) return; // encabezados y resumen arriba
      const cedula  = parseCedula(row.getCell(2));
      if (!cedula) return;
      const nombre   = getCellStr(row.getCell(3));
      const novNom   = getCellStr(row.getCell(4));
      const cantidad = getCellNum(row.getCell(6));
      const valor    = getCellNum(row.getCell(7));
      const obs      = getCellStr(row.getCell(8));

      if (!novNom) return;
      totalFilas++;

      const codConc = concMap.get(norm(novNom));
      if (!codConc) {
        advertencias.push(`Ocasionales fila ${rowNum}: concepto "${novNom}" no encontrado en NO_CONCE.`);
        return;
      }

      registrarNovedad(agrupado, cedula, nombre, codConc, {
        tipo: 'OCASIONAL', label: novNom,
        cantidad: cantidad || 0,
        valor:    valor    || 0,
        extra:    { obs },
      }, advertencias);
    });
  } else {
    advertencias.push('Hoja "Ocasionales" no encontrada en el archivo.');
  }

  // ── 2. Fijas ────────────────────────────────────────────────────────────────
  const wsFijas = wb.getWorksheet('Fijas');
  if (wsFijas) {
    wsFijas.eachRow((row, rowNum) => {
      if (rowNum < 9) return;
      const cedula = parseCedula(row.getCell(2));
      if (!cedula) return;
      const nombre    = getCellStr(row.getCell(3));
      const novNom    = getCellStr(row.getCell(4));
      const cantidad  = getCellNum(row.getCell(6));
      const valor     = getCellNum(row.getCell(7));
      const fecIni    = getCellDate(row.getCell(8));
      const fecFin    = getCellDate(row.getCell(9));
      const aplicacion = getCellStr(row.getCell(10));
      const numCuenta = getCellStr(row.getCell(11));
      const cuotas    = getCellNum(row.getCell(12));
      const obs       = getCellStr(row.getCell(13));

      if (!novNom) return;
      totalFilas++;

      const codConc = concMap.get(norm(novNom));
      if (!codConc) {
        advertencias.push(`Fijas fila ${rowNum}: concepto "${novNom}" no encontrado en NO_CONCE.`);
        return;
      }

      registrarNovedad(agrupado, cedula, nombre, codConc, {
        tipo: 'FIJA', label: novNom,
        cantidad: cantidad || 1,
        valor:    valor    || 0,
        extra:    { fecIni, fecFin, aplicacion, numCuenta, cuotas, obs },
      }, advertencias);
    });
  }

  // ── 3. Ausentismos / Vacaciones ─────────────────────────────────────────────
  const wsAusen = wb.getWorksheet('Ausentismos Vacaciones');
  if (wsAusen) {
    wsAusen.eachRow((row, rowNum) => {
      if (rowNum < 10) return; // encabezado en fila 9
      const cedula = parseCedula(row.getCell(2));
      if (!cedula) return;
      const nombre      = getCellStr(row.getCell(3));
      const ausentismo  = getCellStr(row.getCell(4));
      const fecIni      = getCellDate(row.getCell(5));
      const fecFin      = getCellDate(row.getCell(6));
      const diasTotal   = getCellNum(row.getCell(7));
      const diagnostico = getCellStr(row.getCell(8));
      const prorroga    = getCellStr(row.getCell(9));
      const obs         = getCellStr(row.getCell(10));

      if (!ausentismo) return;
      totalFilas++;

      const codConc = concMap.get(norm(ausentismo));
      if (!codConc) {
        advertencias.push(`Ausentismos fila ${rowNum}: tipo "${ausentismo}" no encontrado en NO_CONCE.`);
        return;
      }

      registrarNovedad(agrupado, cedula, nombre, codConc, {
        tipo: 'AUSENTISMO', label: ausentismo,
        cantidad: diasTotal || 0,
        valor:    0,
        extra:    { fecIni, fecFin, diasTotal, diagnostico, prorroga, obs },
      }, advertencias);
    });
  }

  // ── 4. Cambios e Ingresos ───────────────────────────────────────────────────
  const wsCambi = wb.getWorksheet('Cambios e Ingresos');
  if (wsCambi) {
    wsCambi.eachRow((row, rowNum) => {
      if (rowNum < 9) return;
      const cedula = parseCedula(row.getCell(2));
      if (!cedula) return;
      const nombre      = getCellStr(row.getCell(3));
      const cambio      = getCellStr(row.getCell(4));
      const fecIni      = getCellDate(row.getCell(5));
      const valorNuevo  = getCellStr(row.getCell(6));
      const obs         = getCellStr(row.getCell(7));

      if (!cambio) return;
      totalFilas++;

      const codConc = concMap.get(norm(cambio));
      if (!codConc) {
        advertencias.push(`Cambios fila ${rowNum}: tipo "${cambio}" no encontrado en NO_CONCE.`);
        return;
      }

      registrarNovedad(agrupado, cedula, nombre, codConc, {
        tipo: 'CAMBIO', label: cambio,
        cantidad: 1,
        valor:    0,
        extra:    { fecIni, valorNuevo, obs },
      }, advertencias);
    });
  }

  // ── 5. Maestro Original ─────────────────────────────────────────────────────
  const maestro = parseMaestro(wb, advertencias);

  return { agrupado, advertencias, totalFilas, maestro };
}

// ─── Parser de la hoja Maestro Original ──────────────────────────────────────
// Devuelve un array de objetos con todos los campos crudos (sin resolver FKs).
// La resolución de llaves foráneas ocurre en el controller para poder reportar
// errores por fila en el panel de la interfaz.
function parseMaestro(wb, advertencias) {
  const ws = wb.getWorksheet('Maestro Original');
  if (!ws) {
    advertencias.push('Hoja "Maestro Original" no encontrada — sincronización de empleados no disponible.');
    return [];
  }

  // La fila 2 contiene los encabezados (fila 1 es título/logo)
  let headerRow = null;
  const colMap  = {};    // nombre_normalizado → índice de columna (1-based)

  ws.eachRow((row, rowNum) => {
    if (rowNum === 2) {
      headerRow = row;
      row.eachCell({ includeEmpty: true }, (cell, colNum) => {
        const h = getCellStr(cell);
        if (h) colMap[normHeader(h)] = colNum;
      });
    }
  });

  if (!headerRow) {
    advertencias.push('No se encontró fila de encabezados en "Maestro Original".');
    return [];
  }

  // Helper: obtener columna por nombre flexible
  function c(ws, row, ...nombres) {
    for (const n of nombres) {
      const idx = colMap[normHeader(n)];
      if (idx != null) return row.getCell(idx);
    }
    return { value: null }; // celda vacía sintética
  }

  const empleados = [];

  ws.eachRow((row, rowNum) => {
    if (rowNum <= 2) return; // fila 1 = título, fila 2 = encabezados

    // Cédula (columna "Cedula" o "Codigo")
    const cedulaCell = c(ws, row, 'Cedula', 'Cedula', 'cedula');
    const cedula = parseCedula(cedulaCell);
    if (!cedula) return;

    // Ignorar filas completamente vacías
    const rowValues = [];
    row.eachCell({ includeEmpty: false }, cell => rowValues.push(cell.value));
    if (rowValues.length <= 1) return;

    empleados.push({
      fila:         rowNum,
      cedula,
      codigoAlt:    getCellStr(c(ws, row, 'Codigo Alterno', 'codigo alterno')),
      tipoDoc:      getCellStr(c(ws, row, 'Tipo\nDocumento', 'Tipo Documento', 'tipo documento')),
      nombre:       getCellStr(c(ws, row, 'Nombre')),
      sexo:         getCellStr(c(ws, row, 'Sexo')),
      grupoSan:     getCellStr(c(ws, row, 'grupo \nsanguineo', 'grupo sanguineo', 'Grupo Sanguineo')),
      factorRh:     getCellStr(c(ws, row, 'factor\nrhh', 'factor rhh', 'Factor RH')),
      estadoCiv:    getCellStr(c(ws, row, 'Estado Civil', 'estado civil')),
      ciudadExped:  getCellStr(c(ws, row, 'ciudad expedicion', 'Ciudad Expedicion')),
      hijos:        getCellNum(c(ws, row, 'Hijos')),
      fechaNac:     getCellDate(c(ws, row, 'Fecha Nacimiento')),
      ciudad:       getCellStr(c(ws, row, 'Ciudad')),
      telefono1:    getCellStr(c(ws, row, 'Telefono1')),
      telefono2:    getCellStr(c(ws, row, 'Telefono2')),
      direccion:    getCellStr(c(ws, row, 'Direccion')),
      correo:       getCellStr(c(ws, row, 'Correo')),
      cargo:        getCellStr(c(ws, row, 'Cargo')),
      valorHora:    getCellNum(c(ws, row, 'Valor Hora')),
      tipoCta:      getCellStr(c(ws, row, 'Tipo Cuenta')),
      banco:        getCellStr(c(ws, row, 'Banco')),
      numeroCta:    getCellStr(c(ws, row, 'Numero Cta')),
      sucursal:     getCellStr(c(ws, row, 'Sucursal')),
      centroCosto:  getCellStr(c(ws, row, 'Centro Costo', 'Centro costos', 'centro de costos')),
      trabajaSab:   getCellStr(c(ws, row, 'Trabaja Sabado')),
      claseSal:     getCellStr(c(ws, row, 'Clase Salario')),
      pensionado:   getCellStr(c(ws, row, 'Pensionado')),
      modLiquid:    getCellStr(c(ws, row, 'Modo Liquidacion')),
      tipLiquid:    getCellStr(c(ws, row, 'Tipo Liquidacion')),
      extranjero:   getCellStr(c(ws, row, 'Extranjero')),
      resideExt:    getCellStr(c(ws, row, 'Reside Extrnjero', 'Reside Extranjero')),
      fechaIngreso: getCellDate(c(ws, row, 'Fecha Ingreso')),
      fechaRetiro:  getCellDate(c(ws, row, 'Fecha Retiro')),
      fechaFinal:   getCellDate(c(ws, row, 'Fecha Final')),
      cauRetiro:    getCellStr(c(ws, row, 'Causa Retiro')),
      contrato:     getCellStr(c(ws, row, 'Contrato')),
      tipContrato:  getCellStr(c(ws, row, 'Tipo Contrato')),
      metodo:       getCellStr(c(ws, row, 'Metodo')),
      pctRete:      getCellStr(c(ws, row, '% Rete')),
      dedVivienda:  getCellStr(c(ws, row, 'Valor Deduccion 1\nVIVIENDA', 'Valor Deduccion 1 VIVIENDA')),
      dedSalud:     getCellStr(c(ws, row, 'Valor Deduccion2\nSALUD(OTROS)', 'Valor Deduccion2 SALUD')),
      dedDepen:     getCellStr(c(ws, row, 'Valor Deduccion3\nDEPENDIENTES\n', 'Valor Deduccion3 DEPENDIENTES')),
      proSalud:     getCellStr(c(ws, row, 'Promedio Salud', 'Promedio salud')),
      eps:          getCellStr(c(ws, row, 'EPS')),
      afp:          getCellStr(c(ws, row, 'AFP')),
      caja:         getCellStr(c(ws, row, 'CAJA')),
      cesantias:    getCellStr(c(ws, row, 'CESANTIAS')),
      riesgo:       getCellStr(c(ws, row, 'Riesgo')),
      diasVacac:    getCellStr(c(ws, row, 'Dias Vacaciones')),
    });
  });

  return empleados;
}

// Normalizar encabezado de columna: quita tildes, saltos de línea, espacios extra
function normHeader(s) {
  return String(s || '')
    .replace(/\r?\n/g, ' ')
    .toLowerCase()
    .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

// ─── Mapa de conceptos NO_CONCE ───────────────────────────────────────────────
// Intenta cargar desde BD; si falla, usa tabla estática de respaldo.
async function buildConcMap(context) {
  const map = new Map();

  // Intentar cargar desde BD
  try {
    const { executeQuery } = require('../../config/database');
    const r = await executeQuery(
      `SELECT COD_CONC, NOM_CONC FROM dbo.NO_CONCE WHERE ACT_ESTA = 'A'`
    );
    if (r.recordset && r.recordset.length > 0) {
      for (const row of r.recordset) {
        map.set(norm(row.NOM_CONC), row.COD_CONC);
      }
      return map;
    }
  } catch (_) { /* caer al mapa estático */ }

  // Mapa estático de respaldo (basado en NO_CONCE de MineDax)
  const ESTATICO = {
    'ajuste de salario': 1,
    'auxilio de transporte o conectividad': 2,
    'bonificacion no salarial': 3,
    'bonificacion por retiro': 4,
    'cesantias parciales': 5,
    'descanso compensatorio': 6,
    'hora dominical o festiva ordinaria 175%': 7,
    'hora extra dominical o festiva diurna 200%': 8,
    'hora extra dominical o festiva nocturna 250%': 9,
    'horas extras diurnas 125%': 10,
    'horas extras nocturnas 175%': 11,
    'intereses cesantias parciales': 12,
    'prima servicios ajuste': 13,
    'recargo nocturno 35%': 14,
    'recargo nocturno dominical o festivo 210%': 15,
    'recargo dominical 0,75%': 16,
    'retefonte mayor vr. descontado': 17,
    'retroactivo': 18,
    'auxilio medicina prepagada corporativa': 19,
    'devengo poliza de vida corporativa': 20,
    'bonificacion ocasional (n.s)': 21,
    'bonificacion extralegal': 22,
    'ajustes extras y festivos': 23,
    'auxilio medicina prepagada': 24,
    'auxilio de transporte (-)': 25,
    'bono no salarial servicios de salud': 26,
    'auxilio de comunicaciones': 27,
    'prestamos a empleados condicionados': 28,
    'otras bonificaciones extralegales no salariales': 29,
    'descuento deuda empleado': 56,
    'descuento gafas': 60,
    'descuento ahorro coopebeneficencia': 61,
    'vacaciones disfrutadas': 63,
    'vacaciones en dinero': 64,
    'incapacidad general': 65,
    'incapacidad accidente laboral': 66,
    'incapacidad enfermedad laboral': 67,
    'permiso remunerado': 68,
    'licencia de maternidad': 69,
    'licencia de paternidad': 70,
    'sancion': 71,
    'licencia no remunerada': 72,
    'licencia por luto': 73,
    'compensatorio': 74,
    'dia de la familia': 75,
    'cargo': 76,
    'ccf': 77,
    'centro de costos': 78,
    'dato personal': 79,
    'eps': 80,
    'fondo cesantias': 81,
    'fondo de pensiones': 82,
    'pensionado': 83,
    'sabado dia habil': 84,
    'salario': 85,
    'sucursal': 86,
    'tipo de contrato': 87,
    'tipo de salario': 88,
    'jefe inmediato': 89,
    'codigo alterno': 90,
    'cuenta': 91,
  };
  for (const [k, v] of Object.entries(ESTATICO)) {
    map.set(k, v);
  }
  return map;
}

module.exports = { meta, detect, parse };
