# 🌐 GUÍA DE SERVIDOR CENTRAL

## ¿Qué es esto?

Tu máquina (`DESKTOP-VEABB8R`) ahora es el **Servidor Central** de nómina.

Las máquinas en **TODAS las sucursales** (aunque estén en redes diferentes) pueden conectarse a este servidor y ver/editar los datos de la BD MineDax **en tiempo real**.

---

## 🚀 CÓMO INICIAR

### Paso 1: Obtener tu IP de Red

```bash
node get-my-ip.js
```

Verás algo como:

```
✅ IP Principal (para compartir): 192.168.1.11

📋 Comparte esta URL con las sucursales:
   http://192.168.1.11:3000
```

**Nota:** Esta IP es la que compartes con las sucursales.

---

### Paso 2: Iniciar el Servidor

```bash
npm start
```

Verás:

```
╔════════════════════════════════════════════════════════════╗
║         ✓ SERVIDOR CENTRAL DE NÓMINA FUNCIONANDO          ║
╚════════════════════════════════════════════════════════════╝

  📍 UBICACIONES DE ACCESO:
     Local (esta máquina):  http://localhost:3000
     Desde la red:          http://192.168.1.11:3000

  🔗 COMPARTIR CON SUCURSALES:
     URL de acceso: http://192.168.1.11:3000
     BD centralizada: DESKTOP-VEABB8R\SQLEXPRESS
```

---

### Paso 3: Compartir con Sucursales

Comunica esto a cada sucursal:

```
URL DE ACCESO:  http://192.168.1.11:3000

INSTRUCCIONES:
1. Abre tu navegador
2. Ve a: http://192.168.1.11:3000
3. Inicia sesión
4. Los cambios se sincronizarán en tiempo real
```

---

## 🔥 Si No Conectan desde Otra Máquina

Probablemente es el **Firewall de Windows** bloqueando.

### Solución Automática (Como Administrador)

Abre PowerShell como Administrador y ejecuta:

```powershell
New-NetFirewallRule -DisplayName "Servidor Nomina" -Direction Inbound -LocalPort 3000 -Protocol TCP -Action Allow
```

### Solución Manual

1. Abre **Firewall de Windows Defender**
2. Click en **"Permitir una aplicación"**
3. Click en **"Cambiar configuración"**
4. Click en **"Permitir otra aplicación"**
5. Busca **Node.js** y marca **"Privada"** y **"Pública"**
6. Click en **"Aceptar"**

---

## ✅ VERIFICACIÓN

### En esta máquina (Oficina Central)

```
http://localhost:3000         ← Debe abrir login
http://192.168.1.11:3000      ← También debe funcionar
```

### Desde otra máquina (Sucursal)

```
http://192.168.1.11:3000      ← Debe abrir login
```

Si ambas funcionan: **¡Todo está correcto!** ✅

---

## 🌍 Para Sucursales en Redes Diferentes

Si las sucursales están en **edificios diferentes** o con **ISPs diferentes**, necesitas una solución adicional.

### Opción 1: Port Forwarding (Gratis)

**Requisito:** Acceso al router de la oficina central.

1. Entra a la configuración del router (usualmente `192.168.1.1`)
2. Busca "Port Forwarding" o "Reenvío de puertos"
3. Redirige el puerto externo (ej: `3000`) hacia `192.168.1.11:3000`
4. Obtén la IP pública de tu router (`ifconfig` o llamar a ISP)
5. Comparte: `http://IP_PUBLICA:3000` con las sucursales

### Opción 2: VPN Site-to-Site (Más Seguro)

Crear una red privada virtual entre todas las sucursales.

1. Descargar OpenVPN (gratuito)
2. Configurar VPN entre sucursales
3. Una vez conectadas, todas verán `192.168.1.11:3000` como si estuvieran en la misma red

**Contactar a departamento IT para ayuda con VPN.**

---

## 📊 ARQUITECTURA FINAL

```
OFICINA CENTRAL (Servidor)
├─ Máquina: DESKTOP-VEABB8R
├─ IP: 192.168.1.11
├─ Puerto: 3000
└─ BD: MineDax (SQL Server)

        ↓ RED CORPORATIVA

SUCURSAL A                  SUCURSAL B                 SUCURSAL C
http://192.168.1.11:3000   http://192.168.1.11:3000   http://192.168.1.11:3000
        ↓                           ↓                           ↓
    Cambios realizados aquí se syncronizan en tiempo real
        ↓                           ↓                           ↓
                  ← minutos reales →
```

---

## 🔧 CAMBIOS REALIZADOS

| Archivo | Cambio |
|---------|--------|
| `js/api.js` | `API_BASE` ahora es dinámico: `${window.location.origin}/api` |
| `server.js` | Escucha en `0.0.0.0` (todas las interfaces) y muestra IP real |
| `get-my-ip.js` | NUEVO: Script para obtener IP y configurar firewall |

**Beneficio:** Los clientes se conectan automáticamente al servidor correcto, sin configuración adicional en cada máquina.

---

## 💡 CÓMO FUNCIONA

1. **Sucursal A abre navegador** → `http://192.168.1.11:3000`
2. **Servidor central sirve** `login.html` y `js/api.js`
3. **js/api.js detecta automáticamente** que vino de `192.168.1.11:3000`
4. **Todos los fetch() apuntan a** `http://192.168.1.11:3000/api`
5. **Node.js conecta a** `DESKTOP-VEABB8R\SQLEXPRESS`
6. **Cambios se guardan en BD centralizada** ✅

**Resultado:** Sincronización en tiempo real, sin configuración extra.

---

## 📞 SOLUCIÓN DE PROBLEMAS

### "No puedo conectar desde otra máquina"

✅ **Pasos:**
1. Verificar Firewall: `node get-my-ip.js` (te da el comando exacto)
2. Verificar conexión de red: `ping 192.168.1.11` (desde la otra máquina)
3. Si el ping funciona pero el navegador no: revisar Firewall

### "La aplicación carga pero no puedo hacer login"

✅ **Pasos:**
1. Verificar que el servidor Node.js está corriendo: `npm start`
2. Verificar que BD está accesible: `node diagnostico-conexion-bd.js`
3. Verificar credenciales en `.env`

### "Los cambios no se sincronizan entre máquinas"

✅ **Pasos:**
1. Verificar que ambas máquinas usan la misma URL: `http://192.168.1.11:3000`
2. Verificar que ambas conectan a la misma BD: MineDax
3. Refrescar la página (F5) en la otra máquina

---

## 📚 REFERENCIAS

- Guía anterior: [CONFIG_ESCALABILIDAD.md](CONFIG_ESCALABILIDAD.md)
- Setup inicial: [SETUP.md](SETUP.md)
- Script de IP: `get-my-ip.js`

---

**Versión:** 1.0.0  
**Fecha:** 2026-04-15  
**Estado:** ✅ Servidor central funcional
