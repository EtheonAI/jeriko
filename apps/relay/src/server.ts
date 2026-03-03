// Relay server entry point.
//
// Thin wrapper around createRelayServer() from relay.ts.
// This file starts the server when run directly:
//
//   bun run apps/relay/src/server.ts
//
// For testing, import createRelayServer from relay.ts instead —
// it creates servers on demand without module-level side effects.

import { createRelayServer } from "./relay.js";

const relay = createRelayServer();

console.log(`[relay] Jeriko relay server listening on port ${relay.port}`);
console.log(`[relay] WebSocket endpoint: ${relay.wsUrl}`);
console.log(`[relay] Webhook endpoint: ${relay.url}/hooks/:userId/:triggerId`);

// Graceful shutdown
process.on("SIGINT", () => {
  console.log("[relay] Shutting down...");
  relay.stop();
  process.exit(0);
});

process.on("SIGTERM", () => {
  console.log("[relay] Shutting down...");
  relay.stop();
  process.exit(0);
});

export const { app, server } = relay;
