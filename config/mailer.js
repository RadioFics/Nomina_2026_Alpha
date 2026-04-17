const nodemailer = require('nodemailer');

// Configuración de Nodemailer para Gmail
const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.MAIL_USER,
    pass: process.env.MAIL_PASS,
  },
});

// Plantilla de email de bienvenida
const emailBienvenida = (nombreUsuario, email) => ({
  from: process.env.MAIL_USER,
  to: email,
  subject: '¡Bienvenido a Collective Mining - Sistema de Nómina!',
  html: `
    <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0E0E0E; padding: 40px; color: #F0EDE8; border-radius: 10px; border: 1px solid rgba(201,168,76,0.18);">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="font-family: 'Syne', sans-serif; font-size: 28px; color: #C9A84C; margin: 0;">Collective Mining</h1>
        <p style="color: #8A857A; margin: 10px 0 0 0;">Sistema de Nómina</p>
      </div>

      <h2 style="font-family: 'Syne', sans-serif; color: #C9A84C; font-size: 20px; margin-top: 0;">¡Bienvenido, ${nombreUsuario}!</h2>

      <p style="line-height: 1.6; color: #F0EDE8; margin: 20px 0;">
        Tu cuenta ha sido creada exitosamente en el Sistema de Nómina de Collective Mining.
      </p>

      <p style="line-height: 1.6; color: #F0EDE8; margin: 20px 0;">
        Ya puedes acceder al sistema con el siguiente email:
      </p>

      <div style="background: #1E1E1E; padding: 15px; border-radius: 8px; border-left: 4px solid #C9A84C; margin: 20px 0;">
        <p style="margin: 5px 0; color: #8A857A; font-size: 12px;">Email:</p>
        <p style="margin: 0; color: #C9A84C; font-weight: 600; font-size: 16px;">${email}</p>
      </div>

      <p style="line-height: 1.6; color: #F0EDE8; margin: 20px 0;">
        <strong>Próximos pasos:</strong>
      </p>

      <ol style="color: #F0EDE8; line-height: 1.8; margin: 15px 0; padding-left: 20px;">
        <li>Accede al sistema con tu email</li>
        <li>Asegúrate de mantener tu contraseña segura</li>
        <li>Si tienes problemas, contacta al administrador</li>
      </ol>

      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid rgba(201,168,76,0.18); text-align: center;">
        <p style="color: #8A857A; font-size: 12px; margin: 5px 0;">
          Este es un email automático. No responda a este mensaje.
        </p>
        <p style="color: #8A857A; font-size: 12px; margin: 5px 0;">
          © 2026 Collective Mining. Todos los derechos reservados.
        </p>
      </div>
    </div>
  `,
});

// Plantilla de email de recuperación de contraseña
const emailRecuperacion = (nombreUsuario, email, resetLink) => ({
  from: process.env.MAIL_USER,
  to: email,
  subject: 'Restablecer contraseña - Sistema de Nómina Collective Mining',
  html: `
    <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0E0E0E; padding: 40px; color: #F0EDE8; border-radius: 10px; border: 1px solid rgba(201,168,76,0.18);">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="font-family: 'Syne', sans-serif; font-size: 28px; color: #C9A84C; margin: 0;">Collective Mining</h1>
        <p style="color: #8A857A; margin: 10px 0 0 0;">Sistema de Nómina</p>
      </div>

      <h2 style="font-family: 'Syne', sans-serif; color: #C9A84C; font-size: 20px; margin-top: 0;">Restablecer Contraseña</h2>

      <p style="line-height: 1.6; color: #F0EDE8; margin: 20px 0;">
        Hola ${nombreUsuario},
      </p>

      <p style="line-height: 1.6; color: #F0EDE8; margin: 20px 0;">
        Recibimos una solicitud para restablecer tu contraseña. Si no fuiste tú, puedes ignorar este email de forma segura.
      </p>

      <p style="line-height: 1.6; color: #F0EDE8; margin: 20px 0;">
        Para restablecer tu contraseña, haz clic en el siguiente botón. <strong>Este enlace caduca en 2 horas.</strong>
      </p>

      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetLink}" style="background: #C9A84C; color: #0E0E0E; padding: 12px 30px; text-decoration: none; border-radius: 6px; font-family: 'Syne', sans-serif; font-weight: 700; display: inline-block;">
          Restablecer Contraseña
        </a>
      </div>

      <p style="line-height: 1.6; color: #8A857A; font-size: 12px; margin: 30px 0;">
        Si no puedes hacer clic en el botón, copia y pega el siguiente enlace en tu navegador:
      </p>
      <p style="word-break: break-all; color: #C9A84C; font-size: 11px; margin: 10px 0; padding: 10px; background: #1E1E1E; border-radius: 6px;">
        ${resetLink}
      </p>

      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid rgba(201,168,76,0.18); text-align: center;">
        <p style="color: #8A857A; font-size: 12px; margin: 5px 0;">
          Este es un email automático. No responda a este mensaje.
        </p>
        <p style="color: #8A857A; font-size: 12px; margin: 5px 0;">
          © 2026 Collective Mining. Todos los derechos reservados.
        </p>
      </div>
    </div>
  `,
});

// Plantilla de confirmación de cambio de contraseña
const emailCambioExitoso = (nombreUsuario, email) => ({
  from: process.env.MAIL_USER,
  to: email,
  subject: 'Contraseña actualizada - Sistema de Nómina Collective Mining',
  html: `
    <div style="font-family: 'DM Sans', Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0E0E0E; padding: 40px; color: #F0EDE8; border-radius: 10px; border: 1px solid rgba(201,168,76,0.18);">
      <div style="text-align: center; margin-bottom: 30px;">
        <h1 style="font-family: 'Syne', sans-serif; font-size: 28px; color: #C9A84C; margin: 0;">Collective Mining</h1>
        <p style="color: #8A857A; margin: 10px 0 0 0;">Sistema de Nómina</p>
      </div>

      <h2 style="font-family: 'Syne', sans-serif; color: #C9A84C; font-size: 20px; margin-top: 0;">✓ Contraseña Actualizada</h2>

      <p style="line-height: 1.6; color: #F0EDE8; margin: 20px 0;">
        Hola ${nombreUsuario},
      </p>

      <p style="line-height: 1.6; color: #F0EDE8; margin: 20px 0;">
        Tu contraseña ha sido actualizada exitosamente. Ya puedes acceder al sistema con tu nueva contraseña.
      </p>

      <p style="line-height: 1.6; color: #F0EDE8; margin: 20px 0;">
        Si no realizaste este cambio, por favor contacta inmediatamente al administrador del sistema.
      </p>

      <div style="margin-top: 30px; padding-top: 20px; border-top: 1px solid rgba(201,168,76,0.18); text-align: center;">
        <p style="color: #8A857A; font-size: 12px; margin: 5px 0;">
          Este es un email automático. No responda a este mensaje.
        </p>
        <p style="color: #8A857A; font-size: 12px; margin: 5px 0;">
          © 2026 Collective Mining. Todos los derechos reservados.
        </p>
      </div>
    </div>
  `,
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
};
