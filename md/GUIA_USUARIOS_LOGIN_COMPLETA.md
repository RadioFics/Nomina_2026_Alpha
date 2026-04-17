# 🔐 GUÍA COMPLETA: Usuarios, Login y Estructura de Datos

## 📋 Tabla de Contenidos
1. [Dónde se guardan los datos](#dónde-se-guardan-los-datos)
2. [Estructura de tablas](#estructura-de-tablas)
3. [Qué usuarios pueden ingresar](#qué-usuarios-pueden-ingresar)
4. [Cómo validar datos guardados](#cómo-validar-datos-guardados)
5. [Caso de estudio: hernandezjuanfelipe964@gmail.com](#caso-de-estudio-hernandezjuanfelipe964gmailcom)
6. [Scripts de gestión de usuarios](#scripts-de-gestión-de-usuarios)

---

## 🗄️ Dónde se guardan los datos

### Tabla Principal: GN_USUAR
**BASE DE DATOS:** MineDax  
**SERVIDOR:** CM-ITD-P-05\SQLEXPRESS

```
GN_USUAR (Tabla de Usuarios)
├─ ID_USUAR (UNIQUEIDENTIFIER) → ID único del usuario
├─ CEDULA (VARCHAR 20) → Cédula/identificación
├─ NOMBRE_USUAR (VARCHAR 100) → Nombre del usuario
├─ EMAIL (VARCHAR 100) → Email (puede ser NULL)
├─ PASSW_HASH (VARCHAR 255) → Contraseña HASHEADA con bcrypt
├─ NIVEL_USUAR (INT) → Nivel: 1=Empleado, 2=Supervisor, 3=Admin
├─ ESTA_ACTIVO (BIT) → 1=Activo, 0=Inactivo
├─ ESTA_BLOQUEADO (BIT) → 1=Bloqueado (5+ intentos fallidos), 0=No bloqueado
├─ INTENTOS_FALL (INT) → Contador de intentos fallidos
├─ FECH_ULT_CAMBIO (DATETIME) → Cuándo cambió la contraseña
├─ FECH_PROX_CAMBIO (DATETIME) → Cuándo debe cambiar (cada 90 días)
├─ FECH_CREACION (DATETIME) → Cuándo se creó
└─ FECH_MODIF (DATETIME) → Última modificación
```

### Tablas Relacionadas:

**GN_SESION** - Registra sesiones activas
```
├─ ID_SESION (UNIQUEIDENTIFIER)
├─ ID_USUAR → FK a GN_USUAR
├─ CEDULA
├─ FECH_INICIO, FECH_CIERRE → Cuándo inició/cerró sesión
├─ IP_DIRECCION → IP de donde se conectó
├─ USER_AGENT → Navegador/dispositivo
├─ ESTA_ACTIVA → Si la sesión está activa
└─ (Auditoría de acceso)
```

**GN_ROL_USUAR** - Roles del usuario
```
├─ ID_ROL_USUAR
├─ ID_USUAR → FK a GN_USUAR
├─ COD_ROL → ADMIN, RRHH, SUPERVISOR, EMPLEADO
├─ NOM_ROL → Nombre del rol
└─ ESTA_ACTIVO
```

**GN_LOG_ACCESO** - Auditoría de eventos
```
├─ ID_LOG
├─ ID_USUAR
├─ CEDULA
├─ TIPO_EVENTO → LOGIN, LOGOUT, CAMBIO_PASS, ERROR, etc.
├─ ESTADO → EXITOSO, FALLIDO, BLOQUEADO
├─ MENSAJE → Descripción
└─ FECH_EVENTO → Cuándo ocurrió
```

**GN_FUNCI** - Datos de empleados (fuente de información)
```
├─ COD_FUNCI (INT) → ID del empleado
├─ COD_TERC → FK a GN_TERCE
├─ NUM_IDEN → Número de identidad (cédula)
├─ COD_CARGO → Código del cargo
├─ FEC_INGRES → Fecha de ingreso
├─ ACT_ESTA → Estado (A=Activo)
└─ (Muchos campos más de nómina)
```

**GN_TERCE** - Datos de personas (terceros)
```
├─ COD_TERC → ID de la persona
├─ NUM_IDEN → Número de identidad
├─ NOM_COMP → Nombre completo
├─ NOM_TERC, APE_TERC → Nombre y apellido
├─ DIR_MAIL → Email
├─ TEL_TERC → Teléfono
└─ ACT_INAC → Estado
```

---

## 🔗 Relación entre Tablas

```
FLUJO DE CREACIÓN DE USUARIO:

1. DATOS EXISTEN EN:
   GN_TERCE (persona/tercero)
   └─ COD_TERC, NUM_IDEN, NOM_COMP, DIR_MAIL
   
   GN_FUNCI (empleado)
   └─ COD_FUNCI, COD_TERC, NUM_IDEN, COD_CARGO

2. SE CREAN EN:
   GN_USUAR (usuario de acceso)
   ├─ CEDULA = NUM_IDEN (de GN_FUNCI)
   ├─ NOMBRE_USUAR = NOM_COMP (de GN_TERCE)
   ├─ EMAIL = DIR_MAIL (de GN_TERCE) [opcional]
   └─ PASSW_HASH = bcrypt(contraseña ingresada)

3. SE REGISTRAN EN:
   GN_ROL_USUAR (qué puede hacer)
   └─ ID_USUAR → COD_ROL
   
   GN_SESION (dónde entra)
   └─ ID_USUAR → Cuando inicia sesión
   
   GN_LOG_ACCESO (auditoría)
   └─ ID_USUAR → Todos los eventos
```

---

## 📊 Estructura de Tablas Detallada

### GN_USUAR - Tabla Completa

```sql
CREATE TABLE GN_USUAR (
    -- Identificadores
    ID_USUAR        UNIQUEIDENTIFIER PRIMARY KEY DEFAULT NEWID(),
    CEDULA          VARCHAR(20) NOT NULL UNIQUE,
    NOMBRE_USUAR    VARCHAR(100) NOT NULL,

    -- Autenticación
    PASSW_HASH      VARCHAR(255) NOT NULL,          -- Hash bcrypt
    EMAIL           VARCHAR(100),                    -- Puede ser NULL

    -- Jerarquía
    COD_DEPART      VARCHAR(10),
    COD_CARGO       VARCHAR(10),
    NIVEL_USUAR     INT DEFAULT 1,                  -- 1,2,3

    -- Estado del usuario
    ESTA_ACTIVO     BIT DEFAULT 1,                  -- 1=Sí, 0=No
    ESTA_BLOQUEADO  BIT DEFAULT 0,                  -- Por intentos fallidos
    INTENTOS_FALL   INT DEFAULT 0,                  -- Contador

    -- Contraseña
    DIAS_CAMBIO_PASS INT DEFAULT 90,
    FECH_ULT_CAMBIO DATETIME,
    FECH_PROX_CAMBIO DATETIME,

    -- Auditoría
    FECH_CREACION   DATETIME DEFAULT GETDATE(),
    USUAR_CREACION  VARCHAR(100),
    FECH_MODIF      DATETIME,
    USUAR_MODIF     VARCHAR(100),

    INDEX IX_CEDULA (CEDULA),
    INDEX IX_EMAIL (EMAIL),
    INDEX IX_ACTIVO (ESTA_ACTIVO)
);
```

---

## 🔓 Qué Usuarios Pueden Ingresar

### Criterios de Acceso:

Un usuario **SÍ PUEDE ingresar** si cumple:

✅ **Existe en GN_USUAR** con:
- ✅ CEDULA o EMAIL válido
- ✅ PASSW_HASH válido (60+ caracteres, bcrypt)
- ✅ ESTA_ACTIVO = 1
- ✅ ESTA_BLOQUEADO = 0
- ✅ INTENTOS_FALL < 5

Un usuario **NO PUEDE ingresar** si:

❌ No existe en GN_USUAR
❌ ESTA_ACTIVO = 0 (usuario desactivado)
❌ ESTA_BLOQUEADO = 1 (bloqueado por intentos fallidos)
❌ PASSW_HASH incorrecto o incompleto (< 60 caracteres)
❌ Contraseña NO coincide después de bcrypt.compare()

### Niveles de Usuario:

| Nivel | Rol | Permisos |
|-------|-----|----------|
| 1 | EMPLEADO | Ver nómina personal |
| 2 | SUPERVISOR | Ver nóminas del equipo |
| 3 | ADMINISTRADOR | Gestión completa, crear/editar usuarios |

---

## ✅ Cómo Validar Datos Guardados

### 1️⃣ Verificar que el usuario existe

**En SSMS ejecuta:**

```sql
SELECT 
    ID_USUAR,
    CEDULA,
    NOMBRE_USUAR,
    EMAIL,
    NIVEL_USUAR,
    ESTA_ACTIVO,
    FECH_CREACION
FROM GN_USUAR
WHERE EMAIL = 'hernandezjuanfelipe964@gmail.com' 
   OR CEDULA LIKE '%hernandez%'
ORDER BY FECH_CREACION DESC;
```

**Resultado esperado:**
```
ID_USUAR                        | CEDULA | NOMBRE_USUAR | EMAIL | NIVEL_USUAR | ESTA_ACTIVO | FECH_CREACION
550e8400-e29b-41d4-...         | 1234567890 | Hernández Juan Felipe | hernandezjuanfelipe964@gmail.com | 1 | 1 | 2024-04-14
```

### 2️⃣ Verificar que la contraseña está grabada correctamente

```sql
SELECT 
    CEDULA,
    EMAIL,
    PASSW_HASH,
    LEN(PASSW_HASH) as 'Longitud_Hash',
    ESTA_ACTIVO,
    ESTA_BLOQUEADO,
    INTENTOS_FALL
FROM GN_USUAR
WHERE EMAIL = 'hernandezjuanfelipe964@gmail.com';
```

**Validaciones:**

| Campo | Valor esperado | Acción si no |
|-------|----------------|-------------|
| LEN(PASSW_HASH) | 60 | ❌ Hash incompleto → Regenerar |
| Comienza con | $2a$, $2b$, $2y$ | ❌ No es bcrypt → Regenerar |
| ESTA_ACTIVO | 1 | ❌ Es 0 → `UPDATE ... SET ESTA_ACTIVO = 1` |
| ESTA_BLOQUEADO | 0 | ❌ Es 1 → `UPDATE ... SET ESTA_BLOQUEADO = 0, INTENTOS_FALL = 0` |

### 3️⃣ Verificar el flujo de login en auditoría

```sql
SELECT TOP 20
    CEDULA,
    TIPO_EVENTO,
    ESTADO,
    MENSAJE,
    FECH_EVENTO
FROM GN_LOG_ACCESO
WHERE CEDULA = 'hernandezjuanfelipe964@gmail.com'
   OR ID_USUAR = (SELECT ID_USUAR FROM GN_USUAR WHERE EMAIL = 'hernandezjuanfelipe964@gmail.com')
ORDER BY FECH_EVENTO DESC;
```

**Resultado esperado:**
```
CEDULA | TIPO_EVENTO | ESTADO | MENSAJE | FECH_EVENTO
hernandezjuanfelipe964@gmail.com | LOGIN | EXITOSO | Login exitoso | 2024-04-14 14:30:00
hernandezjuanfelipe964@gmail.com | LOGIN | FALLIDO | Contraseña incorrecta | 2024-04-14 14:29:30
```

### 4️⃣ Verificar sesiones activas

```sql
SELECT 
    s.ID_SESION,
    s.CEDULA,
    s.FECH_INICIO,
    s.FECH_CIERRE,
    s.IP_DIRECCION,
    s.DISPOSITIVO,
    s.ESTA_ACTIVA
FROM GN_SESION s
JOIN GN_USUAR u ON s.ID_USUAR = u.ID_USUAR
WHERE u.EMAIL = 'hernandezjuanfelipe964@gmail.com'
ORDER BY s.FECH_INICIO DESC;
```

---

## 🎯 Caso de Estudio: hernandezjuanfelipe964@gmail.com

### Escenario: Usuario intenta ingresar y falla

**Paso 1: Determinar por qué falla**

```sql
DECLARE @email VARCHAR(100) = 'hernandezjuanfelipe964@gmail.com';

SELECT 
    'USUARIO EXISTE?' as Pregunta,
    CASE WHEN COUNT(*) > 0 THEN 'SÍ' ELSE 'NO' END as Respuesta
FROM GN_USUAR
WHERE EMAIL = @email;
```

### Caso A: El usuario NO existe

```sql
-- 1. Verificar si los datos existen en GN_FUNCI/GN_TERCE
SELECT 
    f.COD_FUNCI,
    f.NUM_IDEN,
    t.NOM_COMP,
    t.DIR_MAIL,
    t.TEL_TERC
FROM GN_FUNCI f
JOIN GN_TERCE t ON f.COD_TERC = t.COD_TERC
WHERE t.DIR_MAIL = 'hernandezjuanfelipe964@gmail.com'
   OR f.NUM_IDEN LIKE '%hernandez%';

-- 2. Si el empleado existe, crear el usuario:
INSERT INTO GN_USUAR (
    ID_USUAR,
    CEDULA,
    NOMBRE_USUAR,
    PASSW_HASH,
    EMAIL,
    COD_DEPART,
    COD_CARGO,
    NIVEL_USUAR,
    ESTA_ACTIVO,
    USUAR_CREACION,
    FECH_PROX_CAMBIO
)
SELECT
    NEWID(),
    f.NUM_IDEN,
    t.NOM_COMP,
    '$2b$10$HASH_BCRYPT_AQUI',  -- Reemplazar con hash real
    t.DIR_MAIL,
    f.COD_DEPART,  -- Si existe
    f.COD_CARGO,
    1,  -- Nivel 1 = Empleado
    1,  -- Activo
    'SISTEMA',
    DATEADD(DAY, 90, GETDATE())
FROM GN_FUNCI f
JOIN GN_TERCE t ON f.COD_TERC = t.COD_TERC
WHERE t.DIR_MAIL = 'hernandezjuanfelipe964@gmail.com';

-- 3. Asignar rol
INSERT INTO GN_ROL_USUAR (
    ID_USUAR,
    COD_ROL,
    NOM_ROL,
    ESTA_ACTIVO
)
SELECT
    ID_USUAR,
    'EMPLEADO',
    'Empleado',
    1
FROM GN_USUAR
WHERE EMAIL = 'hernandezjuanfelipe964@gmail.com';
```

### Caso B: El usuario existe pero está INACTIVO

```sql
-- Activar el usuario
UPDATE GN_USUAR
SET ESTA_ACTIVO = 1
WHERE EMAIL = 'hernandezjuanfelipe964@gmail.com';

-- Verificar
SELECT CEDULA, NOMBRE_USUAR, ESTA_ACTIVO
FROM GN_USUAR
WHERE EMAIL = 'hernandezjuanfelipe964@gmail.com';
```

### Caso C: El usuario existe pero está BLOQUEADO

```sql
-- Desbloquear
UPDATE GN_USUAR
SET 
    ESTA_BLOQUEADO = 0,
    INTENTOS_FALL = 0
WHERE EMAIL = 'hernandezjuanfelipe964@gmail.com';

-- Verificar
SELECT CEDULA, NOMBRE_USUAR, ESTA_BLOQUEADO, INTENTOS_FALL
FROM GN_USUAR
WHERE EMAIL = 'hernandezjuanfelipe964@gmail.com';
```

### Caso D: El HASH está incompleto

```sql
-- Ver el hash actual
SELECT 
    CEDULA,
    PASSW_HASH,
    LEN(PASSW_HASH) as Longitud
FROM GN_USUAR
WHERE EMAIL = 'hernandezjuanfelipe964@gmail.com';

-- Si Longitud < 60, necesita nuevo hash
-- Generar nuevo hash en Node.js y actualizar:

UPDATE GN_USUAR
SET 
    PASSW_HASH = '$2b$10$NUEVO_HASH_BCRYPT_AQUI',  -- 60+ caracteres
    INTENTOS_FALL = 0,
    ESTA_BLOQUEADO = 0
WHERE EMAIL = 'hernandezjuanfelipe964@gmail.com';
```

---

## 🛠️ Scripts de Gestión de Usuarios

### Script 1: Generar Hash BCrypt

Crea un archivo: `generate-bcrypt.js`

```javascript
#!/usr/bin/env node
const bcrypt = require('bcryptjs');

async function generarHash(contrasena) {
  try {
    if (!contrasena) {
      console.log('Uso: node generate-bcrypt.js "tu-contrasena"');
      console.log('\nEjemplos:');
      console.log('  node generate-bcrypt.js "Hernandez@2024"');
      console.log('  node generate-bcrypt.js "Password123!"');
      process.exit(1);
    }

    // Validar requisitos
    const hasUppercase = /[A-Z]/.test(contrasena);
    const hasLowercase = /[a-z]/.test(contrasena);
    const hasNumbers = /[0-9]/.test(contrasena);
    const hasSpecial = /[!@#$%^&*]/.test(contrasena);
    const hasMinLength = contrasena.length >= 8;

    console.log('\n📋 VALIDACIÓN DE CONTRASEÑA:\n');
    console.log('  ' + (hasMinLength ? '✅' : '❌') + ' Mínimo 8 caracteres');
    console.log('  ' + (hasUppercase ? '✅' : '❌') + ' Al menos una mayúscula');
    console.log('  ' + (hasLowercase ? '✅' : '❌') + ' Al menos una minúscula');
    console.log('  ' + (hasNumbers ? '✅' : '❌') + ' Al menos un número');
    console.log('  ' + (hasSpecial ? '✅' : '❌') + ' Al menos un símbolo (!@#$%^&*)');

    if (!hasMinLength || !hasUppercase || !hasLowercase || !hasNumbers || !hasSpecial) {
      console.log('\n❌ La contraseña no cumple los requisitos\n');
      process.exit(1);
    }

    // Generar hash
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(contrasena, salt);

    console.log('\n✅ HASH GENERADO:\n');
    console.log(hash);
    console.log('\n📋 COPIA ESTE HASH Y ÚSALO EN LA BD:\n');
    console.log('UPDATE GN_USUAR');
    console.log("SET PASSW_HASH = '" + hash + "'");
    console.log("WHERE EMAIL = 'hernandezjuanfelipe964@gmail.com';\n");

  } catch (err) {
    console.error('❌ ERROR:', err.message);
    process.exit(1);
  }
}

generarHash(process.argv[2]);
```

**Uso:**
```bash
node generate-bcrypt.js "Hernandez@2024"
```

**Output:**
```
✅ HASH GENERADO:

$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234

📋 COPIA ESTE HASH Y ÚSALO EN LA BD:

UPDATE GN_USUAR
SET PASSW_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234'
WHERE EMAIL = 'hernandezjuanfelipe964@gmail.com';
```

---

### Script 2: Crear Usuario desde Empleado

Crea un archivo: `crear-usuario-desde-empleado.js`

```javascript
#!/usr/bin/env node
require('dotenv').config();
const { executeQuery } = require('./config/database');
const bcrypt = require('bcryptjs');

async function crearUsuario(email, contrasena) {
  try {
    console.log('🚀 CREAR USUARIO DESDE EMPLEADO\n');

    // 1. Buscar empleado
    console.log('Paso 1: Buscando empleado...');
    const empleadoQuery = `
      SELECT TOP 1
        f.COD_FUNCI,
        f.NUM_IDEN,
        f.COD_DEPART,
        f.COD_CARGO,
        t.NOM_COMP,
        t.DIR_MAIL
      FROM GN_FUNCI f
      JOIN GN_TERCE t ON f.COD_TERC = t.COD_TERC
      WHERE t.DIR_MAIL = @email
    `;

    const empleado = await executeQuery(empleadoQuery, { email });

    if (!empleado.recordset || empleado.recordset.length === 0) {
      console.log('❌ No se encontró empleado con email: ' + email);
      return;
    }

    const emp = empleado.recordset[0];
    console.log('✅ Empleado encontrado:', emp.NOM_COMP);

    // 2. Generar hash
    console.log('\nPaso 2: Generando hash de contraseña...');
    const salt = await bcrypt.genSalt(10);
    const hash = await bcrypt.hash(contrasena, salt);
    console.log('✅ Hash generado');

    // 3. Crear usuario
    console.log('\nPaso 3: Creando usuario...');
    const crearQuery = `
      DECLARE @ID_USUAR UNIQUEIDENTIFIER = NEWID();

      INSERT INTO GN_USUAR (
        ID_USUAR, CEDULA, NOMBRE_USUAR, PASSW_HASH, EMAIL,
        COD_DEPART, COD_CARGO, NIVEL_USUAR, ESTA_ACTIVO,
        USUAR_CREACION, FECH_PROX_CAMBIO
      )
      VALUES (
        @ID_USUAR, @cedula, @nombre, @hash, @email,
        @depart, @cargo, 1, 1,
        'SISTEMA', DATEADD(DAY, 90, GETDATE())
      );

      INSERT INTO GN_ROL_USUAR (ID_USUAR, COD_ROL, NOM_ROL, ESTA_ACTIVO)
      VALUES (@ID_USUAR, 'EMPLEADO', 'Empleado', 1);

      SELECT @ID_USUAR as ID_USUAR;
    `;

    const resultado = await executeQuery(crearQuery, {
      cedula: emp.NUM_IDEN,
      nombre: emp.NOM_COMP,
      hash,
      email: emp.DIR_MAIL,
      depart: emp.COD_DEPART,
      cargo: emp.COD_CARGO
    });

    console.log('✅ Usuario creado exitosamente');
    console.log('\n📊 DATOS DEL NUEVO USUARIO:\n');
    console.log('  Cédula/ID:    ', emp.NUM_IDEN);
    console.log('  Nombre:       ', emp.NOM_COMP);
    console.log('  Email:        ', emp.DIR_MAIL);
    console.log('  Nivel:        ', '1 (Empleado)');
    console.log('  Departamento: ', emp.COD_DEPART);
    console.log('  Cargo:        ', emp.COD_CARGO);
    console.log('\n🔐 CREDENCIALES DE ACCESO:\n');
    console.log('  Email:        ', emp.DIR_MAIL);
    console.log('  Contraseña:   ', contrasena);
    console.log('\n✅ El usuario puede ingresar a: http://localhost:3000\n');

  } catch (err) {
    console.error('❌ ERROR:', err.message);
  }
}

// Uso desde línea de comandos
const email = process.argv[2];
const contrasena = process.argv[3];

if (!email || !contrasena) {
  console.log('Uso: node crear-usuario-desde-empleado.js "email@example.com" "Contrasena123!"\n');
  process.exit(1);
}

crearUsuario(email, contrasena);
```

**Uso:**
```bash
node crear-usuario-desde-empleado.js "hernandezjuanfelipe964@gmail.com" "Hernandez@2024"
```

---

### Script 3: Ver Estado Completo del Usuario

Crea un archivo: `ver-usuario.js`

```javascript
#!/usr/bin/env node
require('dotenv').config();
const { executeQuery } = require('./config/database');

async function verUsuario(email) {
  try {
    console.log('\n📋 INFORMACIÓN COMPLETA DEL USUARIO:\n');

    const query = `
      SELECT 
        u.ID_USUAR,
        u.CEDULA,
        u.NOMBRE_USUAR,
        u.EMAIL,
        u.NIVEL_USUAR,
        u.ESTA_ACTIVO,
        u.ESTA_BLOQUEADO,
        u.INTENTOS_FALL,
        u.PASSW_HASH,
        LEN(u.PASSW_HASH) as Longitud_Hash,
        u.FECH_ULT_CAMBIO,
        u.FECH_PROX_CAMBIO,
        u.FECH_CREACION,
        r.COD_ROL,
        r.NOM_ROL
      FROM GN_USUAR u
      LEFT JOIN GN_ROL_USUAR r ON u.ID_USUAR = r.ID_USUAR
      WHERE u.EMAIL = @email OR u.CEDULA = @email
    `;

    const result = await executeQuery(query, { email });

    if (!result.recordset || result.recordset.length === 0) {
      console.log('❌ Usuario no encontrado:', email);
      return;
    }

    const usuario = result.recordset[0];

    console.log('IDENTIDAD:');
    console.log('  ID Usuario:        ', usuario.ID_USUAR);
    console.log('  Cédula:            ', usuario.CEDULA);
    console.log('  Nombre:            ', usuario.NOMBRE_USUAR);
    console.log('  Email:             ', usuario.EMAIL);

    console.log('\nACCESO:');
    console.log('  Nivel:             ', usuario.NIVEL_USUAR === 1 ? 'EMPLEADO' : usuario.NIVEL_USUAR === 2 ? 'SUPERVISOR' : 'ADMINISTRADOR');
    console.log('  Activo:            ', usuario.ESTA_ACTIVO === 1 ? '✅ SÍ' : '❌ NO');
    console.log('  Bloqueado:         ', usuario.ESTA_BLOQUEADO === 1 ? '❌ SÍ (por intentos fallidos)' : '✅ NO');
    console.log('  Intentos fallidos: ', usuario.INTENTOS_FALL);

    console.log('\nCONTRASEÑA:');
    console.log('  Hash length:       ', usuario.Longitud_Hash, usuario.Longitud_Hash >= 60 ? '✅' : '❌ (INCOMPLETO)');
    console.log('  Últi cambio:       ', usuario.FECH_ULT_CAMBIO || 'Nunca');
    console.log('  Próx cambio req:   ', usuario.FECH_PROX_CAMBIO);

    console.log('\nROL:');
    console.log('  Código:            ', usuario.COD_ROL);
    console.log('  Descripción:       ', usuario.NOM_ROL);

    console.log('\nAUDITORÍA:');
    console.log('  Creado:            ', usuario.FECH_CREACION);
    console.log('  Modificado:        ', usuario.FECH_MODIF || 'Nunca');

    // Validar que pueda ingresar
    console.log('\n🔐 ¿PUEDE INGRESAR?');
    let puedeIngresar = true;

    if (!usuario.CEDULA) {
      console.log('  ❌ Sin cédula');
      puedeIngresar = false;
    } else {
      console.log('  ✅ Tiene cédula');
    }

    if (!usuario.PASSW_HASH || usuario.Longitud_Hash < 60) {
      console.log('  ❌ Hash de contraseña incompleto');
      puedeIngresar = false;
    } else {
      console.log('  ✅ Hash válido');
    }

    if (usuario.ESTA_ACTIVO !== 1) {
      console.log('  ❌ Usuario inactivo');
      puedeIngresar = false;
    } else {
      console.log('  ✅ Usuario activo');
    }

    if (usuario.ESTA_BLOQUEADO === 1) {
      console.log('  ❌ Usuario bloqueado (intentos fallidos)');
      puedeIngresar = false;
    } else {
      console.log('  ✅ Usuario no bloqueado');
    }

    console.log('\n' + (puedeIngresar ? '✅ SÍ puede ingresar' : '❌ NO puede ingresar') + '\n');

  } catch (err) {
    console.error('❌ ERROR:', err.message);
  }
}

const email = process.argv[2];

if (!email) {
  console.log('Uso: node ver-usuario.js "email@example.com" o "cedula"\n');
  process.exit(1);
}

verUsuario(email);
```

**Uso:**
```bash
node ver-usuario.js "hernandezjuanfelipe964@gmail.com"
```

---

## 📝 Resumen de Dónde se Guardan los Datos

| Información | Tabla | Campo | Tipo |
|-----------|-------|-------|------|
| **ID único** | GN_USUAR | ID_USUAR | UNIQUEIDENTIFIER |
| **Cédula/ID** | GN_USUAR | CEDULA | VARCHAR(20) |
| **Nombre** | GN_USUAR | NOMBRE_USUAR | VARCHAR(100) |
| **Email** | GN_USUAR | EMAIL | VARCHAR(100) |
| **Contraseña** | GN_USUAR | PASSW_HASH | VARCHAR(255) - Bcrypt |
| **Nivel acceso** | GN_USUAR | NIVEL_USUAR | INT (1,2,3) |
| **Estado activo** | GN_USUAR | ESTA_ACTIVO | BIT (1=Sí, 0=No) |
| **Bloqueado** | GN_USUAR | ESTA_BLOQUEADO | BIT |
| **Intentos fallidos** | GN_USUAR | INTENTOS_FALL | INT |
| **Sesión activa** | GN_SESION | * | Toda la fila |
| **Rol del usuario** | GN_ROL_USUAR | * | Toda la fila |
| **Auditoría/eventos** | GN_LOG_ACCESO | * | Toda la fila |

---

## ✅ Checklist para Válidos de Usuarios

Antes de que un usuario intente ingresar, verifica:

```sql
-- Verificación rápida para cualquier usuario
SELECT 
    CASE WHEN COUNT(*) > 0 THEN '✅ Existe' ELSE '❌ No existe' END as Existe,
    (SELECT COUNT(*) FROM GN_USUAR WHERE ESTA_ACTIVO = 1 AND EMAIL = @email) 
        as [Está Activo],
    (SELECT COUNT(*) FROM GN_USUAR WHERE ESTA_BLOQUEADO = 0 AND EMAIL = @email) 
        as [No Bloqueado],
    (SELECT LEN(PASSW_HASH) FROM GN_USUAR WHERE EMAIL = @email) 
        as [Longitud Hash]
FROM GN_USUAR
WHERE EMAIL = @email;
```

---

**Versión:** 1.0  
**Última actualización:** 2026-04-14  
**Autor:** Sistema de Autenticación Collective Mining
