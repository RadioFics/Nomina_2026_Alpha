// ============================================================================
//  config/userHelper.js
//  Utilidades para derivar el identificador de usuario (ACT_USUA) que se
//  persiste en las tablas de auditoría de la base de datos MineDax.
//
//  Restricción de la BD: ACT_USUA es char(8) en las tablas maestras y
//  nvarchar(50) en las tablas de novedades (NO_NOVED, NO_OCASI, etc.).
//  Para mantener consistencia se usa siempre la abreviatura de máx 8 chars.
//
//  Algoritmo de abreviatura:
//    Tomar la 1ª letra (MAYÚSCULA) y la 2ª letra (minúscula) de cada palabra
//    del nombre completo, hasta completar 8 caracteres.
//    Ej: "CALLE PALMETT JUAN ESTEBAN" → "CaPaJuEs"
// ============================================================================

/**
 * Genera la abreviatura de usuario a partir del nombre completo.
 * @param {string} nombreCompleto
 * @returns {string} máximo 8 caracteres
 */
function generarAbrUsuario(nombreCompleto) {
  if (!nombreCompleto || !String(nombreCompleto).trim()) return 'MineDax';
  const palabras = String(nombreCompleto).trim().split(/\s+/).filter(Boolean);
  let abr = '';
  for (const palabra of palabras) {
    if (abr.length >= 8) break;
    // Quitar caracteres no alfabéticos
    const p = palabra.replace(/[^a-zA-ZáéíóúÁÉÍÓÚüÜñÑ]/g, '');
    if (!p) continue;
    abr += p[0].toUpperCase();
    if (abr.length < 8 && p.length > 1) abr += p[1].toLowerCase();
  }
  return abr || 'MineDax';
}

/**
 * Extrae el identificador de usuario (ACT_USUA) desde un objeto request.
 * Orden de prioridad:
 *   1. Header 'x-abr-usua'  (frontend lo envía explícitamente tras el login)
 *   2. Header 'x-usuario'   (legacy, puede contener nombre completo → se trunca a 8)
 *   3. req.body.usuario      (legacy body param → se trunca a 8)
 *   4. Fallback 'MineDax'
 *
 * @param {object} req  Express request object
 * @returns {string} abreviatura de máx 8 chars, lista para ACT_USUA
 */
function getActUsua(req) {
  // 1. Header dedicado con la abreviatura ya calculada en el cliente
  const abrHeader = req.headers['x-abr-usua'];
  if (abrHeader && abrHeader.trim()) {
    return abrHeader.trim().substring(0, 8);
  }

  // 2. Header legacy con el nombre completo o abreviatura
  const usuaHeader = req.headers['x-usuario'];
  if (usuaHeader && usuaHeader.trim()) {
    const v = usuaHeader.trim();
    // Si ya parece una abreviatura (≤8 chars, sin espacios) → usar directo
    if (v.length <= 8 && !v.includes(' ')) return v;
    // Si es nombre completo → generar abreviatura
    return generarAbrUsuario(v);
  }

  // 3. Body param legacy
  const bodyUsuario = req.body && req.body.usuario;
  if (bodyUsuario && String(bodyUsuario).trim()) {
    const v = String(bodyUsuario).trim();
    if (v.length <= 8 && !v.includes(' ')) return v;
    return generarAbrUsuario(v);
  }

  return 'MineDax';
}

module.exports = { generarAbrUsuario, getActUsua };
