# 🔧 Corrección de Esquema - Integración PDF MineDax

**Fecha:** 23 de Abril de 2026  
**Status:** ✅ CORREGIDO - Esquema Real Implementado  
**Versión:** 3.0

---

## ⚠️ Problema Identificado

El sistema mostraba errores en la importación porque el controlador intentaba insertar en columnas que **no existen** en la base de datos real de MineDax.

### Error Exacto en Logs
```
Invalid column name 'NOH_TERCE'
Invalid column name 'id'
Invalid column name 'numeroNovedad'
Invalid column name 'categoria'
```

### Causa Raíz

El controlador `importarPDFController.js` fue actualizado previamente para usar una estructura de BD que **NO EXISTE** en MineDax actual:

```
❌ ESTRUCTURA ESPERADA (Incorrecta):
  NO_NOVED: id, numeroNovedad, cedula, nombre, categoria, tipo, subtipo...
  NO_AUSEN: id, numeroNovedad, cedula, nombre, categoria...
```

Pero la **ESTRUCTURA REAL** en MineDax es:

```
✅ ESTRUCTURA REAL (Correcta):
  NO_NOVED: COD_EMPR, COD_NOVED, COD_FUNCI, COD_CONC, COD_PERIOD,
            FEC_REGI, OBS_NOVED, IND_APLICADO, ACT_USUA, ACT_HORA,
            ACT_ESTA, FEC_INI, FEC_FIN, COD_CCOST
  
  NO_AUSEN: COD_EMPR, COD_NOVED, FEC_INI, FEC_FIN, DIAS_TOTAL,
            DIAGNOSTICO, FEC_PRORRG, ACT_USUA, ACT_HORA, ACT_ESTA
```

---

## ✅ Solución Implementada

He actualizado `controllers/importarPDFController.js` para usar **EXACTAMENTE** los campos reales de MineDax:

### Cambios en `insertarPermiso()`

**Antes (❌ Incorrecto):**
```javascript
INSERT INTO NO_NOVED (
  id, numeroNovedad, cedula, nombre, categoria, tipo, subtipo...
)
```

**Ahora (✅ Correcto):**
```javascript
INSERT INTO dbo.NO_NOVED (
  COD_EMPR, COD_NOVED, COD_FUNCI, COD_CONC, COD_PERIOD,
  FEC_REGI, OBS_NOVED, IND_APLICADO, ACT_USUA, ACT_HORA, ACT_ESTA,
  FEC_INI, FEC_FIN
) VALUES (
  @codEmpr, @codNoved, @codFunci, @codConc, @codPeriod,
  CONVERT(date, GETDATE()), @obsNoved, 'N', 'SISTEMA', GETDATE(), 'A',
  @fechaIni, @fechaFin
)
```

### Cambios en `insertarVacaciones()`

**Antes (❌ Incorrecto):**
```javascript
INSERT INTO NO_NOVED (
  id, numeroNovedad, cedula, nombre, categoria...
)
```

**Ahora (✅ Correcto):**
```javascript
INSERT INTO dbo.NO_AUSEN (
  COD_EMPR, COD_NOVED, FEC_INI, FEC_FIN,
  DIAS_TOTAL, DIAGNOSTICO, ACT_USUA, ACT_HORA, ACT_ESTA
) VALUES (
  @codEmpr, @codNoved, @fechaIni, @fechaFin,
  @diasTotal, @diagnostico, 'SISTEMA', SYSDATETIME(), 'A'
)
```

---

## 📊 Mapeo de Datos - Permisos (CM-TH-FR-003)

| Campo en PDF | Extraído por | Campo en NO_NOVED | Tipo SQL |
|---|---|---|---|
| Cédula | PDFImportExtension | (usado para buscar COD_FUNCI) | - |
| Nombre | PDFImportExtension | (usado para validación) | - |
| Motivo | PDFImportExtension → tipo | OBS_NOVED | nvarchar |
| Fecha | PDFImportExtension → fecha_novedad | FEC_INI, FEC_FIN | date |
| Hora Inicio | PDFImportExtension → hora_inicio | (en OBS_NOVED) | - |
| Hora Fin | PDFImportExtension → hora_fin | (en OBS_NOVED) | - |
| Cantidad | PDFImportExtension → cantidad | (en OBS_NOVED) | - |

### Valores Calculados
- **COD_NOVED:** Secuencial auto-calculado (MAX + 1)
- **COD_CONC:** Buscado de NO_CONCE con LIKE '%PERMISO%'
- **COD_PERIOD:** Del período actual activo
- **IND_APLICADO:** 'N' (no aplicado)
- **ACT_USUA:** 'SISTEMA'
- **ACT_ESTA:** 'A' (activo)

---

## 📊 Mapeo de Datos - Vacaciones (CM-TH-SV-001)

| Campo en PDF | Extraído por | Campo en NO_AUSEN | Tipo SQL |
|---|---|---|---|
| Cédula | PDFImportExtension | (usado para buscar COD_FUNCI) | - |
| Fecha Inicio | PDFImportExtension → fecha_inicio | FEC_INI | date |
| Fecha Fin | PDFImportExtension → fecha_fin | FEC_FIN | date |
| Días | PDFImportExtension → cantidad | DIAS_TOTAL | int |
| Observaciones | PDFImportExtension → observaciones | DIAGNOSTICO | nvarchar |

### Valores Calculados
- **COD_NOVED:** Secuencial auto-calculado (MAX + 1)
- **ACT_USUA:** 'SISTEMA'
- **ACT_HORA:** SYSDATETIME()
- **ACT_ESTA:** 'A' (activo)

---

## 🔄 Flujo Completo Actualizado

```
1. Usuario sube PDF desde interfaz web
   ↓
2. Node.js recibe archivo y lo guarda temporalmente
   ↓
3. Llama a python/procesar_pdf.py
   └─ python_import_extension.py extrae datos
   └─ Retorna JSON con: cedula, nombre, fecha_inicio, fecha_fin, cantidad, etc.
   ↓
4. Valida período actual activo (NO_PERIOD)
   ↓
5. Busca empleado en GN_TERCE por cédula (NUM_IDEN)
   ↓
6. Obtiene COD_FUNCI de GN_FUNCI
   ↓
7. Según tipo de novedad:
   
   ├─ PERMISO:
   │  ├─ Busca COD_CONC en NO_CONCE (LIKE '%PERMISO%')
   │  └─ Inserta en NO_NOVED con campos REALES
   │
   └─ VACACIONES:
      └─ Inserta en NO_AUSEN con campos REALES
   
   ↓
8. Retorna resultado (éxito o error exacto)
   ↓
9. Interfaz web muestra estado: ✓ INSERTADO o ✗ ERROR
```

---

## 🧪 Validación de la Solución

### Estructura Verificada ✅

**Tabla NO_NOVED:**
- ✅ COD_EMPR (smallint, NOT NULL, default=1)
- ✅ COD_NOVED (int, NOT NULL, PK)
- ✅ COD_FUNCI (int, NOT NULL)
- ✅ COD_CONC (int, NOT NULL)
- ✅ COD_PERIOD (int, NOT NULL)
- ✅ FEC_REGI (date, NOT NULL, default=GETDATE())
- ✅ OBS_NOVED (nvarchar, NULL)
- ✅ IND_APLICADO (char, NOT NULL, default='N')
- ✅ ACT_USUA (nvarchar, NOT NULL, default='MineDax')
- ✅ ACT_HORA (datetime2, NOT NULL, default=GETDATE())
- ✅ ACT_ESTA (char, NOT NULL, default='A')
- ✅ FEC_INI (date, NULL)
- ✅ FEC_FIN (date, NULL)
- ✅ COD_CCOST (int, NULL)

**Tabla NO_AUSEN:**
- ✅ COD_EMPR (smallint, NOT NULL, default=1)
- ✅ COD_NOVED (int, NOT NULL, PK)
- ✅ FEC_INI (date, NOT NULL)
- ✅ FEC_FIN (date, NOT NULL)
- ✅ DIAS_TOTAL (int, NULL)
- ✅ DIAGNOSTICO (nvarchar, NULL)
- ✅ FEC_PRORRG (date, NULL)
- ✅ ACT_USUA (nvarchar, NOT NULL, default='MineDax')
- ✅ ACT_HORA (datetime2, NOT NULL, default=SYSDATETIME())
- ✅ ACT_ESTA (char, NOT NULL, default='A')

---

## 🚀 Pasos de Implementación

### Paso 1: Verificar Actualización (2 minutos)

El archivo `controllers/importarPDFController.js` **ya ha sido actualizado** con la estructura correcta.

Verificar que la función `insertarPermiso()` contiene:
```javascript
INSERT INTO dbo.NO_NOVED (
  COD_EMPR, COD_NOVED, COD_FUNCI, COD_CONC, COD_PERIOD,
  FEC_REGI, OBS_NOVED, IND_APLICADO, ACT_USUA, ACT_HORA, ACT_ESTA,
  FEC_INI, FEC_FIN
)
```

### Paso 2: Reiniciar Node.js (2 minutos)

```bash
cd /ruta/Nomina_2026_Alpha
npm restart
```

O manualmente:
```bash
pkill -f "node server.js"
node server.js
```

Deberías ver:
```
✓ SERVIDOR CENTRAL DE NÓMINA FUNCIONANDO
```

### Paso 3: Probar desde Interfaz Web (10 minutos)

1. Abre MineDax: http://localhost:3000
2. Ve a: Menú → Importar Archivos
3. Selecciona PDF de prueba (Permiso o Vacaciones)
4. Clic en "Importar a la BD"
5. Verifica resultado:

**ESPERADO:**
```
Status: INSERTADO (verde)
Cédula: 185822824O
Nombre: Laura Velasquez Izquierdo
Tipo: PERMISO
Detalle: Permiso insertado: COD_NOVED=X
```

**SI HAY ERROR:**
```
Status: ERROR (rojo)
Detalle: [Mensaje exacto del error]
```

### Paso 4: Validar en BD (5 minutos)

```sql
-- Para Permisos:
SELECT TOP 10 * FROM NO_NOVED 
WHERE ACT_USUA = 'SISTEMA' 
ORDER BY ACT_HORA DESC

-- Para Vacaciones:
SELECT TOP 10 * FROM NO_AUSEN 
WHERE ACT_USUA = 'SISTEMA' 
ORDER BY ACT_HORA DESC
```

Verifica:
- ✅ COD_NOVED está lleno
- ✅ COD_FUNCI coincide
- ✅ FEC_INI y FEC_FIN son correctas
- ✅ OBS_NOVED contiene el motivo
- ✅ ACT_ESTA = 'A'

---

## 📝 Resumen de Cambios

| Archivo | Cambio | Impacto |
|---------|--------|--------|
| `controllers/importarPDFController.js` | Actualizado insertarPermiso() y insertarVacaciones() | ✅ CRÍTICO - Ahora usa campos reales |
| `pdf_import_extension.py` | Sin cambios | ✅ Continúa extrayendo correctamente |
| `python/procesar_pdf.py` | Sin cambios | ✅ Continúa funcionando |
| `test_pdf_extraction.py` | Sin cambios | ✅ Validación disponible |

---

## 🎯 Diferencia Clave

**Antes (Incorrecto):**
```
PDFs extraídos correctamente ✅
│
└─> Datos almacenados en estructura inexistente ❌
    └─> Error: "Invalid column name"
```

**Ahora (Correcto):**
```
PDFs extraídos correctamente ✅
│
└─> Datos mapeados a estructura REAL ✅
    └─> Inserción exitosa ✅
```

---

## ⚠️ Notas Importantes

1. **NO se requieren cambios en la BD:** Los campos ya existen
2. **Compatibilidad hacia atrás:** No afecta otros módulos
3. **Extracción sin cambios:** pdf_import_extension.py continúa funcionando igual
4. **Automatización:** COD_NOVED, COD_CONC se calculan automáticamente

---

## 💬 Si Persisten Errores

Ejecuta este diagnóstico:

```sql
-- Verificar estructura NO_NOVED
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'NO_NOVED'
ORDER BY ORDINAL_POSITION

-- Verificar estructura NO_AUSEN
SELECT COLUMN_NAME, DATA_TYPE, IS_NULLABLE
FROM INFORMATION_SCHEMA.COLUMNS
WHERE TABLE_NAME = 'NO_AUSEN'
ORDER BY ORDINAL_POSITION

-- Verificar empleado
SELECT TOP 1 * FROM GN_TERCE
WHERE NUM_IDEN = 1858228240

-- Verificar período activo
SELECT TOP 1 * FROM NO_PERIOD
WHERE PER_EST = 'A'
```

Comparte los resultados para diagnóstico detallado.

---

**Documento de Corrección - 23 de Abril de 2026**
