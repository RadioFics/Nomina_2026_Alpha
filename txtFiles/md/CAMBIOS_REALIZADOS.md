# Correcciones Realizadas en index_novedades.html

## Resumen
Se han implementado 3 correcciones principales en el archivo `index_novedades.html` para mejorar la funcionalidad y experiencia del usuario en el dashboard de novedades de nómina.

---

## Corrección #1: Período Automático (No Editable)

### Problema Original
El período que se mostraba en la esquina superior derecha era modificable manualmente, y su actualización se hacía mediante un cálculo local sin sincronización con la base de datos.

### Solución Implementada
- **Lectura automática desde NO_PERIOD**: El período ahora se obtiene directamente de la tabla `NO_PERIOD` basado en la fecha actual del sistema.
- **Campo readonly**: El campo `#cfgPeriodo` ahora es de solo lectura (readonly).
- **Formato mejorado**: Se muestra en el formato `AÑO/MES/QUINCENA - FECHA_INICIO / FECHA_FIN`
- **Fallback local**: Si la API falla, utiliza un cálculo local como respaldo.

### Cambios en el Código
1. Modificada la función `inicializarInterfaz()` para obtener el período desde el endpoint `/api/periodo/actual`
2. Actualizado el campo HTML:
   ```html
   <!-- Antes -->
   <input type="text" id="cfgPeriodo" placeholder="Ej: 2025-03-01 / 2025-03-15" oninput="actualizarBadge()">
   
   <!-- Después -->
   <input type="text" id="cfgPeriodo" placeholder="Se carga automáticamente..." readonly>
   ```
3. Añadida función auxiliar `usarPeriodoLocal()` para el fallback

---

## Corrección #2: Nombre de Usuario desde BD

### Problema Original
El nombre de usuario mostraba el apellido (APE_TERC) en lugar del nombre completo. Debería mostrar `NOM_TERC + SEG_NOMB` o solo `NOM_TERC` si no existe segundo nombre.

### Solución Implementada
- **Lectura desde GN_TERCE**: Se obtienen los campos `NOM_TERC` y `SEG_NOMB` de la tabla `GN_TERCE`
- **Lógica de fallback**: 
  - Si tiene `NOM_TERC` + `SEG_NOMB`: muestra ambos
  - Si solo tiene `NOM_TERC`: muestra solo ese valor
  - Si falla la lectura de BD: usa el nombre desde AuthUtil/localStorage
- **Visualización mejorada**: La bienvenida ahora muestra "¡Bienvenido, [NOMBRE]!" con el nombre correcto

### Cambios en el Código
1. Modificada la función `inicializarInterfaz()` para llamar a `/api/usuario/datos?nombre=`
2. Implementada lógica condicional para combinar `NOM_TERC` + `SEG_NOMB`
3. Los campos `#welcomeMessage` y `#userNameDisplay` ahora muestran datos correctos

---

## Corrección #3: Selección Correcta de Pestañas

### Problema Original
Al seleccionar "Cambios e Ingresos" o "Maestro Original", también se seleccionaba accidentalmente la pestaña "Cambios Maestro" debido a una búsqueda por substring en el texto del elemento.

### Solución Implementada
- **Atributos data-page**: Se agregó el atributo `data-page="nombrePagina"` a todos los elementos `nav-item`
- **Búsqueda exacta**: La función `navigate()` ahora busca por coincidencia exacta del atributo `data-page`
- **Sin ambigüedades**: Cada pestaña tiene una identificación única y clara

### Cambios en el Código
1. Actualizada la función `navigate()`:
   ```javascript
   // Antes: búsqueda por substring
   items.forEach(i => { 
     if (i.textContent.trim().toLowerCase().includes(page.toLowerCase().substring(0,5))) 
       i.classList.add('active'); 
   });
   
   // Después: búsqueda por data-page
   items.forEach(i => {
     const pageAttr = i.getAttribute('data-page');
     if (pageAttr === page) {
       i.classList.add('active');
     }
   });
   ```

2. Agregados atributos `data-page` a todos los `nav-item`:
   ```html
   <div class="nav-item" data-page="cambiosIngresos" onclick="navigate('cambiosIngresos')">
     <span class="nav-icon">◨</span> Cambios e Ingresos
   </div>
   <div class="nav-item" data-page="cambiosMaestro" onclick="navigate('cambiosMaestro')">
     <span class="nav-icon">◧</span> Cambios Maestro
   </div>
   ```

---

## Endpoints de API Requeridos

Para que los cambios funcionen correctamente, se necesitan los siguientes endpoints:

### 1. GET /api/periodo/actual
**Respuesta esperada:**
```json
{
  "PER_ANO": 2026,
  "PER_MES": 12,
  "PER_QNA": 2,
  "PER_FINI": "2026-12-16",
  "PER_FFIN": "2026-12-31"
}
```

### 2. GET /api/usuario/datos?nombre={nombre}
**Respuesta esperada:**
```json
{
  "NOM_TERC": "JUAN",
  "SEG_NOMB": "ESTEBAN",
  "APE_TERC": "CALLE",
  "SEG_APEL": "PALMETT"
}
```

---

## Verificación de Cambios

✓ **Corrección #1**: Campo de período ahora es readonly y carga desde BD  
✓ **Corrección #2**: Nombre de usuario muestra NOM_TERC + SEG_NOMB correctamente  
✓ **Corrección #3**: Las pestañas de navegación se seleccionan sin ambigüedades  

---

## Notas Importantes

1. **Compatibilidad con navegadores**: Los cambios no afectan compatibilidad (usan JavaScript estándar)
2. **Seguridad**: Los campos readonly se han añadido tanto en HTML como en JavaScript
3. **Performance**: Se utiliza async/await para no bloquear la interfaz mientras se cargan datos
4. **Rollback**: Si es necesario revertir, el archivo original está disponible como backup

---

**Fecha de actualización**: 2026-04-21  
**Usuario**: CALLE PALMETT JUAN ESTEBAN  
**Período actual**: 2026/12/2
