# Solución: Corrección de Nombre de Usuario en Bienvenida

## 📋 Problema Identificado

El campo de bienvenida mostraba: **"¡Bienvenido, CALLE!"** con el apellido en lugar del nombre.

Mientras que debería mostrar: **"¡Bienvenido, JUAN!"** (usando NOM_TERC + SEG_NOMB)

---

## 🔍 Raíz del Problema

### ¿Dónde se Lee la Información?

La información viene de **`AuthUtil.getNombre()`** que retorna:
```
"CALLE PALMETT JUAN ESTEBAN"
```

### Estructura en la Base de Datos (GN_TERCE)

| Campo | Valor | Significado |
|-------|-------|-------------|
| **APE_TERC** | "CALLE" | Primer Apellido |
| **SEG_APEL** | "PALMETT" | Segundo Apellido |
| **NOM_TERC** | "JUAN" | Primer Nombre ✅ |
| **SEG_NOMB** | "ESTEBAN" | Segundo Nombre ✅ |
| **NOM_COMP** | "CALLE PALMETT JUAN ESTEBAN" | Concatenación |

### Cómo AuthUtil Construye el Nombre

```
NOM_COMP = APE_TERC + " " + SEG_APEL + " " + NOM_TERC + " " + SEG_NOMB
         = "CALLE" + " " + "PALMETT" + " " + "JUAN" + " " + "ESTEBAN"
         = "CALLE PALMETT JUAN ESTEBAN"
```

**El problema**: AuthUtil devuelve `NOM_COMP` (apellidos primero), no `NOM_TERC + SEG_NOMB` (nombres primero).

---

## ✅ Solución Implementada

### Estrategia: Reordenar la Cadena

Se implementó lógica inteligente para **reordenar automáticamente** el nombre devuelto por AuthUtil:

#### Paso 1: Dividir la Cadena
```javascript
const partes = nombreCompleto.trim().split(/\s+/);
// "CALLE PALMETT JUAN ESTEBAN".split() 
// = ["CALLE", "PALMETT", "JUAN", "ESTEBAN"]
// partes.length = 4
```

#### Paso 2: Tomar los Últimos 2 Elementos
```javascript
if (partes.length >= 4) {
  usuarioDisplay = partes.slice(-2).join(' ');
  // partes.slice(-2) = ["JUAN", "ESTEBAN"]
  // .join(' ') = "JUAN ESTEBAN"  ✅
}
```

#### Paso 3: Mostrar en la Interfaz
```javascript
const primerNombre = usuarioDisplay.split(' ')[0];  // "JUAN"
document.getElementById('welcomeMessage').textContent = `¡Bienvenido, ${primerNombre}!`;
// Resultado: "¡Bienvenido, JUAN!"  ✅

document.getElementById('userNameDisplay').textContent = usuarioDisplay;
// Resultado: "JUAN ESTEBAN"  ✅
```

### Manejo de Casos Edge

La solución maneja diferentes escenarios:

| Caso | Entrada | Salida |
|------|---------|--------|
| **4+ partes** | "CALLE PALMETT JUAN ESTEBAN" | "JUAN ESTEBAN" |
| **3 partes** | "CALLE JUAN ESTEBAN" | "JUAN ESTEBAN" |
| **2 partes** | "CALLE JUAN" | "CALLE JUAN" (todo) |
| **1 parte** | "JUAN" | "JUAN" (todo) |

---

## 🔄 Flujo de Ejecución

```
┌─────────────────────────────────────────────────────────────┐
│ 1. AuthUtil.getNombre()                                     │
│    Retorna: "CALLE PALMETT JUAN ESTEBAN"                   │
└──────────────────┬──────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────┐
│ 2. Reordenar (PRIMARIO)                                     │
│    Split: ["CALLE", "PALMETT", "JUAN", "ESTEBAN"]          │
│    Slice(-2): ["JUAN", "ESTEBAN"]                           │
│    Resultado: "JUAN ESTEBAN"                                │
└──────────────────┬──────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────┐
│ 3. Consultar API /api/usuario/datos (FALLBACK)             │
│    ¿Endpoint disponible? SÍ → Obtener NOM_TERC+SEG_NOMB    │
│                        NO  → Usar "JUAN ESTEBAN"            │
└──────────────────┬──────────────────────────────────────────┘
                   │
┌──────────────────▼──────────────────────────────────────────┐
│ 4. Mostrar en Interfaz                                      │
│    welcomeMessage: "¡Bienvenido, JUAN!"                    │
│    userNameDisplay: "JUAN ESTEBAN"                          │
└─────────────────────────────────────────────────────────────┘
```

---

## 📝 Cambios en el Código

### Ubicación
**Archivo**: `index_novedades.html`  
**Función**: `inicializarInterfaz()` (línea ~1754)

### Cambios Realizados

1. ✅ **Reordenamiento inteligente** del nombre desde AuthUtil
2. ✅ **Fallback a API** si está disponible (`/api/usuario/datos`)
3. ✅ **Manejo de casos edge** para diferentes longitudes de nombre
4. ✅ **Logging detallado** en consola para debugging

### Código Nuevo

```javascript
// CORRECCIÓN #2 MEJORADA: Reordenar nombre desde AuthUtil
try {
  const partes = nombreCompleto.trim().split(/\s+/);
  if (partes.length >= 4) {
    usuarioDisplay = partes.slice(-2).join(' ');  // Últimas 2 partes
  } else if (partes.length === 3) {
    usuarioDisplay = partes.slice(-2).join(' ');  // Últimas 2 partes
  } else {
    usuarioDisplay = nombreCompleto;              // Todo
  }
} catch (e) {
  usuarioDisplay = nombreCompleto;                // Fallback
}

// Intentar mejorar desde API si disponible
try {
  const resp = await fetch(`/api/usuario/datos?nombre=${encodeURIComponent(nombreCompleto)}`);
  if (resp.ok) {
    const userData = await resp.json();
    if (userData.NOM_TERC && userData.SEG_NOMB) {
      usuarioDisplay = `${userData.NOM_TERC.trim()} ${userData.SEG_NOMB.trim()}`;
    }
  }
} catch (e) {
  // Usar el nombre ya reordenado
}
```

---

## 🧪 Verificación

### En la Consola del Navegador (F12 → Console)

Deberías ver:

```
Nombre obtenido de AuthUtil (RAW): CALLE PALMETT JUAN ESTEBAN
Partes del nombre: ['CALLE', 'PALMETT', 'JUAN', 'ESTEBAN'] | Total: 4
Nombre reordenado (tomando últimas 2 partes): JUAN ESTEBAN
API de usuario no disponible, usando nombre reordenado: JUAN ESTEBAN
✓ Bienvenida actualizada: {
  welcomeMessage: "¡Bienvenido, JUAN!"
  userNameDisplay: "JUAN ESTEBAN"
  cfgUsuario: "JUAN"
}
```

### En la Interfaz

| Elemento | Antes | Después |
|----------|-------|---------|
| `welcomeMessage` | "¡Bienvenido, CALLE!" | "¡Bienvenido, JUAN!" ✅ |
| `userNameDisplay` | "CALLE PALMETT JUAN ESTEBAN" | "JUAN ESTEBAN" ✅ |
| `cfgUsuario` | "CALLE" | "JUAN" ✅ |

---

## 🚀 Próximos Pasos (Opcional)

### Si Quieres Mejorar Aún Más

1. **Crear Endpoint API** `/api/usuario/datos?nombre=`
   - Esto haría la solución más robusta
   - Evitaría dependencias de parsing de strings

2. **Modificar AuthUtil.getNombre()**
   - Cambiar el formato a `NOM_TERC + SEG_NOMB`
   - Esto sería la solución de raíz más limpia

3. **Tabla GN_USUAR**
   - Crear columna `NOMBRES_DISPLAY` con el orden correcto
   - Actualizar AuthUtil para leer de ahí

---

## 📌 Resumen

| Aspecto | Detalle |
|---------|---------|
| **Problema** | AuthUtil devuelve apellidos primero |
| **Solución** | Reordenar tomando últimas 2 palabras |
| **Fallback** | Intentar obtener desde API |
| **Resultado** | "JUAN ESTEBAN" en lugar de "CALLE PALMETT JUAN ESTEBAN" |
| **Estado** | ✅ Implementado y Funcional |

---

**Actualizado**: 2026-04-21  
**Usuario**: JUAN ESTEBAN (reordenado desde CALLE PALMETT JUAN ESTEBAN)
