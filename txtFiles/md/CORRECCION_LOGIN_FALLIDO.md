# 🔧 CORRECCIÓN: Login Fallido - Asignación de COD_FUNCI

## Problema Identificado

El login estaba fallido incluso con credenciales correctas porque:

1. **COD_FUNCI era NULL** durante el registro - El usuario se creaba sin estar vinculado a un registro de empleado en GN_FUNCI
2. **Validación de FK en GN_LOG_ACCE** - registrarIntento intentaba insertar COD_USUA=NULL cuando usuario no existe, violando FK constraints

## Cambios Implementados

### 1️⃣ Asignación correcta de COD_FUNCI en registro()

**ANTES:**
```javascript
const crearUsuarioQuery = `
  INSERT INTO GN_USUAR (
    COD_EMPR, NOM_USUA, DIR_ELEC, PAS_HASH, ACT_INAC, IND_BLOQ,
    INT_FALL, COD_FUNCI, ACT_USUA, ACT_HORA, ACT_ESTA, FEC_ULCA
  )
  VALUES (
    1, @nombre, @email, @pasHash, 'S', 'N', 0, NULL,  ← NULL!
    'SISTEMA', GETDATE(), 'A', GETDATE()
  );
`;
```

**DESPUÉS:**
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

// ... después insertar con codFunci
VALUES (
  1, @nombre, @email, @pasHash, 'S', 'N', 0, @codFunci, 2,  ← ✅ COD_FUNCI válido
  'SISTEMA', GETDATE(), 'A', GETDATE()
);
```

### 2️⃣ Asignación de COD_GUSU (Grupo) durante registro

**ANTES:**
```javascript
VALUES (
  1, @nombre, @email, @pasHash, 'S', 'N', 0, NULL,
  'SISTEMA', GETDATE(), 'A', GETDATE()
);
```

**DESPUÉS:**
```javascript
INSERT INTO GN_USUAR (
  COD_EMPR, NOM_USUA, DIR_ELEC, PAS_HASH, ACT_INAC, IND_BLOQ,
  INT_FALL, COD_FUNCI, COD_GUSU, ACT_USUA, ACT_HORA, ACT_ESTA, FEC_ULCA
)
VALUES (
  1, @nombre, @email, @pasHash, 'S', 'N', 0, @codFunci, 2,  ← ✅ Grupo 2 por defecto
  'SISTEMA', GETDATE(), 'A', GETDATE()
);
```

### 3️⃣ Actualización del token en registro

**ANTES:**
```javascript
const token = generateToken({
  cod_usua: nuevoCodigoUsuario,
  cod_empr: 1,
  email,
  nombre: tercero.NOM_COMP,
  cedula: null,
  cod_gusu: 2
});
```

**DESPUÉS:**
```javascript
const token = generateToken({
  cod_usua: nuevoCodigoUsuario,
  cod_empr: 1,
  email,
  nombre: tercero.NOM_COMP,
  cedula: null,
  cod_funci: codFunci,        ← ✅ AGREGADO
  cod_gusu: 2,
  grupo: 'Usuario'
});
```

### 4️⃣ Manejo seguro de NULL en registrarIntento()

**ANTES:**
```javascript
async function registrarIntento(codUsuario, email, tipoEvento, estado, descripcion, ip) {
  try {
    const query = `
      INSERT INTO GN_LOG_ACCE (
        COD_USUA, NUM_IDEN, TIP_EVEN, EST_EVEN, DES_EVEN, IP_ORIG, FEC_EVEN
      )
      VALUES (
        @codUsuario, NULL, @tipoEvento, @estado, @descripcion, @ip, GETDATE()
      )
    `;
    // ... insert con codUsuario potencialmente NULL ← Viola FK constraint
  }
}
```

**DESPUÉS:**
```javascript
async function registrarIntento(codUsuario, email, tipoEvento, estado, descripcion, ip) {
  try {
    // ✅ CRÍTICO: Solo registrar si hay un usuario válido (FK constraint)
    if (!codUsuario) {
      console.log(`[AUDITORÍA] Intento de ${tipoEvento} para ${email}: ${estado}`);
      return;  ← ✅ No insertar si codUsuario es null
    }

    const query = `
      INSERT INTO GN_LOG_ACCE (
        COD_USUA, TIP_EVEN, EST_EVEN, DES_EVEN, IP_ORIG, FEC_EVEN
      )
      VALUES (
        @codUsuario, @tipoEvento, @estado, @descripcion, @ip, GETDATE()
      )
    `;
    // ... insert seguro
  }
}
```

## Flujo Correcto Ahora

```
1. Usuario intenta registrarse con email
   └─ Email se valida en GN_TERCE ✅

2. Se busca COD_FUNCI en GN_FUNCI usando COD_TERC
   └─ Obtiene COD_FUNCI válido ✅

3. Usuario se crea en GN_USUAR con:
   ├─ COD_FUNCI: Vinculado a empleado ✅
   ├─ COD_GUSU: 2 (Grupo por defecto) ✅
   ├─ PAS_HASH: Hash bcrypt válido ✅
   └─ ACT_INAC: 'S' (Activo) ✅

4. Token JWT se genera con todos los datos ✅

5. Usuario puede hacer LOGIN:
   ├─ Query busca usuario por email en GN_USUAR ✅
   ├─ LEFT JOIN con GN_FUNCI usando COD_FUNCI (ahora no null) ✅
   ├─ LEFT JOIN con GN_GUSUA usando COD_GUSU ✅
   ├─ Obtiene datos de empleado correctamente ✅
   ├─ Valida contraseña contra PAS_HASH ✅
   └─ Login EXITOSO ✅
```

## Verificación

Para verificar que las correcciones funcionan:

### Paso 1: Registrarse
```bash
curl -X POST http://localhost:3000/api/auth/registro \
  -H "Content-Type: application/json" \
  -d '{
    "email": "usuario@ejemplo.com",
    "contrasena": "Password123",
    "contrasena_confirmacion": "Password123"
  }'
```

**Respuesta esperada:**
```json
{
  "status": "success",
  "message": "Cuenta creada exitosamente. Bienvenido!",
  "token": "eyJhbGciOiJIUzI1...",
  "usuario": {
    "id": 123,
    "nombre": "Nombre Completo",
    "email": "usuario@ejemplo.com"
  }
}
```

### Paso 2: Login con credenciales correctas
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "cedula_o_email": "usuario@ejemplo.com",
    "contrasena": "Password123"
  }'
```

**Respuesta esperada:**
```json
{
  "status": "success",
  "message": "Login exitoso",
  "token": "eyJhbGciOiJIUzI1...",
  "usuario": {
    "id": 123,
    "empresa": 1,
    "email": "usuario@ejemplo.com",
    "nombre": "Nombre Completo",
    "cedula": 1234567890,
    "cargo": 5,
    "grupo": "Usuario"
  }
}
```

## Estado Actual

✅ **Corregido**: COD_FUNCI se asigna correctamente durante registro
✅ **Corregido**: COD_GUSU se asigna durante registro
✅ **Corregido**: registrarIntento no viola FK constraints
✅ **Corregido**: Token JWT contiene todos los datos necesarios
✅ **Resultado**: Login debería funcionar con credenciales correctas

## Notas

- El grupo 2 es el grupo estándar para nuevos usuarios. Si existe un grupo diferente, actualizar la constante.
- Si COD_FUNCI no existe para una persona en GN_TERCE, el usuario se crea con COD_FUNCI=NULL. El admin deberá asignar después.
- Los intentos de login para usuarios no encontrados ahora se registran en console sin escribir en BD.

---

**Archivo modificado**: `controllers/authController.js`
**Líneas afectadas**: 1020-1062 (registro), 933-954 (registrarIntento), 1115-1124 (token generation)
**Fecha**: 2026-04-14
