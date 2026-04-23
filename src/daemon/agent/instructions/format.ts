// Format discovered instruction files into a single block ready to inject
// into the system prompt.
//
// The block opens with a distinctive marker so the model can tell project
// context apart from Jeriko's core prompt. Truncation honours a token
// budget so a single huge CLAUDE.md can't crowd out the tool schemas.

import { estimateTokens } from "../../../shared/tokens.js";
import type { DiscoveredInstructions, InstructionsBlock } from "./types.js";

export interface FormatOptions {
  /** Maximum tokens the combined block may occupy. Default: 3000 tokens. */
  maxTokens?: number;
}

const DEFAULT_MAX_TOKENS = 3000;

const HEADER = "=== PROJECT INSTRUCTIONS (discovered in project tree) ===";
const FOOTER = "=== END PROJECT INSTRUCTIONS ===";

/**
 * Render the discovered files into one block.
 *
 * Nearest files (lower depth) get priority: if the budget is exhausted, we
 * keep the files closer to CWD and drop the ancestors.
 */
export function formatInstructions(
  discovered: readonly DiscoveredInstructions[],
  opts: FormatOptions = {},
): InstructionsBlock {
  if (discovered.length === 0) {
    return { text: "", sources: [], truncated: false };
  }

  const budget = opts.maxTokens ?? DEFAULT_MAX_TOKENS;
  const kept: DiscoveredInstructions[] = [];
  const sources: string[] = [];
  let tokensUsed = estimateTokens(`${HEADER}\n${FOOTER}`);
  let truncated = false;

  // Nearest-first ordering is already handled by the caller; we just honour it.
  for (const item of discovered) {
    const entryText = renderEntry(item);
    const entryTokens = estimateTokens(entryText);
    if (tokensUsed + entryTokens > budget) {
      truncated = true;
      break;
    }
    kept.push(item);
    sources.push(item.path);
    tokensUsed += entryTokens;
  }

  const body = kept.map(renderEntry).join("\n\n");
  const text = `${HEADER}\n${body}\n${FOOTER}`;
  return { text, sources, truncated };
}

function renderEntry(item: DiscoveredInstructions): string {
  return `--- ${item.kind} (${item.path}) ---\n${item.content}`;
}
