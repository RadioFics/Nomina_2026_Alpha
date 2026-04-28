#!/usr/bin/env python3
"""
procesar_pdf.py  —  Extractor de PDFs de Novedades MineDax
===========================================================
Soporta:
  CM-TH-FR-003  Solicitud de Permiso     → tipo_novedad = 'PERMISO'
  CM-TH-SV-001  Solicitud de Vacaciones  → tipo_novedad = 'VACACIONES'

Invocado por importarPDFController.js vía spawn:
  python3 procesar_pdf.py <ruta_pdf>

Devuelve JSON a stdout con la estructura esperada por el controller.
"""

import sys
import os
import re
import json
from datetime import datetime, date

# ─── Dependencias opcionales ──────────────────────────────────────────────────
try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:
    HAS_PDFPLUMBER = False

try:
    import pytesseract
    from PIL import Image

    # Rutas típicas de Tesseract en Windows — se prueba en orden hasta encontrar una válida
    import platform, shutil
    if platform.system() == 'Windows' and not shutil.which('tesseract'):
        _rutas_windows = [
            r'C:\Program Files\Tesseract-OCR\tesseract.exe',
            r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe',
            r'C:\Users\Public\Tesseract-OCR\tesseract.exe',
        ]
        for _ruta in _rutas_windows:
            if os.path.isfile(_ruta):
                pytesseract.pytesseract.tesseract_cmd = _ruta
                break

    HAS_OCR = True
except ImportError:
    HAS_OCR = False

# ─── Helpers ──────────────────────────────────────────────────────────────────

def normalizar(text: str) -> str:
    """Colapsa espacios y saltos de línea múltiples en uno solo."""
    return re.sub(r'[ \t]+', ' ', text).strip()


def parse_fecha_ddmmyyyy(s: str):
    """
    Convierte 'DD-MM-YYYY' o 'DD/MM/YYYY' → 'YYYY-MM-DD'.
    Retorna None si falla.
    """
    if not s:
        return None
    partes = re.split(r'[-/]', s.strip())
    if len(partes) == 3:
        try:
            d, m, y = partes
            date(int(y), int(m), int(d))   # validar
            return f"{int(y):04d}-{int(m):02d}-{int(d):02d}"
        except (ValueError, TypeError):
            pass
    return None


def corregir_digito_ocr(valor_str: str) -> int | None:
    """
    Corrige confusiones comunes de OCR en dígitos numéricos:
      '3' puede ser '9', '1' puede ser '7', '0' puede ser '6', etc.
    Estrategia: si el valor parece razonable para días (1-31) lo devuelve tal cual;
    si está fuera de rango, prueba sustituciones típicas.
    """
    if valor_str is None:
        return None
    s = valor_str.strip().lstrip('[').rstrip(']').strip()
    try:
        v = int(s)
        if 1 <= v <= 31:
            return v
        # 3 → 9  (confusión frecuente con Tesseract en fuentes sans-serif)
        alternativas = {'3': 9, '1': 7, '0': 6}
        for k, alt in alternativas.items():
            if s == k and 1 <= alt <= 31:
                return alt
    except (ValueError, TypeError):
        pass
    return None


def calcular_dias_laborables(fecha_ini: str, fecha_fin: str) -> int:
    """
    Calcula días laborables (lunes a viernes) entre dos fechas ISO.
    Se usa como fallback cuando el OCR no puede leer el campo de días.
    MineDax usa días laborables L-V para vacaciones disfrutadas.
    """
    from datetime import timedelta
    try:
        fi = date.fromisoformat(fecha_ini)
        ff = date.fromisoformat(fecha_fin)
        if ff < fi:
            return 0
        total = 0
        current = fi
        while current <= ff:
            if current.weekday() < 5:   # 0=lun … 4=vie
                total += 1
            current += timedelta(days=1)
        return total
    except Exception:
        return 0


# ─── Extractor de Permisos (CM-TH-FR-003, PDF con texto) ─────────────────────

def extraer_permiso(text: str, pdf_path: str) -> dict:
    """
    Extrae datos de solicitud de PERMISO (CM-TH-FR-003).
    El formulario contiene texto extraíble (no imagen).
    """
    data = {
        'tipo_novedad': 'PERMISO',
        'tipo_archivo': 'pdf',
        'cedula': None,
        'nombre': None,
        'cargo': None,
        'area': None,
        'fecha_novedad': None,   # FEC_REGI en NO_NOVED (fecha inicio del permiso)
        'fecha_inicio': None,
        'fecha_fin': None,
        'hora_inicio': None,
        'hora_fin': None,
        'cantidad': None,        # horas del permiso
        'motivo': None,
        'es_remunerado': False,
        'observaciones': None,
        'fuente': pdf_path,
        'procesado_en': datetime.now().isoformat(),
        'success': False,
        'errores': []
    }

    tn = normalizar(text)   # texto normalizado con espacios simples

    # ── Cédula ──────────────────────────────────────────────────────────────
    # Primera ocurrencia de 10 dígitos seguida de otra información de persona
    cedula_m = re.search(r'\bCedula:\s*(\d{9,11})\b', tn, re.IGNORECASE)
    if not cedula_m:
        cedula_m = re.search(r'\b(\d{10})\b', tn)
    if cedula_m:
        data['cedula'] = cedula_m.group(1)

    # ── Nombre ──────────────────────────────────────────────────────────────
    nombre_m = re.search(
        r'Nombre:\s*([A-Za-záéíóúñÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ\s]+?)'
        r'\s+Cedula:',
        tn, re.IGNORECASE
    )
    if nombre_m:
        data['nombre'] = nombre_m.group(1).strip()

    # ── Cargo ────────────────────────────────────────────────────────────────
    cargo_m = re.search(
        r'Cargo:\s*([A-Za-záéíóúñÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ\s]+?)'
        r'\s+Area:',
        tn, re.IGNORECASE
    )
    if cargo_m:
        data['cargo'] = cargo_m.group(1).strip()

    # ── Área: solo hasta el siguiente bloque en mayúsculas ───────────────────
    area_m = re.search(
        r'Area:\s*([A-Za-záéíóúñÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ\s]+?)'
        r'(?=\s+[A-Z]{3,}|\s*$)',
        tn, re.IGNORECASE
    )
    if area_m:
        area_raw = area_m.group(1).strip()
        # Limpiar arrastre de texto del siguiente bloque
        area_limpia = re.sub(
            r'\s+(DATOS|INFORMACION|PERMISO|MOTIVO|SOLICITANTE).*', '',
            area_raw, flags=re.IGNORECASE
        ).strip()
        data['area'] = area_limpia if area_limpia else area_raw.split()[0]

    # ── Fechas del permiso: "Fecha Permiso: De: DD-MM-YYYY Hasta: DD-MM-YYYY" ─
    fechas_m = re.search(
        r'Fecha\s+Permiso:.*?De:\s*(\d{1,2}[-/]\d{1,2}[-/]\d{4})'
        r'.*?Hasta:\s*(\d{1,2}[-/]\d{1,2}[-/]\d{4})',
        tn, re.IGNORECASE
    )
    if fechas_m:
        fi = parse_fecha_ddmmyyyy(fechas_m.group(1))
        ff = parse_fecha_ddmmyyyy(fechas_m.group(2))
        data['fecha_novedad'] = fi
        data['fecha_inicio']  = fi
        data['fecha_fin']     = ff
    else:
        # Fallback: buscar cualquier fecha DD-MM-YYYY
        fecha_sola = re.search(r'(\d{1,2}[-/]\d{1,2}[-/]\d{4})', tn)
        if fecha_sola:
            fi = parse_fecha_ddmmyyyy(fecha_sola.group(1))
            data['fecha_novedad'] = fi
            data['fecha_inicio']  = fi
            data['fecha_fin']     = fi

    # ── Horas ────────────────────────────────────────────────────────────────
    horas_m = re.search(
        r'Horas:.*?De:\s*([0-9]{1,2}:[0-9]{2}\s*(?:Am|Pm|AM|PM))'
        r'.*?Hasta:\s*([0-9]{1,2}:[0-9]{2}\s*(?:Am|Pm|AM|PM))',
        tn, re.IGNORECASE
    )
    if horas_m:
        data['hora_inicio'] = horas_m.group(1).strip()
        data['hora_fin']    = horas_m.group(2).strip()

    # ── Total horas/días ─────────────────────────────────────────────────────
    total_m = re.search(
        r'Total\s+de\s+Dias:\s*0*([1-9][0-9]*)\s*(?:Horas|Dias|horas|dias)',
        tn, re.IGNORECASE
    )
    if total_m:
        try:
            data['cantidad'] = int(total_m.group(1))
        except ValueError:
            pass

    # ── Motivo ───────────────────────────────────────────────────────────────
    # El PDF no tiene checkboxes visibles en texto extraíble.
    # Inferimos por el orden en que aparecen los motivos:
    # El formulario lista: Estudio / Calamidad / Medico / Vacaciones (izquierda)
    #                      Compensatorio / Fuerza Mayor / Otra Causa (derecha)
    # Cuando hay dos motivos marcados, buscar cuál se menciona en observaciones.
    # Mapeamos a los códigos de concepto de MineDax.
    motivos_ord = [
        ('Compensatorio', 'COMPENSATORIO'),
        ('Fuerza Mayor',  'FUERZA_MAYOR'),
        ('Calamidad',     'CALAMIDAD'),
        ('Medico',        'MEDICO'),
        ('Estudio',       'ESTUDIO'),
        ('Otra Causa',    'OTRA'),
        ('Vacaciones',    'VACACIONES'),
    ]
    # Buscar en las observaciones para mayor precisión
    obs_lower = tn.lower()
    motivo_detectado = None
    if 'clases' in obs_lower or 'universidad' in obs_lower or 'estudio' in obs_lower:
        motivo_detectado = 'ESTUDIO'
    elif 'compensad' in obs_lower or 'compensatorio' in obs_lower:
        motivo_detectado = 'COMPENSATORIO'
    elif 'medico' in obs_lower or 'médico' in obs_lower or 'cita' in obs_lower:
        motivo_detectado = 'MEDICO'
    elif 'calamidad' in obs_lower or 'luto' in obs_lower or 'familiar' in obs_lower:
        motivo_detectado = 'CALAMIDAD'
    else:
        # Fallback: primer motivo que aparece en el texto
        for kw, cod in motivos_ord:
            if kw.lower() in obs_lower:
                motivo_detectado = cod
                break
    data['motivo'] = motivo_detectado or 'ESTUDIO'

    # ── Tipo de permiso (Remunerado / No remunerado) ─────────────────────────
    # El texto contiene ambas palabras; si "No Remunerado" aparece ANTES que
    # "Remunerado" significa que la casilla marcada es "No Remunerado".
    pos_no  = tn.lower().find('no remunerado')
    pos_rem = tn.lower().find('remunerado')
    if pos_rem != -1:
        if pos_no == -1 or pos_rem < pos_no:
            data['es_remunerado'] = True
        else:
            data['es_remunerado'] = False
    else:
        data['es_remunerado'] = False

    # ── Observaciones ────────────────────────────────────────────────────────
    obs_m = re.search(
        r'OBSERVACIONES\s+(.+?)(?:\s*(?:TIPO\s+PERMISO|SOLICITANTE|JEFE|$))',
        text,   # usar texto original con saltos para mejor captura
        re.IGNORECASE | re.DOTALL
    )
    if obs_m:
        obs = re.sub(r'\s+', ' ', obs_m.group(1)).strip()
        if len(obs) > 5:
            data['observaciones'] = obs[:500]

    # ── Validaciones ────────────────────────────────────────────────────────
    if not data['cedula']:
        data['errores'].append('Cédula no detectada')
    if not data['nombre']:
        data['errores'].append('Nombre no detectado')
    if not data['fecha_inicio']:
        data['errores'].append('Fecha de permiso no detectada')
    if not data['cantidad']:
        data['errores'].append('Total horas no detectado')

    data['success'] = len(data['errores']) == 0
    return data


# ─── Extractor de Vacaciones (CM-TH-SV-001, PDF imagen escaneada) ─────────────

def extraer_vacaciones_ocr(pdf_path: str) -> dict:
    """
    Extrae datos de solicitud de VACACIONES (CM-TH-SV-001).
    El formulario es una imagen escaneada; se usa OCR con Tesseract.
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
        'procesado_en': datetime.now().isoformat(),
        'success': False,
        'errores': []
    }

    if not HAS_OCR:
        data['errores'].append(
            'OCR no disponible. Instale las dependencias en el servidor:\n'
            '  1. pip install pytesseract pillow\n'
            '  2. Descargue Tesseract-OCR para Windows desde:\n'
            '     https://github.com/UB-Mannheim/tesseract/wiki\n'
            '     Instale en: C:\\Program Files\\Tesseract-OCR\\'
        )
        return data

    # Verificar que el ejecutable de Tesseract esté accesible
    try:
        pytesseract.get_tesseract_version()
    except Exception:
        data['errores'].append(
            'Tesseract-OCR no encontrado en el PATH del sistema.\n'
            'Instale Tesseract desde: https://github.com/UB-Mannheim/tesseract/wiki\n'
            'Ruta esperada en Windows: C:\\Program Files\\Tesseract-OCR\\tesseract.exe\n'
            'Luego agregue esa carpeta al PATH del sistema o reinicie el servidor.'
        )
        return data

    try:
        with pdfplumber.open(pdf_path) as pdf:
            page = pdf.pages[0]
            pil_img = page.to_image(resolution=250).original

        # OCR — lang='eng' porque 'spa' traindata no está instalado
        # Los pipes '|' son artefactos OCR de separadores de tabla — se eliminan
        raw = pytesseract.image_to_string(pil_img, lang='eng')
        tn  = re.sub(r'[ \t|]+', ' ', raw).strip()

        # ── Cédula ──────────────────────────────────────────────────────────
        # Buscar en contexto "Cedula de Ciudadania No. XXXXXXXXXX"
        ced_m = re.search(
            r'(?:Cedula|Cédula|cedula).*?(?:Ciudadania|Ciudadanía).*?No\.?\s*(\d{9,11})',
            tn, re.IGNORECASE
        )
        if not ced_m:
            # Fallback: primer número de 10 dígitos que no sea una fecha
            for m in re.finditer(r'\b(\d{9,10})\b', tn):
                candidato = m.group(1)
                # Excluir años o códigos de formulario (menores de 9 cifras o fecha-like)
                if len(candidato) >= 9 and not candidato.startswith('0108'):
                    ced_m = m
                    break
        if ced_m:
            data['cedula'] = ced_m.group(1)

        # ── Nombre ──────────────────────────────────────────────────────────
        # Formulario: "Nombre'y Apellidos Completos | VAIRON CAMILO ARICAPA TREJOS"
        nombre_m = re.search(
            r'Completes?\s*\|?\s*([A-Z][A-Z\s]{5,50}?)(?=\s*Cedula|\s*$)',
            tn, re.IGNORECASE
        )
        if not nombre_m:
            nombre_m = re.search(
                r'(?:Nombre|Apellidos).*?Completos?\s+([A-Z][A-Z\s]{5,50}?)(?=\s*Cedula)',
                tn, re.IGNORECASE
            )
        if nombre_m:
            data['nombre'] = nombre_m.group(1).strip()

        # ── Cargo ────────────────────────────────────────────────────────────
        cargo_m = re.search(
            r'Carg[oe]\s+([A-Z][A-Z\s]{2,40}?)(?=\s*Periodo|\s*Solicitado|\s*$)',
            tn, re.IGNORECASE
        )
        if cargo_m:
            data['cargo'] = cargo_m.group(1).strip()

        # ── Fechas: "DD MM YYYY DD MM YYYY" (pipes ya eliminados de tn) ──────
        fechas_m = re.search(
            r'(\d{1,2})\s+(\d{1,2})\s+(20\d{2})\s+'
            r'(\d{1,2})\s+(\d{1,2})\s+(20\d{2})',
            tn
        )
        # Fallback 300 dpi: algunas disposiciones de tabla (col. derecha) se
        # capturan mejor a mayor resolución (ej. Paula Naranjo, doble columna).
        # También se usa para cédula/nombre cuando 250dpi da texto ilegible
        # (ej. Verónica Castro — CamScanner de baja calidad).
        if not fechas_m or not data['cedula'] or not data['nombre']:
            with pdfplumber.open(pdf_path) as pdf:
                pil_img_300 = pdf.pages[0].to_image(resolution=300).original
            raw_300  = pytesseract.image_to_string(pil_img_300, lang='eng')
            tn_300   = re.sub(r'[ \t|]+', ' ', raw_300).strip()

            if not fechas_m:
                fechas_m = re.search(
                    r'(\d{1,2})\s+(\d{1,2})\s+(20\d{2})\s+'
                    r'(\d{1,2})\s+(\d{1,2})\s+(20\d{2})',
                    tn_300
                )

            # Cédula fallback con texto 300 dpi
            if not data['cedula']:
                ced_300 = re.search(
                    r'(?:Cedula|Cédula|cedula).*?(?:Ciudadania|Ciudadanía).*?No\.?\s*(\d{9,11})',
                    tn_300, re.IGNORECASE
                )
                if not ced_300:
                    for m in re.finditer(r'\b(\d{9,10})\b', tn_300):
                        c = m.group(1)
                        if not c.startswith('0108') and not c.startswith('2023') and not c.startswith('2026'):
                            ced_300 = m
                            break
                if ced_300:
                    data['cedula'] = ced_300.group(1)

            # Nombre fallback con texto 300 dpi
            if not data['nombre']:
                nom_300 = re.search(
                    r'Completes?\s*\|?\s*([A-Z][A-Z\s]{5,50}?)(?=\s*Cedula|\s*$)',
                    tn_300, re.IGNORECASE
                )
                if not nom_300:
                    nom_300 = re.search(
                        r'(?:Nombre|Apellidos).*?Completos?\s+([A-Z][A-Z\s]{5,50}?)(?=\s*Cedula)',
                        tn_300, re.IGNORECASE
                    )
                if not nom_300:
                    # Último recurso: nombre antes de "Cedula de Ciudadania"
                    nom_300 = re.search(
                        r'([A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ]+(?:\s+[A-ZÁÉÍÓÚÑ][A-ZÁÉÍÓÚÑa-záéíóúñ]+){1,4})'
                        r'\s+(?:Cedula|Cédula)',
                        tn_300, re.IGNORECASE
                    )
                if nom_300:
                    data['nombre'] = nom_300.group(1).strip()

        if fechas_m:
            d1, m1, y1, d2, m2, y2 = fechas_m.groups()
            try:
                fi = date(int(y1), int(m1), int(d1))
                ff = date(int(y2), int(m2), int(d2))
                data['fecha_inicio'] = fi.isoformat()
                data['fecha_fin']    = ff.isoformat()
            except ValueError:
                data['errores'].append('Fechas inválidas en el período solicitado')

        # ── Días disfrutados ─────────────────────────────────────────────────
        # Acepta dígitos Y letras que OCR confunde con dígitos (o→0, s/S→5, l/I→1)
        dias_m = re.search(
            r'disfrutados[:\s]*[\[\(]?\s*([0-9oOlIsS]{1,3})\s*[\]\)|]?',
            tn, re.IGNORECASE
        )
        if not dias_m:
            dias_m = re.search(
                r'disfrutados[:\s]*[\[\(]?\s*([0-9oOlIsS]{1,3})\s*[\]\)|]?',
                tn_300 if 'tn_300' in dir() else '', re.IGNORECASE
            )
        if dias_m:
            # Normalizar letras→dígitos antes de convertir
            raw_dias = (dias_m.group(1)
                        .replace('o', '0').replace('O', '0')
                        .replace('s', '5').replace('S', '5')
                        .replace('l', '1').replace('I', '1').replace('i', '1'))
            if raw_dias.isdigit():
                cantidad = int(raw_dias)
                if 1 <= cantidad <= 31:
                    data['cantidad'] = cantidad

        # Corrección OCR: el dígito "9" se confunde frecuentemente con "3"
        # Si OCR dice 3 y las fechas dan 9 laborables → corregir a 9
        if data['cantidad'] and data['fecha_inicio'] and data['fecha_fin']:
            dias_reales = calcular_dias_laborables(data['fecha_inicio'], data['fecha_fin'])
            # Si el valor OCR es claramente incorrecto comparado con el cálculo
            # y la diferencia cuadra con una confusión 3↔9, corregir
            if data['cantidad'] == 3 and dias_reales == 9:
                data['cantidad'] = 9
            elif data['cantidad'] == 1 and dias_reales == 7:
                data['cantidad'] = 7

        # Fallback: calcular días laborables si OCR no dio ningún resultado
        if not data['cantidad'] and data['fecha_inicio'] and data['fecha_fin']:
            data['cantidad'] = calcular_dias_laborables(
                data['fecha_inicio'], data['fecha_fin']
            )

    except Exception as e:
        data['errores'].append(f'Error OCR: {str(e)}')
        return data

    # ── Nombre desde filename como último recurso ────────────────────────────
    # Patrón consistente: "XX- Solicitud de vacaciones <Nombre Apellido>.pdf"
    if not data['nombre']:
        fname_m = re.search(
            r'vacaciones\s+(.+?)\.pdf',
            os.path.basename(pdf_path), re.IGNORECASE
        )
        if fname_m:
            data['nombre'] = fname_m.group(1).strip()

    # ── Validaciones ────────────────────────────────────────────────────────
    if not data['cedula']:
        data['errores'].append('Cédula no detectada')
    if not data['nombre']:
        data['errores'].append('Nombre no detectado')
    if not data['fecha_inicio']:
        data['errores'].append('Fecha inicio no detectada')
    if not data['fecha_fin']:
        data['errores'].append('Fecha fin no detectada')
    if not data['cantidad']:
        data['errores'].append('Días de vacaciones no detectados')

    data['success'] = len(data['errores']) == 0
    return data


# ─── Extractor de Vacaciones (CM-TH-SV-001, PDF con texto nativo) ────────────

def extraer_vacaciones_texto(text: str, pdf_path: str) -> dict:
    """
    Extrae datos de vacaciones (CM-TH-SV-001) desde PDF con texto nativo.

    pdfplumber puede ordenar el stream de modo que el valor de una celda
    aparezca ANTES de su etiqueta. Esta funcion maneja ambos ordenes usando
    \s+ (que captura tanto espacios como saltos de linea).

    Normaliza cedulas con puntos de miles: 75.079.022 → "75079022".
    """
    data = {
        'tipo_novedad': 'VACACIONES',
        'tipo_archivo': 'pdf',
        'cedula':       None,
        'nombre':       None,
        'cargo':        None,
        'area':         None,
        'fecha_inicio': None,
        'fecha_fin':    None,
        'cantidad':     None,
        'observaciones': None,
        'fuente':       pdf_path,
        'procesado_en': datetime.now().isoformat(),
        'success':      False,
        'errores':      []
    }

    # Normalizar: colapsa espacios y tabs; conserva saltos de linea
    tn = re.sub(r'[ \t]+', ' ', text).strip()

    # ── Nombre ──────────────────────────────────────────────────────────────
    # Caso A: "Nombre y Apellidos Completos  NOMBRE"  (label antes valor)
    nombre_m = re.search(
        r'(?:Nombre\s+y\s+Apellidos|Apellidos\s+Completos)\s+(?:Completos\s+)?'
        r'([A-Za-záéíóúñÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ\s]{4,60}?)'
        r'(?=\s{2,}|Cedula|Cédula|\d|$)',
        tn, re.IGNORECASE
    )
    if not nombre_m:
        # Caso B: valor en linea ANTERIOR a la etiqueta
        # \s+ captura newlines entre valor y etiqueta
        nombre_m = re.search(
            r'([A-Za-záéíóúñÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ\s]{4,60}?)\s+Nombre\s+y\s+Apellidos',
            tn, re.IGNORECASE
        )
    if nombre_m:
        data['nombre'] = nombre_m.group(1).strip()

    # ── Cedula ───────────────────────────────────────────────────────────────
    # Soporta formato con puntos de miles: 75.079.022 → "75079022"
    # Caso A: "Cedula de Ciudadania No.  NUMERO"  (label antes valor)
    ced_m = re.search(
        r'(?:Cedula|Cédula).*?(?:Ciudadan[ií]a).*?No\.?\s*([\d.]{6,15})',
        tn, re.IGNORECASE
    )
    if not ced_m:
        # Caso B: valor en linea ANTERIOR a la etiqueta
        ced_m = re.search(
            r'([\d.]{6,15})\s+Cedula\s+de\s+Ciudadan',
            tn, re.IGNORECASE
        )
    if ced_m:
        cedula_raw = ced_m.group(1).replace('.', '').strip()
        if cedula_raw.isdigit():
            data['cedula'] = cedula_raw

    # ── Cargo ─────────────────────────────────────────────────────────────────
    # Caso A: "Cargo  CARGO AQUI"  (label antes valor)
    cargo_m = re.search(
        r'\bCargo\s+([A-Za-záéíóúñÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ\s,]{2,60}?)'
        r'(?=\s{2,}|Periodo|$)',
        tn, re.IGNORECASE
    )
    if not cargo_m:
        # Caso B: valor antes de etiqueta
        cargo_m = re.search(
            r'([A-Za-záéíóúñÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ\s,]{2,60}?)\s+Cargo\b',
            tn, re.IGNORECASE
        )
    if cargo_m:
        data['cargo'] = cargo_m.group(1).strip()

    # ── Fechas: despues de encabezados "DD MM AA DD MM AA" ───────────────────
    fechas_m = re.search(
        r'(?:DD\s+MM\s+AA\s*){1,2}\s*'
        r'(\d{1,2})\s+(\d{1,2})\s+(20\d{2})\s+'
        r'(\d{1,2})\s+(\d{1,2})\s+(20\d{2})',
        tn, re.IGNORECASE
    )
    if fechas_m:
        d1, m1, y1, d2, m2, y2 = fechas_m.groups()
        try:
            fi = date(int(y1), int(m1), int(d1))
            ff = date(int(y2), int(m2), int(d2))
            data['fecha_inicio'] = fi.isoformat()
            data['fecha_fin']    = ff.isoformat()
        except ValueError:
            data['errores'].append('Fechas invalidas en el periodo solicitado')

    # ── Dias disfrutados ──────────────────────────────────────────────────────
    dias_m = re.search(
        r'(?:Dias|Días).*?disfrutados:?\s*(\d{1,3})',
        tn, re.IGNORECASE
    )
    if dias_m:
        try:
            cantidad = int(dias_m.group(1))
            if 1 <= cantidad <= 90:
                data['cantidad'] = cantidad
        except ValueError:
            pass

    # Fallback: calcular dias laborables (L-V) si el campo no se pudo extraer
    if not data['cantidad'] and data['fecha_inicio'] and data['fecha_fin']:
        data['cantidad'] = calcular_dias_laborables(data['fecha_inicio'], data['fecha_fin'])

    # ── Observaciones ─────────────────────────────────────────────────────────
    obs_m = re.search(
        r'Observaciones\s+(.+?)(?:\s+Firma|\s+Actividades|$)',
        tn, re.IGNORECASE | re.DOTALL
    )
    if obs_m:
        obs = re.sub(r'\s+', ' ', obs_m.group(1)).strip()
        if len(obs) > 5:
            data['observaciones'] = obs[:500]

    # ── Validaciones ──────────────────────────────────────────────────────────
    if not data['cedula']:
        data['errores'].append('Cédula no detectada')
    if not data['nombre']:
        data['errores'].append('Nombre no detectado')
    if not data['fecha_inicio']:
        data['errores'].append('Fecha inicio no detectada')
    if not data['fecha_fin']:
        data['errores'].append('Fecha fin no detectada')
    if not data['cantidad']:
        data['errores'].append('Días de vacaciones no detectados')

    data['success'] = len(data['errores']) == 0
    return data


# ─── Detector de tipo de formulario ──────────────────────────────────────────

def procesar_pdf(pdf_path: str) -> dict:
    """
    Detecta automaticamente el tipo de formulario y extrae los datos.
    Soporta texto nativo (permisos, Mauricio Cruz) e imagenes escaneadas (vacaciones OCR).
    """
    if not HAS_PDFPLUMBER:
        return {'success': False, 'error': 'pdfplumber no instalado (pip install pdfplumber)'}

    if not os.path.isfile(pdf_path):
        return {'success': False, 'error': f'Archivo no encontrado: {pdf_path}'}

    try:
        with pdfplumber.open(pdf_path) as pdf:
            page = pdf.pages[0]
            text = page.extract_text() or ''
            es_imagen = len(page.chars) == 0 and len(page.images) > 0

        text_upper = text.upper()

        # ── Detectar por codigo de formulario ─────────────────────────────────
        es_permiso    = 'CM-TH-FR-003' in text or (
            'FORMATO SOLICITUD DE PERMISO' in text_upper and
            'DATOS DE PERMISO' in text_upper
        )
        es_vacaciones = 'CM-TH-SV-001' in text or ('SOLICITUD DE VACACIONES' in text_upper)

        # Fallback por nombre de archivo — aplica aunque haya texto parcial.
        # Caso tipico: CamScanner inserta un nombre como capa de texto pero no
        # incluye el codigo CM-TH-SV-001, haciendo que la deteccion falle.
        if not es_permiso and not es_vacaciones:
            nombre_archivo = os.path.basename(pdf_path).lower()
            es_permiso    = 'permiso' in nombre_archivo or 'fr-003' in nombre_archivo
            es_vacaciones = 'vacacion' in nombre_archivo or 'sv-001' in nombre_archivo

        if es_permiso:
            if not text.strip():
                return {
                    'success': False,
                    'error': 'PDF de permiso no contiene texto extraible. '
                             'Verifique que no sea una imagen escaneada.'
                }
            return extraer_permiso(text, pdf_path)

        elif es_vacaciones:
            # PDFs con texto nativo suficiente (chars > 0 y texto > 50 chars):
            # usar extractor de texto — mas preciso y rapido que OCR.
            if not es_imagen and len(text.strip()) > 50:
                return extraer_vacaciones_texto(text, pdf_path)
            return extraer_vacaciones_ocr(pdf_path)

        else:
            return {
                'success': False,
                'error': (
                    'Formulario PDF no reconocido. '
                    'Formulario PDF no reconocido. '
                    'Use CM-TH-FR-003 (Permiso) o CM-TH-SV-001 (Vacaciones). '
                    f'Texto extraido: {text[:200]!r}'
                )
            }

    except Exception as e:
        return {'success': False, 'error': f'Error procesando PDF: {str(e)}'}


# ─── Main ───────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print(json.dumps({
            'success': False,
            'error': 'Uso: python3 procesar_pdf.py <ruta_pdf>'
        }, ensure_ascii=False))
        sys.exit(0)

    pdf_path = sys.argv[1]
    result = procesar_pdf(pdf_path)
    print(json.dumps(result, ensure_ascii=False, default=str))


if __name__ == '__main__':
    main()
