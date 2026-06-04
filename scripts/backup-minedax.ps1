param(
    [string]$BackupDir     = "C:\Backups\MineDax",
    [int]   $RetentionDays = 30
)

Set-StrictMode -Off
$ErrorActionPreference = "Stop"

$scriptDir  = Split-Path -Parent $MyInvocation.MyCommand.Path
$projectDir = Split-Path -Parent $scriptDir
$envFile    = Join-Path $projectDir ".env"

$envVars = @{}
if (Test-Path $envFile) {
    Get-Content $envFile | ForEach-Object {
        $line = $_.Trim()
        if ($line -ne "" -and -not $line.StartsWith("#") -and $line -match "^([^=]+)=(.*)$") {
            $envVars[$matches[1].Trim()] = $matches[2].Trim()
        }
    }
}

$server   = if ($envVars["SERVER"])   { $envVars["SERVER"]   } else { "CM-ITD-P-05\SQLEXPRESS" }
$database = if ($envVars["DATABASE"]) { $envVars["DATABASE"] } else { "MineDax" }
$uid      = if ($envVars["UID"])      { $envVars["UID"]      } else { "sa" }
$pwd      = if ($envVars["PWD"])      { $envVars["PWD"]      } else { "" }

if (-not (Test-Path $BackupDir)) {
    New-Item -ItemType Directory -Path $BackupDir -Force | Out-Null
}

$timestamp   = Get-Date -Format "yyyyMMdd_HHmm"
$backupFile  = Join-Path $BackupDir ($database + "_" + $timestamp + ".bak")
$logFile     = Join-Path $BackupDir "backup_log.txt"

function Write-Log {
    param([string]$Msg, [string]$Level = "INFO")
    $line = "[" + (Get-Date -Format "yyyy-MM-dd HH:mm:ss") + "] [" + $Level + "] " + $Msg
    Write-Host $line
    Add-Content -Path $logFile -Value $line -Encoding UTF8
}

Write-Log ("Iniciando backup de '" + $database + "' en '" + $server + "'")
Write-Log ("Destino: " + $backupFile)

$query = "BACKUP DATABASE [" + $database + "] TO DISK = N'" + $backupFile + "' WITH STATS = 10, NAME = N'" + $database + " backup " + $timestamp + "';"

sqlcmd -S $server -U $uid -P $pwd -Q $query -No
$exitCode = $LASTEXITCODE

if ($exitCode -ne 0) {
    Write-Log ("sqlcmd devolvio codigo " + $exitCode + " — revisar la salida anterior.") "ERROR"
    exit 1
}

if (Test-Path $backupFile) {
    $sizeMB = [math]::Round((Get-Item $backupFile).Length / 1MB, 2)
    Write-Log ("Backup completado. Tamano: " + $sizeMB + " MB")
} else {
    Write-Log "sqlcmd salio con codigo 0 pero el archivo no fue creado." "WARN"
}

$cutoff  = (Get-Date).AddDays(-$RetentionDays)
$viejos  = Get-ChildItem -Path $BackupDir -Filter ($database + "_*.bak") -ErrorAction SilentlyContinue |
           Where-Object { $_.LastWriteTime -lt $cutoff }
if ($viejos -and $viejos.Count -gt 0) {
    $viejos | Remove-Item -Force -ErrorAction SilentlyContinue
    Write-Log ("Rotados " + $viejos.Count + " backup(s) con mas de " + $RetentionDays + " dias")
}

if (Test-Path $logFile) {
    $logSizeKB = [math]::Round((Get-Item $logFile).Length / 1KB, 0)
    if ($logSizeKB -gt 2048) {
        $logArchivo = Join-Path $BackupDir ("backup_log_" + (Get-Date -Format "yyyyMMdd") + ".txt")
        Move-Item -Path $logFile -Destination $logArchivo -Force
        Write-Log ("Log rotado (era " + $logSizeKB + " KB)")
    }
}

Write-Log "Proceso completado correctamente."
