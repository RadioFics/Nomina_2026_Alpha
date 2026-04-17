# 🚀 GUÍA DE SETUP - INTERFAZ NÓMINA

Esta guía te ayuda a configurar la aplicación en tu máquina, en cualquier ubicación, y a conectarte correctamente a la base de datos SQL Server.

---

## 📋 REQUISITOS PREVIOS

- **Node.js** 14+ instalado
- **SQL Server** accesible (con credenciales válidas)
- **npm** o **yarn** instalado
- Acceso a **PowerShell** o **CMD** para comandos

---

## ⚡ SETUP RÁPIDO (5 minutos)

### 1️⃣ Instalar dependencias
```bash
npm install
```

### 2️⃣ Configurar variables de entorno
```bash
# Copiar archivo de ejemplo
cp .env.example .env

# Abrir .env en tu editor favorito
# Y actualizar los valores de:
# - SERVER
# - DATABASE
# - UID
# - PWD
```

### 3️⃣ Validar configuración
```bash
node validate-env.js
```

### 4️⃣ Probar conexión a BD
```bash
node diagnostico-conexion-bd.js
```

### 5️⃣ Iniciar servidor
```bash
npm start
```

**Listo** 🎉 Accede a `http://localhost:3000`

---

## 🔧 CONFIGURACIÓN DETALLADA

### Paso 1: Obtener la IP del Servidor SQL

**Opción A: Usar el script automático**
```bash
node get-server-ip.js
```

**Opción B: Manualmente en PowerShell**
```powershell
nslookup CM-ITD-P-05
# Busca la línea: Address: 192.168.x.x
```

**Opción C: Desde CMD**
```cmd
nslookup CM-ITD-P-05
```

### Paso 2: Editar archivo `.env`

Abre `.env` y actualiza:

```env
# Usa la IP que obtuviste en el Paso 1
SERVER=192.168.1.100\SQLEXPRESS

DATABASE=MineDax

# Tu usuario de SQL Server
UID=JuanesCalle

# Tu contraseña de SQL Server
PWD=LetItHappen35*

PORT=3000
NODE_ENV=development
```

### Paso 3: Validar la configuración

```bash
node validate-env.js
```

Deberías ver:
```
✅ SERVER: Contiene instancia específica
✅ DATABASE: MineDax
✅ UID: JuanesCalle
✅ PWD: ****

✅ CONFIGURACIÓN VÁLIDA - LISTO PARA IR
```

---

## 🧪 PROBAR CONEXIÓN A BASE DE DATOS

Antes de iniciar el servidor, verifica que puedas conectarte a SQL Server:

```bash
node diagnostico-conexion-bd.js
```

**Si todo está bien, verás:**
```
✅ DIAGNÓSTICO EXITOSO

✅ Puedes ejecutar tu servidor con:
   npm start
```

**Si hay error, el script te dirá exactamente qué está mal.**

---

## 🚀 INICIAR LA APLICACIÓN

Una vez validado todo:

```bash
npm start
```

Verás:
```
✓ Servidor ejecutándose en http://localhost:3000
✓ Conectado a SQL Server: 192.168.1.100\MineDax
```

Abre tu navegador en `http://localhost:3000` 🎉

---

## 🔄 CAMBIAR DE MÁQUINA

Si quieres usar la misma aplicación en otra máquina:

### Pasos:

1. **Copia todo el proyecto** a la nueva máquina
   ```bash
   # Copiar carpeta completa
   ```

2. **Instala Node.js** si no lo tienes

3. **Copia tu `.env` actual** O crea uno nuevo

   ```bash
   cp .env.example .env
   # Actualiza SERVER, UID, PWD si es necesario
   ```

4. **Instala dependencias**
   ```bash
   npm install
   ```

5. **Valida y prueba**
   ```bash
   node validate-env.js
   node diagnostico-conexion-bd.js
   ```

6. **Inicia**
   ```bash
   npm start
   ```

---

## ⚙️ OPCIONES DE SERVIDOR

Según dónde esté tu SQL Server, usa uno de estos formatos en `.env`:

### Opción 1: Hostname (Para máquinas en la misma red)
```env
SERVER=CM-ITD-P-05\SQLEXPRESS
```
✅ Funciona si estás conectado a la red corporativa
❌ No funciona si trabajas desde casa o red diferente

### Opción 2: IP (Recomendado para múltiples máquinas)
```env
SERVER=192.168.1.100\SQLEXPRESS
```
✅ Funciona desde cualquier máquina que pueda alcanzar esa IP
✅ Mejor para escalabilidad

### Opción 3: Nombre de dominio (Para servidores remotos)
```env
SERVER=miservidor.empresa.com\SQLEXPRESS
```
✅ Funciona desde cualquier ubicación
✅ Ideal si el servidor está en la nube

---

## 🐛 SOLUCIÓN DE PROBLEMAS

### "No se puede conectar al servidor"
```
Causas:
1. SERVER está mal configurado
2. SQL Server no está accesible en esa IP
3. El firewall bloquea la conexión

Solución:
- Verifica la IP: nslookup CM-ITD-P-05
- Prueba conectar desde SQL Server Management Studio (SSMS)
- Abre puerto 1433 en el firewall
```

### "Invalid login credentials"
```
Causas:
1. UID o PWD incorrectos
2. El usuario no existe en SQL Server
3. El usuario no tiene permisos en MineDax

Solución:
- Verifica credenciales en SSMS
- Crea el usuario si no existe
- Asigna permisos a la BD MineDax
```

### "Cannot open database"
```
Causas:
1. Base de datos MineDax no existe
2. Está offline
3. Credenciales sin acceso

Solución:
- Verifica que MineDax exista en SSMS
- Si no existe, restaura desde un backup
- Verifica permisos del usuario
```

### "Timeout"
```
Causas:
1. Servidor SQL Server no responde
2. Problema de red
3. Firewall bloqueando

Solución:
- Verifica que SQL Server esté corriendo
- Prueba conectar desde otra aplicación (SSMS)
- Comprueba conectividad de red (ping)
```

---

## 📦 DEPLOYAR A SERVIDOR REMOTO

Si quieres publicar esto en un servidor:

### Paso 1: Crear `.env.production`
```env
SERVER=servidor-remoto.com\SQLEXPRESS
DATABASE=MineDax
UID=usuario_produccion
PWD=contraseña_produccion
PORT=3000
NODE_ENV=production
JWT_SECRET=clave-aleatoria-muy-larga-y-segura-minimo-32-caracteres
```

### Paso 2: En el servidor remoto
```bash
git clone <tu-repo>
npm install
NODE_ENV=production npm start
```

---

## 🔐 SEGURIDAD

⚠️ **IMPORTANTE:**

```bash
# NUNCA hagas esto:
git add .env
git commit -m "Add credentials"

# SIEMPRE haz esto:
echo ".env" >> .gitignore
git add .gitignore .env.example
git commit -m "Add env configuration template"
```

---

## 📞 SOPORTE

Si tienes problemas:

1. Ejecuta `node validate-env.js`
2. Ejecuta `node diagnostico-conexion-bd.js`
3. Verifica los logs en consola
4. Contacta al administrador si el servidor SQL Server no está disponible

---

## 📚 REFERENCIAS

- [SQL Server Connection Strings](https://www.connectionstrings.com/sql-server/)
- [Node.js mssql Package](https://github.com/tediousjs/node-mssql)
- [Express.js Guide](https://expressjs.com/)

---

**Última actualización:** 2026-04-15
**Versión:** 1.0.0
