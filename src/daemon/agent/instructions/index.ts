// Instructions subsystem — public API.
//
// Callers use `buildInstructionsBlock()` to get a ready-to-inject text
// block plus source paths (for `/status` display). The kernel and backend
// parity layer call this during system-prompt assembly.

import { discoverInstructions, type DiscoverOptions } from "./discovery.js";
import { formatInstructions, type FormatOptions } from "./format.js";
import type { InstructionsBlock } from "./types.js";

export type { DiscoveredInstructions, InstructionsBlock } from "./types.js";

export interface BuildOptions extends DiscoverOptions, FormatOptions {}

/** Discover + format in one call. Returns an empty block when nothing's found. */
export function buildInstructionsBlock(opts: BuildOptions = {}): InstructionsBlock {
  const discovered = discoverInstructions(opts);
  return formatInstructions(discovered, opts);
}
