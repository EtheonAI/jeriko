# ── JerikoBot Installer (Windows PowerShell) ────────────────────────
# iwr -useb https://jerikobot.vercel.app/install.ps1 | iex
#
# Parameters:
#   -InstallMethod npm|git   (default: npm)
#   -Version <version>       (default: latest)
#   -GitDir <path>           git clone target (default: $HOME\.jerikobot)
#   -NoOnboard               skip jeriko init
#   -DryRun                  show what would happen

param(
    [ValidateSet("npm", "git")]
    [string]$InstallMethod = "npm",

    [string]$Version = "latest",

    [string]$GitDir = "$env:USERPROFILE\.jerikobot",

    [switch]$NoOnboard,

    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

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
        # Refresh PATH
        $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
    }
    else {
        Write-Ok "Node.js v$nodeVer"
    }
}
else {
    Write-Info "Node.js not found. Installing..."
    Install-WithPackageManager -Package "Node.js" -WingetId "OpenJS.NodeJS.LTS" -ChocoName "nodejs-lts" -ScoopName "nodejs-lts"
    # Refresh PATH
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
    Write-Ok "Node.js installed"
}

# ── Step 2: Check git (for git method) ──────────────────────────────

if ($InstallMethod -eq "git") {
    if (-not (Test-Command "git")) {
        Write-Info "git not found. Installing..."
        Install-WithPackageManager -Package "Git" -WingetId "Git.Git" -ChocoName "git" -ScoopName "git"
        $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")
    }
    Write-Ok "git $(git --version 2>$null)"
}

# ── Step 3: Install ────────────────────────────────────────────────

if ($InstallMethod -eq "npm") {
    # ── npm global install ──
    $pkg = if ($Version -eq "latest") { "jerikobot" } else { "jerikobot@$Version" }
    Write-Info "Installing JerikoBot via npm..."

    if ($DryRun) {
        Write-Dry "npm install -g $pkg"
    }
    else {
        npm install -g $pkg
        Write-Ok "Installed $pkg globally"
    }

    # Ensure npm global bin is in user PATH
    $npmPrefix = (npm config get prefix).Trim()
    $npmBin = "$npmPrefix"  # On Windows, npm prefix IS the bin dir
    $currentUserPath = [Environment]::GetEnvironmentVariable("Path", "User")

    if ($currentUserPath -notlike "*$npmBin*") {
        Write-Info "Adding npm global bin to user PATH..."
        if (-not $DryRun) {
            [Environment]::SetEnvironmentVariable("Path", "$currentUserPath;$npmBin", "User")
            $env:Path = "$env:Path;$npmBin"
        }
        else {
            Write-Dry "Add $npmBin to user PATH"
        }
    }
}
else {
    # ── git clone install ──
    Write-Info "Installing JerikoBot via git clone..."

    if ($DryRun) {
        Write-Dry "git clone https://github.com/khaleel737/jerikobot.git $GitDir"
        Write-Dry "npm install --production in $GitDir"
    }
    else {
        if (Test-Path "$GitDir\.git") {
            Write-Info "Updating existing installation..."
            Push-Location $GitDir
            git pull --ff-only
            Pop-Location
            Write-Ok "Updated $GitDir"
        }
        else {
            if (Test-Path $GitDir) {
                $backup = "$GitDir.bak.$(Get-Date -Format 'yyyyMMddHHmmss')"
                Move-Item $GitDir $backup
                Write-Info "Backed up existing $GitDir"
            }
            if ($Version -ne "latest") {
                git clone --branch "v$Version" --depth 1 "https://github.com/khaleel737/jerikobot.git" $GitDir
            }
            else {
                git clone --depth 1 "https://github.com/khaleel737/jerikobot.git" $GitDir
            }
            Write-Ok "Cloned to $GitDir"
        }

        Write-Info "Installing dependencies..."
        Push-Location $GitDir
        npm install --production 2>$null
        Pop-Location
        Write-Ok "Dependencies installed"

        # Create wrapper batch file in a PATH location
        $wrapperDir = "$env:USERPROFILE\.local\bin"
        if (-not (Test-Path $wrapperDir)) { New-Item -ItemType Directory -Path $wrapperDir -Force | Out-Null }

        $wrapperPath = "$wrapperDir\jeriko.cmd"
        Set-Content -Path $wrapperPath -Value "@echo off`nnode `"$GitDir\bin\jeriko`" %*"
        Write-Ok "Created wrapper: $wrapperPath"

        # Add to user PATH if needed
        $currentUserPath = [Environment]::GetEnvironmentVariable("Path", "User")
        if ($currentUserPath -notlike "*$wrapperDir*") {
            [Environment]::SetEnvironmentVariable("Path", "$currentUserPath;$wrapperDir", "User")
            $env:Path = "$env:Path;$wrapperDir"
            Write-Info "Added $wrapperDir to user PATH"
        }
    }
}

# ── Step 4: Verify ─────────────────────────────────────────────────

if (-not $DryRun) {
    # Refresh PATH one more time
    $env:Path = [Environment]::GetEnvironmentVariable("Path", "Machine") + ";" + [Environment]::GetEnvironmentVariable("Path", "User")

    if (Test-Command "jeriko") {
        Write-Ok "Verified - jeriko is available"
    }
    else {
        Write-Warn "jeriko not found in PATH - restart your terminal"
    }
}

# ── Step 5: Onboarding ─────────────────────────────────────────────

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
