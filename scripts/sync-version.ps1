# Sync package.json version (single source of truth) into Cargo.toml and tauri.conf.json.
# Frontend reads the version from package.json directly — do not hardcode it elsewhere.
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$packageJsonPath = Join-Path $root "package.json"
$packageJson = Get-Content $packageJsonPath -Raw | ConvertFrom-Json
$version = [string]$packageJson.version
if (-not $version) {
  throw "package.json is missing a version"
}
if ($version -notmatch '^\d+\.\d+\.\d+$') {
  throw "package.json version must be numeric SemVer major.minor.patch (got '$version'). WiX/MSI rejects prerelease tags."
}

function Read-TextNoBom([string]$path) {
  $text = [System.IO.File]::ReadAllText($path)
  return $text.TrimStart([char]0xFEFF)
}

function Write-TextNoBom([string]$path, [string]$text) {
  $utf8NoBom = New-Object System.Text.UTF8Encoding $false
  [System.IO.File]::WriteAllText($path, $text, $utf8NoBom)
}

function Set-FileVersion([string]$path, [scriptblock]$mutator) {
  $text = Read-TextNoBom $path
  $next = & $mutator $text
  if ($next -ne $text) {
    Write-TextNoBom $path $next
    Write-Host "Updated $path -> $version"
  } else {
    # Still rewrite without BOM if a previous PowerShell Set-Content left one behind.
    $raw = [System.IO.File]::ReadAllBytes($path)
    if ($raw.Length -ge 3 -and $raw[0] -eq 0xEF -and $raw[1] -eq 0xBB -and $raw[2] -eq 0xBF) {
      Write-TextNoBom $path $text
      Write-Host "Stripped UTF-8 BOM from $path"
    } else {
      Write-Host "Unchanged $path"
    }
  }
}

Set-FileVersion (Join-Path $root "src-tauri\Cargo.toml") {
  param($text)
  $text -replace '(?m)^version\s*=\s*"[^"]+"', "version = `"$version`""
}

Set-FileVersion (Join-Path $root "src-tauri\tauri.conf.json") {
  param($text)
  $text -replace '(?m)^(\s*"version"\s*:\s*)"[^"]+"', "`$1`"$version`""
}

Write-Host "Version sync complete: $version (source: package.json)"
