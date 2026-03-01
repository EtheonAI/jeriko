/**
 * TUI Setup Wizard — First-launch onboarding for new users.
 *
 * Two steps:
 *   1. Choose provider (Anthropic, OpenAI, Local)
 *   2. Enter API key (skipped for Local)
 *
 * On completion, persists the API key via saveSecret() and writes
 * an initial config.json so the setup is never shown again.
 */

import {
  createSignal,
  Show,
  For,
  onMount,
} from "solid-js";
import { useKeyboard, useTerminalDimensions } from "@opentui/solid";
import type { TextareaRenderable } from "@opentui/core";
import { useTheme } from "../context/theme.js";
import { PROVIDER_OPTIONS, type ProviderOption } from "../lib/setup.js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface SetupProps {
  /** Called when setup is complete — parent unmounts this and mounts main app */
  onComplete: () => void;
}

type SetupStep = "provider" | "apikey";

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------

export function Setup(props: SetupProps) {
  const theme = useTheme();
  const dims = useTerminalDimensions();

  const [step, setStep] = createSignal<SetupStep>("provider");
  const [selectedIndex, setSelectedIndex] = createSignal(0);
  const [selectedProvider, setSelectedProvider] = createSignal<ProviderOption>(PROVIDER_OPTIONS[0]!);
  const [apiKey, setApiKey] = createSignal("");
  const [error, setError] = createSignal("");
  let inputRef: TextareaRenderable | undefined;

  // -----------------------------------------------------------------------
  // Step 1: Provider selection keyboard handler
  // -----------------------------------------------------------------------

  useKeyboard((key) => {
    if (step() !== "provider") return;

    if (key.name === "up") {
      setSelectedIndex((i) => (i > 0 ? i - 1 : PROVIDER_OPTIONS.length - 1));
    } else if (key.name === "down") {
      setSelectedIndex((i) => (i < PROVIDER_OPTIONS.length - 1 ? i + 1 : 0));
    } else if (key.name === "return") {
      const provider = PROVIDER_OPTIONS[selectedIndex()]!;
      setSelectedProvider(provider);

      if (!provider.needsApiKey) {
        // Local provider — skip API key step, complete immediately
        finishSetup(provider, "");
      } else {
        setStep("apikey");
      }
    }
  });

  // -----------------------------------------------------------------------
  // Step 2: API key submission
  // -----------------------------------------------------------------------

  const handleApiKeyContentChange = () => {
    if (inputRef) setApiKey(inputRef.plainText);
  };

  const handleApiKeySubmit = () => {
    if (!inputRef) return;
    const key = inputRef.plainText.trim();

    if (key.length < 10) {
      setError("API key must be at least 10 characters");
      return;
    }
    if (/\s/.test(key)) {
      setError("API key must not contain spaces");
      return;
    }

    setError("");
    finishSetup(selectedProvider(), key);
  };

  // -----------------------------------------------------------------------
  // Finish: persist config + secret
  // -----------------------------------------------------------------------

  async function finishSetup(provider: ProviderOption, key: string): Promise<void> {
    try {
      // Lazy import to avoid loading fs at module level
      const { saveSecret } = await import("../../../shared/secrets.js");
      const { getConfigDir } = await import("../../../shared/config.js");
      const fs = await import("node:fs");
      const path = await import("node:path");

      // Save API key if provided
      if (key && provider.envKey) {
        saveSecret(provider.envKey, key);
      }

      // Write minimal config.json so needsSetup() returns false on next launch
      const configDir = getConfigDir();
      if (!fs.existsSync(configDir)) {
        fs.mkdirSync(configDir, { recursive: true });
      }

      const configPath = path.join(configDir, "config.json");
      const config = {
        agent: { model: provider.model },
      };
      fs.writeFileSync(configPath, JSON.stringify(config, null, 2) + "\n");

      props.onComplete();
    } catch (err) {
      setError(`Setup failed: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  // -----------------------------------------------------------------------
  // API key input bindings
  // -----------------------------------------------------------------------

  const apiKeyBindings = [
    { name: "return", action: "submit" },
    { name: "left", action: "move-left" },
    { name: "right", action: "move-right" },
    { name: "backspace", action: "backspace" },
    { name: "delete", action: "delete" },
    { name: "home", action: "buffer-home" },
    { name: "end", action: "buffer-end" },
  ] as const;

  // -----------------------------------------------------------------------
  // Render
  // -----------------------------------------------------------------------

  return (
    <box
      flexDirection="column"
      width={dims().width}
      height={dims().height}
      backgroundColor={theme().background}
    >
      {/* Top spacer */}
      <box flexGrow={1} />

      {/* Centered content */}
      <box justifyContent="center">
        <box flexDirection="column" width={50}>
          {/* Title */}
          <box justifyContent="center" paddingBottom={2}>
            <text>
              <span style={{ fg: theme().primary, bold: true }}>Welcome to Jeriko</span>
            </text>
          </box>

          {/* Step 1: Provider selection */}
          <Show when={step() === "provider"}>
            <box flexDirection="column">
              <box paddingBottom={1}>
                <text fg={theme().textMuted}>Choose your AI provider:</text>
              </box>

              <box
                flexDirection="column"
                backgroundColor={theme().backgroundMenu}
                border={["left", "right", "top", "bottom"] as any}
                borderColor={theme().border}
              >
                <For each={PROVIDER_OPTIONS as unknown as ProviderOption[]}>
                  {(provider, index) => {
                    const isSelected = () => index() === selectedIndex();
                    const isRecommended = () => index() === 0;
                    return (
                      <box
                        paddingX={1}
                        backgroundColor={isSelected() ? theme().backgroundElement : undefined}
                      >
                        <text>
                          <span style={{ fg: isSelected() ? theme().primary : theme().text }}>
                            {isSelected() ? "▸ " : "  "}
                          </span>
                          <span style={{ fg: isSelected() ? theme().primary : theme().text, bold: isSelected() }}>
                            {provider.name}
                          </span>
                          <Show when={isRecommended()}>
                            <span style={{ fg: theme().success }}> (recommended)</span>
                          </Show>
                          <Show when={!provider.needsApiKey}>
                            <span style={{ fg: theme().textMuted }}> — no API key needed</span>
                          </Show>
                        </text>
                      </box>
                    );
                  }}
                </For>
              </box>

              <box paddingTop={1}>
                <text fg={theme().textMuted}>↑↓ to navigate, Enter to select</text>
              </box>
            </box>
          </Show>

          {/* Step 2: API key input */}
          <Show when={step() === "apikey"}>
            <box flexDirection="column">
              <box paddingBottom={1}>
                <text fg={theme().textMuted}>
                  Enter your {selectedProvider().name} API key:
                </text>
              </box>

              <box
                border={["left", "right", "top", "bottom"] as any}
                borderColor={error() ? theme().error : theme().border}
                backgroundColor={theme().backgroundElement}
                paddingX={1}
              >
                <textarea
                  ref={(r: TextareaRenderable) => { inputRef = r; }}
                  focused={true}
                  placeholder={`Paste your ${selectedProvider().envKey} here...`}
                  textColor={theme().text}
                  focusedTextColor={theme().text}
                  minHeight={1}
                  maxHeight={1}
                  keyBindings={apiKeyBindings as unknown as any[]}
                  onContentChange={handleApiKeyContentChange}
                  onSubmit={handleApiKeySubmit}
                />
              </box>

              <Show when={error()}>
                <box paddingTop={1}>
                  <text fg={theme().error}>{error()}</text>
                </box>
              </Show>

              <box paddingTop={1}>
                <text fg={theme().textMuted}>Enter to confirm</text>
              </box>
            </box>
          </Show>
        </box>
      </box>

      {/* Bottom spacer */}
      <box flexGrow={1} />
    </box>
  );
}
