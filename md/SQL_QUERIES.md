# 📊 Queries SQL Útiles

Colección de consultas SQL para consultar y analizar los datos de la nómina.

## Tabla de Contenidos
1. [Ocasionales](#ocasionales)
2. [Fijas](#fijas)
3. [Ausencias](#ausencias)
4. [Reportes](#reportes)
5. [Auditoría](#auditoría)

---

## Ocasionales

### Ver todos los registros
```sql
SELECT 
  cedula, nombre, novedad, tipo, 
  cantidad, valor, observaciones, 
  periodo, fechaRegistro
FROM Ocasionales
ORDER BY fechaRegistro DESC;
```

### Ocasionales por período
```sql
SELECT cedula, nombre, novedad, valor, cantidad
FROM Ocasionales
WHERE periodo = '2026-04-01 / 2026-04-15'
ORDER BY nombre;
```

### Total de ocasionales por empleado
```sql
SELECT 
  cedula, nombre, 
  COUNT(*) as cantidad_registros,
  SUM(valor) as total_valor
FROM Ocasionales
GROUP BY cedula, nombre
ORDER BY total_valor DESC;
```

### Ocasionales de un empleado específico
```sql
SELECT *
FROM Ocasionales
WHERE cedula = '1234567890'
ORDER BY fechaRegistro DESC;
```

### Ocasionales por tipo de novedad
```sql
SELECT 
  novedad,
  COUNT(*) as cantidad,
  SUM(valor) as total
FROM Ocasionales
WHERE periodo LIKE '2026-04%'
GROUP BY novedad
ORDER BY total DESC;
```

### Suma total por período
```sql
SELECT 
  periodo,
  COUNT(*) as cantidad_registros,
  SUM(valor) as total_valor,
  AVG(valor) as valor_promedio
FROM Ocasionales
GROUP BY periodo
ORDER BY periodo DESC;
```

---

## Fijas

### Ver todas las deducciones fijas
```sql
SELECT 
  cedula, nombre, novedad, tipo,
  aplicacion, valor, finicial, ffinal,
  cuotas, cuenta, periodo
FROM Fijas
WHERE ffinal IS NULL OR ffinal >= GETDATE()
ORDER BY cedula;
```

### Fijas activas (vigentes)
```sql
SELECT 
  cedula, nombre, novedad, valor,
  finicial, ffinal, cuotas
FROM Fijas
WHERE finicial <= GETDATE() 
  AND (ffinal IS NULL OR ffinal >= GETDATE())
ORDER BY nombre;
```

### Fijas vencidas
```sql
SELECT 
  cedula, nombre, novedad, ffinal, cuotas
FROM Fijas
WHERE ffinal < GETDATE()
ORDER BY ffinal DESC;
```

### Total de deducciones por empleado
```sql
SELECT 
  cedula, nombre,
  COUNT(*) as cantidad_deducciones,
  SUM(valor) as total_descuentos
FROM Fijas
WHERE finicial <= GETDATE() 
  AND (ffinal IS NULL OR ffinal >= GETDATE())
GROUP BY cedula, nombre
ORDER BY total_descuentos DESC;
```

### Fijas próximas a vencer
```sql
SELECT 
  cedula, nombre, novedad,
  ffinal, DATEDIFF(DAY, GETDATE(), ffinal) as dias_restantes
FROM Fijas
WHERE ffinal IS NOT NULL
  AND ffinal BETWEEN GETDATE() AND DATEADD(DAY, 30, GETDATE())
ORDER BY ffinal ASC;
```

### Cuotas pendientes
```sql
SELECT 
  cedula, nombre, novedad,
  valor, cuotas,
  valor / cuotas as valor_cuota,
  ffinal
FROM Fijas
WHERE cuotas > 0
ORDER BY ffinal ASC;
```

---

## Ausencias

### Ver todas las ausencias
```sql
SELECT 
  cedula, nombre, tipo, diagnostico,
  finicial, ffinal, dias, prorroga,
  periodo, fechaRegistro
FROM Ausencias
ORDER BY finicial DESC;
```

### Ausencias por período
```sql
SELECT cedula, nombre, tipo, dias, finicial, ffinal
FROM Ausencias
WHERE periodo = '2026-04'
ORDER BY finicial;
```

### Resumen de ausencias por empleado (mes actual)
```sql
SELECT 
  cedula, nombre,
  COUNT(*) as cantidad_ausencias,
  SUM(dias) as total_dias_ausencia,
  STRING_AGG(tipo, ', ') as tipos_ausencia
FROM Ausencias
WHERE MONTH(finicial) = MONTH(GETDATE())
  AND YEAR(finicial) = YEAR(GETDATE())
GROUP BY cedula, nombre
ORDER BY total_dias_ausencia DESC;
```

### Ausencias activas (en curso)
```sql
SELECT 
  cedula, nombre, tipo, diagnostico,
  finicial, ffinal, 
  DATEDIFF(DAY, GETDATE(), ffinal) as dias_restantes
FROM Ausencias
WHERE finicial <= GETDATE() AND ffinal >= GETDATE()
ORDER BY ffinal ASC;
```

### Total de días de ausencia por tipo
```sql
SELECT 
  tipo,
  COUNT(*) as cantidad,
  SUM(dias) as total_dias
FROM Ausencias
WHERE YEAR(finicial) = YEAR(GETDATE())
GROUP BY tipo
ORDER BY total_dias DESC;
```

### Ausencias con prórroga
```sql
SELECT 
  cedula, nombre, tipo,
  finicial, ffinal, prorroga,
  DATEDIFF(DAY, ffinal, prorroga) as dias_prorroga
FROM Ausencias
WHERE prorroga IS NOT NULL
ORDER BY prorroga DESC;
```

### Diagnósticos más frecuentes
```sql
SELECT 
  diagnostico,
  COUNT(*) as cantidad_casos,
  SUM(dias) as total_dias
FROM Ausencias
WHERE diagnostico IS NOT NULL AND diagnostico != ''
GROUP BY diagnostico
ORDER BY cantidad_casos DESC;
```

---

## Reportes

### Nómina consolidada por período

```sql
SELECT 
  '2026-04-01' as periodo,
  COUNT(DISTINCT cedula) as cantidad_empleados,
  (SELECT COUNT(*) FROM Ocasionales WHERE periodo = '2026-04-01 / 2026-04-15') as ocasionales,
  (SELECT COUNT(*) FROM Fijas WHERE periodo LIKE '2026-04%') as fijas_activas,
  (SELECT COUNT(*) FROM Ausencias WHERE periodo = '2026-04') as ausencias,
  (SELECT SUM(valor) FROM Ocasionales WHERE periodo = '2026-04-01 / 2026-04-15') as total_ocasionales,
  (SELECT SUM(valor) FROM Fijas WHERE periodo LIKE '2026-04%') as total_descuentos;
```

### Listado completo por empleado

```sql
SELECT 
  o.cedula,
  o.nombre,
  COUNT(DISTINCT o.id) as ocasionales_count,
  ISNULL(SUM(o.valor), 0) as ocasionales_total,
  (SELECT COUNT(*) FROM Fijas f WHERE f.cedula = o.cedula) as fijas_count,
  (SELECT ISNULL(SUM(valor), 0) FROM Fijas f WHERE f.cedula = o.cedula AND finicial <= GETDATE() AND (ffinal IS NULL OR ffinal >= GETDATE())) as fijas_total,
  (SELECT COUNT(*) FROM Ausencias a WHERE a.cedula = o.cedula AND MONTH(a.finicial) = MONTH(GETDATE())) as ausencias_mes,
  (SELECT ISNULL(SUM(dias), 0) FROM Ausencias a WHERE a.cedula = o.cedula AND MONTH(a.finicial) = MONTH(GETDATE())) as dias_ausencia_mes
FROM Ocasionales o
WHERE o.periodo LIKE '2026-04%'
GROUP BY o.cedula, o.nombre
ORDER BY o.nombre;
```

### Dashboard ejecutivo

```sql
SELECT 
  'Ocasionales Registrados' as metrica,
  COUNT(*) as valor
FROM Ocasionales
WHERE MONTH(fechaRegistro) = MONTH(GETDATE())
UNION ALL
SELECT 'Fijas Activas' as metrica, COUNT(*) as valor
FROM Fijas
WHERE finicial <= GETDATE() AND (ffinal IS NULL OR ffinal >= GETDATE())
UNION ALL
SELECT 'Ausencias Este Mes' as metrica, COUNT(*) as valor
FROM Ausencias
WHERE MONTH(finicial) = MONTH(GETDATE())
UNION ALL
SELECT 'Total Ocasionales' as metrica, CAST(ISNULL(SUM(valor), 0) as INT) as valor
FROM Ocasionales
WHERE MONTH(fechaRegistro) = MONTH(GETDATE())
UNION ALL
SELECT 'Total Descuentos' as metrica, CAST(ISNULL(SUM(valor), 0) as INT) as valor
FROM Fijas
WHERE finicial <= GETDATE() AND (ffinal IS NULL OR ffinal >= GETDATE());
```

---

## Auditoría

### Ver log de cambios
```sql
SELECT 
  id, usuario, accion, tabla, recordId,
  detalles, fechaAccion
FROM UsuariosLog
ORDER BY fechaAccion DESC;
```

### Cambios por tabla
```sql
SELECT 
  tabla,
  COUNT(*) as cantidad_cambios,
  COUNT(DISTINCT usuario) as usuarios_diferentes,
  MAX(fechaAccion) as ultimo_cambio
FROM UsuariosLog
GROUP BY tabla
ORDER BY cantidad_cambios DESC;
```

### Cambios por usuario
```sql
SELECT 
  usuario,
  COUNT(*) as cantidad_cambios,
  COUNT(DISTINCT tabla) as tablas_modificadas,
  MAX(fechaAccion) as ultimo_cambio
FROM UsuariosLog
GROUP BY usuario
ORDER BY cantidad_cambios DESC;
```

---

## Mantenimiento

### Limpiar registros antiguos (cuidado!)
```sql
-- SOLO PARA REGISTROS HISTÓRICOS
DELETE FROM Ocasionales
WHERE fechaRegistro < DATEADD(YEAR, -1, GETDATE());

DELETE FROM Ausencias
WHERE ffinal < DATEADD(YEAR, -1, GETDATE());
```

### Calcular espacio usado
```sql
EXEC sp_spaceused 'Ocasionales';
EXEC sp_spaceused 'Fijas';
EXEC sp_spaceused 'Ausencias';
EXEC sp_spaceused 'UsuariosLog';
```

### Reindexar tablas
```sql
-- Reindexar tabla
DBCC DBREINDEX ('Ocasionales', '', 80);
DBCC DBREINDEX ('Fijas', '', 80);
DBCC DBREINDEX ('Ausencias', '', 80);

-- Actualizar estadísticas
UPDATE STATISTICS Ocasionales;
UPDATE STATISTICS Fijas;
UPDATE STATISTICS Ausencias;
```

---

## Exportar Datos

### Exportar a CSV (en SQL Server Management Studio)
```sql
-- Establece el cliente de salida a texto
SELECT 
  cedula, nombre, novedad, tipo, valor, periodo
FROM Ocasionales
WHERE periodo = '2026-04-01 / 2026-04-15'
ORDER BY nombre;
-- Results to: File → Ctrl+Shift+F (Save Results)
```

### Exportar con formato Excel-friendly
```sql
SELECT 
  cedula as [Cédula],
  nombre as [Nombre],
  novedad as [Novedad],
  tipo as [Tipo],
  cantidad as [Cantidad],
  valor as [Valor $],
  periodo as [Período],
  FORMAT(fechaRegistro, 'yyyy-MM-dd HH:mm') as [Fecha Registro]
FROM Ocasionales
WHERE periodo LIKE '2026-04%'
ORDER BY nombre;
```

---

## Backup y Restore

### Crear backup
```sql
BACKUP DATABASE [MineDax]
TO DISK = 'C:\Backups\MineDax_2026_04_09.bak'
WITH FORMAT, INIT, NAME = 'Backup Nómina 2026-04-09';
```

### Restaurar desde backup
```sql
RESTORE DATABASE [MineDax]
FROM DISK = 'C:\Backups\MineDax_2026_04_09.bak'
WITH REPLACE;
```

---

**Última actualización:** 2026-04-09

💡 **Consejo:** Guarda estas queries en una carpeta Favoritos de SSMS para acceso rápido.
