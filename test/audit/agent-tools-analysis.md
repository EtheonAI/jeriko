# Agent Tools System Audit

Audit date: 2026-03-06
Scope: `/src/daemon/agent/tools/` (16 tools) + registry + security integration

---

## Architecture Overview

### Registration Flow
1. Each tool file imports `registerTool` from `registry.ts`
2. Tool files self-register by calling `registerTool(toolDef)` at module scope
3. Kernel (`src/daemon/kernel.ts`) dynamically imports all 16 tool files at step 6
4. Import triggers `registerTool()` calls, populating the global `tools` Map
5. Alias index populated in parallel (alias -> canonical tool ID)

### Tool Call Flow (Agent Loop)
1. LLM returns tool_use blocks with `name` + `arguments`
2. `agent.ts` calls `getTool(tc.name)` (resolves aliases via case-insensitive lookup)
3. `ExecutionGuard` checks rate limits
4. `parseToolArgs(tc.arguments)` parses JSON string to object
5. `tool.execute(args)` called with parsed arguments
6. String result returned to LLM as tool_result

### Registry API
- `registerTool(def)` - Register with duplicate ID check
- `getTool(id)` - Lookup by ID or alias (case-insensitive)
- `listTools()` - All registered definitions
- `clearTools()` - Reset for testing
- `unregisterTool(id)` - Remove + clean aliases
- Format converters: `toAnthropicFormat`, `toOpenAIFormat`, `toDriverFormat`

---

## Tool Catalog (16 tools)

### 1. bash (id: "bash")
- **Aliases:** exec, shell, run, execute, run_command, terminal
- **Parameters:** command (string, required), timeout (number, default 30000), cwd (string)
- **Security:** Execution lease system (lease.ts) classifies risk, blocks critical commands (sudo, rm -rf /, fork bombs). Audit trail via audit.ts.
- **Output:** Raw stdout + stderr, capped at 100KB. Truncation indicator if exceeded.
- **Error handling:** Process spawn errors caught. Timeout via child_process option.

### 2. read_file (id: "read_file")
- **Aliases:** read, cat, view_file
- **Parameters:** file_path (string, required), offset (number, default 0), limit (number, default 2000)
- **Security:** `isPathBlocked()` checks against BLOCKED_PATHS + BLOCKED_SEGMENTS + ALLOWED_ROOTS. Path resolved with `resolve()`.
- **Output:** Numbered lines (`lineNum\tcontent`). Returns "(empty file)" for empty files.
- **Error handling:** stat check (not-a-file), readFile catch.

### 3. write_file (id: "write_file")
- **Aliases:** write, create_file, save_file
- **Parameters:** file_path (string, required), content (string, required)
- **Security:** `isPathBlocked()` validation. Creates parent dirs with `mkdir recursive`.
- **Output:** JSON `{ok, path, bytes}`.
- **Validation:** Checks content !== undefined/null (allows empty string).

### 4. edit_file (id: "edit_file")
- **Aliases:** edit, replace, str_replace_editor
- **Parameters:** file_path (string, required), old_string (string, required), new_string (string, required), replace_all (boolean, default false)
- **Security:** `isPathBlocked()`. Uniqueness check: rejects if old_string appears multiple times (unless replace_all=true).
- **Output:** JSON `{ok, path}`.
- **Bug note:** `old_string` falsy check (`!oldString`) means empty string would be rejected, which is correct behavior.

### 5. list_files (id: "list_files")
- **Aliases:** list, ls, find, find_files, glob
- **Parameters:** path (string, default cwd), pattern (string, default "*"), max_depth (number, default 5)
- **Security:** `isPathBlocked()`. Skips hidden dirs (except root), node_modules. Symlink loop detection via inode tracking.
- **Output:** Relative file paths, capped at 500. Glob pattern via simple regex conversion.

### 6. search_files (id: "search_files")
- **Aliases:** grep, search, ripgrep, find_text
- **Parameters:** pattern (string, required), path (string, default cwd), glob (string), max_results (number, default 50)
- **Security:** `isPathBlocked()`. Regex validation with try/catch. Skips .git, node_modules, hidden dirs, binary files.
- **Output:** `file:line: text` format, text capped at 200 chars per line.

### 7. web_search (id: "web_search")
- **Aliases:** web, internet_search, ddg_search
- **Parameters:** query (string, required), max_results (number, default 5)
- **Execution:** DuckDuckGo HTML scraping with regex parsing. 10s timeout via AbortSignal.
- **Output:** Numbered results with title, URL, snippet.

### 8. screenshot (id: "screenshot")
- **Aliases:** capture_screen, take_screenshot, screen_capture
- **Parameters:** region (string, optional, format "x,y,w,h")
- **Execution:** macOS: `screencapture -x`, Linux: `scrot`. Temp file in tmpdir.
- **Output:** JSON `{ok, path}`.

### 9. camera (id: "camera")
- **Aliases:** webcam, take_photo, capture_photo
- **Parameters:** (none)
- **Execution:** macOS: DarwinCamera (platform module), Linux: fswebcam.
- **Output:** JSON `{ok, path}`.

### 10. parallel_tasks (id: "parallel_tasks")
- **Aliases:** parallel, multi_task, fan_out
- **Parameters:** tasks (array, required), concurrency (number, default 4), agent_type (string, default "general")
- **Validation:** Tasks must be non-empty array, max 20. Agent type validated against AGENT_TYPES.
- **Execution:** `fanOut()` from orchestrator. Inherits parent system prompt, model, backend.
- **Output:** Structured results with tool calls, files written/edited (content read back, max 4KB).

### 11. browser (id: "browser")
- **Aliases:** browse, web_browser, open_browser
- **Parameters:** action (string, required) + action-specific params (url, index, selector, text, etc.)
- **Actions (15):** navigate, view, screenshot, click, type, scroll, select_option, detect_captcha, evaluate, get_text, get_links, key_press, back, forward, close
- **Execution:** Playwright-core with system Chrome, persistent profile, anti-detection stealth.
- **Security concern:** `evaluate` action allows arbitrary JS execution on the page (by design for agent).
- **Output:** Page snapshots with elements, markdown content, screenshots, scroll status, captcha detection.

### 12. delegate (id: "delegate")
- **Aliases:** delegate_task, sub_agent, spawn_agent
- **Parameters:** prompt (string, required), agent_type (string, default "general"), include_context (boolean, default false)
- **Validation:** Agent type validated. Capability gate: blocks small local models (<16K context).
- **Execution:** `delegate()` from orchestrator.
- **Output:** Full context response with tool calls, file contents, errors.

### 13. connector (id: "connector")
- **Aliases:** connectors, gmail, stripe, github, twilio, + 27 more service names
- **Parameters:** name (string, required), method (string, required), params (object)
- **Execution:** Dispatches to ConnectorManager (injected at kernel step 10.5 via `setConnectorManager`).
- **Output:** Connector's response JSON.
- **Note:** ConnectorManager is null until kernel boot completes.

### 14. use_skill (id: "use_skill")
- **Aliases:** skill, skills, load_skill
- **Parameters:** action (string, required, enum), name (string), path (string), script (string), args (string)
- **Actions (5):** list, load, read_reference, run_script, list_files
- **Security:** Path traversal prevention in read_reference and run_script (checks `startsWith`). Script execution uses `spawnSync` with args array (no shell injection). Executable permission checked.
- **Output:** Structured JSON per action.

### 15. webdev (id: "webdev")
- **Aliases:** web_dev, dev_tools, project
- **Parameters:** action (string, required) + action-specific params
- **Actions (8):** status, debug_logs, save_checkpoint, rollback, versions, restart, push_schema, execute_sql
- **Security:** Git commands use args array (no shell injection). SQL via bun:sqlite. Commit hash validated with regex.
- **Output:** Structured JSON per action.

### 16. memory (id: "memory")
- **Aliases:** remember, save_memory, recall
- **Parameters:** action (string, required, enum), content (string), query (string)
- **Actions (4):** read, write, append, search
- **Security:** 64KB file size limit. File stored at `~/.jeriko/memory/MEMORY.md`.
- **Output:** Structured JSON.

---

## Security Considerations

### Path Security (read, write, edit, list, search)
- All file tools use `isPathBlocked()` from `src/daemon/security/paths.ts`
- **Allowed roots:** home dir, /tmp, /private/tmp, /var/tmp
- **Blocked:** /etc, /usr/bin, /usr/sbin, /System (macOS), /Library (macOS), /boot, /proc, /sys (Linux)
- **Blocked segments:** node_modules/.cache, .git/objects, .git/hooks
- Paths resolved via `realpathSync` (follows symlinks) to prevent symlink escape

### Bash Security (bash tool)
- Execution lease system: risk classification (low/medium/high/critical)
- Critical commands always denied (sudo, rm -rf /, fork bombs, dd /dev, shutdown)
- High-risk non-CLI agents capped at 60s timeout
- Admin scope restricted to CLI agents only
- Audit trail for all allow/deny decisions

### Skill Security (use_skill tool)
- Path traversal blocked: resolved path must start with skill's directory
- Scripts executed via `spawnSync` with args array (no shell)
- Executable permission checked before running scripts

### Webdev Security (webdev tool)
- Git commands via args array (no shell injection)
- Commit hash validated: `/^[0-9a-f]{4,40}$/`
- SQLite readonly mode for SELECT/PRAGMA/EXPLAIN queries

---

## Findings and Issues

### Potential Issues

1. **read_file: No path validation for `isPathAllowed` call** - The tool imports `isPathAllowed` but only uses `isPathBlocked`. The `isPathAllowed` import is unused. Not a security issue since `isPathBlocked` provides equivalent protection, but it's dead code.

2. **search_files: Regex DoS potential** - User-provided regex is compiled directly. Pathological patterns (e.g., `(a+)+$`) could cause catastrophic backtracking. No regex complexity limit.

3. **bash tool: env passthrough** - `process.env` is spread into the child process. While SENSITIVE_KEYS stripping is mentioned in CLAUDE.md, the bash tool does not perform this stripping itself (relies on exec/lease layer).

4. **edit_file: Empty old_string edge case** - The `!oldString` check means an empty string is rejected. This is actually correct since an empty string would match everywhere, but the error message "old_string is required" is misleading.

5. **web_search: HTML parsing fragility** - DuckDuckGo HTML parsing uses regex. Any markup change breaks it. No fallback.

6. **connector tool: Null manager not obvious** - If called before kernel boot completes, returns generic "not available" error. Could be more helpful.

7. **browser tool: seedProfile copies Chrome cookies** - On macOS, copies real Chrome cookies/Login Data to Jeriko's profile. Security trade-off: user convenience vs. agent access to credentials.

8. **webdev execute_sql: No parameterized queries** - SQL is executed as raw string. Since only the agent provides input (not end users), this is acceptable but worth noting.

9. **read_file: Empty file returns "1\t" not "(empty file)"** - When a file is truly empty (0 bytes), `"".split("\n")` yields `[""]` (one element). The tool formats this as `"1\t"` (line 1, empty content). The `|| "(empty file)"` fallback never triggers because the numbered output is always non-empty. Minor UX issue.

10. **memory tool: HOME captured at module load** - `const HOME = process.env.HOME || homedir()` runs once at import time. Changing `process.env.HOME` afterward has no effect on memory file location. This makes the memory tool untestable with HOME override pattern used by other tools (skill, webdev).

### Good Patterns

1. **Consistent error format** - All tools return `JSON.stringify({ok: false, error: msg})` on failure
2. **Path security is thorough** - Symlink resolution, blocked paths, allowed roots
3. **Bash lease system** - Comprehensive risk classification with audit trail
4. **Skill path traversal prevention** - Explicit `startsWith` checks
5. **Output truncation** - Bash (100KB), search (200 chars/line), list (500 files)
6. **Alias system** - Robust with case-insensitive matching, conflict resolution

---

## Tool Count Summary

| # | Tool ID | Aliases Count |
|---|---------|--------------|
| 1 | bash | 6 |
| 2 | read_file | 3 |
| 3 | write_file | 3 |
| 4 | edit_file | 3 |
| 5 | list_files | 5 |
| 6 | search_files | 4 |
| 7 | web_search | 3 |
| 8 | screenshot | 3 |
| 9 | camera | 3 |
| 10 | parallel_tasks | 3 |
| 11 | browser | 3 |
| 12 | delegate | 3 |
| 13 | connector | 32 |
| 14 | use_skill | 3 |
| 15 | webdev | 3 |
| 16 | memory | 3 |

**Total: 16 tools, 79 aliases**
