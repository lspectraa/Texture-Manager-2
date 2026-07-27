# Generates or reprints Tauri updater signing key instructions for Texture Manager 2.
# Private key stays outside the repo. Public key belongs in src-tauri/tauri.conf.json.

$ErrorActionPreference = "Stop"

$keyPath = Join-Path $env:USERPROFILE ".tauri\texture-manager-2.key"
$pubPath = "$keyPath.pub"
$confPath = Join-Path $PSScriptRoot "..\src-tauri\tauri.conf.json"

New-Item -ItemType Directory -Force -Path (Split-Path $keyPath) | Out-Null

if (-not (Test-Path $keyPath)) {
  Write-Host "Generating updater signing keypair..."
  Push-Location (Join-Path $PSScriptRoot "..")
  try {
    npm run tauri signer generate -- -w $keyPath --ci -f -p ""
  } finally {
    Pop-Location
  }
} else {
  Write-Host "Existing private key found at:"
  Write-Host "  $keyPath"
}

if (-not (Test-Path $pubPath)) {
  throw "Public key file missing: $pubPath"
}

$pubkey = (Get-Content $pubPath -Raw).Trim()
$conf = Get-Content $confPath -Raw | ConvertFrom-Json
$conf.plugins.updater.pubkey = $pubkey
$conf | ConvertTo-Json -Depth 20 | Set-Content -Path $confPath -Encoding utf8

Write-Host ""
Write-Host "Public key written to src-tauri/tauri.conf.json"
Write-Host ""
Write-Host "YOUR ACTION ITEMS:"
Write-Host "1. Back up the private key offline (password manager / encrypted drive):"
Write-Host "   $keyPath"
Write-Host "2. Add ONE GitHub Actions secret on lspectraa/Texture-Manager-2:"
Write-Host "   TAURI_SIGNING_PRIVATE_KEY = full contents of the private key file"
Write-Host "   Do NOT create TAURI_SIGNING_PRIVATE_KEY_PASSWORD — this key has no password,"
Write-Host "   and GitHub cannot store an empty secret. Omit the env var entirely in CI."
Write-Host "3. Repo Settings → Actions → General → Workflow permissions → Read and write"
Write-Host "4. After the publish workflow creates a draft release, review assets and publish it."
Write-Host "5. Optional later: Windows Authenticode signing for SmartScreen reputation."
Write-Host ""
Write-Host "If you lose the private key, existing installs cannot receive signed updates."
