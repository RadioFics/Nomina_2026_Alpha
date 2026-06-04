/* ============================================================
   src/js/login.js  —  Lógica de la pantalla de login
   Collective Mining · Sistema de Nómina
   ============================================================ */

'use strict';

// Email objetivo para reenvío de verificación
let resendEmailTarget = '';

// Elementos del DOM
const loginForm    = document.getElementById('loginForm');
const registroForm = document.getElementById('registroForm');
const recuperarForm = document.getElementById('recuperarForm');
const statusMessage = document.getElementById('statusMessage');
const tabBtns      = document.querySelectorAll('.tab-btn');
const tabContents  = document.querySelectorAll('.tab-content');

// ── Tab switching ─────────────────────────────────────────
function switchTab(tabName) {
  tabBtns.forEach(btn => btn.classList.remove('active'));
  tabContents.forEach(content => content.classList.remove('active'));

  document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
  document.getElementById(tabName).classList.add('active');

  statusMessage.classList.remove('show', 'error', 'success', 'info');

  const rp = document.getElementById('resendPanel');
  if (rp) rp.classList.remove('show');
}

tabBtns.forEach(btn => {
  btn.addEventListener('click', () => switchTab(btn.dataset.tab));
});

// ── LOGIN ─────────────────────────────────────────────────
loginForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email    = document.getElementById('loginEmail').value;
  const password = document.getElementById('loginPassword').value;
  const remember = document.getElementById('rememberMe').checked;

  const loginBtn = document.getElementById('loginBtn');
  loginBtn.disabled = true;

  // Contador de segundos visible si Azure SQL Serverless está reanudando (~90s)
  mostrarMensaje('Iniciando sesión...', 'info');
  let _seg = 0;
  const _ticker = setInterval(() => {
    _seg++;
    if (_seg >= 5) {
      mostrarMensaje(`Conectando con el servidor… (${_seg}s) — por favor espera`, 'info');
    }
  }, 1000);

  // Timeout de 120s para cubrir el resume completo de la BD
  const _ctrl    = new AbortController();
  const _timeout = setTimeout(() => _ctrl.abort(), 120000);

  try {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      signal: _ctrl.signal,
      body: JSON.stringify({
        cedula_o_email: email,
        contrasena: password,
        rememberMe: remember
      })
    });

    clearTimeout(_timeout);
    clearInterval(_ticker);

    const data = await response.json();

    if (data.status === 'success') {
      // Token en localStorage (persiste) si recuérdame activo, en sessionStorage si no.
      if (remember) {
        localStorage.setItem('authToken', data.token);
        localStorage.setItem('rememberEmail', email);
      } else {
        sessionStorage.setItem('authToken', data.token);
        localStorage.removeItem('authToken');
        localStorage.removeItem('rememberEmail');
      }
      localStorage.removeItem('rememberPass'); // nunca se guarda la contraseña
      localStorage.setItem('usuario', JSON.stringify(data.usuario));

      mostrarMensaje('¡Bienvenido! Redirigiendo...', 'success');
      setTimeout(() => { window.location.href = '/index_novedades.html'; }, 1000);

    } else if (data.pendingVerification) {
      loginBtn.disabled = false;
      mostrarMensaje(
        data.message || 'Tu cuenta no ha sido verificada. Revisa tu correo y haz clic en el enlace de verificación.',
        'info'
      );
      resendEmailTarget = email;
      document.getElementById('resendPanel').classList.add('show');

    } else {
      loginBtn.disabled = false;
      mostrarMensaje(data.message || 'Error al iniciar sesión', 'error');
      document.getElementById('resendPanel').classList.remove('show');
    }

  } catch (error) {
    clearTimeout(_timeout);
    clearInterval(_ticker);
    loginBtn.disabled = false;
    const msg = error.name === 'AbortError'
      ? 'El servidor tardó demasiado. Intenta de nuevo en unos segundos.'
      : 'Error de conexión. Intenta de nuevo.';
    mostrarMensaje(msg, 'error');
    console.error('Login error:', error);
  }
});

// ── REGISTRO ──────────────────────────────────────────────
registroForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const nombre   = (document.getElementById('registroNombre').value || '').trim();
  const email    = document.getElementById('registroEmail').value;
  const password = document.getElementById('registroPassword').value;
  const confirm  = document.getElementById('registroConfirm').value;

  if (password !== confirm) {
    mostrarMensaje('Las contraseñas no coinciden', 'error');
    return;
  }

  if (password.length < 8) {
    mostrarMensaje('La contraseña debe tener al menos 8 caracteres', 'error');
    return;
  }

  mostrarMensaje('Creando cuenta...', 'info');

  try {
    const response = await fetch('/api/auth/registro', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nombre,
        email,
        contrasena: password,
        contrasena_confirmacion: confirm
      })
    });

    const data = await response.json();

    if (data.status === 'success') {
      const emailRegistrado = document.getElementById('registroEmail').value;
      mostrarMensaje(
        `¡Cuenta creada! Te hemos enviado un enlace de verificación a ${emailRegistrado}. ` +
        `Revisa tu correo (incluida la carpeta de spam) y haz clic en el enlace para activar tu cuenta.`,
        'success'
      );
      registroForm.reset();
      setTimeout(() => switchTab('login'), 6000);
    } else {
      mostrarMensaje(data.message || 'Error al crear cuenta', 'error');
    }
  } catch (error) {
    mostrarMensaje('Error de conexión. Intenta de nuevo.', 'error');
    console.error('Registro error:', error);
  }
});

// ── RECUPERAR CONTRASEÑA ──────────────────────────────────
recuperarForm.addEventListener('submit', async (e) => {
  e.preventDefault();

  const email = document.getElementById('recuperarEmail').value;
  mostrarMensaje('Enviando instrucciones...', 'info');

  try {
    const response = await fetch('/api/auth/olvide-contrasena', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const data = await response.json();

    if (data.status === 'success') {
      mostrarMensaje('Si tu email existe, recibirás instrucciones para restablecer tu contraseña.', 'success');
      recuperarForm.reset();
      setTimeout(() => switchTab('login'), 2000);
    } else {
      mostrarMensaje(data.message || 'Error al procesar solicitud', 'error');
    }
  } catch (error) {
    mostrarMensaje('Error de conexión. Intenta de nuevo.', 'error');
    console.error('Recovery error:', error);
  }
});

// ── UTILIDADES ────────────────────────────────────────────
function mostrarMensaje(mensaje, tipo = 'info') {
  statusMessage.textContent = mensaje;
  statusMessage.className = `status-message show ${tipo}`;
}

// Mostrar panel de reenvío desde el tab de Registro
function mostrarReenvioDesdeRegistro() {
  const emailRegistro = document.getElementById('registroEmail').value.trim();
  if (emailRegistro) resendEmailTarget = emailRegistro;
  switchTab('login');
  if (resendEmailTarget) {
    document.getElementById('loginEmail').value = resendEmailTarget;
    document.getElementById('resendPanel').classList.add('show');
    mostrarMensaje('Usa el botón de abajo para reenviar el enlace de verificación a tu correo.', 'info');
  } else {
    mostrarMensaje('Ingresa tu email en el campo de arriba e intenta iniciar sesión para ver la opción de reenvío.', 'info');
  }
}

// ── REENVIAR VERIFICACIÓN ─────────────────────────────────
async function reenviarVerificacion() {
  const email = resendEmailTarget || document.getElementById('loginEmail').value.trim();

  if (!email) {
    mostrarMensaje('Ingresa tu email primero en el campo de arriba.', 'error');
    return;
  }

  const btn = document.getElementById('resendBtn');
  btn.disabled = true;
  btn.textContent = 'Enviando...';

  try {
    const response = await fetch('/api/auth/reenviar-verificacion', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    const data = await response.json();

    if (data.yaActiva) {
      mostrarMensaje('¡Tu cuenta ya está activa! Puedes iniciar sesión normalmente.', 'success');
      document.getElementById('resendPanel').classList.remove('show');
    } else {
      mostrarMensaje(
        `Enlace enviado. Revisa tu correo ${email} (incluida la carpeta de spam). El enlace expira en 24 horas.`,
        'success'
      );
      // Deshabilitar botón 60s para evitar spam
      let segundos = 60;
      btn.textContent = `Reenviar en ${segundos}s`;
      const intervalo = setInterval(() => {
        segundos--;
        btn.textContent = `Reenviar en ${segundos}s`;
        if (segundos <= 0) {
          clearInterval(intervalo);
          btn.disabled = false;
          btn.textContent = 'Reenviar enlace de verificación';
        }
      }, 1000);
    }
  } catch (error) {
    mostrarMensaje('Error de conexión. Intenta de nuevo.', 'error');
    btn.disabled = false;
    btn.textContent = 'Reenviar enlace de verificación';
    console.error('Resend error:', error);
  }
}

// Decodifica el payload JWT y verifica que no haya expirado
function _tokenValido(token) {
  try {
    const payload = JSON.parse(atob(token.split('.')[1].replace(/-/g, '+').replace(/_/g, '/')));
    return typeof payload.exp === 'number' && payload.exp * 1000 > Date.now();
  } catch { return false; }
}

// ── INICIALIZACIÓN ────────────────────────────────────────
window.addEventListener('DOMContentLoaded', () => {
  // Limpiar cualquier contraseña guardada por versiones anteriores
  localStorage.removeItem('rememberPass');

  // Si hay sesión activa y válida → redirigir directo a la app
  const tokenGuardado = localStorage.getItem('authToken');
  if (tokenGuardado && _tokenValido(tokenGuardado)) {
    window.location.href = '/index_novedades.html';
    return;
  }

  // Pre-rellenar email si "Recordar contraseña" estaba marcado
  const rememberEmail = localStorage.getItem('rememberEmail');
  if (rememberEmail) {
    document.getElementById('loginEmail').value   = rememberEmail;
    document.getElementById('rememberMe').checked = true;
  }
});
