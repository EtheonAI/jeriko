@echo off
setlocal enabledelayedexpansion
REM
REM Jeriko Installer for Windows (CMD)
REM
REM Usage:
REM   install.cmd                  Install latest version
REM   install.cmd latest           Install latest version
REM   install.cmd stable           Install stable version
REM   install.cmd 2.0.0            Install specific version
REM
REM Requires: curl (built into Windows 10+), certutil
REM For full features, prefer the PowerShell installer:
REM   irm https://jeriko.ai/install.ps1 ^| iex
REM

REM ── Parse arguments ────────────────────────────────────────────

set "TARGET=%~1"
if "%TARGET%"=="" set "TARGET=latest"

REM Validate target
echo %TARGET% | findstr /r "^stable$ ^latest$ ^[0-9][0-9]*\.[0-9][0-9]*\.[0-9][0-9]*" >nul 2>&1
if errorlevel 1 (
    echo Usage: %~nx0 [stable^|latest^|VERSION] >&2
    exit /b 1
)

REM ── Config ─────────────────────────────────────────────────────

set "GITHUB_REPO=etheonai/jeriko"
set "RELEASES_URL=https://github.com/%GITHUB_REPO%/releases"
if defined JERIKO_CDN_URL (
    set "CDN_URL=%JERIKO_CDN_URL%"
) else (
    set "CDN_URL=https://releases.jeriko.ai"
)
set "DOWNLOAD_DIR=%USERPROFILE%\.jeriko\downloads"

REM ── Verify prerequisites ───────────────────────────────────────

where curl >nul 2>&1
if errorlevel 1 (
    echo [ERROR] curl is required but not found. >&2
    echo Install Windows 10 or later, or use the PowerShell installer. >&2
    exit /b 1
)

where certutil >nul 2>&1
if errorlevel 1 (
    echo [WARN] certutil not found — checksum verification will be skipped.
    set "HAS_CERTUTIL=0"
) else (
    set "HAS_CERTUTIL=1"
)

REM ── Detect architecture ────────────────────────────────────────

if "%PROCESSOR_ARCHITECTURE%"=="AMD64" (
    set "ARCH=x64"
) else if "%PROCESSOR_ARCHITECTURE%"=="ARM64" (
    set "ARCH=arm64"
) else (
    echo [ERROR] Unsupported architecture: %PROCESSOR_ARCHITECTURE% >&2
    exit /b 1
)

set "PLATFORM=windows-%ARCH%"
set "BINARY_NAME=jeriko-%PLATFORM%.exe"

REM ── Header ─────────────────────────────────────────────────────

echo.
echo   Jeriko Installer
echo   ----------------
echo.

REM ── Resolve version ────────────────────────────────────────────

echo   [*] Platform: %PLATFORM%

set "VERSION="

if "%TARGET%"=="latest" goto :resolve_version
if "%TARGET%"=="stable" goto :resolve_version
set "VERSION=%TARGET%"
goto :version_resolved

:resolve_version
echo   [*] Fetching %TARGET% version...

REM Try CDN
curl -fsSL "%CDN_URL%/releases/%TARGET%" 2>nul > "%TEMP%\jeriko-version.txt"
if not errorlevel 1 (
    set /p VERSION=<"%TEMP%\jeriko-version.txt"
    del "%TEMP%\jeriko-version.txt" >nul 2>&1
)

REM Fallback to GitHub API
if "%VERSION%"=="" (
    curl -fsSL "https://api.github.com/repos/%GITHUB_REPO%/releases/latest" 2>nul > "%TEMP%\jeriko-release.json"
    if not errorlevel 1 (
        for /f "tokens=2 delims=:, " %%a in ('findstr /c:"\"tag_name\"" "%TEMP%\jeriko-release.json"') do (
            set "VERSION=%%~a"
        )
        del "%TEMP%\jeriko-release.json" >nul 2>&1
        REM Strip leading 'v'
        if defined VERSION (
            if "!VERSION:~0,1!"=="v" set "VERSION=!VERSION:~1!"
        )
    )
)

if "%VERSION%"=="" (
    echo   [ERROR] Could not detect latest version. Check: %RELEASES_URL% >&2
    exit /b 1
)

:version_resolved
echo   [*] Version: %VERSION%

REM ── Download ───────────────────────────────────────────────────

if not exist "%DOWNLOAD_DIR%" mkdir "%DOWNLOAD_DIR%"
set "BINARY_PATH=%DOWNLOAD_DIR%\jeriko-%VERSION%-%PLATFORM%.exe"

echo   [*] Downloading %BINARY_NAME%...

set "RELEASE_BASE="
curl -fsSL -o "%TEMP%\jeriko-origin-probe" "%CDN_URL%/releases/%VERSION%/%BINARY_NAME%" 2>nul
if not errorlevel 1 set "RELEASE_BASE=%CDN_URL%/releases/%VERSION%"
if exist "%TEMP%\jeriko-origin-probe" del "%TEMP%\jeriko-origin-probe" >nul 2>&1

if "%RELEASE_BASE%"=="" (
    curl -fsSL -o "%TEMP%\jeriko-origin-probe" "%RELEASES_URL%/download/v%VERSION%/%BINARY_NAME%" 2>nul
    if not errorlevel 1 set "RELEASE_BASE=%RELEASES_URL%/download/v%VERSION%"
    if exist "%TEMP%\jeriko-origin-probe" del "%TEMP%\jeriko-origin-probe" >nul 2>&1
)

if "%RELEASE_BASE%"=="" (
    curl -fsSL -o "%TEMP%\jeriko-origin-probe" "%RELEASES_URL%/download/%VERSION%/%BINARY_NAME%" 2>nul
    if not errorlevel 1 set "RELEASE_BASE=%RELEASES_URL%/download/%VERSION%"
    if exist "%TEMP%\jeriko-origin-probe" del "%TEMP%\jeriko-origin-probe" >nul 2>&1
)

if "%RELEASE_BASE%"=="" (
    echo   [ERROR] Download failed. Check: %RELEASES_URL% >&2
    exit /b 1
)

curl -fsSL -o "%BINARY_PATH%" "%RELEASE_BASE%/%BINARY_NAME%" 2>nul
if errorlevel 1 (
    echo   [ERROR] Download failed. Check: %RELEASES_URL% >&2
    exit /b 1
)

REM ── Checksum verification ──────────────────────────────────────

echo   [*] Verifying checksum...

set "MANIFEST_PATH=%DOWNLOAD_DIR%\manifest-%VERSION%.json"
set "MANIFEST_OK=0"

curl -fsSL -o "%MANIFEST_PATH%" "%RELEASE_BASE%/manifest.json" 2>nul
if not errorlevel 1 set "MANIFEST_OK=1"

if "%MANIFEST_OK%"=="0" (
    del "%BINARY_PATH%" >nul 2>&1
    echo   [ERROR] No manifest found — cannot verify binary integrity >&2
    exit /b 1
)

REM Extract checksum for our platform from manifest
set "EXPECTED_HASH="
for /f "tokens=*" %%l in ('findstr /c:"%PLATFORM%" "%MANIFEST_PATH%"') do (
    set "LINE=%%l"
)
del "%MANIFEST_PATH%" >nul 2>&1

REM Parse checksum value from the JSON line
if defined LINE (
    for /f "tokens=2 delims=:" %%h in ('echo !LINE! ^| findstr /r "checksum"') do (
        set "RAW=%%h"
        REM Strip quotes, spaces, commas
        set "RAW=!RAW: =!"
        set "RAW=!RAW:"=!"
        set "RAW=!RAW:,=!"
        set "EXPECTED_HASH=!RAW!"
    )
)

if "%HAS_CERTUTIL%"=="1" (
    if defined EXPECTED_HASH (
        REM Compute SHA-256
        certutil -hashfile "%BINARY_PATH%" SHA256 > "%TEMP%\jeriko-hash.txt" 2>nul
        for /f "skip=1 tokens=1" %%h in (%TEMP%\jeriko-hash.txt) do (
            if not defined ACTUAL_HASH set "ACTUAL_HASH=%%h"
        )
        del "%TEMP%\jeriko-hash.txt" >nul 2>&1

        if /i not "!ACTUAL_HASH!"=="!EXPECTED_HASH!" (
            del "%BINARY_PATH%" >nul 2>&1
            echo   [ERROR] Checksum verification failed >&2
            exit /b 1
        )
        echo   [OK] Checksum verified
    ) else (
        del "%BINARY_PATH%" >nul 2>&1
        echo   [ERROR] Platform %PLATFORM% not found in manifest >&2
        exit /b 1
    )
) else (
    echo   [WARN] Skipping checksum verification (certutil not available)
)

REM ── Download agent system prompt ─────────────────────────────────

set "AGENT_MD_PATH=%DOWNLOAD_DIR%\agent.md"
echo   [*] Downloading agent system prompt...

set "AGENT_OK=0"
curl -fsSL -o "%AGENT_MD_PATH%" "%RELEASE_BASE%/agent.md" 2>nul
if not errorlevel 1 set "AGENT_OK=1"

if "%AGENT_OK%"=="1" (
    if defined XDG_CONFIG_HOME (
        set "CONF_DIR=%XDG_CONFIG_HOME%\jeriko"
    ) else (
        set "CONF_DIR=%USERPROFILE%\.config\jeriko"
    )
    if not exist "!CONF_DIR!" mkdir "!CONF_DIR!"
    copy /y "%AGENT_MD_PATH%" "!CONF_DIR!\agent.md" >nul 2>&1
    echo   [OK] Agent prompt installed
) else (
    echo   [WARN] Could not download agent.md — run 'jeriko init' to configure
)

REM ── Self-install via binary ────────────────────────────────────

echo   [*] Running self-install...
"%BINARY_PATH%" install "%VERSION%"
set "INSTALL_EXIT=%ERRORLEVEL%"

REM ── Cleanup ────────────────────────────────────────────────────

del "%BINARY_PATH%" >nul 2>&1
del "%AGENT_MD_PATH%" >nul 2>&1

if not "%INSTALL_EXIT%"=="0" (
    echo   [ERROR] Self-install failed (exit code %INSTALL_EXIT%) >&2
    exit /b %INSTALL_EXIT%
)

echo.
echo   Installation complete!
echo.
echo   Documentation: https://jeriko.ai/docs
echo.

endlocal
