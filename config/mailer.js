const nodemailer = require('nodemailer');

// Configuración de Nodemailer para Gmail
// MAIL_PASS puede tener espacios (formato Google), se limpian automáticamente.
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: (process.env.MAIL_PASS || '').replace(/\s/g, ''),
  },
  tls: { rejectUnauthorized: false },
});

const FROM_NAME = `"Collective Mining Nómina" <${process.env.MAIL_USER}>`;

// ─── Fragmento de cabecera reutilizable (logo + marca) ──────────────────────
const _emailHeader = `
  <div style="text-align:center; padding-bottom:28px; border-bottom:1px solid rgba(32,167,201,0.20); margin-bottom:28px;">
    <!-- Logo mark hexagonal CM -->
    <div style="display:inline-block; margin-bottom:12px;">
      <svg width="48" height="48" viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
        <polygon points="24,2 44,13 44,35 24,46 4,35 4,13"
                 fill="#20A7C9" stroke="none"/>
        <text x="24" y="31" text-anchor="middle"
              font-family="Arial,sans-serif" font-weight="800"
              font-size="15" fill="#ffffff" letter-spacing="1">CM</text>
      </svg>
    </div>
    <div style="font-family:Arial,sans-serif; font-size:18px; font-weight:700; letter-spacing:0.06em; text-transform:uppercase; color:#ffffff; line-height:1.2;">
      COLLECTIVE <span style="color:#20A7C9;">MINING</span>
    </div>
    <div style="font-family:Arial,sans-serif; font-size:10px; color:#706F6F; letter-spacing:0.14em; text-transform:uppercase; margin-top:4px;">
      — Sistema de Nómina —
    </div>
  </div>`;

// ─── Fragmento de pie de página reutilizable ────────────────────────────────
const _emailFooter = `
  <div style="margin-top:32px; padding-top:20px; border-top:1px solid rgba(32,167,201,0.15); text-align:center;">
    <p style="color:#706F6F; font-size:11px; font-family:Arial,sans-serif; margin:4px 0;">
      Este es un correo automático — por favor no respondas a este mensaje.
    </p>
    <p style="color:#706F6F; font-size:11px; font-family:Arial,sans-serif; margin:4px 0;">
      © 2026 Collective Mining · Todos los derechos reservados.
    </p>
  </div>`;

// ─── Wrapper externo del email ───────────────────────────────────────────────
const _wrap = (inner) => `
  <div style="background:#1E1E1E; padding:0; margin:0;">
    <div style="font-family:Arial,sans-serif; max-width:600px; margin:0 auto;
                background:#2B2B2B; padding:40px 44px; color:#FFFFFF;
                border-radius:0; border-left:4px solid #20A7C9;">
      ${_emailHeader}
      ${inner}
      ${_emailFooter}
    </div>
  </div>`;

// Plantilla de email de bienvenida
const emailBienvenida = (nombreUsuario, email) => ({
  from: FROM_NAME,
  to: email,
  subject: '¡Bienvenido a Collective Mining - Sistema de Nómina!',
  html: _wrap(`
    <h2 style="font-family:Arial,sans-serif; color:#4DC4E0; font-size:18px;
               font-weight:700; margin:0 0 16px 0; text-transform:uppercase;
               letter-spacing:0.04em;">
      ¡Bienvenido, ${nombreUsuario}!
    </h2>

    <p style="line-height:1.65; color:#FFFFFF; font-size:14px; margin:0 0 14px 0;">
      Tu cuenta ha sido creada exitosamente en el Sistema de Nómina de Collective Mining.
      Ya puedes acceder al sistema con el siguiente email:
    </p>

    <div style="background:#383838; padding:14px 18px; border-radius:6px;
                border-left:3px solid #20A7C9; margin:20px 0;">
      <p style="margin:0 0 4px 0; color:#706F6F; font-size:11px;
                text-transform:uppercase; letter-spacing:0.08em;">Email de acceso</p>
      <p style="margin:0; color:#4DC4E0; font-weight:600; font-size:15px;">${email}</p>
    </div>

    <p style="line-height:1.65; color:#FFFFFF; font-size:14px; margin:20px 0 10px 0;">
      <strong style="color:#ffffff;">Próximos pasos:</strong>
    </p>
    <p style="color:#CCCCCC; font-size:13px; line-height:1.8; margin:0 0 6px 0; padding-left:14px;">
      1 · Accede al sistema con tu email y contraseña.<br>
      2 · Mantén tu contraseña segura y no la compartas.<br>
      3 · Ante cualquier inconveniente, contacta al administrador del sistema.
    </p>
  `),
});

// Plantilla de email de recuperación de contraseña
const emailRecuperacion = (nombreUsuario, email, resetLink) => ({
  from: FROM_NAME,
  to: email,
  subject: 'Restablecer contraseña - Sistema de Nómina Collective Mining',
  html: _wrap(`
    <h2 style="font-family:Arial,sans-serif; color:#4DC4E0; font-size:18px;
               font-weight:700; margin:0 0 16px 0; text-transform:uppercase;
               letter-spacing:0.04em;">
      Restablecer Contraseña
    </h2>

    <p style="line-height:1.65; color:#FFFFFF; font-size:14px; margin:0 0 14px 0;">
      Hola <strong>${nombreUsuario}</strong>,
    </p>

    <p style="line-height:1.65; color:#CCCCCC; font-size:14px; margin:0 0 14px 0;">
      Recibimos una solicitud para restablecer la contraseña asociada a tu cuenta.
      Si no realizaste esta solicitud, puedes ignorar este mensaje de forma segura.
    </p>

    <p style="line-height:1.65; color:#CCCCCC; font-size:14px; margin:0 0 24px 0;">
      Para restablecer tu contraseña haz clic en el botón a continuación.
      <strong style="color:#ffffff;">Este enlace caduca en 2 horas.</strong>
    </p>

    <div style="text-align:center; margin:28px 0;">
      <a href="${resetLink}"
         style="background:#20A7C9; color:#ffffff; padding:13px 36px;
                text-decoration:none; border-radius:6px; font-family:Arial,sans-serif;
                font-weight:700; font-size:13px; letter-spacing:0.06em;
                text-transform:uppercase; display:inline-block;">
        Restablecer Contraseña
      </a>
    </div>

    <p style="line-height:1.6; color:#706F6F; font-size:12px; margin:24px 0 8px 0;">
      Si el botón no funciona, copia y pega este enlace en tu navegador:
    </p>
    <div style="background:#383838; padding:10px 14px; border-radius:6px; border-left:3px solid rgba(32,167,201,0.4);">
      <p style="word-break:break-all; color:#4DC4E0; font-size:11px; margin:0; font-family:'Courier New',monospace;">
        ${resetLink}
      </p>
    </div>
  `),
});

// Plantilla de confirmación de cambio de contraseña
const emailCambioExitoso = (nombreUsuario, email) => ({
  from: FROM_NAME,
  to: email,
  subject: 'Contraseña actualizada - Sistema de Nómina Collective Mining',
  html: _wrap(`
    <h2 style="font-family:Arial,sans-serif; color:#48BB78; font-size:18px;
               font-weight:700; margin:0 0 16px 0; text-transform:uppercase;
               letter-spacing:0.04em;">
      ✓ Contraseña Actualizada
    </h2>

    <p style="line-height:1.65; color:#FFFFFF; font-size:14px; margin:0 0 14px 0;">
      Hola <strong>${nombreUsuario}</strong>,
    </p>

    <p style="line-height:1.65; color:#CCCCCC; font-size:14px; margin:0 0 14px 0;">
      Tu contraseña ha sido actualizada exitosamente. Ya puedes acceder al sistema
      con tus nuevas credenciales.
    </p>

    <div style="background:#383838; padding:14px 18px; border-radius:6px;
                border-left:3px solid #48BB78; margin:20px 0;">
      <p style="margin:0; color:#cccccc; font-size:13px; line-height:1.5;">
        Si <strong style="color:#ffffff;">no realizaste este cambio</strong>,
        contacta inmediatamente al administrador del sistema para asegurar tu cuenta.
      </p>
    </div>
  `),
});

// Plantilla de verificación de cuenta
const emailVerificacion = (nombreUsuario, email, verificationLink) => ({
  from: FROM_NAME,
  to: email,
  subject: 'Verifica tu cuenta - Sistema de Nómina Collective Mining',
  html: _wrap(`
    <h2 style="font-family:Arial,sans-serif; color:#4DC4E0; font-size:18px;
               font-weight:700; margin:0 0 16px 0; text-transform:uppercase;
               letter-spacing:0.04em;">
      Confirma tu cuenta
    </h2>

    <p style="line-height:1.65; color:#FFFFFF; font-size:14px; margin:0 0 14px 0;">
      Hola <strong>${nombreUsuario}</strong>,
    </p>

    <p style="line-height:1.65; color:#CCCCCC; font-size:14px; margin:0 0 14px 0;">
      Tu cuenta en el Sistema de Nómina de Collective Mining ha sido creada correctamente.
      Para activarla y acceder a todas las funcionalidades, confirma tu dirección de email.
    </p>

    <p style="line-height:1.65; color:#CCCCCC; font-size:14px; margin:0 0 24px 0;">
      <strong style="color:#ffffff;">Este enlace de verificación expirará en 24 horas.</strong>
    </p>

    <div style="text-align:center; margin:28px 0;">
      <a href="${verificationLink}"
         style="background:#20A7C9; color:#ffffff; padding:14px 40px;
                text-decoration:none; border-radius:6px; font-family:Arial,sans-serif;
                font-weight:700; font-size:14px; letter-spacing:0.06em;
                text-transform:uppercase; display:inline-block;">
        ✓ Verificar mi cuenta
      </a>
    </div>

    <div style="background:#383838; padding:14px 18px; border-radius:6px;
                border-left:3px solid #20A7C9; margin:20px 0;">
      <p style="margin:0 0 4px 0; color:#706F6F; font-size:11px;
                text-transform:uppercase; letter-spacing:0.08em;">Tu email de acceso</p>
      <p style="margin:0; color:#4DC4E0; font-weight:600; font-size:14px;">${email}</p>
    </div>

    <p style="line-height:1.6; color:#706F6F; font-size:12px; margin:20px 0 8px 0;">
      Si el botón no funciona, copia y pega este enlace en tu navegador:
    </p>
    <div style="background:#383838; padding:10px 14px; border-radius:6px; border-left:3px solid rgba(32,167,201,0.4);">
      <p style="word-break:break-all; color:#4DC4E0; font-size:11px; margin:0; font-family:'Courier New',monospace;">
        ${verificationLink}
      </p>
    </div>

    <p style="line-height:1.6; color:#706F6F; font-size:12px; margin:18px 0 0 0;">
      Si no creaste esta cuenta, ignora este mensaje de forma segura.
    </p>
  `),
});

// Función para enviar emails
const enviarEmail = async (opciones) => {
  try {
    const info = await transporter.sendMail(opciones);
    console.log('[✓ EMAIL ENVIADO]', info.response);
    return { success: true, messageId: info.messageId };
  } catch (error) {
    console.error('[✗ EMAIL ERROR]', error.message);
    return { success: false, error: error.message };
  }
};

module.exports = {
  transporter,
  enviarEmail,
  emailBienvenida,
  emailRecuperacion,
  emailCambioExitoso,
  emailVerificacion,
};
