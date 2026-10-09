param([string]$Python = 'python')
$ErrorActionPreference = 'Stop'
$projectPath = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$cachePath = Join-Path $projectPath '.source-cache'
New-Item -ItemType Directory -Force -Path $cachePath | Out-Null
$lockPath = Join-Path $cachePath 'scheduled-refresh.lock'
$lockStream = $null
try {
    $lockStream = [System.IO.File]::Open($lockPath, 'OpenOrCreate', 'ReadWrite', 'None')
    Push-Location -LiteralPath $projectPath
    try {
        & $Python scripts/refresh.py 2>&1 | Tee-Object -FilePath (Join-Path $cachePath 'last-refresh.log')
        if ($LASTEXITCODE -ne 0) { throw 'Refresh failed; inspect .source-cache/last-refresh.log.' }
    } finally { Pop-Location }
} finally { if ($lockStream) { $lockStream.Dispose() } }
