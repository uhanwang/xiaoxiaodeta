param(
  [string]$PackageDirectory = (Join-Path $PSScriptRoot '..\artifacts\installer\win-unpacked')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Drawing
$projectRoot = (Resolve-Path -LiteralPath (Join-Path $PSScriptRoot '..')).Path
$package = (Resolve-Path -LiteralPath $PackageDirectory).Path
if (-not $package.StartsWith($projectRoot + [IO.Path]::DirectorySeparatorChar, [StringComparison]::OrdinalIgnoreCase)) {
  throw "Package directory must remain inside the project: $package"
}

$source = Join-Path $projectRoot 'launcher\shortcut-icon.png'
$icoPath = Join-Path $projectRoot 'launcher\shortcut-icon.ico'
$resources = Join-Path $package 'resources'
if (-not (Test-Path -LiteralPath $source -PathType Leaf)) { throw "Icon source missing: $source" }
if (-not (Test-Path -LiteralPath $resources -PathType Container)) { throw "Package resources missing: $resources" }

$sizes = @(16, 24, 32, 48, 64, 128, 256)
$pngImages = [Collections.Generic.List[byte[]]]::new()
$sourceImage = [Drawing.Image]::FromFile($source)
try {
  foreach ($size in $sizes) {
    $bitmap = [Drawing.Bitmap]::new($size, $size, [Drawing.Imaging.PixelFormat]::Format32bppArgb)
    try {
      $graphics = [Drawing.Graphics]::FromImage($bitmap)
      try {
        $graphics.Clear([Drawing.Color]::Transparent)
        $graphics.CompositingMode = [Drawing.Drawing2D.CompositingMode]::SourceOver
        $graphics.CompositingQuality = [Drawing.Drawing2D.CompositingQuality]::HighQuality
        $graphics.InterpolationMode = [Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
        $graphics.SmoothingMode = [Drawing.Drawing2D.SmoothingMode]::HighQuality
        $graphics.PixelOffsetMode = [Drawing.Drawing2D.PixelOffsetMode]::HighQuality
        $graphics.DrawImage($sourceImage, [Drawing.Rectangle]::new(0, 0, $size, $size))
      } finally { $graphics.Dispose() }
      $stream = [IO.MemoryStream]::new()
      try {
        $bitmap.Save($stream, [Drawing.Imaging.ImageFormat]::Png)
        $pngImages.Add($stream.ToArray())
      } finally { $stream.Dispose() }
    } finally { $bitmap.Dispose() }
  }
} finally { $sourceImage.Dispose() }

$output = [IO.MemoryStream]::new()
$writer = [IO.BinaryWriter]::new($output)
try {
  $writer.Write([UInt16]0)
  $writer.Write([UInt16]1)
  $writer.Write([UInt16]$sizes.Count)
  $offset = 6 + 16 * $sizes.Count
  for ($index = 0; $index -lt $sizes.Count; $index++) {
    $size = $sizes[$index]
    $writer.Write([byte]$(if ($size -eq 256) { 0 } else { $size }))
    $writer.Write([byte]$(if ($size -eq 256) { 0 } else { $size }))
    $writer.Write([byte]0)
    $writer.Write([byte]0)
    $writer.Write([UInt16]1)
    $writer.Write([UInt16]32)
    $writer.Write([UInt32]$pngImages[$index].Length)
    $writer.Write([UInt32]$offset)
    $offset += $pngImages[$index].Length
  }
  foreach ($png in $pngImages) { $writer.Write($png) }
  $writer.Flush()
  [IO.File]::WriteAllBytes($icoPath, $output.ToArray())
} finally { $writer.Dispose(); $output.Dispose() }

$packagedIcon = Join-Path $resources 'shortcut-icon.ico'
Copy-Item -LiteralPath $icoPath -Destination $packagedIcon -Force
Write-Output "source=$source"
Write-Output "icon=$icoPath"
Write-Output "packagedIcon=$packagedIcon"
Write-Output "sizes=$($sizes -join ',')"
