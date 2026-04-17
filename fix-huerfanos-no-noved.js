/**
 * fix-huerfanos-no-noved.js
 *
 * Anula (ACT_ESTA='I') los registros en NO_NOVED que no tienen contraparte
 * en NO_FIJAS, NO_AUSEN ni NO_CAMBI — son residuos de inserts que fallaron
 * antes del rollback cuando ensureDbObjects() lanzaba excepción.
 *
 * Uso:  node fix-huerfanos-no-noved.js
 */

require('dotenv').config();
const sql = require('mssql');

async function main() {
  const cfg = {
    server: process.env.SERVER,
    database: process.env.DATABASE,
    authentication: {
      type: 'default',
      options: { userName: process.env.UID, password: process.env.PWD }
    },
    options: {
      encrypt: false,
      trustServerCertificate: true,
      connectionTimeout: 15000,
      requestTimeout: 30000
    }
  };

  const pool = new sql.ConnectionPool(cfg);
  await pool.connect();
  console.log(`[fix-huerfanos] Conectado a ${cfg.server}/${cfg.database}`);

  // 1. Mostrar los huérfanos antes de actuar
  const check = await pool.request().query(`
    SELECT n.COD_EMPR, n.COD_NOVED, n.COD_FUNCI, n.COD_CONC, n.COD_PERIOD,
           n.FEC_REGI, n.ACT_ESTA
    FROM dbo.NO_NOVED n
    WHERE n.ACT_ESTA = 'A'
      AND NOT EXISTS (SELECT 1 FROM dbo.NO_FIJAS f WHERE f.COD_EMPR = n.COD_EMPR AND f.COD_NOVED = n.COD_NOVED)
      AND NOT EXISTS (SELECT 1 FROM dbo.NO_AUSEN a WHERE a.COD_EMPR = n.COD_EMPR AND a.COD_NOVED = n.COD_NOVED)
      AND NOT EXISTS (SELECT 1 FROM dbo.NO_CAMBI c WHERE c.COD_EMPR = n.COD_EMPR AND c.COD_NOVED = n.COD_NOVED)
  `);

  if (check.recordset.length === 0) {
    console.log('[fix-huerfanos] ✓ No hay registros huérfanos. Nada que limpiar.');
    await pool.close();
    return;
  }

  console.log(`[fix-huerfanos] Encontrados ${check.recordset.length} registro(s) huérfano(s):`);
  check.recordset.forEach(r =>
    console.log(`  COD_NOVED=${r.COD_NOVED}  COD_FUNCI=${r.COD_FUNCI}  COD_CONC=${r.COD_CONC}  FEC_REGI=${r.FEC_REGI}`)
  );

  // 2. Anular (soft-delete) los huérfanos
  const result = await pool.request().query(`
    UPDATE dbo.NO_NOVED
    SET ACT_ESTA = 'I',
        ACT_USUA = 'fix-huerfanos',
        ACT_HORA = GETDATE()
    WHERE ACT_ESTA = 'A'
      AND NOT EXISTS (SELECT 1 FROM dbo.NO_FIJAS f WHERE f.COD_EMPR = dbo.NO_NOVED.COD_EMPR AND f.COD_NOVED = dbo.NO_NOVED.COD_NOVED)
      AND NOT EXISTS (SELECT 1 FROM dbo.NO_AUSEN a WHERE a.COD_EMPR = dbo.NO_NOVED.COD_EMPR AND a.COD_NOVED = dbo.NO_NOVED.COD_NOVED)
      AND NOT EXISTS (SELECT 1 FROM dbo.NO_CAMBI c WHERE c.COD_EMPR = dbo.NO_NOVED.COD_EMPR AND c.COD_NOVED = dbo.NO_NOVED.COD_NOVED)
  `);

  console.log(`[fix-huerfanos] ✓ ${result.rowsAffected[0]} registro(s) anulado(s) correctamente.`);

  await pool.close();
  console.log('[fix-huerfanos] Listo.');
}

main().catch(err => {
  console.error('[fix-huerfanos] ERROR:', err.message);
  process.exit(1);
});
