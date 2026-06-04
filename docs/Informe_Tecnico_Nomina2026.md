# INFORME TÉCNICO
## Sistema de Gestión de Nómina — Nomina_2026_Alpha
### Requisitos del Sistema para Despliegue en Línea Privada

---

**Preparado por:** Juan Esteban Calle Palmett  
**Fecha:** 13 de mayo de 2026  
**Versión:** 1.0 Alpha  
**Clasificación:** Confidencial — Uso interno del equipo de desarrollo e infraestructura

---

## 1. Resumen Ejecutivo

El presente informe describe los requisitos técnicos necesarios para el correcto funcionamiento y despliegue en línea privada del sistema **Nomina_2026_Alpha**, una plataforma web de gestión de novedades de nómina desarrollada con tecnologías modernas de código abierto.

El sistema ha sido construido sobre **Node.js** con **Express** como servidor de aplicaciones, conectado a una base de datos **Microsoft SQL Server** (instancia MineDax), con una interfaz web HTML/JavaScript de múltiples módulos y formularios públicos de autoservicio que operan de forma completamente independiente del sistema principal de autenticación.

Este documento está dirigido al equipo de desarrollo y al área de infraestructura encargada de alojar la plataforma, con el fin de proporcionar todos los elementos necesarios para su puesta en producción a través de una línea de red privada corporativa.

---

## 2. Descripción del Sistema

**Nomina_2026_Alpha** es un sistema web centralizado de gestión de novedades de nómina que permite registrar, consultar, actualizar y anular distintos tipos de novedades para los empleados de una organización. El sistema está diseñado para operar desde una máquina central (servidor) y ser accedido desde múltiples puntos de la red corporativa mediante un navegador web estándar, sin necesidad de instalar software adicional en los equipos cliente.

### 2.1 Propósito y Justificación

Antes del desarrollo de esta plataforma, el registro de novedades de nómina se realizaba de forma manual o mediante hojas de cálculo dispersas, lo que generaba inconsistencias, pérdida de información, dificultad en la trazabilidad y altos tiempos de procesamiento. La plataforma resuelve estos problemas al:

- Centralizar toda la información en una base de datos SQL Server con registro histórico permanente.
- Automatizar la numeración de novedades con formato `YYYY-MM-CAT-NNN`.
- Registrar auditoría de cada acción (CREATE, UPDATE, DELETE) sobre las novedades.
- Permitir el acceso simultáneo desde distintas sucursales o dependencias a través de la red corporativa.
- Proveer formularios de autoservicio para empleados que operan sin necesidad de autenticación.

### 2.2 Módulos del Sistema

| Módulo | Descripción |
|---|---|
| **Autenticación (Auth)** | Inicio de sesión con JWT; gestión de sesiones seguras y roles de usuario. |
| **Ocasionales** | Registro y gestión de novedades ocasionales (bonos, auxilios, pagos únicos). |
| **Fijas** | Deducciones o adiciones de carácter recurrente (cuotas, créditos, descuentos periódicos). |
| **Ausentismos / Ausencias** | Control de incapacidades, licencias remuneradas y no remuneradas. |
| **Cambios** | Registro de cambios en condiciones de nómina de los empleados. |
| **Novedades (NO_NOVED)** | Tabla central consolidada que agrupa todas las novedades bajo un único registro histórico. |
| **Reportes** | Generación de informes consolidados, exportación de datos y consultas por período. |
| **Exportación ADECCO** | Exportación de datos en formato Excel compatible con el proveedor ADECCO (requiere Python). |
| **Importación PDF** | Importación y procesamiento de documentos PDF para incorporar datos al sistema. |
| **Solicitudes Públicas** | Formularios independientes de solicitud de permiso y vacaciones. Sin autenticación requerida. |
| **Maestros** | Gestión de datos maestros: empleados (GN_FUNCI), terceros (GN_TERCE), conceptos, períodos. |
| **Configuración de BD** | Herramienta de diagnóstico y reconfiguración de la conexión a SQL Server en tiempo real. |
| **Changelog** | Registro de versiones y cambios del sistema. |

---

## 3. Arquitectura Tecnológica

El sistema implementa una arquitectura cliente-servidor de **tres capas**: capa de presentación (frontend HTML/JS), capa de lógica de negocio (API REST en Node.js) y capa de persistencia (SQL Server).

### 3.1 Frontend (Capa de Presentación)

La interfaz de usuario está construida con HTML5, CSS3 y JavaScript puro (Vanilla JS). Los archivos estáticos son servidos directamente por el servidor Express, por lo que no se requiere ningún servidor de archivos adicional ni framework de compilación.

- **Tecnología:** HTML5 + CSS3 + JavaScript sin frameworks de compilación
- **Acceso:** navegador estándar (Chrome, Edge, Firefox)
- **Comunicación:** `fetch()` contra la API REST del backend
- **Sin instalación en clientes:** solo requiere un navegador actualizado

### 3.2 Backend (Capa de Lógica de Negocio)

| Componente | Detalle |
|---|---|
| **Runtime** | Node.js v18+ (LTS recomendado) |
| **Framework** | Express.js v4 |
| **Autenticación** | JWT (jsonwebtoken) + bcrypt para hash de contraseñas |
| **Conexión a BD** | `mssql` — driver oficial de Microsoft para SQL Server en Node.js |
| **Exportación Excel** | Python + openpyxl (módulo ADECCO); exportación nativa para reportes estándar |
| **Variables de entorno** | `.env` con `dotenv` (SERVER, DATABASE, UID, PWD, JWT_SECRET, PORT) |
| **Puerto de escucha** | 3000 (configurable), enlazado a `0.0.0.0` (toda la red) |
| **CORS** | Habilitado para acceso desde cualquier origen de la red interna |

### 3.3 Lenguajes de Programación

El sistema está desarrollado en dos lenguajes:

- **JavaScript (Node.js)** — backend, controladores, rutas, lógica de negocio y frontend
- **Python 3.x** — exclusivamente para el módulo de exportación ADECCO (generación de archivos Excel con `openpyxl`)

Ambos lenguajes deben estar instalados en el servidor donde se ejecute la plataforma.

---

## 4. Requisitos de la Base de Datos

### 4.1 Motor de Base de Datos

El sistema utiliza **Microsoft SQL Server** como único motor de base de datos.

| Parámetro | Valor en desarrollo |
|---|---|
| **Servidor / Instancia** | `CM-ITD-P-05\SQLEXPRESS` |
| **Base de datos** | `MineDax` |
| **Driver ODBC requerido** | ODBC Driver 17 for SQL Server |
| **Autenticación** | Windows Authentication (AzureAD) o SQL Server Authentication |
| **Puerto** | 1433 TCP (debe estar abierto si SQL Server está en máquina separada) |

Para el despliegue en línea, el servidor SQL Server debe ser accesible desde la máquina donde corra Node.js. Si ambos están en el mismo equipo, la conexión es local. Si están en equipos distintos, se debe abrir el puerto 1433 TCP en el firewall y habilitar el protocolo TCP/IP en SQL Server Configuration Manager.

### 4.2 Estructura de Tablas Requeridas

| Tabla | Tipo | Descripción |
|---|---|---|
| **NO_NOVED** | Nueva (migración) | Registro histórico centralizado de todas las novedades de nómina. |
| **NO_NOVED_Auditoria** | Nueva (migración) | Trazabilidad de cada acción sobre las novedades (CREATE, UPDATE, DELETE). |
| **Ocasionales** | Existente / Nueva | Novedades de carácter ocasional. Se le agrega columna `novedadId` (FK → NO_NOVED). |
| **Fijas** | Existente / Nueva | Deducciones y adiciones fijas. Se le agrega columna `novedadId` (FK → NO_NOVED). |
| **Ausencias** | Existente / Nueva | Registro de ausencias y licencias. Se le agrega columna `novedadId` (FK → NO_NOVED). |
| **GN_FUNCI** | Existente MineDax | Datos maestros de empleados (cédula, nombre, cargo, área). |
| **GN_TERCE** | Existente MineDax | Datos de terceros (prestadores, proveedores). |
| **NO_PERIOD** | Existente MineDax | Períodos de nómina (quincenas, fechas de cierre). |
| **NO_CONCE** | Existente MineDax | Conceptos de nómina (códigos y descripciones). |
| **Usuarios (auth)** | Nueva (bootstrap) | Tabla de usuarios del sistema. Se crea automáticamente al arrancar el servidor. |

### 4.3 Scripts de Migración Incluidos

El proyecto incluye tres scripts SQL que deben ejecutarse **en orden** sobre la base de datos MineDax antes del primer arranque:

1. `database/migration_novedades.sql` — Crea `NO_NOVED`, `NO_NOVED_Auditoria`, FK en tablas de novedades, vista consolidada (`vw_Novedades_Consolidadas`) y procedimientos almacenados (`sp_CrearNovedad`, `sp_ObtenerHistoricoPerson`).
2. `database/migration_fijas_ausen_cambi.sql` — Estructura para Fijas, Ausencias y Cambios.
3. `database/migration_ocasionales.sql` — Estructura para la tabla Ocasionales.

Adicionalmente, los controladores del sistema ejecutan funciones **bootstrap** al arrancar el servidor para verificar y crear automáticamente los objetos de BD faltantes.

### 4.4 Objetos SQL Generados por el Sistema

- **Vista:** `vw_Novedades_Consolidadas` — consolida novedades activas y modificadas
- **Procedimiento almacenado:** `sp_CrearNovedad` — creación transaccional de novedades
- **Procedimiento almacenado:** `sp_ObtenerHistoricoPerson` — historial por persona
- **Índices en NO_NOVED:** `IDX_cedula`, `IDX_periodo`, `IDX_categoria`, `IDX_estado`, `IDX_fechaRegistro`, `IDX_cedula_periodo`

---

## 5. Requisitos de la Interfaz Web

### 5.1 Tipos de Usuario

| Rol | Permisos y Acceso |
|---|---|
| **Administrador** | Acceso total: configuración de BD, gestión de usuarios, cierre de períodos, cualquier reporte, exportación ADECCO. |
| **Usuario estándar** | Registro, edición y anulación de novedades. Consulta de históricos y descarga de reportes del período activo. |

Los usuarios se crean con los scripts `create-admin.js` y `crear-usuario-desde-empleado.js` incluidos en el proyecto. Las contraseñas se almacenan con hash **bcrypt**. La autenticación usa tokens **JWT** con expiración configurable (por defecto 8 horas).

### 5.2 Rutas Principales de la API REST

| Ruta base | Acceso | Función |
|---|---|---|
| `/api/auth` | Público | Login, validación de token y gestión de sesión. |
| `/api/ocasionales` | Autenticado | CRUD de novedades ocasionales. |
| `/api/fijas` | Autenticado | CRUD de deducciones y adiciones fijas. |
| `/api/ausentismos` | Autenticado | CRUD de ausencias y licencias. |
| `/api/cambios` | Autenticado | Registro de cambios en condiciones de nómina. |
| `/api/novedades` | Autenticado | Consulta centralizada de NO_NOVED, cierre de períodos. |
| `/api/reportes` | Autenticado | Generación y descarga de reportes consolidados. |
| `/api/exportar-adecco` | Admin | Exportación a formato ADECCO en Excel. |
| `/api/maestros` | Autenticado | Consulta de datos maestros: empleados, conceptos, períodos. |
| `/api/database` | Admin | Estado, prueba y reconfiguración de la conexión a BD. |
| `/api/pdf` | Autenticado | Importación y procesamiento de documentos PDF. |
| `/api/solicitudes` | **Público (sin JWT)** | Recepción de solicitudes de permiso y vacaciones desde formularios externos. |
| `/api/health` | Público | Verificación de estado del servidor. |

---

## 6. Formularios Públicos Independientes

Una de las características clave del sistema es la existencia de formularios de autoservicio que operan **de forma completamente independiente** del módulo de autenticación. Están diseñados para ser accedidos por cualquier empleado sin necesidad de una cuenta en el sistema.

### 6.1 Formularios Disponibles

| Formulario | URL de Acceso | Función |
|---|---|---|
| **Solicitud de Permiso** | `http://SERVIDOR:3000/solicitud/permiso` | Permite al empleado solicitar un permiso laboral (fecha, tipo, justificación). La solicitud queda registrada en BD. |
| **Solicitud de Vacaciones** | `http://SERVIDOR:3000/solicitud/vacaciones` | Permite solicitar un período de vacaciones. La solicitud queda en BD para revisión del área de nómina. |

### 6.2 Por qué es necesaria su independencia

Estos formularios son fundamentales para la operación descentralizada porque:

- **No requieren inicio de sesión:** cualquier empleado puede acceder desde su equipo usando únicamente el navegador, sin credenciales.
- **Están declarados como rutas públicas** en el servidor, por delante de cualquier middleware de autenticación.
- **Guardan la información directamente en SQL Server** a través de la API en tiempo real y de forma continua.
- **Funcionan desde cualquier punto de la red** donde el servidor sea alcanzable (sucursales, sedes remotas).
- **Su disponibilidad no depende del estado de sesión** de otros usuarios del sistema principal.

Para que funcionen a distancia, el servidor debe ser alcanzable desde la red del empleado (misma red corporativa, VPN o línea privada).

---

## 7. Requisitos para Despliegue en Línea (Línea Privada)

### 7.1 Requisitos del Servidor de Aplicaciones

| Requisito | Especificación |
|---|---|
| **Sistema Operativo** | Windows Server 2019/2022 o Windows 10/11 Pro |
| **Node.js** | v18 LTS o superior. Instalar desde https://nodejs.org. Agregar al PATH. |
| **Python** | v3.9 o superior. Instalar desde https://python.org. Marcar "Add Python to PATH". Requerido para exportación ADECCO. |
| **Driver ODBC** | ODBC Driver 17 for SQL Server (descarga de Microsoft). Requerido para `mssql`. |
| **RAM mínima** | 4 GB. Recomendado 8 GB para uso concurrente. |
| **Almacenamiento** | 10 GB disponibles para proyecto, logs y archivos generados. |
| **Puerto de red** | Puerto 3000 TCP abierto en el firewall de Windows. |

### 7.2 Variables de Entorno Requeridas (.env)

El sistema lee su configuración desde un archivo `.env` en la raíz del proyecto. **Este archivo nunca debe subirse al repositorio Git.**

| Variable | Ejemplo | Descripción |
|---|---|---|
| `SERVER` | `192.168.1.10\SQLEXPRESS` | Dirección del servidor SQL Server (nombre de equipo, IP o IP,puerto). |
| `DATABASE` | `MineDax` | Nombre de la base de datos. |
| `UID` | `usuario_sql` | Usuario de SQL Server (o `DOMINIO\usuario` para Windows Auth). |
| `PWD` | `contraseña` | Contraseña del usuario de BD. |
| `PORT` | `3000` | Puerto en que escucha el servidor Node.js. |
| `JWT_SECRET` | *(cadena aleatoria, mín. 32 chars)* | Clave secreta para firma de tokens JWT. **CRÍTICO: cambiar en producción.** |
| `JWT_EXPIRES_IN` | `8h` | Duración del token de sesión. Formatos: `8h`, `24h`, `7d`. |
| `NODE_ENV` | `production` | Ambiente de ejecución. Usar `production` en el servidor final. |

### 7.3 Configuración de Red para Línea Privada

Para que la plataforma sea accesible a través de la línea privada corporativa:

- **IP fija en el servidor:** el equipo que ejecute Node.js debe tener una dirección IP estática para que las URL no cambien.
- **Apertura de puerto en firewall:** el puerto 3000 TCP debe estar abierto en Windows Firewall del servidor.
- **Acceso desde sucursales:** si las sucursales acceden por VPN, MPLS o SD-WAN, el equipo de redes debe enrutar el tráfico al servidor.
- **HTTPS para producción:** se recomienda un proxy inverso (Nginx o IIS) con certificado SSL/TLS para cifrar las comunicaciones.
- **SQL Server accesible:** si está en una máquina diferente al servidor Node.js, verificar que el puerto 1433 TCP esté abierto entre los dos servidores y que TCP/IP esté habilitado en SQL Server Configuration Manager.

### 7.4 Inicio del Servidor

```bash
# Instalar dependencias (solo la primera vez)
npm install

# Iniciar el servidor
node server.js

# Producción recomendada: con PM2
npm install -g pm2
pm2 start server.js --name nomina
pm2 save
pm2 startup    # para inicio automático al arrancar el equipo
```

---

## 8. Consideraciones de Seguridad

- **JWT_SECRET:** debe generarse con un valor aleatorio de mínimo 32 caracteres en producción. Nunca usar el valor del archivo de ejemplo.
- **Contraseñas:** almacenadas con hash bcrypt (salt rounds 10). No se guardan en texto plano.
- **Archivo .env:** nunca debe subirse al repositorio Git. El `.gitignore` del proyecto ya lo excluye.
- **Rutas públicas:** solo `/solicitud/permiso`, `/solicitud/vacaciones`, `/api/solicitudes` y `/api/health` son accesibles sin autenticación.
- **Configuración de BD:** el endpoint `/api/database/configure` está restringido a usuarios Administrador.
- **HTTPS:** obligatorio para uso en producción. Sin HTTPS, los tokens JWT y contraseñas viajan en texto claro.

---

## 9. Flujo de Trabajo del Sistema

| Paso | Acción | Descripción |
|---|---|---|
| **1** | Acceso al sistema | El analista accede desde su navegador a `http://SERVIDOR:3000` e inicia sesión. |
| **2** | Selección de módulo | Selecciona el módulo correspondiente (Ocasionales, Fijas, Ausentismos o Cambios). |
| **3** | Registro de novedad | Completa el formulario. El sistema genera automáticamente el número de novedad (`YYYY-MM-CAT-NNN`). |
| **4** | Persistencia en BD | La novedad se registra en la tabla específica y en NO_NOVED simultáneamente. Se crea registro de auditoría. |
| **5** | Consulta y edición | Se puede buscar por período, cédula o estado, y editar o anular (soft delete, preserva historial). |
| **6** | Cierre de período | Al finalizar la quincena, el administrador cierra el período. El sistema marca las novedades y bloquea nuevos registros retroactivos. |
| **7** | Reporte / Exportación | Se genera el reporte consolidado. La opción ADECCO genera el Excel para el proveedor externo (requiere Python). |
| **8** | Solicitudes externas | Paralelamente, empleados envían solicitudes de permiso/vacaciones desde los formularios públicos. |

---

## 10. Problemas Identificados y Plan de Resolución

### 10.1 Python no disponible en PATH del servidor (Error 9009)

El módulo de exportación ADECCO invoca un script Python para generar el Excel. Si Python no está instalado o no está en el PATH del sistema, falla con código 9009.

**Solución:** instalar Python 3.x marcando "Add Python to PATH", reiniciar el equipo y verificar con `python --version` en la terminal.

### 10.2 Controlador de nómina obsoleto (nominaController legacy)

Existe un controlador heredado (`nominaController.js`) que referencia tablas inexistentes (`Ocasionales`, `Fijas`, `Ausencias` como tablas propias, no las de MineDax). Genera error SQL 208 si alguna ruta lo invoca.

**Solución:** reemplazar `nominaController.js` por un agregador que delegue a los controladores específicos (`ocasionalesController`, `fijasController`, `ausentismosController`, `cambiosController`), los cuales ya usan la arquitectura correcta de MineDax.

---

## 11. Dependencias Principales del Proyecto (npm)

| Paquete npm | Función |
|---|---|
| `express` | Framework HTTP para el servidor de aplicaciones y la API REST. |
| `mssql` | Driver de conexión a Microsoft SQL Server desde Node.js. |
| `jsonwebtoken` | Generación y verificación de tokens JWT para autenticación. |
| `bcrypt` | Hash seguro de contraseñas de usuarios del sistema. |
| `dotenv` | Carga de variables de entorno desde el archivo `.env`. |
| `cors` | Habilita CORS para acceso desde clientes en la red interna. |
| `uuid` | Generación de identificadores únicos para cada novedad. |
| `body-parser` | Parseo de cuerpos JSON y URL-encoded en peticiones HTTP. |
| `multer` / `tesseract.js` | Procesamiento de archivos subidos (PDF, imágenes) para importación. |

---

## 12. Checklist de Requisitos para el Equipo de Desarrollo / Infraestructura

### 12.1 Software a instalar en el servidor

- [ ] Node.js v18 LTS o superior (con npm)
- [ ] Python 3.9 o superior (con opción "Add to PATH")
- [ ] ODBC Driver 17 for SQL Server (Microsoft)
- [ ] Microsoft SQL Server con instancia MineDax activa y accesible en red
- [ ] PM2 — gestor de procesos Node.js (`npm install -g pm2`)
- [ ] Certificado SSL/TLS y proxy inverso (Nginx o IIS) para HTTPS

### 12.2 Acciones de configuración requeridas

- [ ] Crear archivo `.env` con variables `SERVER`, `DATABASE`, `UID`, `PWD`, `JWT_SECRET`, `PORT`, `NODE_ENV`
- [ ] Ejecutar los tres scripts SQL de migración en MineDax (en el orden indicado)
- [ ] Ejecutar `npm install` en la raíz del proyecto
- [ ] Crear el usuario administrador con `node create-admin.js`
- [ ] Abrir el puerto 3000 TCP en el firewall de Windows del servidor
- [ ] Asignar IP estática al servidor en la red corporativa
- [ ] Verificar accesibilidad de SQL Server desde el servidor Node.js
- [ ] Configurar PM2 para inicio automático al arrancar el equipo

### 12.3 Verificación de funcionamiento

- [ ] `GET http://SERVIDOR:3000/api/health` → debe responder `{status: 'OK'}`
- [ ] Acceder a `http://SERVIDOR:3000` desde un navegador de la red y poder iniciar sesión
- [ ] Acceder a `http://SERVIDOR:3000/solicitud/permiso` sin iniciar sesión
- [ ] Acceder a `http://SERVIDOR:3000/solicitud/vacaciones` sin iniciar sesión
- [ ] Verificar conexión a BD desde `http://SERVIDOR:3000/db-config.html`
- [ ] Realizar un registro de prueba en Ocasionales, Fijas y Ausencias
- [ ] Verificar exportación ADECCO (confirma que Python funciona correctamente)

---

*Fin del Informe Técnico — Nomina_2026_Alpha v1.0 Alpha*  
*Documento confidencial. Para uso interno del equipo de desarrollo e infraestructura.*
