# Guía de Implementación — Formularios Automatizados
**Collective Mining · Talento Humano**
Versión: 1.0 · Fecha: Mayo 2026

---

## Resumen del flujo

```
Usuario → Google Form → Apps Script → Google Doc → PDF → Gmail
                                                        ↓
                                              Empleado + RR.HH.
                                                        ↓
                                              "Importar archivos" en el sistema
```

Este proceso reemplaza completamente la acción premium de Power Automate.
Todo es gratuito y funciona con una cuenta de Google.

---

## Lo que necesitas crear (por cada formulario)

| Pieza | Herramienta | Para qué |
|---|---|---|
| Plantilla del formulario | Google Docs | Base visual del PDF final |
| Formulario de captura | Google Forms | Captura los datos del usuario |
| Hoja de respuestas | Google Sheets | Almacena las respuestas (se crea automático) |
| Script de automatización | Apps Script | Genera el PDF y envía los correos |
| Carpeta de salida | Google Drive | Almacena los PDFs generados |

---

## PASO 1 — Crear la carpeta de Drive para los PDFs

1. Ve a [drive.google.com](https://drive.google.com)
2. Crea una carpeta llamada `Solicitudes_TH` (o el nombre que prefieras)
3. Cópiala dentro de la carpeta compartida con Talento Humano
4. Abre la carpeta y copia el **ID de la URL**:
   ```
   drive.google.com/drive/folders/<<<ESTE_ES_EL_ID>>>
   ```
5. Guarda ese ID — lo necesitarás en el script

---

## PASO 2 — Crear el Google Doc Plantilla

Debes crear **un Doc por cada formulario** (uno para Permiso, uno para Vacaciones).

### Para Solicitud de Permiso:

1. Ve a [docs.google.com](https://docs.google.com) y crea un documento nuevo
2. Nómbralo `PLANTILLA_Solicitud_Permiso` *(importante: no lo modifiques después de configurar el script)*
3. Diseña el documento replicando el formato del PDF original. Usa tablas para las secciones.
4. En cada campo donde va un dato del usuario, escribe el **marcador correspondiente**:

```
INFORMACION PERSONAL

Fecha:   {{DIA}} / {{MES}} / {{ANIO}}

Nombre: {{NOMBRE}}                    Cédula: {{CEDULA}}
Cargo:  {{CARGO}}                     Área:   {{AREA}}

─────────────────────────────────────────
DATOS DE PERMISO

Fecha Permiso:   De: {{FECHA_PERM_DE}}     Hasta: {{FECHA_PERM_HASTA}}
Horas:           De: {{HORAS_DE}}           Hasta: {{HORAS_HASTA}}
Total de Días:   {{TOTAL_DIAS}}

─────────────────────────────────────────
MOTIVO DEL PERMISO

{{MOTIVO_ESTUDIO}}         Estudio
{{MOTIVO_CALAMIDAD}}       Calamidad Doméstica
{{MOTIVO_MEDICO}}          Médico
{{MOTIVO_VACACIONES}}      Vacaciones
{{MOTIVO_COMPENSATORIO}}   Compensatorio
{{MOTIVO_FUERZA_MAYOR}}    Fuerza Mayor
{{MOTIVO_OTRA}}            Otra Causa — ¿Cuál? {{OTRA_CAUSA_CUAL}}

Explicación: {{EXPLICACION}}

─────────────────────────────────────────
TIPO DE PERMISO

{{TIPO_REMUNERADO}} Remunerado        {{TIPO_NO_REMUNERADO}} No Remunerado

─────────────────────────────────────────
           SOLICITANTE        |    JEFE INMEDIATO    |  TALENTO HUMANO
Nombre: {{NOMBRE_SOLICITANTE}} |    Nombre:           |   Nombre:
Cédula: {{CEDULA_SOLICITANTE}} |    Cédula:           |   Cédula:
Firma:                         |    Firma:            |   Firma:

─────────────────────────────────────────
OBSERVACIONES

{{OBSERVACIONES}}
```

> **Nota:** Los marcadores `[X]` y `[  ]` son generados automáticamente por el script
> según la opción elegida en el formulario.

5. Una vez terminado el diseño, copia el **ID del documento** desde la URL:
   ```
   docs.google.com/document/d/<<<ESTE_ES_EL_ID>>>/edit
   ```

### Para Solicitud de Vacaciones:

Mismo proceso con estos marcadores:

```
INFORMACION PERSONAL

Nombre y Apellidos: {{NOMBRE}}         Cédula: {{CEDULA}}
Cargo: {{CARGO}}

─────────────────────────────────────────
PERIODO SOLICITADO

Desde (DD/MM/AAAA): {{PERIODO_DESDE}}     Hasta (DD/MM/AAAA): {{PERIODO_HASTA}}
Días a disfrutar: {{DIAS_DISFRUTAR}}

─────────────────────────────────────────
ACTIVIDADES PENDIENTES / REEMPLAZO

Actividades pendientes:    {{ACT_PENDIENTES}}
Persona asignada reemplazo: {{REEMPLAZO}}

─────────────────────────────────────────
           JEFE DIRECTO    |    SOLICITANTE          |  TALENTO HUMANO
Nombre:                    | {{NOMBRE_SOLICITANTE}}  |   Nombre:
Cédula:                    | {{CEDULA_SOLICITANTE}}  |   Cédula:
Firma:                     |    Firma:               |   Firma:

─────────────────────────────────────────
OBSERVACIONES

{{OBSERVACIONES}}

Fecha de solicitud: {{FECHA_HOY}}
```

---

## PASO 3 — Crear el Google Form

Crea **un formulario por cada tipo de solicitud**.

### Preguntas para Solicitud de Permiso

Los títulos deben ser **exactamente** como se muestran aquí (el script los usa para leer las respuestas):

| Pregunta (título exacto) | Tipo de pregunta |
|---|---|
| Correo electrónico | Email / Respuesta corta |
| Nombre completo | Respuesta corta |
| Cédula de ciudadanía | Respuesta corta |
| Cargo | Respuesta corta |
| Área | Respuesta corta |
| Fecha de permiso — Desde | Fecha |
| Fecha de permiso — Hasta | Fecha |
| Hora de inicio | Hora |
| Hora de fin | Hora |
| Total de días | Respuesta corta |
| Motivo del permiso | Opción múltiple (una sola) |
| ¿Cuál es la otra causa? | Respuesta corta *(opcional)* |
| Explicación del motivo | Párrafo |
| Tipo de permiso | Opción múltiple: `Remunerado` / `No Remunerado` |
| Observaciones | Párrafo *(opcional)* |

**Opciones para "Motivo del permiso":**
- Estudio
- Calamidad Doméstica
- Médico
- Vacaciones
- Compensatorio
- Fuerza Mayor
- Otra Causa

### Preguntas para Solicitud de Vacaciones

| Pregunta (título exacto) | Tipo de pregunta |
|---|---|
| Correo electrónico | Email / Respuesta corta |
| Nombre y apellidos completos | Respuesta corta |
| Cédula de ciudadanía | Respuesta corta |
| Cargo | Respuesta corta |
| Período de vacaciones — Desde (DD/MM/AAAA) | Fecha |
| Período de vacaciones — Hasta (DD/MM/AAAA) | Fecha |
| Número de días a disfrutar | Respuesta corta |
| Actividades pendientes durante la ausencia | Párrafo |
| Persona asignada como reemplazo | Respuesta corta |
| Observaciones | Párrafo *(opcional)* |

---

## PASO 4 — Vincular el Form a un Google Sheet

1. En el Google Form, ve a la pestaña **Respuestas**
2. Haz clic en el ícono de Google Sheets (hoja verde)
3. Selecciona "Crear una hoja de cálculo nueva"
4. Esto crea automáticamente un Sheet donde se guardan todas las respuestas

---

## PASO 5 — Configurar el Script en Apps Script

1. Abre el Google Sheet que creaste en el paso anterior
2. Ve a **Extensiones → Apps Script**
3. Elimina el código de ejemplo que aparece por defecto
4. Copia y pega el contenido del archivo `.js` correspondiente:
   - `script_solicitud_permiso.js` para el formulario de permisos
   - `script_solicitud_vacaciones.js` para el formulario de vacaciones
5. **Reemplaza los valores de configuración** al inicio del script:
   ```javascript
   var CONFIG_PERMISO = {
     TEMPLATE_DOC_ID: '← pega aquí el ID del Google Doc plantilla',
     CARPETA_RRHH_ID: '← pega aquí el ID de la carpeta de Drive',
     EMAIL_RRHH:      '← correo real de Talento Humano',
     ...
   };
   ```
6. Haz clic en **Guardar** (ícono de disquete o Ctrl+S)

---

## PASO 6 — Configurar el Trigger (disparador automático)

Este es el paso que hace que el script se active solo cuando alguien envía el formulario:

1. En el editor de Apps Script, haz clic en el ícono del **reloj** en la barra lateral izquierda (Triggers / Activadores)
2. Haz clic en **"+ Agregar activador"** (botón azul, esquina inferior derecha)
3. Configura así:

| Campo | Valor |
|---|---|
| Función a ejecutar | `onSubmitPermiso` (o `onSubmitVacaciones`) |
| Implementación | Cabeza |
| Fuente del evento | **Desde hoja de cálculo** |
| Tipo de evento | **Al enviar el formulario** |

4. Haz clic en **Guardar**
5. Google te pedirá **autorizar los permisos** — acepta todo. El script necesita acceso a Drive, Docs y Gmail.

---

## PASO 7 — Probar el sistema

1. Abre el Google Form como si fuera un usuario final
2. Llena todos los campos con datos de prueba
3. Envía el formulario
4. Espera unos 15-30 segundos
5. Verifica:
   - ¿Llegó el correo con el PDF adjunto a la dirección de RR.HH.?
   - ¿Apareció el PDF en la carpeta de Drive?
   - ¿El PDF tiene el formato correcto con los datos ingresados?

Si algo falla, ve a Apps Script → **Ejecuciones** para ver el log de errores.

---

## Solución de problemas comunes

| Problema | Causa probable | Solución |
|---|---|---|
| No llega el correo | Permisos no autorizados | Re-ejecuta el trigger y vuelve a autorizar |
| PDF en blanco o con `{{MARCADOR}}` sin reemplazar | Nombre del campo del Form no coincide | Verifica que el título en el Form sea idéntico al del script |
| Error "No se encontró el archivo" | ID del Doc o carpeta incorrecto | Vuelve a copiar el ID desde la URL |
| El trigger no se activa | Trigger configurado incorrectamente | Borra el trigger y vuelve a crearlo |
| Script sin autorización de Gmail | Primera ejecución sin autorizar | Ejecuta manualmente la función una vez y autoriza |

---

## Estructura de archivos en Drive sugerida

```
📁 Talento Humano — Collective Mining/
│
├── 📁 Plantillas/
│   ├── 📄 PLANTILLA_Solicitud_Permiso      ← Google Doc (no modificar)
│   └── 📄 PLANTILLA_Solicitud_Vacaciones   ← Google Doc (no modificar)
│
├── 📁 Solicitudes_TH/                      ← PDFs generados automáticamente
│   ├── 📄 Permiso_Juan_Garcia_110526.pdf
│   └── 📄 Vacaciones_Maria_Lopez_110526.pdf
│
└── 📁 Scripts/
    ├── 📊 Respuestas_Permiso               ← Google Sheet vinculado al Form
    └── 📊 Respuestas_Vacaciones            ← Google Sheet vinculado al Form
```

---

*Guía elaborada para Collective Mining · Talento Humano · 2026*
