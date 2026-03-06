# ADR-001: Unified Task System

**Status:** Proposed
**Date:** 2026-03-06
**Author:** Architecture Review
**Scope:** CLI, Daemon, Channels, Agent Prompt, Relay Protocol, Billing

---

## 1. Context & Problem Statement

The current system has **four disconnected implementations** for automation:

### Current State (Fragmented)

```
                    ┌─────────────────────────────────────────────────┐
                    │              AGENT.md (Vision)                   │
                    │  "Task System — 4 types: trigger, recurring,    │
                    │   cron, once. Each fires an AI action or shell"  │
                    └──────────────────────┬──────────────────────────┘
                                           │ Describes but doesn't match...
         ┌─────────────────┬───────────────┼───────────────┬──────────────┐
         ▼                 ▼               ▼               ▼              ▼
  ┌─────────────┐  ┌─────────────┐ ┌────────────┐ ┌────────────┐ ┌────────────┐
  │ TriggerEngine│  │ task.ts CLI │ │ job.ts CLI │ │ scheduler  │ │ /tasks     │
  │ (engine.ts)  │  │ (JSON files)│ │(JSON files)│ │ routes     │ │ channel cmd│
  │              │  │             │ │            │ │(cron facade)│ │(JSON files)│
  │ SQLite store │  │~/.jeriko/   │ │~/.jeriko/  │ │ over       │ │ same as    │
  │ 5 types      │  │data/tasks/  │ │data/jobs/  │ │ TriggerEng │ │ task.ts    │
  │ Full features│  │ 3 types     │ │ cron only  │ │ Duplicate  │ │ Duplicate  │
  └─────────────┘  └─────────────┘ └────────────┘ └────────────┘ └────────────┘
       │                  │               │              │              │
   Connected to:      Disconnected    Disconnected    Connected     Disconnected
   - Connectors       from daemon     from daemon     (facade)      from daemon
   - Channels         - No agent      - No agent                    - No agent
   - Relay            - No notify     - No notify                   - No notify
   - Billing          - Dup billing   - No billing                  - No billing
   - Agent loop
```

### Specific Problems

1. **Three separate stores**: SQLite (TriggerStore), JSON (tasks/), JSON (jobs/) — data is scattered
2. **Three separate interfaces**: `TriggerConfig`, `TaskDef`, `JobDef` — no shared contract
3. **task.ts is disconnected**: Creates JSON files the daemon never reads. TriggerEngine never sees these "tasks"
4. **job.ts is redundant**: A cron-only scheduler that duplicates TriggerEngine's cron capability
5. **scheduler.ts is redundant**: A cron-only facade over TriggerEngine that duplicates `/triggers?type=cron`
6. **Channel router /tasks is disconnected**: Uses JSON files (same as task.ts), not TriggerEngine
7. **Channel router has BOTH /tasks AND /triggers**: Two commands for overlapping concepts
8. **Billing gates are duplicated**: task.ts copy-pastes billing checks instead of delegating to TriggerEngine
9. **AGENT.md describes a vision** that doesn't match the implementation

### Impact of Current Fragmentation

- User creates a task via `jeriko task create` → JSON file created → daemon knows nothing → no cron scheduling, no webhook routing, no notifications
- User creates a trigger via `/triggers` channel command → TriggerEngine → full lifecycle, notifications, relay — but disconnected from "task" concept
- User creates a job via `jeriko job add` → JSON file created → daemon knows nothing → no scheduling at all
- Three places to look for automation, three mental models, three management surfaces

---

## 2. Decision

**Unify everything under "Task" as the single concept for all automation.**

Task is the first-class citizen. A Task has a type that determines how it fires:
- **trigger** — event-driven (webhook, file watch, email, HTTP polling)
- **schedule** — recurring on a cron expression
- **once** — one-time execution at a specific datetime

All tasks flow through one engine, one store, one CLI surface, one channel command, one API.

### Proposed Architecture (Unified)

```
                    ┌─────────────────────────────────────────────────┐
                    │              AGENT.md (matches reality)          │
                    │  "Task System — 3 types: trigger, schedule,     │
                    │   once. Each fires an AI action or shell cmd"    │
                    └──────────────────────┬──────────────────────────┘
                                           │
              ┌────────────────────────────┼────────────────────────────┐
              ▼                            ▼                            ▼
    ┌──────────────────┐      ┌──────────────────┐      ┌──────────────────┐
    │  jeriko task CLI  │      │  /tasks channel   │      │  /tasks API      │
    │  (IPC → daemon)   │      │  (TaskEngine)     │      │  (HTTP routes)   │
    └────────┬─────────┘      └────────┬─────────┘      └────────┬─────────┘
             │                         │                          │
             └─────────────────────────┼──────────────────────────┘
                                       ▼
                            ┌──────────────────────┐
                            │     TaskEngine        │
                            │  (renamed TriggerEng) │
                            │                       │
                            │  Types:               │
                            │  - trigger (webhook,  │
                            │    file, http, email)  │
                            │  - schedule (cron)     │
                            │  - once (datetime)     │
                            │                       │
                            │  Actions:             │
                            │  - agent (AI prompt)  │
                            │  - shell (command)    │
                            │                       │
                            │  SQLite store         │
                            │  Notifications        │
                            │  Billing gates        │
                            │  Error tracking       │
                            │  Auto-disable         │
                            └──────────┬───────────┘
                                       │
                    ┌──────────────────┼──────────────────┐
                    ▼                  ▼                   ▼
            ┌─────────────┐  ┌──────────────┐  ┌──────────────┐
            │ Connectors  │  │ Channels     │  │ Relay        │
            │ (webhook    │  │ (notify on   │  │ (webhook     │
            │  dispatch)  │  │  task fire)  │  │  routing)    │
            └─────────────┘  └──────────────┘  └──────────────┘
```

---

## 3. Detailed Design

### 3.1 Unified Task Type

```typescript
// src/shared/task.ts (NEW — single source of truth for task types)

export interface Task {
  id: string;
  name: string;                    // Human-readable label (was: label)
  type: "trigger" | "schedule" | "once";
  enabled: boolean;

  // Type-specific configuration
  trigger?: TriggerSpec;           // For type="trigger"
  schedule?: ScheduleSpec;         // For type="schedule"
  once?: OnceSpec;                 // For type="once"

  // Action — what to do when fired
  action: TaskAction;

  // Lifecycle state
  run_count: number;
  error_count: number;
  max_runs?: number;               // 0 = unlimited, once defaults to 1
  last_fired?: string;             // ISO timestamp
  created_at: string;              // ISO timestamp
}

export interface TriggerSpec {
  source: "stripe" | "github" | "paypal" | "twilio" | "gmail" | "outlook"
        | "file" | "http" | "email";
  event?: string;                  // e.g. "charge.failed", "push", "new_email"
  // Source-specific config (same as current WebhookConfig, FileConfig, etc.)
  webhook?: { secret?: string; service?: string };
  file?: { paths: string[]; events?: string[]; debounceMs?: number };
  http?: { url: string; method?: string; headers?: Record<string,string>; intervalMs?: number };
  email?: { connector?: string; user?: string; host?: string; port?: number;
            tls?: boolean; password?: string; mailbox?: string; from?: string;
            subject?: string; intervalMs?: number };
}

export interface ScheduleSpec {
  cron: string;                    // Cron expression
  timezone?: string;
}

export interface OnceSpec {
  at: string;                      // ISO datetime for execution
}

export interface TaskAction {
  type: "agent" | "shell";
  prompt?: string;                 // For agent actions
  command?: string;                // For shell actions
  notify?: boolean;                // Send notification on fire (default: true)
}
```

### 3.2 Mapping: Old Concepts → New

| Old Concept | New Concept | Notes |
|------------|-------------|-------|
| TriggerConfig (type="cron") | Task (type="schedule") | `config.expression` → `schedule.cron` |
| TriggerConfig (type="webhook") | Task (type="trigger", source="stripe"\|...) | `config.service` → `trigger.source` |
| TriggerConfig (type="file") | Task (type="trigger", source="file") | `config.paths` → `trigger.file.paths` |
| TriggerConfig (type="http") | Task (type="trigger", source="http") | `config.url` → `trigger.http.url` |
| TriggerConfig (type="email") | Task (type="trigger", source="email") | `config.connector` → `trigger.email.connector` |
| TaskDef (task.ts) | **DELETE** | Was disconnected from daemon |
| JobDef (job.ts) | **DELETE** | Was disconnected from daemon |
| SchedulerTaskView | **DELETE** | Scheduler routes absorbed |

### 3.3 What Changes Per Layer

#### Layer 1: Shared (`src/shared/`)

| File | Change | Risk |
|------|--------|------|
| **NEW** `task.ts` | New unified Task types | None — new file |
| `relay-protocol.ts` | **NO CHANGE** — wire protocol stays `register_triggers` | None — backward compatible with deployed CF Worker |
| `urls.ts` | **NO CHANGE** — `buildWebhookUrl` works with task IDs | None |

#### Layer 2: Daemon Services (`src/daemon/services/`)

| File | Change | Risk |
|------|--------|------|
| `triggers/engine.ts` | Rename class → `TaskEngine`, accept `Task` type, add "once" handling | Medium — internal rename, tests update |
| `triggers/store.ts` | Rename → `TaskStore`, same SQLite table (add migration for "once") | Low — column add, no data loss |
| `triggers/cron.ts` | **NO CHANGE** — internal implementation stays | None |
| `triggers/webhook.ts` | **NO CHANGE** — internal implementation stays | None |
| `triggers/file-watch.ts` | **NO CHANGE** — internal implementation stays | None |
| `triggers/email.ts` | **NO CHANGE** — internal implementation stays | None |

The directory can optionally be renamed `triggers/` → `tasks/`, but this is cosmetic and can be deferred.

#### Layer 3: Daemon API (`src/daemon/api/`)

| File | Change | Risk |
|------|--------|------|
| `routes/trigger.ts` | Rename → `routes/task.ts`, `/triggers` → `/tasks` | Low |
| `routes/scheduler.ts` | **DELETE** — absorbed into task routes | Low — was a thin facade |
| `routes/webhook.ts` | **NO CHANGE** — webhook delivery stays the same | None |
| `app.ts` | Update route registration | Low |
| `socket.ts` | `triggers` → `tasks`, `trigger_enable` → `task_enable`, etc. | Low |

#### Layer 4: CLI (`src/cli/`)

| File | Change | Risk |
|------|--------|------|
| `commands/automation/task.ts` | **REWRITE** — use IPC to daemon (not JSON files) | Medium — new implementation |
| `commands/automation/job.ts` | **DELETE** — fully absorbed into task.ts | Low |
| `dispatcher.ts` | Remove `job` registration, keep `task` | Low |

#### Layer 5: Channels (`src/daemon/services/channels/`)

| File | Change | Risk |
|------|--------|------|
| `router.ts` `/tasks` | **REWRITE** — use TaskEngine instead of JSON files | Medium |
| `router.ts` `/triggers` | **MERGE** into `/tasks` (keep as alias for transition) | Low |

#### Layer 6: Agent Prompt

| File | Change | Risk |
|------|--------|------|
| `AGENT.md` | Simplify: 3 types (trigger, schedule, once) instead of 4 | Low |

#### Layer 7: Relay Protocol

| Component | Change | Risk |
|-----------|--------|------|
| Wire protocol | **NO CHANGE** — `register_triggers`/`unregister_triggers` stay | None |
| CF Worker | **NO CHANGE** — routes stay the same | None |
| Relay client | **NO CHANGE** — listens for same events | None |

### 3.4 "once" Task Type — New Capability

Currently no system supports one-time scheduled execution properly. Implementation:

```typescript
// In TaskEngine.activateTask():
case "once": {
  const onceSpec = task.once!;
  const fireAt = new Date(onceSpec.at).getTime();
  const now = Date.now();
  const delay = Math.max(0, fireAt - now);

  if (delay > 2_147_483_647) {
    // Beyond setTimeout limit (~24.8 days) — use daily check
    const checker = setInterval(() => {
      if (Date.now() >= fireAt) {
        clearInterval(checker);
        this.executeTaskAction(task).catch(/*...*/);
      }
    }, 86_400_000); // Check daily
    this.onceTimers.set(task.id, checker);
  } else {
    const timer = setTimeout(() => {
      this.executeTaskAction(task).then(() => {
        this.disable(task.id); // Auto-disable after single fire
      }).catch(/*...*/);
    }, delay);
    this.onceTimers.set(task.id, timer);
  }
  break;
}
```

### 3.5 CLI Design — Clean, Consistent

```bash
# Create tasks — 3 types
jeriko task create "Payment Alert"    --trigger stripe:charge.failed --action "notify team"
jeriko task create "Daily Briefing"   --schedule "0 9 * * *"         --action "morning summary"
jeriko task create "Launch Email"     --once "2026-06-01T09:00"      --action "send launch email"
jeriko task create "File Watcher"     --trigger file:change          --path /var/log --action "alert on errors"
jeriko task create "Uptime Monitor"   --trigger http:down            --url https://mysite.com --action "alert"
jeriko task create "Client Reply"     --trigger gmail:new_email      --from "client@co" --action "summarize"

# Manage
jeriko task list                     # All tasks with status
jeriko task info <id>                # Full task details
jeriko task pause <id>               # Disable without deleting
jeriko task resume <id>              # Re-enable
jeriko task delete <id>              # Remove permanently
jeriko task test <id>                # Fire manually (dry run)
jeriko task log [--limit N]          # Recent fire history
jeriko task types                    # List all trigger event types

# Channel commands (Telegram/WhatsApp)
/tasks                               # List all tasks
/task create "name" --trigger ...    # Create
/task pause <id>                     # Disable
/task resume <id>                    # Re-enable
/task delete <id>                    # Remove
/task test <id>                      # Manual fire
```

---

## 4. What Gets Deleted

| File | Reason |
|------|--------|
| `src/cli/commands/automation/job.ts` | Fully absorbed into task.ts — was disconnected duplicate |
| `src/daemon/api/routes/scheduler.ts` | Thin facade over TriggerEngine — absorbed into task routes |
| `~/.jeriko/data/tasks/*.json` | Replaced by SQLite-backed TaskStore |
| `~/.jeriko/data/jobs/*.json` | Replaced by SQLite-backed TaskStore |

**Nothing in the TriggerEngine is deleted** — it's renamed and enhanced.

---

## 5. Migration Strategy

### Phase 1: Internal Unification (No breaking changes)
1. Create `src/shared/task.ts` with unified types
2. Add adapter functions: `Task ↔ TriggerConfig` (bidirectional)
3. Add "once" type to TriggerEngine (new capability, no breakage)
4. Add task-oriented IPC messages to socket.ts (alongside existing trigger messages)

### Phase 2: CLI Rewrite
5. Rewrite `task.ts` to use daemon IPC → TaskEngine (not JSON files)
6. Delete `job.ts`, remove from dispatcher
7. Update channel router `/tasks` to use TaskEngine (not JSON files)

### Phase 3: Rename & Clean
8. Rename TriggerEngine → TaskEngine (internal)
9. Rename trigger.ts routes → task.ts routes
10. Delete scheduler.ts routes
11. Merge `/triggers` channel command into `/tasks` (alias for transition)
12. Update AGENT.md

### Phase 4: Cleanup
13. Remove old IPC message names (after CLI migration)
14. SQLite migration: rename `trigger_config` table → `task` (or keep with alias)
15. Update all tests

---

## 6. Risk Analysis

| Risk | Probability | Impact | Mitigation |
|------|------------|--------|------------|
| Breaking existing triggers | Low | High | Adapter layer ensures TriggerConfig ↔ Task interop |
| Wire protocol breakage | None | Critical | Wire protocol is NOT changed |
| SQLite data loss | None | Critical | Migration adds columns, never drops |
| Test failures | Medium | Medium | Phased approach — tests update per phase |
| Channel router regression | Medium | Medium | `/triggers` kept as alias during transition |

---

## 7. Evidence & Research

### Why "Task" over "Trigger"

1. **Manus, Zapier, n8n, IFTTT** — all use "Task" or "Workflow" as the central concept. Triggers are a PROPERTY of a task, not the task itself.
2. **Mental model**: Users think "I want to automate X" → that's a Task. HOW it fires (cron, webhook, file) is a detail.
3. **AGENT.md already uses "Task"** — the vision doc calls it "Task System" with `jeriko task` commands.
4. **"Trigger" is implementation detail**: A cron schedule isn't a "trigger" in the user's mental model — it's a scheduled task. "Once at datetime" isn't a "trigger" — it's a one-time task.

### Why 3 types, not 4

Current AGENT.md has 4 types: trigger, recurring, cron, once. But "recurring" and "cron" overlap:
- `--recurring daily --at "09:00"` is just cron `0 9 * * *`
- `--recurring weekly --day MON --at "09:00"` is just cron `0 9 * * MON`
- `--every 5m` is just cron `*/5 * * * *`

Having both `--recurring` and `--cron` is sugar, not substance. The CLI can accept `--recurring` as a convenience that generates cron expressions, but internally it's one type: `schedule`.

```
User-facing syntax          →  Internal representation
--recurring daily --at 9:00 →  schedule.cron = "0 9 * * *"
--recurring weekly MON 9:00 →  schedule.cron = "0 9 * * MON"
--every 5m                  →  schedule.cron = "*/5 * * * *"
--cron "0 9 * * MON"        →  schedule.cron = "0 9 * * MON"
```

Three clean types cover everything:
- **trigger**: Something happened → react (webhook, file change, email, HTTP)
- **schedule**: Time-based repetition → execute (cron)
- **once**: Specific moment → execute once (datetime)

---

## 8. Alternatives Considered

### A. Keep TriggerEngine, just fix task.ts to use IPC
- Pros: Less work
- Cons: Still two concepts ("trigger" internally, "task" externally), still have job.ts and scheduler.ts duplication, mental model split persists
- **Rejected**: Violates "never dirty, spaghetti, junior" principle

### B. Keep everything, add translation layer
- Pros: No renames
- Cons: Complexity grows, two names for the same thing, new developers confused
- **Rejected**: Adds complexity instead of removing it

### C. Full rename + unification (this proposal)
- Pros: One concept, one engine, one store, one CLI, one channel command
- Cons: More work upfront, test updates
- **Accepted**: Clean, professional, matches the vision in AGENT.md

---

## 9. Decision Record

**Decision**: Implement Option C — full unification under "Task" as the central concept.

**Rationale**:
- Current fragmentation has 4 disconnected systems, 3 stores, 3 interfaces
- AGENT.md already describes the unified vision — implementation should match
- "Task" is the correct abstraction level for users
- Phased migration ensures zero data loss and backward compatibility
- Wire protocol (relay) is untouched — no CF Worker redeployment needed

**Consequences**:
- `jeriko job` command is removed (zero users affected — it was disconnected)
- `jeriko task` becomes the single automation surface
- `/tasks` and `/triggers` channel commands merge (alias preserved)
- Internal code uses "Task" terminology consistently
- All automation flows through one SQLite-backed engine with full lifecycle
