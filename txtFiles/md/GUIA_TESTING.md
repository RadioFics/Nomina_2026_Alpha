# 🧪 GUÍA DE TESTING - OPCIÓN B IMPLEMENTADA

**Estado:** ✅ Listo para testing  
**Fecha:** 2026-04-14

---

## PASO 1: Iniciar la aplicación

```bash
cd "Interfaz Nomina - Alpha"
npm start
```

**Salida esperada:**
```
✓ Conectado a SQL Server: MineDax
✓ Servidor ejecutándose en http://localhost:3000
```

Si ves este mensaje, la conexión a BD está OK.

---

## PASO 2: Testing del LOGIN

### 2.1 Acceder al login

1. Abre: http://localhost:3000
2. Deberías ver la página de login

### 2.2 Probar login EXITOSO

**Necesitas un usuario válido en GN_USUAR:**

```sql
-- Verificar usuarios existentes en BD
SELECT TOP 5 COD_USUA, NOM_USUA, DIR_ELEC, ACT_INAC, IND_BLOQ 
FROM GN_USUAR
WHERE ACT_INAC = 'S' AND IND_BLOQ = 'N'
```

**Credenciales esperadas:**
- **Email:** `DIR_ELEC` de la BD
- **Contraseña:** La que esté hasheada en `PAS_HASH`

Si no tienes usuarios válidos, puedes crear uno temporalmente para testing:

```sql
-- IMPORTANTE: Para testing SOLO
-- En producción, usar interfaz de usuario
INSERT INTO GN_USUAR (
  COD_EMPR, NOM_USUA, DIR_ELEC, PAS_HASH, ACT_INAC, IND_BLOQ, INT_FALL,
  ACT_USUA, ACT_HORA, ACT_ESTA
)
VALUES (
  1, 'Usuario Test', 'test@example.com', 
  '$2a$10$kQM5RkWuXw3RGX5GQ5Z5e.Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z5Z', -- bcrypt hash de "Test1234"
  'S', 'N', 0,
  'ADMIN', GETDATE(), 'A'
);
```

**Para generar hash de contraseña, usa Node.js:**
```javascript
const bcrypt = require('bcryptjs');
bcrypt.hash('TuContrasena123', 10).then(hash => console.log(hash));
```

---

## PASO 3: Testing de LOGOUT

### 3.1 Después de login exitoso

1. Deberías estar en la página principal (index_novedades.html)
2. Busca el botón de logout (generalmente en esquina superior derecha)
3. Haz click en logout

**Resultado esperado:**
```json
{
  "status": "success",
  "message": "Sesión cerrada correctamente"
}
```

**En BD se debe registrar:**
```sql
-- Verificar que sesión está cerrada
SELECT TOP 1 COD_SESI, EST_SESI, FEC_CIER 
FROM GN_SESION
WHERE COD_USUA = @tuUsuarioId
ORDER BY FEC_INIC DESC
```

Debe mostrar: `EST_SESI = 'C'` y `FEC_CIER` con fecha actual.

---

## PASO 4: Testing de CAMBIO DE CONTRASEÑA

### 4.1 Estar autenticado

1. Login exitoso
2. Navega a: `/cambiar-contrasena` (si existe el endpoint en frontend)

### 4.2 Hacer petición POST

```bash
curl -X POST http://localhost:3000/api/auth/cambiar-contrasena \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer [TU_TOKEN_JWT]" \
  -d '{
    "contrasena_actual": "ContrasenaActual",
    "contrasena_nueva": "ContrasenaNueva123",
    "contrasena_confirmacion": "ContrasenaNueva123"
  }'
```

**Resultado esperado:**
```json
{
  "status": "success",
  "message": "Contraseña cambiada exitosamente"
}
```

**En BD se debe registrar:**
```sql
-- Verificar cambio de contraseña
SELECT TOP 1 FEC_ULCA, CAM_PASS 
FROM GN_USUAR
WHERE COD_USUA = @tuUsuarioId
```

---

## PASO 5: Testing de CRUD DE USUARIOS (Admin)

### 5.1 Obtener usuario actual

```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer [TU_TOKEN_JWT]"
```

**Resultado esperado:**
```json
{
  "status": "success",
  "usuario": {
    "id": 123,
    "empresa": 1,
    "nombre": "Juan Calle",
    "email": "juan@example.com",
    "cedula": 1023456789,
    "activo": true,
    "bloqueado": false,
    "grupo": "Administradores",
    "cargo": 5,
    "fechaActivacion": "2026-01-15T10:30:00Z",
    "fechaUltimaActividad": "2026-04-14T14:22:00Z"
  }
}
```

### 5.2 Listar usuarios

```bash
curl -X GET "http://localhost:3000/api/auth/usuarios?estado=activo&pagina=1&limite=20" \
  -H "Authorization: Bearer [TU_TOKEN_JWT]"
```

**Resultado esperado:**
```json
{
  "status": "success",
  "usuarios": [
    {
      "id": 123,
      "nombre": "Juan Calle",
      "email": "juan@example.com",
      "cedula": 1023456789,
      "activo": true,
      "bloqueado": false,
      "grupo": "Administradores",
      "intentosFallidos": 0,
      "fechaActivacion": "2026-01-15T10:30:00Z"
    }
  ],
  "total": 1,
  "pagina": 1,
  "limite": 20
}
```

### 5.3 Obtener usuario por ID

```bash
curl -X GET http://localhost:3000/api/auth/usuarios/123 \
  -H "Authorization: Bearer [TU_TOKEN_JWT]"
```

### 5.4 Crear usuario

```bash
curl -X POST http://localhost:3000/api/auth/crear-usuario \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer [TU_TOKEN_JWT]" \
  -d '{
    "cedula": "1023456790",
    "email": "nuevo@example.com",
    "contrasena": "ContrasenaNueva123",
    "cod_gusu": 2
  }'
```

**Resultado esperado:**
```json
{
  "status": "success",
  "message": "Usuario creado exitosamente",
  "usuarioId": 124
}
```

### 5.5 Actualizar usuario

```bash
curl -X PUT http://localhost:3000/api/auth/usuarios/124 \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer [TU_TOKEN_JWT]" \
  -d '{
    "nombre": "Nuevo Nombre",
    "email": "email_nuevo@example.com",
    "estado": true,
    "cod_gusu": 3
  }'
```

### 5.6 Cambiar estado usuario

```bash
curl -X PATCH http://localhost:3000/api/auth/usuarios/124/estado \
  -H "Content-Type: application/json" \
  -H "Authorization: Bearer [TU_TOKEN_JWT]" \
  -d '{"estado": false}'
```

### 5.7 Desbloquear usuario

```bash
curl -X PATCH http://localhost:3000/api/auth/usuarios/124/desbloquear \
  -H "Authorization: Bearer [TU_TOKEN_JWT]"
```

### 5.8 Eliminar (inactivar) usuario

```bash
curl -X DELETE http://localhost:3000/api/auth/usuarios/124 \
  -H "Authorization: Bearer [TU_TOKEN_JWT]"
```

---

## PASO 6: Testing de PERMISOS

Si tienes middleware de permisos habilitado:

```bash
curl -X GET http://localhost:3000/api/auth/usuarios \
  -H "Authorization: Bearer [TOKEN_SIN_PERMISOS]"
```

**Debería retornar:**
```json
{
  "status": "error",
  "message": "No tienes permisos para view en auth"
}
```

---

## PASO 7: Verificar BD

### 7.1 Log de eventos

```sql
SELECT TOP 20 COD_LOGA, COD_USUA, TIP_EVEN, EST_EVEN, DES_EVEN, FEC_EVEN
FROM GN_LOG_ACCE
ORDER BY FEC_EVEN DESC
```

Deberías ver eventos de:
- LOGIN (exitoso/fallido)
- LOGOUT
- CAMBIO_PASS
- UPDATE_USUA
- CAMBIO_ESTADO
- DESBLOQUEO
- DELETE_USUA

### 7.2 Sesiones

```sql
SELECT COD_SESI, COD_USUA, EST_SESI, FEC_INIC, FEC_ULAC, FEC_CIER
FROM GN_SESION
ORDER BY FEC_INIC DESC
```

Deberías ver sesiones con `EST_SESI = 'A'` (activas) o `EST_SESI = 'C'` (cerradas).

### 7.3 Intentos fallidos

```sql
SELECT COD_USUA, NOM_USUA, INT_FALL, IND_BLOQ
FROM GN_USUAR
WHERE INT_FALL > 0 OR IND_BLOQ = 'S'
```

---

## CHECKLIST DE VALIDACIÓN

```
AUTENTICACIÓN:
[ ] Login exitoso con credenciales válidas
[ ] Login falla con contraseña incorrecta
[ ] Login falla con usuario no existente
[ ] Logout cierra sesión correctamente
[ ] Token JWT está en localStorage después de login
[ ] Token es válido para siguientes requests

CONTRASEÑA:
[ ] Cambio de contraseña funciona
[ ] Contraseña anterior ya no sirve después de cambio
[ ] Validación de longitud mínima (8 caracteres)
[ ] Validación de coincidencia de contraseñas

ADMINISTRACIÓN DE USUARIOS:
[ ] obtenerUsuarioActual retorna datos correctos
[ ] listarUsuarios retorna lista completa
[ ] obtenerUsuario por ID funciona
[ ] crearUsuario crea nuevo usuario
[ ] actualizarUsuario modifica datos
[ ] cambiarEstadoUsuario activa/desactiva
[ ] desbloquearUsuario limpia INT_FALL e IND_BLOQ
[ ] eliminarUsuario marca como inactivo

BASE DE DATOS:
[ ] GN_LOG_ACCE tiene eventos de login/logout
[ ] GN_SESION tiene sesiones activas/cerradas
[ ] GN_USUAR tiene INT_FALL correcto
[ ] No hay errores SQL en logs del servidor
```

---

## DEBUGGING

Si encuentras problemas:

### 1. Ver logs del servidor

```bash
# El servidor muestra errores en consola
[ERROR] [LOGOUT ERROR] ...
```

### 2. Ver request/response en navegador

```javascript
// En consola del navegador
localStorage.getItem('authToken')  // Ver token
fetch('http://localhost:3000/api/auth/me', {
  headers: { 'Authorization': `Bearer ${localStorage.getItem('authToken')}` }
}).then(r => r.json()).then(console.log)
```

### 3. Verificar BD directamente

```sql
-- Verificar usuario
SELECT * FROM GN_USUAR WHERE NOM_USUA = 'Juan'

-- Verificar log de eventos
SELECT TOP 5 * FROM GN_LOG_ACCE ORDER BY FEC_EVEN DESC

-- Verificar sesión
SELECT TOP 5 * FROM GN_SESION ORDER BY FEC_INIC DESC
```

---

## ERRORES COMUNES

### Error: "Token inválido o expirado"
- JWT_SECRET en .env debe ser el mismo en middleware
- Token puede haber expirado (8 horas)
- Bearer token mal formateado en header

### Error: "Invalid column name"
- Campo de BD todavía tiene nombre incorrecto
- Revisar CAMBIOS_IMPLEMENTADOS.md para mapeo correcto

### Error: "Usuario no encontrado"
- Usuario no existe en GN_USUAR
- Verificar DIR_ELEC o buscar por NUM_IDEN en GN_TERCE

### Error: "No tienes permisos"
- Usuario no tiene grupo asignado (COD_GUSU = NULL)
- Grupo no tiene permisos en GN_PERMI
- NOM_MODU o TIP_ACCI no coinciden

---

## SIGUIENTE FASE

Después de validar que todo funciona:

1. **Testing de otros módulos:**
   - Nómina
   - Reportes
   - Maestros

2. **Testing de seguridad:**
   - SQL injection
   - XSS
   - CSRF

3. **Performance:**
   - Tiempo de respuesta
   - Carga de usuario bajo stress

4. **Producción:**
   - Cambiar JWT_SECRET a valor seguro
   - Usar variables de entorno para credenciales BD
   - Habilitar HTTPS
   - Configurar rate limiting

