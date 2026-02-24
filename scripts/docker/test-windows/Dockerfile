FROM mcr.microsoft.com/powershell:lts-debian-bookworm

# Install Node.js 22 + curl
RUN apt-get update && \
    apt-get install -y curl && \
    curl -fsSL https://deb.nodesource.com/setup_22.x | bash - && \
    apt-get install -y nodejs && \
    rm -rf /var/lib/apt/lists/*

# Copy test script and install script
COPY run.ps1 /test/run.ps1
COPY run-cmd-sim.sh /test/run-cmd-sim.sh
RUN chmod +x /test/run-cmd-sim.sh

ENTRYPOINT ["pwsh", "-File", "/test/run.ps1"]
