-- ============================================================================
-- QUERIES ÚTILES - Sistema de Novedades Centralizado
-- Estas consultas facilitan reportes, auditoría y análisis
-- ============================================================================

-- ============================================================================
-- 1. CONSULTAS DE VALIDACIÓN Y DIAGNÓSTICO
-- ============================================================================

-- Verificar que las tablas fueron creadas correctamente
SELECT TABLE_NAME FROM INFORMATION_SCHEMA.TABLES
WHERE TABLE_NAME IN ('NO_NOVED', 'NO_NOVED_Auditoria', 'Ocasionales', 'Fijas', 'Ausencias')
ORDER BY TABLE_NAME;

-- Verificar estructura de NO_NOVED
EXEC sp_help 'NO_NOVED';

-- Contar registros en cada tabla
SELECT
  'Ocasionales' as Tabla,
  COUNT(*) as Total
FROM Ocasionales
UNION ALL
SELECT 'Fijas', COUNT(*) FROM Fijas
UNION ALL
SELECT 'Ausencias', COUNT(*) FROM Ausencias
UNION ALL
SELECT 'NO_NOVED (Histórico)', COUNT(*) FROM NO_NOVED;

-- ============================================================================
-- 2. CONSULTAS POR PERÍODO
-- ============================================================================

-- Reporte de novedades por período (Abril 2026, Quincena 1)
SELECT
  numeroNovedad,
  cedula,
  nombre,
  categoria,
  tipo,
  subtipo,
  valor,
  estado,
  fechaRegistro,
  usuarioRegistro
FROM NO_NOVED
WHERE periodo = '2026-04-Q1'
  AND estado != 'Cancelado'
ORDER BY cedula, fechaRegistro;

-- Totales por categoría y período
SELECT
  periodo,
  categoria,
  estado,
  COUNT(*) as Cantidad,
  SUM(valor) as Total,
  AVG(valor) as Promedio
FROM NO_NOVED
WHERE YEAR(fechaRegistro) = 2026
  AND MONTH(fechaRegistro) = 4
GROUP BY periodo, categoria, estado
ORDER BY periodo, categoria;

-- ============================================================================
-- 3. CONSULTAS POR PERSONA
-- ============================================================================

-- Histórico completo de una persona (2026-04, ejemplo con cédula)
SELECT
  numeroNovedad,
  categoria,
  tipo,
  subtipo,
  periodo,
  fechaInicio,
  fechaFin,
  cantidad,
  valor,
  estado,
  fechaRegistro,
  fechaActualizacion,
  usuarioRegistro
FROM NO_NOVED
WHERE cedula = '1234567890'
  AND YEAR(fechaRegistro) = 2026
  AND MONTH(fechaRegistro) = 4
ORDER BY fechaRegistro DESC;

-- Resumen de movimientos por persona
SELECT
  cedula,
  nombre,
  COUNT(*) as TotalMovimientos,
  COUNT(CASE WHEN estado = 'Activo' THEN 1 END) as Activos,
  COUNT(CASE WHEN estado = 'Modificado' THEN 1 END) as Modificados,
  COUNT(CASE WHEN estado = 'Cancelado' THEN 1 END) as Cancelados,
  SUM(valor) as TotalValor,
  MAX(fechaRegistro) as UltimoMovimiento
FROM NO_NOVED
WHERE YEAR(fechaRegistro) = 2026
GROUP BY cedula, nombre
ORDER BY TotalMovimientos DESC;

-- Nómina neta por persona para período específico
SELECT
  cedula,
  nombre,
  SUM(CASE WHEN valor > 0 THEN valor ELSE 0 END) as Ingresos,
  SUM(CASE WHEN valor < 0 THEN ABS(valor) ELSE 0 END) as Descuentos,
  SUM(valor) as Neto
FROM NO_NOVED
WHERE periodo = '2026-04-Q1'
  AND estado != 'Cancelado'
GROUP BY cedula, nombre
ORDER BY cedula;

-- ============================================================================
-- 4. CONSULTAS DE AUDITORÍA
-- ============================================================================

-- Cambios realizados en las últimas 24 horas
SELECT
  a.novedadId,
  n.numeroNovedad,
  n.cedula,
  n.nombre,
  a.accion,
  a.usuario,
  a.fechaAccion,
  a.motivo
FROM NO_NOVED_Auditoria a
INNER JOIN NO_NOVED n ON a.novedadId = n.id
WHERE a.fechaAccion >= DATEADD(DAY, -1, GETDATE())
ORDER BY a.fechaAccion DESC;

-- Cambios por usuario
SELECT
  usuario,
  accion,
  COUNT(*) as Cantidad,
  MIN(fechaAccion) as PrimerCambio,
  MAX(fechaAccion) as UltimoCambio
FROM NO_NOVED_Auditoria
WHERE YEAR(fechaAccion) = 2026
GROUP BY usuario, accion
ORDER BY usuario, accion;

-- Novedades modificadas (quién las cambió y cuándo)
SELECT
  n.numeroNovedad,
  n.cedula,
  n.nombre,
  n.estado,
  n.fechaRegistro,
  n.usuarioRegistro,
  n.fechaActualizacion,
  n.usuarioActualizacion,
  DATEDIFF(HOUR, n.fechaRegistro, COALESCE(n.fechaActualizacion, GETDATE())) as HorasDesdeCreacion
FROM NO_NOVED n
WHERE n.estado = 'Modificado'
  AND YEAR(n.fechaRegistro) = 2026
ORDER BY n.fechaActualizacion DESC;

-- Cancelaciones y sus motivos
SELECT
  numeroNovedad,
  cedula,
  nombre,
  categoria,
  estado,
  motivoCancelacion,
  usuarioCancelacion,
  fechaCancelacion,
  DATEDIFF(DAY, fechaRegistro, fechaCancelacion) as DiasHastaCancelacion
FROM NO_NOVED
WHERE estado = 'Cancelado'
ORDER BY fechaCancelacion DESC;

-- ============================================================================
-- 5. CONSULTAS DE COMPARACIÓN (Tablas específicas vs. Centralizado)
-- ============================================================================

-- Validar que todas las ocasionales estén vinculadas a NO_NOVED
SELECT
  COUNT(*) as TotalOcasionales,
  COUNT(novedadId) as ConNovedadId,
  COUNT(*) - COUNT(novedadId) as SinVinculación
FROM Ocasionales;

-- Ocasionales sin vincular a NO_NOVED (para depuración)
SELECT
  o.id,
  o.cedula,
  o.nombre,
  o.novedad,
  o.periodo,
  o.fechaRegistro
FROM Ocasionales o
WHERE o.novedadId IS NULL
ORDER BY o.fechaRegistro DESC;

-- Comparar totales en tabla específica vs. histórico
SELECT
  'Ocasionales' as Categoria,
  COUNT(DISTINCT cedula) as PersonasOcasionales,
  COUNT(*) as Registros,
  SUM(valor) as TotalValor
FROM Ocasionales
WHERE YEAR(fechaRegistro) = 2026
  AND MONTH(fechaRegistro) = 4
UNION ALL
SELECT
  'Fijas',
  COUNT(DISTINCT cedula),
  COUNT(*),
  SUM(valor)
FROM Fijas
WHERE YEAR(fechaRegistro) = 2026
  AND MONTH(fechaRegistro) = 4
UNION ALL
SELECT
  'Ausencias',
  COUNT(DISTINCT cedula),
  COUNT(*),
  SUM(CAST(dias AS DECIMAL(15, 2)))
FROM Ausencias
WHERE YEAR(fechaRegistro) = 2026
  AND MONTH(fechaRegistro) = 4;

-- ============================================================================
-- 6. CONSULTAS PARA EXPORTACIÓN Y REPORTES
-- ============================================================================

-- Reporte consolidado de nómina (completo)
SELECT
  n.numeroNovedad,
  n.cedula,
  n.nombre,
  n.categoria,
  n.tipo,
  n.subtipo,
  n.periodo,
  n.fechaInicio,
  n.fechaFin,
  n.cantidad,
  n.valor,
  n.aplicacion,
  n.estado,
  n.observaciones,
  CONVERT(VARCHAR(10), n.fechaRegistro, 23) as FechaRegistro,
  n.usuarioRegistro,
  CONVERT(VARCHAR(10), n.fechaActualizacion, 23) as FechaActualizacion,
  n.usuarioActualizacion
FROM NO_NOVED n
WHERE n.periodo = '2026-04-Q1'
ORDER BY n.cedula, n.numeroNovedad;

-- Reporte de novedades por estado (para análisis)
SELECT
  periodo,
  estado,
  COUNT(*) as Cantidad,
  COUNT(DISTINCT cedula) as Personas,
  MIN(valor) as ValorMinimo,
  MAX(valor) as ValorMaximo,
  AVG(valor) as PromedioValor,
  SUM(valor) as TotalValor
FROM NO_NOVED
WHERE YEAR(fechaRegistro) = 2026
GROUP BY periodo, estado
ORDER BY periodo, estado;

-- Extracto de nómina por período y persona (para exportación a Excel)
SELECT
  n.cedula,
  n.nombre,
  STRING_AGG(
    n.numeroNovedad + ' (' + n.tipo + '): $' + CONVERT(VARCHAR, n.valor),
    ' | '
  ) as Novedades,
  SUM(CASE WHEN n.valor > 0 THEN n.valor ELSE 0 END) as Ingresos,
  SUM(CASE WHEN n.valor < 0 THEN ABS(n.valor) ELSE 0 END) as Descuentos,
  SUM(n.valor) as Neto
FROM NO_NOVED n
WHERE n.periodo = '2026-04-Q1'
  AND n.estado != 'Cancelado'
GROUP BY n.cedula, n.nombre
ORDER BY n.cedula;

-- ============================================================================
-- 7. CONSULTAS PARA ANÁLISIS Y MÉTRICAS
-- ============================================================================

-- Volumen de novedades por mes (trending)
SELECT
  CONVERT(VARCHAR(7), fechaRegistro, 23) as Mes,
  COUNT(*) as TotalNovedades,
  COUNT(DISTINCT cedula) as PersonasAfectadas,
  COUNT(CASE WHEN estado = 'Cancelado' THEN 1 END) as Canceladas,
  ROUND(CAST(COUNT(CASE WHEN estado = 'Cancelado' THEN 1 END) AS FLOAT) / COUNT(*) * 100, 2) as PorcentajeCancelado
FROM NO_NOVED
WHERE YEAR(fechaRegistro) = 2026
GROUP BY CONVERT(VARCHAR(7), fechaRegistro, 23)
ORDER BY Mes;

-- Novedades más comunes
SELECT
  tipo,
  COUNT(*) as Frecuencia,
  AVG(valor) as ValorPromedio,
  ROUND(CAST(COUNT(*) AS FLOAT) /
    (SELECT COUNT(*) FROM NO_NOVED WHERE YEAR(fechaRegistro) = 2026) * 100, 2) as Porcentaje
FROM NO_NOVED
WHERE YEAR(fechaRegistro) = 2026
  AND estado != 'Cancelado'
GROUP BY tipo
ORDER BY Frecuencia DESC;

-- Personas con más cambios (ediciones)
SELECT
  TOP 20
  cedula,
  nombre,
  COUNT(*) as TotalMovimientos,
  SUM(CASE WHEN estado = 'Modificado' THEN 1 ELSE 0 END) as Modificaciones,
  SUM(CASE WHEN estado = 'Cancelado' THEN 1 ELSE 0 END) as Cancelaciones
FROM NO_NOVED
WHERE YEAR(fechaRegistro) = 2026
GROUP BY cedula, nombre
ORDER BY Modificaciones DESC, TotalMovimientos DESC;

-- ============================================================================
-- 8. PROCEDIMIENTOS ALMACENADOS ÚTILES
-- ============================================================================

-- Obtener histórico de una persona con totales
-- EXEC sp_ObtenerHistoricoPerson @cedula = '1234567890', @periodo = '2026-04'

-- Crear novedad con validaciones
-- EXEC sp_CrearNovedad
--   @id = 'uuid',
--   @numeroNovedad = '2026-04-OCW-001',
--   @cedula = '1234567890',
--   ...

-- ============================================================================
-- 9. VISTAS ÚTILES
-- ============================================================================

-- La vista ya creada: vw_Novedades_Consolidadas
SELECT * FROM vw_Novedades_Consolidadas
WHERE cedula = '1234567890'
ORDER BY fechaRegistro DESC;

-- ============================================================================
-- 10. LIMPIAR Y RESETEAR (SOLO PARA DESARROLLO)
-- ============================================================================

-- ⚠️ PELIGROSO - Borrar todo (solo en desarrollo)
/*
TRUNCATE TABLE NO_NOVED_Auditoria;
TRUNCATE TABLE NO_NOVED;
DELETE FROM Ocasionales WHERE novedadId IS NOT NULL;
DELETE FROM Fijas WHERE novedadId IS NOT NULL;
DELETE FROM Ausencias WHERE novedadId IS NOT NULL;
*/

-- Eliminar una novedad específica y sus referencias
-- DECLARE @novedadId NVARCHAR(36) = 'uuid-aqui';
-- DELETE FROM NO_NOVED_Auditoria WHERE novedadId = @novedadId;
-- DELETE FROM Ocasionales WHERE novedadId = @novedadId;
-- DELETE FROM NO_NOVED WHERE id = @novedadId;

