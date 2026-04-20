# 🔓 Resolver Error de Login: hernandezjuanfelipe964@gmail.com

## ❌ El Problema

Usuario intenta ingresar con:
```
Email:       hernandezjuanfelipe964@gmail.com
Contraseña:  (alguna contraseña)
Resultado:   Error: "Requisitos de seguridad" o "Cédula/Email o contraseña incorrectos"
```

## ✅ La Solución - Pasos Simples

### PASO 1: Verificar el Estado del Usuario

**Opción A: Usar el Script (recomendado)**

En PowerShell/Terminal, ejecuta:

```bash
node ver-usuario.js "hernandezjuanfelipe964@gmail.com"
```

**Resultado esperado:**
```
📋 IDENTIDAD:
  └─ Cédula: 1234567890
  └─ Nombre: Hernández Juan Felipe
  └─ Email: hernandezjuanfelipe964@gmail.com

🎯 ACCESO:
  └─ Activo: ✅ SÍ
  └─ Bloqueado: ✅ NO

✅ SÍ PUEDE INGRESAR
```

**Si no aparece el usuario:**
```
❌ USUARIO NO ENCONTRADO
```

---

**Opción B: Usar SQL Server Management Studio (SSMS)**

Ejecuta esta consulta:

```sql
SELECT 
    CEDULA,
    NOMBRE_USUAR,
    EMAIL,
    ESTA_ACTIVO,
    ESTA_BLOQUEADO,
    LEN(PASSW_HASH) as Longitud_Hash
FROM GN_USUAR
WHERE EMAIL = 'hernandezjuanfelipe964@gmail.com';
```

---

### PASO 2: Analizar el Resultado

**Si NO aparece nada (usuario no existe):**

El usuario **DEBE CREARSE PRIMERO**.

Ejecuta:

```bash
node crear-usuario-desde-empleado.js "hernandezjuanfelipe964@gmail.com" "Hernandez@2024"
```

Donde:
- Email: Es el email que debe existir en GN_TERCE
- Contraseña: Debe tener MAYÚSCULA, minúscula, número, símbolo, 8+ caracteres

---

**Si aparece pero algo está MAL:**

| Si ves | Significa | Solución |
|--------|-----------|----------|
| `ESTA_ACTIVO = 0` | Usuario inactivo | Ir a PASO 3A |
| `ESTA_BLOQUEADO = 1` | Bloqueado por intentos fallidos | Ir a PASO 3B |
| `Longitud_Hash < 60` | Contraseña grabada incorrectamente | Ir a PASO 3C |
| `Longitud_Hash = 60` y activo | Debería funcionar... | Ir a PASO 4 |

---

### PASO 3A: Activar Usuario (si está inactivo)

**En SSMS:**

```sql
UPDATE GN_USUAR
SET ESTA_ACTIVO = 1
WHERE EMAIL = 'hernandezjuanfelipe964@gmail.com';

-- Verificar
SELECT CEDULA, NOMBRE_USUAR, ESTA_ACTIVO
FROM GN_USUAR
WHERE EMAIL = 'hernandezjuanfelipe964@gmail.com';
```

---

### PASO 3B: Desbloquear Usuario (si está bloqueado)

**En SSMS:**

```sql
UPDATE GN_USUAR
SET 
    ESTA_BLOQUEADO = 0,
    INTENTOS_FALL = 0
WHERE EMAIL = 'hernandezjuanfelipe964@gmail.com';

-- Verificar
SELECT CEDULA, NOMBRE_USUAR, ESTA_BLOQUEADO, INTENTOS_FALL
FROM GN_USUAR
WHERE EMAIL = 'hernandezjuanfelipe964@gmail.com';
```

---

### PASO 3C: Regenerar Contraseña (si hash está incompleto)

**Opción 1: Con Script (recomendado)**

Genera nuevo hash:

```bash
node generate-bcrypt.js "Hernandez@2024"
```

**Output:**
```
🔐 HASH BCRYPT (60 caracteres):

$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234
```

Copia el hash y ejecuta en SSMS:

```sql
UPDATE GN_USUAR
SET PASSW_HASH = '$2b$10$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234'
WHERE EMAIL = 'hernandezjuanfelipe964@gmail.com';
```

**Opción 2: Usar API (si eres Admin)**

```bash
curl -X POST http://localhost:3000/api/auth/crear-usuario \
  -H "Authorization: Bearer TOKEN_AQUI" \
  -H "Content-Type: application/json" \
  -d '{
    "cedula": "1234567890",
    "email": "hernandezjuanfelipe964@gmail.com",
    "contrasena": "Hernandez@2024"
  }'
```

---

### PASO 4: Intentar Login

Ahora en navegador o interfaz:

```
Email:       hernandezjuanfelipe964@gmail.com
Contraseña:  Hernandez@2024  ← Contraseña EN TEXTO PLANO (no el hash)
```

**❌ ESTO NO FUNCIONA:**
```
Contraseña:  $2b$10$abc... ← Usando el HASH (malo)
```

**✅ ESTO FUNCIONA:**
```
Contraseña:  Hernandez@2024 ← Contraseña original (bien)
```

---

## 🎯 Casos Frecuentes y Soluciones

### Caso 1: "Requisitos de seguridad"

**Causa:** Contraseña débil

**Solución:** Usa contraseña con:
- ✅ 8+ caracteres
- ✅ Una MAYÚSCULA (A-Z)
- ✅ Una minúscula (a-z)
- ✅ Un número (0-9)
- ✅ Un símbolo (!@#$%^&*)

**Ejemplos válidos:**
- `Hernandez@2024`
- `JuanFelipe#456`
- `Password123!`

---

### Caso 2: "Cédula/Email o contraseña incorrectos"

**Causa:** Una de estas:

1. ❌ Usuario no existe en GN_USUAR
   - **Solución:** Crear con `node crear-usuario-desde-empleado.js`

2. ❌ Email está incorrecto
   - **Solución:** Verificar spelling exacto en SSMS

3. ❌ Hash está incompleto (< 60 caracteres)
   - **Solución:** Regenerar con `node generate-bcrypt.js`

4. ❌ Usuario está inactivo
   - **Solución:** Ejecutar UPDATE para ESTA_ACTIVO = 1

5. ❌ Usuario está bloqueado
   - **Solución:** Ejecutar UPDATE para ESTA_BLOQUEADO = 0

---

### Caso 3: "Tu cuenta ha sido bloqueada..."

**Causa:** 5+ intentos fallidos de contraseña

**Solución:**

```sql
UPDATE GN_USUAR
SET ESTA_BLOQUEADO = 0, INTENTOS_FALL = 0
WHERE EMAIL = 'hernandezjuanfelipe964@gmail.com';
```

O con Script:

```bash
node ver-usuario.js "hernandezjuanfelipe964@gmail.com"
```

---

## 📊 Dónde se guardan los datos

| Información | Tabla | Campo | Valor |
|-----------|-------|-------|-------|
| **Identidad** | GN_USUAR | CEDULA, NOMBRE_USUAR | 1234567890, Hernández Juan Felipe |
| **Email** | GN_USUAR | EMAIL | hernandezjuanfelipe964@gmail.com |
| **Contraseña (hasheada)** | GN_USUAR | PASSW_HASH | $2b$10$... (60+ chars) |
| **¿Puede ingresar?** | GN_USUAR | ESTA_ACTIVO | 1 (Sí) o 0 (No) |
| **¿Está bloqueado?** | GN_USUAR | ESTA_BLOQUEADO | 0 (No bloqueado) o 1 (Bloqueado) |
| **Intentos fallidos** | GN_USUAR | INTENTOS_FALL | 0-5+ |
| **Historial de logins** | GN_LOG_ACCESO | TIPO_EVENTO = 'LOGIN' | LOGIN, LOGOUT, ERROR |
| **Sesión actual** | GN_SESION | * | Registrada cuando inicia sesión |

---

## ✅ Checklist Final

Antes de que Hernández intente ingresar de nuevo, verifica:

```
□ Usuario existe en GN_USUAR
□ Email es exacto: hernandezjuanfelipe964@gmail.com
□ Hash de contraseña tiene 60+ caracteres
□ ESTA_ACTIVO = 1 (usuario activo)
□ ESTA_BLOQUEADO = 0 (no bloqueado)
□ INTENTOS_FALL = 0 o pocos
□ Contraseña EN TEXTO PLANO (no el hash)
□ Contraseña tiene: MAYÚS + minús + número + símbolo + 8+ chars
```

Si todo es ✅, el login debe funcionar.

---

## 🆘 Si aún no funciona

1. **Verifica el servidor está corriendo:**
   ```bash
   npm start
   ```

2. **Prueba la conexión a BD:**
   ```bash
   node test-db-connection.js
   ```

3. **Genera un reporte del usuario:**
   ```bash
   node ver-usuario.js "hernandezjuanfelipe964@gmail.com"
   ```

4. **Revisa los logs en BD:**
   ```sql
   SELECT TOP 20 * FROM GN_LOG_ACCESO
   WHERE CEDULA LIKE '%hernandez%' OR CEDULA = '1234567890'
   ORDER BY FECH_EVENTO DESC;
   ```

5. **Prueba el endpoint de login:**
   ```bash
   curl -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{
       "cedula_o_email": "hernandezjuanfelipe964@gmail.com",
       "contrasena": "Hernandez@2024"
     }'
   ```

---

## 📞 Contacto

Si necesitas ayuda específica, prepara:
- Output de `node ver-usuario.js "hernandezjuanfelipe964@gmail.com"`
- Resultado del query en SSMS
- Logs de error de la aplicación

---

**Versión:** 1.0  
**Última actualización:** 2026-04-14  
**Usuario:** hernandezjuanfelipe964@gmail.com
