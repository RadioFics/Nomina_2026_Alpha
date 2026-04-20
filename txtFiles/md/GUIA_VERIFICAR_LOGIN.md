# ✅ Guía Completa: Verificar que Login Está Funcionando

Sigue estos pasos para confirmar que el login está guardando datos correctamente en GN_USUAR.

---

## 📋 PASO 1: Preparar el Monitoreo (2 min)

### 1.1 Abre SQL Server Management Studio

1. Conecta a: `CM-ITD-P-05\SQLEXPRESS`
2. BD: `MineDax`
3. Abre: `VERIFICAR_LOGIN_FUNCIONANDO.sql`
4. **NO ejecutes aún** - espera al paso siguiente

### 1.2 Abre una Segunda Ventana

1. Abre **otra ventana de SQL Server Management Studio** (o otra pestaña)
2. Prepárate para ejecutar el script de verificación
3. Anota la hora actual

---

## 🚀 PASO 2: Ejecutar Script Base (1 min)

1. **En la PRIMERA ventana**, ejecuta `VERIFICAR_LOGIN_FUNCIONANDO.sql` (F5)
2. Guarda los resultados (copia y pega en un Notepad)

Especialmente estos números:
```
Total de usuarios: _____
Sesiones activas AHORA: _____
Últimos eventos: _____
```

Estos son tus **valores BASE** (antes del login)

---

## 🔐 PASO 3: Hacer Login en la Aplicación (1 min)

1. Abre el navegador: `http://localhost:3000`
2. Deberías ver la **página de login**
3. Ingresa:
   - **Cédula/Email:** (tu cédula de usuario)
   - **Contraseña:** (tu contraseña)
4. Haz clic en **"Iniciar Sesión"**

---

## ⏰ PASO 4: Monitorear Cambios en TIEMPO REAL (1 min)

**Mientras estás haciendo login:**

1. En SQL Server, ejecuta **nuevamente** `VERIFICAR_LOGIN_FUNCIONANDO.sql` (F5)
2. **Compara los números con los del PASO 2**

### ¿Qué Deberías Ver?

**ANTES del login (Paso 2):**
```
Total de usuarios: 4
Sesiones activas AHORA: 0
Últimos eventos: 20
```

**DESPUÉS del login (Paso 4):**
```
Total de usuarios: 4 (igual, sin cambios)
Sesiones activas AHORA: 1 ✅ AUMENTÓ
Últimos eventos: 21+ ✅ AUMENTÓ
```

---

## 📊 PASO 5: Revisar Detalles de la Sesión (2 min)

En la segunda ventana de SQL, ejecuta:

```sql
-- Ver tu sesión activa
SELECT TOP 1
  s.ID_SESION,
  u.CEDULA,
  u.NOMBRE_USUAR,
  s.FECH_INICIO,
  s.IP_DIRECCION,
  s.DISPOSITIVO,
  s.ESTA_ACTIVA
FROM GN_SESION s
JOIN GN_USUAR u ON s.ID_USUAR = u.ID_USUAR
WHERE s.ESTA_ACTIVA = 1
ORDER BY s.FECH_INICIO DESC;
```

Deberías ver:
```
┌─────────────┬─────────────┬──────────────┬─────────────────┬──────┐
│ ID_SESION   │ CEDULA      │ NOMBRE_USUAR │ FECH_INICIO     │ ESTA │
├─────────────┼─────────────┼──────────────┼─────────────────┼──────┤
│ [UUID]      │ 1234567890  │ Juan Perez   │ 2026-04-13...   │ 1    │
└─────────────┴─────────────┴──────────────┴─────────────────┴──────┘
```

✅ Si aparece, el login está **registrando sesiones correctamente**

---

## 📝 PASO 6: Revisar Log de Accesos (2 min)

Ejecuta:

```sql
-- Ver últimos intentos de login
SELECT TOP 5
  CEDULA,
  TIPO_EVENTO,
  ESTADO,
  MENSAJE,
  FECH_EVENTO
FROM GN_LOG_ACCESO
WHERE TIPO_EVENTO = 'LOGIN'
ORDER BY FECH_EVENTO DESC;
```

Deberías ver:
```
┌─────────────┬──────────┬─────────┬──────────────────────┬──────────────┐
│ CEDULA      │ EVENTO   │ ESTADO  │ MENSAJE              │ FECH_EVENTO  │
├─────────────┼──────────┼─────────┼──────────────────────┼──────────────┤
│ 1234567890  │ LOGIN    │ EXITOSO │ Login validado...    │ 2026-04-13..│
└─────────────┴──────────┴─────────┴──────────────────────┴──────────────┘
```

✅ Si está **EXITOSO**, el login funcionó correctamente

---

## 🎯 PASO 7: Revisar Información del Usuario (1 min)

Ejecuta:

```sql
-- Ver información completa del usuario que hizo login
SELECT
  ID_USUAR,
  CEDULA,
  NOMBRE_USUAR,
  EMAIL,
  NIVEL_USUAR,
  ESTA_ACTIVO,
  ESTA_BLOQUEADO,
  INTENTOS_FALL,
  FECH_ULT_CAMBIO,
  FECH_CREACION
FROM GN_USUAR
WHERE CEDULA = '1234567890';  -- Cambiar por tu cédula
```

Verifica:
- ✅ **CEDULA**: Coincide con la que ingresaste
- ✅ **NOMBRE_USUAR**: Tu nombre
- ✅ **ESTA_ACTIVO**: Debe ser `1`
- ✅ **ESTA_BLOQUEADO**: Debe ser `0`
- ✅ **INTENTOS_FALL**: Debe ser `0`

Si algo está mal, contacta al admin para que lo corrija.

---

## 🔄 PASO 8: Revisar Roles y Permisos (1 min)

Ejecuta:

```sql
-- Ver roles del usuario
SELECT
  u.CEDULA,
  u.NOMBRE_USUAR,
  r.COD_ROL,
  r.NOM_ROL,
  r.ESTA_ACTIVO
FROM GN_USUAR u
LEFT JOIN GN_ROL_USUAR r ON u.ID_USUAR = r.ID_USUAR
WHERE u.CEDULA = '1234567890';  -- Tu cédula
```

Deberías ver:
```
┌────────────┬──────────────┬─────────┬──────────────┬──────────┐
│ CEDULA     │ NOMBRE_USUAR │ ROL     │ NOM_ROL      │ ACTIVO   │
├────────────┼──────────────┼─────────┼──────────────┼──────────┤
│ 1234567890 │ Juan Perez   │ ADMIN   │ Administrador│ 1        │
└────────────┴──────────────┴─────────┴──────────────┴──────────┘
```

✅ Si tiene rol asignado, está bien configurado

---

## 🧪 PASO 9: Prueba de Actividad (3 min)

Mientras estás logueado en la aplicación:

1. **Haz clic en algún botón** (cargar datos, crear novedad, etc)
2. Ejecuta nuevamente en SQL:

```sql
-- Ver últimos eventos de acceso
SELECT TOP 10
  CEDULA,
  TIPO_EVENTO,
  ESTADO,
  MENSAJE,
  FECH_EVENTO
FROM GN_LOG_ACCESO
ORDER BY FECH_EVENTO DESC;
```

Deberías ver eventos como:
- `ACCESO_RECURSO` - EXITOSO (cuando accedes a módulos)
- `LOGIN` - EXITOSO (el login)
- `LOGOUT` - EXITOSO (cuando cierres sesión)

✅ Si aparecen `ACCESO_RECURSO`, significa que **el sistema está auditable y registra todo**

---

## 📋 CHECKLIST DE VERIFICACIÓN

Marca ✅ o ❌ en cada punto:

### Base de Datos
- [ ] ✅ Tabla GN_USUAR existe
- [ ] ✅ Tabla GN_SESION existe
- [ ] ✅ Tabla GN_LOG_ACCESO existe
- [ ] ✅ Hay usuarios registrados en GN_USUAR

### Login
- [ ] ✅ Puedo ver la página de login (http://localhost:3000)
- [ ] ✅ Ingreso cédula y contraseña
- [ ] ✅ Hago clic en "Iniciar Sesión"
- [ ] ✅ Me redirige a /index_novedades.html
- [ ] ✅ El navegador (F12 → localStorage) muestra un token

### Datos en Base de Datos
- [ ] ✅ Aparece una NUEVA sesión en GN_SESION después del login
- [ ] ✅ La sesión tiene ESTA_ACTIVA = 1
- [ ] ✅ Aparece un evento LOGIN exitoso en GN_LOG_ACCESO
- [ ] ✅ El usuario tiene ESTA_ACTIVO = 1
- [ ] ✅ El usuario tiene ESTA_BLOQUEADO = 0
- [ ] ✅ El usuario tiene un ROL asignado

### Auditoría
- [ ] ✅ Los eventos de LOGIN aparecen en GN_LOG_ACCESO
- [ ] ✅ Los eventos ACCESO_RECURSO aparecen cuando navego
- [ ] ✅ Los eventos LOGOUT aparecen cuando cierro sesión

---

## 🎯 Interpretación de Resultados

### ✅ TODO FUNCIONA SI:

```
✅ Nueva sesión en GN_SESION (ESTA_ACTIVA = 1)
✅ Evento LOGIN exitoso en GN_LOG_ACCESO
✅ El navegador muestra token en localStorage
✅ Te redirige a la página principal
✅ Aparecen eventos ACCESO_RECURSO cuando navegas
```

### ⚠️ PROBLEMA SI:

| Síntoma | Causa | Solución |
|---------|-------|----------|
| No aparece sesión en GN_SESION | Login no registra sesiones | Revisar server.js SP_REGISTRAR_SESION |
| LOGIN falla en GN_LOG_ACCESO | Contraseña incorrecta | Regenerar hash bcrypt |
| ESTA_BLOQUEADO = 1 | Intentos fallidos | UPDATE GN_USUAR SET ESTA_BLOQUEADO = 0 |
| No hay token en localStorage | Problema en login.js | Revisar consola (F12) |
| Redirige a blanca | index_novedades.html no existe | Verificar archivo existe |

---

## 📊 PASO 10: Crear Reporte (2 min)

Ejecuta una última vez el script completo:

```sql
EXEC [VERIFICAR_LOGIN_FUNCIONANDO.sql]
```

Y **copia TODA la salida** a un archivo de texto:

```
DIAGNOSTICO_LOGIN_[FECHA].txt
```

Guárdalo para referencia futura. Útil si hay problemas después.

---

## 🔄 Monitoreo Continuo

Para monitorear en tiempo real mientras trabajas:

1. Abre SQL Server Management Studio
2. Ten abierto `VERIFICAR_LOGIN_FUNCIONANDO.sql`
3. Cada vez que hagas una acción importante:
   - Login
   - Acceder a un módulo
   - Logout
4. Ejecuta el script (F5)
5. Verifica que aparecen nuevos registros en GN_LOG_ACCESO

---

## 📞 Si Algo Falla

### Falla 1: "Usuario no encontrado"

```sql
-- Verifica que el usuario existe
SELECT * FROM GN_USUAR WHERE CEDULA = '1234567890';
```

Si no aparece:
- El usuario no se creó correctamente
- Necesitas crear uno con CREAR_USUARIO_SQL.sql

### Falla 2: "Cédula o contraseña incorrectos"

```sql
-- Verifica que tiene contraseña hasheada
SELECT CEDULA, PASSW_HASH FROM GN_USUAR WHERE CEDULA = '1234567890';
```

Si PASSW_HASH es NULL o muy corto:
- Necesitas actualizar el hash

### Falla 3: "Usuario bloqueado"

```sql
-- Verifica intentos fallidos
SELECT CEDULA, INTENTOS_FALL, ESTA_BLOQUEADO FROM GN_USUAR WHERE CEDULA = '1234567890';
```

Si ESTA_BLOQUEADO = 1:
```sql
-- Desbloquearlo
UPDATE GN_USUAR SET ESTA_BLOQUEADO = 0, INTENTOS_FALL = 0 WHERE CEDULA = '1234567890';
```

### Falla 4: "No aparecen eventos en GN_LOG_ACCESO"

```sql
-- Verifica que la tabla recibe datos
SELECT COUNT(*) FROM GN_LOG_ACCESO;
```

Si el count no aumenta:
- Problema en authController.js
- Revisar logs del servidor (npm run dev)

---

## ✅ Confirmación Final

Cuando TODO funcione, deberías ver:

```
✅ Login exitoso
✅ Token en localStorage
✅ Sesión en GN_SESION (activa)
✅ Evento LOGIN exitoso en GN_LOG_ACCESO
✅ Acceso a /index_novedades.html
✅ Aparecen eventos ACCESO_RECURSO
✅ Roles y permisos asignados
```

---

¡**El login está funcionando correctamente!** 🎉

Ahora puedes confiar en que:
- ✅ Los datos se guardan en la BD
- ✅ Las sesiones se registran
- ✅ La auditoría funciona
- ✅ El sistema es seguro

---

**¿Necesitas ayuda? Ejecuta los scripts de verificación y comparte los resultados.** 👇
