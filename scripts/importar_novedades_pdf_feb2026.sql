-- ============================================================================
--  IMPORTACIÓN MANUAL DE NOVEDADES PDF  —  Período Febrero 2026
--  Generado automáticamente por MineDax PDF Importer
--
--  PERMISO    Laura Velasquez Izquierdo  CC 1058228240  14-02-2026
--  VACACIONES Vairon Camilo Aricapa      CC 1053842239  11-02 al 23-02-2026
--
--  Ejecutar en: MineDax (CM-ITD-P-05\SQLEXPRESS)
--  Verificar duplicados antes de ejecutar (bloque VERIFICACIÓN)
-- ============================================================================

USE MineDax;
GO

-- ─── VERIFICACIÓN PREVIA (ejecutar primero, revisar que devuelva 0 filas) ────

SELECT 'PERMISO_DUPLICADO' as tipo, COD_NOVED, ACT_ESTA
FROM dbo.NO_NOVED
WHERE COD_EMPR = 1 AND COD_FUNCI = 35 AND COD_CONC = 68
  AND FEC_INI = '2026-02-14' AND FEC_FIN = '2026-02-14'

UNION ALL

SELECT 'VACACIONES_DUPLICADO', COD_NOVED, ACT_ESTA
FROM dbo.NO_NOVED
WHERE COD_EMPR = 1 AND COD_FUNCI = 24 AND COD_CONC = 63
  AND FEC_INI = '2026-02-11' AND FEC_FIN = '2026-02-23';
GO

-- ─── INSERCIÓN (ejecutar solo si VERIFICACIÓN devolvió 0 filas) ──────────────

BEGIN TRANSACTION;

-- NOTA: COD_NOVED en NO_NOVED es columna IDENTITY — NO se especifica el valor,
--       SQL Server lo genera automáticamente.

-- IMPORTANTE: Se usa COD_PERIOD=7 (Abril 2026 Q2, PER_EST='A') aunque la novedad
-- sea de febrero. Esto es obligatorio porque el trigger TR_NO_NOVED_PERIODO_CERRADO
-- rechaza INSERTs en períodos con PER_EST <> 'A'. Los períodos de febrero (1,2)
-- ya están cerrados (PER_EST='I'). Esta es la misma regla del módulo manual.

-- 1. Permiso Remunerado — Laura Velasquez Izquierdo
--    COD_FUNCI=35, COD_CONC=68 (Permiso Remunerado), COD_PERIOD=7 (período activo actual)
INSERT INTO dbo.NO_NOVED (
    COD_EMPR, COD_FUNCI, COD_CONC, COD_PERIOD,
    FEC_REGI,   OBS_NOVED,                     IND_APLICADO,
    ACT_USUA,   ACT_HORA,                      ACT_ESTA,
    FEC_INI,    FEC_FIN
) VALUES (
    1, 35, 68, 7,
    CONVERT(date, GETDATE()),
    N'ESTUDIO | 8:00 Am-12:00 Am | Se le da tramite autorizado por tener horas compensadas y asistir a clases en la Universidad Autonoma de Manizales',
    'N',
    'PDF_IMP', GETDATE(), 'A',
    '2026-02-14', '2026-02-14'
);
DECLARE @cod_permiso INT = SCOPE_IDENTITY();
PRINT 'Permiso insertado COD_NOVED = ' + CAST(@cod_permiso AS VARCHAR);

-- 2. Vacaciones Disfrutadas — Vairon Camilo Aricapa Trejos
--    COD_FUNCI=24, COD_CONC=63 (Vacaciones Disfrutadas), COD_PERIOD=7 (período activo actual)
INSERT INTO dbo.NO_NOVED (
    COD_EMPR, COD_FUNCI, COD_CONC, COD_PERIOD,
    FEC_REGI,   OBS_NOVED,                     IND_APLICADO,
    ACT_USUA,   ACT_HORA,                      ACT_ESTA,
    FEC_INI,    FEC_FIN
) VALUES (
    1, 24, 63, 7,
    CONVERT(date, GETDATE()),
    N'Vacaciones disfrutadas 2026-02-11 al 2026-02-23 (9 dias laborables)',
    'N',
    'PDF_IMP', GETDATE(), 'A',
    '2026-02-11', '2026-02-23'
);
DECLARE @cod_vacaciones INT = SCOPE_IDENTITY();
PRINT 'Vacaciones insertadas COD_NOVED = ' + CAST(@cod_vacaciones AS VARCHAR);

-- 3. Detalle ausentismo en NO_AUSEN (vinculado al COD_NOVED recién generado)
--    NO_AUSEN.COD_NOVED NO es identity — se inserta el valor obtenido arriba.
INSERT INTO dbo.NO_AUSEN (
    COD_EMPR, COD_NOVED,
    FEC_INI,       FEC_FIN,       DIAS_TOTAL,
    DIAGNOSTICO,
    ACT_USUA,  ACT_HORA,      ACT_ESTA
) VALUES (
    1, @cod_vacaciones,
    '2026-02-11', '2026-02-23', 9,
    N'Vacaciones disfrutadas PDF',
    'PDF_IMP', SYSDATETIME(), 'A'
);

COMMIT TRANSACTION;
GO

-- ─── VERIFICACIÓN POST-INSERCIÓN ─────────────────────────────────────────────

SELECT
    n.COD_NOVED,
    n.COD_FUNCI,
    t.NOM_COMP      AS EMPLEADO,
    t.NUM_IDEN      AS CEDULA,
    c.NOM_CONC      AS CONCEPTO,
    n.FEC_INI,
    n.FEC_FIN,
    n.OBS_NOVED,
    n.ACT_ESTA,
    a.DIAS_TOTAL    AS DIAS_AUSENTISMO
FROM dbo.NO_NOVED n
INNER JOIN dbo.GN_FUNCI  f ON f.COD_FUNCI = n.COD_FUNCI AND f.COD_EMPR = n.COD_EMPR
INNER JOIN dbo.GN_TERCE  t ON t.COD_TERC  = f.COD_TERC
INNER JOIN dbo.NO_CONCE  c ON c.COD_CONC  = n.COD_CONC  AND c.COD_EMPR = n.COD_EMPR
LEFT  JOIN dbo.NO_AUSEN  a ON a.COD_NOVED = n.COD_NOVED AND a.COD_EMPR = n.COD_EMPR
WHERE n.COD_NOVED IN (@cod_permiso, @cod_vacaciones)
  AND n.COD_EMPR = 1;
GO
