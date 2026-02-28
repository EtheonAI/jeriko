// Layer 0 — System prompt loader. Reads AGENT.md for the AI agent's identity.
//
// Resolution order:
//   1. ~/.config/jeriko/agent.md   (deployed prompt, copied during init)
//   2. AGENT.md in project root    (development fallback)

import { readFileSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { getConfigDir } from "./config.js";

/**
 * Load the Jeriko system prompt from the deployed agent.md file.
 *
 * This is the prompt that gives the AI its Jeriko identity, command knowledge,
 * and behavioral rules. Without it, the agent is a generic LLM with tools but
 * no knowledge of jeriko commands.
 *
 * Returns empty string if no prompt file is found.
 */
export function loadSystemPrompt(): string {
  // 1. Deployed prompt — standard install location
  const configPrompt = join(getConfigDir(), "agent.md");
  if (existsSync(configPrompt)) {
    return readFileSync(configPrompt, "utf-8");
  }

  // 2. Development fallback — walk up from CWD looking for AGENT.md
  let dir = process.cwd();
  for (let i = 0; i < 5; i++) {
    const candidate = join(dir, "AGENT.md");
    if (existsSync(candidate)) {
      return readFileSync(candidate, "utf-8");
    }
    const parent = dirname(dir);
    if (parent === dir) break;
    dir = parent;
  }

  return "";
}
