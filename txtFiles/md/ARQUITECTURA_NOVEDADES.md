# 📋 Arquitectura de Novedades - Sistema de Nómina

## 1. PROBLEMA ACTUAL

**Situación:**
- Datos dispersos en 3 tablas (Ocasionales, Fijas, Ausencias)
- Sin histórico centralizado de cambios
- Difícil generar reportes consolidados por período
- Imposible auditar cambios a nivel de registro individual

**Solución propuesta:**
Modelo híbrido con **tablas específicas + tabla centralizada de histórico**

---

## 2. MODELO DE DATOS

### 2.1 ESTRUCTURA DE TABLAS

```
┌─────────────────────────────────────────────────────────────┐
│                    Datos Específicos por Período             │
│                                                               │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐       │
│  │ Ocasionales  │  │    Fijas     │  │  Ausencias   │       │
│  │              │  │              │  │              │       │
│  │ - Período    │  │ - Período    │  │ - Período    │       │
│  │ - Datos      │  │ - Datos      │  │ - Datos      │       │
│  │ - Reportes   │  │ - Reportes   │  │ - Reportes   │       │
│  └──────────────┘  └──────────────┘  └──────────────┘       │
│         ▲                 ▲                  ▲               │
│         └─────────────────┴──────────────────┘               │
│                        │                                     │
│              Cada cambio se registra en:                     │
│                                                               │
└─────────────────────────────────────────────────────────────┘
                          │
                          ▼
┌─────────────────────────────────────────────────────────────┐
│          NO_NOVED - Histórico Centralizado                   │
│                                                               │
│  - ID de novedad                                             │
│  - Persona (cedula, nombre)                                  │
│  - Categoría (Ocasional, Fija, Ausencia)                     │
│  - Tipo de movimiento (CREATE, UPDATE, DELETE)              │
│  - Período afectado                                          │
│  - Datos antes/después (auditoria)                           │
│  - Timestamp + usuario                                       │
│  - Estado (activo, cancelado)                                │
│                                                               │
└─────────────────────────────────────────────────────────────┘
```

### 2.2 TABLA NO_NOVED (Histórico Central)

```sql
CREATE TABLE NO_NOVED (
  -- Identificación
  id NVARCHAR(36) PRIMARY KEY,
  numeroNovedad NVARCHAR(50) UNIQUE NOT NULL,  -- NUM_NOVED: 2026-001-OCW
  
  -- Persona
  cedula NVARCHAR(20) NOT NULL,
  nombre NVARCHAR(255) NOT NULL,
  
  -- Clasificación
  categoria NVARCHAR(50) NOT NULL,             -- Ocasional, Fija, Ausencia
  tipo NVARCHAR(100),                          -- Bono, Descuento, Licencia...
  subtipo NVARCHAR(100),                       -- Enfermedad, Vacaciones...
  
  -- Período
  periodo NVARCHAR(50) NOT NULL,               -- "2026-04-Q1", "2026-04-Q2"
  fechaInicio DATE,
  fechaFin DATE,
  
  -- Valores
  cantidad DECIMAL(10, 2),
  valor DECIMAL(15, 2),
  aplicacion NVARCHAR(50),                     -- Para fijas: Nómina, Otra
  
  -- Control
  estado NVARCHAR(20) DEFAULT 'Activo',        -- Activo, Cancelado, Modificado
  motivoCancelacion NVARCHAR(500),
  
  -- Auditoría
  usuarioRegistro NVARCHAR(255),
  fechaRegistro DATETIME DEFAULT GETDATE(),
  usuarioActualizacion NVARCHAR(255),
  fechaActualizacion DATETIME,
  usuarioCancelacion NVARCHAR(255),
  fechaCancelacion DATETIME,
  
  -- Observaciones
  observaciones NVARCHAR(MAX),
  
  -- Índices
  INDEX IDX_cedula (cedula),
  INDEX IDX_periodo (periodo),
  INDEX IDX_categoria (categoria),
  INDEX IDX_estado (estado),
  INDEX IDX_fechaRegistro (fechaRegistro),
  INDEX IDX_cedula_periodo (cedula, periodo)
);
```

### 2.3 TABLAS ESPECÍFICAS (MODIFICADAS)

Mantener la estructura actual pero agregar **referencia a NO_NOVED**:

```sql
-- OCASIONALES (modificada)
ALTER TABLE Ocasionales ADD novedadId NVARCHAR(36);
ALTER TABLE Ocasionales ADD CONSTRAINT FK_Ocasionales_NO_NOVED 
  FOREIGN KEY (novedadId) REFERENCES NO_NOVED(id);

-- FIJAS (modificada)
ALTER TABLE Fijas ADD novedadId NVARCHAR(36);
ALTER TABLE Fijas ADD CONSTRAINT FK_Fijas_NO_NOVED 
  FOREIGN KEY (novedadId) REFERENCES NO_NOVED(id);

-- AUSENCIAS (modificada)
ALTER TABLE Ausencias ADD novedadId NVARCHAR(36);
ALTER TABLE Ausencias ADD CONSTRAINT FK_Ausencias_NO_NOVED 
  FOREIGN KEY (novedadId) REFERENCES NO_NOVED(id);
```

---

## 3. FLUJO DE TRABAJO

### 3.1 CREAR NOVEDAD

```
┌─────────────────────────┐
│  Interfaz: Crear        │
│  Ocasional/Fija/Ausencia│
└────────────┬────────────┘
             │
             ▼
┌──────────────────────────────────┐
│ 1. Validar datos                 │
│    - Cédula existe               │
│    - Período válido              │
│    - Datos completos             │
└────────────┬─────────────────────┘
             │
             ▼
┌──────────────────────────────────┐
│ 2. Crear registro en NO_NOVED    │
│    - numeroNovedad (auto)        │
│    - estado = 'Activo'           │
│    - usuarioRegistro             │
│    - fechaRegistro               │
└────────────┬─────────────────────┘
             │
             ▼
┌──────────────────────────────────┐
│ 3. Crear en tabla específica     │
│    - Ocasionales/Fijas/Ausencias │
│    - novedadId = referencia      │
│    - periodo = período específico│
└────────────┬─────────────────────┘
             │
             ▼
┌──────────────────────────────────┐
│ 4. Registrar en auditoría        │
│    - UsuariosLog                 │
│    - Acción: CREATE              │
└────────────┬─────────────────────┘
             │
             ▼
         ✓ Éxito
```

### 3.2 ACTUALIZAR NOVEDAD

```
┌─────────────────────────┐
│  Interfaz: Actualizar   │
│  Ocasional/Fija/Ausencia│
└────────────┬────────────┘
             │
             ▼
┌──────────────────────────────────┐
│ 1. Buscar en tabla específica    │
│    por ID                        │
└────────────┬─────────────────────┘
             │
             ▼
┌──────────────────────────────────┐
│ 2. Obtener novedadId asociado    │
│    (referencia en NO_NOVED)      │
└────────────┬─────────────────────┘
             │
             ▼
┌──────────────────────────────────┐
│ 3. Actualizar en tabla específica│
│    - Nuevos valores              │
└────────────┬─────────────────────┘
             │
             ▼
┌──────────────────────────────────┐
│ 4. Actualizar en NO_NOVED        │
│    - estado = 'Modificado'       │
│    - usuarioActualizacion        │
│    - fechaActualizacion          │
│    - valores nuevos              │
└────────────┬─────────────────────┘
             │
             ▼
┌──────────────────────────────────┐
│ 5. Registrar en auditoría        │
│    - UsuariosLog                 │
│    - Acción: UPDATE              │
└────────────┬─────────────────────┘
             │
             ▼
         ✓ Éxito
```

### 3.3 ELIMINAR NOVEDAD

```
┌─────────────────────────┐
│  Interfaz: Eliminar     │
│  Ocasional/Fija/Ausencia│
└────────────┬────────────┘
             │
             ▼
┌──────────────────────────────────┐
│ 1. Búsqueda suave (soft delete)  │
│    NO se borra físicamente       │
│                                  │
│    Opciones:                     │
│    a) Marcar como cancelado      │
│       en NO_NOVED                │
│    b) Eliminar de tabla específ. │
│    c) Mantener ambos registros   │
└────────────┬─────────────────────┘
             │
             ▼
┌──────────────────────────────────┐
│ 2. Actualizar en NO_NOVED        │
│    - estado = 'Cancelado'        │
│    - usuarioCancelacion          │
│    - fechaCancelacion            │
│    - motivoCancelacion           │
└────────────┬─────────────────────┘
             │
             ▼
┌──────────────────────────────────┐
│ 3. Eliminar de tabla específica  │
│    (opcional, por política)      │
└────────────┬─────────────────────┘
             │
             ▼
         ✓ Éxito con auditoría
```

---

## 4. IMPLEMENTACIÓN POR FASES

### Fase 1: Preparación (Hoy)
- [x] Diseño del modelo
- [ ] Scripts SQL de migración
- [ ] Crear tabla NO_NOVED
- [ ] Agregar columna novedadId a tablas existentes

### Fase 2: Backend (Controladores)
- [ ] Actualizar nominaController.js
  - Crear novedad en NO_NOVED primero
  - Obtener ID de novedad para referencia
  - Registrar en tabla específica
- [ ] Crear nuevos endpoints:
  - GET /api/nomina/historial (NO_NOVED)
  - GET /api/nomina/novedades/:cedula/completo
  - GET /api/nomina/reportes/consolidado

### Fase 3: Frontend (Interfaz)
- [ ] Actualizar index_novedades.html
  - Nueva pestaña "Histórico General"
  - Vista de NO_NOVED con filtros
  - Edición mejorada con seguimiento
- [ ] Agregar formularios para:
  - Cancelación de novedades
  - Búsqueda por rango de fechas
  - Exportación consolidada

### Fase 4: Reportes y Auditoría
- [ ] Reportes por período
- [ ] Reportes por persona
- [ ] Dashboard de cambios recientes
- [ ] Exportación Excel/PDF consolidada

---

## 5. CASOS DE USO

### 5.1 Registrar Ocasional para Q1 (1-15 abril)

```javascript
POST /api/nomina/ocasionales
{
  cedula: "1234567890",
  nombre: "Juan García",
  novedad: "Bono Productividad",
  tipo: "Bonus",
  cantidad: 1,
  valor: 500000,
  observaciones: "Cumplimiento de meta",
  periodo: "2026-04-Q1"
}
```

**Backend:**
1. Crea registro en NO_NOVED:
   - numeroNovedad = "2026-04-OCW-001"
   - estado = "Activo"
2. Crea registro en Ocasionales
   - novedadId = (referencia)
   - periodo = "2026-04-Q1"
3. Retorna ID de novedad

### 5.2 Modificar Fija

```javascript
PUT /api/nomina/fijas/{{id}}
{
  valor: 250000,  // Cambio de valor
  observaciones: "Reducción autorizada"
}
```

**Backend:**
1. Busca en Fijas por ID
2. Obtiene novedadId
3. Actualiza en Fijas
4. Actualiza en NO_NOVED
   - estado = "Modificado"
   - fechaActualizacion = now
5. Registra en UsuariosLog

### 5.3 Cancelar Ausencia

```javascript
DELETE /api/nomina/ausencias/{{id}}
{
  motivo: "Error de ingreso - período incorrecto"
}
```

**Backend:**
1. Busca en Ausencias por ID
2. Obtiene novedadId
3. Actualiza NO_NOVED
   - estado = "Cancelado"
   - motivoCancelacion = motivo
   - fechaCancelacion = now
4. Opcionalmente elimina de Ausencias
5. Registra en UsuariosLog

### 5.4 Obtener histórico de persona

```javascript
GET /api/nomina/historial?cedula=1234567890&periodo=2026-04
```

**Retorna:**
```json
{
  novedades: [
    {
      numeroNovedad: "2026-04-OCW-001",
      tipo: "Ocasional",
      subtipo: "Bono",
      valor: 500000,
      periodo: "2026-04-Q1",
      estado: "Activo",
      fechaRegistro: "2026-04-05"
    },
    {
      numeroNovedad: "2026-04-FIJ-001",
      tipo: "Fija",
      subtipo: "Descuento",
      valor: -50000,
      periodo: "2026-04-Q1",
      estado: "Modificado",
      fechaRegistro: "2026-04-03",
      fechaActualizacion: "2026-04-07"
    }
  ],
  totales: {
    ingresos: 500000,
    descuentos: 50000,
    neto: 450000
  }
}
```

---

## 6. VENTAJAS DEL MODELO

✅ **Histórico completo** - Todas las novedades en un lugar
✅ **Auditoría clara** - Quién cambió qué y cuándo
✅ **Reportes consolidados** - Vista 360° del empleado
✅ **Periodo específico** - Datos organizados por quincena
✅ **Soft delete** - No se pierden datos
✅ **Trazabilidad** - Rastrear cambios en el tiempo
✅ **Exportación fácil** - Reportes por período/persona
✅ **Escalable** - Agregar nuevas categorías sin romper estructura

---

## 7. PRÓXIMOS PASOS

1. **Ejecutar scripts SQL** (Fase 1)
2. **Actualizar nominaController.js** (Fase 2)
3. **Crear nuevos endpoints** (Fase 2)
4. **Actualizar interfaz HTML** (Fase 3)
5. **Pruebas de integración**
6. **Migración de datos históricos** (opcional)

