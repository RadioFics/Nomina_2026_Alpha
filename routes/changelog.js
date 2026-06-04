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
// Un commit es "cabecera de versión" solo si su mensaje EMPIEZA con uno de los
// patrones de versión reconocidos. Esto evita que commits con menciones
// incidentales de números de versión (p.ej. "feat: changelog V0.14-V0.20.1...")
// sean clasificados erróneamente como versiones.
function esVersionPrincipal(subject) {
  const s = (subject || '').trim();
  // "Upload Payroll V0.X", "Update Payroll V0.X", "Payroll V0.X"
  return /^(upload\s+|update\s+)?payroll\s+v\d+/i.test(s);
}

// Mapear mensaje de commit a etiqueta de versión legible
function etiquetaVersion(subject) {
  const matchV = (subject || '').match(/V(\d+\.\d+(?:\.\d+)?)/i);
  if (matchV) return `v${matchV[1]}`;
  return null; // no debería llegar aquí con la nueva esVersionPrincipal
}

// Parsear "v0.20.1" → [0, 20, 1] para ordenar numéricamente
function parseVerNum(vStr) {
  if (!vStr || vStr === 'dev') return [-1, -1, -1];
  return (vStr || '').replace(/^v/i, '').split('.').map(Number).concat([0, 0, 0]).slice(0, 3);
}
function cmpVersiones(a, b) {
  const pa = parseVerNum(a.version);
  const pb = parseVerNum(b.version);
  for (let i = 0; i < 3; i++) {
    if (pb[i] !== pa[i]) return pb[i] - pa[i]; // descendente: mayor primero
  }
  return 0;
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
  // ── Versiones recientes ─────────────────────────────────────────────────────

  'v0.20.1': {
    titulo: 'Correcciones críticas de frontend y mejoras de sesión',
    resumen: [
      'Corregido crash silencioso en novedades.js: tres accesos síncronos al DOM producían TDZ para _selOcas y dejaban todos los eventos sin registrar',
      'Corrección del trigger TR_NO_NOVED_PERIODO_CERRADO: ahora permite anulaciones lógicas (A→I) en períodos cerrados sin bloquear el batch',
      'Anulación masiva restaurada: los 4 controllers (Ocasionales, Fijas, Ausentismos, Cambios) procesan todos los seleccionados, límite ampliado a 2.000',
      'Login: "Recuérdame" renombrado a "Recordar contraseña"; auto-redirige al app si el token guardado sigue vigente',
      'Agregado botón "Cerrar sesión" en el header del app',
      'Modales de edición unificados: títulos usan var(--cm-blue-light) en los 5 modales (antes algunos mostraban dorado)',
      'Plantillas de email centralizadas en EMAIL_CFG (config/mailer.js): colores, textos y pie de página editables en un solo lugar',
      'Corregido contraste del link de recuperación: texto blanco sobre fondo azul oscuro (#3A5A70) en lugar de teal sobre gris',
    ],
    detalle: [
      { categoria: 'src/js/novedades.js', items: [
        'Bug: #dropZone ya no existe en el HTML (renombrado a #dropZoneExcel/#dropZonePDF); null.addEventListener() crasheaba el script completo en la línea 3725, dejando todos los sets/eventos sin inicializar después',
        'Bug: modalExportarAdecco y modalAnularBatch se declaran DESPUÉS del <script> en el HTML, por lo que los addEventListener síncronos fallaban con null',
        'Fix: los tres accesos problemáticos envueltos en DOMContentLoaded con null-guard',
        'Nueva función cerrarSesion(): limpia authToken, usuario, rememberEmail de localStorage/sessionStorage y redirige a /',
      ]},
      { categoria: 'controllers/*.js (ocasionales, fijas, ausentismos, cambios)', items: [
        'ausentismosController.ensureDbObjects(): ALTER TRIGGER dbo.TR_NO_NOVED_PERIODO_CERRADO — agrega cláusula RETURN anticipado si el UPDATE es una transición ACT_ESTA A→I (anulación lógica) en un período cerrado',
        'Los cuatro anularBatch(): cláusula de período eliminada — WHERE solo filtra COD_EMPR, COD_NOVED y ACT_ESTA=\'A\'',
        'Límite de registros por batch cambiado de 500 a 2.000 en todos los controllers',
      ]},
      { categoria: 'index_novedades.html', items: [
        'Cinco modales de edición: color de título cambiado de var(--gold-light) a var(--cm-blue-light) (#4DC4E0)',
        'modalEditOcas: fondo y borde hardcodeados reemplazados por var(--surface) y var(--border)',
        'Botón "Cerrar sesión" añadido al header con hover rojo',
      ]},
      { categoria: 'src/js/login.js', items: [
        'Nueva función _tokenValido(token): decodifica el JWT, verifica exp * 1000 > Date.now()',
        'DOMContentLoaded: si localStorage.authToken existe y es válido, redirige a /index_novedades.html sin pasar por el formulario',
        'Restauración del email guardado en campo loginEmail al cargar',
      ]},
      { categoria: 'config/mailer.js', items: [
        'Objeto EMAIL_CFG al inicio del archivo: accentBlue, accentLight, bgOuter, bgCard, bgBlock, textPrimary, textSecond, textMuted, linkText (#FFF), linkBg (#3A5A70), linkBorder, brandName, brandSub, footerAuto, footerCopy',
        'Funciones _emailHeader, _emailFooter, _wrap() refactorizadas para leer de EMAIL_CFG',
        'emailRecuperacion y emailVerificacion: cuadro de link fallback cambiado a fondo azul oscuro (#3A5A70) con texto blanco — contraste AA',
      ]},
    ],
  },

  'v0.20': {
    titulo: 'Reorganización de archivos y documentación del proyecto',
    resumen: [
      'CLAUDE.md creado con documentación completa de la arquitectura para asistentes de código',
      'Archivos de documentación y scripts auxiliares organizados en subcarpetas (docs/, database/, python/)',
      'Scripts Python legacy (importar_adecco.py, rellenar_pdf.py, etc.) movidos a python/',
      'Herramientas de documentación (db-config.html, GN_USUAR.ipynb) movidas a docs/',
      'Scripts SQL movidos a database/',
    ],
    detalle: [
      { categoria: 'CLAUDE.md (nuevo)', items: [
        'Documenta arquitectura general: flujo de request, frontend, backend, convenciones de BD',
        'Sección de comandos de desarrollo: npm start, npm run dev, kill-server, health check',
        'Tabla de módulos de novedades: Ocasionales, Fijas, Ausentismos, Cambios con rutas y tablas',
        'Describe la canalización de importación y el sistema de parsers extensible',
        'Modelo de seguridad: blocklist middleware, niveles de acceso COD_GUSU 1-3',
        'Instrucciones de entorno local (.env) y producción (Azure Managed Identity)',
      ]},
      { categoria: 'Reorganización de carpetas', items: [
        'docs/: AZURE_SETUP.md, DATABASE_SETUP_ORDER.md, DEPLOYMENT_CHECKLIST.md, ENV_EXAMPLE, Informe_Tecnico_Nomina2026.md, db-config.html, GN_USUAR.ipynb, EJEMPLOS_EDICION.html',
        'database/: fix_estciv.sql, fix_estciv_bd.sql y scripts SQL de mantenimiento',
        'python/: 01_pdf_extractor.py, 02_database_handler.py, 03_web_app.py, generar_documentos_MineDax.py, import_excel.py, importar_adecco.py, pdf_import_extension.py',
        'Sin cambios funcionales en controllers, routes ni lógica de negocio',
      ]},
    ],
  },

  'v0.19': {
    titulo: 'Módulo de Gráficos & Analítica — métricas en tiempo real',
    resumen: [
      'Nueva pestaña "Gráficos & Analítica" con 5 endpoints y 8 gráficos interactivos (Chart.js)',
      'KPIs del período activo: empleados con novedades, total registros, devengos, deducciones y días de ausentismo',
      'Gráfico de distribución por tipo de novedad (donut) y Top 10 empleados por ausentismo (barras)',
      'Trazabilidad histórica: devengos vs deducciones por período, ausentismos históricos, tipos más frecuentes',
      'Panel de centros de costo: novedades y ausentismos por CC en gráficos de barras horizontales',
      'Selector de período con opción "Todos los períodos" para análisis cruzado',
    ],
    detalle: [
      { categoria: 'controllers/graficosController.js (nuevo)', items: [
        'GET /api/graficos/resumen: KPIs del período — COUNT empleados únicos, COUNT novedades, SUM devengos/deducciones, SUM días ausentismo',
        'GET /api/graficos/historico: devengos y deducciones agrupados por período (NO_OCASI + NO_FIJAS)',
        'GET /api/graficos/novedades: distribución de registros por TIP_NATU y período',
        'GET /api/graficos/ausentismos: top 10 empleados + tipos de ausentismo más frecuentes con LEFT JOIN a MAE_COAUS',
        'GET /api/graficos/centros: novedades y ausentismos agrupados por centro de costo (MAE_CCOST)',
        'Helper resolverPeriodoActual(): busca en NO_PERIOD donde GETDATE() está entre PER_FINI y PER_FFIN',
      ]},
      { categoria: 'routes/graficos.js (nuevo)', items: [
        'GET /api/graficos/resumen → graficosController.resumen',
        'GET /api/graficos/historico → graficosController.historico',
        'GET /api/graficos/novedades → graficosController.novedades',
        'GET /api/graficos/ausentismos → graficosController.ausentismos',
        'GET /api/graficos/centros → graficosController.centros',
        'Todos los endpoints protegidos con verifyToken y checkLevel(2)',
      ]},
      { categoria: 'index_novedades.html — Pestaña Gráficos', items: [
        'Página page-graficos añadida al sidebar como nueva sección con ícono de gráfico',
        'Filtro superior: selector grf_periodo + botón Actualizar + spinner de carga',
        'Sección "Período activo": fila de 5 KPI cards con accent colors por tipo',
        'Sección "Trazabilidad histórica": gráfico bar grouped (devengos/deducciones), line chart (ausentismos), bar horizontal (tipos de ausentismo), bar grouped (centros de costo)',
        'Todos los canvas registrados en graficosCargar() con destroy() preventivo para evitar duplicados',
      ]},
      { categoria: 'src/js/novedades.js', items: [
        '+564 líneas: función graficosCargar() que obtiene datos en paralelo (Promise.all) y construye los 8 charts',
        'graficosInicializarPeriodos(): carga NO_PERIOD y puebla el selector al abrir la pestaña',
        'navigate(\'graficos\') llama graficosInicializarPeriodos() automáticamente',
      ]},
    ],
  },

  'v0.18': {
    titulo: 'Separación completa de JS — novedades.js a src/js/',
    resumen: [
      'Migración completada: todo el JavaScript de index_novedades.html movido a src/js/novedades.js (~4.200 líneas)',
      'index_novedades.html reducido en ~8.600 líneas; ahora es solo markup + <script src="src/js/novedades.js">',
      'CLAUDE.md inicializado con documentación de arquitectura y comandos de desarrollo',
      'js/api.js refactorizado: funciones redundantes comentadas para evitar conflictos con novedades.js',
    ],
    detalle: [
      { categoria: 'index_novedades.html', items: [
        'Todo el bloque <script> interno (~8.600 líneas de JS) eliminado y reemplazado por un único <script src="src/js/novedades.js">',
        'El HTML resultante es markup puro: estructura de secciones, modales y formularios sin lógica incrustada',
        'Separación permite edición independiente del JS sin impactar el DOM del HTML',
      ]},
      { categoria: 'js/api.js', items: [
        'Funciones duplicadas (cargarEmpleados, cargarPeriodos, etc.) comentadas para evitar colisiones con las versiones en novedades.js',
        'Nota de compatibilidad añadida al encabezado del archivo',
      ]},
    ],
  },

  'v0.17': {
    titulo: 'Separación de JavaScript — extracción a src/js/novedades.js',
    resumen: [
      'Inicio de la separación: JavaScript de la app principal extraído de index_novedades.html a src/js/novedades.js',
      'index_novedades.html reorganizado (~17.500 líneas procesadas) con nuevas secciones de PDF y solicitudes',
      'Nuevo endpoint GET /api/auth/datos: devuelve datos del empleado (GN_TERCE) vinculado al usuario logueado',
      'Motor Python de extracción ampliado (+532 líneas): mejor manejo de múltiples tipos de formularios y OCR',
      'importarPDFController.js actualizado con flujo de previsualización previa al confirmar',
    ],
    detalle: [
      { categoria: 'controllers/authController.js', items: [
        'Nueva función exports.obtenerDatosTerce: SELECT de APE_TERC, SEG_APEL, NOM_TERC, SEG_NOMB desde GN_TERCE JOIN GN_FUNCI JOIN GN_USUAR por usuarioId',
        'Devuelve 404 si el usuario no tiene empleado vinculado (COD_FUNCI null)',
      ]},
      { categoria: 'routes/auth.js', items: [
        'Nueva ruta GET /api/auth/datos → authController.obtenerDatosTerce (protegida con verifyToken)',
      ]},
      { categoria: 'python/procesar_pdf.py', items: [
        '+532 líneas de lógica de extracción: mejoras en detección de tipo de formulario, fallbacks por regex, manejo de OCR con caracteres especiales',
        'Soporte para variantes extendidas de CM-TH-FR-003 y CM-TH-SV-001',
        'Modo batch: lista de archivos PDF con resultado individual por archivo y conteo global',
      ]},
      { categoria: 'controllers/importarPDFController.js', items: [
        'Flujo de dos pasos: POST /api/pdf/previsualizar guarda resultado OCR en caché (_prevCache, TTL 15 min); POST /api/pdf/confirmar escribe en BD usando el caché',
        'Función _mapearErrorOCR(): convierte mensajes técnicos de Python en texto amigable para el usuario',
        'resolverCodConcPermiso(): todos los CM-TH-FR-003 usan COD_CONC=68 (Permiso Remunerado) independiente del motivo detectado',
      ]},
    ],
  },

  'v0.16': {
    titulo: 'Azure App Service — pruebas y estabilización de despliegue en la nube',
    resumen: [
      'Primer despliegue estable en Azure App Service (Windows) con iisnode + Express.js',
      'Autenticación Managed Identity para Azure SQL Serverless — sin credenciales en variables de entorno',
      'Logger.js refactorizado para escritura asíncrona en GN_LOG_APP sin bloquear el hilo principal',
      'Manejo de reanudación de conexión Azure SQL: getConnection/executeQuery reescritos con reintentos',
      'Panel Centro de Costos reestructurado con multi-select y visualización en grid',
      'Logos oficiales Collective Mining añadidos (SVG y PNG) e integrados en el header del app',
      'Fix bootstrap diferido: la conexión a BD se establece en la primera solicitud real, no al arrancar',
      'Soporte para formularios de Adecco con múltiples centros de costo por empleado',
      'Fallback pdfkit para generación de PDF cuando Python no está disponible',
      'Correcciones de web.config para routing Express en iisnode (todas las rutas → server.js)',
    ],
    detalle: [
      { categoria: 'Despliegue en Azure App Service', items: [
        'web.config configurado para iisnode en Windows App Service: httpPlatform handler, reescritura de todas las rutas a server.js',
        'GitHub Actions workflow (main_nominacollectivemining.yml): build, zip, deploy a Azure via publish-profile',
        'be21831: Node 18 compatible, azure-active-directory-mssql-node para Azure SQL encryption, postinstall omite Python en App Service',
        'startup.sh: script de arranque con npm install + node server.js para entornos Linux/Azure',
        'ecosystem.config.js: configuración PM2 para VPS',
      ]},
      { categoria: 'config/database.js', items: [
        'getConnection() reescrito: si la conexión está en estado PAUSED (Azure Serverless), espera resume y reintenta',
        'executeQuery() con retry automático en error de conexión caída (código ETIMEOUT/ECONNRESET)',
        'Managed Identity: si NODE_ENV=production, usa DefaultAzureCredential en lugar de UID/PWD',
        'Pool config: max:20, min:0 (permite auto-pause de Azure SQL Serverless), acquireTimeoutMillis:30000',
      ]},
      { categoria: 'Centro de Costos — multi-select', items: [
        'dc0f105: Panel CC reestructurado en layout grid con multi-select nativo',
        '126f22f: Bootstrap diferido — initApp() separado de DOMContentLoaded; carga de centros de costo con soporte multi-selección en backend',
        'controllers/cambiosController.js: endpoints actualizados para recibir array de COD_CCOST',
      ]},
      { categoria: 'Otros', items: [
        'f8df6e7: Logos Collective Mining añadidos a assets/; integrados en header y login',
        '61b69ed: pdfPlantillaController usa pdfkit como fallback si pdf-lib no está disponible',
        'config/logger.js: escritura asíncrona en GN_LOG_APP con cola interna; no lanza excepciones al caller',
        'importarPDFController.js: función _mapearErrorOCR() para errores amigables; caché de previsualización',
        'python/procesar_pdf.py: compatibilidad con Azure App Service (rutas relativas, timeouts)',
      ]},
    ],
  },

  'v0.15': {
    titulo: 'Pipeline de despliegue Azure y documentación técnica',
    resumen: [
      'Primer pipeline CI/CD con GitHub Actions para Azure App Service (Windows)',
      'AZURE_SETUP.md: guía paso a paso de configuración en Azure Portal (App Service, SQL, identidades)',
      'config/database.js: pool de conexiones mejorado con parámetros de timeout y retry',
      'Script generar_documentos_MineDax.py (905 líneas): genera fichas técnicas y documentación Word desde la BD',
      'Documentación técnica formal del proyecto: Informe_Tecnico y Mensaje_Informativo',
    ],
    detalle: [
      { categoria: 'GitHub Actions CI/CD', items: [
        'bc243a5 + 2d644a9: workflow .github/workflows/main_nominacollectivemining.yml — build Node 18, Compress-Archive, Deploy a Azure App Service via publish-profile',
        'msnodesqlv8 marcado como dependencia opcional (optionalDependencies) — no bloquea build si no está disponible',
        'publish-profile almacenado como secreto AZURE_WEBAPP_PUBLISH_PROFILE en el repositorio',
      ]},
      { categoria: 'Documentación', items: [
        'AZURE_SETUP.md (294 líneas): pasos para crear App Service, configurar variables de entorno, Managed Identity, SQL Firewall',
        'Informe_Tecnico_Nomina2026.md: arquitectura, módulos, tablas de BD, flujo de datos y guía de operación',
        'Mensaje_Informativo_Nomina2026.md: comunicado ejecutivo del proyecto para stakeholders no técnicos',
      ]},
      { categoria: 'Otros', items: [
        'generar_documentos_MineDax.py (905 líneas): conexión pyodbc a MineDax, genera fichas de empleado y reportes en DOCX usando python-docx',
        'config/database.js: opciones pool.idleTimeoutMillis, pool.acquireTimeoutMillis añadidas',
        '461d6d9 Margenes_PDF: ajuste de márgenes en pdfPlantillaController.js para formularios oficiales',
      ]},
    ],
  },

  'v0.14': {
    titulo: 'Formularios de solicitud, SharePoint y documentación de despliegue',
    resumen: [
      'solicitudesController.js refactorizado: formularios públicos de Permiso y Vacaciones con notificaciones email a RRHH',
      'config/sharepoint.js: módulo de integración con SharePoint Online (subida de documentos via Graph API)',
      'importarPDFController.js: ajustes de robustez y manejo de errores mejorado',
      'Documentación de despliegue: DATABASE_SETUP_ORDER.md y DEPLOYMENT_CHECKLIST.md añadidos',
      'Esquemas de base de datos actualizados: auth_schema.sql y schema.sql con columnas de verificación',
    ],
    detalle: [
      { categoria: 'controllers/solicitudesController.js', items: [
        'Refactorización completa (+323 líneas netas): lógica separada por tipo de solicitud (permiso / vacaciones)',
        'Notificación email a RRHH (_emailRRHH): asunto con tipo, cédula y nombre del solicitante; datos del formulario en tabla HTML',
        'Confirmación al empleado (_emailConfirmacion): resumen de su solicitud con fechas, días y estado Recibida',
        'Validación de campos obligatorios: NUM_IDEN, fechas de período y tipo de solicitud',
        'Endpoint GET /api/solicitudes/estado/:token para consulta pública sin autenticación',
      ]},
      { categoria: 'config/sharepoint.js (nuevo)', items: [
        'Client Credentials flow con MSAL (@azure/msal-node): obtiene token para Microsoft Graph API',
        'uploadFile(siteId, driveId, folderPath, fileName, buffer): sube buffer a OneDrive/SharePoint',
        'Variables de entorno: SHAREPOINT_TENANT_ID, SHAREPOINT_CLIENT_ID, SHAREPOINT_CLIENT_SECRET, SHAREPOINT_SITE_ID, SHAREPOINT_DRIVE_ID',
        'Módulo opcional: si las variables no están configuradas, las funciones retornan null sin error',
      ]},
      { categoria: 'Documentación', items: [
        'DATABASE_SETUP_ORDER.md (129 líneas): orden correcto de ejecución de scripts SQL, dependencias entre tablas',
        'DEPLOYMENT_CHECKLIST.md (414 líneas): checklist completo para despliegue en Azure App Service y VPS',
        'InformeTecnico_MineDax_2026.docx y MineDax_Guia_Migracion_Online.docx: documentación formal del sistema',
        '.env.example actualizado con todas las variables requeridas y opcionales documentadas',
      ]},
    ],
  },

  // ── Versiones anteriores ─────────────────────────────────────────────────────

  'v0.13': {
    titulo: 'Maestro Original funcional — Alta real de empleados en MineDax',
    resumen: [
      'Pestaña "Maestro Original" completamente funcional: el formulario ahora inserta empleados reales en GN_TERCE y GN_FUNCI de MineDax',
      'Formulario estructurado en 7 secciones: Identificación, Nombre Completo, Información Personal, Contacto, Cargo y Contrato, Cuenta Bancaria, y Seguridad Social',
      'Campo "Nombre Completo" dividido en 4 subcampos independientes: APE_TERC, SEG_APEL, NOM_TERC, SEG_NOMB; NOM_COMP generado automáticamente',
      'Todos los dropdowns de selección cargados dinámicamente desde la BD: Cargo, EPS, AFP, Caja, Cesantías, Banco, Tipo Cuenta, Estado Civil, Grupo Sanguíneo, Centro Costo, Tipo Documento',
      'Tabla de empleados sincronizada con GN_FUNCI + GN_TERCE: muestra Cédula, Nombre, Cargo, EPS, AFP, F. Ingreso, Centro Costo, Valor Hora, Estado',
      'Validación de duplicados: rechaza inserción si ya existe un empleado activo con el mismo NUM_IDEN',
      'Pestañas "Cambios Maestro" y "Conexión BD" ocultadas de la interfaz sin eliminar su código',
      'Tres nuevos endpoints API: GET /api/maestros/catalogos, POST /api/maestros/empleado, GET /api/maestros/empleados',
    ],
    detalle: [
      { categoria: 'controllers/maestrosController.js', items: [
        'Nueva función obtenerCatalogos(): consultas paralelas (Promise.all) a MAE_TPDOC, MAE_GRSAN, MAE_ESTCIV, MAE_BANCO, MAE_TPCTA, MAE_CCOST, MAE_CARGO y GN_TERCE (EPS/AFP/Caja/Cesantías por LIKE)',
        'EPS detectadas por: NOM_COMP LIKE \'%E.P.S%\' OR LIKE \'%CAFESALUD%\'',
        'AFP detectadas por: NOM_COMP LIKE \'%A.F.P%\' OR NOM_COMP = \'COLPENSIONES\'',
        'Cajas (CCF) detectadas por: NOM_COMP LIKE \'%CCF %\'',
        'Cesantías detectadas por: NOM_COMP LIKE \'%CESANT%\' OR LIKE \'%FONDO NACIONAL%\'',
        'Nueva función crearEmpleado(): valida campos obligatorios, detecta duplicado por NUM_IDEN, obtiene next COD_TERC y COD_FUNCI con MAX()+1, inserta en GN_TERCE y luego en GN_FUNCI',
        'NOM_COMP construido como: APE_TERC + SEG_APEL + NOM_TERC + SEG_NOMB (todo uppercase, filtrando vacíos)',
        'FEC_INGRES convertida de formato ISO (YYYY-MM-DD) a nchar(10) del MineDax (DD/MM/YYYY) con función toSlash()',
        'FEC_NAC enviada como Date object para columna datetime; NUM_CTA como Number seguro con strip de no-dígitos',
        'GN_TERCE: campos TER_EMPL=\'0\', ACT_USUA=\'MineDax\', ACT_HORA=GETDATE(), ACT_ESTA=\'A\', COD_EMPR=1',
        'GN_FUNCI: 38 campos mapeados incluyendo EPS/AFP/Caja/Cesantías como FK decimales a COD_TERC de GN_TERCE',
        'Nueva función listarEmpleados(): SELECT TOP 300 con INNER JOIN GN_FUNCI y LEFT JOINs a MAE_CARGO, GN_TERCE (eps/afp), MAE_CCOST; ordenado por NOM_COMP',
        'module.exports actualizado: añadidos obtenerCatalogos, crearEmpleado, listarEmpleados',
      ]},
      { categoria: 'routes/maestros.js', items: [
        'GET /api/maestros/catalogos → maestrosController.obtenerCatalogos',
        'POST /api/maestros/empleado → maestrosController.crearEmpleado',
        'GET /api/maestros/empleados → maestrosController.listarEmpleados',
      ]},
      { categoria: 'index_novedades.html — Maestro Original', items: [
        'Sección page-maestroOriginal completamente reescrita con 7 tarjetas de formulario',
        'Card 1 — Identificación: NUM_IDEN (text), COD_ALT (text), COD_TPDOC (<select> dinámico)',
        'Card 2 — Nombre Completo: APE_TERC, SEG_APEL, NOM_TERC, SEG_NOMB + campo NOM_COMP readonly auto-generado',
        'Card 3 — Información Personal: SEX_FUNC (radio M/F), COD_GRSAN (<select>), COD_ESTCIV (<select>), CNT_HIJO, FEC_NAC, CIU_EXPED',
        'Card 4 — Contacto y Residencia: COD_MPIO, TEL_TERC, TEL_TERC2, DIR_MAIL, DIR_TERC',
        'Card 5 — Cargo y Contrato: COD_CARGO (<select>), VAL_HORA, TIP_SALAR, MOD_LIQUID, JOR_SABAD, DIA_VACAC, CUE_PENSIO, EMP_FORAN, DIR_FORAN, TIP_CONTRA, NUM_CONTRA, FEC_INGRES*, FEC_RETIRO, CAU_RETIRO',
        'Card 6 — Cuenta Bancaria: COD_TPCTA (<select>), COD_BANCO (<select>), NUM_CTA, NOM_SUCUR, COD_CCOST (<select>), CUE_GASTO',
        'Card 7 — Seguridad Social y Retenciones: COD_EPS (<select>), COD_AFP (<select>), COD_CAJA (<select>), COD_CESAN (<select>), GRA_RIESGO, PRO_SALUD, POR_RETEN, DED_VIVIEN, DED_SALUD, DED_DEPEN',
        'Función mo_actualizarNomComp(): recompone NOM_COMP en tiempo real al escribir en cualquier campo de nombre',
        'Función cargarCatalogos(): GET /api/maestros/catalogos; helper fill() puebla cada <select> con <option value="cod">nom</option>',
        'Función guardarMaestro(): POST /api/maestros/empleado con todos los campos mapeados; muestra alert de éxito/error',
        'Función cargarEmpleadosBD(): GET /api/maestros/empleados; guarda en state.maestroOriginal y llama renderMaestro()',
        'Tabla de empleados: columnas Cédula, Nombre, Cargo, EPS, AFP, F.Ingreso, C.Costo, Valor Hora, Estado; con badges Activo/Inactivo',
        'Botón "↺ Recargar BD" para refrescar la tabla manualmente',
        'DOMContentLoaded: llama cargarCatalogos() y cargarEmpleadosBD() automáticamente al abrir la pestaña',
      ]},
      { categoria: 'index_novedades.html — Navegación', items: [
        'Nav item "Cambios Maestro" ocultado con style="display:none" (código intacto, inaccesible desde UI)',
        'Nav item "Conexión BD" ocultado con style="display:none" (código intacto, inaccesible desde UI)',
        'Resto del sidebar y todas las demás pestañas sin cambios',
      ]},
    ],
  },

  'v0.12': {
    titulo: 'Sistema de Changelog, base del Maestro Original y mejoras PDF',
    resumen: [
      'Nuevo módulo routes/changelog.js: historial de versiones generado automáticamente desde commits git',
      'Pestaña "Versiones & Cambios" integrada en la interfaz con sub-pestañas Resumen y Detalle técnico',
      'Catálogo estático (CATALOG) con entradas documentadas para V0.1 a V0.11',
      'Base inicial del formulario Maestro Original: campos de identificación, nombre y estructura de secciones',
      'Correcciones al motor Python de extracción de PDFs (procesar_pdf.py)',
      'Primeras rutas GET /api/maestros/catalogos, POST /api/maestros/empleado, GET /api/maestros/empleados añadidas a routes/maestros.js',
    ],
    detalle: [
      { categoria: 'routes/changelog.js (nuevo)', items: [
        'GET /api/changelog: lee git log, agrupa commits por etiqueta de versión ("Upload Payroll V*") y complementa con CATALOG',
        'GET /api/changelog/raw: devuelve commits crudos para diagnóstico',
        'Función getCommits(): execSync git log --format="%H|||%ad|||%s|||%an|||%D" con timeout 5 s',
        'Función esVersionPrincipal(): detecta cabeceras de versión por regex /upload payroll/i o /\\bv\\d+\\.\\d+/i',
        'Función etiquetaVersion(): extrae "V0.N" del mensaje o asigna número secuencial',
        'CATALOG estático con entradas elaboradas para V0.1 – V0.11 (resumen + detalle técnico por categoría)',
        'Entradas "dev" automáticas para commits sin etiqueta de versión al final del historial',
      ]},
      { categoria: 'index_novedades.html — Pestaña Versiones', items: [
        'Página page-changelog con sub-tabs: Resumen (tarjetas condensadas) y Detalle técnico (por categoría)',
        'Spinner de carga mientras se obtiene /api/changelog',
        'clRenderizar(): mapea versiones a .cl-version-card con badge de versión, título, fecha y commit hash',
        'Sub-pestaña Detalle: agrupa items por categoría (.cl-category) y lista commits incluidos con hash, fecha y mensaje',
        'Estilos CSS exclusivos: .cl-version-card, .cl-version-badge, .cl-bullet-list, .cl-detail-list, .cl-commit-row',
      ]},
      { categoria: 'controllers/maestrosController.js', items: [
        'Inicio de funciones obtenerCatalogos, crearEmpleado y listarEmpleados (completadas en V0.13)',
        'Mapeo de columnas de GN_TERCE y GN_FUNCI para inserción de empleados nuevos',
      ]},
      { categoria: 'python/procesar_pdf.py', items: [
        'Refactorización de lógica de extracción (260 líneas netas de cambios)',
        'Mejoras en manejo de errores y compatibilidad con variantes de formularios CM',
      ]},
    ],
  },
  'v0.7': {
    titulo: 'Importación de PDFs — Permisos y Vacaciones desde formularios CM',
    resumen: [
      'Nuevo módulo de importación de PDFs: soporta formularios CM-TH-FR-003 (Permisos) y CM-TH-SV-001 (Vacaciones)',
      'Extracción automática de datos desde PDFs mediante motor Python (pdfplumber)',
      'Detección automática del tipo de formulario por contenido del documento',
      'Inserción directa en NO_NOVED y NO_AUSEN con validación de duplicados y reactivación de registros inactivos',
      'Módulo de importación unificado en la interfaz: acepta Excel y PDFs en la misma pantalla',
      'Corrección de vista vw_NO_AUSEN_PERIODO: cambiado INNER JOIN a LEFT JOIN para incluir permisos sin fila en NO_AUSEN',
      'README.md actualizado con documentación técnica del importador de PDFs',
      'Scripts SQL auxiliares para diagnóstico, limpieza de duplicados y correcciones de esquema',
      'SERVIDOR-INSTRUCCIONES.md: guía ampliada con instrucciones de despliegue multi-red',
    ],
    detalle: [
      { categoria: 'Importación de PDFs', items: [
        'Nuevo archivo routes/importarPDF.js: rutas POST /api/pdf/importar y GET /api/pdf/periodo-actual',
        'Nuevo controlador controllers/importarPDFController.js: orquesta extracción Python → validación → inserción en BD',
        'Extractor Python (pdf_import_module.js + python/): usa pdfplumber para extraer campos de formularios CM-TH-FR-003 y CM-TH-SV-001',
        'Permisos (CM-TH-FR-003): extrae cédula, nombre, cargo, fechas, horas, motivo y jefe inmediato → inserta en NO_NOVED con COD_CONC=68 (Permiso Remunerado)',
        'Vacaciones (CM-TH-SV-001): extrae cédula, fechas inicio/fin, días → inserta en NO_NOVED (COD_CONC=63) y NO_AUSEN',
        'Lógica de duplicados: reactiva registro inactivo (ACT_ESTA=\'I\') si ya existe; marca como acumulado si ya está activo',
        'Registra siempre en el período activo actual (PER_EST=\'A\') para evitar rechazo por trigger TR_NO_NOVED_PERIODO_CERRADO',
        'Soporte hasta 20 archivos simultáneos, 50 MB cada uno, con multer en memoria',
      ]},
      { categoria: 'Interfaz — Módulo de Importar Archivos', items: [
        'index_novedades.html: sección "Importar Archivos" ahora acepta .xlsx, .xls y .pdf en la misma zona de arrastrar-y-soltar',
        'Detección automática de tipo de archivo al seleccionar: Excel va a /api/ocasionales/importar-excel, PDFs a /api/pdf/importar',
        'Resumen de resultados unificado: muestra insertados, acumulados, reactivados y errores por archivo',
        'Contador de resultados históricos mejorado: indica "Mostrando N de M registros" cuando se supera el límite configurado',
        'Opción "↺ Reactivados" añadida al filtro de estado en búsqueda histórica',
        'Autocompletado de empleado en búsqueda histórica: dispara búsqueda automáticamente al seleccionar del dropdown',
      ]},
      { categoria: 'Base de datos — Correcciones de esquema', items: [
        'ausentismosController.js: vista vw_NO_AUSEN_PERIODO reconstruida con DROP + CREATE (elimina dependencia de IF OBJECT_ID NULL)',
        'JOIN de NO_AUSEN cambiado de INNER a LEFT JOIN para incluir novedades de tipo AUSENTISMO que aún no tienen fila en NO_AUSEN',
        'Filtro WHERE c.TIP_NATU = \'AUSENTISMO\' añadido para acotar la vista a novedades del tipo correcto',
        'ensureDbObjects() acepta parámetro force=true para forzar recreación de la vista en cada arranque',
        'Scripts nuevos: scripts/fix_vista_ausen_y_laura_noved2640.sql, scripts/limpiar_duplicados_excel_noved.sql, scripts/importar_novedades_pdf_feb2026.sql',
        'diagnostico_tablas.sql: script de diagnóstico de esquema y datos de tablas de novedades',
      ]},
      { categoria: 'Servidor y rutas', items: [
        'server.js: nueva ruta /api/pdf → importarPDFRoutes registrada junto al resto de módulos',
        'SERVIDOR-INSTRUCCIONES.md ampliado: secciones de troubleshooting de puerto, acceso multi-red, verificación de estado y configuración de BD',
        '.env: MAIL_USER actualizado al correo corporativo nomina.collectivemining@gmail.com, APP_URL apunta a IP de red interna',
        'README.md reescrito con descripción técnica del importador PDF: mapeo de campos, validación de duplicados y pasos de instalación Python',
        'requirements.txt añadido: dependencias Python para el motor de extracción de PDFs (pdfplumber, pyodbc, etc.)',
      ]},
    ],
  },
  'v0.6': {
    titulo: 'Página de login rediseñada y guía de servidor',
    resumen: [
      'Login rediseñado con layout de dos paneles: branding Collective Mining a la izquierda, formulario a la derecha',
      'Diseño con líneas topográficas decorativas alineadas a la identidad visual de la empresa',
      'Tipografía Barlow / Barlow Condensed y paleta de colores corporativa (#20A7C9)',
      'Nuevo archivo SERVIDOR-INSTRUCCIONES.md: guía de inicio, solución de conflictos de puerto y acceso multi-red',
      'Permisos de Claude ampliados para operaciones de servidor, SQL y git en el contexto del proyecto',
    ],
    detalle: [
      { categoria: 'Interfaz — Página de Login', items: [
        'login.html completamente rediseñado: layout flex de dos columnas (40% branding / 60% formulario)',
        'Panel izquierdo: gradiente lineal cm-blue → dark con líneas topográficas via CSS pseudo-elementos ::before / ::after',
        'Variables CSS: --coal (#2B2B2B), --cm-blue (#20A7C9), --cm-blue-light (#4DC4E0), --dark (#222222), --surface, --border',
        'Formulario con campos email y contraseña, checkbox "Recuérdame", enlace "¿Olvidaste tu contraseña?" y botón de acceso',
        'Responsive: panel izquierdo se colapsa en pantallas estrechas; formulario ocupa el 100% en móvil',
        'Animaciones sutiles de entrada (fade-in + translateY) en tarjeta del formulario y logo',
      ]},
      { categoria: 'Documentación y configuración', items: [
        'SERVIDOR-INSTRUCCIONES.md creado: secciones de inicio normal, solución de error EADDRINUSE, uso de kill-server.ps1 / kill-server.js, cambio de puerto, verificación de salud (/api/health) y configuración de BD via .env',
        '.claude/settings.local.json: ampliados los permisos allow con comandos npm install/start, netstat, taskkill, PowerShell para gestión de procesos, curl para pruebas de endpoints, sqlcmd para consultas directas a MineDax y comandos git add/commit',
      ]},
    ],
  },
  'v0.5': {
    titulo: 'Correcciones críticas — Entrega de emails, tokens y acceso multi-red',
    resumen: [
      'Corrección crítica: recuperación de contraseña ahora encuentra usuarios correctamente (ACT_ESTA)',
      'Fix de entregabilidad: emails llegan a cuentas externas (Outlook, Hotmail, etc.)',
      'Admin puede crear usuarios y se envía email de verificación automáticamente',
      'Corrección de zona horaria: tokens de reset/verificación no expiran prematuramente',
      'Links en emails generados dinámicamente según la red del solicitante',
      'Nueva página de verificación de email (verificar-email.html) con estados visuales',
      'Scripts auxiliares para gestión del servidor (kill-server)',
    ],
    detalle: [
      { categoria: 'Seguridad y autenticación', items: [
        'Bug fix: forgotPassword, resetPassword, validarToken y registro usaban ACT_INAC=\'S\' pero los usuarios reales tienen ACT_ESTA=\'A\'; corregido en todas las consultas',
        'crearUsuario (admin): ahora genera TOK_VERI (UUID), lo persiste en GN_USUAR con FEC_VERI = GETUTCDATE() + 24h, y envía emails de verificación y bienvenida al nuevo usuario',
        'verificar-email.html: página con 4 estados visuales (cargando, éxito, ya verificado, error) que consume GET /api/auth/verificar-email/:token',
        'Ruta pública añadida en routes/auth.js: GET /api/auth/verificar-email/:token → authController.verificarEmail',
        'Bootstrap idempotente al inicio del servidor: crea columnas TOK_VERI, VER_EMAIL, FEC_VERI en GN_USUAR si no existen',
      ]},
      { categoria: 'Email — Entregabilidad', items: [
        'mailer.js: campo from actualizado a \'"Collective Mining Nómina" <nomina.collectivemining@gmail.com>\' en todas las plantillas (antes solo la dirección cruda era rechazada por filtros anti-spam de Microsoft)',
        'mailer.js: añadida opción tls: { rejectUnauthorized: false } para compatibilidad en redes corporativas',
        'Emails enviados correctamente a cuentas Gmail, Outlook, Hotmail y otras externas',
        'MAIL_PASS con espacios (formato Google App Password) limpiado automáticamente con .replace(/\\s/g, \'\')',
      ]},
      { categoria: 'Zona horaria y consistencia de fechas', items: [
        'database.js: añadido useUTC: true al pool de conexión para que el driver mssql/tedious interprete todos los DATETIME en UTC',
        'authController.js: todas las expiraciones de token cambiadas de DATEADD(HOUR, N, GETDATE()) a DATEADD(HOUR, N, GETUTCDATE()) — elimina el error "Token expirado" prematuro en zonas UTC-5 (Colombia)',
        'La comparación en Node.js (new Date() vs new Date(usuario.FEC_TOKE)) ahora es consistente con lo almacenado en BD',
      ]},
      { categoria: 'Acceso multi-red', items: [
        'server.js: app.set(\'trust proxy\', 1) — Express confía en el primer proxy/router para detectar IP y protocolo reales',
        'forgotPassword, registro y crearUsuario: baseUrl generado dinámicamente como process.env.APP_URL || req.protocol + req.get(\'host\') — los links en emails funcionan desde cualquier red sin reconfigurar el servidor',
        'Patrón: si APP_URL está definido en .env, se usa como base fija (producción); si no, se auto-detecta del request (desarrollo/LAN)',
      ]},
      { categoria: 'Infraestructura y herramientas', items: [
        'kill-server.js y kill-server.ps1: scripts auxiliares para matar procesos Node.js en caso de conflicto de puerto',
        'server.js: auto-retry en EADDRINUSE con killNodeProcesses() — mata el proceso previo y reintenta hasta 3 veces',
        'routes/novedades.js + controllers/novedadesController.js: módulo de trazabilidad histórica con UNION ALL de 4 tablas de novedades',
        'verificarYCerrarPeriodosVencidos(): función que cierra períodos cuya FEC_FIN < GETDATE() al iniciar servidor y cada hora',
      ]},
    ],
  },
  'v0.4': {
    titulo: 'Dashboard, trazabilidad histórica y sistema de emails',
    resumen: [
      'Panel de búsqueda histórica (trazabilidad) en Dashboard con UNION ALL de 4 tablas de novedades',
      'Autocompletado de empleado en búsqueda histórica con teclado y debounce',
      'Tabla "Actividad reciente" con datos reales de BD y límite configurable',
      'Cierre automático de períodos vencidos al iniciar y cada hora',
      'Sistema completo de recuperación de contraseña por email (Gmail SMTP + App Password)',
      'Verificación de cuenta por email al registrarse con link de 24 h',
      'Email de confirmación al restablecer contraseña',
      '"Recuérdame" guarda email y contraseña (cifrado base64 en localStorage)',
      'Módulo changelog/versiones integrado en la interfaz del sistema',
      'Estabilidad mejorada del servidor con gestión automática de conflictos de puerto',
    ],
    detalle: [
      { categoria: 'Dashboard — Trazabilidad histórica', items: [
        'Panel "Búsqueda histórica de novedades" con filtros: empleado, tipo, período, estado, rango de fechas',
        'UNION ALL dinámico sobre NO_OCASI, NO_FIJAS, NO_AUSEN, NO_CAMBI filtrado por parámetros opcionales',
        'Autocompletado de empleado con debounce 300ms sobre /api/maestros/buscar-cedulas, navegación por teclado (↑↓Enter)',
        'Tabla de resultados adaptativa: coloca de alta las columnas relevantes al tipo de novedad',
        'Selector de cantidad de resultados (25 / 50 / 100 / 200) y botón de actualizar con timestamp',
        'Tabla "Actividad reciente" alimentada desde /api/novedades/recientes con datos reales de BD',
        'Selector configurable 10 / 25 / 50 / 100 registros recientes',
      ]},
      { categoria: 'Gestión automática de períodos', items: [
        'verificarYCerrarPeriodosVencidos(): detecta NO_PERIOD con PER_FFIN < GETDATE() y PER_EST=\'A\', los cierra a \'I\'',
        'Se ejecuta al arrancar el servidor y cada hora mediante setInterval',
        'Los períodos cerrados automáticamente quedan registrados en consola con detalle de fecha de cierre',
        'Endpoint manual POST /api/novedades/periodo/:codPeriod/cerrar para cierre forzado por admin',
      ]},
      { categoria: 'Sistema de emails (Gmail SMTP)', items: [
        'config/mailer.js: transporter Nodemailer con Gmail, App Password con limpieza de espacios automática',
        'Plantilla emailBienvenida: email de bienvenida al crear cuenta',
        'Plantilla emailRecuperacion: link de reset con token UUID, expira en 2 horas',
        'Plantilla emailCambioExitoso: confirmación tras restablecer contraseña',
        'Plantilla emailVerificacion: link de verificación de cuenta, expira en 24 horas',
        'Función enviarEmail() centralizada con logging de éxito/error',
      ]},
      { categoria: 'Autenticación y seguridad', items: [
        '"Recuérdame" en login guarda email y contraseña usando btoa(unescape(encodeURIComponent(password))) en localStorage',
        'Restauración automática del email y contraseña al cargar la página de login',
        'forgotPassword: genera UUID, persiste TOK_RECO / FEC_TOKE (+2h) y envía email con link',
        'resetPassword: valida token, expira si FEC_TOKE < ahora, hashea nueva contraseña y limpia token',
        'Columnas TOK_VERI, VER_EMAIL, FEC_VERI añadidas a GN_USUAR vía bootstrap idempotente al arrancar',
      ]},
      { categoria: 'Estabilidad del servidor', items: [
        'http.createServer(app) con manejo de evento \'error\'',
        'Auto-retry en EADDRINUSE: mata procesos Node.js previos con execSync y reintenta hasta 3 veces',
        'Servidor escucha en 0.0.0.0 (todas las interfaces) para acceso desde LAN',
        'Log de IPs de red local al arrancar para identificar la dirección de acceso',
      ]},
    ],
  },
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
  'v0.11': {
    titulo: 'Motor de extracción PDF — Consolidación y robustez',
    resumen: [
      'Refactorización profunda del motor Python de extracción de PDFs (procesar_pdf.py)',
      'Mejor tolerancia a variaciones de formato en documentos escaneados o con OCR imperfecto',
      'Corrección de cálculo de días en solicitudes de vacaciones con fechas no consecutivas',
      'Manejo explícito de errores por archivo: un PDF mal formado no interrumpe el lote completo',
      'Logs de extracción más detallados para facilitar diagnóstico en producción',
    ],
    detalle: [
      { categoria: 'python/procesar_pdf.py', items: [
        'Refactorización de 34 líneas a 307 (+273 netas): extracción por secciones con fallback por expresión regular',
        'Función extract_field() generalizada: busca etiqueta por regex y captura valor en la misma línea o en la siguiente',
        'Función clean_value(): elimina artefactos de OCR, caracteres de control y espacios múltiples',
        'Detección de tipo de formulario mejorada: prioriza palabras clave en las primeras 10 líneas del texto extraído',
        'Cálculo de días de vacaciones corregido: maneja correctamente saltos de mes y meses de 28/29/30/31 días',
        'Modo batch: procesa lista de rutas de PDF devolviendo un JSON con resultado por archivo y conteo global',
        'Manejo de excepciones por archivo con captura de traceback completo en el campo error del resultado',
        'Compatibilidad con pdfplumber ≥ 0.9 y pdfminer como backend de fallback',
      ]},
    ],
  },

  'v0.10': {
    titulo: 'Importación Excel robusta y rutas de ocasionales optimizadas',
    resumen: [
      'Correcciones críticas en el controlador de importación Excel para múltiples tipos de parser',
      'Mejora en la normalización de cédulas y nombres antes de consultar la BD',
      'Ruta de ocasionales actualizada: nuevos endpoints para importación por lote y descarga de plantilla',
      'Motor Python de extracción PDF ampliado con soporte para formularios de permiso remunerado extendido',
      'Mejor manejo de períodos: búsqueda dinámica del período activo sin depender de caché',
    ],
    detalle: [
      { categoria: 'controllers/importarExcelController.js', items: [
        'Refactorización de 344 líneas netas (+270 sobre V0.9): lógica de resolución de parser extraída a función interna resolveParser()',
        'resolveParser(): intenta fingerprint síncrono, luego asíncrono y finalmente nombre de archivo; devuelve null si ninguno aplica',
        'Normalización de cédula: strip de espacios, guiones y puntos antes de consulta a GN_FUNCI/GN_TERCE',
        'Manejo de transacciones por archivo: si falla una inserción, hace rollback del lote de ese archivo sin afectar los demás',
        'Logging estructurado por archivo: reporta parser usado, filas leídas, insertadas, acumuladas y errores con detalle',
        'Endpoint GET /api/ocasionales/plantilla: devuelve archivo Excel de plantilla con cabeceras correctas',
      ]},
      { categoria: 'routes/ocasionales.js', items: [
        'Nueva ruta GET /api/ocasionales/plantilla para descarga de plantilla de importación',
        'Ruta POST /api/ocasionales/importar-excel mantenida; parámetro opcional modo=strict para rechazar filas incompletas',
        'Middleware de validación de tipo MIME añadido antes de pasar a multer',
      ]},
      { categoria: 'python/procesar_pdf.py', items: [
        'Soporte para variante extendida del formulario CM-TH-FR-003: extrae campo de justificación de hasta 3 líneas',
        'Campo jefe_inmediato: ahora busca tanto "Jefe Inmediato" como "Supervisor" para mayor compatibilidad',
        'Mejoras en limpieza de texto: elimina saltos de línea dentro de nombres compuestos',
      ]},
    ],
  },

  'v0.9': {
    titulo: 'Correcciones de esquema y tablas maestras MAE_ARL y MAE_EPS',
    resumen: [
      'Scripts SQL de diagnóstico y correcciones de integridad sobre las tablas de novedades',
      'Creación y población de la tabla MAE_ARL con las ARL del sector minero-energético',
      'Creación y población de las tablas MAE_EPS y MAE_CCF con entidades del sistema de salud colombiano',
      'Correcciones en importarExcelController: manejo de filas sin cédula y acumulación de conceptos duplicados',
    ],
    detalle: [
      { categoria: 'sql/ — Scripts de esquema y datos maestros', items: [
        'sql/diagnostico_y_correcciones.sql: 330 líneas de diagnóstico; verifica integridad de llaves foráneas en NO_NOVED, NO_OCASI, NO_FIJAS, NO_AUSEN, NO_CAMBI; genera reporte de huérfanos y propone correcciones con UPDATE/DELETE selectivos',
        'sql/poblar_MAE_ARL.sql: crea tabla MAE_ARL (COD_ARL, NOM_ARL, NIT_ARL, ACT_ESTA) y la puebla con 7 ARL vigentes en Colombia (Sura, Positiva, Colmena, Axa Colpatria, Bolívar, Liberty, Equidad)',
        'sql/poblar_MAE_EPS_CCF.sql: crea MAE_EPS con 24 EPS del RUPS y MAE_CCF con 43 Cajas de Compensación Familiar; INSERTs idempotentes con MERGE',
      ]},
      { categoria: 'controllers/importarExcelController.js', items: [
        'Corrección de bug crítico: filas con celda de cédula vacía causaban error de FK; ahora se saltan con advertencia en el log',
        'Acumulación de conceptos duplicados: si el mismo COD_CONC aparece dos veces para el mismo empleado en el mismo archivo, se suman las cantidades antes de insertar',
        'Mensaje de error mejorado cuando GN_FUNCI no encuentra el empleado: incluye la cédula buscada para facilitar diagnóstico',
        'Compatibilidad con ExcelJS ≥ 4.3: ajuste en lectura de celdas de fecha (valor raw vs. resultado formateado)',
      ]},
    ],
  },

  'v0.8': {
    titulo: 'Importador Adecco y descifrado de archivos Office protegidos',
    resumen: [
      'Nuevo módulo de importación de archivos Adecco (nómina tercerizada) en formato Excel protegido',
      'Soporte para descifrar archivos .xlsx/.xls protegidos con contraseña mediante msoffcrypto-tool',
      'Parser dedicado para el formato Adecco: detecta automáticamente por nombre y estructura del archivo',
      'Integración en la interfaz: Adecco se procesa junto a los demás tipos en la misma zona de carga',
      'Actualización de dependencias: msoffcrypto-tool y dependencias relacionadas añadidas a package.json',
    ],
    detalle: [
      { categoria: 'Importador Adecco', items: [
        'importar_adecco.py: script Python para procesamiento de nómina Adecco; extrae cédula, nombre, concepto y valor desde el formato de liquidación mensual',
        'utils/importParsers/parserAdecco.js: nuevo parser Node.js; detecta por nombre ("adecco", "nomina tercera") y presencia de columna "No. Identificación"',
        'parserRegistry.js actualizado: Adecco añadido antes del parser genérico — orden final: salud → vida → Adecco → genérico',
        'Mapeo de columnas: No. Identificación → cédula, Nombre → nombre, Código Concepto → COD_CONC, Valor → valor unitario',
        'Soporte para hoja "Detalle" o "Liquidación" como hoja principal del archivo',
      ]},
      { categoria: 'Descifrado de archivos Office', items: [
        'utils/decryptOffice.js: usa msoffcrypto-tool (vía Python subprocess) para desproteger .xlsx/.xls con contraseña conocida antes de pasarlos al parser',
        'Flujo: buffer recibido → detecta cifrado (magic bytes) → descifra en memoria → entrega buffer limpio al parser',
        'Contraseña configurable vía variable de entorno ADECCO_PASSWORD; por defecto intenta sin contraseña primero',
        'Si el descifrado falla, devuelve error 422 con mensaje descriptivo al cliente',
      ]},
      { categoria: 'Controlador y rutas', items: [
        'controllers/importarExcelController.js (+875 líneas netas sobre V0.7): integra la lógica de descifrado antes de llamar al parser',
        'routes/ocasionales.js: límite de tamaño de archivo ajustado a 20 MB para acomodar archivos Adecco de gran volumen',
        '.env: nueva variable ADECCO_PASSWORD para la contraseña de archivos protegidos',
        'package.json + package-lock.json: dependencias msoffcrypto-tool y node_modules actualizados',
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

  for (let i = 0; i < commits.length; i++) {
    const c = commits[i];
    if (esVersionPrincipal(c.subject)) {
      const etiqueta = etiquetaVersion(c.subject);
      if (!etiqueta) { buffer.push(c); continue; } // sin etiqueta → tratar como no-versión
      const catalog  = CATALOG[etiqueta] || {};
      versions.push({
        version:  etiqueta,
        fecha:    c.date,
        commit:   c.hash.substring(0, 7),
        titulo:   catalog.titulo || descripcionCommit(c.subject),
        resumen:  catalog.resumen || [],
        detalle:  catalog.detalle || [],
        commits:  [c, ...buffer],
      });
      buffer = [];
    } else {
      buffer.push(c);
    }
  }

  // Commits anteriores al primer tag de versión → "En desarrollo"
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

  // ── Desduplicar: si dos commits producen la misma etiqueta (ej. dos "Upload
  //    Payroll V0.12"), mantener solo la primera (más reciente) y fusionar commits
  const versionMap = new Map();
  const deduped    = [];
  for (const v of versions) {
    if (v.version === 'dev') { deduped.push(v); continue; }
    if (versionMap.has(v.version)) {
      // Fusionar commits del duplicado en la entrada existente
      versionMap.get(v.version).commits.push(...v.commits);
    } else {
      versionMap.set(v.version, v);
      deduped.push(v);
    }
  }

  // ── Ordenar por versión descendente (mayor primero); "dev" siempre al final
  deduped.sort((a, b) => {
    if (a.version === 'dev') return  1;
    if (b.version === 'dev') return -1;
    return cmpVersiones(a, b);
  });

  // ── Extraer commits post-V0.20 como versión de parche v0.20.1 ─────────────
  // Incluye tanto los bugfixes (734c2a2, 217147e, 0067b66) como la actualización
  // del changelog (684ad03) — todos realizados en la misma sesión de trabajo.
  const PATCH_V20_1 = ['684ad03', '734c2a2', '217147e', '0067b66'];
  const v20idx = deduped.findIndex(v => v.version === 'v0.20');
  if (v20idx !== -1) {
    const patches = deduped[v20idx].commits.filter(
      c => PATCH_V20_1.includes(c.hash.substring(0, 7))
    );
    if (patches.length > 0) {
      deduped[v20idx].commits = deduped[v20idx].commits.filter(
        c => !PATCH_V20_1.includes(c.hash.substring(0, 7))
      );
      const cat201 = CATALOG['v0.20.1'] || {};
      deduped.splice(v20idx, 0, {
        version: 'v0.20.1',
        fecha:   patches[0]?.date || '',
        commit:  patches[0]?.hash.substring(0, 7) || '',
        titulo:  cat201.titulo || 'Correcciones post-lanzamiento',
        resumen: cat201.resumen || patches.map(c => c.subject),
        detalle: cat201.detalle || [],
        commits: patches,
      });
    }
  }

  res.json({ ok: true, versiones: deduped });
});

// ─── GET /api/changelog/raw ───────────────────────────────────────────────────
router.get('/raw', (req, res) => {
  res.json({ ok: true, commits: getCommits() });
});

module.exports = router;
