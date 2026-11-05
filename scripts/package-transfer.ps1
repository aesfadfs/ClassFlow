$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.IO.Compression
Add-Type -AssemblyName System.IO.Compression.FileSystem
$projectRoot = [IO.Path]::GetFullPath((Split-Path -Parent $PSScriptRoot))
$config = Get-Content -LiteralPath (Join-Path $projectRoot 'app.json') -Raw -Encoding UTF8 | ConvertFrom-Json
$version = [string]$config.expo.version
if ($version -notmatch '^\d+\.\d+\.\d+$') { throw 'Unexpected application version.' }
$apk = 'dist/ClassFlow-Android-' + $version + '-ImportFix.apk'
$paths = [Collections.Generic.List[string]]::new()
foreach ($relative in @('.gitignore', 'App.tsx', 'README.md', 'HANDOFF.md', 'CLAUDE.md', 'CONTRIBUTING.md', 'app.json', 'eas.json', 'index.ts', 'package.json', 'package-lock.json', 'tsconfig.json', $apk)) {
  if (-not (Test-Path -LiteralPath (Join-Path $projectRoot $relative) -PathType Leaf)) { throw "Missing required file: $relative" }
  $paths.Add($relative)
}

# Prune caches before descending, rather than enumerating large native builds.
function Add-SourceDirectory([string]$directory) {
  foreach ($item in Get-ChildItem -LiteralPath $directory -Force) {
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) { throw "Unexpected link: $($item.FullName)" }
    if ($item.PSIsContainer) {
      if ($item.Name -notin @('node_modules', 'build', '.gradle', '.cxx', '.git', '.idea', '.kotlin', '.expo')) {
        Add-SourceDirectory $item.FullName
      }
    } elseif ($item.Name -notin @('local.properties', '.DS_Store', 'Thumbs.db') -and $item.Name -notlike '.env*' -and $item.Extension -notin @('.log', '.tsbuildinfo')) {
      $relative = $item.FullName.Substring($projectRoot.Length + 1).Replace('\', '/')
      # Only the existing development key is part of the migration contract.
      if ($item.Extension -in @('.keystore', '.jks', '.p12', '.pem', '.key') -and $relative -ne 'android/app/debug.keystore') {
        throw "Review additional signing material before packaging: $relative"
      }
      $paths.Add($relative)
    }
  }
}
foreach ($directory in @('src', 'assets', 'examples', 'tests', 'scripts', 'android')) {
  Add-SourceDirectory (Join-Path $projectRoot $directory)
}
$files = @($paths | Sort-Object -Unique | ForEach-Object {
  $source = Join-Path $projectRoot $_
  [pscustomobject]@{ path = $_; bytes = (Get-Item -LiteralPath $source).Length; sha256 = (Get-FileHash -LiteralPath $source -Algorithm SHA256).Hash }
})
$manifest = [ordered]@{
  project = 'ClassFlow'
  version = $version
  createdAtUtc = [DateTime]::UtcNow.ToString('o')
  note = 'Current working tree snapshot, including uncommitted changes. Includes the development signing key if present. Manifest excludes itself. Keep this transfer archive private.'
  files = $files
} | ConvertTo-Json -Depth 5
$outputDirectory = Join-Path $projectRoot 'dist/transfer'
New-Item -ItemType Directory -Path $outputDirectory -Force | Out-Null
$stamp = [TimeZoneInfo]::ConvertTimeBySystemTimeZoneId([DateTime]::UtcNow, 'China Standard Time').ToString('yyyyMMdd-HHmmss')
$zipPath = Join-Path $outputDirectory ('ClassFlow-' + $version + '-Transfer-' + $stamp + '.zip')
$archive = [IO.Compression.ZipFile]::Open($zipPath, [IO.Compression.ZipArchiveMode]::Create)
try {
  foreach ($file in $files) {
    [IO.Compression.ZipFileExtensions]::CreateEntryFromFile($archive, (Join-Path $projectRoot $file.path), ('ClassFlow/' + $file.path), [IO.Compression.CompressionLevel]::Optimal) | Out-Null
  }
  $entry = $archive.CreateEntry('ClassFlow/PACKAGE-MANIFEST.json')
  $writer = [IO.StreamWriter]::new($entry.Open(), [Text.UTF8Encoding]::new($false))
  try { $writer.Write($manifest) } finally { $writer.Dispose() }
} finally { $archive.Dispose() }

# Read every archived byte back and compare to the input snapshot.
$archive = [IO.Compression.ZipFile]::OpenRead($zipPath)
try {
  if ($archive.Entries.Count -ne $files.Count + 1) { throw 'ZIP file count mismatch.' }
  foreach ($file in $files) {
    $entry = $archive.GetEntry('ClassFlow/' + $file.path)
    if (-not $entry -or $entry.Length -ne $file.bytes) { throw "Missing or truncated entry: $($file.path)" }
    $stream = $entry.Open()
    $sha = [Security.Cryptography.SHA256]::Create()
    try { $actual = [BitConverter]::ToString($sha.ComputeHash($stream)).Replace('-', '') }
    finally { $stream.Dispose(); $sha.Dispose() }
    if ($actual -ne $file.sha256) { throw "ZIP hash mismatch: $($file.path)" }
  }
  $reader = [IO.StreamReader]::new($archive.GetEntry('ClassFlow/PACKAGE-MANIFEST.json').Open())
  try { if ($reader.ReadToEnd() -ne $manifest) { throw 'Manifest content mismatch.' } }
  finally { $reader.Dispose() }
} finally { $archive.Dispose() }
$zipHash = (Get-FileHash -LiteralPath $zipPath -Algorithm SHA256).Hash
[IO.File]::WriteAllText(($zipPath + '.sha256.txt'), ($zipHash + '  ' + [IO.Path]::GetFileName($zipPath) + "`r`n"), [Text.UTF8Encoding]::new($false))
[pscustomobject]@{ Archive = $zipPath; FilesVerified = $files.Count; Bytes = (Get-Item -LiteralPath $zipPath).Length; SHA256 = $zipHash } | Format-List
