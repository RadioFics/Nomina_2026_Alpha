#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
procesar_pdf.py  —  Extractor de PDFs de Novedades  (versión 2.0 simplificada)
===============================================================================
Extrae únicamente los campos mínimos necesarios para importar en la BD:
    tipo_novedad  |  nombre  |  cedula  |  fecha_inicio  |  fecha_fin  |  cantidad

Eliminado vs v1: cargo, area, hora_inicio, hora_fin, motivo, es_remunerado,
                 observaciones, email_solicitante, tipo_archivo, fuente,
                 procesado_en, cod_conc, fecha_novedad.

Formularios soportados:
  CM-TH-FR-003  Solicitud de Permiso     → tipo_novedad = 'PERMISO'
  CM-TH-SV-001  Solicitud de Vacaciones  → tipo_novedad = 'VACACIONES'
  [FORMS]       PDF generado por Power Automate (texto estructurado, máxima fiabilidad)

Invocado por importarPDFController.js vía spawn:
    python procesar_pdf.py <ruta_pdf>

Devuelve una lista JSON (un elemento por página/empleado) a stdout.
"""

import sys, os, re, json, platform, shutil
from datetime import date, timedelta
from typing import Optional, Tuple

# ─── Dependencias opcionales ───────────────────────────────────────────────────

try:
    import pdfplumber
    HAS_PDFPLUMBER = True
except ImportError:
    HAS_PDFPLUMBER = False

try:
    import pytesseract
    from PIL import Image

    # Localizar Tesseract en Windows si no está en PATH
    if platform.system() == 'Windows' and not shutil.which('tesseract'):
        for _ruta in [r'C:\Program Files\Tesseract-OCR\tesseract.exe',
                      r'C:\Program Files (x86)\Tesseract-OCR\tesseract.exe']:
            if os.path.isfile(_ruta):
                pytesseract.pytesseract.tesseract_cmd = _ruta
                break

    try:
        _langs = pytesseract.get_languages(config='')
        _LANG = 'spa+eng' if 'spa' in _langs else 'eng'
    except Exception:
        _LANG = 'eng'

    HAS_OCR = True
except ImportError:
    HAS_OCR = False
    _LANG = 'eng'


# ══════════════════════════════════════════════════════════════════════════════
#  UTILIDADES DE TEXTO Y NORMALIZACIÓN
# ══════════════════════════════════════════════════════════════════════════════

def _solo_digitos(s: str) -> str:
    """Sustituye confusiones OCR solo en cadenas puramente numéricas (cédulas)."""
    return s.replace('l','1').replace('I','1').replace('i','1') \
            .replace('O','0').replace('o','0').replace('S','5').replace('s','5')

def _normalizar(s: str) -> str:
    """Colapsa espacios y tabulaciones repetidas."""
    return re.sub(r'[ \t]+', ' ', s or '').strip()

# Tokens del formulario que nunca son parte de un nombre de empleado
_TOKENS_FORM = {
    'nombre','cedula','cargo','area','fecha','solicitante','completos',
    'ciudadania','apellidos','collective','mining','talento','humano',
    'jefe','inmediato','formato','solicitud','permiso','vacaciones',
    'version','codigo','creacion','informacion','personal','datos',
    'motivo','tipo','remunerado','de','la','el','los','las','y','con',
    'no','un','una', 'por', 'que',
}

def _limpiar_nombre(texto: str) -> Optional[str]:
    """Filtra tokens del formulario del resultado OCR de un campo nombre."""
    if not texto:
        return None
    tokens = []
    for tok in texto.split():
        tok_l = re.sub(r'[^A-Za-záéíóúñÁÉÍÓÚÑüÜ]', '', tok)
        if len(tok_l) < 2 or tok_l.lower() in _TOKENS_FORM:
            continue
        tokens.append(tok_l.capitalize())
    if len(tokens) < 2:
        return None
    return ' '.join(tokens[:6])


# ══════════════════════════════════════════════════════════════════════════════
#  EXTRACCIÓN DE CÉDULA
# ══════════════════════════════════════════════════════════════════════════════

# Prefijos que identifican años/códigos, no cédulas
_EXCL_PREFIJOS = ('0108','2022','2023','2024','2025','2026','2027','2028')

def _extraer_cedula(texto: str, cabecera_solo: bool = True) -> Optional[str]:
    """
    Extrae la cédula del solicitante.
    cabecera_solo=True limita la búsqueda al primer 45% del texto para
    no tomar la cédula del jefe inmediato o de Talento Humano en las firmas.
    """
    zona = texto[:int(len(texto) * 0.45)] if cabecera_solo else texto

    # Nivel 1: patrón completo con "Ciudadanía No."
    for pat in [
        r'[Cc][\xe9e]dula.*?[Cc]iudadan[\xedi ]a.*?[Nn]o\.?\s*([\d.\s]{8,16})',
        r'[Cc]\.?\s*[Cc]\.?\s*[Nn]o\.?\s*([\d.\s]{8,16})',
        r'[Cc][\xe9e]dula\s*:\s*([\d.\s]{8,16})',
    ]:
        m = re.search(pat, zona, re.IGNORECASE | re.DOTALL)
        if m:
            raw = re.sub(r'[\s.]', '', _solo_digitos(m.group(1).split()[0]))
            if raw.isdigit() and 7 <= len(raw) <= 11 \
               and not any(raw.startswith(p) for p in _EXCL_PREFIJOS):
                return raw

    # Nivel 2: formato con puntos de miles  1.053.842.239
    for m in re.finditer(r'\b\d{1,3}(?:\.\d{3}){2,3}\b', zona):
        raw = m.group().replace('.', '')
        if raw.isdigit() and 7 <= len(raw) <= 11 \
           and not any(raw.startswith(p) for p in _EXCL_PREFIJOS):
            return raw

    # Nivel 3: secuencia compacta de 9-11 dígitos
    for m in re.finditer(r'\b([0-9oOlIsS]{9,11})\b', zona):
        raw = _solo_digitos(m.group(1))
        if raw.isdigit() and not any(raw.startswith(p) for p in _EXCL_PREFIJOS):
            return raw

    # Nivel 4: fallback sin restricción de zona
    if cabecera_solo:
        return _extraer_cedula(texto, cabecera_solo=False)
    return None


# ══════════════════════════════════════════════════════════════════════════════
#  PARSEO DE FECHAS
# ══════════════════════════════════════════════════════════════════════════════

_MESES = {
    'enero':1,'ene':1,'jan':1,'january':1,
    'febrero':2,'feb':2,'february':2,
    'marzo':3,'mar':3,'march':3,
    'abril':4,'abr':4,'april':4,
    'mayo':5,'may':5,
    'junio':6,'jun':6,'june':6,
    'julio':7,'jul':7,'july':7,
    'agosto':8,'ago':8,'august':8,
    'septiembre':9,'sep':9,'september':9,'sept':9,
    'octubre':10,'oct':10,'october':10,
    'noviembre':11,'nov':11,'november':11,
    'diciembre':12,'dic':12,'december':12,
}

def _mes_num(s: str) -> Optional[int]:
    """Convierte nombre o abreviación de mes a número 1-12."""
    c = re.sub(r'[áéíóú]', lambda m: {'á':'a','é':'e','í':'i','ó':'o','ú':'u'}[m.group()],
               (s or '').lower().strip())
    return _MESES.get(c) or _MESES.get(c[:3] if len(c) >= 3 else c)

def _validar_fecha(d, m, y_s) -> Optional[str]:
    """Valida componentes de fecha y devuelve 'YYYY-MM-DD' o None."""
    try:
        y = int('20' + str(y_s)) if len(str(y_s)) <= 2 else int(y_s)
        dt = date(y, int(m), int(d))
        if 2020 <= y <= 2035:
            return dt.isoformat()
    except (ValueError, TypeError):
        pass
    return None

def _parsear_fecha(s: str) -> Optional[str]:
    """
    Parsea una fecha en múltiples formatos → 'YYYY-MM-DD'.
    Acepta: DD/MM/YYYY, DD-MM-YYYY, DD MM YYYY, DD/NomMes/YYYY, años de 2 dígitos.
    Tolerante a confusiones OCR de dígitos (O→0, l→1).
    """
    if not s:
        return None
    s = s.strip()
    sn = s.replace('O','0').replace('l','1').replace('I','1')

    # Patrón A: numérico con separadores / - . | espacio
    m = re.match(r'^(\d{1,2})\s*[\/\-\.\|]\s*(\d{1,2})\s*[\/\-\.\|]\s*(\d{2,4})$', sn)
    if m:
        r = _validar_fecha(m.group(1), m.group(2), m.group(3))
        if r: return r

    # Patrón B: DD NombreMes YYYY
    m = re.match(r'^(\d{1,2})\s*[\/\-\s]\s*([A-Za-záéíóú]{2,12})\s*[\/\-\s]\s*(\d{2,4})$',
                 sn, re.IGNORECASE)
    if m:
        mo = _mes_num(m.group(2))
        if mo:
            r = _validar_fecha(m.group(1), mo, m.group(3))
            if r: return r

    # Patrón C: buscar dentro de cadena con ruido OCR
    for pat in [r'(\d{1,2})[\/\-\.](\d{1,2})[\/\-\.](\d{2,4})',
                r'(\d{1,2})\s+(\d{1,2})\s+(20\d{2})']:
        mt = re.search(pat, sn)
        if mt:
            r = _validar_fecha(mt.group(1), mt.group(2), mt.group(3))
            if r: return r

    return None


# ── Fechas en tabla de vacaciones (formato especial OCR) ───────────────────────

def _fix_year_ocr(m_obj) -> str:
    """
    Corrige años malformados por OCR en tablas escaneadas.
    Caso típico: 2026 → 2268 (confusión de dígitos adyacentes a bordes de celda).
    Estrategia: si no es año válido (2020-2035), reconstruir como '20' + últimos 2 dígitos.
    """
    v = m_obj.group()
    try:
        n = int(v)
    except ValueError:
        return v
    if 2020 <= n <= 2035:
        return v  # ya correcto
    if len(v) == 4 and v[0] == '2':
        candidate = '20' + v[2:]
        try:
            if 2020 <= int(candidate) <= 2035:
                return candidate
        except ValueError:
            pass
    return v

def _parsear_tabla_vacaciones(texto: str) -> Tuple[Optional[str], Optional[str]]:
    """
    Extrae el par de fechas de la tabla 'Periodo Solicitado' del CM-TH-SV-001.

    Problemática de OCR en tablas escaneadas:
      • Los separadores de celda | aparecen en el texto → se reemplazan por espacio
      • Los años se corrompen: 2026 → 2268 (dígitos contiguos al borde de celda)
      • Los días pueden ser ilegibles: 16 → tT, 20 → ?, etc.

    Estrategia en 3 intentos:
      1. Doble fecha completa:  DD MM YYYY (basura) DD MM YYYY
      2. Primera fecha + MM YYYY de la segunda (día ilegible)
      3. Primera fecha + solo año suelto de la segunda
    """
    if not texto:
        return None, None

    # Normalizar: quitar separadores de tabla, confusiones dígito-letra
    t = texto.replace('|', ' ')
    t = t.replace('O', '0').replace('l', '1').replace('I', '1')
    t = re.sub(r'\s+', ' ', t)

    # Corregir años malformados (ej: 2268 → 2026)
    t = re.sub(r'\b\d{4}\b', _fix_year_ocr, t)

    def _try(d, m, y):
        return _validar_fecha(d, m, y)

    # ── Intento 1: dos fechas completas ───────────────────────────────────────
    # Acepta hasta 3 tokens no numéricos de basura entre las dos fechas
    mt = re.search(
        r'(\d{1,2})\s+(\d{1,2})\s+(20[2-3]\d)'       # fecha inicio
        r'(?:\s+\S{0,8}){0,3}\s+'                      # basura entre fechas
        r'(\d{1,2})\s+(\d{1,2})\s+(20[2-3]\d)',        # fecha fin
        t
    )
    if mt:
        fi = _try(mt.group(1), mt.group(2), mt.group(3))
        ff = _try(mt.group(4), mt.group(5), mt.group(6))
        if fi:
            return fi, (ff or fi)

    # ── Intento 2: primera fecha completa + solo MM YYYY de la segunda ────────
    # Caso: día de fecha fin ilegible (OCR lo confunde con texto)
    mt = re.search(r'(\d{1,2})\s+(\d{1,2})\s+(20[2-3]\d)', t)
    if mt:
        fi = _try(mt.group(1), mt.group(2), mt.group(3))
        if fi:
            rest = t[mt.end():]
            # Buscar MM YYYY (sin DD, o con DD ilegible antes)
            mt2 = re.search(r'(\d{1,2})\s+(20[2-3]\d)', rest)
            if mt2:
                # Usamos el mismo DD de la fecha inicio como aproximación
                ff = _try(mt.group(1), mt2.group(1), mt2.group(2))
                return fi, (ff or fi)
            # Solo hay un año suelto → usar misma fecha
            mt3 = re.search(r'\b(20[2-3]\d)\b', rest)
            if mt3:
                ff = _try(mt.group(1), mt.group(2), mt3.group(1))
                return fi, (ff or fi)
            return fi, fi   # solo tenemos fecha inicio

    return None, None


def _calcular_dias_lab(fecha_ini: str, fecha_fin: str) -> int:
    """Días laborables (L-V) entre dos fechas ISO. Fallback cuando OCR no lee el campo."""
    try:
        d1 = date.fromisoformat(fecha_ini)
        d2 = date.fromisoformat(fecha_fin)
        if d2 < d1:
            return 0
        total, cur = 0, d1
        while cur <= d2:
            if cur.weekday() < 5:
                total += 1
            cur += timedelta(days=1)
        return total
    except Exception:
        return 0


# ══════════════════════════════════════════════════════════════════════════════
#  DETECCIÓN DE PÁGINAS A IGNORAR
# ══════════════════════════════════════════════════════════════════════════════

_IGNORAR_MARCADORES = [
    'Adobe Acrobat Sign', 'Final Audit Report', 'Adobe Sign',
    'Agreement completed', 'Document e-signed by', 'Transaction ID',
    'CERTIFICADO ELECTORAL', 'CERTIFICADO ELECT', 'REGISTRADUR',
    'Formulario E-18', 'FORMULARIO E-18', 'JURADO DE VOTACI',
    'SoyJurado', 'Soy Jurado', 'ELECCIONES DE SENADO',
    'ELECCIONES DE CONGRESO', 'ELECCIONES DE CAMARA',
]

def _es_ignorar(texto: str) -> bool:
    """Devuelve True si la página es de auditoría, firma digital o certificado electoral."""
    tl = texto.lower()
    return any(m.lower() in tl for m in _IGNORAR_MARCADORES)

def _es_vacia(texto: str) -> bool:
    """
    Detecta plantillas vacías del CM-TH-FR-003 o CM-TH-SV-001 sin datos de empleado.
    Se dan cuando el PDF de grupo incluye páginas en blanco como separadores.
    """
    if not texto or len(texto.strip()) < 30:
        return True
    # Permiso: "Nombre:" con 0-8 espacios seguido de "Cedula:" → campo vacío.
    # No importa si hay dígitos más adelante (p.ej. cédula del jefe inmediato).
    if re.search(r'Nombre:\s{0,8}C[eé]dula:', texto, re.IGNORECASE):
        return True
    # Vacaciones: estructura de formulario pero sin cédula ni nombre real.
    # Cédulas pueden tener puntos de miles: 75.079.022 → no casa con \d{7,11}.
    # También aceptamos nombres antes de "Nombre y Apellidos" como indicador de dato.
    tiene_estructura = 'Nombre y Apellidos' in texto or 'Nombre y Ape' in texto
    tiene_cedula = bool(
        re.search(r'\b\d{7,11}\b', texto) or           # cédula sin puntos
        re.search(r'\b\d{1,3}(?:\.\d{3}){2,3}\b', texto)  # con puntos de miles
    )
    tiene_nombre_previo = bool(re.search(
        r'[A-Za-záéíóúñÁÉÍÓÚÑ]{3,}(?:\s+[A-Za-záéíóúñÁÉÍÓÚÑ]{2,})+\s+Nombre\s+y\s+Apell',
        texto, re.IGNORECASE | re.DOTALL
    ))
    if tiene_estructura and not tiene_cedula and not tiene_nombre_previo:
        return True
    return False


# ══════════════════════════════════════════════════════════════════════════════
#  OCR HELPERS
# ══════════════════════════════════════════════════════════════════════════════

def _ocr_page(pdf_path: str, page_idx: int, resolution: int = 300,
              config: str = '--oem 3 --psm 6') -> str:
    """Renderiza una página a imagen y ejecuta Tesseract. Devuelve texto normalizado."""
    with pdfplumber.open(pdf_path) as pdf:
        pil = pdf.pages[page_idx].to_image(resolution=resolution).original
    raw = pytesseract.image_to_string(pil, lang=_LANG, config=config)
    return re.sub(r'[ \t|]+', ' ', raw).strip()

def _ocr_crop(pdf_path: str, page_idx: int,
              y_start_frac: float, y_end_frac: float,
              resolution: int = 500) -> str:
    """
    OCR solo sobre una franja horizontal de la página (crop).
    Usado para aislar la zona de fechas en formularios de vacaciones.
    y_start_frac / y_end_frac: fracción del alto total (0.0 = tope, 1.0 = base).
    """
    with pdfplumber.open(pdf_path) as pdf:
        page = pdf.pages[page_idx]
        h, w = float(page.height), float(page.width)
        crop = page.crop((0, h * y_start_frac, w, h * y_end_frac))
        pil = crop.to_image(resolution=resolution).original
    raw = pytesseract.image_to_string(pil, lang=_LANG, config='--oem 3 --psm 6')
    return re.sub(r'[ \t|]+', ' ', raw).strip()


# ══════════════════════════════════════════════════════════════════════════════
#  EXTRACTORES POR TIPO Y MODO
# ══════════════════════════════════════════════════════════════════════════════

def _base(tipo: str) -> dict:
    return {
        'tipo_novedad': tipo,
        'nombre':       None,
        'cedula':       None,
        'fecha_inicio': None,
        'fecha_fin':    None,
        'cantidad':     None,
        'success':      False,
        'skip':         False,
        'errores':      [],
    }

def _cerrar(d: dict) -> dict:
    """
    Validación mínima antes de devolver el resultado:
    - cedula: obligatoria
    - fecha_inicio: obligatoria
    - fecha_fin: se completa con fecha_inicio si falta (misma fecha = 1 día)
    - nombre y cantidad son opcionales (el controller los resuelve desde la BD)
    """
    if not d['cedula']:
        d['errores'].append('Cédula no detectada')
    if not d['fecha_inicio']:
        d['errores'].append('Fecha inicio no detectada')
    elif not d['fecha_fin']:
        d['fecha_fin'] = d['fecha_inicio']   # fallback: mismo día
    d['success'] = len(d['errores']) == 0
    return d


# ── Permiso — texto nativo ─────────────────────────────────────────────────────

def _permiso_texto(text: str, pdf_path: str) -> dict:
    d = _base('PERMISO')
    tn = _normalizar(text)

    # Nombre: "Nombre: XXXX Cedula:"
    m = re.search(
        r'Nombre:\s*([A-Za-záéíóúñÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ\s]{3,60}?)'
        r'\s+C[eé]dula:',
        tn, re.IGNORECASE
    )
    if m:
        d['nombre'] = m.group(1).strip()

    # Cédula
    d['cedula'] = _extraer_cedula(tn, cabecera_solo=True)

    # Fechas: "Fecha Permiso: De: ... Hasta: ..."
    m = re.search(
        r'Fecha\s+Permiso.*?De:\s*(.{3,28}?)\s*Hasta:\s*(.{3,28}?)(?:\n|Horas|$)',
        tn, re.IGNORECASE
    )
    if m:
        d['fecha_inicio'] = _parsear_fecha(m.group(1))
        d['fecha_fin']    = _parsear_fecha(m.group(2))

    # Fallback fechas: primeras dos fechas numéricas válidas en el texto
    if not d['fecha_inicio']:
        cands = []
        for mt in re.finditer(r'\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b', tn):
            f = _parsear_fecha(mt.group())
            if f and f >= '2025-01-01' and f not in cands:
                cands.append(f)
        if cands:
            d['fecha_inicio'] = cands[0]
            d['fecha_fin']    = cands[-1] if len(cands) > 1 else None

    return _cerrar(d)


# ── Permiso — imagen escaneada (OCR) ──────────────────────────────────────────

def _permiso_ocr(pdf_path: str, page_idx: int) -> dict:
    d = _base('PERMISO')
    if not HAS_OCR:
        d['errores'].append('pytesseract no instalado para PDFs escaneados')
        return d

    try:
        tn = _ocr_page(pdf_path, page_idx, resolution=300)

        # Nombre
        m = re.search(r'[Nn]ombre:\s*(.{3,60}?)\s*[Cc][eé]?dula', tn, re.IGNORECASE)
        if m:
            d['nombre'] = _limpiar_nombre(m.group(1))

        # Cédula
        d['cedula'] = _extraer_cedula(tn, cabecera_solo=True)

        # Si falta algo crítico, reintentar a 400 DPI con PSM 4
        if not d['cedula'] or not d['nombre']:
            tn_400 = _ocr_page(pdf_path, page_idx, resolution=400, config='--oem 3 --psm 4')
            if not d['cedula']:
                d['cedula'] = _extraer_cedula(tn_400, cabecera_solo=True)
            if not d['nombre']:
                m = re.search(r'[Nn]ombre:\s*(.{3,60}?)\s*[Cc][eé]?dula', tn_400, re.IGNORECASE)
                if m:
                    d['nombre'] = _limpiar_nombre(m.group(1))

        # Fechas: "Fecha Permiso: De: ... Hasta: ..."
        m = re.search(
            r'[Ff]echa\s+[Pp]ermiso.*?[Dd]e:\s*(.{3,30}?)\s*[Hh]asta:\s*(.{3,30}?)'
            r'(?:\n|[Hh]oras|$)',
            tn, re.IGNORECASE
        )
        if m:
            d['fecha_inicio'] = _parsear_fecha(m.group(1))
            d['fecha_fin']    = _parsear_fecha(m.group(2))

        # Fallback fechas
        if not d['fecha_inicio']:
            cands = []
            for mt in re.finditer(r'\b\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4}\b', tn):
                f = _parsear_fecha(mt.group())
                if f and f >= '2025-01-01' and f not in cands:
                    cands.append(f)
            if cands:
                d['fecha_inicio'] = cands[0]
                d['fecha_fin']    = cands[-1] if len(cands) > 1 else None

        # Fallback nombre desde nombre de archivo: "XX- Solicitud de permiso NOMBRE.pdf"
        if not d['nombre']:
            fm = re.search(r'permiso\s+(.+?)\.pdf', os.path.basename(pdf_path), re.IGNORECASE)
            if fm:
                d['nombre'] = fm.group(1).strip()

    except Exception as e:
        d['errores'].append(f'Error OCR permiso: {e}')

    return _cerrar(d)


# ── Vacaciones — texto nativo ─────────────────────────────────────────────────

def _vacaciones_texto(text: str, pdf_path: str) -> dict:
    d = _base('VACACIONES')
    # Conservar saltos de línea para los patrones que los requieren
    tn = re.sub(r'[ \t]+', ' ', text or '').strip()

    # Nombre: en CM-TH-SV-001 el VALOR aparece ANTES de la etiqueta
    m = re.search(
        r'([A-Za-záéíóúñÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ\s]{5,65}?)\s+'
        r'Nombre\s+y\s+Apellidos',
        tn, re.IGNORECASE
    )
    if not m:
        # Alternativa: etiqueta antes de valor
        m = re.search(
            r'Nombre\s+y\s+Apellidos\s+Completos\s+'
            r'([A-Za-záéíóúñÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ\s]{5,65}?)'
            r'(?=\s{2,}|C[eé]dula|\d|$)',
            tn, re.IGNORECASE
        )
    if m:
        d['nombre'] = m.group(1).strip()

    # Cédula: con o sin puntos de miles  (75.079.022 → '75079022')
    m = re.search(
        r'(?:C[eé]dula).*?(?:Ciudadan[ií]a).*?No\.?\s*([\d.]{6,15})',
        tn, re.IGNORECASE
    )
    if not m:
        m = re.search(r'([\d.]{6,15})\s+C[eé]dula\s+de\s+Ciudadan', tn, re.IGNORECASE)
    if m:
        raw = m.group(1).replace('.', '').strip()
        if raw.isdigit():
            d['cedula'] = raw

    # Fechas de la tabla "Periodo Solicitado DD MM AA"
    fi, ff = _parsear_tabla_vacaciones(tn)
    if fi:
        d['fecha_inicio'] = fi
        d['fecha_fin']    = ff

    # Días disfrutados
    dm = re.search(r'disfrutados[:\s]*(\d{1,3})', tn, re.IGNORECASE)
    if dm:
        try:
            v = int(dm.group(1))
            if 1 <= v <= 90:
                d['cantidad'] = v
        except ValueError:
            pass

    if not d['cantidad'] and d['fecha_inicio'] and d['fecha_fin']:
        d['cantidad'] = _calcular_dias_lab(d['fecha_inicio'], d['fecha_fin'])

    return _cerrar(d)


# ── Vacaciones — imagen escaneada (OCR) ───────────────────────────────────────

def _vacaciones_ocr(pdf_path: str, page_idx: int) -> dict:
    d = _base('VACACIONES')
    if not HAS_OCR:
        d['errores'].append('pytesseract no instalado para PDFs escaneados')
        return d

    try:
        tn = _ocr_page(pdf_path, page_idx, resolution=300)
        tn_400 = None   # se carga solo si hace falta

        def _buscar_nombre(txt):
            for pat in [
                r'Completes?\s*[|]?\s*([A-Za-záéíóúñÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ\s]{5,65}?)'
                r'(?=\s*(?:C[eé]dula)|\s*$)',
                r'([A-Za-záéíóúñÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ]+(?:\s+[A-Za-záéíóúñÁÉÍÓÚÑ][A-Za-záéíóúñÁÉÍÓÚÑ]+){1,4})'
                r'\s+(?:C[eé]dula)',
            ]:
                mt = re.search(pat, txt, re.IGNORECASE)
                if mt:
                    return _limpiar_nombre(mt.group(1))
            return None

        d['nombre'] = _buscar_nombre(tn)
        d['cedula'] = _extraer_cedula(tn, cabecera_solo=True)
        fi, ff = _parsear_tabla_vacaciones(tn)

        # ── Pasada 400 DPI si faltan campos esenciales ─────────────────────────
        if not d['cedula'] or not d['nombre'] or not fi:
            tn_400 = _ocr_page(pdf_path, page_idx, resolution=400, config='--oem 3 --psm 4')
            if not d['cedula']:
                d['cedula'] = _extraer_cedula(tn_400, cabecera_solo=True)
            if not d['nombre']:
                d['nombre'] = _buscar_nombre(tn_400)
            if not fi:
                fi, ff = _parsear_tabla_vacaciones(tn_400)

        # ── Pasada de crop (zona de fechas) si las dos pasadas anteriores fallaron ──
        # Aísla la franja donde está la tabla de "Periodo Solicitado" (42-72% del alto)
        # y la escanea a 500 DPI para mejor resolución en las celdas pequeñas.
        if not fi:
            try:
                crop_txt = _ocr_crop(pdf_path, page_idx,
                                     y_start_frac=0.42, y_end_frac=0.72,
                                     resolution=500)
                fi, ff = _parsear_tabla_vacaciones(crop_txt)
            except Exception:
                pass

        if fi:
            d['fecha_inicio'] = fi
            d['fecha_fin']    = ff

        # Días disfrutados
        for txt in ([tn] + ([tn_400] if tn_400 else [])):
            if d['cantidad']:
                break
            dm = re.search(r'disfrutados[:\s]*[\[\(]?\s*([0-9oOlIsS]{1,3})', txt, re.IGNORECASE)
            if dm:
                raw = _solo_digitos(dm.group(1))
                if raw.isdigit() and 1 <= int(raw) <= 31:
                    d['cantidad'] = int(raw)

        if not d['cantidad'] and d['fecha_inicio'] and d['fecha_fin']:
            d['cantidad'] = _calcular_dias_lab(d['fecha_inicio'], d['fecha_fin'])

        # Fallback nombre desde nombre de archivo
        if not d['nombre']:
            fm = re.search(r'vacaciones\s+(.+?)\.pdf', os.path.basename(pdf_path), re.IGNORECASE)
            if fm:
                d['nombre'] = fm.group(1).strip()

    except Exception as e:
        d['errores'].append(f'Error OCR vacaciones: {e}')

    return _cerrar(d)


# ── PDFs generados por Power Automate / Microsoft Forms  [FORMS] ──────────────

def _leer_bloque_forms(text: str) -> dict:
    """
    Lee el bloque de datos estructurado que rellenar_pdf.py inserta
    al final de los PDFs generados. Formato:
        [FORMS]
        CAMPO: valor
        CAMPO2: valor2
    Retorna un dict clave→valor (claves en minúsculas) o {} si no existe.
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

def _parse_ddmmyyyy(s: str) -> Optional[str]:
    """Convierte 'DD/MM/YYYY' o 'DD-MM-YYYY' → 'YYYY-MM-DD'."""
    if not s:
        return None
    partes = re.split(r'[-/]', s.strip())
    if len(partes) == 3:
        try:
            d_v, m_v, y_v = partes
            date(int(y_v), int(m_v), int(d_v))
            return f'{int(y_v):04d}-{int(m_v):02d}-{int(d_v):02d}'
        except (ValueError, TypeError):
            pass
    return None

def _forms_permiso(text: str, pdf_path: str) -> dict:
    """Extrae permiso desde bloque [FORMS] (máxima fiabilidad, texto determinístico)."""
    d = _base('PERMISO')
    b = _leer_bloque_forms(text)
    if not b:
        return _permiso_texto(text, pdf_path)   # fallback a regex

    d['nombre']       = b.get('nombre') or None
    d['cedula']       = b.get('cedula') or None
    d['fecha_inicio'] = _parse_ddmmyyyy(b.get('fecha_desde', ''))
    d['fecha_fin']    = _parse_ddmmyyyy(b.get('fecha_hasta', ''))

    td_raw = (b.get('total_dias') or '').strip()
    if td_raw:
        try:
            v = float(td_raw.replace(',', '.'))
            d['cantidad'] = int(v) if v == int(v) else v
        except ValueError:
            pass

    return _cerrar(d)

def _forms_vacaciones(text: str, pdf_path: str) -> dict:
    """Extrae vacaciones desde bloque [FORMS]."""
    d = _base('VACACIONES')
    b = _leer_bloque_forms(text)
    if not b:
        return _vacaciones_texto(text, pdf_path)   # fallback a regex

    d['nombre'] = b.get('nombre') or None
    d['cedula'] = b.get('cedula') or None

    # Fechas: guardadas como DD/MM/YYYY por rellenar_pdf.py
    d['fecha_inicio'] = _parse_ddmmyyyy(b.get('fecha_desde', ''))
    d['fecha_fin']    = _parse_ddmmyyyy(b.get('fecha_hasta', ''))

    dias_raw = (b.get('dias_disfrutados') or b.get('total_dias') or '').strip()
    if dias_raw:
        try:
            v = int(dias_raw)
            if 1 <= v <= 90:
                d['cantidad'] = v
        except ValueError:
            pass

    if not d['cantidad'] and d['fecha_inicio'] and d['fecha_fin']:
        d['cantidad'] = _calcular_dias_lab(d['fecha_inicio'], d['fecha_fin'])

    return _cerrar(d)


# ══════════════════════════════════════════════════════════════════════════════
#  DETECTOR DE TIPO  +  PROCESADOR DE PÁGINA
# ══════════════════════════════════════════════════════════════════════════════

def _detectar_tipo(pdf_path: str):
    """
    Detecta tipo ('permiso'|'vacaciones'|None) desde la página 0.
    Prioridad: texto nativo → nombre de archivo → OCR rápido (150 DPI).
    Devuelve (tipo, es_imagen_pag0, text_pag0, es_forms).
    """
    with pdfplumber.open(pdf_path) as pdf:
        page0  = pdf.pages[0]
        text0  = page0.extract_text() or ''
        es_img = len(page0.chars) == 0 and len(page0.images) > 0

    upper    = text0.upper()
    es_forms = '[FORMS]' in text0
    es_perm  = 'CM-TH-FR-003' in text0 or 'FORMATO SOLICITUD DE PERMISO' in upper
    es_vac   = 'CM-TH-SV-001' in text0 or 'SOLICITUD DE VACACIONES' in upper

    if not es_perm and not es_vac:
        nb = os.path.basename(pdf_path).lower()
        es_perm = 'permiso' in nb or 'fr-003' in nb or 'familia' in nb
        es_vac  = 'vacacion' in nb or 'sv-001' in nb

    if not es_perm and not es_vac and es_img and HAS_OCR:
        try:
            with pdfplumber.open(pdf_path) as pdf:
                mini = pdf.pages[0].to_image(resolution=150).original
            hdr = pytesseract.image_to_string(mini, lang='eng').upper()
            if 'FR-003' in hdr or 'SOLICITUD DE PERMISO' in hdr or 'FAMILIA' in hdr:
                es_perm = True
            elif 'SV-001' in hdr or 'SOLICITUD DE VACACIONES' in hdr:
                es_vac = True
        except Exception:
            pass

    tipo = 'permiso' if es_perm else ('vacaciones' if es_vac else None)
    return tipo, es_img, text0, es_forms


def _procesar_pagina(pdf_path: str, page_idx: int, tipo: str,
                     es_forms: bool = False) -> dict:
    """
    Extrae datos de una página concreta según el tipo de formulario.
    Devuelve {'skip': True} para páginas que deben ignorarse silenciosamente.
    """
    with pdfplumber.open(pdf_path) as pdf:
        page  = pdf.pages[page_idx]
        text  = page.extract_text() or ''
        # Una página se considera imagen si el texto extraíble es muy corto (< 80 chars)
        # y hay imágenes embebidas. Cubre PDFs de CamScanner con metadatos mínimos.
        es_img = len(text.strip()) < 80 and len(page.images) > 0

    # ── Páginas a ignorar (auditoría Adobe Sign, certificados electorales) ────
    if _es_ignorar(text):
        return {'success': False, 'skip': True}

    # ── Plantillas vacías en PDFs con texto nativo ────────────────────────────
    if not es_img and _es_vacia(text):
        return {'success': False, 'skip': True}

    # ── Detectar páginas-imagen que hay que ignorar (OCR rápido de comprobación) ─
    if es_img and HAS_OCR and not text.strip():
        try:
            with pdfplumber.open(pdf_path) as _p:
                mini = _p.pages[page_idx].to_image(resolution=150).original
            txt_mini = pytesseract.image_to_string(mini, lang='eng')
            if _es_ignorar(txt_mini):
                return {'success': False, 'skip': True}
        except Exception:
            pass

    try:
        # ── Ruta 1: PDF generado por Power Automate (bloque [FORMS]) ──────────
        if es_forms and text.strip():
            if tipo == 'permiso':
                return _forms_permiso(text, pdf_path)
            else:
                return _forms_vacaciones(text, pdf_path)

        # ── Ruta 2: PDF original (texto nativo o escaneado) ───────────────────
        if tipo == 'permiso':
            if es_img or not text.strip():
                if not HAS_OCR:
                    return {
                        'success': False, 'skip': False,
                        'errores': ['pytesseract no instalado para PDFs escaneados']
                    }
                return _permiso_ocr(pdf_path, page_idx)
            return _permiso_texto(text, pdf_path)
        else:   # vacaciones
            if not es_img and len(text.strip()) > 50:
                return _vacaciones_texto(text, pdf_path)
            if not HAS_OCR:
                return {
                    'success': False, 'skip': False,
                    'errores': ['pytesseract no instalado para PDFs escaneados']
                }
            return _vacaciones_ocr(pdf_path, page_idx)

    except Exception as e:
        return {
            'success': False,
            'skip':    False,
            'errores': [f'Error procesando página {page_idx + 1}: {e}']
        }


# ══════════════════════════════════════════════════════════════════════════════
#  ENTRADA PRINCIPAL
# ══════════════════════════════════════════════════════════════════════════════

def procesar_pdf(pdf_path: str) -> list:
    """
    Detecta tipo y procesa TODAS las páginas del PDF.
    Devuelve siempre una lista (un elemento por página/empleado).
    """
    if not HAS_PDFPLUMBER:
        return [{'success': False, 'errores': ['pdfplumber no instalado (pip install pdfplumber)']}]
    if not os.path.isfile(pdf_path):
        return [{'success': False, 'errores': [f'Archivo no encontrado: {pdf_path}']}]

    try:
        tipo, _, _, es_forms = _detectar_tipo(pdf_path)

        if tipo is None:
            with pdfplumber.open(pdf_path) as pdf:
                muestra = (pdf.pages[0].extract_text() or '')[:200]
            return [{
                'success': False,
                'errores': [
                    'Formulario PDF no reconocido. '
                    'Use CM-TH-FR-003 (Permiso) o CM-TH-SV-001 (Vacaciones). '
                    f'Texto detectado: {muestra!r}'
                ]
            }]

        with pdfplumber.open(pdf_path) as pdf:
            n_paginas = len(pdf.pages)

        return [_procesar_pagina(pdf_path, i, tipo, es_forms) for i in range(n_paginas)]

    except Exception as e:
        return [{'success': False, 'errores': [f'Error procesando PDF: {e}']}]


def main():
    if len(sys.argv) < 2:
        print(json.dumps(
            [{'success': False, 'errores': ['Uso: python procesar_pdf.py <ruta_pdf>']}],
            ensure_ascii=False
        ))
        sys.exit(0)

    results = procesar_pdf(sys.argv[1])
    print(json.dumps(results, ensure_ascii=False, default=str))


if __name__ == '__main__':
    main()
