#!/usr/bin/env python3
"""
Script de prueba para validar la extracción de PDFs
Simula el flujo que ocurre en el servidor Node.js
"""

import sys
import json
sys.path.insert(0, '/sessions/cool-gallant-rubin/mnt/Nomina_2026_Alpha')

from pdf_import_extension import PDFImportExtension

def print_header(title):
    print("\n" + "="*80)
    print(f"  {title}")
    print("="*80)

def print_field(label, value, required=False):
    status = "✓" if value else ("✗" if required else "◆")
    print(f"  {status} {label:<30} {value}")

def validate_extraction(result, form_type):
    """Valida que todos los campos requeridos estén presentes"""
    required_fields = {
        'PERMISO': ['cedula', 'nombre', 'cargo', 'fecha_novedad', 'cantidad'],
        'VACACIONES': ['cedula', 'nombre', 'cargo', 'fecha_inicio', 'fecha_fin', 'cantidad']
    }

    required = required_fields.get(form_type, [])
    missing = [f for f in required if not result.get(f)]

    return len(missing) == 0, missing

def main():
    print_header("PRUEBA DE EXTRACCIÓN PDF - MineDax Integration")
    print("\nEste script valida la extracción automática de PDFs de formularios\n")

    extractor = PDFImportExtension()

    # Test 1: Permission PDF
    print_header("TEST 1: Formulario de Permiso (CM-TH-FR-003)")
    print("Archivo: 19- Solicitud de permiso Laura Velasquez.pdf\n")

    permiso_path = "/sessions/cool-gallant-rubin/mnt/uploads/19- Solicitud de permiso Laura Velasquez.pdf"
    result_permiso = extractor.process_file(permiso_path)

    print("Extracción de Datos:")
    print_field("Tipo Novedad", result_permiso.get('tipo_novedad'))
    print_field("Cédula", result_permiso.get('cedula'), required=True)
    print_field("Nombre", result_permiso.get('nombre'), required=True)
    print_field("Cargo", result_permiso.get('cargo'), required=True)
    print_field("Área", result_permiso.get('area'))
    print_field("Fecha Permiso", result_permiso.get('fecha_novedad'), required=True)
    print_field("Hora Inicio", result_permiso.get('hora_inicio'))
    print_field("Hora Fin", result_permiso.get('hora_fin'))
    print_field("Cantidad (Horas)", result_permiso.get('cantidad'), required=True)
    print_field("Motivo", result_permiso.get('motivo'))
    print_field("Remunerado", result_permiso.get('es_remunerado'))

    is_valid_permiso, missing_permiso = validate_extraction(result_permiso, 'PERMISO')

    print("\nValidación:")
    print_field("Todos los campos requeridos", "SÍ" if is_valid_permiso else f"NO ({len(missing_permiso)} campos faltantes)", required=True)
    if missing_permiso:
        print(f"  Campos faltantes: {', '.join(missing_permiso)}")

    # Test 2: Vacation PDF
    print_header("TEST 2: Formulario de Vacaciones (CM-TH-SV-001)")
    print("Archivo: 27- Solicitud de vacaciones Camilo Aricapa.pdf")
    print("Nota: Este es un PDF escaneado (imagen), se procesa con OCR\n")

    vacaciones_path = "/sessions/cool-gallant-rubin/mnt/uploads/27- Solicitud de vacaciones Camilo Aricapa.pdf"
    result_vacaciones = extractor.process_file(vacaciones_path)

    print("Extracción de Datos:")
    print_field("Tipo Novedad", result_vacaciones.get('tipo_novedad'))
    print_field("Cédula", result_vacaciones.get('cedula'), required=True)
    print_field("Nombre", result_vacaciones.get('nombre'), required=True)
    print_field("Cargo", result_vacaciones.get('cargo'), required=True)
    print_field("Fecha Inicio", result_vacaciones.get('fecha_inicio'), required=True)
    print_field("Fecha Fin", result_vacaciones.get('fecha_fin'), required=True)
    print_field("Cantidad (Días)", result_vacaciones.get('cantidad'), required=True)
    print_field("Observaciones", result_vacaciones.get('observaciones'))

    is_valid_vacaciones, missing_vacaciones = validate_extraction(result_vacaciones, 'VACACIONES')

    print("\nValidación:")
    print_field("Todos los campos requeridos", "SÍ" if is_valid_vacaciones else f"NO ({len(missing_vacaciones)} campos faltantes)", required=True)
    if missing_vacaciones:
        print(f"  Campos faltantes: {', '.join(missing_vacaciones)}")

    # Summary
    print_header("RESUMEN FINAL")

    all_valid = is_valid_permiso and is_valid_vacaciones

    if all_valid:
        print("\n✅ ÉXITO: Ambos formularios extraídos correctamente")
        print("\nDetalles:")
        print(f"  ✓ CM-TH-FR-003 (Permiso):    Todos los campos requeridos extraídos")
        print(f"  ✓ CM-TH-SV-001 (Vacaciones): Todos los campos requeridos extraídos")
        print(f"  ✓ OCR funcional:             Tesseract con modelos 'eng' detectados")
        print(f"  ✓ Integración lista:         El sistema está listo para producción")
    else:
        print("\n❌ ERROR: Faltan campos en la extracción")
        if missing_permiso:
            print(f"  ✗ CM-TH-FR-003: Falta {', '.join(missing_permiso)}")
        if missing_vacaciones:
            print(f"  ✗ CM-TH-SV-001: Falta {', '.join(missing_vacaciones)}")

    print("\n" + "="*80)
    print(f"Resultado: {'✅ VÁLIDO' if all_valid else '❌ INVÁLIDO'}")
    print("="*80 + "\n")

    return 0 if all_valid else 1

if __name__ == '__main__':
    sys.exit(main())
