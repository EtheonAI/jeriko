# Ink Chat CLI Audit — Full Analysis

## Component Tree

```
ErrorBoundary (class component — catches render errors)
  Box flexDirection="column"
    Messages (Static — never re-rendered once committed)
      MessageView (dispatches on role)
        UserMessage       > text
        AssistantMessage   Markdown + ToolCallSummary
        SystemMessage      muted text
    ToolCallView[]        (live tool calls during execution)
      OR SubAgentView[]   (for delegate/parallel_tasks tool names)
    SubAgentList          (live sub-agent tree during sub-executing)
      AgentNode[]         (per-agent: spinner, label, tool, elapsed)
    StreamingText         (Markdown + cursor during streaming phase)
    StatusBar             (phase-specific: spinner OR idle stats)
      ContextBar          (progress bar when >50% context used)
    Input                 (always rendered, disabled when not idle)
      Autocomplete        (popup when typing / commands)
    Setup                 (provider picker + API key — setup phase only)
    Wizard                (generic multi-step flow — wizard phase only)
```

## State Management

### AppState (single source of truth)

| Field          | Type                          | Purpose                           |
|----------------|-------------------------------|-----------------------------------|
| phase          | Phase                         | Current interaction phase         |
| messages       | DisplayMessage[]              | Conversation history (Static)     |
| streamText     | string                        | Live streaming response text      |
| liveToolCalls  | DisplayToolCall[]             | Active tool calls in progress     |
| subAgents      | Map<string, SubAgentState>    | Live sub-agent monitoring state   |
| stats          | SessionStats                  | Cumulative tokens/turns/duration  |
| context        | ContextInfo                   | Context window utilization        |
| model          | string                        | Active model name                 |
| sessionSlug    | string                        | Current session identifier        |
| currentTool    | string | undefined            | Name of executing tool (spinner)  |

### Action Types (23 total)

| Action                     | Effect                                               |
|----------------------------|------------------------------------------------------|
| SET_PHASE                  | Transitions phase state machine                      |
| ADD_MESSAGE                | Appends to messages array                            |
| CLEAR_MESSAGES             | Resets messages to empty                             |
| APPEND_STREAM_TEXT         | Concatenates streaming text                          |
| CLEAR_STREAM               | Resets streamText to ""                              |
| TOOL_CALL_START            | Adds new tool call to liveToolCalls                  |
| TOOL_CALL_RESULT           | Updates matching tool call with result               |
| CLEAR_TOOL_CALLS           | Resets liveToolCalls to empty                        |
| SET_CURRENT_TOOL           | Updates currentTool label for spinner                |
| FREEZE_ASSISTANT_MESSAGE   | Moves stream+toolCalls into static message           |
| UPDATE_STATS               | Adds token counts, increments turns                  |
| RESET_STATS                | Zeros all stats                                      |
| SET_MODEL                  | Updates model name                                   |
| SET_SESSION_SLUG           | Updates session slug                                 |
| UPDATE_CONTEXT             | Updates totalTokens in context                       |
| CONTEXT_COMPACTED          | Updates context after compaction                     |
| SUB_AGENT_STARTED          | Adds new sub-agent to Map                            |
| SUB_AGENT_TEXT_DELTA       | Appends to sub-agent stream preview (120 char cap)   |
| SUB_AGENT_TOOL_CALL        | Updates sub-agent current tool + count               |
| SUB_AGENT_TOOL_RESULT      | Clears sub-agent current tool                        |
| SUB_AGENT_COMPLETE         | Marks sub-agent as completed/error                   |
| CLEAR_SUB_AGENTS           | Resets subAgents Map                                 |
| RESET_TURN                 | Compound: idle + clear stream/tools/subAgents        |

### Phase State Machine

```
idle → thinking    (user sends message)
thinking → streaming   (first text delta arrives)
thinking → tool-executing  (tool call starts without text)
streaming → tool-executing (tool call starts during stream)
tool-executing → streaming (tool finishes, more text)
tool-executing → sub-executing (sub-agent starts)
sub-executing → tool-executing (sub-agent completes, parent continues)
{thinking,streaming,tool-executing,sub-executing} → idle (RESET_TURN on complete/interrupt)
idle → setup  (first-launch wizard)
idle → wizard (slash commands that launch interactive flows)
{setup,wizard} → idle (complete/cancel)
```

## Slash Command Registry

34 registered commands in SLASH_COMMANDS Map, 35 handler entries (including /task).
Categories: Session (12), Models (2), Channels (2), Management (8), Billing (5), System (6).

## Input Handling Flow

1. **Keypress** → `useInput` in Input component
2. **Ctrl+C/Escape** → Always handled: interrupt active phase or exit on idle
3. **Interactive phases (wizard/setup)** → Input returns early, those components handle keys
4. **Non-idle phases** → Only Ctrl+C/Escape processed, all other keys ignored
5. **Idle phase processing**:
   - **Enter** → If autocomplete visible: execute selected command. Otherwise: trim, push to history, call onSubmit
   - **Tab** → Fill autocomplete selection into input, or complete single slash match
   - **Up/Down** → Autocomplete navigation OR history navigation OR multi-line cursor movement
   - **Left/Right** → Cursor movement with line wrapping
   - **Backspace** → Delete char or merge with previous line
   - **Ctrl+A/E/U/K/W/J** → Emacs keybindings (home/end/clear/kill/word-delete/newline)
   - **Regular chars** → Insert at cursor, detect pasted newlines for multi-line

## Error Handling

### Backend errors
- `backend.send()` wrapped in try/catch in `handleSubmit`
- Catch block calls `addSystemMessage(formatError(...))` + `dispatch(RESET_TURN)`
- Always recovers to idle — never leaves UI stuck

### Streaming connection drops
- Handled by backend implementation (abort/reconnect)
- onError callback adds system message
- onTurnComplete always fires (resets state)

### Slash command errors
- Try/catch in `useSlashCommands.handleSlashCommand`
- Catch adds system message with error text
- Returns true (command was recognized) regardless of error

### Ink rendering crashes
- ErrorBoundary class component wraps entire App
- Shows styled error message + Ctrl+C exit hint
- Logs to stderr via componentDidCatch

### Clean exit on Ctrl+C
- **Active phase**: Sets abortedRef, calls backend.abort(), dispatches RESET_TURN, adds "Interrupted" message
- **Idle phase**: Calls Ink's exit() — cleanly unmounts
- After waitUntilExit: resets ANSI, process.exit(0)

## Potential Issues / Observations

1. **FREEZE_ASSISTANT_MESSAGE skips empty**: If `!action.text && action.toolCalls.length === 0`, returns state unchanged. This is correct — prevents empty assistant messages.

2. **TOOL_CALL_RESULT uses Date.now() in reducer**: Line 74 of useAppReducer.ts calls `Date.now() - tc.startTime` inside the reducer. This is technically impure but harmless — duration calculation needs wall-clock time. Acceptable trade-off.

3. **Sub-agent stream preview truncation**: Uses `.slice(-MAX_STREAM_PREVIEW)` (120 chars) — keeps the trailing portion. Correct behavior for a rolling preview.

4. **InputHistory module-level instantiation**: `const inputHistory = new InputHistory()` at module scope in Input.tsx, with `inputHistory.load()` called immediately. This means history loads once at import time, persists across re-renders. Correct design for a singleton.

5. **Input component isActive: true always**: The `useInput` hook is always active, but non-idle phases are filtered out inside the handler. This means keypress events are processed even during wizard/setup phases, but the handler returns early. Could be slightly more efficient with dynamic isActive, but functionally correct.

6. **ErrorBoundary does not auto-recover**: Once an error is caught, the boundary stays in error state permanently. There's no retry mechanism. Users must Ctrl+C and restart. This is acceptable for a CLI.

7. **No unhandled rejection handler**: If `backend.send()` throws after the try/catch has already returned (e.g., late callback error), it could become an unhandled promise rejection. The `abortedRef` guard mitigates this for callbacks, but edge cases remain.

8. **Wizard onComplete is fire-and-forget**: Line 63 of Wizard.tsx: `void Promise.resolve(config.onComplete(newResults))`. If onComplete throws synchronously, it's caught by the void wrapper. If it rejects asynchronously, it becomes unhandled. The comment acknowledges this and says error handling is in launchWizard() wrappers.
