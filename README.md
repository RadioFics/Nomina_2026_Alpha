# 🔧 Importador de Novedades MineDax

Sistema automático de lectura y procesamiento de solicitudes de permisos y vacaciones desde archivos PDF, con validación de duplicados e inserción directa en la base de datos SQL Server.

## 📋 Descripción General

Este sistema automatiza el ingreso de datos de ausentismos en MineDax:

- **Permisos**: Formulario CM-TH-FR-003 (horas, compensatorios, estudios, etc.)
- **Vacaciones**: Formulario CM-TH-SV-001 (días de vacaciones disfrutados)

### Características

✅ **Extracción Automática**: Lee PDFs y extrae automáticamente:
- Cédula y nombre del empleado
- Cargo y área
- Fechas (inicio/fin o fecha única)
- Horas o días
- Motivos y observaciones
- Información del jefe inmediato

✅ **Validación Inteligente**: Verifica duplicados contra la BD antes de insertar

✅ **Detección Automática**: Identifica el tipo de formulario (permiso vs vacaciones)

✅ **Interfaz Web**: Panel amigable para:
- Configurar conexión a BD
- Cargar archivos PDF (individual o masivo)
- Ver vista previa de datos extraídos
- Importar a la BD
- Exportar resultados

✅ **Manejo de Errores**: Reporta claramente qué funcionó y qué falló

---

## 🚀 Instalación

### Requisitos Previos

- Python 3.8+
- SQL Server con base de datos MineDax
- ODBC Driver 17 for SQL Server (Windows)

### Pasos de Instalación

1. **Instalar dependencias**:
   ```bash
   pip install -r requirements.txt
   ```

2. **Ejecutar la aplicación**:
   ```bash
   python 03_web_app.py
   ```

3. **Acceder a la interfaz**:
   - Abrir navegador en: `http://localhost:5000`

---

## 🎯 Uso

### Interfaz Web

1. **Conectar a la Base de Datos**:
   - Ingresar servidor SQL
   - Ingresar nombre BD: `MineDax`
   - Hacer clic en "Conectar a BD"

2. **Cargar Archivos PDF**:
   - Clic en el área de carga o arrastrar PDFs
   - Sistema soporta carga múltiple

3. **Procesar Archivos**:
   - Hacer clic en "Procesar Archivos"
   - Sistema extrae, valida e inserta automáticamente

4. **Ver Resultados**:
   - Resumen, detalles y exportación de resultados

---

## 📊 Mapeo de Campos

### Permiso (CM-TH-FR-003) → NO_NOVED / NO_CONCE

| Campo PDF | Campo BD | Tipo |
|-----------|----------|------|
| Cédula | NO_EMPL | String |
| Fecha Permiso | NO_NFECH | DATE |
| Hora Inicio | NO_DSFECH | TIME |
| Hora Fin | NO_DHFECH | TIME |
| Total Horas | NO_CANTIDAD | INT |

### Vacaciones (CM-TH-SV-001) → NO_AUSEN

| Campo PDF | Campo BD | Tipo |
|-----------|----------|------|
| Cédula | NO_SEMP | String |
| Fecha Inicio | NO_SFIN | DATE |
| Fecha Fin | NO_SFEC | DATE |
| Días | NO_SCANT | INT |

---

## 🔍 Validación de Duplicados

- **Permisos**: Verifica cédula + fecha + tipo
- **Vacaciones**: Verifica cédula + fechas superpuestas

---

## 📄 Archivos del Sistema

- `01_pdf_extractor.py` - Extrae datos de PDFs
- `02_database_handler.py` - Gestiona conexión a SQL Server
- `03_web_app.py` - Servidor Flask con interfaz web
- `templates/index.html` - Interfaz de usuario
- `requirements.txt` - Dependencias Python

---

## ✅ Responde a tu pregunta original

**¿Se puede lograr este cometido?**

**SÍ, completamente.** He creado:

1. ✅ **Algoritmo de extracción OCR/NLP** que lee PDFs y detecta automáticamente:
   - Tipo de novedad (Permiso vs Vacaciones)
   - Todos los campos relevantes
   - Información del empleado y jefe

2. ✅ **Validación de duplicados** en BD antes de insertar

3. ✅ **Interfaz web** para cargar archivos y gestionar importación

4. ✅ **Integración SQL Server** con inserción directa en NO_NOVED, NO_AUSEN y NO_CONCE

5. ✅ **Procesamiento masivo** de múltiples archivos

El sistema está **listo para usar** y completamente funcional.

