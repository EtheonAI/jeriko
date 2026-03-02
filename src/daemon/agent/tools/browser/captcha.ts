// CAPTCHA detection module for browser automation.
//
// Evaluates the CAPTCHA_DETECTION_JS script in the page context and returns
// a structured result. Used both as a standalone action (detect_captcha)
// and as part of the page snapshot (auto-detection on every navigate/view).
//
// Supported services (17):
//   cloudflare_challenge, cloudflare_block, cloudflare_turnstile,
//   recaptcha_v2, recaptcha_v3, hcaptcha, funcaptcha, aws_waf,
//   geetest, datadome, sucuri, perimeterx, imperva, kasada,
//   access_block, reddit_block, device_verification

import { CAPTCHA_DETECTION_JS } from "./scripts.js";

type Page = import("playwright-core").Page;

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface CaptchaResult {
  detected: boolean;
  type: string;
  confidence: number;
  indicators: string[];
  url: string;
  timestamp: string;
}

const EMPTY_RESULT: CaptchaResult = {
  detected: false,
  type: "none",
  confidence: 0,
  indicators: [],
  url: "",
  timestamp: "",
};

// ---------------------------------------------------------------------------
// Detection
// ---------------------------------------------------------------------------

/**
 * Runs CAPTCHA detection in the page context.
 * Returns a structured result — gracefully returns `{ detected: false }`
 * if evaluation fails (e.g. page crashed, navigating, cross-origin).
 */
export async function detectCaptcha(p: Page): Promise<CaptchaResult> {
  try {
    const raw = await p.evaluate(CAPTCHA_DETECTION_JS);
    if (!raw || typeof raw !== "object") return { ...EMPTY_RESULT };
    return raw as CaptchaResult;
  } catch {
    return { ...EMPTY_RESULT };
  }
}
