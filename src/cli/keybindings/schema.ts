/**
 * Keybinding Subsystem — Zod schema for the user config file.
 *
 * The on-disk format is intentionally small:
 *
 *   {
 *     "bindings": {
 *       "input.submit": "ctrl+return",
 *       "global.interrupt": "ctrl+q"
 *     }
 *   }
 *
 * Each key is a binding id; each value is a chord spec string. Overrides
 * match by id — users can only re-chord existing bindings, not add new ones
 * (adding bindings requires code because a binding without a handler is
 * inert). The chord value is parsed separately by matcher.ts; this schema
 * only validates that every value is a non-empty string.
 */

import { z } from "zod";

/**
 * Non-empty, whitespace-trimmed chord string. Actual chord validity is
 * enforced when the string is fed to parseChord() — unparseable chords
 * surface as user-facing errors, not schema errors, so users get a useful
 * "invalid chord" message instead of a Zod refinement failure.
 */
const chordStringSchema = z
  .string()
  .trim()
  .min(1, { message: "chord must be a non-empty string" });

/** Binding id: dotted-path, lower-case with digits and hyphens. */
const bindingIdSchema = z
  .string()
  .regex(/^[a-z][a-z0-9._-]*$/, {
    message: "binding id must be lower-case, dotted, and start with a letter",
  });

export const userConfigSchema = z.object({
  bindings: z.record(bindingIdSchema, chordStringSchema).default({}),
}).strict();

export type UserConfig = z.infer<typeof userConfigSchema>;
