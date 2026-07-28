# Thin wrapper — canonical sync lives in sync-version.mjs (works on Windows + macOS CI).
$ErrorActionPreference = "Stop"
$root = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $root
node ./scripts/sync-version.mjs
