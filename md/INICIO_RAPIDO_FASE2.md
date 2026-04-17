# ⚡ INICIO RÁPIDO - FASE 2

**Tiempo estimado:** 5 minutos de setup, 10 minutos de testing

---

## 🎯 Lo que se implementó

✅ **Sistema completo de autenticación moderna**
- Registro de nuevos usuarios
- Recuperación de contraseña por email
- UI moderna con split-screen
- Emails automáticos (bienvenida, recuperación, confirmación)
- Seguridad mejorada

---

## 1️⃣ INSTALACIÓN

### Paso 1: Instalar nuevas dependencias

```bash
npm install nodemailer
```

O si quieres instalar todo:
```bash
npm install
```

### Paso 2: Configurar .env

Abre `.env` y actualiza estas variables:

```env
MAIL_USER=tu-email-gmail@gmail.com
MAIL_PASS=tu-contraseña-de-app
APP_URL=http://localhost:3000
```

**⚠️ Importante para Gmail:**
1. Habilita autenticación de 2 factores en tu cuenta Gmail
2. Genera una **"contraseña de aplicación"** específica
3. Copia esa contraseña en `MAIL_PASS` (no tu contraseña normal)

[Cómo generar contraseña de aplicación Gmail](https://support.google.com/accounts/answer/185833)

### Paso 3: Iniciar servidor

```bash
npm start
```

Deberías ver:
```
✓ Conectado a SQL Server: MineDax
✓ Servidor ejecutándose en http://localhost:3000
```

---

## 2️⃣ TESTING RÁPIDO

### Abrir login

```
http://localhost:3000/login.html
```

Deberías ver la nueva interfaz con 3 tabs:
- **Login** - Acceso tradicional
- **Crear Cuenta** - Registro nuevo usuario
- **Recuperar Contraseña** - Reset de contraseña

---

## 3️⃣ PRUEBA #1 - Crear Cuenta (Registro)

### Requisito previo
Necesitas un **email de empleado existente** en BD:

```sql
SELECT TOP 5 NUM_IDEN, NOM_COMP, DIR_MAIL
FROM GN_TERCE
WHERE DIR_MAIL IS NOT NULL
```

Anota uno de los emails (ej: `juan@example.com`)

### Pasos

1. **En login.html:** Click en tab "Crear Cuenta"

2. **Rellena el formulario:**
   - Email: `juan@example.com` (uno de la BD)
   - Contraseña: `MiPassword123` (mín 8 caracteres)
   - Confirmar: `MiPassword123`

3. **Click en "Crear Cuenta"**

### Verificación exitosa

✅ Sin esperar, ve al tab **Login** y prueba las nuevas credenciales
✅ Deberías estar logueado automáticamente
✅ Verifica que recibiste email de bienvenida (bandeja principal o spam)

---

## 4️⃣ PRUEBA #2 - Recuperar Contraseña

### Pasos

1. **En login.html:** Click en tab "Recuperar Contraseña"

2. **Rellena:**
   - Email: `juan@example.com` (cuenta creada en prueba anterior)

3. **Click en "Enviar Instrucciones"**

4. **Verifica email:**
   - Abre email de recuperación (1-2 minutos)
   - Click en "Restablecer Contraseña"
   - Te redirige a `reset-password.html?token=UUID`

5. **Nueva contraseña:**
   - Nueva: `OtraPassword456`
   - Confirmar: `OtraPassword456`
   - Click en "Restablecer Contraseña"

6. **Verificación:**
   ✅ Mensaje de éxito
   ✅ Redirige a login.html
   ✅ Prueba con credenciales nuevas

---

## 5️⃣ PRUEBA #3 - Login Normal

1. **Email:** `juan@example.com`
2. **Contraseña:** `OtraPassword456` (la nueva)
3. **Click "Iniciar Sesión"**

**Resultado esperado:**
✅ Redirige a `/index_novedades.html`
✅ Dashboard carga sin errores
✅ Información del usuario visible

---

## 🗂️ Archivos Nuevos

```
📁 Interfaz Nomina - Alpha/
├─ config/
│  └─ mailer.js                    ← Email configuration
├─ controllers/
│  └─ authController.js            ← +4 funciones nuevas
├─ routes/
│  └─ auth.js                      ← +4 rutas nuevas
├─ js/
│  └─ auth.js                      ← Actualizado
├─ login.html                      ← Completamente rediseñado
├─ reset-password.html             ← Nuevo
├─ FASE_2_IMPLEMENTACION.md        ← Documentación completa
└─ INICIO_RAPIDO_FASE2.md         ← Este archivo
```

---

## 🔍 Verificar en Base de Datos

### Usuarios creados

```sql
SELECT TOP 10 COD_USUA, NOM_USUA, DIR_ELEC, ACT_INAC
FROM GN_USUAR
WHERE ACT_INAC = 'S'
ORDER BY COD_USUA DESC
```

### Log de eventos (auditoría)

```sql
SELECT TOP 20 COD_LOGA, COD_USUA, TIP_EVEN, EST_EVEN, FEC_EVEN
FROM GN_LOG_ACCE
WHERE TIP_EVEN IN ('REGISTRO', 'FORGOT_PASS', 'RESET_PASS')
ORDER BY FEC_EVEN DESC
```

Deberías ver:
- REGISTRO (cuando creas cuenta)
- FORGOT_PASS (cuando solicitas reset)
- RESET_PASS (cuando cambias contraseña)

### Verificar tokens

```sql
SELECT COD_USUA, NOM_USUA, TOK_RECO, FEC_TOKE
FROM GN_USUAR
WHERE TOK_RECO IS NOT NULL
```

(Mostrar solo mientras el token está activo - se limpia después de usar)

---

## 📧 Emails Generados

**3 tipos de emails automáticos:**

### 1. Bienvenida (Registro)
- Enviado automáticamente después de crear cuenta
- Confirma que la cuenta está activa
- Link de acceso al sistema

### 2. Recuperación (Olvidé Contraseña)
- Enviado cuando solicitas reset
- Contiene link de `reset-password.html?token=UUID`
- Link expira en 2 horas
- Instrucciones de seguridad

### 3. Confirmación (Reset Exitoso)
- Enviado después de cambiar contraseña
- Confirma que el cambio fue exitoso
- Recomendación de contactar admin si no lo solicitaste

---

## 🚨 Troubleshooting

### "No recibo emails"

1. **Verifica credenciales en .env:**
   ```bash
   MAIL_USER=mi-email@gmail.com
   MAIL_PASS=abcd efgh ijkl mnop (contraseña de app)
   ```

2. **Revisa carpeta spam/promociones**

3. **En consola del servidor, deberías ver:**
   ```
   [✓ EMAIL ENVIADO] Success
   ```

4. **Si hay error:**
   ```
   [✗ EMAIL ERROR] Invalid login
   ```
   → Verifica credenciales

### "Email no está registrado"

**Significa:** El email no existe en `GN_TERCE`
- Verifica que el empleado está en la BD
- Debe tener `DIR_MAIL` (email) completo

### "Ya existe una cuenta con este email"

- Usuario ya fue creado
- Usar "Recuperar Contraseña" para resetear
- O contactar admin para ver otros usuarios

### "Token inválido o expirado"

- Link de email tiene más de 2 horas
- Solicita nuevo reset en login.html
- Los tokens solo duran 2 horas por seguridad

---

## 🎓 Conceptos Importantes

### Split-Screen Login
- Branding en izquierda (40%)
- Formularios en derecha (60%)
- 3 tabs: Login / Crear Cuenta / Recuperar
- Responsivo en móvil (stack vertical)

### Seguridad
- ✅ Contraseñas hasheadas (bcryptjs)
- ✅ Tokens únicos (UUID)
- ✅ Expiración de tokens (2 horas)
- ✅ Auditoría completa en BD
- ✅ Email verificado

### Validaciones
- Cliente: Longitud, coincidencia, formato email
- Servidor: Todo se valida de nuevo

---

## 📞 Soporte Rápido

| Problema | Solución |
|---|---|
| "npm: command not found" | Instalar Node.js |
| "Cannot find module 'nodemailer'" | Ejecutar `npm install nodemailer` |
| "ECONNREFUSED" en BD | Verificar que SQL Server está running |
| "Connection timed out" (email) | Verificar conexión internet y credenciales Gmail |

---

## ✅ Checklist Pre-Producción

- [ ] Emails llegando correctamente
- [ ] Registro funciona end-to-end
- [ ] Recuperación de contraseña funciona
- [ ] Reset de contraseña valida token correcto
- [ ] Login con credenciales nuevas funciona
- [ ] Auditoría registra eventos
- [ ] UI responsive en móvil
- [ ] Cambiar JWT_SECRET a valor seguro
- [ ] Cambiar MAIL_PASS a contraseña de app real
- [ ] Verificar APP_URL apunta a dominio correcto

---

## 🎉 ¡Listo!

Tienes un **sistema de autenticación profesional y moderno** con:
- ✅ Registro automático
- ✅ Recuperación de contraseña
- ✅ UI moderna y responsiva
- ✅ Emails automáticos
- ✅ Auditoría completa
- ✅ Seguridad mejorada

**Proximos pasos:** Testing en producción y rollout a usuarios.
