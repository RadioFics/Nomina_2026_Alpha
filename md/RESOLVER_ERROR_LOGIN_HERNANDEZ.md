# 🔓 Resolver Error de Login: hernandezjuanfelipe964@gmail.com

## 🚨 EL PROBLEMA

```
Usuario:      hernandezjuanfelipe964@gmail.com
Contraseña:   $2b$10$XXXX (intentando usar un HASH)
Resultado:    ❌ "Requisitos de seguridad"
```

**El problema**: Estás ingresando un hash bcrypt en lugar de una contraseña en TEXTO PLANO.

**La solución**: Necesitas ingresar la contraseña original (antes de ser hasheada).

---

## ✅ PASO A PASO PARA RESOLVER

### PASO 1: Verificar que el usuario existe en la BD

Abre **SQL Server Management Studio (SSMS)** y ejecuta:

```sql
SELECT 
    ID_USUAR,
    CEDULA,
    NOMBRE_USUAR,
    EMAIL,
    PASSW_HASH,
    LEN(PASSW_HASH) as 'Longitud_Hash',
    ESTA_ACTIVO,
    ESTA_BLOQUEADO
FROM GN_USUAR
WHERE EMAIL = 'hernandezjuanfelipe964@gmail.com';
```

**Resultados posibles:**

### ❌ Si NO retorna nada:

El usuario **NO existe** en la BD. Necesita crearse primero.

**Solución:**
```bash
# Paso 1: Crear el usuario desde línea de comandos
node script-gestionar-usuarios.js crear \
  "hernandezjuan" \
  "Hernández Juan Felipe" \
  "hernandezjuanfelipe964@gmail.com" \
  "ContrasenaSegura123!" \
  1

# Output:
# ✅ Usuario creado exitosamente
# ID Usuario:   ABC-123-DEF
# Cédula:      hernandezjuan
# Nombre:      Hernández Juan Felipe
# Email:       hernandezjuanfelipe964@gmail.com
# Rol:         Empleado
```

Luego, intenta login con:
- **Email**: `hernandezjuanfelipe964@gmail.com`
- **Contraseña**: `ContrasenaSegura123!` (en TEXTO PLANO)

### ✅ Si SÍ retorna datos:

El usuario existe. Verifiquemos el estado:

```sql
SELECT 
    CEDULA,
    EMAIL,
    PASSW_HASH,
    LEN(PASSW_HASH) as 'Longitud',
    ESTA_ACTIVO,
    ESTA_BLOQUEADO,
    INTENTOS_FALL
FROM GN_USUAR
WHERE EMAIL = 'hernandezjuanfelipe964@gmail.com';
```

---

### PASO 2: Analizar el resultado

Busca estos valores:

| Campo | Estado | Acción |
|-------|--------|--------|
| `LEN(PASSW_HASH)` | < 60 | ❌ Hash incompleto → Actualizar |
| `LEN(PASSW_HASH)` | = 60 | ✅ Hash válido |
| `ESTA_ACTIVO` | 0 | ❌ Usuario inactivo → Activar |
| `ESTA_BLOQUEADO` | 1 | ❌ Usuario bloqueado → Desbloquear |
| `INTENTOS_FALL` | > 5 | ❌ Muchos intentos → Resetear |

---

### PASO 3A: Si el HASH está incompleto (< 60 caracteres)

```bash
# Generar nuevo hash
node generate-bcrypt-hash.js "ContrasenaSegura123!"

# Output:
# ✅ Hash generado exitosamente:
# $2b$12$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234
```

Ahora ejecuta en SSMS:

```sql
DECLARE @email VARCHAR(100) = 'hernandezjuanfelipe964@gmail.com'
DECLARE @hash_nuevo VARCHAR(255) = '$2b$12$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234'

UPDATE GN_USUAR
SET 
    PASSW_HASH = @hash_nuevo,
    INTENTOS_FALL = 0,
    ESTA_BLOQUEADO = 0
WHERE EMAIL = @email;

SELECT '✅ Hash actualizado' AS Resultado;
```

---

### PASO 3B: Si el usuario está bloqueado

```bash
# Desbloquear el usuario
node script-gestionar-usuarios.js desbloquear hernandezjuan

# Output:
# ✅ Usuario desbloqueado exitosamente
```

O en SSMS:

```sql
UPDATE GN_USUAR
SET 
    ESTA_BLOQUEADO = 0,
    INTENTOS_FALL = 0
WHERE EMAIL = 'hernandezjuanfelipe964@gmail.com';
```

---

### PASO 3C: Si el usuario está inactivo

```sql
UPDATE GN_USUAR
SET ESTA_ACTIVO = 1
WHERE EMAIL = 'hernandezjuanfelipe964@gmail.com';
```

---

### PASO 4: Intentar login (IMPORTANTE)

**❌ ESTO NO FUNCIONA:**
```
Email:       hernandezjuanfelipe964@gmail.com
Contraseña:  $2b$10$XXXX...  ← Usando el HASH
```

**✅ ESTO FUNCIONA:**
```
Email:       hernandezjuanfelipe964@gmail.com
Contraseña:  ContrasenaSegura123!  ← Contraseña EN TEXTO PLANO
```

---

## 📝 RESUMEN: LOS 3 ERRORES MÁS COMUNES

### Error 1: "Requisitos de seguridad"

**Causa**: Contraseña en texto plano no cumple requisitos

**Solución**: Usa contraseña con:
- ✅ Mínimo 8 caracteres
- ✅ Al menos una mayúscula
- ✅ Al menos una minúscula
- ✅ Al menos un número
- ✅ Al menos un símbolo especial

**Ejemplos válidos:**
- `ContrasenaSegura123!`
- `Hernandez@2024`
- `JuanFelipe#456`

### Error 2: "Cédula/Email o contraseña incorrectos"

**Causas posibles:**
1. Email está mal escrito
2. Contraseña en SSMS está incompleta (< 60 chars)
3. Usuario está inactivo o bloqueado
4. Hash fue guardado incorrectamente

**Solución**:
```bash
# Ver detalles del usuario
node script-gestionar-usuarios.js ver hernandezjuan

# Si hash es incompleto:
node script-gestionar-usuarios.js cambiar hernandezjuan "NuevaContrasena123!"
```

### Error 3: "Tu cuenta ha sido bloqueada..."

**Causa**: 5 intentos fallidos consecutivos

**Solución**:
```bash
node script-gestionar-usuarios.js desbloquear hernandezjuan
```

---

## 🎯 CHECKLIST FINAL

Antes de intentar login nuevamente:

- [ ] Verificó que el usuario existe en `GN_USUAR`
- [ ] Verificó que el hash tiene >= 60 caracteres
- [ ] Verificó que `ESTA_ACTIVO = 1`
- [ ] Verificó que `ESTA_BLOQUEADO = 0`
- [ ] Reseteó `INTENTOS_FALL = 0`
- [ ] Ingresa contraseña EN TEXTO PLANO (no el hash)
- [ ] Contraseña cumple requisitos: 8+ chars, mayúscula, minúscula, número, símbolo

---

## 🛠️ COMANDOS RÁPIDOS

```bash
# Ver el usuario
node script-gestionar-usuarios.js ver hernandezjuan

# Cambiar contraseña
node script-gestionar-usuarios.js cambiar hernandezjuan "NuevaContraseña123!"

# Desbloquear después de intentos fallidos
node script-gestionar-usuarios.js desbloquear hernandezjuan

# Ver todos los intentos de login de este usuario
node script-gestionar-usuarios.js logs hernandezjuan

# Ver últimos 50 eventos
node script-gestionar-usuarios.js logs hernandezjuan 50
```

---

## 📊 FLUJO DE DEBUGGING

```
¿Usuario puede hacer login?
        │
        ├─ ❌ No → ¿Usuario existe?
        │           │
        │           ├─ ❌ No → Crear con: node script-gestionar-usuarios.js crear ...
        │           │
        │           └─ ✅ Sí → Ejecutar "Ver detalles"
        │                       ├─ ¿Hash < 60 chars? → Actualizar hash
        │                       ├─ ¿ESTA_ACTIVO = 0? → Activar
        │                       └─ ¿ESTA_BLOQUEADO = 1? → Desbloquear
        │
        └─ ✅ Sí → ¡LISTO! El sistema funciona correctamente
```

---

## 🆘 ¿AÚN NO FUNCIONA?

Si después de todo esto el usuario aún no puede ingresar:

1. **Genera un reporte:**
   ```bash
   node script-gestionar-usuarios.js ver hernandezjuan > reporte.txt
   ```

2. **Verifica los logs:**
   ```bash
   node script-gestionar-usuarios.js logs hernandezjuan 10
   ```

3. **Prueba la conexión a BD:**
   ```bash
   node test-db-connection.js
   ```

4. **Verifica el servidor está corriendo:**
   ```bash
   npm start
   ```

5. **En navegador, prueba:**
   ```
   http://localhost:3000/api/health
   ```

---

**Fecha**: 2026-04-14
**Usuario de referencia**: hernandezjuanfelipe964@gmail.com
**Estado**: Pendiente de resolver

