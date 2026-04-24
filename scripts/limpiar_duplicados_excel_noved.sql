-- ============================================================================
--  LIMPIEZA DE REGISTROS DUPLICADOS EN NO_NOVED  —  Origen: importaciones Excel
--
--  CONTEXTO:
--    El módulo de importación Excel fue ejecutado dos veces para el mismo lote
--    de novedades ocasionales/fijas (conceptos 7, 10, 20, 52, etc.), generando
--    211 grupos de duplicados. TODOS tienen FEC_INI=NULL y FEC_FIN=NULL.
--    Los registros más antiguos (primer import) tienen ACT_USUA='MineDax'.
--    Los duplicados más recientes (segundo import) tienen ACT_USUA='CaPaJuEs'.
--
--    NINGUNO de estos duplicados es de origen PDF (PDF_IMP).
--    El registro de Laura (COD_NOVED=2640, ACT_USUA='PDF_IMP') NO se toca.
--
--  ESTRATEGIA:
--    Para cada grupo duplicado (mismo COD_EMPR+COD_FUNCI+COD_CONC+FEC_INI+FEC_FIN):
--      - Se conserva el registro con el COD_NOVED más antiguo (PRIMER_NOVED)
--      - Se desactiva (ACT_ESTA='I') el registro más reciente (ULTIMO_NOVED)
--
--  EJECUTAR EN: MineDax (CM-ITD-P-05\SQLEXPRESS)
--  PREREQUISITO: Ejecutar bloque VERIFICACIÓN primero.
--  NOTA: Solo afecta registros con FEC_INI IS NULL y FEC_FIN IS NULL.
-- ============================================================================

USE MineDax;
GO

-- ─── VERIFICACIÓN PREVIA ────────────────────────────────────────────────────
-- Ejecutar esto primero y revisar el conteo antes de proceder.

SELECT
    COUNT(*) AS GRUPOS_DUPLICADOS,
    SUM(CANT - 1) AS REGISTROS_A_DESACTIVAR
FROM (
    SELECT COUNT(*) AS CANT
    FROM dbo.NO_NOVED
    WHERE COD_EMPR = 1
      AND FEC_INI IS NULL
      AND FEC_FIN IS NULL
      AND ACT_USUA <> 'PDF_IMP'
    GROUP BY COD_EMPR, COD_FUNCI, COD_CONC, FEC_INI, FEC_FIN
    HAVING COUNT(*) > 1
) sub;
GO

-- Resultado esperado: GRUPOS_DUPLICADOS=211, REGISTROS_A_DESACTIVAR=211

-- ─── LISTADO DETALLADO DE LO QUE SE DESACTIVARÁ ─────────────────────────────
-- (Opcional — para revisar antes de ejecutar la limpieza)

SELECT
    n.COD_NOVED       AS COD_NOVED_A_DESACTIVAR,
    n.COD_FUNCI,
    n.COD_CONC,
    n.ACT_USUA,
    n.ACT_HORA,
    n.ACT_ESTA,
    t.NOM_COMP        AS EMPLEADO
FROM dbo.NO_NOVED n
INNER JOIN dbo.GN_FUNCI f ON f.COD_FUNCI = n.COD_FUNCI AND f.COD_EMPR = n.COD_EMPR
INNER JOIN dbo.GN_TERCE t ON t.COD_TERC  = f.COD_TERC
WHERE n.COD_EMPR = 1
  AND n.FEC_INI IS NULL
  AND n.FEC_FIN IS NULL
  AND n.ACT_USUA <> 'PDF_IMP'
  AND n.COD_NOVED IN (
      SELECT MAX(COD_NOVED)
      FROM dbo.NO_NOVED
      WHERE COD_EMPR = 1
        AND FEC_INI IS NULL
        AND FEC_FIN IS NULL
        AND ACT_USUA <> 'PDF_IMP'
      GROUP BY COD_EMPR, COD_FUNCI, COD_CONC, FEC_INI, FEC_FIN
      HAVING COUNT(*) > 1
  )
ORDER BY n.COD_NOVED DESC;
GO

-- ─── LIMPIEZA: DESACTIVAR EL DUPLICADO MÁS RECIENTE DE CADA GRUPO ───────────
-- IMPORTANTE: Desactiva (ACT_ESTA='I'), NO elimina. Los datos quedan intactos.
-- Solo afecta registros con FEC_INI IS NULL — jamás toca los registros PDF.

BEGIN TRANSACTION;

UPDATE dbo.NO_NOVED
SET
    ACT_ESTA = 'I',
    ACT_USUA = 'CLEANUP',
    ACT_HORA = GETDATE()
WHERE COD_EMPR = 1
  AND FEC_INI IS NULL
  AND FEC_FIN IS NULL
  AND ACT_USUA <> 'PDF_IMP'
  AND COD_NOVED IN (
      SELECT MAX(COD_NOVED)
      FROM dbo.NO_NOVED
      WHERE COD_EMPR = 1
        AND FEC_INI IS NULL
        AND FEC_FIN IS NULL
        AND ACT_USUA <> 'PDF_IMP'
      GROUP BY COD_EMPR, COD_FUNCI, COD_CONC, FEC_INI, FEC_FIN
      HAVING COUNT(*) > 1
  );

PRINT 'Registros desactivados: ' + CAST(@@ROWCOUNT AS VARCHAR);

COMMIT TRANSACTION;
GO

-- ─── VERIFICACIÓN POST-LIMPIEZA ──────────────────────────────────────────────

SELECT
    COUNT(*) AS GRUPOS_DUPLICADOS_RESTANTES
FROM (
    SELECT COUNT(*) AS CANT
    FROM dbo.NO_NOVED
    WHERE COD_EMPR = 1
      AND FEC_INI IS NULL
      AND FEC_FIN IS NULL
      AND ACT_ESTA = 'A'
    GROUP BY COD_EMPR, COD_FUNCI, COD_CONC, FEC_INI, FEC_FIN
    HAVING COUNT(*) > 1
) sub;
GO
-- Resultado esperado: 0

-- Confirmar que Laura (PDF) sigue intacta
SELECT COD_NOVED, COD_FUNCI, COD_CONC, FEC_INI, FEC_FIN, ACT_ESTA, ACT_USUA
FROM dbo.NO_NOVED
WHERE COD_EMPR = 1 AND ACT_USUA = 'PDF_IMP';
GO
-- Resultado esperado: COD_NOVED=2640, ACT_ESTA='A'
