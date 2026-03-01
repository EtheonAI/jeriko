/**
 * TUI App — Root component with provider hierarchy and screen routing.
 *
 * Provider order (outermost to innermost):
 *   ThemeProvider → SetupGate → ToastProvider → SessionProvider → AgentProvider
 *   → RouteProvider → CommandProvider
 *
 * SetupGate sits inside ThemeProvider (needs colors) but outside everything
 * else — it must run BEFORE AgentProvider loads config (which may not exist yet).
 * If the user needs first-launch setup, the wizard is shown instead of the app.
 */

import { createSignal, Match, Show, Switch } from "solid-js";
import { useKeyboard, useRenderer } from "@opentui/solid";
import { ThemeProvider } from "./context/theme.js";
import type { ThemeMode } from "./lib/theme.js";
import { ToastProvider } from "./context/toast.js";
import { SessionProvider } from "./context/session.js";
import { AgentProvider } from "./context/agent.js";
import { CommandProvider } from "./context/command.js";
import { RouteProvider, useRoute } from "./context/route.js";
import { ToastContainer } from "./components/toast.js";
import { HomeScreen } from "./routes/home.js";
import { SessionScreen } from "./routes/session/index.js";
import { Setup } from "./components/setup.js";
import { needsSetup } from "./lib/setup.js";

// ---------------------------------------------------------------------------
// Screen router
// ---------------------------------------------------------------------------

function ScreenRouter() {
  const { route } = useRoute();

  return (
    <Switch>
      <Match when={route() === "home"}>
        <HomeScreen />
      </Match>
      <Match when={route() === "session"}>
        <SessionScreen />
      </Match>
    </Switch>
  );
}

// ---------------------------------------------------------------------------
// Global keyboard handler
// ---------------------------------------------------------------------------

function GlobalKeyboard() {
  const renderer = useRenderer();

  useKeyboard((key) => {
    // Ctrl+C — clean exit
    if (key.ctrl && key.name === "c") {
      renderer.destroy();
      process.exit(0);
    }
  });

  // This component renders nothing — it only registers the handler
  return <box visible={false} />;
}

// ---------------------------------------------------------------------------
// Setup gate — shows first-launch wizard before the main app
// ---------------------------------------------------------------------------

function SetupGate(props: { children: any }) {
  const [setupDone, setSetupDone] = createSignal(!needsSetup());

  return (
    <Show when={setupDone()} fallback={<Setup onComplete={() => setSetupDone(true)} />}>
      {props.children}
    </Show>
  );
}

// ---------------------------------------------------------------------------
// App
// ---------------------------------------------------------------------------

interface AppProps {
  themeMode?: ThemeMode;
}

export function App(props: AppProps) {
  return (
    <ThemeProvider mode={props.themeMode}>
      <SetupGate>
        <ToastProvider>
          <SessionProvider>
            <AgentProvider>
              <RouteProvider>
                <CommandProvider>
                  <GlobalKeyboard />
                  <ScreenRouter />
                  <ToastContainer />
                </CommandProvider>
              </RouteProvider>
            </AgentProvider>
          </SessionProvider>
        </ToastProvider>
      </SetupGate>
    </ThemeProvider>
  );
}
