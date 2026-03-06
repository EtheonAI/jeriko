/**
 * Setup — First-launch provider selection wizard.
 *
 * Two phases:
 *   1. Provider selection — arrow key navigation, Enter to confirm
 *   2. API key input — masked text entry with validation
 *
 * Uses getProviderOptions() from lib/setup.ts for the dynamic provider list.
 */

import React, { useState, useMemo } from "react";
import { Text, Box, useInput } from "ink";
import { PALETTE } from "../theme.js";
import { getProviderOptions, validateApiKey, type ProviderOption } from "../lib/setup.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

type SetupPhase = "provider" | "apikey" | "complete";

interface SetupProps {
  onComplete: (provider: ProviderOption, apiKey: string) => void;
  onCancel?: () => void;
}

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export const Setup: React.FC<SetupProps> = ({ onComplete, onCancel }) => {
  const providers = useMemo(() => getProviderOptions(), []);
  const [phase, setPhase] = useState<SetupPhase>("provider");
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [selectedProvider, setSelectedProvider] = useState<ProviderOption | null>(null);
  const [apiKeyBuffer, setApiKeyBuffer] = useState("");
  const [error, setError] = useState<string | null>(null);

  useInput(
    (input, key) => {
      // ── Provider selection phase ─────────────────────────────────────
      if (phase === "provider") {
        if (key.escape || (key.ctrl && input === "c")) {
          if (onCancel) {
            onCancel();
          } else {
            process.exit(0);
          }
          return;
        }
        if (key.upArrow) {
          setSelectedIndex((i) =>
            i > 0 ? i - 1 : providers.length - 1,
          );
          return;
        }
        if (key.downArrow) {
          setSelectedIndex((i) =>
            i < providers.length - 1 ? i + 1 : 0,
          );
          return;
        }
        if (key.return) {
          const provider = providers[selectedIndex]!;
          setSelectedProvider(provider);
          if (provider.needsApiKey) {
            setPhase("apikey");
          } else {
            setPhase("complete");
            onComplete(provider, "");
          }
          return;
        }
        return;
      }

      // ── API key input phase ──────────────────────────────────────────
      if (phase === "apikey") {
        if (key.escape) {
          // Go back to provider selection
          setPhase("provider");
          setApiKeyBuffer("");
          setError(null);
          return;
        }
        if (key.ctrl && input === "c") {
          if (onCancel) {
            onCancel();
          } else {
            process.exit(0);
          }
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
          setPhase("complete");
          onComplete(selectedProvider!, trimmed);
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

        if (input && !key.ctrl && !key.meta) {
          setApiKeyBuffer((b) => b + input);
          setError(null);
        }
        return;
      }
    },
    { isActive: phase !== "complete" },
  );

  // ── Render ─────────────────────────────────────────────────────────────

  if (phase === "complete") {
    return <Text color={PALETTE.green}>✓ Setup complete!</Text>;
  }

  if (phase === "apikey" && selectedProvider) {
    const masked = "•".repeat(apiKeyBuffer.length);

    return (
      <Box flexDirection="column">
        <Text />
        <Text color={PALETTE.muted}>  Enter your {selectedProvider.name} API key:</Text>
        <Text />
        <Text>
          <Text color={PALETTE.brand} bold>{">"} </Text>
          <Text>{masked}</Text>
          <Text inverse> </Text>
        </Text>
        {error && (
          <Box marginTop={1}>
            <Text color={PALETTE.red}>  {error}</Text>
          </Box>
        )}
        <Text />
        <Text color={PALETTE.dim}>  Enter to confirm · Esc back</Text>
      </Box>
    );
  }

  // Provider selection
  return (
    <Box flexDirection="column">
      <Text />
      <Text color={PALETTE.brand} bold>  Welcome to Jeriko</Text>
      <Text />
      <Text color={PALETTE.muted}>  Choose your AI provider:</Text>
      <Text />

      {providers.map((p, i) => {
        const isSelected = i === selectedIndex;
        const marker = isSelected ? "  ▸ " : "    ";
        const recommended = i === 0 ? " (recommended)" : "";
        const noKey = !p.needsApiKey ? " — no API key needed" : "";

        return (
          <Text key={p.id}>
            <Text color={isSelected ? PALETTE.brand : undefined}>
              {marker}
            </Text>
            <Text color={isSelected ? PALETTE.brand : PALETTE.text} bold={isSelected}>
              {p.name}
            </Text>
            {recommended && <Text color={PALETTE.green}>{recommended}</Text>}
            {noKey && <Text color={PALETTE.dim}>{noKey}</Text>}
          </Text>
        );
      })}

      <Text />
      <Text color={PALETTE.dim}>  ↑↓ navigate · Enter select · Esc cancel</Text>
    </Box>
  );
};
