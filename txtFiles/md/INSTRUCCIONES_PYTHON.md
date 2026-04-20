# Instalación de Python para Exportación ADECCO

## Problema
El sistema intenta ejecutar un script Python (`scripts/generar_adecco.py`) para generar archivos Excel, pero Python no está instalado o no está en el PATH del sistema Windows.

**Error observado:**
```
[exportarAdecco] Error: Error: Script Python falló (code 9009): 
no se encontró Python
```

---

## Solución: Instalar Python 3

### Paso 1: Descargar Python

1. Ve a: https://www.python.org/downloads/
2. Descarga **Python 3.11+** (versión actual recomendada)
   - Elige el instalador para Windows (`.exe`)
   - Selecciona la versión de 64 bits (recomendado)

### Paso 2: Instalar Python

1. Ejecuta el instalador descargado
2. **IMPORTANTE:** En la primera pantalla, marca AMBAS opciones:
   ```
   ✅ Install Python 3.XX for all users
   ✅ Add Python to PATH  ← ¡MUY IMPORTANTE!
   ```
3. Haz click en "Install Now"
4. Espera a que termine la instalación
5. **Reinicia Windows** para que los cambios de PATH se apliquen

### Paso 3: Verificar la Instalación

Abre una **terminal nueva** (cmd.exe o PowerShell) y ejecuta:

```bash
python --version
```

**Resultado esperado:**
```
Python 3.11.x  (o versión más reciente)
```

Si ves un mensaje diferente:
```bash
'python' is not recognized as an internal or external command
```

Entonces Python NO está en el PATH. Repite el Paso 2 y **asegúrate de marcar "Add Python to PATH"**.

---

## Alternativa: Si Python Ya Está Instalado

Si Python ya está en tu computadora pero el comando `python` no funciona, prueba con `python3`:

```bash
python3 --version
```

**Si funciona `python3` pero no `python`:**

Necesitas cambiar el comando en el código. Edita el archivo:

**Archivo:** `controllers/exportarAdeccoController.js`

**Línea 144:** Cambia de:
```javascript
const py = spawn('python3', [PYTHON_SCRIPT, outputPath]);
```

A:
```javascript
const py = spawn('python', [PYTHON_SCRIPT, outputPath]);
```

---

## Verificación Final: Probar la Exportación

1. Inicia el servidor Node.js:
   ```bash
   npm start
   ```

2. Abre en el navegador:
   ```
   http://localhost:3000/index_novedades.html
   ```

3. Selecciona un período (ej: "2026 - Abril - Q2")

4. Haz click en "Descargar Excel" / "Descargar ADECCO"

5. **Resultado esperado:**
   - Se descarga un archivo `.xlsx`
   - SIN errores en la terminal

---

## Solución de Problemas

### Error: "Python still not found"

**Solución:**
1. Desinstala Python completamente (Panel de Control → Programas)
2. Reinicia Windows
3. Vuelve a instalar siguiendo Paso 1-2, **marcando "Add Python to PATH"**
4. Reinicia Windows nuevamente

### Error: "Script Python falló (code 1, 2, etc.)"

Esto significa que Python se ejecutó pero el **script falló**. Verifica:

1. ¿Existe el archivo `scripts/generar_adecco.py`?
   ```bash
   ls -la scripts/generar_adecco.py
   ```

2. ¿Tiene Python las librerías necesarias?
   ```bash
   python -m pip install openpyxl
   ```

### Error: "ModuleNotFoundError: No module named 'openpyxl'"

Instala las dependencias Python:

```bash
python -m pip install openpyxl
```

---

## Información Adicional

### ¿Por qué necesitamos Python?

El archivo `scripts/generar_adecco.py` realiza operaciones complejas en archivos Excel:
- Copia la plantilla base de ADECCO
- Inserta datos de novedades (ocasionales, fijas, ausencias, cambios)
- Preserva formato Excel original
- Genera el archivo para descargar

Esta tarea es difícil de hacer 100% correctamente desde JavaScript/Node.js, por eso se usa Python con la librería `openpyxl`.

### Versiones de Python Soportadas

- ✅ Python 3.8+
- ✅ Python 3.9+
- ✅ Python 3.10+
- ✅ Python 3.11+ (recomendado)

La versión 2.x de Python **NO** es soportada (está deprecated desde 2020).

---

## Comandos Rápidos

```bash
# Verificar que Python está instalado
python --version

# Verificar que openpyxl está instalado
python -c "import openpyxl; print(openpyxl.__version__)"

# Instalar/actualizar openpyxl
python -m pip install --upgrade openpyxl

# Ejecutar el script manualmente para debugging
python scripts/generar_adecco.py --help
```

---

## Contacto / Ayuda

Si después de seguir estos pasos el problema persiste:

1. Abre terminal y ejecuta:
   ```bash
   python --version
   python -m pip list | findstr openpyxl
   ```

2. Copia la salida y comparte en el grupo

3. También copia el error completo de la terminal cuando intentes exportar

Esto ayudará a diagnosticar el problema específico.
