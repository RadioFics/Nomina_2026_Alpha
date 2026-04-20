# 🤖 Prompt para Claude Desktop - Configuración de Usuarios en GN_USUAR

Copia este prompt completo y pégalo en **Claude Desktop** (que tiene acceso a MCP de SQL Server).

---

## 📋 PROMPT PARA CLAUDE DESKTOP

```
Necesito entender la estructura completa de usuarios en la BD MineDax para 
configurar correctamente el sistema de autenticación.

CONTEXTO:
- Base de datos: MineDax
- Servidor: CM-ITD-P-05\SQLEXPRESS
- Tabla principal: GN_USUAR
- Otras tablas relacionadas: GN_FUNCI, GN_SESION, GN_ROL_USUAR, GN_PERMISOS, GN_LOG_ACCESO

TAREAS A REALIZAR (en este orden):

1️⃣ EXPLORAR ESTRUCTURA DE TABLAS:
   a) Obtén la estructura completa de GN_USUAR (todas las columnas, tipos, constraints, default values)
   b) Obtén las claves foráneas (FK) de GN_USUAR (¿A qué tablas apunta? ¿Cuáles son obligatorias?)
   c) Obtén la estructura de GN_FUNCI (especialmente las columnas que se deben sincronizar con GN_USUAR)
   d) Obtén la estructura de GN_ROL_USUAR (cómo se relaciona con GN_USUAR)
   e) Obtén la estructura de GN_PERMISOS (cómo funciona el RBAC)

2️⃣ ANALIZAR USUARIOS ACTUALES:
   a) Lista TODOS los usuarios en GN_USUAR con TODAS sus columnas (no ocultes ninguna)
   b) Identifica qué campos están NULL, cuáles están llenos
   c) Muestra qué roles (GN_ROL_USUAR) tiene cada usuario
   d) Muestra qué permisos (GN_PERMISOS) tiene cada rol
   e) Identifica cuál es un usuario válido para hacer login (tiene cédula, hash, etc)

3️⃣ ENTENDER LAS RELACIONES:
   a) ¿GN_USUAR.CEDULA es FK de GN_FUNCI.NUM_IDEN? ¿Es obligatoria?
   b) ¿Qué campos deben sincronizarse automáticamente de GN_FUNCI a GN_USUAR?
   c) ¿Cuáles son los campos OBLIGATORIOS para crear un usuario?
   d) ¿Cuáles son los campos OPCIONALES?
   e) ¿Hay triggers o stored procedures que actualizan estas tablas?

4️⃣ ANALIZAR PROBLEMA ACTUAL:
   a) De los 4 usuarios actuales, ¿cuál tiene estructura válida?
   b) ¿Cuáles tienen campos NULL que son obligatorios?
   c) ¿Cuál es el motivo probable de que falla el login?
   d) ¿Qué hace falta para que el usuario pueda hacer login?

5️⃣ PROPONER SOLUCIÓN:
   a) Propón la estructura correcta de un usuario para que funcione el login
   b) Propón los cambios necesarios en GN_USUAR para los 4 usuarios actuales
   c) Propón un script SQL para crear un usuario NUEVO que funcione correctamente
   d) Incluye todos los inserts necesarios (GN_USUAR, GN_ROL_USUAR, etc)

6️⃣ CREAR USUARIO DE PRUEBA:
   a) Crea un usuario de prueba con:
      - Cédula: 9999999999
      - Nombre: Usuario Prueba
      - Email: prueba@mining.com
      - Contraseña hasheada (usa hash bcrypt de "Prueba@123")
      - Nivel: 3 (Admin)
      - Con rol ADMIN asignado
   b) Muestra el SQL exacto que usaste
   c) Verifica que el usuario fue creado correctamente
   d) Muestra el usuario completo con todos sus datos

7️⃣ INSTRUCCIONES FINALES:
   a) Dame los datos exactos de acceso para hacer login (cédula, contraseña)
   b) Enumera exactamente qué debe cambiar en GN_USUAR para que el login funcione
   c) Proporciona un archivo SQL que puedo ejecutar directamente para arreglarlo todo

FORMATO DE RESPUESTA:
- Usa tablas para mostrar datos
- Señala con ✅ lo que está bien y ❌ lo que está mal
- Proporciona SQL listo para ejecutar
- Al final, dame un resumen ejecutivo de qué hacer

IMPORTANTE:
- No ocultes nada por "brevedad"
- Muestra TODAS las columnas
- Muestra valores NULL claramente
- Explain el POR QUÉ de cada problema
```

---

## 📝 Cómo Usar Este Prompt

1. **Copia TODO el texto del prompt** (desde "Necesito entender..." hasta el final)

2. **Abre Claude Desktop** (la aplicación de escritorio)

3. **Pega el prompt completo** en el chat

4. Claude Desktop ejecutará queries directamente contra tu BD a través del MCP SQL Server

5. **Espera los resultados** - tendrás acceso directo a:
   - Estructura de tablas
   - Datos actuales
   - Relaciones y constraints
   - Solución paso a paso

---

## ✅ Qué Obtendrás

Claude Desktop te mostrará:

✅ **Estructura exacta de GN_USUAR** con todas las columnas y tipos  
✅ **Relaciones con otras tablas** (GN_FUNCI, GN_ROL_USUAR, etc)  
✅ **Qué está mal con los 4 usuarios actuales**  
✅ **Por qué falla el login**  
✅ **Script SQL listo para ejecutar** que arregle todo  
✅ **Usuario de prueba creado** que funciona  
✅ **Datos de acceso exactos** para hacer login  

---

## 🚀 Después de Obtener Resultados

1. **Ejecuta el SQL que te proporcione** en SQL Server Management Studio
2. **Intenta hacer login** con los datos que te dé
3. Debería funcionar ✅

---

## 💡 Ventajas de Usar Claude Desktop para Esto

- ✅ Acceso directo a la BD (sin necesidad de copiar-pegar queries)
- ✅ Ve automáticamente las relaciones entre tablas
- ✅ Puede ver values actuales de las columnas
- ✅ Detecta problemas de integridad referencial
- ✅ Propone soluciones basadas en la estructura real
- ✅ Genera SQL listo para usar

---

## 📌 Nota Importante

Este prompt es **mucho más poderoso en Claude Desktop** porque tiene acceso directo a tu BD.

En Claude Web (aquí), yo no tengo acceso a la BD, pero Claude Desktop SÍ a través del MCP SQL Server que mencionaste que tienes configurado.

---

**¡Copia el prompt y úsalo en Claude Desktop ahora!** 🚀
