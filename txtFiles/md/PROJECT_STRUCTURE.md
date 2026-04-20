# 📁 Estructura del Proyecto

## Organización de Archivos

```
UI_v1/
├── 📄 index_novedades.html          ← Frontend (interfaz web)
├── 📄 package.json                  ← Dependencias Node.js
├── 📄 server.js                     ← Servidor principal Express
├── 📄 .env                          ← Configuración SQL Server
├── 📄 .gitignore                    ← Archivos a ignorar en Git
│
├── 📁 config/
│   └── 📄 database.js               ← Conexión a SQL Server
│
├── 📁 routes/
│   ├── 📄 nomina.js                 ← Rutas de nómina
│   ├── 📄 reportes.js               ← Rutas de reportes
│   └── 📄 maestros.js               ← Rutas de maestros
│
├── 📁 controllers/
│   └── 📄 nominaController.js       ← Lógica de negocios
│
├── 📁 js/
│   └── 📄 api.js                    ← Cliente JavaScript (Frontend → API)
│
├── 📁 database/
│   └── 📄 schema.sql                ← Script SQL para crear tablas
│
├── 📚 Documentación/
│   ├── 📄 README.md                 ← Guía completa
│   ├── 📄 SETUP.md                  ← Inicio rápido
│   ├── 📄 API_DOCS.md               ← Referencia de APIs
│   ├── 📄 ENV_EXAMPLE               ← Ejemplo de variables
│   └── 📄 PROJECT_STRUCTURE.md      ← Este archivo
│
└── 📁 node_modules/                 ← Dependencias (generado por npm)
```

---

## Descripción de Archivos

### Frontend
| Archivo | Propósito | Líneas |
|---------|-----------|--------|
| `index_novedades.html` | Interfaz web completa con CSS y lógica base | ~1862 |
| `js/api.js` | Funciones JavaScript para comunicarse con el servidor | ~450 |

### Backend
| Archivo | Propósito | Líneas |
|---------|-----------|--------|
| `server.js` | Servidor Express, middlewares, rutas principales | 40 |
| `config/database.js` | Pool de conexión a SQL Server con manejo de errores | 50 |
| `controllers/nominaController.js` | Funciones CRUD para todas las entidades | 280 |

### Rutas API
| Archivo | Rutas | Métodos |
|---------|-------|---------|
| `routes/nomina.js` | `/api/nomina/*` | POST, GET, PUT, DELETE |
| `routes/reportes.js` | `/api/reportes/*` | GET, POST |
| `routes/maestros.js` | `/api/maestros/*` | GET, POST |

### Base de Datos
| Archivo | Descripción |
|---------|-------------|
| `database/schema.sql` | DDL para crear tablas: Ocasionales, Fijas, Ausencias, Parametros, UsuariosLog |

### Configuración
| Archivo | Propósito |
|---------|-----------|
| `package.json` | Dependencias: express, mssql, dotenv, cors, body-parser, uuid |
| `.env` | Variables de entorno: SERVER, DATABASE, UID, PWD, DRIVER |
| `.gitignore` | Archivos no versionados: node_modules, .env, logs, etc |
| `ENV_EXAMPLE` | Plantilla de ejemplo para `.env` |

### Documentación
| Archivo | Contenido |
|---------|-----------|
| `README.md` | Guía completa: requisitos, instalación, uso, troubleshooting |
| `SETUP.md` | Pasos rápidos (5 minutos) para poner funcionando |
| `API_DOCS.md` | Documentación detallada de todos los endpoints REST |
| `PROJECT_STRUCTURE.md` | Este archivo: mapa del proyecto |

---

## Flujo de Datos

```
┌─────────────────────────────────────────────────────────┐
│          NAVEGADOR WEB (Cliente)                        │
│  ┌────────────────────────────────────────────────────┐ │
│  │  index_novedades.html                              │ │
│  │  + CSS (estilos oscuros profesionales)             │ │
│  │  + JavaScript (formularios, validaciones)          │ │
│  │  + js/api.js (llamadas HTTP al backend)            │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                          ↕ HTTP/JSON
                   (http://localhost:3000)
┌─────────────────────────────────────────────────────────┐
│           SERVIDOR NODE.JS (Backend)                    │
│  ┌────────────────────────────────────────────────────┐ │
│  │  server.js                                         │ │
│  │  (Express, CORS, Body Parser)                      │ │
│  └─────────────┬──────────────────────────────────────┘ │
│                ↓                                        │
│  ┌────────────────────────────────────────────────────┐ │
│  │  routes/nomina.js                                  │ │
│  │  (POST/GET/PUT/DELETE /api/nomina/*)              │ │
│  └─────────────┬──────────────────────────────────────┘ │
│                ↓                                        │
│  ┌────────────────────────────────────────────────────┐ │
│  │  controllers/nominaController.js                   │ │
│  │  (Lógica de negocio, validaciones)                 │ │
│  └─────────────┬──────────────────────────────────────┘ │
│                ↓                                        │
│  ┌────────────────────────────────────────────────────┐ │
│  │  config/database.js                                │ │
│  │  (Pool de conexión, queries)                       │ │
│  └──────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                          ↕ SQL
                   (ODBC Driver 17)
┌─────────────────────────────────────────────────────────┐
│        SQL SERVER (Base de datos)                       │
│  ┌────────────────────────────────────────────────────┐ │
│  │  Database: MineDax                                 │ │
│  │  Server: CM-ITD-P-05\SQLEXPRESS                    │ │
│  │                                                    │ │
│  │  Tablas:                                           │ │
│  │  · Ocasionales (empleados ocasionales)             │ │
│  │  · Fijas (deducciones fijas)                       │ │
│  │  · Ausencias (licencias/incapacidades)             │ │
│  │  · Parametros (configuración)                      │ │
│  │  · UsuariosLog (auditoría)                         │ │
│  └────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
```

---

## Endpoints Disponibles

### Nómina
```
POST   /api/nomina/ocasionales         Crear ocasional
GET    /api/nomina/ocasionales         Listar ocasionales
PUT    /api/nomina/ocasionales/:id     Actualizar ocasional
DELETE /api/nomina/ocasionales/:id     Eliminar ocasional

POST   /api/nomina/fijas               Crear fija
GET    /api/nomina/fijas               Listar fijas

POST   /api/nomina/ausencias           Crear ausencia
GET    /api/nomina/ausencias           Listar ausencias

GET    /api/nomina/actividad           Obtener log de cambios
```

### Sistema
```
GET    /api/health                     Estado del servidor
```

---

## Stack Tecnológico

### Frontend
- **HTML5** - Estructura semántica
- **CSS3** - Estilos modernos (dark mode)
- **Vanilla JavaScript** - Sin dependencias externas

### Backend
- **Node.js 16+** - Runtime JavaScript
- **Express 4.x** - Framework web
- **mssql 9.x** - Driver SQL Server
- **dotenv** - Variables de entorno

### Base de Datos
- **SQL Server 2019+** o SQL Server Express
- **ODBC Driver 17** - Conexión

---

## Tamaños Aproximados

| Componente | Tamaño |
|-----------|--------|
| `index_novedades.html` | ~100 KB |
| `js/api.js` | ~15 KB |
| `server.js` + rutas | ~3 KB |
| `controllers/nominaController.js` | ~10 KB |
| `node_modules/` | ~200 MB |

---

## Próximas Mejoras Sugeridas

- [ ] Agregar autenticación (JWT)
- [ ] Implementar paginación en listados
- [ ] Agregar búsqueda/filtros avanzados
- [ ] Exportar a Excel/PDF
- [ ] Integración con Power BI
- [ ] Historiales de cambios (auditoría completa)
- [ ] Notificaciones por email
- [ ] API GraphQL
- [ ] Tests unitarios
- [ ] Docker containerization

---

**Proyecto creado:** 2026-04-09
**Versión:** 1.0.0
**Estado:** ✅ Funcional y listo para usar
