-- ============================================================================
--  poblar_MAE_ARL.sql
--  Pobla MAE_ARL referenciando los GN_TERCE ya existentes.
--
--  Contexto:
--    • MAE_ARL estaba vacía (0 registros activos).
--    • GN_FUNCI.GRA_RIESGO almacena el grado de riesgo como texto (I–V),
--      pero no tiene FK directa a MAE_ARL — la ARL se referencia a través de
--      MAE_CARGO.COD_RIESG → MAE_RIESG.
--    • Sin embargo, parserAdecco puede traer el nombre de la ARL del empleado,
--      que en el futuro se mapeará al campo COD_ARL si GN_FUNCI lo requiere.
--
--  ARL conocidas en GN_TERCE (COD_EMPR=1):
--    COD_TERC=167  COLMENA SEGUROS   NIT=800226175
--
--  Ejecutar UNA sola vez contra MineDax.
--  Es seguro re-ejecutar: usa INSERT WHERE NOT EXISTS.
-- ============================================================================

USE MineDax;
GO

INSERT INTO dbo.MAE_ARL (COD_EMPR, COD_ARL, COD_TERC, COD_PILA, COD_CLASE, ACT_USUA, ACT_HORA, ACT_ESTA)
SELECT ins.COD_EMPR, ins.COD_ARL, ins.COD_TERC, ins.COD_PILA, ins.COD_CLASE, 'MineDax', GETDATE(), 'A'
FROM (VALUES
    -- COD_ARL, COD_TERC (ref GN_TERCE), COD_PILA, COD_CLASE (clase de riesgo PILA)
    (1, 1, 167, 'ARL013', 1)   -- COLMENA SEGUROS (Allianz) — clase riesgo I por defecto
) AS ins(COD_EMPR, COD_ARL, COD_TERC, COD_PILA, COD_CLASE)
WHERE NOT EXISTS (
    SELECT 1 FROM dbo.MAE_ARL
    WHERE COD_EMPR = ins.COD_EMPR AND COD_ARL = ins.COD_ARL
);
GO

-- Verificación
SELECT 'MAE_ARL' AS Tabla, m.COD_ARL, t.NOM_COMP, t.NUM_IDEN, m.COD_PILA, m.COD_CLASE, m.ACT_ESTA
FROM dbo.MAE_ARL m
INNER JOIN dbo.GN_TERCE t ON t.COD_TERC = m.COD_TERC AND t.COD_EMPR = m.COD_EMPR
WHERE m.COD_EMPR = 1 AND m.ACT_ESTA = 'A';
