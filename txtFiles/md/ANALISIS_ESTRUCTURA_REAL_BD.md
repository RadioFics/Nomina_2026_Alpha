# 🔍 ANÁLISIS: Estructura REAL vs Estructura Generada

## ⚠️ El Problema

Se creó código basado en una estructura de BD **NUEVA**, pero la BD **YA TIENE OTRA ESTRUCTURA COMPLETAMENTE DIFERENTE**.

**Consecuencia:** 
- ❌ Código generado busca columnas que NO existen (ID_USUAR, CEDULA, PASSW_HASH, etc.)
- ✅ BD real tiene otras columnas (COD_USUA, NOM_USUA, PAS_USUA, PAS_HASH, etc.)
- ❌ Tablas creadas en código NO existen (GN_ROL_USUAR, GN_PERMISOS, etc.)
- ✅ BD real YA tiene esas tablas pero CON OTROS NOMBRES (GN_GUSUA, GN_PERMI, etc.)

---

## 📊 COMPARACIÓN: Estructura Esperada vs Estructura Real

### Tabla de Usuarios

| Propósito | Código Generado | Estructura Real |
|-----------|-----------------|-----------------|
| **ID Principal** | ID_USUAR (UNIQUEIDENTIFIER) | COD_USUA (bigint IDENTITY) |
| **Empresa** | (no existe) | COD_EMPR (smallint) |
| **Cédula** | CEDULA (VARCHAR 20) | (no existe, está en GN_TERCE.NUM_IDEN) |
| **Nombre** | NOMBRE_USUAR (VARCHAR 100) | NOM_USUA (char 240) |
| **Email** | EMAIL (VARCHAR 100) | DIR_ELEC (char 100) |
| **Contraseña texto** | (no existe) | PAS_USUA (char 16) |
| **Contraseña hash** | PASSW_HASH (VARCHAR 255) | PAS_HASH (varchar 255) |
| **Nivel/Rol** | NIVEL_USUAR (INT 1-3) | (no existe, está en GN_GUSUA/GN_PERMI) |
| **Activo** | ESTA_ACTIVO (BIT) | ACT_INAC (char 'S'/'N') |
| **Bloqueado** | ESTA_BLOQUEADO (BIT) | IND_BLOQ (char 'S'/'N') |
| **Intentos fallidos** | INTENTOS_FALL (INT) | INT_FALL (smallint) |
| **FK a Empleado** | (no existe) | COD_FUNCI (int, FK a GN_FUNCI) |
| **FK a Grupo Usuarios** | (no existe) | COD_GUSU (bigint, no en GN_USUAR) |

### Tablas de Roles y Permisos

| Propósito | Código Generado | Estructura Real |
|-----------|-----------------|-----------------|
| **Grupos de Usuarios** | GN_ROL_USUAR (nueva) | GN_GUSUA (ya existe) |
| **Permisos Granulares** | GN_PERMISOS (nueva) | GN_PERMI (ya existe) |
| **Auditoría** | GN_LOG_ACCESO (nueva) | GN_LOG_ACCE (ya existe) |
| **Sesiones** | GN_SESION (nueva) | GN_SESION (ya existe) |

---

## 🗄️ Estructura REAL Completa

### 1. GN_USUAR (Usuarios del Sistema) ✅ YA EXISTE

```sql
CREATE TABLE GN_USUAR (
    -- Identificadores
    COD_EMPR      smallint NOT NULL,        -- Empresa (default 1)
    COD_USUA      bigint IDENTITY(1,1),     -- ID usuario (PK)
    
    -- Datos de usuario
    NOM_USUA      char(240) NOT NULL,       -- Nombre usuario
    ABR_USUA      char(8),                  -- Abreviatura
    DIR_ELEC      char(100),                -- Email
    
    -- Contraseñas
    PAS_USUA      char(16),                 -- Contraseña en texto (legacy)
    PAS_HASH      varchar(255),             -- Hash bcrypt (nuevo)
    CAM_PASS      char(1),                  -- Cambiar contraseña? (S/N)
    
    -- Estado del usuario
    ACT_INAC      char(1),                  -- Activo/Inactivo (S/N)
    FEC_ACTI      datetime,                 -- Fecha activación
    FEC_EXPI      datetime,                 -- Fecha expiración
    
    -- Bloqueos y seguridad
    INT_FALL      smallint DEFAULT 0,       -- Intentos fallidos
    IND_BLOQ      char(1) DEFAULT 'N',      -- Bloqueado (S/N)
    DES_BLOQ      varchar(50),              -- Descripción bloqueo
    NRO_DICP      int,                      -- Número días cambio pass
    FEC_ULCA      datetime,                 -- Fecha último cambio
    
    -- Enlaces
    COD_FUNCI     int,                      -- FK a GN_FUNCI (empleado)
    COD_GUSU      bigint,                   -- FK a GN_GUSUA (grupo usuario) - puede estar fuera
    
    -- Auditoría
    ACT_USUA      char(8) NOT NULL,         -- Usuario que creó/modificó
    ACT_HORA      datetime NOT NULL,        -- Hora de creación/modificación
    ACT_ESTA      char(1) NOT NULL,         -- Estado registro (A/B/I)
    
    -- Otros
    USU_LARG      varchar(100),             -- Usuario login (largo)
    TIP_USUA      char(1),                  -- Tipo usuario
    USU_TWEB      char(1),                  -- Usuario web? (S/N)
    USU_TMOV      char(1),                  -- Usuario móvil? (S/N)
    TOK_RECO      varchar(100),             -- Token recuperación
    FEC_TOKE      datetime,                 -- Fecha token
    
    PRIMARY KEY (COD_EMPR, COD_USUA)
);
```

### 2. GN_FUNCI (Empleados) ✅ YA EXISTE

```sql
CREATE TABLE GN_FUNCI (
    COD_EMPR      smallint NOT NULL,
    COD_FUNCI     int IDENTITY(1,1) NOT NULL,  -- ID función/empleado
    COD_TERC      decimal(13,0) NOT NULL,      -- FK a GN_TERCE
    
    -- Datos laborales
    COD_CARGO     int,                         -- Código cargo
    COD_CCOST     int,                         -- Código centro costo
    FEC_INGRES    nchar(10),                   -- Fecha ingreso
    FEC_RETIRO    nchar(10),                   -- Fecha retiro
    FEC_FINAL     nchar(10),                   -- Fecha final
    
    -- Datos personales
    SEX_FUNC      char(1),                     -- Sexo
    FEC_NAC       datetime,                    -- Fecha nacimiento
    CNT_HIJO      int,                         -- Cantidad hijos
    
    -- Auditoría
    ACT_USUA      char(8) NOT NULL,
    ACT_HORA      datetime NOT NULL,
    ACT_ESTA      char(1) NOT NULL,            -- A = Activo
    
    PRIMARY KEY (COD_EMPR, COD_FUNCI),
    FOREIGN KEY (COD_TERC) REFERENCES GN_TERCE(COD_TERC)
);
```

### 3. GN_TERCE (Terceros/Personas) ✅ YA EXISTE

```sql
CREATE TABLE GN_TERCE (
    COD_EMPR      smallint NOT NULL,
    COD_TERC      decimal(13,0) IDENTITY(0,1),  -- ID persona (PK)
    
    -- Identificación
    NUM_IDEN      bigint,                       -- Número identidad (cédula)
    DIG_VERI      smallint,                     -- Dígito verificación
    
    -- Nombres
    NOM_COMP      varchar(240),                 -- Nombre completo
    NOM_TERC      char(40),                     -- Primer nombre
    SEG_NOMB      varchar(40),                  -- Segundo nombre
    APE_TERC      char(40),                     -- Primer apellido
    SEG_APEL      varchar(40),                  -- Segundo apellido
    
    -- Contacto
    DIR_MAIL      varchar(150),                 -- Email
    TEL_TERC      char(30),                     -- Teléfono
    TEL_TERC2     char(40),                     -- Teléfono 2
    DIR_TERC      char(120),                    -- Dirección
    
    -- Estado
    ACT_INAC      char(1),                      -- Activo/Inactivo
    
    -- Auditoría
    ACT_USUA      char(8) NOT NULL,
    ACT_HORA      datetime NOT NULL,
    ACT_ESTA      char(1) NOT NULL,
    
    PRIMARY KEY (COD_EMPR, COD_TERC)
);
```

### 4. GN_SESION (Sesiones) ✅ YA EXISTE

```sql
CREATE TABLE GN_SESION (
    COD_SESI      uniqueidentifier PRIMARY KEY,  -- ID sesión
    COD_USUA      bigint NOT NULL,               -- FK a GN_USUAR
    COD_TERC      decimal(18,0),                 -- FK a GN_TERCE (redundante)
    
    -- Tiempos
    FEC_INIC      datetime NOT NULL,             -- Fecha inicio
    FEC_ULAC      datetime NOT NULL,             -- Fecha última actividad
    FEC_CIER      datetime,                      -- Fecha cierre
    
    -- Dispositivo
    IP_ORIG       varchar(50),                   -- IP origen
    AGE_HTTP      varchar(500),                  -- User-Agent
    DIS_TIPO      varchar(100),                  -- Tipo dispositivo
    
    -- Estado
    EST_SESI      char(1) NOT NULL,              -- Estado (A = Activo)
    
    -- Auditoría
    ACT_USUA      char(8) NOT NULL,
    ACT_HORA      datetime NOT NULL,
    ACT_ESTA      char(1) NOT NULL,
    
    FOREIGN KEY (COD_USUA) REFERENCES GN_USUAR(COD_USUA)
);
```

### 5. GN_LOG_ACCE (Auditoría) ✅ YA EXISTE

```sql
CREATE TABLE GN_LOG_ACCE (
    COD_LOGA      uniqueidentifier PRIMARY KEY,  -- ID log
    COD_USUA      bigint,                        -- FK a GN_USUAR
    COD_TERC      decimal(18,0),                 -- FK a GN_TERCE
    NUM_IDEN      bigint,                        -- Cédula (redundante)
    
    -- Evento
    TIP_EVEN      varchar(30) NOT NULL,          -- Tipo evento (LOGIN, LOGOUT, etc.)
    EST_EVEN      varchar(20) NOT NULL,          -- Estado (EXITOSO, FALLIDO, BLOQUEADO)
    DES_EVEN      varchar(500),                  -- Descripción
    NOM_RECU      varchar(100),                  -- Nombre recurso accedido
    
    -- Contexto
    IP_ORIG       varchar(50),                   -- IP origen
    AGE_HTTP      varchar(500),                  -- User-Agent
    
    -- Fecha
    FEC_EVEN      datetime NOT NULL DEFAULT GETDATE()
);
```

### 6. GN_GUSUA (Grupos de Usuarios) ✅ YA EXISTE

```sql
CREATE TABLE GN_GUSUA (
    COD_GUSU      smallint PRIMARY KEY,          -- ID grupo usuario
    NOM_GUSU      char(40) NOT NULL,             -- Nombre grupo
    GRU_DOMI      varchar(100),                  -- Grupo dominio (LDAP?)
    PRI_DOMI      int NOT NULL DEFAULT 0,        -- Prioridad dominio
    IND_TWEB      char(1),                       -- Indicador web
    
    -- Auditoría
    ACT_USUA      char(8) NOT NULL,
    ACT_HORA      datetime NOT NULL,
    ACT_ESTA      char(1) NOT NULL
);
```

### 7. GN_PERMI (Permisos) ✅ YA EXISTE

```sql
CREATE TABLE GN_PERMI (
    COD_PERM      int IDENTITY(1,1) PRIMARY KEY,  -- ID permiso
    COD_GUSU      smallint NOT NULL,              -- FK a GN_GUSUA
    NOM_GUSU      char(40),                       -- Nombre grupo
    
    -- Permiso
    NOM_MODU      varchar(50) NOT NULL,           -- Nombre módulo (nomina, reportes, etc.)
    TIP_ACCI      varchar(20) NOT NULL,           -- Tipo acción (view, create, edit, delete)
    NOM_RECU      varchar(100),                   -- Nombre recurso
    
    -- Estado
    IND_ACCE      char(1) NOT NULL DEFAULT 'S',   -- Indicador acceso (S/N)
    
    -- Auditoría
    ACT_USUA      char(8) NOT NULL,
    ACT_HORA      datetime NOT NULL,
    ACT_ESTA      char(1) NOT NULL,
    
    UNIQUE (COD_GUSU, NOM_MODU, TIP_ACCI, NOM_RECU)
);
```

---

## 🔗 Relaciones Actuales

```
GN_USUAR (Usuario)
├─ COD_FUNCI → GN_FUNCI (Empleado)
│  └─ COD_TERC → GN_TERCE (Persona)
│     ├─ NUM_IDEN (cédula)
│     ├─ DIR_MAIL (email)
│     └─ NOM_COMP (nombre)
│
├─ COD_GUSU → GN_GUSUA (Grupo usuario - puede estar fuera)
│  ├─ GN_PERMI (Permisos del grupo)
│  └─ Módulos: nomina, reportes, maestros, etc.
│
├─ GN_SESION (Sesiones activas)
│  └─ FEC_INIC, FEC_CIER, IP_ORIG
│
└─ GN_LOG_ACCE (Auditoría)
   ├─ TIP_EVEN: LOGIN, LOGOUT, CAMBIO_PASS, etc.
   └─ EST_EVEN: EXITOSO, FALLIDO, BLOQUEADO
```

---

## 📝 Mapeo: Cómo Usar Estructura Existente para Login

### Problema: "hernandezjuanfelipe964@gmail.com no puede ingresar"

**Paso 1: Encontrar el usuario**

```sql
-- BUSCAR POR EMAIL (DIR_ELEC en GN_USUAR)
SELECT TOP 1
    u.COD_USUA,
    u.NOM_USUA,
    u.DIR_ELEC,
    u.PAS_HASH,
    u.PAS_USUA,
    u.ACT_INAC,
    u.IND_BLOQ,
    u.INT_FALL,
    u.COD_FUNCI,
    u.COD_GUSU,
    f.COD_CARGO,
    f.FEC_INGRES,
    f.FEC_RETIRO,
    f.ACT_ESTA as Empleado_Estado,
    t.NUM_IDEN,
    t.NOM_COMP,
    g.COD_GUSU,
    g.NOM_GUSU
FROM GN_USUAR u
LEFT JOIN GN_FUNCI f ON u.COD_FUNCI = f.COD_FUNCI
LEFT JOIN GN_TERCE t ON f.COD_TERC = t.COD_TERC
LEFT JOIN GN_GUSUA g ON u.COD_GUSU = g.COD_GUSU
WHERE u.DIR_ELEC = 'hernandezjuanfelipe964@gmail.com'
   OR (f.COD_TERC IS NOT NULL AND (
       SELECT COUNT(*) FROM GN_TERCE 
       WHERE COD_TERC = f.COD_TERC AND DIR_MAIL = 'hernandezjuanfelipe964@gmail.com'
   ) = 1);
```

**Paso 2: Validaciones de Login**

```sql
-- ✅ ¿PUEDE INGRESAR?

-- 1. ¿Existe usuario?
SELECT COUNT(*) FROM GN_USUAR WHERE DIR_ELEC = 'hernandezjuanfelipe964@gmail.com'

-- 2. ¿Está activo? (ACT_INAC = 'S')
SELECT COUNT(*) FROM GN_USUAR 
WHERE DIR_ELEC = 'hernandezjuanfelipe964@gmail.com' 
AND ACT_INAC = 'S'

-- 3. ¿NO está bloqueado? (IND_BLOQ = 'N')
SELECT COUNT(*) FROM GN_USUAR
WHERE DIR_ELEC = 'hernandezjuanfelipe964@gmail.com'
AND IND_BLOQ = 'N'

-- 4. ¿Tiene hash? (PAS_HASH no vacío)
SELECT PAS_HASH, LEN(PAS_HASH) as Longitud
FROM GN_USUAR
WHERE DIR_ELEC = 'hernandezjuanfelipe964@gmail.com'

-- 5. ¿Empleado activo? (ACT_ESTA = 'A' en GN_FUNCI)
SELECT f.ACT_ESTA
FROM GN_USUAR u
LEFT JOIN GN_FUNCI f ON u.COD_FUNCI = f.COD_FUNCI
WHERE u.DIR_ELEC = 'hernandezjuanfelipe964@gmail.com'
```

---

## ✅ Qué Datos Están Disponibles

### Para LOGIN:
- ✅ Email: `GN_USUAR.DIR_ELEC`
- ✅ Contraseña hash: `GN_USUAR.PAS_HASH`
- ✅ Activo/Inactivo: `GN_USUAR.ACT_INAC` (S/N)
- ✅ Bloqueado: `GN_USUAR.IND_BLOQ` (S/N)
- ✅ Intentos fallidos: `GN_USUAR.INT_FALL`

### Para IDENTIFICACIÓN:
- ✅ Nombre: `GN_USUAR.NOM_USUA`
- ✅ Cédula: `GN_TERCE.NUM_IDEN` (vía GN_FUNCI.COD_TERC)
- ✅ Empleado: `GN_FUNCI.COD_FUNCI`
- ✅ Cargo: `GN_FUNCI.COD_CARGO`

### Para PERMISOS:
- ✅ Grupo usuario: `GN_USUAR.COD_GUSU` → `GN_GUSUA`
- ✅ Permisos: `GN_PERMI` (COD_GUSU, NOM_MODU, TIP_ACCI)

### Para AUDITORÍA:
- ✅ Sesiones: `GN_SESION` (FEC_INIC, FEC_CIER, IP_ORIG)
- ✅ Logs: `GN_LOG_ACCE` (TIP_EVEN, EST_EVEN, FEC_EVEN)

---

## 🚀 Próximos Pasos

1. **Adaptar authController.js** para usar columnas reales
2. **Actualizar scripts Node.js** para trabajar con estructura real
3. **Verificar que hernandezjuanfelipe964@gmail.com existe** en estructura real
4. **Crear usuarios correctamente** usando tablas existentes

---

**Conclusión:** La BD está bien diseñada. Solo hay que usar las columnas/tablas que YA EXISTEN, no crear nuevas.
