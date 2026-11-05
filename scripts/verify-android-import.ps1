param(
  [string]$ApkPath = '',
  [string]$BrowserPath = $env:CLASSFLOW_BROWSER
)
$ErrorActionPreference = 'Stop'
$projectRoot = Split-Path -Parent $PSScriptRoot
if (-not $ApkPath) {
  $config = Get-Content -LiteralPath (Join-Path $projectRoot 'app.json') -Raw -Encoding UTF8 | ConvertFrom-Json
  $ApkPath = 'dist/ClassFlow-Android-' + $config.expo.version + '-ImportFix.apk'
}
if (-not [IO.Path]::IsPathRooted($ApkPath)) { $ApkPath = Join-Path $projectRoot $ApkPath }
$ApkPath = (Resolve-Path -LiteralPath $ApkPath).Path
$source = [IO.File]::ReadAllText((Join-Path $projectRoot 'src/features/timetableBrowserScript.ts'))
$match = [regex]::Match($source, '(?s)const installTimetableObserver = String.raw`(.*)`;\s*$')
if (-not $match.Success) { throw 'Cannot locate the source timetable observer.' }
$expected = $match.Groups[1].Value.Replace("`r`n", "`n")

# Hermes stores this injected JavaScript as a UTF-16 string. Check the actual
# release asset, not the build directory, so a stale copied APK fails validation.
Add-Type -AssemblyName System.IO.Compression.FileSystem
$archive = [IO.Compression.ZipFile]::OpenRead($ApkPath)
try {
  $entry = $archive.GetEntry('assets/index.android.bundle')
  if (-not $entry) { throw 'APK does not contain the application bundle.' }
  $stream = $entry.Open()
  $buffer = [IO.MemoryStream]::new()
  try { $stream.CopyTo($buffer); $bytes = $buffer.ToArray() }
  finally { $stream.Dispose(); $buffer.Dispose() }
} finally { $archive.Dispose() }
$observer = $null
foreach ($offset in 0,1) {
  $decoded = [Text.Encoding]::Unicode.GetString($bytes, $offset, $bytes.Length - $offset)
  $start = $decoded.IndexOf($expected, [StringComparison]::Ordinal)
  if ($start -ge 0) { $observer = $decoded.Substring($start, $expected.Length); break }
}
if (-not $observer) { throw 'APK timetable observer does not match the current source. Rebuild before distributing.' }
$qaRoot = Join-Path $projectRoot '.qa'
New-Item -ItemType Directory -Path $qaRoot -Force | Out-Null
$observerPath = Join-Path $qaRoot 'packaged-observer.js'
[IO.File]::WriteAllText($observerPath, $observer, [Text.UTF8Encoding]::new($false))
Write-Output 'PASS: APK contains the exact current timetable observer.'

$previousObserver = $env:CLASSFLOW_OBSERVER_FILE
$previousBrowser = $env:CLASSFLOW_BROWSER
try {
  $env:CLASSFLOW_OBSERVER_FILE = $observerPath
  if ($BrowserPath) { $env:CLASSFLOW_BROWSER = $BrowserPath }
  & node --experimental-strip-types (Join-Path $projectRoot 'tests/timetable-compat-browser.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Packaged timetable observer failed browser regression tests.' }
  & node --experimental-strip-types (Join-Path $projectRoot 'tests/timetable-hainnu-browser.mjs')
  if ($LASTEXITCODE -ne 0) { throw 'Packaged timetable observer failed the real-page structure regression.' }
} finally {
  $env:CLASSFLOW_OBSERVER_FILE = $previousObserver
  $env:CLASSFLOW_BROWSER = $previousBrowser
}
