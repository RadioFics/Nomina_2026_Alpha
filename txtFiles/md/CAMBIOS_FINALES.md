# Actualización Final - Procesos Independientes para Nombres

## 📋 Resumen de Cambios

Se han separado completamente los procesos de obtención de nombres para garantizar que cada funcionalidad tenga su propia lógica de búsqueda en la BD.

---

## 🔄 PROCESO 1: Nombre COMPLETO (Usuario Registrador + Subtítulo)

### Objetivo
Obtener el nombre completo del usuario desde la tabla `GN_TERCE` para:
- Campo "Usuario Registrador" (readonly)
- Subtítulo en el header (debajo de "¡Bienvenido!")

### Estructura del Nombre Completo
```
APE_TERC + SEG_APEL + NOM_TERC + SEG_NOMB
Ej: CALLE PALMETT JUAN ESTEBAN
```

### Flujo de Búsqueda
1. Obtiene el identificador desde `AuthUtil.getNombre()` o `localStorage`
2. Busca en la BD usando el identificador completo
3. Si no encuentra, reintenta usando solo el primer token (apellido)
4. Construye el nombre completo combinando todos los campos disponibles de la tabla `GN_TERCE`

### Código Relevante (líneas 1777-1813)
```javascript
// PROCESO 1: Obtener nombre COMPLETO desde BD
// Construye: APE_TERC + SEG_APEL + NOM_TERC + SEG_NOMB
```

---

## 🎯 PROCESO 2: Nombres de Bienvenida (NOM_TERC + SEG_NOMB)

### Objetivo
Obtener SOLO los dos primeros nombres para:
- "¡Bienvenido, [NOMBRES]!"

### Estructura del Nombre de Bienvenida
```
NOM_TERC + SEG_NOMB
Ej: JUAN ESTEBAN
```

### Flujo de Búsqueda
1. Obtiene el identificador desde `AuthUtil.getNombre()` o `localStorage`
2. Busca en la BD usando el identificador completo
3. Si no encuentra, reintenta usando solo el primer token (apellido)
4. Extrae SOLO `NOM_TERC` y `SEG_NOMB` (si existe)
5. Combina ambos campos para la bienvenida

### Código Relevante (líneas 1816-1850)
```javascript
// PROCESO 2: Obtener NOM_TERC + SEG_NOMB desde BD
// Construye: NOM_TERC + SEG_NOMB (solo los dos primeros nombres)
```

---

## 🎨 Resultado Visual Esperado

### Header
```
┌─────────────────────────────────────────┐
│ ¡Bienvenido, JUAN ESTEBAN!              │  ← PROCESO 2 (NOM_TERC + SEG_NOMB)
│ CALLE PALMETT JUAN ESTEBAN              │  ← PROCESO 1 (nombre completo)
└─────────────────────────────────────────┘
```

### Dashboard - Período de Nómina
```
┌────────────────────────────────────────┐
│ Usuario Registrador                     │
│ CALLE PALMETT JUAN ESTEBAN (readonly)  │  ← PROCESO 1 (readonly)
└────────────────────────────────────────┘
```

---

## 🔍 Endpoints API Esperados

Ambos procesos utilizan los mismos endpoints, pero procesan la respuesta de forma diferente:

### Búsqueda por nombre completo
```
GET /api/usuario/datos?nombre=CALLE+PALMETT+JUAN+ESTEBAN
```

### Búsqueda alternativa (si falla)
```
GET /api/usuario/datos?apellido=CALLE
```

### Respuesta esperada
```json
{
  "NOM_TERC": "JUAN",
  "SEG_NOMB": "ESTEBAN",
  "APE_TERC": "CALLE",
  "SEG_APEL": "PALMETT",
  ...
}
```

---

## ✅ Independencia de Procesos

Ambos procesos son **completamente independientes**:

| Aspecto | PROCESO 1 | PROCESO 2 |
|---------|-----------|-----------|
| **Objetivo** | Nombre completo | Bienvenida |
| **Campos usados** | APE_TERC, SEG_APEL, NOM_TERC, SEG_NOMB | NOM_TERC, SEG_NOMB |
| **Destino** | Usuario Registrador + Subtítulo | Mensaje de bienvenida |
| **Búsquedas** | Sí (fallback incluido) | Sí (fallback incluido) |
| **Fallback** | Usa identificador completo | Usa primer token del identificador |

---

## 🧪 Pruebas Recomendadas

1. Verificar que "¡Bienvenido, [nombres]!" muestra correctamente NOM_TERC + SEG_NOMB
2. Verificar que "Usuario Registrador" muestra el nombre completo y es readonly
3. Verificar que el subtítulo muestra el nombre completo
4. Probar con usuarios que tengan:
   - Ambos nombres completos
   - Solo un nombre
   - Solo apellidos
5. Revisar consola del navegador para ver logs de ambos procesos

---

## 📝 Notas Técnicas

- Ambos procesos se ejecutan en paralelo
- Cada uno tiene su propio try-catch para manejar errores independientemente
- Los logs de consola indican claramente qué proceso se ejecuta y qué resultado obtuvo
- Si la BD retorna `null` o campos vacíos, el sistema usa valores por defecto ("Usuario")

---

**Archivo modificado:** `index_novedades.html`  
**Líneas modificadas:** 1750-1862  
**Fecha de cambio:** 2026-04-21
