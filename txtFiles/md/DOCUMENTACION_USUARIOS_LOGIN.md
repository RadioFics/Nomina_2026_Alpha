# 🔐 Documentación: Sistema de Login y Gestión de Usuarios

## 📋 Tabla de Contenidos
1. [Estructura de Base de Datos](#estructura-de-base-de-datos)
2. [Flujo de Login](#flujo-de-login)
3. [Endpoints de Autenticación](#endpoints-de-autenticación)
4. [Endpoints de Gestión de Usuarios](#endpoints-de-gestión-de-usuarios)
5. [Ejemplos de Uso](#ejemplos-de-uso)
6. [Solución de Problemas](#solución-de-problemas)

---

## Estructura de Base de Datos

### 🗄️ Tabla GN_USUAR (Usuarios)
```
┌─────────────────────────────────────────────────────────────┐
│ GN_USUAR                                                    │
├─────────────────────────────────────────────────────────────┤
│ ID_USUAR (UNIQUEIDENTIFIER, PK)     - ID único del usuario │
│ CEDULA (VARCHAR 20, UNIQUE)         - Cédula/documento    │
│ NOMBRE_USUAR (VARCHAR 100)          - Nombre del usuario  │
│ PASSW_HASH (VARCHAR 255)            - Hash bcrypt 🔒      │
│ EMAIL (VARCHAR 100)                 - Email del usuario   │
│ NIVEL_USUAR (INT)                   - 1=Emp, 2=Sup, 3=Adm│
│ COD_DEPART (VARCHAR 10)             - Código dpto         │
│ COD_CARGO (VARCHAR 10)              - Código cargo        │
│ ESTA_ACTIVO (BIT)                   - 1=Activo, 0=Inac   │
│ ESTA_BLOQUEADO (BIT)                - Bloqueado por int. │
│ INTENTOS_FALL (INT)                 - Intentos fallidos   │
│ FECH_ULT_CAMBIO (DATETIME)          - Últ cambio de pass │
│ FECH_PROX_CAMBIO (DATETIME)         - Próximo cambio req │
│ FECH_CREACION (DATETIME)            - Cuándo se creó     │
│ FECH_MODIF (DATETIME)               - Última modificación│
└─────────────────────────────────────────────────────────────┘
```

### 🔗 Tabla GN_SESION (Sesiones)
```
Registra todas las sesiones activas:
- ID_SESION, ID_USUAR, CEDULA
- FECH_INICIO, FECH_CIERRE
- IP_DIRECCION, USER_AGENT, DISPOSITIVO
- ESTA_ACTIVA
```

### 📋 Tabla GN_ROL_USUAR (Roles)
```
Asigna roles a usuarios:
- ID_ROL_USUAR, ID_USUAR, COD_ROL
- Valores: ADMIN, RRHH, SUPERVISOR, EMPLEADO
```

### 📊 Tabla GN_PERMISOS (Permisos Granulares)
```
Define permisos por rol:
- COD_ROL, MODULO, ACCION, RECURSO
- Módulos: nomina, reportes, maestros
- Acciones: view, create, edit, delete
```

### 📝 Tabla GN_LOG_ACCESO (Auditoría)
```
Registra todos los eventos:
- ID_USUAR, CEDULA, TIPO_EVENTO
- TIPO_EVENTO: LOGIN, LOGOUT, CAMBIO_PASS, ERROR, etc.
- ESTADO: EXITOSO, FALLIDO, BLOQUEADO
```

---

## Flujo de Login

```
┌─────────────────────────────────┐
│   Usuario abre login.html       │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────┐
│   Ingresa CEDULA y CONTRASEÑA   │
└────────────┬────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────┐
│  Frontend: POST /api/auth/login                 │
│  Body: {cedula_o_email, contrasena}            │
└────────────┬────────────────────────────────────┘
             │
             ▼
┌─────────────────────────────────────────────────┐
│  Backend: authController.login()                │
│  1. Buscar usuario por CEDULA o EMAIL          │
│  2. Verificar si está activo (ESTA_ACTIVO=1)  │
│  3. Verificar si está bloqueado                │
│  4. Comparar contraseña con bcrypt.compare()   │
└────────────┬────────────────────────────────────┘
             │
        ┌────┴────┐
        │          │
        ▼          ▼
    ✓ OK      ❌ ERROR
        │          │
        ▼          ▼
  Generar JWT   Registrar
  Registrar     intento fallido
  sesión        Bloquear si
  Auditoría     > 5 intentos
        │          │
        ▼          ▼
  Retorna:     Retorna error
  - token      401/403
  - usuario
  - nivel
```

### Seguridad Implementada:
- ✅ Contraseñas hasheadas con bcrypt
- ✅ Bloqueo automático después de 5 intentos fallidos
- ✅ JWT token con expiración
- ✅ Auditoría de todos los eventos
- ✅ Validación de estado activo/inactivo
- ✅ Control de cambio de contraseña cada 90 días

---

## Endpoints de Autenticación

### 1️⃣ LOGIN
```http
POST /api/auth/login
Content-Type: application/json

{
  "cedula_o_email": "1234567890",
  "contrasena": "MiContraseña123"
}
```

**Respuesta Exitosa (200):**
```json
{
  "status": "success",
  "message": "Login exitoso",
  "token": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "usuario": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "cedula": "1234567890",
    "nombre": "Juan Perez",
    "nivel": 3,
    "departamento": "IT",
    "cargo": "ADMIN"
  },
  "necesitaCambioPass": false
}
```

**Respuesta Error (401/403):**
```json
{
  "status": "error",
  "message": "Cédula/Email o contraseña incorrectos",
  "intentosFallidos": 1
}
```

---

### 2️⃣ LOGOUT
```http
POST /api/auth/logout
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Respuesta (200):**
```json
{
  "status": "success",
  "message": "Sesión cerrada correctamente"
}
```

---

### 3️⃣ OBTENER USUARIO ACTUAL
```http
GET /api/auth/me
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Respuesta (200):**
```json
{
  "status": "success",
  "usuario": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "cedula": "1234567890",
    "nombre": "Juan Perez",
    "email": "juan@mining.com",
    "nivel": 3,
    "departamento": "IT",
    "cargo": "ADMIN",
    "activo": true,
    "ultCambioPass": "2024-03-01T10:30:00.000Z",
    "proxCambioPass": "2024-05-30T10:30:00.000Z",
    "roles": [
      { "codigo": "ADMIN", "nombre": "Administrador" }
    ]
  }
}
```

---

### 4️⃣ CAMBIAR CONTRASEÑA
```http
POST /api/auth/cambiar-contrasena
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "contrasena_actual": "MiContraseña123",
  "contrasena_nueva": "NuevaContraseña456",
  "contrasena_confirmacion": "NuevaContraseña456"
}
```

**Respuesta (200):**
```json
{
  "status": "success",
  "message": "Contraseña cambiada exitosamente"
}
```

---

## Endpoints de Gestión de Usuarios

### ⚠️ Todos requieren:
- **Authorization**: Token JWT válido
- **Nivel**: 3 (Administrador)

### 1️⃣ LISTAR USUARIOS
```http
GET /api/auth/usuarios?estado=activo&pagina=1&limite=20
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Query Parameters:**
- `estado`: "activo" o "inactivo" (opcional)
- `rol`: código de rol (opcional)
- `pagina`: número de página (default: 1)
- `limite`: usuarios por página (default: 20)

**Respuesta (200):**
```json
{
  "status": "success",
  "usuarios": [
    {
      "ID_USUAR": "550e8400-e29b-41d4-a716-446655440000",
      "CEDULA": "1234567890",
      "NOMBRE_USUAR": "Juan Perez",
      "EMAIL": "juan@mining.com",
      "NIVEL_USUAR": 3,
      "ESTA_ACTIVO": 1,
      "ESTA_BLOQUEADO": 0,
      "FECH_CREACION": "2024-01-15T09:00:00.000Z",
      "COD_ROL": "ADMIN",
      "NOM_ROL": "Administrador"
    }
  ],
  "total": 1,
  "pagina": 1,
  "limite": 20
}
```

---

### 2️⃣ OBTENER USUARIO POR ID
```http
GET /api/auth/usuarios/550e8400-e29b-41d4-a716-446655440000
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Respuesta (200):**
```json
{
  "status": "success",
  "usuario": {
    "ID_USUAR": "550e8400-e29b-41d4-a716-446655440000",
    "CEDULA": "1234567890",
    "NOMBRE_USUAR": "Juan Perez",
    "EMAIL": "juan@mining.com",
    "NIVEL_USUAR": 3,
    "ESTA_ACTIVO": 1,
    "ESTA_BLOQUEADO": 0,
    "INTENTOS_FALL": 0,
    "COD_DEPART": "IT",
    "COD_CARGO": "ADMIN",
    "FECH_CREACION": "2024-01-15T09:00:00.000Z",
    "FECH_ULT_CAMBIO": "2024-03-01T10:30:00.000Z",
    "FECH_PROX_CAMBIO": "2024-05-30T10:30:00.000Z"
  }
}
```

---

### 3️⃣ CREAR USUARIO
```http
POST /api/auth/crear-usuario
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "cedula": "9876543210",
  "email": "maria@mining.com",
  "contrasena": "SeguraPassword123"
}
```

**Respuesta (201):**
```json
{
  "status": "success",
  "message": "Usuario creado exitosamente",
  "usuarioId": "550e8400-e29b-41d4-a716-446655440001"
}
```

---

### 4️⃣ ACTUALIZAR USUARIO
```http
PUT /api/auth/usuarios/550e8400-e29b-41d4-a716-446655440001
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "nombre": "María López",
  "email": "maria.lopez@mining.com",
  "nivel": 2,
  "departamento": "RRHH",
  "cargo": "SUPERVISOR",
  "estado": true
}
```

**Respuesta (200):**
```json
{
  "status": "success",
  "message": "Usuario actualizado exitosamente"
}
```

---

### 5️⃣ CAMBIAR ESTADO (Activo/Inactivo)
```http
PATCH /api/auth/usuarios/550e8400-e29b-41d4-a716-446655440001/estado
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
Content-Type: application/json

{
  "estado": false
}
```

**Respuesta (200):**
```json
{
  "status": "success",
  "message": "Usuario desactivado exitosamente"
}
```

---

### 6️⃣ DESBLOQUEAR USUARIO
```http
PATCH /api/auth/usuarios/550e8400-e29b-41d4-a716-446655440001/desbloquear
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Respuesta (200):**
```json
{
  "status": "success",
  "message": "Usuario desbloqueado exitosamente"
}
```

---

### 7️⃣ ELIMINAR USUARIO
```http
DELETE /api/auth/usuarios/550e8400-e29b-41d4-a716-446655440001
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

**Respuesta (200):**
```json
{
  "status": "success",
  "message": "Usuario eliminado exitosamente"
}
```

---

## Ejemplos de Uso

### Desde JavaScript/Frontend:

```javascript
// 1. LOGIN
const loginResponse = await fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    cedula_o_email: '1234567890',
    contrasena: 'MiContraseña123'
  })
});

const loginData = await loginResponse.json();
const token = loginData.token;
localStorage.setItem('token', token);

// 2. OBTENER USUARIO ACTUAL
const meResponse = await fetch('http://localhost:3000/api/auth/me', {
  method: 'GET',
  headers: { 'Authorization': `Bearer ${token}` }
});

const userData = await meResponse.json();
console.log('Usuario:', userData.usuario);

// 3. LISTAR USUARIOS (Admin)
const usersResponse = await fetch('http://localhost:3000/api/auth/usuarios?estado=activo', {
  method: 'GET',
  headers: { 'Authorization': `Bearer ${token}` }
});

const usersData = await usersResponse.json();
console.log('Usuarios activos:', usersData.usuarios);

// 4. CREAR USUARIO (Admin)
const createResponse = await fetch('http://localhost:3000/api/auth/crear-usuario', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${token}`
  },
  body: JSON.stringify({
    cedula: '9876543210',
    email: 'nuevo@mining.com',
    contrasena: 'Password123'
  })
});

const createData = await createResponse.json();
console.log('Nuevo usuario ID:', createData.usuarioId);

// 5. LOGOUT
const logoutResponse = await fetch('http://localhost:3000/api/auth/logout', {
  method: 'POST',
  headers: { 'Authorization': `Bearer ${token}` }
});

const logoutData = await logoutResponse.json();
console.log('Sesión cerrada:', logoutData.message);
```

### Desde cURL:

```bash
# LOGIN
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"cedula_o_email":"1234567890","contrasena":"MiContraseña123"}'

# LISTAR USUARIOS (requiere token)
TOKEN="eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
curl -X GET http://localhost:3000/api/auth/usuarios \
  -H "Authorization: Bearer $TOKEN"

# CREAR USUARIO
curl -X POST http://localhost:3000/api/auth/crear-usuario \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"cedula":"9876543210","email":"nuevo@mining.com","contrasena":"Password123"}'
```

---

## Solución de Problemas

### ❌ "Usuario no encontrado"
**Causa:** La cédula no existe en GN_USUAR
**Solución:**
1. Verificar cédula ingresada
2. Crear usuario con: POST /api/auth/crear-usuario
3. Verificar en BD: `SELECT * FROM GN_USUAR WHERE CEDULA = '1234567890'`

### ❌ "Usuario bloqueado por intentos fallidos"
**Causa:** Más de 5 intentos fallidos
**Solución:**
1. Esperar 1 hora O
2. Admin ejecuta: PATCH /api/auth/usuarios/{id}/desbloquear
3. Verificar en BD: `UPDATE GN_USUAR SET ESTA_BLOQUEADO = 0 WHERE CEDULA = '...'`

### ❌ "Usuario inactivo"
**Causa:** ESTA_ACTIVO = 0
**Solución:**
1. Admin activa con: PATCH /api/auth/usuarios/{id}/estado {"estado": true}
2. O en BD: `UPDATE GN_USUAR SET ESTA_ACTIVO = 1 WHERE CEDULA = '...'`

### ❌ "Contraseña incorrecta"
**Causa:** Hash no coincide
**Solución:**
1. Usuario solicita cambio de contraseña
2. Admin puede resetear:
```sql
DECLARE @newHash VARCHAR(255) = '$2a$10$...'; -- bcrypt hash
UPDATE GN_USUAR SET PASSW_HASH = @newHash WHERE CEDULA = '...';
```

### ❌ "Token inválido" (401)
**Causa:** Token expirado o malformado
**Solución:**
1. Hacer login nuevamente
2. Usar token en Authorization header: `Bearer {token}`

### ❌ "No tienes permiso" (403)
**Causa:** Nivel de usuario < 3 (no es Admin)
**Solución:**
1. Cambiar NIVEL_USUAR a 3 en BD
2. O pedir a Admin que ejecute: PUT /api/auth/usuarios/{id} {"nivel": 3}

---

## 🔐 Mejores Prácticas

1. **Almacenamiento de Token:**
   - ✅ localStorage (para SPAs)
   - ❌ NO en cookies sin HttpOnly
   - ❌ NO en sessionStorage (pérdida al cerrar)

2. **Cambio de Contraseña:**
   - Requerido cada 90 días
   - Mínimo 8 caracteres
   - Incluir mayúsculas, minúsculas, números

3. **Auditoría:**
   - Todos los eventos registrados en GN_LOG_ACCESO
   - Revisar regularmente intentos fallidos
   - Monitorear accesos inusuales

4. **Seguridad de Datos:**
   - Nunca exposer PASSW_HASH en respuestas
   - Usar HTTPS en producción
   - Validar permisos en cada endpoint

---

**Última actualización:** 2024-04-14
**Versión:** 1.0
