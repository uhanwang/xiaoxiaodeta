[CmdletBinding()]
param(
    [Parameter(Mandatory = $true)]
    [string]$Executable,

    [Parameter(Mandatory = $false)]
    [string]$Atlas,

    [switch]$Reset,

    [switch]$NoLaunch
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$resolvedExecutable = (Resolve-Path -LiteralPath $Executable).Path
if ([IO.Path]::GetExtension($resolvedExecutable) -ne '.exe') {
    throw 'Executable must point to the packaged desktop pet .exe.'
}

$resolvedAtlas = $null
$normalizedAtlas = $null
if (-not $Reset) {
    if (-not $Atlas) { throw 'Provide -Atlas or use -Reset.' }
    $resolvedAtlas = (Resolve-Path -LiteralPath $Atlas).Path
    $extension = [IO.Path]::GetExtension($resolvedAtlas).ToLowerInvariant()
    if ($extension -notin @('.png', '.webp')) { throw 'Atlas must be a PNG or WebP file.' }

    $runner = Join-Path $projectRoot 'scripts\qa-action-atlas.py'
    $venvPython = Join-Path $projectRoot '.venv\Scripts\python.exe'
    if (Test-Path -LiteralPath $venvPython) {
        & $venvPython $runner --project $projectRoot --atlas $resolvedAtlas
    } elseif (Get-Command 'py' -ErrorAction SilentlyContinue) {
        & py -3 $runner --project $projectRoot --atlas $resolvedAtlas
    } elseif (Get-Command 'python' -ErrorAction SilentlyContinue) {
        & python $runner --project $projectRoot --atlas $resolvedAtlas
    } else {
        throw 'Python 3 is required for atlas QA. Install dependencies from requirements-assets.txt.'
    }
    if ($LASTEXITCODE -ne 0) { throw 'Atlas QA failed; the active pet assets were left unchanged.' }

    $normalizedAtlas = Join-Path ([IO.Path]::GetTempPath()) ("desktop-pet-atlas-{0}.png" -f [guid]::NewGuid().ToString('N'))
    $normalizer = Join-Path $projectRoot 'scripts\normalize-atlas.py'
    if (Test-Path -LiteralPath $venvPython) {
        & $venvPython $normalizer --input $resolvedAtlas --output $normalizedAtlas
    } elseif (Get-Command 'py' -ErrorAction SilentlyContinue) {
        & py -3 $normalizer --input $resolvedAtlas --output $normalizedAtlas
    } else {
        & python $normalizer --input $resolvedAtlas --output $normalizedAtlas
    }
    if ($LASTEXITCODE -ne 0) { throw 'Atlas normalization failed; the active pet assets were left unchanged.' }
}

$statusPath = Join-Path ([IO.Path]::GetTempPath()) ("desktop-pet-custom-asset-{0}.json" -f [guid]::NewGuid().ToString('N'))
try {
    if ($Reset) {
        & $resolvedExecutable --reset-custom-atlas --custom-asset-status $statusPath
    } else {
        & $resolvedExecutable --install-custom-atlas $normalizedAtlas --custom-asset-status $statusPath
    }

    $deadline = [DateTime]::UtcNow.AddSeconds(30)
    while (-not (Test-Path -LiteralPath $statusPath) -and [DateTime]::UtcNow -lt $deadline) {
        Start-Sleep -Milliseconds 200
    }
    if (-not (Test-Path -LiteralPath $statusPath)) {
        throw 'The app did not report the custom asset operation result within 30 seconds.'
    }

    $result = Get-Content -LiteralPath $statusPath -Raw | ConvertFrom-Json
    if (-not $result.ok) { throw "Custom asset operation failed: $($result.error)" }
    if (-not $NoLaunch) { Start-Process -FilePath $resolvedExecutable }
    Write-Output $result.message
} finally {
    if (Test-Path -LiteralPath $statusPath) { Remove-Item -LiteralPath $statusPath -Force }
    if ($normalizedAtlas -and (Test-Path -LiteralPath $normalizedAtlas)) { Remove-Item -LiteralPath $normalizedAtlas -Force }
}
