-- ============================================================================
--  poblar_MAE_EPS_CCF.sql
--  Pobla MAE_EPS y MAE_CCF referenciando los GN_TERCE ya existentes.
--
--  Contexto:
--    • GN_TERCE ya tiene los terceros de tipo entidad (EPS / CCF).
--    • MAE_EPS y MAE_CCF estaban vacías (solo existía el registro COD=0 "Sin asignar").
--    • Este script las rellena para que la importación de empleados pueda
--      resolver las FKs COD_EPS y COD_CCF en GN_FUNCI.
--
--  Ejecutar UNA sola vez contra MineDax.
--  Es seguro re-ejecutar: usa INSERT ... WHERE NOT EXISTS para evitar duplicados.
-- ============================================================================

USE MineDax;
GO

-- ============================================================================
--  1. MAE_EPS  (COD_EMPR=1)
--     Relación: MAE_EPS.COD_TERC → GN_TERCE.COD_TERC
--
--  EPS en el Excel          NOM_COMP en GN_TERCE          COD_TERC  NUM_IDEN
--  ─────────────────────    ──────────────────────────    ────────  ─────────
--  SURA E.P.S.              SURA E.P.S.                   166       800088702
--  COMPENSAR E.P.S          COMPENSAR E.P.S.              157       860066942
--  SANITAS E.P.S            SANITAS E.P.S.                164       800251440
--  NUEVA E.P.S              NUEVA E.P.S.                  161       900156264
--  SALUD TOTAL E.P.S.       SALUD TOTAL E.P.S.            163       800130907
--  Savia Salud              SAVIA SALUD E.P.S.            165       900604350
--  Coosalud                 COOSALUD E.P.S.               158       900226715
--  FOSYGA                   ADRES (FOSYGA)                160       901037916
--  Salud MIA EPS            SALUD MIA E.P.S.              162       900914254
--  ASOCIACION INDIGENA...   (sin tercero — ver nota)      —         —
--  Entidad Promotora...     MALLAMAS E.P.S.               159       837000084
-- ============================================================================

-- Nota: "ASOCIACION INDIGENA DEL CAUCA AIC" no tiene tercero en GN_TERCE.
-- Se crea primero el tercero y luego la EPS.

-- 1a. Crear tercero para AIC si no existe
INSERT INTO dbo.GN_TERCE
    (COD_EMPR, COD_TERC, NUM_IDEN, COD_TPDOC, NOM_COMP,
     APE_TERC, NOM_TERC, TIP_TERC, ACT_USUA, ACT_HORA, ACT_ESTA)
SELECT
    1, 184, 806008394, 8,
    'ASOCIACION INDIGENA DEL CAUCA AIC',
    'ASOCIACION INDIGENA', 'DEL CAUCA AIC', 'S',
    'MineDax', GETDATE(), 'A'
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.GN_TERCE
    WHERE COD_EMPR = 1 AND NUM_IDEN = 806008394
);
GO

-- 1b. Insertar EPS
INSERT INTO dbo.MAE_EPS (COD_EMPR, COD_EPS, COD_TERC, COD_PILA, TIP_REGIM, ACT_USUA, ACT_HORA, ACT_ESTA)
SELECT ins.COD_EMPR, ins.COD_EPS, ins.COD_TERC, ins.COD_PILA, ins.TIP_REGIM, 'MineDax', GETDATE(), 'A'
FROM (VALUES
    -- COD_EPS, COD_TERC (ref GN_TERCE), COD_PILA (código PILA), TIP_REGIM (C=contributivo, S=subsidiado)
    (1, 1, 166, 'EPS010',  'C'),   -- SURA E.P.S.
    (1, 2, 157, 'EPS037',  'C'),   -- COMPENSAR E.P.S.
    (1, 3, 164, 'EPS008',  'C'),   -- SANITAS E.P.S.
    (1, 4, 161, 'EPS047',  'C'),   -- NUEVA E.P.S.
    (1, 5, 163, 'EPS014',  'C'),   -- SALUD TOTAL E.P.S.
    (1, 6, 165, 'EPS034',  'C'),   -- SAVIA SALUD E.P.S.
    (1, 7, 158, 'EPS016',  'C'),   -- COOSALUD E.P.S.
    (1, 8, 160, 'EPS900',  'C'),   -- ADRES (FOSYGA)
    (1, 9, 162, 'EPS050',  'C'),   -- SALUD MIA E.P.S.
    (1,10, 184, 'EPS062',  'S'),   -- ASOCIACION INDIGENA DEL CAUCA AIC
    (1,11, 159, 'EPS053',  'S')    -- MALLAMAS E.P.S.
) AS ins(COD_EMPR, COD_EPS, COD_TERC, COD_PILA, TIP_REGIM)
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.MAE_EPS
    WHERE COD_EMPR = ins.COD_EMPR AND COD_EPS = ins.COD_EPS
);
GO

-- ============================================================================
--  2. MAE_CCF  (COD_EMPR=1)
--     Relación: MAE_CCF.COD_TERC → GN_TERCE.COD_TERC
--
--  CCF en el Excel               NOM_COMP en GN_TERCE          COD_TERC  NUM_IDEN
--  ──────────────────────────    ──────────────────────────    ────────  ─────────
--  CCF COMFENALCO ANTIOQUIA      CCF COMFENALCO ANTIOQUIA      177       890900841
--  CCF CAFAM                     CCF CAFAM                     174       860013574
--  CCF CAJASAN                   CCF CAJASAN                   175       890201584
--  CCF COMFACOR                  CCF COMFACOR                  176       891000531
--  CCF DE CALDAS                 CCF DE CALDAS                 179       890806490
-- ============================================================================

INSERT INTO dbo.MAE_CCF (COD_EMPR, COD_CCF, COD_TERC, COD_PILA, COD_REGIO, ACT_USUA, ACT_HORA, ACT_ESTA)
SELECT ins.COD_EMPR, ins.COD_CCF, ins.COD_TERC, ins.COD_PILA, ins.COD_REGIO, 'MineDax', GETDATE(), 'A'
FROM (VALUES
    -- COD_CCF, COD_TERC (ref GN_TERCE), COD_PILA, COD_REGIO (región PILA)
    (1, 1, 177, 'CCF006', 5),   -- CCF COMFENALCO ANTIOQUIA   (región Antioquia)
    (1, 2, 174, 'CCF001', 11),  -- CCF CAFAM                  (región Bogotá)
    (1, 3, 175, 'CCF011', 7),   -- CCF CAJASAN                (región Santander)
    (1, 4, 176, 'CCF004', 23),  -- CCF COMFACOR               (región Córdoba)
    (1, 5, 179, 'CCF009', 17)   -- CCF DE CALDAS              (región Caldas)
) AS ins(COD_EMPR, COD_CCF, COD_TERC, COD_PILA, COD_REGIO)
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.MAE_CCF
    WHERE COD_EMPR = ins.COD_EMPR AND COD_CCF = ins.COD_CCF
);
GO

-- ============================================================================
--  Verificación final
-- ============================================================================

SELECT 'MAE_EPS' AS Tabla, m.COD_EPS, t.NOM_COMP, t.NUM_IDEN, m.COD_PILA, m.TIP_REGIM, m.ACT_ESTA
FROM dbo.MAE_EPS m
INNER JOIN dbo.GN_TERCE t ON t.COD_TERC = m.COD_TERC
WHERE m.COD_EMPR = 1 AND m.ACT_ESTA = 'A'
ORDER BY m.COD_EPS;

SELECT 'MAE_CCF' AS Tabla, m.COD_CCF, t.NOM_COMP, t.NUM_IDEN, m.COD_PILA, m.COD_REGIO, m.ACT_ESTA
FROM dbo.MAE_CCF m
INNER JOIN dbo.GN_TERCE t ON t.COD_TERC = m.COD_TERC
WHERE m.COD_EMPR = 1 AND m.ACT_ESTA = 'A'
ORDER BY m.COD_CCF;
