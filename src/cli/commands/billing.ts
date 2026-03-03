// CLI commands: jeriko plan, jeriko upgrade, jeriko billing
//
// Three entry points into the billing subsystem:
//   - `jeriko plan`    — show current tier, limits, and usage
//   - `jeriko upgrade` — collect email, open Stripe Checkout in browser
//   - `jeriko billing` — open Stripe Customer Portal in browser
//
// All commands use IPC to the daemon when running, or fall back to
// direct database access when the daemon is not available.

import type { CommandHandler } from "../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../shared/args.js";
import { ok, fail } from "../../shared/output.js";
import { existsSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";
import { loadSecrets } from "../../shared/secrets.js";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function isDaemonRunning(): boolean {
  return existsSync(join(homedir(), ".jeriko", "daemon.sock"));
}

/**
 * Open a URL in the user's default browser.
 * Uses platform-specific commands (macOS: open, Linux: xdg-open, Windows: start).
 */
async function openInBrowser(url: string): Promise<void> {
  const { platform } = await import("node:os");
  const { exec } = await import("node:child_process");

  const os = platform();
  const cmd = os === "darwin" ? "open"
    : os === "win32" ? "start"
    : "xdg-open";

  exec(`${cmd} ${JSON.stringify(url)}`);
}

// ---------------------------------------------------------------------------
// jeriko plan — Show current plan, limits, and usage
// ---------------------------------------------------------------------------

export const planCommand: CommandHandler = {
  name: "plan",
  description: "Show current billing plan, limits, and usage",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko plan");
      console.log("\nShow your current billing tier, resource limits, and usage counts.");
      console.log("\nFlags:");
      console.log("  --help    Show this help");
      process.exit(0);
    }

    if (isDaemonRunning()) {
      const { sendRequest } = await import("../../daemon/api/socket.js");
      const response = await sendRequest("billing.plan", {});
      if (!response.ok) fail(response.error ?? "Failed to get plan info");
      ok(response.data);
    } else {
      // Direct access — no daemon. Load secrets so billing env vars are available.
      loadSecrets();
      const { getLicenseState } = await import("../../daemon/billing/license.js");
      const state = getLicenseState();
      ok({
        tier: state.tier,
        label: state.label,
        status: state.status,
        email: state.email,
        connectors: {
          used: 0, // Can't count without daemon
          limit: state.connectorLimit,
        },
        triggers: {
          used: 0,
          limit: state.triggerLimit === Infinity ? "unlimited" : state.triggerLimit,
        },
        pastDue: state.pastDue,
        gracePeriod: state.gracePeriod,
        validUntil: state.validUntil,
      });
    }
  },
};

// ---------------------------------------------------------------------------
// jeriko upgrade — Start Stripe Checkout flow
// ---------------------------------------------------------------------------

export const upgradeCommand: CommandHandler = {
  name: "upgrade",
  description: "Upgrade to Pro plan ($19/mo)",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko upgrade --email <email>");
      console.log("\nStart the upgrade flow to Jeriko Pro ($19/mo).");
      console.log("Opens Stripe Checkout in your browser.");
      console.log("\nFlags:");
      console.log("  --email <email>     Your email address (required)");
      console.log("  --terms-accepted    Accept Terms of Service");
      console.log("  --help              Show this help");
      process.exit(0);
    }

    const email = flagStr(parsed, "email", "");
    const termsAccepted = flagBool(parsed, "terms-accepted");

    if (!email) {
      fail("Email is required. Usage: jeriko upgrade --email you@example.com");
      return;
    }

    // Validate email format
    if (!email.includes("@") || !email.includes(".")) {
      fail("Invalid email address format");
      return;
    }

    let url: string;

    if (isDaemonRunning()) {
      const { sendRequest } = await import("../../daemon/api/socket.js");
      const response = await sendRequest("billing.checkout", {
        email,
        terms_accepted: termsAccepted,
      });
      if (!response.ok) fail(response.error ?? "Failed to create checkout session");
      url = (response.data as { url: string }).url;
    } else {
      // Direct access — no daemon. Load secrets so billing env vars are available.
      loadSecrets();
      const { createCheckoutSession } = await import("../../daemon/billing/stripe.js");
      const result = await createCheckoutSession(email, termsAccepted);
      url = result.url;
    }

    await openInBrowser(url);
    ok({ url, message: "Checkout opened in browser" });
  },
};

// ---------------------------------------------------------------------------
// jeriko billing — Open Stripe Customer Portal
// ---------------------------------------------------------------------------

export const billingCommand: CommandHandler = {
  name: "billing",
  description: "Manage your billing and subscription",
  async run(args: string[]) {
    const parsed = parseArgs(args);
    const subcommand = parsed.positional[0];

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko billing [events]");
      console.log("\nManage your billing, subscription, and invoices.");
      console.log("Opens the Stripe Customer Portal in your browser.");
      console.log("\nSubcommands:");
      console.log("  events    List recent billing events (audit trail)");
      console.log("\nFlags:");
      console.log("  --help    Show this help");
      process.exit(0);
    }

    // Subcommand: events
    if (subcommand === "events") {
      await handleEvents(parsed);
      return;
    }

    // Default: open customer portal
    let url: string;

    if (isDaemonRunning()) {
      const { sendRequest } = await import("../../daemon/api/socket.js");
      const response = await sendRequest("billing.portal", {});
      if (!response.ok) fail(response.error ?? "Failed to create portal session");
      url = (response.data as { url: string }).url;
    } else {
      // Direct access — no daemon. Load secrets so billing env vars are available.
      loadSecrets();
      const { getSubscription } = await import("../../daemon/billing/store.js");
      const sub = getSubscription();
      if (!sub?.customer_id) {
        fail("No active subscription found. Use `jeriko upgrade` to subscribe first.");
        return;
      }

      const { createPortalSession } = await import("../../daemon/billing/stripe.js");
      const result = await createPortalSession(sub.customer_id);
      url = result.url;
    }

    await openInBrowser(url);
    ok({ url, message: "Billing portal opened in browser" });
  },
};

// ---------------------------------------------------------------------------
// Events subcommand
// ---------------------------------------------------------------------------

async function handleEvents(parsed: ReturnType<typeof parseArgs>): Promise<void> {
  const limit = Number(flagStr(parsed, "limit", "20")) || 20;
  const type = flagStr(parsed, "type", "");

  if (isDaemonRunning()) {
    const { sendRequest } = await import("../../daemon/api/socket.js");
    const params: Record<string, unknown> = { limit };
    if (type) params.type = type;
    const response = await sendRequest("billing.events", params);
    if (!response.ok) fail(response.error ?? "Failed to get billing events");
    ok(response.data);
  } else {
    loadSecrets();
    const { getRecentEvents, getEventsByType } = await import("../../daemon/billing/store.js");
    const events = type ? getEventsByType(type, limit) : getRecentEvents(limit);
    ok(events.map((e) => ({
      id: e.id,
      type: e.type,
      subscription_id: e.subscription_id,
      processed_at: e.processed_at,
    })));
  }
}
