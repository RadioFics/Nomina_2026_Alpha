// ============================================================================
//  ecosystem.config.js — Configuración de PM2 para MineDax en producción
//
//  Uso en el VPS:
//    pm2 start ecosystem.config.js          → arrancar
//    pm2 restart minedax                    → reiniciar
//    pm2 logs minedax                       → ver logs en tiempo real
//    pm2 save && pm2 startup                → registrar como servicio de Windows
// ============================================================================

module.exports = {
  apps: [
    {
      name: 'minedax',
      script: 'server.js',

      // Número de instancias. '1' para SQL Server Express (no soporta
      // bien conexiones paralelas desde múltiples procesos Node).
      instances: 1,

      // Reiniciar automáticamente si el proceso cae
      autorestart: true,

      // Reiniciar si la memoria supera 500 MB
      max_memory_restart: '500M',

      // Variables de entorno para producción
      // (el .env del VPS se carga igualmente via dotenv; esto es un respaldo)
      env_production: {
        NODE_ENV: 'production',
        PORT: 3000,
      },

      // Logs
      error_file: './logs/pm2-error.log',
      out_file:   './logs/pm2-out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',

      // Esperar 5s entre reinicios para evitar bucles rápidos
      restart_delay: 5000,
    },
  ],
};
