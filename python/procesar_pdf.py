#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
procesar_pdf.py  -  Extractor de PDFs de Novedades MineDax
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
from typing import Optional

# ─── Dependencias opcionales ──────────────────────────────────────────────────
try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:
    HAS_PDFPLUMBER = False

try:
    import pytesseract
    from PIL import Image, ImageEnhance

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

    # Detectar si el paquete de idioma español está disponible
    try:
        _langs_disponibles = pytesseract.get_languages(config='')
        _LANG_OCR = 'spa+eng' if 'spa' in _langs_disponibles else 'eng'
    except Exception:
        _LANG_OCR = 'eng'

    HAS_OCR = True
except ImportError:
    HAS_OCR = False
    _LANG_OCR = 'eng'

# ─── Helpers ──────────────────────────────────────────────────────────────────

def _preprocesar_img(pil_img):
    """
    Normaliza una imagen escaneada para mejorar la precisión de Tesseract:
      1. Escala de grises
      2. Contraste ×2 (compensa escaneos apagados de CamScanner)
      3. Binarización simple con umbral 140 (texto negro sobre fondo blanco)
    Retorna la imagen preprocesada en modo RGB.
    """
    try:
        img = pil_img.convert('L')
        img = ImageEnhance.Contrast(img).enhance(2.0)
        img = img.point(lambda x: 0 if x < 140 else 255, '1')
        return img.convert('RGB')
    except Exception:
        return pil_img


def _ocr_img(pil_img, config='--oem 3 --psm 6'):
    """Ejecuta Tesseract sobre una imagen PIL y normaliza el resultado."""
    raw = pytesseract.image_to_string(pil_img, lang=_LANG_OCR, config=config)
    return re.sub(r'[ \t|]+', ' ', raw).strip()


def _normalizar_digitos_ocr(s: str) -> str:
    """
    Sustituye confusiones de OCR en cadenas que deben ser PURAMENTE numéricas
    (cédulas, códigos). NO usar sobre texto libre — corrompe nombres y palabras.
    """
    return s.replace('l', '1').replace('I', '1').replace('i', '1') \
            .replace('O', '0').replace('o', '0') \
            .replace('S', '5').replace('s', '5')


def _normalizar_digitos_texto(s: str) -> str:
    """
    Versión ligera para texto mixto: solo corrige l→1 y O→0.
    No toca 's' ni 'i' para preservar letras en nombres y palabras.
    Usar cuando se buscan fechas o números dentro de un bloque de texto completo.
    """
    return s.replace('l', '1').replace('I', '1').replace('O', '0')


# ─── Infraestructura de fechas robusta ───────────────────────────────────────
# Mapa completo de nombres/abreviaciones de meses (español + inglés + variantes OCR).
# Las variantes de OCR cubren confusiones típicas de Tesseract sobre texto manuscrito:
#   Abril → Abnil, Abn, Abm   |   Agosto → Agt, Agt0   |   Noviembre → Nob
_MESES_ES: dict = {
    'enero':1, 'ene':1, 'jan':1, 'january':1,
    'febrero':2, 'feb':2, 'february':2,
    'marzo':3, 'mar':3, 'march':3, 'marz':3,
    'abril':4, 'abr':4, 'april':4, 'abn':4, 'abm':4, 'abnil':4, 'abnil':4,
    'mayo':5, 'may':5,
    'junio':6, 'jun':6, 'june':6,
    'julio':7, 'jul':7, 'july':7,
    'agosto':8, 'ago':8, 'august':8, 'agt':8,
    'septiembre':9, 'sep':9, 'sept':9, 'september':9, 'set':9,
    'octubre':10, 'oct':10, 'october':10,
    'noviembre':11, 'nov':11, 'november':11, 'nob':11,
    'diciembre':12, 'dic':12, 'december':12, 'dec':12,
}

def _mes_a_numero(s: str) -> Optional[int]:
    """
    Convierte nombre o abreviación de mes (español/inglés, con variantes OCR) a 1-12.
    Estrategia: exacto → por prefijo de 3 letras → búsqueda parcial.
    """
    if not s:
        return None
    c = s.lower().strip()
    # Quitar acentos comunes para normalizar
    c = c.replace('á','a').replace('é','e').replace('í','i').replace('ó','o').replace('ú','u')
    if c in _MESES_ES:
        return _MESES_ES[c]
    if len(c) >= 3 and c[:3] in _MESES_ES:
        return _MESES_ES[c[:3]]
    # Búsqueda parcial: el texto de OCR puede contener el nombre con ruido alrededor
    for nombre, num in sorted(_MESES_ES.items(), key=lambda x: -len(x[0])):
        if nombre in c:
            return num
    return None


def _parsear_fecha_robusta(s: str) -> Optional[str]:
    """
    Parseo generalista de fechas para formularios colombianos.
    Cubre todos los formatos observados en CM-TH-FR-003 y CM-TH-SV-001:
      • DD/MM/YYYY  DD-MM-YYYY  DD.MM.YYYY  DD MM YYYY
      • DD/MM/YY   DD-MM-YY   (año 2 dígitos: 26 → 2026)
      • DD/NombreMes/YYYY  (e.g., 21/Abril/2026  o  21-Abil-26)
      • DD NombreMes YYYY  (separado por espacios)
    También tolera ruido OCR en separadores (lL|\\).
    Retorna 'YYYY-MM-DD' o None si no puede parsear.
    """
    if not s:
        return None
    s = s.strip()
    # Normalizar confusiones OCR en posibles dígitos (solo l→1, O→0; no s→5)
    sn = _normalizar_digitos_texto(s)

    def _validar(d, m, y_s):
        y = int('20' + y_s) if len(str(y_s)) <= 2 else int(y_s)
        try:
            dt = date(y, int(m), int(d))
            # Descartar fechas absurdas (antes de 2020 o después de 2035)
            if 2020 <= y <= 2035:
                return dt.isoformat()
        except ValueError:
            pass
        return None

    # ── Patrón A: DD sep MM sep YYYY/YY  (sep = / - . o espacio) ────────────
    m = re.match(
        r'^(\d{1,2})\s*[\/\-\.\|lL\\]\s*(\d{1,2})\s*[\/\-\.\|lL\\]\s*(\d{2,4})$',
        sn
    )
    if m:
        r = _validar(m.group(1), m.group(2), m.group(3))
        if r: return r

    # ── Patrón B: DD sep NombreMes sep YYYY/YY ──────────────────────────────
    m = re.match(
        r'^(\d{1,2})\s*[\/\-\s]\s*([A-Za-záéíóú]{2,12})\s*[\/\-\s]\s*(\d{2,4})$',
        sn, re.IGNORECASE
    )
    if m:
        mo = _mes_a_numero(m.group(2))
        if mo:
            r = _validar(m.group(1), mo, m.group(3))
            if r: return r

    # ── Patrón C: buscar dentro de cadena con ruido (OCR puede agregar chars) ─
    # Numérico primero
    for pat in [
        r'(\d{1,2})[\/\-\.\|](\d{1,2})[\/\-\.\|](\d{2,4})',
        r'(\d{1,2})\s+(\d{1,2})\s+(20\d{2})',           # solo año 4 dígitos
        r'(\d{1,2})\s+(\d{1,2})\s+(2[0-9])(?!\d)',       # año 2 dígitos
    ]:
        m = re.search(pat, sn)
        if m:
            r = _validar(m.group(1), m.group(2), m.group(3))
            if r: return r
    # Nombre de mes dentro de la cadena
    m = re.search(
        r'(\d{1,2})\s*[\/\-\s]\s*([A-Za-záéíóú]{3,12})\s*[\/\-\s]\s*(\d{2,4})',
        sn, re.IGNORECASE
    )
    if m:
        mo = _mes_a_numero(m.group(2))
        if mo:
            r = _validar(m.group(1), mo, m.group(3))
            if r: return r

    return None


# Palabras que aparecen en los formularios pero no son parte de un nombre de empleado.
# Se usan para limpiar resultados de OCR que contaminan el campo nombre.
_TOKENS_NO_NOMBRE = {
    'nombre', 'cedula', 'cargo', 'area', 'fecha', 'solicitante', 'completos',
    'ciudadania', 'apellidos', 'collective', 'mining', 'talento', 'humano',
    'jefe', 'inmediato', 'formato', 'solicitud', 'permiso', 'version',
    'codigo', 'creacion', 'informacion', 'personal', 'datos', 'motivo',
    'tipo', 'remunerado', 'no', 'de', 'la', 'el', 'los', 'las',
}

def _limpiar_nombre_ocr(texto: str) -> Optional[str]:
    """
    Filtra y tituliza el resultado OCR de un campo nombre.
    Elimina tokens que son parte del formulario, muy cortos, o solo símbolos.
    Retorna el nombre limpio o None si queda vacío.
    """
    if not texto:
        return None
    tokens = []
    for tok in texto.split():
        # Dejar solo letras y tildes
        tok_limpio = re.sub(r'[^A-Za-záéíóúñÁÉÍÓÚÑüÜ]', '', tok)
        if len(tok_limpio) < 2:
            continue
        if tok_limpio.lower() in _TOKENS_NO_NOMBRE:
            continue
        tokens.append(tok_limpio.capitalize())
    if len(tokens) < 2:
        return None
    return ' '.join(tokens[:6])  # máx 6 palabras


def _extraer_cedula_de_texto(texto: str, solo_cabecera: bool = True) -> Optional[str]:
    """
    Extrae la cédula del solicitante de un texto OCR de formulario.

    Estrategia en 4 niveles:
      1. Patrón completo "Cedula de Ciudadanía No. XXXXX" (más específico)
      2. Formato colombiano con puntos de miles: 1.053.842.239
      3. Bloque compacto de 7-11 dígitos seguidos
      4. Fallback: primer número de 7-11 dígitos en texto (cualquier posición)

    solo_cabecera=True limita la búsqueda al primer 45% del texto para evitar
    tomar la cédula del jefe inmediato o de Talento Humano en las firmas.
    """
    # Prefijos de años y códigos de formulario que NO son cédulas
    _EXCL = ('0108', '2022', '2023', '2024', '2025', '2026', '2027', '2028')

    zona = texto[:int(len(texto) * 0.45)] if solo_cabecera else texto

    # Nivel 1: ancla completa con "Ciudadania"
    patrones_ancla = [
        r'[Cc][\xE9e]dula.*?[Cc]iudadan[\xED i]a.*?[Nn]o\.?\s*([\d.\s]{8,16})',
        r'[Cc]\.?\s*[Cc]\.?\s*[Nn]o\.?\s*([\d.\s]{8,16})',
        r'[Cc][\xE9e]dula\s*:\s*([\d.\s]{8,16})',
    ]
    for pat in patrones_ancla:
        m = re.search(pat, zona, re.IGNORECASE | re.DOTALL)
        if m:
            raw = re.sub(r'[\s.]', '', _normalizar_digitos_ocr(m.group(1).split()[0]))
            if raw.isdigit() and 7 <= len(raw) <= 11 and not any(raw.startswith(p) for p in _EXCL):
                return raw

    # Nivel 2: formato con puntos de miles (ej: 1.053.842.239)
    for m in re.finditer(r'\b\d{1,3}(?:\.\d{3}){2,3}\b', zona):
        raw = m.group().replace('.', '')
        if raw.isdigit() and 7 <= len(raw) <= 11 and not any(raw.startswith(p) for p in _EXCL):
            return raw

    # Nivel 3: secuencia compacta de dígitos con posibles confusiones OCR (oOlI)
    for m in re.finditer(r'\b([0-9oOlIsS]{9,11})\b', zona):
        raw = _normalizar_digitos_ocr(m.group(1))
        if raw.isdigit() and not any(raw.startswith(p) for p in _EXCL):
            return raw

    # Nivel 4: fallback sin restricción de zona (toma la primera ocurrencia posible)
    if solo_cabecera:
        return _extraer_cedula_de_texto(texto, solo_cabecera=False)

    return None


# ─── Páginas que deben ignorarse (no son formularios de nómina MineDax) ────────
# Clave: texto que identifica la página. Valor: mensaje descriptivo para el log.
_PAGINAS_IGNORAR = [
    # Adobe Acrobat Sign — página de auditoría al final de PDFs firmados digitalmente
    ('Adobe Acrobat Sign',                    'auditoría Adobe Acrobat Sign'),
    ('Final Audit Report',                    'auditoría Adobe Acrobat Sign'),
    ('Adobe Sign',                            'auditoría Adobe Sign'),
    ('Agreement completed',                   'auditoría Adobe Sign'),
    ('Document e-signed by',                  'auditoría Adobe Sign'),
    ('Transaction ID',                        'auditoría Adobe Sign'),
    # Certificados electorales (Colombia) y constancias de jurado de votación
    # Variantes sin acento porque OCR sobre fondo azul pierde tildes
    ('CERTIFICADO ELECTORAL',                 'certificado electoral'),
    ('CERTIFICADO ELECT',                     'certificado electoral'),
    ('REGISTRADUR',                           'certificado Registraduría'),
    ('Formulario E-18',                       'Formulario E-18 Registraduría'),
    ('FORMULARIO E-18',                       'Formulario E-18 Registraduría'),
    ('JURADO DE VOTACI',                      'constancia jurado de votación'),
    ('SoyJurado',                             'constancia jurado de votación'),
    ('Soy Jurado',                            'constancia jurado de votación'),
    ('prestó',                                 'constancia jurado de votación'),
    ('ELECCIONES DE SENADO',                  'certificado electoral'),
    ('ELECCIONES DE CONGRESO',                'certificado electoral'),
    ('ELECCIONES DE CAMARA',                  'certificado electoral'),
    ('Yo cuido tu voto',                      'certificado electoral'),
    ('YO CUIDO TU VOTO',                      'certificado electoral'),
]

def _es_pagina_ignorar(text: str) -> tuple:
    """
    Detecta si una página no es un formulario de nómina y debe saltarse en silencio.
    Compara en minúsculas para tolerar variaciones de OCR en mayúsculas/tildes.
    Retorna (True, motivo) si debe ignorarse, (False, '') si debe procesarse.
    """
    text_low = text.lower()
    for marcador, motivo in _PAGINAS_IGNORAR:
        if marcador.lower() in text_low:
            return True, motivo
    return False, ''

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


def corregir_digito_ocr(valor_str: str) -> Optional[int]:
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
    # Usa _extraer_cedula_de_texto que busca primero en la cabecera del formulario
    # (zona INFORMACION PERSONAL) para evitar tomar la CC del jefe o TH.
    data['cedula'] = _extraer_cedula_de_texto(tn, solo_cabecera=True)

    # ── Nombre ──────────────────────────────────────────────────────────────
    nombre_m = re.search(
        r'Nombre:\s*([A-Za-záéíóúñÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ\s]+?)'
        r'\s+C[eé]dula:',   # acepta "Cedula:" y "Cédula:"
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

    # ── Fechas del permiso: "Fecha Permiso: De: ... Hasta: ..." ────────────────
    # _parsear_fecha_robusta cubre: DD/MM/YYYY, DD-MM-YY, DD/NombreMes/26, etc.
    fechas_m = re.search(
        r'Fecha\s+Permiso:.*?De:\s*(.{3,28}?)\s*Hasta:\s*(.{3,28}?)(?:\n|Horas|$)',
        tn, re.IGNORECASE
    )
    if fechas_m:
        fi = _parsear_fecha_robusta(fechas_m.group(1))
        ff = _parsear_fecha_robusta(fechas_m.group(2))
        if fi:
            data['fecha_novedad'] = fi
            data['fecha_inicio']  = fi
            data['fecha_fin']     = ff or fi
    if not data['fecha_inicio']:
        # Fallback: buscar dos fechas en cualquier formato dentro del texto
        candidatas = []
        for m in re.finditer(
            r'\b(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}|\d{1,2}\s+\d{1,2}\s+20\d{2})\b',
            tn
        ):
            f = _parsear_fecha_robusta(m.group(1))
            if f and f not in candidatas and f >= '2025-01-01':
                candidatas.append(f)
        if candidatas:
            data['fecha_novedad'] = candidatas[0]
            data['fecha_inicio']  = candidatas[0]
            data['fecha_fin']     = candidatas[-1] if len(candidatas) > 1 else candidatas[0]

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
    # Acepta numero ('04 Horas'), texto ('dia y medio', 'Ocho'), o vacio.
    total_m = re.search(
        r'Total\s+de\s+D[ií]as:\s*(.{1,30}?)(?:\n|MOTIVO|SOLICITANTE|$)',
        tn, re.IGNORECASE
    )
    if total_m:
        raw_total = total_m.group(1).strip()
        num_m = re.search(r'0*([1-9]\d*(?:\.\d)?)', raw_total)
        if num_m:
            try:
                v = float(num_m.group(1))
                data['cantidad'] = int(v) if v == int(v) else v
            except ValueError:
                pass
        if not data['cantidad']:
            _dias_map = [
                (r'd.a\s+y\s+med', 1.5), (r'medio\s*d.a', 0.5), (r'un\s+d.a', 1),
                (r'\bdos\b', 2),    (r'\btres\b', 3),   (r'\bcuatro\b', 4),
                (r'\bcinco\b', 5),  (r'\bseis\b', 6),   (r'\bsiete\b', 7),
                (r'\bocho\b', 8),   (r'\bnueve\b', 9),  (r'\bdiez\b', 10),
            ]
            for _dp, _dv in _dias_map:
                if re.search(_dp, raw_total.lower()):
                    data['cantidad'] = _dv; break

    # ── Motivo ───────────────────────────────────────────────────────────────
    # El PDF no tiene checkboxes visibles en texto extraíble.
    # Inferimos por el orden en que aparecen los motivos:
    # El formulario lista: Estudio / Calamidad / Medico / Vacaciones (izquierda)
    #                      Compensatorio / Fuerza Mayor / Otra Causa (derecha)
    # Cuando hay dos motivos marcados, buscar cuál se menciona en observaciones.
    # Mapeamos a los códigos de concepto de MineDax.
    motivos_ord = [
        ('Dia de la Familia', 'DIA_FAMILIA'),
        ('Compensatorio', 'COMPENSATORIO'),
        ('Fuerza Mayor',  'FUERZA_MAYOR'),
        ('Calamidad',     'CALAMIDAD'),
        ('Medico',        'MEDICO'),
        ('Estudio',       'ESTUDIO'),
        ('Otra Causa',    'OTRA'),
        ('Vacaciones',    'VACACIONES'),
    ]
    motivo_detectado = None
    # Prioridad 1: marca 'X' explicita junto al keyword (texto nativo)
    for kw, cod in motivos_ord:
        if re.search(rf'{re.escape(kw)}\s+X\b', tn, re.IGNORECASE):
            motivo_detectado = cod
            break
    # Prioridad 2: solo en seccion OBSERVACIONES (al final del form) o Explicacion
    if not motivo_detectado:
        _obss = ''
        _obsm2 = re.search(r'OBSERVACIONES\s+(.+?)$', tn, re.IGNORECASE | re.DOTALL)
        if not _obsm2:
            _obsm2 = re.search(r'Explicacion:\s*(.+?)(?:\n|SOLICITANTE|JEFE|$)',
                               tn, re.IGNORECASE | re.DOTALL)
        if _obsm2: _obss = _obsm2.group(1).lower()
        if 'familia' in _obss or 'dia de la' in _obss:
            motivo_detectado = 'DIA_FAMILIA'
        elif 'clases' in _obss or 'universidad' in _obss:
            motivo_detectado = 'ESTUDIO'
        elif 'compensad' in _obss or 'compensatorio' in _obss or 'voto' in _obss:
            motivo_detectado = 'COMPENSATORIO'
        elif 'medico' in _obss or 'medico' in _obss or 'cita' in _obss:
            motivo_detectado = 'MEDICO'
        elif 'calamidad' in _obss or 'luto' in _obss:
            motivo_detectado = 'CALAMIDAD'
    # Prioridad 3: keyword en texto completo
    if not motivo_detectado:
        for kw, cod in motivos_ord:
            if kw.lower() in tn.lower(): motivo_detectado = cod; break
    data['motivo'] = motivo_detectado or 'COMPENSATORIO'

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
    # cantidad (Total de Dias) es opcional: el campo puede dejarse en blanco y
    # el controlador usa DIAS_TOTAL=1 para permisos de todos modos.

    data['success'] = len(data['errores']) == 0
    return data


# ─── Extractor de Permisos (CM-TH-FR-003, PDF imagen escaneada) ──────────────

def extraer_permiso_ocr(pdf_path, page_idx=0):
    data = {
        'tipo_novedad': 'PERMISO', 'tipo_archivo': 'pdf',
        'cedula': None, 'nombre': None, 'cargo': None, 'area': None,
        'fecha_novedad': None, 'fecha_inicio': None, 'fecha_fin': None,
        'hora_inicio': None, 'hora_fin': None, 'cantidad': None,
        'motivo': None, 'es_remunerado': False, 'observaciones': None,
        'fuente': pdf_path, 'procesado_en': datetime.now().isoformat(),
        'success': False, 'errores': []
    }
    if not HAS_OCR:
        data['errores'].append('pytesseract no instalado')
        return data

    def _digs(s): return ''.join(c for c in s if c.isdigit())

    def _dias_ocr(s):
        s2 = re.sub(r'onch', 'och', s.lower().strip())
        s2 = re.sub(r'einc', 'cinc', s2)
        _m = [
            (r'medio.d.a|d.a.y.med', 0.5), (r'un.d.a', 1),
            (r'\bdos\b', 2), (r'\btres\b', 3), (r'\bcuatro\b', 4),
            (r'\bcinco\b', 5), (r'\bseis\b', 6), (r'\bsiete\b', 7),
            (r'\bocho\b', 8), (r'\bnueve\b', 9), (r'\bdiez\b', 10),
        ]
        for p, v in _m:
            if re.search(p, s2): return v
        s3 = s2.replace('o','0').replace('s','5').replace('l','1')
        nm = re.search(r'\b(\d{1,2})\b', s3)
        if nm:
            v = int(nm.group(1))
            if 1 <= v <= 30: return v
        return None

    def _ocr_text(resolution, cfg='--oem 3 --psm 6'):
        """Extrae texto OCR de la página a la resolución indicada."""
        with pdfplumber.open(pdf_path) as _p:
            _img = _p.pages[page_idx].to_image(resolution=resolution).original
        return re.sub(r'[ \t|]+', ' ',
                      pytesseract.image_to_string(_img, lang=_LANG_OCR, config=cfg)).strip()

    try:
        # Pasada 1: 300 DPI — equilibrio calidad/velocidad
        tn = _ocr_text(300)
        _t4 = None  # pasada 400 DPI bajo demanda

        def _400():
            nonlocal _t4
            if _t4 is None:
                _t4 = _ocr_text(400, '--oem 3 --psm 4')
            return _t4

        # ── Nombre ──────────────────────────────────────────────────────────
        for _f in [tn, _400()]:
            if data['nombre']: break
            _nm = re.search(r'[Nn]ombre:\s*(.{3,60}?)\s*[Cc][eé]?dula', _f, re.IGNORECASE)
            if _nm:
                data['nombre'] = _limpiar_nombre_ocr(_nm.group(1))

        # ── Cédula — busca solo en cabecera (primer 45%) para no tomar CC del jefe ─
        for _f in [tn, _400()]:
            if data['cedula']: break
            data['cedula'] = _extraer_cedula_de_texto(_f, solo_cabecera=True)

        # ── Cargo / Área ──────────────────────────────────────────────────────
        _cg = re.search(r'[Cc]argo:\s*(.{3,55}?)\s*[Aa]rea', tn, re.IGNORECASE)
        if _cg: data['cargo'] = _limpiar_nombre_ocr(_cg.group(1)) or _cg.group(1).strip()
        _ar = re.search(r'[Aa]rea:\s*(.{2,35}?)(?:\s{2,}|\n|DATOS|$)', tn, re.IGNORECASE)
        if _ar:
            _at = [t for t in _ar.group(1).split()
                   if sum(1 for c in t if c.isalpha()) >= max(2, len(t)//2)]
            if _at: data['area'] = ' '.join(_at[:3])

        # ── Fechas — usa _parsear_fecha_robusta para manejar todos los formatos ──
        for _f in [tn, _400()]:
            if data['fecha_inicio']: break
            _fb = re.search(
                r'[Ff]echa\s+[Pp]ermiso.*?[Dd]e:\s*(.{3,30}?)\s*[Hh]asta:\s*(.{3,30}?)(?:\n|[Hh]oras|$)',
                _f, re.IGNORECASE
            )
            if _fb:
                _fi = _parsear_fecha_robusta(_fb.group(1))
                _ff = _parsear_fecha_robusta(_fb.group(2))
                if _fi:
                    data['fecha_inicio']  = _fi
                    data['fecha_novedad'] = _fi
                    data['fecha_fin']     = _ff or _fi
        # Fallback: cualquier par de fechas en el texto
        if not data['fecha_inicio']:
            _candidatas = []
            for _mf in re.finditer(r'\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b', tn):
                _f2 = _parsear_fecha_robusta(_mf.group())
                if _f2 and _f2 not in _candidatas and _f2 >= '2025-01-01':
                    _candidatas.append(_f2)
            if _candidatas:
                data['fecha_inicio']  = _candidatas[0]
                data['fecha_novedad'] = _candidatas[0]
                data['fecha_fin']     = _candidatas[-1]

        _hm = re.search(
            r'[Hh]oras:.*?[Dd]e:\s*([0-9]{1,2}:[0-9]{2}\s*(?:Am|Pm|AM|PM)?)'
            r'.*?[Hh]asta:\s*([0-9]{1,2}:[0-9]{2}\s*(?:Am|Pm|AM|PM)?)',
            tn, re.IGNORECASE
        )
        if _hm:
            data['hora_inicio'] = _hm.group(1).strip()
            data['hora_fin']    = _hm.group(2).strip()

        _tm = re.search(
            r'[Tt]otal\s+de\s+[Dd]ias:\s*([^\n]{1,28})',
            tn
        )
        if _tm:
            _rt = _tm.group(1).strip()
            _nm2 = re.search(r'0*([1-9]\d*(?:\.\d)?)', _rt)
            if _nm2:
                try:
                    v = float(_nm2.group(1))
                    data['cantidad'] = int(v) if v == int(v) else v
                except ValueError: pass
            if not data['cantidad']: data['cantidad'] = _dias_ocr(_rt)

        _mkw = [
            (r'[Dd]ia\s+de\s+la\s+[Ff]amilia', 'DIA_FAMILIA'),
            (r'[Cc]ompensator', 'COMPENSATORIO'), (r'[Ff]uerza [Mm]ayor', 'FUERZA_MAYOR'),
            (r'[Cc]alamidad', 'CALAMIDAD'), (r'[Mm][eé]dico', 'MEDICO'),
            (r'[Ee]studio', 'ESTUDIO'), (r'[Oo]tra [Cc]ausa', 'OTRA'),
        ]
        for _kp, _cod in _mkw:
            if re.search(rf'{_kp}.{{0,15}}[xXvV]', tn):
                data['motivo'] = _cod; break
        if not data['motivo']:
            _ex = re.search(r'[Ee]xplicacion:\s*(.+?)(?:\n|SOLICITANTE|$)',
                            tn, re.IGNORECASE | re.DOTALL)
            if _ex:
                _el = _ex.group(1).lower()
                if 'familia' in _el or 'dia de la' in _el: data['motivo'] = 'DIA_FAMILIA'
                elif 'compensad' in _el or 'compensatorio' in _el: data['motivo'] = 'COMPENSATORIO'
                elif 'estudio' in _el or 'clase' in _el: data['motivo'] = 'ESTUDIO'
                elif 'medico' in _el or 'cita' in _el: data['motivo'] = 'MEDICO'
                elif 'calamidad' in _el or 'luto' in _el: data['motivo'] = 'CALAMIDAD'
        if not data['motivo']: data['motivo'] = 'COMPENSATORIO'

        if re.search(r'\[[xXvV*]\]\s*[Rr]emunerado', tn):
            data['es_remunerado'] = True
        else:
            _pno  = tn.lower().find('no remunerado')
            _prem = tn.lower().find('remunerado')
            if _prem != -1: data['es_remunerado'] = (_pno == -1 or _prem < _pno)

        _obsm = re.search(r'OBSERVACIONES\s+(.+?)(?:\s*$)', tn, re.IGNORECASE | re.DOTALL)
        if _obsm:
            _obs = re.sub(r'\s+', ' ', _obsm.group(1)).strip()
            if len(_obs) > 5: data['observaciones'] = _obs[:500]

    except Exception as e:
        data['errores'].append(f'Error OCR permiso: {str(e)}')
        return data

    if not data['nombre']:
        _fnm = re.search(r'permiso\s+(.+?)\.pdf', os.path.basename(pdf_path), re.IGNORECASE)
        if _fnm: data['nombre'] = _fnm.group(1).strip()

    if not data['cedula']:    data['errores'].append('Cedula no detectada')
    if not data['nombre']:    data['errores'].append('Nombre no detectado')
    if not data['fecha_inicio']: data['errores'].append('Fecha de permiso no detectada')
    # cantidad opcional: el controlador usa DIAS_TOTAL=1 para permisos.

    data['success'] = len(data['errores']) == 0
    return data

# ─── Extractor de Vacaciones (CM-TH-SV-001, PDF imagen escaneada) ─────────────

def extraer_vacaciones_ocr(pdf_path: str, page_idx: int = 0) -> dict:
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

    # ── Configuración Tesseract ──────────────────────────────────────────────
    # PSM 6: asume bloque uniforme de texto — mejor para formularios tabulados.
    # PSM 4: asume columna de texto — alternativa para formularios de 2 columnas.
    _CFG_FORM  = '--oem 3 --psm 6'
    _CFG_COL   = '--oem 3 --psm 4'

    # ── Helper interno: extrae texto de imagen con preprocessing + Tesseract ──
    def _leer(pil_img, cfg=_CFG_FORM):
        return _ocr_img(_preprocesar_img(pil_img), config=cfg)

    # ── Helper interno: busca cédula delegando en _extraer_cedula_de_texto ──
    # La versión global ya maneja zona de cabecera, puntos de miles y confusiones OCR.
    def _buscar_cedula(texto):
        return _extraer_cedula_de_texto(texto, solo_cabecera=True)

    # ── Helper interno: busca nombre en un texto OCR dado ──────────────────
    def _buscar_nombre(texto):
        candidato = None
        # Patrón A: "Completos | NOMBRE APELLIDO"
        m = re.search(
            r'Completes?\s*\|?\s*([A-Za-záéíóúñÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ\s]{5,65}?)'
            r'(?=\s*(?:Cedula|Cédula|cedula)|\s*$)',
            texto, re.IGNORECASE
        )
        if m: candidato = m.group(1)
        # Patrón B: "Nombre y Apellidos ... NOMBRE"
        if not candidato:
            m = re.search(
                r'(?:Nombre|Apellidos).*?Completos?\s+([A-Za-záéíóúñÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ\s]{5,65}?)'
                r'(?=\s*(?:Cedula|Cédula))',
                texto, re.IGNORECASE
            )
            if m: candidato = m.group(1)
        # Patrón C (CamScanner): texto antes de "Cedula de Ciudadania"
        if not candidato:
            m = re.search(
                r'([A-Za-záéíóúñÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ]+(?:\s+[A-Za-záéíóúñÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ]+){1,4})'
                r'\s+(?:Cedula|Cédula)',
                texto, re.IGNORECASE
            )
            if m: candidato = m.group(1)
        # Filtrar con _limpiar_nombre_ocr para eliminar tokens del formulario
        return _limpiar_nombre_ocr(candidato) if candidato else None

    # ── Helper interno: busca par de fechas en múltiples formatos ─────────────
    def _buscar_fechas(texto):
        # Normalizar confusiones OCR de letra-dígito antes de buscar fechas
        texto = texto.replace('O','0').replace('o','0').replace('I','1').replace('l','1')
        # Formato 1: DD MM YYYY DD MM YYYY (año 4 dígitos)
        m = re.search(
            r'(\d{1,2})\s+(\d{1,2})\s+(20\d{2})\s+'
            r'(\d{1,2})\s+(\d{1,2})\s+(20\d{2})',
            texto
        )
        if m: return m
        # Formato 2: DD MM YY DD MM YY (año 2 dígitos, 20-35 → 2020-2035)
        m = re.search(
            r'(\d{1,2})\s+(\d{1,2})\s+(2[0-9])\s+'
            r'(\d{1,2})\s+(\d{1,2})\s+(2[0-9])(?!\d)',
            texto
        )
        if m:
            # Envolver para que groups() devuelva años de 4 dígitos
            class _FechasWrap:
                def __init__(self, inner):
                    g = list(inner.groups())
                    g[2] = '20' + g[2]; g[5] = '20' + g[5]
                    self._groups = tuple(g)
                def groups(self): return self._groups
            return _FechasWrap(m)
        return None

    try:
        # ── Pasada 1: 300 DPI + preprocesamiento (equilibrio calidad/velocidad) ──
        with pdfplumber.open(pdf_path) as pdf:
            pil_300 = pdf.pages[page_idx].to_image(resolution=300).original
        tn = _leer(pil_300, _CFG_FORM)

        data['cedula'] = _buscar_cedula(tn)
        data['nombre'] = _buscar_nombre(tn)
        fechas_m       = _buscar_fechas(tn)

        cargo_m = re.search(
            r'Carg[oe]\s+([A-Za-záéíóúñÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ\s,]{2,50}?)'
            r'(?=\s*(?:Periodo|Solicitado|$))',
            tn, re.IGNORECASE
        )
        if cargo_m:
            data['cargo'] = cargo_m.group(1).strip()

        # ── Pasada 2: 400 DPI + PSM 4 para campos que aún faltan ────────────
        # Cubre escaneos CamScanner de baja calidad donde 300 DPI no alcanza.
        if not data['cedula'] or not data['nombre'] or not fechas_m:
            with pdfplumber.open(pdf_path) as pdf:
                pil_400 = pdf.pages[page_idx].to_image(resolution=400).original
            tn_400 = _leer(pil_400, _CFG_COL)

            if not data['cedula']:
                data['cedula'] = _buscar_cedula(tn_400)
            if not data['nombre']:
                data['nombre'] = _buscar_nombre(tn_400)
            if not fechas_m:
                fechas_m = _buscar_fechas(tn_400)
            if not data['cargo']:
                cargo_400 = re.search(
                    r'Carg[oe]\s+([A-Za-záéíóúñÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ\s,]{2,50}?)'
                    r'(?=\s*(?:Periodo|Solicitado|$))',
                    tn_400, re.IGNORECASE
                )
                if cargo_400:
                    data['cargo'] = cargo_400.group(1).strip()

        # ── Pasada 3: normalizar confusiones l→1 y O→0 en texto completo y reintentar ─
        # Se usa _normalizar_digitos_texto (versión ligera) para no corromper nombres.
        if not fechas_m:
            fechas_m = _buscar_fechas(_normalizar_digitos_texto(tn))
        if not fechas_m and 'tn_400' in dir():
            fechas_m = _buscar_fechas(_normalizar_digitos_texto(tn_400))

        if fechas_m:
            d1, m1, y1, d2, m2, y2 = fechas_m.groups()
            try:
                fi = date(int(y1), int(m1), int(d1))
                ff = date(int(y2), int(m2), int(d2))
                data['fecha_inicio'] = fi.isoformat()
                data['fecha_fin']    = ff.isoformat()
            except ValueError:
                data['errores'].append('Fechas inválidas en el período solicitado')

        # ── Fallback fechas: formato DD/MM/YYYY o DD-MM-YYYY (formularios alternativos) ─
        if not data['fecha_inicio']:
            for _t_slash in [tn] + ([tn_400] if 'tn_400' in dir() else []):
                _sl = re.findall(r'(\d{1,2})[/-](\d{1,2})[/-](20\d{2})', _t_slash)
                if len(_sl) >= 2:
                    try:
                        _d1, _m1, _y1 = _sl[0]
                        _d2, _m2, _y2 = _sl[-1]
                        data['fecha_inicio'] = date(int(_y1), int(_m1), int(_d1)).isoformat()
                        data['fecha_fin']    = date(int(_y2), int(_m2), int(_d2)).isoformat()
                        break
                    except ValueError:
                        pass

        # ── Días disfrutados ─────────────────────────────────────────────────
        # Acepta dígitos y letras que OCR confunde (o→0, s/S→5, l/I→1).
        # Busca en ambos textos disponibles.
        _textos_dias = [tn] + ([tn_400] if 'tn_400' in dir() else [])
        for _t in _textos_dias:
            if data['cantidad']:
                break
            dias_m = re.search(
                r'disfrutados[:\s]*[\[\(]?\s*([0-9oOlIsS]{1,3})\s*[\]\)|]?',
                _t, re.IGNORECASE
            )
            if dias_m:
                raw_dias = _normalizar_digitos_ocr(dias_m.group(1))
                if raw_dias.isdigit():
                    cantidad = int(raw_dias)
                    if 1 <= cantidad <= 31:
                        data['cantidad'] = cantidad

        # Corrección OCR: 3↔9 y 1↔7 son confusiones frecuentes de Tesseract
        if data['cantidad'] and data['fecha_inicio'] and data['fecha_fin']:
            dias_reales = calcular_dias_laborables(data['fecha_inicio'], data['fecha_fin'])
            if data['cantidad'] == 3 and dias_reales == 9:
                data['cantidad'] = 9
            elif data['cantidad'] == 1 and dias_reales == 7:
                data['cantidad'] = 7

        # Fallback: calcular días laborables si OCR no extrajo el campo
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
    r"""
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

    # ── Fechas: "Periodo Solicitado" con encabezados DD MM AA ─────────────────
    def _intentar_par_fechas(txt):
        """Busca dos fechas consecutivas (inicio/fin) en múltiples formatos."""
        # Normalizar confusiones OCR de dígitos antes de buscar (l→1, I→1, O→0)
        txt = _normalizar_digitos_texto(txt)
        # Intento A: DD MM YYYY DD MM YYYY (con o sin encabezados DD MM AA)
        for pat in [
            r'(?:DD\s+MM\s+AA\s*){1,2}\s*(\d{1,2})\s+(\d{1,2})\s+(20\d{2})\s+(\d{1,2})\s+(\d{1,2})\s+(20\d{2})',
            r'(\d{1,2})\s+(\d{1,2})\s+(20\d{2})\s+(\d{1,2})\s+(\d{1,2})\s+(20\d{2})',
        ]:
            m = re.search(pat, txt, re.IGNORECASE)
            if m:
                try:
                    fi = date(int(m.group(3)), int(m.group(2)), int(m.group(1)))
                    ff = date(int(m.group(6)), int(m.group(5)), int(m.group(4)))
                    return fi.isoformat(), ff.isoformat()
                except ValueError:
                    pass
        # Intento B: año de 2 dígitos (26 → 2026)
        m = re.search(
            r'(\d{1,2})\s+(\d{1,2})\s+(2\d)\s+(\d{1,2})\s+(\d{1,2})\s+(2\d)',
            txt
        )
        if m:
            try:
                fi = date(2000 + int(m.group(3)), int(m.group(2)), int(m.group(1)))
                ff = date(2000 + int(m.group(6)), int(m.group(5)), int(m.group(4)))
                if 2020 <= fi.year <= 2035 and 2020 <= ff.year <= 2035:
                    return fi.isoformat(), ff.isoformat()
            except ValueError:
                pass
        # Intento C: formato DD/MM/YYYY o DD-MM-YY con separadores
        candidatas = []
        for raw in re.findall(r'\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}', txt):
            f = _parsear_fecha_robusta(raw)
            if f and f not in candidatas:
                candidatas.append(f)
        if len(candidatas) >= 2:
            return candidatas[0], candidatas[-1]
        return None, None

    fi, ff = _intentar_par_fechas(tn)
    if fi:
        data['fecha_inicio'] = fi
        data['fecha_fin']    = ff or fi

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


# ─── Extractores para PDFs generados por Power Automate (Word → PDF) ─────────
#
# Estos extractores se usan cuando el PDF contiene el marcador [FORMS] en el
# encabezado, lo que indica que fue generado automáticamente por Power Automate
# a partir de una plantilla Word con respuestas de Microsoft Forms.
# El formato es 100 % texto-nativo y determinístico: sin OCR, sin ambigüedad.

def _leer_bloque_forms(text: str) -> dict:
    """
    Lee el bloque de datos estructurado invisible que rellenar_pdf.py inserta
    en los PDFs generados. Formato:
        [FORMS]
        CAMPO: valor
        CAMPO2: valor2
        ...
    Retorna un dict con los pares clave→valor (claves en minúsculas).
    """
    bloque = {}
    en_bloque = False
    for linea in text.splitlines():
        linea = linea.strip()
        if linea == '[FORMS]':
            en_bloque = True
            continue
        if en_bloque and ':' in linea:
            clave, _, valor = linea.partition(':')
            bloque[clave.strip().lower()] = valor.strip()
    return bloque


def extraer_formulario_generado_permiso(text: str, pdf_path: str) -> dict:
    """
    Extrae datos de permiso (CM-TH-FR-003) desde PDF generado por rellenar_pdf.py.

    ESTRATEGIA PRINCIPAL — bloque [FORMS]:
        rellenar_pdf.py incrusta un bloque de datos estructurado invisible al final
        de cada PDF que genera.  Ese bloque es 100 % determinístico y no depende
        de la posición visual del texto, por lo que es siempre preferible al regex.

        Formato del bloque:
            [FORMS]
            NOMBRE: CALLE PALMETT JUAN ESTEBAN
            CEDULA: 1034986488
            FECHA_DESDE: 12/05/2026
            FECHA_HASTA: 21/05/2026
            HORA_INICIO: 08:00
            HORA_FIN: 17:00
            TOTAL_DIAS: 1
            MOTIVO: Calamidad Domestica
            TIPO_PERMISO: Remunerado
            EXPLICACION: ...
            OBSERVACIONES: ...

    FALLBACK — regex sobre texto visible:
        Solo se usa cuando el bloque [FORMS] no está presente o está vacío
        (p. ej. PDFs escaneados o de versiones anteriores del sistema).
    """
    data = {
        'tipo_novedad':      'PERMISO',
        'tipo_archivo':      'pdf',
        'cedula':            None,
        'nombre':            None,
        'cargo':             None,
        'area':              None,
        'fecha_novedad':     None,
        'fecha_inicio':      None,
        'fecha_fin':         None,
        'hora_inicio':       None,
        'hora_fin':          None,
        'cantidad':          None,
        'motivo':            None,
        'cod_conc':          None,   # COD_CONC explícito embebido en bloque [FORMS]
        'es_remunerado':     False,
        'observaciones':     None,
        'email_solicitante': None,
        'fuente':            pdf_path,
        'procesado_en':      datetime.now().isoformat(),
        'success':           False,
        'errores':           []
    }

    _MOTIVO_MAP = [
        ('dia de la familia', 'DIA_FAMILIA'),
        ('familia',           'DIA_FAMILIA'),
        ('compensatorio',     'COMPENSATORIO'),
        ('compensatorio',     'COMPENSATORIO'),
        ('fuerza mayor',      'FUERZA_MAYOR'),
        ('calamidad',         'CALAMIDAD'),
        ('medico',            'MEDICO'),
        ('médico',            'MEDICO'),
        ('estudio',           'ESTUDIO'),
        ('otra causa',        'OTRA'),
        ('vacaciones',        'VACACIONES'),
    ]

    def _mapear_motivo(raw: str) -> str:
        r = raw.strip().lower()
        for kw, cod in _MOTIVO_MAP:
            if kw in r:
                return cod
        return raw.strip().upper()[:20] or 'COMPENSATORIO'

    # ══════════════════════════════════════════════════════════════════════════
    #  RUTA 1: bloque [FORMS] — lectura directa, sin regex ni ambigüedades
    # ══════════════════════════════════════════════════════════════════════════
    bloque = _leer_bloque_forms(text)

    if bloque:
        # Campos de identidad
        data['nombre'] = bloque.get('nombre') or None
        data['cedula'] = bloque.get('cedula') or None
        data['cargo']  = bloque.get('cargo')  or None
        data['area']   = bloque.get('area')   or None

        # Fechas — guardadas en DD/MM/YYYY por rellenar_pdf.py
        fi = parse_fecha_ddmmyyyy(bloque.get('fecha_desde', ''))
        ff = parse_fecha_ddmmyyyy(bloque.get('fecha_hasta', ''))
        data['fecha_novedad'] = fi
        data['fecha_inicio']  = fi
        data['fecha_fin']     = ff

        # Horas (opcionales — pueden estar vacías si el usuario no las ingresó)
        hi = (bloque.get('hora_inicio') or '').strip()
        hf = (bloque.get('hora_fin')    or '').strip()
        if hi: data['hora_inicio'] = hi
        if hf: data['hora_fin']    = hf

        # Total días
        td_raw = (bloque.get('total_dias') or '').strip()
        if td_raw:
            try:
                v = float(td_raw.replace(',', '.'))
                data['cantidad'] = int(v) if v == int(v) else v
            except ValueError:
                pass

        # Motivo
        data['motivo'] = _mapear_motivo(bloque.get('motivo', '')) or 'COMPENSATORIO'

        # Tipo permiso
        tp = (bloque.get('tipo_permiso') or '').lower()
        data['es_remunerado'] = ('remunerado' in tp) and ('no remunerado' not in tp)

        # Observaciones — combinar explicacion + observaciones del bloque
        obs_parts = []
        expl = (bloque.get('explicacion')   or '').strip()
        obs  = (bloque.get('observaciones') or '').strip()
        if expl: obs_parts.append(f'E: {expl}')
        if obs:  obs_parts.append(f'O: {obs}')
        if obs_parts:
            data['observaciones'] = ' | '.join(obs_parts)[:500]

        # COD_CONC embebido — evita la heurística de resolverCodConcPermiso en el controller
        cc_raw = (bloque.get('cod_conc') or '').strip()
        if cc_raw.isdigit():
            data['cod_conc'] = int(cc_raw)

    else:
        # ══════════════════════════════════════════════════════════════════════
        #  RUTA 2: regex sobre texto visible (fallback para PDFs sin bloque)
        # ══════════════════════════════════════════════════════════════════════
        tn = normalizar(text)

        nombre_m = re.search(
            r'Nombre:\s*([A-Za-záéíóúñÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ\s]{3,60}?)'
            r'(?=\s+C[eé]dula:|\s*$)',
            tn, re.IGNORECASE
        )
        if nombre_m:
            data['nombre'] = nombre_m.group(1).strip()

        cedula_m = re.search(r'C[eé]dula:\s*(\d{7,11})', tn, re.IGNORECASE)
        if cedula_m:
            data['cedula'] = cedula_m.group(1).strip()

        cargo_m = re.search(
            r'Cargo:\s*([A-Za-záéíóúñÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ\s,]{2,60}?)'
            r'(?=\s+[AÁ]rea:|\s*$)',
            tn, re.IGNORECASE
        )
        if cargo_m:
            data['cargo'] = cargo_m.group(1).strip()

        area_m = re.search(
            r'[AÁ]rea:\s*([A-Za-záéíóúñÁÉÍÓÚÑ0-9][A-Za-záéíóúñÁÉÍÓÚÑ0-9\s,\-]{1,50}?)'
            r'(?=\s+(?:DATOS|Fecha|$))',
            tn, re.IGNORECASE
        )
        if area_m:
            data['area'] = area_m.group(1).strip()

        fechas_m = re.search(
            r'Fecha\s+Permiso:.*?De:\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})'
            r'.*?Hasta:\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})',
            tn, re.IGNORECASE
        )
        if fechas_m:
            fi = parse_fecha_ddmmyyyy(fechas_m.group(1))
            ff = parse_fecha_ddmmyyyy(fechas_m.group(2))
            data['fecha_novedad'] = fi
            data['fecha_inicio']  = fi
            data['fecha_fin']     = ff

        horas_m = re.search(
            r'Horas:.*?De:\s*(\d{1,2}:\d{2}(?:\s*(?:AM|PM|am|pm))?)'
            r'.*?Hasta:\s*(\d{1,2}:\d{2}(?:\s*(?:AM|PM|am|pm))?)',
            tn, re.IGNORECASE
        )
        if horas_m:
            data['hora_inicio'] = horas_m.group(1).strip()
            data['hora_fin']    = horas_m.group(2).strip()

        total_m = re.search(r'Total\s+de\s+D[ií]as:\s*(\d+(?:[.,]\d)?)', tn, re.IGNORECASE)
        if total_m:
            try:
                v = float(total_m.group(1).replace(',', '.'))
                data['cantidad'] = int(v) if v == int(v) else v
            except ValueError:
                pass

        tipo_m = re.search(r'\bTipo:\s*([^\n\r]{2,40})', tn, re.IGNORECASE)
        data['motivo'] = _mapear_motivo(tipo_m.group(1) if tipo_m else '') or 'COMPENSATORIO'

        tipo_perm_m = re.search(r'TIPO\s+PERMISO:\s*([^\n\r]{2,30})', tn, re.IGNORECASE)
        if tipo_perm_m:
            tp = tipo_perm_m.group(1).strip().lower()
            data['es_remunerado'] = ('remunerado' in tp) and ('no remunerado' not in tp)

        obs_m = re.search(r'OBSERVACIONES?:\s*([^\n]{5,500})', tn, re.IGNORECASE)
        if obs_m:
            data['observaciones'] = obs_m.group(1).strip()

        email_m = re.search(
            r'(?:Correo|Email|E-mail)[^:]*:\s*([\w.+-]+@[\w-]+\.[a-z]{2,})',
            tn, re.IGNORECASE
        )
        if email_m:
            data['email_solicitante'] = email_m.group(1).strip()

    # ── Validaciones ─────────────────────────────────────────────────────────────
    if not data['cedula']:       data['errores'].append('Cédula no detectada')
    if not data['nombre']:       data['errores'].append('Nombre no detectado')
    if not data['fecha_inicio']: data['errores'].append('Fecha de permiso no detectada')

    data['success'] = len(data['errores']) == 0
    return data


def extraer_formulario_generado_vacaciones(text: str, pdf_path: str) -> dict:
    """
    Extrae datos de vacaciones (CM-TH-SV-001) desde PDF generado por Power Automate.
    El marcador [FORMS] en el encabezado identifica este tipo.
    Todos los campos son texto nativo → extracción 100 % fiable.
    """
    data = {
        'tipo_novedad':      'VACACIONES',
        'tipo_archivo':      'pdf',
        'cedula':            None,
        'nombre':            None,
        'cargo':             None,
        'area':              None,
        'fecha_inicio':      None,
        'fecha_fin':         None,
        'cantidad':          None,
        'observaciones':     None,
        'email_solicitante': None,
        'fuente':            pdf_path,
        'procesado_en':      datetime.now().isoformat(),
        'success':           False,
        'errores':           []
    }

    tn = normalizar(text)

    # ── Nombre ───────────────────────────────────────────────────────────────────
    # Plantilla: "Nombre y Apellidos Completos: Juan Pérez García"
    nombre_m = re.search(
        r'Nombre\s+y\s+Apellidos\s+Completos:\s*'
        r'([A-Za-záéíóúñÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ\s]{3,60}?)'
        r'(?=\s+C[eé]dula|\s*$)',
        tn, re.IGNORECASE
    )
    if nombre_m:
        data['nombre'] = nombre_m.group(1).strip()

    # ── Cédula ───────────────────────────────────────────────────────────────────
    # Plantilla: "Cédula de Ciudadanía No.: 1234567890"
    ced_m = re.search(
        r'C[eé]dula.*?No\.?:\s*(\d{7,11})',
        tn, re.IGNORECASE
    )
    if ced_m:
        data['cedula'] = ced_m.group(1).strip()

    # ── Cargo ─────────────────────────────────────────────────────────────────────
    cargo_m = re.search(
        r'\bCargo:\s*([A-Za-záéíóúñÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ\s,]{2,60}?)'
        r'(?=\s+(?:Per[ií]odo|DESDE|Correo|Email|$))',
        tn, re.IGNORECASE
    )
    if cargo_m:
        data['cargo'] = cargo_m.group(1).strip()

    # ── Fechas: "DESDE: 01/06/2026    HASTA: 15/06/2026" ────────────────────────
    fechas_m = re.search(
        r'DESDE:\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})'
        r'.*?HASTA:\s*(\d{1,2}[/-]\d{1,2}[/-]\d{4})',
        tn, re.IGNORECASE
    )
    if fechas_m:
        data['fecha_inicio'] = parse_fecha_ddmmyyyy(fechas_m.group(1))
        data['fecha_fin']    = parse_fecha_ddmmyyyy(fechas_m.group(2))
    else:
        # Fallback: cualquier par de fechas DD/MM/YYYY en el texto
        all_dates = re.findall(r'\d{1,2}[/-]\d{1,2}[/-]\d{4}', tn)
        if len(all_dates) >= 2:
            data['fecha_inicio'] = parse_fecha_ddmmyyyy(all_dates[0])
            data['fecha_fin']    = parse_fecha_ddmmyyyy(all_dates[-1])

    # ── Días disfrutados ─────────────────────────────────────────────────────────
    dias_m = re.search(
        r'D[ií]as\s+de\s+Vacaciones\s+disfrutados:\s*(\d{1,3})',
        tn, re.IGNORECASE
    )
    if dias_m:
        try:
            v = int(dias_m.group(1))
            if 1 <= v <= 90:
                data['cantidad'] = v
        except ValueError:
            pass

    if not data['cantidad'] and data['fecha_inicio'] and data['fecha_fin']:
        data['cantidad'] = calcular_dias_laborables(data['fecha_inicio'], data['fecha_fin'])

    # ── Observaciones ─────────────────────────────────────────────────────────────
    obs_m = re.search(r'Observaciones:\s*([^\n]{5,500})', tn, re.IGNORECASE)
    if obs_m:
        data['observaciones'] = obs_m.group(1).strip()

    # ── Email solicitante ────────────────────────────────────────────────────────
    email_m = re.search(
        r'(?:Correo|Email|E-mail)[^:]*:\s*([\w.+-]+@[\w-]+\.[a-z]{2,})',
        tn, re.IGNORECASE
    )
    if email_m:
        data['email_solicitante'] = email_m.group(1).strip()

    # ── Validaciones ─────────────────────────────────────────────────────────────
    if not data['cedula']:       data['errores'].append('Cédula no detectada')
    if not data['nombre']:       data['errores'].append('Nombre no detectado')
    if not data['fecha_inicio']: data['errores'].append('Fecha inicio no detectada')
    if not data['fecha_fin']:    data['errores'].append('Fecha fin no detectada')
    if not data['cantidad']:     data['errores'].append('Días de vacaciones no detectados')

    data['success'] = len(data['errores']) == 0
    return data


# ─── Detector de tipo de formulario ──────────────────────────────────────────

def _detectar_tipo(pdf_path: str):
    """
    Devuelve ('permiso'|'vacaciones'|None) detectando el tipo de formulario
    a partir de la página 0 (texto nativo + OCR rápido si es imagen).
    También devuelve (es_imagen_0, text_0, es_forms).

    es_forms=True indica que el PDF fue generado por Power Automate a partir
    de una plantilla Word con respuestas de Microsoft Forms (marcador [FORMS]).
    """
    with pdfplumber.open(pdf_path) as pdf:
        page0     = pdf.pages[0]
        text0     = page0.extract_text() or ''
        es_imagen = len(page0.chars) == 0 and len(page0.images) > 0

    upper = text0.upper()

    # ── Detectar PDFs generados por Power Automate (plantilla Word + [FORMS]) ──
    es_forms = '[FORMS]' in text0

    es_permiso    = 'CM-TH-FR-003' in text0 or (
        'FORMATO SOLICITUD DE PERMISO' in upper and 'DATOS DE PERMISO' in upper
    )
    es_vacaciones = 'CM-TH-SV-001' in text0 or 'SOLICITUD DE VACACIONES' in upper

    if not es_permiso and not es_vacaciones:
        nb = os.path.basename(pdf_path).lower()
        es_permiso    = 'permiso' in nb or 'fr-003' in nb or 'familia' in nb
        es_vacaciones = 'vacacion' in nb or 'sv-001' in nb

    if not es_permiso and not es_vacaciones and es_imagen and HAS_OCR:
        try:
            with pdfplumber.open(pdf_path) as _pdf:
                _hdr_img = _pdf.pages[0].to_image(resolution=150).original
            _hdr_txt = pytesseract.image_to_string(_hdr_img, lang='eng').upper()
            if 'FR-003' in _hdr_txt or 'SOLICITUD DE PERMISO' in _hdr_txt or 'FAMILIA' in _hdr_txt:
                es_permiso = True
            elif 'SV-001' in _hdr_txt or 'SOLICITUD DE VACACIONES' in _hdr_txt:
                es_vacaciones = True
        except Exception:
            pass

    tipo = 'permiso' if es_permiso else ('vacaciones' if es_vacaciones else None)
    return tipo, es_imagen, text0, es_forms


def _procesar_pagina(pdf_path: str, page_idx: int, tipo: str,
                     es_forms: bool = False) -> dict:
    """
    Extrae datos de una página concreta según el tipo de formulario.

    es_forms=True → usar extractor determinístico para PDFs generados por
    Power Automate (plantilla Word + Microsoft Forms). Prioridad máxima:
    texto nativo, sin OCR, sin ambigüedades.

    Retorna {'skip': True} para páginas que deben ignorarse silenciosamente
    (audit trail de Adobe Sign, certificados electorales, constancias de jurado).
    """
    with pdfplumber.open(pdf_path) as pdf:
        page    = pdf.pages[page_idx]
        text    = page.extract_text() or ''
        es_img  = len(page.chars) == 0 and len(page.images) > 0

    # ── Detectar páginas que no son formularios de nómina ──────────────────────
    ignorar, motivo_ignorar = _es_pagina_ignorar(text)
    if ignorar:
        return {
            'success': False,
            'skip':    True,
            'error':   f'Página {page_idx + 1} ignorada ({motivo_ignorar})',
            'tipo_archivo': 'pdf',
        }

    # Si es imagen y no tenemos texto, intentar OCR rápido para detectar tipo no-formulario
    if es_img and HAS_OCR and not text.strip():
        try:
            with pdfplumber.open(pdf_path) as _p:
                _mini = _p.pages[page_idx].to_image(resolution=200).original
            _txt_mini = pytesseract.image_to_string(_mini, lang='eng')
            ignorar2, motivo2 = _es_pagina_ignorar(_txt_mini)
            if ignorar2:
                return {
                    'success': False,
                    'skip':    True,
                    'error':   f'Página {page_idx + 1} ignorada ({motivo2})',
                    'tipo_archivo': 'pdf',
                }
        except Exception:
            pass

    try:
        # ── Ruta 1: PDF generado por Power Automate (marcador [FORMS]) ──────────
        # Máxima confiabilidad — todos los campos son texto plano estructurado.
        if es_forms and text.strip():
            if tipo == 'permiso':
                return extraer_formulario_generado_permiso(text, pdf_path)
            else:
                return extraer_formulario_generado_vacaciones(text, pdf_path)

        # ── Ruta 2: PDF original (escaneado o nativo) ───────────────────────────
        if tipo == 'permiso':
            if es_img or not text.strip():
                if not HAS_OCR:
                    return {'success': False,
                            'error': 'pytesseract no instalado para PDFs escaneados'}
                result = extraer_permiso_ocr(pdf_path, page_idx=page_idx)
                # Indicar explícitamente si parece manuscrito
                if not result.get('success') and not result.get('cedula'):
                    result.setdefault('error',
                        'Cédula no detectada. '
                        'Si el documento es manuscrito, el OCR no puede leerlo — '
                        'registre manualmente.')
                return result
            return extraer_permiso(text, pdf_path)
        else:  # vacaciones
            if not es_img and len(text.strip()) > 50:
                return extraer_vacaciones_texto(text, pdf_path)
            if not HAS_OCR:
                return {'success': False,
                        'error': 'pytesseract no instalado para PDFs escaneados'}
            result = extraer_vacaciones_ocr(pdf_path, page_idx=page_idx)
            if not result.get('success') and not result.get('cedula'):
                result.setdefault('error',
                    'Cédula no detectada. '
                    'Si el documento es manuscrito, el OCR no puede leerlo — '
                    'registre manualmente.')
            return result
    except Exception as e:
        return {'success': False, 'error': f'Error procesando página {page_idx + 1}: {str(e)}'}


def procesar_pdf(pdf_path: str) -> list:
    """
    Detecta el tipo de formulario y extrae datos de TODAS las páginas.
    Devuelve siempre una lista (un elemento por página/empleado).
    Soporta texto nativo e imágenes escaneadas (OCR con Tesseract).
    """
    if not HAS_PDFPLUMBER:
        return [{'success': False, 'error': 'pdfplumber no instalado (pip install pdfplumber)'}]

    if not os.path.isfile(pdf_path):
        return [{'success': False, 'error': f'Archivo no encontrado: {pdf_path}'}]

    try:
        tipo, _, _, es_forms = _detectar_tipo(pdf_path)

        if tipo is None:
            with pdfplumber.open(pdf_path) as pdf:
                text_muestra = (pdf.pages[0].extract_text() or '')[:200]
            return [{
                'success': False,
                'error': (
                    'Formulario PDF no reconocido. '
                    'Use CM-TH-FR-003 (Permiso) o CM-TH-SV-001 (Vacaciones). '
                    f'Texto extraído: {text_muestra!r}'
                )
            }]

        with pdfplumber.open(pdf_path) as pdf:
            n_pages = len(pdf.pages)

        return [_procesar_pagina(pdf_path, i, tipo, es_forms) for i in range(n_pages)]

    except Exception as e:
        return [{'success': False, 'error': f'Error procesando PDF: {str(e)}'}]


# ─── Main ───────────────────────────────────────────────────────────────────────

def main():
    if len(sys.argv) < 2:
        print(json.dumps([{
            'success': False,
            'error': 'Uso: python3 procesar_pdf.py <ruta_pdf>'
        }], ensure_ascii=False))
        sys.exit(0)

    pdf_path = sys.argv[1]
    results = procesar_pdf(pdf_path)   # siempre devuelve lista
    print(json.dumps(results, ensure_ascii=False, default=str))


if __name__ == '__main__':
    main()
