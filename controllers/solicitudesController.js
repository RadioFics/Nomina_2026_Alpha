// ============================================================================
//  controllers/solicitudesController.js
//  Formularios públicos de Permiso y Vacaciones — MineDax
//
//  FLUJO CON APROBACIÓN INTERMEDIA:
//    1. Empleado envía formulario → validado y guardado en NO_SOLICITUDES_PEND
//       (estado P=Pendiente). Nada se escribe en NO_NOVED todavía.
//    2. Email al jefe del área con botones ✓ APROBAR / ✗ RECHAZAR.
//    3a. Jefe aprueba → se ejecuta el flujo original completo:
//        registrar en BD, generar PDF, enviar a RRHH y al empleado.
//    3b. Jefe rechaza → email de rechazo al empleado. Sin registro en BD.
//    3c. Sin respuesta → recordatorio automático cada JEFE_REMINDER_HORAS (def 24h).
//        Al vencer JEFE_TOKEN_HORAS (def 72h) → estado X, email de expiración.
//
//  ──────────────────────────────────────────────────────────────────────────
//  RESOLUCIÓN DEL JEFE (OPCIÓN A — variables de entorno)
//  ──────────────────────────────────────────────────────────────────────────
//  Configura en .env las siguientes variables (ver .env.example para detalle):
//
//    JEFE_CCOST_5=logistica@collectivemining.com
//    JEFE_CCOST_5_NOMBRE=Carlos Pérez
//    JEFE_CCOST_12=mineria@collectivemining.com
//    JEFE_DEFAULT=supervisor@collectivemining.com   ← fallback genérico
//
//  Si no hay variable específica ni genérica → usa MAIL_RRHH como último recurso.
//
//  ──────────────────────────────────────────────────────────────────────────
//  MIGRACIÓN A OPCIÓN B (jefe en base de datos)
//  ──────────────────────────────────────────────────────────────────────────
//  Cuando se haya añadido EMAIL_JEFE y NOM_JEFE a dbo.MAE_CCOST:
//    1. Ejecutar en MineDax:
//         ALTER TABLE dbo.MAE_CCOST ADD EMAIL_JEFE NVARCHAR(100) NULL;
//         ALTER TABLE dbo.MAE_CCOST ADD NOM_JEFE   NVARCHAR(200) NULL;
//         -- Luego poblar: UPDATE dbo.MAE_CCOST SET EMAIL_JEFE=..., NOM_JEFE=... WHERE COD_CCOST=...
//    2. En la función _resolverEmailJefe() (línea ~80) descomentar el bloque
//       "OPCIÓN B" y comentar el bloque "OPCIÓN A".
//    3. Eliminar las variables JEFE_CCOST_* del .env (ya no son necesarias).
// ============================================================================

const { executeQuery }        = require('../config/database');
const { enviarEmail }         = require('../config/mailer');
const { subirPDFaSharePoint } = require('../config/sharepoint');
const { resolverEmailJefe }   = require('./jefesAreaController');
const fs                      = require('fs');
const {
  generarPermisoOficial,
  generarVacacionesOficial,
} = require('./pdfPlantillaController');
const {
  generarPDFPermiso: _pdfkitPermiso,
  generarPDFVacaciones: _pdfkitVacaciones,
} = require('./formularioController');
const path   = require('path');
const crypto = require('crypto');

const DEFAULT_COD_EMPR        = 1;
const TEMP_DIR                = path.join(__dirname, '..', 'temp');
const JEFE_TOKEN_HORAS        = parseInt(process.env.JEFE_TOKEN_HORAS,    10) || 72;
const JEFE_REMINDER_HORAS     = parseInt(process.env.JEFE_REMINDER_HORAS, 10) || 24;

// ─── Tabla de solicitudes pendientes ─────────────────────────────────────────

exports.ensureDbObjects = async function ensureDbObjects() {
  try {
    await executeQuery(`
      IF NOT EXISTS (
        SELECT 1 FROM INFORMATION_SCHEMA.TABLES
        WHERE TABLE_SCHEMA='dbo' AND TABLE_NAME='NO_SOLICITUDES_PEND'
      ) BEGIN
        CREATE TABLE dbo.NO_SOLICITUDES_PEND (
          COD_SOLIC    INT           IDENTITY(1,1) PRIMARY KEY,
          TOK_APRO     NVARCHAR(36)  NOT NULL UNIQUE,
          TIP_FORM     NVARCHAR(20)  NOT NULL,
          DAT_FORM     NVARCHAR(MAX) NOT NULL,
          NOM_EMPL     NVARCHAR(200),
          COD_EMPL     NVARCHAR(20),
          EMAIL_EMPL   NVARCHAR(100),
          EMAIL_JEFE   NVARCHAR(100),
          NOM_JEFE     NVARCHAR(200),
          FECHAS_LABEL NVARCHAR(120),
          EST_SOLIC    NCHAR(1)  NOT NULL DEFAULT 'P',
          FEC_CREA     DATETIME  NOT NULL DEFAULT GETDATE(),
          FEC_EXP      DATETIME  NOT NULL,
          FEC_ULTREM   DATETIME  NULL,
          FEC_RESOL    DATETIME  NULL
        );
        PRINT '[solicitudes] NO_SOLICITUDES_PEND creada.';
      END
    `);
  } catch (err) {
    console.warn('[solicitudes] ensureDbObjects warning:', err.message);
  }
};

// ─── Resolver jefe del área ───────────────────────────────────────────────────
// Delegado a jefesAreaController.resolverEmailJefe (async, con BD + fallback env).
// Se mantiene la firma _resolverEmailJefe(codCcost) para compatibilidad interna;
// ahora es async y devuelve una Promise.
async function _resolverEmailJefe(codCcost) {
  return resolverEmailJefe(codCcost);
}

// ─── DB helpers ───────────────────────────────────────────────────────────────

async function _resolverEmpleado(cedula) {
  const r = await executeQuery(`
    SELECT TOP 1
      f.COD_FUNCI, t.NOM_COMP,
      f.COD_CARGO, f.COD_CCOST
    FROM dbo.GN_FUNCI  f
    INNER JOIN dbo.GN_TERCE t ON t.COD_TERC = f.COD_TERC
    WHERE f.COD_EMPR = @codEmpr
      AND t.NUM_IDEN = CAST(@cedula AS BIGINT)
      AND f.ACT_ESTA = 'A'
  `, { codEmpr: DEFAULT_COD_EMPR, cedula: String(cedula).trim() });

  if (!r.recordset || !r.recordset[0]) return null;
  const row = r.recordset[0];
  let cargo = '', area = '';
  try {
    if (row.COD_CARGO) {
      const rc = await executeQuery(
        `SELECT TOP 1 NOM_CARGO FROM dbo.MAE_CARGO WHERE COD_CARGO = @cod`,
        { cod: row.COD_CARGO }
      );
      if (rc.recordset?.[0]) cargo = rc.recordset[0].NOM_CARGO || '';
    }
  } catch (_) {}
  try {
    if (row.COD_CCOST) {
      const rd = await executeQuery(
        `SELECT TOP 1 NOM_CCOST FROM dbo.MAE_CCOST WHERE COD_CCOST = @cod`,
        { cod: row.COD_CCOST }
      );
      if (rd.recordset?.[0]) area = rd.recordset[0].NOM_CCOST || '';
    }
  } catch (_) {}
  return { COD_FUNCI: row.COD_FUNCI, NOM_COMP: row.NOM_COMP, CARGO: cargo, AREA: area, COD_CCOST: row.COD_CCOST || null };
}

async function _resolverPeriodo() {
  const r = await executeQuery(`
    SELECT TOP 1 COD_PERIOD, PER_ANO, PER_MES, PER_QNA, PER_FINI, PER_FFIN
    FROM dbo.NO_PERIOD
    WHERE COD_EMPR=@codEmpr AND ACT_ESTA='A' AND PER_EST='A'
      AND CONVERT(date,GETDATE()) BETWEEN PER_FINI AND PER_FFIN
    ORDER BY PER_FINI DESC
  `, { codEmpr: DEFAULT_COD_EMPR });
  if (r.recordset?.[0]) return r.recordset[0];
  const r2 = await executeQuery(`
    SELECT TOP 1 COD_PERIOD, PER_ANO, PER_MES, PER_QNA, PER_FINI, PER_FFIN
    FROM dbo.NO_PERIOD
    WHERE COD_EMPR=@codEmpr AND ACT_ESTA='A' AND PER_EST='A'
    ORDER BY PER_FINI DESC
  `, { codEmpr: DEFAULT_COD_EMPR });
  return r2.recordset?.[0] || null;
}

async function _buscarDuplicado(codFunci, codConc, fechaIni, fechaFin) {
  const r = await executeQuery(`
    SELECT TOP 1 n.COD_NOVED, n.ACT_ESTA
    FROM dbo.NO_NOVED n
    LEFT JOIN dbo.NO_PERIOD p ON p.COD_EMPR=n.COD_EMPR AND p.COD_PERIOD=n.COD_PERIOD
    WHERE n.COD_EMPR=@codEmpr AND n.COD_FUNCI=@codFunci AND n.COD_CONC=@codConc
      AND n.FEC_INI=CONVERT(date,@fechaIni) AND n.FEC_FIN=CONVERT(date,@fechaFin)
      AND (n.ACT_ESTA='A' OR ISNULL(p.PER_EST,'')='A')
    ORDER BY n.ACT_ESTA DESC
  `, { codEmpr: DEFAULT_COD_EMPR, codFunci, codConc, fechaIni, fechaFin });
  return r.recordset?.[0] || null;
}

async function _buscarEnPeriodo(codPeriod, codFunci, codConc) {
  const r = await executeQuery(`
    SELECT TOP 1 n.COD_NOVED, n.ACT_ESTA, n.FEC_INI, n.FEC_FIN
    FROM dbo.NO_NOVED n
    WHERE n.COD_EMPR=@codEmpr AND n.COD_PERIOD=@codPeriod
      AND n.COD_FUNCI=@codFunci AND n.COD_CONC=@codConc
  `, { codEmpr: DEFAULT_COD_EMPR, codPeriod, codFunci, codConc });
  return r.recordset?.[0] || null;
}

async function _registrarNoved({ codFunci, codCcost, periodo, codConc, fechaIni, fechaFin, diasTotal, obs }) {
  const codEmpr = DEFAULT_COD_EMPR;
  const dup = await _buscarDuplicado(codFunci, codConc, fechaIni, fechaFin);
  if (dup) {
    if (dup.ACT_ESTA === 'A') return { estado: 'ACUMULADO', codNoved: dup.COD_NOVED };
    await executeQuery(
      `UPDATE dbo.NO_NOVED SET ACT_ESTA='A',ACT_USUA='SELF_SVC',ACT_HORA=GETDATE(),OBS_NOVED=@obs
       WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved`,
      { codEmpr, codNoved: dup.COD_NOVED, obs }
    );
    await executeQuery(`
      IF EXISTS(SELECT 1 FROM dbo.NO_AUSEN WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved)
        UPDATE dbo.NO_AUSEN SET ACT_ESTA='A',ACT_USUA='SELF_SVC',ACT_HORA=SYSDATETIME()
        WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved;
      ELSE
        INSERT INTO dbo.NO_AUSEN(COD_EMPR,COD_NOVED,FEC_INI,FEC_FIN,DIAS_TOTAL,ACT_USUA,ACT_HORA,ACT_ESTA)
        VALUES(@codEmpr,@codNoved,CONVERT(date,@fechaIni),CONVERT(date,@fechaFin),@diasTotal,'SELF_SVC',SYSDATETIME(),'A');
    `, { codEmpr, codNoved: dup.COD_NOVED, fechaIni, fechaFin, diasTotal });
    return { estado: 'REACTIVADO', codNoved: dup.COD_NOVED };
  }
  const enPer = await _buscarEnPeriodo(periodo.COD_PERIOD, codFunci, codConc);
  if (enPer) {
    await executeQuery(
      `UPDATE dbo.NO_NOVED SET FEC_INI=CONVERT(date,@fechaIni),FEC_FIN=CONVERT(date,@fechaFin),
       OBS_NOVED=@obs,ACT_ESTA='A',ACT_USUA='SELF_SVC',ACT_HORA=GETDATE()
       WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved`,
      { codEmpr, codNoved: enPer.COD_NOVED, fechaIni, fechaFin, obs }
    );
    await executeQuery(`
      IF NOT EXISTS(SELECT 1 FROM dbo.NO_AUSEN WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved)
        INSERT INTO dbo.NO_AUSEN(COD_EMPR,COD_NOVED,FEC_INI,FEC_FIN,DIAS_TOTAL,ACT_USUA,ACT_HORA,ACT_ESTA)
        VALUES(@codEmpr,@codNoved,CONVERT(date,@fechaIni),CONVERT(date,@fechaFin),@diasTotal,'SELF_SVC',SYSDATETIME(),'A');
      ELSE
        UPDATE dbo.NO_AUSEN SET FEC_INI=CONVERT(date,@fechaIni),FEC_FIN=CONVERT(date,@fechaFin),
        DIAS_TOTAL=@diasTotal,ACT_ESTA='A',ACT_USUA='SELF_SVC',ACT_HORA=SYSDATETIME()
        WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved;
    `, { codEmpr, codNoved: enPer.COD_NOVED, fechaIni, fechaFin, diasTotal });
    return { estado: 'ACTUALIZADO', codNoved: enPer.COD_NOVED };
  }
  const ins = await executeQuery(`
    INSERT INTO dbo.NO_NOVED(COD_EMPR,COD_FUNCI,COD_CONC,COD_PERIOD,
      FEC_REGI,OBS_NOVED,IND_APLICADO,ACT_USUA,ACT_HORA,ACT_ESTA,
      FEC_INI,FEC_FIN,COD_CCOST)
    VALUES(@codEmpr,@codFunci,@codConc,@codPeriod,
      CONVERT(date,GETDATE()),@obs,'N','SELF_SVC',GETDATE(),'A',
      CONVERT(date,@fechaIni),CONVERT(date,@fechaFin),@codCcost);
    SELECT SCOPE_IDENTITY() AS codNoved;
  `, { codEmpr, codFunci, codConc, codPeriod: periodo.COD_PERIOD, obs, fechaIni, fechaFin, codCcost: codCcost||null });
  const codNoved = ins.recordset?.[0]?.codNoved || null;
  if (codNoved) {
    await executeQuery(`
      INSERT INTO dbo.NO_AUSEN(COD_EMPR,COD_NOVED,FEC_INI,FEC_FIN,DIAS_TOTAL,ACT_USUA,ACT_HORA,ACT_ESTA)
      VALUES(@codEmpr,@codNoved,CONVERT(date,@fechaIni),CONVERT(date,@fechaFin),@diasTotal,'SELF_SVC',SYSDATETIME(),'A')
    `, { codEmpr, codNoved, fechaIni, fechaFin, diasTotal });
  }
  return { estado: 'INSERTADO', codNoved };
}

// ─── Generación de PDF (reutilizable en submit y en aprobación) ───────────────

async function _generarPDF(tipo, datosPDF) {
  if (tipo === 'permiso') {
    try {
      return { buffer: await generarPermisoOficial(datosPDF), ok: true, err: null };
    } catch (e1) {
      try {
        const kit = {
          nombre:       datosPDF.nombre,     cedula:      datosPDF.cedula,
          cargo:        datosPDF.cargo,      area:        datosPDF.area,
          tipoPermiso:  datosPDF.motivo,     fechaInicio: datosPDF.fecha_desde_iso,
          horaInicio:   datosPDF.hora_inicio || null,
          horaFin:      datosPDF.hora_fin    || null,
          totalHoras:   datosPDF.total_dias  || null,
          jefeInmediato: null,
          motivo: [datosPDF.explicacion, datosPDF.observaciones].filter(Boolean).join(' — ') || null,
        };
        return { buffer: await _pdfkitPermiso(kit, 'N/A'), ok: true, err: null };
      } catch (e2) {
        return { buffer: null, ok: false, err: `${e1.message} | ${e2.message}` };
      }
    }
  } else {
    try {
      return { buffer: await generarVacacionesOficial(datosPDF), ok: true, err: null };
    } catch (e1) {
      try {
        const kit = {
          nombre:       datosPDF.nombre,     cedula:      datosPDF.cedula,
          cargo:        datosPDF.cargo,
          fechaInicio:  datosPDF.fecha_inicio_iso,
          fechaFin:     datosPDF.fecha_fin_iso,
          diasSolicita: Number(datosPDF.dias_vacaciones) || 1,
          anoVacacion:  new Date(datosPDF.fecha_inicio_iso).getFullYear(),
          jefeInmediato: null,
          motivo: [datosPDF.actividades, datosPDF.observaciones].filter(Boolean).join(' — ') || null,
        };
        return { buffer: await _pdfkitVacaciones(kit, 'N/A'), ok: true, err: null };
      } catch (e2) {
        return { buffer: null, ok: false, err: `${e1.message} | ${e2.message}` };
      }
    }
  }
}

// ─── Guardar / recuperar solicitud pendiente ──────────────────────────────────

async function _guardarPendiente({ tipo, datForm, nomEmpl, codEmpl, emailEmpl, emailJefe, nomJefe, fechasLabel }) {
  const token   = crypto.randomUUID();
  const horasMs = JEFE_TOKEN_HORAS * 60 * 60 * 1000;
  const fecExp  = new Date(Date.now() + horasMs).toISOString();
  await executeQuery(`
    INSERT INTO dbo.NO_SOLICITUDES_PEND
      (TOK_APRO,TIP_FORM,DAT_FORM,NOM_EMPL,COD_EMPL,EMAIL_EMPL,
       EMAIL_JEFE,NOM_JEFE,FECHAS_LABEL,EST_SOLIC,FEC_EXP)
    VALUES
      (@tok,@tipo,@dat,@nom,@cod,@emailEmpl,
       @emailJefe,@nomJefe,@fechas,'P',CONVERT(datetime,@fecExp))
  `, { tok: token, tipo, dat: JSON.stringify(datForm), nom: nomEmpl,
       cod: codEmpl, emailEmpl: emailEmpl||'', emailJefe, nomJefe, fechas: fechasLabel, fecExp });
  return token;
}

async function _recuperarPendiente(token) {
  const r = await executeQuery(
    `SELECT * FROM dbo.NO_SOLICITUDES_PEND WHERE TOK_APRO=@tok`,
    { tok: token }
  );
  return r.recordset?.[0] || null;
}

// ─── Ejecutar flujo completo al aprobar ───────────────────────────────────────

async function _ejecutarAprobacion(row) {
  const datos  = JSON.parse(row.DAT_FORM);
  const emp    = datos.empleado;
  const periodo = datos.periodo;
  const calc   = datos.calculado;

  // Registrar en BD
  const resultado = await _registrarNoved({
    codFunci: emp.COD_FUNCI,
    codCcost: emp.COD_CCOST || null,
    periodo,
    codConc:   calc.codConc,
    fechaIni:  calc.fechaIni,
    fechaFin:  calc.fechaFin,
    diasTotal: calc.diasTotal,
    obs:       calc.obs,
  });

  // Generar PDF
  const { buffer: pdfBuffer, ok: pdfOk } = await _generarPDF(row.TIP_FORM, calc.datosPDF);

  // Subir a SharePoint (no bloqueante)
  if (pdfOk && pdfBuffer) {
    try {
      if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
      const ts  = Date.now();
      const tmp = path.join(TEMP_DIR, `${row.TIP_FORM}_${row.COD_EMPL}_${ts}.pdf`);
      fs.writeFileSync(tmp, pdfBuffer);
      const nomArch = `${row.TIP_FORM === 'permiso' ? 'Permiso' : 'Vacaciones'}_${(emp.NOM_COMP||'').trim().replace(/ /g,'_')}_${ts}.pdf`;
      subirPDFaSharePoint(tmp, nomArch).catch(() => {}).finally(() => {
        try { fs.unlinkSync(tmp); } catch (_) {}
      });
    } catch (_) {}
  }

  // Enviar emails
  const tipoLabel   = row.TIP_FORM === 'permiso' ? 'Permiso' : 'Vacaciones';
  const fechasLabel = row.FECHAS_LABEL || '';
  const nombrePDF   = `${tipoLabel}_${(emp.NOM_COMP||'').trim()}.pdf`;
  const adjunto     = pdfOk ? [{ filename: nombrePDF, content: pdfBuffer, contentType: 'application/pdf' }] : [];
  const from        = `"Collective Mining Nómina" <${process.env.MAIL_USER}>`;
  const nomJefeApro = row.NOM_JEFE || 'su jefe de área';

  if (process.env.MAIL_RRHH) {
    await enviarEmail({
      from, to: process.env.MAIL_RRHH,
      subject: `✓ Aprobado — Solicitud de ${tipoLabel} — ${(emp.NOM_COMP||'').trim()} — ${fechasLabel}`,
      html: _emailRRHH(row.TIP_FORM, (emp.NOM_COMP||'').trim(), row.COD_EMPL, fechasLabel, row.EMAIL_EMPL, nomJefeApro),
      attachments: adjunto,
    }).catch(() => {});
  }
  if (row.EMAIL_EMPL) {
    await enviarEmail({
      from, to: row.EMAIL_EMPL,
      subject: `✓ Tu Solicitud de ${tipoLabel} fue Aprobada — ${fechasLabel}`,
      html: _emailEmpleadoAprobado(row.TIP_FORM, (emp.NOM_COMP||'').trim(), fechasLabel, nomJefeApro),
      attachments: adjunto,
    }).catch(() => {});
  }

  return resultado;
}

// ─── Utilidades ───────────────────────────────────────────────────────────────

function _isoADDMMYYYY(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
}

function _paginaRespuesta({ titulo, subtitulo = '', mensaje, tipo = 'info' }) {
  const palette = {
    success: { border: '#10b981', icon: '✓', iconBg: '#10b981' },
    danger:  { border: '#ef4444', icon: '✗', iconBg: '#ef4444' },
    warning: { border: '#f59e0b', icon: '⚠', iconBg: '#f59e0b' },
    info:    { border: '#3b82f6', icon: 'ℹ', iconBg: '#3b82f6' },
  };
  const c = palette[tipo] || palette.info;
  return `<!DOCTYPE html><html lang="es">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>${titulo} — Collective Mining</title>
<style>*{box-sizing:border-box;margin:0;padding:0}
body{font-family:Arial,sans-serif;background:#f1f5f9;min-height:100vh;
  display:flex;align-items:center;justify-content:center;padding:24px}
.card{background:#fff;border-radius:12px;padding:40px 48px;max-width:560px;width:100%;
  box-shadow:0 4px 24px rgba(0,0,0,.1);border-top:4px solid ${c.border};text-align:center}
.icon{width:64px;height:64px;border-radius:50%;background:${c.iconBg};color:#fff;
  font-size:28px;display:flex;align-items:center;justify-content:center;margin:0 auto 24px}
h1{font-size:22px;color:#1e293b;margin-bottom:8px}
.sub{font-size:13px;color:#64748b;font-weight:600;margin-bottom:16px}
p{font-size:14px;color:#475569;line-height:1.65}
.brand{margin-top:32px;padding-top:20px;border-top:1px solid #e2e8f0;
  font-size:11px;color:#94a3b8;text-transform:uppercase;letter-spacing:.08em}
</style></head>
<body><div class="card">
  <div class="icon">${c.icon}</div>
  <h1>${titulo}</h1>
  ${subtitulo ? `<p class="sub">${subtitulo}</p>` : ''}
  <p>${mensaje}</p>
  <div class="brand">Collective Mining · Sistema de Nómina · MineDax</div>
</div></body></html>`;
}

// ─── Plantillas de email ───────────────────────────────────────────────────────

function _btnStyle(color) {
  return `display:inline-block;padding:13px 36px;background:${color};color:#fff;
          text-decoration:none;border-radius:6px;font-family:Arial,sans-serif;
          font-weight:700;font-size:13px;letter-spacing:.05em;text-transform:uppercase`;
}

function _emailJefeAprobacion(tipo, nombre, cedula, fechasLabel, urlAprobar, urlRechazar, nomJefe, bypass = false) {
  const tipoLabel = tipo === 'permiso' ? 'Permiso' : 'Vacaciones';
  const baseUrl   = process.env.APP_URL || 'http://localhost:3000';
  const bannerPrueba = bypass ? `
    <div style="background:#f59e0b;padding:12px 20px;text-align:center;font-family:Arial,sans-serif">
      <strong style="color:#1a202c;font-size:13px">
        ⚠ MODO PRUEBA — Este correo fue redirigido por JEFE_BYPASS_EMAIL.
        El jefe de área REAL no fue notificado.
      </strong>
    </div>` : '';
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#1E1E1E;padding:0">
    ${bannerPrueba}
    <div style="background:#20A7C9;padding:20px 28px">
      <h1 style="font-size:18px;color:#fff;margin:0 0 4px;font-weight:700;text-transform:uppercase;letter-spacing:.06em">
        Collective Mining
      </h1>
      <p style="color:rgba(255,255,255,.75);margin:0;font-size:11px;letter-spacing:.12em;text-transform:uppercase">
        — Sistema de Nómina —
      </p>
    </div>
    <div style="background:#2B2B2B;padding:32px 36px;color:#CCCCCC">
      <h2 style="font-size:17px;color:#4DC4E0;margin:0 0 18px;text-transform:uppercase;letter-spacing:.04em">
        Solicitud de ${tipoLabel} — Requiere su aprobación
      </h2>
      <p style="margin:0 0 14px">Estimado/a <strong style="color:#fff">${nomJefe}</strong>,</p>
      <p style="margin:0 0 20px">El siguiente empleado ha enviado una solicitud de ${tipoLabel.toLowerCase()} que
         requiere su autorización antes de ser registrada en el sistema:</p>
      <div style="background:#383838;border-left:3px solid #20A7C9;padding:14px 18px;border-radius:0 6px 6px 0;margin:0 0 28px">
        <p style="margin:0 0 8px"><span style="color:#A0A0A0;font-size:11px;text-transform:uppercase;letter-spacing:.08em">Empleado</span><br>
           <strong style="color:#fff;font-size:15px">${nombre}</strong></p>
        <p style="margin:0 0 8px"><span style="color:#A0A0A0;font-size:11px;text-transform:uppercase;letter-spacing:.08em">Cédula</span><br>
           <strong style="color:#fff">${cedula}</strong></p>
        <p style="margin:0"><span style="color:#A0A0A0;font-size:11px;text-transform:uppercase;letter-spacing:.08em">Período solicitado</span><br>
           <strong style="color:#4DC4E0;font-size:15px">${fechasLabel}</strong></p>
      </div>
      <p style="margin:0 0 28px;font-size:13px">
        Los botones a continuación registrarán su decisión de forma definitiva.
        Este enlace expira en <strong style="color:#fff">${JEFE_TOKEN_HORAS} horas</strong>.
      </p>
      <div style="text-align:center;margin:0 0 28px;display:flex;gap:16px;justify-content:center">
        <a href="${urlAprobar}" style="${_btnStyle('#10b981')}">✓ Aprobar</a>
        <a href="${urlRechazar}" style="${_btnStyle('#ef4444')}">✗ Rechazar</a>
      </div>
      <p style="font-size:12px;color:#A0A0A0;margin:0 0 8px">Si los botones no funcionan, copie y pegue estas URLs:</p>
      <div style="background:#3A5A70;padding:10px 14px;border-radius:6px;border:1px solid #20A7C9;margin:0 0 8px">
        <p style="word-break:break-all;color:#fff;font-size:11px;margin:0;font-family:'Courier New',monospace">
          ✓ ${urlAprobar}
        </p>
      </div>
      <div style="background:#5a3a3a;padding:10px 14px;border-radius:6px;border:1px solid #ef4444;margin:0 0 24px">
        <p style="word-break:break-all;color:#fff;font-size:11px;margin:0;font-family:'Courier New',monospace">
          ✗ ${urlRechazar}
        </p>
      </div>
      <div style="border-top:1px solid rgba(32,167,201,.15);padding-top:18px;font-size:11px;color:#A0A0A0;text-align:center">
        Correo automático — no responder · © 2026 Collective Mining
      </div>
    </div>
  </div>`;
}

function _emailJefeRecordatorio(tipo, nombre, cedula, fechasLabel, urlAprobar, urlRechazar, nomJefe, horasRestantes) {
  const tipoLabel = tipo === 'permiso' ? 'Permiso' : 'Vacaciones';
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#1E1E1E;padding:0">
    <div style="background:#f59e0b;padding:20px 28px">
      <h1 style="font-size:18px;color:#fff;margin:0 0 4px;font-weight:700;text-transform:uppercase;letter-spacing:.06em">
        Collective Mining — Recordatorio
      </h1>
      <p style="color:rgba(255,255,255,.85);margin:0;font-size:11px;letter-spacing:.12em;text-transform:uppercase">
        Solicitud pendiente de aprobación
      </p>
    </div>
    <div style="background:#2B2B2B;padding:32px 36px;color:#CCCCCC">
      <h2 style="font-size:17px;color:#fcd34d;margin:0 0 18px;text-transform:uppercase;letter-spacing:.04em">
        ⏰ Recordatorio — Solicitud de ${tipoLabel}
      </h2>
      <p style="margin:0 0 14px">Estimado/a <strong style="color:#fff">${nomJefe}</strong>,</p>
      <p style="margin:0 0 20px">La siguiente solicitud de ${tipoLabel.toLowerCase()} aún no ha recibido respuesta.
         Le quedan aproximadamente <strong style="color:#fcd34d">${horasRestantes} horas</strong> para decidir
         antes de que expire.</p>
      <div style="background:#383838;border-left:3px solid #f59e0b;padding:14px 18px;border-radius:0 6px 6px 0;margin:0 0 28px">
        <p style="margin:0 0 8px"><strong style="color:#fff;font-size:15px">${nombre}</strong> — Cédula: ${cedula}</p>
        <p style="margin:0"><strong style="color:#fcd34d">${fechasLabel}</strong></p>
      </div>
      <div style="text-align:center;margin:0 0 28px;display:flex;gap:16px;justify-content:center">
        <a href="${urlAprobar}"  style="${_btnStyle('#10b981')}">✓ Aprobar</a>
        <a href="${urlRechazar}" style="${_btnStyle('#ef4444')}">✗ Rechazar</a>
      </div>
      <div style="background:#3A5A70;padding:10px 14px;border-radius:6px;border:1px solid #20A7C9;margin:0 0 8px">
        <p style="word-break:break-all;color:#fff;font-size:11px;margin:0;font-family:'Courier New',monospace">✓ ${urlAprobar}</p>
      </div>
      <div style="background:#5a3a3a;padding:10px 14px;border-radius:6px;border:1px solid #ef4444;margin:0 0 24px">
        <p style="word-break:break-all;color:#fff;font-size:11px;margin:0;font-family:'Courier New',monospace">✗ ${urlRechazar}</p>
      </div>
      <div style="border-top:1px solid rgba(32,167,201,.15);padding-top:18px;font-size:11px;color:#A0A0A0;text-align:center">
        Correo automático — no responder · © 2026 Collective Mining
      </div>
    </div>
  </div>`;
}

function _emailEmpleadoPendiente(tipo, nombre, fechasLabel) {
  const tipoLabel = tipo === 'permiso' ? 'Permiso' : 'Vacaciones';
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f0f4f8;padding:32px">
    <div style="background:#1565c0;padding:20px 28px;border-radius:8px 8px 0 0">
      <h1 style="font-size:20px;color:#fff;margin:0 0 4px;font-weight:700">Collective Mining</h1>
      <p style="color:rgba(255,255,255,.75);margin:0;font-size:12px">Sistema de Nómina — Talento Humano</p>
    </div>
    <div style="background:#fff;padding:28px;border-radius:0 0 8px 8px;border:1px solid #dde3ec;border-top:none">
      <h2 style="font-size:17px;color:#1565c0;margin:0 0 18px">Solicitud de ${tipoLabel} Recibida — En Revisión</h2>
      <p style="margin:0 0 14px;color:#1a202c">Hola <strong>${nombre}</strong>,</p>
      <p style="margin:0 0 14px;color:#374151">Tu solicitud de ${tipoLabel.toLowerCase()} para el período
         <strong>${fechasLabel}</strong> ha sido recibida correctamente.</p>
      <div style="background:#fef9c3;border-left:3px solid #ca8a04;padding:14px 16px;border-radius:0 6px 6px 0;margin:0 0 18px">
        <p style="margin:0;color:#92400e;font-size:13px">
          ⏳ <strong>Pendiente de aprobación:</strong> Tu solicitud ha sido enviada a tu jefe de área
          para su revisión. Recibirás otro correo una vez que sea aprobada o rechazada.
        </p>
      </div>
      <p style="margin:0;color:#6b7280;font-size:13px">
        El proceso puede tardar hasta <strong>${JEFE_TOKEN_HORAS} horas</strong>. Si no recibes respuesta
        en ese tiempo, contacta directamente al área de Talento Humano.
      </p>
      <p style="color:#6b7280;font-size:11px;margin:24px 0 0;border-top:1px solid #e5e7eb;padding-top:14px">
        Mensaje automático — no responder · © 2026 Collective Mining
      </p>
    </div>
  </div>`;
}

function _emailEmpleadoAprobado(tipo, nombre, fechasLabel, nomJefe) {
  const tipoLabel = tipo === 'permiso' ? 'Permiso' : 'Vacaciones';
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f0f4f8;padding:32px">
    <div style="background:#1565c0;padding:20px 28px;border-radius:8px 8px 0 0">
      <h1 style="font-size:20px;color:#fff;margin:0 0 4px;font-weight:700">Collective Mining</h1>
      <p style="color:rgba(255,255,255,.75);margin:0;font-size:12px">Sistema de Nómina — Talento Humano</p>
    </div>
    <div style="background:#fff;padding:28px;border-radius:0 0 8px 8px;border:1px solid #dde3ec;border-top:none">
      <h2 style="font-size:17px;color:#10b981;margin:0 0 18px">✓ Solicitud de ${tipoLabel} Aprobada</h2>
      <p style="margin:0 0 14px;color:#1a202c">Hola <strong>${nombre}</strong>,</p>
      <p style="margin:0 0 14px;color:#374151">Tu solicitud de ${tipoLabel.toLowerCase()} para el período
         <strong>${fechasLabel}</strong> ha sido <strong>aprobada</strong> por
         <strong>${nomJefe}</strong> y registrada en el sistema MineDax.</p>
      <div style="background:#f0fdf4;border-left:3px solid #10b981;padding:14px 16px;border-radius:0 6px 6px 0;margin:0 0 18px">
        <p style="margin:0;color:#166534;font-size:13px">
          Se adjunta el formato oficial PDF para tu archivo. Talento Humano ha sido notificado.
        </p>
      </div>
      <p style="color:#6b7280;font-size:11px;margin:24px 0 0;border-top:1px solid #e5e7eb;padding-top:14px">
        Mensaje automático — no responder · © 2026 Collective Mining
      </p>
    </div>
  </div>`;
}

function _emailEmpleadoRechazo(tipo, nombre, fechasLabel) {
  const tipoLabel = tipo === 'permiso' ? 'Permiso' : 'Vacaciones';
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f0f4f8;padding:32px">
    <div style="background:#dc2626;padding:20px 28px;border-radius:8px 8px 0 0">
      <h1 style="font-size:20px;color:#fff;margin:0 0 4px;font-weight:700">Collective Mining</h1>
      <p style="color:rgba(255,255,255,.75);margin:0;font-size:12px">Sistema de Nómina — Talento Humano</p>
    </div>
    <div style="background:#fff;padding:28px;border-radius:0 0 8px 8px;border:1px solid #dde3ec;border-top:none">
      <h2 style="font-size:17px;color:#dc2626;margin:0 0 18px">✗ Solicitud de ${tipoLabel} No Aprobada</h2>
      <p style="margin:0 0 14px;color:#1a202c">Hola <strong>${nombre}</strong>,</p>
      <p style="margin:0 0 14px;color:#374151">Tu solicitud de ${tipoLabel.toLowerCase()} para el período
         <strong>${fechasLabel}</strong> no ha sido aprobada por tu jefe de área.</p>
      <div style="background:#fef2f2;border-left:3px solid #dc2626;padding:14px 16px;border-radius:0 6px 6px 0;margin:0 0 18px">
        <p style="margin:0;color:#991b1b;font-size:13px">
          La solicitud <strong>no fue registrada</strong> en el sistema. Si consideras que
          esto es un error, comunícate directamente con tu jefe de área o con Talento Humano.
        </p>
      </div>
      <p style="color:#6b7280;font-size:11px;margin:24px 0 0;border-top:1px solid #e5e7eb;padding-top:14px">
        Mensaje automático — no responder · © 2026 Collective Mining
      </p>
    </div>
  </div>`;
}

function _emailEmpleadoExpiracion(tipo, nombre, fechasLabel) {
  const tipoLabel = tipo === 'permiso' ? 'Permiso' : 'Vacaciones';
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f0f4f8;padding:32px">
    <div style="background:#78716c;padding:20px 28px;border-radius:8px 8px 0 0">
      <h1 style="font-size:20px;color:#fff;margin:0 0 4px;font-weight:700">Collective Mining</h1>
      <p style="color:rgba(255,255,255,.75);margin:0;font-size:12px">Sistema de Nómina — Talento Humano</p>
    </div>
    <div style="background:#fff;padding:28px;border-radius:0 0 8px 8px;border:1px solid #dde3ec;border-top:none">
      <h2 style="font-size:17px;color:#78716c;margin:0 0 18px">Solicitud de ${tipoLabel} Expirada</h2>
      <p style="margin:0 0 14px;color:#1a202c">Hola <strong>${nombre}</strong>,</p>
      <p style="margin:0 0 14px;color:#374151">Tu solicitud de ${tipoLabel.toLowerCase()} para el período
         <strong>${fechasLabel}</strong> expiró sin recibir respuesta del jefe de área.</p>
      <div style="background:#f5f5f4;border-left:3px solid #78716c;padding:14px 16px;border-radius:0 6px 6px 0;margin:0 0 18px">
        <p style="margin:0;color:#44403c;font-size:13px">
          Si aún necesitas el ${tipoLabel.toLowerCase()}, por favor vuelve a diligenciar el formulario
          o comunícate directamente con Talento Humano.
        </p>
      </div>
      <p style="color:#6b7280;font-size:11px;margin:24px 0 0;border-top:1px solid #e5e7eb;padding-top:14px">
        Mensaje automático — no responder · © 2026 Collective Mining
      </p>
    </div>
  </div>`;
}

function _emailRRHH(tipo, nombre, cedula, fechas, emailSolicitante, nomJefeApro) {
  const tipoLabel = tipo === 'permiso' ? 'Permiso' : 'Vacaciones';
  return `
  <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#f0f4f8;padding:32px">
    <div style="background:#1565c0;padding:20px 28px;border-radius:8px 8px 0 0">
      <h1 style="font-size:20px;color:#fff;margin:0 0 4px;font-weight:700">Collective Mining</h1>
      <p style="color:rgba(255,255,255,.75);margin:0;font-size:12px">Sistema de Nómina — Talento Humano</p>
    </div>
    <div style="background:#fff;padding:28px;border-radius:0 0 8px 8px;border:1px solid #dde3ec;border-top:none">
      <h2 style="font-size:17px;color:#1565c0;margin:0 0 18px">✓ Nueva Solicitud Aprobada — ${tipoLabel}</h2>
      <div style="background:#f8fafc;border-left:3px solid #1565c0;padding:14px 16px;border-radius:0 6px 6px 0;margin:0 0 20px">
        <p style="margin:0 0 8px"><span style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.05em">Empleado</span><br>
           <strong style="color:#1a202c">${nombre}</strong></p>
        <p style="margin:0 0 8px"><span style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.05em">Cédula</span><br>
           <strong style="color:#1a202c">${cedula}</strong></p>
        <p style="margin:0 0 ${emailSolicitante ? '8px' : '0'}"><span style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.05em">Período</span><br>
           <strong style="color:#1a202c">${fechas}</strong></p>
        ${emailSolicitante ? `<p style="margin:0 0 8px"><span style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.05em">Correo</span><br>
           <strong style="color:#1a202c">${emailSolicitante}</strong></p>` : ''}
        ${nomJefeApro ? `<p style="margin:0"><span style="color:#6b7280;font-size:11px;text-transform:uppercase;letter-spacing:.05em">Aprobado por</span><br>
           <strong style="color:#10b981">${nomJefeApro}</strong></p>` : ''}
      </div>
      <p style="margin:0;color:#374151">El registro ya fue creado en MineDax (ACT_USUA=SELF_SVC). El PDF oficial se adjunta.</p>
      <p style="color:#6b7280;font-size:11px;margin:24px 0 0;border-top:1px solid #e5e7eb;padding-top:14px">
        Mensaje automático generado por MineDax · © 2026 Collective Mining
      </p>
    </div>
  </div>`;
}

// ─── Endpoints públicos ───────────────────────────────────────────────────────

exports.listarConceptosAusentismo = async (req, res) => {
  try {
    const r = await executeQuery(`
      SELECT COD_CONC AS codConc, NOM_CONC AS nombre, TIP_CONC AS tipo
      FROM dbo.NO_CONCE
      WHERE TIP_NATU IN ('AUSENTISMO','PERMISO') AND ACT_ESTA='A'
        AND COD_CONC <> 63
      ORDER BY TIP_NATU DESC, NOM_CONC ASC
    `);
    res.json({ success: true, conceptos: r.recordset || [] });
  } catch (err) {
    console.error('[solicitudes] conceptos-ausentismo:', err.message);
    res.json({ success: true, conceptos: [] });
  }
};

exports.verificarEmpleado = async (req, res) => {
  const { cedula } = req.query;
  if (!cedula || String(cedula).trim().length < 5)
    return res.status(400).json({ success: false, error: 'Cédula inválida' });
  try {
    const emp = await _resolverEmpleado(cedula);
    if (!emp) return res.status(404).json({ success: false, error: 'Empleado no encontrado o inactivo' });
    res.json({ success: true, codFunci: emp.COD_FUNCI,
      nombre: (emp.NOM_COMP||'').trim(), cargo: (emp.CARGO||'').trim(), area: (emp.AREA||'').trim() });
  } catch (err) {
    console.error('[solicitudes] verificarEmpleado:', err.message);
    res.status(500).json({ success: false, error: 'Error al consultar la base de datos' });
  }
};

// POST /api/solicitudes/permiso
exports.enviarSolicitudPermiso = async (req, res) => {
  const {
    cedula, email_solicitante,
    fecha_desde, fecha_hasta, hora_inicio, hora_fin, total_dias,
    tipo_ausentismo, motivo_pdf, cual, explicacion, tipo_permiso, observaciones,
    cod_conc: codConcBody,
  } = req.body;
  const tipoAusentismo = tipo_ausentismo || req.body.motivo || '';
  const motivoPDF      = motivo_pdf || '';

  if (!cedula || !fecha_desde || !fecha_hasta || !tipoAusentismo)
    return res.status(400).json({ success: false, error: 'Faltan campos: cedula, fecha_desde, fecha_hasta, tipo_ausentismo' });

  try {
    const emp = await _resolverEmpleado(cedula);
    if (!emp) return res.status(404).json({ success: false, error: 'Empleado no encontrado o inactivo' });

    const periodo = await _resolverPeriodo();
    if (!periodo) return res.status(409).json({ success: false, error: 'No hay período de nómina activo' });

    let codConc;
    if (codConcBody && !isNaN(Number(codConcBody))) { codConc = Number(codConcBody); }
    else {
      const upper = tipoAusentismo.toUpperCase();
      if      (upper.includes('COMPENSATORIO')) codConc = 74;
      else if (upper.includes('FAMILIA'))       codConc = 75;
      else                                      codConc = 68;
    }

    const diasTotal = parseFloat(total_dias) || 1;
    const obsParts  = [];
    if ((explicacion  ||'').trim()) obsParts.push(`E: ${explicacion.trim()}`);
    if ((observaciones||'').trim()) obsParts.push(`O: ${observaciones.trim()}`);
    const obs = obsParts.join(' | ').slice(0,500) || 'Permiso auto-servicio';

    const hoy     = new Date();
    const datosPDF = {
      nombre:        (emp.NOM_COMP||'').trim(),
      cedula:        String(cedula).trim(),
      cargo:         (emp.CARGO||'').trim(),
      area:          (emp.AREA ||'').trim(),
      fecha_dia:     String(hoy.getDate()).padStart(2,'0'),
      fecha_mes:     String(hoy.getMonth()+1).padStart(2,'0'),
      fecha_anio:    String(hoy.getFullYear()),
      fecha_desde:   _isoADDMMYYYY(fecha_desde),
      fecha_hasta:   _isoADDMMYYYY(fecha_hasta),
      fecha_desde_iso: fecha_desde,
      hora_inicio:   hora_inicio  || '',
      hora_fin:      hora_fin     || '',
      total_dias:    String(total_dias||''),
      motivo:        motivoPDF || tipoAusentismo,
      cual:          cual         || '',
      explicacion:   explicacion  || '',
      tipo_permiso:  tipo_permiso || 'Remunerado',
      observaciones: observaciones || '',
      cod_conc:      codConc,
    };

    const { emailJefe, nomJefe, bypass } = await _resolverEmailJefe(emp.COD_CCOST);
    const fechasLabel = `${_isoADDMMYYYY(fecha_desde)} al ${_isoADDMMYYYY(fecha_hasta)}`;

    // Guardar pendiente
    const token = await _guardarPendiente({
      tipo: 'permiso',
      datForm: { tipo: 'permiso', empleado: emp, periodo, calculado: { codConc, fechaIni: fecha_desde, fechaFin: fecha_hasta, diasTotal, obs, datosPDF } },
      nomEmpl:    (emp.NOM_COMP||'').trim(),
      codEmpl:    String(cedula).trim(),
      emailEmpl:  email_solicitante || '',
      emailJefe,  nomJefe, fechasLabel,
    });

    // Email al jefe
    const baseUrl   = process.env.APP_URL || 'http://localhost:3000';
    const urlAprobar  = `${baseUrl}/api/solicitudes/aprobar/${token}`;
    const urlRechazar = `${baseUrl}/api/solicitudes/rechazar/${token}`;

    if (emailJefe) {
      const subjectPrefijo = bypass ? '[PRUEBA — NO ES EL JEFE REAL] ' : '';
      await enviarEmail({
        from: `"Collective Mining Nómina" <${process.env.MAIL_USER}>`,
        to: emailJefe,
        subject: `${subjectPrefijo}Solicitud de Permiso pendiente — ${(emp.NOM_COMP||'').trim()} — ${fechasLabel}`,
        html: _emailJefeAprobacion('permiso', (emp.NOM_COMP||'').trim(), String(cedula).trim(), fechasLabel, urlAprobar, urlRechazar, nomJefe, bypass),
      }).catch(e => console.error('[solicitudes] email jefe:', e.message));
    }

    // Email al empleado (pendiente)
    if (email_solicitante) {
      await enviarEmail({
        from: `"Collective Mining Nómina" <${process.env.MAIL_USER}>`,
        to: email_solicitante,
        subject: `Tu Solicitud de Permiso — ${fechasLabel} — En Revisión`,
        html: _emailEmpleadoPendiente('permiso', (emp.NOM_COMP||'').trim(), fechasLabel),
      }).catch(e => console.error('[solicitudes] email empleado pendiente:', e.message));
    }

    res.json({
      success: true, estado: 'PENDIENTE',
      nombre: (emp.NOM_COMP||'').trim(),
      mensaje: `Solicitud de permiso enviada al jefe de área para aprobación. Recibirás un correo con el resultado en las próximas ${JEFE_TOKEN_HORAS} horas.`,
    });
  } catch (err) {
    console.error('[solicitudes] enviarSolicitudPermiso:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// POST /api/solicitudes/vacaciones
exports.enviarSolicitudVacaciones = async (req, res) => {
  const {
    cedula, email_solicitante,
    fecha_inicio, fecha_fin, dias_vacaciones,
    actividades, reemplazo, observaciones,
  } = req.body;

  if (!cedula || !fecha_inicio || !fecha_fin)
    return res.status(400).json({ success: false, error: 'Faltan campos: cedula, fecha_inicio, fecha_fin' });

  try {
    const emp = await _resolverEmpleado(cedula);
    if (!emp) return res.status(404).json({ success: false, error: 'Empleado no encontrado o inactivo' });

    const periodo = await _resolverPeriodo();
    if (!periodo) return res.status(409).json({ success: false, error: 'No hay período de nómina activo' });

    const msDay    = 1000 * 60 * 60 * 24;
    const diasCalc = Math.round((new Date(fecha_fin) - new Date(fecha_inicio)) / msDay) + 1;
    const diasTotal = parseInt(dias_vacaciones, 10) || diasCalc || 1;
    const obs       = `Vacaciones ${_isoADDMMYYYY(fecha_inicio)} al ${_isoADDMMYYYY(fecha_fin)} (${diasTotal} días)`;

    const datosPDF = {
      nombre:           (emp.NOM_COMP||'').trim(),
      cedula:           String(cedula).trim(),
      cargo:            (emp.CARGO||'').trim(),
      fecha_inicio:     _isoADDMMYYYY(fecha_inicio),
      fecha_fin:        _isoADDMMYYYY(fecha_fin),
      fecha_inicio_iso: fecha_inicio,
      fecha_fin_iso:    fecha_fin,
      dias_vacaciones:  String(diasTotal),
      actividades:      actividades  || '',
      reemplazo:        reemplazo    || '',
      observaciones:    observaciones || '',
    };

    const { emailJefe, nomJefe, bypass } = await _resolverEmailJefe(emp.COD_CCOST);
    const fechasLabel = `${_isoADDMMYYYY(fecha_inicio)} al ${_isoADDMMYYYY(fecha_fin)}`;

    const token = await _guardarPendiente({
      tipo: 'vacaciones',
      datForm: { tipo: 'vacaciones', empleado: emp, periodo, calculado: { codConc: 63, fechaIni: fecha_inicio, fechaFin: fecha_fin, diasTotal, obs, datosPDF } },
      nomEmpl:   (emp.NOM_COMP||'').trim(),
      codEmpl:   String(cedula).trim(),
      emailEmpl: email_solicitante || '',
      emailJefe, nomJefe, fechasLabel,
    });

    const baseUrl     = process.env.APP_URL || 'http://localhost:3000';
    const urlAprobar  = `${baseUrl}/api/solicitudes/aprobar/${token}`;
    const urlRechazar = `${baseUrl}/api/solicitudes/rechazar/${token}`;

    if (emailJefe) {
      const subjectPrefijo = bypass ? '[PRUEBA — NO ES EL JEFE REAL] ' : '';
      await enviarEmail({
        from: `"Collective Mining Nómina" <${process.env.MAIL_USER}>`,
        to: emailJefe,
        subject: `${subjectPrefijo}Solicitud de Vacaciones pendiente — ${(emp.NOM_COMP||'').trim()} — ${fechasLabel}`,
        html: _emailJefeAprobacion('vacaciones', (emp.NOM_COMP||'').trim(), String(cedula).trim(), fechasLabel, urlAprobar, urlRechazar, nomJefe, bypass),
      }).catch(e => console.error('[solicitudes] email jefe:', e.message));
    }

    if (email_solicitante) {
      await enviarEmail({
        from: `"Collective Mining Nómina" <${process.env.MAIL_USER}>`,
        to: email_solicitante,
        subject: `Tu Solicitud de Vacaciones — ${fechasLabel} — En Revisión`,
        html: _emailEmpleadoPendiente('vacaciones', (emp.NOM_COMP||'').trim(), fechasLabel),
      }).catch(e => console.error('[solicitudes] email empleado pendiente:', e.message));
    }

    res.json({
      success: true, estado: 'PENDIENTE',
      nombre: (emp.NOM_COMP||'').trim(),
      mensaje: `Solicitud de vacaciones enviada al jefe de área. Recibirás un correo con el resultado en las próximas ${JEFE_TOKEN_HORAS} horas.`,
    });
  } catch (err) {
    console.error('[solicitudes] enviarSolicitudVacaciones:', err.message);
    res.status(500).json({ success: false, error: err.message });
  }
};

// GET /api/solicitudes/aprobar/:token
exports.aprobarSolicitud = async (req, res) => {
  const { token } = req.params;
  try {
    const row = await _recuperarPendiente(token);

    if (!row) return res.status(200).send(_paginaRespuesta({
      titulo: 'Enlace no válido', mensaje: 'Este enlace no existe o ya fue utilizado.',
      tipo: 'warning',
    }));

    if (row.EST_SOLIC === 'A') return res.send(_paginaRespuesta({
      titulo:    'Ya aprobada',
      subtitulo: `${row.TIP_FORM === 'permiso' ? 'Permiso' : 'Vacaciones'} — ${row.FECHAS_LABEL}`,
      mensaje:   `La solicitud de <strong>${row.NOM_EMPL}</strong> ya fue aprobada anteriormente. No es necesario hacer nada más.`,
      tipo: 'info',
    }));

    if (row.EST_SOLIC === 'R') return res.send(_paginaRespuesta({
      titulo:    'Ya rechazada',
      subtitulo: `${row.TIP_FORM === 'permiso' ? 'Permiso' : 'Vacaciones'} — ${row.FECHAS_LABEL}`,
      mensaje:   `Esta solicitud ya fue rechazada anteriormente.`,
      tipo: 'warning',
    }));

    if (row.EST_SOLIC === 'X' || new Date(row.FEC_EXP) < new Date()) {
      await executeQuery(`UPDATE dbo.NO_SOLICITUDES_PEND SET EST_SOLIC='X' WHERE TOK_APRO=@tok`, { tok: token });
      return res.send(_paginaRespuesta({
        titulo:  'Enlace expirado',
        mensaje: `Este enlace de aprobación expiró. El empleado debe volver a enviar el formulario.`,
        tipo: 'warning',
      }));
    }

    // Ejecutar flujo completo
    await _ejecutarAprobacion(row);
    await executeQuery(
      `UPDATE dbo.NO_SOLICITUDES_PEND SET EST_SOLIC='A', FEC_RESOL=GETDATE() WHERE TOK_APRO=@tok`,
      { tok: token }
    );

    res.send(_paginaRespuesta({
      titulo:    '✓ Solicitud Aprobada',
      subtitulo: `${row.TIP_FORM === 'permiso' ? 'Permiso' : 'Vacaciones'} — ${row.FECHAS_LABEL}`,
      mensaje:   `La solicitud de <strong>${row.NOM_EMPL}</strong> ha sido aprobada y registrada en MineDax. Se han enviado los correos de confirmación a Talento Humano y al empleado.`,
      tipo: 'success',
    }));
  } catch (err) {
    console.error('[solicitudes] aprobarSolicitud:', err.message);
    res.status(500).send(_paginaRespuesta({
      titulo:  'Error al procesar',
      mensaje: `Ocurrió un error: ${err.message}. Por favor intente nuevamente o contacte al administrador del sistema.`,
      tipo: 'danger',
    }));
  }
};

// GET /api/solicitudes/rechazar/:token
exports.rechazarSolicitud = async (req, res) => {
  const { token } = req.params;
  try {
    const row = await _recuperarPendiente(token);

    if (!row) return res.send(_paginaRespuesta({
      titulo: 'Enlace no válido', mensaje: 'Este enlace no existe o ya fue utilizado.', tipo: 'warning',
    }));

    if (row.EST_SOLIC === 'R') return res.send(_paginaRespuesta({
      titulo:    'Ya rechazada',
      subtitulo: `${row.TIP_FORM === 'permiso' ? 'Permiso' : 'Vacaciones'} — ${row.FECHAS_LABEL}`,
      mensaje:   `Esta solicitud ya fue rechazada anteriormente.`, tipo: 'info',
    }));

    if (row.EST_SOLIC === 'A') return res.send(_paginaRespuesta({
      titulo:    'Ya aprobada',
      subtitulo: `${row.TIP_FORM === 'permiso' ? 'Permiso' : 'Vacaciones'} — ${row.FECHAS_LABEL}`,
      mensaje:   `Esta solicitud ya fue aprobada anteriormente y está registrada en el sistema.`, tipo: 'info',
    }));

    if (row.EST_SOLIC === 'X' || new Date(row.FEC_EXP) < new Date()) {
      await executeQuery(`UPDATE dbo.NO_SOLICITUDES_PEND SET EST_SOLIC='X' WHERE TOK_APRO=@tok`, { tok: token });
      return res.send(_paginaRespuesta({
        titulo: 'Enlace expirado', mensaje: 'Este enlace ya expiró.', tipo: 'warning',
      }));
    }

    // Marcar rechazada
    await executeQuery(
      `UPDATE dbo.NO_SOLICITUDES_PEND SET EST_SOLIC='R', FEC_RESOL=GETDATE() WHERE TOK_APRO=@tok`,
      { tok: token }
    );

    // Notificar al empleado
    if (row.EMAIL_EMPL) {
      await enviarEmail({
        from: `"Collective Mining Nómina" <${process.env.MAIL_USER}>`,
        to:   row.EMAIL_EMPL,
        subject: `Tu Solicitud de ${row.TIP_FORM === 'permiso' ? 'Permiso' : 'Vacaciones'} — No Aprobada`,
        html: _emailEmpleadoRechazo(row.TIP_FORM, row.NOM_EMPL||'', row.FECHAS_LABEL||''),
      }).catch(e => console.error('[solicitudes] email rechazo:', e.message));
    }

    res.send(_paginaRespuesta({
      titulo:    'Solicitud Rechazada',
      subtitulo: `${row.TIP_FORM === 'permiso' ? 'Permiso' : 'Vacaciones'} — ${row.FECHAS_LABEL}`,
      mensaje:   `La solicitud de <strong>${row.NOM_EMPL}</strong> ha sido rechazada. El empleado ha sido notificado por correo.`,
      tipo: 'danger',
    }));
  } catch (err) {
    console.error('[solicitudes] rechazarSolicitud:', err.message);
    res.status(500).send(_paginaRespuesta({
      titulo: 'Error al procesar',
      mensaje: `Ocurrió un error: ${err.message}. Por favor intente nuevamente.`,
      tipo: 'danger',
    }));
  }
};

// ─── Cron: recordatorios y expiración ─────────────────────────────────────────

exports.procesarRecordatoriosPendientes = async function procesarRecordatoriosPendientes() {
  try {
    const baseUrl = process.env.APP_URL || 'http://localhost:3000';

    // 1. Marcar expiradas y notificar al empleado
    const expiradas = await executeQuery(`
      UPDATE dbo.NO_SOLICITUDES_PEND
      SET EST_SOLIC='X', FEC_RESOL=GETDATE()
      OUTPUT inserted.TOK_APRO, inserted.TIP_FORM, inserted.NOM_EMPL,
             inserted.EMAIL_EMPL, inserted.FECHAS_LABEL
      WHERE EST_SOLIC='P' AND FEC_EXP <= GETDATE()
    `);
    for (const r of (expiradas.recordset || [])) {
      console.log(`[solicitudes] Solicitud expirada: ${r.NOM_EMPL} (${r.TIP_FORM} ${r.FECHAS_LABEL})`);
      if (r.EMAIL_EMPL) {
        await enviarEmail({
          from: `"Collective Mining Nómina" <${process.env.MAIL_USER}>`,
          to:   r.EMAIL_EMPL,
          subject: `Tu Solicitud de ${r.TIP_FORM === 'permiso' ? 'Permiso' : 'Vacaciones'} Expiró — ${r.FECHAS_LABEL}`,
          html: _emailEmpleadoExpiracion(r.TIP_FORM, r.NOM_EMPL||'', r.FECHAS_LABEL||''),
        }).catch(() => {});
      }
    }

    // 2. Enviar recordatorios a pendientes que llevan >JEFE_REMINDER_HORAS sin respuesta
    const pendientes = await executeQuery(`
      SELECT TOK_APRO, TIP_FORM, NOM_EMPL, COD_EMPL, EMAIL_JEFE, NOM_JEFE,
             FECHAS_LABEL, FEC_CREA, FEC_EXP, FEC_ULTREM
      FROM dbo.NO_SOLICITUDES_PEND
      WHERE EST_SOLIC='P'
        AND FEC_EXP > GETDATE()
        AND (FEC_ULTREM IS NULL
             OR DATEDIFF(hour, FEC_ULTREM, GETDATE()) >= @intervalH)
    `, { intervalH: JEFE_REMINDER_HORAS });

    for (const r of (pendientes.recordset || [])) {
      const horasRestantes = Math.max(0,
        Math.round((new Date(r.FEC_EXP) - Date.now()) / 3600000)
      );
      const urlAprobar  = `${baseUrl}/api/solicitudes/aprobar/${r.TOK_APRO}`;
      const urlRechazar = `${baseUrl}/api/solicitudes/rechazar/${r.TOK_APRO}`;

      if (r.EMAIL_JEFE) {
        await enviarEmail({
          from: `"Collective Mining Nómina" <${process.env.MAIL_USER}>`,
          to:   r.EMAIL_JEFE,
          subject: `⏰ Recordatorio — Solicitud de ${r.TIP_FORM === 'permiso' ? 'Permiso' : 'Vacaciones'} pendiente — ${r.NOM_EMPL}`,
          html: _emailJefeRecordatorio(r.TIP_FORM, r.NOM_EMPL||'', r.COD_EMPL||'',
                  r.FECHAS_LABEL||'', urlAprobar, urlRechazar, r.NOM_JEFE||'Jefe de Área', horasRestantes),
        }).catch(() => {});
        console.log(`[solicitudes] Recordatorio enviado a ${r.EMAIL_JEFE} para ${r.NOM_EMPL}`);
      }

      await executeQuery(
        `UPDATE dbo.NO_SOLICITUDES_PEND SET FEC_ULTREM=GETDATE() WHERE TOK_APRO=@tok`,
        { tok: r.TOK_APRO }
      );
    }
  } catch (err) {
    console.error('[solicitudes] procesarRecordatoriosPendientes:', err.message);
  }
};
