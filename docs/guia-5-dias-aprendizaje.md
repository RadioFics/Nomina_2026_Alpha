# Guía de 5 Días: De Principiante a Primera Automatización
### Aprendizaje práctico aplicado al sistema Nómina / MineDax — Junio 2026

---

> **Cómo usar esta guía**
> 
> Cada día tiene una parte de **lectura/video** (mañana, ~2 horas) y una parte de **práctica con código** (tarde, ~3 horas). No avances al día siguiente sin haber completado el ejercicio de verificación al final de cada día. Si algo no funciona, ese es el aprendizaje real — no saltes el error, entiéndelo.
>
> Todo el código de práctica va en una carpeta nueva: `Nomina_2026_Alpha/sandbox/`. Nada de lo que hagas en el sandbox afecta el sistema real.

---

## Antes de empezar: lo que necesitas tener instalado

Verifica que tienes esto antes del Día 1. Si no lo tienes, instálalo primero.

```
✅ Node.js v20 o superior      → nodejs.org/en/download
✅ npm (viene con Node.js)
✅ Git                          → git-scm.com
✅ VS Code                      → code.visualstudio.com
✅ Postman                      → postman.com/downloads/
✅ Docker Desktop               → docker.com/products/docker-desktop/
✅ pgAdmin 4                    → pgadmin.org/download/
```

Para verificar que Node y Docker funcionan, abre una terminal y ejecuta:
```bash
node --version     # debe mostrar v20.x.x o superior
docker --version   # debe mostrar Docker version 26.x o superior
```

---

## DÍA 1 — Entender el sistema actual y preparar el entorno

### ¿Qué aprenderás hoy?
Cómo funciona el código que ya existe, por qué está diseñado así, y cómo preparar las herramientas que usarás el resto de la semana.

### Mañana: Lectura y orientación (2 horas)

**Paso 1 — Leer los archivos clave del proyecto (45 min)**

Abre VS Code en la carpeta `Nomina_2026_Alpha` y lee estos archivos en orden. No modifiques nada, solo lee y toma notas:

1. `CLAUDE.md` — el mapa del proyecto completo
2. `server.js` — cómo arranca el servidor y cómo bloquea rutas sensibles
3. `config/database.js` — cómo se conecta a SQL Server hoy
4. `utils/importParsers/parserRegistry.js` — cómo se detectan los tipos de archivo
5. `utils/importParsers/parserAdecco.js` (primeras 80 líneas) — el parser más importante

Mientras lees, respóndete estas preguntas:
- ¿Qué hace `executeQuery`? ¿Quién lo llama?
- ¿Cuántos parsers hay y cómo sabe el sistema cuál usar?
- ¿Qué pasa después de que un archivo se parsea?

**Paso 2 — Video introductorio sobre APIs REST (30 min)**

Si las APIs REST no son un concepto claro para ti, ve este video antes de continuar:
`https://www.youtube.com/watch?v=7YcW25PHnAA`
(título: "What is a REST API?" — IBM Technology, subtítulos en español disponibles)

Una API REST es simplemente un sistema donde haces preguntas via URLs y recibes respuestas en JSON. El sistema de nómina ya tiene su propia API en `/api/*`. Hoy empezarás a consumir APIs externas de la misma forma.

**Paso 3 — Instalar las extensiones de VS Code recomendadas (15 min)**

Abre VS Code, ve a la pestaña de Extensiones (Ctrl+Shift+X) e instala:
- `REST Client` (de Huachao Mao) — para probar APIs sin salir de VS Code
- `Thunder Client` — alternativa visual a Postman, más simple
- `GitLens` — para ver el historial de cambios
- `PostgreSQL` (de Chris Kolkman) — para ver la BD de PostgreSQL desde VS Code

### Tarde: Práctica (3 horas)

**Ejercicio 1 — Correr el servidor local y explorar la API (1 hora)**

```bash
cd Nomina_2026_Alpha
npm install
npm run dev
```

Abre Postman y prueba estas rutas del sistema:
```
GET  http://localhost:3000/api/health
```

Estudia la respuesta. Luego, con las credenciales de un usuario real, prueba:
```
POST http://localhost:3000/api/auth/login
Body (JSON): { "usuario": "...", "password": "..." }
```

Guarda el token JWT que te devuelve. Úsalo para probar:
```
GET http://localhost:3000/api/novedades
Headers: Authorization: Bearer <tu_token>
```

El objetivo es que entiendas que el sistema ya tiene su propia API funcionando. La automatización de correos va a usar esta misma API como destino final.

**Ejercicio 2 — Crear la carpeta sandbox (30 min)**

```bash
mkdir Nomina_2026_Alpha/sandbox
cd Nomina_2026_Alpha/sandbox
npm init -y
```

Esta será tu área de práctica durante los 5 días. Todo lo que escribas aquí es desechable.

**Ejercicio 3 — Tu primer script Node.js de práctica (1.5 horas)**

Crea el archivo `sandbox/dia1-explorar.js`:

```javascript
// sandbox/dia1-explorar.js
// Objetivo: entender cómo leer un archivo Excel en Node.js
// (el mismo mecanismo que usa parserAdecco.js)

const ExcelJS = require('exceljs');
const path = require('path');

// Primero instala la dependencia:
// npm install exceljs

async function explorarExcel(rutaArchivo) {
  const workbook = new ExcelJS.Workbook();
  
  // Leer el archivo
  await workbook.xlsx.readFile(rutaArchivo);
  
  console.log('=== HOJAS EN EL ARCHIVO ===');
  workbook.eachSheet((hoja, id) => {
    console.log(`  Hoja ${id}: "${hoja.name}" — ${hoja.rowCount} filas`);
  });
  
  // Ver la primera hoja
  const primeraHoja = workbook.worksheets[0];
  console.log('\n=== PRIMERAS 5 FILAS DE LA PRIMERA HOJA ===');
  
  primeraHoja.eachRow((fila, numeroFila) => {
    if (numeroFila <= 5) {
      const valores = [];
      fila.eachCell((celda) => {
        valores.push(celda.value);
      });
      console.log(`Fila ${numeroFila}:`, valores);
    }
  });
}

// Usa un archivo Excel cualquiera del formato Adecco que tengas
// Si no tienes uno, crea uno de prueba con 3 columnas y 5 filas en Excel
const archivo = process.argv[2] || 'archivo_prueba.xlsx';
explorarExcel(archivo).catch(console.error);
```

Instala la dependencia y ejecuta:
```bash
cd sandbox
npm install exceljs
node dia1-explorar.js "ruta/al/archivo/adecco.xlsx"
```

### ✅ Verificación del Día 1

Antes de terminar, debes poder responder:
1. ¿Qué hace `parserRegistry.js` y por qué importa el orden de los parsers?
2. ¿Qué es un JWT y para qué lo usa el sistema?
3. ¿Qué hojas tiene un archivo Adecco y desde qué fila empiezan los datos?

---

## DÍA 2 — Microsoft Graph API: conectar el correo de RRHH

### ¿Qué aprenderás hoy?
Cómo leer correos y descargar adjuntos de forma automática desde Outlook usando la API de Microsoft. Este es el punto de entrada del sistema de automatización.

### Por qué Microsoft Graph API y no otra cosa

Graph API es la forma oficial y segura de acceder a correos de Outlook/Exchange desde código. No necesita que alguien abra Outlook. Funciona en segundo plano, 24/7, y es la misma API que usan Teams, SharePoint y toda la suite Microsoft 365. Si el correo de RRHH está en Outlook (que en Collective Mining es probable dado el entorno Azure), esta es la herramienta correcta.

### Mañana: Lectura y configuración (2 horas)

**Paso 1 — Entender OAuth 2.0 en 10 minutos (video)**

`https://www.youtube.com/watch?v=ZV5yTm4pT8g`

OAuth 2.0 es el sistema que le permite a tu código decirle a Microsoft "soy la aplicación autorizada para leer este correo". No necesitas entender cada detalle técnico, solo el concepto: tu aplicación se registra en Azure AD, obtiene unas "llaves", y con esas llaves puede pedir tokens de acceso que le abren la puerta al correo.

**Paso 2 — Registrar la aplicación en Azure AD (30-45 min)**

Sigue estos pasos exactos:

1. Ve a `portal.azure.com` e inicia sesión con la cuenta de la empresa
2. Busca "Azure Active Directory" → "App registrations" → "New registration"
3. Nombre: `Nomina-Email-Agent`
4. "Supported account types": selecciona "Accounts in this organizational directory only"
5. Haz clic en "Register"
6. En la pantalla que aparece, COPIA y guarda estos tres valores:
   ```
   Application (client) ID:  xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   Directory (tenant) ID:    xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
   ```
7. Ve a "Certificates & secrets" → "New client secret"
8. Descripción: `nomina-agent-secret`, Expiry: 24 months
9. COPIA el valor del secreto AHORA (desaparece al salir de la página):
   ```
   Client Secret Value: xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
   ```
10. Ve a "API permissions" → "Add a permission" → "Microsoft Graph" → "Application permissions"
11. Busca y agrega: `Mail.Read` y `Mail.Send`
12. Haz clic en "Grant admin consent for [tu organización]"

**Paso 3 — Guardar las credenciales de forma segura**

Agrega al archivo `.env` del proyecto (nunca en el código):
```env
# Microsoft Graph API
GRAPH_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
GRAPH_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
GRAPH_CLIENT_SECRET=xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
GRAPH_MAILBOX=nomina@tuempresa.com
```

### Tarde: Práctica (3 horas)

**Ejercicio 1 — Obtener un token de acceso (45 min)**

Instala la dependencia:
```bash
cd sandbox
npm install @azure/identity @microsoft/microsoft-graph-client node-fetch
```

Crea `sandbox/dia2-graph-token.js`:
```javascript
// sandbox/dia2-graph-token.js
// Objetivo: obtener un token de acceso de Microsoft Graph API

const { ClientSecretCredential } = require('@azure/identity');
require('dotenv').config({ path: '../.env' });

async function obtenerToken() {
  console.log('Intentando obtener token de Microsoft Graph...');
  
  const credential = new ClientSecretCredential(
    process.env.GRAPH_TENANT_ID,      // tu tenant
    process.env.GRAPH_CLIENT_ID,       // tu app
    process.env.GRAPH_CLIENT_SECRET    // tu secreto
  );
  
  // Este es el "scope" que le dice a Microsoft qué permisos necesitamos
  const tokenResponse = await credential.getToken(
    'https://graph.microsoft.com/.default'
  );
  
  if (tokenResponse && tokenResponse.token) {
    console.log('✅ Token obtenido correctamente');
    console.log('   Expira:', new Date(tokenResponse.expiresOnTimestamp));
    console.log('   Primeros 50 chars:', tokenResponse.token.substring(0, 50) + '...');
  } else {
    console.log('❌ No se pudo obtener el token');
  }
  
  return tokenResponse;
}

obtenerToken().catch(err => {
  console.error('Error:', err.message);
  console.error('Verifica que GRAPH_TENANT_ID, GRAPH_CLIENT_ID y GRAPH_CLIENT_SECRET');
  console.error('están correctos en el archivo .env');
});
```

```bash
node dia2-graph-token.js
```

**Ejercicio 2 — Leer los últimos correos del buzón (1 hora)**

Crea `sandbox/dia2-leer-correos.js`:
```javascript
// sandbox/dia2-leer-correos.js
// Objetivo: listar los últimos 5 correos del buzón de RRHH

const { ClientSecretCredential } = require('@azure/identity');
const { Client } = require('@microsoft/microsoft-graph-client');
const { TokenCredentialAuthenticationProvider } = require(
  '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials'
);
require('dotenv').config({ path: '../.env' });

async function listarCorreos() {
  // 1. Crear la credencial
  const credential = new ClientSecretCredential(
    process.env.GRAPH_TENANT_ID,
    process.env.GRAPH_CLIENT_ID,
    process.env.GRAPH_CLIENT_SECRET
  );
  
  // 2. Crear el proveedor de autenticación
  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default']
  });
  
  // 3. Crear el cliente de Graph
  const graphClient = Client.initWithMiddleware({ authProvider });
  
  // 4. Pedir los últimos 5 correos con adjuntos del buzón de RRHH
  console.log(`Leyendo correos de: ${process.env.GRAPH_MAILBOX}`);
  
  const resultado = await graphClient
    .api(`/users/${process.env.GRAPH_MAILBOX}/messages`)
    .filter('hasAttachments eq true')   // solo correos con adjuntos
    .select('id,subject,from,receivedDateTime,hasAttachments')
    .orderby('receivedDateTime DESC')    // más recientes primero
    .top(5)                              // solo los últimos 5
    .get();
  
  console.log(`\n📬 Encontrados: ${resultado.value.length} correos con adjuntos\n`);
  
  resultado.value.forEach((correo, i) => {
    console.log(`--- Correo ${i + 1} ---`);
    console.log(`  Asunto:   ${correo.subject}`);
    console.log(`  De:       ${correo.from.emailAddress.address}`);
    console.log(`  Recibido: ${new Date(correo.receivedDateTime).toLocaleString('es-CO')}`);
    console.log(`  ID:       ${correo.id.substring(0, 40)}...`);
  });
  
  return resultado.value;
}

listarCorreos().catch(err => {
  console.error('Error:', err.message);
  if (err.statusCode === 403) {
    console.error('→ Permisos insuficientes. Verifica que Mail.Read está configurado en Azure AD');
  }
});
```

**Ejercicio 3 — Descargar el adjunto de un correo (1.15 horas)**

Crea `sandbox/dia2-descargar-adjunto.js`:
```javascript
// sandbox/dia2-descargar-adjunto.js
// Objetivo: descargar el adjunto de un correo y guardarlo localmente

const { ClientSecretCredential } = require('@azure/identity');
const { Client } = require('@microsoft/microsoft-graph-client');
const { TokenCredentialAuthenticationProvider } = require(
  '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials'
);
const fs = require('fs');
require('dotenv').config({ path: '../.env' });

async function descargarAdjunto(mensajeId) {
  const credential = new ClientSecretCredential(
    process.env.GRAPH_TENANT_ID,
    process.env.GRAPH_CLIENT_ID,
    process.env.GRAPH_CLIENT_SECRET
  );
  
  const authProvider = new TokenCredentialAuthenticationProvider(credential, {
    scopes: ['https://graph.microsoft.com/.default']
  });
  
  const graphClient = Client.initWithMiddleware({ authProvider });
  
  // Obtener lista de adjuntos del correo
  const adjuntos = await graphClient
    .api(`/users/${process.env.GRAPH_MAILBOX}/messages/${mensajeId}/attachments`)
    .get();
  
  console.log(`\n📎 Adjuntos encontrados: ${adjuntos.value.length}`);
  
  for (const adjunto of adjuntos.value) {
    console.log(`\n  Archivo: ${adjunto.name}`);
    console.log(`  Tipo:    ${adjunto.contentType}`);
    console.log(`  Tamaño:  ${(adjunto.size / 1024).toFixed(1)} KB`);
    
    if (adjunto['@odata.type'] === '#microsoft.graph.fileAttachment') {
      // El contenido está en base64 dentro de contentBytes
      const buffer = Buffer.from(adjunto.contentBytes, 'base64');
      
      // Guardarlo localmente para verificar
      const rutaLocal = `./adjunto_descargado_${adjunto.name}`;
      fs.writeFileSync(rutaLocal, buffer);
      console.log(`  ✅ Guardado en: ${rutaLocal}`);
      
      // Este buffer es exactamente lo que le pasaríamos al parserRegistry
      console.log(`  Buffer listo para parser: ${buffer.length} bytes`);
    }
  }
}

// Reemplaza este ID con el ID de un correo real del ejercicio anterior
const ID_CORREO = process.argv[2];

if (!ID_CORREO) {
  console.error('Uso: node dia2-descargar-adjunto.js <ID_DEL_CORREO>');
  console.error('Obtén el ID corriendo primero: node dia2-leer-correos.js');
  process.exit(1);
}

descargarAdjunto(ID_CORREO).catch(console.error);
```

### ✅ Verificación del Día 2

Al final del día debes haber logrado:
1. ✅ App registrada en Azure AD con permisos `Mail.Read`
2. ✅ Script que obtiene un token sin errores
3. ✅ Script que lista los últimos correos con adjuntos
4. ✅ Script que descarga un adjunto y lo guarda como archivo local

Si el archivo descargado se abre correctamente en Excel, el día fue un éxito.

---

## DÍA 3 — Claude API: hacer que la IA lea los documentos

### ¿Qué aprenderás hoy?
Cómo enviarle un documento a Claude y recibir los datos extraídos en formato JSON listo para insertarse en la base de datos.

### Mañana: Lectura y configuración (2 horas)

**Paso 1 — Crear cuenta y obtener API key de Anthropic (15 min)**

1. Ve a `console.anthropic.com`
2. Crea una cuenta con tu correo
3. En "API Keys" → "Create Key"
4. Copia la key (empieza con `sk-ant-...`)

Agrégala al `.env`:
```env
ANTHROPIC_API_KEY=sk-ant-api03-xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
```

Los primeros $5 USD de uso son gratuitos. Para pruebas con documentos de nómina, eso alcanza para cientos de llamadas.

**Paso 2 — Leer la documentación básica de Claude API (45 min)**

Lee estas dos páginas (son cortas):
- `https://docs.anthropic.com/en/api/getting-started` — qué es la API
- `https://docs.anthropic.com/en/docs/build-with-claude/vision` — cómo enviar imágenes y PDFs

El concepto clave: Claude puede recibir texto, imágenes, PDFs y archivos de Office directamente como parte de un mensaje. No necesitas OCR separado — Claude "ve" el documento y extrae lo que le pides.

**Paso 3 — Instalar el SDK (5 min)**

```bash
cd sandbox
npm install @anthropic-ai/sdk
```

### Tarde: Práctica (3 horas)

**Ejercicio 1 — Tu primera llamada a Claude (30 min)**

Crea `sandbox/dia3-claude-basico.js`:
```javascript
// sandbox/dia3-claude-basico.js
// Objetivo: hacer la primera llamada a Claude API y entender la estructura

const Anthropic = require('@anthropic-ai/sdk');
require('dotenv').config({ path: '../.env' });

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

async function preguntarAClaude(pregunta) {
  console.log(`Preguntando a Claude: "${pregunta}"\n`);
  
  const mensaje = await client.messages.create({
    model: 'claude-sonnet-4-6',   // el modelo que vamos a usar
    max_tokens: 1024,
    messages: [
      {
        role: 'user',
        content: pregunta
      }
    ]
  });
  
  console.log('Respuesta de Claude:');
  console.log(mensaje.content[0].text);
  console.log('\nTokens usados:', mensaje.usage);
}

// Empieza con algo simple para verificar que funciona
preguntarAClaude('¿Qué es una novedad de nómina en Colombia? Responde en 3 oraciones.')
  .catch(err => {
    console.error('Error:', err.message);
    if (err.status === 401) {
      console.error('→ API key incorrecta. Verifica ANTHROPIC_API_KEY en .env');
    }
  });
```

**Ejercicio 2 — Claude lee un documento Adecco (1.5 horas)**

Este es el ejercicio más importante del día. Crea `sandbox/dia3-claude-documento.js`:

```javascript
// sandbox/dia3-claude-documento.js
// Objetivo: enviar un archivo Excel/PDF de Adecco y extraer novedades en JSON

const Anthropic = require('@anthropic-ai/sdk');
const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: '../.env' });

const client = new Anthropic({
  apiKey: process.env.ANTHROPIC_API_KEY,
});

// Este es el PROMPT DE EXTRACCIÓN — el corazón del sistema
// Aquí le explicamos a Claude exactamente qué necesitamos
const PROMPT_NOMINA = `
Eres un asistente especializado en extracción de datos de nómina para Colombia.

El documento adjunto es un archivo del formato "FORMATO GENERAL DE REPORTE DE NOVEDADES" 
de Adecco / Collective Mining.

Extrae TODAS las novedades de nómina y devuélvelas ÚNICAMENTE como JSON válido, 
sin texto adicional, sin explicaciones, sin markdown. Solo el JSON puro.

Formato de respuesta OBLIGATORIO:
{
  "tipo_documento": "descripción breve",
  "periodo": "año-mes-quincena si está visible, ej: 2026-06-Q1",
  "confianza": 0.95,
  "novedades": [
    {
      "cedula": "solo dígitos, sin puntos ni espacios",
      "nombre": "nombre completo tal como aparece",
      "hoja": "Ocasionales|Fijas|Ausentismos|Cambios",
      "concepto": "nombre del concepto tal como aparece en el archivo",
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

Reglas estrictas:
- cedula: SOLO dígitos, elimina puntos, espacios y guiones
- valor y cantidad: números sin formato (sin $ ni comas), null si no aplica
- fechas: formato ISO "YYYY-MM-DD", null si no aplica
- Si no encuentras novedades, devuelve novedades: []
- Si hay un valor que no puedes leer claramente, ponlo en observaciones
`;

async function extraerNovedades(rutaArchivo) {
  console.log(`📄 Procesando: ${path.basename(rutaArchivo)}`);
  
  // Leer el archivo como buffer
  const buffer = fs.readFileSync(rutaArchivo);
  const base64 = buffer.toString('base64');
  
  // Detectar el tipo MIME según la extensión
  const ext = path.extname(rutaArchivo).toLowerCase();
  const mimeTypes = {
    '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    '.xls':  'application/vnd.ms-excel',
    '.pdf':  'application/pdf',
    '.png':  'image/png',
    '.jpg':  'image/jpeg',
  };
  const mediaType = mimeTypes[ext] || 'application/octet-stream';
  
  console.log(`   Tipo de archivo: ${mediaType}`);
  console.log(`   Tamaño: ${(buffer.length / 1024).toFixed(1)} KB`);
  
  const inicio = Date.now();
  
  // Llamada a Claude con el documento
  const mensaje = await client.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'document',
            source: {
              type: 'base64',
              media_type: mediaType,
              data: base64,
            },
          },
          {
            type: 'text',
            text: PROMPT_NOMINA,
          }
        ],
      }
    ],
  });
  
  const tiempoMs = Date.now() - inicio;
  console.log(`   Procesado en: ${(tiempoMs / 1000).toFixed(1)}s`);
  console.log(`   Tokens usados: ${mensaje.usage.input_tokens} entrada, ${mensaje.usage.output_tokens} salida`);
  
  // Parsear la respuesta JSON
  const texto = mensaje.content[0].text.trim();
  
  try {
    const resultado = JSON.parse(texto);
    
    console.log(`\n✅ EXTRACCIÓN EXITOSA`);
    console.log(`   Tipo de documento: ${resultado.tipo_documento}`);
    console.log(`   Período: ${resultado.periodo}`);
    console.log(`   Confianza: ${(resultado.confianza * 100).toFixed(0)}%`);
    console.log(`   Novedades extraídas: ${resultado.novedades.length}`);
    
    if (resultado.advertencias.length > 0) {
      console.log(`   ⚠ Advertencias:`);
      resultado.advertencias.forEach(a => console.log(`     - ${a}`));
    }
    
    console.log('\n=== PRIMERAS 3 NOVEDADES ===');
    resultado.novedades.slice(0, 3).forEach((nov, i) => {
      console.log(`\n  Novedad ${i + 1}:`);
      console.log(`    Cédula:   ${nov.cedula}`);
      console.log(`    Nombre:   ${nov.nombre}`);
      console.log(`    Hoja:     ${nov.hoja}`);
      console.log(`    Concepto: ${nov.concepto}`);
      if (nov.cantidad) console.log(`    Cantidad: ${nov.cantidad}`);
      if (nov.valor)    console.log(`    Valor:    $${nov.valor}`);
      if (nov.dias)     console.log(`    Días:     ${nov.dias}`);
    });
    
    // Guardar el resultado completo en un archivo JSON para revisión
    const archivoSalida = `./resultado_extraccion_${Date.now()}.json`;
    fs.writeFileSync(archivoSalida, JSON.stringify(resultado, null, 2), 'utf-8');
    console.log(`\n💾 Resultado completo guardado en: ${archivoSalida}`);
    
    return resultado;
    
  } catch (e) {
    console.error('\n❌ Claude no devolvió JSON válido');
    console.error('   Respuesta recibida:', texto.substring(0, 500));
    console.error('   Error de parseo:', e.message);
    throw new Error('Respuesta no parseable de Claude');
  }
}

// Uso: node dia3-claude-documento.js ruta/al/archivo.xlsx
const archivo = process.argv[2];

if (!archivo) {
  console.error('Uso: node dia3-claude-documento.js <ruta_al_archivo>');
  console.error('Ejemplo: node dia3-claude-documento.js ../assets/ultimo_maestro_adecco.xlsx');
  process.exit(1);
}

if (!fs.existsSync(archivo)) {
  console.error(`Error: no se encontró el archivo: ${archivo}`);
  process.exit(1);
}

extraerNovedades(archivo).catch(console.error);
```

Prueba con un archivo Adecco real:
```bash
node dia3-claude-documento.js "../../assets/ultimo_maestro_adecco.xlsx"
```

**Ejercicio 3 — Comparar resultado de Claude vs parser actual (45 min)**

Este ejercicio es de análisis, no de código. Abre el JSON que generó Claude y compáralo manualmente con lo que devuelve el `parserAdecco.js` para el mismo archivo. Identifica:
- ¿Claude encontró todas las cédulas que encontró el parser?
- ¿Los valores coinciden?
- ¿Hay alguna celda que Claude interpretó diferente?

Ese análisis te dará la precisión real para este documento específico.

### ✅ Verificación del Día 3

1. ✅ API key de Anthropic configurada y funcionando
2. ✅ Claude devuelve JSON válido para un archivo Adecco
3. ✅ El JSON tiene las cédulas, nombres, conceptos y valores correctos
4. ✅ Entiendes qué partes del prompt afectan la calidad de la extracción

---

## DÍA 4 — Docker, PostgreSQL y Knex.js

### ¿Qué aprenderás hoy?
Cómo levantar una base de datos PostgreSQL en Docker, conectarla desde Node.js, y cómo preparar el código para que pueda cambiar de SQL Server a PostgreSQL con mínimo esfuerzo.

### Mañana: Lectura y conceptos (2 horas)

**Paso 1 — ¿Qué es Docker y por qué importa? (video, 20 min)**

`https://www.youtube.com/watch?v=Gjnup-PuquQ`
(título: "Docker in 100 Seconds" — Fireship. Subtítulos disponibles)

Docker te permite empacar una aplicación (o una base de datos) junto con todo lo que necesita para correr, en un "contenedor". Eso significa que PostgreSQL en tu máquina se comporta igual que PostgreSQL en el servidor de la intranet, sin instalar nada permanente en el sistema operativo.

**Paso 2 — Diferencias clave entre SQL Server y PostgreSQL (30 min)**

Lee esta tabla despacio. La usarás para migrar el código:

| SQL Server (actual)             | PostgreSQL (futuro)                    |
|---------------------------------|----------------------------------------|
| `GETDATE()`                     | `NOW()` o `CURRENT_TIMESTAMP`          |
| `SYSDATETIME()`                 | `CLOCK_TIMESTAMP()`                    |
| `TOP 1`                         | `LIMIT 1`                              |
| `SCOPE_IDENTITY()`              | `RETURNING id` (al final del INSERT)   |
| `NVARCHAR(200)`                 | `VARCHAR(200)` o `TEXT`                |
| `BIT`                           | `BOOLEAN`                              |
| `SMALLINT`                      | `SMALLINT` (igual)                     |
| `DECIMAL(18,4)`                 | `NUMERIC(18,4)` (igual)                |
| `CONVERT(date, GETDATE())`      | `CURRENT_DATE`                         |
| `ACT_ESTA = 'A'`                | igual, VARCHAR funciona igual          |
| `@parametro`                    | `$1, $2, $3...` (posicional)           |
| `sql.Int`, `sql.NVarChar`...    | no necesario, pg infiere tipos         |

**Paso 3 — ¿Qué es Knex.js? (lectura, 20 min)**

Lee la introducción: `https://knexjs.org/guide/`

Knex.js es un "query builder" — una librería de Node.js que te deja escribir consultas SQL de forma que funcionen en múltiples bases de datos. Con Knex, en vez de escribir:
```javascript
// Hoy (mssql, solo funciona en SQL Server):
await request.query(`SELECT TOP 1 * FROM GN_FUNCI WHERE COD_TERC = @cod`);

// Con Knex (funciona en SQL Server, PostgreSQL, MySQL):
await db('GN_FUNCI').where({ COD_TERC: cod }).first();
```

### Tarde: Práctica (3 horas)

**Ejercicio 1 — Levantar PostgreSQL en Docker (30 min)**

Abre una terminal y ejecuta este comando. Crea una base de datos PostgreSQL nueva llamada `minedax_pg` (la versión futura del sistema):

```bash
docker run -d \
  --name minedax-postgres \
  -e POSTGRES_DB=minedax_pg \
  -e POSTGRES_USER=nomina_user \
  -e POSTGRES_PASSWORD=NominaCM2026! \
  -p 5432:5432 \
  -v minedax_pg_data:/var/lib/postgresql/data \
  postgres:16
```

Verifica que está corriendo:
```bash
docker ps
# Debes ver algo como:
# CONTAINER ID   IMAGE         COMMAND    ...  PORTS                    NAMES
# abc123def456   postgres:16   ...        ...  0.0.0.0:5432->5432/tcp   minedax-postgres
```

Agrega al `.env`:
```env
# PostgreSQL (para pruebas)
PG_HOST=localhost
PG_PORT=5432
PG_DATABASE=minedax_pg
PG_USER=nomina_user
PG_PASSWORD=NominaCM2026!
```

**Ejercicio 2 — Explorar PostgreSQL con pgAdmin (30 min)**

1. Abre pgAdmin 4
2. Clic derecho en "Servers" → "Register" → "Server"
3. Tab "General": Name: `MineDax Postgres (Dev)`
4. Tab "Connection":
   - Host: `localhost`
   - Port: `5432`
   - Database: `minedax_pg`
   - Username: `nomina_user`
   - Password: `NominaCM2026!`
5. Guarda y conecta

Explora la interfaz. pgAdmin es el equivalente de SSMS para PostgreSQL.

**Ejercicio 3 — Conectar Node.js a PostgreSQL con Knex (1 hora)**

```bash
cd sandbox
npm install knex pg dotenv
```

Crea `sandbox/dia4-knex-demo.js`:
```javascript
// sandbox/dia4-knex-demo.js
// Objetivo: crear tablas y hacer consultas básicas con Knex en PostgreSQL

const knex = require('knex');
require('dotenv').config({ path: '../.env' });

// Configuración de Knex — solo cambia "client" para cambiar de BD
const db = knex({
  client: 'pg',           // ← cambia a 'mssql' para SQL Server
  connection: {
    host:     process.env.PG_HOST,
    port:     process.env.PG_PORT,
    database: process.env.PG_DATABASE,
    user:     process.env.PG_USER,
    password: process.env.PG_PASSWORD,
  },
  // Activar esto para ver el SQL que genera Knex (muy útil para aprender):
  debug: true,
});

async function demo() {
  console.log('=== DEMO KNEX + POSTGRESQL ===\n');
  
  // 1. Crear una tabla de prueba
  const existeTabla = await db.schema.hasTable('demo_novedades');
  
  if (!existeTabla) {
    console.log('Creando tabla demo_novedades...');
    await db.schema.createTable('demo_novedades', (tabla) => {
      tabla.increments('id');                    // equivale a IDENTITY en SQL Server
      tabla.string('cedula', 20).notNullable();
      tabla.string('nombre', 200);
      tabla.string('concepto', 100);
      tabla.decimal('cantidad', 18, 4);
      tabla.decimal('valor', 18, 2);
      tabla.string('estado', 1).defaultTo('A');
      tabla.timestamp('creado_en').defaultTo(db.fn.now());
    });
    console.log('✅ Tabla creada\n');
  }
  
  // 2. Insertar un registro de prueba
  console.log('Insertando novedad de prueba...');
  const [id] = await db('demo_novedades').insert({
    cedula:   '1234567890',
    nombre:   'JUAN EJEMPLO PRUEBA',
    concepto: 'Hora Extra Diurna',
    cantidad: 4.5,
    valor:    0,
    estado:   'A',
  }).returning('id');                            // equivale a SCOPE_IDENTITY()
  
  console.log(`✅ Novedad insertada con ID: ${id}\n`);
  
  // 3. Consultar registros
  console.log('Consultando novedades activas...');
  const novedades = await db('demo_novedades')
    .where({ estado: 'A' })
    .orderBy('creado_en', 'desc')
    .limit(5);                                   // equivale a TOP 5
  
  console.log(`Encontradas: ${novedades.length}`);
  novedades.forEach(n => {
    console.log(`  [${n.id}] ${n.cedula} — ${n.nombre} — ${n.concepto}`);
  });
  
  // 4. Actualizar
  await db('demo_novedades')
    .where({ id })
    .update({ estado: 'I' });
  console.log(`\n✅ Novedad ${id} marcada como inactiva`);
  
  // 5. Limpiar
  await db('demo_novedades').where({ id }).delete();
  console.log(`✅ Novedad ${id} eliminada (demo limpio)`);
  
  await db.destroy();
  console.log('\n✅ Demo completado. PostgreSQL + Knex funcionando.');
}

demo().catch(err => {
  console.error('Error:', err.message);
  db.destroy();
});
```

**Ejercicio 4 — Ver la diferencia entre clientes (30 min)**

Cambia en el script `client: 'pg'` por `client: 'mssql'` y ajusta las credenciales a las de SQL Server (`SERVER`, `DATABASE`, `UID`, `PWD` del `.env` actual). Ejecuta de nuevo. El mismo código funciona para ambas bases de datos. Eso es lo que Knex aporta.

### ✅ Verificación del Día 4

1. ✅ `docker ps` muestra el contenedor `minedax-postgres` corriendo
2. ✅ pgAdmin conecta a PostgreSQL sin errores
3. ✅ El script de Knex crea la tabla, inserta y consulta en PostgreSQL
4. ✅ Entiendes la diferencia entre `SCOPE_IDENTITY()` y `RETURNING id`

---

## DÍA 5 — Integración: conectar todo en un flujo real

### ¿Qué harás hoy?
Unir los tres componentes aprendidos: correo (Día 2) + extracción IA (Día 3) + base de datos (Día 4) en un flujo completo que simula lo que será el sistema automatizado.

### Este día es diferente: es 100% práctica

No hay lecturas. Hoy construyes el primer prototipo funcional.

**Ejercicio principal — El flujo completo (3 horas)**

Crea `sandbox/dia5-flujo-completo.js`:

```javascript
// sandbox/dia5-flujo-completo.js
// El primer prototipo del agente de email para nómina
// Flujo: leer correo → descargar adjunto → extraer con Claude → registrar en BD

const { ClientSecretCredential } = require('@azure/identity');
const { Client } = require('@microsoft/microsoft-graph-client');
const { TokenCredentialAuthenticationProvider } = require(
  '@microsoft/microsoft-graph-client/authProviders/azureTokenCredentials'
);
const Anthropic = require('@anthropic-ai/sdk');
const knex = require('knex');
const fs = require('fs');
require('dotenv').config({ path: '../.env' });

// ── Clientes ──────────────────────────────────────────────────────────────────

const anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const db = knex({
  client: 'pg',
  connection: {
    host:     process.env.PG_HOST,
    port:     process.env.PG_PORT,
    database: process.env.PG_DATABASE,
    user:     process.env.PG_USER,
    password: process.env.PG_PASSWORD,
  },
});

// ── Función 1: Crear cliente de Graph ─────────────────────────────────────────

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

// ── Función 2: Obtener correos con adjuntos no procesados ─────────────────────

async function obtenerCorreosPendientes(graphClient) {
  const resultado = await graphClient
    .api(`/users/${process.env.GRAPH_MAILBOX}/messages`)
    .filter("hasAttachments eq true and isRead eq false")
    .select('id,subject,from,receivedDateTime')
    .orderby('receivedDateTime DESC')
    .top(10)
    .get();
  
  return resultado.value || [];
}

// ── Función 3: Descargar adjuntos de un correo ────────────────────────────────

async function obtenerAdjuntos(graphClient, mensajeId) {
  const resultado = await graphClient
    .api(`/users/${process.env.GRAPH_MAILBOX}/messages/${mensajeId}/attachments`)
    .get();
  
  return (resultado.value || []).filter(
    adj => adj['@odata.type'] === '#microsoft.graph.fileAttachment'
  );
}

// ── Función 4: Extraer novedades con Claude ───────────────────────────────────

const PROMPT = `Eres un experto en nómina colombiana. Extrae las novedades del documento.
Responde SOLO con JSON válido, sin texto adicional.
Formato:
{
  "tipo_documento": "string",
  "confianza": 0.95,
  "novedades": [
    { "cedula": "solo digitos", "nombre": "string", "hoja": "string",
      "concepto": "string", "cantidad": null, "valor": null,
      "fecha_inicio": null, "fecha_fin": null, "dias": null }
  ],
  "advertencias": []
}`;

async function extraerConClaude(buffer, nombreArchivo) {
  const ext = nombreArchivo.split('.').pop().toLowerCase();
  const mimes = {
    xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    xls:  'application/vnd.ms-excel',
    pdf:  'application/pdf',
  };
  const mediaType = mimes[ext] || 'application/octet-stream';
  
  const msg = await anthropic.messages.create({
    model: 'claude-sonnet-4-6',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        { type: 'document', source: { type: 'base64', media_type: mediaType, data: buffer.toString('base64') } },
        { type: 'text', text: PROMPT }
      ]
    }]
  });
  
  return JSON.parse(msg.content[0].text.trim());
}

// ── Función 5: Registrar en la BD de prueba ───────────────────────────────────

async function registrarEnBD(novedades, origen) {
  // Asegurar que la tabla existe
  if (!(await db.schema.hasTable('email_novedades_proc'))) {
    await db.schema.createTable('email_novedades_proc', t => {
      t.increments('id');
      t.string('origen_correo', 200);
      t.string('cedula', 20);
      t.string('nombre', 200);
      t.string('concepto', 100);
      t.string('hoja', 50);
      t.decimal('cantidad', 18, 4).nullable();
      t.decimal('valor', 18, 2).nullable();
      t.string('estado', 1).defaultTo('P'); // P=pendiente de validación
      t.timestamp('procesado_en').defaultTo(db.fn.now());
    });
  }
  
  let insertadas = 0;
  for (const nov of novedades) {
    await db('email_novedades_proc').insert({
      origen_correo: origen,
      cedula:        nov.cedula,
      nombre:        nov.nombre,
      concepto:      nov.concepto,
      hoja:          nov.hoja,
      cantidad:      nov.cantidad || null,
      valor:         nov.valor || null,
      estado:        'P',
    });
    insertadas++;
  }
  return insertadas;
}

// ── FLUJO PRINCIPAL ───────────────────────────────────────────────────────────

async function procesarCorreosPendientes() {
  console.log('🚀 Iniciando agente de procesamiento de correos de nómina\n');
  
  const graphClient = crearGraphClient();
  
  // Paso 1: Obtener correos no leídos con adjuntos
  console.log('📬 Buscando correos pendientes...');
  const correos = await obtenerCorreosPendientes(graphClient);
  
  if (correos.length === 0) {
    console.log('   No hay correos pendientes.');
    return;
  }
  
  console.log(`   Encontrados: ${correos.length} correo(s)\n`);
  
  for (const correo of correos) {
    console.log(`\n━━━ Procesando: "${correo.subject}" ━━━`);
    console.log(`    De: ${correo.from.emailAddress.address}`);
    console.log(`    Recibido: ${new Date(correo.receivedDateTime).toLocaleString('es-CO')}`);
    
    // Paso 2: Descargar adjuntos
    const adjuntos = await obtenerAdjuntos(graphClient, correo.id);
    
    if (adjuntos.length === 0) {
      console.log('    ⚠ Sin adjuntos procesables. Saltando.');
      continue;
    }
    
    for (const adjunto of adjuntos) {
      console.log(`\n    📎 Adjunto: ${adjunto.name}`);
      
      // Paso 3: Extraer con Claude
      try {
        const buffer = Buffer.from(adjunto.contentBytes, 'base64');
        console.log(`    🤖 Extrayendo novedades con Claude...`);
        const resultado = await extraerConClaude(buffer, adjunto.name);
        
        console.log(`    ✅ Confianza: ${(resultado.confianza * 100).toFixed(0)}%`);
        console.log(`    📊 Novedades encontradas: ${resultado.novedades.length}`);
        
        if (resultado.confianza < 0.75) {
          console.log(`    ⚠ Confianza baja → marcado para revisión humana`);
        }
        
        // Paso 4: Registrar en BD
        const insertadas = await registrarEnBD(
          resultado.novedades,
          correo.from.emailAddress.address
        );
        console.log(`    💾 Registradas en BD: ${insertadas} novedades`);
        
      } catch (e) {
        console.log(`    ❌ Error procesando adjunto: ${e.message}`);
      }
    }
  }
  
  // Resumen final
  console.log('\n\n=== RESUMEN ===');
  const total = await db('email_novedades_proc').count('id as total').first();
  console.log(`Total novedades en BD de prueba: ${total.total}`);
  
  await db.destroy();
  console.log('\n✅ Agente finalizado');
}

procesarCorreosPendientes().catch(console.error);
```

**Ejercicio de análisis (1 hora)**

Después de correr el script, abre pgAdmin y consulta:
```sql
SELECT origen_correo, hoja, COUNT(*) as total, 
       AVG(CAST(valor AS FLOAT)) as valor_promedio
FROM email_novedades_proc
GROUP BY origen_correo, hoja
ORDER BY total DESC;
```

Compara los resultados con lo que esperabas. ¿Falta alguna novedad? ¿Hay errores de extracción?

### ✅ Verificación del Día 5 — El gran criterio

Al finalizar el día, el siguiente flujo debe funcionar de punta a punta:

```
Correo en Outlook → script lo detecta → descarga adjunto →
Claude extrae novedades → novedades guardadas en PostgreSQL
```

Si esto funciona, tienes el núcleo del sistema automatizado. Todo lo demás es refinamiento.

---

## Próximos pasos después de los 5 días

Una vez completada la semana de aprendizaje, el siguiente documento (`plan-trabajo-3-semanas.md`) describe cómo convertir estos ejercicios de sandbox en código de producción real, integrado con el sistema actual de nómina.

Los 5 días de sandbox son el laboratorio. El plan de 3 semanas es la construcción.

---

*Guía elaborada con base en el análisis del sistema Nomina_2026_Alpha y la BD MineDax — Junio 2026*
