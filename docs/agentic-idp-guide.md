# Guía Técnica: Agentic IDP para Nómina — De la Importación Manual al Procesamiento Automático de Correos

> **Audiencia:** Equipo técnico de Collective Mining / Adecco  
> **Fecha:** Junio 2026  
> **Estado:** Borrador inicial — hoja de ruta y conceptos

---

## 1. El problema actual

El pipeline de importación hoy funciona así:

```
RRHH recibe correo → descarga adjunto manualmente → abre plataforma →
navega a "Importar" → sube archivo → revisa resultados → confirma
```

Puntos de fricción identificados en el código actual (`importarExcelController.js`, `parserRegistry.js`):

- **Acción humana obligatoria** en cada paso: descarga, navegación, upload.
- **Contexto perdido:** el correo tiene información (remitente, asunto, fecha) que nunca llega al sistema.
- **Errores silenciosos:** si alguien olvida subir el archivo, el período quincena pasa sin la novedad registrada.
- **Soporta solo formatos preregistrados** (4 parsers actuales): cualquier nuevo formato requiere programación.

La directiva de los altos dirigentes es correcta: este flujo puede eliminarse en su mayoría.

---

## 2. ¿Qué es Agentic IDP?

**IDP (Intelligent Document Processing)** es la capacidad de extraer, clasificar y estructurar datos de documentos (PDF, Excel, imágenes escaneadas) usando IA, sin reglas rígidas predefinidas.

**Agentic** añade la dimensión de autonomía: el sistema no solo lee el documento, sino que **toma decisiones** sobre qué hacer con él, llama herramientas externas (APIs, bases de datos), verifica resultados y actúa, con mínima o nula intervención humana.

La diferencia con el sistema actual es radical:

| Característica | Sistema actual | Agentic IDP |
|---|---|---|
| Quién detecta el tipo de archivo | Código (`parserRegistry`) | IA (comprensión semántica) |
| Quién hace el upload | Usuario | Email webhook automático |
| Qué pasa con formatos desconocidos | Error: "formato no soportado" | El agente intenta interpretar |
| Auditoría | Solo logs de BD | Trazabilidad completa del razonamiento |
| Intervención humana | Obligatoria | Solo en casos de baja confianza |

---

## 3. Arquitectura propuesta

### 3.1 Flujo completo

```
[Proveedor/Adecco] ─── email con adjunto ──▶ [Buzón RRHH - Outlook/Gmail]
                                                        │
                                              Email Webhook / Polling
                                                        │
                                                        ▼
                                           ┌─────────────────────┐
                                           │  Agente Orquestador │  ← Claude API
                                           │  (Node.js service)  │
                                           └─────────┬───────────┘
                                                     │
                              ┌──────────────────────┼──────────────────────┐
                              │                      │                      │
                              ▼                      ▼                      ▼
                    [Leer adjunto]         [Clasificar tipo]      [Validar identidad
                    PDF / Excel /           novedad + extraer      remitente]
                    imagen escaneo          campos clave
                              │                      │
                              └──────────────────────┘
                                           │
                                           ▼
                                  [Confianza ≥ umbral?]
                                    /              \
                                  SÍ               NO
                                  │                │
                                  ▼                ▼
                        POST /api/*/        Bandeja de revisión
                        importar-excel      (interfaz web existente)
                        (API existente)
                                  │
                                  ▼
                        Email confirmación
                        + registro en BD
                        + trazabilidad
```

### 3.2 Componentes técnicos

**A. Trigger de email (entrada al sistema)**

Para Outlook (recomendado dado que ya están en Azure):
- **Microsoft Graph API** con webhooks de suscripción a la carpeta RRHH.
- Alternativa: polling cada 2 minutos via Graph API si los webhooks son complejos de configurar inicialmente.

Para Gmail:
- **Gmail Pub/Sub** via Google Cloud → Cloud Functions → agente.

**B. Agente de procesamiento (corazón del sistema)**

Un servicio Node.js independiente (o integrado en `server.js` como nuevo módulo) que:
1. Recibe el email (base64 del adjunto + metadata).
2. Llama a **Claude API** con el contenido del archivo para extracción.
3. Valida el resultado.
4. Llama a los endpoints REST existentes del sistema (`/api/ocasionales/importar-excel`, etc.).
5. Registra el resultado y envía confirmación.

**C. Extractor inteligente (reemplaza `parserRegistry`)**

En lugar de parsers por formato, se envía el documento directamente a Claude con un prompt estructurado. Claude devuelve JSON con las novedades extraídas, ya en el formato que espera `procesarEnBD()`.

**D. Revisión humana de baja confianza**

Los documentos donde el agente tiene dudas (remitente desconocido, campos ambiguos, cédulas no encontradas en BD) van a una cola visible en la interfaz web existente — sin desaparecer silenciosamente.

---

## 4. Stack tecnológico recomendado

### 4.1 Capa de email

**Microsoft Graph API** (prioritario para entorno Azure):
- SDK: `@microsoft/microsoft-graph-client` para Node.js
- Auth: `@azure/identity` con Managed Identity (ya configurado en el sistema para SQL)
- Costo: incluido en Microsoft 365, sin costo adicional
- Documentación: `https://learn.microsoft.com/en-us/graph/api/resources/mail-api-overview`

Configuración mínima:
```js
// Permisos de aplicación requeridos (Azure AD App Registration):
// Mail.Read — leer correos del buzón de RRHH
// Mail.Send — enviar confirmaciones automáticas
```

### 4.2 Extracción de documentos con IA

**Claude API (Anthropic)** — opción recomendada:
- Soporta visión nativa: PDF, imágenes escaneadas, Excel convertido a imagen.
- Modelo: `claude-opus-4-8` para documentos complejos, `claude-haiku-4-5` para clasificación rápida.
- La extracción es semántica: entiende "novedad de ausentismo por incapacidad" igual que "ausencia médica certificada".
- SDK: `@anthropic-ai/sdk` para Node.js.

**Azure Document Intelligence** (complementario, no excluyente):
- Fuerte para formularios con estructura fija (tablas, campos nombrados).
- Devuelve coordenadas exactas de cada campo en el PDF.
- Útil cuando los documentos siempre tienen el mismo layout (formularios Adecco).
- Costo: ~$1.50 por 1,000 páginas en el tier más básico.
- SDK: `@azure/ai-form-recognizer`.

Recomendación práctica: usar Azure Document Intelligence para documentos estructurados (formularios Adecco conocidos) y Claude API para documentos no estructurados o nuevos formatos.

### 4.3 Cola de trabajo y reintentos

**Azure Service Bus** (ya disponible en Azure):
- Garantiza que cada email se procesa exactamente una vez.
- Maneja reintentos automáticos si el agente falla.
- Dead-letter queue para correos que fallaron repetidamente → van a revisión manual.

Alternativa más simple si Service Bus es excesivo: tabla `NO_EMAIL_QUEUE` en SQL Server (poll cada 30 segundos).

### 4.4 Almacenamiento de adjuntos

**Azure Blob Storage**:
- Guardar cada adjunto procesado con su metadata (email ID, fecha, remitente, hash).
- Necesario para auditoría: poder reconstruir qué archivo generó qué novedades.
- Retención: configurar políticas de expiración (ej: 2 años).

### 4.5 Orquestación del agente

Para la primera versión, **Node.js puro** con llamadas secuenciales es suficiente. Si el volumen crece:

- **LangChain.js** — orquestador popular, soporta Claude como LLM, herramientas, memoria.
- **Azure Logic Apps** — para flujos simples sin código, integración visual con Outlook/Graph.
- **Claude Agent SDK** — si se quiere construir el agente directamente sobre la infraestructura de Anthropic.

---

## 5. Consideraciones de seguridad (PRIORIDAD)

Dado que se procesan datos de nómina (información sensible bajo la Ley 1581 de Colombia), la seguridad es no negociable.

### 5.1 Autenticación del remitente

**Problema:** cualquier correo enviado al buzón de RRHH podría intentar inyectar novedades falsas.

**Solución (por capas):**

1. **Lista blanca de remitentes:** solo procesar correos de dominios autorizados (`@adecco.com`, `@proveedorX.com`). Rechazar todo lo demás y notificar al administrador.

2. **DKIM/SPF/DMARC validation:** verificar que el correo no fue falsificado. Microsoft Graph API expone estos headers en el objeto de email.

3. **Código de confirmación:** para novedades de alto impacto (cambios de salario, retiros), el agente puede requerir que el remitente confirme vía un link firmado antes de registrar en BD.

4. **Nivel de confianza:** registrar en `NO_NOVED` el `origen_fuente` ('AGENTE_EMAIL', 'IMPORT_MANUAL', etc.) para trazabilidad.

### 5.2 Validación antes de escritura en BD

El agente NUNCA debe escribir directamente en BD con SQL propio. Debe reutilizar los endpoints API existentes (`/api/ocasionales/importar-excel`, `/api/ausentismos`, etc.) porque:
- Estos endpoints ya tienen validaciones de período activo.
- Ya manejan las transacciones correctamente (incluido el batch único para el trigger `TR_NO_OCASI_VALIDA_CONCEPTO`).
- Mantienen la trazabilidad `ACT_USUA` (quién hizo el cambio).

El `ACT_USUA` para novedades procesadas por el agente debe identificarlo claramente: `"AGENTE_EMAIL"` o el alias del remitente original.

### 5.3 Human-in-the-loop

Definir umbrales claros donde el agente DEBE pedir revisión humana:

```js
const REQUIERE_REVISION = {
  confianzaExtraccion: < 0.85,   // IA no está segura de lo que leyó
  cedulasNoEncontradas: > 0,     // empleado no existe en BD
  montoSospechoso: valor > LIMITE_MONTO_AUTO,  // definir según política
  tipoNovedad: ['CAMBIO_SALARIO', 'RETIRO'],   // siempre revisión humana
  remitenteNuevo: true,          // primera vez que este remitente envía
};
```

### 5.4 Cifrado de adjuntos en tránsito y en reposo

- En tránsito: TLS ya garantizado por Microsoft Graph y Azure.
- En reposo (Azure Blob): activar cifrado con customer-managed keys (CMK) si la política de la empresa lo requiere.
- Adjuntos nunca deben loguearse en texto plano en `GN_LOG_APP`.

### 5.5 Auditoría completa

Crear tabla `NO_EMAIL_PROC` para registrar cada email procesado:

```sql
CREATE TABLE dbo.NO_EMAIL_PROC (
  ID_PROC      INT IDENTITY PRIMARY KEY,
  MSG_ID       NVARCHAR(200),     -- ID único del email (Graph API)
  FEC_RECIB    DATETIME,
  REM_EMAIL    NVARCHAR(200),
  ASUNTO       NVARCHAR(500),
  NOM_ADJUNTO  NVARCHAR(300),
  TIPO_PARSER  NVARCHAR(50),      -- 'CLAUDE_VISION' | 'AZURE_DOC_INTEL' | etc.
  CONFIANZA    DECIMAL(5,4),      -- 0.0000 a 1.0000
  ESTADO       CHAR(1),          -- 'P'=pendiente, 'A'=aprobado, 'R'=rechazado, 'E'=error
  COD_NOVED_INI INT,             -- primera novedad creada (si aplica)
  COD_NOVED_FIN INT,             -- última novedad creada
  BLOB_URL     NVARCHAR(500),    -- URL del adjunto en Azure Blob
  ACT_USUA     NVARCHAR(50),
  ACT_HORA     DATETIME DEFAULT GETDATE()
);
```

---

## 6. Fases de implementación

### Fase 1 — Extractor inteligente (sin cambiar el flujo de UI) — 2-3 semanas

**Objetivo:** reemplazar el `parserRegistry` con Claude API, manteniendo la UI de importación manual como respaldo.

Cambios:
- Crear `utils/importParsers/parserIA.js` que toma cualquier archivo (PDF, Excel, imagen) y llama a Claude API para extraer novedades.
- Registrarlo en `parserRegistry.js` como parser adicional de MAYOR prioridad, o como fallback si ningún parser detecta el formato.
- El usuario todavía sube archivos manualmente, pero el sistema puede leer formatos no contemplados.

Beneficio inmediato: ya no hay `"formato no soportado"`.

```js
// utils/importParsers/parserIA.js — esqueleto
const Anthropic = require('@anthropic-ai/sdk');

const meta = {
  id: 'ia_claude',
  nombre: 'Claude AI — Extractor Inteligente',
  formatos: ['pdf', 'xlsx', 'xls', 'png', 'jpg', 'docx'],
};

function detect(file) {
  // Este parser es el catch-all inteligente
  return true;
}

async function parse(file, context) {
  const client = new Anthropic();
  
  // Convertir buffer a base64 para la API de visión
  const base64 = file.buffer.toString('base64');
  const mediaType = file.mimetype || 'application/octet-stream';
  
  const message = await client.messages.create({
    model: 'claude-opus-4-8',
    max_tokens: 4096,
    messages: [{
      role: 'user',
      content: [
        {
          type: 'document',
          source: { type: 'base64', media_type: mediaType, data: base64 },
        },
        {
          type: 'text',
          text: PROMPT_EXTRACCION_NOVEDADES,  // ver Sección 7
        }
      ],
    }],
  });
  
  const json = JSON.parse(message.content[0].text);
  return transformarRespuestaIA(json);  // → { agrupado: Map, advertencias: [] }
}

module.exports = { meta, detect, parse };
```

### Fase 2 — Email trigger y agente básico — 3-4 semanas

**Objetivo:** el sistema monitorea el buzón de RRHH y procesa adjuntos automáticamente.

Cambios:
- Nuevo módulo `services/emailAgent.js` con polling via Microsoft Graph API.
- Lógica de whitelist de remitentes.
- Llamada a `parserIA.js` con el adjunto extraído del email.
- Llamada a `procesarEnBD()` directamente (reutilizando la función existente).
- Tabla `NO_EMAIL_PROC` para auditoría.
- Email de confirmación al remitente.

### Fase 3 — Human-in-the-loop y bandeja de revisión — 2-3 semanas

**Objetivo:** casos de baja confianza van a una cola visible en la UI.

Cambios:
- Nueva tab "Bandeja de Email" en `index_novedades.html`.
- Endpoint `GET /api/email-proc/pendientes` listando emails en estado 'P'.
- Botones "Aprobar" / "Rechazar" que llaman `PUT /api/email-proc/:id/estado`.
- Visualización del adjunto original y de los datos extraídos por la IA lado a lado.

### Fase 4 — Optimización y reducción de umbral manual — continua

- Ajustar umbrales de confianza basándose en datos reales de las fases anteriores.
- Añadir feedback loop: cuando RRHH corrige una extracción, esos datos pueden usarse para mejorar el prompt.
- Integrar Azure Document Intelligence para formularios Adecco de estructura conocida (mayor velocidad y menor costo que Claude para documentos predecibles).

---

## 7. Prompt de extracción (núcleo del sistema)

Este es el prompt que se envía a Claude junto con el documento. Es el elemento más crítico y debe refinarse iterativamente.

```
Eres un asistente especializado en procesamiento de novedades de nómina para Colombia.
El documento adjunto es un reporte enviado por un proveedor o por RRHH de Collective Mining / Adecco.

Tu tarea es extraer TODAS las novedades de nómina presentes en el documento y devolverlas
en formato JSON estricto, sin texto adicional.

Tipos de novedad que debes identificar:
- OCASIONAL: horas extras, bonificaciones, comisiones, recargos (campo: cantidad numérica)
- FIJA: valores fijos mensuales (campo: valor monetario)
- AUSENTISMO: incapacidades, permisos, vacaciones (campos: fecha inicio, fecha fin, días)
- CAMBIO: cambio de salario, cargo, centro de costo (campo: valor nuevo)

Para cada novedad extrae:
- cedula: número de identificación del empleado (solo dígitos)
- nombre: nombre completo
- tipo_novedad: OCASIONAL | FIJA | AUSENTISMO | CAMBIO
- concepto: descripción del concepto (ej: "Hora Extra Diurna", "Incapacidad EPS")
- cantidad: número de unidades si aplica (horas, días)
- valor: monto en pesos colombianos si aplica
- fecha_inicio: fecha ISO si aplica (ausentismos, cambios)
- fecha_fin: fecha ISO si aplica (ausentismos)
- observaciones: cualquier dato adicional relevante

Formato de respuesta:
{
  "tipo_documento": "descripción breve del tipo de archivo identificado",
  "periodo": "período de nómina si está visible (ej: 2026-06-Q1)",
  "confianza": 0.0 a 1.0 (tu nivel de certeza general),
  "novedades": [
    {
      "cedula": "...",
      "nombre": "...",
      "tipo_novedad": "...",
      "concepto": "...",
      "cantidad": null,
      "valor": null,
      "fecha_inicio": null,
      "fecha_fin": null,
      "confianza_fila": 0.0 a 1.0,
      "observaciones": "..."
    }
  ],
  "advertencias": ["..."]
}

Si el documento no contiene novedades de nómina, devuelve { "novedades": [], "advertencias": ["Documento no reconocido como reporte de nómina"] }.
```

---

## 8. Decisiones que requieren definición del negocio

Antes de implementar, el equipo debe responder:

1. **¿Qué buzón de correo se monitorea?** ¿Existe ya una cuenta dedicada (ej: `nomina@collectivemining.com`)? ¿Está en Outlook/Exchange o Gmail?

2. **¿Quiénes son los remitentes autorizados?** Lista de dominios y/o emails específicos de Adecco y proveedores de seguros.

3. **¿Cuál es el monto máximo que el agente puede registrar sin revisión humana?** Política de control interno.

4. **¿Qué tipos de novedad siempre requieren revisión?** (Cambios de salario, retiros recomendamos que siempre requieran aprobación humana.)

5. **¿Cuánto tiempo retener los adjuntos en Azure Blob?** Para auditorías de nómina en Colombia la norma recomienda mínimo 5 años.

6. **¿La confirmación automática al remitente debe salir del mismo buzón de RRHH** o de un correo dedicado del sistema?

---

## 9. Costo estimado

| Componente | Costo aproximado mensual |
|---|---|
| Claude API (claude-haiku para clasificación) | ~$5–20 USD (depende del volumen de emails) |
| Claude API (claude-opus para extracción compleja) | ~$20–80 USD |
| Azure Document Intelligence | ~$10–30 USD (si se usa para formularios fijos) |
| Azure Blob Storage (adjuntos, 2 años) | ~$2–5 USD |
| Azure Service Bus | ~$0.10 por millón de operaciones |
| Microsoft Graph API | Incluido en Microsoft 365 |
| **Total estimado** | **~$40–150 USD/mes** |

Comparado con el costo de tiempo humano actual (descarga + upload + revisión por quincena), el ROI es positivo desde el primer mes.

---

## 10. Próximos pasos concretos

1. **Esta semana:** confirmar las respuestas de negocio de la Sección 8.
2. **Semana 2:** crear `parserIA.js` (Fase 1) — no requiere cambios en infraestructura, solo una API key de Anthropic.
3. **Semana 3:** probar con archivos reales de las últimas 3 quincenas, medir precisión de extracción.
4. **Semana 4-5:** según resultados, ajustar prompt e iniciar Fase 2 (email trigger).
5. **Mes 2:** Fases 3 y 4 según prioridades.

---

*Documento generado con apoyo de Claude (Anthropic). Para implementación técnica, revisar siempre con el equipo de desarrollo.*
