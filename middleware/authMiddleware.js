const jwt = require('jsonwebtoken');
const { executeQuery } = require('../config/database');

const JWT_SECRET = process.env.JWT_SECRET || 'tu-clave-secreta-super-segura-cambiar-en-produccion';

/**
 * Middleware para verificar token JWT
 * Valida que el usuario esté autenticado
 */
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
    req.cod_empr = decoded.cod_empr;       // Empresa
    req.email = decoded.email;              // Email
    req.nombre = decoded.nombre;            // Nombre
    req.cedula = decoded.cedula || null;    // Cédula (puede ser null)
    req.cod_gusu = decoded.cod_gusu || null; // Grupo usuario

    next();
  } catch (err) {
    return res.status(401).json({
      status: 'error',
      message: 'Token inválido o expirado',
      error: err.message
    });
  }
};

/**
 * Middleware para verificar permisos (RBAC)
 * ✅ CORRECCIÓN: Usar tabla GN_PERMI real y COD_GUSU en lugar de tablas fantasma
 */
const checkPermission = (modulo, accion) => {
  return async (req, res, next) => {
    try {
      const usuarioId = req.usuarioId;
      const codGusu = req.cod_gusu;

      // Si el usuario no tiene grupo, denegar
      if (!codGusu) {
        console.warn(`[AUTH] Usuario ${usuarioId} no tiene grupo asignado`);
        return res.status(403).json({
          status: 'error',
          message: 'Usuario sin grupo asignado - contacta al administrador'
        });
      }

      // ✅ Verificar permisos usando tabla REAL GN_PERMI
      const queryPermisos = `
        SELECT IND_ACCE FROM GN_PERMI
        WHERE COD_GUSU = @codGusu
          AND NOM_MODU = @modulo
          AND TIP_ACCI = @accion
      `;

      const resultPermisos = await executeQuery(queryPermisos, {
        codGusu,
        modulo,
        accion
      });

      // Verificar si tiene acceso
      const tieneAcceso = resultPermisos.recordset?.[0]?.IND_ACCE === 'S';

      if (!tieneAcceso) {
        console.warn(`[AUTH] Usuario ${usuarioId} intentó acceder a ${modulo}.${accion} sin permiso`);
        return res.status(403).json({
          status: 'error',
          message: `No tienes permisos para ${accion} en ${modulo}`
        });
      }

      // ✅ Registrar acceso en logs usando tabla REAL GN_LOG_ACCE
      const logQuery = `
        INSERT INTO GN_LOG_ACCE (
          COD_USUA, TIP_EVEN, EST_EVEN, DES_EVEN, IP_ORIG, FEC_EVEN
        )
        VALUES (
          @usuarioId, 'ACCESO_RECURSO', 'EXITOSO',
          'Acceso a ' + @recurso, @ip, GETDATE()
        )
      `;
      const ip = req.ip || req.connection.remoteAddress;
      await executeQuery(logQuery, {
        usuarioId,
        recurso: `${modulo}.${accion}`,
        ip
      }).catch(err => console.error('Error registrando acceso:', err));

      // Permiso concedido
      next();

    } catch (err) {
      console.error('[AUTH ERROR]', err);
      return res.status(500).json({
        status: 'error',
        message: 'Error verificando permisos',
        error: err.message
      });
    }
  };
};

/**
 * Middleware para verificar nivel de usuario basado en COD_GUSU
 *
 * Convención de grupos (tabla GN_GUSU):
 *   COD_GUSU 1 → Empleado  (solo puede ver sus propios datos)
 *   COD_GUSU 2 → Supervisor
 *   COD_GUSU 3 → Administrador (acceso total)
 *
 * Uso:  router.get('/ruta', verifyToken, checkLevel(3), handler)
 *
 * ⚠️  CORRECCIÓN: la versión anterior usaba req.nivel, que nunca es asignado
 *    por verifyToken. Ahora usa req.cod_gusu (sí asignado en verifyToken).
 */
const checkLevel = (nivelMinimo) => {
  return (req, res, next) => {
    const nivel = Number(req.cod_gusu) || 0;
    if (nivel < nivelMinimo) {
      return res.status(403).json({
        status: 'error',
        message: 'Nivel de usuario insuficiente para esta acción'
      });
    }
    next();
  };
};

/**
 * Generar JWT Token
 * ✅ CORRECCIÓN: Solo incluir campos que EXISTEN en GN_USUAR
 */
const generateToken = (usuarioData) => {
  const payload = {
    cod_usua: usuarioData.cod_usua,        // COD_USUA (correcto)
    cod_empr: usuarioData.cod_empr,        // COD_EMPR (correcto)
    email: usuarioData.email,               // DIR_ELEC (mapear a email)
    nombre: usuarioData.nombre,             // NOM_USUA (mapear a nombre)
    cedula: usuarioData.cedula || null,     // NUM_IDEN del join a GN_TERCE
    cod_gusu: usuarioData.cod_gusu || null  // Grupo usuario
  };

  // Token con expiración de 8 horas
  return jwt.sign(payload, JWT_SECRET, { expiresIn: '8h' });
};

/**
 * Registrar intento fallido de login
 * ✅ CORRECCIÓN: Usar campos y tabla reales
 */
const registrarIntentoFallido = async (cedulaOEmail, ip) => {
  try {
    const query = `
      UPDATE GN_USUAR
      SET INT_FALL = INT_FALL + 1,
          IND_BLOQ = CASE WHEN INT_FALL >= 4 THEN 'S' ELSE 'N' END,
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

    await executeQuery(query, { cedula: cedulaOEmail, ip });
  } catch (err) {
    console.error('Error registrando intento fallido:', err);
  }
};

/**
 * Resetear contador de intentos fallidos
 * ✅ CORRECCIÓN: Usar campos reales
 */
const resetearIntentos = async (usuarioId) => {
  try {
    const query = `
      UPDATE GN_USUAR
      SET INT_FALL = 0, IND_BLOQ = 'N'
      WHERE COD_USUA = @usuarioId
    `;
    await executeQuery(query, { usuarioId });
  } catch (err) {
    console.error('Error reseteando intentos:', err);
  }
};

module.exports = {
  verifyToken,
  checkPermission,
  checkLevel,
  generateToken,
  registrarIntentoFallido,
  resetearIntentos,
  JWT_SECRET
};
