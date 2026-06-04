"""
Aplicación Web Flask - Importador de Novedades MineDax
Interfaz para cargar PDFs de permisos/vacaciones
"""

from flask import Flask, render_template, request, jsonify
from flask_cors import CORS
import os
from werkzeug.utils import secure_filename
import json
from datetime import datetime
import sys

# Importar módulos personalizados
sys.path.insert(0, os.path.dirname(__file__))
from pdf_extractor import PDFExtractor
from database_handler import MineDaxHandler

app = Flask(__name__)
CORS(app)

# Configuración
UPLOAD_FOLDER = '/tmp/minedax_uploads'
ALLOWED_EXTENSIONS = {'pdf'}
os.makedirs(UPLOAD_FOLDER, exist_ok=True)
app.config['UPLOAD_FOLDER'] = UPLOAD_FOLDER
app.config['MAX_CONTENT_LENGTH'] = 50 * 1024 * 1024  # 50MB max

# Variables globales para conexión BD
db_handler = None
extractor = PDFExtractor()

def allowed_file(filename):
    return '.' in filename and filename.rsplit('.', 1)[1].lower() in ALLOWED_EXTENSIONS

def connect_database(server, database, username=None, password=None):
    """Establece conexión a la BD"""
    global db_handler
    try:
        db_handler = MineDaxHandler(server, database, username, password)
        return True, "Conexión exitosa"
    except Exception as e:
        return False, str(e)

@app.route('/')
def index():
    """Página principal"""
    return render_template('index.html')

@app.route('/api/config', methods=['POST'])
def configure_connection():
    """Configura la conexión a la BD"""
    data = request.json
    success, msg = connect_database(
        server=data.get('server'),
        database=data.get('database'),
        username=data.get('username'),
        password=data.get('password')
    )
    return jsonify({'success': success, 'message': msg})

@app.route('/api/upload', methods=['POST'])
def upload_file():
    """Procesa la carga de PDF"""
    if 'file' not in request.files:
        return jsonify({'success': False, 'error': 'No file provided'}), 400

    file = request.files['file']
    if file.filename == '':
        return jsonify({'success': False, 'error': 'Empty filename'}), 400

    if not allowed_file(file.filename):
        return jsonify({'success': False, 'error': 'Only PDF files allowed'}), 400

    try:
        # Guardar archivo
        filename = secure_filename(file.filename)
        filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
        file.save(filepath)

        # Extraer datos
        extracted = extractor.extract_from_pdf(filepath)
        extracted['filepath'] = filepath
        extracted['uploaded_at'] = datetime.now().isoformat()

        return jsonify({
            'success': True,
            'data': extracted,
            'message': f"PDF procesado: {extracted['tipo_novedad']}"
        })

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/validate', methods=['POST'])
def validate_data():
    """Valida datos y verifica duplicados"""
    data = request.json
    tipo_novedad = data.get('tipo_novedad')

    if not db_handler:
        return jsonify({'success': False, 'error': 'Database not connected'}), 400

    try:
        if tipo_novedad == 'PERMISO':
            dup, dup_data = db_handler.check_duplicate_permission(
                data.get('cedula'),
                data.get('fecha_permiso'),
                'PERMISO'
            )

            if dup:
                return jsonify({
                    'success': True,
                    'isDuplicate': True,
                    'message': f"⚠ Registro duplicado encontrado: {dup_data['codigo']}"
                })

            return jsonify({'success': True, 'isDuplicate': False})

        elif tipo_novedad == 'VACACIONES':
            dup, dup_data = db_handler.check_duplicate_vacation(
                data.get('cedula'),
                data.get('fecha_inicio'),
                data.get('fecha_fin')
            )

            if dup:
                return jsonify({
                    'success': True,
                    'isDuplicate': True,
                    'message': f"⚠ Vacaciones superpuestas encontradas: {dup_data['codigo']}"
                })

            return jsonify({'success': True, 'isDuplicate': False})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/import', methods=['POST'])
def import_data():
    """Importa los datos a la BD"""
    data = request.json

    if not db_handler:
        return jsonify({'success': False, 'error': 'Database not connected'}), 400

    try:
        tipo_novedad = data.get('tipo_novedad')

        if tipo_novedad == 'PERMISO':
            success, msg = db_handler.insert_permission(data)
        elif tipo_novedad == 'VACACIONES':
            success, msg = db_handler.insert_vacation(data)
        else:
            return jsonify({'success': False, 'error': 'Unknown type'}), 400

        status = 'success' if success else 'error'
        return jsonify({'success': success, 'message': msg})

    except Exception as e:
        return jsonify({'success': False, 'error': str(e)}), 500

@app.route('/api/batch-import', methods=['POST'])
def batch_import():
    """Importa múltiples archivos"""
    if 'files' not in request.files:
        return jsonify({'success': False, 'error': 'No files provided'}), 400

    files = request.files.getlist('files')
    results = []

    for file in files:
        if not allowed_file(file.filename):
            results.append({
                'filename': file.filename,
                'success': False,
                'error': 'Invalid file type'
            })
            continue

        try:
            filename = secure_filename(file.filename)
            filepath = os.path.join(app.config['UPLOAD_FOLDER'], filename)
            file.save(filepath)

            # Extraer
            extracted = extractor.extract_from_pdf(filepath)

            # Validar duplicados
            if extracted['tipo_novedad'] == 'PERMISO':
                dup, _ = db_handler.check_duplicate_permission(
                    extracted['cedula'],
                    extracted['fecha_permiso'],
                    'PERMISO'
                )
            else:
                dup, _ = db_handler.check_duplicate_vacation(
                    extracted['cedula'],
                    extracted['fecha_inicio'],
                    extracted['fecha_fin']
                )

            if dup:
                results.append({
                    'filename': file.filename,
                    'success': False,
                    'error': 'Duplicate record',
                    'data': extracted
                })
                continue

            # Insertar
            if extracted['tipo_novedad'] == 'PERMISO':
                success, msg = db_handler.insert_permission(extracted)
            else:
                success, msg = db_handler.insert_vacation(extracted)

            results.append({
                'filename': file.filename,
                'success': success,
                'message': msg,
                'data': extracted
            })

        except Exception as e:
            results.append({
                'filename': file.filename,
                'success': False,
                'error': str(e)
            })

    return jsonify({
        'success': True,
        'total': len(results),
        'results': results
    })

@app.route('/api/health', methods=['GET'])
def health():
    """Health check"""
    return jsonify({
        'status': 'online',
        'db_connected': db_handler is not None,
        'timestamp': datetime.now().isoformat()
    })

if __name__ == '__main__':
    app.run(debug=True, host='0.0.0.0', port=5000)
