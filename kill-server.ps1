#!/usr/bin/env pwsh
# Script para matar procesos Node.js y liberar puertos bloqueados

Write-Host "🔍 Buscando procesos Node.js..." -ForegroundColor Cyan

$processes = Get-Process node -ErrorAction SilentlyContinue
if ($processes) {
    Write-Host "✗ Encontrados $($processes.Count) proceso(s) Node.js" -ForegroundColor Yellow
    $processes | ForEach-Object {
        Write-Host "  - Matando PID: $($_.Id) - $($_.ProcessName)"
        Stop-Process -Id $_.Id -Force -ErrorAction SilentlyContinue
    }
    Start-Sleep -Seconds 2
    Write-Host "✓ Procesos terminados" -ForegroundColor Green
} else {
    Write-Host "✓ No hay procesos Node.js activos" -ForegroundColor Green
}

Write-Host ""
Write-Host "🚀 Iniciando servidor..." -ForegroundColor Cyan
npm start
