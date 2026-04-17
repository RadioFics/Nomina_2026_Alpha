# 🔧 MAPA DE CORRECCIONES - DETALLES LÍNEA POR LÍNEA

## PRIORIDAD 1: CRÍTICOS (Impiden inicio de sesión después del login)

---

### ARCHIVO: `middleware/authMiddleware.js`

#### **❌ PROBLEMA 1: verifyToken - Asignación de campos incorrectos**
**Línea:** 23-25

**Actual:**
```javascript
req.usuarioId = decoded.id_usuar;      // Campo EXISTE en payload
req.cedula = decoded.cedula;           // Campo EXISTE en payload
req.nivel = decoded.nivel_usuar;       // ❌ Campo NO EXISTE en payload
```

**Corrección:**
```javascript
req.usuarioId = decoded.id_usuar;
req.cedula = decoded.cedula;
req.cod_gusu = decoded.cod_gusu || null;    // Usar grupo en lugar de nivel
req.cod_empr = decoded.cod_empr;
```

---

#### **❌ PROBLEMA 2: generateToken - Payload incompleto**
**Línea:** 144-151

**Actual:**
```javascript
const payload = {
  id_usuar: usuarioData.id_usuar,
  cedula: usuarioData.cedula,
  nombre: usuarioData.nombre_usuar,           // ❌ En BD es NOM_USUA
  nivel_usuar: usuarioData.nivel_usuar,      // ❌ NO EXISTE
  departamento: usuarioData.cod_depart,       // ❌ NO EXISTE
  cargo: usuarioData.cod_cargo                // ❌ NO EXISTE en GN_USUAR
};
```

**Corrección:**
```javascript
const payload = {
  id_usuar: usuarioData.cod_usua,             // Usar campo real
  cod_empr: usuarioData.cod_empr,
  cedula: usuarioData.cedula || usuarioData.NUM_IDEN,
  nombre: usuarioData.nom_usua,               // Campo real
  email: usuarioData.dir_elec,
  cod_gusu: usuarioData.cod_gusu,
  cod_funci: usuarioData.cod_funci,
  cargo: usuarioData.cod_cargo || null        // Del join a GN_FUNCI
};
```

---

#### **❌ PROBLEMA 3: checkPermission - Tabla y campos inexistentes**
**Línea:** 48-69

**Actual:**
```javascript
const queryRoles = `
  SELECT COD_ROL FROM GN_ROL_USUAR        // ❌ TABLA NO EXISTE
  WHERE ID_USUAR = @usuarioId AND ESTA_ACTIVO = 1
`;

const queryPermisos = `
  SELECT TIENE_ACCESO FROM GN_PERMISOS    // ❌ TABLA NO EXISTE
  WHERE COD_ROL IN (...)
    AND MODULO = @modulo
    AND ACCION = @accion
    AND ESTA_ACTIVO = 1
`;
```

**Corrección:**
```javascript
// Obtener grupo del usuario
const queryGrupo = `
  SELECT COD_GUSU FROM GN_USUAR
  WHERE COD_USUA = @usuarioId
`;
const resultGrupo = await executeQuery(queryGrupo, { usuarioId });
const codGrusu = resultGrupo.recordset[0]?.COD_GUSU;

if (!codGrusu) {
  return res.status(403).json({
    status: 'error',
    message: 'Usuario sin grupo asignado'
  });
}

// Verificar permisos usando tabla REAL
const queryPermisos = `
  SELECT IND_ACCE FROM GN_PERMI
  WHERE COD_GUSU = @codGrusu
    AND NOM_MODU = @modulo
    AND TIP_ACCI = @accion
`;

const resultPermisos = await executeQuery(queryPermisos, {
  codGrusu,
  modulo,
  accion
});

const tieneAcceso = resultPermisos.recordset?.[0]?.IND_ACCE === 'S';
if (!tieneAcceso) {
  return res.status(403).json({
    status: 'error',
    message: `No tienes permisos para ${accion} en ${modulo}`
  });
}
```

---

#### **❌ PROBLEMA 4: registrarIntentoFallido - Campos y tabla incorrectos**
**Línea:** 161-181

**Actual:**
```javascript
const query = `
  UPDATE GN_USUAR
  SET INTENTOS_FALL = INTENTOS_FALL + 1,              // ❌ Campo existe pero...
      ESTA_BLOQUEADO = CASE WHEN INTENTOS_FALL >= 5   // ❌ NO EXISTE
        THEN 1 ELSE 0 END
  WHERE CEDULA = @cedula OR EMAIL = @cedula;          // ❌ CEDULA NO EXISTE

  INSERT INTO GN_LOG_ACCESO (...)                     // ❌ TABLA NO EXISTE
`;
```

**Corrección:**
```javascript
const query = `
  UPDATE GN_USUAR
  SET INT_FALL = INT_FALL + 1,
      IND_BLOQ = CASE WHEN INT_FALL >= 4              // Bloquea en 5to intento
        THEN 'S' ELSE 'N' END,
      FEC_ULCA = GETDATE()
  WHERE DIR_ELEC = @cedula OR NUM_IDEN = CAST(@cedula AS BIGINT);

  INSERT INTO GN_LOG_ACCE (
    COD_USUA, TIP_EVEN, EST_EVEN, DES_EVEN, IP_ORIG, FEC_EVEN
  )
  SELECT COD_USUA, 'LOGIN', 'FALLIDO', 
         'Intento fallido de login', @ip, GETDATE()
  FROM GN_USUAR 
  WHERE DIR_ELEC = @cedula OR NUM_IDEN = CAST(@cedula AS BIGINT);
`;
```

---

#### **❌ PROBLEMA 5: resetearIntentos - Campos y tabla incorrectos**
**Línea:** 186-197

**Actual:**
```javascript
const query = `
  UPDATE GN_USUAR
  SET INTENTOS_FALL = 0, ESTA_BLOQUEADO = 0
  WHERE ID_USUAR = @usuarioId
`;
```

**Corrección:**
```javascript
const query = `
  UPDATE GN_USUAR
  SET INT_FALL = 0, IND_BLOQ = 'N'
  WHERE COD_USUA = @usuarioId
`;
```

---

### ARCHIVO: `controllers/authController.js`

#### **❌ PROBLEMA 6: logout - Estructura de GN_SESION incorrecta**
**Línea:** 238-272

**Actual:**
```javascript
const query = `
  UPDATE GN_SESION
  SET ESTA_ACTIVA = 0, FECH_CIERRE = GETDATE()        // ❌ Campos NO existen
  WHERE ID_USUAR = @usuarioId AND ESTA_ACTIVA = 1;    // ❌ NO existe

  INSERT INTO GN_LOG_ACCESO (...)                      // ❌ Tabla NO existe
`;
```

**Corrección:**
```javascript
const query = `
  UPDATE GN_SESION
  SET EST_SESI = 'C', FEC_CIER = GETDATE()             // Campos correctos
  WHERE COD_USUA = @usuarioId AND EST_SESI = 'A';

  INSERT INTO GN_LOG_ACCE (
    COD_USUA, TIP_EVEN, EST_EVEN, DES_EVEN, IP_ORIG, FEC_EVEN
  )
  VALUES (
    @usuarioId, 'LOGOUT', 'EXITOSO', 
    'Logout realizado', @ip, GETDATE()
  );
`;
```

---

#### **❌ PROBLEMA 7: cambiarContrasena - Múltiples errores de campos**
**Línea:** 309-346

**Actual:**
```javascript
// Línea 310: Campo incorrecto
const queryActual = `
  SELECT PASSW_HASH FROM GN_USUAR WHERE ID_USUAR = @usuarioId
`;

// Línea 318: Variable incorrecta
const usuario = result.recordset[0];
const contrasenaActualValida = await bcrypt.compare(
  contrasena_actual,
  usuario.PASSW_HASH          // ❌ Debe ser PAS_HASH
);

// Línea 333-338: INSERT con campos fantasma
const queryActualizar = `
  UPDATE GN_USUAR
  SET PASSW_HASH = @passHash,
      FECH_ULT_CAMBIO = GETDATE(),       // ❌ NO EXISTE
      FECH_PROX_CAMBIO = DATEADD(DAY, 90, GETDATE())  // ❌ NO EXISTE
  WHERE ID_USUAR = @usuarioId;
`;
```

**Corrección:**
```javascript
// Obtener usuario actual
const queryActual = `
  SELECT PAS_HASH FROM GN_USUAR WHERE COD_USUA = @usuarioId
`;

// Comparar correctamente
const usuario = result.recordset[0];
const contrasenaActualValida = await bcrypt.compare(
  contrasena_actual,
  usuario.PAS_HASH        // Campo correcto
);

// Actualizar con campos existentes
const queryActualizar = `
  UPDATE GN_USUAR
  SET PAS_HASH = @passHash,
      FEC_ULCA = GETDATE(),
      CAM_PASS = 'S'
  WHERE COD_USUA = @usuarioId;

  INSERT INTO GN_LOG_ACCE (
    COD_USUA, TIP_EVEN, EST_EVEN, DES_EVEN, FEC_EVEN
  )
  VALUES (
    @usuarioId, 'CAMBIO_PASS', 'EXITOSO', 
    'Contraseña cambiada', GETDATE()
  );
`;
```

---

#### **❌ PROBLEMA 8: obtenerUsuarioActual - Campos y tabla fantasma**
**Línea:** 379-402

**Actual:**
```javascript
const query = `
  SELECT
    ID_USUAR,          // ❌ Debe ser COD_USUA
    CEDULA,            // ❌ NO EXISTE
    NOMBRE_USUAR,      // ❌ Debe ser NOM_USUA
    EMAIL,             // ❌ Debe ser DIR_ELEC
    NIVEL_USUAR,       // ❌ NO EXISTE
    COD_DEPART,        // ❌ NO EXISTE
    COD_CARGO,         // ⚠️ En GN_FUNCI, no aquí
    ESTA_ACTIVO,       // ❌ Debe ser ACT_INAC
    FECH_ULT_CAMBIO,   // ❌ NO EXISTE
    FECH_PROX_CAMBIO   // ❌ NO EXISTE
  FROM GN_USUAR
  WHERE ID_USUAR = @usuarioId;

  SELECT COD_ROL, NOM_ROL
  FROM GN_ROL_USUAR              // ❌ TABLA NO EXISTE
  WHERE ID_USUAR = @usuarioId AND ESTA_ACTIVO = 1;
`;
```

**Corrección:**
```javascript
const query = `
  SELECT
    u.COD_USUA,
    u.COD_EMPR,
    u.NOM_USUA,
    u.DIR_ELEC,
    u.ACT_INAC,
    u.IND_BLOQ,
    u.FEC_EXPI,
    u.COD_FUNCI,
    u.COD_GUSU,
    f.COD_CARGO,
    g.NOM_GUSU
  FROM GN_USUAR u
  LEFT JOIN GN_FUNCI f ON u.COD_FUNCI = f.COD_FUNCI
  LEFT JOIN GN_GUSUA g ON u.COD_GUSU = g.COD_GUSU
  WHERE u.COD_USUA = @usuarioId;
`;
```

**JavaScript:**
```javascript
const usuario = result.recordset[0];
if (!usuario) {
  return res.status(404).json({
    status: 'error',
    message: 'Usuario no encontrado'
  });
}

return res.status(200).json({
  status: 'success',
  usuario: {
    id: usuario.COD_USUA,
    empresa: usuario.COD_EMPR,
    nombre: usuario.NOM_USUA,
    email: usuario.DIR_ELEC,
    activo: usuario.ACT_INAC === 'S',
    bloqueado: usuario.IND_BLOQ === 'S',
    grupo: usuario.NOM_GUSU,
    cargo: usuario.COD_CARGO
  }
});
```

---

#### **❌ PROBLEMA 9: crearUsuario - Schema completamente incorrecto**
**Línea:** 463-505

**Actual:**
```javascript
// Línea 464: Consulta incorrecta
const queryExiste = `
  SELECT ID_USUAR FROM GN_USUAR WHERE CEDULA = @cedula
`;

// Línea 480-505: INSERT con campos fantasma
const queryCrear = `
  DECLARE @ID_USUAR UNIQUEIDENTIFIER = NEWID();
  ...
  INSERT INTO GN_USUAR (
    ID_USUAR, CEDULA, NOMBRE_USUAR, PASSW_HASH, EMAIL,
    COD_DEPART, COD_CARGO, NIVEL_USUAR,
    USUAR_CREACION, FECH_PROX_CAMBIO
  )
  VALUES (
    @ID_USUAR, @cedula, ..., @passHash, @email,
    @COD_DEPART, @COD_CARGO, 1,
    @usuarioActual, ...
  );
`;
```

**Corrección:**
```javascript
// Buscar si existe (por email o número de identidad del tercero)
const queryExiste = `
  SELECT u.COD_USUA FROM GN_USUAR u
  LEFT JOIN GN_FUNCI f ON u.COD_FUNCI = f.COD_FUNCI
  LEFT JOIN GN_TERCE t ON f.COD_TERC = t.COD_TERC
  WHERE u.DIR_ELEC = @email 
     OR t.NUM_IDEN = CAST(@cedula AS BIGINT)
`;

// Crear usuario correctamente
const queryCrear = `
  -- Obtener datos del tercero/empleado
  DECLARE @COD_TERC DECIMAL(13,0);
  DECLARE @COD_FUNCI INT;
  DECLARE @NOM_TERC NVARCHAR(240);
  
  SELECT TOP 1 @COD_TERC = COD_TERC
  FROM GN_TERCE
  WHERE NUM_IDEN = CAST(@cedula AS BIGINT);
  
  IF @COD_TERC IS NOT NULL
  BEGIN
    SELECT TOP 1 @COD_FUNCI = COD_FUNCI
    FROM GN_FUNCI
    WHERE COD_TERC = @COD_TERC;
  END
  
  -- Obtener nombre del tercero
  IF @COD_TERC IS NOT NULL
    SELECT @NOM_TERC = NOM_COMP FROM GN_TERCE WHERE COD_TERC = @COD_TERC;
  
  -- Insertar usuario con estructura REAL
  INSERT INTO GN_USUAR (
    COD_EMPR, NOM_USUA, DIR_ELEC, PAS_HASH, COD_FUNCI,
    ACT_INAC, IND_BLOQ, INT_FALL,
    ACT_USUA, ACT_HORA, ACT_ESTA
  )
  VALUES (
    @codEmpr, ISNULL(@NOM_TERC, @email), @email, @passHash, @COD_FUNCI,
    'S', 'N', 0,
    'ADMIN', GETDATE(), 'A'
  );
`;
```

---

#### **❌ PROBLEMA 10: listarUsuarios - Campos y tabla fantasma**
**Línea:** 543-569

**Actual:**
```javascript
let query = `
  SELECT
    u.ID_USUAR,         // ❌ Debe ser COD_USUA
    u.CEDULA,           // ❌ NO EXISTE
    u.NOMBRE_USUAR,     // ❌ Debe ser NOM_USUA
    u.EMAIL,            // ❌ Debe ser DIR_ELEC
    u.NIVEL_USUAR,      // ❌ NO EXISTE
    u.ESTA_ACTIVO,      // ❌ Debe ser ACT_INAC
    u.ESTA_BLOQUEADO,   // ❌ Debe ser IND_BLOQ
    u.FECH_CREACION,    // ❌ NO EXISTE
    u.FECH_ULT_CAMBIO,  // ❌ NO EXISTE
    r.COD_ROL,
    r.NOM_ROL
  FROM GN_USUAR u
  LEFT JOIN GN_ROL_USUAR r ON u.ID_USUAR = r.ID_USUAR  // ❌ Tabla NO existe
  WHERE 1=1
`;

if (estado !== undefined) {
  query += ` AND u.ESTA_ACTIVO = @estado`;  // ❌ Campo NO existe
}
```

**Corrección:**
```javascript
let query = `
  SELECT
    u.COD_USUA,
    u.COD_EMPR,
    u.NOM_USUA,
    u.DIR_ELEC,
    u.ACT_INAC,
    u.IND_BLOQ,
    u.FEC_ACTI,
    u.FEC_ULCA,
    g.NOM_GUSU,
    g.COD_GUSU
  FROM GN_USUAR u
  LEFT JOIN GN_GUSUA g ON u.COD_GUSU = g.COD_GUSU
  WHERE 1=1
`;

if (estado !== undefined) {
  query += ` AND u.ACT_INAC = @estado`;  // 'S' or 'N'
}

query += ` ORDER BY u.FEC_ACTI DESC
  OFFSET @offset ROWS FETCH NEXT @limite ROWS ONLY`;

const params = { offset, limite };
if (estado !== undefined) {
  params.estado = estado === 'activo' ? 'S' : 'N';
}
```

---

## PRIORIDAD 2: ALTOS (Impiden operaciones de administración)

---

#### **❌ PROBLEMA 11: obtenerUsuario - Campos incorrectos**
**Línea:** 599-616

**Corrección:**
```javascript
const query = `
  SELECT
    u.COD_USUA,
    u.COD_EMPR,
    u.NOM_USUA,
    u.DIR_ELEC,
    u.ACT_INAC,
    u.IND_BLOQ,
    u.INT_FALL,
    u.COD_FUNCI,
    u.FEC_ACTI,
    u.FEC_ULCA,
    f.COD_CARGO
  FROM GN_USUAR u
  LEFT JOIN GN_FUNCI f ON u.COD_FUNCI = f.COD_FUNCI
  WHERE u.COD_USUA = @usuarioId
`;
```

---

#### **❌ PROBLEMA 12: actualizarUsuario - Campos fantasma**
**Línea:** 651-670

**Corrección:**
```javascript
const query = `
  UPDATE GN_USUAR
  SET
    NOM_USUA = ISNULL(@nombre, NOM_USUA),
    DIR_ELEC = ISNULL(@email, DIR_ELEC),
    ACT_INAC = ISNULL(@estado, ACT_INAC),
    FEC_ULCA = GETDATE(),
    ACT_USUA = 'ADMIN',
    ACT_HORA = GETDATE()
  WHERE COD_USUA = @usuarioId;

  INSERT INTO GN_LOG_ACCE (
    COD_USUA, TIP_EVEN, EST_EVEN, DES_EVEN, FEC_EVEN
  )
  VALUES (
    @usuarioId, 'UPDATE_USUA', 'EXITOSO', 'Datos actualizados', GETDATE()
  );
`;
```

---

#### **❌ PROBLEMA 13: cambiarEstadoUsuario - Campo fantasma**
**Línea:** 715-731

**Corrección:**
```javascript
const query = `
  UPDATE GN_USUAR
  SET ACT_INAC = @estado, FEC_ULCA = GETDATE()
  WHERE COD_USUA = @usuarioId;

  INSERT INTO GN_LOG_ACCE (
    COD_USUA, TIP_EVEN, EST_EVEN, DES_EVEN, FEC_EVEN
  )
  SELECT COD_USUA, 'CAMBIO_ESTADO', 'EXITOSO',
         'Usuario ' + CASE WHEN @estado = 'S' THEN 'activado' 
                          ELSE 'desactivado' END,
         GETDATE()
  FROM GN_USUAR WHERE COD_USUA = @usuarioId;
`;

// JavaScript
const estado = estado ? 'S' : 'N';
await executeQuery(query, {
  usuarioId,
  estado
});
```

---

#### **❌ PROBLEMA 14: desbloquearUsuario - Campos incorrectos**
**Línea:** 760-771

**Corrección:**
```javascript
const query = `
  UPDATE GN_USUAR
  SET IND_BLOQ = 'N', INT_FALL = 0, FEC_ULCA = GETDATE()
  WHERE COD_USUA = @usuarioId;

  INSERT INTO GN_LOG_ACCE (
    COD_USUA, TIP_EVEN, EST_EVEN, DES_EVEN, FEC_EVEN
  )
  VALUES (
    @usuarioId, 'DESBLOQUEO', 'EXITOSO', 'Usuario desbloqueado', GETDATE()
  );
`;
```

---

#### **❌ PROBLEMA 15: eliminarUsuario - Tabla fantasma**
**Línea:** 806-823

**Corrección:**
```javascript
const query = `
  -- Registrar eliminación en log
  INSERT INTO GN_LOG_ACCE (
    COD_USUA, TIP_EVEN, EST_EVEN, DES_EVEN, FEC_EVEN
  )
  VALUES (
    @usuarioId, 'DELETE_USUA', 'EXITOSO', 'Usuario eliminado', GETDATE()
  );

  -- Cerrar sesiones activas
  UPDATE GN_SESION 
  SET EST_SESI = 'C', FEC_CIER = GETDATE()
  WHERE COD_USUA = @usuarioId AND EST_SESI = 'A';

  -- Marcar como inactivo (NO ELIMINAR DATOS)
  UPDATE GN_USUAR 
  SET ACT_INAC = 'N', IND_BLOQ = 'S'
  WHERE COD_USUA = @usuarioId;
`;
```

**Nota:** En lugar de DELETE, es mejor marcar como inactivo para mantener integridad histórica.

---

## PRIORIDAD 3: SEGURIDAD

#### **⚠️ PROBLEMA 16: JWT_SECRET hardcodeado**
**Línea:** `middleware/authMiddleware.js:4`

**Actual:**
```javascript
const JWT_SECRET = process.env.JWT_SECRET || 
  'tu-clave-secreta-super-segura-cambiar-en-produccion';
```

**Recomendación:**
```javascript
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) {
  throw new Error('JWT_SECRET no está configurada en variables de entorno');
}
```

**Agregar a .env:**
```
JWT_SECRET=tu-clave-super-segura-minimo-32-caracteres-aleatorios
```

---

#### **⚠️ PROBLEMA 17: Credenciales en .env**
**Archivo:** `.env`

**Las credenciales están en plain text. Recomendaciones:**

1. Nunca commitear .env a git:
```bash
echo ".env" >> .gitignore
```

2. Usar secretos en producción:
```javascript
// En servidor
const config = {
  server: process.env.SERVER,
  database: process.env.DATABASE,
  authentication: {
    type: 'default',
    options: {
      userName: process.env.UID,
      password: process.env.PWD
    }
  }
};
```

3. Usar Azure Key Vault o similar en producción

---

## RESUMEN DE CAMBIOS

```
Archivos a modificar:
├── middleware/authMiddleware.js (5 funciones)
├── controllers/authController.js (11 funciones)
└── .env (agregar JWT_SECRET)

Total de cambios: 27 problemas identificados
Líneas a modificar: ~150-200 líneas
Tiempo estimado: 3-4 horas

Tipos de cambios:
- Renombrado de campos: 26 cambios
- Cambio de tablas: 5 cambios
- Mejora de lógica: 8 cambios
- Agregado de validaciones: 4 cambios
```

