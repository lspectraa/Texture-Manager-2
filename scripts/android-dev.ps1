# Android emulator-friendly Tauri dev:
# - launches an AVD automatically when no device is online (ANDROID_AVD to pick one)
# - defaults to -gpu swiftshader_indirect so WebView isn't a black surface on broken host GPU
# - clears leftover WebView --disable-gpu flags from older black-screen workarounds
# - adb reverse maps device localhost:1420/1421 -> host (physical devices + fallback)
# - HMR in the WebView uses 10.0.2.2 on Android emulators (see index.html shim)
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

$emulator = Join-Path $env:ANDROID_HOME "emulator\emulator.exe"
if (-not (Test-Path $emulator)) {
  throw "Android emulator not found at $emulator"
}

function Assert-PortFree([int] $Port) {
  $listeners = Get-NetTCPConnection -LocalPort $Port -State Listen -ErrorAction SilentlyContinue
  if (-not $listeners) {
    return
  }
  $pids = $listeners | Select-Object -ExpandProperty OwningProcess -Unique
  $names = foreach ($procId in $pids) {
    try {
      $p = Get-Process -Id $procId -ErrorAction Stop
      "{0} (pid {1})" -f $p.ProcessName, $procId
    } catch {
      "pid $procId"
    }
  }
  throw ("Port {0} is already in use by: {1}. Stop that process, then retry `npm run android:dev`." -f $Port, ($names -join ", "))
}

function Get-OnlineAdbDevices {
  & $adb devices |
    Select-String -Pattern "device$" |
    ForEach-Object { ($_ -split "\s+")[0] } |
    Where-Object { $_ -and $_ -ne "List" }
}

function Wait-ForAndroidBoot([int] $TimeoutSeconds = 180) {
  Write-Host "Waiting for Android device/emulator..."
  & $adb wait-for-device

  $deadline = (Get-Date).AddSeconds($TimeoutSeconds)
  while ((Get-Date) -lt $deadline) {
    $devices = @(Get-OnlineAdbDevices)
    if ($devices.Count -gt 0) {
      $boot = (& $adb shell getprop sys.boot_completed 2>$null | Out-String).Trim()
      if ($boot -eq "1") {
        return $devices
      }
    }
    Start-Sleep -Seconds 2
  }

  throw "Timed out waiting for Android to finish booting after ${TimeoutSeconds}s."
}

function Start-AndroidEmulatorIfNeeded {
  $existing = @(Get-OnlineAdbDevices)
  if ($existing.Count -gt 0) {
    Write-Host ("Using already-online device(s): {0}" -f ($existing -join ", "))
    return
  }

  $avds = @(& $emulator -list-avds 2>$null | Where-Object { $_.Trim() })
  if ($avds.Count -eq 0) {
    throw "No Android Virtual Devices found. Create one in Android Studio, then retry."
  }

  $preferred = $env:ANDROID_AVD
  if ($preferred) {
    if ($avds -notcontains $preferred) {
      throw ("ANDROID_AVD '{0}' not found. Available: {1}" -f $preferred, ($avds -join ", "))
    }
    $avd = $preferred
  } else {
    $avd = $avds[0]
  }

  # Host GPU + MESA on some Windows setups paints a black WebView while a11y still
  # has content. SwiftShader is slower but composites Chromium reliably.
  $gpuMode = if ($env:ANDROID_EMULATOR_GPU) { $env:ANDROID_EMULATOR_GPU } else { "swiftshader_indirect" }

  Write-Host "No device online. Launching emulator AVD '$avd' (-gpu $gpuMode)..."
  if ($avds.Count -gt 1 -and -not $preferred) {
    Write-Host ("(Set ANDROID_AVD to pick a different AVD. Available: {0})" -f ($avds -join ", "))
  }

  Start-Process -FilePath $emulator -ArgumentList @(
    "-avd", $avd,
    "-gpu", $gpuMode
  ) -WindowStyle Normal | Out-Null
}

function Set-WebViewSoftwareFlags {
  # Clear any leftover GPU-disable flags from earlier black-screen workarounds.
  # With SwiftShader emulator GPU, Chromium should composite normally; forcing
  # software WebView painting collapses the dock and hardens background orbs.
  & $adb shell "rm -f /data/local/tmp/webview-command-line" 2>$null
}

Start-AndroidEmulatorIfNeeded
$devices = Wait-ForAndroidBoot
Write-Host ("Android ready: {0}" -f ($devices -join ", "))
Set-WebViewSoftwareFlags

Write-Host "Checking Vite ports 1420 / 1421..."
Assert-PortFree 1420
Assert-PortFree 1421

Write-Host "Setting adb reverse for Vite (1420) and HMR (1421)..."
& $adb reverse --remove-all 2>$null
& $adb reverse tcp:1420 tcp:1420
& $adb reverse tcp:1421 tcp:1421
& $adb reverse --list

Write-Host "Starting Tauri Android dev with host 127.0.0.1 (via adb reverse)."
Write-Host "Prefer this script (`npm run android:dev`) over bare `npm run tauri -- android dev`."
Write-Host "Physical device on Wi-Fi instead? Use:"
Write-Host '  npm run tauri -- android dev --host'
npm run tauri -- android dev --host 127.0.0.1
