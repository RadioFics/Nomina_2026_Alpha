// ============================================================================
//  controllers/solicitudesController.js
//  Formularios públicos de Permiso y Vacaciones — MineDax
//
//  Endpoints consumidos por /solicitud/permiso y /solicitud/vacaciones.
//  No requieren autenticación JWT (rutas públicas de autoservicio).
//
//  Flujo por solicitud:
//    1. Valida empleado activo en GN_TERCE + GN_FUNCI mediante cédula.
//    2. Obtiene período activo (PER_EST='A').
//    3. Registra NO_NOVED + NO_AUSEN (ACT_USUA='SELF_SVC').
//    4. Genera PDF oficial con rellenar_pdf.py (plantilla + capa de datos).
//    5. Envía PDF al correo de RRHH y al correo del solicitante.
// ============================================================================

const { executeQuery } = require('../config/database');
const { enviarEmail }  = require('../config/mailer');
const { spawn }        = require('child_process');
const fs               = require('fs');
const path             = require('path');

const DEFAULT_COD_EMPR = 1;
const TEMPLATES_DIR    = path.join(__dirname, '..', 'templates');
const TEMP_DIR         = path.join(__dirname, '..', 'temp');
const PYTHON_SCRIPT    = path.join(__dirname, '..', 'python', 'rellenar_pdf.py');

// ─── DB helpers ──────────────────────────────────────────────────────────────

async function _resolverEmpleado(cedula) {
  const r = await executeQuery(`
    SELECT TOP 1
      f.COD_FUNCI,
      t.NOM_COMP,
      f.DES_CARG AS CARGO,
      a.NOM_AREA AS AREA
    FROM dbo.GN_FUNCI  f
    INNER JOIN dbo.GN_TERCE t ON t.COD_TERC = f.COD_TERC
    LEFT  JOIN dbo.GN_AREAS a ON a.COD_AREA = f.COD_AREA
    WHERE f.COD_EMPR = @codEmpr
      AND t.NUM_IDEN = CAST(@cedula AS BIGINT)
      AND f.ACT_ESTA = 'A'
  `, { codEmpr: DEFAULT_COD_EMPR, cedula: String(cedula).trim() });
  return r.recordset && r.recordset[0] ? r.recordset[0] : null;
}

async function _resolverPeriodo() {
  const r = await executeQuery(`
    SELECT TOP 1
      COD_PERIOD, PER_ANO, PER_MES, PER_QNA, PER_FINI, PER_FFIN
    FROM dbo.NO_PERIOD
    WHERE COD_EMPR = @codEmpr
      AND ACT_ESTA  = 'A'
      AND PER_EST   = 'A'
      AND CONVERT(date, GETDATE()) BETWEEN PER_FINI AND PER_FFIN
    ORDER BY PER_FINI DESC
  `, { codEmpr: DEFAULT_COD_EMPR });

  if (r.recordset && r.recordset[0]) return r.recordset[0];

  const r2 = await executeQuery(`
    SELECT TOP 1
      COD_PERIOD, PER_ANO, PER_MES, PER_QNA, PER_FINI, PER_FFIN
    FROM dbo.NO_PERIOD
    WHERE COD_EMPR = @codEmpr
      AND ACT_ESTA  = 'A'
      AND PER_EST   = 'A'
    ORDER BY PER_FINI DESC
  `, { codEmpr: DEFAULT_COD_EMPR });

  return r2.recordset && r2.recordset[0] ? r2.recordset[0] : null;
}

async function _buscarDuplicado(codFunci, codConc, fechaIni, fechaFin) {
  const r = await executeQuery(`
    SELECT TOP 1 n.COD_NOVED, n.ACT_ESTA
    FROM dbo.NO_NOVED n
    LEFT JOIN dbo.NO_PERIOD p
      ON p.COD_EMPR = n.COD_EMPR AND p.COD_PERIOD = n.COD_PERIOD
    WHERE n.COD_EMPR  = @codEmpr
      AND n.COD_FUNCI = @codFunci
      AND n.COD_CONC  = @codConc
      AND n.FEC_INI   = CONVERT(date, @fechaIni)
      AND n.FEC_FIN   = CONVERT(date, @fechaFin)
      AND (n.ACT_ESTA = 'A' OR ISNULL(p.PER_EST,'') = 'A')
    ORDER BY n.ACT_ESTA DESC
  `, { codEmpr: DEFAULT_COD_EMPR, codFunci, codConc, fechaIni, fechaFin });
  return r.recordset && r.recordset[0] ? r.recordset[0] : null;
}

async function _buscarEnPeriodo(codPeriod, codFunci, codConc) {
  const r = await executeQuery(`
    SELECT TOP 1 n.COD_NOVED, n.ACT_ESTA, n.FEC_INI, n.FEC_FIN
    FROM dbo.NO_NOVED n
    WHERE n.COD_EMPR   = @codEmpr
      AND n.COD_PERIOD = @codPeriod
      AND n.COD_FUNCI  = @codFunci
      AND n.COD_CONC   = @codConc
  `, { codEmpr: DEFAULT_COD_EMPR, codPeriod, codFunci, codConc });
  return r.recordset && r.recordset[0] ? r.recordset[0] : null;
}

// ─── Insertar / actualizar NO_NOVED + NO_AUSEN ───────────────────────────────

async function _registrarNoved({ codFunci, periodo, codConc, fechaIni, fechaFin, diasTotal, obs, diag }) {
  const codEmpr = DEFAULT_COD_EMPR;

  const dup = await _buscarDuplicado(codFunci, codConc, fechaIni, fechaFin);
  if (dup) {
    if (dup.ACT_ESTA === 'A') {
      return { estado: 'ACUMULADO', codNoved: dup.COD_NOVED };
    }
    await executeQuery(`
      UPDATE dbo.NO_NOVED
      SET ACT_ESTA='A', ACT_USUA='SELF_SVC', ACT_HORA=GETDATE(), OBS_NOVED=@obs
      WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved
    `, { codEmpr, codNoved: dup.COD_NOVED, obs });
    await executeQuery(`
      IF EXISTS (SELECT 1 FROM dbo.NO_AUSEN WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved)
        UPDATE dbo.NO_AUSEN
        SET ACT_ESTA='A', ACT_USUA='SELF_SVC', ACT_HORA=SYSDATETIME()
        WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved;
      ELSE
        INSERT INTO dbo.NO_AUSEN (COD_EMPR,COD_NOVED,FEC_INI,FEC_FIN,DIAS_TOTAL,DIAGNOSTICO,ACT_USUA,ACT_HORA,ACT_ESTA)
        VALUES (@codEmpr,@codNoved,CONVERT(date,@fechaIni),CONVERT(date,@fechaFin),@diasTotal,@diag,'SELF_SVC',SYSDATETIME(),'A');
    `, { codEmpr, codNoved: dup.COD_NOVED, fechaIni, fechaFin, diasTotal, diag });
    return { estado: 'REACTIVADO', codNoved: dup.COD_NOVED };
  }

  const enPer = await _buscarEnPeriodo(periodo.COD_PERIOD, codFunci, codConc);
  if (enPer) {
    await executeQuery(`
      UPDATE dbo.NO_NOVED
      SET FEC_INI=CONVERT(date,@fechaIni), FEC_FIN=CONVERT(date,@fechaFin),
          OBS_NOVED=@obs, ACT_ESTA='A', ACT_USUA='SELF_SVC', ACT_HORA=GETDATE()
      WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved
    `, { codEmpr, codNoved: enPer.COD_NOVED, fechaIni, fechaFin, obs });
    await executeQuery(`
      IF NOT EXISTS (SELECT 1 FROM dbo.NO_AUSEN WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved)
        INSERT INTO dbo.NO_AUSEN (COD_EMPR,COD_NOVED,FEC_INI,FEC_FIN,DIAS_TOTAL,DIAGNOSTICO,ACT_USUA,ACT_HORA,ACT_ESTA)
        VALUES (@codEmpr,@codNoved,CONVERT(date,@fechaIni),CONVERT(date,@fechaFin),@diasTotal,@diag,'SELF_SVC',SYSDATETIME(),'A');
      ELSE
        UPDATE dbo.NO_AUSEN
        SET FEC_INI=CONVERT(date,@fechaIni),FEC_FIN=CONVERT(date,@fechaFin),
            DIAS_TOTAL=@diasTotal,ACT_ESTA='A',ACT_USUA='SELF_SVC',ACT_HORA=SYSDATETIME()
        WHERE COD_EMPR=@codEmpr AND COD_NOVED=@codNoved;
    `, { codEmpr, codNoved: enPer.COD_NOVED, fechaIni, fechaFin, diasTotal, diag });
    return { estado: 'ACTUALIZADO', codNoved: enPer.COD_NOVED };
  }

  const ins = await executeQuery(`
    INSERT INTO dbo.NO_NOVED (
      COD_EMPR, COD_FUNCI, COD_CONC, COD_PERIOD,
      FEC_REGI, OBS_NOVED, IND_APLICADO,
      ACT_USUA, ACT_HORA, ACT_ESTA,
      FEC_INI, FEC_FIN
    ) VALUES (
      @codEmpr, @codFunci, @codConc, @codPeriod,
      CONVERT(date,GETDATE()), @obs, 'N',
      'SELF_SVC', GETDATE(), 'A',
      CONVERT(date,@fechaIni), CONVERT(date,@fechaFin)
    );
    SELECT SCOPE_IDENTITY() AS codNoved;
  `, { codEmpr, codFunci, codConc, codPeriod: periodo.COD_PERIOD, obs, fechaIni, fechaFin });

  const codNoved = ins.recordset && ins.recordset[0] ? ins.recordset[0].codNoved : null;

  if (codNoved) {
    await executeQuery(`
      INSERT INTO dbo.NO_AUSEN (
        COD_EMPR,COD_NOVED,FEC_INI,FEC_FIN,DIAS_TOTAL,
        DIAGNOSTICO,ACT_USUA,ACT_HORA,ACT_ESTA
      ) VALUES (
        @codEmpr,@codNoved,CONVERT(date,@fechaIni),CONVERT(date,@fechaFin),@diasTotal,
        @diag,'SELF_SVC',SYSDATETIME(),'A'
      )
    `, { codEmpr, codNoved, fechaIni, fechaFin, diasTotal, diag });
  }

  return { estado: 'INSERTADO', codNoved };
}

// ─── Generar PDF con Python ───────────────────────────────────────────────────

function _generarPDF(tipo, datos, rutaPlantilla, rutaSalida) {
  return new Promise((resolve, reject) => {
    const tmpJson = `${rutaSalida}.json`;
    fs.writeFileSync(tmpJson, JSON.stringify(datos, null, 2), 'utf8');

    let stdout = '', stderr = '';
    // Windows: usar 'python'; Linux/VPS: usar 'python3'
    const pythonCmd = process.platform === 'win32' ? 'python' : 'python3';
    const py = spawn(pythonCmd, [PYTHON_SCRIPT, tipo, tmpJson, rutaPlantilla, rutaSalida]);

    py.stdout.on('data', d => { stdout += d.toString(); });
    py.stderr.on('data', d => { stderr += d.toString(); });

    py.on('close', code => {
      try { fs.unlinkSync(tmpJson); } catch (_) {}
      if (code !== 0) {
        return reject(new Error(`rellenar_pdf.py error (code ${code}): ${stderr.slice(0, 400)}`));
      }
      try {
        resolve(JSON.parse(stdout.trim()));
      } catch (e) {
        reject(new Error(`JSON parse: ${stdout.slice(0, 200)}`));
      }
    });
  });
}

// ─── Email templates ──────────────────────────────────────────────────────────

function _emailConfirmacion(tipo, nombre, fechas) {
  const tipoLabel = tipo === 'permiso' ? 'Permiso' : 'Vacaciones';
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0E0E0E;padding:32px;color:#F0EDE8;border-radius:10px;border:1px solid rgba(201,168,76,0.2)">
      <h1 style="font-size:22px;color:#C9A84C;margin:0 0 8px">Collective Mining</h1>
      <p style="color:#8A857A;margin:0 0 24px;font-size:13px">Sistema de Nómina</p>
      <h2 style="color:#C9A84C;font-size:18px;margin:0 0 16px">Solicitud de ${tipoLabel} Recibida</h2>
      <p style="margin:0 0 16px">Hola <strong>${nombre}</strong>,</p>
      <p style="margin:0 0 16px">Tu solicitud de ${tipoLabel.toLowerCase()} ha sido registrada exitosamente. ${fechas}</p>
      <p style="margin:0 0 16px">Se ha generado el formato oficial y ha sido enviado al área de Talento Humano para su revisión y aprobación.</p>
      <p style="color:#8A857A;font-size:12px;margin:24px 0 0;border-top:1px solid rgba(201,168,76,0.15);padding-top:16px">
        Este es un mensaje automático. No responda a este correo.<br>
        © 2026 Collective Mining. Todos los derechos reservados.
      </p>
    </div>`;
}

function _emailRRHH(tipo, nombre, cedula, fechas, emailSolicitante) {
  const tipoLabel = tipo === 'permiso' ? 'Permiso' : 'Vacaciones';
  return `
    <div style="font-family:Arial,sans-serif;max-width:600px;margin:0 auto;background:#0E0E0E;padding:32px;color:#F0EDE8;border-radius:10px;border:1px solid rgba(201,168,76,0.2)">
      <h1 style="font-size:22px;color:#C9A84C;margin:0 0 8px">Collective Mining</h1>
      <p style="color:#8A857A;margin:0 0 24px;font-size:13px">Sistema de Nómina — Talento Humano</p>
      <h2 style="color:#C9A84C;font-size:18px;margin:0 0 16px">Nueva Solicitud de ${tipoLabel}</h2>
      <div style="background:#1E1E1E;border-left:4px solid #C9A84C;padding:16px;border-radius:6px;margin:0 0 20px">
        <p style="margin:0 0 6px"><span style="color:#8A857A;font-size:12px">Empleado</span><br><strong>${nombre}</strong></p>
        <p style="margin:6px 0 6px"><span style="color:#8A857A;font-size:12px">Cédula</span><br><strong>${cedula}</strong></p>
        <p style="margin:6px 0 0"><span style="color:#8A857A;font-size:12px">Período</span><br><strong>${fechas}</strong></p>
        ${emailSolicitante ? `<p style="margin:6px 0 0"><span style="color:#8A857A;font-size:12px">Correo</span><br><strong>${emailSolicitante}</strong></p>` : ''}
      </div>
      <p style="margin:0 0 16px">El formato oficial PDF se adjunta a este correo. El registro ya fue creado en el sistema MineDax (ACT_USUA = SELF_SVC).</p>
      <p style="color:#8A857A;font-size:12px;margin:24px 0 0;border-top:1px solid rgba(201,168,76,0.15);padding-top:16px">
        Este es un mensaje automático generado por MineDax.<br>
        © 2026 Collective Mining. Todos los derechos reservados.
      </p>
    </div>`;
}

// ─── Utilidades de fecha ──────────────────────────────────────────────────────

// YYYY-MM-DD → DD/MM/YYYY
function _isoADDMMYYYY(iso) {
  if (!iso) return '';
  const [y, m, d] = String(iso).split('-');
  return `${d}/${m}/${y}`;
}

// ─── Endpoints ────────────────────────────────────────────────────────────────

exports.verificarEmpleado = async (req, res) => {
  const { cedula } = req.query;
  if (!cedula || String(cedula).trim().length < 5) {
    return res.status(400).json({ success: false, error: 'Cédula inválida' });
  }
  try {
    const emp = await _resolverEmpleado(cedula);
    if (!emp) {
      return res.status(404).json({ success: false, error: 'Empleado no encontrado o inactivo' });
    }
    res.json({
      success: true,
      codFunci: emp.COD_FUNCI,
      nombre:   (emp.NOM_COMP || '').trim(),
      cargo:    (emp.CARGO   || '').trim(),
      area:     (emp.AREA    || '').trim(),
    });
  } catch (err) {
    console.error('[solicitudes] verificarEmpleado:', err.message);
    res.status(500).json({ success: false, error: 'Error al consultar la base de datos' });
  }
};

exports.enviarSolicitudPermiso = async (req, res) => {
  const {
    cedula, email_solicitante,
    fecha_desde, fecha_hasta,
    hora_inicio, hora_fin, total_dias,
    motivo, cual, explicacion,
    tipo_permiso, observaciones,
  } = req.body;

  if (!cedula || !fecha_desde || !fecha_hasta || !motivo) {
    return res.status(400).json({ success: false, error: 'Faltan campos obligatorios: cedula, fecha_desde, fecha_hasta, motivo' });
  }

  let pdfSalida = null;

  try {
    // 1. Resolver empleado
    const emp = await _resolverEmpleado(cedula);
    if (!emp) {
      return res.status(404).json({ success: false, error: 'Empleado no encontrado o inactivo en la base de datos' });
    }

    // 2. Período activo
    const periodo = await _resolverPeriodo();
    if (!periodo) {
      return res.status(409).json({ success: false, error: 'No hay período de nómina activo en el sistema' });
    }

    // 3. Mapear motivo → COD_CONC
    const motivoUpper = (motivo || '').toUpperCase();
    let codConc = 68; // Permiso Remunerado por defecto
    if (motivoUpper.includes('COMPENSATORIO')) codConc = 74;
    else if (motivoUpper.includes('FAMILIA'))    codConc = 75;

    // 4. Registrar en BD
    const fechaIni   = fecha_desde; // YYYY-MM-DD desde input type="date"
    const fechaFin   = fecha_hasta;
    const diasTotal  = parseFloat(total_dias) || 1;
    const diagSlice  = (motivo || 'PERMISO').slice(0, 20);
    const obs        = [motivo, hora_inicio ? `${hora_inicio}-${hora_fin}` : '', observaciones]
                         .filter(Boolean).join(' | ').slice(0, 500) || 'Permiso auto-servicio';

    const resultado = await _registrarNoved({
      codFunci: emp.COD_FUNCI,
      periodo,
      codConc,
      fechaIni,
      fechaFin,
      diasTotal,
      obs,
      diag: diagSlice,
    });

    // 5. Preparar datos para el PDF
    const hoy        = new Date();
    const diaHoy     = String(hoy.getDate()).padStart(2, '0');
    const mesHoy     = String(hoy.getMonth() + 1).padStart(2, '0');
    const anioHoy    = String(hoy.getFullYear());

    const datosPDF = {
      nombre:       emp.NOM_COMP.trim(),
      cedula:       String(cedula).trim(),
      cargo:        emp.CARGO.trim(),
      area:         (emp.AREA || '').trim(),
      fecha_dia:    diaHoy,
      fecha_mes:    mesHoy,
      fecha_anio:   anioHoy,
      fecha_desde:  _isoADDMMYYYY(fecha_desde),
      fecha_hasta:  _isoADDMMYYYY(fecha_hasta),
      hora_inicio:  hora_inicio  || '',
      hora_fin:     hora_fin     || '',
      total_dias:   String(total_dias || ''),
      motivo:       motivo       || '',
      cual:         cual         || '',
      explicacion:  explicacion  || '',
      tipo_permiso: tipo_permiso || 'Remunerado',
      observaciones: observaciones || '',
    };

    // 6. Generar PDF
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
    const ts       = Date.now();
    pdfSalida      = path.join(TEMP_DIR, `permiso_${cedula}_${ts}.pdf`);
    const plantilla = path.join(TEMPLATES_DIR, 'FORMATO_SOLICITUD_PERMISO.pdf');

    let pdfOk = false;
    try {
      await _generarPDF('permiso', datosPDF, plantilla, pdfSalida);
      pdfOk = true;
    } catch (pdfErr) {
      console.error('[solicitudes] Error generando PDF de permiso:', pdfErr.message);
    }

    // 7. Enviar correos
    const fechasLabel = `${_isoADDMMYYYY(fecha_desde)} al ${_isoADDMMYYYY(fecha_hasta)}`;
    const adjunto = pdfOk ? [{ filename: `Permiso_${emp.NOM_COMP.trim()}.pdf`, path: pdfSalida }] : [];

    const destinos = [];
    if (process.env.MAIL_RRHH) destinos.push(process.env.MAIL_RRHH);
    if (email_solicitante)      destinos.push(email_solicitante);

    if (destinos.length > 0) {
      const emailRRHH = process.env.MAIL_RRHH;

      if (emailRRHH) {
        await enviarEmail({
          from:        `"Collective Mining Nómina" <${process.env.MAIL_USER}>`,
          to:          emailRRHH,
          subject:     `Solicitud de Permiso — ${emp.NOM_COMP.trim()} — ${fechasLabel}`,
          html:        _emailRRHH('permiso', emp.NOM_COMP.trim(), cedula, fechasLabel, email_solicitante),
          attachments: adjunto,
        });
      }

      if (email_solicitante) {
        await enviarEmail({
          from:        `"Collective Mining Nómina" <${process.env.MAIL_USER}>`,
          to:          email_solicitante,
          subject:     `Tu Solicitud de Permiso — ${fechasLabel}`,
          html:        _emailConfirmacion('permiso', emp.NOM_COMP.trim(), `Período: ${fechasLabel}`),
          attachments: adjunto,
        });
      }
    }

    res.json({
      success: true,
      estado:  resultado.estado,
      codNoved: resultado.codNoved,
      nombre:  emp.NOM_COMP.trim(),
      mensaje: `Solicitud de permiso registrada (${resultado.estado}). ${pdfOk ? 'PDF enviado por correo.' : 'Advertencia: el PDF no pudo generarse.'}`,
    });

  } catch (err) {
    console.error('[solicitudes] enviarSolicitudPermiso:', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (pdfSalida && fs.existsSync(pdfSalida)) {
      try { fs.unlinkSync(pdfSalida); } catch (_) {}
    }
  }
};

exports.enviarSolicitudVacaciones = async (req, res) => {
  const {
    cedula, email_solicitante,
    fecha_inicio, fecha_fin,
    dias_vacaciones,
    actividades, reemplazo, observaciones,
  } = req.body;

  if (!cedula || !fecha_inicio || !fecha_fin) {
    return res.status(400).json({ success: false, error: 'Faltan campos obligatorios: cedula, fecha_inicio, fecha_fin' });
  }

  let pdfSalida = null;

  try {
    // 1. Resolver empleado
    const emp = await _resolverEmpleado(cedula);
    if (!emp) {
      return res.status(404).json({ success: false, error: 'Empleado no encontrado o inactivo en la base de datos' });
    }

    // 2. Período activo
    const periodo = await _resolverPeriodo();
    if (!periodo) {
      return res.status(409).json({ success: false, error: 'No hay período de nómina activo en el sistema' });
    }

    // 3. Calcular días
    const msDay    = 1000 * 60 * 60 * 24;
    const ini      = new Date(fecha_inicio);
    const fin      = new Date(fecha_fin);
    const diasCalc = Math.round((fin - ini) / msDay) + 1;
    const diasTotal = parseInt(dias_vacaciones, 10) || diasCalc || 1;

    const fechaIni = fecha_inicio;
    const fechaFin = fecha_fin;
    const obs      = `Vacaciones ${_isoADDMMYYYY(fechaIni)} al ${_isoADDMMYYYY(fechaFin)} (${diasTotal} días)`;

    // 4. Registrar en BD (COD_CONC = 63 — Vacaciones Disfrutadas)
    const resultado = await _registrarNoved({
      codFunci: emp.COD_FUNCI,
      periodo,
      codConc:   63,
      fechaIni,
      fechaFin,
      diasTotal,
      obs,
      diag: `Vacaciones - ${emp.NOM_COMP.trim()}`.slice(0, 20),
    });

    // 5. Preparar datos para PDF
    const datosPDF = {
      nombre:          emp.NOM_COMP.trim(),
      cedula:          String(cedula).trim(),
      cargo:           emp.CARGO.trim(),
      fecha_inicio:    fecha_inicio,
      fecha_fin:       fecha_fin,
      dias_vacaciones: String(diasTotal),
      actividades:     actividades  || '',
      reemplazo:       reemplazo    || '',
      observaciones:   observaciones || '',
    };

    // 6. Generar PDF
    if (!fs.existsSync(TEMP_DIR)) fs.mkdirSync(TEMP_DIR, { recursive: true });
    const ts        = Date.now();
    pdfSalida       = path.join(TEMP_DIR, `vacaciones_${cedula}_${ts}.pdf`);
    const plantilla = path.join(TEMPLATES_DIR, 'FORMATO_SOLICITUD_VACACIONES.pdf');

    let pdfOk = false;
    try {
      await _generarPDF('vacaciones', datosPDF, plantilla, pdfSalida);
      pdfOk = true;
    } catch (pdfErr) {
      console.error('[solicitudes] Error generando PDF de vacaciones:', pdfErr.message);
    }

    // 7. Enviar correos
    const fechasLabel = `${_isoADDMMYYYY(fecha_inicio)} al ${_isoADDMMYYYY(fecha_fin)}`;
    const adjunto = pdfOk ? [{ filename: `Vacaciones_${emp.NOM_COMP.trim()}.pdf`, path: pdfSalida }] : [];

    const emailRRHH = process.env.MAIL_RRHH;
    if (emailRRHH) {
      await enviarEmail({
        from:        `"Collective Mining Nómina" <${process.env.MAIL_USER}>`,
        to:          emailRRHH,
        subject:     `Solicitud de Vacaciones — ${emp.NOM_COMP.trim()} — ${fechasLabel}`,
        html:        _emailRRHH('vacaciones', emp.NOM_COMP.trim(), cedula, fechasLabel, email_solicitante),
        attachments: adjunto,
      });
    }

    if (email_solicitante) {
      await enviarEmail({
        from:        `"Collective Mining Nómina" <${process.env.MAIL_USER}>`,
        to:          email_solicitante,
        subject:     `Tu Solicitud de Vacaciones — ${fechasLabel}`,
        html:        _emailConfirmacion('vacaciones', emp.NOM_COMP.trim(), `Período: ${fechasLabel} (${diasTotal} días)`),
        attachments: adjunto,
      });
    }

    res.json({
      success: true,
      estado:  resultado.estado,
      codNoved: resultado.codNoved,
      nombre:  emp.NOM_COMP.trim(),
      mensaje: `Solicitud de vacaciones registrada (${resultado.estado}). ${pdfOk ? 'PDF enviado por correo.' : 'Advertencia: el PDF no pudo generarse.'}`,
    });

  } catch (err) {
    console.error('[solicitudes] enviarSolicitudVacaciones:', err.message);
    res.status(500).json({ success: false, error: err.message });
  } finally {
    if (pdfSalida && fs.existsSync(pdfSalida)) {
      try { fs.unlinkSync(pdfSalida); } catch (_) {}
    }
  }
};
