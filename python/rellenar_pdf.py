#!/usr/bin/env python3
"""
rellenar_pdf.py  —  Rellena los PDFs oficiales de Collective Mining con datos del formulario
===================================================================================
Usa las plantillas originales (FORMATO SOLICITUD DE PERMISO 6.pdf y
FORMATO SOLICITUD DE VACACIONES.pdf) como base y superpone los datos
como texto en las posiciones exactas medidas con pdfplumber.

Dependencias (puro Python, sin compilación C):
  pip install pypdf fpdf2

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
    from fpdf import FPDF
except ImportError:
    sys.exit('[ERROR] fpdf2 no instalado. Ejecuta: pip install fpdf2')

# Ambos PDFs son US Letter (612 × 792 pt), NO A4.
PAGE_W, PAGE_H = 612.0, 792.0

# ── Marca que el extractor procesar_pdf.py detecta para usar el parser de Forms ─
FORMS_MARKER = '[FORMS]'


# ══════════════════════════════════════════════════════════════════════════════
#   HELPERS DE DIBUJO  (equivalentes exactos a los anteriores de reportlab)
#
#   Sistema de coordenadas:
#     - fpdf2 usa origen arriba-izquierda, y aumenta hacia abajo   ← mismo que pdfplumber
#     - reportlab usaba origen abajo-izquierda, y aumenta hacia arriba
#
#   Equivalencia de posición:
#     reportlab drawString(x,  PAGE_H - y_top + lift,  txt)
#     == fpdf2   text(x,  y_top - lift,  txt)
#
#   Por eso la conversión es simplemente:
#     fpdf2_y = y_top - lift
# ══════════════════════════════════════════════════════════════════════════════

def _new_overlay() -> FPDF:
    """Crea una página PDF en blanco US Letter lista para recibir texto."""
    pdf = FPDF(unit='pt', format=(PAGE_W, PAGE_H))
    pdf.set_margins(0, 0, 0)
    pdf.set_auto_page_break(False)
    pdf.add_page()
    return pdf


def _txt(pdf: FPDF, x: float, y_top: float, valor: str,
         font: str = 'Helvetica', size: float = 9.0,
         max_width: float = 0, color=(0, 0, 0), lift: float = 4.0):
    """
    Dibuja `valor` con baseline en (x, y_top - lift) en coordenadas fpdf2.

    y_top  → valor `bottom` del texto de la etiqueta en pdfplumber
             (distancia desde el borde SUPERIOR de la página, aumentando hacia abajo).
    lift   → desplaza el texto hacia ARRIBA para que flote sobre la línea del formulario.
    """
    if not valor:
        return
    valor = str(valor)
    if max_width > 0:
        valor = valor[:int(max_width / (size * 0.55))]
    style = 'B' if 'Bold' in font else ''
    pdf.set_font('Helvetica', style=style, size=size)
    r, g, b = (int(c * 255) for c in color)
    pdf.set_text_color(r, g, b)
    # text(x, y) en fpdf2: y es la distancia desde el borde SUPERIOR hasta la baseline del texto
    pdf.text(x, y_top - lift, txt=valor)


def _check(pdf: FPDF, x: float, top: float, h: float):
    """
    Dibuja una marca 'X' centrada dentro de un checkbox.
    x, top, h son las coordenadas pdfplumber del rectángulo del checkbox.

    Equivalencia con reportlab:
      reportlab: rl_y = (PAGE_H - center_y) - 4   (desde abajo)
      fpdf2:     y    = center_y + 4               (desde arriba)
    """
    center_y = top + h / 2.0
    pdf.set_font('Helvetica', style='B', size=10)
    pdf.set_text_color(0, 0, 0)
    pdf.text(x + 2.5, center_y + 4, txt='X')


def _overlay_to_page(pdf: FPDF):
    """Convierte el FPDF en una página pypdf lista para merge_page()."""
    buf = io.BytesIO(pdf.output())
    return PdfReader(buf).pages[0]


# ═══════════════════════════════════════════════════════════════════════════════
#   CAPA DE TEXTO — PERMISO  (CM-TH-FR-003)
# ═══════════════════════════════════════════════════════════════════════════════

def _capa_permiso(datos: dict):
    """
    Genera la capa con los datos del permiso calibrada con las coordenadas
    exactas del FORMATO SOLICITUD DE PERMISO 6.pdf (612 × 792 pt, US Letter).
    Devuelve una página pypdf lista para merge_page().

    Mapa de coordenadas (x, y_top pdfplumber) → cada campo:

    Información Personal
      Nombre       : x=95,  y_top=158.5
      Cédula       : x=418, y_top=158.5
      Cargo        : x=95,  y_top=180.2
      Área         : x=418, y_top=180.2
      Fecha Día    : x=215, y_top=136.8
      Fecha Mes    : x=376, y_top=136.8
      Fecha Año    : x=520, y_top=136.8

    Datos de Permiso
      Fecha desde  : x=257, y_top=223.5
      Fecha hasta  : x=418, y_top=223.5
      Hora inicio  : x=257, y_top=245.2
      Hora fin     : x=418, y_top=245.2
      Total días   : x=118, y_top=267.0

    Motivo — checkboxes (x, top, height):
      Estudio      : (212.0, 302.4, 12.7)
      Calamidad    : (212.0, 315.7, 12.7)
      Médico       : (212.0, 328.4, 13.3)
      Vacaciones   : (212.0, 341.8, 13.3)
      Compensatorio: (516.6, 302.4, 12.7)
      Fuerza Mayor : (516.6, 316.3, 12.1)
      Otra Causa   : (516.6, 329.0, 12.7)
      ¿Cuál?       : x=418, y_top=355.2
      Explicación  : x=109, y_top=381.8

    Tipo Permiso — checkboxes:
      Remunerado   : (131.3, 594.5, 12.7)
      No Remunerado: (354.4, 593.2, 12.7)

    Observaciones  : x=53, y_tops=[664.1, 690.8, 717.4]
    """
    pdf = _new_overlay()

    # ── Información Personal ─────────────────────────────────────────────────
    _txt(pdf, 95,  158.5, datos.get('nombre', ''),  max_width=280)
    _txt(pdf, 418, 158.5, datos.get('cedula', ''),  max_width=138)
    _txt(pdf, 95,  180.2, datos.get('cargo',  ''),  max_width=280)
    _txt(pdf, 418, 180.2, datos.get('area',   ''),  max_width=138)

    # Fecha de emisión
    _txt(pdf, 215, 136.8, datos.get('fecha_dia',  ''), max_width=32)
    _txt(pdf, 376, 136.8, datos.get('fecha_mes',  ''), max_width=32)
    _txt(pdf, 520, 136.8, datos.get('fecha_anio', ''), max_width=38)

    # ── Datos de Permiso ──────────────────────────────────────────────────────
    _txt(pdf, 257, 223.5, datos.get('fecha_desde', ''), max_width=112)
    _txt(pdf, 418, 223.5, datos.get('fecha_hasta', ''), max_width=95)
    _txt(pdf, 257, 245.2, datos.get('hora_inicio', ''), max_width=112)
    _txt(pdf, 418, 245.2, datos.get('hora_fin',    ''), max_width=95)
    _txt(pdf, 118, 267.0, str(datos.get('total_dias', '')), max_width=185)

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
    motivo_norm = motivo.lower().strip()
    for label, (cx, ct, ch) in _CHECKS.items():
        if label.lower() in motivo_norm or motivo_norm in label.lower():
            _check(pdf, cx, ct, ch)
            break

    _txt(pdf, 418, 355.2, datos.get('cual',        ''), max_width=95)
    _txt(pdf, 109, 381.8, datos.get('explicacion',  ''), max_width=450)

    # ── Tipo Permiso ──────────────────────────────────────────────────────────
    tipo = datos.get('tipo_permiso', '').lower()
    if 'no' not in tipo and 'remunerado' in tipo:
        _check(pdf, 131.3, 594.5, 12.7)   # Remunerado
    elif 'no' in tipo:
        _check(pdf, 354.4, 593.2, 12.7)   # No Remunerado

    # ── Observaciones ─────────────────────────────────────────────────────────
    obs = datos.get('observaciones', '')
    if obs:
        _OBS_TOPS = [664.1, 690.8, 717.4]
        lineas = textwrap.wrap(obs, width=95)
        for i, linea in enumerate(lineas[:len(_OBS_TOPS)]):
            _txt(pdf, 53, _OBS_TOPS[i], linea, max_width=500)

    # ── Bloque de datos estructurado (invisible) ──────────────────────────────
    # Texto blanco 4pt en la zona inferior — extractible por procesar_pdf.py
    # pero invisible para el lector.
    # reportlab lo ponía en y = 8 + i*5 desde ABAJO → fpdf2: PAGE_H - 8 - i*5 desde ARRIBA
    pdf.set_font('Helvetica', size=4)
    pdf.set_text_color(255, 255, 255)
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
        f'COD_CONC: {datos.get("cod_conc", "")}',
    ]
    for i, linea in enumerate(lineas_datos):
        pdf.text(5, PAGE_H - 8 - i * 5, txt=linea)

    return _overlay_to_page(pdf)


# ═══════════════════════════════════════════════════════════════════════════════
#   CAPA DE TEXTO — VACACIONES  (CM-TH-SV-001)
# ═══════════════════════════════════════════════════════════════════════════════

def _capa_vacaciones(datos: dict):
    """
    Genera la capa con los datos de vacaciones calibrada con las coordenadas
    exactas del FORMATO SOLICITUD DE VACACIONES.pdf (612 × 792 pt, US Letter).
    Devuelve una página pypdf lista para merge_page().

    Estructura del formulario (coordenadas pdfplumber):

    Información del empleado
      Nombre : x=251, y_top=145
      Cédula : x=251, y_top=168
      Cargo  : x=251, y_top=188

    Período Solicitado (top=243 en fila de datos):
      DD-DESDE  x=265   MM-DESDE  x=312   AA-DESDE  x=365
      DD-HASTA  x=415   MM-HASTA  x=467   AA-HASTA  x=520

    Días de Vacaciones: x=370, y_top=285 (size=11)

    Tabla Actividades / Reemplazo / Observaciones
      inicio y_top=375, paso=11, máx 6 líneas
    """
    pdf = _new_overlay()

    # ── Información del empleado ──────────────────────────────────────────────
    _txt(pdf, 251, 145, datos.get('nombre', ''), max_width=290)
    _txt(pdf, 251, 168, datos.get('cedula', ''), max_width=290)
    _txt(pdf, 251, 188, datos.get('cargo',  ''), max_width=290)

    # ── Período Solicitado ────────────────────────────────────────────────────
    def _parse(fecha_str):
        if not fecha_str:
            return '', '', ''
        fecha_str = str(fecha_str).strip()
        try:
            if '-' in fecha_str and len(fecha_str) == 10:
                y, m, d = fecha_str.split('-')
                return d, m, y[2:]
            elif '/' in fecha_str:
                partes = fecha_str.split('/')
                d, m, y = partes[0], partes[1], partes[2]
                return d, m, y[-2:]
        except (ValueError, IndexError):
            pass
        return fecha_str, '', ''

    dd1, mm1, aa1 = _parse(datos.get('fecha_inicio', ''))
    dd2, mm2, aa2 = _parse(datos.get('fecha_fin',    ''))

    _txt(pdf, 265, 243, dd1, size=8, max_width=28)
    _txt(pdf, 312, 243, mm1, size=8, max_width=30)
    _txt(pdf, 365, 243, aa1, size=8, max_width=30)
    _txt(pdf, 415, 243, dd2, size=8, max_width=28)
    _txt(pdf, 467, 243, mm2, size=8, max_width=30)
    _txt(pdf, 520, 243, aa2, size=8, max_width=30)

    # ── Días de Vacaciones disfrutados ────────────────────────────────────────
    _txt(pdf, 370, 285, str(datos.get('dias_vacaciones', '')), size=11, max_width=55)

    # ── Tabla Actividades / Reemplazo / Observaciones ─────────────────────────
    actividades = datos.get('actividades', '')
    reemplazo   = datos.get('reemplazo',   '')
    obs         = datos.get('observaciones', '')

    for i, linea in enumerate(textwrap.wrap(actividades, width=30)[:6]):
        _txt(pdf, 78,  375 + i * 11, linea, size=8, max_width=185)
    for i, linea in enumerate(textwrap.wrap(reemplazo, width=18)[:6]):
        _txt(pdf, 277, 375 + i * 11, linea, size=8, max_width=115)
    for i, linea in enumerate(textwrap.wrap(obs, width=21)[:6]):
        _txt(pdf, 407, 375 + i * 11, linea, size=8, max_width=138)

    # ── Bloque de datos estructurado (invisible) ──────────────────────────────
    pdf.set_font('Helvetica', size=4)
    pdf.set_text_color(255, 255, 255)

    def _fecha_fmt(s):
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
        pdf.text(5, PAGE_H - 8 - i * 5, txt=linea)

    return _overlay_to_page(pdf)


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
        overlay_page = _capa_permiso(datos)
    elif tipo == 'vacaciones':
        overlay_page = _capa_vacaciones(datos)
    else:
        raise ValueError(f'Tipo desconocido: {tipo!r}. Usa "permiso" o "vacaciones".')

    # Abrir la plantilla original como base y fusionar la capa de texto
    reader = PdfReader(pdf_plantilla)
    writer = PdfWriter()

    base_page = reader.pages[0]
    base_page.merge_page(overlay_page)
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

    tipo       = sys.argv[1].lower()
    datos_path = sys.argv[2]
    plantilla  = sys.argv[3]
    salida     = sys.argv[4]

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
