// -*- coding: utf-8 -*-
/**
 * config/logger.js  —  Logger de aplicación → tabla GN_LOG_APP
 * =============================================================
 * Escribe entradas de log a SQL Server de forma asíncrona (fire-and-forget).
 * NUNCA lanza excepciones hacia afuera: si falla el insert, imprime a consola
 * y continúa sin afectar la petición en curso.
 *
 * Uso:
 *   const logger = require('./config/logger');
 *   logger.error('importarPDF', 'Python no encontrado', err.stack);
 *   logger.warn ('importarPDF', 'Reintentando con python', null, { ruta: '/api/...' });
 *   logger.info ('auth',        'Login exitoso', null, { usuario: 'jcalle' });
 */

'use strict';

const { executeQuery } = require('./database');

// ─── DDL: se ejecuta UNA vez al arrancar la app ───────────────────────────────
const CREATE_TABLE_SQL = `
IF NOT EXISTS (
  SELECT 1 FROM INFORMATION_SCHEMA.TABLES
  WHERE TABLE_SCHEMA = 'dbo' AND TABLE_NAME = 'GN_LOG_APP'
)
BEGIN
  CREATE TABLE dbo.GN_LOG_APP (
    COD_LOGA  BIGINT        IDENTITY(1,1) PRIMARY KEY,
    FEC_EVEN  DATETIME      NOT NULL DEFAULT GETDATE(),
    TIP_NIVE  VARCHAR(10)   NOT NULL,          -- ERROR | WARN | INFO | DEBUG
    NOM_MODU  VARCHAR(100)  NOT NULL,          -- módulo o ruta que generó el log
    DES_MENS  NVARCHAR(500) NOT NULL,          -- mensaje corto
    DES_DETA  NVARCHAR(MAX) NULL,              -- detalle completo / stack trace
    NOM_USUA  VARCHAR(50)   NULL,              -- usuario autenticado (si aplica)
    RUT_HTTP  VARCHAR(200)  NULL,              -- ruta HTTP  (p.ej. POST /api/importar-pdf)
    COD_HTTP  INT           NULL,              -- código de respuesta HTTP
    DUR_MS    INT           NULL,              -- duración de la petición en ms
    IP_ORIG   VARCHAR(50)   NULL               -- IP del cliente
  );

  CREATE INDEX IX_GN_LOG_APP_FEC  ON dbo.GN_LOG_APP (FEC_EVEN DESC);
  CREATE INDEX IX_GN_LOG_APP_NIVE ON dbo.GN_LOG_APP (TIP_NIVE);
  CREATE INDEX IX_GN_LOG_APP_MODU ON dbo.GN_LOG_APP (NOM_MODU);

  PRINT 'Tabla GN_LOG_APP creada correctamente.';
END
`;

// ─── Insert ───────────────────────────────────────────────────────────────────
const INSERT_SQL = `
INSERT INTO dbo.GN_LOG_APP
  (TIP_NIVE, NOM_MODU, DES_MENS, DES_DETA, NOM_USUA, RUT_HTTP, COD_HTTP, DUR_MS, IP_ORIG)
VALUES
  (@nivel, @modulo, @mensaje, @detalle, @usuario, @ruta, @codHttp, @durMs, @ipOrig)
`;

// ─── Inicialización ───────────────────────────────────────────────────────────
let tablaLista = false;
let inicializando = false;

async function inicializarTabla() {
  if (tablaLista || inicializando) return;
  inicializando = true;
  try {
    await executeQuery(CREATE_TABLE_SQL);
    tablaLista = true;
    console.log('[logger] Tabla GN_LOG_APP lista.');
  } catch (err) {
    console.error('[logger] No se pudo crear GN_LOG_APP:', err.message);
  } finally {
    inicializando = false;
  }
}

// ─── Función interna de escritura ─────────────────────────────────────────────
/**
 * @param {string} nivel   - ERROR | WARN | INFO | DEBUG
 * @param {string} modulo  - Nombre del módulo/controlador
 * @param {string} mensaje - Descripción corta del evento
 * @param {string|null} detalle - Stack trace o JSON adicional
 * @param {object} ctx     - Contexto opcional: { usuario, ruta, codHttp, durMs, ipOrig }
 */
async function escribir(nivel, modulo, mensaje, detalle, ctx = {}) {
  // Imprimir siempre a consola (visible en iisnode logs y Kudu)
  const ts = new Date().toISOString();
  const linea = `[${ts}] [${nivel}] [${modulo}] ${mensaje}`;
  if (nivel === 'ERROR') {
    console.error(linea, detalle || '');
  } else if (nivel === 'WARN') {
    console.warn(linea);
  } else {
    console.log(linea);
  }

  // Intentar insertar en BD — nunca bloquea, nunca lanza
  try {
    if (!tablaLista) await inicializarTabla();
    if (!tablaLista) return; // Si la tabla no está lista, solo consola

    await executeQuery(INSERT_SQL, {
      nivel:   nivel.substring(0, 10),
      modulo:  (modulo  || '').substring(0, 100),
      mensaje: (mensaje || '').substring(0, 500),
      detalle: detalle ? String(detalle).substring(0, 4000) : null,
      usuario: (ctx.usuario || null),
      ruta:    ctx.ruta    ? String(ctx.ruta).substring(0, 200) : null,
      codHttp: ctx.codHttp || null,
      durMs:   ctx.durMs   || null,
      ipOrig:  ctx.ipOrig  ? String(ctx.ipOrig).substring(0, 50) : null,
    });
  } catch (err) {
    // Silenciar: el logging nunca debe tumbar la app
    console.error('[logger] Fallo al insertar en GN_LOG_APP:', err.message);
  }
}

// ─── API pública ──────────────────────────────────────────────────────────────
module.exports = {
  /**
   * Inicializa la tabla GN_LOG_APP. Llamar UNA vez en server.js al arrancar.
   */
  init: inicializarTabla,

  /** Registra un error grave */
  error: (modulo, mensaje, detalle, ctx) => escribir('ERROR', modulo, mensaje, detalle, ctx),

  /** Registra una advertencia */
  warn:  (modulo, mensaje, detalle, ctx) => escribir('WARN',  modulo, mensaje, detalle, ctx),

  /** Registra información general */
  info:  (modulo, mensaje, detalle, ctx) => escribir('INFO',  modulo, mensaje, detalle, ctx),

  /** Registra información de depuración */
  debug: (modulo, mensaje, detalle, ctx) => escribir('DEBUG', modulo, mensaje, detalle, ctx),

  /**
   * Middleware Express para capturar errores no manejados.
   * Agregar al FINAL de las rutas en server.js:
   *   app.use(logger.middlewareError);
   */
  middlewareError: (err, req, res, next) => {
    const ctx = {
      usuario: req.nom_usua || req.cod_gusu || null,
      ruta:    `${req.method} ${req.path}`,
      codHttp: 500,
      ipOrig:  req.ip || req.headers['x-forwarded-for'] || null,
    };
    escribir('ERROR', 'express', err.message, err.stack, ctx);
    if (!res.headersSent) {
      res.status(500).json({ success: false, error: 'Error interno del servidor.' });
    }
  },

  /**
   * Middleware Express para logging de requests con errores HTTP (4xx/5xx).
   * Agregar después de las rutas.
   */
  middlewareRequest: (req, res, next) => {
    const inicio = Date.now();
    res.on('finish', () => {
      const durMs  = Date.now() - inicio;
      const codigo = res.statusCode;
      if (codigo >= 400) {
        const nivel = codigo >= 500 ? 'ERROR' : 'WARN';
        escribir(nivel, 'http', `${req.method} ${req.path} → ${codigo}`, null, {
          usuario: req.nom_usua || req.cod_gusu || null,
          ruta:    `${req.method} ${req.path}`,
          codHttp: codigo,
          durMs,
          ipOrig:  req.ip || req.headers['x-forwarded-for'] || null,
        });
      }
    });
    next();
  },
};
