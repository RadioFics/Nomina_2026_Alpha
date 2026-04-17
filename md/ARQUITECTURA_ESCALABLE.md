# 🏗️ ARQUITECTURA ESCALABLE DE BD + AUTENTICACIÓN

## El Problema Resuelto

Anteriormente, la aplicación no funcionaba porque:
- ❌ Node.js intentaba conectar con usuario `JuanesCalle` que no existía
- ❌ Cada servidor requería usuarios SQL diferentes
- ❌ Se necesitaba SSMS para crear usuarios
- ❌ No era escalable a múltiples máquinas

## La Solución

Ahora la aplicación usa una **arquitectura escalable de dos capas**:

```
┌─────────────────────────────────────────────────────────┐
│ CAPA 1: USUARIOS DE LA INTERFAZ                         │
│ ======================================================= │
│ • Están en tabla: GN_USUAR                             │
│ • Se autentican con email/contraseña EN LA APP         │
│ • NO son usuarios de SQL Server                        │
│ • Usa bcrypt (hash de contraseña seguro)               │
│ • Control de permisos: JWT + tabla GN_GUSUA            │
└────────────────────┬────────────────────────────────────┘
                     │
            (JWT Token)
                     │
┌────────────────────▼────────────────────────────────────┐
│ CAPA 2: CONEXIÓN NODE.JS A SQL SERVER                   │
│ ======================================================= │
│ • Usuario de servicio: app_nomina                       │
│ • Contraseña fija: NominaApp2024#                       │
│ • NUNCA cambia entre servidores                         │
│ • Se crea automáticamente con setup-servidor.js        │
│ • Permisos mínimos: solo leer/escribir MineDax         │
└────────────────────┬────────────────────────────────────┘
                     │
                  SQL Server
                     │
┌────────────────────▼────────────────────────────────────┐
│ BD SQL SERVER: MineDax                                  │
│ ======================================================= │
│ • Tablas de datos: GN_USUAR, GN_NOVEDADES, etc.        │
│ • Usuario "app_nomina" tiene permisos limitados        │
└─────────────────────────────────────────────────────────┘
```

---

## 🚀 Implementación (3 Pasos)

### Paso 1: Crear Usuario de Servicio

**Opción A: Automática (Recomendado)**

```bash
node setup-servidor.js
```

El script te pide:
1. Contraseña de usuario `sa` (solo esta vez)
2. Crea automáticamente el usuario `app_nomina`
3. Actualiza `.env` automáticamente

**Opción B: Manual en SSMS**

Si no puedes ejecutar Node.js:
1. Abre SQL Server Management Studio
2. Conecta al servidor
3. Copia contenido de `setup-bd.sql`
4. Pégalo en una Query y ejecuta (F5)
5. Actualiza `.env`:
   ```env
   UID=app_nomina
   PWD=NominaApp2024#
   ```

---

### Paso 2: Verificar Conexión

```bash
node diagnostico-conexion-bd.js
```

Debe mostrar:
```
✅ DIAGNÓSTICO EXITOSO

Versión SQL Server: [versión]
Total de usuarios: [número]
Base de datos MineDax: EXISTE
```

---

### Paso 3: Iniciar Servidor

```bash
npm start
```

Verás:
```
✓ SERVIDOR CENTRAL DE NÓMINA FUNCIONANDO

📍 Acceso local:    http://localhost:3000
📍 Acceso en red:   http://192.168.1.11:3000
```

---

## 📖 Cómo Funciona

### Flujo de Login

```
Usuario abre: http://192.168.1.11:3000
       ↓
Ingresa email y contraseña
       ↓
Node.js consulta tabla GN_USUAR
       ↓
Verifica bcrypt de contraseña
       ↓
Si es correcto: genera JWT token (8 horas)
       ↓
Usuario puede usar la interfaz
```

**Importante:** La contraseña del usuario (email/pass en GN_USUAR) es diferente de la contraseña de `app_nomina`.

### Permisos

- **Cada usuario de interfaz** tiene permisos según `GN_GUSUA` (grupo/rol)
- **El usuario `app_nomina`** solo tiene permisos técnicos (SELECT, INSERT, UPDATE, DELETE)
- **No hay acceso directo a SQL Server** desde las máquinas clientes

---

## 🔐 Seguridad

### ✅ Buenas Prácticas Implementadas

- ✅ Contraseña de usuario hasheada con bcrypt
- ✅ Usuario de servicio con permisos mínimos
- ✅ JWT para sesiones (no guarda estado en servidor)
- ✅ Control de intentos fallidos (bloquea después de 5)
- ✅ Logs de acceso en GN_LOG_ACCE

### ⚠️ IMPORTANTE

- 🔐 **NUNCA** compartas el archivo `.env` (contiene contraseñas)
- 🔐 Usa `.env` en `.gitignore` (ya está configurado)
- 🔐 La contraseña de `sa` solo se necesita para `setup-servidor.js`
- 🔐 Después de setup, `sa` ya no se usa

---

## 🌍 Para Nuevos Servidores

Cuando necesites instalar el servidor en otra máquina:

### En el servidor nuevo:

```bash
# 1. Copiar el proyecto
cp -r "Interfaz Nomina" /nueva/ubicacion

# 2. Instalar dependencias
npm install

# 3. Ejecutar setup (necesita contraseña de sa)
node setup-servidor.js

# 4. Verificar
node diagnostico-conexion-bd.js

# 5. Iniciar
npm start
```

**Nota:** La contraseña de `app_nomina` es la MISMA en todos los servidores.

---

## 🐛 Bugs Corregidos

### Bug #1: ACT_INAC

**Problema:** El controlador verificaba `ACT_INAC !== 'S'` pero la BD real usa `'A'` para activo.  
**Resultado:** Nadie podía hacer login aunque la contraseña fuera correcta.

**Solución:** Actualizado a `ACT_INAC !== 'A'` en `authController.js` línea 123.

---

## 📋 Checklist de Setup

- [ ] Verificar que `sa` tiene contraseña: `LetItHappen35*` (o la correcta)
- [ ] Ejecutar: `node setup-servidor.js`
- [ ] Ingresar contraseña de `sa` cuando se pida
- [ ] Verificar que `.env` tiene `UID=app_nomina`
- [ ] Ejecutar: `node diagnostico-conexion-bd.js`
- [ ] Verif que muestra ✅ EXITOSO
- [ ] Ejecutar: `npm start`
- [ ] Abrir: `http://localhost:3000`
- [ ] Probar login con un usuario que exista en GN_USUAR

---

## 🆘 Solución de Problemas

### "Login failed for user 'app_nomina'"

Significa que el usuario `app_nomina` no fue creado o la contraseña es diferente.

**Solución:**
```bash
# Verificar en SSMS que existe:
SELECT * FROM sys.sql_logins WHERE name = 'app_nomina';

# Si no existe, ejecutar setup de nuevo:
node setup-servidor.js

# O ejecutar setup-bd.sql en SSMS
```

### "Usuario no encontrado en GN_USUAR"

El email que ingresas no existe en la tabla GN_USUAR.

**Solución:**
1. Verifica que exista el usuario en SSMS:
   ```sql
   SELECT DIR_ELEC, NOM_USUA FROM GN_USUAR;
   ```
2. Usa un email que existe
3. Si no existe ninguno, necesitas crear uno en GN_USUAR

### "Cuenta inactiva (ACT_INAC)"

El usuario existe pero `ACT_INAC ≠ 'A'`.

**Solución en SSMS:**
```sql
UPDATE GN_USUAR SET ACT_INAC = 'A' WHERE DIR_ELEC = 'tu_email@dominio.com';
```

---

## 📞 Contacto IT

Si necesitas ayuda con:
- Crear usuarios en GN_USUAR
- Cambiar permisos de grupos (GN_GUSUA)
- Entender roles y módulos
- Problemas de permisos en BD

Contacta al administrador de BD.

---

**Versión:** 1.0.0  
**Fecha:** 2026-04-15  
**Estado:** ✅ Arquitectura escalable lista
