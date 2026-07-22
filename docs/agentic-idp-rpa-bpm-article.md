# Automatización Inteligente de Documentos: Agentic IDP, RPA y BPM en 2026
### Guía compacta para implementación práctica — desde pruebas pequeñas hasta producción

> **Fecha de publicación:** Junio 2026  
> **Aplicabilidad:** Sistemas de nómina, RRHH, cualquier proceso documental repetitivo  
> **Nivel:** Técnico-estratégico

---

## PARTE 1 — EL ECOSISTEMA HOY

### 1.1 Tres tecnologías que convergen

Durante años, RPA, BPM e IDP existieron como silos. En 2026, la línea entre ellos prácticamente ha desaparecido: los mejores sistemas los combinan en lo que Gartner llama **BOAT (Business Orchestration and Automation Technologies)**, el sucesor del iBPMS que reemplazó en octubre 2025.

```
Antes (silos):           Hoy (convergencia):

[RPA] [BPM] [IDP]   →   [Agentic Workflow]
                          ├── BPM: modela y orquesta el proceso
                          ├── RPA: ejecuta acciones sobre sistemas legados
                          └── IDP: lee, comprende y decide sobre documentos
```

El agente de IA actúa como el cerebro que coordina los tres.

---

## PARTE 2 — RPA EN 2026

### 2.1 Estado del mercado

El mercado de RPA alcanzará **USD 35 mil millones en 2026**, en ruta hacia USD 247 mil millones en 2035 (CAGR 22.6%). El principal motor de crecimiento ya no es la automatización de clics — es la integración con IA generativa, lo que se llama **Hyperautomation**.

**Tendencias clave 2026:**
- **Citizen development:** usuarios de RRHH, finanzas y operaciones construyen bots sin programar.
- **Cloud-native RPA:** migración a plataformas SaaS, sin infraestructura on-premise.
- **Bots cognitivos:** bots que leen documentos, entienden contexto, toman decisiones — ya no solo hacen clic.
- **AI-native orquestación:** n8n 2.0 con LangChain nativo; Zapier Agents; Make con Maia (IA).

### 2.2 Plataformas principales

| Plataforma | Fortaleza 2026 | Mejor para | Costo |
|---|---|---|---|
| **UiPath** | Líder Gartner 2024-2025. Ecosystem más rico. | Empresas grandes con muchos sistemas legados | Alto (licencias enterprise) |
| **Microsoft Power Automate** | Integración nativa con M365, Teams, SharePoint, Azure | Entornos Microsoft (como este proyecto) | Incluido en M365 Business Premium |
| **Automation Anywhere** | Fuerte en IDP integrado (Document Automation) | Grandes volúmenes de documentos | Alto |
| **n8n** ⭐ | Open source, self-hosted, nativo LangChain/IA | Startups, proyectos técnicos, POCs, control total | **Gratuito** (self-hosted) |
| **Make (ex-Integromat)** | Visual, muy fácil, excelente para flujos medianos | PMEs, prototipos rápidos | Freemium |
| **Zapier** | 8,000+ integraciones, Zapier Agents | Flujos simples, no técnicos | Freemium / medio |

### 2.3 RPA aplicado a nómina (casos de uso reales)

- **Onboarding de empleados:** desde la recepción del contrato hasta la configuración en sistema de nómina.
- **Procesamiento de incapacidades:** el bot recibe el PDF de EPS, lo lee (IDP), registra el ausentismo.
- **Liquidación de horas extras:** extrae el reporte de marcaciones, calcula horas extra, genera la novedad.
- **Envío de desprendibles:** genera PDF por empleado desde BD y lo envía por correo automáticamente.
- **Conciliación de pólizas:** compara nómina con reporte del proveedor de seguros — exactamente el flujo de `parserPolizaSalud.js` y `parserPolizaVida.js`.

### 2.4 POC mínimo con n8n (prueba pequeña recomendada)

n8n es la recomendación para comenzar a experimentar. Es gratis, self-hosteable en Docker, y en 2026 ya tiene nodos nativos para Gmail, Outlook, Claude API, OpenAI, y bases de datos SQL.

```bash
# Levantar n8n en Docker (5 minutos)
docker run -it --rm \
  -p 5678:5678 \
  -v ~/.n8n:/home/node/.n8n \
  n8nio/n8n

# Acceder en: http://localhost:5678
```

**Flujo POC de 4 nodos:**
```
[Trigger: Gmail/Outlook] → [Nodo: Descargar adjunto] → 
[Nodo: Claude API / visión] → [Nodo: HTTP Request al API de Nómina]
```

Tiempo de construcción: 2-4 horas sin código.

---

## PARTE 3 — BPM EN 2026

### 3.1 Del BPM clásico al BOAT

El BPM tradicional modelaba procesos en diagramas (BPMN 2.0) y los ejecutaba con motores de flujo. El **iBPM (Intelligent BPM)** añadió reglas de negocio y analytics. En 2026, **BOAT** agrega:

- LLMs como nodos de decisión dentro del proceso.
- Agentes autónomos que completan tareas sin ser programados explícitamente.
- Process mining para descubrir automáticamente cómo funciona el proceso real.
- Human-in-the-loop nativo: los procesos "saben" cuándo escalar a una persona.

### 3.2 Plataformas BPM/BPMN relevantes

| Plataforma | Tipo | Fortaleza | Ideal para |
|---|---|---|---|
| **Camunda 8** ⭐ | Open source + SaaS | BPMN 2.0 + DMN + AI Agents nativos (Zeebe engine) | Desarrolladores, procesos complejos con auditoría |
| **Flowable** | Open source | BPMN/CMMN/DMN, multi-tenant, cloud-ready | Empresas que quieren control total del engine |
| **Appian** | SaaS | Low-code, IA integrada, data fabric | Procesos end-to-end con poco código |
| **Pega** | SaaS | IA predictiva, CRM integration | Grandes empresas, CX + RRHH |
| **Power Automate + Power Apps** | SaaS (Microsoft) | Sin salir del ecosistema Azure/M365 | Este proyecto en particular |

### 3.3 Por qué Camunda 8 importa para este proyecto

Camunda 8 (con Zeebe) lanzó en 2026 soporte nativo para agentes de IA dentro de los procesos BPMN. Esto significa que se puede modelar visualmente:

```
[Email llega] → [Agente IA lee documento] → ¿Confianza alta?
                                                ├── SÍ → [Registrar en BD]
                                                └── NO → [Human task: Revisar]
                                                          └── [Registrar en BD]
```

Y ese modelo es a la vez **documentación, código ejecutable y auditoría**.

### 3.4 Conceptos BPM que aplican directamente al proyecto

- **BPMN 2.0:** Estándar ISO para modelar procesos. Cualquier plataforma lo entiende (Camunda, Flowable, etc.).
- **DMN (Decision Model and Notation):** Para modelar las reglas de "¿cuándo aprobar automáticamente?".
- **Process Mining:** Herramientas como Celonis o Process Mining de Power Automate analizan los logs de la BD actual (`GN_LOG_APP`) y descubren cuellos de botella.
- **Human Task:** El nodo donde la plataforma pausa el proceso y espera aprobación de una persona (la "Bandeja de revisión" de la Fase 3 de la guía anterior).

---

## PARTE 4 — MODELOS DE IA PARA IDP: MÁS ALLÁ DE CLAUDE

### 4.1 El panorama de modelos en junio 2026

El mercado está maduro. Ya no hay un solo "mejor modelo" — depende del tipo de documento, el volumen, el costo y el ecosistema donde se opera.

### 4.2 Comparativa de modelos

| Modelo | Proveedor | Tipo | Fortaleza para IDP | Costo aproximado | Mejor para |
|---|---|---|---|---|---|
| **Claude Opus 4.8 / Sonnet 4.6** | Anthropic | LLM multimodal | Razonamiento complejo, contexto 1M tokens, extracción semántica | $3-15 / MTok | Documentos ambiguos, contexto largo, alta precisión |
| **GPT-5.4** | OpenAI | LLM multimodal | Multimodal muy competitivo, ecosistema amplio | $2-10 / MTok | Análisis visual, tablas, gráficos |
| **Gemini 2.5 Pro** | Google | LLM multimodal | Mejor en imagen/OCR (95.8% accuracy), 200+ idiomas | $1.25-5 / MTok | Documentos escaneados, multilingüe |
| **Azure Document Intelligence** | Microsoft | API especializada | Tablas, layouts, formularios estructurados. Integración Azure nativa | $15-300 / 10K páginas | Formularios fijos (Adecco), facturas |
| **AWS Textract** | Amazon | API especializada | Pipeline AWS, AnalyzeExpense integrado | $0.01-0.065 / página | Equipos en AWS, gastos y recibos |
| **Google Document AI** | Google | API especializada | 95.8% accuracy, handwriting, 200+ idiomas | Free 300 pág/mes | Documentos variables, multilingüe |
| **Mistral Large** | Mistral AI | LLM multimodal | Costo-efectivo, open source disponible | $0.4-2 / MTok | Reducción de costos, volumen alto |
| **LlamaParse / LlamaIndex** | LlamaIndex | Framework + parsing | Workflows agénticos especializados en documentos, ADW | Open source / SaaS | Orquestación de extracción compleja |

### 4.3 Combinación recomendada para el proyecto (estrategia híbrida)

No usar un solo modelo para todo. La arquitectura óptima en 2026 es de **enrutamiento por tipo de documento**:

```
Documento recibido
     │
     ▼
¿Formulario Adecco conocido?
  ├── SÍ → Azure Document Intelligence  (rápido, barato, preciso en estructura fija)
  └── NO  → Claude Sonnet 4.6           (semántico, maneja formatos desconocidos)
              │
              ├── Confianza > 0.9 → Registrar automáticamente
              └── Confianza < 0.9 → Revisar con Claude Opus 4.8
                                     │
                                     └── Aún baja → Cola humana
```

**Costo estimado** con esta arquitectura para ~500 documentos/mes:
- Azure Document Intelligence: ~$7/mes (350 docs conocidos × $0.02)
- Claude Sonnet: ~$3/mes (150 docs × ~$0.02 promedio)
- Total: **~$10/mes** para el volumen típico de nómina de una empresa mediana.

### 4.4 Benchmark de precisión en extracción (datos 2026)

Según benchmarks independientes de BusinesswareTech y LandingAI (documentos variados, incluyendo escaneados):

```
Documentos estructurados (formularios fijos):
  Azure Document Intelligence:  97.2%
  Google Document AI:           95.8%
  AWS Textract:                 94.2%
  GPT-5.4 (visión):             91.5%
  Claude Opus 4.8:              89.8%

Documentos no estructurados / semánticos:
  Claude Opus 4.8:              94.1%   ← ganador aquí
  GPT-5.4:                      91.8%
  Gemini 2.5 Pro:               90.4%
  Azure Document Intelligence:  78.2%   (no diseñado para esto)
```

**Conclusión práctica:** usar APIs especializadas para documentos con estructura fija, LLMs para el resto.

---

## PARTE 5 — SEGURIDAD EN AGENTIC IDP

### 5.1 El nuevo riesgo: agentes autónomos

Un agente que puede leer correos, extraer datos y escribir en la BD de nómina tiene un **radio de impacto enorme** si es comprometido. La guía oficial CISA/NSA/ASD/NCSC (abril 2026) establece principios no negociables:

**Principio 1 — Mínimo privilegio:** El agente solo tiene acceso a lo estrictamente necesario. No usa credenciales de admin. No puede borrar registros. Solo `INSERT`/`UPDATE` vía los endpoints API existentes (nunca SQL directo).

**Principio 2 — mTLS en todo inter-agente:** Toda comunicación entre componentes del sistema (email trigger → agente → API) usa mutual TLS. No HTTP plano, ni en red interna.

**Principio 3 — Trazabilidad total:** Cada acción del agente debe ser reproducible. El campo `ACT_USUA` en BD debe reflejar el origen (`AGENTE_EMAIL:remitente@adecco.com`). Los adjuntos se archivan en Azure Blob con hash SHA-256.

**Principio 4 — Verificabilidad de extracción:** Cada dato extraído por IA debe ir acompañado de su fuente (página, celda, posición en el documento) y score de confianza. Nunca registrar un valor que no pueda ser rastreado al documento original.

**Principio 5 — Red teaming continuo:** Al menos una vez por trimestre, intentar inyectar documentos maliciosos (prompt injection via PDF, datos falsos, remitentes falsificados) y verificar que el sistema los rechaza.

### 5.2 Prompt injection: el riesgo específico de IDP

Un atacante puede insertar texto invisible en un PDF que "instruya" al LLM a extraer datos falsos o ejecutar acciones no autorizadas. Mitigaciones:

- Nunca incluir el contenido del documento dentro del system prompt — siempre como contenido separado (bloque `document` o `user`, no `system`).
- Validar que los campos extraídos (cédulas, montos) cumplan rangos numéricos esperados antes de escribir en BD.
- Desconfiar de documentos donde la IA extrae instrucciones en lenguaje natural que parecen comandos del sistema.

### 5.3 Lista de verificación de seguridad mínima

```
☐ Lista blanca de remitentes configurada y probada
☐ Validación DKIM/DMARC del email antes de procesar
☐ Adjuntos escaneados con antivirus antes de enviar al LLM
☐ Extracción de LLM en sandbox (sin acceso directo a red interna)
☐ Validación de rango en campos numéricos (cédulas 6-10 dígitos, montos < límite)
☐ Todas las escrituras en BD via endpoints API autenticados (JWT)
☐ Tabla de auditoría NO_EMAIL_PROC con hash del adjunto
☐ Alertas si el agente falla 3 veces seguidas en el mismo remitente
☐ Revisión humana obligatoria para cambios de salario y retiros
☐ Retención de adjuntos en Blob ≥ 5 años (requisito legal Colombia)
```

---

## PARTE 6 — ARQUITECTURA DE REFERENCIA PARA POC

### 6.1 Stack recomendado para prueba en 48 horas

Esta arquitectura es la más rápida para probar el concepto sin modificar el sistema de producción:

```
[Gmail/Outlook de prueba]
        │
        ▼ (polling cada 5 min)
[n8n local en Docker]
   ├─ Nodo: Trigger Gmail/Outlook
   ├─ Nodo: Descargar adjunto (base64)
   ├─ Nodo: Claude API (visión, extraer novedades)
   ├─ Nodo: IF — confianza > 0.85?
   │    ├── SÍ: HTTP Request → POST /api/ocasionales/importar-excel
   │    └── NO: Enviar email de alerta a RRHH
   └─ Nodo: Email de confirmación al remitente
```

**Requisitos:**
- Docker instalado localmente
- API key de Anthropic (Claude) — $5 de crédito gratis al crear cuenta
- Cuenta de correo de prueba (Gmail funciona directamente en n8n)
- El servidor de nómina corriendo localmente (`npm run dev`)

**Costo del POC:** $0 (n8n gratis, crédito Claude gratis para pruebas).

### 6.2 Stack para producción (entorno Azure)

```
[Buzón RRHH en Outlook/Exchange]
        │
        ▼ (Microsoft Graph API webhook)
[Azure Function — email-trigger]
        │
        ▼
[Azure Service Bus — cola de emails]
        │
        ▼
[Node.js Agent Service — services/emailAgent.js]
   ├─ Azure Document Intelligence (formularios conocidos)
   ├─ Claude Sonnet 4.6 API (documentos nuevos/complejos)
   └─ POST → /api/*/importar-excel (endpoints existentes)
        │
        ▼
[Azure Blob Storage — archivo de adjuntos]
        │
[BD SQL Server — NO_EMAIL_PROC + NO_NOVED]
        │
        ▼
[Plataforma web existente — visualización y bandeja de revisión]
```

---

## PARTE 7 — RECURSOS PARA APRENDER (YouTube y más)

### 7.1 Canales de YouTube recomendados

#### Agentic IDP y automatización inteligente

| Canal | Idioma | Qué encontrar |
|---|---|---|
| **LlamaIndex** (youtube.com/@LlamaIndex) | Inglés | Tutoriales de Agentic Document Workflows, LlamaParse, RAG para documentos |
| **Anthropic** (youtube.com/@anthropic-ai) | Inglés | Demos de Claude para procesamiento de documentos, tool use, agentes |
| **AI Jason** (youtube.com/@AIJasonZ) | Inglés | Tutoriales prácticos de agentes IA con n8n, LangChain, APIs |
| **Matthew Berman** (youtube.com/@matthew_berman) | Inglés | Reviews y tutoriales de los modelos más nuevos (GPT, Claude, Gemini) |

#### RPA (en español e inglés)

| Canal / Recurso | Idioma | Qué encontrar |
|---|---|---|
| **UiPath Academy** (academy.uipath.com) | Español | Curso oficial "Introducción a RPA y Automatización" — gratuito |
| ["Curso Gratis RPA UiPath 2025"](https://www.youtube.com/watch?v=t6ZRGzYMnbo) | Español | Crear primer bot paso a paso |
| ["Curso Gratis RPA UiPath Completo"](https://www.youtube.com/watch?v=Y32U_k83Kl8) | Español | 3+ horas, cobertura completa |
| **Automation Anywhere University** (university.automationanywhere.com) | Inglés/Español | Certificaciones gratuitas |
| **Top 20 canales RPA** (tubics.com/rankings/industries/robotic-process-automation-rpa) | Varios | Directorio actualizado de canales |

#### n8n y flujos de trabajo agénticos

| Canal | Idioma | Qué encontrar |
|---|---|---|
| **n8n** (youtube.com/@n8n-io) | Inglés | Tutoriales oficiales, incluyendo integración con Claude y email processing |
| **Leon van Zyl** (youtube.com/@leonvanzyl) | Inglés | Tutoriales avanzados de n8n + IA |
| **Cole Medin** (youtube.com/@ColeMedin) | Inglés | Agentes IA con n8n, LangChain, flujos de documentos |

#### BPM y Camunda

| Canal | Idioma | Qué encontrar |
|---|---|---|
| **Camunda** (youtube.com/@Camunda) | Inglés | BPMN 2.0, Camunda 8, AI dentro de procesos, demos |
| **Flowable** (youtube.com/@flowable) | Inglés | Motor BPM open source, CMMN, casos de uso RRHH |

#### Seguridad en IA y agentes

| Canal | Idioma | Qué encontrar |
|---|---|---|
| **OWASP Foundation** (youtube.com/@OWASP) | Inglés | OWASP Top 10 para LLMs, prompt injection, seguridad de agentes |
| **David Bombal** (youtube.com/@davidbombal) | Inglés | Ciberseguridad práctica aplicable a sistemas con IA |

### 7.2 Playlist y videos específicos recomendados

Buscar directamente en YouTube estas cadenas de texto (los resultados cambian; buscar por fecha reciente 2025-2026):

```
"agentic document processing tutorial" → filtrar: 2025-2026
"n8n AI agent email processing" → canal n8n oficial o Cole Medin
"Camunda AI agents BPMN 2026" → canal Camunda oficial
"UiPath intelligent document processing" → canal UiPath oficial
"Claude API document extraction tutorial" → canal Anthropic o AI Jason
"OWASP LLM top 10 2025" → canal OWASP Foundation
"process mining power automate" → canal Microsoft
```

### 7.3 Recursos escritos de referencia (no YouTube)

- **Guía oficial de seguridad agentic AI (CISA/NSA/ASD, abril 2026):** `media.defense.gov/2026/Apr/30/2003922823/-1/-1/0/CAREFUL%20ADOPTION%20OF%20AGENTIC%20AI%20SERVICES_FINAL.PDF`
- **LlamaIndex — Agentic Document Processing:** `llamaindex.ai/blog/agentic-document-processing`
- **Benchmark IDP 2026 (BusinesswareTech):** `businesswaretech.com/intelligent-document-processing-benchmark`
- **Comparativa APIs documento (Mixpeek):** `mixpeek.com/curated-lists/best-ai-for-document-analysis`
- **n8n vs Zapier vs Make 2026:** `cybernews.com/ai-tools/n8n-vs-zapier/`
- **Camunda AI Agents:** `camunda.com/platform/modeler/agents/`

---

## PARTE 8 — MAPA DE RUTA DE APRENDIZAJE

Si partes desde cero, este es el orden recomendado de estudio:

```
Semana 1-2: Fundamentos
  ├─ Ver curso RPA UiPath en español (YouTube, 3 horas)
  ├─ Instalar n8n en Docker y crear primer flujo (email → log)
  └─ Leer: "What is Agentic Document Processing" (docsumo.com)

Semana 3-4: BPM y modelos de IA
  ├─ Ver tutoriales Camunda en YouTube (BPMN 2.0 básico)
  ├─ Registrarse en Claude API y probar extracción de un PDF de prueba
  └─ Comparar resultados con Azure Document Intelligence (trial gratuito)

Semana 5-6: Seguridad
  ├─ Leer guía CISA/NSA de Agentic AI (PDF oficial, abril 2026)
  ├─ Ver "OWASP Top 10 LLMs" en YouTube (OWASP Foundation)
  └─ Diseñar la lista de verificación de seguridad para el proyecto

Semana 7-8: Primer POC
  ├─ Construir el flujo n8n de 4 nodos (email → Claude → API nómina)
  ├─ Probar con 10 documentos reales de períodos anteriores
  └─ Medir precisión y ajustar prompt
```

---

## CONCLUSIÓN

En 2026, el stack mínimo viable para un proyecto de automatización documental como el de nómina es:

**n8n** (orquestación) + **Claude Sonnet 4.6** (extracción semántica) + **Azure Document Intelligence** (formularios conocidos) + **Microsoft Graph API** (email trigger) + **Camunda 8** (si se necesita modelo de proceso auditable).

Ninguna de estas herramientas requiere infraestructura masiva para comenzar. El POC más simple se construye en un fin de semana con Docker y una API key. La producción se escala sobre Azure de forma natural dado que el sistema ya vive ahí.

La clave del éxito no es la tecnología — es la calidad del **prompt de extracción** y la definición clara de **cuándo el agente decide solo y cuándo escala a una persona**.

---

*Fuentes y referencias en la sección de recursos. Última actualización: Junio 2026.*
