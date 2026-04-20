# 💻 Cómo Usar Claude Desktop para Configurar BD

Guía paso a paso para usar Claude Desktop con el prompt de configuración de usuarios.

---

## 📍 PASO 1: Abre Claude Desktop

1. **Windows**: Busca "Claude" en el menú Inicio
2. O descarga desde: https://claude.ai/downloads

Debería verse así:

```
┌─────────────────────────────────────────┐
│         Claude Desktop                  │
│  (Aplicación de escritorio, no web)     │
└─────────────────────────────────────────┘
```

---

## 📋 PASO 2: Copia el Prompt Completo

1. Abre este archivo: `PROMPT_CLAUDE_DESKTOP_BD.md`
2. Copia TODO el texto dentro de:
   ```
   ## 📋 PROMPT PARA CLAUDE DESKTOP
   ```
   (Desde "Necesito entender..." hasta "IMPORTANTE:")

3. **No copies el markdown** (los ```, #, etc)
   Solo el **texto del prompt**

---

## 💬 PASO 3: Pega en Claude Desktop

1. En Claude Desktop, haz clic en el campo de chat
2. **Pega TODO el prompt completo** (Ctrl+V)
3. Presiona **Enter** o **Enviar**

---

## ⏳ PASO 4: Espera los Resultados

Claude Desktop ejecutará:
- Queries directas a tu BD
- Analizará la estructura
- Proporcionará soluciones

Verás algo como:

```
🔍 ANALIZANDO ESTRUCTURA DE BD...

┌─────────────────────────────┐
│ Conectando a MineDax...     │
│ ✓ Conectado                 │
└─────────────────────────────┘

📊 ESTRUCTURA DE GN_USUAR:
┌──────────┬──────────┬──────────┐
│ Columna  │ Tipo     │ Requerido│
├──────────┼──────────┼──────────┤
│ ID_USUAR │ GUID     │ Sí       │
│ CEDULA   │ VARCHAR  │ Sí       │
│ ...      │ ...      │ ...      │
└──────────┴──────────┴──────────┘

❌ PROBLEMAS ENCONTRADOS:
1. Usuario 2 (Nomina) tiene CEDULA NULL
2. Usuario 3 (laura.calle) no tiene email
3. ...

✅ SOLUCIÓN:
Ejecutar este SQL...
```

---

## 📥 PASO 5: Ejecuta la Solución SQL

Claude Desktop te dará un **script SQL listo para ejecutar**.

1. **Cópialo** (Ctrl+C)
2. Abre **SQL Server Management Studio**
3. **Pega el SQL** (Ctrl+V)
4. Presiona **F5** para ejecutar

---

## 🔐 PASO 6: Obtén Datos de Acceso

Al final de la respuesta, Claude Desktop te dirá:

```
✅ USUARIO DE PRUEBA CREADO

Datos de acceso:
┌──────────────────┬──────────────────┐
│ Cédula/Email     │ 9999999999       │
│ Contraseña       │ Prueba@123       │
│ Nivel            │ 3 (Admin)        │
│ Rol              │ ADMIN            │
└──────────────────┴──────────────────┘

Próximos pasos:
1. Reinicia el servidor: npm run dev
2. Accede a: http://localhost:3000
3. Usa estos datos para login
```

---

## 🚀 PASO 7: Prueba el Login

1. Abre terminal: `npm run dev`
2. Abre: `http://localhost:3000`
3. Ingresa:
   - **Cédula/Email**: (la que te dió Claude Desktop)
   - **Contraseña**: (la que te dió Claude Desktop)

---

## 💡 Tips Importantes

### Si algo no funciona:

1. **Verifica que el SQL se ejecutó correctamente**
   ```sql
   -- Después de ejecutar el SQL, verifica:
   SELECT * FROM GN_USUAR WHERE CEDULA = '9999999999';
   ```

2. **Si ves errores SQL**
   - Cópialo todo y pégalo de nuevo en Claude Desktop
   - Añade: "Ese SQL dio error. El error es: [copia el error]"

3. **Si el login aún falla**
   - Ejecuta en navegador (F12):
     ```javascript
     localStorage.clear()  // Limpia cache
     // Recarga la página
     ```
   - Intenta de nuevo

### Si necesitas otro usuario:

Pega esto en Claude Desktop:

```
Necesito crear otro usuario en GN_USUAR con:
- Cédula: 8888888888
- Nombre: Otro Usuario
- Email: otro@mining.com
- Contraseña: Otro@123
- Nivel: 2 (Supervisor)
- Rol: SUPERVISOR

Proporciona el SQL listo para ejecutar.
```

---

## 🎯 Resumen Rápido

| Paso | Acción | Archivo |
|------|--------|---------|
| 1 | Abre Claude Desktop | App de escritorio |
| 2 | Copia prompt | `PROMPT_CLAUDE_DESKTOP_BD.md` |
| 3 | Pega en chat | Claude Desktop |
| 4 | Espera resultados | ⏳ 2-3 minutos |
| 5 | Ejecuta SQL | SQL Server Management Studio |
| 6 | Prueba login | http://localhost:3000 |

---

## 🆘 Problemas Comunes

### "Claude Desktop dice que no tiene acceso a BD"

**Solución:**
1. Verifica que el MCP de SQL Server está configurado
2. En Claude Desktop, ve a **Settings** → **MCP Servers**
3. Debería estar activo SQL Server

### "El SQL que generó falla"

**Solución:**
1. Copia el EXACT error (todo el mensaje)
2. Pégalo en Claude Desktop
3. Pide: "Este SQL falla con este error. ¿Cuál es la solución?"

### "El login sigue sin funcionar"

**Solución:**
1. Ejecuta en SQL: `SELECT * FROM GN_USUAR WHERE CEDULA = '9999999999';`
2. ¿Apareció el usuario?
   - **SÍ** → El problema es en el login.js (frontend)
   - **NO** → El SQL no se ejecutó correctamente

---

## 📞 Ventajas de Usar Claude Desktop

✅ **Acceso directo a BD** - Sin copiar-pegar queries  
✅ **Ve relaciones automáticamente** - Entiende las FK  
✅ **Propone soluciones inteligentes** - Basadas en estructura real  
✅ **Genera SQL optimizado** - Listo para usar  
✅ **Explica cada paso** - Entiendes qué hace y por qué  

---

## 🎉 Cuando Funcione

Deberías ver:

```
✅ Login exitoso
✅ Token guardado en localStorage
✅ Redirige a /index_novedades.html
✅ Sistema de autenticación funcionando
```

---

**¡Usa Claude Desktop ahora y resuelve la configuración de usuarios!** 🚀
