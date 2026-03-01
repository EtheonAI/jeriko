/**
 * TUI Autocomplete — Pure logic for slash command autocomplete.
 *
 * Filtering, selection navigation, and visibility are all pure functions.
 * No SolidJS or rendering dependencies — fully testable in isolation.
 */

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

export interface AutocompleteItem {
  /** Command name including the slash, e.g. "/help" */
  name: string;
  /** Short description, e.g. "Show available commands" */
  description: string;
}

export interface AutocompleteState {
  /** Filtered items matching the current input */
  items: AutocompleteItem[];
  /** Index of the highlighted item (-1 = none selected) */
  selectedIndex: number;
  /** Whether the popup is visible */
  visible: boolean;
}

// ---------------------------------------------------------------------------
// Functions
// ---------------------------------------------------------------------------

/**
 * Determine whether autocomplete should be shown for the current input.
 * Returns true when the input starts with "/" at position 0 and contains
 * no spaces (i.e. the user is still typing the command name, not args).
 */
export function shouldShowAutocomplete(input: string): boolean {
  const trimmed = input.trimStart();
  if (!trimmed.startsWith("/")) return false;
  // Hide once the user has typed a space (entering args)
  return !trimmed.includes(" ");
}

/**
 * Filter commands that match the current input prefix.
 * Input is matched case-insensitively against command names.
 * When input is exactly "/", all commands are returned.
 */
export function filterCommands(
  input: string,
  commands: ReadonlyMap<string, { description: string }>,
): AutocompleteItem[] {
  const prefix = input.trimStart().toLowerCase();
  const items: AutocompleteItem[] = [];

  for (const [name, { description }] of commands) {
    if (name.toLowerCase().startsWith(prefix)) {
      items.push({ name, description });
    }
  }

  return items;
}

/**
 * Navigate the selection index up or down within the filtered list.
 * Wraps around: going up from 0 selects the last item, going down
 * from the last item selects the first.
 */
export function navigateSelection(
  state: AutocompleteState,
  direction: "up" | "down",
): number {
  const { items, selectedIndex } = state;
  if (items.length === 0) return -1;

  if (direction === "down") {
    return selectedIndex < items.length - 1 ? selectedIndex + 1 : 0;
  }
  // up
  return selectedIndex > 0 ? selectedIndex - 1 : items.length - 1;
}

/**
 * Create the initial (empty) autocomplete state.
 */
export function emptyAutocompleteState(): AutocompleteState {
  return { items: [], selectedIndex: -1, visible: false };
}

/**
 * Compute the next autocomplete state from the current input and command list.
 */
export function computeAutocompleteState(
  input: string,
  commands: ReadonlyMap<string, { description: string }>,
): AutocompleteState {
  if (!shouldShowAutocomplete(input)) {
    return emptyAutocompleteState();
  }

  const items = filterCommands(input, commands);
  if (items.length === 0) {
    return emptyAutocompleteState();
  }

  return {
    items,
    selectedIndex: 0,
    visible: true,
  };
}
