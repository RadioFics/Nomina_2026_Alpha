#!/usr/bin/env python3
"""
rellenar_pdf.py  —  Rellena los PDFs oficiales de Collective Mining con datos del formulario
===================================================================================
Usa las plantillas originales (FORMATO SOLICITUD DE PERMISO 6.pdf y
FORMATO SOLICITUD DE VACACIONES.pdf) como base y superpone los datos
como texto en las posiciones exactas medidas con pdfplumber.

Dependencias:
  pip install pypdf reportlab

Uso:
  python rellenar_pdf.py permiso    datos.json  plantilla.pdf  salida.pdf
  python rellenar_pdf.py vacaciones datos.json  plantilla.pdf  salida.pdf

  Los datos.json contienen los campos del formulario según el tipo.

Campos esperados — Permiso:
  nombre, cedula, cargo, area,
  fecha_dia, fecha_mes, fecha_anio,
  fecha_desde (DD/MM/YYYY), fecha_hasta (DD/MM/YYYY),
  hora_inicio, hora_fin, total_dias,
  motivo (Estudio | Calamidad Domestica | Medico | Vacaciones |
           Compensatorio | Fuerza Mayor | Otra Causa),
  cual, explicacion,
  tipo_permiso (Remunerado | No Remunerado),
  observaciones

Campos esperados — Vacaciones:
  nombre, cedula, cargo,
  fecha_inicio (YYYY-MM-DD o DD/MM/YYYY),
  fecha_fin    (YYYY-MM-DD o DD/MM/YYYY),
  dias_vacaciones,
  actividades, reemplazo, observaciones
"""

import sys
import os
import json
import io
import textwrap
from datetime import datetime

try:
    from pypdf import PdfReader, PdfWriter
except ImportError:
    sys.exit('[ERROR] pypdf no instalado. Ejecuta: pip install pypdf')

try:
    from reportlab.pdfgen import canvas
    from reportlab.lib.pagesizes import letter
except ImportError:
    sys.exit('[ERROR] reportlab no instalado. Ejecuta: pip install reportlab')

# Ambos PDFs son US Letter (612 × 792 pt), NO A4.
PAGE_W, PAGE_H = 612.0, 792.0

# ── Marca que el extractor procesar_pdf.py detecta para usar el parser de Forms ─
FORMS_MARKER = '[FORMS]'


def _y(top_pdfplumber: float) -> float:
    """
    Convierte coordenada Y de pdfplumber (origen arriba, aumenta hacia abajo)
    a coordenada Y de reportlab (origen abajo, aumenta hacia arriba).
    Se usa el valor `bottom` del texto para que la línea base quede alineada.
    """
    return PAGE_H - top_pdfplumber


def _txt(c, x: float, y_top: float, valor: str,
         font: str = 'Helvetica', size: float = 9.0,
         max_width: float = 0, color=(0, 0, 0)):
    """
    Dibuja `valor` en la posición (x, y_top) en coordenadas pdfplumber.
    y_top es el valor `bottom` del texto de la etiqueta correspondiente,
    de modo que la línea base queda alineada.
    """
    if not valor:
        return
    c.setFont(font, size)
    c.setFillColorRGB(*color)
    rl_y = _y(y_top)
    if max_width > 0:
        # Truncar para que quepa en el ancho disponible
        valor = valor[:int(max_width / (size * 0.55))]
    c.drawString(x, rl_y, str(valor))


def _check(c, x: float, top: float, h: float):
    """
    Dibuja una marca ✓ centrada dentro de un checkbox.
    x, top, h son las coordenadas pdfplumber del rectángulo del checkbox.
    """
    center_y = top + h / 2.0          # centro vertical en pdfplumber
    rl_y = _y(center_y) - 4.0         # ajuste para centrar el glifo
    c.setFont('Helvetica-Bold', 10)
    c.setFillColorRGB(0, 0, 0)
    c.drawString(x + 2.5, rl_y, '✓')   # ✓


# ═══════════════════════════════════════════════════════════════════════════════
#   CAPA DE TEXTO — PERMISO  (CM-TH-FR-003)
# ═══════════════════════════════════════════════════════════════════════════════

def _capa_permiso(datos: dict) -> io.BytesIO:
    """
    Genera la capa transparente con los datos del permiso, calibrada con las
    coordenadas exactas extraídas del FORMATO SOLICITUD DE PERMISO 6.pdf
    (612 × 792 pt, US Letter).

    Mapa de coordenadas (x0, bottom) pdfplumber → posición de cada campo:

    Información Personal
      Nombre       : x=95,  bot=157.9
      Cédula       : x=413, bot=157.9
      Cargo        : x=86,  bot=179.6
      Área         : x=402, bot=179.6
      Fecha Día    : x=175, bot=136.1
      Fecha Mes    : x=335, bot=136.1
      Fecha Año    : x=480, bot=136.1

    Datos de Permiso
      Fecha desde  : x=233, bot=222.9
      Fecha hasta  : x=407, bot=222.9
      Hora inicio  : x=233, bot=244.6
      Hora fin     : x=407, bot=244.6
      Total días   : x=118, bot=266.4

    Motivo — checkboxes (x0, top, height):
      Estudio      : (212, 302.4, 12.7)
      Calamidad    : (212, 315.7, 12.7)
      Médico       : (212, 328.4, 13.3)
      Vacaciones   : (212, 341.8, 13.3)
      Compensatorio: (516.6, 302.4, 12.7)
      Fuerza Mayor : (516.6, 316.3, 12.1)
      Otra Causa   : (516.6, 329.0, 12.7)
      ¿Cuál?       : x=411, bot=354.6
      Explicación  : x=109, bot=381.2

    Firmas solicitante
      Nombre       : x=95,  bot=476.8
      Cédula       : x=95,  bot=494.9

    Tipo Permiso — checkboxes:
      Remunerado   : (131.3, 594.5, 12.7)
      No Remunerado: (354.4, 593.2, 12.7)

    Observaciones  : x=53, bot=655  (primera línea de texto)
    """

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(PAGE_W, PAGE_H))

    # ── Información Personal ─────────────────────────────────────────────────
    _txt(c, 95,  157.9, datos.get('nombre', ''),  max_width=270)
    _txt(c, 413, 157.9, datos.get('cedula', ''),  max_width=150)
    _txt(c, 86,  179.6, datos.get('cargo',  ''),  max_width=270)
    _txt(c, 402, 179.6, datos.get('area',   ''),  max_width=150)

    # Fecha (Día / Mes / Año)
    _txt(c, 175, 136.1, datos.get('fecha_dia',  ''), max_width=80)
    _txt(c, 335, 136.1, datos.get('fecha_mes',  ''), max_width=80)
    _txt(c, 480, 136.1, datos.get('fecha_anio', ''), max_width=80)

    # ── Datos de Permiso ──────────────────────────────────────────────────────
    _txt(c, 233, 222.9, datos.get('fecha_desde', ''), max_width=130)
    _txt(c, 407, 222.9, datos.get('fecha_hasta', ''), max_width=130)
    _txt(c, 233, 244.6, datos.get('hora_inicio', ''), max_width=130)
    _txt(c, 407, 244.6, datos.get('hora_fin',    ''), max_width=130)
    _txt(c, 118, 266.4, str(datos.get('total_dias', '')), max_width=200)

    # ── Motivo del Permiso ────────────────────────────────────────────────────
    motivo = datos.get('motivo', '')
    _CHECKS = {
        'Estudio':             (212.0, 302.4, 12.7),
        'Calamidad Domestica': (212.0, 315.7, 12.7),
        'Medico':              (212.0, 328.4, 13.3),
        'Vacaciones':          (212.0, 341.8, 13.3),
        'Compensatorio':       (516.6, 302.4, 12.7),
        'Fuerza Mayor':        (516.6, 316.3, 12.1),
        'Otra Causa':          (516.6, 329.0, 12.7),
    }
    # Normalizar para comparación flexible
    motivo_norm = motivo.lower().strip()
    for label, (cx, ct, ch) in _CHECKS.items():
        if label.lower() in motivo_norm or motivo_norm in label.lower():
            _check(c, cx, ct, ch)
            break

    _txt(c, 411, 354.6, datos.get('cual',       ''), max_width=150)
    _txt(c, 109, 381.2, datos.get('explicacion', ''), max_width=460)

    # ── Firmas — Solicitante ──────────────────────────────────────────────────
    _txt(c, 95, 476.8, datos.get('nombre', ''), max_width=110)
    _txt(c, 95, 494.9, datos.get('cedula', ''), max_width=110)

    # ── Tipo Permiso ──────────────────────────────────────────────────────────
    tipo = datos.get('tipo_permiso', '').lower()
    if 'no' not in tipo and 'remunerado' in tipo:
        _check(c, 131.3, 594.5, 12.7)   # Remunerado
    elif 'no' in tipo:
        _check(c, 354.4, 593.2, 12.7)   # No Remunerado

    # ── Observaciones ─────────────────────────────────────────────────────────
    obs = datos.get('observaciones', '')
    if obs:
        # Máximo ~90 caracteres por línea; hasta 2 líneas en el espacio disponible
        lineas = textwrap.wrap(obs, width=95)[:2]
        for i, linea in enumerate(lineas):
            _txt(c, 53, 650 + i * 13, linea, max_width=510)

    # ── Bloque de datos estructurado (invisible) ──────────────────────────────
    # El texto blanco no es visible en el PDF impreso pero pdfplumber lo extrae,
    # lo que permite que procesar_pdf.py use el extractor determinístico de Forms
    # sin depender del análisis visual del formulario (checkboxes, layout, etc.).
    c.setFont('Helvetica', 4)
    c.setFillColorRGB(1, 1, 1)
    lineas_datos = [
        FORMS_MARKER,
        f'NOMBRE: {datos.get("nombre", "")}',
        f'CEDULA: {datos.get("cedula", "")}',
        f'CARGO: {datos.get("cargo", "")}',
        f'AREA: {datos.get("area", "")}',
        f'FECHA_DESDE: {datos.get("fecha_desde", "")}',
        f'FECHA_HASTA: {datos.get("fecha_hasta", "")}',
        f'HORA_INICIO: {datos.get("hora_inicio", "")}',
        f'HORA_FIN: {datos.get("hora_fin", "")}',
        f'TOTAL_DIAS: {datos.get("total_dias", "")}',
        f'MOTIVO: {datos.get("motivo", "")}',
        f'CUAL: {datos.get("cual", "")}',
        f'TIPO_PERMISO: {datos.get("tipo_permiso", "")}',
        f'EXPLICACION: {datos.get("explicacion", "")}',
        f'OBSERVACIONES: {datos.get("observaciones", "")}',
    ]
    for i, linea in enumerate(lineas_datos):
        c.drawString(5, 8 + i * 5, linea)

    c.save()
    buf.seek(0)
    return buf


# ═══════════════════════════════════════════════════════════════════════════════
#   CAPA DE TEXTO — VACACIONES  (CM-TH-SV-001)
# ═══════════════════════════════════════════════════════════════════════════════

def _capa_vacaciones(datos: dict) -> io.BytesIO:
    """
    Genera la capa transparente con los datos de vacaciones, calibrada con las
    coordenadas exactas extraídas del FORMATO SOLICITUD DE VACACIONES.pdf
    (612 × 792 pt, US Letter).

    Mapa de coordenadas:
      Nombre y Apellidos : x=215, bot=139.1
      Cédula             : x=192, bot=162.0
      Cargo              : x=107, bot=183.0
      DESDE DD           : x=262, bot=240  (fila de datos, bajo el sub-header)
      DESDE MM           : x=307, bot=240
      DESDE AA           : x=361, bot=240
      HASTA DD           : x=414, bot=240
      HASTA MM           : x=465, bot=240
      HASTA AA           : x=519, bot=240
      Días vacaciones    : x=245, bot=278
      Actividades        : x=75,  bot=385
      Reemplazo          : x=285, bot=385
      Observaciones      : x=445, bot=385
    """

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(PAGE_W, PAGE_H))

    # ── Información del empleado ──────────────────────────────────────────────
    _txt(c, 215, 139.1, datos.get('nombre', ''), max_width=340)
    _txt(c, 192, 162.0, datos.get('cedula', ''), max_width=370)
    _txt(c, 107, 183.0, datos.get('cargo',  ''), max_width=450)

    # ── Período Solicitado ────────────────────────────────────────────────────
    # Parsear fechas en formato YYYY-MM-DD o DD/MM/YYYY
    def _parse(fecha_str):
        if not fecha_str:
            return '', '', ''
        fecha_str = str(fecha_str).strip()
        try:
            if '-' in fecha_str and len(fecha_str) == 10:
                # YYYY-MM-DD
                y, m, d = fecha_str.split('-')
                return d, m, y[2:]
            elif '/' in fecha_str:
                # DD/MM/YYYY o DD/MM/YY
                partes = fecha_str.split('/')
                d, m, y = partes[0], partes[1], partes[2]
                return d, m, y[-2:]
        except (ValueError, IndexError):
            pass
        return fecha_str, '', ''

    dd1, mm1, aa1 = _parse(datos.get('fecha_inicio', ''))
    dd2, mm2, aa2 = _parse(datos.get('fecha_fin',    ''))

    # Las celdas de datos están en la fila debajo del sub-header DD/MM/AA (top≈213)
    # La fila de datos ocupa top≈228 a top≈248 → usamos bot=245
    _txt(c, 262, 245, dd1, max_width=30)
    _txt(c, 308, 245, mm1, max_width=30)
    _txt(c, 362, 245, aa1, max_width=30)
    _txt(c, 414, 245, dd2, max_width=30)
    _txt(c, 466, 245, mm2, max_width=30)
    _txt(c, 520, 245, aa2, max_width=30)

    # ── Días de Vacaciones disfrutados ────────────────────────────────────────
    # La caja de días aparece a la derecha del label (label bot=273.5)
    # La caja está aproximadamente en x=220-370, centrada verticalmente en top=265-280
    _txt(c, 245, 278, str(datos.get('dias_vacaciones', '')), size=11, max_width=100)

    # ── Tabla de gestión (Actividades / Reemplazo / Observaciones) ────────────
    # Las celdas de datos están en la primera fila de datos, top≈355-450
    # Usamos la primera sub-fila (bot≈385)
    actividades = datos.get('actividades', '')
    reemplazo   = datos.get('reemplazo',   '')
    obs         = datos.get('observaciones', '')

    # Cada columna tiene ancho aproximado: act=200, reemp=155, obs=150
    for i, (linea) in enumerate(textwrap.wrap(actividades, width=28)[:4]):
        _txt(c, 75,  372 + i * 12, linea, size=8, max_width=195)
    for i, (linea) in enumerate(textwrap.wrap(reemplazo, width=22)[:4]):
        _txt(c, 285, 372 + i * 12, linea, size=8, max_width=150)
    for i, (linea) in enumerate(textwrap.wrap(obs, width=22)[:4]):
        _txt(c, 445, 372 + i * 12, linea, size=8, max_width=120)

    # ── Bloque de datos estructurado (invisible) ──────────────────────────────
    c.setFont('Helvetica', 4)
    c.setFillColorRGB(1, 1, 1)

    def _fecha_fmt(s):
        """Normaliza YYYY-MM-DD → DD/MM/YYYY para el bloque de datos."""
        if not s:
            return ''
        s = str(s).strip()
        if len(s) == 10 and s[4] == '-':
            y, m, d = s.split('-')
            return f'{d}/{m}/{y}'
        return s

    lineas_datos = [
        FORMS_MARKER,
        f'NOMBRE: {datos.get("nombre", "")}',
        f'CEDULA: {datos.get("cedula", "")}',
        f'CARGO: {datos.get("cargo", "")}',
        f'FECHA_INICIO: {_fecha_fmt(datos.get("fecha_inicio", ""))}',
        f'FECHA_FIN: {_fecha_fmt(datos.get("fecha_fin", ""))}',
        f'DIAS_VACACIONES: {datos.get("dias_vacaciones", "")}',
        f'ACTIVIDADES: {datos.get("actividades", "")}',
        f'REEMPLAZO: {datos.get("reemplazo", "")}',
        f'OBSERVACIONES: {datos.get("observaciones", "")}',
    ]
    for i, linea in enumerate(lineas_datos):
        c.drawString(5, 8 + i * 5, linea)

    c.save()
    buf.seek(0)
    return buf


# ═══════════════════════════════════════════════════════════════════════════════
#   FUNCIÓN PRINCIPAL — superpone la capa sobre la plantilla original
# ═══════════════════════════════════════════════════════════════════════════════

def rellenar(tipo: str, datos: dict, pdf_plantilla: str, pdf_salida: str) -> str:
    """
    Rellena el PDF oficial con los datos del formulario.

    Args:
        tipo:          'permiso' | 'vacaciones'
        datos:         dict con los campos del formulario
        pdf_plantilla: ruta al PDF original (plantilla sin datos)
        pdf_salida:    ruta de destino del PDF relleno

    Returns:
        Ruta del PDF generado (pdf_salida).
    """
    if tipo == 'permiso':
        capa_buf = _capa_permiso(datos)
    elif tipo == 'vacaciones':
        capa_buf = _capa_vacaciones(datos)
    else:
        raise ValueError(f'Tipo desconocido: {tipo!r}. Usa "permiso" o "vacaciones".')

    # Abrir la plantilla original como base
    reader  = PdfReader(pdf_plantilla)
    overlay = PdfReader(capa_buf)
    writer  = PdfWriter()

    base_page = reader.pages[0]
    base_page.merge_page(overlay.pages[0])
    writer.add_page(base_page)

    os.makedirs(os.path.dirname(os.path.abspath(pdf_salida)), exist_ok=True)
    with open(pdf_salida, 'wb') as f:
        writer.write(f)

    return pdf_salida


# ═══════════════════════════════════════════════════════════════════════════════
#   CLI
# ═══════════════════════════════════════════════════════════════════════════════

def main():
    if len(sys.argv) < 5:
        print(json.dumps({
            'success': False,
            'error': 'Uso: rellenar_pdf.py <permiso|vacaciones> <datos.json> <plantilla.pdf> <salida.pdf>'
        }, ensure_ascii=False))
        sys.exit(1)

    tipo          = sys.argv[1].lower()
    datos_path    = sys.argv[2]
    plantilla     = sys.argv[3]
    salida        = sys.argv[4]

    if not os.path.isfile(datos_path):
        print(json.dumps({'success': False, 'error': f'Archivo de datos no encontrado: {datos_path}'}))
        sys.exit(1)

    if not os.path.isfile(plantilla):
        print(json.dumps({'success': False, 'error': f'Plantilla PDF no encontrada: {plantilla}'}))
        sys.exit(1)

    with open(datos_path, encoding='utf-8') as f:
        datos = json.load(f)

    try:
        resultado = rellenar(tipo, datos, plantilla, salida)
        print(json.dumps({
            'success': True,
            'pdf': resultado,
            'tipo': tipo,
            'nombre': datos.get('nombre', ''),
            'generado_en': datetime.now().isoformat()
        }, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({'success': False, 'error': str(e)}, ensure_ascii=False))
        sys.exit(1)


if __name__ == '__main__':
    main()
