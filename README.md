# Aplicación de Nómina - Collective Mining

Aplicación web full-stack para gestión de novedades de nómina (ocasionales, fijas, ausencias) conectada a SQL Server.

## Requisitos

- **Node.js** 16+ (https://nodejs.org/)
- **SQL Server** 2019+ o SQL Server Express
- **ODBC Driver 17 for SQL Server** (instalado en tu sistema)

## Instalación

### 1. Instalar dependencias

```bash
npm install
```

### 2. Configurar base de datos

#### 2a. Crear las tablas en SQL Server

Abre **SQL Server Management Studio** (SSMS) o **Azure Data Studio** y ejecuta el script:

```sql
-- Ubicado en: database/schema.sql
-- Este script crea todas las tablas necesarias
```

O copia el contenido de `database/schema.sql` y ejecútalo en tu servidor SQL.

#### 2b. Verificar credenciales en `.env`

El archivo `.env` ya contiene la configuración:

```
SERVER=CM-ITD-P-05\SQLEXPRESS
DATABASE=MineDax
UID=AzureAD\JuanEstebanCalle
PWD=(tu contraseña si es necesario)
DRIVER=ODBC Driver 17 for SQL Server
```

**Nota:** Si tu contraseña contiene caracteres especiales, enciérrala entre comillas.

## Uso

### Iniciar el servidor (desarrollo)

```bash
npm run dev
```

O sin nodemon:

```bash
npm start
```

El servidor se ejecutará en: **http://localhost:3000**

### Acceder a la aplicación

Abre tu navegador en: **http://localhost:3000**

Verás la interfaz de Collective Mining con los módulos:

- **📋 Dashboard** - Resumen general
- **👤 Ocasionales** - Empleados ocasionales
- **📌 Fijas** - Deducciones fijas
- **📅 Ausencias** - Licencias y ausencias
- **📊 Maestros** - Configuración
- **📈 Reportes** - Generación de reportes

## API REST Endpoints

### Ocasionales

```
POST   /api/nomina/ocasionales          - Crear nuevo ocasional
GET    /api/nomina/ocasionales          - Obtener ocasionales (con ?periodo=x)
PUT    /api/nomina/ocasionales/:id      - Actualizar ocasional
DELETE /api/nomina/ocasionales/:id      - Eliminar ocasional
```

### Fijas

```
POST   /api/nomina/fijas                - Crear nueva fija
GET    /api/nomina/fijas                - Obtener fijas (con ?periodo=x)
```

### Ausencias

```
POST   /api/nomina/ausencias            - Crear nueva ausencia
GET    /api/nomina/ausencias            - Obtener ausencias (con ?periodo=x)
```

### Actividad

```
GET    /api/nomina/actividad            - Obtener últimos registros
```

## Estructura del Proyecto

```
.
├── index_novedades.html          # Frontend HTML/CSS
├── js/
│   └── api.js                    # Cliente API JavaScript
├── config/
│   └── database.js               # Configuración de conexión SQL Server
├── routes/
│   ├── nomina.js                 # Rutas de nómina
│   ├── reportes.js               # Rutas de reportes
│   └── maestros.js               # Rutas de maestros
├── controllers/
│   └── nominaController.js       # Lógica de negocio
├── database/
│   └── schema.sql                # Script SQL para crear tablas
├── server.js                     # Servidor principal
├── package.json                  # Dependencias
├── .env                          # Configuración de base de datos
└── README.md                     # Este archivo
```

## Solución de problemas

### Error: "Cannot find module 'mssql'"

```bash
npm install mssql
```

### Error: "ODBC Driver 17 not found"

Instala ODBC Driver 17 desde: https://docs.microsoft.com/es-es/sql/connect/odbc/download-odbc-driver-for-sql-server

### Error: "Connection failed"

1. Verifica que SQL Server está ejecutándose
2. Revisa credenciales en `.env`
3. Abre SQL Server Configuration Manager y habilita protocolos (Named Pipes, TCP/IP)

### Frontend no se conecta al API

1. Verifica que `http://localhost:3000` es accesible
2. Abre la consola del navegador (F12) para ver errores
3. Comprueba que CORS está habilitado en `server.js`

## Desarrollo

### Agregar nuevas rutas

1. Crea funciones en `controllers/nominaController.js`
2. Expórtalas desde el controlador
3. Defínelas en las rutas correspondientes en `routes/`

### Agregar nuevas tablas SQL

1. Modifica `database/schema.sql`
2. Ejecuta el script en SQL Server
3. Crea funciones en el controlador

## Notas de seguridad

- No commits `.env` a control de versiones
- Usa variables de entorno para contraseñas
- Valida siempre datos en el servidor
- Usa conexiones encriptadas en producción

## Licencia

Collective Mining - 2026
