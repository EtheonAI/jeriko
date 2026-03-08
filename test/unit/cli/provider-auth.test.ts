/**
 * Provider auth — tests for auth choice filtering by daemon availability.
 */

import { describe, test, expect } from "bun:test";
import {
  getProviderAuth,
  getAvailableAuthChoices,
  hasOAuth,
  getOAuthConfig,
} from "../../../src/cli/lib/provider-auth.js";

describe("getAvailableAuthChoices", () => {
  test("returns all choices when daemon is available", () => {
    const choices = getAvailableAuthChoices("openrouter", true);
    expect(choices).toBeDefined();
    expect(choices!.length).toBe(2);
    expect(choices!.some((c) => c.method === "oauth-pkce")).toBe(true);
    expect(choices!.some((c) => c.method === "api-key")).toBe(true);
  });

  test("filters out relay-dependent OAuth when daemon is unavailable", () => {
    // OpenRouter uses relay (useRelay: true) — OAuth should be filtered
    const choices = getAvailableAuthChoices("openrouter", false);
    // Only API key should remain, or undefined if no choices left
    if (choices) {
      expect(choices.every((c) => c.method !== "oauth-pkce")).toBe(true);
      expect(choices.length).toBeGreaterThan(0);
    }
  });

  test("returns undefined for providers not in auth registry", () => {
    const choices = getAvailableAuthChoices("anthropic", true);
    expect(choices).toBeUndefined();
  });

  test("returns undefined for unknown providers", () => {
    const choices = getAvailableAuthChoices("nonexistent-provider", true);
    expect(choices).toBeUndefined();
  });

  test("returns all choices for providers without relay OAuth", () => {
    // Google has no OAuth (only API key), so all choices survive filtering
    const choices = getAvailableAuthChoices("google", false);
    expect(choices).toBeDefined();
    expect(choices!.length).toBe(1);
    expect(choices![0]!.method).toBe("api-key");
  });
});

describe("getProviderAuth", () => {
  test("returns auth def for known providers", () => {
    expect(getProviderAuth("openrouter")).toBeDefined();
    expect(getProviderAuth("google")).toBeDefined();
  });

  test("returns undefined for built-in providers", () => {
    expect(getProviderAuth("anthropic")).toBeUndefined();
    expect(getProviderAuth("openai")).toBeUndefined();
  });
});

describe("hasOAuth", () => {
  test("returns true for providers with OAuth", () => {
    expect(hasOAuth("openrouter")).toBe(true);
  });

  test("returns false for providers without OAuth", () => {
    expect(hasOAuth("google")).toBe(false);
    expect(hasOAuth("anthropic")).toBe(false);
  });
});

describe("getOAuthConfig", () => {
  test("returns config for OAuth providers", () => {
    const config = getOAuthConfig("openrouter");
    expect(config).toBeDefined();
    expect(config!.authUrl).toContain("openrouter");
    expect(config!.useRelay).toBe(true);
  });

  test("returns undefined for non-OAuth providers", () => {
    expect(getOAuthConfig("google")).toBeUndefined();
    expect(getOAuthConfig("anthropic")).toBeUndefined();
  });
});
