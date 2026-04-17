# ⚡ QUICK FIX - FUNCIONALIDAD MÍNIMA EN 30 MINUTOS

## Objetivo
Lograr que **Login y Logout** funcionen correctamente sin afectar otras funciones.

---

## PASO 1: Deshabilitar funciones problemáticas (5 min)

### Editar `server.js`

Comentar las rutas que causan problemas:

```javascript
const express = require('express');
const cors = require('cors');
const bodyParser = require('body-parser');
const path = require('path');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: true }));

// Servir archivos estáticos
app.use(express.static(__dirname));

app.get('/', (req, res) => {
  res.sendFile(path.join(__dirname, 'login.html'));
});

// Importar rutas
const authRoutes = require('./routes/auth');
// const nominaRoutes = require('./routes/nomina');          // ⚠️ COMENTAR
// const reportesRoutes = require('./routes/reportes');      // ⚠️ COMENTAR
// const maestrosRoutes = require('./routes/maestros');      // ⚠️ COMENTAR

// Usar rutas
app.use('/api/auth', authRoutes);
// app.use('/api/nomina', nominaRoutes);                     // ⚠️ COMENTAR
// app.use('/api/reportes', reportesRoutes);                 // ⚠️ COMENTAR
// app.use('/api/maestros', maestrosRoutes);                 // ⚠️ COMENTAR

// Ruta de prueba
app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', message: 'Servidor de nómina funcionando' });
});

// Manejo de errores
app.use((err, req, res, next) => {
  console.error(err.stack);
  res.status(500).json({ error: 'Error interno del servidor', details: err.message });
});

// Iniciar servidor
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✓ Servidor ejecutándose en http://localhost:${PORT}`);
});
```

---

## PASO 2: Editar `routes/auth.js` (5 min)

Comentar las rutas que no funcionan:

```javascript
const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken, checkLevel } = require('../middleware/authMiddleware');

/**
 * Ruta pública - LOGIN
 * POST /api/auth/login
 */
router.post('/login', authController.login);

/**
 * Ruta protegida - LOGOUT
 * POST /api/auth/logout
 */
router.post('/logout', verifyToken, authController.logout);

/**
 * COMENTAR TODO LO QUE SIGUE - NO FUNCIONAN AÚN
 */

/*
router.post('/cambiar-contrasena', verifyToken, authController.cambiarContrasena);
router.get('/me', verifyToken, authController.obtenerUsuarioActual);
router.post('/crear-usuario', verifyToken, checkLevel(3), authController.crearUsuario);
router.get('/usuarios', verifyToken, checkLevel(3), authController.listarUsuarios);
router.get('/usuarios/:usuarioId', verifyToken, checkLevel(3), authController.obtenerUsuario);
router.put('/usuarios/:usuarioId', verifyToken, checkLevel(3), authController.actualizarUsuario);
router.patch('/usuarios/:usuarioId/estado', verifyToken, checkLevel(3), authController.cambiarEstadoUsuario);
router.patch('/usuarios/:usuarioId/desbloquear', verifyToken, checkLevel(3), authController.desbloquearUsuario);
router.delete('/usuarios/:usuarioId', verifyToken, checkLevel(3), authController.eliminarUsuario);
*/

module.exports = router;
```

---

## PASO 3: Editar `middleware/authMiddleware.js` (10 min)

### Reemplazar estas 3 funciones:

#### **Función 1: verifyToken (Línea 10-34)**

```javascript
const verifyToken = (req, res, next) => {
  const token = req.headers.authorization?.split(' ')[1];

  if (!token) {
    return res.status(401).json({
      status: 'error',
      message: 'Token no proporcionado'
    });
  }

  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    
    // ✅ CORRECCIÓN: Solo asignar campos que EXISTEN en el payload
    req.usuarioId = decoded.cod_usua;      // Campo correcto
    req.cod_empr = decoded.cod_empr;       // Campo correcto
    req.email = decoded.email;              // Campo correcto
    req.nombre = decoded.nombre;            // Campo correcto
    
    next();
  } catch (err) {
    return res.status(401).json({
      status: 'error',
      message: 'Token inválido o expirado',
      error: err.message
    });
  }
};
```

#### **Función 2: generateToken (Línea 144-156)**

```javascript
const generateToken = (usuarioData) => {
  // ✅ CORRECCIÓN: Solo incluir campos que EXISTEN en GN_USUAR
  const payload = {
    cod_usua: usuarioData.cod_usua,        // COD_USUA (correcto)
    cod_empr: usuarioData.cod_empr,        // COD_EMPR (correcto)
    email: usuarioData.email,               // DIR_ELEC (mapear a email)
    nombre: usuarioData.nombre,             // NOM_USUA (mapear a nombre)
    cedula: usuarioData.cedula || null      // NUM_IDEN del join
  };

  // Token con expiración de 8 horas
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
};
```

#### **Función 3: checkLevel (línea 129-139)**

```javascript
const checkLevel = (nivelMinimo) => {
  return (req, res, next) => {
    // ⚠️ NOTA: Como no existe NIVEL_USUAR en GN_USUAR,
    // esta función se skippea por ahora
    // TODO: Implementar basado en COD_GUSU y GN_PERMI
    console.warn('[AUTH] checkLevel: No implementado aún');
    next(); // Permitir por ahora
  };
};
```

---

## PASO 4: Editar `controllers/authController.js` (10 min)

### Solo editar función: logout

**Reemplazar líneas 232-272 con:**

```javascript
/**
 * LOGOUT - Cerrar sesión
 * POST /api/auth/logout
 */
exports.logout = async (req, res) => {
  try {
    const usuarioId = req.usuarioId;
    const ip = req.ip || req.connection.remoteAddress;

    // ✅ CORRECCIÓN: Usar campos REALES de GN_SESION
    const query = `
      UPDATE GN_SESION
      SET EST_SESI = 'C', FEC_CIER = GETDATE()
      WHERE COD_USUA = @usuarioId AND EST_SESI = 'A';

      INSERT INTO GN_LOG_ACCE (
        COD_USUA, TIP_EVEN, EST_EVEN, DES_EVEN, IP_ORIG, FEC_EVEN
      )
      VALUES (
        @usuarioId, 'LOGOUT', 'EXITOSO', 'Logout realizado', @ip, GETDATE()
      );
    `;

    await executeQuery(query, {
      usuarioId,
      ip
    });

    console.log(`[LOGOUT] ✓ Usuario ${usuarioId} cerró sesión`);

    return res.status(200).json({
      status: 'success',
      message: 'Sesión cerrada correctamente'
    });

  } catch (err) {
    console.error('[LOGOUT ERROR]', err);
    return res.status(500).json({
      status: 'error',
      message: 'Error al cerrar sesión',
      error: err.message
    });
  }
};
```

### Comentar todas las demás funciones (cambiarContrasena, obtenerUsuarioActual, etc.)

Simplemente reemplazar todas las funciones exportadas con:

```javascript
/**
 * CAMBIAR CONTRASEÑA - NO IMPLEMENTADO AÚN
 */
exports.cambiarContrasena = async (req, res) => {
  return res.status(501).json({
    status: 'error',
    message: 'Función en desarrollo'
  });
};

/**
 * OBTENER USUARIO ACTUAL - NO IMPLEMENTADO AÚN
 */
exports.obtenerUsuarioActual = async (req, res) => {
  return res.status(501).json({
    status: 'error',
    message: 'Función en desarrollo'
  });
};

/**
 * CREAR USUARIO - NO IMPLEMENTADO AÚN
 */
exports.crearUsuario = async (req, res) => {
  return res.status(501).json({
    status: 'error',
    message: 'Función en desarrollo'
  });
};

// ... etc para todas las demás
```

---

## PASO 5: Actualizar `login.html` (5 min)

Editar el script para NO intentar acceder a funciones deshabilitadas.

**Reemplazar línea 449-463:**

```javascript
if (response.ok) {
  // Guardar token en localStorage
  localStorage.setItem('authToken', data.token);
  localStorage.setItem('usuario', JSON.stringify(data.usuario));

  // ✅ NO verificar cambio de contraseña (no implementado)
  // ✅ Redirigir directamente
  mostrarAlerta('success', 'Login exitoso, redirigiendo...');
  setTimeout(() => {
    window.location.href = '/index_novedades.html';
  }, 1500);
} else {
```

---

## PASO 6: Actualizar `.env` (2 min)

Agregar JWT_SECRET si no existe:

```
SERVER=CM-ITD-P-05\SQLEXPRESS
DATABASE=MineDax
UID=JuanesCalle
PWD=LetItHappen35*
DRIVER=ODBC Driver 17 for SQL Server
PORT=3000
NODE_ENV=development
JWT_SECRET=clave-super-segura-minimo-32-caracteres-cambiar-en-prod
```

---

## PRUEBA RÁPIDA

### 1. Iniciar servidor:
```bash
npm start
```

**Salida esperada:**
```
✓ Conectado a SQL Server: MineDax
✓ Servidor ejecutándose en http://localhost:3000
```

### 2. Ir a http://localhost:3000

### 3. Intentar login con datos válidos:
- **Email/Cédula:** Buscar un usuario válido en GN_USUAR
- **Contraseña:** La correspondiente

**Resultado esperado:**
- ✅ Login exitoso
- ✅ Token guardado
- ✅ Redirige a index_novedades.html

### 4. Logout:
- Debe cerrar sesión sin errores

---

## CHECKLIST DE VERIFICACIÓN

```
[ ] server.js comentadas las rutas no-auth
[ ] routes/auth.js comentadas las funciones no-login/logout
[ ] middleware/authMiddleware.js:
    [ ] verifyToken usa cod_usua, cod_empr, email, nombre
    [ ] generateToken usa cod_usua, cod_empr, email, nombre
    [ ] checkLevel permite todo por ahora
[ ] controllers/authController.js:
    [ ] logout usa EST_SESI, FEC_CIER, COD_USUA
    [ ] logout inserta en GN_LOG_ACCE (no GN_LOG_ACCESO)
    [ ] demás funciones retornan 501
[ ] login.html no intenta cambio de contraseña modal
[ ] .env tiene JWT_SECRET
[ ] npm start funciona
[ ] Login funciona
[ ] Logout funciona
```

---

## SIGUIENTES PASOS (Después de confirmar que esto funciona)

1. **Implementar cambiarContrasena** con campos correctos
2. **Implementar obtenerUsuarioActual** leyendo desde GN_USUAR
3. **Implementar checkPermission** con GN_PERMI real
4. **Crear tablas faltantes** si es necesario (GN_ROL_USUAR para administración)
5. **Implementar CRUD de usuarios** con estructura correcta

---

## TIEMPO ESTIMADO: 30 MINUTOS

Si sigues estos pasos exactos sin desviaciones, deberías tener Login y Logout funcionando en media hora.

