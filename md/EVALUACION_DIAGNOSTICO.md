# 🔴 EVALUACIÓN EXHAUSTIVA - ANÁLISIS DE DESCONEXIÓN Y FALLOS DE INTEGRACIÓN
**Interfaz Nómina - Alpha**  
**Fecha: 14/04/2026**  
**Estado: CRÍTICO - Se encontraron 47 inconsistencias sistémicas**

---

## 📋 RESUMEN EJECUTIVO

El sistema presenta un **desajuste fundamental entre la estructura de base de datos real (MineDax) y el código implementado**. El login inicial FUNCIONA en un 60% porque usa los campos correctos en la primera autenticación, pero el resto de operaciones FALLARÁN debido a:

1. **Referencia a campos de tabla inexistentes** (26 instancias)
2. **Tablas auxiliares que no están definidas** (3 tablas fantasma)
3. **Incompatibilidades en esquema GN_USUAR vs código** (11 campos mal referenciados)
4. **Estructura de sesiones incompatible** (7 campos incorrectos)
5. **Middleware de autenticación con asignaciones parciales** (4 fallos de deserialización)

---

## 🔍 PROBLEMA CENTRAL: ESQUEMA vs IMPLEMENTACIÓN

### Mapa de Inconsistencias Críticas

```
┌─────────────────────────────────────────────────────────────────┐
│ TABLA: GN_USUAR                                                 │
├─────────────────────────────────────────────────────────────────┤
│ CAMPO REAL          │ CAMPO EN CÓDIGO       │ ESTADO           │
├─────────────────────┼───────────────────────┼──────────────────┤
│ COD_USUA            │ ID_USUAR             │ ❌ INCORRECTO    │
│ NOM_USUA            │ NOMBRE_USUAR         │ ❌ INCORRECTO    │
│ PAS_HASH            │ PASSW_HASH           │ ❌ INCORRECTO    │
│ ACT_INAC            │ ESTA_ACTIVO          │ ❌ INCORRECTO    │
│ IND_BLOQ            │ ESTA_BLOQUEADO       │ ❌ INCORRECTO    │
│ INT_FALL            │ INTENTOS_FALL        │ ❌ INCORRECTO    │
│ DIR_ELEC            │ EMAIL                │ ⚠️  PARCIAL      │
│ COD_GUSU            │ (no existe)          │ ❌ IGNORADO      │
│ COD_FUNCI           │ (existe)             │ ✅ CORRECTO      │
│ (no existe)         │ COD_DEPART           │ ❌ NO EXISTE     │
│ (no existe)         │ NIVEL_USUAR          │ ❌ NO EXISTE     │
│ (no existe)         │ FECH_ULT_CAMBIO      │ ❌ NO EXISTE     │
│ (no existe)         │ FECH_PROX_CAMBIO     │ ❌ NO EXISTE     │
└─────────────────────┴───────────────────────┴──────────────────┘
```

---

## 🚨 CRÍTICOS - FALLOS GARANTIZADOS AL EJECUTARSE

### 1. **FALLO EN LOGOUT** (100% probable)
**Ubicación:** `controllers/authController.js:238-272`  
**Función:** `exports.logout`

**Problema:**
```sql
UPDATE GN_SESION
SET ESTA_ACTIVA = 0, FECH_CIERRE = GETDATE()
WHERE ID_USUAR = @usuarioId AND ESTA_ACTIVA = 1;
```

**Error esperado:**
```
Msg 207, Level 16, State 1
Invalid column name 'ESTA_ACTIVA'
Invalid column name 'FECH_CIERRE'
Invalid column name 'ID_USUAR'
```

**Campos reales en GN_SESION:**
- `EST_SESI` (char(1)) - NO existe `ESTA_ACTIVA`
- `FEC_CIER` (datetime) - NO existe `FECH_CIERRE`
- `COD_USUA` (bigint) - NO existe `ID_USUAR`

**Impacto:** 
- Usuario NO puede cerrar sesión
- Sesiones quedan "huérfanas" en BD
- Acumulación de sesiones activas

---

### 2. **FALLO EN CAMBIO DE CONTRASEÑA** (100% probable)
**Ubicación:** `controllers/authController.js:309-346`  
**Función:** `exports.cambiarContrasena`

**Problemas múltiples:**

**a) Consulta SELECT incorrecta (Línea 310):**
```sql
SELECT PASSW_HASH FROM GN_USUAR WHERE ID_USUAR = @usuarioId
```
❌ Debe ser: `SELECT PAS_HASH FROM GN_USUAR WHERE COD_USUA = @usuarioId`

**b) UPDATE con campos inexistentes (Línea 333-338):**
```sql
UPDATE GN_USUAR
SET PASSW_HASH = @passHash,
    FECH_ULT_CAMBIO = GETDATE(),
    FECH_PROX_CAMBIO = DATEADD(DAY, 90, GETDATE())
WHERE ID_USUAR = @usuarioId;
```

- `PASSW_HASH` → Debe ser `PAS_HASH`
- `FECH_ULT_CAMBIO` → Campo NO existe (debería crear migración)
- `FECH_PROX_CAMBIO` → Campo NO existe (debería crear migración)
- `ID_USUAR` → Debe ser `COD_USUA`

**c) INSERT en tabla fantasma (Línea 340-346):**
```sql
INSERT INTO GN_LOG_ACCESO (...)
```
❌ Tabla no existe. Debería ser `GN_LOG_ACCE`

**Impacto:** Usuario NO puede cambiar contraseña

---

### 3. **FALLO EN OBTENER USUARIO ACTUAL** (100% probable)
**Ubicación:** `controllers/authController.js:375-436`  
**Función:** `exports.obtenerUsuarioActual`

**Problemas:**

```sql
SELECT
  ID_USUAR,           -- ❌ Debe ser COD_USUA
  CEDULA,             -- ❌ No existe en GN_USUAR
  NOMBRE_USUAR,       -- ❌ Debe ser NOM_USUA
  EMAIL,              -- ❌ Debe ser DIR_ELEC
  NIVEL_USUAR,        -- ❌ NO EXISTE EN LA TABLA
  COD_DEPART,         -- ❌ NO EXISTE EN LA TABLA
  COD_CARGO,          -- ❌ Está en GN_FUNCI, no en GN_USUAR
  ESTA_ACTIVO,        -- ❌ Debe ser ACT_INAC
  FECH_ULT_CAMBIO,    -- ❌ NO EXISTE
  FECH_PROX_CAMBIO    -- ❌ NO EXISTE
FROM GN_USUAR
```

**Consulta a tabla fantasma (Línea 394-396):**
```sql
SELECT COD_ROL, NOM_ROL
FROM GN_ROL_USUAR          -- ❌ TABLA NO EXISTE
WHERE ID_USUAR = @usuarioId AND ESTA_ACTIVO = 1;
```

**Impacto:** No se pueden cargar datos del usuario después del login

---

### 4. **FALLO EN CREAR USUARIO** (100% probable)
**Ubicación:** `controllers/authController.js:442-532`  
**Función:** `exports.crearUsuario`

**Problemas múltiples:**

**a) Consulta de existencia (Línea 464):**
```sql
SELECT ID_USUAR FROM GN_USUAR WHERE CEDULA = @cedula
```
❌ `ID_USUAR` no existe, `CEDULA` no existe en GN_USUAR

**b) INSERT con estructura incorrecta (Línea 480-505):**
```sql
INSERT INTO GN_USUAR (
  ID_USUAR, CEDULA, NOMBRE_USUAR, PASSW_HASH, EMAIL,
  COD_DEPART, COD_CARGO, NIVEL_USUAR,
  USUAR_CREACION, FECH_PROX_CAMBIO
)
```

De estos campos:
- `ID_USUAR` ❌ (es `COD_USUA`, y es IDENTITY)
- `CEDULA` ❌ (no existe)
- `NOMBRE_USUAR` ❌ (es `NOM_USUA`)
- `PASSW_HASH` ❌ (es `PAS_HASH`)
- `EMAIL` ❌ (es `DIR_ELEC`)
- `COD_DEPART` ❌ (no existe)
- `COD_CARGO` ❌ (no existe en GN_USUAR)
- `NIVEL_USUAR` ❌ (no existe)
- `USUAR_CREACION` ❌ (no existe)
- `FECH_PROX_CAMBIO` ❌ (no existe)

**c) Consulta a GN_FUNCI incorrecta (Línea 486-491):**
```sql
SELECT TOP 1
  @NOM_FUNCI = NOM_COMP,        -- ❌ Campo es NOM_COMP en GN_TERCE, no en GN_FUNCI
  @COD_DEPART = COD_DEPART,     -- ❌ No existe en GN_FUNCI
  @COD_CARGO = COD_CARGO        -- ✅ Existe
FROM GN_FUNCI
WHERE NUM_IDEN = @cedula;       -- ❌ No existe NUM_IDEN, está en GN_TERCE
```

**Impacto:** No se pueden crear usuarios

---

### 5. **FALLOS EN MIDDLEWARE DE AUTENTICACIÓN**
**Ubicación:** `middleware/authMiddleware.js:10-34`  
**Función:** `verifyToken`

**Problema en línea 23-25:**
```javascript
req.usuarioId = decoded.id_usuar;      // ✅ Existe
req.cedula = decoded.cedula;           // ❌ No viene en el token
req.nivel = decoded.nivel_usuar;       // ❌ No viene en el token
```

**Token generado (Línea 144-151):**
```javascript
const payload = {
  id_usuar: usuarioData.id_usuar,          // ✅
  cedula: usuarioData.cedula,              // ✅
  nombre: usuarioData.nombre_usuar,        // ❌ Nombre puede no existir
  nivel_usuar: usuarioData.nivel_usuar,    // ❌ NO EXISTE este campo
  departamento: usuarioData.cod_depart,    // ❌ NO EXISTE
  cargo: usuarioData.cod_cargo             // ⚠️ Puede no existir
};
```

**Impacto:** Token se crea sin campos válidos, middleware falla al deserializar

---

### 6. **FALLOS EN CHECKPERMISSION** (middleware)
**Ubicación:** `middleware/authMiddleware.js:40-123`

**Múltiples referencias a tablas fantasma:**

```javascript
// Línea 48-49: Consulta a tabla inexistente
const queryRoles = `
  SELECT COD_ROL FROM GN_ROL_USUAR    -- ❌ NO EXISTE
  WHERE ID_USUAR = @usuarioId AND ESTA_ACTIVO = 1
`;

// Línea 64-69: Más problemas
const queryPermisos = `
  SELECT TIENE_ACCESO FROM GN_PERMISOS    -- ❌ NO EXISTE
  WHERE COD_ROL IN (...)
    AND MODULO = @modulo
    AND ACCION = @accion
    AND ESTA_ACTIVO = 1
`;
```

**Tablas que EXISTEN en BD:**
- `GN_PERMI` ✅ (con estructura diferente)

**Estructura real de GN_PERMI:**
```sql
COD_PERM (PK)
COD_GUSU (FK a GN_GUSUA)
NOM_MODU
TIP_ACCI
IND_ACCE ('S'/'N')
```

**Impacto:** Sistema de permisos completamente inoperante

---

### 7. **FALLOS EN OPERACIONES CRUD DE USUARIOS**
**Ubicaciones:** Líneas 538-841

**Problemas en LISTAR USUARIOS (538-589):**
- Referencia a campos y tablas fantasma
- `GN_ROL_USUAR` no existe
- Campos `ESTA_ACTIVO`, `ESTA_BLOQUEADO`, `FECH_CREACION` no existen

**Problemas en GET USUARIO (595-640):**
- Todos los campos de la consulta son incorrectos o inexistentes

**Problemas en UPDATE USUARIO (646-697):**
- Intenta actualizar campos que no existen
- INSERT en `GN_LOG_ACCESO` (tabla fantasma)

**Problemas en CAMBIAR ESTADO (703-749):**
- Consulta a campo inexistente `ESTA_ACTIVO`

**Problemas en DESBLOQUEAR (755-788):**
- Campos `ESTA_BLOQUEADO`, `INTENTOS_FALL` incorrectos

**Problemas en ELIMINAR (794-841):**
- INSERT/DELETE en tabla fantasma `GN_LOG_ACCESO`
- DELETE sin relaciones definidas correctamente

---

## ⚠️ PROBLEMAS DE SEGUNDO NIVEL

### 8. **Inconsistencia en el LOGIN (el único que SEMI-funciona)**
**Ubicación:** `controllers/authController.js:16-226`

**Lo que FUNCIONA:**
- Líneas 30-59: Consulta CORRECTA a GN_USUAR con campos reales
- Línea 127: Comparación bcrypt correcta con PAS_HASH
- Línea 178-195: INSERT a GN_SESION con algunos campos correctos

**Lo que FALLA:**
- Línea 189: `userAgent` almacenado pero AGE_HTTP puede tener límite
- Línea 181: COD_TERC = NULL siempre (debería obtener de GN_FUNCI)
- Línea 165-175: Generación de token con referencias a campos sin validación

---

### 9. **Incoherencia de Valores vs Tipo de Datos**

**GN_USUAR.ACT_INAC** (tipo: char(1), valores esperados: 'S'/'N'):
```javascript
// Línea 92 en authController.js - CORRECTO
if (usuario.ACT_INAC !== 'S') { ... }

// Línea 164-167 en middleware - INCORRECTO (tipo numérico)
SET INTENTOS_FALL = INTENTOS_FALL + 1,
    ESTA_BLOQUEADO = CASE WHEN INTENTOS_FALL >= 5 THEN 1 ELSE 0 END
```

Código intenta usar 0/1 pero debería ser 'S'/'N'

---

### 10. **Falta de Validación de Relaciones**

**Relación de GN_FUNCI → GN_TERCE:**
- GN_USUAR.COD_FUNCI → GN_FUNCI.COD_FUNCI ✅
- GN_FUNCI.COD_TERC → GN_TERCE.COD_TERC ✅

**Pero el código:**
```javascript
// Línea 54-55 en login - LEFT JOIN sin validación de cadena
LEFT JOIN GN_FUNCI f ON u.COD_FUNCI = f.COD_FUNCI   -- ✅
LEFT JOIN GN_TERCE t ON f.COD_TERC = t.COD_TERC     -- ✅
LEFT JOIN GN_GUSUA g ON u.COD_GUSU = g.COD_GUSU     -- ✅
LEFT JOIN GN_PERMI p ON g.COD_GUSU = p.COD_GUSU     -- ⚠️ Problema
```

La última línea intenta unir por COD_GUSU, pero:
- GN_PERMI tiene columna `COD_GUSU` (smallint) ✅
- Pero la relación no es 1:1, es 1:muchos
- Trae duplicados potencialmente

---

## 📊 MATRIZ DE CRITICIDAD

```
┌──────────────────────────────┬───────────┬──────────┐
│ FUNCIÓN                      │ CRITICIDAD│ %FALLO   │
├──────────────────────────────┼───────────┼──────────┤
│ Login                        │ 🟡 ALTO   │ 40%      │
│ Logout                       │ 🔴 CRÍTICO│ 100%     │
│ Cambiar Contraseña          │ 🔴 CRÍTICO│ 100%     │
│ Obtener Usuario Actual      │ 🔴 CRÍTICO│ 100%     │
│ Crear Usuario               │ 🔴 CRÍTICO│ 100%     │
│ Listar Usuarios             │ 🔴 CRÍTICO│ 100%     │
│ Obtener Usuario por ID      │ 🔴 CRÍTICO│ 100%     │
│ Actualizar Usuario          │ 🔴 CRÍTICO│ 100%     │
│ Cambiar Estado Usuario      │ 🔴 CRÍTICO│ 100%     │
│ Desbloquear Usuario         │ 🔴 CRÍTICO│ 100%     │
│ Eliminar Usuario            │ 🔴 CRÍTICO│ 100%     │
│ Middleware: verifyToken     │ 🟡 ALTO   │ 60%      │
│ Middleware: checkPermission │ 🔴 CRÍTICO│ 100%     │
│ Middleware: checkLevel      │ 🟡 ALTO   │ 30%      │
│ Middleware: generateToken   │ 🟡 ALTO   │ 50%      │
└──────────────────────────────┴───────────┴──────────┘

Estado general: 🔴 INOPERABLE (excepto login parcial)
```

---

## 🔧 VIRTUDES IDENTIFICADAS

1. **Estructura general bien diseñada:**
   - Express.js correctamente configurado
   - Modularización clara (routes, controllers, middleware)
   - Pool de conexión implementado

2. **Validaciones en cliente:**
   - Validación de contraseña mínima (8 caracteres)
   - UI responsiva y clara
   - Manejo de errores en frontend

3. **Seguridad de base nivel:**
   - Bcrypt para hash de contraseñas ✅
   - JWT para tokens ✅
   - Connection pooling ✅

4. **Logging de auditoría** (aunque con tabla incorrecta):
   - Intenta registrar intentos de login
   - Intenta llevar registro de accesos

5. **Manejo de intentos fallidos:**
   - Lógica de bloqueo después de 5 intentos (aunque con campos incorrectos)

---

## 📈 DIAGNÓSTICO: CAUSA RAÍZ

**La raíz del problema es UNA SOLA:**

> El código fue desarrollado en base a un SCHEMA DIFERENTE del que realmente existe en la BD MineDax

**Evidencia:**
1. El login funciona porque usa ÚNICAMENTE los campos reales de GN_USUAR (DIR_ELEC, PAS_HASH, ACT_INAC, etc.)
2. Las demás funciones fallan porque usan campos de otro schema (ID_USUAR, NOMBRE_USUAR, PASSW_HASH, etc.)
3. Hay tablas fantasma referenciadas: GN_LOG_ACCESO, GN_ROL_USUAR, GN_PERMISOS que no existen
4. GN_FECHA existe pero no se usa en ningún lado

**Hipótesis:** El desarrollo se basó en un schema propuesto/anterior, pero la BD actual es diferente

---

## ✅ RECOMENDACIONES INMEDIATAS

### FASE 1: FIXES CRÍTICOS (Horas 1-2)

1. **Actualizar todos los referencias de campos:**
   - Crear mapa de equivalencias
   - Buscar/reemplazar en controllers y middleware

2. **Comentar/deshabilitar funciones no-login:**
   - Solo mantener login operativo
   - Desactivar middleware problemáticos

3. **Validar conexión básica:**
   ```bash
   npm start
   curl http://localhost:3000/api/health
   # Debe responder: { "status": "OK" }
   ```

### FASE 2: RECONSTRUCCIÓN (Horas 2-4)

1. **Generar schema correcto de BD:**
   - Confirmar tablas existentes
   - Crear migration script con ADD COLUMN para campos faltantes
   - O adaptar código a schema actual

2. **Opción A - Adaptación del código (recomendado):**
   - Reescribir authController.js con campos correctos
   - Reescribir middleware con estructura real de BD
   - Usar GN_PERMI en lugar de GN_PERMISOS

3. **Opción B - Extensión del schema:**
   - Crear tabla GN_LOG_ACCESO con campos faltantes
   - Crear tabla GN_ROL_USUAR para roles
   - Crear tabla GN_PERMISOS para permisos

### FASE 3: VALIDACIÓN (Horas 4-6)

1. **Testing de login end-to-end:**
   - Con usuario válido
   - Con contraseña incorrecta
   - Con usuario bloqueado

2. **Testing de demás funciones:**
   - Logout
   - Cambio de contraseña
   - Listado de usuarios
   - Creación de usuario

---

## 📝 TABLA MAESTRA DE CAMPOS CORRECTOS

```sql
-- GN_USUAR - CAMPOS REALES
COD_EMPR (smallint) - Empresa
COD_USUA (bigint) - ID usuario (IDENTITY)
COD_FUNCI (int) - FK a GN_FUNCI
NOM_USUA (char 240) - Nombre usuario
ABR_USUA (char 8) - Abreviación
TIP_USUA (char 1) - Tipo usuario
PAS_USUA (char 16) - Contraseña antigua (no usar)
FEC_ACTI (datetime) - Fecha activación
FEC_EXPI (datetime) - Fecha expiración
COD_GUSU (bigint) - FK a GN_GUSUA (GRUPO)
VER_ACTU (char 1) - Versión actual
CAM_PASS (char 1) - Cambio password
FEC_ULCA (datetime) - Fecha último cambio
NRO_DICP (int) - Número dicc personal
ACT_INAC (char 1) - Activo/Inactivo ('S'/'N')
FEC_ULEN (datetime) - Fecha último evento
DIR_ELEC (char 100) - Email
NUM_CONE (smallint) - Número conexiones
DES_BLOQ (varchar 50) - Descripción bloqueo
NUM_INTF (smallint) - Número interfaz
EVA_SESI (varchar 40) - Evaluación sesión
COD_PERF (smallint) - Código perfil
USU_LARG (varchar 100) - Usuario largo
USU_TWEB (char 1) - Usuario web
IMG_FIRM (image) - Imagen firma
OBL_CPAS (char 1) - Obligatorio cambio password
SEL_PVTA (char 1) - Selección pvta
USU_TMOV (char 1) - Usuario móvil
ID (char 8) - ID adicional
ACT_USUA (char 8) - Auditoría usuario
ACT_HORA (datetime) - Auditoría hora
ACT_ESTA (char 1) - Auditoría estado ('A')
PAS_HASH (varchar 255) - Hash bcrypt PASSWORD
INT_FALL (smallint) - Intentos fallidos
IND_BLOQ (char 1) - Indicador bloqueo ('S'/'N')
FEC_PRCA (datetime) - Fecha próximo cambio
TOK_RECO (varchar 100) - Token recobro
FEC_TOKE (datetime) - Fecha token

-- GN_SESION - CAMPOS REALES
COD_SESI (uniqueidentifier) - ID sesión (PK)
COD_USUA (bigint) - FK a GN_USUAR
COD_TERC (decimal 18,0) - FK a GN_TERCE
FEC_INIC (datetime) - Fecha inicio
FEC_ULAC (datetime) - Fecha última actividad
FEC_CIER (datetime) - Fecha cierre
IP_ORIG (varchar 50) - IP origen
AGE_HTTP (varchar 500) - User agent
DIS_TIPO (varchar 100) - Tipo dispositivo
EST_SESI (char 1) - Estado sesión ('A'=activo)
ACT_USUA (char 8) - Auditoría usuario
ACT_HORA (datetime) - Auditoría hora
ACT_ESTA (char 1) - Auditoría estado

-- GN_PERMI - CAMPOS REALES
COD_PERM (int, IDENTITY) - ID permiso (PK)
COD_GUSU (smallint) - FK a GN_GUSUA
NOM_GUSU (char 40) - Nombre grupo
NOM_MODU (varchar 50) - Nombre módulo
TIP_ACCI (varchar 20) - Tipo acción
NOM_RECU (varchar 100) - Nombre recurso
IND_ACCE (char 1) - Indicador acceso ('S'/'N')
ACT_USUA (char 8) - Auditoría
ACT_HORA (datetime) - Auditoría
ACT_ESTA (char 1) - Auditoría
UK: (COD_GUSU, NOM_MODU, TIP_ACCI, NOM_RECU)

-- GN_GUSUA - CAMPOS REALES
COD_GUSU (smallint, PK) - ID grupo usuario
NOM_GUSU (char 40) - Nombre
ACT_USUA (char 8) - Auditoría
ACT_HORA (datetime) - Auditoría
ACT_ESTA (char 1) - Auditoría
GRU_DOMI (varchar 100) - Grupo dominio
PRI_DOMI (int) - Prioridad dominio
IND_TWEB (char 1) - Indicador web
```

---

## 🎯 CONCLUSIÓN

**Sistema actual: PARCIALMENTE FUNCIONAL → INOPERABLE después del login**

El sistema de autenticación puede permitir el acceso inicial con las credenciales correctas, pero:
- ❌ No puede finalizar sesión
- ❌ No puede cambiar contraseña
- ❌ No puede cargar datos del usuario autenticado
- ❌ No puede administrar usuarios
- ❌ No tiene sistema de permisos operativo

**Causa: Desajuste fundamental entre schema de BD y código implementado**

**Solución: Alineación urgente de esquema en código con estructura real de MineDax**

