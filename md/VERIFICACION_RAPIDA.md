# ⚡ Guía Rápida de Verificación

## ✅ Checklist de Configuración

### 1. Verificar Variables de Entorno
```bash
# Abrir .env y verificar:
SERVER=CM-ITD-P-05\SQLEXPRESS
DATABASE=MineDax
UID=JuanesCalle
PWD=LetItHappen35*
PORT=3000
NODE_ENV=development
```

### 2. Instalar Dependencias
```bash
npm install
```

### 3. Ejecutar Setup de Base de Datos
```bash
node setup-database.js
```

**Respuesta esperada:**
```
✓ Conexión establecida con MineDax
✓ Tablas encontradas: GN_USUAR, GN_SESION, GN_ROL_USUAR...
✓ Total de usuarios en BD: X
✓ SETUP COMPLETADO
```

### 4. Ejecutar Test de Conexión
```bash
node test-db-connection.js
```

**Respuesta esperada:**
```
✓ Conectado a SQL Server: MineDax
✓ Versión SQL Server: Microsoft SQL Server 2025...
✓ Total de usuarios en BD: X
✓ PRUEBA COMPLETADA: La conexión funciona correctamente
```

### 5. Iniciar Servidor
```bash
npm start
```

**Respuesta esperada:**
```
✓ Conectado a SQL Server: MineDax
✓ Servidor ejecutándose en http://localhost:3000
```

---

## 🧪 Testing Manual de Endpoints

### Obtener Token (requiere usuario existente)
```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "cedula_o_email": "1234567890",
    "contrasena": "password123"
  }'
```

**Copiar el `token` del resultado**

### Verificar Sesión
```bash
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer TOKEN_AQUI"
```

### Listar Usuarios (requiere Admin)
```bash
curl -X GET "http://localhost:3000/api/auth/usuarios?estado=activo" \
  -H "Authorization: Bearer TOKEN_AQUI"
```

### Crear Usuario (requiere Admin)
```bash
curl -X POST http://localhost:3000/api/auth/crear-usuario \
  -H "Authorization: Bearer TOKEN_AQUI" \
  -H "Content-Type: application/json" \
  -d '{
    "cedula": "9876543210",
    "email": "nuevo@mining.com",
    "contrasena": "Password123"
  }'
```

### Actualizar Usuario
```bash
curl -X PUT http://localhost:3000/api/auth/usuarios/ID_AQUI \
  -H "Authorization: Bearer TOKEN_AQUI" \
  -H "Content-Type: application/json" \
  -d '{
    "nombre": "Juan Carlos",
    "email": "juan@mining.com",
    "nivel": 2
  }'
```

### Cambiar Estado a Inactivo
```bash
curl -X PATCH http://localhost:3000/api/auth/usuarios/ID_AQUI/estado \
  -H "Authorization: Bearer TOKEN_AQUI" \
  -H "Content-Type: application/json" \
  -d '{"estado": false}'
```

### Desbloquear Usuario
```bash
curl -X PATCH http://localhost:3000/api/auth/usuarios/ID_AQUI/desbloquear \
  -H "Authorization: Bearer TOKEN_AQUI"
```

### Eliminar Usuario
```bash
curl -X DELETE http://localhost:3000/api/auth/usuarios/ID_AQUI \
  -H "Authorization: Bearer TOKEN_AQUI"
```

### Logout
```bash
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer TOKEN_AQUI"
```

---

## 🐛 Troubleshooting

### ❌ "Cannot find module 'mssql'"
```bash
npm install mssql bcryptjs jsonwebtoken
```

### ❌ "Connection lost"
1. Verificar que SQL Server está corriendo:
   ```powershell
   Get-Service MSSQL* | Format-Table
   ```
2. Verificar .env con credenciales correctas
3. Probar conexión con SSMS

### ❌ "Invalid column name"
- Ejecutar: `node setup-database.js`
- Este script crea las tablas si no existen

### ❌ "401 Unauthorized"
- Verificar que el token es válido
- Verificar que el token está en el header: `Authorization: Bearer {token}`
- El token podría estar expirado, obtener uno nuevo con login

### ❌ "403 Forbidden"
- Solo Admins (nivel 3) pueden acceder a /api/auth/usuarios
- Verificar que el usuario tiene NIVEL_USUAR = 3
- Ejecutar en BD: `UPDATE GN_USUAR SET NIVEL_USUAR = 3 WHERE CEDULA = '...'`

---

## 📊 Verificar Datos en Base de Datos

### Ver todos los usuarios
```sql
SELECT ID_USUAR, CEDULA, NOMBRE_USUAR, NIVEL_USUAR, ESTA_ACTIVO, FECH_CREACION
FROM GN_USUAR
ORDER BY FECH_CREACION DESC
```

### Ver sesiones activas
```sql
SELECT ID_SESION, CEDULA, FECH_INICIO, IP_DIRECCION, ESTA_ACTIVA
FROM GN_SESION
WHERE ESTA_ACTIVA = 1
```

### Ver auditoría de eventos
```sql
SELECT ID_LOG, CEDULA, TIPO_EVENTO, ESTADO, MENSAJE, FECH_EVENTO
FROM GN_LOG_ACCESO
ORDER BY FECH_EVENTO DESC
```

### Ver intentos fallidos
```sql
SELECT CEDULA, NOMBRE_USUAR, INTENTOS_FALL, ESTA_BLOQUEADO
FROM GN_USUAR
WHERE INTENTOS_FALL > 0 OR ESTA_BLOQUEADO = 1
```

### Resetear usuario bloqueado
```sql
UPDATE GN_USUAR
SET ESTA_BLOQUEADO = 0, INTENTOS_FALL = 0
WHERE CEDULA = '1234567890'
```

---

## 🎯 Flujo Completo de Prueba

```bash
# 1. Setup
node setup-database.js

# 2. Test
node test-db-connection.js

# 3. Iniciar servidor
npm start

# En otra terminal:

# 4. Login
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"cedula_o_email":"1234567890","contrasena":"password123"}'

# 5. Copiar TOKEN de respuesta

# 6. Verificar usuario actual
curl -X GET http://localhost:3000/api/auth/me \
  -H "Authorization: Bearer $TOKEN"

# 7. Si es Admin: Listar usuarios
curl -X GET http://localhost:3000/api/auth/usuarios \
  -H "Authorization: Bearer $TOKEN"

# 8. Logout
curl -X POST http://localhost:3000/api/auth/logout \
  -H "Authorization: Bearer $TOKEN"
```

---

## 📝 Documentación Disponible

| Archivo | Contenido |
|---------|-----------|
| GUIA_CONECTAR_BD_A_INTERFAZ.md | Guía general de conexión a BD |
| DOCUMENTACION_USUARIOS_LOGIN.md | Documentación completa del sistema de autenticación |
| RESUMEN_CAMBIOS.md | Resumen de todos los cambios realizados |
| VERIFICACION_RAPIDA.md | Este archivo - checklist rápido |

---

## ✅ Lista de Verificación Final

- [ ] Variables de entorno (.env) configuradas
- [ ] SQL Server accesible
- [ ] `npm install` completado
- [ ] `node setup-database.js` ejecutado exitosamente
- [ ] `node test-db-connection.js` ejecutado exitosamente
- [ ] Servidor iniciado con `npm start`
- [ ] Login funciona en navegador
- [ ] Endpoints CRUD probados con token válido
- [ ] Auditoría registra eventos en GN_LOG_ACCESO
- [ ] Base de datos tiene al menos 1 usuario creado

---

**Si todo está ✅, tu sistema de login y gestión de usuarios está completamente funcional.**

Para más detalles, ver: `DOCUMENTACION_USUARIOS_LOGIN.md`
