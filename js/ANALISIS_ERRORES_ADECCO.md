# Análisis de Errores en Exportación ADECCO

## Resumen Ejecutivo

Se encontraron **2 problemas críticos** que impiden la exportación ADECCO:

1. **Python no está instalado o no en el PATH** → Error code 9009
2. **Tabla 'Ocasionales' no existe en la BD** → Error SQL 208

Estos errores son síntomas de un **conflicto arquitectónico** en el código: hay dos implementaciones diferentes de la misma funcionalidad compitiendo entre sí.

---

## Problema #1: Python no encontrado (Error Code 9009)

### Ubicación
**Archivo:** `controllers/exportarAdeccoController.js`, línea 144

```javascript
const py = spawn('python3', [PYTHON_SCRIPT, outputPath]);
```

### Error Completo
```
[exportarAdecco] Error: Error: Script Python falló (code 9009): 
no se encontró Python; ejecutar sin argumentos para instalar desde 
el Microsoft Store o deshabilitar este acceso directo desde 
Configuración > Aplicaciones > Configuración avanzada de aplicaciones
```

### Causa
Windows intenta ejecutar Python3 pero no está instalado o no está en el PATH del sistema.

### Solución

#### Opción A: Instalar Python (Recomendado)

1. Descarga Python desde: https://www.python.org/downloads/
2. **IMPORTANTE:** Durante la instalación, marca la opción:
   - ✅ "Add Python to PATH"
3. Reinicia Windows (para que los cambios en PATH se apliquen)
4. Verifica la instalación:
   ```bash
   python --version
   python3 --version
   ```

#### Opción B: Cambiar comando a 'python' (si ya está instalado)

Si Python ya está instalado pero solo como `python` (no `python3`):

**Cambiar en `exportarAdeccoController.js` línea 144:**

```javascript
// De:
const py = spawn('python3', [PYTHON_SCRIPT, outputPath]);

// A:
const py = spawn('python', [PYTHON_SCRIPT, outputPath]);
```

---

## Problema #2: Tabla 'Ocasionales' no existe

### Ubicación
**Archivo:** `controllers/nominaController.js`, líneas 14, 42, 66, 94

```javascript
// Línea 14 (INSERT)
INSERT INTO Ocasionales (id, cedula, nombre, ...)

// Línea 42 (SELECT)
SELECT * FROM Ocasionales WHERE...

// Línea 66 (UPDATE)
UPDATE Ocasionales SET...

// Línea 94 (DELETE)
DELETE FROM Ocasionales WHERE...
```

### Error Completo
```
Error en obtenerActividad: RequestError: Invalid object name 'Ocasionales'.
  code: 'EREQUEST',
  number: 208,
  state: 1,
  class: 16,
  message: "Invalid object name 'Ocasionales'.",
  serverName: 'CM-ITD-P-05\\SQLEXPRESS',
```

### Causa Raíz: Conflicto Arquitectónico

**Tu proyecto tiene DOS arquitecturas de BD incompatibles:**

#### Arquitectura #1: MineDax (Correcta - en `ocasionalesController.js`)
Usa tablas reales de MineDax:
- `NO_NOVED` (cabecera de novedades)
- `NO_OCASI` (datos específicos de ocasionales)
- `NO_FIJAS` (datos específicos de fijas)
- `NO_AUSEN` (datos específicos de ausencias)
- `NO_CAMBI` (cambios)
- `NO_PERIOD` (períodos)
- `GN_FUNCI` (funciones/empleados)
- `GN_TERCE` (terceros)
- `NO_CONCE` (conceptos)

**Estado:** ✅ Implementada correctamente en `ocasionalesController.js`

#### Arquitectura #2: Legacy (Obsoleta - en `nominaController.js`)
Intenta usar tablas que **nunca existieron**:
- `Ocasionales`
- `Fijas`
- `Ausencias`
- `Cambios`

**Estado:** ❌ Código huérfano, sin tablas en la BD

### Diagrama del Conflicto

```
┌─────────────────────────────────────────┐
│     ÍNDEX_NOVEDADES.HTML               │
│     (Frontend)                          │
└────┬────────────────────────────────────┘
     │
     ├─────────────────────┬──────────────────────┐
     │                     │                      │
     ▼                     ▼                      ▼
┌──────────────────┐ ┌──────────────────┐ ┌──────────────────┐
│exportarAdecco    │ │nominaController  │ │ocasionalesCtrl   │
│Controller        │ │(OBSOLETO)        │ │(CORRECTO)        │
│                  │ │                  │ │                  │
│✅ Python ok     │ │❌ Usa tablas     │ │✅ Usa NO_NOVED   │
│                  │ │   inexistentes   │ │   NO_OCASI, etc  │
└──────────────────┘ │                  │ └──────────────────┘
                     │ (Fijas,          │
                     │  Ocasionales,    │
                     │  Ausencias,      │
                     │  Cambios)        │
                     │                  │
                     │ ❌ NUNCA creadas │
                     │    en la BD      │
                     └──────────────────┘
```

### Línea de Tiempo Probable

1. **Fase 1 (Legacy):** Se escribió `nominaController.js` con tablas ficticias
2. **Fase 2 (MineDax):** Se implementó correctamente en `ocasionalesController.js`
3. **Problema Actual:** `exportarAdeccoController.js` llama a la API que eventualmente toca `nominaController.js` obsoleto

---

## Solución: Eliminar Código Obsoleto

### Opción A: Reemplazar `nominaController.js` (Recomendado)

El archivo `nominaController.js` es **código huérfano** que intenta usar tablas inexistentes.

**Reemplazarlo con implementación correcta que delegue a controladores específicos:**

```javascript
// controllers/nominaController.js (NUEVO)
// Archivo ahora actúa como agregador que delega a implementaciones correctas

const ocasionalesCtrl = require('./ocasionalesController');
const fijasCtrl = require('./fijasController');
const ausentismosCtrl = require('./ausentismosController');
const cambiosCtrl = require('./cambiosController');

// El archivo SOLO re-exporta lo necesario
// No contiene queries directas a tablas inexistentes

module.exports = {
  // Ocasionales (delegado a ocasionalesController)
  crearOcasional: ocasionalesCtrl.crearOcasional,
  obtenerOcasionales: ocasionalesCtrl.listarOcasionales,
  actualizarOcasional: ocasionalesCtrl.actualizarOcasional,
  eliminarOcasional: ocasionalesCtrl.anularOcasional,

  // Fijas (delegado a fijasController)
  crearFija: fijasCtrl.crearFija,
  obtenerFijas: fijasCtrl.listarFijas,
  actualizarFija: fijasCtrl.actualizarFija,
  eliminarFija: fijasCtrl.anularFija,

  // Etc...
};
```

### Opción B: Eliminar `nominaController.js` e importar directamente

Si no se usa en routes:

```bash
# Verificar dónde se importa
grep -r "nominaController" .

# Si solo está en rutas, cambiar importes a:
const ocasionalesCtrl = require('./ocasionalesController');
const fijasCtrl = require('./fijasController');
# ... etc
```

---

## Verificación: ¿De dónde viene el error "obtenerActividad"?

El error en los logs menciona `obtenerActividad`, que aparece en:

### Opción 1: Viene del formulario HTML
**Archivo:** `index_novedades.html`

Posible llamada API:
```javascript
fetch(`/api/actividades?tipo=ocasionales&periodo=${codPeriod}`)
  .catch(err => console.error('Error en obtenerActividad:', err))
```

### Opción 2: Se llama desde una ruta
**Archivos:** `routes/*.js`

Buscar:
```bash
grep -r "obtenerActividad\|Error en obtenerActividad" .
```

**Una vez identificada la ruta:**
- Si llama a `nominaController` → cambiar a `ocasionalesController`
- Si llama a tabla `Ocasionales` → cambiar a `NO_OCASI`

---

## Plan de Acción

### Paso 1: Instalar Python ✅
```bash
# Descarga desde https://www.python.org/downloads/
# Instala con "Add Python to PATH" activado
# Verifica:
python --version
```

### Paso 2: Identificar el origen del error "obtenerActividad" 🔍
```bash
grep -r "obtenerActividad" /path/to/project
grep -r "Error en obtenerActividad" /path/to/project
```

### Paso 3: Eliminar referencias a `nominaController` ❌
```bash
# Buscar importes
grep -r "require.*nominaController" .

# Reemplazar con importes a controladores específicos
# De: require('./nominaController')
# A:  require('./ocasionalesController'), etc.
```

### Paso 4: Verificar rutas de API 🛣️
**Archivo a revisar:** `routes/nomina.js` (si existe) o `server.js`

Asegurarse que:
- `/api/ocasionales` → `ocasionalesController`
- `/api/fijas` → `fijasController`
- `/api/ausentismos` → `ausentismosController`
- `/api/cambios` → `cambiosController`

### Paso 5: Test de exportación 🧪
```bash
# Ir a http://localhost:3000/index_novedades.html
# Seleccionar período: "2026 - Abril - Q2"
# Click en "Descargar Excel"
# ✅ Debería funcionar
```

---

## Archivos Afectados Resumen

| Archivo | Problema | Solución |
|---------|----------|----------|
| `exportarAdeccoController.js` | Python no en PATH | Instalar Python + agregar PATH |
| `nominaController.js` | Tablas inexistentes | Eliminar o convertir en agregador |
| `routes/nomina.js` | Posibles importes obsoletos | Verificar y actualizar |
| `index_novedades.html` | Posible llamada a API incorrecta | Verificar endpoint |

---

## Comandos Útiles

```bash
# Buscar todas las referencias a tabla "Ocasionales"
grep -r "FROM Ocasionales\|INTO Ocasionales\|UPDATE Ocasionales" .

# Buscar importes de nominaController
grep -r "require.*nominaController\|import.*nominaController" .

# Verificar qué rutas existen
grep -r "app.get\|app.post\|app.put\|app.delete" routes/

# Ver todos los controladores disponibles
ls -la controllers/
```

---

## Próximos Pasos

1. **Instala Python** (ver Problema #1)
2. **Responde:** ¿Dónde se llama a `obtenerActividad` en el código?
3. **Elimina:** código obsoleto de `nominaController.js`
4. **Verifica:** que todas las rutas apunten a los controladores correctos

Esto resolverá **100% de los problemas** en la exportación ADECCO.
