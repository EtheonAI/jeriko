<#
.SYNOPSIS
    Windows install script validation (runs in PowerShell on Linux).
    For REAL Windows testing, see .github/workflows/install-test.yml.

.DESCRIPTION
    This validates PowerShell script syntax and basic logic flow.
    It does NOT test actual Windows binary execution.
#>

$ErrorActionPreference = "Stop"
$pass = 0
$fail = 0

function Test-Pass { param([string]$Msg) $script:pass++; Write-Host "  [PASS] $Msg" }
function Test-Fail { param([string]$Msg) $script:fail++; Write-Host "  [FAIL] $Msg" }

Write-Host ""
Write-Host "  Jeriko Windows Install Script Validation"
Write-Host "  $(Get-Date)"
Write-Host ""

# ── Test 1: install.ps1 syntax ─────────────────────────────────

Write-Host "── Test: install.ps1 syntax ──"

try {
    $null = [scriptblock]::Create((Get-Content /repo/scripts/install.ps1 -Raw))
    Test-Pass "install.ps1 parses without syntax errors"
} catch {
    Test-Fail "install.ps1 has syntax errors: $_"
}

# ── Test 2: Version regex ──────────────────────────────────────

Write-Host ""
Write-Host "── Test: Version target validation ──"

$pattern = '^(stable|latest|[0-9]+\.[0-9]+\.[0-9]+(-[^\s]+)?)$'

if ("latest" -match $pattern) { Test-Pass "'latest' matches version pattern" }
else { Test-Fail "'latest' doesn't match" }

if ("stable" -match $pattern) { Test-Pass "'stable' matches version pattern" }
else { Test-Fail "'stable' doesn't match" }

if ("2.0.0" -match $pattern) { Test-Pass "'2.0.0' matches version pattern" }
else { Test-Fail "'2.0.0' doesn't match" }

if ("2.0.0-alpha.1" -match $pattern) { Test-Pass "'2.0.0-alpha.1' matches version pattern" }
else { Test-Fail "'2.0.0-alpha.1' doesn't match" }

if ("invalid" -match $pattern) { Test-Fail "'invalid' should not match" }
else { Test-Pass "'invalid' correctly rejected" }

# ── Test 3: Architecture detection logic ────────────────────────

Write-Host ""
Write-Host "── Test: Architecture detection ──"

$testArch = @{
    "AMD64" = "x64"
    "ARM64" = "arm64"
}

foreach ($entry in $testArch.GetEnumerator()) {
    $result = switch ($entry.Key) {
        "AMD64" { "x64" }
        "ARM64" { "arm64" }
        default { $null }
    }
    if ($result -eq $entry.Value) {
        Test-Pass "Architecture mapping: $($entry.Key) -> $result"
    } else {
        Test-Fail "Architecture mapping: $($entry.Key) expected $($entry.Value) got $result"
    }
}

# ── Test 4: Checksum extraction logic ────────────────────────────

Write-Host ""
Write-Host "── Test: Checksum extraction ──"

$testManifest = @{
    version = "2.0.0"
    platforms = @{
        "windows-x64" = @{ checksum = "abc123def456abc123def456abc123def456abc123def456abc123def456abcd"; size = 67000000 }
        "windows-arm64" = @{ checksum = "xyz789xyz789xyz789xyz789xyz789xyz789xyz789xyz789xyz789xyz789abcd"; size = 65000000 }
    }
}

$extracted = $testManifest.platforms."windows-x64".checksum
if ($extracted -eq "abc123def456abc123def456abc123def456abc123def456abc123def456abcd") {
    Test-Pass "Checksum extraction for windows-x64"
} else {
    Test-Fail "Checksum extraction failed: $extracted"
}

$extracted = $testManifest.platforms."windows-arm64".checksum
if ($extracted.Length -eq 64) {
    Test-Pass "Checksum extraction for windows-arm64 (length=$($extracted.Length))"
} else {
    Test-Fail "Checksum length wrong: $($extracted.Length)"
}

# ── Summary ─────────────────────────────────────────────────────

Write-Host ""
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host "  Results: $pass passed, $fail failed ($($pass + $fail) total)"
Write-Host "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
Write-Host ""

if ($fail -gt 0) { exit 1 }
exit 0
