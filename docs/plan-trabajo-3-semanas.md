# Plan de Trabajo: 3 Semanas hacia un Sistema Automatizado
### Implementación progresiva — Nomina 2026 / MineDax — Junio 2026

---

> **Premisa fundamental**
>
> Este plan no descarta lo que existe. El backend (Express, parsers, controllers, SQL Server) sigue funcionando en producción durante todo el proceso. Cada semana agrega una capa nueva sin romper la anterior. Al final de las 3 semanas, el sistema hace más de lo que hace hoy, y los usuarios ven resultados tangibles.
>
> **Regla de oro:** si algo que funciona hoy deja de funcionar por un cambio tuyo, reviertes inmediatamente. Nunca hay que correr a arreglar producción en medio de un proceso de mejora.

---

## Vista general del plan

```
SEMANA 1 — "El puente de correo"
  Resultado tangible: El sistema detecta correos de RRHH y registra los adjuntos automáticamente.
  Los usuarios todavía usan la interfaz actual para importar; el email es un canal adicional.

SEMANA 2 — "La IA entra al flujo"  
  Resultado tangible: Los correos se procesan sin intervención humana. Las novedades Adecco
  aparecen en la plataforma directamente desde el correo.

SEMANA 3 — "La base de datos del futuro"
  Resultado tangible: El sistema funciona en PostgreSQL. SQL Server queda como respaldo.
  Demo completo del flujo email → IA → PostgreSQL → plataforma web.
```

---

## SEMANA 1 — El puente de correo
### Objetivo: automatizar la detección y descarga de adjuntos del correo de RRHH

---

### Lunes — Preparar el entorno de desarrollo paralelo

**¿Qué se hace?**
Crear la estructura del nuevo servicio de email dentro del proyecto actual, sin tocar ningún archivo existente.

**Tareas:**

```
[ ] 1. Crear la carpeta services/ en la raíz del proyecto
[ ] 2. Crear services/emailPoller.js (archivo vacío por ahora)
[ ] 3. Instalar las dependencias nuevas:
       npm install @azure/identity @microsoft/microsoft-graph-client
[ ] 4. Agregar al .env las variables de Graph API (del Día 2 de la guía de aprendizaje)
[ ] 5. Agregar al .gitignore: services/emailPoller.test.js
[ ] 6. Crear la tabla NO_EMAIL_PROC en la BD (ver SQL abajo)
```

**SQL para la tabla de auditoría de emails (ejecutar en SSMS o pgAdmin):**

```sql
-- Ejecutar en SQL Server (MineDax) para el sistema actual
CREATE TABLE dbo.NO_EMAIL_PROC (
  ID_PROC        INT IDENTITY(1,1) PRIMARY KEY,
  MSG_ID         NVARCHAR(500)   NOT NULL,   -- ID único del correo en Outlook
  FEC_RECIB      DATETIME,                    -- cuándo llegó el correo
  REM_EMAIL      NVARCHAR(200),               -- quién envió
  REM_NOMBRE     NVARCHAR(200),               -- nombre del remitente
  ASUNTO         NVARCHAR(500),               -- asunto del correo
  NOM_ADJUNTO    NVARCHAR(300),               -- nombre del archivo adjunto
  TIPO_ADJUNTO   NVARCHAR(100),               -- mimetype
  TAM_KB         INT,                         -- tamaño en KB
  ESTADO         CHAR(1) DEFAULT 'P',         -- P=pendiente, A=aprobado, R=rechazado, E=error
  PARSER_USADO   NVARCHAR(50),                -- qué parser lo procesó
  CONFIANZA      DECIMAL(5,4),                -- 0.0000 a 1.0000
  COD_NOVED_INI  INT,                         -- primera novedad creada
  COD_NOVED_FIN  INT,                         -- última novedad creada
  NOVEDADES_OK   INT DEFAULT 0,               -- cuántas se insertaron
  NOVEDADES_ERR  INT DEFAULT 0,               -- cuántas fallaron
  MENS_ERROR     NVARCHAR(MAX),               -- mensaje de error si aplica
  ACT_USUA       NVARCHAR(50) DEFAULT 'AGENTE_EMAIL',
  ACT_HORA       DATETIME DEFAULT GETDATE()
);

-- Índice para búsquedas rápidas por estado
CREATE INDEX IX_NO_EMAIL_PROC_ESTADO ON dbo.NO_EMAIL_PROC(ESTADO, ACT_HORA DESC);

-- Índice para evitar procesar el mismo correo dos veces
CREATE UNIQUE INDEX UX_NO_EMAIL_PROC_MSG ON dbo.NO_EMAIL_PROC(MSG_ID);
```

**Cómo verificar que el lunes fue exitoso:**
```bash
node -e "require('./services/emailPoller')" 
# No debe lanzar error (el archivo está vacío pero el require no falla)
```

---

### Martes — Construir el núcleo del email poller

**¿Qué se hace?**
Escribir la lógica principal de `services/emailPoller.js`: conectarse a Graph API, leer correos nuevos, y registrar los adjuntos en `NO_EMAIL_PROC`.

**Código a implementar en `services/emailPoller.js`:**

```javascript
// services/emailPoller.js
'use strict';

const { ClientSecretCredential } = require('@azure/identity');
const { Client } = require('@microsoft/microsoft-graph-client');
const { TokenCredentialAuthenticationProvider } = require(
  '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials'
);
const { executeQuery } = require('../config/database');
const logger = require('../config/logger');

// ── Lista blanca de remitentes autorizados ────────────────────────────────────
// AJUSTA ESTO con los dominios/emails reales de Adecco y proveedores
const REMITENTES_AUTORIZADOS = [
  '@adecco.com',
  '@collectivemining.com',
  // Agrega más según sea necesario
];

function remitenteEsAutorizado(email) {
  const emailLower = email.toLowerCase();
  return REMITENTES_AUTORIZADOS.some(dominio => emailLower.endsWith(dominio));
}

// ── Crear cliente de Graph API ────────────────────────────────────────────────
function crearGraphClient() {
  const credential = new ClientSecretCredential(
    process.env.GRAPH_TENANT_ID,
    process.env.GRAPH_CLIENT_ID,
    process.env.GRAPH_CLIENT_SECRET
  );
  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default']
  });
  return Client.initWithMiddleware({ authProvider });
}

// ── Obtener correos no procesados ─────────────────────────────────────────────
async function obtenerCorreosNuevos(graphClient) {
  const resultado = await graphClient
    .api(`/users/${process.env.GRAPH_MAILBOX}/messages`)
    .filter("hasAttachments eq true and isRead eq false")
    .select('id,subject,from,receivedDateTime,hasAttachments')
    .orderby('receivedDateTime ASC')  // más antiguos primero (FIFO)
    .top(20)
    .get();
  
  return resultado.value || [];
}

// ── Verificar si un correo ya fue procesado ───────────────────────────────────
async function yaFueProcesado(msgId) {
  const r = await executeQuery(
    `SELECT COUNT(*) AS N FROM dbo.NO_EMAIL_PROC WHERE MSG_ID = @msgId`,
    { msgId }
  );
  return r.recordset[0].N > 0;
}

// ── Registrar correo en BD ────────────────────────────────────────────────────
async function registrarEnBD(correo, adjunto, estado, extra = {}) {
  await executeQuery(`
    INSERT INTO dbo.NO_EMAIL_PROC
      (MSG_ID, FEC_RECIB, REM_EMAIL, REM_NOMBRE, ASUNTO,
       NOM_ADJUNTO, TIPO_ADJUNTO, TAM_KB, ESTADO, MENS_ERROR)
    VALUES
      (@msgId, @fecRecib, @remEmail, @remNombre, @asunto,
       @nomAdj, @tipoAdj, @tamKb, @estado, @mensError)
  `, {
    msgId:     correo.id,
    fecRecib:  new Date(correo.receivedDateTime),
    remEmail:  correo.from.emailAddress.address,
    remNombre: correo.from.emailAddress.name || '',
    asunto:    correo.subject || '(sin asunto)',
    nomAdj:    adjunto ? adjunto.name : null,
    tipoAdj:   adjunto ? adjunto.contentType : null,
    tamKb:     adjunto ? Math.round(adjunto.size / 1024) : 0,
    estado,
    mensError: extra.error || null,
  });
}

// ── Marcar correo como leído en Outlook ──────────────────────────────────────
async function marcarComoLeido(graphClient, msgId) {
  await graphClient
    .api(`/users/${process.env.GRAPH_MAILBOX}/messages/${msgId}`)
    .patch({ isRead: true });
}

// ── FUNCIÓN PRINCIPAL: un ciclo de polling ────────────────────────────────────
async function ejecutarCiclo() {
  logger.info('EmailPoller: iniciando ciclo');
  
  let graphClient;
  try {
    graphClient = crearGraphClient();
  } catch (e) {
    logger.error('EmailPoller: no se pudo crear cliente Graph', { error: e.message });
    return;
  }
  
  let correos;
  try {
    correos = await obtenerCorreosNuevos(graphClient);
    logger.info(`EmailPoller: ${correos.length} correo(s) nuevos encontrados`);
  } catch (e) {
    logger.error('EmailPoller: error al obtener correos', { error: e.message });
    return;
  }
  
  for (const correo of correos) {
    const remitente = correo.from.emailAddress.address;
    
    // Verificar si ya fue procesado (evitar duplicados)
    if (await yaFueProcesado(correo.id)) {
      logger.info(`EmailPoller: correo ya procesado, ignorando`, { id: correo.id.substring(0, 40) });
      continue;
    }
    
    // Verificar remitente autorizado
    if (!remitenteEsAutorizado(remitente)) {
      logger.warn(`EmailPoller: remitente no autorizado: ${remitente}`);
      await registrarEnBD(correo, null, 'R', { error: `Remitente no autorizado: ${remitente}` });
      await marcarComoLeido(graphClient, correo.id);
      continue;
    }
    
    // Descargar adjuntos
    try {
      const adjuntosResp = await graphClient
        .api(`/users/${process.env.GRAPH_MAILBOX}/messages/${correo.id}/attachments`)
        .get();
      
      const adjuntos = (adjuntosResp.value || []).filter(
        a => a['@odata.type'] === '#microsoft.graph.fileAttachment'
      );
      
      if (adjuntos.length === 0) {
        await registrarEnBD(correo, null, 'R', { error: 'Sin adjuntos de archivo' });
        await marcarComoLeido(graphClient, correo.id);
        continue;
      }
      
      for (const adjunto of adjuntos) {
        // Por ahora solo registramos — el procesamiento viene en Semana 2
        await registrarEnBD(correo, adjunto, 'P');
        logger.info(`EmailPoller: adjunto registrado`, { 
          nombre: adjunto.name, 
          remitente,
          tamKb: Math.round(adjunto.size / 1024)
        });
      }
      
      await marcarComoLeido(graphClient, correo.id);
      
    } catch (e) {
      logger.error(`EmailPoller: error procesando correo`, { 
        id: correo.id.substring(0, 40), error: e.message 
      });
      await registrarEnBD(correo, null, 'E', { error: e.message });
    }
  }
  
  logger.info('EmailPoller: ciclo completado');
}

module.exports = { ejecutarCiclo };
```

**Cómo verificar que el martes fue exitoso:**
```bash
# Prueba manual del ciclo (agrega esto temporalmente en server.js o un script de prueba)
const { ejecutarCiclo } = require('./services/emailPoller');
ejecutarCiclo().then(() => console.log('✅ Ciclo completado')).catch(console.error);
```
Revisa `NO_EMAIL_PROC` en SSMS — deben aparecer los correos detectados.

---

### Miércoles — Integrar el poller con server.js

**¿Qué se hace?**
Hacer que el email poller se ejecute automáticamente cada 5 minutos cuando el servidor está corriendo.

**Código a agregar en `server.js`** (busca el comentario `_runBootstrapsOnce` y agrega al final):

```javascript
// En server.js, después de _runBootstrapsOnce():

// ── Email Poller automático ────────────────────────────────────────────────────
// Solo activo si las variables de Graph API están configuradas
if (process.env.GRAPH_TENANT_ID && process.env.GRAPH_CLIENT_ID) {
  const { ejecutarCiclo } = require('./services/emailPoller');
  
  // Primera ejecución a los 30 segundos de arrancar el servidor
  setTimeout(() => {
    ejecutarCiclo().catch(e => logger.error('EmailPoller inicial falló', { error: e.message }));
  }, 30_000);
  
  // Luego cada 5 minutos
  const INTERVALO_MINUTOS = 5;
  setInterval(() => {
    ejecutarCiclo().catch(e => logger.error('EmailPoller ciclo falló', { error: e.message }));
  }, INTERVALO_MINUTOS * 60 * 1000);
  
  logger.info(`EmailPoller activado — ciclos cada ${INTERVALO_MINUTOS} min`);
} else {
  logger.warn('EmailPoller desactivado — variables GRAPH_* no configuradas');
}
```

---

### Jueves — Endpoint de consulta y primera vista en la interfaz

**¿Qué se hace?**
Crear el endpoint que expone el estado del poller, y una vista mínima en la interfaz web existente.

**Nuevo archivo `routes/emailProc.js`:**
```javascript
'use strict';
const express = require('express');
const router = express.Router();
const { executeQuery } = require('../config/database');
const { verifyToken, checkLevel } = require('../middleware/authMiddleware');

// GET /api/email-proc — listar los últimos correos procesados
router.get('/', verifyToken, checkLevel(2), async (req, res) => {
  try {
    const r = await executeQuery(`
      SELECT TOP 50
        ID_PROC, FEC_RECIB, REM_EMAIL, ASUNTO, NOM_ADJUNTO,
        ESTADO, PARSER_USADO, CONFIANZA, NOVEDADES_OK, NOVEDADES_ERR, MENS_ERROR
      FROM dbo.NO_EMAIL_PROC
      ORDER BY ACT_HORA DESC
    `, {});
    res.json({ ok: true, datos: r.recordset });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

module.exports = router;
```

Registra la ruta en `server.js`:
```javascript
app.use('/api/email-proc', require('./routes/emailProc'));
```

---

### Viernes — Prueba integral de la Semana 1

**¿Qué se prueba?**

Envía un correo desde una cuenta autorizada al buzón de RRHH, con un archivo Excel Adecco adjunto. Espera 5 minutos (o llama manualmente a `ejecutarCiclo()`). Verifica:

```sql
SELECT * FROM dbo.NO_EMAIL_PROC ORDER BY ACT_HORA DESC;
```

El correo debe aparecer con `ESTADO = 'P'` (pendiente de procesar).

**Resultado tangible de la Semana 1:**
El sistema detecta correos automáticamente y los registra. El equipo de RRHH puede ver en la BD (o en el endpoint) qué correos llegaron, de quién, con qué adjuntos. La importación manual sigue funcionando en paralelo — no se eliminó nada.

---

## SEMANA 2 — La IA entra al flujo
### Objetivo: que el correo detectado en Semana 1 sea procesado y sus novedades registradas automáticamente

---

### Lunes — Crear `services/documentExtractor.js`

**¿Qué se hace?**
Extraer la lógica de llamada a Claude API en un módulo reutilizable, separado del poller.

```javascript
// services/documentExtractor.js
'use strict';

const Anthropic = require('@anthropic-ai/sdk');

// npm install @anthropic-ai/sdk
const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const MIME_TYPES = {
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  xls:  'application/vnd.ms-excel',
  pdf:  'application/pdf',
  png:  'image/png',
  jpg:  'image/jpeg',
  jpeg: 'image/jpeg',
};

const PROMPT_EXTRACCION = `
Eres un experto en nómina colombiana. Analiza el documento y extrae todas las novedades.
Responde ÚNICAMENTE con JSON válido. Sin texto adicional. Sin explicaciones.

{
  "tipo_documento": "descripción breve del tipo de archivo",
  "periodo": "YYYY-MM-Qn si está visible, null si no",
  "confianza": 0.95,
  "novedades": [
    {
      "cedula": "solo dígitos sin puntos ni espacios",
      "nombre": "nombre completo",
      "hoja": "Ocasionales|Fijas|Ausentismos|Cambios",
      "concepto": "nombre exacto del concepto",
      "cantidad": null,
      "valor": null,
      "fecha_inicio": null,
      "fecha_fin": null,
      "dias": null,
      "observaciones": ""
    }
  ],
  "advertencias": []
}

Reglas:
- cedula: SOLO dígitos. Quita puntos, espacios, guiones.
- valor/cantidad: números sin formato ($, comas). null si no aplica.
- fechas: formato "YYYY-MM-DD". null si no aplica.
- Si el archivo no es de nómina: { "novedades": [], "advertencias": ["No es un archivo de nómina"] }
`;

/**
 * Extrae novedades de un buffer de archivo usando Claude API.
 * @param {Buffer} buffer   Contenido del archivo
 * @param {string} nombre   Nombre original del archivo (para detectar extensión)
 * @returns {Promise<{tipo_documento, periodo, confianza, novedades, advertencias}>}
 */
async function extraerNovedades(buffer, nombre) {
  const ext = nombre.split('.').pop().toLowerCase();
  const mediaType = MIME_TYPES[ext];
  
  if (!mediaType) {
    throw new Error(`Formato no soportado: .${ext}`);
  }
  
  const respuesta = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') }
        },
        { type: 'text', text: PROMPT_EXTRACCION }
      ]
    }]
  });
  
  const texto = respuesta.content[0].text.trim();
  
  try {
    return JSON.parse(texto);
  } catch {
    throw new Error(`Claude no devolvió JSON válido. Primeros 200 chars: ${texto.substring(0, 200)}`);
  }
}

module.exports = { extraerNovedades };
```

---

### Martes — Conectar extractor con el parser existente

**¿Qué se hace?**
Actualizar `emailPoller.js` para que, cuando registra un adjunto en Semana 1, ahora también intente procesarlo con el pipeline existente (`parserRegistry`) y, si falla, use Claude como fallback.

**Actualización clave en `services/emailPoller.js`** (solo la sección de procesamiento):

```javascript
// Agregar al inicio de emailPoller.js:
const { getParser } = require('../utils/importParsers/parserRegistry');
const { extraerNovedades } = require('./documentExtractor');

// Función nueva: procesar un adjunto (reemplaza el simple "registrar" de Semana 1)
async function procesarAdjunto(adjunto, correo) {
  const buffer = Buffer.from(adjunto.contentBytes, 'base64');
  const fileObj = {
    originalname: adjunto.name,
    mimetype: adjunto.contentType,
    buffer,
  };
  
  let resultado;
  let parserUsado;
  
  // 1. Intentar con el parser existente (más rápido y barato)
  const parser = getParser(fileObj);
  
  if (parser) {
    parserUsado = parser.meta.id;
    resultado = await parser.parse(fileObj, { codEmpr: 1 });
    resultado.confianza = 0.98; // parsers determinísticos = alta confianza
    resultado.viaClaude = false;
  } else {
    // 2. Fallback: Claude API (documentos no reconocidos)
    parserUsado = 'claude-sonnet';
    const extraccion = await extraerNovedades(buffer, adjunto.name);
    
    // Convertir formato Claude al formato que espera procesarEnBD
    resultado = {
      agrupado: convertirAClaude(extraccion.novedades),
      advertencias: extraccion.advertencias,
      confianza: extraccion.confianza,
      viaClaude: true,
    };
  }
  
  return { resultado, parserUsado };
}

// Convertir el JSON de Claude al Map<cedula, {novedades}> que espera el controller
function convertirAClaude(novedadesIA) {
  const agrupado = new Map();
  
  for (const nov of novedadesIA) {
    if (!agrupado.has(nov.cedula)) {
      agrupado.set(nov.cedula, { cedula: nov.cedula, nombre: nov.nombre, novedades: new Map() });
    }
    const emp = agrupado.get(nov.cedula);
    // Por ahora mapeamos todo como OCASIONAL — en Semana 2 refinamos
    emp.novedades.set(nov.concepto, {
      tipo: nov.hoja === 'Ausentismos' ? 'AUSENTISMO' :
            nov.hoja === 'Fijas' ? 'FIJA' :
            nov.hoja === 'Cambios' ? 'CAMBIO' : 'OCASIONAL',
      cantidad: nov.cantidad || 1,
      valor: nov.valor || 0,
      extra: { fecIni: nov.fecha_inicio, fecFin: nov.fecha_fin, diasTotal: nov.dias }
    });
  }
  
  return agrupado;
}
```

---

### Miércoles — Integrar con `procesarEnBD`

**¿Qué se hace?**
Conectar el resultado del extractor con la función `procesarEnBD` que ya existe en `importarExcelController.js`. Esta función ya hace todo el trabajo de insertar en `NO_NOVED`, `NO_OCASI`, etc.

La clave es que `procesarEnBD` es una función pura que recibe el `agrupado` y escribe en la BD. Solo hay que exportarla para que el poller pueda usarla.

**Cambio en `controllers/importarExcelController.js`** (solo agregar al final):
```javascript
// Agregar al final del archivo, antes del module.exports existente:
module.exports.procesarEnBD = procesarEnBD;  // exportar para uso desde emailPoller
```

**En `services/emailPoller.js`**, agregar la llamada a `procesarEnBD`:
```javascript
const { procesarEnBD } = require('../controllers/importarExcelController');

// Dentro del loop de adjuntos, después de procesarAdjunto():
const periodo = await resolverPeriodoActual(1);  // también exportar esta función

if (resultado.confianza >= 0.80) {
  // Alta confianza: procesar automáticamente
  const resumen = await procesarEnBD({
    agrupado: resultado.agrupado,
    codEmpr: 1,
    periodo,
    pool: await getConnection(),
    usuario: `AGENTE_EMAIL:${correo.from.emailAddress.address}`,
    nombreArchivo: adjunto.name,
  });
  
  // Actualizar NO_EMAIL_PROC con el resultado
  await actualizarEstadoProcesado(correo.id, 'A', resumen, parserUsado, resultado.confianza);
  
} else {
  // Baja confianza: dejar en cola para revisión humana
  await actualizarEstadoProcesado(correo.id, 'P', null, parserUsado, resultado.confianza);
  logger.warn(`EmailPoller: baja confianza (${resultado.confianza}) → revisión manual`);
}
```

---

### Jueves — Endpoint de revisión y bandeja de novedades

**¿Qué se hace?**
Crear el endpoint `PUT /api/email-proc/:id/aprobar` para que un supervisor pueda aprobar manualmente los correos de baja confianza.

```javascript
// En routes/emailProc.js — agregar:
router.put('/:id/aprobar', verifyToken, checkLevel(2), async (req, res) => {
  const { id } = req.params;
  try {
    // Obtener el registro de email y procesar el adjunto (ya está guardado el buffer en Blob o BD)
    // Por ahora: solo cambiar estado a 'A' (aprobado manual)
    await executeQuery(
      `UPDATE dbo.NO_EMAIL_PROC SET ESTADO='A', ACT_USUA=@usua, ACT_HORA=GETDATE() WHERE ID_PROC=@id`,
      { id: parseInt(id), usua: req.headers['x-abr-usua'] || 'SUPERVISOR' }
    );
    res.json({ ok: true, mensaje: 'Correo aprobado manualmente' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});

router.put('/:id/rechazar', verifyToken, checkLevel(2), async (req, res) => {
  const { id } = req.params;
  const { motivo } = req.body;
  try {
    await executeQuery(
      `UPDATE dbo.NO_EMAIL_PROC SET ESTADO='R', MENS_ERROR=@motivo, ACT_HORA=GETDATE() WHERE ID_PROC=@id`,
      { id: parseInt(id), motivo: motivo || 'Rechazado manualmente' }
    );
    res.json({ ok: true, mensaje: 'Correo rechazado' });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
```

---

### Viernes — Prueba de extremo a extremo y medición de precisión

**¿Qué se prueba?**
1. Enviar 5 correos con archivos Adecco reales de períodos anteriores.
2. Esperar que el sistema los procese automáticamente.
3. Comparar las novedades insertadas en `NO_NOVED` con las que generó el proceso manual en esos mismos períodos.

**SQL para medir precisión:**
```sql
-- ¿Cuántas novedades procesó el agente esta semana?
SELECT 
    ep.REM_EMAIL,
    ep.NOM_ADJUNTO,
    ep.ESTADO,
    ep.PARSER_USADO,
    CAST(ep.CONFIANZA * 100 AS INT) AS CONFIANZA_PCT,
    ep.NOVEDADES_OK,
    ep.NOVEDADES_ERR,
    ep.ACT_HORA
FROM dbo.NO_EMAIL_PROC ep
WHERE ep.ACT_HORA >= DATEADD(day, -7, GETDATE())
ORDER BY ep.ACT_HORA DESC;
```

**Resultado tangible de la Semana 2:**
Un correo enviado por Adecco llega, el sistema lo detecta, Claude o el parser lee el archivo, y las novedades aparecen en la plataforma web existente. El supervisor puede ver en la bandeja qué procesó el agente y aprobar o rechazar los casos de baja confianza.

---

## SEMANA 3 — La base de datos del futuro
### Objetivo: introducir Knex.js y dejar el sistema listo para migrar a PostgreSQL

---

### Lunes — Instalar Knex y crear la capa de abstracción

**¿Qué se hace?**
Instalar Knex.js y crear un nuevo módulo `config/db.js` que use Knex. Este convive con el `config/database.js` existente — no lo reemplaza todavía.

```bash
npm install knex pg mssql
```

**Nuevo archivo `config/db.js`:**
```javascript
// config/db.js — nueva capa de base de datos con Knex
// Convive con config/database.js durante la transición
'use strict';

const knex = require('knex');

const CLIENT = process.env.DB_CLIENT || 'mssql';  // 'mssql' hoy, 'pg' mañana

const connectionConfig = CLIENT === 'pg' ? {
  host:     process.env.PG_HOST     || 'localhost',
  port:     parseInt(process.env.PG_PORT) || 5432,
  database: process.env.PG_DATABASE || 'minedax_pg',
  user:     process.env.PG_USER     || 'nomina_user',
  password: process.env.PG_PASSWORD,
} : {
  server:   process.env.SERVER,
  database: process.env.DATABASE,
  user:     process.env.UID,
  password: process.env.PWD,
  options:  { encrypt: false, trustServerCertificate: true },
};

const db = knex({
  client: CLIENT,
  connection: connectionConfig,
  pool: { min: 0, max: 10 },
});

module.exports = db;
```

Agregar al `.env`:
```env
# Cambiar a 'pg' cuando estés listo para PostgreSQL
DB_CLIENT=mssql
```

---

### Martes — Migrar `NO_EMAIL_PROC` a Knex (primer módulo)

**¿Qué se hace?**
Reescribir las consultas de `routes/emailProc.js` para usar `config/db.js` en lugar de `executeQuery` directo. Este es el módulo más nuevo y más fácil de migrar porque no tiene décadas de código T-SQL.

```javascript
// En routes/emailProc.js — versión con Knex
const db = require('../config/db');

router.get('/', verifyToken, checkLevel(2), async (req, res) => {
  try {
    const datos = await db('NO_EMAIL_PROC')
      .orderBy('ACT_HORA', 'desc')
      .limit(50);
    res.json({ ok: true, datos });
  } catch (e) {
    res.status(500).json({ ok: false, error: e.message });
  }
});
```

Prueba que funciona igual que antes. Si la respuesta JSON es idéntica, el módulo está migrado.

---

### Miércoles — Migrar el schema a PostgreSQL

**¿Qué se hace?**
Crear el schema equivalente en PostgreSQL y verificar que `DB_CLIENT=pg` funciona para los módulos ya migrados.

**Script de migración:** `database/migrate-to-postgres.sql`
```sql
-- Ejecutar en PostgreSQL (pgAdmin)

-- Schema SEC (seguridad)
CREATE SCHEMA IF NOT EXISTS sec;

-- Tabla de emails procesados (equivalente a dbo.NO_EMAIL_PROC en SQL Server)
CREATE TABLE IF NOT EXISTS "NO_EMAIL_PROC" (
  "ID_PROC"       SERIAL PRIMARY KEY,
  "MSG_ID"        VARCHAR(500) NOT NULL UNIQUE,
  "FEC_RECIB"     TIMESTAMP,
  "REM_EMAIL"     VARCHAR(200),
  "REM_NOMBRE"    VARCHAR(200),
  "ASUNTO"        VARCHAR(500),
  "NOM_ADJUNTO"   VARCHAR(300),
  "TIPO_ADJUNTO"  VARCHAR(100),
  "TAM_KB"        INTEGER,
  "ESTADO"        CHAR(1) DEFAULT 'P',
  "PARSER_USADO"  VARCHAR(50),
  "CONFIANZA"     NUMERIC(5,4),
  "COD_NOVED_INI" INTEGER,
  "COD_NOVED_FIN" INTEGER,
  "NOVEDADES_OK"  INTEGER DEFAULT 0,
  "NOVEDADES_ERR" INTEGER DEFAULT 0,
  "MENS_ERROR"    TEXT,
  "ACT_USUA"      VARCHAR(50) DEFAULT 'AGENTE_EMAIL',
  "ACT_HORA"      TIMESTAMP DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS ix_email_proc_estado 
  ON "NO_EMAIL_PROC"("ESTADO", "ACT_HORA" DESC);
```

**Probar cambiando el cliente:**
```env
DB_CLIENT=pg
```

Si `GET /api/email-proc` sigue devolviendo los mismos datos (ahora desde PostgreSQL), la migración de ese módulo está completa.

---

### Jueves — Demo preparación y documentación interna

**¿Qué se hace?**
Preparar la demostración de los resultados para los directivos. Esto incluye:

1. Un correo de demostración real enviado al buzón de RRHH
2. Capturas del proceso: correo recibido → procesado → novedades en la plataforma
3. Tabla comparativa de tiempo: "antes" (manual) vs "ahora" (automático)
4. Actualizar `CLAUDE.md` con la nueva arquitectura

**Tabla para la presentación:**

| Paso | Antes (manual) | Ahora (automático) |
|------|----------------|-------------------|
| Detección del correo | ~15 min (alguien lo ve) | ~5 min (polling) |
| Descarga del adjunto | 2-3 min | 0 min |
| Importar en plataforma | 5 min | 0 min |
| Revisión de resultados | 5-10 min | Solo si confianza < 80% |
| **Total por archivo** | **~25-30 min** | **~5 min (solo revisión)** |

---

### Viernes — Demo final y retrospectiva

**Demostración en vivo (30 min):**
1. Enviar el correo con archivo Adecco frente a los directivos
2. Mostrar en tiempo real cómo aparece en `NO_EMAIL_PROC`
3. Esperar el ciclo de 5 minutos o forzar manualmente
4. Mostrar las novedades insertadas en la plataforma
5. Mostrar la consulta SQL en PostgreSQL (si ya hay módulos migrados)

**Retrospectiva (30 min) — preguntas a responder:**
- ¿Qué porcentaje de archivos Adecco procesó correctamente el sistema esta semana?
- ¿Cuántas intervenciones manuales fueron necesarias?
- ¿Qué formatos de archivo no pudo procesar el sistema?
- ¿Hay remitentes que deberían agregarse a la lista blanca?

---

## Resumen de lo que el sistema puede hacer al final de las 3 semanas

```
✅ Detectar correos nuevos en el buzón de RRHH cada 5 minutos
✅ Validar que el remitente está en la lista blanca
✅ Descargar adjuntos automáticamente
✅ Procesar archivos Adecco con el parser existente (alta confianza)
✅ Procesar otros formatos con Claude API (fallback inteligente)
✅ Registrar novedades en NO_NOVED, NO_OCASI, etc. sin intervención humana
✅ Dejar en cola los casos de baja confianza para revisión del supervisor
✅ Registrar auditoría completa en NO_EMAIL_PROC
✅ Exponer endpoint /api/email-proc para consultar el estado
✅ Funcionar tanto con SQL Server (Express) como con PostgreSQL (Knex)

⏳ Pendiente para siguientes sprints:
   - Migración completa de todos los módulos a Knex
   - Migración completa del schema a PostgreSQL
   - Interfaz web mejorada (tab "Bandeja de correos")
   - Notificaciones por email al supervisor cuando hay revisión pendiente
   - Almacenamiento de adjuntos en Azure Blob / carpeta local
```

---

## Tabla de dependencias entre tareas

```
Semana 1, Lunes      ← sin dependencias (punto de partida)
Semana 1, Martes     ← depende de: Lunes (tabla NO_EMAIL_PROC creada)
Semana 1, Miércoles  ← depende de: Martes (emailPoller.js funcionando)
Semana 2, Lunes      ← depende de: Semana 1 completa
Semana 2, Martes     ← depende de: Sem2-Lunes (documentExtractor.js listo)
Semana 2, Miércoles  ← depende de: Sem2-Martes (extractor conectado)
Semana 3, Lunes      ← puede empezar en paralelo con Semana 2
Semana 3, Miércoles  ← depende de: Sem3-Martes (Knex instalado)
Demo final           ← depende de: Semana 2 completa
```

---

## Qué hacer si algo sale mal

**El poller lanza error de autenticación (Graph API):**
→ Verifica en Azure AD que el secreto no expiró y que los permisos `Mail.Read` tienen "admin consent".

**Claude devuelve texto en lugar de JSON:**
→ El prompt no está siendo respetado. Añade al inicio: `"Responde ÚNICAMENTE con el objeto JSON. No incluyas nada más."` y prueba con un documento más simple primero.

**PostgreSQL no acepta los mismos campos que SQL Server:**
→ Revisa la tabla de conversiones del Día 4 de la guía de aprendizaje. `NVARCHAR` → `VARCHAR`, `BIT` → `BOOLEAN`, `TOP N` → `LIMIT N`.

**`procesarEnBD` lanza error de trigger:**
→ El trigger `TR_NO_OCASI_VALIDA_CONCEPTO` puede estar rechazando un concepto. Verifica que el `COD_CONC` extraído por Claude existe en `NO_CONCE`. Agregar validación previa antes de escribir en BD.

---

*Plan elaborado basado en el análisis del código fuente de Nomina_2026_Alpha, la BD MineDax en SQL Server 2025 Express, y las conversaciones técnicas de Junio 2026.*
