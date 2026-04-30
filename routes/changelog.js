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
