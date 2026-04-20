// ============================================================================
//  utils/formatUsuario.js
//  Formatea el nombre de usuario para almacenarlo en ACT_USUA.
//
//  Regla: tomar las dos primeras letras de cada palabra del nombre completo,
//  capitalizando la primera y dejando minúscula la segunda.
//  Resultado siempre truncado a 8 caracteres (límite de char(8) en tablas MAE_*).
//
//  Ejemplos:
//    "Juan Esteban Calle Palmett"  → "JuEsCaPa"
//    "CALLE PALMETT JUAN ESTEBAN " → "CaPaJuEs"  (con padding de char(240))
//    "MineDax"                     → "MiNeDaX"   → "MiNe" (solo 1 palabra → 2 letras c/u)
//    "sa"                          → "sa"
//    ""  / null / undefined        → "MineDax"
// ============================================================================

/**
 * Convierte un nombre completo en un código de iniciales de 8 caracteres max.
 * @param {string|null|undefined} nombreCompleto
 * @returns {string}  Máximo 8 caracteres, nunca vacío.
 */
function formatUsuario(nombreCompleto) {
  if (!nombreCompleto || typeof nombreCompleto !== 'string') return 'MineDax';

  // Eliminar padding de char(N) y caracteres de control
  const limpio = nombreCompleto.trim();
  if (!limpio) return 'MineDax';

  // Si ya es corto (≤8) y no tiene espacios (código ya formateado), devolverlo
  if (limpio.length <= 8 && !limpio.includes(' ')) return limpio;

  // Dividir en palabras, filtrar vacíos
  const palabras = limpio.split(/\s+/).filter(Boolean);

  // Tomar las 2 primeras letras de cada palabra: primera mayúscula, segunda minúscula
  const iniciales = palabras
    .map(p => {
      const p1 = p[0] ? p[0].toUpperCase() : '';
      const p2 = p[1] ? p[1].toLowerCase() : '';
      return p1 + p2;
    })
    .join('');

  // Truncar a 8 caracteres (límite de char(8))
  return iniciales.slice(0, 8) || 'MineDax';
}

module.exports = { formatUsuario };
