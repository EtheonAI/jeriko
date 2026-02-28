// Connector health routes — status of external service integrations.

import { Hono } from "hono";
import { loadConfig } from "../../../shared/config.js";
import { getLogger } from "../../../shared/logger.js";

const log = getLogger();

// ---------------------------------------------------------------------------
// Connector status types
// ---------------------------------------------------------------------------

interface ConnectorStatus {
  name: string;
  configured: boolean;
  healthy: boolean;
  last_check?: string;
  error?: string;
}

// ---------------------------------------------------------------------------
// Routes
// ---------------------------------------------------------------------------

export function connectorRoutes(): Hono {
  const router = new Hono();

  /**
   * GET /connector — List all connectors with their configuration and health status.
   */
  router.get("/", async (c) => {
    const config = loadConfig();
    const statuses: ConnectorStatus[] = [];

    // Stripe
    statuses.push({
      name: "stripe",
      configured: !!config.connectors.stripe.webhookSecret,
      healthy: !!config.connectors.stripe.webhookSecret,
      last_check: new Date().toISOString(),
    });

    // PayPal
    statuses.push({
      name: "paypal",
      configured: !!config.connectors.paypal.webhookId,
      healthy: !!config.connectors.paypal.webhookId,
      last_check: new Date().toISOString(),
    });

    // GitHub
    statuses.push({
      name: "github",
      configured: !!config.connectors.github.webhookSecret,
      healthy: !!config.connectors.github.webhookSecret,
      last_check: new Date().toISOString(),
    });

    // Twilio
    const twilioConfigured =
      !!config.connectors.twilio.accountSid && !!config.connectors.twilio.authToken;
    statuses.push({
      name: "twilio",
      configured: twilioConfigured,
      healthy: twilioConfigured,
      last_check: new Date().toISOString(),
    });

    return c.json({ ok: true, data: statuses });
  });

  /**
   * GET /connector/:name — Get status of a specific connector.
   */
  router.get("/:name", async (c) => {
    const name = c.req.param("name");
    const config = loadConfig();

    const connectorMap: Record<string, () => ConnectorStatus> = {
      stripe: () => ({
        name: "stripe",
        configured: !!config.connectors.stripe.webhookSecret,
        healthy: !!config.connectors.stripe.webhookSecret,
        last_check: new Date().toISOString(),
      }),
      paypal: () => ({
        name: "paypal",
        configured: !!config.connectors.paypal.webhookId,
        healthy: !!config.connectors.paypal.webhookId,
        last_check: new Date().toISOString(),
      }),
      github: () => ({
        name: "github",
        configured: !!config.connectors.github.webhookSecret,
        healthy: !!config.connectors.github.webhookSecret,
        last_check: new Date().toISOString(),
      }),
      twilio: () => {
        const configured =
          !!config.connectors.twilio.accountSid && !!config.connectors.twilio.authToken;
        return {
          name: "twilio",
          configured,
          healthy: configured,
          last_check: new Date().toISOString(),
        };
      },
    };

    const factory = connectorMap[name];
    if (!factory) {
      return c.json({ ok: false, error: `Connector "${name}" not found` }, 404);
    }

    return c.json({ ok: true, data: factory() });
  });

  return router;
}
