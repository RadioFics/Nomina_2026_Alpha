# Guía de Configuración — Formularios de Permiso y Vacaciones en Azure

**Proyecto:** NominaCollectiveMining  
**App Service URL:** https://nominacollectivemining.azurewebsites.net  
**Actualizado:** Mayo 2026

---

## Visión general

Los formularios tienen **dos implementaciones** que coexisten en el proyecto:

| Ruta pública | Backend | Integración BD | PDF |
|---|---|---|---|
| `/solicitud/permiso` | `solicitudesController.js` | Escribe en NO_NOVED + NO_AUSEN | Python (`rellenar_pdf.py`) con plantilla oficial |
| `/solicitud/vacaciones` | `solicitudesController.js` | Escribe en NO_NOVED + NO_AUSEN | Python con plantilla oficial |
| `/formulario/permiso` | `formularioController.js` | Escribe en FORM_SOLICITUDES | Node.js (`pdfkit`) sin plantilla |
| `/formulario/vacaciones` | `formularioController.js` | Escribe en FORM_SOLICITUDES | Node.js (`pdfkit`) sin plantilla |

**Recomendación de uso:**
- Usar **`/solicitud/`** como URL principal (integra con el sistema de nómina).
- Usar **`/formulario/`** como respaldo si Python falla en Azure.

Las URLs completas de producción serán:
```
https://nominacollectivemining.azurewebsites.net/solicitud/permiso
https://nominacollectivemining.azurewebsites.net/solicitud/vacaciones
```

---

## PASO 1 — Instalar dependencia pdfkit

`pdfkit` ya fue agregado a `package.json`. Solo hay que instalarlo localmente y hacer commit.

```bash
# En la raíz del proyecto
npm install
git add package.json package-lock.json
git commit -m "feat: agregar pdfkit para generación PDF alternativa"
```

---

## PASO 2 — Configurar variables de entorno en Azure

Estas variables deben configurarse en el **App Service → Configuración → Configuración de la aplicación** del portal de Azure. **No se deben subir al repositorio.**

### Variables obligatorias (ya deberían existir)

| Variable | Descripción | Ejemplo |
|---|---|---|
| `SERVER` | Servidor Azure SQL | `tu-servidor.database.windows.net` |
| `DATABASE` | Nombre de la base | `MineDax` |
| `UID` | Usuario SQL | `nominauser` |
| `PWD` | Contraseña SQL | `(contraseña segura)` |
| `JWT_SECRET` | Clave JWT | `(string 32+ chars aleatorio)` |
| `MAIL_USER` | Gmail para envío | `nomina@collectivemining.com` |
| `MAIL_PASS` | Contraseña de app Gmail | `xxxx xxxx xxxx xxxx` |

### Variables nuevas necesarias para formularios

| Variable | Descripción | Ejemplo |
|---|---|---|
| `MAIL_RRHH` | Correo de Talento Humano que recibe las solicitudes | `talento.humano@collectivemining.com` |
| `APP_URL` | URL pública del App Service | `https://nominacollectivemining.azurewebsites.net` |

### Variables opcionales — SharePoint (si se quiere guardar PDFs en SharePoint)

| Variable | Descripción |
|---|---|
| `SP_TENANT_ID` | ID del directorio en Azure AD |
| `SP_CLIENT_ID` | ID de la aplicación registrada en Azure |
| `SP_CLIENT_SECRET` | Secreto de cliente |
| `SP_DRIVE_ID` | ID del Drive de SharePoint destino |
| `SP_FOLDER_PATH` | Carpeta dentro del Drive (ej: `Solicitudes_TH`) |

> Si estas variables SP_* no están presentes, la subida a SharePoint se omite silenciosamente y el flujo (correos + BD) continúa con normalidad.

### Cómo configurar en el Portal de Azure

1. Ir a: **Portal Azure → App Services → NominaCollectiveMining**
2. En el menú izquierdo: **Configuración → Configuración de la aplicación**
3. Clic en **"+ Nueva configuración de aplicación"** por cada variable
4. Ingresar el nombre y valor
5. Clic en **Guardar** al final (el App Service se reinicia automáticamente)

---

## PASO 3 — Configurar Python en Azure (para formularios `/solicitud/`)

Este es el paso más crítico. El formulario principal usa Python para rellenar las plantillas PDF oficiales. Hay dos enfoques:

### Opción A — Instalar Python via Site Extensions (Recomendada)

1. Ir a: **Portal Azure → App Services → NominaCollectiveMining → Herramientas de desarrollo → Extensiones**
2. Clic en **"+ Agregar"**
3. Buscar **"Python 3.8"** y seleccionarlo
4. Esperar a que se instale (puede tardar 2-3 minutos)
5. Una vez instalado, agregar la variable de entorno:
   - **Nombre:** `PYTHON_PATH`
   - **Valor:** `D:\home\site\ext\Python385x86\python.exe`
     *(verificar la ruta exacta desde Kudu: `https://nominacollectivemining.scm.azurewebsites.net/DebugConsole`)*
6. Agregar también:
   - **Nombre:** `PYTHONPATH`
   - **Valor:** `D:\home\site\pythonpkgs`
7. Agregar el script de instalación de dependencias. En **Kudu** (consola):
   ```
   D:\Python385x86\python.exe -m pip install pypdf2 reportlab fpdf2 --target D:\home\site\pythonpkgs
   ```

### Verificar Python desde el endpoint de diagnóstico

Después de configurar, visitar:
```
https://nominacollectivemining.azurewebsites.net/api/health/python
```
El campo `recomendacion` indicará el valor correcto para `PYTHON_PATH`.

### Opción B — Usar formulario alternativo con pdfkit (sin Python)

Si Python no funciona en Azure o se prefiere evitar esa complejidad, usar las rutas `/formulario/` en lugar de `/solicitud/`. El PDF se genera completamente en Node.js con `pdfkit`, sin dependencia de Python.

Diferencia clave: los formularios `/formulario/` no validan que el empleado exista en la BD ni escriben en las tablas de nómina (NO_NOVED). Son formularios independientes que guardan en `FORM_SOLICITUDES`.

---

## PASO 4 — Verificar las plantillas PDF

Las plantillas oficiales deben estar en el repositorio en la carpeta `templates/`:

```
templates/
  FORMATO_SOLICITUD_PERMISO.pdf     ← plantilla oficial de permiso
  FORMATO_SOLICITUD_VACACIONES.pdf  ← plantilla oficial de vacaciones
```

Verificar que estos archivos estén incluidos en Git (no en `.gitignore`):

```bash
git ls-files templates/
```

Si no aparecen, agregarlos:
```bash
git add templates/FORMATO_SOLICITUD_PERMISO.pdf
git add templates/FORMATO_SOLICITUD_VACACIONES.pdf
git commit -m "feat: agregar plantillas PDF oficiales de solicitudes"
```

---

## PASO 5 — Deploy al App Service de Azure

### Método A — GitHub Actions (CI/CD automático, Recomendado)

Si el repositorio tiene CI/CD configurado con GitHub Actions:

```bash
git add .
git commit -m "feat: formularios de permiso y vacaciones operativos"
git push origin main
```

El deploy se ejecuta automáticamente al hacer push a `main`.

### Método B — Deploy manual desde VS Code

1. Instalar extensión **"Azure App Service"** en VS Code
2. Clic derecho sobre el App Service `NominaCollectiveMining`
3. Seleccionar **"Deploy to Web App..."**
4. Confirmar la carpeta raíz del proyecto

### Método C — Deploy manual desde Azure CLI

```bash
# Comprimir el proyecto (excluir node_modules)
zip -r deploy.zip . -x "node_modules/*" -x ".git/*" -x ".env"

# Hacer deploy
az webapp deploy \
  --resource-group <tu-resource-group> \
  --name NominaCollectiveMining \
  --src-path deploy.zip \
  --type zip
```

### Método D — ZIP Deploy desde el Portal de Azure (más simple)

1. Ir a: **Portal Azure → App Services → NominaCollectiveMining → Herramientas de desarrollo → Herramientas avanzadas (Kudu)**
2. En Kudu: **Tools → Zip Push Deploy**
3. Arrastrar el ZIP del proyecto (sin `node_modules` ni `.git`)

> **Importante:** Azure App Service ejecuta `npm install` automáticamente después del deploy cuando detecta `package.json`. `pdfkit` se instalará automáticamente.

---

## PASO 6 — Verificar el funcionamiento

### 1. Verificar que el servidor responde

```
GET https://nominacollectivemining.azurewebsites.net/api/health
→ { "status": "OK", "message": "Servidor de nómina funcionando" }
```

### 2. Verificar Python (si se usa /solicitud/)

```
GET https://nominacollectivemining.azurewebsites.net/api/health/python
→ Revisar campo "recomendacion"
```

### 3. Abrir los formularios desde el navegador

| Formulario | URL |
|---|---|
| Permiso (integrado con nómina) | `https://nominacollectivemining.azurewebsites.net/solicitud/permiso` |
| Vacaciones (integrado con nómina) | `https://nominacollectivemining.azurewebsites.net/solicitud/vacaciones` |
| Permiso (alternativo pdfkit) | `https://nominacollectivemining.azurewebsites.net/formulario/permiso` |
| Vacaciones (alternativo pdfkit) | `https://nominacollectivemining.azurewebsites.net/formulario/vacaciones` |

### 4. Probar un envío completo

En el formulario de permiso:
- Ingresar cédula de un empleado activo en la BD
- Completar los campos
- Clic en enviar
- Verificar: (a) PDF se descarga en el dispositivo, (b) llega email a `MAIL_RRHH`, (c) aparece registro en BD

### 5. Verificar en la base de datos

Para `/solicitud/` (integrado):
```sql
SELECT TOP 10 * FROM dbo.NO_NOVED WHERE ACT_USUA = 'SELF_SVC' ORDER BY FEC_REGI DESC;
SELECT TOP 10 * FROM dbo.NO_AUSEN ORDER BY ACT_HORA DESC;
```

Para `/formulario/` (alternativo):
```sql
SELECT TOP 10 * FROM dbo.FORM_SOLICITUDES ORDER BY FEC_REGI DESC;
```

---

## PASO 7 — Compartir los enlaces (opcional)

Los formularios están pensados para ser accesibles desde cualquier dispositivo sin login. Se puede:

- **Compartir el link directo** por WhatsApp o correo: `https://nominacollectivemining.azurewebsites.net/solicitud/permiso`
- **Crear código QR** del link para colocar en carteleras físicas (usar cualquier generador de QR gratuito)
- **Agregar acceso directo** desde la pantalla de inicio de un celular (los formularios están diseñados como PWA-ready)

---

## Resumen de archivos creados/modificados

| Archivo | Tipo | Descripción |
|---|---|---|
| `database/formularios_schema.sql` | Nuevo | Tabla FORM_SOLICITUDES |
| `controllers/formularioController.js` | Nuevo | Controlador alternativo con pdfkit |
| `routes/formularios.js` | Nuevo | Rutas `/api/formularios/*` |
| `formulario_permiso.html` | Nuevo | Formulario público permiso (pdfkit) |
| `formulario_vacaciones.html` | Nuevo | Formulario público vacaciones (pdfkit) |
| `package.json` | Modificado | Agregado `pdfkit ^0.15.0` |
| `server.js` | Modificado | Rutas `/formulario/*` + bootstrap `formularioController` |

---

## Solución de problemas frecuentes

**Error: "Empleado no encontrado"** en `/solicitud/`
→ La cédula ingresada no existe en `GN_TERCE` o `GN_FUNCI` con `ACT_ESTA='A'`. Verificar en la BD.

**PDF no se descarga pero el registro SÍ quedó en BD**
→ Python falló. Usar las rutas `/formulario/` como alternativa o configurar Python en Azure (Paso 3).

**Email no llega a RRHH**
→ Verificar `MAIL_RRHH`, `MAIL_USER` y `MAIL_PASS` en App Settings de Azure. El `MAIL_PASS` debe ser una "contraseña de aplicación" de Gmail (no la contraseña normal).

**Error 500 en `/api/formularios/`**
→ Verificar que `pdfkit` esté instalado. En Kudu: `node -e "require('pdfkit'); console.log('ok')"`.

**El App Service se duerme entre solicitudes**
→ El Logic App `nomina-keepalive` ya maneja esto. Verificar que esté en estado "Activo" en el Portal de Azure.
