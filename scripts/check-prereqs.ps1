$ErrorActionPreference = "Stop"

function Test-Command {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Name
    )

    $command = Get-Command $Name -ErrorAction SilentlyContinue
    if ($null -eq $command) {
        return $false
    }
    return $true
}

function Write-Status {
    param(
        [Parameter(Mandatory = $true)]
        [string]$Label,
        [Parameter(Mandatory = $true)]
        [bool]$Ok
    )

    $symbol = if ($Ok) { "[OK]" } else { "[MISSING]" }
    Write-Output "$symbol $Label"
}

function Get-NodeMajorVersion {
    try {
        $raw = (& node --version 2>$null)
        if ($null -eq $raw) {
            return $null
        }
        $text = [string]$raw
        if ($text -match '^v?(\d+)') {
            return [int]$Matches[1]
        }
        return $null
    } catch {
        return $null
    }
}

Write-Output "Texture Manager 2 prerequisite check"
Write-Output "-------------------------------------"

$hasNode = Test-Command "node"
$hasNpm = Test-Command "npm"
$hasRustc = Test-Command "rustc"
$hasCargo = Test-Command "cargo"
$hasWinget = Test-Command "winget"
$nodeMajor = if ($hasNode) { Get-NodeMajorVersion } else { $null }
$nodeVersionOk = $hasNode -and ($null -ne $nodeMajor) -and ($nodeMajor -ge 24)

Write-Status "node (>=24)" $nodeVersionOk
Write-Status "npm" $hasNpm
Write-Status "rustc" $hasRustc
Write-Status "cargo" $hasCargo
Write-Status "winget" $hasWinget

if ($hasNode) { node --version }
if ($hasNpm) { npm --version }
if ($hasRustc) { rustc --version }
if ($hasCargo) { cargo --version }
if ($hasWinget) { winget --version }

$missing = @()
if (-not $hasNode) {
    $missing += "Node.js 24+"
} elseif (-not $nodeVersionOk) {
    $missing += "Node.js 24+ (found v$nodeMajor)"
}
if (-not $hasNpm) { $missing += "npm" }
if (-not $hasRustc -or -not $hasCargo) { $missing += "Rust toolchain (rustup/rustc/cargo)" }

if ($missing.Count -gt 0) {
    Write-Output ""
    Write-Output "Missing prerequisites:"
    $missing | ForEach-Object { Write-Output " - $_" }
    Write-Output ""
    Write-Output "Install hints (Windows):"
    Write-Output " - Rust: winget install Rustlang.Rustup"
    Write-Output " - Node 24: winget install OpenJS.NodeJS"
    Write-Output ""
    Write-Output "After install, restart terminal and rerun:"
    Write-Output " npm run check:env"
    exit 1
}

Write-Output ""
Write-Output "All required Phase 0 prerequisites are installed."
