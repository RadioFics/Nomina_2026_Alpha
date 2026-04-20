# Checklist de Verificación - Exportación ADECCO

## ✅ Antes de Comenzar

Asegúrate que has completado estos pasos:

- [ ] **Instalaste Python 3.8+**
  - Descargado desde: https://www.python.org/downloads/
  - Marcaste "Add Python to PATH" durante la instalación ✓
  - Reiniciaste Windows ✓
  - Verificaste con: `python --version` ✓

- [ ] **Descargaste el código actualizado**
  - `routes/nomina.js` actualizado ✓
  - `nominaController.js` renombrado a `nominaController.OLD.js` ✓

---

## 🔍 Verificación de Instalación de Python

Abre terminal (cmd.exe o PowerShell) y ejecuta:

```bash
python --version
```

### ✅ Resultado Esperado:
```
Python 3.11.0  (o versión 3.8+)
```

### ❌ Resultado Incorrecto:
```
'python' is not recognized as an internal or external command
```
→ Python NO está en el PATH. Repite la instalación marcando "Add Python to PATH".

---

## 🧪 Test #1: Instancia del Servidor

### Paso 1: Abre terminal en la carpeta del proyecto
```bash
cd C:\Users\JuanEstebanCalle\OneDrive - Collective Mining C-Suite\Documentos\GitHub\Nomina_2026_Alpha
```

### Paso 2: Inicia el servidor
```bash
npm start
```

### ✅ Resultado Esperado:
```
Server running on port 3000
[ocasionales] ✓ vw_NO_OCASI_PERIODO lista
```

### ❌ Problemas Comunes:

Si ves error "Cannot find module 'nominaController'":
- [ ] Verifica que `nominaController.js` fue renombrado a `nominaController.OLD.js`
- [ ] Valida que `routes/nomina.js` importa controladores correctos

Si ves error de puerto en uso:
```bash
# Mata el proceso en el puerto 3000 (Windows)
netstat -ano | findstr :3000
taskkill /PID <PID> /F
```

---

## 🌐 Test #2: Abrir Interfaz

### Paso 1: Abre navegador
```
http://localhost:3000/index_novedades.html
```

### ✅ Resultado Esperado:
- Se carga la página "Novedades"
- Ves dropdown "PERÍODO" con opciones
- Botón "Descargar Excel" visible

### ❌ Si no carga:
- [ ] Verifica que el servidor está corriendo (terminal)
- [ ] Intenta en navegador diferente
- [ ] Limpia caché del navegador (Ctrl+Shift+Delete)

---

## 📥 Test #3: Exportar ADECCO

### Paso 1: Selecciona un período
- Dropdown "PERÍODO"
- Selecciona: "2026 - Abril - Q2"
- Click "Descargar Excel"

### ✅ Resultado Esperado - SIN Python:
```
✅ Se descarga archivo
✅ Nombre: Novedades_CM_2026_04_Q2.xlsx
✅ Sin errores en terminal
```

### ⚠️ Resultado Esperado - CON Python (futuro):
```
✅ Se descarga archivo
✅ Archivo contiene datos de novedades
✅ Formato ADECCO preservado
```

### ❌ Resultado Incorrecto:
```
Error generando el archivo
Error generando exportación ADECCO
```

**Verifica terminal para ver el error específico.**

---

## 🐛 Troubleshooting por Error

### Error: "Invalid object name 'Ocasionales'"

**Causa:** Todavía está usando `nominaController` obsoleto

**Solución:**
```bash
# 1. Verifica que nominaController.js fue renombrado
ls controllers/nominaController.js  # Debería dar error (archivo no existe)
ls controllers/nominaController.OLD.js  # Debería existir

# 2. Verifica que routes/nomina.js importa controladores correctos
grep "require.*Ctrl" routes/nomina.js  # Debería ver ocasionalesCtrl, fijasCtrl, etc.

# 3. Reinicia el servidor
# Ctrl+C en la terminal
# npm start
```

---

### Error: "Script Python falló (code 9009): no se encontró Python"

**Causa:** Python no está en el PATH

**Solución:**
```bash
# 1. Verifica instalación de Python
python --version

# 2. Si funciona python pero no python3, edita:
# controllers/exportarAdeccoController.js línea 144
# De: spawn('python3', ...)
# A:  spawn('python', ...)

# 3. Reinicia servidor
```

---

### Error: "ModuleNotFoundError: No module named 'openpyxl'"

**Causa:** Python está instalado pero sin las librerías necesarias

**Solución:**
```bash
python -m pip install openpyxl
python -m pip install --upgrade openpyxl

# Verifica:
python -c "import openpyxl; print(openpyxl.__version__)"
```

---

### Error: "Port 3000 already in use"

**Causa:** Otro proceso está usando el puerto

**Solución:**
```bash
# Windows
netstat -ano | findstr :3000
taskkill /PID <PID_NUMBER> /F

# O usa otro puerto
PORT=3001 npm start
```

---

## 📋 Resumen de Verificación Rápida

Ejecuta estos comandos en orden:

```bash
# 1. Verifica Python
python --version

# 2. Verifica controladores correos
ls controllers/ocasionalesController.js
ls controllers/fijasController.js

# 3. Verifica que nominaController.OLD.js existe
ls controllers/nominaController.OLD.js

# 4. Verifica que nominaController.js NO existe
ls controllers/nominaController.js  # Debería dar error

# 5. Verifica rutas
grep "ocasionalesCtrl" routes/nomina.js

# 6. Reinicia el servidor
npm start

# 7. Abre navegador
# http://localhost:3000/index_novedades.html

# 8. Intenta exportar
# Selecciona período y click "Descargar Excel"
```

---

## ✅ Checklist Final - Cuando Todo Funcione

- [ ] **Python instalado**
  - `python --version` muestra 3.8+
  - Puede ejecutar scripts Python

- [ ] **Código actualizado**
  - `nominaController.OLD.js` existe
  - `nominaController.js` no existe
  - `routes/nomina.js` importa controladores correctos

- [ ] **Servidor funciona**
  - `npm start` sin errores
  - Terminal muestra "Server running on port 3000"

- [ ] **Interfaz carga**
  - http://localhost:3000/index_novedades.html carga
  - Dropdown de períodos visible
  - Botón de descarga visible

- [ ] **Exportación funciona**
  - Seleccionar período y exportar
  - Archivo se descarga
  - Sin errores en terminal

---

## 📞 Si Algo Sigue Fallando

1. **Captura el error completo** de la terminal
2. **Copia la salida de:**
   ```bash
   python --version
   python -c "import openpyxl; print(openpyxl.__version__)"
   ```
3. **Incluye:**
   - Versión de Windows
   - Ubicación exacta de Python (donde lo instalaste)
   - Paso en el que falla

---

## 📚 Documentos de Referencia

Para más detalles, consulta:

- **ANALISIS_ERRORES_ADECCO.md** - Explicación completa de los problemas
- **INSTRUCCIONES_PYTHON.md** - Guía paso a paso de Python
- **CAMBIOS_REALIZADOS.md** - Detalle de cambios en código
- **RESUMEN_CORRECION_EXPORTACION.txt** - Resumen visual

---

**Última actualización:** 20 de Abril de 2026  
**Verificado:** Código actualizado, documentación completa ✓
