"""
Manejador de base de datos MineDax (SQL Server)
Validación de duplicados y inserción de datos en NO_NOVED, NO_AUSEN, NO_CONCE
"""

import pyodbc
import pandas as pd
from datetime import datetime
from typing import Dict, Tuple, List

class MineDaxHandler:
    def __init__(self, server: str, database: str, username: str = None, password: str = None):
        """
        Inicializa la conexión a SQL Server
        Si no se proporcionan credenciales, usa autenticación de Windows
        """
        self.server = server
        self.database = database
        self.connection = None
        self.cursor = None
        self._connect(username, password)

    def _connect(self, username: str = None, password: str = None):
        """Establece conexión con SQL Server"""
        try:
            if username and password:
                conn_str = f'DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={self.server};DATABASE={self.database};UID={username};PWD={password}'
            else:
                conn_str = f'DRIVER={{ODBC Driver 17 for SQL Server}};SERVER={self.server};DATABASE={self.database};Trusted_Connection=yes'

            self.connection = pyodbc.connect(conn_str)
            self.cursor = self.connection.cursor()
            print(f"✓ Conexión establecida a {self.database}")
        except Exception as e:
            print(f"✗ Error de conexión: {e}")
            raise

    def check_duplicate_permission(self, cedula: str, fecha: str, tipo_novedad: str) -> Tuple[bool, Dict]:
        """
        Verifica si existe un registro duplicado en NO_NOVED
        Retorna: (es_duplicado, datos_existentes)
        """
        query = """
            SELECT NO_NCODE, NO_NFECH, NO_EMPL, NO_TIPO
            FROM NO_NOVED
            WHERE NO_EMPL = ?
              AND CAST(NO_NFECH AS DATE) = CAST(? AS DATE)
              AND NO_TIPO = ?
        """
        try:
            self.cursor.execute(query, (cedula, fecha, tipo_novedad))
            result = self.cursor.fetchone()

            if result:
                return True, {
                    'codigo': result[0],
                    'fecha': result[1],
                    'empleado': result[2],
                    'tipo': result[3]
                }
            return False, {}
        except Exception as e:
            print(f"Error en check_duplicate_permission: {e}")
            return None, {}

    def check_duplicate_vacation(self, cedula: str, fecha_inicio: str, fecha_fin: str) -> Tuple[bool, Dict]:
        """
        Verifica duplicados en NO_AUSEN (Ausentismos)
        """
        query = """
            SELECT NO_SCODE, NO_SEMP, NO_SFIN, NO_SFEC
            FROM NO_AUSEN
            WHERE NO_SEMP = ?
              AND (
                (CAST(NO_SFIN AS DATE) >= CAST(? AS DATE) AND CAST(NO_SFIN AS DATE) <= CAST(? AS DATE))
                OR
                (CAST(NO_SFEC AS DATE) >= CAST(? AS DATE) AND CAST(NO_SFEC AS DATE) <= CAST(? AS DATE))
              )
              AND NO_STIP = 'VACACIONES'
        """
        try:
            self.cursor.execute(query, (cedula, fecha_inicio, fecha_fin, fecha_inicio, fecha_fin))
            result = self.cursor.fetchone()

            if result:
                return True, {
                    'codigo': result[0],
                    'empleado': result[1],
                    'fecha_fin': result[2],
                    'fecha_inicio': result[3]
                }
            return False, {}
        except Exception as e:
            print(f"Error en check_duplicate_vacation: {e}")
            return None, {}

    def insert_permission(self, data: Dict) -> Tuple[bool, str]:
        """
        Inserta un permiso en la BD
        Estructura: NO_NOVED (maestro) -> NO_CONCE (concepto)
        """
        try:
            # Generar código único para NO_NOVED
            query_nextcode = "SELECT ISNULL(MAX(CAST(NO_NCODE AS INT)), 0) + 1 FROM NO_NOVED"
            self.cursor.execute(query_nextcode)
            next_code = self.cursor.fetchone()[0]

            insert_noved = """
                INSERT INTO NO_NOVED (NO_NCODE, NO_EMPL, NO_NFECH, NO_TIPO, NO_DSFECH, NO_DHFECH, NO_CANTIDAD, NO_OBS)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?)
            """

            params = (
                str(next_code),
                data['cedula'],
                data['fecha_permiso'],
                'PERMISO',
                data['hora_inicio'],
                data['hora_fin'],
                data['total_horas'],
                data['observaciones']
            )

            self.cursor.execute(insert_noved, params)

            # Insertar en NO_CONCE si es necesario
            if data['es_remunerado']:
                insert_conce = """
                    INSERT INTO NO_CONCE (NO_CCODE, NO_CEMP, NO_CFECH, NO_CTIPO, NO_CMOT, NO_COBSER)
                    VALUES (?, ?, ?, ?, ?, ?)
                """

                conce_params = (
                    str(next_code),
                    data['cedula'],
                    data['fecha_permiso'],
                    data['motivo'],
                    'PERMISO_REMUNERADO',
                    data['observaciones']
                )

                self.cursor.execute(insert_conce, conce_params)

            self.connection.commit()
            return True, f"Permiso insertado exitosamente (Código: {next_code})"

        except Exception as e:
            self.connection.rollback()
            return False, f"Error al insertar permiso: {str(e)}"

    def insert_vacation(self, data: Dict) -> Tuple[bool, str]:
        """
        Inserta vacaciones en la BD
        Estructura: NO_AUSEN (ausentismos)
        """
        try:
            # Generar código único para NO_AUSEN
            query_nextcode = "SELECT ISNULL(MAX(CAST(NO_SCODE AS INT)), 0) + 1 FROM NO_AUSEN"
            self.cursor.execute(query_nextcode)
            next_code = self.cursor.fetchone()[0]

            insert_ausen = """
                INSERT INTO NO_AUSEN (NO_SCODE, NO_SEMP, NO_SFIN, NO_SFEC, NO_STIP, NO_SCANT, NO_SOBS)
                VALUES (?, ?, ?, ?, ?, ?, ?)
            """

            params = (
                str(next_code),
                data['cedula'],
                data['fecha_inicio'],
                data['fecha_fin'],
                'VACACIONES',
                data['dias_disfrutados'],
                data['observaciones']
            )

            self.cursor.execute(insert_ausen, params)
            self.connection.commit()
            return True, f"Vacaciones insertadas exitosamente (Código: {next_code})"

        except Exception as e:
            self.connection.rollback()
            return False, f"Error al insertar vacaciones: {str(e)}"

    def export_to_dataframe(self, table: str) -> pd.DataFrame:
        """
        Exporta una tabla completa a DataFrame
        """
        query = f"SELECT * FROM {table}"
        return pd.read_sql(query, self.connection)

    def close(self):
        """Cierra la conexión"""
        if self.connection:
            self.connection.close()
            print("Conexión cerrada")

# Ejemplo de uso
if __name__ == "__main__":
    # Configuración de conexión
    db_handler = MineDaxHandler(
        server='localhost',
        database='MineDax'
    )

    # Verificar duplicados
    dup, datos = db_handler.check_duplicate_permission('1058228240', '2026-02-14', 'PERMISO')
    print(f"¿Duplicado de permiso?: {dup}")

    # Insertar si no existe
    if not dup:
        data_permiso = {
            'cedula': '1058228240',
            'nombre': 'Laura Velasquez Izquierdo',
            'cargo': 'Auxiliar Proteccion',
            'area': 'Proteccion',
            'fecha_permiso': '2026-02-14',
            'hora_inicio': '08:00',
            'hora_fin': '12:00',
            'total_horas': 4,
            'motivo': 'ESTUDIO',
            'es_remunerado': True,
            'observaciones': 'Horas compensadas para clases en Universidad Autonoma'
        }

        success, msg = db_handler.insert_permission(data_permiso)
        print(f"Inserción: {msg}")

    db_handler.close()
