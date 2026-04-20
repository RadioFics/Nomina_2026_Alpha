# 🔐 Sistema de Autenticación y Autorización - Collective Mining

## Índice
1. [Descripción General](#descripción-general)
2. [Arquitectura](#arquitectura)
3. [Instalación y Configuración](#instalación-y-configuración)
4. [Base de Datos](#base-de-datos)
5. [Endpoints de API](#endpoints-de-api)
6. [Flujo de Autenticación](#flujo-de-autenticación)
7. [Control de Permisos (RBAC)](#control-de-permisos-rbac)
8. [Integración Frontend](#integración-frontend)
9. [Casos de Uso](#casos-de-uso)
10. [Troubleshooting](#troubleshooting)

---

## Descripción General

El sistema de autenticación utiliza:

- **JWT (JSON Web Tokens)** para sesiones sin estado
- **bcryptjs** para hash seguro de contraseñas
- **RBAC (Role-Based Access Control)** para control granular de permisos
- **Auditoría completa** de accesos y cambios
- **Tabla GN_USUAR** como fuente de verdad para usuarios
- **Tabla GN_FUNCI** como registro de empleados

### Características principales

✅ Autenticación con cédula o email  
✅ Contraseñas hasheadas (bcrypt)  
✅ Control de intentos fallidos (bloqueo automático)  
✅ Expiración de contraseña (90 días)  
✅ Cambio obligatorio de contraseña al expirar  
✅ Múltiples sesiones por usuario  
✅ Auditoría de accesos  
✅ Permisos por rol (ADMIN, RRHH, SUPERVISOR, EMPLEADO)  
✅ Permisos granulares (módulo + acción)  

---

## Arquitectura

### Tablas de Base de Datos

```
GN_USUAR
├─ ID_USUAR (PK)
├─ CEDULA (FK → GN_FUNCI.NUM_IDEN)
├─ NOMBRE_USUAR
├─ PASSW_HASH (bcrypt)
├─ EMAIL
├─ NIVEL_USUAR (1=Empleado, 2=Supervisor, 3=Admin)
├─ ESTA_ACTIVO
├─ ESTA_BLOQUEADO
├─ INTENTOS_FALL
├─ FECH_ULT_CAMBIO
├─ FECH_PROX_CAMBIO
└─ Auditoría (FECH_CREACION, USUAR_CREACION, etc)

GN_SESION
├─ ID_SESION (PK)
├─ ID_USUAR (FK)
├─ CEDULA
├─ FECH_INICIO
├─ FECH_ULTIMA_ACT
├─ FECH_CIERRE
├─ IP_DIRECCION
├─ USER_AGENT
├─ DISPOSITIVO
└─ ESTA_ACTIVA

GN_ROL_USUAR
├─ ID_ROL_USUAR (PK)
├─ ID_USUAR (FK)
├─ COD_ROL (ADMIN, RRHH, SUPERVISOR, EMPLEADO)
├─ NOM_ROL
├─ DESC_ROL
└─ ESTA_ACTIVO

GN_PERMISOS
├─ ID_PERMISO (PK)
├─ COD_ROL (FK)
├─ MODULO (nomina, reportes, maestros)
├─ ACCION (view, create, edit, delete)
├─ RECURSO (específico)
└─ TIENE_ACCESO

GN_LOG_ACCESO
├─ ID_LOG (PK)
├─ ID_USUAR (FK)
├─ CEDULA
├─ TIPO_EVENTO (LOGIN, LOGOUT, ACCESO_RECURSO, ERROR, CAMBIO_PASS)
├─ RECURSO
├─ IP_DIRECCION
├─ ESTADO
├─ MENSAJE
└─ FECH_EVENTO
```

### Flujo de Autenticación

```
Frontend (login.html)
        ↓
    [Usuario ingresa cédula/email y contraseña]
        ↓
POST /api/auth/login
        ↓
Backend (authController.login)
        ├─ Busca usuario en GN_USUAR
        ├─ Verifica si está activo
        ├─ Verifica si está bloqueado
        ├─ Compara contraseña con bcrypt
        ├─ Si OK: Genera JWT
        ├─ Registra sesión en GN_SESION
        ├─ Registra acceso en GN_LOG_ACCESO
        └─ Retorna token + datos usuario
        ↓
Frontend
        ├─ Guarda token en localStorage
        ├─ Guarda datos usuario
        ├─ Si necesita cambio pass: Muestra modal
        └─ Si OK: Redirige a /index_novedades.html
```

---

## Instalación y Configuración

### 1. Actualizar Variables de Entorno

Editar `.env`:

```bash
# Servidor SQL
SERVER=tu-servidor.local
DATABASE=MineDax
UID=usuario_sql
PWD=contraseña_sql

# Autenticación
JWT_SECRET=tu-clave-secreta-super-segura-cambiar-en-produccion
JWT_EXPIRES_IN=8h

# Puerto
PORT=3000
```

**⚠️ IMPORTANTE:** Cambiar `JWT_SECRET` en producción

### 2. Instalar Dependencias

```bash
npm install
```

Esto instalará:
- `jsonwebtoken` - JWT
- `bcryptjs` - Hash de contraseñas
- Todas las dependencias anteriores se mantienen

### 3. Ejecutar Script SQL

En **SQL Server Management Studio**:

```sql
-- Abrir: database/auth_schema.sql
-- Ejecutar toda la secuencia (Pasos 1-10)
```

El script crea:
- Todas las tablas (GN_USUAR, GN_SESION, GN_ROL_USUAR, GN_PERMISOS, GN_LOG_ACCESO)
- Procedimientos almacenados (SP_CREAR_USUARIO_DESDE_FUNCI, SP_VALIDAR_LOGIN, SP_REGISTRAR_SESION)
- Permisos por defecto (ADMIN, RRHH, SUPERVISOR, EMPLEADO)

### 4. Crear Usuarios Iniciales

```sql
-- Con PowerShell o Node.js, generar bcrypt hash de contraseña
-- Ejemplo: contraseña "MineDax@123" hasheda

EXEC SP_CREAR_USUARIO_DESDE_FUNCI
    @CEDULA = '1234567890',
    @PASSW_HASH = '$2a$10$...(hash bcrypt)...',
    @EMAIL = 'usuario@mining.com',
    @NIVEL_USUAR = 3;  -- 3 = Admin

-- Asignar rol
INSERT INTO GN_ROL_USUAR (ID_USUAR, COD_ROL, NOM_ROL, ESTA_ACTIVO)
SELECT ID_USUAR, 'ADMIN', 'Administrador', 1
FROM GN_USUAR WHERE CEDULA = '1234567890';
```

#### Generar hash bcrypt (Node.js):

```javascript
const bcrypt = require('bcryptjs');

async function generarHash(contraseña) {
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(contraseña, salt);
  console.log(hash);
}

generarHash('MineDax@123');
```

### 5. Iniciar Aplicación

```bash
npm run dev    # Desarrollo (con nodemon)
# o
npm start      # Producción
```

Verificar que inicie sin errores:
```
✓ Servidor ejecutándose en http://localhost:3000
✓ Conectado a SQL Server: MineDax
```

---

## Base de Datos

### Procedimientos Almacenados

#### SP_CREAR_USUARIO_DESDE_FUNCI
Crea un usuario a partir de un empleado en GN_FUNCI

```sql
EXEC SP_CREAR_USUARIO_DESDE_FUNCI
    @CEDULA = '1234567890',
    @PASSW_HASH = '...',
    @EMAIL = 'email@mining.com',
    @NIVEL_USUAR = 1,
    @USUAR_CREACION = 'SISTEMA';
```

#### SP_VALIDAR_LOGIN
Valida credenciales y retorna información del usuario

```sql
EXEC SP_VALIDAR_LOGIN
    @CEDULA_O_EMAIL = '1234567890',
    @IP_DIRECCION = '192.168.1.1';
```

#### SP_REGISTRAR_SESION
Registra una nueva sesión

```sql
EXEC SP_REGISTRAR_SESION
    @ID_USUAR = '...',
    @IP_DIRECCION = '192.168.1.1',
    @USER_AGENT = 'Mozilla/5.0...',
    @DISPOSITIVO = 'Desktop';
```

### Consultas Útiles

**Obtener todos los usuarios activos:**
```sql
SELECT CEDULA, NOMBRE_USUAR, NIVEL_USUAR, ESTA_ACTIVO
FROM GN_USUAR
WHERE ESTA_ACTIVO = 1
ORDER BY NOMBRE_USUAR;
```

**Ver últimas sesiones:**
```sql
SELECT TOP 50
    g.CEDULA, g.NOMBRE_USUAR,
    s.FECH_INICIO, s.FECH_CIERRE,
    s.IP_DIRECCION, s.DISPOSITIVO
FROM GN_SESION s
JOIN GN_USUAR g ON s.ID_USUAR = g.ID_USUAR
ORDER BY s.FECH_INICIO DESC;
```

**Ver log de accesos:**
```sql
SELECT TOP 100
    CEDULA, TIPO_EVENTO, ESTADO, MENSAJE,
    IP_DIRECCION, FECH_EVENTO
FROM GN_LOG_ACCESO
WHERE FECH_EVENTO > DATEADD(DAY, -7, GETDATE())
ORDER BY FECH_EVENTO DESC;
```

**Desbloquear usuario bloqueado:**
```sql
UPDATE GN_USUAR
SET ESTA_BLOQUEADO = 0, INTENTOS_FALL = 0
WHERE CEDULA = '1234567890';
```

**Cambiar nivel de usuario:**
```sql
UPDATE GN_USUAR
SET NIVEL_USUAR = 2  -- 2 = Supervisor
WHERE CEDULA = '1234567890';
```

**Ver permisos de un rol:**
```sql
SELECT MODULO, ACCION, TIENE_ACCESO
FROM GN_PERMISOS
WHERE COD_ROL = 'ADMIN'
  AND ESTA_ACTIVO = 1
ORDER BY MODULO, ACCION;
```

---

## Endpoints de API

### Autenticación Pública (Sin Token)

#### POST `/api/auth/login`
Iniciar sesión

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "cedula_o_email": "1234567890",
    "contrasena": "MineDax@123"
  }'
```

**Respuesta Exitosa (200):**
```json
{
  "status": "success",
  "message": "Login exitoso",
  "token": "eyJhbGciOiJIUzI1NiIs...",
  "usuario": {
    "id": "550e8400-e29b-41d4-a716-446655440000",
    "cedula": "1234567890",
    "nombre": "Juan Perez",
    "nivel": 3,
    "departamento": "RRHH",
    "cargo": "GERENTE"
  },
  "necesitaCambioPass": false
}
```

**Respuesta Error (401):**
```json
{
  "status": "error",
  "message": "Cédula/Email o contraseña incorrectos",
  "intentosFallidos": 1
}
```

---

### Autenticación Protegida (Requiere Token)

#### POST `/api/auth/logout`
Cerrar sesión

```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
```

**Respuesta (200):**
```json
{
  "status": "success",
  "message": "Sesión cerrada correctamente"
}
```

#### GET `/api/auth/me`
Obtener datos del usuario autenticado

```bash
curl http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..."
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
    "departamento": "RRHH",
    "cargo": "GERENTE",
    "activo": true,
    "ultCambioPass": "2026-04-10T10:30:00.000Z",
    "proxCambioPass": "2026-07-09T10:30:00.000Z",
    "roles": [
      { "codigo": "ADMIN", "nombre": "Administrador" }
    ]
  }
}
```

#### POST `/api/auth/cambiar-contrasena`
Cambiar contraseña

```bash
curl -X POST http://localhost:3000/api/auth/cambiar-contrasena \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -d '{
    "contrasena_actual": "MineDax@123",
    "contrasena_nueva": "MineDax@456",
    "contrasena_confirmacion": "MineDax@456"
  }'
```

**Respuesta (200):**
```json
{
  "status": "success",
  "message": "Contraseña cambiada exitosamente"
}
```

#### POST `/api/auth/crear-usuario` (Solo Admin)
Crear un nuevo usuario

```bash
curl -X POST http://localhost:3000/api/auth/crear-usuario \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer eyJhbGciOiJIUzI1NiIs..." \
  -d '{
    "cedula": "9876543210",
    "email": "nuevousuario@mining.com",
    "contrasena": "MineDax@789"
  }'
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

## Flujo de Autenticación

### 1. Acceso Inicial

Usuario accede a `http://localhost:3000`
↓
Se sirve `login.html`
↓
Usuario ve formulario de login

### 2. Login

Usuario ingresa:
- Cédula O Email
- Contraseña

Frontend realiza `POST /api/auth/login`
↓
Backend verifica:
- Usuario existe en GN_USUAR
- Usuario está activo
- Usuario no está bloqueado
- Contraseña es correcta
↓
Si TODO OK:
- Genera JWT token
- Registra sesión en GN_SESION
- Registra acceso en GN_LOG_ACCESO
- Retorna token + datos usuario
↓
Frontend:
- Guarda token en `localStorage`
- Guarda usuario en `localStorage`
- Si `necesitaCambioPass = true`: Muestra modal
- Si OK: Redirige a `/index_novedades.html`

### 3. Cambio de Contraseña Requerido (Si aplica)

Sistema detecta: `FECH_PROX_CAMBIO < HOY`
↓
Modal aparece: "Cambio de Contraseña Requerido"
↓
Usuario ingresa:
- Nueva contraseña (min 8 caracteres)
- Confirmar contraseña
↓
Frontend: `POST /api/auth/cambiar-contrasena`
↓
Backend:
- Actualiza PASSW_HASH
- Actualiza FECH_ULT_CAMBIO
- Actualiza FECH_PROX_CAMBIO = HOY + 90 días
- Registra en GN_LOG_ACCESO
↓
Frontend: Redirige a `/index_novedades.html`

### 4. Operaciones Protegidas

Usuario en cualquier página realiza acción
↓
Frontend usa `AuthUtil.fetchAuth(url, options)`
↓
JavaScript automáticamente agrega header:
```
Authorization: Bearer <token>
```
↓
Backend recibe petición
↓
Middleware `verifyToken` verifica:
- Token existe
- Token es válido
- Token no está expirado
↓
Si OK: Agrega `req.usuario` y continúa
↓
Si ERROR (401): Frontend redirige a login

### 5. Logout

Usuario hace clic en "Cerrar Sesión"
↓
Frontend: `POST /api/auth/logout`
↓
Backend:
- Marca GN_SESION.ESTA_ACTIVA = 0
- Registra en GN_LOG_ACCESO
↓
Frontend:
- Limpia localStorage
- Redirige a `/login.html`

---

## Control de Permisos (RBAC)

### Niveles de Usuario

```
NIVEL 1: EMPLEADO
├─ Ver nómina propia
├─ Ver reportes propios
└─ Cambiar contraseña

NIVEL 2: SUPERVISOR
├─ Ver nómina del equipo
├─ Ver reportes del equipo
├─ Crear novedades del equipo
└─ Cambiar contraseña

NIVEL 3: ADMIN
├─ Acceso total
├─ Crear usuarios
├─ Cambiar permisos
├─ Ver auditoría
└─ Cambiar contraseña
```

### Roles y Permisos

Se definen en `GN_PERMISOS`:

```sql
-- Ejemplo: ADMIN puede hacer todo
INSERT INTO GN_PERMISOS VALUES
  ('ADMIN', 'nomina', 'view', NULL, 1),
  ('ADMIN', 'nomina', 'create', NULL, 1),
  ('ADMIN', 'nomina', 'edit', NULL, 1),
  ('ADMIN', 'nomina', 'delete', NULL, 1),
  ('ADMIN', 'reportes', 'view', NULL, 1),
  ('ADMIN', 'reportes', 'create', NULL, 1),
  ('ADMIN', 'maestros', 'view', NULL, 1),
  ('ADMIN', 'maestros', 'edit', NULL, 1);

-- Ejemplo: EMPLEADO solo puede ver
INSERT INTO GN_PERMISOS VALUES
  ('EMPLEADO', 'nomina', 'view', NULL, 1),
  ('EMPLEADO', 'reportes', 'view', NULL, 1);
```

### Verificar Permisos en Backend

```javascript
// En una ruta protegida
router.post(
  '/crear-novedad',
  verifyToken,                    // Verificar que esté autenticado
  checkPermission('nomina', 'create'),  // Verificar que tenga permiso
  nominaController.crearNovedad
);
```

### Verificar Permisos en Frontend

```javascript
// Usar AuthUtil para verificaciones simples
const usuario = AuthUtil.getUsuario();

if (AuthUtil.esAdmin()) {
  // Mostrar botón de crear usuario
}

if (AuthUtil.esSupervisor()) {
  // Mostrar opciones de supervisor
}

// Para acciones, dejar que el servidor verifique
// Si retorna 403, mostrar error de permiso insuficiente
```

---

## Integración Frontend

### 1. Incluir Script de Autenticación

En `index_novedades.html`, antes de otros scripts:

```html
<script src="/js/auth.js"></script>
```

### 2. Usar AuthUtil en tus Páginas

```javascript
// Proteger la página (redirige a login si no está autenticado)
AuthUtil.protegerPagina();

// Obtener datos del usuario
const usuario = AuthUtil.getUsuario();
console.log(usuario.nombre);

// Verificar si es admin
if (AuthUtil.esAdmin()) {
  document.getElementById('adminMenu').style.display = 'block';
}

// Hacer petición con autenticación automática
async function cargarDatos() {
  try {
    const response = await AuthUtil.fetchAuth('/api/nomina/ocasionales');
    const data = await response.json();
    console.log(data);
  } catch (error) {
    console.error('Error:', error);
  }
}

// Cambiar contraseña
async function cambiarPass() {
  try {
    await AuthUtil.cambiarContrasena(pasActual, pasNueva, pasConfirm);
    alert('Contraseña cambiada');
  } catch (error) {
    alert('Error: ' + error.message);
  }
}

// Cerrar sesión
function cerrarSesion() {
  AuthUtil.logout();
}
```

### 3. Actualizar Llamadas API Existentes

**ANTES:**
```javascript
fetch('/api/nomina/ocasionales', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify(data)
})
```

**DESPUÉS:**
```javascript
AuthUtil.fetchAuth('/api/nomina/ocasionales', {
  method: 'POST',
  body: data  // Se serializa automáticamente
})
```

### 4. Agregar Botón de Logout

En `index_novedades.html`:

```html
<button onclick="AuthUtil.logout()">Cerrar Sesión</button>

<script>
// Mostrar nombre del usuario
document.addEventListener('DOMContentLoaded', () => {
  const usuario = AuthUtil.getUsuario();
  if (usuario) {
    document.getElementById('nombreUsuario').textContent = usuario.nombre;
  }
});
</script>
```

---

## Casos de Uso

### Caso 1: Crear un Nuevo Empleado con Usuario

```sql
-- 1. El empleado ya existe en GN_FUNCI
SELECT * FROM GN_FUNCI WHERE NUM_IDEN = '1234567890';

-- 2. Admin crea el usuario desde la API (automático)
-- POST /api/auth/crear-usuario
-- Body: { cedula: '1234567890', email: 'xxx@mining.com', contrasena: 'xxx' }

-- 3. Sistema automáticamente:
-- - Crea registro en GN_USUAR
-- - Obtiene datos de GN_FUNCI (nombre, departamento, cargo)
-- - Hash de contraseña con bcrypt
-- - Registra en GN_LOG_ACCESO

-- 4. Asignar rol (opcional desde SQL)
INSERT INTO GN_ROL_USUAR (ID_USUAR, COD_ROL, NOM_ROL, ESTA_ACTIVO)
SELECT ID_USUAR, 'SUPERVISOR', 'Supervisor', 1
FROM GN_USUAR WHERE CEDULA = '1234567890';
```

### Caso 2: Empleado Olvida Contraseña

```
1. Empleado accede a login.html
2. Intenta login 3 veces fallidas
3. En intento 4, ve mensaje: "Contraseña o usuario incorrecto"
4. En intento 5, es bloqueado automáticamente
5. ADMIN debe ejecutar:
   UPDATE GN_USUAR SET ESTA_BLOQUEADO = 0, INTENTOS_FALL = 0
   WHERE CEDULA = 'x';
```

### Caso 3: Expiración de Contraseña

```
1. Usuario intenta login
2. Backend verifica: FECH_PROX_CAMBIO < TODAY
3. Si sí, retorna: { necesitaCambioPass: true }
4. Frontend muestra modal obligatorio
5. Usuario debe cambiar contraseña
6. Sistema actualiza:
   - FECH_ULT_CAMBIO = HOY
   - FECH_PROX_CAMBIO = HOY + 90 días
   - PASSW_HASH = nuevo hash
```

### Caso 4: Desactivar Usuario

```sql
-- Usuario se va de la empresa
UPDATE GN_USUAR
SET ESTA_ACTIVO = 0
WHERE CEDULA = '1234567890';

-- Ya no puede hacer login
-- Intento de login retorna: "Tu cuenta está inactiva"
```

### Caso 5: Cambiar Rol de Usuario

```sql
-- De EMPLEADO a SUPERVISOR

-- 1. Actualizar nivel (opcional)
UPDATE GN_USUAR
SET NIVEL_USUAR = 2
WHERE CEDULA = '1234567890';

-- 2. Agregar rol nuevo
INSERT INTO GN_ROL_USUAR (ID_USUAR, COD_ROL, NOM_ROL, ESTA_ACTIVO)
SELECT ID_USUAR, 'SUPERVISOR', 'Supervisor', 1
FROM GN_USUAR WHERE CEDULA = '1234567890';

-- 3. Desactivar rol anterior (opcional)
UPDATE GN_ROL_USUAR
SET ESTA_ACTIVO = 0
WHERE ID_USUAR = (SELECT ID_USUAR FROM GN_USUAR WHERE CEDULA = '1234567890')
  AND COD_ROL = 'EMPLEADO';
```

---

## Troubleshooting

### Error: "Token inválido o expirado"

**Causa:** Token no se envió correctamente o expiró (8 horas)

**Solución:**
1. Hacer logout: `AuthUtil.logout()`
2. Hacer login de nuevo
3. Verificar que `localStorage` tiene el token

### Error: "No tienes permisos para acceder"

**Causa:** Usuario no tiene permiso para esa acción

**Solución:**
1. Verificar rol del usuario: `SELECT * FROM GN_ROL_USUAR WHERE ID_USUAR = '...'`
2. Verificar permisos: `SELECT * FROM GN_PERMISOS WHERE COD_ROL = 'rol'`
3. Agregar permiso si es necesario:
   ```sql
   INSERT INTO GN_PERMISOS (COD_ROL, MODULO, ACCION, TIENE_ACCESO)
   VALUES ('SUPERVISOR', 'nomina', 'create', 1);
   ```

### Error: "Usuario bloqueado por intentos fallidos"

**Causa:** Usuario ingresó contraseña incorrecta 5 veces

**Solución (Admin):**
```sql
UPDATE GN_USUAR
SET ESTA_BLOQUEADO = 0, INTENTOS_FALL = 0
WHERE CEDULA = '...';
```

### Error: "Cédula no encontrada en GN_FUNCI"

**Causa:** El empleado no existe en GN_FUNCI

**Solución:**
1. Verificar que la cédula existe: `SELECT * FROM GN_FUNCI WHERE NUM_IDEN = '...'`
2. Si no existe, crear primero el registro en GN_FUNCI
3. Luego crear el usuario

### Frontend no mantiene sesión

**Causa:** localStorage no está habilitado o se borra

**Solución:**
1. Verificar que el navegador permite localStorage
2. Verificar en DevTools → Application → Local Storage
3. Si se borra, usuario debe hacer login nuevamente

### JWT_SECRET no está configurado

**Error en logs:** "jwt malformed" o similar

**Solución:**
1. Verificar `.env` tiene `JWT_SECRET`
2. Reiniciar servidor: `npm run dev`
3. El secret debe ser el mismo en todos los servidores

---

## Resumen de Archivos Creados

```
📁 database/
├─ auth_schema.sql          # Tablas y procedimientos SQL

📁 middleware/
├─ authMiddleware.js         # Verificación de token y permisos

📁 controllers/
├─ authController.js         # Lógica de autenticación

📁 routes/
├─ auth.js                   # Rutas de autenticación (/api/auth)

📁 js/
├─ auth.js                   # Utilidad de autenticación en cliente

📁 (raíz)
├─ login.html                # Página de login
├─ server.js                 # Actualizado con ruta /auth
├─ package.json              # Actualizado con bcryptjs y jsonwebtoken
└─ .env                       # Actualizado con JWT_SECRET

📄 Este documento (AUTENTICACION.md)
```

---

## Próximos Pasos

1. **Ejecutar el script SQL** (database/auth_schema.sql)
2. **Instalar dependencias** (`npm install`)
3. **Crear usuarios iniciales** (ver sección Base de Datos)
4. **Actualizar .env** con JWT_SECRET
5. **Iniciar servidor** (`npm run dev`)
6. **Probar login** (http://localhost:3000)
7. **Integrar AuthUtil en otras páginas** (usar `AuthUtil.fetchAuth()`)
8. **Proteger rutas existentes** (agregar `verifyToken` middleware)

---

## Soporte

Si tienes preguntas o necesitas ayuda:
1. Revisar los logs del servidor (`npm run dev`)
2. Verificar la consulta en GN_LOG_ACCESO
3. Probar endpoints con Postman o curl
4. Revisar las tablas con SQL Server Management Studio

¡El sistema está listo para usar! 🚀
