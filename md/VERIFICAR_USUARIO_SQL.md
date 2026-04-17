# 🔐 VERIFICAR/CREAR USUARIO SQL SERVER

## El Problema

```
❌ Login failed for user 'JuanesCalle'
```

El usuario `JuanesCalle` no existe en SQL Server, o la contraseña no es correcta.

---

## Solución: Usar SQL Server Management Studio (SSMS)

### Paso 1: Abrir SSMS

1. Abre **SQL Server Management Studio**
2. Conéctate al servidor: `DESKTOP-VEABB8R\SQLEXPRESS`
3. Usa **Autenticación de Windows** (tu usuario de Windows)
4. Click en **Conectar**

---

### Paso 2: Verificar Usuarios Existentes

En SSMS:

1. Expande **Security** → **Logins**
2. Busca qué usuarios existen
3. Anota un usuario que puedas usar (ej: `sa`, tu usuario Windows, etc.)

---

### Paso 3: Opción A - Usar Usuario Existente

Si encuentras un usuario existente que funciona:

1. En SSMS, haz click derecho en ese usuario
2. Click en **Properties**
3. Verifica la contraseña (o cámbiala)
4. Actualiza `.env`:

```env
UID=el_usuario_que_encontraste
PWD=su_contraseña
```

5. Prueba: `node diagnostico-conexion-bd.js`

---

### Paso 3: Opción B - Crear Usuario Nuevo

Si necesitas crear un usuario nuevo:

1. En SSMS, haz click derecho en **Security** → **Logins**
2. Click en **New Login...**
3. Configura:
   - **Login name:** `juanescalle`
   - **Autenticación:** SQL Server authentication
   - **Password:** `LetItHappen35*`
   - **Confirm password:** `LetItHappen35*`
   - Desmarcar **User must change password at next login**
   - Click en **OK**

4. Ahora ve a **Databases** → **MineDax** → **Security** → **Users**
5. Haz click derecho → **New User**
6. Configura:
   - **User name:** `juanescalle`
   - **Login name:** (busca y selecciona `juanescalle`)
   - Click en **OK**

7. Asigna permisos:
   - Haz click derecho en `juanescalle`
   - **Properties**
   - Memberships → Marca `db_datareader` y `db_datawriter`
   - Click en **OK**

---

### Paso 4: Probar la Conexión

Una vez configurado el usuario:

```bash
node diagnostico-conexion-bd.js
```

Debe mostrar:

```
✅ DIAGNÓSTICO EXITOSO
✓ Conectado a SQL Server: DESKTOP-VEABB8R\MineDax
```

---

## 📝 Si Todo Falla

**Opción C: Usar Usuario `sa` (Administrador)**

Si tienes acceso al usuario `sa` del SQL Server:

1. En SSMS, conéctate con usuario `sa`
2. Verifica la contraseña
3. Actualiza `.env`:

```env
UID=sa
PWD=la_contraseña_de_sa
```

4. Prueba: `node diagnostico-conexion-bd.js`

---

## 🆘 Si Necesitas Ayuda

Proporciona:

1. ¿Qué usuarios ves en SSMS bajo **Security** → **Logins**?
2. ¿Cuál es la contraseña del usuario `sa`?
3. ¿Tienes acceso administrativo a Windows?

Con esa información puedo ayudarte a crear el usuario correcto.

---

**Una vez consigas que `node diagnostico-conexion-bd.js` muestre ✅ EXITOSO:**

```bash
npm start
```

El servidor funcionará con el servidor central. ✅
