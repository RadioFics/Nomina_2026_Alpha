#!/bin/bash
# ============================================================================
#  startup.sh — Script de arranque para Azure App Service (Linux)
#
#  Azure App Service lo ejecuta ANTES de iniciar la aplicación.
#  Configurar en Azure Portal → App Service → Configuración →
#  Comando de inicio:  bash /home/site/wwwroot/startup.sh
#
#  Qué hace:
#    1. Instala dependencias Python (pypdf, reportlab) si no están presentes
#    2. Inicia el servidor Node.js
# ============================================================================

set -e

APP_DIR="/home/site/wwwroot"
REQUIREMENTS="$APP_DIR/requirements.txt"

echo "[startup] ======================================"
echo "[startup] MineDax — Iniciando en Azure App Service"
echo "[startup] Fecha: $(date)"
echo "[startup] Node: $(node --version)"
echo "[startup] Python: $(python3 --version 2>/dev/null || echo 'no encontrado')"
echo "[startup] ======================================"

# Instalar dependencias Python si requirements.txt existe
if [ -f "$REQUIREMENTS" ]; then
  echo "[startup] Instalando dependencias Python..."
  pip3 install -r "$REQUIREMENTS" --quiet --no-cache-dir 2>&1 | tail -5
  echo "[startup] Dependencias Python instaladas."

  # Verificar openpyxl explícitamente (requerido por scripts/generar_adecco.py).
  # Si por alguna razón no quedó instalado desde requirements.txt, se fuerza aquí.
  if ! python3 -c "import openpyxl" 2>/dev/null; then
    echo "[startup] openpyxl no detectado — instalando manualmente..."
    pip3 install "openpyxl>=3.1.0" --quiet --no-cache-dir
    echo "[startup] openpyxl instalado."
  else
    echo "[startup] openpyxl OK: $(python3 -c 'import openpyxl; print(openpyxl.__version__)')"
  fi
else
  echo "[startup] AVISO: requirements.txt no encontrado — saltando pip install."
fi

# Instalar dependencias Node si node_modules no existe o package.json cambió
if [ ! -d "$APP_DIR/node_modules" ]; then
  echo "[startup] Instalando dependencias Node.js..."
  cd "$APP_DIR" && npm ci --omit=dev --quiet
fi

# Crear directorio de logs si no existe
mkdir -p "$APP_DIR/logs"

echo "[startup] Lanzando server.js..."
cd "$APP_DIR"
exec node server.js
