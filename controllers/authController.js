const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { executeQuery } = require('../config/database');
const {
  generateToken,
  registrarIntentoFallido,
  resetearIntentos,
  JWT_SECRET
} = require('../middleware/authMiddleware');
const {
  enviarEmail,
  emailBienvenida,
  emailRecuperacion,
  emailCambioExitoso,
  emailVerificacion
} = require('../config/mailer');

// Bootstrap idempotente: agrega columnas de auth que pueden no existir en BD legacy.
// Se ejecuta al arrancar el servidor. Usa IF NOT EXISTS → seguro en cualquier estado.
(async () => {
  try {
    await executeQuery(`
      -- Verificación de email (registro/creación de usuario)
      IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('GN_USUAR') AND name='TOK_VERI')
        ALTER TABLE GN_USUAR ADD TOK_VERI VARCHAR(255) NULL;
      IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('GN_USUAR') AND name='VER_EMAIL')
        ALTER TABLE GN_USUAR ADD VER_EMAIL CHAR(1) DEFAULT 'N' NULL;
      IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('GN_USUAR') AND name='FEC_VERI')
        ALTER TABLE GN_USUAR ADD FEC_VERI DATETIME NULL;

      -- Recuperación de contraseña (olvidé mi contraseña / reset)
      IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('GN_USUAR') AND name='TOK_RECO')
        ALTER TABLE GN_USUAR ADD TOK_RECO VARCHAR(255) NULL;
      IF NOT EXISTS (SELECT 1 FROM sys.columns WHERE object_id=OBJECT_ID('GN_USUAR') AND name='FEC_TOKE')
        ALTER TABLE GN_USUAR ADD FEC_TOKE DATETIME NULL;
    `);
    console.log('[auth] ✓ Columnas de auth listas (TOK_VERI, VER_EMAIL, FEC_VERI, TOK_RECO, FEC_TOKE).');
  } catch (e) {
    console.error('[auth] ✗ Error en bootstrap de columnas de auth:', e.message);
  }
})();

// ─── Generar abreviatura de usuario (máx 8 chars, char(8)) ───────────────────
// Algoritmo: primera letra MAYÚSCULA + segunda letra minúscula de cada palabra.
// Ej: "CALLE PALMETT JUAN ESTEBAN" → "CaPaJuEs" (8 chars)
// Si hay menos palabras, rellena con las letras disponibles hasta llenar.
function generarAbrUsuario(nombreCompleto) {
  if (!nombreCompleto) return 'MineDax ';
  const palabras = String(nombreCompleto).trim().split(/\s+/).filter(Boolean);
  let abr = '';
  for (const palabra of palabras) {
    if (abr.length >= 8) break;
    const p = palabra.replace(/[^a-zA-ZáéíóúÁÉÍÓÚüÜñÑ]/g, '');
    if (!p) continue;
    abr += p[0].toUpperCase();
    if (abr.length < 8 && p.length > 1) abr += p[1].toLowerCase();
  }
  // Si quedó vacío o muy corto, rellenar con el nombre truncado
  if (abr.length === 0) abr = 'MineDax ';
  // Pad con espacios hasta 8 (char(8) lo requiere)
  return abr.padEnd(8, ' ').substring(0, 8);
}

/**
 * LOGIN - Autenticación de usuario
 * Adaptado a estructura REAL de BD
 * POST /api/auth/login
 */
exports.login = async (req, res) => {
  try {
    const { cedula_o_email, contrasena } = req.body;
    const ip = req.ip || req.connection.remoteAddress;

    // Validar entrada
    if (!cedula_o_email || !contrasena) {
      return res.status(400).json({
        status: 'error',
        message: 'Email y contraseña son requeridos'
      });
    }

    // ✅ DIAGNÓSTICO: Primero, búsqueda simple SIN JOINs para verificar usuario existe
    const queryDiagnostico = `
      SELECT TOP 1
        u.COD_USUA,
        u.COD_EMPR,
        u.NOM_USUA,
        u.DIR_ELEC,
        u.PAS_HASH,
        u.ACT_INAC,
        u.IND_BLOQ,
        u.INT_FALL,
        u.COD_FUNCI,
        u.COD_GUSU,
        u.VER_EMAIL
      FROM GN_USUAR u
      WHERE RTRIM(LTRIM(u.DIR_ELEC)) = RTRIM(LTRIM(@email))
    `;

    const resultDiag = await executeQuery(queryDiagnostico, { email: cedula_o_email });

    if (!resultDiag || !resultDiag.recordset || resultDiag.recordset.length === 0) {
      console.warn(`[LOGIN] Usuario ${cedula_o_email} no encontrado en GN_USUAR`);

      await registrarIntento(null, cedula_o_email, 'LOGIN', 'FALLIDO',
                            'Usuario no encontrado', ip);

      return res.status(401).json({
        status: 'error',
        message: 'Email o contraseña incorrectos'
      });
    }

    const usuarioBasico = resultDiag.recordset[0];

    console.log(`[LOGIN] ✓ Usuario encontrado: ${usuarioBasico.NOM_USUA} (COD_USUA: ${usuarioBasico.COD_USUA})`);
    console.log(`[LOGIN] Estado: ACT_INAC=${usuarioBasico.ACT_INAC}, IND_BLOQ=${usuarioBasico.IND_BLOQ}, PAS_HASH=${usuarioBasico.PAS_HASH ? '***SET***' : 'NULL'}`);

    // ✅ Ahora, búsqueda COMPLETA con JOINs para obtener datos relacionados
    const queryBuscar = `
      SELECT TOP 1
        u.COD_USUA,
        u.COD_EMPR,
        u.NOM_USUA,
        u.DIR_ELEC,
        u.PAS_HASH,
        u.ACT_INAC,
        u.IND_BLOQ,
        u.INT_FALL,
        u.COD_FUNCI,
        u.COD_GUSU,
        u.CAM_PASS,
        u.ABR_USUA,
        u.VER_EMAIL,
        f.COD_CARGO,
        f.FEC_INGRES,
        f.FEC_RETIRO,
        f.ACT_ESTA as Empleado_Estado,
        t.NUM_IDEN,
        g.NOM_GUSU
      FROM GN_USUAR u
      LEFT JOIN GN_FUNCI f ON u.COD_FUNCI = f.COD_FUNCI AND f.COD_EMPR = u.COD_EMPR
      LEFT JOIN GN_TERCE t ON f.COD_TERC = t.COD_TERC AND t.COD_EMPR = u.COD_EMPR
      LEFT JOIN GN_GUSUA g ON u.COD_GUSU = g.COD_GUSU
      WHERE RTRIM(LTRIM(u.DIR_ELEC)) = RTRIM(LTRIM(@email))
    `;

    const result = await executeQuery(queryBuscar, { email: cedula_o_email });

    if (!result.recordset || result.recordset.length === 0) {
      console.warn(`[LOGIN] Usuario ${cedula_o_email} no encontrado`);

      // Registrar intento fallido
      await registrarIntento(null, cedula_o_email, 'LOGIN', 'FALLIDO',
                            'Usuario no encontrado', ip);

      return res.status(401).json({
        status: 'error',
        message: 'Email o contraseña incorrectos'
      });
    }

    const usuario = result.recordset[0];

    // Verificar si está bloqueado (IND_BLOQ = 'S')
    if (usuario.IND_BLOQ === 'S') {
      console.warn(`[LOGIN] Usuario ${cedula_o_email} está bloqueado`);

      await registrarIntento(usuario.COD_USUA, cedula_o_email, 'LOGIN', 'BLOQUEADO',
                            'Usuario bloqueado por intentos fallidos', ip);

      return res.status(403).json({
        status: 'error',
        message: 'Tu cuenta ha sido bloqueada por demasiados intentos fallidos. Contacta al administrador.'
      });
    }

    // Verificar si está activo (ACT_INAC = 'A' para activo en BD real)
    if (usuario.ACT_INAC !== 'A') {
      console.warn(`[LOGIN] Usuario ${cedula_o_email} inactivo (ACT_INAC=${usuario.ACT_INAC}, VER_EMAIL=${usuario.VER_EMAIL})`);

      await registrarIntento(usuario.COD_USUA, cedula_o_email, 'LOGIN', 'FALLIDO',
                            'Usuario inactivo', ip);

      // Distinguir cuenta pendiente de verificación de email vs. realmente inactiva
      if (usuario.VER_EMAIL === 'N') {
        return res.status(403).json({
          status: 'error',
          message: 'Tu cuenta aún no ha sido verificada. Revisa tu correo electrónico y haz clic en el enlace de verificación para activarla.',
          pendingVerification: true
        });
      }

      return res.status(403).json({
        status: 'error',
        message: 'Tu cuenta está inactiva. Contacta al administrador.'
      });
    }

    // Verificar si empleado está activo (ACT_ESTA = 'A')
    if (usuario.Empleado_Estado && usuario.Empleado_Estado !== 'A') {
      console.warn(`[LOGIN] Empleado de ${cedula_o_email} inactivo`);

      return res.status(403).json({
        status: 'error',
        message: 'Tu empleado está inactivo. Contacta a recursos humanos.'
      });
    }

    // Verificar contraseña contra PAS_HASH (bcrypt)
    if (!usuario.PAS_HASH) {
      console.warn(`[LOGIN] Usuario ${cedula_o_email} no tiene hash de contraseña`);

      await registrarIntento(usuario.COD_USUA, cedula_o_email, 'LOGIN', 'FALLIDO',
                            'Usuario sin contraseña válida', ip);

      return res.status(401).json({
        status: 'error',
        message: 'Email o contraseña incorrectos'
      });
    }

    const contrasenaValida = await bcrypt.compare(contrasena, usuario.PAS_HASH);

    if (!contrasenaValida) {
      console.warn(`[LOGIN] Contraseña incorrecta para ${cedula_o_email}`);

      const nuevoIntento = (usuario.INT_FALL || 0) + 1;
      const bloqueadoAhora = nuevoIntento >= 5;

      await registrarIntento(usuario.COD_USUA, cedula_o_email, 'LOGIN', 'FALLIDO',
                            `Contraseña incorrecta (intento ${nuevoIntento})`, ip);

      // Actualizar intentos fallidos (y bloquear si necesario)
      if (bloqueadoAhora) {
        await executeQuery(`
          UPDATE GN_USUAR SET INT_FALL = @intento, IND_BLOQ = 'S'
          WHERE COD_USUA = @usuarioId
        `, { intento: nuevoIntento, usuarioId: usuario.COD_USUA });
      } else {
        await executeQuery(`
          UPDATE GN_USUAR SET INT_FALL = @intento
          WHERE COD_USUA = @usuarioId
        `, { intento: nuevoIntento, usuarioId: usuario.COD_USUA });
      }

      return res.status(401).json({
        status: 'error',
        message: 'Email o contraseña incorrectos',
        intentosFallidos: nuevoIntento,
        bloqueado: bloqueadoAhora
      });
    }

    // ✅ LOGIN EXITOSO - Resetear intentos fallidos
    await executeQuery(`
      UPDATE GN_USUAR SET INT_FALL = 0, IND_BLOQ = 'N'
      WHERE COD_USUA = @usuarioId
    `, { usuarioId: usuario.COD_USUA });

    // Calcular ABR_USUA si aún no está persistida
    const abrUsua = (usuario.ABR_USUA && usuario.ABR_USUA.trim())
      ? usuario.ABR_USUA.trim()
      : generarAbrUsuario(usuario.NOM_USUA).trim();

    // Persistir ABR_USUA en la BD si estaba vacía
    if (!usuario.ABR_USUA || !usuario.ABR_USUA.trim()) {
      try {
        await executeQuery(
          `UPDATE GN_USUAR SET ABR_USUA = @abr WHERE COD_USUA = @id`,
          { abr: abrUsua.padEnd(8, ' ').substring(0, 8), id: usuario.COD_USUA }
        );
      } catch (_) { /* no crítico */ }
    }

    // Generar token JWT
    const token = generateToken({
      cod_usua: usuario.COD_USUA,
      cod_empr: usuario.COD_EMPR,
      email: usuario.DIR_ELEC,
      nombre: usuario.NOM_USUA,
      abr_usua: abrUsua,
      cedula: usuario.NUM_IDEN || usuario.DIR_ELEC,
      cod_funci: usuario.COD_FUNCI,
      cod_cargo: usuario.COD_CARGO,
      grupo: usuario.NOM_GUSU || 'Sin grupo'
    });

    // Registrar sesión en GN_SESION
    const queryRegistrarSesion = `
      INSERT INTO GN_SESION (
        COD_USUA, COD_TERC, IP_ORIG, AGE_HTTP, DIS_TIPO, EST_SESI,
        ACT_USUA, ACT_HORA, ACT_ESTA
      )
      VALUES (
        @usuarioId, NULL, @ip, @userAgent, @dispositivo, 'A',
        'LOGIN', GETDATE(), 'A'
      )
    `;

    const userAgent = req.headers['user-agent'] || '';
    await executeQuery(queryRegistrarSesion, {
      usuarioId: usuario.COD_USUA,
      ip,
      userAgent,
      dispositivo: detectarDispositivo(userAgent)
    });

    // Registrar evento exitoso en GN_LOG_ACCE
    await registrarIntento(usuario.COD_USUA, usuario.DIR_ELEC, 'LOGIN', 'EXITOSO',
                          'Login exitoso', ip);

    console.log(`[LOGIN] ✓ ${usuario.DIR_ELEC} (${usuario.NOM_USUA}) autenticado exitosamente`);

    return res.status(200).json({
      status: 'success',
      message: 'Login exitoso',
      token,
      usuario: {
        id: usuario.COD_USUA,
        empresa: usuario.COD_EMPR,
        email: usuario.DIR_ELEC,
        nombre: usuario.NOM_USUA,
        cedula: usuario.NUM_IDEN,
        cargo: usuario.COD_CARGO,
        grupo: usuario.NOM_GUSU || 'Sin grupo'
      }
    });

  } catch (err) {
    console.error('[LOGIN ERROR]', err);
    return res.status(500).json({
      status: 'error',
      message: 'Error en el proceso de login',
      error: err.message
    });
  }
};

/**
 * LOGOUT - Cerrar sesión
 * POST /api/auth/logout
 * ✅ CORRECCIÓN: Usar campos y tabla reales
 */
exports.logout = async (req, res) => {
  try {
    const usuarioId = req.usuarioId;
    const ip = req.ip || req.connection.remoteAddress;

    // ✅ Cerrar todas las sesiones activas del usuario usando campos reales
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

/**
 * CAMBIAR CONTRASEÑA
 * POST /api/auth/cambiar-contrasena
 * ✅ CORRECCIÓN: Usar campos reales (PAS_HASH, no PASSW_HASH, etc.)
 */
exports.cambiarContrasena = async (req, res) => {
  try {
    const { contrasena_actual, contrasena_nueva, contrasena_confirmacion } = req.body;
    const usuarioId = req.usuarioId;

    // Validar entrada
    if (!contrasena_actual || !contrasena_nueva || !contrasena_confirmacion) {
      return res.status(400).json({
        status: 'error',
        message: 'Todos los campos son requeridos'
      });
    }

    // Validar que las nuevas contraseñas coincidan
    if (contrasena_nueva !== contrasena_confirmacion) {
      return res.status(400).json({
        status: 'error',
        message: 'Las contraseñas nuevas no coinciden'
      });
    }

    // Validar longitud mínima
    if (contrasena_nueva.length < 8) {
      return res.status(400).json({
        status: 'error',
        message: 'La contraseña debe tener al menos 8 caracteres'
      });
    }

    // ✅ Obtener contraseña actual con campo correcto
    const queryActual = `
      SELECT PAS_HASH FROM GN_USUAR WHERE COD_USUA = @usuarioId
    `;
    const result = await executeQuery(queryActual, { usuarioId });
    const usuario = result.recordset[0];

    if (!usuario) {
      return res.status(404).json({
        status: 'error',
        message: 'Usuario no encontrado'
      });
    }

    // Verificar contraseña actual
    const contrasenaActualValida = await bcrypt.compare(
      contrasena_actual,
      usuario.PAS_HASH
    );

    if (!contrasenaActualValida) {
      return res.status(401).json({
        status: 'error',
        message: 'La contraseña actual es incorrecta'
      });
    }

    // Hash de la nueva contraseña
    const salt = await bcrypt.genSalt(10);
    const passHash = await bcrypt.hash(contrasena_nueva, salt);

    // ✅ Actualizar contraseña con campos y tabla reales
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
        @usuarioId, 'CAMBIO_PASS', 'EXITOSO', 'Contraseña cambiada', GETDATE()
      );
    `;

    await executeQuery(queryActualizar, {
      usuarioId,
      passHash
    });

    console.log(`[CAMBIO PASS] ✓ Usuario ${usuarioId} cambió contraseña`);

    return res.status(200).json({
      status: 'success',
      message: 'Contraseña cambiada exitosamente'
    });

  } catch (err) {
    console.error('[CAMBIO PASS ERROR]', err);
    return res.status(500).json({
      status: 'error',
      message: 'Error al cambiar contraseña',
      error: err.message
    });
  }
};

/**
 * OBTENER DATOS DEL USUARIO ACTUAL
 * GET /api/auth/me
 * ✅ CORRECCIÓN: Usar campos y estructura real de BD
 */
exports.obtenerUsuarioActual = async (req, res) => {
  try {
    const usuarioId = req.usuarioId;

    // ✅ Usar estructura real de GN_USUAR con JOINs
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
        u.FEC_ACTI,
        u.FEC_ULCA,
        u.ABR_USUA,
        f.COD_CARGO,
        g.NOM_GUSU,
        t.NUM_IDEN
      FROM GN_USUAR u
      LEFT JOIN GN_FUNCI f ON u.COD_FUNCI = f.COD_FUNCI
      LEFT JOIN GN_GUSUA g ON u.COD_GUSU = g.COD_GUSU
      LEFT JOIN GN_FUNCI f2 ON u.COD_FUNCI = f2.COD_FUNCI
      LEFT JOIN GN_TERCE t ON f2.COD_TERC = t.COD_TERC
      WHERE u.COD_USUA = @usuarioId;
    `;

    const result = await executeQuery(query, { usuarioId });

    const usuario = result.recordset?.[0];

    if (!usuario) {
      return res.status(404).json({
        status: 'error',
        message: 'Usuario no encontrado'
      });
    }

    const abrUsua = (usuario.ABR_USUA && usuario.ABR_USUA.trim())
      ? usuario.ABR_USUA.trim()
      : generarAbrUsuario(usuario.NOM_USUA).trim();

    return res.status(200).json({
      status: 'success',
      usuario: {
        id: usuario.COD_USUA,
        empresa: usuario.COD_EMPR,
        nombre: usuario.NOM_USUA,
        abr_usua: abrUsua,
        email: usuario.DIR_ELEC,
        cedula: usuario.NUM_IDEN,
        activo: usuario.ACT_INAC === 'S',
        bloqueado: usuario.IND_BLOQ === 'S',
        grupo: usuario.NOM_GUSU || 'Sin grupo',
        cargo: usuario.COD_CARGO || 'N/A',
        fechaActivacion: usuario.FEC_ACTI,
        fechaUltimaActividad: usuario.FEC_ULCA,
        fechaExpiracion: usuario.FEC_EXPI
      }
    });

  } catch (err) {
    console.error('[GET ME ERROR]', err);
    return res.status(500).json({
      status: 'error',
      message: 'Error al obtener datos del usuario',
      error: err.message
    });
  }
};

/**
 * CREAR USUARIO (Solo Admin)
 * POST /api/auth/crear-usuario
 * ✅ CORRECCIÓN: Usar estructura real de BD y relaciones correctas
 */
exports.crearUsuario = async (req, res) => {
  try {
    const { cedula, email, contrasena, cod_gusu } = req.body;

    // Validar entrada
    if (!cedula || !contrasena) {
      return res.status(400).json({
        status: 'error',
        message: 'Cédula y contraseña son requeridos'
      });
    }

    // Validar longitud mínima de contraseña
    if (contrasena.length < 8) {
      return res.status(400).json({
        status: 'error',
        message: 'La contraseña debe tener al menos 8 caracteres'
      });
    }

    // ✅ Verificar si ya existe (buscando por email o cedula en GN_TERCE)
    const queryExiste = `
      SELECT u.COD_USUA FROM GN_USUAR u
      LEFT JOIN GN_FUNCI f ON u.COD_FUNCI = f.COD_FUNCI
      LEFT JOIN GN_TERCE t ON f.COD_TERC = t.COD_TERC
      WHERE u.DIR_ELEC = @email
         OR t.NUM_IDEN = CAST(@cedula AS BIGINT)
    `;
    const resultExiste = await executeQuery(queryExiste, { cedula, email });

    if (resultExiste.recordset && resultExiste.recordset.length > 0) {
      return res.status(409).json({
        status: 'error',
        message: 'El usuario ya existe'
      });
    }

    // Hash de contraseña
    const salt = await bcrypt.genSalt(10);
    const passHash = await bcrypt.hash(contrasena, salt);

    // ✅ Crear usuario con estructura REAL de BD
    const queryCrear = `
      DECLARE @COD_TERC DECIMAL(13,0);
      DECLARE @COD_FUNCI INT;
      DECLARE @NOM_TERC NVARCHAR(240);

      -- Buscar el tercero (persona) por cedula
      SELECT TOP 1 @COD_TERC = COD_TERC, @NOM_TERC = NOM_COMP
      FROM GN_TERCE
      WHERE NUM_IDEN = CAST(@cedula AS BIGINT);

      -- Buscar la función (empleado) del tercero
      IF @COD_TERC IS NOT NULL
      BEGIN
        SELECT TOP 1 @COD_FUNCI = COD_FUNCI
        FROM GN_FUNCI
        WHERE COD_TERC = @COD_TERC;
      END

      -- Insertar usuario con estructura REAL
      DECLARE @NewCodUsua BIGINT;
      INSERT INTO GN_USUAR (
        COD_EMPR, NOM_USUA, DIR_ELEC, PAS_HASH, COD_FUNCI, COD_GUSU,
        ACT_INAC, IND_BLOQ, INT_FALL,
        ABR_USUA, ACT_USUA, ACT_HORA, ACT_ESTA
      )
      VALUES (
        1, ISNULL(@NOM_TERC, @email), @email, @passHash, @COD_FUNCI, @codGusu,
        'S', 'N', 0,
        @abrUsua, 'ADMIN', GETDATE(), 'A'
      );

      SET @NewCodUsua = SCOPE_IDENTITY();

      SELECT @NewCodUsua AS COD_USUA, ISNULL(@NOM_TERC, @email) AS NOM_USUA;
    `;

    // Calcular ABR_USUA a partir del nombre: se obtiene del tercero luego del INSERT,
    // pero podemos calcularla aquí con la cédula como fallback temporal.
    // El valor real se actualizará en el primer login cuando NOM_USUA esté disponible.
    const abrProvisional = generarAbrUsuario(email || cedula).padEnd(8, ' ').substring(0, 8);

    const resultCrear = await executeQuery(queryCrear, {
      cedula,
      email: email || cedula,
      passHash,
      codGusu: cod_gusu || 1,  // Por defecto grupo 1
      abrUsua: abrProvisional
    });

    const nuevoUsuarioId = resultCrear.recordset[0]?.COD_USUA;
    const nomUsuario     = resultCrear.recordset[0]?.NOM_USUA || (email || cedula);
    const emailUsuario   = email || cedula;

    // Generar token de verificación (24 h) y persistir en BD
    const { v4: uuidv4 } = require('uuid');
    const tokVeri = uuidv4();
    try {
      await executeQuery(`
        UPDATE GN_USUAR
        SET TOK_VERI = @tokVeri, VER_EMAIL = 'N', FEC_VERI = DATEADD(HOUR, 24, GETUTCDATE())
        WHERE COD_USUA = @codUsuario
      `, { tokVeri, codUsuario: nuevoUsuarioId });
    } catch (_) {}

    // Enviar email de verificación + bienvenida (fire-and-forget)
    const baseUrlAdmin = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const verifyLink = `${baseUrlAdmin}/verificar-email.html?token=${tokVeri}`;
    enviarEmail(emailVerificacion(nomUsuario, emailUsuario, verifyLink))
      .then(r => {
        if (r.success) console.log(`[CREATE USER] ✓ Email verificación enviado a: ${emailUsuario}`);
        else           console.error(`[CREATE USER] ✗ Email verificación: ${r.error}`);
      });
    enviarEmail(emailBienvenida(nomUsuario, emailUsuario))
      .then(r => {
        if (r.success) console.log(`[CREATE USER] ✓ Email bienvenida enviado a: ${emailUsuario}`);
        else           console.error(`[CREATE USER] ✗ Email bienvenida: ${r.error}`);
      });

    console.log(`[CREATE USER] ✓ Usuario ${cedula} creado (ID: ${nuevoUsuarioId})`);

    return res.status(201).json({
      status: 'success',
      message: 'Usuario creado exitosamente. Se enviaron emails de bienvenida y verificación.',
      usuarioId: nuevoUsuarioId
    });

  } catch (err) {
    console.error('[CREATE USER ERROR]', err);
    return res.status(500).json({
      status: 'error',
      message: 'Error al crear usuario',
      error: err.message
    });
  }
};

/**
 * LISTAR USUARIOS (Solo Admin)
 * GET /api/auth/usuarios
 * ✅ CORRECCIÓN: Usar campos y estructura real de BD
 */
exports.listarUsuarios = async (req, res) => {
  try {
    const { estado, pagina = 1, limite = 20 } = req.query;
    const offset = (pagina - 1) * limite;

    // ✅ Usar estructura real de GN_USUAR con JOINs
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
        u.INT_FALL,
        g.NOM_GUSU,
        g.COD_GUSU,
        f.COD_CARGO,
        t.NUM_IDEN
      FROM GN_USUAR u
      LEFT JOIN GN_GUSUA g ON u.COD_GUSU = g.COD_GUSU
      LEFT JOIN GN_FUNCI f ON u.COD_FUNCI = f.COD_FUNCI
      LEFT JOIN GN_TERCE t ON f.COD_TERC = t.COD_TERC
      WHERE 1=1
    `;

    if (estado !== undefined) {
      query += ` AND u.ACT_INAC = @estado`;
    }

    query += ` ORDER BY u.FEC_ACTI DESC
      OFFSET @offset ROWS FETCH NEXT @limite ROWS ONLY`;

    const params = { offset, limite };
    if (estado !== undefined) {
      params.estado = estado === 'activo' ? 'S' : 'N';
    }

    const result = await executeQuery(query, params);

    // Mapear campos para respuesta
    const usuarios = result.recordset.map(u => ({
      id: u.COD_USUA,
      empresa: u.COD_EMPR,
      nombre: u.NOM_USUA,
      email: u.DIR_ELEC,
      cedula: u.NUM_IDEN,
      activo: u.ACT_INAC === 'S',
      bloqueado: u.IND_BLOQ === 'S',
      intentosFallidos: u.INT_FALL,
      grupo: u.NOM_GUSU || 'Sin grupo',
      cargo: u.COD_CARGO,
      fechaActivacion: u.FEC_ACTI,
      fechaUltimaActividad: u.FEC_ULCA
    }));

    return res.status(200).json({
      status: 'success',
      usuarios,
      total: usuarios.length,
      pagina,
      limite
    });

  } catch (err) {
    console.error('[LIST USERS ERROR]', err);
    return res.status(500).json({
      status: 'error',
      message: 'Error al listar usuarios',
      error: err.message
    });
  }
};

/**
 * OBTENER USUARIO POR ID (Solo Admin)
 * GET /api/auth/usuarios/:usuarioId
 * ✅ CORRECCIÓN: Usar campos y estructura real
 */
exports.obtenerUsuario = async (req, res) => {
  try {
    const { usuarioId } = req.params;

    // ✅ Usar estructura real con campos correctos
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
        u.FEC_EXPI,
        u.COD_GUSU,
        f.COD_CARGO,
        g.NOM_GUSU,
        t.NUM_IDEN
      FROM GN_USUAR u
      LEFT JOIN GN_FUNCI f ON u.COD_FUNCI = f.COD_FUNCI
      LEFT JOIN GN_GUSUA g ON u.COD_GUSU = g.COD_GUSU
      LEFT JOIN GN_FUNCI f2 ON u.COD_FUNCI = f2.COD_FUNCI
      LEFT JOIN GN_TERCE t ON f2.COD_TERC = t.COD_TERC
      WHERE u.COD_USUA = @usuarioId
    `;

    const result = await executeQuery(query, { usuarioId });

    if (!result.recordset || result.recordset.length === 0) {
      return res.status(404).json({
        status: 'error',
        message: 'Usuario no encontrado'
      });
    }

    const u = result.recordset[0];

    return res.status(200).json({
      status: 'success',
      usuario: {
        id: u.COD_USUA,
        empresa: u.COD_EMPR,
        nombre: u.NOM_USUA,
        email: u.DIR_ELEC,
        cedula: u.NUM_IDEN,
        activo: u.ACT_INAC === 'S',
        bloqueado: u.IND_BLOQ === 'S',
        intentosFallidos: u.INT_FALL,
        grupo: u.NOM_GUSU,
        cargo: u.COD_CARGO,
        fechaActivacion: u.FEC_ACTI,
        fechaUltimaActividad: u.FEC_ULCA,
        fechaExpiracion: u.FEC_EXPI
      }
    });

  } catch (err) {
    console.error('[GET USER ERROR]', err);
    return res.status(500).json({
      status: 'error',
      message: 'Error al obtener usuario',
      error: err.message
    });
  }
};

/**
 * ACTUALIZAR USUARIO (Solo Admin)
 * PUT /api/auth/usuarios/:usuarioId
 * ✅ CORRECCIÓN: Usar campos y tabla reales
 */
exports.actualizarUsuario = async (req, res) => {
  try {
    const { usuarioId } = req.params;
    const { nombre, email, estado, cod_gusu } = req.body;

    // ✅ Usar campos y tabla reales
    const query = `
      UPDATE GN_USUAR
      SET
        NOM_USUA = ISNULL(@nombre, NOM_USUA),
        DIR_ELEC = ISNULL(@email, DIR_ELEC),
        ACT_INAC = ISNULL(@estado, ACT_INAC),
        COD_GUSU = ISNULL(@codGusu, COD_GUSU),
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

    await executeQuery(query, {
      usuarioId,
      nombre: nombre || null,
      email: email || null,
      estado: estado !== undefined ? (estado === true ? 'S' : 'N') : null,
      codGusu: cod_gusu || null
    });

    console.log(`[UPDATE USER] ✓ Usuario ${usuarioId} actualizado`);

    return res.status(200).json({
      status: 'success',
      message: 'Usuario actualizado exitosamente'
    });

  } catch (err) {
    console.error('[UPDATE USER ERROR]', err);
    return res.status(500).json({
      status: 'error',
      message: 'Error al actualizar usuario',
      error: err.message
    });
  }
};

/**
 * CAMBIAR ESTADO DE USUARIO (Activo/Inactivo)
 * PATCH /api/auth/usuarios/:usuarioId/estado
 * ✅ CORRECCIÓN: Usar campos y tabla reales
 */
exports.cambiarEstadoUsuario = async (req, res) => {
  try {
    const { usuarioId } = req.params;
    const { estado } = req.body; // true = activo, false = inactivo

    if (estado === undefined) {
      return res.status(400).json({
        status: 'error',
        message: 'El campo estado es requerido'
      });
    }

    // ✅ Usar campos y tabla reales
    const estadoValor = estado ? 'S' : 'N';
    const query = `
      UPDATE GN_USUAR
      SET ACT_INAC = @estado, FEC_ULCA = GETDATE()
      WHERE COD_USUA = @usuarioId;

      INSERT INTO GN_LOG_ACCE (
        COD_USUA, TIP_EVEN, EST_EVEN, DES_EVEN, FEC_EVEN
      )
      VALUES (
        @usuarioId, 'CAMBIO_ESTADO', 'EXITOSO',
        'Usuario ' + CASE WHEN @estado = 'S' THEN 'activado' ELSE 'desactivado' END,
        GETDATE()
      );
    `;

    await executeQuery(query, {
      usuarioId,
      estado: estadoValor
    });

    const estadoTexto = estado ? 'activado' : 'desactivado';
    console.log(`[CAMBIO ESTADO] ✓ Usuario ${usuarioId} ${estadoTexto}`);

    return res.status(200).json({
      status: 'success',
      message: `Usuario ${estadoTexto} exitosamente`
    });

  } catch (err) {
    console.error('[CAMBIO ESTADO ERROR]', err);
    return res.status(500).json({
      status: 'error',
      message: 'Error al cambiar estado del usuario',
      error: err.message
    });
  }
};

/**
 * DESBLOQUEAR USUARIO
 * PATCH /api/auth/usuarios/:usuarioId/desbloquear
 * ✅ CORRECCIÓN: Usar campos y tabla reales
 */
exports.desbloquearUsuario = async (req, res) => {
  try {
    const { usuarioId } = req.params;

    // ✅ Usar campos y tabla reales
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

    await executeQuery(query, { usuarioId });

    console.log(`[DESBLOQUEAR] ✓ Usuario ${usuarioId} desbloqueado`);

    return res.status(200).json({
      status: 'success',
      message: 'Usuario desbloqueado exitosamente'
    });

  } catch (err) {
    console.error('[DESBLOQUEAR ERROR]', err);
    return res.status(500).json({
      status: 'error',
      message: 'Error al desbloquear usuario',
      error: err.message
    });
  }
};

/**
 * ELIMINAR USUARIO (Solo Admin)
 * DELETE /api/auth/usuarios/:usuarioId
 * ✅ CORRECCIÓN: Marcar como inactivo en lugar de eliminar (mantener integridad histórica)
 * ✅ CORRECCIÓN: Usar campos y tabla reales
 */
exports.eliminarUsuario = async (req, res) => {
  try {
    const { usuarioId } = req.params;

    // Verificar que no intente eliminarse a sí mismo
    if (usuarioId === req.usuarioId) {
      return res.status(400).json({
        status: 'error',
        message: 'No puedes eliminar tu propia cuenta'
      });
    }

    // ✅ Marcar como inactivo en lugar de DELETE para mantener integridad histórica
    const query = `
      -- Registrar en log
      INSERT INTO GN_LOG_ACCE (
        COD_USUA, TIP_EVEN, EST_EVEN, DES_EVEN, FEC_EVEN
      )
      VALUES (
        @usuarioId, 'DELETE_USUA', 'EXITOSO', 'Usuario marcado como inactivo', GETDATE()
      );

      -- Cerrar sesiones activas
      UPDATE GN_SESION
      SET EST_SESI = 'C', FEC_CIER = GETDATE()
      WHERE COD_USUA = @usuarioId AND EST_SESI = 'A';

      -- Marcar usuario como inactivo (NO ELIMINAR DATOS)
      UPDATE GN_USUAR
      SET ACT_INAC = 'N', IND_BLOQ = 'S', FEC_ULCA = GETDATE()
      WHERE COD_USUA = @usuarioId;
    `;

    await executeQuery(query, { usuarioId });

    console.log(`[DELETE USER] ✓ Usuario ${usuarioId} marcado como inactivo`);

    return res.status(200).json({
      status: 'success',
      message: 'Usuario eliminado exitosamente (marcado como inactivo)'
    });

  } catch (err) {
    console.error('[DELETE USER ERROR]', err);
    return res.status(500).json({
      status: 'error',
      message: 'Error al eliminar usuario',
      error: err.message
    });
  }
};

/**
 * FUNCIÓN AUXILIAR: Registrar intento de login en GN_LOG_ACCE
 * Estructura REAL de BD
 */
async function registrarIntento(codUsuario, email, tipoEvento, estado, descripcion, ip) {
  try {
    // ✅ CRÍTICO: Solo registrar si hay un usuario válido (FK constraint)
    // Si codUsuario es null, el intento se registró pero sin FK a GN_USUAR
    // No podemos insertar NULL en una FK, así que omitimos cuando no hay usuario
    if (!codUsuario) {
      console.log(`[AUDITORÍA] Intento de ${tipoEvento} para ${email}: ${estado}`);
      return;
    }

    const query = `
      INSERT INTO GN_LOG_ACCE (
        COD_USUA, TIP_EVEN, EST_EVEN, DES_EVEN, IP_ORIG, FEC_EVEN
      )
      VALUES (
        @codUsuario, @tipoEvento, @estado, @descripcion, @ip, GETDATE()
      )
    `;

    await executeQuery(query, {
      codUsuario,
      tipoEvento,
      estado,
      descripcion,
      ip
    });
  } catch (err) {
    console.error('[AUDITORÍA ERROR]', err.message);
    // No lanzar error, solo log
  }
}

/**
 * Detectar tipo de dispositivo desde User-Agent
 */
function detectarDispositivo(userAgent) {
  if (/mobile|android|iphone|ipad|opera mini/i.test(userAgent)) {
    return 'Mobile';
  } else if (/tablet|ipad/i.test(userAgent)) {
    return 'Tablet';
  }
  return 'Desktop';
}

/**
 * REGISTRO DE NUEVO USUARIO (Public)
 * POST /api/auth/registro
 * Crea usuario con cualquier correo válido — sin restricción de GN_TERCE.
 * El nombre se toma del campo "nombre" del body; si no se envía, se deriva del email.
 */
exports.registro = async (req, res) => {
  try {
    const { email, contrasena, contrasena_confirmacion, nombre: nombreBody } = req.body;

    // Validar entrada
    if (!email || !contrasena || !contrasena_confirmacion) {
      return res.status(400).json({
        status: 'error',
        message: 'Email y contraseña son requeridos'
      });
    }

    // Validar que contraseñas coincidan
    if (contrasena !== contrasena_confirmacion) {
      return res.status(400).json({
        status: 'error',
        message: 'Las contraseñas no coinciden'
      });
    }

    // Validar longitud mínima
    if (contrasena.length < 8) {
      return res.status(400).json({
        status: 'error',
        message: 'La contraseña debe tener al menos 8 caracteres'
      });
    }

    // Nombre de usuario: usar el enviado en el body o derivar del email
    const nombreUsuario = (nombreBody || '').trim() || email.split('@')[0];

    // Verificar que no existe usuario con ese email
    const verificarUsuarioQuery = `
      SELECT TOP 1 COD_USUA
      FROM GN_USUAR
      WHERE DIR_ELEC = @email AND ACT_ESTA = 'A'
    `;

    const usuarioExistente = await executeQuery(verificarUsuarioQuery, { email });

    if (usuarioExistente && usuarioExistente.recordset && usuarioExistente.recordset.length > 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Ya existe una cuenta activa con este email'
      });
    }

    // COD_FUNCI: intentar encontrar al empleado por email en GN_TERCE (opcional)
    let codFunci = null;
    try {
      const fResult = await executeQuery(`
        SELECT TOP 1 f.COD_FUNCI
        FROM GN_FUNCI f
        INNER JOIN GN_TERCE t ON t.COD_TERC = f.COD_TERC AND t.COD_EMPR = f.COD_EMPR
        WHERE t.DIR_MAIL = @email AND f.COD_EMPR = 1 AND f.ACT_ESTA = 'A'
      `, { email });
      if (fResult && fResult.recordset && fResult.recordset.length > 0) {
        codFunci = fResult.recordset[0].COD_FUNCI;
      }
    } catch (_) { /* tabla sin columna DIR_MAIL — no bloquea */ }

    // Hash de contraseña
    const hashedPassword = await bcrypt.hash(contrasena, 10);

    // Insertar nuevo usuario (COD_GUSU 2 = usuario estándar)
    const crearUsuarioQuery = `
      INSERT INTO GN_USUAR (
        COD_EMPR, NOM_USUA, DIR_ELEC, PAS_HASH, ACT_INAC, IND_BLOQ,
        INT_FALL, COD_FUNCI, COD_GUSU, ACT_USUA, ACT_HORA, ACT_ESTA, FEC_ULCA
      )
      VALUES (
        1, @nombre, @email, @pasHash, 'S', 'N', 0, @codFunci, 2,
        'SISTEMA', GETDATE(), 'A', GETDATE()
      );

      SELECT SCOPE_IDENTITY() as nuevoId;
    `;

    const crearResult = await executeQuery(crearUsuarioQuery, {
      nombre: nombreUsuario,
      email,
      pasHash: hashedPassword,
      codFunci
    });

    // ✅ CORRECCIÓN: Acceder correctamente al SCOPE_IDENTITY()
    const nuevoCodigoUsuario = crearResult.recordset[0].nuevoId;

    // Registrar en log
    const registroLogQuery = `
      INSERT INTO GN_LOG_ACCE (
        COD_USUA, TIP_EVEN, EST_EVEN, DES_EVEN, IP_ORIG, FEC_EVEN
      )
      VALUES (
        @codUsuario, 'REGISTRO', 'EXITOSO', 'Nuevo usuario registrado', @ip, GETDATE()
      )
    `;

    try {
      await executeQuery(registroLogQuery, {
        codUsuario: nuevoCodigoUsuario,
        ip: req.ip || 'DESCONOCIDA'
      });
    } catch (logErr) {
      console.error('Error registrando en log:', logErr.message);
      // No detener por error de log
    }

    // Generar token de verificación de email (24 horas)
    const { v4: uuidv4 } = require('uuid');
    const tokVeri = uuidv4();
    try {
      await executeQuery(`
        UPDATE GN_USUAR
        SET TOK_VERI = @tokVeri, VER_EMAIL = 'N', FEC_VERI = DATEADD(HOUR, 24, GETUTCDATE())
        WHERE COD_USUA = @codUsuario
      `, { tokVeri, codUsuario: nuevoCodigoUsuario });
    } catch (_) {}

    // Enviar email de bienvenida + enlace de verificación
    const baseUrlReg = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const verifyLink = `${baseUrlReg}/verificar-email.html?token=${tokVeri}`;
    enviarEmail(emailVerificacion(nombreUsuario, email, verifyLink))
      .then(r => {
        if (r.success) console.log(`[REGISTRO] ✓ Email de verificación enviado a: ${email}`);
        else           console.error(`[REGISTRO] ✗ Error email verificación: ${r.error}`);
      });
    enviarEmail(emailBienvenida(nombreUsuario, email))
      .then(r => {
        if (r.success) console.log(`[REGISTRO] ✓ Email de bienvenida enviado a: ${email}`);
        else           console.error(`[REGISTRO] ✗ Error email bienvenida: ${r.error}`);
      });

    console.log(`[REGISTRO] ✓ Usuario creado: ${email} (ID: ${nuevoCodigoUsuario})`);

    // ✅ NOTA: La cuenta queda con ACT_INAC = 'S' hasta que el usuario verifique su email.
    // No generamos token JWT aquí — el usuario debe verificar el email primero para activar su cuenta.
    // Esto previene acceso sin verificación.

    return res.status(201).json({
      status: 'success',
      message: `Cuenta creada exitosamente. Hemos enviado un enlace de verificación a ${email}. Por favor revisa tu correo y haz clic en el enlace para activar tu cuenta.`,
      pendingVerification: true,
      usuario: {
        id: nuevoCodigoUsuario,
        nombre: nombreUsuario,
        email
      }
    });

  } catch (err) {
    console.error('[REGISTRO ERROR]', err);
    return res.status(500).json({
      status: 'error',
      message: 'Error al crear cuenta',
      error: err.message
    });
  }
};

/**
 * SOLICITAR RECUPERACIÓN DE CONTRASEÑA (Public)
 * POST /api/auth/olvide-contrasena
 * Enviar email con link de recuperación
 */
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({
        status: 'error',
        message: 'El email es requerido'
      });
    }

    // Buscar usuario
    const buscarQuery = `
      SELECT TOP 1 COD_USUA, NOM_USUA, DIR_ELEC
      FROM GN_USUAR
      WHERE DIR_ELEC = @email AND ACT_ESTA = 'A'
    `;

    const usuarioResult = await executeQuery(buscarQuery, { email });

    // ✅ CORRECCIÓN: Acceder a recordset correctamente
    if (!usuarioResult || !usuarioResult.recordset || usuarioResult.recordset.length === 0) {
      // Por seguridad, no revelar si el email existe o no
      return res.status(200).json({
        status: 'success',
        message: 'Si el email existe, recibirás instrucciones para restablecer tu contraseña'
      });
    }

    const usuario = usuarioResult.recordset[0];
    const { v4: uuidv4 } = require('uuid');
    const token = uuidv4();

    // Guardar token en BD con expiración de 2 horas
    const guardarTokenQuery = `
      UPDATE GN_USUAR
      SET TOK_RECO = @token, FEC_TOKE = DATEADD(HOUR, 2, GETUTCDATE())
      WHERE COD_USUA = @codUsuario
    `;

    await executeQuery(guardarTokenQuery, {
      token,
      codUsuario: usuario.COD_USUA
    });

    // Generar link desde la URL del request (funciona en cualquier red)
    const baseUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
    const resetLink = `${baseUrl}/reset-password.html?token=${token}`;

    // Enviar email de recuperación
    const resultadoEmail = await enviarEmail(
      emailRecuperacion(usuario.NOM_USUA, usuario.DIR_ELEC, resetLink)
    );
    if (resultadoEmail.success) {
      console.log(`[FORGOT PASSWORD] ✓ Email enviado a: ${usuario.DIR_ELEC}`);
    } else {
      console.error(`[FORGOT PASSWORD] ✗ Error enviando email: ${resultadoEmail.error}`);
      console.log(`[FORGOT PASSWORD] Link de recuperación (fallback): ${resetLink}`);
    }

    // Registrar en log
    try {
      const logQuery = `
        INSERT INTO GN_LOG_ACCE (
          COD_USUA, TIP_EVEN, EST_EVEN, DES_EVEN, IP_ORIG, FEC_EVEN
        )
        VALUES (
          @codUsuario, 'FORGOT_PASS', 'EXITOSO', 'Solicitud de recuperación de contraseña', @ip, GETDATE()
        )
      `;
      await executeQuery(logQuery, {
        codUsuario: usuario.COD_USUA,
        ip: req.ip || 'DESCONOCIDA'
      });
    } catch (logErr) {
      console.error('Error registrando en log:', logErr.message);
    }

    console.log(`[FORGOT PASSWORD] ✓ Email enviado a: ${email}`);

    return res.status(200).json({
      status: 'success',
      message: 'Si el email existe, recibirás instrucciones para restablecer tu contraseña'
    });

  } catch (err) {
    console.error('[FORGOT PASSWORD ERROR]', err);
    return res.status(500).json({
      status: 'error',
      message: 'Error al procesar solicitud',
      error: err.message
    });
  }
};

/**
 * RESTABLECER CONTRASEÑA (Public)
 * POST /api/auth/restablecer-contrasena
 * Validar token y cambiar contraseña
 */
exports.resetPassword = async (req, res) => {
  try {
    const { token, contrasena, contrasena_confirmacion } = req.body;

    if (!token || !contrasena || !contrasena_confirmacion) {
      return res.status(400).json({
        status: 'error',
        message: 'Token y contraseña son requeridos'
      });
    }

    // Validar que contraseñas coincidan
    if (contrasena !== contrasena_confirmacion) {
      return res.status(400).json({
        status: 'error',
        message: 'Las contraseñas no coinciden'
      });
    }

    // Validar longitud mínima
    if (contrasena.length < 8) {
      return res.status(400).json({
        status: 'error',
        message: 'La contraseña debe tener al menos 8 caracteres'
      });
    }

    // Buscar usuario con token válido
    const buscarQuery = `
      SELECT TOP 1 COD_USUA, NOM_USUA, DIR_ELEC, FEC_TOKE
      FROM GN_USUAR
      WHERE TOK_RECO = @token AND ACT_ESTA = 'A'
    `;

    const usuarioResult = await executeQuery(buscarQuery, { token });

    // ✅ CORRECCIÓN: Acceder a recordset correctamente
    if (!usuarioResult || !usuarioResult.recordset || usuarioResult.recordset.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Token inválido o expirado'
      });
    }

    const usuario = usuarioResult.recordset[0];

    // Validar que el token no haya expirado
    const ahora = new Date();
    const fechaToken = new Date(usuario.FEC_TOKE);

    if (ahora > fechaToken) {
      return res.status(400).json({
        status: 'error',
        message: 'Token expirado. Solicita uno nuevo.'
      });
    }

    // Hash de nueva contraseña
    const hashedPassword = await bcrypt.hash(contrasena, 10);

    // Actualizar contraseña y limpiar token
    const actualizarQuery = `
      UPDATE GN_USUAR
      SET PAS_HASH = @pasHash, TOK_RECO = NULL, FEC_TOKE = NULL,
          CAM_PASS = GETDATE(), FEC_ULCA = GETDATE()
      WHERE COD_USUA = @codUsuario;

      INSERT INTO GN_LOG_ACCE (
        COD_USUA, TIP_EVEN, EST_EVEN, DES_EVEN, FEC_EVEN
      )
      VALUES (
        @codUsuario, 'RESET_PASS', 'EXITOSO', 'Contraseña restablecida', GETDATE()
      );
    `;

    await executeQuery(actualizarQuery, {
      pasHash: hashedPassword,
      codUsuario: usuario.COD_USUA
    });

    // Enviar email de confirmación de cambio
    enviarEmail(emailCambioExitoso(usuario.NOM_USUA, usuario.DIR_ELEC))
      .then(r => {
        if (r.success) console.log(`[RESET PASSWORD] ✓ Email de confirmación enviado a: ${usuario.DIR_ELEC}`);
        else           console.error(`[RESET PASSWORD] ✗ Error email confirmación: ${r.error}`);
      });

    console.log(`[RESET PASSWORD] ✓ Contraseña restablecida para: ${usuario.DIR_ELEC}`);

    return res.status(200).json({
      status: 'success',
      message: 'Contraseña restablecida exitosamente. Inicia sesión con tu nueva contraseña.'
    });

  } catch (err) {
    console.error('[RESET PASSWORD ERROR]', err);
    return res.status(500).json({
      status: 'error',
      message: 'Error al restablecer contraseña',
      error: err.message
    });
  }
};

/**
 * VALIDAR TOKEN DE RECUPERACIÓN (Public)
 * GET /api/auth/validar-token/:token
 * Verificar si el token es válido sin expirar
 */
exports.validarToken = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({
        status: 'error',
        message: 'Token requerido'
      });
    }

    // Buscar usuario con token válido
    const buscarQuery = `
      SELECT TOP 1 COD_USUA, NOM_USUA, DIR_ELEC, FEC_TOKE
      FROM GN_USUAR
      WHERE TOK_RECO = @token AND ACT_ESTA = 'A'
    `;

    const usuarioResult = await executeQuery(buscarQuery, { token });

    // ✅ CORRECCIÓN: Acceder a recordset correctamente
    if (!usuarioResult || !usuarioResult.recordset || usuarioResult.recordset.length === 0) {
      return res.status(400).json({
        status: 'error',
        message: 'Token inválido',
        valido: false
      });
    }

    const usuario = usuarioResult.recordset[0];

    // Validar que el token no haya expirado
    const ahora = new Date();
    const fechaToken = new Date(usuario.FEC_TOKE);

    if (ahora > fechaToken) {
      return res.status(400).json({
        status: 'error',
        message: 'Token expirado',
        valido: false
      });
    }

    return res.status(200).json({
      status: 'success',
      message: 'Token válido',
      valido: true,
      usuario: {
        nombre: usuario.NOM_USUA,
        email: usuario.DIR_ELEC
      }
    });

  } catch (err) {
    console.error('[VALIDAR TOKEN ERROR]', err);
    return res.status(500).json({
      status: 'error',
      message: 'Error al validar token',
      error: err.message
    });
  }
};

/**
 * VERIFICAR EMAIL DE CUENTA (Public)
 * GET /api/auth/verificar-email/:token
 */
exports.verificarEmail = async (req, res) => {
  try {
    const { token } = req.params;

    if (!token) {
      return res.status(400).json({ status: 'error', message: 'Token requerido' });
    }

    const r = await executeQuery(`
      SELECT TOP 1 COD_USUA, NOM_USUA, DIR_ELEC, FEC_VERI, VER_EMAIL
      FROM GN_USUAR
      WHERE TOK_VERI = @token AND ACT_ESTA = 'A'
    `, { token });

    if (!r.recordset || !r.recordset.length) {
      return res.status(400).json({ status: 'error', message: 'Token inválido o ya utilizado.' });
    }

    const usuario = r.recordset[0];

    if (usuario.VER_EMAIL === 'S') {
      return res.status(200).json({ status: 'success', message: 'El email ya fue verificado anteriormente.', yaVerificado: true });
    }

    if (usuario.FEC_VERI && new Date() > new Date(usuario.FEC_VERI)) {
      return res.status(400).json({ status: 'error', message: 'El enlace de verificación ha expirado. Solicita uno nuevo.' });
    }

    // ✅ Al verificar el email, activar la cuenta (ACT_INAC = 'A') para que pueda iniciar sesión
    await executeQuery(`
      UPDATE GN_USUAR
      SET VER_EMAIL = 'S', TOK_VERI = NULL, FEC_VERI = NULL,
          ACT_INAC = 'A', FEC_ULCA = GETDATE()
      WHERE COD_USUA = @codUsuario
    `, { codUsuario: usuario.COD_USUA });

    try {
      await executeQuery(`
        INSERT INTO GN_LOG_ACCE (COD_USUA, TIP_EVEN, EST_EVEN, DES_EVEN, FEC_EVEN)
        VALUES (@codUsuario, 'VER_EMAIL', 'EXITOSO', 'Email verificado correctamente', GETDATE())
      `, { codUsuario: usuario.COD_USUA });
    } catch (_) {}

    console.log(`[VERIFICAR EMAIL] ✓ Email verificado: ${usuario.DIR_ELEC}`);

    return res.status(200).json({
      status: 'success',
      message: 'Email verificado correctamente.',
      usuario: { nombre: usuario.NOM_USUA, email: usuario.DIR_ELEC }
    });

  } catch (err) {
    console.error('[VERIFICAR EMAIL ERROR]', err);
    return res.status(500).json({ status: 'error', message: 'Error al verificar email', error: err.message });
  }
};
