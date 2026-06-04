# ==============================================================================
#  scripts/RegisterBackupTask.ps1
#  Registra el backup diario de MineDax como tarea del Programador de Windows.
#
#  REQUIERE ejecutar como Administrador (clic derecho → Ejecutar como admin).
#
#  La tarea:
#    • Nombre:    "MineDax - Backup Diario"
#    • Horario:   Todos los días a las 02:00 AM
#    • Cuenta:    SYSTEM (no necesita usuario/contraseña, corre sin sesión abierta)
#    • Inicio:    Si se perdió la última ejecución, corre al siguiente arranque
#    • Script:    backup-minedax.ps1 en la carpeta scripts\ del proyecto
# ==============================================================================

#Requires -RunAsAdministrator

$scriptDir   = Split-Path -Parent $MyInvocation.MyCommand.Path
$backupScript = Join-Path $scriptDir "backup-minedax.ps1"

if (-not (Test-Path $backupScript)) {
    Write-Error "No se encontró '$backupScript'. Asegúrate de correr este script desde la carpeta raíz del proyecto."
    exit 1
}

$taskName    = "MineDax - Backup Diario"
$description = "Backup comprimido diario de la BD MineDax con rotación automática de 30 días."

# Acción: ejecutar PowerShell con el script de backup
$action = New-ScheduledTaskAction `
    -Execute    "powershell.exe" `
    -Argument   "-NonInteractive -NoProfile -ExecutionPolicy Bypass -File `"$backupScript`""

# Disparador: todos los días a las 02:00 AM
$trigger = New-ScheduledTaskTrigger -Daily -At "02:00AM"

# Configuración: correr si se perdió la última ejecución, no depende de red/AC
$settings = New-ScheduledTaskSettingsSet `
    -StartWhenAvailable `
    -DontStopOnIdleEnd `
    -ExecutionTimeLimit (New-TimeSpan -Hours 1)

# Cuenta SYSTEM: máximos privilegios, no requiere sesión activa
$principal = New-ScheduledTaskPrincipal `
    -UserId    "SYSTEM" `
    -LogonType  ServiceAccount `
    -RunLevel   Highest

# Registrar (o actualizar si ya existe)
Register-ScheduledTask `
    -TaskName   $taskName `
    -Description $description `
    -Action     $action `
    -Trigger    $trigger `
    -Settings   $settings `
    -Principal  $principal `
    -Force | Out-Null

Write-Host ""
Write-Host "✅ Tarea registrada correctamente:" -ForegroundColor Green
Write-Host "   Nombre  : $taskName"
Write-Host "   Horario : Todos los días a las 02:00 AM"
Write-Host "   Script  : $backupScript"
Write-Host "   Cuenta  : SYSTEM (corre sin usuario activo)"
Write-Host ""
Write-Host "📋 Para verificar:" -ForegroundColor Cyan
Write-Host "   Get-ScheduledTask -TaskName '$taskName' | Get-ScheduledTaskInfo"
Write-Host ""
Write-Host "▶  Para ejecutar ahora (prueba):" -ForegroundColor Cyan
Write-Host "   Start-ScheduledTask -TaskName '$taskName'"
Write-Host ""
