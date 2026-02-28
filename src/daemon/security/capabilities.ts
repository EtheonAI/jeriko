// Layer 0 — Per-agent capability system.

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Capability = "read" | "write" | "exec" | "net" | "admin" | "connector" | "channel";

export interface AgentCapabilities {
  agent: string;
  capabilities: Set<Capability>;
  paths?: string[];
  connectors?: string[];
  max_timeout?: number;
}

// ---------------------------------------------------------------------------
// Defaults
// ---------------------------------------------------------------------------

/** Minimal capability set granted to every new agent. */
export const DEFAULT_CAPABILITIES: ReadonlySet<Capability> = new Set<Capability>(["read", "exec"]);

/** Default maximum timeout for agent operations (ms). */
const DEFAULT_MAX_TIMEOUT = 30_000;

// ---------------------------------------------------------------------------
// Internal store
// ---------------------------------------------------------------------------

const store = new Map<string, AgentCapabilities>();

/**
 * Get or create the capabilities record for an agent.
 * New agents start with a copy of DEFAULT_CAPABILITIES.
 */
function getOrCreate(agent: string): AgentCapabilities {
  let entry = store.get(agent);
  if (!entry) {
    entry = {
      agent,
      capabilities: new Set<Capability>(DEFAULT_CAPABILITIES),
      max_timeout: DEFAULT_MAX_TIMEOUT,
    };
    store.set(agent, entry);
  }
  return entry;
}

// ---------------------------------------------------------------------------
// Public API
// ---------------------------------------------------------------------------

/**
 * Grant a capability to an agent. Creates the agent record if it doesn't exist.
 */
export function grantCapability(agent: string, cap: Capability): void {
  const entry = getOrCreate(agent);
  entry.capabilities.add(cap);
}

/**
 * Revoke a capability from an agent.
 * If the agent doesn't exist, this is a no-op.
 */
export function revokeCapability(agent: string, cap: Capability): void {
  const entry = store.get(agent);
  if (entry) {
    entry.capabilities.delete(cap);
  }
}

/**
 * Check whether an agent has a specific capability.
 * Unknown agents are evaluated against DEFAULT_CAPABILITIES.
 */
export function hasCapability(agent: string, cap: Capability): boolean {
  const entry = store.get(agent);
  if (!entry) {
    return DEFAULT_CAPABILITIES.has(cap);
  }
  return entry.capabilities.has(cap);
}

/**
 * Get the full capabilities record for an agent.
 * Returns a copy with defaults if the agent is not registered.
 */
export function getCapabilities(agent: string): AgentCapabilities {
  return getOrCreate(agent);
}

/**
 * Remove an agent's capabilities record entirely.
 * The agent will revert to DEFAULT_CAPABILITIES on next access.
 */
export function resetCapabilities(agent: string): void {
  store.delete(agent);
}

/**
 * List all agents with explicit capability records.
 */
export function listAgents(): string[] {
  return Array.from(store.keys());
}
