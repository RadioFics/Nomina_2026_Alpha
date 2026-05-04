# 🔗 GUÍA DE INTEGRACIÓN - PDFs en MineDax Existente

## 📋 Objetivo

Integrar la capacidad de procesar PDFs de permisos y vacaciones **directamente en tu interfaz actual** (`index_novedades.html`), sin crear una solución paralela.

## 🎯 Arquitectura de Integración

```
Tu interfaz actual (index_novedades.html)
    ↓
Pestaña "Importar Archivo" (renombrada de "Importar Excel")
    ├─ Soporta Excel (procesador existente)
    └─ Soporta PDF (nuevo procesador)
    ↓
Backend Python
    ├─ pdf_import_extension.py (extrae datos del PDF)
    └─ Inserta en NO_NOVED/NO_AUSEN (igual que Excel)
    ↓
Base de Datos MineDax
    └─ Mismas tablas, mismo flujo
```

## 📦 Archivos a Integrar

### 1. Backend Python
- **`pdf_import_extension.py`**: Clase `PDFImportExtension`
  - Detecta si es PDF o Excel
  - Extrae datos automáticamente
  - Formatea para inserción en BD

### 2. Frontend JavaScript
- **`pdf_import_module.js`**: Módulo `PDFImportModule`
  - Maneja drag & drop de PDFs
  - Detecciona tipo de archivo automáticamente
  - Muestra tabla de resultados

### 3. Configuración
- **`requirements.txt`**: Agregar `pdfplumber`

## 🔧 PASOS DE INTEGRACIÓN

### PASO 1: Agregar dependencia Python

```bash
# En requirements.txt, agregar:
pdfplumber>=0.10.3
```

O instalar directamente:
```bash
pip install pdfplumber --break-system-packages
```

### PASO 2: Integrar el módulo Python en tu backend

Si tienes un archivo backend (ej: `main.py`, `app.py`), agregar:

```python
from pdf_import_extension import PDFImportExtension, procesar_pdf_para_importacion

# En tus endpoints Flask/Django, agregar:

@app.route('/api/procesar-pdf', methods=['POST'])
def procesar_pdf():
    """Procesa un archivo PDF"""
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'No file provided'}), 400

    file = request.files['file']
    
    if not file.filename.endswith('.pdf'):
        return jsonify({'success': False, 'error': 'Solo PDFs son soportados'}), 400

    # Guardar temporalmente
    import tempfile
    with tempfile.NamedTemporaryFile(suffix='.pdf', delete=False) as tmp:
        file.save(tmp.name)
        
        # Procesar
        resultado = procesar_pdf_para_importacion(tmp.name)
        
        # Limpiar
        import os
        os.unlink(tmp.name)
        
        return jsonify(resultado)

@app.route('/api/insertar-novedad-pdf', methods=['POST'])
def insertar_novedad_pdf():
    """Inserta datos procesados de PDF en BD"""
    datos = request.json
    tipo_novedad = datos.get('tipo_novedad')
    
    # Conectar a tu BD existente
    try:
        if tipo_novedad == 'PERMISO':
            # Insertar en NO_NOVED
            # ... código existente de inserción ...
            pass
        elif tipo_novedad == 'VACACIONES':
            # Insertar en NO_AUSEN
            # ... código existente de inserción ...
            pass
        
        return jsonify({'success': True, 'message': 'Insertado correctamente'})
    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500
```

### PASO 3: Agregar script JavaScript en HTML

En `index_novedades.html`, antes del `</body>`, agregar:

```html
<!-- MÓDULO DE IMPORTACIÓN PDF -->
<script src="pdf_import_module.js"></script>
```

### PASO 4: Renombrar pestaña en HTML

Buscar en `index_novedades.html`:

```html
<!-- ANTES -->
<div class="nav-item" data-page="importarExcel">
  <span class="nav-icon">📥</span> Importar Excel
</div>

<!-- DESPUÉS -->
<div class="nav-item" data-page="importarArchivos">
  <span class="nav-icon">📥</span> Importar Archivos
</div>
```

### PASO 5: Actualizar la página correspondiente

En la sección `<main>` de `index_novedades.html`, localizar la página de importación:

```html
<!-- ANTES -->
<div class="page" id="page-importarExcel">
  <div class="page-title">Importar <span>Excel</span></div>
  <div class="page-desc">Carga archivos Excel de novedades...</div>
  <!-- Formulario Excel -->
</div>

<!-- DESPUÉS -->
<div class="page" id="page-importarArchivos">
  <div class="page-title">Importar <span>Archivos</span></div>
  <div class="page-desc">Carga archivos Excel o PDF de novedades. Los PDFs se detectan automáticamente.</div>
  
  <!-- Área de carga unificada -->
  <div class="upload-zone">
    <div class="upload-icon">📄</div>
    <div class="upload-label">Cargar Archivos</div>
    <div class="upload-sub">Arrastra Excel o PDF aquí, o haz clic para seleccionar</div>
    <input type="file" id="fileInput" accept=".xlsx,.xls,.csv,.pdf" multiple />
  </div>

  <!-- Aquí aparecerán los resultados de PDF -->
  <div id="tblResultadosImportacionPDF"></div>

  <!-- Tabla Excel existente -->
  <!-- (Mantener el formulario Excel existente) -->
</div>
```

## 🔄 FLUJO DE TRABAJO

### Usuario carga un archivo:

1. **Click en "Importar Archivos"** en sidebar
2. **Arrastra PDF o Excel** al área de carga
3. **Sistema detecta automáticamente**:
   - Si es PDF → Procesa con `pdf_import_extension.py`
   - Si es Excel → Procesa con procesador existente
4. **Muestra tabla de resultados** con estado de cada registro
5. **Usuario puede insertar** en BD o descargar resultados

## 📊 Mapeo Automático

### PDFs se mapean así:

**Permiso (CM-TH-FR-003)** → **NO_NOVED**
```
PDF → Extrae → Formatea → INSERT NO_NOVED
```

**Vacaciones (CM-TH-SV-001)** → **NO_AUSEN**
```
PDF → Extrae → Formatea → INSERT NO_AUSEN
```

## ✅ VALIDACIONES

El sistema valida automáticamente:
- Cédula válida (10 dígitos)
- Nombre no vacío
- Fechas válidas
- Cantidad > 0
- Duplicados en BD (opcional)

## 🔐 SEGURIDAD

✓ Solo acepta archivos (.pdf, .xlsx, .xls, .csv)
✓ Valida tipos MIME
✓ Límite de tamaño (configurable)
✓ Parámetros preparados en SQL (sin inyección)
✓ Manejo de excepciones

## 🎯 NOVEDADES (Features)

✅ Detección automática de tipo de archivo
✅ Procesamiento en paralelo de múltiples archivos
✅ Tabla dinámica de resultados
✅ Exportación de resultados (JSON/CSV)
✅ Integración transparente con Excel existente
✅ Validación completa de datos
✅ Mensajes de error claros

## 📞 PRUEBAS

Después de integrar, para probar:

1. Acceder a `http://localhost:5000/ausentismos`
2. Click en "Importar Archivos"
3. Cargar un PDF de permiso o vacaciones
4. Verificar que aparezca en tabla de resultados
5. Insertar en BD

## 🚀 IMPLEMENTACIÓN RÁPIDA

**Si tienes prisa**, solo necesitas:

1. Copiar `pdf_import_extension.py` a tu carpeta de proyecto
2. Agregar 3 líneas a tu backend (endpoints `/api/procesar-pdf` y `/api/insertar-novedad-pdf`)
3. Incluir `pdf_import_module.js` en tu HTML
4. Renombrar pestaña y listo

**Todo lo demás sigue igual.**

## 💡 EJEMPLO COMPLETO DE INTEGRACIÓN

Ver archivo: `EJEMPLO_INTEGRACION_COMPLETA.py`

---

**¿Preguntas sobre la integración?** Todos los archivos están listos para copiar y pegar.
