// ============================================================================
//  controllers/importarExcelController.js
//  Importación masiva de novedades ocasionales desde Excel (Formato Exploración).
//
//  Hoja esperada: 'Reporte Final ' (con o sin espacio)
//  Estructura (fila 4 = encabezados, fila 5+ = datos):
//    Col B: CEDULA
//    Col C: NOMBRE EL COLABORADOR
//    Col D: CARGO
//    Col E: CENTRO COSTO
//    Col F: cant HORA EXTRA DIURNA 1,25          → COD_CONC = 10
//    Col G: cant HORA EXTRA NOCTURNA 1,75        → COD_CONC = 11
//    Col H: cant HORA FESTIVA 1,75               → COD_CONC = 7
//    Col I: cant RECARGO NOCTURNO 0,35           → COD_CONC = 14
//    Col J: cant RECARGO NOCTURNO FESTIVO 2,10   → COD_CONC = 15
//    Col K: cant HORA EXTRA DIURNA FESTIVA 2,0   → COD_CONC = 8
//    Col L: cant HORA EXTRA NOCTURNA FESTIVA 2,5 → COD_CONC = 9
//    Col M: cant DOMINICAL COMPENSADO 0,75       → COD_CONC = 16
//    Col N: cant DOMINICAL NO COMPENSADO 1,75    → COD_CONC = 7 (suma con col H)
//
//  Manejo de fórmulas sin caché (type=6, result=undefined):
//    Cuando una celda contiene una fórmula sin valor cacheado, se resuelve
//    siguiendo la referencia a la hoja fuente ('Reporte día a día ') dentro
//    del mismo workbook, leyendo el valor allí cacheado.
// ============================================================================

const { executeQuery, getConnection } = require('../config/database');
const sql = require('mssql');
const multer = require('multer');
const ExcelJS = require('exceljs');
const { Readable } = require('stream');

const DEFAULT_COD_EMPR = 1;

// ─── Multer: almacenamiento en memoria ───────────────────────────────────────
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 52_428_800 },
  fileFilter: (req, file, cb) => {
    if (/\.(xlsx|xls)$/i.test(file.originalname) ||
        file.mimetype.includes('spreadsheet') ||
        file.mimetype.includes('excel') ||
        file.mimetype.includes('openxmlformats')) {
      cb(null, true);
    } else {
      cb(new Error('Solo se aceptan archivos .xlsx'));
    }
  }
}).single('archivo');

// ─── Mapeo columna Excel (1-based) → COD_CONC ────────────────────────────────
const COLUMNAS_NOVEDAD = [
  { col: 6,  codConc: 10, label: 'Hora Extra Diurna 125%' },
  { col: 7,  codConc: 11, label: 'Hora Extra Nocturna 175%' },
  { col: 8,  codConc: 7,  label: 'Hora Festiva 175% (col H)' },
  { col: 9,  codConc: 14, label: 'Recargo Nocturno 35%' },
  { col: 10, codConc: 15, label: 'Recargo Nocturno Festivo 210%' },
  { col: 11, codConc: 8,  label: 'Hora Extra Diurna Festiva 200%' },
  { col: 12, codConc: 9,  label: 'Hora Extra Nocturna Festiva 250%' },
  { col: 13, codConc: 16, label: 'Recargo Dominical Compensado 0.75%' },
  { col: 14, codConc: 7,  label: 'Hora Dominical No Compensado 175% (col N)' },
];

// ─── ExcelJS type constants ───────────────────────────────────────────────────
const CELL_TYPE_FORMULA = 6; // ExcelJS: tipo fórmula

// ─── Resolver valor de celda (con soporte completo de fórmulas cacheadas) ────
//
// ExcelJS representa celdas con fórmula así:
//   type=6, value = { formula: "...", result: <valor_cacheado> }
//              o  = { formula: "..." }         ← sin caché (result undefined)
//              o  = { sharedFormula: "..." }   ← fórmula compartida sin caché
//
// Cuando result está disponible → se usa directamente.
// Cuando NO está disponible → se intenta resolver la referencia a otra hoja
// dentro del mismo workbook parseando la fórmula tipo: ='Hoja'!XY123
//
function getCellValue(cell, workbook) {
  const val = cell.value;

  // Nulo / vacío
  if (val === null || val === undefined) return null;

  // Valor simple (número, string, boolean, Date)
  if (typeof val !== 'object') return val;

  // Objeto fecha de ExcelJS
  if (val instanceof Date) return val;

  // Rich text: { richText: [...] }
  if (Array.isArray(val.richText)) {
    return val.richText.map(rt => rt.text || '').join('').trim();
  }

  // Fórmula con result cacheado
  if ('result' in val && val.result !== undefined && val.result !== null) {
    return val.result;
  }

  // Fórmula sin caché → intentar seguir la referencia a otra hoja
  const formula = val.formula || val.sharedFormula || '';
  if (formula) {
    const resolved = resolveFormulaRef(formula, cell.row, workbook);
    if (resolved !== null && resolved !== undefined) return resolved;
  }

  return null;
}

// ─── Resolver referencia de fórmula tipo ='Hoja'!ColFila o =Hoja!ColFila ────
//
// Soporta:
//   ='Reporte día a día '!QS5
//   ='Reporte día a día '!B5
//   =Hoja1!A1
//
// Para fórmulas de suma (+AG5+AS5+…) sin caché → devuelve null (no resolvible
// sin motor de cálculo), el campo quedará como 0.
//
function resolveFormulaRef(formula, rowHint, workbook) {
  // Patrón: referencia simple a otra hoja (con o sin comillas)
  const matchSingle = formula.match(/^=?'?([^'!]+)'?!([A-Z]+)(\d+)$/);
  if (matchSingle) {
    const sheetName = matchSingle[1].trim();
    const colStr    = matchSingle[2];
    const rowNum    = parseInt(matchSingle[3], 10);
    return readCellFromSheet(workbook, sheetName, colStr, rowNum);
  }

  // Patrón sin prefijo = (solo referencia directa): 'Hoja'!XY123
  const matchNaked = formula.match(/^'?([^'!]+)'?!([A-Z]+)(\d+)$/);
  if (matchNaked) {
    const sheetName = matchNaked[1].trim();
    const colStr    = matchNaked[2];
    const rowNum    = parseInt(matchNaked[3], 10);
    return readCellFromSheet(workbook, sheetName, colStr, rowNum);
  }

  return null; // fórmula compleja (suma, etc.) → no resolvible
}

// ─── Leer celda en hoja por nombre+col letra+fila ────────────────────────────
function readCellFromSheet(workbook, sheetName, colStr, rowNum) {
  // Buscar hoja por nombre (tolerando espacios al final)
  let ws = null;
  workbook.eachSheet(s => {
    if (!ws && s.name.trim() === sheetName.trim()) ws = s;
  });
  if (!ws) return null;

  const colNum = colLetterToNumber(colStr);
  const cell = ws.getRow(rowNum).getCell(colNum);
  const val = cell.value;

  if (val === null || val === undefined) return null;
  if (typeof val !== 'object') return val;
  if (val instanceof Date) return val;
  if ('result' in val && val.result !== undefined) return val.result;

  return null; // hoja fuente también tiene fórmula sin caché → no resolvible
}

// ─── Convertir letra(s) de columna a número (A=1, Z=26, AA=27, QS=461) ──────
function colLetterToNumber(col) {
  let n = 0;
  for (let i = 0; i < col.length; i++) {
    n = n * 26 + (col.charCodeAt(i) - 64);
  }
  return n;
}

// ─── Extraer valor numérico seguro de celda ───────────────────────────────────
function getCellNum(cell, workbook) {
  const v = getCellValue(cell, workbook);
  if (v === null || v === undefined || v === '') return 0;
  const n = Number(v);
  return isNaN(n) ? 0 : n;
}

// ─── Extraer valor string seguro de celda ─────────────────────────────────────
function getCellStr(cell, workbook) {
  const v = getCellValue(cell, workbook);
  if (v === null || v === undefined) return '';
  return String(v).replace(/\u00A0/g, ' ').trim();
}

// ─── Queries de base de datos ─────────────────────────────────────────────────
async function resolverPeriodoActual(codEmpr) {
  const r = await executeQuery(`
    SELECT TOP 1 COD_PERIOD, PER_ANO, PER_MES, PER_QNA, PER_FINI, PER_FFIN
    FROM dbo.NO_PERIOD
    WHERE COD_EMPR = @codEmpr
      AND PER_EST  = 'A'
      AND ACT_ESTA = 'A'
      AND CONVERT(date, GETDATE()) BETWEEN PER_FINI AND PER_FFIN
    ORDER BY PER_FINI DESC
  `, { codEmpr });
  return r.recordset && r.recordset[0] ? r.recordset[0] : null;
}

async function resolverCodFunciPorCedula(cedula, codEmpr) {
  const r = await executeQuery(`
    SELECT TOP 1 f.COD_FUNCI
    FROM dbo.GN_FUNCI f
    INNER JOIN dbo.GN_TERCE t ON t.COD_TERC = f.COD_TERC
    WHERE f.COD_EMPR  = @codEmpr
      AND t.NUM_IDEN  = CAST(@cedula AS BIGINT)
      AND t.ACT_ESTA  = 'A'
      AND f.ACT_ESTA  = 'A'
  `, { codEmpr, cedula: String(cedula).trim() });
  return r.recordset && r.recordset[0] ? r.recordset[0].COD_FUNCI : null;
}

async function resolverCodCcost(nomCcost, codEmpr) {
  if (!nomCcost) return null;
  const r = await executeQuery(`
    SELECT TOP 1 COD_CCOST FROM dbo.MAE_CCOST
    WHERE COD_EMPR = @codEmpr AND NOM_CCOST = @nom AND ACT_ESTA = 'A'
  `, { codEmpr, nom: nomCcost });
  return r.recordset && r.recordset[0] ? r.recordset[0].COD_CCOST : null;
}

async function buscarNovedadExistente(codEmpr, codFunci, codConc, codPeriod) {
  const r = await executeQuery(`
    SELECT TOP 1 n.COD_NOVED, o.CANTIDAD
    FROM dbo.NO_NOVED n
    INNER JOIN dbo.NO_OCASI o ON o.COD_EMPR = n.COD_EMPR AND o.COD_NOVED = n.COD_NOVED
    WHERE n.COD_EMPR   = @codEmpr
      AND n.COD_FUNCI  = @codFunci
      AND n.COD_CONC   = @codConc
      AND n.COD_PERIOD = @codPeriod
      AND n.ACT_ESTA   = 'A'
      AND o.ACT_ESTA   = 'A'
  `, { codEmpr, codFunci, codConc, codPeriod });
  return r.recordset && r.recordset[0] ? r.recordset[0] : null;
}

// ─── Endpoint: POST /api/ocasionales/importar-excel ──────────────────────────
async function importarDesdeExcel(req, res) {
  upload(req, res, async (uploadErr) => {
    if (uploadErr) return res.status(400).json({ error: uploadErr.message });
    if (!req.file)  return res.status(400).json({ error: 'No se adjuntó ningún archivo.' });

    const codEmpr = DEFAULT_COD_EMPR;
    const usuario = (req.body && req.body.usuario) || req.headers['x-usuario'] || 'MineDax';

    const resumen = {
      archivo: req.file.originalname,
      totalFilas: 0,
      procesados: 0,
      insertados: 0,
      acumulados: 0,
      omitidos: 0,
      errores: [],
      detalle: [],
    };

    try {
      // 1. Leer workbook completo (necesitamos acceso a todas las hojas para
      //    resolver referencias de fórmulas sin caché)
      const workbook = new ExcelJS.Workbook();
      await workbook.xlsx.read(Readable.from(req.file.buffer));

      // 2. Detectar hoja 'Reporte Final'
      let ws = null;
      workbook.eachSheet(sheet => {
        if (!ws && sheet.name.trim() === 'Reporte Final') ws = sheet;
      });
      if (!ws) {
        const names = workbook.worksheets.map(s => `"${s.name}"`).join(', ');
        return res.status(422).json({
          error: `No se encontró la hoja "Reporte Final". Hojas disponibles: ${names}.`
        });
      }

      // 3. Validar encabezado fila 4 col B
      const hdrB = getCellStr(ws.getRow(4).getCell(2), workbook);
      if (!hdrB.toUpperCase().includes('CEDULA')) {
        return res.status(422).json({
          error: `La fila 4 columna B no contiene "CEDULA" (encontrado: "${hdrB}"). Verifica el formato.`
        });
      }

      // 4. Período activo
      const periodo = await resolverPeriodoActual(codEmpr);
      if (!periodo) {
        return res.status(409).json({
          error: 'No hay período activo en NO_PERIOD para la fecha actual.'
        });
      }

      // 5. Leer y agrupar novedades por empleado
      const agrupado = new Map(); // cedula (string) → { ...datos, novedades: Map<codConc, cant> }

      ws.eachRow((row, rowNumber) => {
        if (rowNumber < 5) return;

        const cedulaRaw = getCellStr(row.getCell(2), workbook);
        if (!cedulaRaw || cedulaRaw === '0') return;

        // Validar que la cédula sea numérica
        if (!/^\d+$/.test(cedulaRaw)) return;

        resumen.totalFilas++;

        if (!agrupado.has(cedulaRaw)) {
          agrupado.set(cedulaRaw, {
            cedula:         cedulaRaw,
            nombre:         getCellStr(row.getCell(3), workbook),
            cargo:          getCellStr(row.getCell(4), workbook),
            centroCostoNom: getCellStr(row.getCell(5), workbook),
            novedades:      new Map(),
          });
        }

        const emp = agrupado.get(cedulaRaw);
        for (const colDef of COLUMNAS_NOVEDAD) {
          const cant = getCellNum(row.getCell(colDef.col), workbook);
          if (cant > 0) {
            const prev = emp.novedades.get(colDef.codConc) || 0;
            emp.novedades.set(colDef.codConc, prev + cant);
          }
        }
      });

      // 6. Insertar / acumular en BD
      const pool = await getConnection();

      for (const [cedula, emp] of agrupado) {
        if (emp.novedades.size === 0) {
          resumen.omitidos++;
          continue;
        }

        // Resolver COD_FUNCI
        let codFunci;
        try {
          codFunci = await resolverCodFunciPorCedula(cedula, codEmpr);
        } catch (e) {
          const msg = `Error buscando funcionario: ${e.message}`;
          resumen.errores.push({ cedula, error: msg });
          resumen.detalle.push({ cedula, nombre: emp.nombre, estado: 'ERROR', mensaje: msg });
          continue;
        }
        if (!codFunci) {
          const msg = 'Cédula no encontrada en la base de datos.';
          resumen.errores.push({ cedula, error: msg });
          resumen.detalle.push({ cedula, nombre: emp.nombre, estado: 'ERROR', mensaje: msg });
          continue;
        }

        // Resolver COD_CCOST (no crítico)
        let codCcost = null;
        try { codCcost = await resolverCodCcost(emp.centroCostoNom, codEmpr); } catch (_) {}

        resumen.procesados++;

        for (const [codConc, cantidad] of emp.novedades) {
          let transaction;
          try {
            const existente = await buscarNovedadExistente(codEmpr, codFunci, codConc, periodo.COD_PERIOD);
            transaction = new sql.Transaction(pool);
            await transaction.begin();

            if (existente) {
              // Acumular
              const nuevaCant = (Number(existente.CANTIDAD) || 0) + cantidad;
              const r = new sql.Request(transaction);
              r.input('codEmpr',  sql.SmallInt,      codEmpr);
              r.input('codNoved', sql.Int,           existente.COD_NOVED);
              r.input('cantidad', sql.Decimal(18, 4), nuevaCant);
              r.input('actUsua',  sql.NVarChar(50),  usuario);
              await r.query(`
                UPDATE dbo.NO_OCASI
                SET CANTIDAD = @cantidad, ACT_USUA = @actUsua, ACT_HORA = SYSDATETIME()
                WHERE COD_EMPR = @codEmpr AND COD_NOVED = @codNoved AND ACT_ESTA = 'A'
              `);
              await transaction.commit();
              resumen.acumulados++;
              resumen.detalle.push({
                cedula, nombre: emp.nombre, codConc, cantidad,
                estado: 'ACUMULADO',
                mensaje: `Cantidad acumulada (total: ${nuevaCant.toFixed(2)}) en NO_NOVED #${existente.COD_NOVED}.`
              });
            } else {
              // Insertar
              const rN = new sql.Request(transaction);
              rN.input('codEmpr',   sql.SmallInt,      codEmpr);
              rN.input('codFunci',  sql.Int,           codFunci);
              rN.input('codConc',   sql.Int,           codConc);
              rN.input('codPeriod', sql.Int,           periodo.COD_PERIOD);
              rN.input('obs',       sql.NVarChar(500), `Importado Excel: ${emp.nombre}`);
              rN.input('actUsua',   sql.NVarChar(50),  usuario);
              rN.input('codCcost',  sql.Int,           codCcost);

              const nr = await rN.query(`
                INSERT INTO dbo.NO_NOVED
                  (COD_EMPR, COD_FUNCI, COD_CONC, COD_PERIOD,
                   FEC_REGI, OBS_NOVED, IND_APLICADO, ACT_USUA, ACT_HORA, ACT_ESTA, COD_CCOST)
                VALUES
                  (@codEmpr, @codFunci, @codConc, @codPeriod,
                   CONVERT(date,GETDATE()), @obs, 'N', @actUsua, GETDATE(), 'A', @codCcost);
                SELECT CAST(SCOPE_IDENTITY() AS INT) AS COD_NOVED;
              `);

              if (!nr.recordset || nr.recordset[0].COD_NOVED == null)
                throw new Error('SCOPE_IDENTITY() nulo al insertar en NO_NOVED.');
              const codNoved = nr.recordset[0].COD_NOVED;

              const rO = new sql.Request(transaction);
              rO.input('codEmpr',  sql.SmallInt,      codEmpr);
              rO.input('codNoved', sql.Int,           codNoved);
              rO.input('cantidad', sql.Decimal(18, 4), cantidad);
              rO.input('valor',    sql.Decimal(18, 2), 0);
              rO.input('actUsua',  sql.NVarChar(50),  usuario);
              await rO.query(`
                INSERT INTO dbo.NO_OCASI
                  (COD_EMPR, COD_NOVED, CANTIDAD, VALOR, ACT_USUA, ACT_HORA, ACT_ESTA)
                VALUES
                  (@codEmpr, @codNoved, @cantidad, @valor, @actUsua, SYSDATETIME(), 'A')
              `);

              await transaction.commit();
              resumen.insertados++;
              resumen.detalle.push({
                cedula, nombre: emp.nombre, codConc, cantidad,
                estado: 'INSERTADO',
                mensaje: `Novedad registrada. NO_NOVED #${codNoved}, Período ${periodo.COD_PERIOD}.`
              });
            }
          } catch (err) {
            if (transaction) { try { await transaction.rollback(); } catch (_) {} }
            const msg = err.message;
            resumen.errores.push({ cedula, codConc, error: msg });
            resumen.detalle.push({ cedula, nombre: emp.nombre, codConc, cantidad, estado: 'ERROR', mensaje: msg });
          }
        }
      }

      // 7. Respuesta
      const hayErrores = resumen.errores.length > 0;
      return res.status(hayErrores ? 207 : 200).json({
        success: !hayErrores,
        periodo: {
          codPeriod: periodo.COD_PERIOD,
          etiqueta: `${periodo.PER_ANO}-${String(periodo.PER_MES).padStart(2,'0')}-Q${periodo.PER_QNA}`,
          inicio: periodo.PER_FINI,
          fin:    periodo.PER_FFIN,
        },
        resumen: {
          archivo:    resumen.archivo,
          totalFilas: resumen.totalFilas,
          procesados: resumen.procesados,
          insertados: resumen.insertados,
          acumulados: resumen.acumulados,
          omitidos:   resumen.omitidos,
          conErrores: resumen.errores.length,
        },
        detalle: resumen.detalle,
        errores: resumen.errores,
      });

    } catch (err) {
      console.error('[importarExcel] Error general:', err);
      return res.status(500).json({ error: 'Error procesando el archivo', details: err.message });
    }
  });
}

module.exports = { importarDesdeExcel };
