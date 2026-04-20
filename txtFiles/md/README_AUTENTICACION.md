# 🔐 Guía de Autenticación - Sistema de Nómina

## 📚 Documentación Disponible

Hemos creado una documentación completa para manejar usuarios y autenticación. Elige la que necesitas:

| Documento | Propósito | Para quién |
|-----------|-----------|-----------|
| **[RESOLVER_ERROR_LOGIN_HERNANDEZ.md](./RESOLVER_ERROR_LOGIN_HERNANDEZ.md)** | Resolver el error actual de login | 👤 Tú (ahora) |
| **[GUIA_USUARIOS_Y_CREDENCIALES.md](./GUIA_USUARIOS_Y_CREDENCIALES.md)** | Entender dónde se guardan credenciales | 👥 Administrador |
| **[GUIA_CONECTAR_BD_A_INTERFAZ.md](./GUIA_CONECTAR_BD_A_INTERFAZ.md)** | Conectar frontend a backend | 💻 Desarrollador |

---

## 🎯 TU PROBLEMA ACTUAL: ERROR DE LOGIN

Estás intentando:
```
Usuario:      hernandezjuanfelipe964@gmail.com
Contraseña:   $2b$10$XXXX (HASH bcrypt)
Error:        "Requisitos de seguridad"
```

**⚠️ PROBLEMA**: Estás usando un **hash** como contraseña. Eso no funciona.

**✅ SOLUCIÓN**: Sigue estos pasos:

---

## 🔧 SOLUCIÓN RÁPIDA (5 minutos)

### Paso 1: Verifica que el usuario existe

Abre **SQL Server Management Studio (SSMS)** y ejecuta:

```sql
SELECT CEDULA, NOMBRE_USUAR, EMAIL, PASSW_HASH, LEN(PASSW_HASH) as 'Hash_Length'
FROM GN_USUAR
WHERE EMAIL = 'hernandezjuanfelipe964@gmail.com';
```

**Resultado esperado:**
```
CEDULA          NOMBRE_USUAR              EMAIL                          Hash_Length
─────────────────────────────────────────────────────────────────────────────
hernandezjuan   Hernández Juan Felipe     hernandezjuanfelipe964@...     60
```

### Paso 2: Si Hash_Length < 60, actualiza el hash

```bash
# Generar nuevo hash con una contraseña SEGURA
node generate-bcrypt-hash.js "ContrasenaSegura123!"

# Output:
# ✅ Hash generado exitosamente:
# $2b$12$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234
```

Ahora ejecuta en SSMS:

```sql
UPDATE GN_USUAR
SET PASSW_HASH = '$2b$12$abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ1234'
WHERE EMAIL = 'hernandezjuanfelipe964@gmail.com';
```

### Paso 3: Intenta login CORRECTAMENTE

**Frontend - Login:**
```
Email:       hernandezjuanfelipe964@gmail.com
Contraseña:  ContrasenaSegura123!  ← TEXTO PLANO, NO el hash
```

✅ Debería funcionar.

---

## 🎓 ENTENDER TODO EL SISTEMA

### ¿Dónde se guardan las credenciales?

```
Tabla: GN_USUAR (en SQL Server - MineDax)
│
├─ CEDULA (identificador del usuario)
├─ EMAIL (email alternativo)
├─ PASSW_HASH ⭐ (AQUÍ se guarda la contraseña - hasheada con bcrypt)
├─ NIVEL_USUAR (1=Empleado, 2=Supervisor, 3=Admin)
├─ ESTA_ACTIVO (1=Activo, 0=Inactivo)
└─ ESTA_BLOQUEADO (bloqueado después de 5 intentos fallidos)
```

### ¿Cómo funciona el login?

```
1. Usuario escribe en frontend:
   Email: hernandezjuanfelipe964@gmail.com
   Pass:  ContrasenaSegura123!  (TEXTO PLANO)

2. Frontend envía a backend:
   POST /api/auth/login {cedula_o_email, contrasena}

3. Backend busca en BD:
   SELECT * FROM GN_USUAR WHERE EMAIL = 'hernandez...'

4. Backend compara:
   bcrypt.compare("ContrasenaSegura123!", "$2b$12$XXXX...")
   
   ├─ ✅ VÁLIDA → Genera JWT, registra sesión, retorna token
   └─ ❌ INVÁLIDA → Registra intento fallido, bloquea después de 5

5. Frontend guarda token:
   localStorage.setItem('token', 'JWT_TOKEN_AQUI')

6. Frontend redirige a dashboard
```

### ¿Quiénes pueden ingresar?

**Respuesta**: Cualquier usuario en `GN_USUAR` que:
- ✅ Esté ACTIVO (`ESTA_ACTIVO = 1`)
- ✅ NO esté BLOQUEADO (`ESTA_BLOQUEADO = 0`)
- ✅ Tenga contraseña válida (hash >= 60 caracteres)

**Restricciones opcionales** (se pueden agregar):
- Solo ADMIN y SUPERVISOR (nivel >= 2)
- Solo empleados de ciertos departamentos
- Horarios limitados de acceso

---

## 🛠️ SCRIPTS DISPONIBLES

### Script 1: Gestionar Usuarios

```bash
# Ver TODOS los usuarios
node script-gestionar-usuarios.js listar

# Ver detalles de UNO
node script-gestionar-usuarios.js ver hernandezjuan

# CREAR nuevo usuario
node script-gestionar-usuarios.js crear \
  "cedula" "Nombre Completo" "email@example.com" "Contrasena123!" 1

# CAMBIAR contraseña
node script-gestionar-usuarios.js cambiar hernandezjuan "NuevaContrasena123!"

# BLOQUEAR usuario (impide login)
node script-gestionar-usuarios.js bloquear hernandezjuan

# DESBLOQUEAR usuario
node script-gestionar-usuarios.js desbloquear hernandezjuan

# VER LOGS de acceso
node script-gestionar-usuarios.js logs hernandezjuan
```

### Script 2: Generar Hash

```bash
# Generar hash bcrypt para una contraseña
node generate-bcrypt-hash.js "MiContrasena123!"
```

### Script 3: Probar Conexión a BD

```bash
# Verificar que todo está conectado correctamente
node test-db-connection.js
```

### Script 4: Diagnóstico Completo

```bash
# Diagnóstico detallado de la conexión
node diagnostico-conexion-bd.js
```

---

## 📊 TABLAS RELACIONADAS A AUTENTICACIÓN

### GN_USUAR (Tabla Principal)

Almacena todos los usuarios del sistema.

```sql
SELECT * FROM GN_USUAR;
```

### GN_SESION (Auditoría de Sesiones)

Registra quién ingresó, cuándo y desde dónde.

```sql
SELECT * FROM GN_SESION WHERE ESTA_ACTIVA = 1;  -- Sesiones activas ahora
```

### GN_LOG_ACCESO (Auditoría de Eventos)

Registra TODOS los intentos (exitosos y fallidos).

```sql
SELECT * FROM GN_LOG_ACCESO ORDER BY FECH_EVENTO DESC;
```

### GN_ROL_USUAR (Roles)

Asigna roles a usuarios.

```sql
SELECT * FROM GN_ROL_USUAR;
```

### GN_PERMISOS (Permisos Granulares)

Define qué puede hacer cada rol.

```sql
SELECT * FROM GN_PERMISOS WHERE COD_ROL = 'ADMIN';
```

---

## 🔒 FLUJOS DE SEGURIDAD IMPLEMENTADOS

### 1. Contraseñas Hasheadas (bcrypt)

✅ Las contraseñas **nunca** se guardan en texto plano
✅ Se usan 12 rondas de salting (muy seguro)
✅ Imposible recuperar contraseña original del hash

### 2. JWT Tokens

✅ El token expira en cierto tiempo
✅ Se usa para validar futuras peticiones
✅ Se almacena en localStorage del navegador

### 3. Bloqueo por Intentos Fallidos

✅ Después de 5 intentos fallidos, se bloquea la cuenta
✅ Previene ataques de fuerza bruta
✅ Se puede desbloquear manualmente

### 4. Auditoría Completa

✅ Todos los eventos se registran en `GN_LOG_ACCESO`
✅ Se guarda IP del usuario
✅ Se guarda dispositivo/navegador
✅ Se registra fecha y hora exacta

### 5. Cambio de Contraseña Periódico

✅ Cada usuario debe cambiar contraseña cada 90 días
✅ Se valida al hacer login
✅ Cuando se cambia, se resetean intentos fallidos

---

## ✨ PRÓXIMOS PASOS

Después de resolver el login actual:

1. **Crea usuarios para todo el equipo:**
   ```bash
   node script-gestionar-usuarios.js crear "cedula" "Nombre" "email" "Contrasena123!" 1
   ```

2. **Configura el servidor:**
   ```bash
   npm start
   ```

3. **Comunica a usuarios:**
   - Email con usuario/contraseña inicial
   - Avisa que deben cambiar en primer login
   - Proporciona guía de uso

4. **Monitorea intentos de login:**
   ```bash
   node script-gestionar-usuarios.js logs
   ```

5. **Documenta el procedimiento:**
   - Quién puede ingresar (roles/niveles)
   - Política de contraseñas
   - Procedimiento si olvida contraseña

---

## 📞 SOPORTE

Si algo no funciona:

1. **Error de conexión a BD:**
   ```bash
   node diagnostico-conexion-bd.js
   ```

2. **Usuario no puede ingresar:**
   ```bash
   node script-gestionar-usuarios.js ver [cedula]
   ```

3. **Necesito resetear contraseña:**
   ```bash
   node script-gestionar-usuarios.js cambiar [cedula] "NuevaContrasena123!"
   ```

4. **Usuario fue bloqueado:**
   ```bash
   node script-gestionar-usuarios.js desbloquear [cedula]
   ```

5. **Necesito auditoría:**
   ```bash
   node script-gestionar-usuarios.js logs [cedula]
   ```

---

## 📋 CHECKLIST: PRIMEROS PASOS

- [ ] Resolviste el error de login de hernandezjuan
- [ ] Verificaste que BD está conectada (`node test-db-connection.js`)
- [ ] Creaste usuario admin para ti
- [ ] Probaste login exitosamente
- [ ] Creaste usuarios para el equipo
- [ ] Iniciaste el servidor (`npm start`)
- [ ] Comunicaste credenciales al equipo
- [ ] Documentaste el procedimiento

---

**Última actualización**: 2026-04-14
**Estado del sistema**: ⚠️ Pendiente de conexión a BD
**Documentos**: 4 guías + 4 scripts

