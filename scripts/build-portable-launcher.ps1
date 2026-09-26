param(
  [Parameter(Mandatory = $true)]
  [string]$PackageDirectory,
  [switch]$RefreshLauncher
)

$ErrorActionPreference = 'Stop'
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$package = (Resolve-Path -LiteralPath $PackageDirectory).Path
if (-not $package.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Package directory must remain inside the project: $package"
}

$electronExe = Join-Path $package '小小的她.exe'
$runtimeExe = Join-Path $package 'XiaoXiaoDeTa-runtime.exe'
$launcherSource = Join-Path $projectRoot 'launcher/Program.cs'
$compiler = 'C:\Windows\Microsoft.NET\Framework64\v4.0.30319\csc.exe'
$launcherIcon = Join-Path $projectRoot 'launcher/shortcut-icon.ico'
$launcherOutputDirectory = Join-Path $projectRoot 'artifacts/launcher-bin'
$launcherOutput = Join-Path $launcherOutputDirectory 'XiaoXiaoDeTa-launcher.exe'
if (-not (Test-Path -LiteralPath $electronExe -PathType Leaf)) { throw "Electron executable missing: $electronExe" }
if ($RefreshLauncher) {
  if (-not (Test-Path -LiteralPath $runtimeExe -PathType Leaf)) { throw "Runtime executable missing: $runtimeExe" }
  if ((Get-Item -LiteralPath $electronExe).Length -gt 1048576) { throw "Existing launcher is unexpectedly large: $electronExe" }
} elseif (Test-Path -LiteralPath $runtimeExe) {
  throw "Runtime executable already exists: $runtimeExe"
}
if (-not (Test-Path -LiteralPath $compiler -PathType Leaf)) { throw "C# compiler missing: $compiler" }

New-Item -ItemType Directory -Path $launcherOutputDirectory -Force | Out-Null
& $compiler /nologo /codepage:65001 /target:winexe /optimize+ "/win32icon:$launcherIcon" "/out:$launcherOutput" /reference:System.Windows.Forms.dll /reference:System.Drawing.dll $launcherSource
if ($LASTEXITCODE -ne 0) { throw "Launcher compiler failed with exit code $LASTEXITCODE" }
if ((Get-Item -LiteralPath $launcherOutput).Length -lt 8000) { throw 'Launcher binary is unexpectedly small' }

if (-not $RefreshLauncher) {
  Copy-Item -LiteralPath $electronExe -Destination $runtimeExe
}
$originalHash = if ($RefreshLauncher) { $null } else { (Get-FileHash -LiteralPath $electronExe -Algorithm SHA256).Hash }
$runtimeHash = (Get-FileHash -LiteralPath $runtimeExe -Algorithm SHA256).Hash
if (-not $RefreshLauncher -and $originalHash -ne $runtimeHash) { throw 'Electron runtime copy failed its SHA-256 check' }
Copy-Item -LiteralPath $launcherOutput -Destination $electronExe -Force
$shortcutIcon = $launcherIcon
if (Test-Path -LiteralPath $shortcutIcon -PathType Leaf) {
  $resourceDirectory = Join-Path $package 'resources'
  New-Item -ItemType Directory -Path $resourceDirectory -Force | Out-Null
  Copy-Item -LiteralPath $shortcutIcon -Destination (Join-Path $resourceDirectory 'shortcut-icon.ico') -Force
}
$launcherHash = (Get-FileHash -LiteralPath $launcherOutput -Algorithm SHA256).Hash
if ((Get-FileHash -LiteralPath $electronExe -Algorithm SHA256).Hash -ne $launcherHash) {
  throw 'Packaged launcher failed its SHA-256 check'
}
Write-Output "launcher=$electronExe"
Write-Output "runtime=$runtimeExe"
Write-Output "runtimeSha256=$runtimeHash"
Write-Output "launcherSha256=$launcherHash"
