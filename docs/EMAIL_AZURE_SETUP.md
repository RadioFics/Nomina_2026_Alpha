# Configuración de Email — Azure App Settings

## Problema raíz

El sistema de recuperación/verificación de contraseñas usa la cuenta Gmail
`nomina.collectivemining@gmail.com` para enviar correos. En Azure, estas
credenciales deben configurarse como **Application Settings** (variables de
entorno) — no en el archivo `.env`, que está ignorado por Git y no se sube al
servidor.

---

## Paso 1 — Generar una App Password en Gmail

Google **no permite** usar la contraseña normal de Gmail en aplicaciones de
terceros desde 2022. Se requiere una **Contraseña de aplicación** (App Password),
que es un código de 16 caracteres generado específicamente para esta app.

### Requisito previo: 2FA activa en la cuenta Gmail

1. Abre [myaccount.google.com](https://myaccount.google.com) con la cuenta
   `nomina.collectivemining@gmail.com`.
2. Ve a **Seguridad** → **Verificación en dos pasos** → actívala si no está.

### Generar la App Password

1. En **Seguridad**, busca **Contraseñas de aplicación** (o ve directamente a
   [myaccount.google.com/apppasswords](https://myaccount.google.com/apppasswords)).
2. En *Seleccionar aplicación* elige **Correo**.
3. En *Seleccionar dispositivo* elige **Otro** y escribe `MineDax Azure`.
4. Haz clic en **Generar**.
5. Google mostrará un código de **16 letras** en grupos de 4, por ejemplo:
   ```
   abcd efgh ijkl mnop
   ```
6. **Cópialo completo** (con o sin espacios — el sistema los elimina
   automáticamente).

> ⚠️ Este código solo se muestra una vez. Si lo pierdes, genera uno nuevo.

---

## Paso 2 — Configurar las variables en Azure Portal

Ruta: **Azure Portal → App Services → nominacollectivemining → Configuration
→ Application settings → + New application setting**

Agrega las siguientes tres variables:

| Nombre | Valor | Descripción |
|--------|-------|-------------|
| `MAIL_USER` | `nomina.collectivemining@gmail.com` | Cuenta remitente |
| `MAIL_PASS` | `abcdefghijklmnop` | App Password sin espacios |
| `APP_URL` | `https://nominacollectivemining.azurewebsites.net` | URL base para links de reset/verificación |

Luego haz clic en **Save** (arriba) y en el banner que aparece confirma
**Continue** para reiniciar la aplicación.

---

## Paso 3 — Verificar que funciona

### Test rápido desde el navegador

1. Abre `https://nominacollectivemining.azurewebsites.net/login.html`
2. Ve a la pestaña **Recuperar Contraseña**
3. Ingresa un email que exista en la BD
4. Si en ~30 segundos llega el correo → ✅ configurado correctamente

### Test desde logs (Kudu)

Abre la consola de Kudu:
```
https://nominacollectivemining.scm.azurewebsites.net/api/logstream
```
Busca líneas como:
```
[✓ EMAIL ENVIADO] 250 2.0.0 OK ...
[FORGOT PASSWORD] ✓ Email enviado a: usuario@empresa.com
```
O errores como:
```
[✗ EMAIL ERROR] Invalid login: ...
```

---

## Flujo completo del sistema de emails

| Evento | Email enviado | Columnas BD usadas |
|--------|---------------|-------------------|
| Primer registro de usuario | Verificación de cuenta | `TOK_VERI`, `FEC_VERI` |
| Admin crea usuario | Bienvenida + verificación | `TOK_VERI`, `FEC_VERI` |
| "Olvidé mi contraseña" | Link de reset (2 h) | `TOK_RECO`, `FEC_TOKE` |
| Reset exitoso | Confirmación de cambio | — |

> Las columnas `TOK_RECO`, `FEC_TOKE`, `TOK_VERI`, `VER_EMAIL` y `FEC_VERI`
> se crean **automáticamente** al arrancar el servidor si no existen en `GN_USUAR`.

---

## Variables de entorno completas recomendadas en Azure

```
# ── Base de datos ─────────────────────────────────────────────
SERVER=<servidor-sql>
DATABASE=MineDax
UID=<usuario-sql>
PWD=<contraseña-sql>

# ── Servidor ──────────────────────────────────────────────────
PORT=8080
NODE_ENV=production
JWT_SECRET=<cadena-aleatoria-minimo-32-chars>
APP_URL=https://nominacollectivemining.azurewebsites.net

# ── Email ─────────────────────────────────────────────────────
MAIL_USER=nomina.collectivemining@gmail.com
MAIL_PASS=<app-password-16-chars-sin-espacios>
MAIL_RRHH=talento.humano@collectivemining.com

# ── Python (exportación ADECCO) ───────────────────────────────
PYTHON_PATH=C:\Windows\py.exe
PYTHON_ARGS=-3
PYTHONPATH=D:\home\site\pythonpkgs
```
