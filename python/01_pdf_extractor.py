"""
Extractor de datos de solicitudes de permiso y vacaciones desde PDFs
Integración con MineDax - Tablas: NO_NOVED, NO_AUSEN, NO_CONCE
"""

import pdfplumber
import re
from datetime import datetime
from typing import Dict, List, Tuple
import pandas as pd

class PDFExtractor:
    def __init__(self):
        self.extracted_data = []

    def extract_permission(self, pdf_path: str) -> Dict:
        """
        Extrae datos de solicitud de PERMISO (CM-TH-FR-003)
        """
        with pdfplumber.open(pdf_path) as pdf:
            page = pdf.pages[0]
            text = page.extract_text()

        data = {
            'tipo_novedad': 'PERMISO',
            'cedula': None,
            'nombre': None,
            'cargo': None,
            'area': None,
            'fecha_permiso': None,
            'hora_inicio': None,
            'hora_fin': None,
            'total_horas': None,
            'motivo': None,
            'es_remunerado': None,
            'observaciones': None,
            'jefe_nombre': None,
            'jefe_cedula': None,
        }

        # Extraer cédula (número de 10 dígitos)
        cedula_match = re.search(r'\b(\d{10})\b', text)
        if cedula_match:
            data['cedula'] = cedula_match.group(1)

        # Extraer nombre (después de "Nombre:")
        nombre_match = re.search(r'Nombre:\s*([A-Za-záéíóúñÁÉÍÓÚÑ\s]+?)(?:\s+Cedula:|$)', text)
        if nombre_match:
            data['nombre'] = nombre_match.group(1).strip()

        # Extraer cargo y área
        cargo_match = re.search(r'Cargo:\s*([A-Za-záéíóúñÁÉÍÓÚÑ\s]+?)(?:\s+Area:|$)', text)
        if cargo_match:
            data['cargo'] = cargo_match.group(1).strip()

        area_match = re.search(r'Area:\s*([A-Za-záéíóúñÁÉÍÓÚÑ\s]+?)(?:\n|$)', text)
        if area_match:
            data['area'] = area_match.group(1).strip()

        # Extraer fecha del permiso (formato DD-MM-YYYY)
        fecha_match = re.search(r'Fecha Permiso:\s*([0-9]{2}-[0-9]{2}-[0-9]{4})', text)
        if fecha_match:
            data['fecha_permiso'] = fecha_match.group(1)

        # Extraer horas (formato "HH:MM Am/Pm")
        hora_inicio_match = re.search(r'De:\s*([0-9]{1,2}:[0-9]{2}\s*(?:Am|PM|am|pm))', text)
        if hora_inicio_match:
            data['hora_inicio'] = hora_inicio_match.group(1).strip()

        hora_fin_match = re.search(r'Hasta:\s*([0-9]{1,2}:[0-9]{2}\s*(?:Am|PM|am|pm))', text)
        if hora_fin_match:
            data['hora_fin'] = hora_fin_match.group(1).strip()

        # Extraer total de horas
        horas_match = re.search(r'Total de Dias:\s*(\d+)\s*(?:Horas|Dias)', text)
        if horas_match:
            data['total_horas'] = int(horas_match.group(1))

        # Identificar motivo del permiso (checkboxes marcados)
        motivos = {
            'Estudio': 'ESTUDIO',
            'Calamidad Domestica': 'CALAMIDAD_DOMESTICA',
            'Medico': 'MEDICO',
            'Vacaciones': 'VACACIONES',
            'Compensatorio': 'COMPENSATORIO',
            'Fuerza Mayor': 'FUERZA_MAYOR',
            'Otra Causa': 'OTRA_CAUSA'
        }

        for motivo_text, motivo_code in motivos.items():
            if re.search(motivo_text, text) and '✓' in text or '✕' in text:
                if re.search(rf'{motivo_text}.*?✓|✕.*?{motivo_text}', text, re.IGNORECASE | re.DOTALL):
                    data['motivo'] = motivo_code
                    break

        # Extraer observaciones
        obs_match = re.search(r'OBSERVACIONES\s*(.+?)(?:SOLICITANTE|$)', text, re.DOTALL)
        if obs_match:
            data['observaciones'] = obs_match.group(1).strip()

        # Extraer jefe inmediato
        jefe_match = re.search(r'JEFE INMEDIATO\s*Nombre\s*([A-Za-záéíóúñÁÉÍÓÚÑ\s]+?)(?:\s+Cedula:|$)', text)
        if jefe_match:
            data['jefe_nombre'] = jefe_match.group(1).strip()

        jefe_cedula_match = re.search(r'JEFE INMEDIATO.*?Cedula\s*(\d{10})', text, re.DOTALL)
        if jefe_cedula_match:
            data['jefe_cedula'] = jefe_cedula_match.group(1)

        # Remunerado
        data['es_remunerado'] = 'Remunerado' in text

        return data

    def extract_vacation(self, pdf_path: str) -> Dict:
        """
        Extrae datos de solicitud de VACACIONES (CM-TH-SV-001)
        """
        with pdfplumber.open(pdf_path) as pdf:
            page = pdf.pages[0]
            text = page.extract_text()

        data = {
            'tipo_novedad': 'VACACIONES',
            'cedula': None,
            'nombre': None,
            'cargo': None,
            'area': None,
            'fecha_inicio': None,
            'fecha_fin': None,
            'dias_disfrutados': None,
            'observaciones': None,
            'jefe_nombre': None,
            'jefe_cedula': None,
        }

        # Extraer cédula
        cedula_match = re.search(r'(?:No\.|Ciudadania|cedula).*?(\d{10})', text, re.IGNORECASE)
        if cedula_match:
            data['cedula'] = cedula_match.group(1)

        # Extraer nombre
        nombre_match = re.search(r'(?:Nombre|Apellidos).*?([A-Za-záéíóúñÁÉÍÓÚÑ\s]+?)(?:\s+Cedula|\n)', text, re.IGNORECASE)
        if nombre_match:
            data['nombre'] = nombre_match.group(1).strip()

        # Extraer cargo
        cargo_match = re.search(r'Cargo\s*(?:[:=])?\s*([A-Za-záéíóúñÁÉÍÓÚÑ\s]+?)(?:\n|$)', text)
        if cargo_match:
            data['cargo'] = cargo_match.group(1).strip()

        # Extraer fechas (formato DD/MM/YYYY o DD-MM-YYYY)
        fecha_match = re.search(r'(\d{2})[\/-](\d{2})[\/-](\d{4}).*?(\d{2})[\/-](\d{2})[\/-](\d{4})', text)
        if fecha_match:
            d1, m1, a1, d2, m2, a2 = fecha_match.groups()
            data['fecha_inicio'] = f"{d1}/{m1}/{a1}"
            data['fecha_fin'] = f"{d2}/{m2}/{a2}"

        # Extraer días disfrutados
        dias_match = re.search(r'Dias de Vacaciones disfrutados:\s*(\d+)', text)
        if dias_match:
            data['dias_disfrutados'] = int(dias_match.group(1))

        # Extraer observaciones
        obs_match = re.search(r'Observaciones\s*(.+?)(?:Firma|$)', text, re.DOTALL)
        if obs_match:
            data['observaciones'] = obs_match.group(1).strip()

        # Extraer jefe
        jefe_match = re.search(r'Jefe.*?Nombre\s*([A-Za-záéíóúñÁÉÍÓÚÑ\s]+?)(?:\n|$)', text, re.IGNORECASE)
        if jefe_match:
            data['jefe_nombre'] = jefe_match.group(1).strip()

        return data

    def extract_from_pdf(self, pdf_path: str) -> Dict:
        """
        Detecta automáticamente el tipo de formulario y extrae datos
        """
        with pdfplumber.open(pdf_path) as pdf:
            text = pdf.pages[0].extract_text()

        if 'VACACIONES' in text.upper() and 'CM-TH-SV-001' in text:
            return self.extract_vacation(pdf_path)
        elif 'PERMISO' in text.upper() and 'CM-TH-FR-003' in text:
            return self.extract_permission(pdf_path)
        else:
            raise ValueError("Tipo de formulario no reconocido")

# Ejemplo de uso
if __name__ == "__main__":
    extractor = PDFExtractor()

    # Prueba con permiso
    perms_file = '/sessions/cool-gallant-rubin/mnt/uploads/19- Solicitud de permiso Laura Velasquez.pdf'
    perms_data = extractor.extract_from_pdf(perms_file)
    print("DATOS EXTRAÍDOS - PERMISO:")
    for k, v in perms_data.items():
        print(f"  {k}: {v}")

    print("\n" + "="*60 + "\n")

    # Prueba con vacaciones
    vacs_file = '/sessions/cool-gallant-rubin/mnt/uploads/27- Solicitud de vacaciones Camilo Aricapa.pdf'
    vacs_data = extractor.extract_from_pdf(vacs_file)
    print("DATOS EXTRAÍDOS - VACACIONES:")
    for k, v in vacs_data.items():
        print(f"  {k}: {v}")
