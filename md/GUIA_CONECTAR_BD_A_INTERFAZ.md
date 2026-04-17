# 🔗 Guía Completa: Conectar SQL Server a tu Interfaz Web

## 📋 Resumen Ejecutivo

Tu arquitectura es:
```
┌─────────────────┐
│   Login.html    │  (Frontend)
│   Index.html    │
└────────┬────────┘
         │ (fetch/axios)
         ↓
┌──────────────────────┐
│  Server.js (Express) │  (Backend API)
│  - Port 3000         │
│  - Rutas: /api/*     │
└────────┬─────────────┘
         │ (mssql)
         ↓
┌──────────────────────┐
│  SQL Server 2019     │  (Base de Datos)
│  MineDax BD          │
│  CM-ITD-P-05\SQLExp  │
└──────────────────────┘
```

---

## 🔧 Paso 1: Verificar Conectividad a SQL Server

Primero, verifica que **SQL Server está accesible**:

### Opción A: Desde SSMS (SQL Server Management Studio)

1. Abre **SQL Server Management Studio**
2. Conecta a: `CM-ITD-P-05\SQLEXPRESS`
3. Usa usuario: `JuanesCalle`
4. Si conecta, la BD está accesible ✅

### Opción B: Desde línea de comandos

```bash
# Instala herramienta de diagnóstico
npm install sqlserver-diagnostic -g

# O simplemente ejecuta:
node -e "
const sql = require('mssql');
const config = {
  server: 'CM-ITD-P-05\\\\SQLEXPRESS',
  database: 'MineDax',
  authentication: { type: 'default', options: { userName: 'JuanesCalle', password: 'LetItHappen35*' } },
  options: { encrypt: false, trustServerCertificate: true }
};
new sql.ConnectionPool(config).connect()
  .then(() => console.log('✅ CONECTADO'))
  .catch(e => console.log('❌ ERROR:', e.message));
"
```

---

## ✅ Paso 2: Verificar y Completar la Configuración

Tu archivo `.env` debe tener:

```bash
# SQL Server
SERVER=CM-ITD-P-05\SQLEXPRESS
DATABASE=MineDax
UID=JuanesCalle
PWD=LetItHappen35*
DRIVER=ODBC Driver 17 for SQL Server

# Servidor
PORT=3000
NODE_ENV=development
```

✅ **Status**: Tu `.env` está configurado correctamente

---

## 🚀 Paso 3: Iniciar el Servidor Backend

Ejecuta en terminal (en la carpeta del proyecto):

```bash
# Opción 1: Ejecución simple
npm start

# Opción 2: Con reinicio automático (desarrollo)
npm run dev

# Opción 3: Directamente
node server.js
```

**Resultado esperado:**
```
✓ Servidor ejecutándose en http://localhost:3000
✓ Conectado a SQL Server: MineDax
```

---

## 🧪 Paso 4: Probar Conexión a BD

Ejecuta el script de prueba:

```bash
node test-db-connection.js
```

Si ves esto, ¡todo está correcto! ✅
```
✅ Conexión exitosa a: MineDax
✅ Versión SQL Server: Microsoft SQL Server 2019
✅ Total de usuarios en BD: 127
```

Si ves error, ve a la sección "Solucionar Problemas" ⬇️

---

## 🔐 Paso 5: Usar los Endpoints desde Frontend

Tu frontend (`login.html`, `index.html`) debe hacer llamadas a la API. Aquí están los endpoints disponibles:

### 🔑 Autenticación

```javascript
// 1. LOGIN
fetch('http://localhost:3000/api/auth/login', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    cedula_o_email: '1234567890',
    contrasena: 'tu_contraseña'
  })
})
.then(res => res.json())
.then(data => {
  if (data.token) {
    // Guardar token en localStorage
    localStorage.setItem('token', data.token);
    console.log('Login exitoso');
  }
});
```

### 📊 Nómina

```javascript
// 2. OBTENER NOVEDADES
const token = localStorage.getItem('token');

fetch('http://localhost:3000/api/nomina/novedades', {
  method: 'GET',
  headers: {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json'
  }
})
.then(res => res.json())
.then(data => console.log('Novedades:', data));
```

---

## 🛠️ Paso 6: Verificar Rutas Disponibles

Tu servidor tiene estas rutas:

| Ruta | Método | Descripción |
|------|--------|-------------|
| `/api/health` | GET | Verificar que servidor está corriendo |
| `/api/auth/login` | POST | Iniciar sesión |
| `/api/auth/logout` | POST | Cerrar sesión |
| `/api/nomina/` | GET | Listar nóminas |
| `/api/reportes/` | GET | Reportes |
| `/api/maestros/` | GET | Datos maestros |

Prueba en navegador:
```
http://localhost:3000/api/health
```

Deberías ver:
```json
{
  "status": "OK",
  "message": "Servidor de nómina funcionando"
}
```

---

## ❌ Solucionar Problemas

### Problema 1: "Connection lost - socket hang up"

**Causa**: No puede conectar a SQL Server

**Soluciones**:
1. ✅ Verifica que SQL Server está corriendo:
   ```bash
   # Windows
   Get-Service MSSQL* | Format-Table
   ```

2. ✅ Prueba conectar desde SSMS a `CM-ITD-P-05\SQLEXPRESS`

3. ✅ Verifica que el usuario `JuanesCalle` tiene permisos en `MineDax`

4. ✅ Desactiva temporalmente firewall:
   ```bash
   # PowerShell (como administrador)
   Set-NetFirewallProfile -Profile Domain,Public,Private -Enabled $false
   ```

### Problema 2: "Invalid login attempt"

**Causa**: Credenciales incorrectas

**Solución**:
1. Abre SSMS
2. Conecta con: `CM-ITD-P-05\SQLEXPRESS` + `JuanesCalle`
3. Si falla, la contraseña es incorrecta
4. Actualiza la contraseña en `.env`

### Problema 3: "Database not found"

**Causa**: BD `MineDax` no existe

**Solución**:
```sql
-- En SSMS, ejecuta:
SELECT name FROM sys.databases WHERE name = 'MineDax'
```

Si no aparece, necesitas restaurarla.

### Problema 4: Puerto 3000 en uso

**Causa**: Otro proceso está usando el puerto

**Solución**:
```bash
# Windows
netstat -ano | findstr :3000

# Si algo está usando, cambia en .env:
PORT=3001
```

---

## 📱 Integración Completa: Ejemplo Práctico

### Frontend (login.html)

```html
<!-- Al hacer submit del formulario: -->
<script>
document.getElementById('loginForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  
  const cedula = document.getElementById('cedula').value;
  const contrasena = document.getElementById('contrasena').value;
  
  try {
    const response = await fetch('http://localhost:3000/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        cedula_o_email: cedula,
        contrasena: contrasena
      })
    });
    
    const data = await response.json();
    
    if (data.token) {
      // Guardar token
      localStorage.setItem('token', data.token);
      // Redirigir a dashboard
      window.location.href = '/index.html';
    } else {
      alert('Error: ' + data.message);
    }
  } catch (error) {
    console.error('Error de conexión:', error);
    alert('No se puede conectar al servidor');
  }
});
</script>
```

### Backend (Endpoint de Login)

Tu `controllers/authController.js` ya tiene esto implementado ✅

### Base de Datos

Tu tabla `GN_USUAR` contiene toda la información ✅

---

## 📊 Diagrama de Flujo Completo

```
Usuario abre login.html
        ↓
   Ingresa credenciales
        ↓
Frontend hace: POST /api/auth/login
        ↓
Servidor Node.js recibe
        ↓
Consulta a SQL Server: SELECT * FROM GN_USUAR WHERE...
        ↓
BD retorna usuario
        ↓
Valida contraseña con bcrypt
        ↓
Genera JWT token
        ↓
Retorna token al frontend
        ↓
Frontend guarda token en localStorage
        ↓
Usa token para futuras peticiones
        ↓
Usuario ve index.html con datos de nómina
```

---

## ✨ Checklist Final

- [ ] Archivo `.env` configurado correctamente
- [ ] SQL Server accesible desde SSMS
- [ ] Ejecuta `npm install` (dependencias listas)
- [ ] Ejecuta `npm start` (servidor corriendo)
- [ ] Accedes a `http://localhost:3000/api/health` (responde)
- [ ] Script de prueba funciona (`node test-db-connection.js`)
- [ ] Frontend hace `fetch` a `/api/auth/login`
- [ ] Usuario puede iniciar sesión
- [ ] Frontend obtiene datos desde `/api/nomina`

---

## 📚 Próximos Pasos

1. **Completa endpoints faltantes** (si los hay)
2. **Añade middleware de autenticación** en todas las rutas
3. **Documenta la API** con Swagger/OpenAPI
4. **Implementa validación** en el frontend
5. **Añade logs y monitoreo** en el backend

---

## 🆘 ¿Necesitas Ayuda?

Si tienes problemas:

1. Ejecuta: `node test-db-connection.js`
2. Copia el error completo
3. Verifica la sección "Solucionar Problemas"
4. Si persiste, necesitamos revisar:
   - Credenciales en `.env`
   - Estado de SQL Server
   - Logs del servidor Node.js

