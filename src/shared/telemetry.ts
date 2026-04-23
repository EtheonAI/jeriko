/**
 * Lightweight telemetry via PostHog HTTP API.
 *
 * - Fire-and-forget: never blocks, never throws, never logs errors.
 * - Opt-out: set DO_NOT_TRACK=1 or JERIKO_TELEMETRY=0.
 * - No PII: uses anonymous JERIKO_USER_ID only.
 */

import { getUserId } from "./config.js";
import { VERSION, BUILD_REF } from "./version.js";

// Build-time injection (same pattern as baked-oauth-ids.ts)
declare const __BAKED_POSTHOG_KEY__: string | undefined;

const POSTHOG_KEY: string | undefined =
  typeof __BAKED_POSTHOG_KEY__ !== "undefined"
    ? __BAKED_POSTHOG_KEY__
    : process.env.POSTHOG_API_KEY;

const POSTHOG_HOST = "https://us.i.posthog.com";

/** Cached opt-out check. */
let _enabled: boolean | null = null;

export function isEnabled(): boolean {
  if (_enabled !== null) return _enabled;
  _enabled =
    !!POSTHOG_KEY &&
    process.env.DO_NOT_TRACK !== "1" &&
    process.env.JERIKO_TELEMETRY !== "0" &&
    process.env.CI !== "true";
  return _enabled;
}

/**
 * Fire-and-forget event capture. Never awaited, never throws.
 */
export function capture(
  event: string,
  properties?: Record<string, string | number | boolean | undefined>,
): void {
  if (!isEnabled()) return;

  const distinctId = getUserId() ?? "anonymous";

  const clean: Record<string, string | number | boolean> = {};
  if (properties) {
    for (const [k, v] of Object.entries(properties)) {
      if (v !== undefined) clean[k] = v;
    }
  }

  const body = JSON.stringify({
    api_key: POSTHOG_KEY,
    event,
    distinct_id: distinctId,
    properties: {
      ...clean,
      $lib: "jeriko",
      $lib_version: VERSION,
      $lib_build_ref: BUILD_REF,
      $os: process.platform,
      $os_version: process.arch,
    },
    timestamp: new Date().toISOString(),
  });

  fetch(`${POSTHOG_HOST}/capture/`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body,
    signal: AbortSignal.timeout(5000),
  }).catch(() => {});
}
