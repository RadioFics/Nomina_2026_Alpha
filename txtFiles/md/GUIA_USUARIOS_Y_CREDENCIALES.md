# 📋 Guía Completa: Usuarios, Credenciales y Autenticación

## 🔐 Resumen Ejecutivo

Tu sistema usa **contraseñas hasheadas en bcrypt** guardadas en **tabla GN_USUAR** de SQL Server.

```
Usuario ingresa:      cedula + contraseña (texto plano)
                              ↓
Backend verifica:     bcrypt.compare(texto plano, hash)
                              ↓
Si es correcto:       Genera JWT + registra sesión
                              ↓
Frontend obtiene:     Token para futuras peticiones
```

---

## 📊 ESTRUCTURA DE LA BASE DE DATOS

### Tabla: GN_USUAR (Usuarios)

```sql
-- Dónde se guardan TODAS las credenciales y permisos

CREATE TABLE dbo.GN_USUAR (
    ID_USUAR         UNIQUEIDENTIFIER PRIMARY KEY  -- ID único del usuario
    CEDULA           VARCHAR(20) NOT NULL UNIQUE   -- Identificador principal
    NOMBRE_USUAR     VARCHAR(100) NOT NULL         -- Nombre completo
    
    -- 🔑 LO MÁS IMPORTANTE: LA CONTRASEÑA
    PASSW_HASH       VARCHAR(255) NOT NULL         -- ⭐ HASH bcrypt de contraseña
    EMAIL            VARCHAR(100)                  -- Email alternativo
    
    -- Permisos y roles
    NIVEL_USUAR      INT DEFAULT 1                 -- 1=Empleado, 2=Supervisor, 3=Admin
    ESTA_ACTIVO      BIT DEFAULT 1                 -- 1=Activo, 0=Inactivo
    ESTA_BLOQUEADO   BIT DEFAULT 0                 -- 1=Bloqueado, 0=Activo
    
    -- Control
    INTENTOS_FALL    INT DEFAULT 0                 -- Intentos fallidos de login
    FECH_PROX_CAMBIO DATETIME                      -- Cuándo debe cambiar contraseña
    FECH_CREACION    DATETIME DEFAULT GETDATE()    -- Cuándo se creó
);
```

### Tabla: GN_SESION (Historial de Sesiones)

```sql
-- Auditoría de quién ingresó y cuándo

CREATE TABLE dbo.GN_SESION (
    ID_SESION        UNIQUEIDENTIFIER PRIMARY KEY
    ID_USUAR         UNIQUEIDENTIFIER NOT NULL     -- Referencia al usuario
    CEDULA           VARCHAR(20) NOT NULL
    FECH_INICIO      DATETIME DEFAULT GETDATE()    -- Cuándo ingresó
    FECH_ULTIMA_ACT  DATETIME DEFAULT GETDATE()    -- Última actividad
    FECH_CIERRE      DATETIME                      -- Cuándo cerró sesión
    IP_DIRECCION     VARCHAR(50)                   -- IP de quién se conectó
    USER_AGENT       VARCHAR(500)                  -- Navegador/dispositivo
    ESTA_ACTIVA      BIT DEFAULT 1                 -- Sesión sigue abierta
);
```

### Tabla: GN_LOG_ACCESO (Auditoría de Eventos)

```sql
-- TODOS los intentos de login (exitosos y fallidos) quedan registrados

CREATE TABLE dbo.GN_LOG_ACCESO (
    ID_LOG       UNIQUEIDENTIFIER PRIMARY KEY
    ID_USUAR     UNIQUEIDENTIFIER
    CEDULA       VARCHAR(20)
    TIPO_EVENTO  VARCHAR(50)     -- 'LOGIN', 'LOGOUT', 'CAMBIO_PASS', etc.
    ESTADO       VARCHAR(20)     -- 'EXITOSO', 'FALLIDO', 'BLOQUEADO'
    MENSAJE      VARCHAR(500)    -- Descripción del evento
    IP_DIRECCION VARCHAR(50)     -- De dónde vino el intento
    FECH_EVENTO  DATETIME DEFAULT GETDATE()
);
```

---

## 👥 ¿QUIÉNES PUEDEN INGRESAR?

### Opción 1: Cualquier usuario en GN_USUAR

Si el usuario existe en `GN_USUAR`, puede intentar login con:

```javascript
// Frontend - Credenciales válidas
{
  "cedula_o_email": "hernandezjuanfelipe964@gmail.com",  // O la cédula
  "contrasena": "SuContraseñaEnTextoPlano123!"
}
```

### Opción 2: Filtrar por NIVEL_USUAR (Recomendado)

Puedes restringir el acceso a ciertos niveles:

```javascript
// En login.js - Solo ADMIN y RRHH pueden ingresar
const nivel = usuario.NIVEL_USUAR;

if (nivel !== 3 && nivel !== 2) {  // 3=Admin, 2=Supervisor
  return res.status(403).json({
    error: 'Solo administradores pueden acceder'
  });
}
```

### Opción 3: Filtrar por ESTA_ACTIVO

Asegúrate de que el usuario está activo:

```sql
WHERE CEDULA = @cedula 
  AND ESTA_ACTIVO = 1  -- Solo usuarios activos
  AND ESTA_BLOQUEADO = 0  -- Que no estén bloqueados
```

✅ El backend ya hace esto correctamente.

---

## ✅ VALIDAR QUE SE GUARDAN CORRECTAMENTE

### Script 1: Ver Todos los Usuarios

Ejecuta esto en **SQL Server Management Studio (SSMS)**:

```sql
SELECT 
    ID_USUAR,
    CEDULA,
    NOMBRE_USUAR,
    EMAIL,
    NIVEL_USUAR,
    CASE WHEN NIVEL_USUAR = 1 THEN 'Empleado'
         WHEN NIVEL_USUAR = 2 THEN 'Supervisor'
         WHEN NIVEL_USUAR = 3 THEN 'Admin'
         ELSE 'Desconocido'
    END as Rol,
    ESTA_ACTIVO,
    ESTA_BLOQUEADO,
    LEN(PASSW_HASH) as 'Longitud_Hash',
    CASE WHEN LEN(PASSW_HASH) >= 60 THEN '✅ Hash válido'
         ELSE '❌ Hash incompleto'
    END as 'Estado_Hash',
    FECH_CREACION,
    INTENTOS_FALL
FROM GN_USUAR
ORDER BY FECH_CREACION DESC;
```

**Resultado esperado:**
```
CEDULA          NOMBRE          EMAIL                           Hash_Length  Estado
─────────────────────────────────────────────────────────────────────────────────
1234567890      Juan Pérez      juan.perez@gmail.com           60           ✅ Hash válido
hernandezjuan   Hernández Juan  hernandezjuanfelipe964@...     60           ✅ Hash válido
```

### Script 2: Ver Intentos de Login Fallidos

¿Quién intentó ingresar y falló?

```sql
SELECT TOP 20
    CEDULA,
    TIPO_EVENTO,
    ESTADO,
    MENSAJE,
    IP_DIRECCION,
    FECH_EVENTO
FROM GN_LOG_ACCESO
WHERE TIPO_EVENTO = 'LOGIN' 
  AND ESTADO = 'FALLIDO'
ORDER BY FECH_EVENTO DESC;
```

### Script 3: Ver Sesiones Activas

¿Quién está conectado AHORA?

```sql
SELECT 
    u.CEDULA,
    u.NOMBRE_USUAR,
    s.FECH_INICIO,
    s.FECH_ULTIMA_ACT,
    s.IP_DIRECCION,
    s.USER_AGENT,
    DATEDIFF(MINUTE, s.FECH_INICIO, GETDATE()) as 'Minutos_Conectado'
FROM GN_SESION s
INNER JOIN GN_USUAR u ON s.ID_USUAR = u.ID_USUAR
WHERE s.ESTA_ACTIVA = 1
ORDER BY s.FECH_INICIO DESC;
```

### Script 4: Verificar Hash Específico

¿El hash de un usuario está guardado correctamente?

```sql
DECLARE @cedula VARCHAR(20) = 'hernandezjuan'

SELECT 
    CEDULA,
    NOMBRE_USUAR,
    PASSW_HASH,
    LEN(PASSW_HASH) as 'Longitud',
    FECH_CREACION
FROM GN_USUAR
WHERE CEDULA = @cedula;
```

**Resultado esperado - Hash válido:**
```
PASSW_HASH
────────────────────────────────────────────────────────────────
$2b$12$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234

Longitud: 60
```

---

## 🆕 CREAR NUEVOS USUARIOS

### Opción A: Desde Node.js (CLI)

Usa el script que ya existe:

```bash
# Generar hash para contraseña "MiContraseña123!"
node generate-bcrypt-hash.js "MiContraseña123!"

# Output:
# ✅ Hash generado exitosamente:
# $2b$12$ABCDEF...
```

### Opción B: Desde SQL Server (Directo)

Si ya tienes el hash, insértalo directamente:

```sql
-- 1. Generar hash en Node.js (ver Opción A)
-- 2. Copiar el hash que te da
-- 3. Ejecutar esta query:

DECLARE @cedula VARCHAR(20) = '1234567890'
DECLARE @nombre VARCHAR(100) = 'Juan Felipe Hernández'
DECLARE @email VARCHAR(100) = 'hernandezjuanfelipe964@gmail.com'
DECLARE @hash_nuevo VARCHAR(255) = '$2b$12$XXXXXXXX...COPIAPEGAELHASHAAQUI...XXXXXXXX'
DECLARE @nivel INT = 1  -- 1=Empleado, 2=Supervisor, 3=Admin

INSERT INTO GN_USUAR (
    ID_USUAR,
    CEDULA,
    NOMBRE_USUAR,
    EMAIL,
    PASSW_HASH,
    NIVEL_USUAR,
    ESTA_ACTIVO,
    FECH_PROX_CAMBIO
)
VALUES (
    NEWID(),  -- Genera ID único automáticamente
    @cedula,
    @nombre,
    @email,
    @hash_nuevo,
    @nivel,
    1,  -- Activo desde el inicio
    DATEADD(DAY, 90, GETDATE())  -- Debe cambiar pass en 90 días
);

SELECT '✅ Usuario creado exitosamente' AS Resultado;
```

### Opción C: Script Node.js Interactivo

```bash
# Crear un nuevo usuario con validaciones
node create-admin.js  # Usa el que ya existe
```

---

## 🔑 CAMBIAR CONTRASEÑA DE UN USUARIO

### Opción 1: El usuario mismo (desde la interfaz)

El usuario ingresa su contraseña actual y la nueva:

```javascript
// POST /api/auth/cambiar-contrasena
{
  "contraseña_actual": "ContraseñaVieja123!",
  "contraseña_nueva": "ContraseñaNueva456!"
}
```

### Opción 2: Administrador (SSMS)

Si el usuario olvidó la contraseña:

```bash
# Paso 1: Generar nuevo hash
node generate-bcrypt-hash.js "ContraseñaTemporal123!"
# Output: $2b$12$XXXX...

# Paso 2: Ejecutar en SSMS
```

```sql
DECLARE @cedula VARCHAR(20) = 'hernandezjuan'
DECLARE @hash_nuevo VARCHAR(255) = '$2b$12$XXXX...'  -- Pega el hash aquí

UPDATE GN_USUAR
SET 
    PASSW_HASH = @hash_nuevo,
    INTENTOS_FALL = 0,  -- Resetear intentos
    ESTA_BLOQUEADO = 0,  -- Desbloquear
    FECH_ULT_CAMBIO = GETDATE(),
    FECH_PROX_CAMBIO = DATEADD(DAY, 90, GETDATE())
WHERE CEDULA = @cedula;

SELECT '✅ Contraseña actualizada' AS Resultado;
```

---

## 🚨 BLOQUEO POR INTENTOS FALLIDOS

Después de **5 intentos fallidos**, el usuario se bloquea automáticamente:

```sql
-- Ver usuarios bloqueados
SELECT CEDULA, NOMBRE_USUAR, INTENTOS_FALL, FECH_CREACION
FROM GN_USUAR
WHERE ESTA_BLOQUEADO = 1;

-- Desbloquear un usuario
UPDATE GN_USUAR
SET ESTA_BLOQUEADO = 0, INTENTOS_FALL = 0
WHERE CEDULA = 'hernandezjuan';
```

---

## 🛠️ TROUBLESHOOTING: ERROR "Requisitos de seguridad"

### El Problema

Estás ingresando: `hernandezjuanfelipe964@gmail.com` + `$2b$10$XXXX`

El sistema rechaza porque:

1. ❌ Estás usando un **hash** como contraseña (no funciona)
2. ❌ El hash no cumple requisitos (8 caracteres, mayúscula, minúscula, etc.)
3. ✅ **Solución**: Ingresa la **contraseña en TEXTO PLANO**, no el hash

### Pasos Correctos

#### Paso 1: Verificar que el usuario existe

```sql
SELECT CEDULA, NOMBRE_USUAR, PASSW_HASH, ESTA_ACTIVO, ESTA_BLOQUEADO
FROM GN_USUAR
WHERE EMAIL = 'hernandezjuanfelipe964@gmail.com';
```

Si no retorna nada, el usuario **no existe** → Créalo primero.

#### Paso 2: Verificar que el hash está bien

```sql
SELECT 
    CEDULA,
    LEN(PASSW_HASH) as 'Longitud',
    CASE WHEN LEN(PASSW_HASH) >= 60 THEN '✅ Válido'
         ELSE '❌ Incompleto'
    END as 'Estado'
FROM GN_USUAR
WHERE EMAIL = 'hernandezjuanfelipe964@gmail.com';
```

Si la longitud < 60 → El hash está incompleto → Actualiza con uno nuevo:

```bash
node generate-bcrypt-hash.js "TuContraseña123!"
```

#### Paso 3: Cambiar la contraseña en la BD

```sql
DECLARE @email VARCHAR(100) = 'hernandezjuanfelipe964@gmail.com'
DECLARE @hash_nuevo VARCHAR(255) = '$2b$12$...EL_HASH_DE_ARRIBA...'

UPDATE GN_USUAR
SET PASSW_HASH = @hash_nuevo
WHERE EMAIL = @email;
```

#### Paso 4: Intentar login

**Frontend:**
```
Email:       hernandezjuanfelipe964@gmail.com
Contraseña:  TuContraseña123!  ← EN TEXTO PLANO, no el hash
```

---

## 📊 DIAGRAMA COMPLETO

```
┌─────────────────────────┐
│   Usuario en Login      │
└────────────┬────────────┘
             │
       Ingresa: cedula + contraseña (texto plano)
             │
             ↓
┌──────────────────────────────────────┐
│  Backend (Node.js/Express)           │
│  POST /api/auth/login                │
└────────┬─────────────────────────────┘
         │
    Query a BD:
    SELECT * FROM GN_USUAR
    WHERE cedula = ? OR email = ?
         │
         ↓
┌──────────────────────────────────────┐
│  SQL Server - Tabla GN_USUAR         │
│                                      │
│  ID_USUAR: ABC-123                   │
│  CEDULA: hernandezjuan               │
│  EMAIL: hernandezjuanfelipe@...      │
│  PASSW_HASH: $2b$12$XXXXXXX...      │  ← HASH bcrypt
│  NIVEL_USUAR: 3                      │
│  ESTA_ACTIVO: 1                      │
│  ESTA_BLOQUEADO: 0                   │
└──────────────────────────────────────┘
         │
         ↓
Backend compara:
bcrypt.compare("TuContraseña123!", "$2b$12$XXXX...")
         │
         ├─→ ✅ VÁLIDA → Genera JWT, registra sesión
         │               Retorna token
         │
         └─→ ❌ INVÁLIDA → Registra intento fallido
                          Si intentos > 5 → Bloquea usuario
                          Retorna error
```

---

## 📝 CHECKLIST FINAL

- [ ] Verifico que usuario existe en GN_USUAR
- [ ] Verifico que PASSW_HASH tiene longitud >= 60
- [ ] Genero hash nuevo con: `node generate-bcrypt-hash.js "contraseña"`
- [ ] Actualizo el hash en GN_USUAR
- [ ] Intento login con contraseña EN TEXTO PLANO (no el hash)
- [ ] Reviso GN_LOG_ACCESO para ver intentos
- [ ] Verifico GN_SESION para ver sesiones activas

