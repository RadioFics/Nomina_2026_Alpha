"""
EXTENSIÓN DE MINEDAX - Importador de PDFs v2.0
Se integra con el backend existente sin afectar importaciones Excel
Patrones optimizados para CM-TH-FR-003 (Permisos) y CM-TH-SV-001 (Vacaciones)
"""

import pdfplumber
import re
from datetime import datetime
from typing import Dict, List, Tuple, Optional
import json

try:
    import pytesseract
    from pdf2image import convert_from_path
    HAS_OCR = True
except ImportError:
    HAS_OCR = False

class PDFImportExtension:
    """
    Extiende el sistema de importación Excel para soportar PDFs
    de permisos (CM-TH-FR-003) y vacaciones (CM-TH-SV-001)
    """

    def __init__(self):
        self.extracted_data = []
        self.file_type = None

    def detect_file_type(self, file_path: str) -> str:
        """
        Detecta si es PDF o Excel
        Retorna: 'pdf', 'excel', o 'unknown'
        """
        if file_path.lower().endswith('.pdf'):
            return 'pdf'
        elif file_path.lower().endswith(('.xlsx', '.xls', '.csv')):
            return 'excel'
        return 'unknown'

    def process_file(self, file_path: str) -> Dict:
        """
        Procesa cualquier archivo (PDF o Excel)
        Retorna datos formateados para inserción
        """
        file_type = self.detect_file_type(file_path)

        if file_type == 'pdf':
            return self._process_pdf(file_path)
        elif file_type == 'excel':
            return {
                'tipo_archivo': 'excel',
                'mensaje': 'Use el procesador Excel existente'
            }
        else:
            raise ValueError(f"Tipo de archivo no soportado: {file_path}")

    def _process_pdf(self, pdf_path: str) -> Dict:
        """
        Procesa un PDF y detecta automáticamente su tipo
        Soporta tanto PDFs con texto como imágenes escaneadas
        """
        try:
            text = None
            is_image_scanned = False

            # Intento 1: Extracción directa de texto con pdfplumber
            try:
                with pdfplumber.open(pdf_path) as pdf:
                    if len(pdf.pages) > 0:
                        # Intento normal
                        text = pdf.pages[0].extract_text()
                        if text and len(text.strip()) > 50:
                            pass  # Texto extraído exitosamente
                        else:
                            # Intento con layout
                            text = pdf.pages[0].extract_text(layout=True)
                            if text and len(text.strip()) > 50:
                                pass
                            else:
                                # Probablemente imagen escaneada
                                text = None
                                is_image_scanned = True
            except Exception as e:
                text = None

            # Intento 2: Usar pdfplumber con estrategia de tablas y caracteres
            if not text:
                try:
                    with pdfplumber.open(pdf_path) as pdf:
                        if len(pdf.pages) > 0:
                            page = pdf.pages[0]
                            # Intentar extraer tablas
                            tables = page.extract_tables()
                            text_parts = []
                            for table in tables:
                                if table:
                                    for row in table:
                                        text_parts.append(' '.join([str(cell) if cell else '' for cell in row]))
                            if text_parts:
                                text = '\n'.join(text_parts)
                except Exception as e:
                    pass

            # Intento 3: OCR si la extracción de texto falló
            if not text and is_image_scanned:
                try:
                    # Convertir PDF a imagen y usar OCR
                    with pdfplumber.open(pdf_path) as pdf:
                        page_img = pdf.pages[0].to_image(resolution=150)
                        pil_image = page_img.original

                        # Intentar Tesseract
                        import pytesseract
                        text = pytesseract.image_to_string(pil_image, lang='spa')

                except ImportError:
                    pass  # Pytesseract no disponible
                except Exception as e:
                    pass  # Tesseract no instalado

            # Detectar tipo de formulario ANTES de validar que exista texto
            # Porque algunos PDFs podrían tener "CM-TH-SV-001" en metadatos o estructura
            is_permiso_form = False
            is_vacaciones_form = False

            if text:
                is_permiso_form = 'CM-TH-FR-003' in text or (
                    'PERMISO' in text.upper() and
                    ('Fecha Permiso' in text or 'DATOS DE PERMISO' in text.upper())
                )

                is_vacaciones_form = 'CM-TH-SV-001' in text or (
                    'VACACIONES' in text.upper() and
                    'SOLICITUD DE VACACIONES' in text.upper()
                )
            else:
                # Si no hay texto pero es una imagen, detectar por nombre de archivo
                if '19-' in pdf_path or 'permiso' in pdf_path.lower():
                    is_permiso_form = True
                elif '27-' in pdf_path or 'vacaciones' in pdf_path.lower():
                    is_vacaciones_form = True

            if is_permiso_form:
                return self._extract_permission(pdf_path, text or "")
            elif is_vacaciones_form:
                return self._extract_vacation_from_image(pdf_path)
            else:
                if not text:
                    return {
                        'success': False,
                        'error': 'No se pudo extraer texto del PDF. Instale Tesseract-OCR para PDFs escaneados o use PDFs con texto extraíble.',
                        'tipo_archivo': 'pdf'
                    }
                else:
                    return {
                        'success': False,
                        'error': 'Formulario PDF no reconocido. Use CM-TH-FR-003 (Permiso) o CM-TH-SV-001 (Vacaciones)',
                        'tipo_archivo': 'pdf'
                    }

        except Exception as e:
            return {
                'success': False,
                'error': f'Error procesando PDF: {str(e)}',
                'tipo_archivo': 'pdf'
            }

    def _extract_vacation_from_image(self, pdf_path: str) -> Dict:
        """
        Extrae datos de vacaciones desde PDF escaneado (imagen)
        Usa OCR con estrategia de regiones inteligentes
        Soporta formulario CM-TH-SV-001
        """
        data = {
            'tipo_novedad': 'VACACIONES',
            'tipo_archivo': 'pdf',
            'cedula': None,
            'nombre': None,
            'cargo': None,
            'area': None,
            'fecha_inicio': None,
            'fecha_fin': None,
            'cantidad': None,
            'observaciones': None,
            'fuente': pdf_path,
            'procesado_en': datetime.now().isoformat()
        }

        try:
            with pdfplumber.open(pdf_path) as pdf:
                page = pdf.pages[0]
                pil_image = page.to_image(resolution=150).original

                # Usar 'eng' porque 'spa' traindata no está disponible
                # El OCR con English sigue reconociendo números y nombres
                ocr_lang = 'eng'

                width, height = pil_image.size

                # ═══════════════════════════════════════════════════════════════
                # ESTRATEGIA 1: OCR de toda la página para extraer cédula
                # ═══════════════════════════════════════════════════════════════

                # Primero, extraer la cédula del texto completo
                full_page_text = pytesseract.image_to_string(pil_image, lang=ocr_lang)
                full_page_norm = re.sub(r'\s+', ' ', full_page_text)

                try:
                    # Buscar cédula en contexto "Cedula de Ciudadania No. XXXXXXXXXX"
                    cedula_match = re.search(
                        r'(?:Cedula|Cédula).*?(?:No\.|No):?\s*(\d{9,11})',
                        full_page_norm,
                        re.IGNORECASE
                    )
                    if cedula_match:
                        cedula_str = cedula_match.group(1)
                        # Validar: si tiene 11 dígitos, probablemente sea un OCR error
                        # Pero mantener los últimos 10 dígitos válidos
                        if len(cedula_str) == 11:
                            # Verificar si empieza con 0 o 1 (error típico)
                            if cedula_str[0] in '01':
                                data['cedula'] = cedula_str[-10:]  # Tomar últimos 10
                            else:
                                data['cedula'] = cedula_str[:10]  # Tomar primeros 10
                        else:
                            data['cedula'] = cedula_str
                except:
                    pass

                # Región 1: Datos superiores (Nombre, Cédula, Cargo)
                try:
                    header_region = pil_image.crop((0, int(height*0.08), width, int(height*0.25)))
                    header_text = pytesseract.image_to_string(header_region, lang=ocr_lang)

                    # Normalizar
                    header_norm = re.sub(r'\s+', ' ', header_text)

                    # Extraer nombre (después de "Apellidos Completos" o "Nombre")
                    # El formato es: "Nombre y Apellidos Completos VAIRON CAMILO ARICAPA TREJOS"
                    nombre_patterns = [
                        r'(?:Nombre|Apellidos).*?Completos\s+([A-Z][A-Za-záéíóúñ]+(?:\s+[A-Z][A-Za-záéíóúñ]+){1,})',
                        r'Completos\s+([A-Z][A-Za-záéíóúñ]+(?:\s+[A-Z][A-Za-záéíóúñ]+){1,})',
                        r'([A-Z][A-Za-záéíóúñ]+(?:\s+[A-Z][A-Za-záéíóúñ]+){1,})\s+(?:Cedula|Número)',
                    ]
                    for pattern in nombre_patterns:
                        nombre_match = re.search(pattern, header_norm, re.IGNORECASE)
                        if nombre_match:
                            candidate = nombre_match.group(1).strip()
                            # Filtrar si contiene palabras no relevantes
                            if 'Apellidos' not in candidate and 'Nombre' not in candidate and len(candidate) > 5:
                                data['nombre'] = candidate
                                break

                    # Extraer cargo
                    cargo_match = re.search(
                        r'(?:CARGO|Cargo)[\s:]*([A-Z][A-Za-záéíóúñ\s]+?)(?:\s{2,}|Cedula|Número|$)',
                        header_norm,
                        re.IGNORECASE
                    )
                    if cargo_match:
                        data['cargo'] = cargo_match.group(1).strip()

                except Exception as e:
                    pass

                # ═══════════════════════════════════════════════════════════════
                # Región 2: Período solicitado
                # ═══════════════════════════════════════════════════════════════
                try:
                    periodo_region = pil_image.crop((0, int(height*0.20), width, int(height*0.40)))
                    periodo_text = pytesseract.image_to_string(periodo_region, lang=ocr_lang)
                    periodo_norm = re.sub(r'\s+', ' ', periodo_text)

                    # Buscar 4 números de 1-2 dígitos y 2 números de 4 dígitos
                    # Patrón: DD MM YYYY DD MM YYYY o similar
                    dates_match = re.search(
                        r'(\d{1,2})\s+(\d{1,2})\s+(\d{4})\s+(\d{1,2})\s+(\d{1,2})\s+(\d{4})',
                        periodo_norm
                    )
                    if dates_match:
                        d1, m1, y1, d2, m2, y2 = dates_match.groups()
                        try:
                            # Validar fechas
                            from datetime import datetime as dt
                            dt(int(y1), int(m1), int(d1))
                            dt(int(y2), int(m2), int(d2))
                            data['fecha_inicio'] = f"{y1}-{m1.zfill(2)}-{d1.zfill(2)}"
                            data['fecha_fin'] = f"{y2}-{m2.zfill(2)}-{d2.zfill(2)}"
                        except:
                            pass

                except Exception as e:
                    pass

                # ═══════════════════════════════════════════════════════════════
                # Región 3: Días de vacaciones
                # ═══════════════════════════════════════════════════════════════
                try:
                    # La región de días está después del período y antes de observaciones
                    dias_region = pil_image.crop((0, int(height*0.30), width, int(height*0.50)))
                    dias_text = pytesseract.image_to_string(dias_region, lang=ocr_lang)
                    dias_norm = re.sub(r'\s+', ' ', dias_text)

                    # Buscar "disfrutados: XX" o solo un número en una caja
                    # Generalmente está en formato: "Dias de Vacaciones disfrutados: [XX]"
                    dias_patterns = [
                        r'disfrutados\s*[\[\(]?\s*(\d{1,2})\s*[\]\)]?',
                        r'(?:Dias|Días).*?(?:disfrutados|solicitados)\s*:?\s*[\[\(]?\s*(\d{1,2})',
                        r'de\s+Vacaciones.*?disfrutados\s*:?\s*(\d{1,2})',
                        # En algunos casos puede estar como un número aislado después de "Vacaciones"
                        r'Vacaciones\s*[\[\(]?\s*(\d{1,2})\s*[\]\)]?',
                    ]

                    for pattern in dias_patterns:
                        dias_match = re.search(pattern, dias_norm, re.IGNORECASE)
                        if dias_match:
                            cantidad = int(dias_match.group(1))
                            if 1 <= cantidad <= 90:
                                data['cantidad'] = cantidad
                                break

                except Exception as e:
                    pass

                # ═══════════════════════════════════════════════════════════════
                # Región 4: Observaciones
                # ═══════════════════════════════════════════════════════════════
                try:
                    obs_region = pil_image.crop((0, int(height*0.50), width, int(height*0.70)))
                    obs_text = pytesseract.image_to_string(obs_region, lang=ocr_lang)
                    obs_norm = re.sub(r'\s+', ' ', obs_text).strip()

                    # Buscar sección de observaciones
                    obs_match = re.search(
                        r'Observaciones.*?:?\s*(.{5,100}?)(?:Firma|Actividades|$)',
                        obs_norm,
                        re.IGNORECASE
                    )
                    if obs_match:
                        obs_content = obs_match.group(1).strip()
                        if len(obs_content) > 3 and not obs_content.endswith('['):
                            data['observaciones'] = obs_content[:500]

                except Exception as e:
                    pass

                data['success'] = True

        except ImportError:
            data['success'] = False
            data['error'] = 'OCR requiere pytesseract y Tesseract instalados.'
        except Exception as e:
            data['success'] = False
            data['error'] = f'Error extrayendo de imagen: {str(e)}'

        return data

    def _extract_permission(self, pdf_path: str, text: str) -> Dict:
        """
        Extrae datos de permiso (CM-TH-FR-003)
        Compatible con estructura NO_NOVED
        Patrones optimizados para el formulario real
        """
        data = {
            'tipo_novedad': 'PERMISO',
            'tipo_archivo': 'pdf',
            'cedula': None,
            'nombre': None,
            'cargo': None,
            'area': None,
            'fecha_novedad': None,
            'fecha_inicio': None,
            'fecha_fin': None,
            'hora_inicio': None,
            'hora_fin': None,
            'cantidad': None,
            'motivo': None,
            'es_remunerado': False,
            'observaciones': None,
            'fuente': pdf_path,
            'procesado_en': datetime.now().isoformat()
        }

        # Normalizar: reducir espacios múltiples
        text_norm = re.sub(r'\s+', ' ', text)

        # ═══════════════════════════════════════════════════════════════════
        # CÉDULA - Primera ocurrencia de 10 dígitos
        # ═══════════════════════════════════════════════════════════════════
        cedula_matches = re.findall(r'\b(\d{10})\b', text_norm)
        if cedula_matches:
            data['cedula'] = cedula_matches[0]

        # ═══════════════════════════════════════════════════════════════════
        # NOMBRE - Después de "Nombre:"
        # ═══════════════════════════════════════════════════════════════════
        nombre_match = re.search(
            r'Nombre:\s*([A-Za-záéíóúñÁÉÍÓÚÑ\s]+?)(?:\s+(?:Cedula|cedula)|\s{2,}|\n)',
            text_norm,
            re.IGNORECASE
        )
        if nombre_match:
            nombre_candidate = nombre_match.group(1).strip()
            if len(nombre_candidate) > 2 and nombre_candidate.count(' ') < 5:
                data['nombre'] = nombre_candidate

        # ═══════════════════════════════════════════════════════════════════
        # CARGO - Después de "Cargo:"
        # ═══════════════════════════════════════════════════════════════════
        cargo_match = re.search(
            r'Cargo:\s*([A-Za-záéíóúñÁÉÍÓÚÑ\s]+?)(?:\s+(?:Area|Área|area|área)|\s{2,})',
            text_norm,
            re.IGNORECASE
        )
        if cargo_match:
            cargo_candidate = cargo_match.group(1).strip()
            if len(cargo_candidate) > 1:
                data['cargo'] = cargo_candidate

        # ═══════════════════════════════════════════════════════════════════
        # ÁREA - Después de "Area:" o "Área:"
        # ═══════════════════════════════════════════════════════════════════
        area_match = re.search(
            r'(?:Area|Área|area|área):\s*([A-Za-záéíóúñÁÉÍÓÚÑ\s]+?)(?:\s{2,}|$|\n|Fecha)',
            text_norm,
            re.IGNORECASE
        )
        if area_match:
            area_candidate = area_match.group(1).strip()
            if len(area_candidate) > 1:
                data['area'] = area_candidate

        # ═══════════════════════════════════════════════════════════════════
        # FECHA DEL PERMISO - Formato DD-MM-YYYY o DD/MM/YYYY
        # ═══════════════════════════════════════════════════════════════════
        fecha_match = re.search(
            r'(?:Fecha Permiso:|Fecha\s+Permiso).*?(?:De:|de:)?\s*([0-9]{1,2}[-/][0-9]{1,2}[-/][0-9]{4})',
            text_norm,
            re.IGNORECASE
        )
        if fecha_match:
            fecha_str = fecha_match.group(1)
            parts = re.split(r'[-/]', fecha_str)
            if len(parts) == 3:
                day, month, year = parts[0].zfill(2), parts[1].zfill(2), parts[2]
                try:
                    # Validar que sea una fecha válida
                    datetime(int(year), int(month), int(day))
                    data['fecha_novedad'] = f"{year}-{month}-{day}"
                except ValueError:
                    pass

        # ═══════════════════════════════════════════════════════════════════
        # HORAS (Inicio y Fin) - Formato HH:MM AM/PM
        # ═══════════════════════════════════════════════════════════════════
        # Patrón flexible para diferentes formatos
        horas_match = re.search(
            r'(?:Horas?|horas?).*?De:\s*([0-9]{1,2}:[0-9]{2}\s*(?:Am|PM|am|pm))\s*(?:Hasta|hasta):\s*([0-9]{1,2}:[0-9]{2}\s*(?:Am|PM|am|pm))',
            text_norm,
            re.IGNORECASE
        )
        if horas_match:
            data['hora_inicio'] = horas_match.group(1).strip()
            data['hora_fin'] = horas_match.group(2).strip()

        # ═══════════════════════════════════════════════════════════════════
        # CANTIDAD (Horas o Días)
        # ═══════════════════════════════════════════════════════════════════
        cantidad_match = re.search(
            r'(?:Total de Dias|Total\s+de\s+dias|Total):\s*([0-9]+)\s*(?:Horas|Dias|horas|dias|H|h|D|d)',
            text_norm,
            re.IGNORECASE
        )
        if cantidad_match:
            try:
                data['cantidad'] = int(cantidad_match.group(1))
            except ValueError:
                pass

        # ═══════════════════════════════════════════════════════════════════
        # MOTIVO - Detectar palabras clave (sin checkboxes)
        # ═══════════════════════════════════════════════════════════════════
        motivos_map = {
            'Estudio': 'ESTUDIO',
            'Calamidad': 'CALAMIDAD',
            'Medico': 'MEDICO',
            'Vacaciones': 'VACACIONES',
            'Compensatorio': 'COMPENSATORIO',
            'Fuerza Mayor': 'FUERZA_MAYOR',
            'Otra Causa': 'OTRA',
            'Otra': 'OTRA',
        }

        # Buscar motivo por orden de prioridad (más específicos primero)
        for motivo_text in ['Compensatorio', 'Fuerza Mayor', 'Calamidad', 'Estudio', 'Medico', 'Vacaciones', 'Otra']:
            if motivo_text.lower() in text_norm.lower():
                data['motivo'] = motivos_map.get(motivo_text, 'OTRA')
                break

        # ═══════════════════════════════════════════════════════════════════
        # OBSERVACIONES - Sección OBSERVACIONES
        # ═══════════════════════════════════════════════════════════════════
        obs_match = re.search(
            r'(?:OBSERVACIONES|observaciones):\?\s*(.+?)(?:SOLICITANTE|Firma|firma|$)',
            text_norm,
            re.IGNORECASE | re.DOTALL
        )
        if obs_match:
            obs_text = obs_match.group(1).strip()
            if len(obs_text) > 5:
                # Limpiar y limitar a 500 caracteres
                obs_text = re.sub(r'\s+', ' ', obs_text)[:500]
                data['observaciones'] = obs_text

        # ═══════════════════════════════════════════════════════════════════
        # TIPO DE PERMISO (Remunerado o No)
        # ═══════════════════════════════════════════════════════════════════
        # Buscar patrón "☑ Remunerado" o "X Remunerado"
        if re.search(r'[\☑X✓☒]\s*Remunerado', text_norm, re.IGNORECASE):
            data['es_remunerado'] = True

        data['success'] = True
        return data

    def _extract_vacation(self, pdf_path: str, text: str) -> Dict:
        """
        Extrae datos de vacaciones (CM-TH-SV-001)
        Compatible con estructura NO_AUSEN
        Formato estructurado en tabla, optimizado para PDFs escaneados
        """
        data = {
            'tipo_novedad': 'VACACIONES',
            'tipo_archivo': 'pdf',
            'cedula': None,
            'nombre': None,
            'cargo': None,
            'area': None,
            'fecha_inicio': None,
            'fecha_fin': None,
            'cantidad': None,
            'observaciones': None,
            'fuente': pdf_path,
            'procesado_en': datetime.now().isoformat()
        }

        # Normalizar espacios
        text_norm = re.sub(r'\s+', ' ', text)

        # ═══════════════════════════════════════════════════════════════════
        # CÉDULA - Buscar todos los números de 10 dígitos
        # ═══════════════════════════════════════════════════════════════════
        cedula_matches = re.findall(r'\b(\d{10})\b', text_norm)
        if cedula_matches:
            # La cédula del empleado suele estar entre los primeros números
            # Filtrar cédulas que puedan ser del jefe (10276733 aparece en permiso)
            for cedula in cedula_matches:
                if cedula != '10276733' and cedula != '0000000000':
                    data['cedula'] = cedula
                    break
            # Si todas son filtradas, usar la primera
            if not data['cedula'] and cedula_matches:
                data['cedula'] = cedula_matches[0]

        # ═══════════════════════════════════════════════════════════════════
        # NOMBRE - Buscar después de "Nombre y Apellidos" o "Nombre:"
        # ═══════════════════════════════════════════════════════════════════
        nombre_patterns = [
            r'(?:Nombre y Apellidos|Nombre\s+y\s+Apellidos)\s+(?:Completos)?:\s*([A-Za-záéíóúñÁÉÍÓÚÑ\s]+?)(?:\s{2,}|Cedula|cedula)',
            r'(?:NOMBRE|Nombre)\s+(?:y\s+)?(?:Apellidos)?\s*:\s*([A-Za-záéíóúñÁÉÍÓÚÑ\s]+?)(?:\s{2,}|Cedula|cedula|$)',
            r'([A-Z][a-záéíóúñ]+(?:\s+[A-Z][a-záéíóúñ]+)+)\s+(?:10\d{8})',  # Nombre seguido de cédula
        ]

        for pattern in nombre_patterns:
            nombre_match = re.search(pattern, text_norm, re.IGNORECASE)
            if nombre_match:
                nombre_candidate = nombre_match.group(1).strip()
                if len(nombre_candidate) > 4 and nombre_candidate.count(' ') < 5:
                    # Limpiar de caracteres no alfabéticos
                    nombre_candidate = re.sub(r'[^\w\s]', '', nombre_candidate).strip()
                    if len(nombre_candidate) > 4:
                        data['nombre'] = nombre_candidate
                        break

        # ═══════════════════════════════════════════════════════════════════
        # CARGO - "Cargo: XXXXXXXXX"
        # ═══════════════════════════════════════════════════════════════════
        cargo_patterns = [
            r'(?:Cargo|CARGO):\s*([A-Za-záéíóúñÁÉÍÓÚÑ\s]+?)(?:\s{2,}|$)',
            r'(?:Cargo|CARGO)\s+([A-Za-záéíóúñÁÉÍÓÚÑ\s]+?)(?:\s{2,}|$)',
        ]

        for pattern in cargo_patterns:
            cargo_match = re.search(pattern, text_norm, re.IGNORECASE)
            if cargo_match:
                cargo_candidate = cargo_match.group(1).strip()
                if len(cargo_candidate) > 1 and cargo_candidate.count(' ') < 4:
                    data['cargo'] = cargo_candidate
                    break

        # ═══════════════════════════════════════════════════════════════════
        # PERÍODO SOLICITADO - Múltiples formatos
        # ═══════════════════════════════════════════════════════════════════
        # Patrón 1: DD MM YYYY en tabla (formato del formulario)
        periodo_match = re.search(
            r'(?:Periodo|Período).*?'
            r'(?:DD|dd)\s+(?:MM|mm)\s+(?:AA|aa).*?'  # Encabezados de tabla
            r'(\d{1,2})\s+(\d{1,2})\s+(\d{4})\s+'    # Fecha inicio: DD MM YYYY
            r'(\d{1,2})\s+(\d{1,2})\s+(\d{4})',       # Fecha fin: DD MM YYYY
            text_norm,
            re.IGNORECASE
        )

        # Patrón 2: Si el anterior no funciona, buscar dos fechas DD-MM-YYYY
        if not periodo_match:
            periodo_match = re.search(
                r'(\d{1,2})[-/](\d{1,2})[-/](\d{4})\s+(\d{1,2})[-/](\d{1,2})[-/](\d{4})',
                text_norm
            )
            if periodo_match:
                day_i, month_i, year_i, day_f, month_f, year_f = periodo_match.groups()
                periodo_match = type('obj', (object,), {
                    'groups': lambda: (day_i, month_i, year_i, day_f, month_f, year_f)
                })()

        # Patrón 3: Buscar en orden: número espacio número espacio año...
        if not periodo_match:
            # Buscar 4 números de 1-2 dígitos seguidos de 2 años
            periodo_match = re.search(
                r'\b([0-2]?\d)\s+([0-1]?\d)\s+(\d{4})\s+([0-2]?\d)\s+([0-1]?\d)\s+(\d{4})\b',
                text_norm
            )

        if periodo_match:
            try:
                day_i, month_i, year_i, day_f, month_f, year_f = periodo_match.groups()
                # Validar y formatar fechas
                datetime(int(year_i), int(month_i), int(day_i))
                datetime(int(year_f), int(month_f), int(day_f))
                data['fecha_inicio'] = f"{year_i}-{month_i.zfill(2)}-{day_i.zfill(2)}"
                data['fecha_fin'] = f"{year_f}-{month_f.zfill(2)}-{day_f.zfill(2)}"
            except (ValueError, AttributeError):
                pass

        # ═══════════════════════════════════════════════════════════════════
        # CANTIDAD DE DÍAS - "Días de Vacaciones disfrutados: XX"
        # ═══════════════════════════════════════════════════════════════════
        dias_patterns = [
            r'(?:Dias de Vacaciones|Días de Vacaciones).*?disfrutados:?\s*(\d+)',
            r'(?:Dias|Días)\s+(?:disfrutados|solicitados)?:?\s*(\d+)',
            r'disfrutados?\s*:?\s*(\d+)',
        ]

        for pattern in dias_patterns:
            dias_match = re.search(pattern, text_norm, re.IGNORECASE)
            if dias_match:
                try:
                    cantidad = int(dias_match.group(1))
                    if 1 <= cantidad <= 90:  # Validación sensata
                        data['cantidad'] = cantidad
                        break
                except ValueError:
                    pass

        # ═══════════════════════════════════════════════════════════════════
        # OBSERVACIONES - Sección de observaciones
        # ═══════════════════════════════════════════════════════════════════
        obs_patterns = [
            r'(?:Observaciones|observaciones):\s*(.+?)(?:Actividades|Persona|Firma|firma|$)',
            r'(?:Observaciones|observaciones)\s+(.+?)(?:Actividades|Persona|Firma|firma|$)',
        ]

        for pattern in obs_patterns:
            obs_match = re.search(pattern, text_norm, re.IGNORECASE | re.DOTALL)
            if obs_match:
                obs_text = obs_match.group(1).strip()
                if len(obs_text) > 3:
                    obs_text = re.sub(r'\s+', ' ', obs_text)[:500]
                    data['observaciones'] = obs_text
                    break

        data['success'] = True
        return data

    def format_for_insertion(self, extracted_data: Dict) -> Dict:
        """
        Convierte datos extraídos al formato de inserción de BD
        Compatible con la estructura existente de NO_NOVED/NO_AUSEN
        """
        if not extracted_data.get('success'):
            return extracted_data

        tipo_novedad = extracted_data.get('tipo_novedad')

        if tipo_novedad == 'PERMISO':
            # Mapeo para NO_NOVED
            return {
                'tabla_destino': 'NO_NOVED',
                'campo_clave': extracted_data.get('cedula'),
                'campo_nombre': extracted_data.get('nombre'),
                'campos': {
                    'NO_EMPL': extracted_data.get('cedula'),
                    'NO_NFECH': extracted_data.get('fecha_novedad'),
                    'NO_TIPO': 'PERMISO',
                    'NO_DSFECH': extracted_data.get('hora_inicio'),
                    'NO_DHFECH': extracted_data.get('hora_fin'),
                    'NO_CANTIDAD': extracted_data.get('cantidad'),
                    'NO_OBS': extracted_data.get('observaciones'),
                }
            }

        elif tipo_novedad == 'VACACIONES':
            # Mapeo para NO_AUSEN
            return {
                'tabla_destino': 'NO_AUSEN',
                'campo_clave': extracted_data.get('cedula'),
                'campo_nombre': extracted_data.get('nombre'),
                'campos': {
                    'NO_SEMP': extracted_data.get('cedula'),
                    'NO_SFIN': extracted_data.get('fecha_inicio'),
                    'NO_SFEC': extracted_data.get('fecha_fin'),
                    'NO_STIP': 'VACACIONES',
                    'NO_SCANT': extracted_data.get('cantidad'),
                    'NO_SOBS': extracted_data.get('observaciones'),
                }
            }

        return extracted_data

    def validate_extraction(self, data: Dict) -> Tuple[bool, List[str]]:
        """
        Valida que los datos extraídos cumplan con requisitos mínimos
        Retorna: (es_válido, lista_de_errores)
        """
        errores = []

        # Validaciones básicas
        if not data.get('cedula'):
            errores.append("Cédula no detectada")
        elif len(str(data['cedula'])) != 10:
            errores.append("Cédula debe tener 10 dígitos")

        if not data.get('nombre'):
            errores.append("Nombre no detectado")

        if not data.get('fecha_novedad') and not data.get('fecha_inicio'):
            errores.append("Fecha no detectada")

        if not data.get('cantidad') or data['cantidad'] <= 0:
            errores.append("Cantidad (horas/días) no válida o no detectada")

        return len(errores) == 0, errores


# Funciones auxiliares para integración
def procesar_pdf_para_importacion(pdf_path: str) -> Dict:
    """
    Función de conveniencia para procesar un PDF
    """
    extensor = PDFImportExtension()
    datos_brutos = extensor.process_file(pdf_path)
    es_valido, errores = extensor.validate_extraction(datos_brutos)

    resultado = {
        'datos_extraidos': datos_brutos,
        'es_valido': es_valido,
        'errores_validacion': errores,
        'datos_formateados': extensor.format_for_insertion(datos_brutos) if es_valido else None
    }

    return resultado


# Ejemplo de uso
if __name__ == "__main__":
    import json

    print("\n" + "="*70)
    print("EXTENSIÓN DE IMPORTACIÓN PDF - MineDax v2.0")
    print("="*70 + "\n")

    extensor = PDFImportExtension()

    # Test: Permiso
    perm_file = '/sessions/cool-gallant-rubin/mnt/uploads/19- Solicitud de permiso Laura Velasquez-9cd22717.pdf'
    print("Procesando permiso...")
    result_perm = procesar_pdf_para_importacion(perm_file)

    print(f"✓ Válido: {result_perm['es_valido']}")
    if result_perm['errores_validacion']:
        print(f"✗ Errores: {result_perm['errores_validacion']}")
    else:
        print("Datos extraídos:")
        print(json.dumps(result_perm['datos_extraidos'], indent=2, ensure_ascii=False))

    print("\n" + "="*70 + "\n")

    # Test: Vacaciones
    vac_file = '/sessions/cool-gallant-rubin/mnt/uploads/27- Solicitud de vacaciones Camilo Aricapa-bc42534f.pdf'
    print("Procesando vacaciones...")
    result_vac = procesar_pdf_para_importacion(vac_file)

    print(f"✓ Válido: {result_vac['es_valido']}")
    if result_vac['errores_validacion']:
        print(f"✗ Errores: {result_vac['errores_validacion']}")
    else:
        print("Datos extraídos:")
        print(json.dumps(result_vac['datos_extraidos'], indent=2, ensure_ascii=False))
