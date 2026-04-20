# 📋 Resumen de Cambios - 2026-04-14

## 🎯 Objetivo
Resolver el problema donde el login falla incluso con credenciales correctas, aunque el registro de usuario funciona correctamente.

## 🔧 Cambios Implementados

### 1️⃣ Corrección de COD_FUNCI en Registro (CRÍTICO)

**Archivo:** `controllers/authController.js` líneas 1020-1062

**Problema:** COD_FUNCI se insertaba como NULL, lo que causaba que los JOINs fallaran en login.

**Solución:**
```javascript
// ✅ CRÍTICO: Obtener COD_FUNCI desde GN_FUNCI usando COD_TERC
const obtenerFuncionQuery = `
  SELECT TOP 1 COD_FUNCI
  FROM GN_FUNCI
  WHERE COD_TERC = @codTerc AND COD_EMPR = 1
`;

const funcionResult = await executeQuery(obtenerFuncionQuery, { codTerc: tercero.COD_TERC });

let codFunci = null;
if (funcionResult && funcionResult.recordset && funcionResult.recordset.length > 0) {
  codFunci = funcionResult.recordset[0].COD_FUNCI;
}
```

**Impacto:** Ahora los usuarios se crean con COD_FUNCI válido, permitiendo que el LOGIN pueda hacer JOINs correctamente.

---

### 2️⃣ Asignación de COD_GUSU en Registro

**Archivo:** `controllers/authController.js` líneas 1041-1050

**Cambio:** Agregado `COD_GUSU = 2` al INSERT (grupo estándar para usuarios nuevos)

**Antes:**
```javascript
INSERT INTO GN_USUAR (
  COD_EMPR, NOM_USUA, DIR_ELEC, PAS_HASH, ACT_INAC, IND_BLOQ,
  INT_FALL, COD_FUNCI, ACT_USUA, ACT_HORA, ACT_ESTA, FEC_ULCA
)
VALUES (
  1, @nombre, @email, @pasHash, 'S', 'N', 0, @codFunci,  ← Falta COD_GUSU
  'SISTEMA', GETDATE(), 'A', GETDATE()
)
```

**Después:**
```javascript
INSERT INTO GN_USUAR (
  COD_EMPR, NOM_USUA, DIR_ELEC, PAS_HASH, ACT_INAC, IND_BLOQ,
  INT_FALL, COD_FUNCI, COD_GUSU, ACT_USUA, ACT_HORA, ACT_ESTA, FEC_ULCA
)
VALUES (
  1, @nombre, @email, @pasHash, 'S', 'N', 0, @codFunci, 2,  ← ✅ COD_GUSU=2
  'SISTEMA', GETDATE(), 'A', GETDATE()
)
```

**Impacto:** Los usuarios nuevos se asignan automáticamente al grupo 2, permitiendo que tengan permisos.

---

### 3️⃣ Manejo Seguro de NULL en registrarIntento

**Archivo:** `controllers/authController.js` líneas 933-954

**Problema:** Intentaba insertar COD_USUA=NULL en GN_LOG_ACCE, violando FK constraints.

**Solución:**
```javascript
async function registrarIntento(codUsuario, email, tipoEvento, estado, descripcion, ip) {
  try {
    // ✅ CRÍTICO: Solo registrar si hay un usuario válido (FK constraint)
    if (!codUsuario) {
      console.log(`[AUDITORÍA] Intento de ${tipoEvento} para ${email}: ${estado}`);
      return;  ← No insertar si codUsuario es null
    }

    const query = `
      INSERT INTO GN_LOG_ACCE (
        COD_USUA, TIP_EVEN, EST_EVEN, DES_EVEN, IP_ORIG, FEC_EVEN
      )
      VALUES (
        @codUsuario, @tipoEvento, @estado, @descripcion, @ip, GETDATE()
      )
    `;
    // ...
  }
}
```

**Impacto:** Previene errores de FK constraint que podrían estar silenciando el problema real.

---

### 4️⃣ Mejora del Login con Query de Diagnóstico

**Archivo:** `controllers/authController.js` líneas 29-92

**Cambio:** Agregada query de diagnóstico sin JOINs + JOINs mejorados

**Nueva Query de Diagnóstico:**
```sql
SELECT TOP 1
  u.COD_USUA, u.COD_EMPR, u.NOM_USUA, u.DIR_ELEC, u.PAS_HASH,
  u.ACT_INAC, u.IND_BLOQ, u.INT_FALL, u.COD_FUNCI, u.COD_GUSU
FROM GN_USUAR u
WHERE RTRIM(LTRIM(u.DIR_ELEC)) = RTRIM(LTRIM(@email))
```

**Mejoras en Query Principal:**
- Agregado: `RTRIM(LTRIM(u.DIR_ELEC))` para manejar espacios en CHAR(100)
- Agregado: `AND f.COD_EMPR = u.COD_EMPR` en JOIN con GN_FUNCI
- Agregado: `AND t.COD_EMPR = u.COD_EMPR` en JOIN con GN_TERCE
- Removido: LEFT JOIN a GN_PERMI (problemático)

**Logs de Diagnóstico Agregados:**
```
[LOGIN] ✓ Usuario encontrado: [NOM_USUA] (COD_USUA: [número])
[LOGIN] Estado: ACT_INAC=[S/N], IND_BLOQ=[S/N], PAS_HASH=[***SET*** o NULL]
```

**Impacto:** Permite identificar exactamente en qué paso falla el login.

---

### 5️⃣ Actualización de Token en Registro

**Archivo:** `controllers/authController.js` líneas 1115-1124

**Cambio:** Agregado `cod_funci` y `grupo` al token generado

**Antes:**
```javascript
const token = generateToken({
  cod_usua: nuevoCodigoUsuario,
  cod_empr: 1,
  email,
  nombre: tercero.NOM_COMP,
  cedula: null,
  cod_gusu: 2  ← Falta cod_funci
});
```

**Después:**
```javascript
const token = generateToken({
  cod_usua: nuevoCodigoUsuario,
  cod_empr: 1,
  email,
  nombre: tercero.NOM_COMP,
  cedula: null,
  cod_funci: codFunci,   ← ✅ AGREGADO
  cod_gusu: 2,
  grupo: 'Usuario'       ← ✅ AGREGADO
});
```

**Impacto:** El token contiene todos los datos necesarios para autorización.

---

## 📊 Resumen de Correcciones

| # | Problema | Solución | Líneas | Status |
|---|----------|----------|--------|--------|
| 1 | COD_FUNCI era NULL | Buscar en GN_FUNCI | 1020-1062 | ✅ CRÍTICO |
| 2 | COD_GUSU no asignado | Insertar COD_GUSU=2 | 1041-1050 | ✅ CRÍTICO |
| 3 | FK violations en auditoría | NULL check en registrarIntento | 933-954 | ✅ CRÍTICO |
| 4 | JOINs sin diagnóstico | Query diagnóstica sin JOINs | 29-92 | ✅ MAYOR |
| 5 | Espacios en CHAR(100) | RTRIM(LTRIM()) en WHERE | 29-92 | ✅ MAYOR |
| 6 | JOINs incorrectos | Agregar COD_EMPR a JOINs | 29-92 | ✅ MAYOR |
| 7 | Token incompleto | Agregar cod_funci y grupo | 1115-1124 | ✅ MENOR |

---

## 🧪 Cómo Probar

### Paso 1: Reinicia el servidor
```bash
npm start
```

Deberías ver:
```
✓ Servidor ejecutándose en http://localhost:3000
✓ Conectado a SQL Server: MineDax
```

### Paso 2: Registra un usuario
```bash
curl -X POST http://localhost:3000/api/auth/registro \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@empresa.com",
    "contrasena": "TestPass123",
    "contrasena_confirmacion": "TestPass123"
  }'
```

Expected:
```json
{
  "status": "success",
  "message": "Cuenta creada exitosamente. Bienvenido!",
  "token": "eyJhbGciOiJIUzI1...",
  "usuario": {
    "id": 123,
    "nombre": "Nombre",
    "email": "test@empresa.com"
  }
}
```

### Paso 3: Intenta login
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "cedula_o_email": "test@empresa.com",
    "contrasena": "TestPass123"
  }'
```

Expected:
```json
{
  "status": "success",
  "message": "Login exitoso",
  "token": "eyJhbGciOiJIUzI1...",
  "usuario": {
    "id": 123,
    "empresa": 1,
    "email": "test@empresa.com",
    "nombre": "Nombre",
    "cedula": 1234567890,
    "cargo": 5,
    "grupo": "Usuario"
  }
}
```

### Paso 4: Revisa los logs en consola del servidor

Busca mensajes como:
```
[REGISTRO] ✓ Usuario creado: test@empresa.com (ID: 123)
[LOGIN] ✓ Usuario encontrado: Nombre (COD_USUA: 123)
[LOGIN] Estado: ACT_INAC=S, IND_BLOQ=N, PAS_HASH=***SET***
[LOGIN] ✓ test@empresa.com (Nombre) autenticado exitosamente
```

---

## 🚨 Si Aún Falla

Reporta:
1. El mensaje de error exacto del login
2. Qué ves en los logs del servidor (copiar el mensaje [LOGIN] completo)
3. Cuál de estos escenarios aplica:
   - [ ] "Usuario no encontrado"
   - [ ] "Usuario sin contraseña válida"
   - [ ] "Usuario inactivo"
   - [ ] "Otro error" (especificar)

Con esa información podré hacer más correcciones específicas.

---

## 📁 Documentos Generados Hoy

- ✅ `CORRECCION_LOGIN_FALLIDO.md` - Detalles de las correcciones
- ✅ `DIAGNOSTICO_LOGIN.md` - Guía de diagnóstico  
- ✅ `CAMBIOS_HOY_2026_04_14.md` - Este documento

---

**Fecha:** 2026-04-14 15:30 UTC-5
**Cambios:** 7 correcciones implementadas
**Archivos Modificados:** `controllers/authController.js`
**Status:** ✅ Listo para probar
