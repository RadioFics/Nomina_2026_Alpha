# DATABASE_SETUP_ORDER — MineDax · Guía de Base de Datos

> **Última actualización:** Mayo 2026  
> **Aplica a:** SQL Server Express, base de datos `MineDax`

---

## ⚠️ Archivos LEGACY (NO ejecutar)

Los siguientes archivos son prototipos de la fase inicial de diseño. Sus esquemas
**no coinciden** con la base de datos real y ejecutarlos puede romper el sistema:

| Archivo | Por qué no ejecutar |
|---|---|
| `database/auth_schema.sql` | Define `GN_USUAR` con `ID_USUAR` (GUID) y `CEDULA` — la BD real usa `COD_USUA` (INT) y `DIR_ELEC` |
| `database/schema.sql` | Crea tablas `Ocasionales`/`Fijas` en camelCase — las tablas reales son `NO_NOVED`/`NO_FIJAS` |

---

## Estructura real de GN_USUAR

La tabla de usuarios que usan `authController.js` y `authMiddleware.js`:

```sql
-- Columnas que el código espera encontrar en GN_USUAR
COD_USUA      -- PK, código entero del usuario
COD_EMPR      -- FK empresa
DIR_ELEC      -- Email (usado como login)
NOM_USUA      -- Nombre del usuario
PASSW_HASH    -- Hash bcrypt de la contraseña
IND_BLOQ      -- 'S' = bloqueado, 'N' = activo
INT_FALL      -- Contador de intentos fallidos (se bloquea en >= 5)
COD_GUSU      -- FK a GN_GUSU (grupo/nivel de acceso)
FEC_ULCA      -- Fecha último cambio / intento
```

**Grupos de usuario (GN_GUSU):**

| COD_GUSU | Descripción | Acceso |
|---|---|---|
| 1 | Empleado | Solo sus propios datos |
| 2 | Supervisor | Datos de su área |
| 3 | Administrador | Acceso total (base de datos, importación, etc.) |

---

## Tablas reales del módulo de nómina

Las tablas que el código de Express realmente lee y escribe:

| Tabla | Propósito |
|---|---|
| `GN_TERCE` | Terceros (empleados, proveedores) — identificados por `COD_TERC` |
| `GN_FUNCI` | Funcionarios — FK a `GN_TERCE`, incluye `NUM_IDEN` (cédula), cargo, empresa |
| `GN_USUAR` | Usuarios del sistema — FK a `GN_TERCE` via `COD_USUA` |
| `GN_GUSU` | Grupos de usuario (niveles de acceso) |
| `NO_PERIOD` | Períodos de nómina activos |
| `NO_NOVED` | Novedades ocasionales (`ACT_USUA`, `COD_NOVE`, etc.) |
| `NO_FIJAS` | Novedades fijas (préstamos, deducciones recurrentes) |
| `NO_AUSEN` | Ausencias (permisos, vacaciones, incapacidades) |
| `GN_PERMI` | Permisos por módulo y grupo (`IND_ACCE = 'S'/'N'`) |
| `GN_LOG_ACCE` | Log de accesos y eventos de seguridad |

---

## Orden de ejecución (si se crea la BD desde cero en el VPS)

> **Nota:** La base de datos `MineDax` ya existe en el servidor de producción.
> Este orden aplica si se necesita recrear desde cero en un entorno de prueba.

**Paso 1 — Crear la BD y el usuario SQL:**
```
sql/CREAR_USUARIO_SQL.sql
```

**Paso 2 — Crear las tablas maestras (si no existen):**
```
sql/setup-bd.sql
```

**Paso 3 — Migrations de novedades:**
```
database/migration_novedades.sql
database/migration_ocasionales.sql
database/migration_fijas_ausen_cambi.sql
```

**Paso 4 — Poblar tablas de referencia (EPS, CCF, ARL):**
```
sql/poblar_MAE_EPS_CCF.sql
sql/poblar_MAE_ARL.sql
```

**Paso 5 — Verificar integridad:**
```
sql/DIAGNOSTICO_MINEDAX.sql
sql/DIAGNOSTICO_USUARIOS.sql
```

---

## Scripts de utilidad (uso puntual, no de setup)

| Archivo | Cuándo usar |
|---|---|
| `sql/QUERIES_UTILES.sql` | Consultas de diagnóstico del día a día |
| `sql/SCRIPT_REPARACION_LOGIN_HL.sql` | Reparar login de un usuario específico |
| `sql/VALIDACION_COMPLETA_TODOS_USUARIOS.sql` | Verificar estado de todos los usuarios |
| `sql/VERIFICAR_LOGIN_FUNCIONANDO.sql` | Test rápido de autenticación |
| `scripts/limpiar_duplicados_excel_noved.sql` | Limpieza puntual de duplicados en novedades |
| `scripts/importar_novedades_pdf_feb2026.sql` | Importación histórica Feb 2026 (one-shot) |
| `scripts/fix_vista_ausen_y_laura_noved2640.sql` | Corrección puntual aplicada — no re-ejecutar |
| `fix_estciv.sql` / `fix_estciv_bd.sql` | Corrección de estado civil — ya aplicada |

---

## Convención de nombres de columnas

El sistema usa la convención `TIPO_NOMBRE` con 3+4 caracteres:

- `COD_` → Código (FK o PK de tipo entero)
- `NOM_` → Nombre o descripción corta
- `IND_` → Indicador booleano (valor: `'S'` o `'N'`)
- `FEC_` → Fecha
- `DIR_` → Dirección o path (incluye email: `DIR_ELEC`)
- `INT_` → Entero contador
- `ACT_` → Actor que realizó la acción
- `TIP_` → Tipo / categoría
- `VAL_` → Valor monetario o numérico
