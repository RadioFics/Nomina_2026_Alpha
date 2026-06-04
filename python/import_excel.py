"""
import_excel.py  —  Novedades Nómina → MS SQL Server
======================================================
Hojas importadas:
  Maestro Original       → dbo.Empleados          (76 cols, MERGE/UPSERT completo)
  Ocasionales            → dbo.NovedadesOcasionales
  Fijas                  → dbo.NovedadesFijas
  Ausentismos Vacaciones → dbo.Ausentismos
  Cambios Maestro        → dbo.CambiosMaestro
  Cambios e Ingresos     → dbo.CambiosIngresos

Requisitos:   pip install pandas openpyxl pyodbc

Uso (Windows Auth):
  python import_excel.py --file archivo.xlsx --server localhost --periodo "2025-03-01/2025-03-15"

Uso (SQL Auth):
  python import_excel.py --file archivo.xlsx --server 192.168.1.10 --user sa --password miPass --periodo "2025-03-01/2025-03-15"

Modo validación (sin insertar):
  python import_excel.py --file archivo.xlsx --server localhost --dryrun
"""

import pandas as pd
import pyodbc
import argparse
import sys
import math
from datetime import datetime

# ─── ARGUMENTOS ──────────────────────────────────────────────────────────────
parser = argparse.ArgumentParser(description='Importa novedades de nómina desde Excel a SQL Server')
parser.add_argument('--file',     required=True)
parser.add_argument('--server',   default='localhost')
parser.add_argument('--port',     default='1433')
parser.add_argument('--db',       default='NovedadesNomina')
parser.add_argument('--user',     default='')
parser.add_argument('--password', default='')
parser.add_argument('--periodo',  default='')
parser.add_argument('--usuario',  default='SISTEMA')
parser.add_argument('--dryrun',   action='store_true')
args = parser.parse_args()

# ─── CONEXIÓN ────────────────────────────────────────────────────────────────
def conectar():
    if args.user:
        cs = (f'DRIVER={{ODBC Driver 18 for SQL Server}};SERVER={args.server},{args.port};'
              f'DATABASE={args.db};UID={args.user};PWD={args.password};TrustServerCertificate=yes;')
    else:
        cs = (f'DRIVER={{ODBC Driver 18 for SQL Server}};SERVER={args.server},{args.port};'
              f'DATABASE={args.db};Trusted_Connection=yes;TrustServerCertificate=yes;')
    print(f"Conectando a {args.server}:{args.port}/{args.db} ...")
    conn = pyodbc.connect(cs)
    print("Conexion exitosa\n")
    return conn

# ─── HELPERS ─────────────────────────────────────────────────────────────────
def safe(val):
    if val is None:
        return None
    s = str(val).strip()
    return None if s in ('', 'nan', 'None', 'NA', 'NaN', 'NaT') else s

def safe_num(val):
    try:
        v = float(val)
        return None if math.isnan(v) else v
    except:
        return None

def safe_date(val):
    if val is None:
        return None
    s = str(val).strip()
    if s in ('', 'nan', 'None', 'NA', 'NaT', '0', '0000'):
        return None
    try:
        if isinstance(val, (pd.Timestamp, datetime)):
            return val.date()
        return pd.to_datetime(s, dayfirst=True).date()
    except:
        return None

# ─── MAESTRO ORIGINAL (todas las 76 columnas) ────────────────────────────────
def importar_empleados(conn):
    df = pd.read_excel(args.file, sheet_name='Maestro Original', header=1)
    df = df[df['Cedula'].apply(lambda x: safe(x) is not None and safe(x) != 'Cedula')]
    total = len(df)
    print(f"Maestro Original: {total} empleados")

    cursor = conn.cursor()
    ok = err = 0

    for _, r in df.iterrows():
        cedula = safe(r.get('Cedula'))
        if not cedula:
            continue

        # Los 66 campos de datos (sin Id y sin FechaCreacion/FechaModificacion)
        campos = [
            safe(r.get('Codigo')),
            safe(r.get('Codigo Alterno')),
            safe(r.get('Tipo\nDocumento')),
            safe(r.get('Nombre')),
            safe(r.get('Sexo')),
            safe(r.get('grupo \nsanguineo')),
            safe(r.get('factor\nrhh')),
            safe(r.get('Estado Civil')),
            safe(r.get('ciudad expedicion')),
            safe_num(r.get('Hijos')),
            safe_date(r.get('Fecha Nacimiento')),
            safe(r.get('Ciudad')),
            safe(r.get('Telefono1')),
            safe(r.get('Telefono2')),
            safe(r.get('Direccion')),
            safe(r.get('Correo')),
            safe(r.get('Cargo')),
            safe_num(r.get('%')),
            safe_num(r.get('sueldo  antes flex')),
            safe_num(r.get('Valor Hora')),
            safe(r.get('Tipo Cuenta')),
            safe(r.get('Banco')),
            safe(r.get('Numero Cta')),
            safe(r.get('Sucursal')),
            safe(r.get('Centro Costo')),
            safe(r.get('Centro costos')),
            safe(r.get('Codigo\nCompañia')),
            safe(r.get('Cuenta de Gasto')),
            safe(r.get('Regimen')),
            safe(r.get('Trabaja Sabado')),
            safe(r.get('Clase Salario')),
            safe(r.get('Pensionado')),
            safe(r.get('Aplica ley 1393')),
            safe(r.get('Modo Liquidacion')),
            safe(r.get('Tipo Liquidacion')),
            safe(r.get('Extranjero')),
            safe(r.get('Reside Extrnjero')),
            safe_date(r.get('Fecha Ingreso')),
            safe_date(r.get('Fecha Retiro')),
            safe_date(r.get('Fecha Final')),
            safe(r.get('Causa Retiro')),
            safe(r.get('Contrato')),
            safe(r.get('Tipo Contrato')),
            safe_num(r.get('% Rete')),
            safe_num(r.get('Valor Deduccion 1\nVIVIENDA')),
            safe_num(r.get('Valor Deduccion2\nSALUD(OTROS)')),
            safe_num(r.get('Valor Deduccion3\nDEPENDIENTES\n')),
            safe(r.get('Declara\n Renta')),
            safe_num(r.get('Promedio Salud')),
            safe(r.get('EPS')),
            safe(r.get('AFP')),
            safe(r.get('CAJA')),
            safe(r.get('ARP')),
            safe(r.get('CESANTIAS')),
            safe_num(r.get('Riesgo')),
            safe_num(r.get('horas mes')),
            safe_num(r.get('Dias Vacaciones')),
            safe(r.get('CLASIFICADOR 1')),
            safe(r.get('Clasificador1Nom')),
            safe(r.get('Sub Area')),          # puede venir con tilde o sin
            safe(r.get('Sub Área', r.get('Sub Area'))),
            safe(r.get('Nivel Cargo')),
            safe(r.get('Driver Variable')),
            safe(r.get('Clasificador7')),
            safe(r.get('Clasificador7Nom')),
            safe(r.get('Pago X Dias')),
            safe(r.get('Relacion Sindical', r.get('Relación Sindical'))),
        ]
        # Limitar a 66 campos exactos que coinciden con el INSERT
        campos = campos[:66]

        try:
            ph_update = ',\n                        '.join([
                'Codigo=?','CodigoAlterno=?','TipoDocumento=?','Nombre=?','Sexo=?',
                'GrupoSanguineo=?','FactorRH=?','EstadoCivil=?','CiudadExpedicion=?',
                'Hijos=?','FechaNacimiento=?','Ciudad=?','Telefono1=?','Telefono2=?',
                'Direccion=?','Correo=?','Cargo=?','Porcentaje=?','Salario=?',
                'ValorHora=?','TipoCuenta=?','Banco=?','NumeroCuenta=?','Sucursal=?',
                'CentroCosto=?','CentroCostos=?','CodigoCompania=?','CuentaGasto=?',
                'Regimen=?','TrabajaSabado=?','ClaseSalario=?','Pensionado=?',
                'AplicaLey1393=?','ModoLiquidacion=?','TipoLiquidacion=?',
                'Extranjero=?','ResideExtranjero=?','FechaIngreso=?','FechaRetiro=?',
                'FechaFinal=?','CausaRetiro=?','Contrato=?','TipoContrato=?',
                'PorcentajeRete=?','ValorDeduccionVivienda=?','ValorDeduccionSalud=?',
                'ValorDeduccionDependientes=?','DeclaraRenta=?','PromedioSalud=?',
                'EPS=?','AFP=?','Caja=?','ARP=?','Cesantias=?','Riesgo=?',
                'HorasMes=?','DiasVacaciones=?','Clasificador1=?','Clasificador1Nom=?',
                'SubArea=?','SubAreaNom=?','NivelCargo=?','DriverVariable=?',
                'Clasificador7=?','Clasificador7Nom=?','PagoXDias=?','RelacionSindical=?',
                'FechaModificacion=GETDATE()'
            ])

            col_insert = (
                'Cedula,Codigo,CodigoAlterno,TipoDocumento,Nombre,Sexo,'
                'GrupoSanguineo,FactorRH,EstadoCivil,CiudadExpedicion,Hijos,'
                'FechaNacimiento,Ciudad,Telefono1,Telefono2,Direccion,Correo,'
                'Cargo,Porcentaje,Salario,ValorHora,TipoCuenta,Banco,'
                'NumeroCuenta,Sucursal,CentroCosto,CentroCostos,CodigoCompania,'
                'CuentaGasto,Regimen,TrabajaSabado,ClaseSalario,Pensionado,'
                'AplicaLey1393,ModoLiquidacion,TipoLiquidacion,Extranjero,'
                'ResideExtranjero,FechaIngreso,FechaRetiro,FechaFinal,CausaRetiro,'
                'Contrato,TipoContrato,PorcentajeRete,'
                'ValorDeduccionVivienda,ValorDeduccionSalud,ValorDeduccionDependientes,'
                'DeclaraRenta,PromedioSalud,EPS,AFP,Caja,ARP,Cesantias,Riesgo,'
                'HorasMes,DiasVacaciones,Clasificador1,Clasificador1Nom,'
                'SubArea,SubAreaNom,NivelCargo,DriverVariable,'
                'Clasificador7,Clasificador7Nom,PagoXDias,RelacionSindical'
            )
            ph_insert = ','.join(['?'] * 67)  # cedula + 66 campos

            sql = f"""
                MERGE dbo.Empleados AS tgt
                USING (SELECT ? AS Cedula) AS src ON tgt.Cedula = src.Cedula
                WHEN MATCHED THEN UPDATE SET
                    {ph_update}
                WHEN NOT MATCHED THEN INSERT ({col_insert})
                VALUES ({ph_insert});
            """
            cursor.execute(sql, [cedula] + campos + [cedula] + campos)
            ok += 1
        except Exception as e:
            print(f"  Error cedula {cedula}: {e}")
            err += 1

    conn.commit()
    print(f"  OK: {ok} empleados  |  Errores: {err}\n")

# ─── OCASIONALES ─────────────────────────────────────────────────────────────
def importar_ocasionales(conn):
    df = pd.read_excel(args.file, sheet_name='Ocasionales', header=7)
    df = df.iloc[:, 1:]
    df.columns = ['Identificacion','Nombre','Novedad','TipoNovedad','Cantidad','Valor','Observaciones']
    df = df[df['Identificacion'].apply(lambda x: safe(x) is not None)]
    print(f"Ocasionales: {len(df)} registros")
    cursor = conn.cursor()
    ok = err = 0
    for _, r in df.iterrows():
        try:
            cursor.execute(
                "INSERT INTO dbo.NovedadesOcasionales "
                "(Identificacion,Nombre,Novedad,TipoNovedad,Cantidad,Valor,Observaciones,PeriodoNomina,UsuarioRegistro) "
                "VALUES (?,?,?,?,?,?,?,?,?)",
                safe(r['Identificacion']), safe(r['Nombre']), safe(r['Novedad']),
                safe(r['TipoNovedad']), safe_num(r['Cantidad']), safe_num(r['Valor']),
                safe(r['Observaciones']), args.periodo, args.usuario)
            ok += 1
        except Exception as e:
            print(f"  Error ocasional {r.get('Identificacion','?')}: {e}")
            err += 1
    conn.commit()
    print(f"  OK: {ok}  |  Errores: {err}\n")

# ─── FIJAS ───────────────────────────────────────────────────────────────────
def importar_fijas(conn):
    df = pd.read_excel(args.file, sheet_name='Fijas', header=7)
    df = df.iloc[:, 1:]
    df.columns = ['Identificacion','Nombre','Novedad','TipoNovedad','Cantidad','Valor',
                  'Observaciones','FechaInicial','FechaFinal','Aplicacion','Cuenta','Cuotas']
    df = df[df['Identificacion'].apply(lambda x: safe(x) is not None)]
    print(f"Fijas: {len(df)} registros")
    cursor = conn.cursor()
    ok = err = 0
    for _, r in df.iterrows():
        try:
            cursor.execute(
                "INSERT INTO dbo.NovedadesFijas "
                "(Identificacion,Nombre,Novedad,TipoNovedad,Cantidad,Valor,"
                "FechaInicial,FechaFinal,Aplicacion,Cuenta,Cuotas,Observaciones,PeriodoNomina,UsuarioRegistro) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?)",
                safe(r['Identificacion']), safe(r['Nombre']), safe(r['Novedad']),
                safe(r['TipoNovedad']), safe_num(r['Cantidad']), safe_num(r['Valor']),
                safe_date(r['FechaInicial']), safe_date(r['FechaFinal']),
                safe(r['Aplicacion']), safe(r['Cuenta']), safe_num(r['Cuotas']),
                safe(r['Observaciones']), args.periodo, args.usuario)
            ok += 1
        except Exception as e:
            print(f"  Error fija {r.get('Identificacion','?')}: {e}")
            err += 1
    conn.commit()
    print(f"  OK: {ok}  |  Errores: {err}\n")

# ─── AUSENTISMOS ─────────────────────────────────────────────────────────────
def importar_ausentismos(conn):
    df = pd.read_excel(args.file, sheet_name='Ausentismos Vacaciones', header=8)
    df = df.iloc[:, 1:]
    df.columns = ['Identificacion','Nombre','Ausentismo','FechaInicial','FechaFinal',
                  'DiasTotales','Diagnostico','Prorroga','Observaciones']
    df = df[df['Identificacion'].apply(lambda x: safe(x) is not None)]
    print(f"Ausentismos: {len(df)} registros")
    cursor = conn.cursor()
    ok = err = 0
    for _, r in df.iterrows():
        try:
            cursor.execute(
                "INSERT INTO dbo.Ausentismos "
                "(Identificacion,Nombre,TipoAusentismo,FechaInicial,FechaFinal,"
                "DiasTotales,Diagnostico,Prorroga,Observaciones,PeriodoNomina,UsuarioRegistro) "
                "VALUES (?,?,?,?,?,?,?,?,?,?,?)",
                safe(r['Identificacion']), safe(r['Nombre']), safe(r['Ausentismo']),
                safe_date(r['FechaInicial']), safe_date(r['FechaFinal']),
                safe_num(r['DiasTotales']), safe(r['Diagnostico']),
                safe_date(r['Prorroga']), safe(r['Observaciones']),
                args.periodo, args.usuario)
            ok += 1
        except Exception as e:
            print(f"  Error ausentismo {r.get('Identificacion','?')}: {e}")
            err += 1
    conn.commit()
    print(f"  OK: {ok}  |  Errores: {err}\n")

# ─── CAMBIOS MAESTRO ─────────────────────────────────────────────────────────
def importar_cambios_maestro(conn):
    df = pd.read_excel(args.file, sheet_name='Cambios Maestro', header=3)
    df.columns = ['Valor','Cedula','Nombre','TipoDocumento','CiudadExpedicion',
                  'EstadoCivil','FechaNacimiento','Ciudad','Col1','Col2']
    df = df[df['Cedula'].apply(lambda x: safe(x) is not None and safe(x) != 'Cedula')]
    print(f"Cambios Maestro: {len(df)} registros")
    cursor = conn.cursor()
    ok = err = 0
    for _, r in df.iterrows():
        try:
            cursor.execute(
                "INSERT INTO dbo.CambiosMaestro "
                "(Cedula,Nombre,TipoDocumento,CiudadExpedicion,EstadoCivil,"
                "FechaNacimiento,Ciudad,PeriodoNomina,UsuarioRegistro) "
                "VALUES (?,?,?,?,?,?,?,?,?)",
                safe(r['Cedula']), safe(r['Nombre']), safe(r['TipoDocumento']),
                safe(r['CiudadExpedicion']), safe(r['EstadoCivil']),
                safe_date(r['FechaNacimiento']), safe(r['Ciudad']),
                args.periodo, args.usuario)
            ok += 1
        except Exception as e:
            print(f"  Error cambio maestro {r.get('Cedula','?')}: {e}")
            err += 1
    conn.commit()
    print(f"  OK: {ok}  |  Errores: {err}\n")

# ─── CAMBIOS E INGRESOS ───────────────────────────────────────────────────────
def importar_cambios_ingresos(conn):
    df = pd.read_excel(args.file, sheet_name='Cambios e Ingresos', header=7)
    df = df.iloc[:, 1:]
    df.columns = ['Identificacion','Nombre','Cambio','FechaInicial','CambioA','Observaciones']
    df = df[df['Identificacion'].apply(lambda x: safe(x) is not None)]
    print(f"Cambios e Ingresos: {len(df)} registros")
    cursor = conn.cursor()
    ok = err = 0
    for _, r in df.iterrows():
        try:
            cursor.execute(
                "INSERT INTO dbo.CambiosIngresos "
                "(Identificacion,Nombre,TipoCambio,FechaInicial,CambioA,"
                "Observaciones,PeriodoNomina,UsuarioRegistro) "
                "VALUES (?,?,?,?,?,?,?,?)",
                safe(r['Identificacion']), safe(r['Nombre']), safe(r['Cambio']),
                safe_date(r['FechaInicial']), safe(r['CambioA']),
                safe(r['Observaciones']), args.periodo, args.usuario)
            ok += 1
        except Exception as e:
            print(f"  Error cambio/ingreso {r.get('Identificacion','?')}: {e}")
            err += 1
    conn.commit()
    print(f"  OK: {ok}  |  Errores: {err}\n")

# ─── MAIN ────────────────────────────────────────────────────────────────────
if __name__ == '__main__':
    print("=" * 65)
    print("  IMPORTADOR NOVEDADES NOMINA  ->  SQL Server")
    print("=" * 65)
    print(f"  Archivo : {args.file}")
    print(f"  Servidor: {args.server}:{args.port}/{args.db}")
    print(f"  Periodo : {args.periodo or '(no especificado)'}")
    print(f"  Modo    : {'DRY RUN' if args.dryrun else 'PRODUCCION'}")
    print("=" * 65 + "\n")

    if args.dryrun:
        print("Modo DRY RUN: validando archivo sin insertar datos...\n")
        for sheet, hdr in [('Maestro Original',1),('Ocasionales',7),('Fijas',7),
                           ('Ausentismos Vacaciones',8),('Cambios Maestro',3),('Cambios e Ingresos',7)]:
            try:
                df_tmp = pd.read_excel(args.file, sheet_name=sheet, header=hdr)
                print(f"  [{sheet}] -> {len(df_tmp)} filas")
            except Exception as e:
                print(f"  [{sheet}] -> ERROR: {e}")
        sys.exit(0)

    try:
        conn = conectar()
        importar_empleados(conn)
        importar_ocasionales(conn)
        importar_fijas(conn)
        importar_ausentismos(conn)
        importar_cambios_maestro(conn)
        importar_cambios_ingresos(conn)
        conn.close()
        print("=" * 65)
        print("  Importacion completada exitosamente")
        print("=" * 65)
    except pyodbc.Error as e:
        print(f"\nError ODBC: {e}")
        print("Instale 'ODBC Driver 18 for SQL Server':")
        print("  https://learn.microsoft.com/sql/connect/odbc/download-odbc-driver-for-sql-server")
        sys.exit(1)
    except Exception as e:
        print(f"\nError inesperado: {e}")
        import traceback; traceback.print_exc()
        sys.exit(1)
