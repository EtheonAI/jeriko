// Relay Worker — Entry point.
//
// Thin pass-through that routes ALL requests to a single global Durable Object.
// The DO manages WebSocket connections, HTTP routing, and all relay state.
//
// Using a single global DO (idFromName("global")) matches the current Bun relay
// architecture where all connections live in one process. 128MB DO memory limit
// supports ~10k+ connections. Can shard by userId later if needed.

import type { Env } from "./lib/types.js";

// Re-export the Durable Object class so wrangler can find it.
// This must be a top-level named export matching the class_name in wrangler.toml.
export { RelayDO } from "./relay-do.js";

export default {
  /**
   * Worker fetch handler — routes all requests to the global DO.
   */
  async fetch(request: Request, env: Env): Promise<Response> {
    const id = env.RELAY_DO.idFromName("global");
    const stub = env.RELAY_DO.get(id);
    return stub.fetch(request);
  },
};
