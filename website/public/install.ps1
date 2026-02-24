# ── JerikoBot Installer (Windows PowerShell) ────────────────────────
# iwr -useb https://jerikobot.vercel.app/install.ps1 | iex
#
# Parameters:
#   -Dir <path>        install directory (default: $HOME\.jerikobot)
#   -NoOnboard         skip jeriko init
#   -DryRun            show what would happen

param(
    [string]$Dir = "$env:USERPROFILE\.jerikobot",
    [switch]$NoOnboard,
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"
$DownloadUrl = "https://jerikobot.vercel.app/jerikobot.zip"

# ── Helpers ─────────────────────────────────────────────────────────

function Write-Info  { param([string]$msg) Write-Host "  $msg" -ForegroundColor Cyan }
function Write-Ok    { param([string]$msg) Write-Host "  [ok] " -ForegroundColor Green -NoNewline; Write-Host $msg }
function Write-Err   { param([string]$msg) Write-Host "  [!!] " -ForegroundColor Red -NoNewline; Write-Host $msg }
function Write-Warn  { param([string]$msg) Write-Host "  [--] " -ForegroundColor Yellow -NoNewline; Write-Host $msg }
function Write-Dry   { param([string]$msg) Write-Host "  [dry-run] " -ForegroundColor Blue -NoNewline; Write-Host $msg }

function Test-Command { param([string]$cmd) return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

function Install-WithPackageManager {
    param([string]$Package, [string]$WingetId, [string]$ChocoName, [string]$ScoopName)

    if (Test-Command "winget") {
        Write-Info "Installing $Package via winget..."
        if ($DryRun) { Write-Dry "winget install $WingetId"; return }
        winget install --id $WingetId --accept-source-agreements --accept-package-agreements
    }
    elseif (Test-Command "choco") {
        Write-Info "Installing $Package via Chocolatey..."
        if ($DryRun) { Write-Dry "choco install $ChocoName -y"; return }
        choco install $ChocoName -y
    }
    elseif (Test-Command "scoop") {
        Write-Info "Installing $Package via Scoop..."
        if ($DryRun) { Write-Dry "scoop install $ScoopName"; return }
        scoop install $ScoopName
    }
    else {
        Write-Err "No package manager found (winget, choco, scoop). Install $Package manually."
        exit 1
    }
}

# ── Banner ──────────────────────────────────────────────────────────

Write-Host ""
Write-Host "  JerikoBot Installer" -ForegroundColor Cyan
Write-Host "  Unix-first AI toolkit" -ForegroundColor DarkGray
Write-Host ""

# ── Check PowerShell version ────────────────────────────────────────

if ($PSVersionTable.PSVersion.Major -lt 5) {
    Write-Err "PowerShell 5+ required (found $($PSVersionTable.PSVersion))"
    exit 1
}
Write-Ok "PowerShell $($PSVersionTable.PSVersion)"

# ── Step 1: Check Node.js 18+ ──────────────────────────────────────

if (Test-Command "node") {
    $nodeVer = (node -v) -replace "v", ""
    $nodeMajor = [int]($nodeVer.Split(".")[0])
    if ($nodeMajor -lt 18) {
        Write-Err "Node.js 18+ required (found v$nodeVer)"
        Write-Info "Installing Node.js..."
        Install-WithPackageManager -Package "Node.js" -WingetId "OpenJS.NodeJS.LTS" -ChocoName "nodejs-lts" -ScoopName "nodejs-lts"
        $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
    }
    else {
        Write-Ok "Node.js v$nodeVer"
    }
}
else {
    Write-Info "Node.js not found. Installing..."
    Install-WithPackageManager -Package "Node.js" -WingetId "OpenJS.NodeJS.LTS" -ChocoName "nodejs-lts" -ScoopName "nodejs-lts"
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
    Write-Ok "Node.js installed"
}

# ── Step 2: Download & extract ──────────────────────────────────────

Write-Info "Downloading JerikoBot..."

if ($DryRun) {
    Write-Dry "Download $DownloadUrl"
    Write-Dry "Extract to $Dir"
    Write-Dry "npm install --production"
}
else {
    # Backup existing
    if (Test-Path $Dir) {
        $backup = "$Dir.bak.$(Get-Date -Format 'yyyyMMddHHmmss')"
        Move-Item $Dir $backup
        Write-Info "Backed up existing $Dir"
    }

    # Download zip
    $tmpZip = "$env:TEMP\jerikobot-install.zip"
    $tmpExtract = "$env:TEMP\jerikobot-extract"

    Invoke-WebRequest -Uri $DownloadUrl -OutFile $tmpZip -UseBasicParsing
    Write-Ok "Downloaded"

    # Extract
    if (Test-Path $tmpExtract) { Remove-Item $tmpExtract -Recurse -Force }
    Expand-Archive -Path $tmpZip -DestinationPath $tmpExtract -Force

    # Move into place
    Move-Item "$tmpExtract\jerikobot" $Dir
    Remove-Item $tmpZip -Force
    Remove-Item $tmpExtract -Recurse -Force
    Write-Ok "Installed to $Dir"

    # Install dependencies
    Write-Info "Installing dependencies..."
    Push-Location $Dir
    npm install --production 2>$null
    Pop-Location
    Write-Ok "Dependencies installed"

    # Create wrapper batch file so 'jeriko' works from any terminal
    $wrapperDir = "$env:USERPROFILE\.local\bin"
    if (-not (Test-Path $wrapperDir)) { New-Item -ItemType Directory -Path $wrapperDir -Force | Out-Null }

    $wrapperPath = "$wrapperDir\jeriko.cmd"
    Set-Content -Path $wrapperPath -Value "@echo off`nnode `"$Dir\bin\jeriko`" %*"
    Write-Ok "Created wrapper: $wrapperPath"

    # Add to user PATH if needed
    $currentUserPath = [Environment]::GetEnvironmentVariable("Path", "User")
    if ($currentUserPath -notlike "*$wrapperDir*") {
        [Environment]::SetEnvironmentVariable("Path", "$currentUserPath;$wrapperDir", "User")
        $env:Path = "$env:Path;$wrapperDir"
        Write-Info "Added $wrapperDir to user PATH"
    }
}

# ── Step 3: Verify ─────────────────────────────────────────────────

if (-not $DryRun) {
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")

    if (Test-Command "jeriko") {
        Write-Ok "Verified - jeriko is available"
    }
    else {
        Write-Warn "jeriko not found in PATH - restart your terminal"
    }
}

# ── Step 4: Onboarding ─────────────────────────────────────────────

if ($NoOnboard) {
    Write-Host ""
    Write-Ok "Installation complete (onboarding skipped)"
    Write-Host "  Run 'jeriko init' when you're ready to set up" -ForegroundColor DarkGray
    Write-Host ""
    exit 0
}

if ($DryRun) {
    Write-Dry "jeriko init"
    Write-Host ""
    Write-Ok "Dry run complete - no changes made"
    Write-Host ""
    exit 0
}

Write-Host ""
Write-Info "Launching setup wizard..."
Write-Host ""
jeriko init
