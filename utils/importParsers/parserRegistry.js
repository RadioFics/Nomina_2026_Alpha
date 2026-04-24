// ============================================================================
//  utils/importParsers/parserRegistry.js
//  Registry central de parsers de archivos para importación masiva.
//
//  Arquitectura extensible:
//    • Cada parser se registra con una función `detect(file)` que retorna true
//      si ese parser puede manejar el archivo (según mimetype / extensión).
//    • La función `parse(file, context)` procesa el archivo y retorna el
//      resultado estándar { novedades: Map<cedula, EmpNovedades>, ... }.
//
//  Para agregar soporte a un nuevo formato:
//    1. Crear el archivo utils/importParsers/parserXYZ.js exportando { detect, parse, meta }.
//    2. Importarlo aquí y añadirlo al array PARSERS.
//
//  El orden importa: el primer parser cuyo detect() retorne true es el usado.
// ============================================================================

const parserExcel        = require('./parserExcel');
const parserPolizaSalud  = require('./parserPolizaSalud');
const parserPolizaVida   = require('./parserPolizaVida');
const parserAdecco       = require('./parserAdecco');
// Para agregar nuevos parsers, importarlos aquí:
// const parserPDF   = require('./parserPDF');
// const parserCSV   = require('./parserCSV');

/**
 * Array de parsers registrados (en orden de prioridad).
 * Cada entrada: { meta, detect, parse }
 *   - meta.id      : identificador único del parser
 *   - meta.nombre  : nombre legible (para logs/UI)
 *   - meta.formatos: lista de extensiones que soporta
 *   - detect(file) : (multer file object) → boolean
 *   - parse(file, context) → Promise<ParseResult>
 *
 * ParseResult = {
 *   agrupado: Map<cedula, { cedula, nombre, cargo, centroCostoNom, novedades: Map<codConc, cantidad> }>,
 *   advertencias: string[],   // avisos no fatales
 * }
 */
const PARSERS = [
  parserPolizaSalud, // más específico (salud) → debe ir PRIMERO para no ser absorbido por el de vida
  parserPolizaVida,  // específico (vida) → antes del parser genérico de Excel
  parserAdecco,      // ADECCO / Formato Novedades CM → antes del catch-all de Excel
  parserExcel,       // catch-all genérico → siempre al FINAL
  // parserPDF,
  // parserCSV,
];

/**
 * Obtener el parser adecuado para un archivo.
 * @param {object} file - Objeto multer (originalname, mimetype, buffer)
 * @returns {object|null} Parser encontrado o null si ninguno lo soporta
 */
function getParser(file) {
  for (const parser of PARSERS) {
    if (parser.detect(file)) return parser;
  }
  return null;
}

/**
 * Listar todos los formatos soportados (para mensajes de error/UI).
 */
function formatosSoportados() {
  return PARSERS.flatMap(p => p.meta.formatos);
}

module.exports = { getParser, formatosSoportados, PARSERS };
