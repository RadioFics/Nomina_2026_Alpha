# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```powershell
npm start          # Run server (node server.js)
npm run dev        # Run with nodemon (hot reload)
npm restart        # Stop then start
npm install        # Restore all dependencies after a git pull
```

After any `git pull`, always run `npm install` — `node_modules/` is gitignored and not transported via Git.

Kill a stuck server on Windows:
```powershell
Get-Process node -ErrorAction SilentlyContinue | Stop-Process -Force
# or
node kill-server.js        # shortcut at project root
node scripts/kill-server.js  # same script if removed from root
```

Health check: `GET http://localhost:3000/api/health`

## Architecture Overview

This is a monolithic Express.js app for payroll management (nómina) for Collective Mining / Adecco. It runs on-premise (local SQL Server) and on Azure App Service with Azure SQL Serverless.

### Request flow

```
Browser → server.js
         ├─ Security blocklist middleware (blocks access to /controllers, /routes, /python, etc.)
         ├─ express.static(__dirname)   ← serves HTML/CSS/JS from root
         └─ /api/* → routes/ → controllers/ → config/database.js (executeQuery)
```

### Frontend

The main application is a single-page-style multi-tab interface. There is no build step — all JS runs directly in the browser.

**HTML pages:**
- **`login.html`** — authentication page, also served at `/`
- **`index_novedades.html`** — main app (~2k lines of HTML, requires JWT)
- **`public/solicitud-permiso.html`** and **`public/solicitud-vacaciones.html`** — public self-service forms (no login required), accessible at `/solicitud/permiso` and `/solicitud/vacaciones`

**Separated CSS/JS assets (`src/`):**
- **`src/css/login.css`** — all styles for `login.html`
- **`src/css/novedades.css`** — all styles for `index_novedades.html` (main app + changelog section)
- **`src/js/login.js`** — all logic for `login.html` (tabs, login/registro/recuperar forms, resend verification)
- **`src/js/novedades.js`** — all logic for `index_novedades.html` (~4200 lines: state management, CRUD for all novedad types, trazabilidad, importar, exportar Adecco, modales)

**Shared JS (root `js/` folder, loaded by HTML directly):**
- **`js/auth.js`** — `AuthUtil` singleton: JWT storage, `fetchAuth()`, level helpers
- **`js/api.js`** — legacy CRUD helpers; several functions are intentionally commented out (see file notes about override order with `novedades.js`)

`AuthUtil` (`js/auth.js`) is the single source of truth for auth on the frontend. Always use `AuthUtil.fetchAuth()` for authenticated API calls; it adds `Authorization: Bearer` and `x-abr-usua` headers automatically and redirects to login on 401.

### Backend

**`config/database.js`** — exports `executeQuery(sql, params)` and `getConnection()`. The pool uses `min: 0` intentionally so Azure SQL Serverless can auto-pause. Connection is not established at startup; it is deferred to the first real `/api/*` request via `_runBootstrapsOnce()` in `server.js`.

**`config/logger.js`** — writes logs asynchronously to `GN_LOG_APP` (SQL table). Never throws. Use `logger.error/warn/info` from any controller.

**`middleware/authMiddleware.js`** — `verifyToken` validates JWT and populates `req.cod_gusu`, `req.cedula`, etc. `checkLevel(n)` enforces minimum `COD_GUSU` level. Always chain as `router.get('/path', verifyToken, checkLevel(2), handler)`.

### Database conventions

All tables follow Adecco naming: **`GN_*`** (general: users, groups, permissions, logs) and **`NO_*`** (novedades/nómina: periods, transactions). Field names are uppercase snake-case (`COD_EMPR`, `ACT_ESTA`, `FEC_REGI`).

- `ACT_ESTA = 'A'` = active, `'I'` = inactive — soft delete everywhere, never `DELETE`
- `DEFAULT_COD_EMPR = 1` is hardcoded in every controller (single-company setup)
- The user abbreviation for audit fields (`ACT_USUA`) comes from `config/userHelper.js` → `getActUsua(req)`, which reads the `x-abr-usua` request header
- Every controller that creates tables has an `ensureDbObjects()` function. These run once at startup via `_runBootstrapsOnce()` in `server.js` — they are idempotent

### Novedad modules

The four novedad types share the same header table `NO_NOVED` (trazable, soft-delete) with type-specific detail tables:

| Module | Route prefix | Tables | Controller |
|--------|-------------|--------|-----------|
| Ocasionales | `/api/ocasionales` | `NO_NOVED` + `NO_OCASI` | `ocasionalesController.js` |
| Fijas | `/api/fijas` | `NO_NOVED` + `NO_FIJAS` | `fijasController.js` |
| Ausentismos | `/api/ausentismos` | `NO_NOVED` + `NO_AUSEN` | `ausentismosController.js` |
| Cambios | `/api/cambios` | `NO_NOVED` + `NO_CAMBI` | `cambiosController.js` |

All inserts go to `NO_NOVED` first (via `SCOPE_IDENTITY()`) then to the specialization table.

### Import pipeline

`POST /api/ocasionales/importar-excel` (via `importarExcelController.js`) detects file type automatically using `utils/importParsers/parserRegistry.js`. To add a new file format: create `utils/importParsers/parserXYZ.js` and register it in `parserRegistry.js` — the controller needs no changes.

Parsers execute in priority order: `parserPolizaSalud` → `parserPolizaVida` → `parserAdecco` → `parserExcel` (catch-all).

### PDF handling

Two independent PDF systems:
1. **`pdfPlantillaController.js`** — generates official blank PDF forms using `pdf-lib` (pure Node.js, no Python)
2. **`importarPDFController.js`** — reads and extracts data from scanned PDFs by spawning `python/procesar_pdf.py` as a subprocess. Requires `PYTHON_PATH` env var pointing to Python 3.8+. Diagnose via `GET /api/health/python` (requires admin token)

### Auth levels

| `COD_GUSU` | Role | Access |
|-----------|------|--------|
| 1 | Empleado | Own data only |
| 2 | Supervisor | Standard operations |
| 3 | Administrador | Full access, user management |

### Environment

Copy `.env.example` to `.env` for local development. Required variables:
- `SERVER`, `DATABASE`, `UID`, `PWD` — SQL Server connection
- `JWT_SECRET` — token signing key
- `PYTHON_PATH` — path to Python 3.8+ executable (only needed for PDF OCR)
- `APP_URL` — public base URL (for CORS and email links; optional locally)
- `NODE_ENV=production` — switches DB auth to Azure Managed Identity

### Production (Azure)

Deploy to Azure App Service. `NODE_ENV=production` + Azure SQL endpoint → Managed Identity auth is used automatically (no UID/PWD needed). PM2 config in `ecosystem.config.js` is for VPS deployments; Azure App Service runs `node server.js` directly via `npm start`.

### Folder structure

```
server.js              ← entry point (keep at root)
login.html             ← served from root by express.static
index_novedades.html   ← served from root by express.static
kill-server.js/.ps1    ← developer shortcuts (keep at root)

src/css/               ← all CSS assets (login.css, novedades.css)
src/js/                ← all frontend JS (login.js, novedades.js)
js/                    ← shared browser JS (auth.js, api.js)
public/                ← public self-service forms (no auth required)
assets/                ← static resources

config/                ← DB, logger, userHelper (blocked)
controllers/           ← all Express controllers (blocked)
routes/                ← all Express router files (blocked)
middleware/            ← auth middleware (blocked)
utils/                 ← import parsers, helpers (blocked)
python/                ← PDF OCR scripts (blocked) — procesar_pdf.py, rellenar_pdf.py
database/              ← SQL schema & migration scripts (blocked)
docs/                  ← documentation, notebooks, legacy HTML tools (blocked)
scripts/               ← one-off maintenance JS utilities (blocked)
```

### Security model

`server.js` has a blocklist middleware that returns 404 for direct browser requests to `config/`, `controllers/`, `routes/`, `middleware/`, `python/`, `scripts/`, `database/`, `docs/`, `*.py`, `*.sql`, `*.md`, `*.env`, etc. This runs before `express.static`. Do not move sensitive files outside these directories without updating the blocklist regex in `server.js` (around line 78).
