import { describe, expect, it } from "bun:test";
import {
  COLLECT_ELEMENTS_JS,
  FIND_ELEMENT_JS,
  EXTRACT_MARKDOWN_JS,
  NESTED_SCROLL_JS,
  SELECT_OPTION_JS,
  SCROLL_STATUS_JS,
  CAPTCHA_DETECTION_JS,
} from "../../src/daemon/agent/tools/browser/scripts.js";
import { applyStealthScripts } from "../../src/daemon/agent/tools/browser/stealth.js";
import { detectCaptcha, type CaptchaResult } from "../../src/daemon/agent/tools/browser/captcha.js";

// ---------------------------------------------------------------------------
// Helper — validates that a string is parseable JavaScript
// ---------------------------------------------------------------------------

function isValidJS(script: string): boolean {
  try {
    new Function(script);
    return true;
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// Script exports — existence and validity
// ---------------------------------------------------------------------------

describe("browser scripts", () => {
  const scripts = {
    COLLECT_ELEMENTS_JS,
    FIND_ELEMENT_JS,
    EXTRACT_MARKDOWN_JS,
    NESTED_SCROLL_JS,
    SELECT_OPTION_JS,
    SCROLL_STATUS_JS,
    CAPTCHA_DETECTION_JS,
  } as const;

  describe("all exports are non-empty strings", () => {
    for (const [name, script] of Object.entries(scripts)) {
      it(`${name} is a non-empty string`, () => {
        expect(typeof script).toBe("string");
        expect(script.length).toBeGreaterThan(0);
      });
    }
  });

  describe("all exports are valid JavaScript", () => {
    for (const [name, script] of Object.entries(scripts)) {
      it(`${name} parses without errors`, () => {
        expect(isValidJS(script)).toBe(true);
      });
    }
  });

  // -------------------------------------------------------------------------
  // Script-specific content validation
  // -------------------------------------------------------------------------

  describe("COLLECT_ELEMENTS_JS", () => {
    it("starts as a function expression", () => {
      expect(COLLECT_ELEMENTS_JS.trimStart().startsWith("(args)")).toBe(true);
    });

    it("uses data-jeriko-id attribute", () => {
      expect(COLLECT_ELEMENTS_JS).toContain("data-jeriko-id");
    });

    it("creates a TreeWalker for traversal", () => {
      expect(COLLECT_ELEMENTS_JS).toContain("createTreeWalker");
    });

    it("traverses shadow roots", () => {
      expect(COLLECT_ELEMENTS_JS).toContain("shadowRoot");
    });
  });

  describe("FIND_ELEMENT_JS", () => {
    it("starts as a function expression", () => {
      expect(FIND_ELEMENT_JS.trimStart().startsWith("(index)")).toBe(true);
    });

    it("searches iframes recursively", () => {
      expect(FIND_ELEMENT_JS).toContain("querySelectorAll");
      expect(FIND_ELEMENT_JS).toContain("iframe");
      expect(FIND_ELEMENT_JS).toContain("frame");
    });

    it("uses visited set to prevent infinite loops", () => {
      expect(FIND_ELEMENT_JS).toContain("visited");
      expect(FIND_ELEMENT_JS).toContain("WeakSet");
    });

    it("handles cross-origin frames gracefully", () => {
      expect(FIND_ELEMENT_JS).toContain("catch");
      expect(FIND_ELEMENT_JS).toContain("Cross-origin");
    });

    it("translates iframe coordinates to parent viewport", () => {
      expect(FIND_ELEMENT_JS).toContain("frameRect");
      expect(FIND_ELEMENT_JS).toContain("getBoundingClientRect");
    });

    it("searches shadow roots", () => {
      expect(FIND_ELEMENT_JS).toContain("shadowRoot");
    });

    it("returns center coordinates", () => {
      expect(FIND_ELEMENT_JS).toContain("r.width / 2");
      expect(FIND_ELEMENT_JS).toContain("r.height / 2");
    });
  });

  describe("EXTRACT_MARKDOWN_JS", () => {
    it("is an IIFE", () => {
      expect(EXTRACT_MARKDOWN_JS.trimStart().startsWith("(()")).toBe(true);
    });

    it("converts headings to markdown", () => {
      expect(EXTRACT_MARKDOWN_JS).toContain("# ");
      expect(EXTRACT_MARKDOWN_JS).toContain("## ");
    });

    it("truncates long output", () => {
      expect(EXTRACT_MARKDOWN_JS).toContain("15000");
      expect(EXTRACT_MARKDOWN_JS).toContain("truncated");
    });
  });

  describe("NESTED_SCROLL_JS", () => {
    it("is an async function", () => {
      expect(NESTED_SCROLL_JS).toContain("async");
    });

    it("supports target point for container detection", () => {
      expect(NESTED_SCROLL_JS).toContain("targetPoint");
      expect(NESTED_SCROLL_JS).toContain("elementsFromPoint");
    });

    it("supports all four scroll directions", () => {
      expect(NESTED_SCROLL_JS).toContain("'up'");
      expect(NESTED_SCROLL_JS).toContain("'down'");
      expect(NESTED_SCROLL_JS).toContain("'left'");
      expect(NESTED_SCROLL_JS).toContain("'right'");
    });

    it("supports scroll-to-edge", () => {
      expect(NESTED_SCROLL_JS).toContain("toEdge");
    });

    it("detects scrollable containers", () => {
      expect(NESTED_SCROLL_JS).toContain("isScrollable");
      expect(NESTED_SCROLL_JS).toContain("overflowY");
    });

    it("reports boundary status", () => {
      expect(NESTED_SCROLL_JS).toContain("atBoundary");
    });

    it("finds largest scrollable container as fallback", () => {
      expect(NESTED_SCROLL_JS).toContain("findLargestScrollable");
    });
  });

  describe("SELECT_OPTION_JS", () => {
    it("dispatches change event for framework compatibility", () => {
      expect(SELECT_OPTION_JS).toContain("change");
      expect(SELECT_OPTION_JS).toContain("dispatchEvent");
    });

    it("dispatches input event", () => {
      expect(SELECT_OPTION_JS).toContain("input");
      expect(SELECT_OPTION_JS).toContain("bubbles");
    });

    it("validates element is a select", () => {
      expect(SELECT_OPTION_JS).toContain("select");
      expect(SELECT_OPTION_JS).toContain("tagName");
    });

    it("returns available options on failure", () => {
      expect(SELECT_OPTION_JS).toContain("availableOptions");
    });

    it("validates option index bounds", () => {
      expect(SELECT_OPTION_JS).toContain("out of range");
    });
  });

  describe("SCROLL_STATUS_JS", () => {
    it("is an IIFE", () => {
      expect(SCROLL_STATUS_JS.trimStart().startsWith("(()")).toBe(true);
    });

    it("reports scroll capacity in both axes", () => {
      expect(SCROLL_STATUS_JS).toContain("canScrollX");
      expect(SCROLL_STATUS_JS).toContain("canScrollY");
    });

    it("uses scrollingElement", () => {
      expect(SCROLL_STATUS_JS).toContain("scrollingElement");
    });

    it("reports dimensions", () => {
      expect(SCROLL_STATUS_JS).toContain("scrollHeight");
      expect(SCROLL_STATUS_JS).toContain("scrollWidth");
      expect(SCROLL_STATUS_JS).toContain("clientHeight");
      expect(SCROLL_STATUS_JS).toContain("clientWidth");
    });
  });

  describe("CAPTCHA_DETECTION_JS", () => {
    it("is an IIFE", () => {
      expect(CAPTCHA_DETECTION_JS.trimStart().startsWith("(()")).toBe(true);
    });

    const expectedServices = [
      "cloudflare",
      "recaptcha",
      "hcaptcha",
      "funcaptcha",
      "aws_waf",
      "geetest",
      "datadome",
      "sucuri",
      "perimeterx",
      "imperva",
      "kasada",
      "reddit",
      "device_verification",
      "access_block",
    ];

    for (const service of expectedServices) {
      it(`detects ${service}`, () => {
        expect(CAPTCHA_DETECTION_JS.toLowerCase()).toContain(service);
      });
    }

    it("returns structured result with all required fields", () => {
      expect(CAPTCHA_DETECTION_JS).toContain("detected");
      expect(CAPTCHA_DETECTION_JS).toContain("type");
      expect(CAPTCHA_DETECTION_JS).toContain("confidence");
      expect(CAPTCHA_DETECTION_JS).toContain("indicators");
      expect(CAPTCHA_DETECTION_JS).toContain("timestamp");
    });

    it("includes Cloudflare challenge title detection", () => {
      expect(CAPTCHA_DETECTION_JS).toContain("just a moment");
    });

    it("includes Cloudflare Turnstile detection", () => {
      expect(CAPTCHA_DETECTION_JS).toContain("turnstile");
      expect(CAPTCHA_DETECTION_JS).toContain("challenges.cloudflare.com");
    });
  });
});

// ---------------------------------------------------------------------------
// Module exports
// ---------------------------------------------------------------------------

describe("browser stealth module", () => {
  it("exports applyStealthScripts as a function", () => {
    expect(typeof applyStealthScripts).toBe("function");
  });
});

describe("browser captcha module", () => {
  it("exports detectCaptcha as a function", () => {
    expect(typeof detectCaptcha).toBe("function");
  });

  it("gracefully handles page.evaluate throwing", async () => {
    // Mock a page object whose evaluate always throws
    const mockPage = {
      evaluate: () => {
        throw new Error("page crashed");
      },
    } as unknown as import("playwright-core").Page;

    const result: CaptchaResult = await detectCaptcha(mockPage);
    expect(result.detected).toBe(false);
    expect(result.type).toBe("none");
    expect(result.confidence).toBe(0);
    expect(Array.isArray(result.indicators)).toBe(true);
    expect(result.indicators.length).toBe(0);
  });

  it("gracefully handles page.evaluate returning null", async () => {
    const mockPage = {
      evaluate: () => null,
    } as unknown as import("playwright-core").Page;

    const result: CaptchaResult = await detectCaptcha(mockPage);
    expect(result.detected).toBe(false);
  });

  it("gracefully handles page.evaluate returning non-object", async () => {
    const mockPage = {
      evaluate: () => "not an object",
    } as unknown as import("playwright-core").Page;

    const result: CaptchaResult = await detectCaptcha(mockPage);
    expect(result.detected).toBe(false);
  });
});
