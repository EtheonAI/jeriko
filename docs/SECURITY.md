# Jeriko Security Model

## Current State

Jeriko's security is **application-level**. There is no kernel-level sandboxing.

### What Exists

| Layer | Mechanism | File |
|-------|-----------|------|
| Env stripping | `SENSITIVE_KEYS` filtered from `jeriko exec` subprocesses | `tools/shell.js` |
| Plugin env isolation | Plugins only receive declared env vars + safe system vars | `lib/plugins.js:buildPluginEnv` |
| AppleScript injection | `escapeAppleScript()` sanitizes all interpolated strings | `lib/cli.js:197` |
| WebSocket auth | HMAC-SHA256 token, timing-safe comparison | `server/auth.js:14` |
| Telegram allowlist | `ADMIN_TELEGRAM_IDS` — deny-all when empty | `server/auth.js:22` |
| Bearer auth | Admin API endpoints require `NODE_AUTH_SECRET` | `server/auth.js:29` |
| Webhook signatures | GitHub, Stripe, raw HMAC — fail-closed | `server/triggers/webhooks.js:65` |
| Plugin trust | Untrusted by default — no webhooks, no prompt injection | `lib/plugins.js:isTrusted` |
| Plugin integrity | SHA-512 hash of manifest, verified on trust ops | `lib/plugins.js:computeIntegrity` |
| Audit logging | All security ops logged, auto-rotated at 2MB | `lib/plugins.js:auditLog` |
| Namespace reservation | 32 core command names blocked from plugins | `lib/plugins.js:RESERVED` |
| Conflict detection | Duplicate namespaces/commands rejected on install | `lib/plugins.js:checkConflicts` |
| NODE_AUTH_SECRET required | Server refuses to start if not set | `server/auth.js:6` |

### What Does NOT Exist

- No kernel-level sandboxing of `jeriko exec` or the AI bash tool
- No seccomp syscall filtering
- No namespace isolation (PID, mount, network, user)
- No cgroup resource limits on AI-spawned processes
- No filesystem scoping — AI can read/write anywhere the user can
- No network restrictions — AI can `curl` anything
- `runBash()` in `server/router.js:253` runs with full `process.env` and user permissions
- `--dangerously-skip-permissions` used in `agent/agent.js:67` and `server/triggers/executor.js:19`

---

## The Exposure

The AI bash tool in `router.js` is the primary attack surface:

```javascript
// server/router.js:253
function runBash(command) {
  const stdout = execSync(command, {
    env: process.env,                    // full environment
    cwd: path.join(__dirname, '..'),     // project root
    timeout: 60000,
    maxBuffer: 1024 * 1024,
  });
  return stdout.slice(0, 10000);
}
```

This function serves the bash tool for all 4 AI backends (Claude Code, Anthropic API, OpenAI, local). Any command the AI generates runs with the same permissions as the Jeriko server process.

**If the AI is tricked, it can do anything the user can do.**

### Prompt Injection Vectors

| Vector | How It Works |
|--------|-------------|
| **Browse** | `jeriko browse --text` pulls arbitrary web content into AI context. Malicious page text becomes part of the prompt. |
| **Email triggers** | Email arrives with crafted content. Trigger fires, AI processes it autonomously. |
| **Webhooks** | External service pushes payload. Data enters AI context via trigger action. |
| **Plugins** | Even with env isolation, plugin command output enters AI context. |
| **Multi-machine** | Compromised hub sends malicious tasks to all connected nodes. |
| **Search** | `jeriko search` returns web results. Crafted snippets enter AI context. |

### Current Mitigation

The user is the perimeter. This works when:
- You are the only user
- You control all inputs
- You review trigger actions before creating them
- You trust the websites you browse

It stops working when triggers, webhooks, or multi-machine routing introduce inputs you didn't personally review.

---

## Target Architecture: Hardened Agent Execution

The AI is an OS process. It must follow **Principle of Least Privilege**. Instead of trusting the AI to not be tricked, make it impossible for a tricked AI to cause damage outside its scope.

### The Model

```
User message
     │
     ▼
  AI Backend (Claude/OpenAI/local)
     │
     ▼ generates bash command
  Governor (validates + scopes)
     │
     ▼
  Micro-Jail (namespaced, cgroup-limited, seccomp-filtered)
     │
     ▼
  Command executes in isolation
     │
     ▼
  stdout captured, returned to AI
```

The Governor creates a fresh sandbox per execution. Even if the AI is tricked, the sandboxed process:
- Cannot see files outside its scope
- Cannot open network sockets (unless explicitly allowed)
- Cannot spawn privileged operations
- Cannot exhaust CPU/RAM (cgroup limits)
- Cannot escape to the host

### Why This Kills Prompt Injection

In the application-level model, injection happens in the AI's logic layer. The AI is tricked and calls `send_email(file='/etc/shadow')`.

In the kernel-level model, defense is at the OS layer:
- **Network namespace**: process has no internet. The send fails at the socket level.
- **Mount namespace**: process cannot see `/etc/shadow`. Only the scoped working directory exists.
- **seccomp**: forbidden syscalls return `EPERM` regardless of what the AI asks for.

The AI doesn't need to be trained to be safe. The OS **forces** it to be safe.

---

## Implementation Levels

### Level 1 — Application Layer (Node.js)

No OS changes required. Implement in `router.js`.

| Control | Implementation |
|---------|---------------|
| Command allowlist | AI bash tool can only run `jeriko *` commands, not arbitrary bash |
| Path scoping | `jeriko fs` operations restricted to declared directories |
| Network disable flag | Trigger-executed commands cannot use `curl`, `wget`, `fetch` |
| Read-only mode | Certain contexts (browse, search) only allow read operations |
| Output size limits | Already exists (10KB cap in `runBash`) |
| Timeout | Already exists (60s in `runBash`, 5min for agent tasks) |

**Difficulty:** Low. Pure JavaScript changes to `runBash()` and `router.js`.

**Limitation:** Application-level controls can be bypassed. A command like `bash -c "..."` or creative piping can escape allowlists. Defense in depth, not a hard boundary.

### Level 2 — OS Layer (Linux Namespaces + cgroups)

Wrap `runBash()` with `unshare` to create kernel-enforced isolation per execution.

| Isolation | Primitive | Effect |
|-----------|-----------|--------|
| Filesystem | `pivot_root` + `mount --bind` | AI sees only a minimal root with the project directory |
| PID | PID namespace | Isolated process tree, cannot signal host processes |
| Network | Network namespace | No network access unless explicitly bridged |
| Resources | cgroups v2 | CPU limit, memory limit, prevents fork bombs |
| Identity | User namespace | AI is "root" inside the jail, "nobody" on the host |

Implementation: a small C or Go wrapper binary that:
1. Calls `unshare(CLONE_NEWPID | CLONE_NEWNS | CLONE_NEWNET | CLONE_NEWUSER)`
2. Bind-mounts the working directory read-only
3. Creates a tmpfs scratch space for writes
4. Drops all capabilities
5. Applies cgroup limits
6. Execs the command
7. Returns stdout

`runBash()` changes from `execSync(command)` to `execSync('micro-jail --scope /project --no-net --timeout 60 -- ' + command)`.

**Difficulty:** Medium. Requires a compiled wrapper binary. Linux only.

**Limitation:** macOS does not have namespaces. macOS equivalent is `sandbox-exec` (limited) or running inside a Linux VM.

### Level 3 — seccomp + Landlock

Fine-grained syscall filtering on top of Level 2.

| Mechanism | Purpose |
|-----------|---------|
| seccomp-bpf | Whitelist specific syscalls. Deny `mount`, `ptrace`, `clone` with dangerous flags, raw networking |
| Landlock | Filesystem access control without root. Scope reads/writes to declared paths only |

Profiles per command type:

| Profile | Allowed | Denied |
|---------|---------|--------|
| `read-only` | `open(O_RDONLY)`, `read`, `stat`, `readdir` | `write`, `unlink`, `rename`, `connect` |
| `local-write` | `open`, `read`, `write`, `stat` within scope | `connect`, `bind`, `sendto` |
| `network` | `open`, `read`, `write`, `connect` | `mount`, `ptrace`, `clone` |
| `full` | Most syscalls | `mount`, `ptrace`, `reboot`, `kexec` |

**Difficulty:** High. Requires deep understanding of Linux syscall surface. Must be tested thoroughly to avoid breaking legitimate tool operations.

### Level 4 — VM Isolation

Strongest isolation. Each execution runs in its own kernel boundary.

| Runtime | Use Case |
|---------|----------|
| Firecracker | Lightweight microVM, <125ms boot, used by AWS Lambda |
| gVisor | User-space kernel, intercepts syscalls, used by Google Cloud Run |
| KVM | Full VM, heaviest but most isolated |

**Difficulty:** Very high. Overkill for personal use. Required if Jeriko becomes multi-tenant or runs untrusted user-submitted code.

---

## Execution Manifest

Every AI bash execution should request a "lease" specifying its scope:

```json
{
  "scope": "/home/user/projects/invoices",
  "capabilities": ["READ", "WRITE"],
  "networking": "DISABLED",
  "maxRuntime": "30s",
  "maxMemory": "256MB",
  "maxCPU": "1 core"
}
```

If the command tries to access a path outside `scope`, the kernel returns `EPERM`. If it tries to open a socket and networking is `DISABLED`, the kernel returns `EACCES`. The AI doesn't need training to respect boundaries — the OS enforces them.

### Manifest Per Context

| Context | Scope | Network | Capabilities |
|---------|-------|---------|-------------|
| `jeriko fs` | Declared path only | Disabled | READ, WRITE |
| `jeriko browse` | tmpdir only | Enabled (target URL only) | READ |
| `jeriko exec` (user CLI) | cwd | Enabled | READ, WRITE, EXEC |
| `jeriko exec` (trigger) | trigger scope | Disabled | READ |
| `jeriko exec` (AI bash tool) | project root | Disabled by default | READ, WRITE |
| Plugin command | plugin dir + declared paths | Per manifest | Per manifest |

---

## Roadmap

### Phase 1 — Now (Application Layer)

- [ ] Command allowlisting in `runBash()` — restrict AI to `jeriko *` commands only
- [ ] Path validation in `jeriko fs` — reject `..` traversal and absolute paths outside project
- [ ] Trigger isolation flag — `selfNotify: true` commands skip AI processing
- [ ] Rate limit bash tool calls per AI turn (already capped at 15 turns)
- [ ] Log all bash tool executions to audit log

### Phase 2 — Next (OS Layer, Linux)

- [ ] Write `micro-jail` wrapper (Go or C) using `unshare` + `pivot_root`
- [ ] Integrate into `runBash()` with fallback to direct exec on macOS
- [ ] cgroup v2 limits: 256MB memory, 1 CPU core, 60s wall time
- [ ] Network namespace: disabled by default, enabled per-command flag
- [ ] Read-only bind mount of project root, tmpfs scratch for writes

### Phase 3 — Future (Deep Isolation)

- [ ] seccomp-bpf profiles per command type
- [ ] Landlock filesystem scoping (kernel 5.13+)
- [ ] Per-plugin sandbox profiles derived from manifest
- [ ] eBPF observability: monitor syscalls, detect anomalies, rate limit dynamically
- [ ] Firecracker/gVisor option for multi-tenant deployment

---

## Platform Reality

| Primitive | Linux | macOS | Windows |
|-----------|-------|-------|---------|
| Namespaces (PID, mount, net, user) | Full | None | None |
| cgroups v2 | Full | None | Job objects (partial) |
| seccomp-bpf | Full | None | None |
| Landlock | Kernel 5.13+ | None | None |
| `sandbox-exec` | None | Deprecated but works | None |
| Firecracker | Full | None | None |
| gVisor | Full | None | None |

**macOS strategy:** Application-level controls (Phase 1) work everywhere. For kernel-level isolation on macOS, the practical option is running Jeriko inside a Linux VM (e.g., OrbStack, Lima, or Docker Desktop's Linux VM). Native macOS sandboxing via `sandbox-exec` is deprecated and limited but functional for basic filesystem scoping.

**Production deployment:** Linux is the target for hardened execution. macOS is for development.

---

## Key Principle

> The AI is not trusted. The AI is not malicious. The AI is **exploitable**.
>
> Any input the AI processes — web pages, emails, webhooks, search results, plugin output — could contain adversarial content designed to make the AI execute unintended commands.
>
> Application-level defenses (allowlists, input validation) reduce risk. Kernel-level isolation (namespaces, seccomp, cgroups) eliminates categories of risk.
>
> Defense in depth: both layers, always.
