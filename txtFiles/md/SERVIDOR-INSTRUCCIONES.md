# 📋 Guía de Inicio del Servidor Nómina 2026

## ✅ Inicio Normal

```bash
npm start
```

El servidor estará disponible en:
- **Local**: `http://localhost:3000`
- **Red**: `http://192.168.1.25:3000`

---

## ❌ Error: Puerto 3000 en Uso

Si recibes el error `EADDRINUSE: address already in use 0.0.0.0:3000`, significa que hay procesos Node.js antiguos aún ejecutándose.

### Solución Automática (Recomendado)

#### Opción 1: PowerShell (Windows)
```powershell
.\kill-server.ps1
```

#### Opción 2: Node.js (Multiplataforma)
```bash
node kill-server.js
```

### Solución Manual

#### Windows (PowerShell):
```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
npm start
```

#### Linux/Mac:
```bash
pkill -f "node"
npm start
```

---

## 🔧 Usar Puerto Diferente

Si necesitas usar otro puerto:

```bash
PORT=3001 npm start
```

---

## 📊 Verificar Estado del Servidor

Accede a: `http://localhost:3000/api/health`

Debería responder:
```json
{"status":"OK","message":"Servidor de nómina funcionando"}
```

---

## 🗄️ Configuración de Base de Datos

La configuración está en `.env`:

```env
SERVER=DESKTOP-VEABB8R\SQLEXPRESS    # Servidor SQL Server
DATABASE=MineDax                      # Base de datos
UID=sa                                # Usuario SQL
PWD=LetItHappen35*                    # Contraseña
```

Para cambiar a otro servidor:

1. Obtén la IP: `nslookup [nombre-servidor]` (PowerShell)
2. Actualiza `SERVER=IP_O_HOSTNAME\SQLEXPRESS`
3. Reinicia: `npm start`

---

## 🌐 Acceso desde Otras Máquinas

Otras máquinas en la red pueden acceder a través de:

```
http://192.168.1.25:3000
```

**Nota**: Asegúrate que el firewall permite conexiones en puerto 3000 y 1433 (SQL Server).

---

## 🐛 Debugging

### Ver logs más detallados:
```bash
DEBUG=* npm start
```

### Comprobar conexión a SQL Server:
```powershell
sqlcmd -S DESKTOP-VEABB8R\SQLEXPRESS -U sa -P "LetItHappen35*" -Q "SELECT 1"
```

---

## 📝 Notas Importantes

- ✅ El servidor se reinicia automáticamente cuando cambias archivos (si usas nodemon)
- ✅ La BD se inicializa automáticamente en el primer arranque
- ⚠️ Los cambios en `.env` requieren reiniciar el servidor
- ⚠️ Asegúrate que SQL Server está corriendo antes de iniciar el servidor
