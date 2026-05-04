const { executeQuery } = require('../config/database');

async function buscarCedulasConCoincidencia(req, res) {
  try {
    const { q } = req.query;

    console.log('📩 Parámetro recibido (q):', q, 'Tipo:', typeof q);

    if (!q || q.trim() === '') {
      return res.status(400).json({ error: 'Búsqueda requerida' });
    }

    const busquedaInicio = `${q.trim()}%`;      // Comienza con: 13%
    const busquedaCualquier = `%${q.trim()}%`;  // Contiene en cualquier lugar: %13%

    console.log('🔍 Buscando cédulas con:', busquedaCualquier, '(prioridad al inicio)');

    // Buscar cédulas en cualquier parte, pero priorizando al inicio
    // IMPORTANTE: Usar CONVERT(VARCHAR(20)) para evitar notación científica
    const query = `
      SELECT TOP 20
        f.COD_TERC as codigo,
        t.NOM_COMP as nombre,
        t.NUM_IDEN as cedula,
        t.NOM_TERC as nombre1,
        t.APE_TERC as apellido
      FROM GN_TERCE t
      INNER JOIN GN_FUNCI f ON t.COD_TERC = f.COD_TERC
      WHERE CONVERT(VARCHAR(20), t.NUM_IDEN) LIKE @busquedaCualquier
      AND t.ACT_ESTA = 'A'
      AND f.ACT_ESTA = 'A'
      ORDER BY
        -- Prioridad 1: Que empiece con la búsqueda
        CASE WHEN CONVERT(VARCHAR(20), t.NUM_IDEN) LIKE @busquedaInicio THEN 0 ELSE 1 END,
        -- Prioridad 2: Orden numérico
        t.NUM_IDEN ASC
    `;

    console.log('📋 Ejecutando query con búsqueda flexible y prioridad');
    const resultado = await executeQuery(query, {
      busquedaInicio: busquedaInicio,
      busquedaCualquier: busquedaCualquier
    });

    const empleados = resultado.recordset || [];
    console.log(`✓ Se encontraron ${empleados.length} coincidencias`);
    if (empleados.length > 0) {
      console.log('📊 Primer resultado:', {
        cedula: empleados[0].cedula,
        nombre: empleados[0].nombre,
        codigo: empleados[0].codigo
      });
      console.log('📊 Todos los resultados:');
      empleados.forEach((emp, i) => {
        console.log(`  [${i}] Cédula: ${emp.cedula} | Nombre: ${emp.nombre}`);
      });
    }
    res.json(empleados);
  } catch (err) {
    console.error('❌ Error en buscarCedulasConCoincidencia:', err.message);
    console.error('❌ Stack:', err.stack);
    res.status(500).json({
      error: 'Error al buscar cédulas',
      details: err.message,
      stack: err.stack
    });
  }
}

async function obtenerEmpleadoPorCedula(req, res) {
  try {
    const { cedula } = req.query;

    if (!cedula || cedula.trim() === '') {
      return res.status(400).json({ error: 'Cédula requerida' });
    }

    console.log('🔍 Buscando empleado con cédula exacta:', cedula);

    // JOIN entre GN_TERCE (terceros) y GN_FUNCI (empleados)
    const query = `
      SELECT TOP 1
        f.COD_TERC as codigo,
        t.NOM_COMP as nombre,
        t.NUM_IDEN as cedula,
        t.NOM_TERC as nombre1,
        t.APE_TERC as apellido
      FROM GN_TERCE t
      INNER JOIN GN_FUNCI f ON t.COD_TERC = f.COD_TERC
      WHERE t.NUM_IDEN = CAST(@cedula AS BIGINT)
      AND t.ACT_ESTA = 'A'
      AND f.ACT_ESTA = 'A'
      ORDER BY t.NUM_IDEN ASC
    `;

    const result = await executeQuery(query, { cedula: parseInt(cedula.trim()) });

    if (!result.recordset || result.recordset.length === 0) {
      console.log('⚠️ Empleado no encontrado:', cedula);
      return res.status(404).json({ error: 'Empleado no encontrado', cedula });
    }

    const empleado = result.recordset[0];
    console.log('✓ Empleado encontrado:', empleado);
    res.json(empleado);
  } catch (err) {
    console.error('❌ Error en obtenerEmpleadoPorCedula:', err.message);
    res.status(500).json({
      error: 'Error al buscar empleado',
      details: err.message
    });
  }
}

async function obtenerConceptosOcasionales(req, res) {
  try {
    console.log('📋 Iniciando obtenerConceptosOcasionales...');

    const query = `
      SELECT
        COD_CONC as codigo,
        NOM_CONC as nombre,
        TIP_CONC as tipo
      FROM NO_CONCE
      WHERE TIP_NATU = 'OCASIONAL'
      ORDER BY NOM_CONC ASC
    `;

    console.log('🔍 Ejecutando query...');
    const result = await executeQuery(query, {});

    console.log('✓ Consulta exitosa. Registros encontrados:', result.recordset?.length || 0);
    res.json(result.recordset || []);
  } catch (err) {
    console.error('❌ Error en obtenerConceptosOcasionales:', err.message);
    console.error('   Stack:', err.stack);
    res.status(500).json({
      error: 'Error al obtener conceptos ocasionales',
      details: err.message,
      query: 'SELECT COD_CONC, NOM_CONC, TIP_CONC FROM NO_CONCE WHERE TIP_NATU = OCASIONAL'
    });
  }
}

// ─── CATÁLOGOS PARA MAESTRO ORIGINAL ────────────────────────────────────────
async function obtenerCatalogos(req, res) {
  try {
    const run = q => executeQuery(q, {}).then(r => r.recordset || []);
    const [tpdoc, grsan, estciv, banco, tpcta, ccost, cargo, eps, afp, caja, cesan] = await Promise.all([
      run("SELECT COD_TPDOC as cod, NOM_TPDOC as nom, COD_ABREV as abr FROM MAE_TPDOC WHERE ACT_ESTA='A' AND COD_TPDOC>0 ORDER BY COD_TPDOC"),
      run("SELECT COD_GRSAN as cod, NOM_GRSAN as nom FROM MAE_GRSAN WHERE ACT_ESTA='A' AND COD_GRSAN>0 ORDER BY COD_GRSAN"),
      run("SELECT COD_ESTCIV as cod, NOM_ESTCIV as nom FROM MAE_ESTCIV WHERE ACT_ESTA='A' AND COD_ESTCIV>0 ORDER BY COD_ESTCIV"),
      run("SELECT COD_BANCO as cod, NOM_BANCO as nom FROM MAE_BANCO WHERE ACT_ESTA='A' AND COD_BANCO>0 ORDER BY NOM_BANCO"),
      run("SELECT COD_TPCTA as cod, NOM_TPCTA as nom FROM MAE_TPCTA WHERE ACT_ESTA='A' AND COD_TPCTA>0 ORDER BY COD_TPCTA"),
      run("SELECT COD_CCOST as cod, NOM_CCOST as nom FROM MAE_CCOST WHERE ACT_ESTA='A' AND COD_CCOST>0 ORDER BY NOM_CCOST"),
      run("SELECT COD_CARGO as cod, NOM_CARGO as nom FROM MAE_CARGO WHERE ACT_ESTA='A' AND COD_CARGO>0 ORDER BY NOM_CARGO"),
      run("SELECT COD_TERC as cod, NOM_COMP as nom FROM GN_TERCE WHERE NOM_COMP LIKE '%E.P.S%' OR NOM_COMP LIKE '%CAFESALUD%' ORDER BY NOM_COMP"),
      run("SELECT COD_TERC as cod, NOM_COMP as nom FROM GN_TERCE WHERE NOM_COMP LIKE '%A.F.P%' OR NOM_COMP='COLPENSIONES' ORDER BY NOM_COMP"),
      run("SELECT COD_TERC as cod, NOM_COMP as nom FROM GN_TERCE WHERE NOM_COMP LIKE '%CCF %' ORDER BY NOM_COMP"),
      run("SELECT COD_TERC as cod, NOM_COMP as nom FROM GN_TERCE WHERE NOM_COMP LIKE '%CESANT%' OR NOM_COMP LIKE '%FONDO NACIONAL%' ORDER BY NOM_COMP"),
    ]);
    res.json({ tpdoc, grsan, estciv, banco, tpcta, ccost, cargo, eps, afp, caja, cesan });
  } catch (err) {
    console.error('❌ obtenerCatalogos:', err.message);
    res.status(500).json({ error: 'Error al obtener catálogos', details: err.message });
  }
}

// ─── CREAR EMPLEADO (GN_TERCE + GN_FUNCI) ───────────────────────────────────
async function crearEmpleado(req, res) {
  try {
    const b = req.body;
    if (!b.NUM_IDEN)   return res.status(400).json({ error: 'Número de identificación es obligatorio' });
    if (!b.APE_TERC)   return res.status(400).json({ error: 'Primer apellido es obligatorio' });
    if (!b.NOM_TERC)   return res.status(400).json({ error: 'Primer nombre es obligatorio' });
    if (!b.COD_CARGO)  return res.status(400).json({ error: 'Cargo es obligatorio' });
    if (!b.FEC_INGRES) return res.status(400).json({ error: 'Fecha de ingreso es obligatoria' });

    const dup = await executeQuery(
      "SELECT COD_TERC FROM GN_TERCE WHERE NUM_IDEN = @ni AND ACT_ESTA = 'A'",
      { ni: parseInt(b.NUM_IDEN) }
    );
    if (dup.recordset && dup.recordset.length > 0) {
      return res.status(409).json({ error: 'Ya existe un empleado activo con esta identificación' });
    }

    const [rt, rf] = await Promise.all([
      executeQuery("SELECT ISNULL(MAX(COD_TERC), 0) + 1 AS nxt FROM GN_TERCE", {}),
      executeQuery("SELECT ISNULL(MAX(COD_FUNCI), 0) + 1 AS nxt FROM GN_FUNCI", {}),
    ]);
    const codTerc  = rt.recordset[0].nxt;
    const codFunci = rf.recordset[0].nxt;

    const nomComp = [b.APE_TERC, b.SEG_APEL, b.NOM_TERC, b.SEG_NOMB]
      .map(s => (s || '').trim().toUpperCase()).filter(Boolean).join(' ');

    const toSlash = iso => {
      if (!iso) return null;
      const [y, m, d] = String(iso).split('-');
      return `${d}/${m}/${y}`;
    };

    const actUsua = 'MineDax';

    await executeQuery(`
      INSERT INTO GN_TERCE (
        COD_EMPR, COD_TERC, NUM_IDEN, COD_ALT, COD_TPDOC, NOM_COMP,
        NOM_TERC, SEG_NOMB, APE_TERC, SEG_APEL,
        COD_MPIO, TEL_TERC, TEL_TERC2, DIR_TERC, DIR_MAIL,
        TER_EMPL, ACT_USUA, ACT_HORA, ACT_ESTA
      ) VALUES (
        1, @codTerc, @numIden, @codAlt, @codTpdoc, @nomComp,
        @nomTerc, @segNomb, @apeTerc, @segApel,
        @codMpio, @telTerc, @telTerc2, @dirTerc, @dirMail,
        '0', @actUsua, GETDATE(), 'A'
      )`, {
      codTerc, numIden: parseInt(b.NUM_IDEN),
      codAlt:   b.COD_ALT || null,
      codTpdoc: parseInt(b.COD_TPDOC) || 1,
      nomComp,
      nomTerc:  (b.NOM_TERC || '').trim().toUpperCase(),
      segNomb:  (b.SEG_NOMB || '').trim().toUpperCase() || null,
      apeTerc:  (b.APE_TERC || '').trim().toUpperCase(),
      segApel:  (b.SEG_APEL || '').trim().toUpperCase() || null,
      codMpio:  b.COD_MPIO ? parseInt(b.COD_MPIO) : null,
      telTerc:  b.TEL_TERC  || '0',
      telTerc2: b.TEL_TERC2 || '',
      dirTerc:  b.DIR_TERC  || '',
      dirMail:  b.DIR_MAIL  || '',
      actUsua,
    });

    await executeQuery(`
      INSERT INTO GN_FUNCI (
        COD_EMPR, COD_FUNCI, COD_TERC,
        SEX_FUNC, COD_GRSAN, COD_ESTCIV, CNT_HIJO, FEC_NAC, CIU_EXPED,
        COD_CARGO, VAL_HORA,
        COD_TPCTA, COD_BANCO, NUM_CTA, NOM_SUCUR,
        COD_CCOST, CUE_GASTO,
        JOR_SABAD, TIP_SALAR, CUE_PENSIO, MOD_LIQUID,
        EMP_FORAN, DIR_FORAN,
        FEC_INGRES, FEC_RETIRO, CAU_RETIRO,
        TIP_CONTRA, NUM_CONTRA,
        POR_RETEN, DED_VIVIEN, DED_SALUD, DED_DEPEN, PRO_SALUD,
        COD_EPS, COD_AFP, COD_CAJA, COD_CESAN,
        GRA_RIESGO, DIA_VACAC,
        ACT_USUA, ACT_HORA, ACT_ESTA
      ) VALUES (
        1, @codFunci, @codTerc,
        @sexFunc, @codGrsan, @codEstciv, @cntHijo, @fecNac, @ciuExped,
        @codCargo, @valHora,
        @codTpcta, @codBanco, @numCta, @nomSucur,
        @codCcost, @cueGasto,
        @jorSabad, @tipSalar, @cuePensio, @modLiquid,
        @empForan, @dirForan,
        @fecIngres, @fecRetiro, @cauRetiro,
        @tipContra, @numContra,
        @porReten, @dedVivien, @dedSalud, @dedDepen, @proSalud,
        @codEps, @codAfp, @codCaja, @codCesan,
        @graRiesgo, @diaVacac,
        @actUsua, GETDATE(), 'A'
      )`, {
      codFunci, codTerc,
      sexFunc:   b.SEX_FUNC  || 'M',
      codGrsan:  b.COD_GRSAN  ? parseInt(b.COD_GRSAN)  : null,
      codEstciv: b.COD_ESTCIV ? parseInt(b.COD_ESTCIV) : null,
      cntHijo:   parseInt(b.CNT_HIJO) || 0,
      fecNac:    b.FEC_NAC ? new Date(b.FEC_NAC) : null,
      ciuExped:  b.CIU_EXPED ? parseInt(b.CIU_EXPED) : null,
      codCargo:  parseInt(b.COD_CARGO),
      valHora:   parseFloat(b.VAL_HORA) || 0,
      codTpcta:  parseInt(b.COD_TPCTA) || 0,
      codBanco:  parseInt(b.COD_BANCO) || 0,
      numCta:    b.NUM_CTA ? Number(String(b.NUM_CTA).replace(/\D/g, '')) : null,
      nomSucur:  (b.NOM_SUCUR || 'NO APLICA').substring(0, 10),
      codCcost:  parseInt(b.COD_CCOST) || 0,
      cueGasto:  parseInt(b.CUE_GASTO) || 0,
      jorSabad:  b.JOR_SABAD  || 'No',
      tipSalar:  b.TIP_SALAR  || 'Normal',
      cuePensio: b.CUE_PENSIO || null,
      modLiquid: b.MOD_LIQUID || 'Normal',
      empForan:  b.EMP_FORAN  || 'NO',
      dirForan:  b.DIR_FORAN  || 'NO',
      fecIngres: toSlash(b.FEC_INGRES),
      fecRetiro: toSlash(b.FEC_RETIRO),
      cauRetiro: b.CAU_RETIRO || 'NO APLICA',
      tipContra: b.TIP_CONTRA || '01',
      numContra: b.NUM_CONTRA ? parseInt(b.NUM_CONTRA) : null,
      porReten:  b.POR_RETEN  != null ? String(b.POR_RETEN)  : '0',
      dedVivien: b.DED_VIVIEN != null ? String(b.DED_VIVIEN) : '0',
      dedSalud:  b.DED_SALUD  != null ? String(b.DED_SALUD)  : '0',
      dedDepen:  b.DED_DEPEN  != null ? String(b.DED_DEPEN)  : '0',
      proSalud:  b.PRO_SALUD  != null ? String(b.PRO_SALUD)  : '0',
      codEps:    b.COD_EPS  ? parseFloat(b.COD_EPS)  : null,
      codAfp:    b.COD_AFP  ? parseFloat(b.COD_AFP)  : null,
      codCaja:   b.COD_CAJA ? parseFloat(b.COD_CAJA) : null,
      codCesan:  b.COD_CESAN? parseFloat(b.COD_CESAN): null,
      graRiesgo: b.GRA_RIESGO != null ? String(b.GRA_RIESGO) : '0',
      diaVacac:  b.DIA_VACAC  != null ? String(b.DIA_VACAC)  : '15',
      actUsua,
    });

    console.log(`✓ Empleado creado: ${nomComp} (COD_TERC=${codTerc}, COD_FUNCI=${codFunci})`);
    res.json({ success: true, message: `Empleado "${nomComp}" creado exitosamente`, codTerc, codFunci, nombre: nomComp });
  } catch (err) {
    console.error('❌ crearEmpleado:', err.message);
    res.status(500).json({ error: 'Error al crear empleado', details: err.message });
  }
}

// ─── DETALLE COMPLETO DE UN EMPLEADO (GN_TERCE + GN_FUNCI + catálogos) ───────
async function obtenerDetalleEmpleado(req, res) {
  try {
    const { cedula } = req.query;
    if (!cedula || cedula.trim() === '') {
      return res.status(400).json({ error: 'Cédula requerida' });
    }

    const query = `
      SELECT TOP 1
        t.COD_TERC, t.NUM_IDEN, t.NOM_COMP,
        t.NOM_TERC, t.SEG_NOMB, t.APE_TERC, t.SEG_APEL,
        t.COD_ALT, t.DIR_MAIL,
        RTRIM(t.TEL_TERC)  AS TEL_TERC,
        RTRIM(t.TEL_TERC2) AS TEL_TERC2,
        RTRIM(t.DIR_TERC)  AS DIR_TERC,
        t.ACT_HORA         AS t_act_hora,
        td.NOM_TPDOC,
        mn.NOM_MUNI,
        f.COD_FUNCI,
        f.SEX_FUNC, ISNULL(f.CNT_HIJO, 0) AS CNT_HIJO, f.FEC_NAC,
        f.POR_CARGO, f.VAL_HORA,
        f.NUM_CTA,
        RTRIM(f.NOM_SUCUR)  AS NOM_SUCUR,
        f.CUE_GASTO,
        RTRIM(f.JOR_SABAD)  AS JOR_SABAD,
        RTRIM(f.TIP_SALAR)  AS TIP_SALAR,
        RTRIM(f.CUE_PENSIO) AS CUE_PENSIO,
        RTRIM(f.MOD_LIQUID) AS MOD_LIQUID,
        RTRIM(f.EMP_FORAN)  AS EMP_FORAN,
        RTRIM(f.DIR_FORAN)  AS DIR_FORAN,
        RTRIM(f.FEC_INGRES) AS FEC_INGRES,
        RTRIM(f.FEC_RETIRO) AS FEC_RETIRO,
        RTRIM(f.FEC_FINAL)  AS FEC_FINAL,
        RTRIM(f.CAU_RETIRO) AS CAU_RETIRO,
        RTRIM(f.TIP_CONTRA) AS TIP_CONTRA,
        f.NUM_CONTRA,
        RTRIM(f.POR_RETEN)  AS POR_RETEN,
        RTRIM(f.DED_VIVIEN) AS DED_VIVIEN,
        RTRIM(f.DED_SALUD)  AS DED_SALUD,
        RTRIM(f.DED_DEPEN)  AS DED_DEPEN,
        RTRIM(f.PRO_SALUD)  AS PRO_SALUD,
        RTRIM(f.GRA_RIESGO) AS GRA_RIESGO,
        RTRIM(f.DIA_VACAC)  AS DIA_VACAC,
        f.ACT_HORA          AS f_act_hora,
        mc.NOM_CARGO,
        gs.NOM_GRSAN,
        ISNULL(ec.NOM_ESTCIV, 'Sin asignar') AS NOM_ESTCIV,
        bk.NOM_BANCO,
        tc.NOM_TPCTA,
        cc.NOM_CCOST,
        eps_t.NOM_COMP  AS nom_eps,
        afp_t.NOM_COMP  AS nom_afp,
        caja_t.NOM_COMP AS nom_caja,
        mces.NOM_CEST   AS nom_cesan
      FROM GN_TERCE t
      INNER JOIN GN_FUNCI   f      ON f.COD_TERC    = t.COD_TERC   AND f.COD_EMPR = 1
      LEFT  JOIN MAE_TPDOC  td     ON td.COD_TPDOC   = t.COD_TPDOC
      LEFT  JOIN MAE_MUNI   mn     ON mn.COD_MUNI    = t.COD_MPIO
      LEFT  JOIN MAE_CARGO  mc     ON mc.COD_CARGO   = f.COD_CARGO  AND mc.COD_EMPR = 1
      LEFT  JOIN MAE_GRSAN  gs     ON gs.COD_GRSAN   = f.COD_GRSAN
      LEFT  JOIN MAE_ESTCIV ec     ON ec.COD_ESTCIV  = f.COD_ESTCIV
      LEFT  JOIN MAE_BANCO  bk     ON bk.COD_BANCO   = f.COD_BANCO
      LEFT  JOIN MAE_TPCTA  tc     ON tc.COD_TPCTA   = f.COD_TPCTA
      LEFT  JOIN MAE_CCOST  cc     ON cc.COD_CCOST   = f.COD_CCOST  AND cc.COD_EMPR = 1
      LEFT  JOIN MAE_EPS    me     ON me.COD_EPS      = f.COD_EPS    AND me.COD_EMPR = 1
      LEFT  JOIN GN_TERCE   eps_t  ON eps_t.COD_TERC  = me.COD_TERC
      LEFT  JOIN MAE_AFP    ma     ON ma.COD_AFP      = f.COD_AFP    AND ma.COD_EMPR = 1
      LEFT  JOIN GN_TERCE   afp_t  ON afp_t.COD_TERC  = ma.COD_TERC
      LEFT  JOIN MAE_CCF    mccf   ON mccf.COD_CCF    = f.COD_CAJA   AND mccf.COD_EMPR = 1
      LEFT  JOIN GN_TERCE   caja_t  ON caja_t.COD_TERC  = mccf.COD_TERC
      LEFT  JOIN MAE_CEST   mces    ON mces.COD_CEST     = f.COD_CESAN  AND mces.COD_EMPR = 1
      WHERE t.NUM_IDEN = @cedula AND t.COD_EMPR = 1 AND t.ACT_ESTA = 'A'
    `;

    const result = await executeQuery(query, { cedula: parseInt(cedula.trim()) });
    if (!result.recordset || result.recordset.length === 0) {
      return res.status(404).json({ error: 'Empleado no encontrado', cedula });
    }
    console.log(`✓ Detalle empleado cédula ${cedula}: ${result.recordset[0].NOM_COMP}`);
    res.json(result.recordset[0]);
  } catch (err) {
    console.error('❌ obtenerDetalleEmpleado:', err.message);
    res.status(500).json({ error: 'Error al obtener detalle del empleado', details: err.message });
  }
}

// ─── LISTAR EMPLEADOS DE LA BD ───────────────────────────────────────────────
async function listarEmpleados(req, res) {
  try {
    const q = `
      SELECT TOP 300
        t.NUM_IDEN  AS cedula,
        t.NOM_COMP  AS nombre,
        mc.NOM_CARGO AS cargo,
        eps.NOM_COMP AS eps,
        afp.NOM_COMP AS afp,
        f.FEC_INGRES AS fingreso,
        cc.NOM_CCOST AS ccosto,
        f.VAL_HORA   AS valorh,
        t.ACT_ESTA   AS estado
      FROM GN_TERCE t
      INNER JOIN GN_FUNCI   f   ON f.COD_TERC  = t.COD_TERC  AND f.COD_EMPR = 1
      LEFT  JOIN MAE_CARGO  mc  ON mc.COD_CARGO = f.COD_CARGO AND mc.COD_EMPR = 1
      LEFT  JOIN MAE_EPS    me  ON me.COD_EPS   = f.COD_EPS  AND me.COD_EMPR = 1
      LEFT  JOIN GN_TERCE   eps ON eps.COD_TERC  = me.COD_TERC
      LEFT  JOIN MAE_AFP    ma  ON ma.COD_AFP   = f.COD_AFP  AND ma.COD_EMPR = 1
      LEFT  JOIN GN_TERCE   afp ON afp.COD_TERC  = ma.COD_TERC
      LEFT  JOIN MAE_CCOST  cc  ON cc.COD_CCOST = f.COD_CCOST AND cc.COD_EMPR = 1
      WHERE t.COD_EMPR = 1 AND t.ACT_ESTA = 'A' AND f.ACT_ESTA = 'A'
      ORDER BY t.NOM_COMP ASC
    `;
    const r = await executeQuery(q, {});
    res.json(r.recordset || []);
  } catch (err) {
    console.error('❌ listarEmpleados:', err.message);
    res.status(500).json({ error: 'Error al listar empleados', details: err.message });
  }
}

module.exports = {
  buscarCedulasConCoincidencia,
  obtenerEmpleadoPorCedula,
  obtenerConceptosOcasionales,
  obtenerCatalogos,
  crearEmpleado,
  listarEmpleados,
  obtenerDetalleEmpleado,
};
