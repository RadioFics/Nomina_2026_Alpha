# Novedades Nómina — Collective Mining / Adecco
## Sistema de captura de novedades → MS SQL Server 2022/2025

---

## Contenido del paquete

| Archivo | Descripción |
|---|---|
| `index.html` | Aplicación web (abrir en cualquier navegador, sin servidor) |
| `schema_novedades.sql` | Script T-SQL para crear la BD en SQL Server |
| `import_excel.py` | Script Python para importar el .xlsx directamente a SQL Server |
| `README.md` | Este documento |

---

## Paso 1 — Crear la base de datos

Abra **SQL Server Management Studio** o **Azure Data Studio** y ejecute:

```sql
-- En SSMS: Archivo → Abrir → schema_novedades.sql
-- Luego: F5 o botón "Ejecutar"
```

Esto crea la BD `NovedadesNomina` con las tablas:

| Tabla | Hoja Excel |
|---|---|
| `Empleados` | Maestro Original |
| `NovedadesOcasionales` | Ocasionales |
| `NovedadesFijas` | Fijas |
| `Ausentismos` | Ausentismos Vacaciones |
| `CambiosMaestro` | Cambios Maestro |
| `CambiosIngresos` | Cambios e Ingresos |

---

## Paso 2 — Usar la aplicación web

Abra `index.html` en su navegador (doble clic).  
No requiere instalación ni servidor web.

**Módulos disponibles:**
- **Ocasionales** — Horas extra, bonificaciones, préstamos
- **Fijas** — AFC, APV, deducciones periódicas
- **Ausentismos** — Incapacidades, vacaciones, licencias
- **Cambios Maestro** — Actualización datos personales
- **Cambios e Ingresos** — Cambios de cargo, salario, nuevos ingresos

Al finalizar, use el botón **"Exportar SQL"** para generar el script INSERT.

---

## Paso 3 — Importar Excel automáticamente (opcional)

Instale las dependencias Python:

```bash
pip install pandas openpyxl pyodbc
```

Instale el driver ODBC:  
👉 https://learn.microsoft.com/en-us/sql/connect/odbc/download-odbc-driver-for-sql-server

**Windows Authentication:**
```bash
python import_excel.py \
  --file "FORMATO_LIBRE_-_NOVEDADES_SIN_CLAVE.xlsx" \
  --server localhost \
  --db NovedadesNomina \
  --periodo "2025-03-01/2025-03-15" \
  --usuario "nombre.usuario"
```

**SQL Server Authentication:**
```bash
python import_excel.py \
  --file "FORMATO_LIBRE_-_NOVEDADES_SIN_CLAVE.xlsx" \
  --server 192.168.1.10 \
  --db NovedadesNomina \
  --user sa \
  --password miContraseña \
  --periodo "2025-03-01/2025-03-15"
```

**Modo DRY RUN** (solo verifica sin insertar):
```bash
python import_excel.py --file archivo.xlsx --server localhost --dryrun
```

---

## Consultas SQL útiles

```sql
-- Ver todas las novedades ocasionales del período
SELECT e.Nombre, e.Cargo, o.Novedad, o.TipoNovedad, o.Cantidad, o.Valor
FROM dbo.NovedadesOcasionales o
JOIN dbo.Empleados e ON e.Cedula = o.Identificacion
WHERE o.PeriodoNomina = '2025-03-01/2025-03-15';

-- Resumen por tipo de ausentismo
SELECT TipoAusentismo, COUNT(*) AS Casos, SUM(DiasTotales) AS TotalDias
FROM dbo.Ausentismos
GROUP BY TipoAusentismo ORDER BY Casos DESC;

-- Total de novedades por empleado
SELECT e.Nombre, e.Cargo,
  (SELECT COUNT(*) FROM dbo.NovedadesOcasionales WHERE Identificacion = e.Cedula) AS Ocasionales,
  (SELECT COUNT(*) FROM dbo.NovedadesFijas WHERE Identificacion = e.Cedula) AS Fijas,
  (SELECT COUNT(*) FROM dbo.Ausentismos WHERE Identificacion = e.Cedula) AS Ausentismos
FROM dbo.Empleados e ORDER BY e.Nombre;
```

---

## Soporte

Este sistema fue generado para el formato **ADECCO — Collective Mining**.  
Compatible con: **SQL Server 2019, 2022, 2025**.
