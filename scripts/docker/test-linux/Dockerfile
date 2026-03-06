FROM ubuntu:22.04

# Minimal dependencies for testing the binary installer
RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      bash curl ca-certificates python3 && \
    rm -rf /var/lib/apt/lists/*

# Create a test user (install scripts shouldn't need root)
RUN useradd -m -s /bin/bash testuser
USER testuser
WORKDIR /home/testuser

COPY --chown=testuser:testuser run.sh /test/run.sh
RUN chmod +x /test/run.sh

ENTRYPOINT ["/test/run.sh"]
