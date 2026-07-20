# Sync package.json version into Cargo.toml, tauri.conf.json, and appMeta.ts
$ErrorActionPreference = "Stop"

$root = Resolve-Path (Join-Path $PSScriptRoot "..")
$packageJson = Get-Content (Join-Path $root "package.json") -Raw | ConvertFrom-Json
$version = [string]$packageJson.version
if (-not $version) {
  throw "package.json is missing a version"
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

Set-FileVersion (Join-Path $root "src\config\appMeta.ts") {
  param($text)
  $text -replace '(?m)^export const APP_VERSION = "[^"]+";', "export const APP_VERSION = `"$version`";"
}

Write-Host "Version sync complete: $version"
