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
         max_width: float = 0, color=(0, 0, 0), lift: float = 4.0):
    """
    Dibuja `valor` en la posición (x, y_top) en coordenadas pdfplumber.
    y_top es el valor `bottom` del texto de la etiqueta correspondiente.
    El parámetro `lift` desplaza el texto hacia arriba (en puntos) para que
    flote con claridad por encima de la línea subrayada del formulario.
    """
    if not valor:
        return
    c.setFont(font, size)
    c.setFillColorRGB(*color)
    rl_y = _y(y_top) + lift          # +lift pt → texto por encima de la línea
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
    # Coordenadas calibradas con pdfplumber sobre la plantilla real.
    # x  = inicio del subrayado del campo (extraído con page.lines).
    # y  = top del subrayado (coordenada pdfplumber, convierte _y + lift).
    # Subrayados obtenidos: Nombre  x0=92.9  top=158.5
    #                       Cédula  x0=415.1 top=158.5
    #                       Cargo   x0=92.9  top=180.2
    #                       Área    x0=415.1 top=180.2
    _txt(c, 95,  158.5, datos.get('nombre', ''),  max_width=280)
    _txt(c, 418, 158.5, datos.get('cedula', ''),  max_width=138)
    _txt(c, 95,  180.2, datos.get('cargo',  ''),  max_width=280)
    _txt(c, 418, 180.2, datos.get('area',   ''),  max_width=138)

    # Fecha de emisión — cada valor sobre su propio subrayado:
    #   Día  subrayado x0=212.0 top=136.8
    #   Mes  subrayado x0=373.1 top=136.8
    #   Año  subrayado x0=517.2 top=136.8
    _txt(c, 215, 136.8, datos.get('fecha_dia',  ''), max_width=32)
    _txt(c, 376, 136.8, datos.get('fecha_mes',  ''), max_width=32)
    _txt(c, 520, 136.8, datos.get('fecha_anio', ''), max_width=38)

    # ── Datos de Permiso ──────────────────────────────────────────────────────
    # Fecha Permiso  De  subrayado x0=254.0 top=223.5
    #               Hasta subrayado x0=415.1 top=223.5
    _txt(c, 257, 223.5, datos.get('fecha_desde', ''), max_width=112)
    _txt(c, 418, 223.5, datos.get('fecha_hasta', ''), max_width=95)
    # Horas          De  subrayado x0=254.0 top=245.2
    #               Hasta subrayado x0=415.1 top=245.2
    _txt(c, 257, 245.2, datos.get('hora_inicio', ''), max_width=112)
    _txt(c, 418, 245.2, datos.get('hora_fin',    ''), max_width=95)
    # Total de Dias — va justo después de la etiqueta (x1≈114), subrayado top=267.0
    _txt(c, 118, 267.0, str(datos.get('total_dias', '')), max_width=185)

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

    # ¿Cuál?  subrayado x0=415.1 top=355.2
    _txt(c, 418, 355.2, datos.get('cual',       ''), max_width=95)
    # Explicación  subrayado x0=92.9 top=381.8
    _txt(c, 109, 381.8, datos.get('explicacion', ''), max_width=450)

    # ── Firmas — Solicitante ──────────────────────────────────────────────────
    # Nombre y cédula del solicitante se omiten intencionalmente:
    # el solicitante los llenará a mano al firmar el documento físico.
    # (Antes se rellenaban automáticamente pero producían superposición con la
    #  etiqueta "Nombre" de la columna "Jefe Inmediato" del mismo recuadro.)

    # ── Tipo Permiso ──────────────────────────────────────────────────────────
    tipo = datos.get('tipo_permiso', '').lower()
    if 'no' not in tipo and 'remunerado' in tipo:
        _check(c, 131.3, 594.5, 12.7)   # Remunerado
    elif 'no' in tipo:
        _check(c, 354.4, 593.2, 12.7)   # No Remunerado

    # ── Observaciones ─────────────────────────────────────────────────────────
    # Tres líneas de escritura en la sección OBSERVACIONES (tops extraídos de
    # la plantilla con pdfplumber): 664.1 / 690.8 / 717.4
    obs = datos.get('observaciones', '')
    if obs:
        _OBS_TOPS = [664.1, 690.8, 717.4]
        lineas = textwrap.wrap(obs, width=95)
        for i, linea in enumerate(lineas[:len(_OBS_TOPS)]):
            _txt(c, 53, _OBS_TOPS[i], linea, max_width=500)

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
        f'COD_CONC: {datos.get("cod_conc", "")}',
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
    (612 × 792 pt, US Letter) mediante pdfplumber.

    Estructura del formulario (coordenadas pdfplumber):

    Información del empleado
      Columna etiquetas : x=71.4  → x=248.0  (divisor físico en x=248.0)
      Columna valores   : x=248.4 → x=552.5  → escribir en x=253
      Nombre row top    : 121.5   | label top=130.1
      Cédula row top    : 145.9   | label top=153.0
      Cargo  row top    : 167.2   | label top=174.0

    Período Solicitado — fila de datos (top=231.1 → bottom=242.5, h=11.4):
      DD-DESDE  x=248.4–289.4  → x=258   MM-DESDE  x=289.9–342.0  → x=305
      AA-DESDE  x=342.4–394.8  → x=358   DD-HASTA  x=395.2–447.1  → x=408
      MM-HASTA  x=447.6–499.8  → x=460   AA-HASTA  x=500.3–552.5  → x=514

    Días de Vacaciones disfrutados
      Recuadro de verificación: x0=329.9 x1=416.9 top=264.1 bottom=286.6
      Escribir en x=355, y_top=279 (centrado vertical en el rect)

    Tabla Actividades / Reemplazo / Observaciones
      Actividades   x=71.4–269.2  (w=197.8) → x=78,  max_width=185, wrap=30
      Reemplazo     x=269.7–399.3 (w=129.6) → x=277, max_width=115, wrap=18
      Observaciones x=399.8–552.5 (w=152.7) → x=407, max_width=138, wrap=21
      Fila 1 datos: top=359.9–398.4 (h=38.5) | Fila 2: top=398.4–441.2 (h=42.8)
      Inicio y_top=368, paso=11, máx 6 líneas
    """

    buf = io.BytesIO()
    c = canvas.Canvas(buf, pagesize=(PAGE_W, PAGE_H))

    # ── Información del empleado ──────────────────────────────────────────────
    # Los valores van en la columna derecha (x=248.4–552.5); escribir en x=253.
    # y_top coincide con el top de la etiqueta correspondiente (misma fila).
    _txt(c, 253, 130.1, datos.get('nombre', ''), max_width=290)
    _txt(c, 253, 153.0, datos.get('cedula', ''), max_width=290)
    _txt(c, 253, 174.0, datos.get('cargo',  ''), max_width=290)

    # ── Período Solicitado ────────────────────────────────────────────────────
    # Parsear fechas en formato YYYY-MM-DD o DD/MM/YYYY → devuelve (DD, MM, AA)
    def _parse(fecha_str):
        if not fecha_str:
            return '', '', ''
        fecha_str = str(fecha_str).strip()
        try:
            if '-' in fecha_str and len(fecha_str) == 10:
                y, m, d = fecha_str.split('-')
                return d, m, y[2:]    # AA = últimos 2 dígitos del año
            elif '/' in fecha_str:
                partes = fecha_str.split('/')
                d, m, y = partes[0], partes[1], partes[2]
                return d, m, y[-2:]
        except (ValueError, IndexError):
            pass
        return fecha_str, '', ''

    dd1, mm1, aa1 = _parse(datos.get('fecha_inicio', ''))
    dd2, mm2, aa2 = _parse(datos.get('fecha_fin',    ''))

    # Fila de datos (top=231.1, bottom=242.5, h=11.4 pt) — tamaño 8pt para que quepa.
    # X de cada celda medido con pdfplumber; se escribe 8–10 pt dentro del borde izq.
    _txt(c, 258, 240, dd1, size=8, max_width=28)
    _txt(c, 305, 240, mm1, size=8, max_width=30)
    _txt(c, 358, 240, aa1, size=8, max_width=30)
    _txt(c, 408, 240, dd2, size=8, max_width=28)
    _txt(c, 460, 240, mm2, size=8, max_width=30)
    _txt(c, 514, 240, aa2, size=8, max_width=30)

    # ── Días de Vacaciones disfrutados ────────────────────────────────────────
    # El recuadro está en x=329.9–416.9, top=264.1–286.6 (h=22.5 pt).
    # Con y_top=279 y lift=4, la línea base cae en pdfplumber y≈275 = centro del rect.
    _txt(c, 355, 279, str(datos.get('dias_vacaciones', '')), size=11, max_width=55)

    # ── Tabla Actividades / Reemplazo / Observaciones ─────────────────────────
    # Columnas calibradas con ancho exacto; inicio en primera fila de datos (y=368).
    # Paso de 11 pt (fuente 8 pt + interlineado 3 pt), 6 líneas → cubre ambas filas.
    actividades = datos.get('actividades', '')
    reemplazo   = datos.get('reemplazo',   '')
    obs         = datos.get('observaciones', '')

    for i, linea in enumerate(textwrap.wrap(actividades, width=30)[:6]):
        _txt(c, 78,  368 + i * 11, linea, size=8, max_width=185)
    for i, linea in enumerate(textwrap.wrap(reemplazo, width=18)[:6]):
        _txt(c, 277, 368 + i * 11, linea, size=8, max_width=115)
    for i, linea in enumerate(textwrap.wrap(obs, width=21)[:6]):
        _txt(c, 407, 368 + i * 11, linea, size=8, max_width=138)

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
