/**
 * Utilidad de Autenticación - Cliente
 * Maneja tokens JWT, sesiones y permisos del lado del cliente
 */

const AuthUtil = {
  API_BASE: '/api',

  /**
   * Obtener token JWT del almacenamiento local
   */
  getToken() {
    return localStorage.getItem('authToken');
  },

  /**
   * Obtener datos del usuario almacenados
   */
  getUsuario() {
    const usuarioJson = localStorage.getItem('usuario');
    return usuarioJson ? JSON.parse(usuarioJson) : null;
  },

  /**
   * Verificar si el usuario está autenticado
   */
  estaAutenticado() {
    const token = this.getToken();
    const usuario = this.getUsuario();
    return !!(token && usuario);
  },

  /**
   * Obtener nivel de usuario (grupo)
   * 1 = Empleado, 2 = Estándar, 3 = Admin
   * Obtiene el campo 'cod_gusu' del token decodificado
   */
  getNivelUsuario() {
    const usuario = this.getUsuario();
    // Intentar obtener del objeto usuario primero
    if (usuario?.cod_gusu) {
      return usuario.cod_gusu;
    }
    // Fallback al campo nivel para compatibilidad
    return usuario?.nivel || 0;
  },

  /**
   * Obtener cédula del usuario autenticado
   */
  getCedula() {
    const usuario = this.getUsuario();
    return usuario?.cedula || null;
  },

  /**
   * Obtener nombre del usuario autenticado
   */
  getNombre() {
    const usuario = this.getUsuario();
    return usuario?.nombre || null;
  },

  /**
   * Obtener headers con autenticación
   */
  getAuthHeaders() {
    const token = this.getToken();
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  },

  /**
   * Hacer una petición con autenticación automática
   */
  async fetchAuth(url, options = {}) {
    const defaultOptions = {
      method: 'GET',
      headers: this.getAuthHeaders()
    };

    const finalOptions = {
      ...defaultOptions,
      ...options,
      headers: {
        ...defaultOptions.headers,
        ...options.headers
      }
    };

    // Si el método es POST/PUT/PATCH y no hay body, usar el body del options
    if (options.body && typeof options.body === 'object') {
      finalOptions.body = JSON.stringify(options.body);
    }

    const response = await fetch(`${this.API_BASE}${url}`, finalOptions);

    // Si es 401, el token ha expirado
    if (response.status === 401) {
      this.logout();
      window.location.href = '/login.html';
      throw new Error('Sesión expirada. Por favor inicia sesión de nuevo.');
    }

    return response;
  },

  /**
   * Cerrar sesión
   */
  async logout() {
    try {
      // Notificar al servidor
      await this.fetchAuth('/auth/logout', { method: 'POST' }).catch(() => {
        // Ignorar errores al logout (servidor podría estar caído)
      });
    } finally {
      // Limpiar almacenamiento local
      localStorage.removeItem('authToken');
      localStorage.removeItem('usuario');
      window.location.href = '/login.html';
    }
  },

  /**
   * Decodificar JWT (sin verificar firma, solo cliente)
   * NOTA: Verificación de firma ocurre en el servidor
   */
  decodeToken(token) {
    try {
      const parts = token.split('.');
      if (parts.length !== 3) return null;

      const decoded = JSON.parse(atob(parts[1]));
      return decoded;
    } catch (err) {
      console.error('Error decodificando token:', err);
      return null;
    }
  },

  /**
   * Normalizar datos del usuario desde el token
   */
  normalizarUsuario(datosToken) {
    return {
      id: datosToken.cod_usua,
      empresa: datosToken.cod_empr,
      nombre: datosToken.nombre,
      email: datosToken.email,
      cedula: datosToken.cedula,
      cod_gusu: datosToken.cod_gusu,
      // Campos de compatibilidad
      nivel: datosToken.cod_gusu
    };
  },

  /**
   * Obtener datos del usuario actual desde el servidor
   */
  async obtenerDatosActuales() {
    try {
      const response = await this.fetchAuth('/auth/me', { method: 'GET' });
      if (!response.ok) {
        throw new Error('Error al obtener datos del usuario');
      }
      const data = await response.json();
      if (data.status === 'success') {
        // Actualizar almacenamiento local
        localStorage.setItem('usuario', JSON.stringify(data.usuario));
        return data.usuario;
      }
    } catch (err) {
      console.error('Error obteniendo datos:', err);
      throw err;
    }
  },

  /**
   * Cambiar contraseña
   */
  async cambiarContrasena(contrasenaActual, contrasenaNueva, contrasenaConfirmacion) {
    try {
      const response = await this.fetchAuth('/auth/cambiar-contrasena', {
        method: 'POST',
        body: {
          contrasena_actual: contrasenaActual,
          contrasena_nueva: contrasenaNueva,
          contrasena_confirmacion: contrasenaConfirmacion
        }
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || 'Error al cambiar contraseña');
      }

      return await response.json();
    } catch (err) {
      console.error('Error:', err);
      throw err;
    }
  },

  /**
   * Verificar si el usuario tiene acceso a un módulo/acción
   * Nota: Esta verificación es básica. La verificación real ocurre en el servidor.
   */
  tienePermiso(modulo, accion) {
    // Implementar lógica de verificación si es necesario
    // Por ahora, confiar en las respuestas del servidor (401 = sin permiso)
    return true;
  },

  /**
   * Verificar si el usuario es admin
   */
  esAdmin() {
    return this.getNivelUsuario() === 3;
  },

  /**
   * Verificar si el usuario es supervisor
   */
  esSupervisor() {
    return this.getNivelUsuario() >= 2;
  },

  /**
   * Proteger una página (redirigir a login si no está autenticado)
   */
  protegerPagina() {
    if (!this.estaAutenticado()) {
      window.location.href = '/login.html';
    }
  },

  /**
   * Inicializar - Verificar autenticación al cargar la página
   */
  inicializar() {
    if (!this.estaAutenticado()) {
      // Verificar si no estamos ya en la página de login
      if (!window.location.href.includes('login.html')) {
        window.location.href = '/login.html';
      }
    } else {
      // Usuario autenticado, actualizar datos
      this.obtenerDatosActuales().catch(err => {
        console.error('Error actualizando datos del usuario:', err);
      });
    }
  }
};

// Inicializar cuando el documento esté listo
if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', () => {
    // Solo inicializar si no estamos en login.html
    if (!window.location.href.includes('login.html')) {
      AuthUtil.inicializar();
    }
  });
} else {
  // El documento ya fue cargado
  if (!window.location.href.includes('login.html')) {
    AuthUtil.inicializar();
  }
}
