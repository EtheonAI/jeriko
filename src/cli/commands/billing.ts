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
import { PRO_PRICE_DISPLAY } from "../../daemon/billing/config.js";
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
      const { getConfiguredConnectorCount } = await import("../../shared/connector.js");
      const state = getLicenseState();
      ok({
        tier: state.tier,
        label: state.label,
        status: state.status,
        email: state.email,
        connectors: {
          used: getConfiguredConnectorCount(),
          limit: state.connectorLimit,
        },
        triggers: {
          used: 0, // Trigger count requires daemon (TriggerEngine)
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
  description: `Upgrade to Pro plan (${PRO_PRICE_DISPLAY})`,
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      console.log("Usage: jeriko upgrade --email <email>");
      console.log(`\nStart the upgrade flow to Jeriko Pro (${PRO_PRICE_DISPLAY}).`);
      console.log("Opens Stripe Checkout in your browser where you can review");
      console.log("and accept Terms of Service before completing payment.");
      console.log("\nFlags:");
      console.log("  --email <email>     Your email address (required)");
      console.log("  --help              Show this help");
      process.exit(0);
    }

    const email = flagStr(parsed, "email", "");

    if (!email) {
      fail("Email is required. Usage: jeriko upgrade --email you@example.com");
      return;
    }

    // Validate email format
    if (!email.includes("@") || !email.includes(".")) {
      fail("Invalid email address format");
      return;
    }

    // Capture client metadata for chargeback defense evidence.
    // In CLI context, we use the local machine's network info.
    const { networkInterfaces } = await import("node:os");
    const nets = networkInterfaces();
    const localIp = Object.values(nets).flat()
      .find((n) => n && !n.internal && n.family === "IPv4")?.address ?? "127.0.0.1";
    const clientMeta = {
      clientIp: localIp,
      userAgent: `jeriko-cli/${process.env.npm_package_version ?? "2.0.0"} (${process.platform})`,
    };

    let url: string;

    if (isDaemonRunning()) {
      const { sendRequest } = await import("../../daemon/api/socket.js");
      const response = await sendRequest("billing.checkout", {
        email,
        client_ip: clientMeta.clientIp,
        user_agent: clientMeta.userAgent,
      });
      if (!response.ok) fail(response.error ?? "Failed to create checkout session");
      url = (response.data as { url: string }).url;
    } else {
      // No daemon — try relay proxy first, then fall back to direct Stripe.
      loadSecrets();

      // Strategy 1: Relay proxy (distributed users — no local Stripe keys)
      const { createCheckoutViaRelay } = await import("../../daemon/billing/relay-proxy.js");
      const relayResult = await createCheckoutViaRelay(email, clientMeta);

      if (relayResult) {
        url = relayResult.url;
      } else {
        // Strategy 2: Direct Stripe SDK (self-hosted users with local keys)
        try {
          const { createCheckoutSession } = await import("../../daemon/billing/stripe.js");
          const result = await createCheckoutSession(email, clientMeta);
          url = result.url;
        } catch {
          fail(
            "Unable to create checkout session. "
            + "Start the daemon with `jeriko serve` or check relay auth configuration.",
          );
          return;
        }
      }
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
      // No daemon — try relay proxy first, then fall back to direct Stripe.
      loadSecrets();

      const { getSubscription } = await import("../../daemon/billing/store.js");
      const sub = getSubscription();
      if (!sub?.customer_id) {
        fail("No active subscription found. Use `jeriko upgrade` to subscribe first.");
        return;
      }

      // Strategy 1: Relay proxy (distributed users — no local Stripe keys)
      const { createPortalViaRelay } = await import("../../daemon/billing/relay-proxy.js");
      const relayResult = await createPortalViaRelay(sub.customer_id);

      if (relayResult) {
        url = relayResult.url;
      } else {
        // Strategy 2: Direct Stripe SDK (self-hosted users with local keys)
        try {
          const { createPortalSession } = await import("../../daemon/billing/stripe.js");
          const result = await createPortalSession(sub.customer_id);
          url = result.url;
        } catch {
          fail(
            "Unable to open billing portal. "
            + "Start the daemon with `jeriko serve` or check relay auth configuration.",
          );
          return;
        }
      }
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
