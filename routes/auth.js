const express = require('express');
const router = express.Router();
const authController = require('../controllers/authController');
const { verifyToken, checkLevel } = require('../middleware/authMiddleware');

/**
 * Ruta pública - LOGIN
 * POST /api/auth/login
 * Body: { cedula_o_email, contrasena }
 */
router.post('/login', authController.login);

/**
 * Ruta pública - REGISTRO DE NUEVO USUARIO
 * POST /api/auth/registro
 * Body: { email, contrasena, contrasena_confirmacion }
 */
router.post('/registro', authController.registro);

/**
 * Ruta pública - SOLICITAR RECUPERACIÓN DE CONTRASEÑA
 * POST /api/auth/olvide-contrasena
 * Body: { email }
 */
router.post('/olvide-contrasena', authController.forgotPassword);

/**
 * Ruta pública - RESTABLECER CONTRASEÑA
 * POST /api/auth/restablecer-contrasena
 * Body: { token, contrasena, contrasena_confirmacion }
 */
router.post('/restablecer-contrasena', authController.resetPassword);

/**
 * Ruta pública - VALIDAR TOKEN DE RECUPERACIÓN
 * GET /api/auth/validar-token/:token
 */
router.get('/validar-token/:token', authController.validarToken);

/**
 * Ruta pública - VERIFICAR EMAIL DE CUENTA
 * GET /api/auth/verificar-email/:token
 */
router.get('/verificar-email/:token', authController.verificarEmail);

/**
 * Ruta pública - REENVIAR ENLACE DE VERIFICACIÓN
 * POST /api/auth/reenviar-verificacion
 * Body: { email }
 * Regenera el token y reenvía el email si la cuenta está pendiente de verificación.
 */
router.post('/reenviar-verificacion', authController.reenviarVerificacion);

/**
 * Ruta protegida - LOGOUT
 * POST /api/auth/logout
 */
router.post('/logout', verifyToken, authController.logout);

/**
 * Ruta protegida - CAMBIAR CONTRASEÑA
 * POST /api/auth/cambiar-contrasena
 * Body: { contrasena_actual, contrasena_nueva, contrasena_confirmacion }
 */
router.post('/cambiar-contrasena', verifyToken, authController.cambiarContrasena);

/**
 * Ruta protegida - OBTENER USUARIO ACTUAL
 * GET /api/auth/me
 */
router.get('/me', verifyToken, authController.obtenerUsuarioActual);

/**
 * Ruta protegida (Solo Admin) - CREAR USUARIO
 * POST /api/auth/crear-usuario
 * Body: { cedula, email, contrasena }
 */
router.post(
  '/crear-usuario',
  verifyToken,
  checkLevel(3), // Nivel 3 = Admin
  authController.crearUsuario
);

/**
 * Ruta protegida (Solo Admin) - LISTAR USUARIOS
 * GET /api/auth/usuarios
 * Query: { estado, rol, pagina, limite }
 */
router.get(
  '/usuarios',
  verifyToken,
  checkLevel(3), // Nivel 3 = Admin
  authController.listarUsuarios
);

/**
 * Ruta protegida (Solo Admin) - OBTENER USUARIO
 * GET /api/auth/usuarios/:usuarioId
 */
router.get(
  '/usuarios/:usuarioId',
  verifyToken,
  checkLevel(3), // Nivel 3 = Admin
  authController.obtenerUsuario
);

/**
 * Ruta protegida (Solo Admin) - ACTUALIZAR USUARIO
 * PUT /api/auth/usuarios/:usuarioId
 * Body: { nombre, email, nivel, departamento, cargo, estado }
 */
router.put(
  '/usuarios/:usuarioId',
  verifyToken,
  checkLevel(3), // Nivel 3 = Admin
  authController.actualizarUsuario
);

/**
 * Ruta protegida (Solo Admin) - CAMBIAR ESTADO USUARIO
 * PATCH /api/auth/usuarios/:usuarioId/estado
 * Body: { estado: true/false }
 */
router.patch(
  '/usuarios/:usuarioId/estado',
  verifyToken,
  checkLevel(3), // Nivel 3 = Admin
  authController.cambiarEstadoUsuario
);

/**
 * Ruta protegida (Solo Admin) - DESBLOQUEAR USUARIO
 * PATCH /api/auth/usuarios/:usuarioId/desbloquear
 */
router.patch(
  '/usuarios/:usuarioId/desbloquear',
  verifyToken,
  checkLevel(3), // Nivel 3 = Admin
  authController.desbloquearUsuario
);

/**
 * Ruta protegida (Solo Admin) - ELIMINAR USUARIO
 * DELETE /api/auth/usuarios/:usuarioId
 */
router.delete(
  '/usuarios/:usuarioId',
  verifyToken,
  checkLevel(3), // Nivel 3 = Admin
  authController.eliminarUsuario
);

module.exports = router;
