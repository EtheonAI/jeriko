# ── JerikoBot Installer (Windows PowerShell) ────────────────────────
# iwr -useb https://jerikobot.vercel.app/install.ps1 | iex

$DownloadUrl = "https://jerikobot.vercel.app/jerikobot.zip"
$Dir = Join-Path $env:USERPROFILE ".jerikobot"

# ── Helpers ─────────────────────────────────────────────────────────

function Write-Info  { param([string]$msg) Write-Host "  $msg" -ForegroundColor Cyan }
function Write-Ok    { param([string]$msg) Write-Host "  [ok] " -ForegroundColor Green -NoNewline; Write-Host $msg }
function Write-Err   { param([string]$msg) Write-Host "  [!!] " -ForegroundColor Red -NoNewline; Write-Host $msg }
function Write-Warn  { param([string]$msg) Write-Host "  [--] " -ForegroundColor Yellow -NoNewline; Write-Host $msg }

function Test-Command { param([string]$cmd) return [bool](Get-Command $cmd -ErrorAction SilentlyContinue) }

function Install-WithPackageManager {
    param([string]$Package, [string]$WingetId, [string]$ChocoName, [string]$ScoopName)

    if (Test-Command "winget") {
        Write-Info "Installing $Package via winget..."
        winget install --id $WingetId --accept-source-agreements --accept-package-agreements
    }
    elseif (Test-Command "choco") {
        Write-Info "Installing $Package via Chocolatey..."
        choco install $ChocoName -y
    }
    elseif (Test-Command "scoop") {
        Write-Info "Installing $Package via Scoop..."
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

# Backup existing
if (Test-Path $Dir) {
    $timestamp = Get-Date -Format 'yyyyMMddHHmmss'
    $backup = "${Dir}.bak.${timestamp}"
    Move-Item -Path $Dir -Destination $backup -Force
    Write-Info "Backed up existing $Dir"
}

# Download zip
$tmpZip = Join-Path $env:TEMP "jerikobot-install.zip"
$tmpExtract = Join-Path $env:TEMP "jerikobot-extract"

Invoke-WebRequest -Uri $DownloadUrl -OutFile $tmpZip -UseBasicParsing
Write-Ok "Downloaded"

# Extract
if (Test-Path $tmpExtract) { Remove-Item $tmpExtract -Recurse -Force }
Expand-Archive -Path $tmpZip -DestinationPath $tmpExtract -Force

# Move into place
Move-Item (Join-Path $tmpExtract "jerikobot") $Dir
Remove-Item $tmpZip -Force
if (Test-Path $tmpExtract) { Remove-Item $tmpExtract -Recurse -Force }
Write-Ok "Installed to $Dir"

# Install dependencies (suppress stderr so npm warnings don't kill the script)
Write-Info "Installing dependencies..."
Push-Location $Dir
$npmOutput = & npm install --omit=dev 2>&1
Pop-Location
Write-Ok "Dependencies installed"

# Create wrapper batch file so 'jeriko' works from any terminal
$wrapperDir = Join-Path $env:USERPROFILE ".local\bin"
if (-not (Test-Path $wrapperDir)) { New-Item -ItemType Directory -Path $wrapperDir -Force | Out-Null }

$wrapperPath = Join-Path $wrapperDir "jeriko.cmd"
$jerikobin = Join-Path $Dir "bin\jeriko"
Set-Content -Path $wrapperPath -Value "@echo off`nnode `"$jerikobin`" %*"
Write-Ok "Created wrapper: $wrapperPath"

# Add to user PATH if needed
$currentUserPath = [Environment]::GetEnvironmentVariable("Path", "User")
if ($currentUserPath -notlike "*$wrapperDir*") {
    [Environment]::SetEnvironmentVariable("Path", "$currentUserPath;$wrapperDir", "User")
    $env:Path = "$env:Path;$wrapperDir"
    Write-Info "Added $wrapperDir to user PATH"
}

# ── Step 3: Verify ─────────────────────────────────────────────────

$env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")

if (Test-Command "jeriko") {
    Write-Ok "Verified - jeriko is available"
}
else {
    Write-Warn "jeriko not found in PATH - restart your terminal"
}

# ── Step 4: Onboarding ─────────────────────────────────────────────

Write-Host ""
Write-Info "Launching setup wizard..."
Write-Host ""
jeriko init
