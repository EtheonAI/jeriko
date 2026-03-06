# Windows install test — PowerShell on Debian for CI validation.
#
# For REAL Windows testing, use GitHub Actions `windows-latest` runner.
# This container validates PowerShell script syntax and basic logic only.
# See .github/workflows/install-test.yml for true Windows E2E tests.

FROM mcr.microsoft.com/powershell:lts-debian-bookworm

RUN apt-get update && \
    apt-get install -y --no-install-recommends curl ca-certificates python3 && \
    rm -rf /var/lib/apt/lists/*

COPY run.ps1 /test/run.ps1

ENTRYPOINT ["pwsh", "-File", "/test/run.ps1"]
