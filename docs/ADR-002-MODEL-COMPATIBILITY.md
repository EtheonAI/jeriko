# ADR-002: Multi-Model Compatibility, IAR Analysis, Memory System, and Benchmark Framework

**Status:** PROPOSED
**Date:** 2026-03-06
**Author:** Architecture Review
**Scope:** Agent loop, model drivers, orchestrator, memory, cross-platform execution

---

## 1. Context & Problem Statement

Jeriko supports 4 built-in drivers (Anthropic, OpenAI, Local/Ollama, Claude-Code) plus 22 auto-discovered providers via OpenAI-compatible endpoints. The system must work reliably across:

- **Cloud models**: Claude, GPT, Gemini, Grok, Mistral, Command-R, DeepSeek
- **Ollama local**: llama3.2, mistral, qwen2.5, phi3, gemma2, deepseek-coder-v2, command-r, gpt-oss
- **Ollama cloud proxy**: deepseek-v3.1/v3.2, qwen3.5, qwen3-coder, kimi-k2/k2.5, minimax-m2/m2.5, glm-4.6/4.7, gpt-oss:120b
- **OpenRouter/other aggregators**: Any model behind an OpenAI-compatible API

### Questions to Resolve

1. Do all models work with our tool-calling agent loop?
2. Should we add an Intermediate Action Representation (IAR) layer?
3. Is our memory system complete (user behavior tracking)?
4. Should reasoning models be locked from sub-agents?
5. What capabilities are missing from ModelCapabilities (vision, voice, etc.)?
6. How do we benchmark all of this?

---

## 2. Current Architecture Analysis

### 2.1 Agent Loop Flow (agent.ts)

```
User prompt
  → resolveModel(provider, alias)           # alias → real model ID
  → probeLocalModel(modelId)                # Ollama /api/show (if local)
  → getCapabilities(provider, modelId)      # models.dev + probe + cross-ref
  → Build DriverConfig {
      model: resolved,
      max_tokens: min(caps.maxOutput, 16384),
      tools: caps.toolCall ? enabledTools : [],
      extended_thinking: caps.reasoning ? config.extendedThinking : false,
      capabilities: caps
    }
  → driver.chat(messages, config)           # Stream response
  → If tool_calls → execute → loop back
  → If text-only → yield turn_complete
```

**Key insight**: The agent loop already adapts dynamically based on capabilities. Models without tool calling get zero tools — they can only respond with text. This is correct and safe.

### 2.2 Model Capabilities Today

```typescript
interface ModelCapabilities {
  id: string;          // "claude-sonnet-4-6", "llama3.2"
  provider: string;    // "anthropic", "local", "openrouter"
  family: string;      // "claude-sonnet", "llama"
  context: number;     // 200000, 32768
  maxOutput: number;   // 64000, 4096
  toolCall: boolean;   // Can invoke function/tool calls
  reasoning: boolean;  // Has thinking/reasoning mode
  costInput: number;   // USD per 1M tokens
  costOutput: number;
}
```

**What's missing:**
| Capability | Impact | Detection Method |
|-----------|--------|-----------------|
| `vision` | Can process images (screenshots, camera) | models.dev `vision` field |
| `audio` | Can process audio input | models.dev `audio` field (rare) |
| `structuredOutput` | Reliable JSON mode | models.dev or probe |
| `codeExecution` | Native code sandbox | Provider-specific (Gemini, etc.) |
| `maxInputImages` | Image count limit | Provider docs |

### 2.3 Current Tool Inventory (16 tools)

| Tool | Type | OSS Model Impact |
|------|------|-----------------|
| bash | Execution | Core — all models attempt this |
| read_file | Read | Reliable across models |
| write_file | Write | Reliable |
| edit_file | Write | **Fragile** — requires precise diff format |
| list_files | Read | Reliable |
| search_files | Read | Reliable |
| browser | Complex | **Fragile** — multi-param, action enum |
| web_search | Read | Mostly reliable |
| screenshot | Read | Reliable |
| camera | Read | Reliable |
| connector | Complex | Moderate — structured params |
| use_skill | Read | Moderate |
| delegate | Orchestrator | **Requires tool_call** |
| parallel_tasks | Orchestrator | **Requires tool_call** |
| webdev | Complex | Moderate — action enum |
| run_script | Execution | **CodeAct** — write + execute |

### 2.4 Existing Safeguards for OSS Models

The codebase already has several OSS-model accommodations:

1. **parseToolArgs repair** (agent.ts:335-371): Fixes trailing commas, single quotes, unquoted keys, markdown fences, empty strings
2. **Tool aliases** (registry.ts): `exec→bash`, `grep→search_files`, etc.
3. **serializeParentContext** (orchestrator.ts:677-689): Structured text format for sub-agent context (avoids confusing role alternation)
4. **Shared SSE parser** (openai-stream.ts): Flush-on-end for models that don't send `[DONE]`
5. **Cloud model detection** (models.ts:465-469): Passthrough templates enable tools
6. **Family cross-reference** (models.ts:252-268): Ollama models inherit reasoning/context from models.dev

---

## 3. Decision Analysis

### 3.1 Intermediate Action Representation (IAR)

**Question**: Should we add an IAR layer that translates model output into platform-specific commands (bash/zsh, PowerShell, Python)?

**Analysis:**

| Factor | For IAR | Against IAR |
|--------|---------|-------------|
| Cross-platform | Enables Windows support | Jeriko is explicitly "Unix-first" |
| Model reliability | Static checks on IR | Current tool schema already validates |
| Complexity | Clean abstraction | Adds translation layer, new failure modes |
| Current state | N/A | `bash` tool already works on macOS/Linux |
| Sandboxing | Policy at IR level | ExecutionGuard already rate-limits/circuit-breaks |
| CodeAct | Python as universal runtime | `run_script` already supports Python scripts |

**Decision: NO — IAR is not needed.**

**Reasoning (research-backed):**

1. **Jeriko's identity is Unix-first CLI.** The entire command surface (51 commands) assumes `bash`, AppleScript (macOS), and Unix conventions. An IAR would require rewriting every command's output contract.

2. **The real bottleneck is not command format — it's tool calling.** Models that can't do `tool_call` can't invoke ANY tool regardless of format. Adding an IAR doesn't help phi3 or llama3.2:3b — they need text-only fallback.

3. **CodeAct already exists.** The `run_script` tool + `jeriko code` command let models write Python/Node/Bash scripts to `~/.jeriko/workspace/` and execute them. This IS the IAR — the model writes code in its preferred language, and the system executes it.

4. **Static checks belong at the tool level, not an IR level.** The `bash` tool can validate commands. Adding deny-lists and allowed-paths is a security enhancement to the existing `bash` tool, not a new abstraction layer.

5. **Windows is a different product.** Supporting PowerShell would require rewriting every macOS-specific tool (notes, calendar, contacts, music, audio, window management — 12+ commands). This is not a translation problem; it's a platform API problem.

**What to do instead:**
- Enhance `bash` tool with optional deny-list for dangerous commands
- Add `--platform` awareness to `bash` for basic Linux/macOS differences
- Keep CodeAct (run_script) as the universal execution path for complex tasks

### 3.2 Reasoning Models and Sub-Agents

**Question**: Should reasoning models be locked from sub-agents?

**Current behavior:**
- Reasoning models (DeepSeek-R1, o3, QwQ, Kimi-K2-thinking) have `reasoning: true`
- In `openai-compat.ts:169`: `if (tools && !isReasoning)` — tools are disabled for reasoning models
- This means reasoning models CAN'T call `delegate` or `parallel_tasks`
- They CAN'T call ANY tool — they're text-only

**Analysis:**

| Model Type | tool_call | reasoning | Can Use Sub-Agents | Correct? |
|-----------|-----------|-----------|-------------------|----------|
| Claude Sonnet 4.6 | true | true | Yes | Yes — Claude handles both |
| GPT-4o | true | false | Yes | Yes |
| o3 | false* | true | No | **Partially** — o3 supports tools |
| DeepSeek-V3.2 | true | false | Yes | Yes |
| DeepSeek-R1 | false | true | No | Yes — R1 is reasoning-only |
| Kimi-K2-thinking | true | true | **No** (reasoning blocks tools) | **WRONG** |
| Qwen3.5 | true | true | **No** | **WRONG** |

**Problem found**: The `openai-compat.ts` driver blanket-disables tools for ALL reasoning models. But some reasoning models (Kimi-K2, Qwen3) support BOTH reasoning AND tool calling. The Claude driver (anthropic.ts) already handles this correctly — it sends tools even with extended thinking.

**Decision: Fix tool support for reasoning models that also support tool calling.**

The fix is in `openai-compat.ts` — instead of `if (tools && !isReasoning)`, check `if (tools && caps.toolCall)`. The `toolCall` capability is already independently tracked.

### 3.3 Vision, Audio, and Extended Capabilities

**Decision: Add `vision` and `structuredOutput` to ModelCapabilities.**

These directly affect agent behavior:
- **Vision**: If a model has vision, the agent can send screenshots/camera images as input. Without vision, image tools should return text descriptions or be filtered.
- **Structured output**: If a model supports JSON mode, tool call reliability increases significantly.

Audio and code execution are too niche to gate on now.

### 3.4 Memory System

**Current state:**
- `jeriko memory` CLI command exists but has TODOs for KV store write/read
- SQLite `key_value` table exists in the database
- No automatic memory persistence (no MEMORY.md equivalent)
- No user behavior tracking
- No memory injection into system prompt
- Sessions are persisted, but no cross-session learning

**What's needed (ordered by impact):**

| Feature | Priority | Mechanism |
|---------|----------|-----------|
| Agent memory file (`~/.jeriko/memory/MEMORY.md`) | **P0** | Agent reads at session start, writes when it learns preferences |
| KV store integration | **P1** | Wire `jeriko memory set/get` to SQLite key_value table |
| Auto-memory triggers | **P2** | Agent detects preference patterns ("always use bun", "prefer TypeScript") and persists them |
| Memory injection in system prompt | **P0** | Load MEMORY.md contents into system prompt at boot |
| Behavior analytics | **P3** | Track tool usage patterns, error rates, model preferences per user |

**Decision: Implement P0 — agent-level MEMORY.md + system prompt injection.**

The agent should:
1. Read `~/.jeriko/memory/MEMORY.md` at session start (injected into system prompt)
2. Have a `memory` tool to read/write/search the memory file
3. Be instructed in AGENT.md to save user preferences and learned patterns

### 3.5 Model-Specific Adaptations Needed

Based on analysis of each model family's known quirks:

| Model | Tool Call | Reasoning | Known Issues | Adaptation Needed |
|-------|-----------|-----------|-------------|-------------------|
| **Llama 3.2 (3B)** | Partial | No | Tool JSON often malformed, forgets tool schema mid-conversation | parseToolArgs repair (exists). May need tool count limit. |
| **Phi-3 (3.8B)** | No | No | No tool support in template | Text-only mode (correct). |
| **Mistral 7B** | Yes | No | Occasionally invents tool names | Alias resolution (exists). |
| **Qwen 2.5 (7B)** | Yes | No | Reliable tool calling | Works well. |
| **Gemma2 (9B)** | Partial | No | Template supports tools but quality is inconsistent | parseToolArgs repair helps. |
| **DeepSeek-Coder-V2 (16B)** | Yes | No | Strong tool calling, code-focused | Works well. |
| **Command-R (32B)** | Yes | No | Reliable, RAG-optimized | Works well. |
| **GPT-OSS (20B/120B)** | Yes | No | New model, behavior unknown | Need testing. |
| **DeepSeek-V3.1 (671B cloud)** | Yes | No | Excellent tool calling | Works well. |
| **DeepSeek-V3.2 (671B cloud)** | Yes | No | Excellent tool calling | Works well. |
| **Qwen3.5 (397B cloud)** | Yes | Yes | Tools + reasoning together | **Fix needed** (3.2 issue) |
| **Qwen3-Coder (480B cloud)** | Yes | Yes | Code-focused, tools + reasoning | **Fix needed** (3.2 issue) |
| **Kimi-K2-thinking (1T cloud)** | Yes | Yes | Tools + reasoning together | **Fix needed** (3.2 issue) |
| **Kimi-K2.5 (cloud)** | Yes | Yes | Latest Kimi, strong reasoning | **Fix needed** |
| **MiniMax-M2/M2.5 (cloud)** | Unknown | Unknown | New provider, needs probing | Need testing. |
| **GLM-4.6/4.7 (cloud)** | Unknown | Unknown | ChatGLM family | Need testing. |

---

## 4. Implementation Plan

### Phase 1: Fix Reasoning + Tool-Call Coexistence (CRITICAL)

**File:** `src/daemon/agent/drivers/openai-compat.ts`

**Current (line 169):**
```typescript
if (tools && !isReasoning) {
  body.tools = tools;
  body.tool_choice = "auto";
}
```

**Proposed:**
```typescript
// Send tools if the model supports tool calling — even reasoning models.
// The toolCall capability is independently detected by Ollama probe (template)
// and models.dev registry. Some models (Qwen3, Kimi-K2) support BOTH.
if (tools) {
  body.tools = tools;
  body.tool_choice = "auto";
}
```

**Also needed — reasoning models that DO support tools need system prompt handling:**
```typescript
// Reasoning models: only convert system→user if the model doesn't support system role.
// Some reasoning models (Qwen3, Kimi-K2 via Ollama cloud) accept system messages fine.
// The heuristic: if the model supports tool_call, it likely supports system role too.
if (isReasoning && !config.capabilities?.toolCall) {
  for (const msg of converted) {
    if (msg.role === "system") msg.role = "user";
  }
}
```

**Risk**: LOW — this only enables tools for models that already report `toolCall: true` via probe/registry.

### Phase 2: Extend ModelCapabilities

**File:** `src/daemon/agent/drivers/models.ts`

Add to `ModelCapabilities`:
```typescript
/** Supports image/vision input. */
vision: boolean;
/** Supports structured output / JSON mode. */
structuredOutput: boolean;
```

Update `parseRegistry()` to read `vision` and `json_mode`/`structured_output` from models.dev.
Update `probeLocalModel()` — Ollama's /api/show doesn't report vision directly, but the model family cross-ref will inherit it.

**Impact on agent loop**:
- Vision: Gate screenshot/camera tool results — if `!caps.vision`, convert images to text descriptions before sending
- Structured output: Future optimization for tool call reliability

### Phase 3: Agent Memory System

**New files:**
- `src/daemon/agent/tools/memory-tool.ts` — Agent tool to read/write/search MEMORY.md
- Update `src/daemon/agent/agent.ts` — Inject memory into system prompt

**Memory file location:** `~/.jeriko/memory/MEMORY.md`

**Agent tool schema:**
```typescript
{
  name: "memory",
  actions: ["read", "write", "search", "append"],
  // read: returns full MEMORY.md contents
  // write: overwrites a section
  // search: keyword search within memory
  // append: add to a section
}
```

**System prompt injection (AGENT.md addition):**
```markdown
## Memory
You have persistent memory at ~/.jeriko/memory/MEMORY.md.
- Read it at the start of complex tasks to recall user preferences
- Write to it when you learn stable patterns (tool preferences, coding style, project conventions)
- Do NOT save session-specific data — only durable knowledge
```

### Phase 4: Benchmark Framework

**New file:** `test/benchmark/model-benchmark.ts`

**Test matrix (prompts × models × capabilities):**

| Test ID | Prompt | Tests |
|---------|--------|-------|
| B01 | "What's my system info?" | Basic tool call (bash/sys) |
| B02 | "Create a file called test.txt with 'hello world'" | File creation (write_file) |
| B03 | "List all files in the current directory" | File listing (list_files) |
| B04 | "Search for TODO comments in the codebase" | Search (search_files) |
| B05 | "Create a task that runs every 5 minutes to check health" | Trigger creation (complex params) |
| B06 | "Check if Stripe is connected and healthy" | Connector interaction |
| B07 | "Research what's new in Bun 2.0 — use a sub-agent" | Orchestrator (delegate) |
| B08 | "Build me a landing page for a coffee shop" | Webdev (template + code) |
| B09 | "What's 2+2? Just answer." | Text-only (no tool needed) |
| B10 | "Read this screenshot and describe what you see" | Vision (if capable) |

**Benchmark output schema:**
```typescript
interface BenchmarkResult {
  model: string;
  provider: string;
  testId: string;
  prompt: string;
  // Capabilities
  caps: ModelCapabilities;
  // Execution
  toolCallsAttempted: number;
  toolCallsSucceeded: number;
  toolCallsFailed: number;
  // Quality
  taskCompleted: boolean;
  usedCorrectTool: boolean;
  jsonParseRepairs: number;
  aliasResolutions: number;
  // Performance
  timeToFirstToken: number;
  totalDuration: number;
  tokensIn: number;
  tokensOut: number;
  rounds: number;
  // Orchestrator
  subAgentsSpawned: number;
  orchestratorDepth: number;
  // Errors
  errors: string[];
  guardTripped: boolean;
}
```

**Benchmark logging:** Results written to `~/.jeriko/data/benchmarks/<timestamp>.jsonl` — one line per test run. Supports `jeriko benchmark report` to generate comparison tables.

### Phase 5: Sub-Agent Capability Gating

Based on benchmark results, gate sub-agent access dynamically:

```typescript
// In delegate.ts execute():
const caps = getCapabilities(backend, model);

// Models without tool calling can't delegate (they can't call the delegate tool anyway,
// but this is a safety net for future text-based tool parsing)
if (!caps.toolCall) {
  return JSON.stringify({ ok: false, error: "Model does not support tool calling — cannot delegate to sub-agents" });
}

// Small models (< 13B local) should not orchestrate — they lack the context
// to manage multi-step sub-agent workflows reliably
if (caps.provider === "local" && caps.context < 16384) {
  return JSON.stringify({ ok: false, error: "Model context too small for sub-agent orchestration" });
}
```

---

## 5. Model Compatibility Matrix (Expected Outcomes)

### Ollama Local Models

| Model | Params | Tools | Reasoning | Sub-Agent | Expected Quality |
|-------|--------|-------|-----------|-----------|-----------------|
| phi3 | 3.8B | No | No | No | Text-only, basic Q&A |
| llama3.2 | 3.2B | Partial | No | No | Fragile tools, OK for simple tasks |
| mistral | 7.2B | Yes | No | No* | Decent tools, limited context |
| qwen2.5:7b | 7.6B | Yes | No | No* | Good tools, reliable JSON |
| gemma2:9b | 9.2B | Partial | No | No* | Variable tool quality |
| deepseek-coder-v2 | 15.7B | Yes | No | Yes | Strong coding, reliable tools |
| command-r | 32.3B | Yes | No | Yes | Reliable, good for tasks |
| gpt-oss:20b | 20.9B | Yes | No | Yes | Needs testing |

*No sub-agent: Context too small or tools too unreliable for orchestration

### Ollama Cloud Proxy Models

| Model | Tools | Reasoning | Sub-Agent | Expected Quality |
|-------|-------|-----------|-----------|-----------------|
| deepseek-v3.1:671b | Yes | No | Yes | Excellent |
| deepseek-v3.2 | Yes | No | Yes | Excellent |
| qwen3.5:397b | Yes | Yes* | Yes | Excellent (after fix) |
| qwen3-coder:480b | Yes | Yes* | Yes | Excellent (after fix) |
| kimi-k2-thinking | Yes | Yes* | Yes | Excellent (after fix) |
| kimi-k2.5 | Yes | Yes* | Yes | Excellent (after fix) |
| minimax-m2/m2.5 | TBD | TBD | TBD | Needs probing |
| glm-4.6/4.7 | TBD | TBD | TBD | Needs probing |
| gpt-oss:120b | Yes | No | Yes | Needs testing |

*After Phase 1 fix — currently tools blocked by reasoning flag

### OpenRouter / Cloud API

| Model | Tools | Reasoning | Sub-Agent | Notes |
|-------|-------|-----------|-----------|-------|
| Claude Sonnet 4.6 | Yes | Yes | Yes | Gold standard |
| Claude Opus 4.6 | Yes | Yes | Yes | Highest quality |
| GPT-4o | Yes | No | Yes | Reliable |
| GPT-5 | Yes | Yes | Yes | Tools + reasoning |
| Gemini 2.5 Pro | Yes | Yes | Yes | Via Google preset |
| Grok 3 | Yes | No | Yes | Via xAI preset |
| Mistral Large | Yes | No | Yes | Via Mistral preset |
| DeepSeek Chat V3 | Yes | No | Yes | Via DeepSeek preset |
| Llama 3.1 8B (Groq) | Yes | No | No* | Fast but small |
| Command-R+ (Cohere) | Yes | No | Yes | Reliable |

---

## 6. Verification Checklist

Before implementation, verify these assertions:

- [ ] `parseToolArgs` handles all 5 repair cases (trailing commas, single quotes, unquoted keys, markdown fences, empty strings)
- [ ] Tool aliases cover common OSS model mistakes (exec→bash, grep→search_files, etc.)
- [ ] Ollama probe correctly detects tool support from templates
- [ ] Cloud proxy models (`:cloud` suffix) correctly get `toolCall: true`
- [ ] Family cross-reference matches Ollama model names to models.dev entries
- [ ] ExecutionGuard circuit breaker trips after 5 consecutive error rounds
- [ ] Compaction threshold scales with model context window
- [ ] Reasoning models get system→user conversion only when needed
- [ ] Sub-agent depth limit (MAX_DEPTH=2) prevents infinite recursion
- [ ] orchestrator-context re-entrancy works for sequential delegate calls

---

## 7. Risk Assessment

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|-----------|
| Reasoning+tools fix breaks existing models | Low | High | Only enables tools for models with `toolCall: true` |
| Small models overwhelm with tool calls | Medium | Medium | ExecutionGuard + context-based sub-agent gating |
| Memory file grows unbounded | Low | Low | Size cap + compaction in memory tool |
| Benchmark results vary between runs | High | Low | Run 3x per model, report median |
| New Ollama cloud models have unknown capabilities | Medium | Low | Cross-reference + safe fallbacks |

---

## 8. Summary of Decisions

| # | Decision | Rationale |
|---|----------|-----------|
| 1 | **NO IAR layer** | Adds complexity without solving the real problem (tool_call support). CodeAct via run_script IS the universal execution path. Unix-first by design. |
| 2 | **Fix reasoning+tools coexistence** | Kimi-K2, Qwen3, and other dual-capability models are currently broken. The fix is minimal and safe. |
| 3 | **Add vision + structuredOutput to ModelCapabilities** | Enables intelligent tool gating (don't send images to blind models). |
| 4 | **Implement agent MEMORY.md** | Critical gap — no cross-session learning. Users must re-explain preferences every session. |
| 5 | **Build benchmark framework** | Needed to validate all of the above. Can't optimize what we can't measure. |
| 6 | **Gate sub-agents by model capability** | Prevent small/weak models from attempting orchestration they can't handle. |
| 7 | **Enhance bash tool with deny-list** | Security improvement — restrict dangerous commands at the tool level, not an IR level. |

---

## Appendix A: File Map

| File | Role | Changes Needed |
|------|------|---------------|
| `src/daemon/agent/agent.ts` | Agent loop | Memory injection, vision gating |
| `src/daemon/agent/orchestrator.ts` | Sub-agent orchestration | No changes |
| `src/daemon/agent/guard.ts` | Execution safety | No changes |
| `src/daemon/agent/drivers/models.ts` | Model registry | Add vision, structuredOutput |
| `src/daemon/agent/drivers/openai-compat.ts` | Custom providers | Fix reasoning+tools |
| `src/daemon/agent/drivers/local.ts` | Ollama driver | No changes |
| `src/daemon/agent/drivers/openai-stream.ts` | SSE parser | No changes |
| `src/daemon/agent/drivers/presets.ts` | Provider presets | No changes |
| `src/daemon/agent/tools/delegate.ts` | Delegate tool | Add capability gating |
| `src/daemon/agent/tools/registry.ts` | Tool registry | No changes |
| `src/daemon/agent/tools/memory-tool.ts` | **NEW** — Memory tool | Create |
| `test/benchmark/model-benchmark.ts` | **NEW** — Benchmark | Create |
| `AGENT.md` | System prompt | Add memory instructions |

## Appendix B: Ollama Models Available for Testing

```
LOCAL (on-device):
  phi3:latest            3.8B   Q4_0    — text-only baseline
  llama3.2:latest        3.2B   Q4_K_M  — smallest tool-call attempt
  mistral:latest         7.2B   Q4_K_M  — reliable tools
  qwen2.5:7b            7.6B   Q4_K_M  — reliable tools
  gemma2:9b             9.2B   Q4_0    — partial tools
  deepseek-coder-v2     15.7B  Q4_0    — strong code + tools
  command-r             32.3B  Q4_0    — reliable general
  gpt-oss:20b           20.9B  MXFP4   — needs testing

CLOUD PROXY (Ollama → remote API):
  deepseek-v3.1:671b-cloud     FP8     — excellent
  deepseek-v3.2:cloud          FP8     — excellent
  qwen3.5:cloud         397B            — tools+reasoning (BLOCKED by bug)
  qwen3-coder:480b-cloud       BF16    — tools+reasoning (BLOCKED by bug)
  kimi-k2-thinking:cloud 1T    INT4    — tools+reasoning (BLOCKED by bug)
  kimi-k2.5:cloud                       — tools+reasoning (BLOCKED by bug)
  minimax-m2:cloud      230B   FP8     — unknown capabilities
  minimax-m2.5:cloud                    — unknown capabilities
  glm-4.6:cloud         355B   FP8     — unknown capabilities
  glm-4.7:cloud                         — unknown capabilities
  gpt-oss:120b-cloud            MXFP4   — needs testing
```
