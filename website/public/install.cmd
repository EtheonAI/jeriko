@echo off
REM ── JerikoBot Installer (Windows Batch Fallback) ──────────────────
REM curl -fsSL https://jerikobot.vercel.app/install.cmd -o install.cmd && install.cmd && del install.cmd

echo.
echo   JerikoBot Installer
echo   Unix-first AI toolkit
echo.

REM ── Check Node.js ─────────────────────────────────────────────────

where node >nul 2>nul
if %errorlevel% neq 0 (
    echo   [!!] Node.js not found.
    echo   Install Node.js 18+ from https://nodejs.org and try again.
    exit /b 1
)

for /f "tokens=1 delims=v" %%i in ('node -v') do set NODE_RAW=%%i
for /f "tokens=1 delims=." %%i in ('node -v') do set NODE_VER=%%i
set NODE_VER=%NODE_VER:v=%

if %NODE_VER% lss 18 (
    echo   [!!] Node.js 18+ required (found v%NODE_VER%)
    echo   Update from https://nodejs.org
    exit /b 1
)
echo   [ok] Node.js v%NODE_VER%

REM ── Install via npm ───────────────────────────────────────────────

echo   Installing JerikoBot via npm...
call npm install -g jerikobot
if %errorlevel% neq 0 (
    echo   [!!] npm install failed
    exit /b 1
)
echo   [ok] JerikoBot installed globally

REM ── Verify ────────────────────────────────────────────────────────

where jeriko >nul 2>nul
if %errorlevel% neq 0 (
    echo   [--] jeriko not in PATH - restart your terminal
    exit /b 0
)
echo   [ok] jeriko is available

REM ── Onboarding ────────────────────────────────────────────────────

echo.
echo   Launching setup wizard...
echo.
call jeriko init
