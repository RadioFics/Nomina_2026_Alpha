# 🔧 Guía de Implementación - Sistema de Novedades V2

## ÍNDICE
1. [Resumen](#resumen)
2. [Cambios en el Backend](#cambios-en-el-backend)
3. [Cambios en el Frontend](#cambios-en-el-frontend)
4. [Nuevos Endpoints](#nuevos-endpoints)
5. [Ejemplo de Integración](#ejemplo-de-integración)

---

## RESUMEN

### Cambio arquitectónico
```
ANTES: 3 tablas separadas (Ocasionales, Fijas, Ausencias)
DESPUÉS: 3 tablas + 1 tabla central (NO_NOVED) + tabla de auditoría
```

### Ventajas
✅ Histórico centralizado de todas las novedades
✅ Auditoría detallada de cambios
✅ Reportes consolidados por período/persona
✅ Soft delete (no se pierden datos)
✅ Trazabilidad completa

---

## CAMBIOS EN EL BACKEND

### 1. Ejecutar Scripts SQL

```bash
# Ejecutar en SQL Server Management Studio:
-- Abrir: database/migration_novedades.sql
-- Ejecutar todas las secciones (Pasos 1-8)
```

El script:
- ✅ Crea tabla NO_NOVED
- ✅ Agrega columnas novedadId a tablas existentes
- ✅ Crea tabla de auditoría
- ✅ Crea vistas y procedimientos almacenados

### 2. Actualizar el Controlador

**Opción A: Reemplazar completamente** (Recomendado)
```bash
# Hacer backup del archivo actual
cp controllers/nominaController.js controllers/nominaController.backup.js

# Copiar el nuevo controlador
cp controllers/nominaControllerV2.js controllers/nominaController.js
```

**Opción B: Fusionar código** (Si tienes lógica personalizada)

Las nuevas funciones en `nominaControllerV2.js`:
- `crearOcasional()` → Registra en NO_NOVED + Ocasionales
- `actualizarOcasional()` → Actualiza ambas tablas
- `eliminarOcasional()` → Soft delete con auditoría
- Ídem para Fijas y Ausencias
- `obtenerHistorialPersona()` → NUEVO: histórico centralizado
- `obtenerNovedadesCentralizadas()` → NUEVO: todas las novedades
- `obtenerReporteConsolidado()` → NUEVO: para exportación

### 3. Actualizar Rutas (si no estaban)

En `routes/nomina.js` o donde estén definidas:

```javascript
// Rutas existentes (compatible)
router.post('/ocasionales', nominaController.crearOcasional);
router.get('/ocasionales', nominaController.obtenerOcasionales);
router.put('/ocasionales/:id', nominaController.actualizarOcasional);
router.delete('/ocasionales/:id', nominaController.eliminarOcasional);

// Ídem para /fijas y /ausencias

// NUEVAS RUTAS
router.get('/historial', nominaController.obtenerHistorialPersona);
router.get('/novedades-centralizadas', nominaController.obtenerNovedadesCentralizadas);
router.get('/reportes/consolidado', nominaController.obtenerReporteConsolidado);
```

---

## CAMBIOS EN EL FRONTEND

### 1. Actualizar Llamadas API

Las funciones JavaScript existentes funcionan sin cambios, pero con mejoras:

```javascript
// ANTES (seguirá funcionando)
async function crearOcasional() {
  const response = await fetch(`${API_BASE}/nomina/ocasionales`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data)
  });
}

// AHORA RETORNA (mejorado)
{
  success: true,
  id: "uuid-tabla-ocasionales",
  novedadId: "uuid-tabla-no-noved",  // NUEVO
  numeroNovedad: "2026-04-OCW-001",  // NUEVO
  message: "..."
}
```

### 2. Agregar Nueva Pestaña en HTML

En `index_novedades.html`, agregar antes del cierre de `</body>`:

```html
<!-- NUEVA PESTAÑA: HISTÓRICO GENERAL -->
<div class="tab-pane" id="tabHistorico">
  <div class="tab-header">
    <h2>📊 Histórico General de Novedades</h2>
    <div class="filter-controls">
      <input type="text" id="hsearchCedula" placeholder="Buscar por cédula..." />
      <select id="hfilterCategoria">
        <option value="">Todas las categorías</option>
        <option value="Ocasional">Ocasionales</option>
        <option value="Fija">Fijas</option>
        <option value="Ausencia">Ausencias</option>
      </select>
      <select id="hfilterEstado">
        <option value="">Todos los estados</option>
        <option value="Activo">Activos</option>
        <option value="Modificado">Modificados</option>
        <option value="Cancelado">Cancelados</option>
      </select>
      <button onclick="cargarHistoricoGeneralFiltrado()">🔍 Filtrar</button>
    </div>
  </div>

  <table class="table">
    <thead>
      <tr>
        <th>Número Novedad</th>
        <th>Cédula</th>
        <th>Nombre</th>
        <th>Categoría</th>
        <th>Tipo</th>
        <th>Período</th>
        <th>Valor</th>
        <th>Estado</th>
        <th>Fecha Registro</th>
      </tr>
    </thead>
    <tbody id="tbHistorico"></tbody>
  </table>
</div>
```

### 3. Agregar JavaScript para Nueva Pestaña

En `js/api.js`, agregar:

```javascript
/**
 * Cargar histórico centralizado
 */
async function cargarHistoricoGeneral() {
  try {
    const response = await fetch(`${API_BASE}/nomina/novedades-centralizadas`);
    const novedades = await response.json();

    const tbody = document.getElementById('tbHistorico');
    if (!tbody) return;

    tbody.innerHTML = '';

    if (novedades.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Sin registros</td></tr>';
      return;
    }

    novedades.forEach(nov => {
      const row = tbody.insertRow();
      row.innerHTML = `
        <td><strong>${nov.numeroNovedad}</strong></td>
        <td>${nov.cedula}</td>
        <td>${nov.nombre}</td>
        <td>${nov.categoria}</td>
        <td>${nov.tipo || ''}</td>
        <td>${nov.periodo}</td>
        <td>$${(nov.valor || 0).toLocaleString('es-CO', {minimumFractionDigits: 2})}</td>
        <td>
          <span class="badge ${getEstadoBadge(nov.estado)}">
            ${nov.estado}
          </span>
        </td>
        <td>${new Date(nov.fechaRegistro).toLocaleDateString('es-CO')}</td>
      `;
    });
  } catch (err) {
    console.error('Error cargando histórico:', err);
  }
}

/**
 * Cargar histórico con filtros
 */
async function cargarHistoricoGeneralFiltrado() {
  try {
    const cedula = document.getElementById('hsearchCedula')?.value || '';
    const categoria = document.getElementById('hfilterCategoria')?.value || '';
    const estado = document.getElementById('hfilterEstado')?.value || '';

    let url = `${API_BASE}/nomina/novedades-centralizadas?`;
    const params = [];

    if (cedula) params.push(`cedula=${encodeURIComponent(cedula)}`);
    if (categoria) params.push(`categoria=${encodeURIComponent(categoria)}`);
    if (estado) params.push(`estado=${encodeURIComponent(estado)}`);

    url += params.join('&');

    const response = await fetch(url);
    const novedades = await response.json();

    const tbody = document.getElementById('tbHistorico');
    tbody.innerHTML = '';

    if (novedades.length === 0) {
      tbody.innerHTML = '<tr><td colspan="9" style="text-align:center;">Sin registros con estos filtros</td></tr>';
      return;
    }

    novedades.forEach(nov => {
      const row = tbody.insertRow();
      row.innerHTML = `
        <td><strong>${nov.numeroNovedad}</strong></td>
        <td>${nov.cedula}</td>
        <td>${nov.nombre}</td>
        <td>${nov.categoria}</td>
        <td>${nov.tipo || ''}</td>
        <td>${nov.periodo}</td>
        <td>$${(nov.valor || 0).toLocaleString('es-CO', {minimumFractionDigits: 2})}</td>
        <td>
          <span class="badge ${getEstadoBadge(nov.estado)}">
            ${nov.estado}
          </span>
        </td>
        <td>${new Date(nov.fechaRegistro).toLocaleDateString('es-CO')}</td>
      `;
    });
  } catch (err) {
    console.error('Error filtrando histórico:', err);
    alert('Error al filtrar: ' + err.message);
  }
}

/**
 * Obtener clase CSS para estado
 */
function getEstadoBadge(estado) {
  const map = {
    'Activo': 'badge-success',
    'Modificado': 'badge-warning',
    'Cancelado': 'badge-danger'
  };
  return map[estado] || 'badge-default';
}

/**
 * Obtener histórico de una persona específica
 */
async function cargarHistorialPersona(cedula) {
  try {
    const response = await fetch(
      `${API_BASE}/nomina/historial?cedula=${encodeURIComponent(cedula)}`
    );
    const data = await response.json();

    console.log('Histórico de:', data.nombre);
    console.log('Totales:', data.totales);
    console.log('Novedades:', data.novedades);

    return data;
  } catch (err) {
    console.error('Error:', err);
  }
}

// Cargar histórico al iniciar
document.addEventListener('DOMContentLoaded', () => {
  setTimeout(() => {
    cargarHistoricoGeneral();

    // Recargar cada 5 minutos
    setInterval(cargarHistoricoGeneral, 300000);
  }, 500);
});
```

### 4. CSS para Nuevos Elementos (opcional)

```css
.badge {
  display: inline-block;
  padding: 4px 8px;
  border-radius: 3px;
  font-size: 0.85em;
  font-weight: bold;
}

.badge-success {
  background-color: #28a745;
  color: white;
}

.badge-warning {
  background-color: #ffc107;
  color: black;
}

.badge-danger {
  background-color: #dc3545;
  color: white;
}

.badge-default {
  background-color: #6c757d;
  color: white;
}

.filter-controls {
  display: flex;
  gap: 10px;
  margin-bottom: 20px;
  flex-wrap: wrap;
}

.filter-controls input,
.filter-controls select {
  padding: 8px 12px;
  border: 1px solid #ddd;
  border-radius: 4px;
  font-size: 0.95em;
}

.filter-controls button {
  padding: 8px 16px;
  background-color: #007bff;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
}

.filter-controls button:hover {
  background-color: #0056b3;
}
```

---

## NUEVOS ENDPOINTS

### GET /api/nomina/historial
**Parámetros:**
- `cedula` (obligatorio): Cédula de la persona
- `periodo` (opcional): Período específico

**Respuesta:**
```json
{
  "cedula": "1234567890",
  "nombre": "Juan García",
  "novedades": [
    {
      "numeroNovedad": "2026-04-OCW-001",
      "categoria": "Ocasional",
      "tipo": "Bono",
      "periodo": "2026-04-Q1",
      "valor": 500000,
      "estado": "Activo",
      "fechaRegistro": "2026-04-05T10:30:00"
    }
  ],
  "totales": {
    "ingresos": 500000,
    "descuentos": -50000,
    "neto": 450000
  }
}
```

### GET /api/nomina/novedades-centralizadas
**Parámetros:**
- `periodo` (opcional)
- `categoria` (opcional): Ocasional, Fija, Ausencia
- `estado` (opcional): Activo, Modificado, Cancelado
- `cedula` (opcional)

**Respuesta:** Array de novedades

### GET /api/nomina/reportes/consolidado
**Parámetros:**
- `periodo` (opcional)

**Respuesta:** Array de novedades con todos los campos para exportación

---

## EJEMPLO DE INTEGRACIÓN

### Caso 1: Crear una ocasional (Sin cambios en frontend)

```javascript
// Código existente funciona igual
const data = {
  cedula: "1234567890",
  nombre: "Juan García",
  novedad: "Bono Productividad",
  tipo: "Bonus",
  cantidad: 1,
  valor: 500000,
  observaciones: "Cumplimiento de meta",
  periodo: "2026-04-Q1"
};

const response = await fetch(`${API_BASE}/nomina/ocasionales`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
});

const result = await response.json();
// Ahora result contiene: id, novedadId, numeroNovedad
console.log('Número de novedad:', result.numeroNovedad); // 2026-04-OCW-001
```

### Caso 2: Ver histórico de una persona

```javascript
async function verHistorial() {
  const data = await cargarHistorialPersona('1234567890');
  
  console.log('Nombre:', data.nombre);
  console.log('Total ingresos:', data.totales.ingresos);
  console.log('Total descuentos:', data.totales.descuentos);
  
  data.novedades.forEach(nov => {
    console.log(`${nov.numeroNovedad}: ${nov.tipo} - $${nov.valor}`);
  });
}
```

### Caso 3: Filtrar novedades por estado

```javascript
async function verActivos() {
  const response = await fetch(
    `${API_BASE}/nomina/novedades-centralizadas?estado=Activo`
  );
  const novedades = await response.json();
  
  console.log(`Total de novedades activas: ${novedades.length}`);
}
```

### Caso 4: Generar reporte para exportación

```javascript
async function generarReporteExcel() {
  const response = await fetch(
    `${API_BASE}/nomina/reportes/consolidado?periodo=2026-04`
  );
  const datos = await response.json();
  
  // Aquí se pueden usar bibliotecas como xlsx para generar Excel
  console.log(`Registros para reportar: ${datos.length}`);
}
```

---

## PLAN DE MIGRACIÓN

### Fase 1: Preparación ✓
- [x] Documentar arquitectura
- [x] Crear scripts SQL
- [x] Crear nuevo controlador

### Fase 2: Implementación
- [ ] Ejecutar scripts SQL
- [ ] Reemplazar nominaController.js
- [ ] Probar endpoints existentes
- [ ] **Validar que no se rompe nada**

### Fase 3: Nuevas Funcionalidades
- [ ] Agregar pestaña "Histórico General"
- [ ] Implementar filtros
- [ ] Agregar función de exportación

### Fase 4: Auditoría y Testing
- [ ] Verificar auditoría en NO_NOVED_Auditoria
- [ ] Probar soft delete
- [ ] Generar reportes de prueba

---

## CHECKLIST DE VALIDACIÓN

Después de la implementación, verificar:

```
[ ] Scripts SQL ejecutados sin errores
[ ] Tabla NO_NOVED creada
[ ] Columnas novedadId agregadas a tablas existentes
[ ] Crear ocasional → registra en ambas tablas
[ ] Crear fija → registra en ambas tablas
[ ] Crear ausencia → registra en ambas tablas
[ ] Actualizar novedad → actualiza ambas tablas
[ ] Eliminar novedad → soft delete, estado = Cancelado
[ ] GET /api/nomina/historial retorna datos corretos
[ ] GET /api/nomina/novedades-centralizadas filtra correctamente
[ ] Número de novedad se genera automáticamente
[ ] Auditoría registra cambios en NO_NOVED_Auditoria
[ ] Frontend muestra nueva pestaña de histórico
[ ] Filtros funcionan correctamente
[ ] Exportación genera datos válidos
```

---

## SOPORTE

Si algo no funciona:

1. **Verificar logs del servidor** - Buscar errores en consola Node.js
2. **Revisar SQL Server** - Confirmar que tablas fueron creadas
3. **Testear endpoints** - Usar Postman o similar
4. **Validar permisos** - Usuario SQL debe tener permisos en nuevas tablas
5. **Revisar auditoría** - Ver tabla NO_NOVED_Auditoria para detalles de errores

