# 🐛 Debuggear Fallo de Login - Plan Completo

Sigue estos pasos para identificar y resolver por qué falla el login.

---

## 📋 PASO 1: Diagnosticar Estado de BD (10 min)

### 1.1 Ejecutar Script de Diagnóstico

1. Abre **SQL Server Management Studio**
2. Conecta a: `CM-ITD-P-05\SQLEXPRESS`
3. BD: `MineDax`
4. Abre: `DIAGNOSTICO_USUARIOS.sql`
5. **Ejecuta** (F5)

### 1.2 Revisar Resultados

Busca estas secciones y COPIA los resultados:

**¿Existen las tablas?**
```
1️⃣ VERIFICAR TABLAS DE AUTENTICACIÓN
```
Deberías ver:
- ✓ GN_USUAR
- ✓ GN_SESION
- ✓ GN_ROL_USUAR
- ✓ GN_PERMISOS
- ✓ GN_LOG_ACCESO

Si NO aparecen → **Necesitas ejecutar `database/auth_schema.sql` primero**

**¿Hay usuarios registrados?**
```
2️⃣ CANTIDAD DE USUARIOS REGISTRADOS
```

Si dice `0` → **NO HAY USUARIOS. Necesitas crear uno.**

Si dice `> 0` → Continúa leyendo los detalles abajo.

**¿Cuáles son los usuarios?**
```
3️⃣ USUARIOS REGISTRADOS
```

Copia esta tabla completa. Necesitaremos saber:
- CEDULA
- NOMBRE_USUAR
- EMAIL
- NIVEL_USUAR
- ESTA_ACTIVO
- ESTA_BLOQUEADO

---

## 🔌 PASO 2: Conectar VS Code a BD (5 min)

Sigue las instrucciones en: `CONECTAR_VS_CODE_SQL.md`

Una vez conectado, deberías ver en el panel izquierdo:
```
SQL Server
├─ CM-ITD-P-05\SQLEXPRESS
   └─ MineDax
      └─ Tables
         └─ dbo.GN_USUAR ← Click aquí
```

Haz click derecho en `GN_USUAR` y selecciona **"Select Top 1000 Rows"**

Verás una tabla con todos los usuarios.

---

## 👤 PASO 3: Crear Usuario

### Opción A: Desde SQL (Recomendado)

1. Abre: `CREAR_USUARIO_SQL.sql`
2. **EDITA los valores al inicio:**
   ```sql
   DECLARE @cedula VARCHAR(20) = '1111111111';         -- ← EDITA
   DECLARE @nombre VARCHAR(100) = 'Administrador';    -- ← EDITA
   DECLARE @email VARCHAR(100) = 'admin@mining.com';  -- ← EDITA
   DECLARE @passHash VARCHAR(255) = '...';            -- ← EDITA (ver abajo)
   DECLARE @nivel INT = 3;                            -- ← EDITA
   ```

3. **GENERAR HASH BCRYPT:**

   En VS Code, abre Terminal (Ctrl+`) y ejecuta:
   ```bash
   node -e "const bcrypt = require('bcryptjs'); bcrypt.hash('Admin@123456', 10).then(h => console.log(h))"
   ```

   Te mostrará algo como:
   ```
   $2a$10$yG1FxHxL3nQZq8.Ao/V9g.yQmU2p9Z0UwJ0Z0UwJ0ZuJ0ZuJ0ZuJ0
   ```

   **Copia ese resultado** y reemplaza en `@passHash`

4. **Ejecuta el script SQL** (F5)

5. **Verifica el resultado** - Deberías ver al final:
   ```
   ✅ USUARIO LISTO
   🔐 Datos de acceso:
      Cédula/Email: 1111111111
      Contraseña: Admin@123456
   ```

### Opción B: Desde Node.js

```bash
node create-admin.js
```

---

## 🧪 PASO 4: Probar Login

### 4.1 Iniciar Servidor

```bash
npm run dev
```

Deberías ver:
```
✓ Servidor ejecutándose en http://localhost:3000
✓ Conectado a SQL Server: MineDax
```

### 4.2 Ir a la Página de Login

Abre: `http://localhost:3000`

Deberías ver la página de login hermosa.

### 4.3 Intentar Login

Ingresa:
- **Cédula/Email:** (la que usaste para crear el usuario)
- **Contraseña:** (la que usaste para el hash)

Ejemplo:
- Cédula: `1111111111`
- Contraseña: `Admin@123456`

### 4.4 Verificar Resultado

**✅ Si funciona:**
- Te redirige a `/index_novedades.html`
- Ves el contenido de la aplicación
- En localStorage aparece el token

**❌ Si falla:**
- Ves un mensaje de error rojo
- Debes verificar qué dice el error

---

## 🔍 PASO 5: Debuggear Errores Comunes

### Problema: "Usuario no encontrado"

**Causa:** La cédula no existe en GN_USUAR

**Solución:**
1. Ejecuta `DIAGNOSTICO_USUARIOS.sql`
2. Revisa la sección "3️⃣ USUARIOS REGISTRADOS"
3. ¿Aparece tu cédula?
   - SÍ → El problema es otro
   - NO → Necesitas crear el usuario con `CREAR_USUARIO_SQL.sql`

### Problema: "Cédula/Email o contraseña incorrectos"

**Causas posibles:**

1. **Contraseña incorrecta**
   - Verifica que introduciste la contraseña correcta
   - Recuerda que es sensible a mayúsculas

2. **Hash incorrecto en BD**
   - Ejecuta `DIAGNOSTICO_USUARIOS.sql`
   - Revisa la sección "5️⃣ VERIFICAR QUE CONTRASEÑAS ESTÁN HASHEADAS"
   - ¿Aparece `$2` al inicio?
     - SÍ → Hash es correcto (bcrypt)
     - NO → El hash no se generó bien. Regenera con el comando Node.js

3. **Cédula con espacios**
   - Algunos campos pueden tener espacios extras
   - En `CREAR_USUARIO_SQL.sql` agrega `TRIM`:
   ```sql
   WHERE CEDULA = TRIM(@cedula)
   ```

### Problema: "Usuario bloqueado"

**Causa:** Intentaste login 5 veces con contraseña incorrecta

**Solución:**
```sql
UPDATE GN_USUAR
SET ESTA_BLOQUEADO = 0, INTENTOS_FALL = 0
WHERE CEDULA = '1111111111';
```

### Problema: "Usuario inactivo"

**Causa:** ESTA_ACTIVO = 0

**Solución:**
```sql
UPDATE GN_USUAR
SET ESTA_ACTIVO = 1
WHERE CEDULA = '1111111111';
```

### Problema: Página en blanco después de login

**Causa:** `/index_novedades.html` no existe

**Solución:**
- Verifica que `index_novedades.html` existe en la carpeta raíz
- Si no, renombra tu otra página a este nombre

---

## 📊 PASO 6: Verificar Logs

Mientras intentas login, abre la **consola del navegador** (F12):

**Pestaña "Console":**
```javascript
// Ver token
localStorage.getItem('authToken')

// Ver usuario
JSON.parse(localStorage.getItem('usuario'))

// Ver si está autenticado
localStorage.getItem('authToken') ? 'SÍ' : 'NO'
```

**Pestaña "Network":**
- Haz login
- Busca la petición POST a `/api/auth/login`
- Haz clic
- En "Response" deberías ver:
  ```json
  {
    "status": "success",
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "usuario": { "id": "...", "cedula": "1111111111" }
  }
  ```

Si ves `"status": "error"` → Copia el mensaje completo aquí.

---

## 🛠️ PASO 7: Verificar Servidor

En la terminal donde ejecutas `npm run dev`, busca logs como:

**Login exitoso:**
```
[LOGIN] ✓ 1111111111 autenticado exitosamente
```

**Login fallido:**
```
[LOGIN] Usuario 1111111111 no encontrado
[LOGIN] Contraseña incorrecta para 1111111111
```

**Error de conexión:**
```
✗ Error conectando a SQL Server: ...
```

---

## 📝 RESUMEN: Checklist

- [ ] 1. Ejecuté `DIAGNOSTICO_USUARIOS.sql` y revisé los resultados
- [ ] 2. Verifiqué que existen todas las tablas (GN_USUAR, etc)
- [ ] 3. Conecté VS Code a SQL Server (extension mssql)
- [ ] 4. Verifiqué si hay usuarios en GN_USUAR
- [ ] 5. Generé un hash bcrypt correctamente
- [ ] 6. Ejecuté `CREAR_USUARIO_SQL.sql` con mis datos
- [ ] 7. Verifiqué que el usuario fue creado (en GN_USUAR)
- [ ] 8. Inicié el servidor (`npm run dev`)
- [ ] 9. Probé login en http://localhost:3000
- [ ] 10. Verifiqué token en localStorage (F12)

---

## 🆘 Si Aún No Funciona

Cuando intentes nuevamente y falle:

1. **Copia TODO lo que ves en:**
   - Terminal de `npm run dev`
   - Consola del navegador (F12)
   - Mensaje de error en el login

2. **Ejecuta este SQL y cópiame los resultados:**
   ```sql
   SELECT * FROM GN_USUAR;
   SELECT * FROM GN_LOG_ACCESO ORDER BY FECH_EVENTO DESC;
   ```

3. **Comparte toda esa información** y te ayudaré a resolver

---

¡Ahora tienes todo para resolver el login! 🚀
