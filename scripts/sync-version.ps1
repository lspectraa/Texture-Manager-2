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

function Set-FileVersion([string]$path, [scriptblock]$mutator) {
  $text = Get-Content $path -Raw
  $next = & $mutator $text
  if ($next -ne $text) {
    Set-Content -Path $path -Value $next -NoNewline -Encoding utf8
    Write-Host "Updated $path -> $version"
  } else {
    Write-Host "Unchanged $path"
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
