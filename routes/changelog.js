// ============================================================================
//  routes/changelog.js
//  Genera automáticamente el historial de versiones a partir de los commits
//  de git. Cada commit cuyo mensaje empiece con "Upload Payroll" o contenga
//  un número de versión se trata como una versión publicada.
//  El resto de commits se agrupa como cambios internos de esa versión.
//
//  GET /api/changelog        → lista completa de versiones con sus cambios
//  GET /api/changelog/raw    → commits crudos de git (para debug)
// ============================================================================

const express  = require('express');
const { execSync } = require('child_process');
const path     = require('path');
const router   = express.Router();

const REPO_DIR = path.join(__dirname, '..');

// ─── Leer commits de git ──────────────────────────────────────────────────────
function getCommits() {
  try {
    const out = execSync(
      'git log --format="%H|||%ad|||%s|||%an|||%D" --date=short',
      { cwd: REPO_DIR, encoding: 'utf8', timeout: 5000 }
    );
    return out.trim().split('\n').map(line => {
      const [hash, date, subject, author, refs] = line.split('|||');
      return { hash, date, subject: (subject || '').trim(), author: (author || '').trim(), refs: (refs || '').trim() };
    }).filter(c => c.hash);
  } catch (e) {
    return [];
  }
}

// ─── Clasificar commits en versiones ─────────────────────────────────────────
// Un commit es "cabecera de versión" si su mensaje contiene una etiqueta de
// versión conocida: "Upload Payroll V*", "v0.*", "v1.*", "Initial commit", etc.
function esVersionPrincipal(subject) {
  return /upload payroll/i.test(subject) ||
         /\bv\d+\.\d+/i.test(subject);
  // "Initial commit" se absorbe como commit interno de la primera versión
}

// Mapear mensaje de commit a etiqueta de versión legible
function etiquetaVersion(subject, index, total) {
  const matchV = subject.match(/V(\d+\.\d+(?:\.\d+)?)/i);
  if (matchV) return `v${matchV[1]}`;
  if (/initial commit/i.test(subject)) return 'v0.1';
  // Asignar número secuencial si no hay versión explícita
  return `v0.${total - index}`;
}

// Convertir mensaje de commit en descripción legible para el changelog
function descripcionCommit(subject) {
  return subject
    .replace(/upload payroll\s*/i, '')
    .replace(/^V\d+\.\d+\s*/i, '')
    .trim() || subject;
}

// ─── Catálogo de cambios conocidos por versión ────────────────────────────────
// Complementa los commits con descripciones elaboradas cuando están disponibles.
const CATALOG = {
  'v0.1': {
    titulo: 'Lanzamiento inicial — Base del sistema',
    resumen: [
      'Interfaz web de gestión de nómina para Collective Mining',
      'Módulo de novedades ocasionales con formulario y tabla',
      'Módulo de novedades fijas',
      'Módulo de ausentismos',
      'Módulo de cambios e ingresos',
      'Sidebar de navegación con badges de conteo',
      'Dashboard con estadísticas del período activo',
      'Conexión a base de datos SQL Server (MineDax)',
      'Autenticación con login / cierre de sesión',
      'Exportación de nómina formato ADECCO',
    ],
    detalle: [
      { categoria: 'Infraestructura', items: [
        'Servidor Express.js con rutas REST por módulo (/api/ocasionales, /api/fijas, /api/ausentismos, /api/cambios)',
        'Pool de conexiones SQL Server con mssql, configuración vía .env',
        'Autenticación JWT con bcrypt para contraseñas hasheadas',
        'Servicio de archivos estáticos y SPA de una sola página (index_novedades.html)',
        'Detección automática del período activo por fecha del sistema (NO_PERIOD)',
      ]},
      { categoria: 'Base de datos', items: [
        'Integración con tablas NO_NOVED, NO_OCASI, NO_FIJAS, NO_AUSEN, NO_CAMBI',
        'Tablas maestras: GN_FUNCI, GN_TERCE, NO_CONCE, NO_PERIOD, MAE_CCOST, MAE_CARGO',
        'Creación automática de objetos BD al inicio (ensureDbObjects)',
        'Soporte para COD_EMPR multitenant (filtrado por empresa)',
      ]},
      { categoria: 'Interfaz', items: [
        'Diseño dark theme con tipografías Barlow / Barlow Condensed',
        'Autocompletado de empleados por cédula o nombre contra GN_FUNCI + GN_TERCE',
        'Formularios de ingreso con validación en tiempo real',
        'Tablas con búsqueda, paginación y badges de conteo en sidebar',
        'Modales de confirmación para edición y anulación de registros',
        'Alertas de feedback (éxito / error) con auto-cierre',
      ]},
      { categoria: 'Exportación', items: [
        'Generación del archivo ADECCO (.xlsx) con formato oficial de nómina',
        'Botón "Exportar ADECCO" en el header con descarga directa',
      ]},
    ],
  },
  'v0.2': {
    titulo: 'Importación masiva y autenticación robusta',
    resumen: [
      'Módulo de Importar Excel para carga masiva de novedades',
      'Parser genérico para formato "Reporte Final" (horas extras y recargos)',
      'Sistema de autenticación completo con reset de contraseña',
      'Configuración de BD vía interfaz web (db-config.html)',
      'Scripts de diagnóstico y gestión de usuarios',
      'Reorganización de documentación técnica en txtFiles/',
    ],
    detalle: [
      { categoria: 'Importación Excel', items: [
        'Endpoint POST /api/ocasionales/importar-excel con multer (multipart)',
        'parserExcel.js: detecta hoja "Reporte Final", mapea 9 tipos de novedad por columna',
        'Soporte para múltiples archivos simultáneos (campo archivos[])',
        'Resultado por archivo: filas leídas, empleados procesados, insertados, acumulados, errores',
        'Lógica de acumulación: si ya existe NO_NOVED para el empleado+concepto+período, suma la cantidad',
        'Interfaz de arrastrar-y-soltar con barra de progreso animada',
        'Tabla de resultados detallada con estado por registro (✓ insertado / ✓ acumulado / ✗ error)',
      ]},
      { categoria: 'Autenticación', items: [
        'Login con JWT, expiración configurable, refresh implícito por actividad',
        'Página de reset de contraseña (reset-password.html)',
        'Scripts CLI para crear, ver y gestionar usuarios (script-gestionar-usuarios.js)',
        'Página de configuración de conexión BD (db-config.html) con prueba de conexión en vivo',
      ]},
      { categoria: 'Infraestructura', items: [
        'Migración de tablas fijas/ausencias/cambios con script automatizado',
        'Validación de variables de entorno al arranque (validate-env.js)',
        'Scripts de diagnóstico de conexión y esquema (diagnostico-conexion-bd.js)',
      ]},
    ],
  },
  'v0.3': {
    titulo: 'Pólizas corporativas y exportación ADECCO mejorada',
    resumen: [
      'Parser automático para Póliza de Vida Corporativa (COD_CONC 20 y 52)',
      'Parser automático para Póliza de Salud / Medicina Prepagada (COD_CONC 19, 51 y 56)',
      'Sistema de fingerprinting para distinguir tipos de documento Excel automáticamente',
      'Registry extensible de parsers con detección por contenido y nombre',
      'Corrección de detección multi-hoja (COLLECTIVE con título en fila 1)',
      'Mejoras en exportación ADECCO y controlador de nómina',
    ],
    detalle: [
      { categoria: 'Importación — Póliza de Vida', items: [
        'parserPolizaVida.js: detecta archivos "RELACION DE COBROS POLIZA DE VIDA" por nombre y contenido',
        'Lee hoja COLLECTIVE (encabezados en fila 2) o Hoja1 consolidada (fila 1)',
        'Genera COD_CONC 20 (Devengo Póliza de Vida Corporativa) y COD_CONC 52 (Deducción) por empleado',
        'Detección dinámica de fila de encabezados (tolerante a títulos en fila 1)',
        'Mapeo automático de columnas: detecta cuál columna es PRIMA MENSUAL vs VALOR VIDA',
        'Agrupación por cédula: suma primas si el empleado aparece en varias filas',
      ]},
      { categoria: 'Importación — Póliza de Salud', items: [
        'parserPolizaSalud.js: detecta archivos "RELACION COBROS POLIZA SALUD" por nombre y contenido',
        'Lee hoja "RELACION COBROS SALUD" (estructura detallada) o Hoja1 (consolidado)',
        'Genera COD_CONC 19 (Auxilio Medicina Prepagada Corp.) por cada empleado con beneficio > 0',
        'Genera COD_CONC 51 (Descuento Medicina Prepagada Corp.) con el mismo valor',
        'Genera COD_CONC 56 (Descuento Deuda Empleado) solo cuando columna K tiene valor > 0',
        'Encabezados en fila 2 (fila 1 = título general de la empresa)',
      ]},
      { categoria: 'Fingerprinting de documentos', items: [
        'fingerprintExcel.js: módulo centralizado de identificación de tipo de documento',
        'fingerprintBuffer(): inspección síncrona del ZIP interno (latin1, sin descomprimir)',
        'fingerprintBufferAsync(): descompresión real con jszip para máxima precisión',
        'fingerprintWorkbook(): análisis sobre workbook ExcelJS ya cargado',
        'getHojaConsolidada(): selección de hoja correcta validando encabezados, no solo nombre',
        '_hojaContieneEncabezadosVida(): revisa hasta fila 10 para tolerar títulos superiores',
        'Señales exclusivas por tipo: "beneficio collective mining" → salud; "prima mensual" → vida',
        'parserRegistry.js actualizado: salud → vida → genérico (orden de prioridad)',
      ]},
      { categoria: 'Correcciones', items: [
        'Detecta hoja COLLECTIVE aunque tenga título en fila 1 (antes fallaba con "encabezados no encontrados")',
        'Hoja1 de salud ya no es tomada por el parser de vida (col C = BENEFICIO ≠ PRIMA MENSUAL)',
        'Exclusión mutua explícita: "salud" en nombre → jamás toma parser de vida y viceversa',
        'Inserción no atómica en importación SQL: cada registro falla independientemente con PRINT de error',
      ]},
    ],
  },
};

// ─── GET /api/changelog ───────────────────────────────────────────────────────
router.get('/', (req, res) => {
  const commits  = getCommits();
  const versions = [];
  let buffer     = [];
  const versionCount = commits.filter(c => esVersionPrincipal(c.subject)).length;
  let vIdx = 0;

  for (let i = 0; i < commits.length; i++) {
    const c = commits[i];
    if (esVersionPrincipal(c.subject)) {
      const etiqueta = etiquetaVersion(c.subject, vIdx, versionCount);
      const catalog  = CATALOG[etiqueta] || {};
      versions.push({
        version:     etiqueta,
        fecha:       c.date,
        commit:      c.hash.substring(0, 7),
        titulo:      catalog.titulo || descripcionCommit(c.subject),
        resumen:     catalog.resumen || [],
        detalle:     catalog.detalle || [],
        commits:     [c, ...buffer],
      });
      buffer = [];
      vIdx++;
    } else {
      buffer.push(c);
    }
  }

  // Commits antes del primer tag de versión → agruparlos en "En desarrollo"
  if (buffer.length > 0) {
    versions.push({
      version: 'dev',
      fecha:   buffer[0]?.date || '',
      commit:  '',
      titulo:  'Cambios en desarrollo (sin versión asignada)',
      resumen: buffer.map(c => c.subject),
      detalle: [],
      commits: buffer,
    });
  }

  res.json({ ok: true, versiones: versions });
});

// ─── GET /api/changelog/raw ───────────────────────────────────────────────────
router.get('/raw', (req, res) => {
  res.json({ ok: true, commits: getCommits() });
});

module.exports = router;
