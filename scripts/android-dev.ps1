# Android emulator-friendly Tauri dev:
# - adb reverse maps device localhost:1420/1421 -> host
# - --host 127.0.0.1 so CLI wait and the on-device proxy use the same reachable URL
#   (Windows auto-picks virtual NICs like 10.2.0.2 that the emulator cannot use)
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $repoRoot

if (-not $env:ANDROID_HOME) {
  $env:ANDROID_HOME = Join-Path $env:LOCALAPPDATA "Android\Sdk"
}
if (-not $env:NDK_HOME) {
  $ndkRoot = Join-Path $env:ANDROID_HOME "ndk"
  if (Test-Path $ndkRoot) {
    $env:NDK_HOME = (
      Get-ChildItem $ndkRoot -Directory |
        Sort-Object Name -Descending |
        Select-Object -First 1 -ExpandProperty FullName
    )
  }
}

$toolPaths = @(
  "C:\Program Files\nodejs",
  (Join-Path $env:USERPROFILE ".cargo\bin"),
  (Join-Path $env:ANDROID_HOME "platform-tools"),
  (Join-Path $env:ANDROID_HOME "emulator")
)
if ($env:NDK_HOME) {
  $toolPaths += Join-Path $env:NDK_HOME "toolchains\llvm\prebuilt\windows-x86_64\bin"
}
$toolPaths = $toolPaths | Where-Object { $_ -and (Test-Path $_) }
if ($toolPaths.Count -gt 0) {
  $env:PATH = ($toolPaths + $env:PATH) -join ";"
}

$adb = Join-Path $env:ANDROID_HOME "platform-tools\adb.exe"
if (-not (Test-Path $adb)) {
  throw "adb not found at $adb"
}

Write-Host "Waiting for an Android device/emulator..."
& $adb wait-for-device
$devices = & $adb devices | Select-String -Pattern "device$" | ForEach-Object { ($_ -split "\s+")[0] }
if (-not $devices) {
  throw "No Android device online. Start your emulator, then retry."
}

Write-Host "Setting adb reverse for Vite (1420) and HMR (1421)..."
& $adb reverse tcp:1420 tcp:1420
& $adb reverse tcp:1421 tcp:1421

Write-Host "Starting Tauri Android dev with host 127.0.0.1 (via adb reverse)."
Write-Host "Physical device on Wi-Fi instead? Use:"
Write-Host '  npm run tauri -- android dev --host'
npm run tauri -- android dev --host 127.0.0.1
