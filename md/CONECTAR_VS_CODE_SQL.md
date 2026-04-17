# 🔌 Conectar VS Code a SQL Server

Sigue estos pasos para tener acceso directo a tu BD desde VS Code.

---

## PASO 1: Instalar Extension SQL Server (mssql)

1. Abre **VS Code**
2. Ve a **Extensions** (Ctrl+Shift+X)
3. Busca: **"mssql"** o **"SQL Server"**
4. Instala la extension oficial de Microsoft: **"SQL Server (mssql)"**

![Buscar mssql en extensions](https://i.imgur.com/example.png)

---

## PASO 2: Crear Conexión

1. Abre la **Command Palette** (Ctrl+Shift+P)
2. Escribe: **"MS SQL: Create Connection"**
3. Presiona Enter

Se abrirá un formulario:

```
Server name or connection string:  CM-ITD-P-05\SQLEXPRESS
Database name (optional):          MineDax
Authentication type:               SQL Login
Username:                          JuanesCalle
Password:                          LetItHappen35*
Remember password?                 Yes
```

Rellena con tus datos (del .env):

| Campo | Valor |
|-------|-------|
| **Server** | `CM-ITD-P-05\SQLEXPRESS` |
| **Database** | `MineDax` |
| **Username** | `JuanesCalle` |
| **Password** | `LetItHappen35*` |
| **Remember** | Sí |

---

## PASO 3: Verificar Conexión

Una vez conectado, deberías ver en la izquierda:

```
SQL Server
├─ CM-ITD-P-05\SQLEXPRESS
   ├─ MineDax
      ├─ Tables
      │  ├─ dbo.GN_USUAR
      │  ├─ dbo.GN_SESION
      │  ├─ dbo.GN_ROL_USUAR
      │  ├─ dbo.GN_PERMISOS
      │  ├─ dbo.GN_LOG_ACCESO
      │  └─ (otros)
      └─ Stored Procedures
```

---

## PASO 4: Ejecutar Script SQL desde VS Code

1. Abre **DIAGNOSTICO_USUARIOS.sql**
2. Haz clic derecho → **"Execute Query"** (o Ctrl+Shift+E)
3. Los resultados apareceran en una pestaña

---

## PASO 5: Ver Datos de una Tabla

1. En el panel izquierdo, expande **Tables**
2. Haz clic derecho en **dbo.GN_USUAR**
3. Selecciona **"Select Top 1000 Rows"**
4. Verás todos los usuarios en una tabla

---

## PASO 6: Editar Datos Directamente

**Para editar un usuario:**

1. Ve a **GN_USUAR** (en el panel izquierdo)
2. Haz clic derecho → **"Select Top 1000 Rows"**
3. En los resultados, puedes editar directamente las celdas
4. Los cambios se guardan automáticamente

**Para eliminar un usuario:**

```sql
-- Ejecutar en VS Code
DELETE FROM GN_USUAR WHERE CEDULA = '1111111111';
```

---

## 🎯 Próximos Pasos

Ahora que estás conectado a la BD:

1. **Ejecuta DIAGNOSTICO_USUARIOS.sql** para ver el estado
2. **Verifica si hay usuarios** en GN_USUAR
3. **Si no hay, crea uno** con el script SQL que te voy a proporcionar
4. **Prueba el login** nuevamente

---

## Troubleshooting

### Error: "Login failed"
- Verifica que el usuario/contraseña son correctos (en .env)
- Verifica que SQL Server está activo
- Verifica que el servidor es accesible: `CM-ITD-P-05\SQLEXPRESS`

### Error: "Connection timeout"
- SQL Server podría estar caído
- Intenta conectar desde SQL Server Management Studio primero
- Verifica firewall

### No veo las tablas
- Verifica que seleccionaste la BD "MineDax"
- Recarga VS Code (Ctrl+R)
- Revisa que el script auth_schema.sql fue ejecutado

---

## Comandos Útiles en VS Code

| Acción | Shortcut |
|--------|----------|
| Ejecutar Query | `Ctrl+Shift+E` |
| Command Palette | `Ctrl+Shift+P` |
| Nueva Query | `Ctrl+N` luego `.sql` |
| Ir a Tabla | `Ctrl+Shift+P` → "MS SQL: Connect" |

---

¡Ya tienes acceso directo a tu BD desde VS Code! 🎉
