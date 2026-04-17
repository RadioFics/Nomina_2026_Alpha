# Panel de Configuración de Base de Datos - Guía de Uso

## Resumen

Se ha implementado un **panel de configuración de BD integrado en la interfaz web** que permite a los administradores reconfigurar la conexión a SQL Server `MineDax` **sin reiniciar el servidor**, completamente desde el navegador.

## Archivos Implementados

| Archivo | Propósito |
|---------|-----------|
| `config/database.js` | ✅ **Modificado** — Ahora soporta reconfiguración en runtime |
| `controllers/databaseController.js` | ✅ **Nuevo** — Lógica de los 3 endpoints |
| `routes/database.js` | ✅ **Nuevo** — Rutas protegidas con JWT + admin |
| `server.js` | ✅ **Modificado** — Monta la ruta `/api/database` |
| `db-config.html` | ✅ **Nuevo** — Panel web con interfaz dark/gold |

## Cómo Usar

### 1. Iniciar el Servidor

```bash
npm start
```

Debería ver en la consola:
```
[DB] Config cargada: DESKTOP-VEABB8R\SQLEXPRESS / MineDax
✓ SERVIDOR CENTRAL DE NÓMINA FUNCIONANDO
```

### 2. Acceder al Panel

Abre en tu navegador (con cuenta admin):

```
http://localhost:3000/db-config.html
```

o desde otra máquina en la red:

```
http://192.168.x.x:3000/db-config.html
```

### 3. Usar el Panel

#### **Tarjeta de Estado Actual** (arriba)
- Muestra la conexión actual: Servidor, BD, Usuario, Latencia en ms
- Badge verde = Conectado, Rojo = Desconectado
- Botón "↻ Actualizar" para refrescar el estado

#### **Formulario de Nueva Configuración** (centro)
- **Servidor**: HOSTNAME\INSTANCIA o IP (ej: `DESKTOP-ABC123\SQLEXPRESS` o `192.168.1.100\SQLEXPRESS`)
- **Base de Datos**: nombre exacto (ej: `MineDax`)
- **Usuario SQL**: usuario de conexión (ej: `app_nomina`)
- **Contraseña**: contraseña del usuario (ej: `Nomina2024App`)

#### **Botón "🔌 Probar Conexión"**
1. Valida todos los campos
2. Intenta conectar al servidor de forma **temporal**
3. Si exitosa:
   - Muestra ✅ con latencia en ms (verde <50ms, amarillo <200ms, rojo >200ms)
   - Habilita el botón "Guardar y Aplicar"
4. Si falla:
   - Muestra ❌ con el error (ej: "Servidor no alcanzable")
   - Botón "Guardar" permanece deshabilitado

#### **Botón "💾 Guardar y Aplicar"**
- ✅ Habilitado SOLO si la prueba pasó y los datos no cambiaron
- Persiste la config al `.env`
- Reconecta el servidor a la **nueva base de datos inmediatamente**
- No requiere reinicio del servidor
- Queda registrado en consola con el usuario que hizo el cambio

### 4. Validaciones de Seguridad

✅ Solo usuarios con nivel **administrador (cod_gusu = 3)** pueden acceder  
✅ Las contraseñas se pruebas internamente antes de guardarse  
✅ El formulario deshabilita "Guardar" si los datos cambian después del test  
✅ JWT se valida en todos los endpoints  

## Ejemplos de Uso

### Cambiar a otro servidor en la red local

1. Obtén la IP del servidor SQL: `ping SERVIDOR-SQL` en PowerShell
2. En el formulario ingresa:
   - Servidor: `192.168.1.100\SQLEXPRESS`
   - BD: `MineDax`
   - Usuario: `app_nomina`
   - Contraseña: `Nomina2024App`
3. Clic "Probar Conexión" → espera a verde
4. Clic "Guardar y Aplicar"
5. El servidor **instantáneamente** cambia de BD, sin reinicio

### Validar credenciales incorrectas

Si escribes una contraseña incorrecta:
1. Clic "Probar Conexión"
2. Verás ❌ con error "Login failed..." o similar
3. El botón "Guardar" permanece gris
4. Puedes corregir y probar de nuevo

### Ver estado actual sin cambiar nada

1. Abre `db-config.html`
2. La tarjeta superior muestra el servidor activo
3. Clic "↻ Actualizar" para refrescar latencia en tiempo real

## Cambios en `config/database.js`

Se reestructuró el módulo para soportar reconfiguración:

**Antes:**
```js
const config = { ... }  // Construido al módulo, inmutable
let pool = null;
async function getConnection() { ... }
```

**Ahora:**
```js
let runtimeConfig = null;  // Mutable en runtime
function buildConfig(params) { ... }  // Factory, construye cada vez

async function getConnection() { ... }
async function testConnection(params) { ... }  // Prueba temporal
async function reconfigure(params) { ... }  // Aplica nueva config
function getStatus() { ... }  // Retorna estado actual
```

**Beneficios:**
- ✅ Pool de conexión se cierra y reabre sin reiniciar Node
- ✅ Las funciones `testConnection()` y `reconfigure()` NO matan el proceso si fallan
- ✅ `writeEnv()` actualiza solo las claves de BD, deja intacto `JWT_SECRET`, `PORT`, etc.

## Endpoints API

Todos requieren `Authorization: Bearer <JWT>`

### GET `/api/database/status`
Cualquier usuario autenticado
```bash
curl -H "Authorization: Bearer <token>" http://localhost:3000/api/database/status
```
**Respuesta:**
```json
{
  "status": "success",
  "data": {
    "connected": true,
    "server": "DESKTOP-VEABB8R\\SQLEXPRESS",
    "database": "MineDax",
    "user": "app_nomina",
    "latencyMs": 45
  }
}
```

### POST `/api/database/test`
Solo administrador (cod_gusu = 3)
```bash
curl -X POST -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"server":"DESKTOP-VEABB8R\\SQLEXPRESS","database":"MineDax","uid":"app_nomina","pwd":"Nomina2024App"}' \
  http://localhost:3000/api/database/test
```
**Respuesta (exitosa):**
```json
{
  "status": "success",
  "message": "Conexión exitosa (52ms)",
  "data": {"latencyMs": 52, "success": true}
}
```

### POST `/api/database/configure`
Solo administrador. Primero prueba, luego aplica.
```bash
curl -X POST -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"server":"...","database":"...","uid":"...","pwd":"..."}' \
  http://localhost:3000/api/database/configure
```

## Solución de Problemas

### "Acceso denegado. Se requiere nivel administrador"
- Tu usuario no es admin
- Verifica que `cod_gusu = 3` en la tabla `GN_USUAR` de tu usuario

### "Conexión fallida: Servidor no accesible"
- El hostname/IP es incorrecto
- El servidor SQL no está escuchando en el puerto 1433
- El firewall bloquea la conexión
- Prueba con `sqlcmd` desde la máquina del servidor para descartar

### "Cannot open database 'MineDax'"
- El nombre de la BD es incorrecto
- La BD no existe en ese servidor
- Consulta al DBA para el nombre exacto

### Los cambios no se aplican
- Recarga la página después de "Guardar y Aplicar"
- Verifica que el `.env` fue actualizado: abre el archivo y busca `SERVER=`
- Si falla al reconectar, revisa la consola del servidor para mensajes de error

### El servidor se cae después de "Guardar y Aplicar"
- Normalmente NO debería caer
- Si pasa, revisa la consola del servidor: `/database/configure` debe haber registrado un error en `data.error`
- Ejecuta `npm start` nuevamente

## Consideraciones de Producción

⚠️ **Seguridad:**
- Este panel requiere **HTTPS en producción** (la contraseña viaja en JSON en el body)
- Solo usa en **red corporativa cerrada**
- Los credentials se almacenan en `.env` en texto plano (estándar en Node.js)

⚠️ **Impacto:**
- Los cambios se aplican **instantáneamente**
- Cualquier query en curso completa con el pool anterior
- Los usuarios no se desconectan, pero sus próximas queries van a la nueva BD

⚠️ **Backups:**
- Antes de cambiar a un servidor de producción, ten una copia de `.env` original
- El cambio se registra en la consola con timestamp y usuario que lo ejecutó

## Logs en Consola

Cuando se reconfigura, verás:
```
[DB] .env actualizado con nueva config de BD
[DB] Conectado: NUEVO-SERVIDOR\SQLEXPRESS / MineDax
[DB CONFIG] Admin admin@ejemplo.com cambió config BD a NUEVO-SERVIDOR/MineDax
```

## Próximos Pasos Opcionales

1. **Descubrimiento automático de servidores**: Agregar un endpoint que liste servidores SQL disponibles en la red
2. **Historial de configuraciones**: Guardar un log de cambios con timestamp y usuario
3. **Validación de esquema**: Verificar que las tablas esperadas existan en la nueva BD
4. **Sincronización multi-instancia**: Si hay múltiples servidores Node, sincronizar la config entre ellos

---

**Fecha de implementación**: 2026-04-16  
**Versión**: 1.0  
**Responsable**: Sistema de Nómina - Admin
