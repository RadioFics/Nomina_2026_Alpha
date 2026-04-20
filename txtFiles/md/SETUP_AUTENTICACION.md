# ⚡ Setup Rápido - Autenticación

Sigue estos pasos para configurar el sistema de autenticación en 10 minutos.

## PASO 1: Ejecutar Script SQL (2 min)

1. Abre **SQL Server Management Studio**
2. Conéctate a **MineDax**
3. Abre: `database/auth_schema.sql`
4. Selecciona TODO y ejecuta (F5)
5. Espera a que termine (debe mostrar ✓ al final)

```
✓ SCHEMA DE AUTENTICACIÓN CREADO
✓ 5 Tablas creadas
✓ 3 Procedimientos creados
✓ Permisos por defecto insertados
```

## PASO 2: Configurar Variables de Entorno (1 min)

Edita `.env`:

```bash
# Cambiar estos valores según tu BD
SERVER=tu-servidor.local
DATABASE=MineDax
UID=tu-usuario-sql
PWD=tu-password-sql

# IMPORTANTE: Cambiar en producción
JWT_SECRET=cambiar-esto-en-produccion-a-algo-mas-seguro

PORT=3000
```

## PASO 3: Instalar Dependencias (3 min)

```bash
npm install
```

Debe instalar `bcryptjs` y `jsonwebtoken` automáticamente.

Verificar:
```bash
npm list jsonwebtoken bcryptjs
```

## PASO 4: Crear Usuario Admin (2 min)

### Opción A: Desde Node.js (Recomendado)

Crear archivo `create-admin.js`:

```javascript
const bcrypt = require('bcryptjs');
const { executeQuery } = require('./config/database');

async function crearAdmin() {
  const cedula = '1111111111';  // Cambiar por tu cédula
  const contrasena = 'MineDax@123';  // Cambiar
  const email = 'admin@mining.com';  // Cambiar

  // 1. Generar hash
  const salt = await bcrypt.genSalt(10);
  const hash = await bcrypt.hash(contrasena, salt);
  console.log('Hash generado:', hash);

  // 2. Crear usuario en BD
  const query = `
    DECLARE @ID_USUAR UNIQUEIDENTIFIER = NEWID();
    DECLARE @NOM_FUNCI VARCHAR(100);
    DECLARE @COD_DEPART VARCHAR(10);
    DECLARE @COD_CARGO VARCHAR(10);

    -- Obtener datos de GN_FUNCI
    SELECT TOP 1
      @NOM_FUNCI = NOM_COMP,
      @COD_DEPART = COD_DEPART,
      @COD_CARGO = COD_CARGO
    FROM GN_FUNCI
    WHERE NUM_IDEN = @cedula;

    -- Si no existe en GN_FUNCI, usar valores por defecto
    SET @NOM_FUNCI = ISNULL(@NOM_FUNCI, 'Administrador');
    SET @COD_DEPART = ISNULL(@COD_DEPART, 'ADMIN');
    SET @COD_CARGO = ISNULL(@COD_CARGO, 'ADMIN');

    -- Crear usuario
    INSERT INTO GN_USUAR (
      ID_USUAR, CEDULA, NOMBRE_USUAR, PASSW_HASH, EMAIL,
      COD_DEPART, COD_CARGO, NIVEL_USUAR,
      USUAR_CREACION, FECH_PROX_CAMBIO
    )
    VALUES (
      @ID_USUAR, @cedula, @NOM_FUNCI, @passHash, @email,
      @COD_DEPART, @COD_CARGO, 3,
      'SISTEMA', DATEADD(DAY, 90, GETDATE())
    );

    -- Asignar rol ADMIN
    INSERT INTO GN_ROL_USUAR (ID_USUAR, COD_ROL, NOM_ROL, ESTA_ACTIVO)
    VALUES (@ID_USUAR, 'ADMIN', 'Administrador', 1);

    SELECT @ID_USUAR AS ID_USUAR;
  `;

  try {
    const result = await executeQuery(query, {
      cedula,
      passHash: hash,
      email
    });
    console.log('✓ Usuario admin creado:', result.recordset[0].ID_USUAR);
  } catch (err) {
    console.error('Error:', err.message);
  }
}

crearAdmin();
```

Ejecutar:
```bash
node create-admin.js
```

### Opción B: Desde SQL (Si GN_FUNCI no tiene tus datos)

```sql
-- Reemplazar valores
DECLARE @cedula VARCHAR(20) = '1111111111';
DECLARE @passHash VARCHAR(255) = '$2a$10$yG1FxHxL...'; -- Hash bcrypt (generado en Node.js)
DECLARE @email VARCHAR(100) = 'admin@mining.com';

INSERT INTO GN_USUAR (
  CEDULA, NOMBRE_USUAR, PASSW_HASH, EMAIL,
  COD_DEPART, COD_CARGO, NIVEL_USUAR,
  USUAR_CREACION, FECH_PROX_CAMBIO, ESTA_ACTIVO
)
VALUES (
  @cedula, 'Administrador', @passHash, @email,
  'ADMIN', 'ADMIN', 3,
  'SISTEMA', DATEADD(DAY, 90, GETDATE()), 1
);

-- Obtener el ID del usuario creado
DECLARE @ID_USUAR UNIQUEIDENTIFIER;
SELECT @ID_USUAR = ID_USUAR FROM GN_USUAR WHERE CEDULA = @cedula;

-- Asignar rol
INSERT INTO GN_ROL_USUAR (ID_USUAR, COD_ROL, NOM_ROL, ESTA_ACTIVO)
VALUES (@ID_USUAR, 'ADMIN', 'Administrador', 1);

SELECT 'Usuario admin creado' AS Resultado;
```

## PASO 5: Iniciar el Servidor (1 min)

```bash
npm run dev
```

Debe mostrar:
```
✓ Servidor ejecutándose en http://localhost:3000
✓ Conectado a SQL Server: MineDax
```

## PASO 6: Probar Login (1 min)

1. Abre http://localhost:3000
2. Deberías ver la página de login
3. Ingresa:
   - Cédula/Email: `1111111111` (o tu cédula)
   - Contraseña: `MineDax@123` (o la que configuraste)
4. Haz clic en "Iniciar Sesión"

Resultado esperado:
- ✓ Te redirige a `/index_novedades.html`
- ✓ El token se guarda en localStorage
- ✓ Puedes usar la aplicación normalmente

## PASO 7: Verificar Instalación

En la consola del navegador (F12):

```javascript
// Verificar que AuthUtil está disponible
console.log(AuthUtil);

// Ver token
console.log(localStorage.getItem('authToken'));

// Ver usuario
console.log(AuthUtil.getUsuario());

// Verificar que estás autenticado
console.log(AuthUtil.estaAutenticado());
```

## PASO 8: Crear Más Usuarios (Opcional)

Desde la API (como admin):

```javascript
// En el navegador, con sesión de admin abierta
await fetch('/api/auth/crear-usuario', {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json',
    'Authorization': `Bearer ${localStorage.getItem('authToken')}`
  },
  body: JSON.stringify({
    cedula: '2222222222',
    email: 'usuario2@mining.com',
    contrasena: 'MineDax@456'
  })
});
```

O desde la BD directamente:

```sql
-- Generar hash de 'MineDax@456' primero en Node.js
-- Luego usar en la query

INSERT INTO GN_USUAR (
  CEDULA, NOMBRE_USUAR, PASSW_HASH, EMAIL, NIVEL_USUAR,
  USUAR_CREACION, FECH_PROX_CAMBIO, ESTA_ACTIVO
)
VALUES (
  '2222222222', 'Nuevo Usuario', '$2a$10$...', 'usuario2@mining.com', 1,
  'SISTEMA', DATEADD(DAY, 90, GETDATE()), 1
);
```

## Comandos Útiles

```bash
# Iniciar servidor en modo desarrollo (con auto-reload)
npm run dev

# Iniciar servidor en producción
npm start

# Ver logs del servidor
npm run dev 2>&1 | tee server.log

# Reinstalar dependencias
rm -rf node_modules package-lock.json
npm install
```

## Troubleshooting Rápido

| Problema | Solución |
|----------|----------|
| "Conectar a SQL Server" error | Verificar SERVER, DATABASE, UID, PWD en .env |
| "Cannot find module 'bcryptjs'" | Ejecutar `npm install` |
| "Token inválido" | Cambiar JWT_SECRET es problema, resetear token. Hacer logout y login. |
| "Usuario no encontrado" | Verificar que la cédula existe en GN_FUNCI |
| "Usuario bloqueado" | Ejecutar: `UPDATE GN_USUAR SET ESTA_BLOQUEADO = 0 WHERE CEDULA = '...'` |
| "Contraseña incorrecta siempre" | Verificar que el hash bcrypt se generó correctamente |
| Página en blanco después de login | Verificar que `/index_novedades.html` existe |

## Próximo Paso

Una vez todo funciona:

1. Leer `AUTENTICACION.md` para entender el sistema completo
2. Integrar AuthUtil en las otras páginas
3. Proteger rutas con `verifyToken` middleware
4. Crear más roles y permisos según necesites

¡Felicidades! 🎉 El sistema de autenticación está instalado y funcionando.

---

**¿Necesitas ayuda?** Revisa:
- Logs del servidor (`npm run dev`)
- GN_LOG_ACCESO para eventos de login
- Los errores en el navegador (F12)
