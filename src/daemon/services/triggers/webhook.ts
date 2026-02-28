// Webhook trigger — signature verification for external webhooks.

import { createHmac, timingSafeEqual } from "node:crypto";
import { getLogger } from "../../../shared/logger.js";
import type { WebhookConfig } from "./engine.js";

const log = getLogger();

export class WebhookTrigger {
  private secret: string | undefined;
  private service: WebhookConfig["service"];

  constructor(config: WebhookConfig) {
    this.secret = config.secret;
    this.service = config.service ?? "generic";
  }

  /**
   * Verify the webhook signature from the incoming request headers.
   * Returns true if the signature is valid (or if no secret is configured).
   */
  verify(payload: unknown, headers: Record<string, string>): boolean {
    if (!this.secret) return true;

    const body = typeof payload === "string" ? payload : JSON.stringify(payload);

    switch (this.service) {
      case "stripe":
        return this.verifyStripe(body, headers);
      case "github":
        return this.verifyGitHub(body, headers);
      case "paypal":
        return this.verifyPayPal(body, headers);
      case "twilio":
        return this.verifyTwilio(body, headers);
      default:
        return this.verifyGeneric(body, headers);
    }
  }

  // -----------------------------------------------------------------------
  // Service-specific verifiers
  // -----------------------------------------------------------------------

  /**
   * Stripe uses `Stripe-Signature` header with format:
   * t=<timestamp>,v1=<hmac_sha256>
   */
  private verifyStripe(body: string, headers: Record<string, string>): boolean {
    const sig = headers["stripe-signature"];
    if (!sig) {
      log.warn("Stripe webhook: missing Stripe-Signature header");
      return false;
    }

    const parts = new Map(
      sig.split(",").map((part) => {
        const [k, v] = part.split("=", 2);
        return [k!, v!] as [string, string];
      }),
    );

    const timestamp = parts.get("t");
    const v1 = parts.get("v1");
    if (!timestamp || !v1) {
      log.warn("Stripe webhook: malformed Stripe-Signature header");
      return false;
    }

    // Verify timestamp is within 5 minutes
    const now = Math.floor(Date.now() / 1000);
    if (Math.abs(now - Number(timestamp)) > 300) {
      log.warn("Stripe webhook: timestamp too old");
      return false;
    }

    const signedPayload = `${timestamp}.${body}`;
    const expected = createHmac("sha256", this.secret!)
      .update(signedPayload)
      .digest("hex");

    return this.timingSafeCompare(v1, expected);
  }

  /**
   * GitHub uses `X-Hub-Signature-256` header with format:
   * sha256=<hmac_sha256>
   */
  private verifyGitHub(body: string, headers: Record<string, string>): boolean {
    const sig = headers["x-hub-signature-256"];
    if (!sig) {
      log.warn("GitHub webhook: missing X-Hub-Signature-256 header");
      return false;
    }

    const expected = "sha256=" + createHmac("sha256", this.secret!)
      .update(body)
      .digest("hex");

    return this.timingSafeCompare(sig, expected);
  }

  /**
   * PayPal uses `PAYPAL-TRANSMISSION-SIG` header.
   * Simplified verification — full verification requires PayPal cert download.
   */
  private verifyPayPal(body: string, headers: Record<string, string>): boolean {
    const transmissionId = headers["paypal-transmission-id"];
    const transmissionTime = headers["paypal-transmission-time"];
    const transmissionSig = headers["paypal-transmission-sig"];

    if (!transmissionId || !transmissionTime || !transmissionSig) {
      log.warn("PayPal webhook: missing required headers");
      return false;
    }

    // Simplified: HMAC of transmission-id|transmission-time|webhook-id|crc32(body)
    // Full PayPal verification would download the cert and verify RSA signature.
    // For now, we verify the presence of required headers.
    const expected = createHmac("sha256", this.secret!)
      .update(`${transmissionId}|${transmissionTime}|${body}`)
      .digest("hex");

    return this.timingSafeCompare(transmissionSig, expected);
  }

  /**
   * Twilio uses `X-Twilio-Signature` header.
   * Simplified — full verification requires building the URL + sorted params.
   */
  private verifyTwilio(body: string, headers: Record<string, string>): boolean {
    const sig = headers["x-twilio-signature"];
    if (!sig) {
      log.warn("Twilio webhook: missing X-Twilio-Signature header");
      return false;
    }

    // Twilio signature = Base64(HMAC-SHA1(authToken, url + sorted params))
    // Simplified: we use the body as the signing input
    const expected = createHmac("sha1", this.secret!)
      .update(body)
      .digest("base64");

    return this.timingSafeCompare(sig, expected);
  }

  /**
   * Generic: expects `X-Signature` header with hex-encoded HMAC-SHA256.
   */
  private verifyGeneric(body: string, headers: Record<string, string>): boolean {
    const sig = headers["x-signature"] ?? headers["x-webhook-signature"];
    if (!sig) {
      log.warn("Generic webhook: missing X-Signature header");
      return false;
    }

    const expected = createHmac("sha256", this.secret!)
      .update(body)
      .digest("hex");

    return this.timingSafeCompare(sig, expected);
  }

  // -----------------------------------------------------------------------
  // Helpers
  // -----------------------------------------------------------------------

  /**
   * Timing-safe string comparison. Returns false if lengths differ.
   */
  private timingSafeCompare(a: string, b: string): boolean {
    const bufA = Buffer.from(a, "utf-8");
    const bufB = Buffer.from(b, "utf-8");

    if (bufA.length !== bufB.length) return false;

    return timingSafeEqual(bufA, bufB);
  }
}
