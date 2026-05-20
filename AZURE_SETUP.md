# MineDax — Guía de Migración a Azure (Producción)

> **Estado actual:** La URL `icy-desert-0deb16c10.7.azurestaticapps.net` muestra un HTML estático
> porque está publicada en **Azure Static Web Apps**, que solo sirve archivos HTML/CSS/JS sin servidor.
> El servicio correcto (ya creado) es **Azure App Service → NominaCollectiveMining**.

---

## Diagnóstico de los 4 problemas críticos

| # | Problema | Impacto | Solución |
|---|----------|---------|----------|
| 1 | Desplegado en **Static Web Apps** (wrong service) | El servidor Node.js nunca arranca | Usar la URL de App Service: `nominacollectivemining.azurewebsites.net` |
| 2 | Workflow usaba **Node.js 4.8** (debería ser 18) | El `npm install` fallaba | Corregido en `main_nominacollectivemining.yml` |
| 3 | Base de datos en **localhost** | No accesible desde Azure | Migrar a Azure SQL Database |
| 4 | `encrypt: false` en config BD | Azure SQL rechaza conexiones sin cifrar | Corregido en `config/database.js` |

---

## Arquitectura objetivo

```
Internet (usuarios)
        │
        ▼
  Azure App Service (Linux)          ← NominaCollectiveMining.azurewebsites.net
  Node.js 18 + Python 3.11
  server.js → login.html (raíz)
        │
        ├─ /api/*  →  Express routes
        ├─ /solicitud/permiso   →  public/solicitud-permiso.html   (sin login)
        ├─ /solicitud/vacaciones →  public/solicitud-vacaciones.html (sin login)
        │
        ▼
  Azure SQL Database                 ← minedax-server.database.windows.net
  Base de datos: MineDax
  (migración desde SQL Server Express local)
```

---

## FASE 1 — Crear la base de datos en Azure

### 1.1 Crear Azure SQL Database (gratis para cuentas nuevas)

1. Ir a [portal.azure.com](https://portal.azure.com)
2. **Crear recurso** → buscar "SQL Database"
3. Configurar:
   - **Suscripción**: la misma del App Service
   - **Grupo de recursos**: el mismo del proyecto
   - **Nombre de base de datos**: `MineDax`
   - **Servidor**: crear nuevo → nombre único (ej. `minedax-server`)
     - Región: la más cercana (East US 2 o similar)
     - Autenticación: **SQL Server auth**
     - Administrador: p.ej. `minedax_admin`
     - Contraseña: una contraseña fuerte (guárdarla)
   - **Proceso + almacenamiento**: Serverless → Propósito general → 1 vCore
     - ✅ **Pausa automática**: habilitada (gratis cuando no se usa)
4. Revisar y crear

> **Costo estimado**: ~$0–5/mes con pausa automática y uso bajo.
> Para cuentas nuevas: 100,000 vCore-segundos gratis por mes (12 meses).

### 1.2 Configurar el firewall de Azure SQL

En el recurso del servidor SQL creado:

1. **Configuración** → **Redes** → **Reglas de firewall**
2. Activar: ✅ **Permitir que los servicios y recursos de Azure accedan a este servidor**
3. Guardar

> Esto permite que el App Service se conecte a la BD sin configurar IPs estáticas.

---

## FASE 2 — Migrar la base de datos local a Azure SQL

### 2.1 Exportar desde SQL Server Express local

En SQL Server Management Studio (SSMS) o Azure Data Studio:

```sql
-- En tu servidor local: generar script completo con datos
-- Clic derecho en base de datos MineDax → Tareas → Generar scripts
-- Opciones: "Tipos de datos para script" = "Esquema y datos"
-- Guardar como MineDax_export.sql
```

O usar `sqlcmd`:
```powershell
sqlcmd -S localhost\SQLEXPRESS -d MineDax -Q "SELECT 1" -o test.txt
# Si funciona, exportar con bcp o SSMS
```

### 2.2 Importar a Azure SQL

**Opción A — SSMS (recomendado):**
1. Conectar a `minedax-server.database.windows.net` con el usuario admin
2. Abrir el archivo `MineDax_export.sql`
3. Cambiar la primera línea: eliminar `USE [MineDax]` (Azure SQL no lo necesita)
4. Ejecutar el script

**Opción B — Azure Data Studio:**
1. Nueva conexión: servidor = `minedax-server.database.windows.net`
2. Abrir y ejecutar el script de exportación

**Opción C — bacpac (si el BD es grande):**
```powershell
# En tu máquina local:
SqlPackage /Action:Export /SourceServerName:"localhost\SQLEXPRESS" /SourceDatabaseName:MineDax /TargetFile:MineDax.bacpac

# Luego importar a Azure:
SqlPackage /Action:Import /TargetServerName:"minedax-server.database.windows.net" /TargetDatabaseName:MineDax /SourceFile:MineDax.bacpac /TargetUser:minedax_admin /TargetPassword:TU_CONTRASEÑA
```

---

## FASE 3 — Configurar Azure App Service

### 3.1 Verificar que el App Service sea Linux con Node.js 18

En el portal de Azure → App Service **NominaCollectiveMining**:

1. **Configuración** → **Configuración general**
   - Stack de runtime: **Node**
   - Versión de Node.js: **18 LTS**
   - Sistema operativo: **Linux** (si es Windows, considerar recrear como Linux)
2. Guardar

> Si el App Service actual es Windows, la migración a Linux es la opción recomendada
> porque Python funciona más fácilmente en Linux. Crear un nuevo App Service Linux
> con el mismo nombre o un nombre nuevo.

### 3.2 Configurar el comando de inicio

En **Configuración** → **Configuración general** → **Comando de inicio**:
```
bash /home/site/wwwroot/startup.sh
```

Esto ejecuta el archivo `startup.sh` que ya está en el repositorio, el cual:
- Instala `pypdf` y `reportlab` (para los PDFs de permisos y vacaciones)
- Lanza `node server.js`

### 3.3 Configurar variables de entorno (App Settings)

En **Configuración** → **Variables de entorno** → **Configuración de la aplicación**,
agregar cada una de las siguientes variables (equivalentes al archivo `.env` local):

| Nombre | Valor de ejemplo | Descripción |
|--------|-----------------|-------------|
| `NODE_ENV` | `production` | Activa encrypt:true en BD y modo producción |
| `SERVER` | `minedax-server.database.windows.net` | Servidor Azure SQL |
| `DATABASE` | `MineDax` | Nombre de la base de datos |
| `UID` | `minedax_admin` | Usuario SQL |
| `PWD` | `TuContraseñaSegura` | Contraseña SQL |
| `PORT` | `3000` | Puerto (Azure lo mapea automáticamente) |
| `JWT_SECRET` | `cadena-aleatoria-de-64-chars` | Clave JWT — generar nueva, no la local |
| `MAIL_USER` | `nomina.collectivemining@gmail.com` | Correo de envío |
| `MAIL_PASS` | `contraseña-de-aplicacion-gmail` | Contraseña de aplicación de Gmail |
| `MAIL_RRHH` | `talento.humano@collectivemining.com` | Correo receptor de solicitudes |
| `APP_URL` | `https://nominacollectivemining.azurewebsites.net` | URL pública de la app |
| `PYTHON_PATH` | *(dejar vacío)* | En Linux Azure: python3 se detecta automáticamente |

> **Importante:** `MAIL_PASS` debe ser una **Contraseña de aplicación** de Google
> (no la contraseña de la cuenta). Crear en: myaccount.google.com → Seguridad → Verificación en dos pasos → Contraseñas de aplicaciones.

Guardar y reiniciar el App Service.

---

## FASE 4 — Activar el CI/CD correcto

### 4.1 Deshabilitar Azure Static Web Apps

El workflow `azure-static-web-apps-icy-desert-0deb16c10.yml` ya está deshabilitado
(contiene comentarios que lo inactivan). No hace falta borrarlo.

La URL `icy-desert-0deb16c10.7.azurestaticapps.net` seguirá existiendo pero ya
no es la URL de producción. La URL correcta es:

```
https://nominacollectivemining.azurewebsites.net
```

### 4.2 Hacer push para activar el deploy

El workflow `main_nominacollectivemining.yml` ya fue corregido (Node 18, Python 3.11,
Linux runner). Para activarlo:

```bash
git add .github/workflows/main_nominacollectivemining.yml
git add config/database.js
git add startup.sh
git commit -m "fix: corregir workflow Azure (Node 18 + Python) y config BD para Azure SQL"
git push origin main
```

Ir a GitHub → Actions para ver el progreso del deploy.

### 4.3 Verificar el deploy

Una vez completado el deploy:

```bash
# Health check
curl https://nominacollectivemining.azurewebsites.net/api/health

# Respuesta esperada:
# {"status":"OK","message":"Servidor de nómina funcionando"}
```

La raíz (`/`) debe cargar `login.html` automáticamente.

---

## FASE 5 — Formularios públicos (Objetivo 3)

Los formularios de permiso y vacaciones ya están configurados para funcionar
de forma independiente (sin login). Están en:

- `/solicitud/permiso` → `public/solicitud-permiso.html`
- `/solicitud/vacaciones` → `public/solicitud-vacaciones.html`

**Flujo completo en Azure:**

```
Empleado abre el link público
        │
        ▼
Formulario HTML (sin autenticación)
        │  POST /api/solicitudes/permiso  o  /vacaciones
        ▼
solicitudesController.js
  ├─ Guarda en BD (Azure SQL: tabla ausentismos/vacaciones)
  ├─ Llama python3 rellenar_pdf.py → genera PDF oficial
  ├─ Envía correo con PDF adjunto (nodemailer → Gmail)
  └─ (Opcional) Sube PDF a SharePoint si SP_* vars están configuradas
```

**Los links para distribuir a los empleados:**
```
https://nominacollectivemining.azurewebsites.net/solicitud/permiso
https://nominacollectivemining.azurewebsites.net/solicitud/vacaciones
```

Estos links funcionan 24/7, sin que nadie esté conectado al servidor local.

---

## FASE 6 — Validación final

Después de completar todo, verificar:

- [ ] `https://nominacollectivemining.azurewebsites.net` carga `login.html`
- [ ] `/api/health` responde `{"status":"OK"}`
- [ ] Login con credenciales existentes funciona
- [ ] `/solicitud/permiso` carga el formulario sin login
- [ ] Enviar una solicitud de prueba y verificar que llega el correo con PDF
- [ ] El módulo de novedades (`/index_novedades.html`) carga correctamente
- [ ] Importar un PDF de novedades y verificar que se guarda en Azure SQL

---

## Solución de problemas comunes

### Error: "Cannot connect to database"
- Verificar que las variables `SERVER`, `DATABASE`, `UID`, `PWD` están en App Settings
- Verificar que el firewall de Azure SQL permite servicios de Azure
- El `SERVER` debe ser `tuservidor.database.windows.net` (sin `\SQLEXPRESS`)

### Error: "python3 not found" en los PDFs
- Verificar que el **Comando de inicio** está configurado: `bash /home/site/wwwroot/startup.sh`
- Revisar los logs: App Service → **Secuencia de registro** o **Log stream**

### La app carga pero sin estilos / funciona mal
- Vaciar caché del navegador (Ctrl+Shift+R)
- Verificar que `APP_URL` apunta a la URL de Azure (no a localhost)

### Los correos no se envían
- Verificar `MAIL_USER` y `MAIL_PASS` en App Settings
- `MAIL_PASS` debe ser una Contraseña de Aplicación de Google, no la contraseña normal
- Activar "Verificación en dos pasos" en la cuenta de Gmail primero

---

## Resumen de archivos modificados en esta sesión

| Archivo | Cambio |
|---------|--------|
| `.github/workflows/main_nominacollectivemining.yml` | Node 4.8→18, Python 3.11, Linux runner, zip correcto |
| `config/database.js` | `buildConfig()`: encrypt automático según NODE_ENV / host Azure SQL |
| `startup.sh` | Nuevo — instala pip deps y arranca Node para Azure App Service |
| `AZURE_SETUP.md` | Este documento |
