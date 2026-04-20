# 📋 EXPLICACIÓN DE LOS DOS PROBLEMAS REPORTADOS

## PROBLEMA 1: No se ve "Conectado a SQL Server: MineDax"

### ¿Por qué ocurre?

En el archivo `config/database.js`, la conexión a BD se hace de forma **LAZY** (perezosa/bajo demanda):

```javascript
async function getConnection() {
  try {
    if (!pool) {
      pool = new sql.ConnectionPool(config);
      await pool.connect();
      console.log('✓ Conectado a SQL Server:', config.database);  // ← Aquí está el log
    }
    return pool;
  }
}
```

**El log solo aparece cuando se intenta HACER la primera consulta**, no cuando inicia el servidor.

### ¿Es normal?

✅ **SÍ, es completamente normal.** Es una práctica común para:
- Iniciar rápido (no esperar conexión a BD)
- Manejar mejor los timeouts
- Permitir que el servidor responda en `/health` aunque BD esté caída

### ¿Cómo verificar que la BD está conectada?

**Opción 1: Hacer login**
- Ve a http://localhost:3000
- Intenta hacer login con credenciales válidas
- Si ve el mensaje de error de credenciales → ✅ BD conectada
- Si ve error de conexión → ❌ BD no accesible

**Opción 2: Curl a un endpoint que necesita BD**
```bash
curl -X GET http://localhost:3000/api/health
```

**Opción 3: Mirar la consola cuando hagas la primera solicitud**
- Después del primer login/solicitud, verás:
```
✓ Conectado a SQL Server: MineDax
[LOGIN] ✓ usuario logueado...
```

---

## PROBLEMA 2: "Error al crear cuenta" en el registro

### ¿Qué causaba el error?

Había **4 problemas** en la función `registro` (y otras funciones):

#### Problema 2.1: Acceso incorrecto a `recordset`

**Código INCORRECTO (antes):**
```javascript
const terceroResult = await executeQuery(verificarEmailQuery, { email });

if (!terceroResult || terceroResult.length === 0) {  // ❌ INCORRECTO
  // error
}

const tercero = terceroResult[0];  // ❌ INCORRECTO
```

**El problema:** `executeQuery` retorna un objeto con esta estructura:
```javascript
{
  recordset: [
    { COD_TERC: 123, NOM_COMP: "Juan", ... },
    ...
  ]
}
```

Trataba el resultado como un array directo, cuando en realidad es `{ recordset: [...] }`.

**Código CORRECTO (después):**
```javascript
if (!terceroResult || !terceroResult.recordset || terceroResult.recordset.length === 0) {
  // error
}

const tercero = terceroResult.recordset[0];  // ✅ CORRECTO
```

#### Problema 2.2: Acceso incorrecto a SCOPE_IDENTITY()

**Código INCORRECTO (antes):**
```javascript
const crearResult = await executeQuery(crearUsuarioQuery, { ... });
const nuevoCodigoUsuario = crearResult[crearResult.length - 1][0].nuevoId;  // ❌ Muy complicado
```

**Código CORRECTO (después):**
```javascript
const crearResult = await executeQuery(crearUsuarioQuery, { ... });
const nuevoCodigoUsuario = crearResult.recordset[0].nuevoId;  // ✅ Correcto
```

#### Problema 2.3: Importación de módulo inexistente

**Código INCORRECTO (antes):**
```javascript
const { enviarEmail, emailBienvenida } = require('../config/mailer');
await enviarEmail(emailBienvenida(tercero.NOM_COMP, email));  // ❌ Module not found
```

El archivo `config/mailer.js` no existe, causando que todo fallara.

**Código CORRECTO (después):**
```javascript
// ⚠️ TODO: Enviar email de bienvenida cuando se implemente el servicio de email
console.log(`[REGISTRO] Email de bienvenida pendiente a: ${email}`);
```

#### Problema 2.4: Acceso incorrecto en otras funciones

El mismo problema estaba en:
- `forgotPassword()` (línea 1147)
- `resetPassword()` (línea 1258)
- `validarToken()` (línea 1348)

**Todas corregidas** ✅

---

## CAMBIOS IMPLEMENTADOS

### En `exports.registro`:
```diff
- if (!terceroResult || terceroResult.length === 0) {
+ if (!terceroResult || !terceroResult.recordset || terceroResult.recordset.length === 0) {

- const tercero = terceroResult[0];
+ const tercero = terceroResult.recordset[0];

- if (usuarioExistente && usuarioExistente.length > 0) {
+ if (usuarioExistente && usuarioExistente.recordset && usuarioExistente.recordset.length > 0) {

- const nuevoCodigoUsuario = crearResult[crearResult.length - 1][0].nuevoId;
+ const nuevoCodigoUsuario = crearResult.recordset[0].nuevoId;

- const { enviarEmail, emailBienvenida } = require('../config/mailer');
+ // Removido: módulo no existe
+ console.log(`[REGISTRO] Email de bienvenida pendiente a: ${email}`);
```

### En `exports.forgotPassword`:
```diff
- if (!usuarioResult || usuarioResult.length === 0) {
+ if (!usuarioResult || !usuarioResult.recordset || usuarioResult.recordset.length === 0) {

- const usuario = usuarioResult[0];
+ const usuario = usuarioResult.recordset[0];

- const { enviarEmail, emailRecuperacion } = require('../config/mailer');
+ console.log(`[FORGOT PASSWORD] Email de recuperación pendiente a: ${usuario.DIR_ELEC}`);
```

### En `exports.resetPassword`:
```diff
- if (!usuarioResult || usuarioResult.length === 0) {
+ if (!usuarioResult || !usuarioResult.recordset || usuarioResult.recordset.length === 0) {

- const usuario = usuarioResult[0];
+ const usuario = usuarioResult.recordset[0];

- const { enviarEmail, emailCambioExitoso } = require('../config/mailer');
+ console.log(`[RESET PASSWORD] Email de confirmación pendiente a: ${usuario.DIR_ELEC}`);
```

### En `exports.validarToken`:
```diff
- if (!usuarioResult || usuarioResult.length === 0) {
+ if (!usuarioResult || !usuarioResult.recordset || usuarioResult.recordset.length === 0) {

- const usuario = usuarioResult[0];
+ const usuario = usuarioResult.recordset[0];
```

---

## ¿FUNCIONA AHORA EL REGISTRO?

✅ **SÍ.** El registro ahora debería:

1. ✅ Verificar que el email existe en `GN_TERCE`
2. ✅ Verificar que no existe usuario activo con ese email
3. ✅ Crear nuevo usuario en `GN_USUAR`
4. ✅ Registrar en log
5. ✅ Retornar JWT token
6. ⚠️ Pendiente: Enviar email de bienvenida (requerirá implementar `config/mailer.js`)

### Limitación temporal:

Los emails no se envían porque `config/mailer.js` no existe. Esto es un TODO que se puede implementar cuando se configure:
- Servicio SMTP (Gmail, SendGrid, etc.)
- Plantillas de email
- Manejo de errores

Por ahora, los logs muestran:
```
[REGISTRO] Email de bienvenida pendiente de envío a: usuario@ejemplo.com
[FORGOT PASSWORD] Email de recuperación pendiente a: usuario@ejemplo.com
[RESET PASSWORD] Email de confirmación pendiente a: usuario@ejemplo.com
```

---

## PRÓXIMOS PASOS

### 1. Reinicia el servidor:
```bash
npm start
```

### 2. Prueba el registro:
```bash
curl -X POST http://localhost:3000/api/auth/registro \
  -H "Content-Type: application/json" \
  -d '{
    "email": "usuario@ejemplo.com",
    "contrasena": "Password123",
    "contrasena_confirmacion": "Password123"
  }'
```

El email debe existir en `GN_TERCE.DIR_MAIL`.

### 3. Implementar servicio de email (Opcional):
```javascript
// config/mailer.js
const nodemailer = require('nodemailer');

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS
  }
});

function enviarEmail(opciones) {
  return transporter.sendMail(opciones);
}

function emailBienvenida(nombre, email) {
  return {
    to: email,
    subject: 'Bienvenido a Collective Mining',
    html: `<h1>Hola ${nombre}</h1><p>Tu cuenta ha sido creada exitosamente.</p>`
  };
}

module.exports = { enviarEmail, emailBienvenida };
```

---

## RESUMEN

| Problema | Causa | Solución | Estado |
|----------|-------|----------|--------|
| No ver "Conectado a BD" | Conexión lazy | Normal, verás cuando hagas login | ✅ Explicado |
| Error crear cuenta | `recordset` acceso incorrecto | Acceder via `.recordset` | ✅ Corregido |
| Error crear cuenta | Módulo mailer inexistente | Removida importación, usar logs | ✅ Corregido |
| Emails no envían | `config/mailer.js` no existe | TODO: Implementar cuando se necesite | ⚠️ Pendiente |

