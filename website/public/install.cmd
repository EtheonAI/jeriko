@echo off
REM ── JerikoBot Installer (Windows Batch) ────────────────────────────
REM Downloads from website, no git or npm registry needed.
REM
REM Usage:
REM   curl -fsSL https://jerikobot.vercel.app/install.cmd -o install.cmd && install.cmd && del install.cmd

setlocal enabledelayedexpansion

echo.
echo   JerikoBot Installer
echo   Unix-first AI toolkit
echo.

set "DOWNLOAD_URL=https://jerikobot.vercel.app/jerikobot.zip"
set "INSTALL_DIR=%USERPROFILE%\.jerikobot"
set "WRAPPER_DIR=%USERPROFILE%\.local\bin"

REM ── Check Node.js ─────────────────────────────────────────────────

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo   [!!] Node.js not found.
    echo   Install Node.js 18+ from https://nodejs.org and try again.
    exit /b 1
)

for /f "tokens=1 delims=." %%i in ('node -v') do set NODE_VER=%%i
set NODE_VER=%NODE_VER:v=%

if %NODE_VER% lss 18 (
    echo   [!!] Node.js 18+ required ^(found v%NODE_VER%^)
    echo   Update from https://nodejs.org
    exit /b 1
)
echo   [ok] Node.js v%NODE_VER%

REM ── Check curl ────────────────────────────────────────────────────

where curl >nul 2>nul
if %errorlevel% neq 0 (
    echo   [!!] curl not found. Windows 10+ should have curl built-in.
    exit /b 1
)

REM ── Download ──────────────────────────────────────────────────────

echo   Downloading JerikoBot...

set "TMP_ZIP=%TEMP%\jerikobot-install.zip"
set "TMP_DIR=%TEMP%\jerikobot-extract"

curl -fsSL "%DOWNLOAD_URL%" -o "%TMP_ZIP%"
if %errorlevel% neq 0 (
    echo   [!!] Download failed
    exit /b 1
)
echo   [ok] Downloaded

REM ── Extract ───────────────────────────────────────────────────────

if exist "%TMP_DIR%" rmdir /s /q "%TMP_DIR%"

REM Use PowerShell to extract (available on all modern Windows)
powershell -Command "Expand-Archive -Path '%TMP_ZIP%' -DestinationPath '%TMP_DIR%' -Force"
if %errorlevel% neq 0 (
    echo   [!!] Extract failed
    exit /b 1
)

REM ── Install ───────────────────────────────────────────────────────

REM Backup existing
if exist "%INSTALL_DIR%" (
    set "BACKUP=%INSTALL_DIR%.bak.%date:~-4%%date:~4,2%%date:~7,2%"
    move "%INSTALL_DIR%" "!BACKUP!" >nul 2>nul
    echo   [--] Backed up existing installation
)

move "%TMP_DIR%\jerikobot" "%INSTALL_DIR%" >nul
del "%TMP_ZIP%" >nul 2>nul
if exist "%TMP_DIR%" rmdir /s /q "%TMP_DIR%"
echo   [ok] Installed to %INSTALL_DIR%

REM ── Install dependencies ──────────────────────────────────────────

echo   Installing dependencies...
pushd "%INSTALL_DIR%"
call npm install --production >nul 2>nul
popd
echo   [ok] Dependencies installed

REM ── Create wrapper ────────────────────────────────────────────────

if not exist "%WRAPPER_DIR%" mkdir "%WRAPPER_DIR%"

echo @echo off> "%WRAPPER_DIR%\jeriko.cmd"
echo node "%INSTALL_DIR%\bin\jeriko" %%*>> "%WRAPPER_DIR%\jeriko.cmd"
echo   [ok] Created jeriko.cmd wrapper

REM ── Add to PATH ───────────────────────────────────────────────────

echo %PATH% | findstr /i /c:"%WRAPPER_DIR%" >nul 2>nul
if %errorlevel% neq 0 (
    powershell -Command "[Environment]::SetEnvironmentVariable('Path', [Environment]::GetEnvironmentVariable('Path','User') + ';%WRAPPER_DIR%', 'User')"
    set "PATH=%PATH%;%WRAPPER_DIR%"
    echo   [ok] Added %WRAPPER_DIR% to user PATH
)

REM ── Verify ────────────────────────────────────────────────────────

call jeriko --version >nul 2>nul
if %errorlevel% neq 0 (
    echo   [--] jeriko not in PATH yet - restart your terminal
) else (
    echo   [ok] jeriko is available
)

REM ── Onboarding ────────────────────────────────────────────────────

echo.
echo   Launching setup wizard...
echo.
call jeriko init
