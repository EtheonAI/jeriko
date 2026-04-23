/**
 * Permission Subsystem — zod schema for the persistent config file.
 *
 * Disk shape (pretty-printed):
 *
 *   {
 *     "rules": [
 *       { "kind": "bash",       "target": "git ",           "decision": "allow" },
 *       { "kind": "web-fetch",  "target": "https://api.stripe.com", "decision": "allow" },
 *       { "kind": "file-write", "target": "/tmp/",          "decision": "allow" }
 *     ]
 *   }
 *
 * Every persistent rule implicitly has `origin: "persistent"`. The loader
 * fills that field in after parse — users don't write `"origin"` into the
 * file themselves, so the schema doesn't demand it.
 */

import { z } from "zod";
import { PERMISSION_KINDS } from "./types.js";

const kindSchema = z.enum(PERMISSION_KINDS);
const decisionSchema = z.enum(["allow", "deny"]);

const targetSchema = z.string().trim().max(4096, {
  message: "rule target must be at most 4096 characters",
});

export const persistedRuleSchema = z.object({
  kind:     kindSchema,
  target:   targetSchema,
  decision: decisionSchema,
}).strict();

export const permissionConfigSchema = z.object({
  rules: z.array(persistedRuleSchema).default([]),
}).strict();

export type PersistedRule = z.infer<typeof persistedRuleSchema>;
export type PermissionConfig = z.infer<typeof permissionConfigSchema>;
