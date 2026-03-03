/**
 * ProviderPicker — Interactive provider selection + API key entry.
 *
 * Two phases (same pattern as Setup.tsx):
 *   1. Provider selection — arrow key navigation, Enter to confirm
 *   2. API key input — masked text entry with validation
 *
 * Data source: ProviderInfo[] (filtered to type "available" + "discovered").
 * Discovered providers (env var set) skip the API key phase entirely.
 */

import React, { useState, useMemo } from "react";
import { Text, Box, useInput } from "ink";
import { PALETTE } from "../theme.js";
import { validateApiKey } from "../lib/setup.js";
import type { ProviderInfo } from "../types.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type PickerPhase = "select" | "apikey";

export interface ProviderPickerProps {
  /** All providers from backend.listProviders() — component filters internally. */
  providers: ReadonlyArray<ProviderInfo>;
  /** Called when a provider is configured (ready to add). */
  onComplete: (provider: PickerResult) => void;
  /** Called when user presses Escape to cancel. */
  onCancel: () => void;
}

export interface PickerResult {
  id: string;
  name: string;
  baseUrl: string;
  apiKey: string;
  defaultModel?: string;
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Filter and sort providers eligible for the picker (available + discovered). */
export function filterPickerProviders(
  providers: ReadonlyArray<ProviderInfo>,
): ProviderInfo[] {
  return providers.filter(
    (p) => p.type === "available" || p.type === "discovered",
  );
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const ProviderPicker: React.FC<ProviderPickerProps> = ({
  providers,
  onComplete,
  onCancel,
}) => {
  const [phase, setPhase] = useState<PickerPhase>("select");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState<ProviderInfo | null>(null);
  const [apiKeyBuffer, setApiKeyBuffer] = useState("");
  const [error, setError] = useState<string | null>(null);

  // Filter to only available + discovered providers
  const eligible = useMemo(() => filterPickerProviders(providers), [providers]);

  useInput(
    (input, key) => {
      // ── Provider selection phase ─────────────────────────────────────
      if (phase === "select") {
        if (eligible.length === 0) {
          // No providers — only Escape works
          if (key.escape) {
            onCancel();
          }
          return;
        }

        if (key.upArrow) {
          setSelectedIndex((i) =>
            i > 0 ? i - 1 : eligible.length - 1,
          );
          return;
        }
        if (key.downArrow) {
          setSelectedIndex((i) =>
            i < eligible.length - 1 ? i + 1 : 0,
          );
          return;
        }
        if (key.return) {
          const provider = eligible[selectedIndex]!;
          setSelectedProvider(provider);

          if (provider.type === "discovered") {
            // Env var already set — auto-configure, skip API key
            onComplete({
              id: provider.id,
              name: provider.name,
              baseUrl: provider.baseUrl ?? "",
              apiKey: `{env:${provider.envKey}}`,
              defaultModel: provider.defaultModel,
            });
          } else {
            setPhase("apikey");
          }
          return;
        }
        if (key.escape) {
          onCancel();
          return;
        }
        return;
      }

      // ── API key input phase ──────────────────────────────────────────
      if (phase === "apikey") {
        if (key.escape) {
          // Go back to selection
          setPhase("select");
          setApiKeyBuffer("");
          setError(null);
          return;
        }

        if (key.return) {
          const trimmed = apiKeyBuffer.trim();
          if (!validateApiKey(trimmed)) {
            setError(
              trimmed.length < 10
                ? "API key must be at least 10 characters"
                : "API key must not contain whitespace",
            );
            return;
          }
          setError(null);
          onComplete({
            id: selectedProvider!.id,
            name: selectedProvider!.name,
            baseUrl: selectedProvider!.baseUrl ?? "",
            apiKey: trimmed,
            defaultModel: selectedProvider!.defaultModel,
          });
          return;
        }

        if (key.backspace || key.delete) {
          setApiKeyBuffer((b) => b.slice(0, -1));
          setError(null);
          return;
        }

        if (key.ctrl && input === "u") {
          setApiKeyBuffer("");
          setError(null);
          return;
        }

        if (input && !key.ctrl && !key.meta && !key.escape) {
          setApiKeyBuffer((b) => b + input);
          setError(null);
        }
        return;
      }
    },
    { isActive: true },
  );

  // ── Render ─────────────────────────────────────────────────────────────

  // Empty state
  if (eligible.length === 0) {
    return (
      <Box flexDirection="column">
        <Text />
        <Text color={PALETTE.muted}>  No providers available to add.</Text>
        <Text color={PALETTE.dim}>  All known providers are already configured.</Text>
        <Text />
        <Text color={PALETTE.dim}>  Esc to go back</Text>
      </Box>
    );
  }

  // API key input phase
  if (phase === "apikey" && selectedProvider) {
    const masked = apiKeyBuffer.length > 4
      ? apiKeyBuffer.slice(0, 4) + "●".repeat(apiKeyBuffer.length - 4)
      : "●".repeat(apiKeyBuffer.length);

    return (
      <Box flexDirection="column">
        <Text />
        <Text color={PALETTE.muted}>  Enter your {selectedProvider.name} API key:</Text>
        <Text />
        <Text>
          <Text color={PALETTE.brand} bold>{"  > "}</Text>
          <Text>{masked}</Text>
          <Text inverse> </Text>
        </Text>
        {error && (
          <Box marginTop={1}>
            <Text color={PALETTE.red}>  {error}</Text>
          </Box>
        )}
        <Text />
        <Text color={PALETTE.dim}>  Enter to confirm · Esc go back</Text>
      </Box>
    );
  }

  // Provider selection phase
  return (
    <Box flexDirection="column">
      <Text />
      <Text color={PALETTE.brand} bold>  Add a Provider</Text>
      <Text />

      {eligible.map((p, i) => {
        const isSelected = i === selectedIndex;
        const marker = isSelected ? "  ▸ " : "    ";
        const isDiscovered = p.type === "discovered";

        return (
          <Text key={p.id}>
            <Text color={isSelected ? PALETTE.brand : undefined}>
              {marker}
            </Text>
            <Text color={isSelected ? PALETTE.brand : PALETTE.text} bold={isSelected}>
              {p.name}
            </Text>
            {p.defaultModel && (
              <Text color={PALETTE.dim}>  {p.defaultModel}</Text>
            )}
            {isDiscovered && (
              <Text color={PALETTE.green}>  ✓ {p.envKey} set</Text>
            )}
          </Text>
        );
      })}

      <Text />
      <Text color={PALETTE.dim}>  ↑↓ navigate · Enter select · Esc cancel</Text>
    </Box>
  );
};
