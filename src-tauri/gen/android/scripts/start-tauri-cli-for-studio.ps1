# Keeps the Tauri CLI dev session alive so Android Studio Gradle builds can connect
# via %TEMP%\com.spectra.texturemanager2-server-addr (WebSocket IPC + dev server).
$ErrorActionPreference = "Stop"

$repoRoot = Resolve-Path (Join-Path $PSScriptRoot "..\..\..\..")
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
if (-not $env:JAVA_HOME) {
  $openJdk22 = "C:\Program Files\OpenJDK\jdk-22.0.2"
  if (Test-Path $openJdk22) {
    $env:JAVA_HOME = $openJdk22
  } else {
    $studioJbr = "C:\Program Files\Android\Android Studio\jbr"
    if (Test-Path $studioJbr) {
      $env:JAVA_HOME = $studioJbr
    }
  }
}

$toolPaths = @(
  "C:\Program Files\nodejs",
  (Join-Path $env:USERPROFILE ".cargo\bin")
)
if ($env:NDK_HOME) {
  $toolPaths += Join-Path $env:NDK_HOME "toolchains\llvm\prebuilt\windows-x86_64\bin"
}
$toolPaths = $toolPaths | Where-Object { $_ -and (Test-Path $_) }
if ($toolPaths.Count -gt 0) {
  $env:PATH = ($toolPaths + $env:PATH) -join ";"
}

Set-Location $repoRoot

$serverAddrFile = Join-Path $env:TEMP 'com.spectra.texturemanager2-server-addr'

function Test-TauriDevCli {
  param([string]$AddrFile)
  if (-not (Test-Path $AddrFile)) {
    return $false
  }
  $address = (Get-Content $AddrFile -Raw).Trim()
  if ($address -notmatch '^([^:]+):(\d+)$') {
    Remove-Item $AddrFile -Force -ErrorAction SilentlyContinue
    return $false
  }
  $hostName = $Matches[1]
  $port = [int]$Matches[2]
  try {
    $client = New-Object System.Net.Sockets.TcpClient
    $async = $client.BeginConnect($hostName, $port, $null, $null)
    $connected = $async.AsyncWaitHandle.WaitOne(2000, $false)
    if (-not $connected) {
      $client.Close()
      return $false
    }
    $client.EndConnect($async)
    $client.Close()
    return $true
  } catch {
    return $false
  }
}

function Test-ViteDevServer {
  try {
    $response = Invoke-WebRequest -Uri 'http://127.0.0.1:1420/' -UseBasicParsing -TimeoutSec 2
    return $response.StatusCode -ge 200 -and $response.StatusCode -lt 400
  } catch {
    return $false
  }
}

if (Test-TauriDevCli -AddrFile $serverAddrFile) {
  Write-Host 'Tauri Android dev CLI is already running.'
  Write-Host 'Leave that window open and run the app from Android Studio (x86_64Debug).'
  exit 0
}

if (Test-Path $serverAddrFile) {
  Write-Host 'Removing stale Tauri dev CLI address file...'
  Remove-Item $serverAddrFile -Force
}

if (Test-ViteDevServer) {
  Write-Host 'Port 1420 has a server but Tauri dev CLI IPC is not running.'
  Write-Host 'Stop the orphan Vite process, then rerun this task.'
  exit 1
}

$portInUse = Get-NetTCPConnection -LocalPort 1420 -State Listen -ErrorAction SilentlyContinue
if ($portInUse) {
  Write-Host 'Port 1420 is in use but Vite did not respond. Stop the blocking process and retry.'
  exit 1
}

Write-Host "Starting Tauri Android dev CLI from $repoRoot"
Write-Host 'Using 127.0.0.1 + adb reverse (avoids broken Windows virtual NICs like 10.2.0.2).'

$adb = Join-Path $env:ANDROID_HOME "platform-tools\adb.exe"
if (Test-Path $adb) {
  & $adb wait-for-device
  & $adb reverse tcp:1420 tcp:1420
  & $adb reverse tcp:1421 tcp:1421
} else {
  Write-Host "Warning: adb not found; emulator may not reach the Vite server."
}

# Force loopback. Windows --host default picks virtual adapters the emulator cannot use.
npm run tauri -- android dev --no-watch --host 127.0.0.1
