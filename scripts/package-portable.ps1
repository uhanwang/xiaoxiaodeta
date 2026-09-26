param(
  [Parameter(Mandatory = $true)]
  [string]$PackageDirectory
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$package = (Resolve-Path -LiteralPath $PackageDirectory).Path
if (-not $package.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Package directory must remain inside the project: $package"
}

$launcher = Get-ChildItem -LiteralPath $package -Filter '*.exe' -File | Where-Object { $_.Length -lt 1048576 } | Select-Object -First 1
$runtime = Join-Path $package 'XiaoXiaoDeTa-runtime.exe'
$asar = Join-Path $package 'resources\app.asar'
$spriteAsset = Join-Path $package 'resources\app.asar.unpacked\dist\client\assets\atlas\pet-actions-installed.webp'
$icon = Join-Path $package 'resources\shortcut-icon.ico'
foreach ($required in @($launcher.FullName, $runtime, $asar, $spriteAsset, $icon)) {
  if (-not (Test-Path -LiteralPath $required -PathType Leaf)) { throw "Portable package is incomplete: $required" }
}

$manifest = Get-Content -LiteralPath (Join-Path $projectRoot 'package.json') -Raw | ConvertFrom-Json
$version = [string]$manifest.version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw "Invalid app version in package.json: $version" }
$output = Join-Path (Split-Path -Parent $package) "XiaoXiaoDeTa-$version-Portable.zip"
if (Test-Path -LiteralPath $output) { throw "Refusing to overwrite an existing portable ZIP: $output" }
Compress-Archive -LiteralPath $package -DestinationPath $output -CompressionLevel Optimal

Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($output)
try {
  $entries = @($archive.Entries.FullName)
  foreach ($requiredName in @('win-unpacked/XiaoXiaoDeTa-runtime.exe', 'win-unpacked/resources/app.asar', 'win-unpacked/resources/app.asar.unpacked/dist/client/assets/atlas/pet-actions-installed.webp', 'win-unpacked/resources/shortcut-icon.ico')) {
    if ($entries -notcontains $requiredName) { throw "Portable ZIP is missing $requiredName" }
  }
} finally { $archive.Dispose() }
$item = Get-Item -LiteralPath $output
$hash = (Get-FileHash -LiteralPath $output -Algorithm SHA256).Hash
Write-Output "zip=$($item.FullName)"
Write-Output "bytes=$($item.Length)"
Write-Output "sha256=$hash"
