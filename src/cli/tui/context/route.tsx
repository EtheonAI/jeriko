/**
 * TUI RouteProvider — Simple screen routing between home and session views.
 *
 * The TUI has two screens:
 *   - "home": Logo, centered prompt, tips
 *   - "session": Full conversation view with messages, header, footer
 *
 * Transitions to "session" on first message submit.
 */

import {
  createContext,
  useContext,
  createSignal,
  type ParentProps,
  type Accessor,
} from "solid-js";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export type Route = "home" | "session";

interface RouteContextValue {
  route: Accessor<Route>;
  navigate: (to: Route) => void;
}

// ---------------------------------------------------------------------------
// Context
// ---------------------------------------------------------------------------

const RouteContext = createContext<RouteContextValue>();

export function useRoute(): RouteContextValue {
  const ctx = useContext(RouteContext);
  if (!ctx) throw new Error("useRoute() must be used within a <RouteProvider>");
  return ctx;
}

// ---------------------------------------------------------------------------
// Provider
// ---------------------------------------------------------------------------

interface RouteProviderProps extends ParentProps {
  /** Initial route (default: "home") */
  initial?: Route;
}

export function RouteProvider(props: RouteProviderProps) {
  const [route, setRoute] = createSignal<Route>(props.initial ?? "home");

  const navigate = (to: Route): void => {
    setRoute(to);
  };

  return (
    <RouteContext.Provider value={{ route, navigate }}>
      {props.children}
    </RouteContext.Provider>
  );
}
