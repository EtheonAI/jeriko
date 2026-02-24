FROM node:22-bookworm-slim

RUN apt-get update && \
    apt-get install -y bash curl git python3 && \
    rm -rf /var/lib/apt/lists/*

COPY run.sh /test/run.sh
RUN chmod +x /test/run.sh

ENTRYPOINT ["/test/run.sh"]
