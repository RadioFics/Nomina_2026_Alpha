-- ============================================================================
--  diagnostico_y_correcciones.sql
--  Script unificado de diagnóstico y corrección de la BD MineDax.
--
--  Organización:
--    SECCIÓN 0 · Diagnóstico previo   (solo SELECT — ejecutar primero)
--    SECCIÓN 1 · GN_TERCE             (terceros faltantes)
--    SECCIÓN 2 · MAE_EPS              (EPS)
--    SECCIÓN 3 · MAE_CCF              (Cajas de compensación)
--    SECCIÓN 4 · MAE_AFP              (Fondos de pensiones — códigos PILA)
--    SECCIÓN 5 · MAE_CEST             (Fondos de cesantías)
--    SECCIÓN 6 · MAE_ARL              (Administradoras de riesgos laborales)
--    SECCIÓN 7 · Verificación final   (solo SELECT)
--
--  Instrucciones:
--    1. Ejecutar SECCIÓN 0 para ver el estado actual antes de aplicar cambios.
--    2. Ajustar los VALUES de cada sección según los datos de su empresa.
--    3. Ejecutar las secciones 1–6 en orden (cada bloque es idempotente).
--    4. Ejecutar SECCIÓN 7 para confirmar que todo quedó correcto.
--
--  Convenciones de columnas clave:
--    • COD_PILA   → código de la entidad en el sistema PILA (planilla integrada)
--    • TIP_REGIM  → 'C' contributivo  |  'S' subsidiado        (solo MAE_EPS)
--    • IND_TIPO   → 'U' administración individual | 'P' patrimonio autónomo  (MAE_CEST)
--    • COD_CLASE  → clase de riesgo PILA (1=I … 5=V)           (MAE_ARL)
--    • COD_REGIO  → código de región PILA                       (MAE_CCF)
--
--  Ejecutar UNA sola vez contra MineDax.
--  Todos los INSERT usan WHERE NOT EXISTS → son seguros de re-ejecutar.
-- ============================================================================

USE MineDax;
GO

-- ============================================================================
--  SECCIÓN 0 · DIAGNÓSTICO PREVIO
--  Ejecute este bloque primero para ver el estado actual de cada tabla.
-- ============================================================================

SELECT 'MAE_EPS'  AS Tabla, COUNT(*) AS Registros FROM dbo.MAE_EPS  WHERE COD_EMPR=1 AND ACT_ESTA='A' UNION ALL
SELECT 'MAE_CCF',           COUNT(*)               FROM dbo.MAE_CCF  WHERE COD_EMPR=1 AND ACT_ESTA='A' UNION ALL
SELECT 'MAE_AFP',           COUNT(*)               FROM dbo.MAE_AFP  WHERE COD_EMPR=1 AND ACT_ESTA='A' UNION ALL
SELECT 'MAE_CEST',          COUNT(*)               FROM dbo.MAE_CEST WHERE COD_EMPR=1 AND ACT_ESTA='A' UNION ALL
SELECT 'MAE_ARL',           COUNT(*)               FROM dbo.MAE_ARL  WHERE COD_EMPR=1 AND ACT_ESTA='A' UNION ALL
SELECT 'MAE_GRSAN',         COUNT(*)               FROM dbo.MAE_GRSAN                  WHERE ACT_ESTA='A' UNION ALL
SELECT 'MAE_CARGO',         COUNT(*)               FROM dbo.MAE_CARGO WHERE COD_EMPR=1 AND ACT_ESTA='A' UNION ALL
SELECT 'MAE_CCOST',         COUNT(*)               FROM dbo.MAE_CCOST WHERE COD_EMPR=1 AND ACT_ESTA='A' UNION ALL
SELECT 'MAE_TPCTA',         COUNT(*)               FROM dbo.MAE_TPCTA                  WHERE ACT_ESTA='A' UNION ALL
SELECT 'MAE_BANCO',         COUNT(*)               FROM dbo.MAE_BANCO                  WHERE ACT_ESTA='A';

GO

-- ============================================================================
--  SECCIÓN 1 · GN_TERCE — Terceros faltantes
--
--  Agregar aquí cualquier entidad (EPS, AFP, CCF, ARL, etc.) que no exista
--  todavía en GN_TERCE antes de referenciarla desde las tablas MAE_.
--
--  Columnas obligatorias:
--    COD_EMPR  smallint  → empresa (1)
--    COD_TERC  int       → ID único del tercero (ver MAX actual más abajo)
--    NUM_IDEN  bigint    → NIT de la entidad
--    COD_TPDOC smallint  → 8 = NIT
--    NOM_COMP  nvarchar  → nombre completo
--    APE_TERC  nvarchar  → apellido / primera palabra del nombre
--    NOM_TERC  nvarchar  → nombre / resto del nombre
--    TIP_TERC  char(1)   → 'S' = sociedad / entidad
--
--  Para saber el próximo COD_TERC disponible:
--    SELECT MAX(COD_TERC)+1 FROM dbo.GN_TERCE WHERE COD_EMPR=1
--  Actualmente el último asignado es 184 (AIC); el siguiente libre es 185.
-- ============================================================================

-- ── Ejemplo: agregar una ARL adicional no presente en GN_TERCE ───────────────
-- Descomente y ajuste el bloque siguiente si necesita insertar un nuevo tercero.
--
-- INSERT INTO dbo.GN_TERCE
--     (COD_EMPR, COD_TERC, NUM_IDEN, COD_TPDOC, NOM_COMP,
--      APE_TERC, NOM_TERC, TIP_TERC, ACT_USUA, ACT_HORA, ACT_ESTA)
-- SELECT 1, 185, 999999999, 8,
--        'NOMBRE ENTIDAD',
--        'NOMBRE', 'ENTIDAD', 'S',
--        'MineDax', GETDATE(), 'A'
-- WHERE NOT EXISTS (
--     SELECT 1 FROM dbo.GN_TERCE WHERE COD_EMPR=1 AND NUM_IDEN=999999999
-- );

GO

-- ============================================================================
--  SECCIÓN 2 · MAE_EPS — Entidades Promotoras de Salud
--
--  Estado actual (11 registros activos — ya poblada):
--    COD_EPS  NOM_COMP                          NIT          COD_PILA  REGIMEN
--    ───────  ────────────────────────────────  ───────────  ────────  ───────
--      1      COMPENSAR E.P.S.                  860066942    EPS037    C
--      2      COOSALUD E.P.S.                   900226715    EPS016    C
--      3      MALLAMAS E.P.S.                   837000084    EPS053    S
--      4      ADRES (FOSYGA)                    901037916    EPS900    C
--      5      NUEVA E.P.S.                      900156264    EPS047    C
--      6      SALUD MIA E.P.S.                  900914254    EPS050    C
--      7      SALUD TOTAL E.P.S.                800130907    EPS014    C
--      8      SANITAS E.P.S.                    800251440    EPS008    C
--      9      SAVIA SALUD E.P.S.                900604350    EPS034    C
--     10      SURA E.P.S.                       800088702    EPS010    C
--     11      ASOCIACION INDIGENA DEL CAUCA AIC 806008394    EPS062    S
--
--  Para agregar una EPS nueva: agregar una fila al VALUES y ajustar el
--  COD_EPS al siguiente disponible (actualmente 12).
--  Primero verifique que la entidad exista en GN_TERCE (SECCIÓN 1).
-- ============================================================================

INSERT INTO dbo.MAE_EPS (COD_EMPR, COD_EPS, COD_TERC, COD_PILA, TIP_REGIM, ACT_USUA, ACT_HORA, ACT_ESTA)
SELECT ins.COD_EMPR, ins.COD_EPS, ins.COD_TERC, ins.COD_PILA, ins.TIP_REGIM, 'MineDax', GETDATE(), 'A'
FROM (VALUES
    --  COD_EMPR  COD_EPS  COD_TERC  COD_PILA   TIP_REGIM
    --  ────────  ───────  ────────  ─────────  ─────────
    (1,  1, 157, 'EPS037', 'C'),   -- COMPENSAR E.P.S.
    (1,  2, 158, 'EPS016', 'C'),   -- COOSALUD E.P.S.
    (1,  3, 159, 'EPS053', 'S'),   -- MALLAMAS E.P.S.
    (1,  4, 160, 'EPS900', 'C'),   -- ADRES (FOSYGA)
    (1,  5, 161, 'EPS047', 'C'),   -- NUEVA E.P.S.
    (1,  6, 162, 'EPS050', 'C'),   -- SALUD MIA E.P.S.
    (1,  7, 163, 'EPS014', 'C'),   -- SALUD TOTAL E.P.S.
    (1,  8, 164, 'EPS008', 'C'),   -- SANITAS E.P.S.
    (1,  9, 165, 'EPS034', 'C'),   -- SAVIA SALUD E.P.S.
    (1, 10, 166, 'EPS010', 'C'),   -- SURA E.P.S.
    (1, 11, 184, 'EPS062', 'S')    -- ASOCIACION INDIGENA DEL CAUCA AIC
    -- (1, 12, 185, 'EPS???', 'C') -- ← plantilla para nueva EPS
) AS ins(COD_EMPR, COD_EPS, COD_TERC, COD_PILA, TIP_REGIM)
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.MAE_EPS
    WHERE COD_EMPR = ins.COD_EMPR AND COD_EPS = ins.COD_EPS
);
GO

-- ============================================================================
--  SECCIÓN 3 · MAE_CCF — Cajas de Compensación Familiar
--
--  Estado actual (5 registros activos — ya poblada):
--    COD_CCF  NOM_COMP                  NIT          COD_PILA  COD_REGIO
--    ───────  ────────────────────────  ───────────  ────────  ─────────
--      1      CCF CAFAM                 860013574    CCF001    11  (Bogotá)
--      2      CCF CAJASAN               890201584    CCF011     7  (Santander)
--      3      CCF COMFACOR              891000531    CCF004    23  (Córdoba)
--      4      CCF COMFENALCO ANTIOQUIA  890900841    CCF006     5  (Antioquia)
--      5      CCF DE CALDAS             890806490    CCF009    17  (Caldas)
--
--  COD_REGIO corresponde al código de departamento DANE.
--  Para agregar una CCF nueva: ajustar COD_CCF al siguiente disponible (6).
-- ============================================================================

INSERT INTO dbo.MAE_CCF (COD_EMPR, COD_CCF, COD_TERC, COD_PILA, COD_REGIO, ACT_USUA, ACT_HORA, ACT_ESTA)
SELECT ins.COD_EMPR, ins.COD_CCF, ins.COD_TERC, ins.COD_PILA, ins.COD_REGIO, 'MineDax', GETDATE(), 'A'
FROM (VALUES
    --  COD_EMPR  COD_CCF  COD_TERC  COD_PILA   COD_REGIO
    --  ────────  ───────  ────────  ─────────  ─────────
    (1, 1, 174, 'CCF001', 11),  -- CCF CAFAM                  (Bogotá)
    (1, 2, 175, 'CCF011',  7),  -- CCF CAJASAN                (Santander)
    (1, 3, 176, 'CCF004', 23),  -- CCF COMFACOR               (Córdoba)
    (1, 4, 177, 'CCF006',  5),  -- CCF COMFENALCO ANTIOQUIA   (Antioquia)
    (1, 5, 179, 'CCF009', 17)   -- CCF DE CALDAS              (Caldas)
    -- (1, 6, ???, 'CCF???', ??) -- ← plantilla para nueva CCF
) AS ins(COD_EMPR, COD_CCF, COD_TERC, COD_PILA, COD_REGIO)
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.MAE_CCF
    WHERE COD_EMPR = ins.COD_EMPR AND COD_CCF = ins.COD_CCF
);
GO

-- ============================================================================
--  SECCIÓN 4 · MAE_AFP — Fondos de Pensiones
--
--  Estado actual (4 registros activos, COD_PILA en NULL — requiere corrección):
--    COD_AFP  NOM_COMP            NIT          COD_PILA (actual)
--    ───────  ──────────────────  ───────────  ─────────────────
--      1      COLFONDOS A.F.P.    800149496    NULL  ← corregir
--      2      COLPENSIONES        900336004    NULL  ← corregir
--      3      PORVENIR A.F.P.     800224808    NULL  ← corregir
--      4      PROTECCIÓN A.F.P.   800138188    NULL  ← corregir
--
--  Este bloque actualiza los códigos PILA faltantes y agrega nuevas AFP
--  si no existieran. Si ya existen, solo actualiza el COD_PILA.
-- ============================================================================

-- 4a. Actualizar códigos PILA de AFP existentes
UPDATE dbo.MAE_AFP SET COD_PILA='AFP003', ACT_USUA='MineDax', ACT_HORA=GETDATE()
WHERE COD_EMPR=1 AND COD_AFP=1 AND (COD_PILA IS NULL OR COD_PILA='');  -- COLFONDOS

UPDATE dbo.MAE_AFP SET COD_PILA='AFP001', ACT_USUA='MineDax', ACT_HORA=GETDATE()
WHERE COD_EMPR=1 AND COD_AFP=2 AND (COD_PILA IS NULL OR COD_PILA='');  -- COLPENSIONES

UPDATE dbo.MAE_AFP SET COD_PILA='AFP002', ACT_USUA='MineDax', ACT_HORA=GETDATE()
WHERE COD_EMPR=1 AND COD_AFP=3 AND (COD_PILA IS NULL OR COD_PILA='');  -- PORVENIR

UPDATE dbo.MAE_AFP SET COD_PILA='AFP005', ACT_USUA='MineDax', ACT_HORA=GETDATE()
WHERE COD_EMPR=1 AND COD_AFP=4 AND (COD_PILA IS NULL OR COD_PILA='');  -- PROTECCIÓN

GO

-- 4b. Insertar AFP adicionales si se requieren
-- (Actualmente todas las AFP del Excel están cubiertas; descomentar si aparece una nueva)
--
-- INSERT INTO dbo.MAE_AFP (COD_EMPR, COD_AFP, COD_TERC, COD_PILA, TIP_AFP, ACT_USUA, ACT_HORA, ACT_ESTA)
-- SELECT ins.COD_EMPR, ins.COD_AFP, ins.COD_TERC, ins.COD_PILA, ins.TIP_AFP, 'MineDax', GETDATE(), 'A'
-- FROM (VALUES
--     --  COD_EMPR  COD_AFP  COD_TERC  COD_PILA   TIP_AFP
--     -- (1, 5, ???, 'AFP???', 'I')  -- ← nueva AFP individual
-- ) AS ins(COD_EMPR, COD_AFP, COD_TERC, COD_PILA, TIP_AFP)
-- WHERE NOT EXISTS (
--     SELECT 1 FROM dbo.MAE_AFP WHERE COD_EMPR=ins.COD_EMPR AND COD_AFP=ins.COD_AFP
-- );

GO

-- ============================================================================
--  SECCIÓN 5 · MAE_CEST — Fondos de Cesantías
--
--  ¡ATENCIÓN! MAE_CEST NO tiene columna COD_TERC.
--  La entidad se identifica directamente por NOM_CEST y COD_NIT.
--
--  Estado actual (6 registros — ya poblada, pero COD_NIT vacíos):
--    COD_CEST  NOM_CEST                    COD_NIT      IND_TIPO
--    ────────  ──────────────────────────  ───────────  ────────
--       0      Sin asignar                 0            P
--       1      COLFONDOS CESANTIAS         000000000    U  ← corregir NIT
--       2      FONDO NACIONAL DEL AHORRO   000000000    P  ← corregir NIT
--       3      N/A NO APLICA               000000000    U
--       4      PORVENIR CESANTIAS          000000000    U  ← corregir NIT
--       5      PROTECCION CESANTIAS        000000000    U  ← corregir NIT
--
--  IND_TIPO: 'U' = individual (administración) | 'P' = patrimonio autónomo
-- ============================================================================

-- 5a. Corregir NITs de cesantías existentes
UPDATE dbo.MAE_CEST SET COD_NIT='800149496', ACT_USUA='MineDax', ACT_HORA=GETDATE()
WHERE COD_EMPR=1 AND COD_CEST=1 AND COD_NIT='000000000';  -- COLFONDOS CESANTIAS

UPDATE dbo.MAE_CEST SET COD_NIT='899999086', ACT_USUA='MineDax', ACT_HORA=GETDATE()
WHERE COD_EMPR=1 AND COD_CEST=2 AND COD_NIT='000000000';  -- FONDO NACIONAL DEL AHORRO

UPDATE dbo.MAE_CEST SET COD_NIT='800224808', ACT_USUA='MineDax', ACT_HORA=GETDATE()
WHERE COD_EMPR=1 AND COD_CEST=4 AND COD_NIT='000000000';  -- PORVENIR CESANTIAS

UPDATE dbo.MAE_CEST SET COD_NIT='800138188', ACT_USUA='MineDax', ACT_HORA=GETDATE()
WHERE COD_EMPR=1 AND COD_CEST=5 AND COD_NIT='000000000';  -- PROTECCION CESANTIAS

GO

-- 5b. Insertar fondos de cesantías adicionales si se requieren
-- INSERT INTO dbo.MAE_CEST (COD_EMPR, COD_CEST, NOM_CEST, COD_NIT, IND_TIPO, ACT_USUA, ACT_HORA, ACT_ESTA)
-- SELECT ins.COD_EMPR, ins.COD_CEST, ins.NOM_CEST, ins.COD_NIT, ins.IND_TIPO, 'MineDax', GETDATE(), 'A'
-- FROM (VALUES
--     --  COD_EMPR  COD_CEST  NOM_CEST            COD_NIT      IND_TIPO
--     -- (1, 6, 'NUEVA CESANTIA', '999999999', 'U')  -- ← plantilla
-- ) AS ins(COD_EMPR, COD_CEST, NOM_CEST, COD_NIT, IND_TIPO)
-- WHERE NOT EXISTS (
--     SELECT 1 FROM dbo.MAE_CEST WHERE COD_EMPR=ins.COD_EMPR AND COD_CEST=ins.COD_CEST
-- );

GO

-- ============================================================================
--  SECCIÓN 6 · MAE_ARL — Administradoras de Riesgos Laborales
--
--  Estado actual: 0 registros activos (tabla VACÍA — crítico).
--
--  Terceros ARL disponibles en GN_TERCE (COD_EMPR=1):
--    COD_TERC=167  COLMENA SEGUROS  NIT=800226175
--
--  Si su empresa usa otra ARL (Positiva, Sura ARL, Bolívar, Liberty, etc.)
--  primero insértela en GN_TERCE (SECCIÓN 1) y luego agregue la fila aquí.
--
--  COD_CLASE → clase de riesgo laboral PILA:
--    1=Clase I (riesgo mínimo) | 2=Clase II | 3=Clase III
--    4=Clase IV                | 5=Clase V (riesgo máximo)
-- ============================================================================

INSERT INTO dbo.MAE_ARL (COD_EMPR, COD_ARL, COD_TERC, COD_PILA, COD_CLASE, ACT_USUA, ACT_HORA, ACT_ESTA)
SELECT ins.COD_EMPR, ins.COD_ARL, ins.COD_TERC, ins.COD_PILA, ins.COD_CLASE, 'MineDax', GETDATE(), 'A'
FROM (VALUES
    --  COD_EMPR  COD_ARL  COD_TERC  COD_PILA   COD_CLASE
    --  ────────  ───────  ────────  ─────────  ─────────
    (1, 1, 167, 'ARL013', 1)    -- COLMENA SEGUROS — clase I (ajustar si hay empleados en clases II–V)
    -- (1, 2, 185, 'ARL???', 3) -- ← plantilla para ARL adicional (ej. Positiva, Sura ARL)
) AS ins(COD_EMPR, COD_ARL, COD_TERC, COD_PILA, COD_CLASE)
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.MAE_ARL
    WHERE COD_EMPR = ins.COD_EMPR AND COD_ARL = ins.COD_ARL
);
GO

-- ============================================================================
--  SECCIÓN 7 · VERIFICACIÓN FINAL
--  Ejecute este bloque después de aplicar todas las correcciones.
--  Todas las tablas deben mostrar al menos 1 registro activo.
-- ============================================================================

-- 7a. Conteo por tabla
SELECT 'MAE_EPS'  AS Tabla, COUNT(*) AS Registros FROM dbo.MAE_EPS  WHERE COD_EMPR=1 AND ACT_ESTA='A' UNION ALL
SELECT 'MAE_CCF',           COUNT(*)               FROM dbo.MAE_CCF  WHERE COD_EMPR=1 AND ACT_ESTA='A' UNION ALL
SELECT 'MAE_AFP',           COUNT(*)               FROM dbo.MAE_AFP  WHERE COD_EMPR=1 AND ACT_ESTA='A' UNION ALL
SELECT 'MAE_CEST',          COUNT(*)               FROM dbo.MAE_CEST WHERE COD_EMPR=1 AND ACT_ESTA='A' UNION ALL
SELECT 'MAE_ARL',           COUNT(*)               FROM dbo.MAE_ARL  WHERE COD_EMPR=1 AND ACT_ESTA='A';

GO

-- 7b. Detalle EPS
SELECT 'EPS' AS Tipo, m.COD_EPS AS Cod, t.NOM_COMP AS Nombre, t.NUM_IDEN AS NIT, m.COD_PILA, m.TIP_REGIM AS Extra
FROM dbo.MAE_EPS m INNER JOIN dbo.GN_TERCE t ON t.COD_TERC=CAST(m.COD_TERC AS int) AND t.COD_EMPR=m.COD_EMPR
WHERE m.COD_EMPR=1 AND m.ACT_ESTA='A' ORDER BY m.COD_EPS;

-- 7c. Detalle CCF
SELECT 'CCF' AS Tipo, m.COD_CCF AS Cod, t.NOM_COMP AS Nombre, t.NUM_IDEN AS NIT, m.COD_PILA, CAST(m.COD_REGIO AS varchar) AS Extra
FROM dbo.MAE_CCF m INNER JOIN dbo.GN_TERCE t ON t.COD_TERC=CAST(m.COD_TERC AS int) AND t.COD_EMPR=m.COD_EMPR
WHERE m.COD_EMPR=1 AND m.ACT_ESTA='A' ORDER BY m.COD_CCF;

-- 7d. Detalle AFP
SELECT 'AFP' AS Tipo, m.COD_AFP AS Cod, t.NOM_COMP AS Nombre, t.NUM_IDEN AS NIT, m.COD_PILA, m.TIP_AFP AS Extra
FROM dbo.MAE_AFP m INNER JOIN dbo.GN_TERCE t ON t.COD_TERC=CAST(m.COD_TERC AS int) AND t.COD_EMPR=m.COD_EMPR
WHERE m.COD_EMPR=1 AND m.ACT_ESTA='A' ORDER BY m.COD_AFP;

-- 7e. Detalle CEST
SELECT 'CEST' AS Tipo, COD_CEST AS Cod, NOM_CEST AS Nombre, COD_NIT AS NIT, NULL AS COD_PILA, IND_TIPO AS Extra
FROM dbo.MAE_CEST WHERE COD_EMPR=1 AND ACT_ESTA='A' ORDER BY COD_CEST;

-- 7f. Detalle ARL
SELECT 'ARL' AS Tipo, m.COD_ARL AS Cod, t.NOM_COMP AS Nombre, t.NUM_IDEN AS NIT, m.COD_PILA, CAST(m.COD_CLASE AS varchar) AS Extra
FROM dbo.MAE_ARL m INNER JOIN dbo.GN_TERCE t ON t.COD_TERC=CAST(m.COD_TERC AS int) AND t.COD_EMPR=m.COD_EMPR
WHERE m.COD_EMPR=1 AND m.ACT_ESTA='A' ORDER BY m.COD_ARL;
