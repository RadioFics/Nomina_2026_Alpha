# DEPLOYMENT_CHECKLIST — MineDax · VPS Windows Server

> **Proyecto:** MineDax — Sistema de Nómina Collective Mining  
> **Stack:** Node.js 18+ · Express · SQL Server Express · PM2 · IIS (reverse proxy)  
> **Última actualización:** Mayo 2026

---

## Arquitectura de producción

```
Internet
   │
   ▼
IIS (puerto 80/443)  ← maneja HTTPS/SSL, sirve archivos estáticos
   │  reverse proxy (URL Rewrite + ARR)
   ▼
Node.js / PM2 (puerto 3000)  ← corre MineDax
   │
   ▼
SQL Server Express  ← puede ser:
   ├─ Local en el mismo VPS (CM-VPS-01\SQLEXPRESS)
   └─ On-premise via WireGuard VPN (CM-ITD-P-05\SQLEXPRESS en la LAN)
```

---

## FASE 1 — Preparación local (antes de subir)

### 1.1 Verificar que el código esté limpio

```bash
# En la raíz del proyecto
node validate-env.js          # verifica que .env.example tenga todas las vars documentadas
npm install                   # asegurar que package-lock.json esté actualizado
npm test 2>/dev/null || true  # correr tests si existen
```

- [ ] `validate-env.js` no reporta errores de configuración
- [ ] `package.json` tiene `"start": "node server.js"` en scripts
- [ ] `ecosystem.config.js` existe en la raíz
- [ ] No hay archivos `.env` en el repo (solo `.env.example`)
- [ ] `node_modules/` no está en el commit (cubierto por `.gitignore`)
- [ ] `temp/` no está en el commit
- [ ] GitHub Actions workflow antiguo (Azure Static Web Apps) está deshabilitado

### 1.2 Verificar dependencias Python

```bash
pip install -r requirements.txt --break-system-packages
python python/rellenar_pdf.py --help 2>/dev/null || echo "Script listo"
```

- [ ] `requirements.txt` existe en la raíz
- [ ] `pypdf` y `reportlab` instalan sin errores
- [ ] Plantillas PDF base están en `python/plantillas/` (no se generan, son fijas)

### 1.3 Commit final y push

```bash
git add -A
git status   # revisar que solo va código fuente
git commit -m "chore: pre-deployment audit and fixes"
git push origin main
```

---

## FASE 2 — Configuración del VPS

### 2.1 Software requerido en el VPS

- [ ] **Node.js 18 LTS** o superior
  ```powershell
  node --version   # debe mostrar v18.x.x o superior
  ```
- [ ] **PM2** instalado globalmente
  ```powershell
  npm install -g pm2
  pm2 --version
  ```
- [ ] **Python 3.10+** con pip
  ```powershell
  python --version
  pip --version
  ```
- [ ] **Git** instalado
- [ ] **IIS** con módulos URL Rewrite y ARR (Application Request Routing)
- [ ] **ODBC Driver 17 for SQL Server** (si SQL Server está en otro servidor)

### 2.2 Clonar el repositorio

```powershell
cd C:\inetpub\apps   # o la carpeta que prefieras
git clone https://github.com/TU_ORG/Nomina_2026_Alpha.git minedax
cd minedax
```

### 2.3 Instalar dependencias

```powershell
npm install --omit=dev
pip install -r requirements.txt
```

- [ ] `node_modules/` creado correctamente
- [ ] `pypdf` y `reportlab` instalados en Python del VPS

### 2.4 Crear directorios de runtime

```powershell
mkdir temp    # PDFs temporales (se crean y borran automáticamente)
mkdir logs    # Logs de PM2
```

---

## FASE 3 — Configuración del .env en el VPS

Crear el archivo `.env` **directamente en el VPS** (nunca subirlo al repo):

```powershell
notepad C:\inetpub\apps\minedax\.env
```

Contenido mínimo requerido:

```env
# ─── Base de datos ───────────────────────────────────────────────────────────
# Opción A: SQL Server en el mismo VPS
SERVER=localhost\SQLEXPRESS
# Opción B: SQL Server on-premise via WireGuard VPN (IP del peer WG)
# SERVER=10.10.0.1\SQLEXPRESS

DATABASE=MineDax
UID=minedax_app
PWD=CONTRASEÑA_REAL_AQUI
DRIVER=ODBC Driver 17 for SQL Server

# ─── Servidor ────────────────────────────────────────────────────────────────
PORT=3000
NODE_ENV=production

# ─── JWT (mínimo 32 caracteres aleatorios) ───────────────────────────────────
JWT_SECRET=GENERAR_CON_node_-e_"console.log(require('crypto').randomBytes(48).toString('hex'))"

# ─── Email (Gmail App Password) ──────────────────────────────────────────────
MAIL_USER=nomina@collectivemining.com
MAIL_PASS=xxxx xxxx xxxx xxxx
MAIL_RRHH=talento.humano@collectivemining.com
APP_URL=https://nomina.collectivemining.com

# ─── SharePoint (opcional) ───────────────────────────────────────────────────
SP_TENANT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SP_CLIENT_ID=xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx
SP_CLIENT_SECRET=SECRETO_AZURE
SP_DRIVE_ID=b!XXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXXX
SP_FOLDER_PATH=Solicitudes_TH
```

Verificar la configuración:
```powershell
node validate-env.js
```

- [ ] `validate-env.js` reporta CONFIGURACIÓN VÁLIDA
- [ ] Las variables SP_* están todas presentes o todas ausentes (no a medias)

---

## FASE 4 — Verificar conexión a la base de datos

```powershell
node diagnostico-conexion-bd.js
```

Salida esperada: `✅ Conexión a SQL Server: OK`

Si falla con "Server requires encryption":
- El archivo `config/database.js` ya tiene `encrypt: false` — no cambiar.
- Verificar que el nombre del servidor en `SERVER=` es exactamente el correcto.

Si hay error de autenticación:
```sql
-- En SQL Server Management Studio, verificar:
SELECT name, type_desc FROM sys.sql_logins WHERE name = 'minedax_app';
-- Si no existe:
CREATE LOGIN minedax_app WITH PASSWORD = 'CONTRASEÑA_REAL';
USE MineDax;
CREATE USER minedax_app FOR LOGIN minedax_app;
ALTER ROLE db_datareader ADD MEMBER minedax_app;
ALTER ROLE db_datawriter ADD MEMBER minedax_app;
```

- [ ] `node diagnostico-conexion-bd.js` termina sin errores
- [ ] El usuario SQL `minedax_app` tiene permisos de lectura y escritura en `MineDax`

---

## FASE 5 — WireGuard VPN (si SQL Server está on-premise)

Solo si SQL Server no está en el VPS sino en la red local (CM-ITD-P-05):

### VPS (Peer A)

```ini
# C:\ProgramData\WireGuard\minedax-vpn.conf
[Interface]
PrivateKey = CLAVE_PRIVADA_VPS
Address = 10.10.0.2/30

[Peer]
PublicKey = CLAVE_PUBLICA_SERVIDOR_SQL
AllowedIPs = 10.10.0.1/32
Endpoint = IP_PUBLICA_EMPRESA:51820
PersistentKeepalive = 25
```

### Servidor SQL on-premise (Peer B)

```ini
[Interface]
PrivateKey = CLAVE_PRIVADA_SQL_SERVER
Address = 10.10.0.1/30
ListenPort = 51820

[Peer]
PublicKey = CLAVE_PUBLICA_VPS
AllowedIPs = 10.10.0.2/32
```

Verificar túnel:
```powershell
ping 10.10.0.1          # desde el VPS
# luego ajustar SERVER en .env:
SERVER=10.10.0.1\SQLEXPRESS
```

- [ ] `ping 10.10.0.1` responde desde el VPS
- [ ] `node diagnostico-conexion-bd.js` conecta via VPN
- [ ] WireGuard configurado para arrancar automáticamente con Windows

---

## FASE 6 — Iniciar la aplicación con PM2

```powershell
cd C:\inetpub\apps\minedax
pm2 start ecosystem.config.js --env production
pm2 save
pm2 startup
```

Verificar que está corriendo:
```powershell
pm2 status
pm2 logs minedax --lines 50
```

Probar directamente (antes de conectar IIS):
```powershell
curl http://localhost:3000/health
# o abrir en browser: http://localhost:3000
```

- [ ] `pm2 status` muestra `minedax` en estado `online`
- [ ] Los logs no muestran errores de base de datos ni de módulos faltantes
- [ ] `http://localhost:3000` responde con la app

---

## FASE 7 — IIS como reverse proxy

### 7.1 Crear el sitio en IIS

1. Abrir IIS Manager → Sitios → Agregar sitio web
   - Nombre del sitio: `MineDax`
   - Ruta física: `C:\inetpub\apps\minedax\templates` (para archivos estáticos)
   - Puerto: 80 (o 443 si ya tienes SSL)
   - Nombre de host: `nomina.collectivemining.com`

2. Crear `web.config` en la raíz del sitio IIS:

```xml
<?xml version="1.0" encoding="UTF-8"?>
<configuration>
  <system.webServer>
    <rewrite>
      <rules>
        <rule name="MineDax Proxy" stopProcessing="true">
          <match url="(.*)" />
          <conditions>
            <add input="{CACHE_URL}" pattern="^(https?)://" />
          </conditions>
          <action type="Rewrite" url="http://localhost:3000/{R:1}" />
        </rule>
      </rules>
    </rewrite>
    <proxy enabled="true" />
  </system.webServer>
</configuration>
```

### 7.2 Habilitar ARR proxy

En IIS Manager → (servidor raíz) → Application Request Routing Cache → Server Proxy Settings:
- Marcar "Enable proxy"
- Guardar

### 7.3 SSL/HTTPS (opcional pero recomendado)

```powershell
# Con Let's Encrypt via win-acme:
wacs.exe --target iis --host nomina.collectivemining.com --installation iis
```

O usar certificado corporativo existente.

- [ ] IIS sirve la app en `http://nomina.collectivemining.com`
- [ ] Las rutas `/api/*` y las páginas HTML funcionan
- [ ] Los formularios públicos `/solicitud/permiso` y `/solicitud/vacaciones` responden sin login

---

## FASE 8 — Verificación post-despliegue

### Funcionalidades críticas a probar

```powershell
# 1. Health check
curl http://localhost:3000/health

# 2. Login
curl -X POST http://localhost:3000/auth/login `
  -H "Content-Type: application/json" `
  -d '{"email":"admin@collectivemining.com","password":"PASSWORD"}'

# 3. Formulario de permiso público
curl http://localhost:3000/solicitud/permiso

# 4. Validar env completo
node validate-env.js
```

- [ ] Login devuelve JWT válido
- [ ] Módulo de empleados carga correctamente
- [ ] Módulo de novedades carga y permite crear registros
- [ ] Formulario de permiso envía correo a RRHH (probar con datos reales)
- [ ] PDF se genera correctamente en `temp/` y se adjunta al correo
- [ ] PDF se sube a SharePoint (si SP_* configurado) — verificar en la carpeta `Solicitudes_TH`
- [ ] Los logs de PM2 en `logs/pm2-out.log` no muestran errores

### Verificar PM2 como servicio de Windows

```powershell
# Registrar PM2 para que arranque con Windows
pm2 startup windows
# Copiar y ejecutar el comando que PM2 imprime

# Guardar el estado actual
pm2 save

# Simular reinicio
Restart-Computer -Force
# Después del reinicio, verificar:
pm2 status
```

- [ ] PM2 arranca automáticamente después de reiniciar el VPS
- [ ] `pm2 status` muestra `minedax` online sin intervención manual

---

## FASE 9 — Actualizaciones futuras

Para subir cambios del código después del despliegue inicial:

```powershell
# En el VPS
cd C:\inetpub\apps\minedax
git pull origin main
npm install --omit=dev   # solo si cambiaron dependencias
pm2 restart minedax
pm2 logs minedax --lines 30   # verificar que arrancó bien
```

Si se modifica desde la oficina via VPN independiente:
```powershell
# En el equipo local: push normal a GitHub
git add -A && git commit -m "fix: descripción del cambio" && git push

# En el VPS (puede hacerse via SSH o RDP):
cd C:\inetpub\apps\minedax && git pull && pm2 restart minedax
```

---

## Resumen de puertos y firewall

| Puerto | Protocolo | Qué hace | ¿Abierto al exterior? |
|---|---|---|---|
| 3000 | TCP | Node.js / MineDax | ❌ Solo localhost (IIS hace proxy) |
| 80 | TCP | IIS HTTP | ✅ Sí |
| 443 | TCP | IIS HTTPS | ✅ Sí (si hay SSL) |
| 51820 | UDP | WireGuard VPN | ✅ Solo si SQL está on-premise |
| 1433 | TCP | SQL Server | ❌ Solo localhost o VPN |

---

## Contacto y soporte

- **Desarrollador principal:** Juan Esteban Calle — juanescallepalmett@gmail.com
- **Repositorio:** `Nomina_2026_Alpha` (GitHub privado Collective Mining)
- **Docs adicionales:** `DATABASE_SETUP_ORDER.md`, `formularios_automatizacion/GUIA_IMPLEMENTACION.md`
