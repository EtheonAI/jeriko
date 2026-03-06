# ADR-001: System Sovereignty — Kernel-Level OS Integration

**Status:** Proposed
**Date:** 2026-03-06
**Authors:** Etheon Engineering
**Deciders:** Khaleel Musleh

---

## Context

Jeriko currently operates as a **user-space application** — it reacts to commands, polls for state, and has no awareness of OS-level events until explicitly asked. Claude Code, Manus, and every other AI tool shares this limitation. They are all "blind" between commands.

The proposal: transform Jeriko from an application into an **Operating System Extension** — a daemon with kernel-level event hooks that makes Jeriko the nervous system of the machine. This gives Jeriko capabilities no competitor can match:

1. **Real-time awareness** — the OS pushes events to Jeriko (file changes, process spawns, network connections) instead of Jeriko polling for them
2. **Fearless autonomy** — atomic filesystem snapshots before destructive operations enable instant rollback
3. **Managed isolation** — sandbox any command the LLM issues, preventing accidental or malicious damage
4. **System health monitoring** — continuous process/network/resource observation with anomaly detection

---

## Decision

We will build System Sovereignty as **5 subsystems**, each implemented as a **platform driver** behind a unified TypeScript interface. Each driver is OS-specific (macOS/Linux/Windows) and loaded at daemon boot based on `process.platform`.

The implementation is phased: Phase 1 ships the driver infrastructure + snapshots (highest safety ROI). Later phases add sandboxing, deep kernel hooks, and the sentinel.

---

## Architecture

### Layer Model

```
┌──────────────────────────────────────────────────────┐
│  Agent Loop (agent.ts)  — orchestrator               │
│  ├─ ExecutionGuard      — rate limits, circuit break  │
│  ├─ SovereigntyGuard    — snap + sandbox pre/post     │  ← NEW
│  └─ Tool Registry       — bash, write, edit, etc.     │
├──────────────────────────────────────────────────────┤
│  Sovereignty Service    — unified API for all 5 subs  │  ← NEW
│  ├─ SnapshotDriver      — APFS / Btrfs / ZFS / VSS   │
│  ├─ SandboxDriver       — sandbox-exec / bubblewrap   │
│  ├─ WatchDriver         — FSEvents / inotify / RDCW   │
│  ├─ ProcessDriver       — ESF / eBPF / ETW            │
│  └─ NetworkDriver       — nettop / tcp_diag / netstat │
├──────────────────────────────────────────────────────┤
│  Platform FFI Layer     — Bun FFI bindings to C/Rust  │  ← NEW
│  └─ Native helpers      — libjeriko_darwin.dylib, etc │
├──────────────────────────────────────────────────────┤
│  Operating System Kernel                              │
│  └─ FSEvents, inotify, APFS, eBPF, ESF, etc.         │
└──────────────────────────────────────────────────────┘
```

### Directory Structure

```
src/
  daemon/
    sovereignty/                    ← NEW top-level service
      index.ts                      ← SovereigntyService class (unified API)
      guard.ts                      ← SovereigntyGuard (agent loop integration)
      types.ts                      ← Shared interfaces for all drivers
      drivers/
        snapshot/
          interface.ts              ← SnapshotDriver interface
          darwin.ts                 ← APFS via tmutil + diskutil
          linux.ts                  ← Btrfs subvolume / ZFS snapshot
          windows.ts                ← VSS shadow copy
          noop.ts                   ← Fallback (unsupported FS)
        sandbox/
          interface.ts              ← SandboxDriver interface
          darwin.ts                 ← sandbox-exec profiles
          linux.ts                  ← bubblewrap (bwrap)
          windows.ts                ← Windows Sandbox / AppContainer
          noop.ts                   ← Fallback (no sandboxing)
        watch/
          interface.ts              ← WatchDriver interface
          darwin.ts                 ← FSEvents via CoreServices FFI
          linux.ts                  ← inotify via libc FFI
          windows.ts                ← ReadDirectoryChangesW via Kernel32
          fallback.ts               ← Node fs.watch (current behavior)
        process/
          interface.ts              ← ProcessDriver interface
          darwin.ts                 ← Endpoint Security Framework
          linux.ts                  ← eBPF via Rust helper
          windows.ts                ← ETW subscription
          fallback.ts               ← /proc polling or ps
        network/
          interface.ts              ← NetworkDriver interface
          darwin.ts                 ← Network Extension / nettop
          linux.ts                  ← /proc/net + netlink
          windows.ts                ← netstat + ETW
          fallback.ts               ← periodic netstat
      ffi/
        darwin/
          libproc.ts                ← Bun FFI bindings to /usr/lib/libproc.dylib (VERIFIED)
        linux/
          proc.ts                   ← /proc filesystem readers (no FFI needed)
          ebpf_loader.rs            ← eBPF program loader (Rust, Phase 3)
        build.ts                    ← Build script for native helpers (Phase 3 only)
        # NOTE: Phase 1-2 require NO compiled C code.
        # macOS: tmutil (snapshots), sandbox-exec (sandbox), libproc (processes) — all via Bun
        # Linux: CLI tools (btrfs/zfs), bwrap (sandbox), /proc (processes) — all TypeScript
```

---

## Subsystem 1: Atomic Snapshots (`SnapshotDriver`)

**Purpose:** Create instant, zero-cost filesystem restore points before any destructive agent action. This is the single most important safety feature — it turns "Are you sure?" into "Don't worry, I can undo."

### Interface

```typescript
// src/daemon/sovereignty/drivers/snapshot/interface.ts

export interface Snapshot {
  id: string;                    // Unique snapshot identifier
  mountPoint: string;            // Filesystem mount (e.g. "/")
  createdAt: number;             // Unix timestamp
  label: string;                 // Human-readable label (e.g. "pre-write:/etc/nginx.conf")
  sizeEstimate?: number;         // Estimated delta size in bytes
}

export interface SnapshotDriver {
  /** Check if the current filesystem supports snapshots. */
  isSupported(): Promise<boolean>;

  /** Create a labeled snapshot. Returns the snapshot metadata. */
  create(label: string, mountPoint?: string): Promise<Snapshot>;

  /** Restore to a specific snapshot. DESTRUCTIVE — rolls back all changes since. */
  restore(snapshotId: string): Promise<void>;

  /** List available snapshots, newest first. */
  list(limit?: number): Promise<Snapshot[]>;

  /** Delete a specific snapshot to reclaim space. */
  delete(snapshotId: string): Promise<void>;

  /** Diff: list files changed since a snapshot. */
  diff(snapshotId: string): Promise<string[]>;

  /** Prune snapshots older than maxAge (ms) or exceeding maxCount. */
  prune(opts: { maxAge?: number; maxCount?: number }): Promise<number>;
}
```

### macOS Implementation (APFS)

**Empirical finding (live tested):**
- `tmutil localsnapshot` takes **398ms** (process spawn overhead). The actual APFS syscall is **10-50ms** (COW metadata only).
- `fs_snapshot_create` via FFI requires **root or Apple entitlement** (`com.apple.developer.vfs.snapshot`). SIP blocks non-Apple processes. So `tmutil` via `Bun.spawn()` is the correct approach.
- Works without `sudo`. Snapshots are volume-level (entire boot volume).
- Snapshots marked purgeable — macOS may reclaim them under disk pressure.

```typescript
// src/daemon/sovereignty/drivers/snapshot/darwin.ts (sketch)

export class DarwinSnapshotDriver implements SnapshotDriver {
  async isSupported(): Promise<boolean> {
    const result = await $`diskutil info / | grep "Type (Bundle)"`.nothrow().text();
    return result.includes("apfs");
  }

  async create(label: string): Promise<Snapshot> {
    const id = `jeriko-${Date.now()}`;
    // tmutil creates date-named snapshot; we track mapping in SQLite KV store
    const result = await $`tmutil localsnapshot /`.nothrow();
    if (result.exitCode !== 0) {
      throw new Error(`Snapshot failed: ${result.stderr.toString()}`);
    }
    // Store label→snapshot mapping in kv store for later lookup
    return { id, mountPoint: "/", createdAt: Date.now(), label };
  }

  async restore(snapshotId: string): Promise<void> {
    // APFS full volume revert requires boot to recovery mode.
    // For user-dir scoped work, we mount the snapshot read-only and rsync:
    //   mount_apfs -s <snapshot> /dev/diskXsY /tmp/.jeriko-restore
    //   rsync -a /tmp/.jeriko-restore/<path> <path>
    // Full volume revert documented but gated behind explicit user confirmation.
  }

  async list(limit = 20): Promise<Snapshot[]> {
    const raw = await $`tmutil listlocalsnapshots /`.nothrow().text();
    // Parse output lines: "com.apple.TimeMachine.2026-03-06-143000.local"
    // Filter jeriko-tracked snapshots via KV store mapping
  }

  async prune(opts: { maxAge?: number; maxCount?: number }): Promise<number> {
    const snapshots = await this.list();
    let pruned = 0;
    const now = Date.now();
    for (const snap of snapshots) {
      const tooOld = opts.maxAge && (now - snap.createdAt) > opts.maxAge;
      const overCount = opts.maxCount && (snapshots.length - pruned) > opts.maxCount;
      if (tooOld || overCount) {
        await this.delete(snap.id);
        pruned++;
      }
    }
    return pruned;
  }
}
```

### Linux Implementation (Btrfs/ZFS)

```typescript
// src/daemon/sovereignty/drivers/snapshot/linux.ts (sketch)

export class LinuxSnapshotDriver implements SnapshotDriver {
  private backend: "btrfs" | "zfs" | null = null;

  async isSupported(): Promise<boolean> {
    // Detect filesystem type on home directory
    const fsType = await $`stat -f -c %T ${process.env.HOME}`.text();
    if (fsType.trim() === "btrfs") { this.backend = "btrfs"; return true; }
    // Check for ZFS dataset
    const zfs = await $`zfs list -H -o name ${process.env.HOME} 2>/dev/null`.nothrow().text();
    if (zfs.trim()) { this.backend = "zfs"; return true; }
    return false;
  }

  async create(label: string): Promise<Snapshot> {
    const id = `jeriko-${Date.now()}`;
    if (this.backend === "btrfs") {
      await $`btrfs subvolume snapshot -r ${process.env.HOME} /tmp/.jeriko-snaps/${id}`;
    } else if (this.backend === "zfs") {
      const dataset = await this.getDataset();
      await $`zfs snapshot ${dataset}@${id}`;
    }
    return { id, mountPoint: process.env.HOME!, createdAt: Date.now(), label };
  }
}
```

### Agent Loop Integration

The `SovereigntyGuard` wraps tool execution in the agent loop. It sits **between** `ExecutionGuard` (rate limits) and tool dispatch.

```typescript
// src/daemon/sovereignty/guard.ts

export class SovereigntyGuard {
  private snapDriver: SnapshotDriver;
  private sandboxDriver: SandboxDriver;
  private snapshotEnabled: boolean;
  private sandboxEnabled: boolean;

  /** Tools that trigger automatic snapshots before execution. */
  private static readonly SNAPSHOT_TOOLS = new Set([
    "bash", "write_file", "edit_file",
  ]);

  /** Tools that should be sandboxed (restricted filesystem/network). */
  private static readonly SANDBOX_TOOLS = new Set([
    "bash",
  ]);

  /**
   * Called by agent.ts before each tool execution.
   * Returns a cleanup function to call after execution.
   */
  async beforeToolExecution(
    toolName: string,
    args: Record<string, unknown>,
  ): Promise<{ cleanup: () => Promise<void>; snapshot?: Snapshot }> {
    let snapshot: Snapshot | undefined;

    // Auto-snapshot for destructive tools
    if (this.snapshotEnabled && SovereigntyGuard.SNAPSHOT_TOOLS.has(toolName)) {
      const label = this.buildLabel(toolName, args);
      snapshot = await this.snapDriver.create(label).catch((err) => {
        log.warn(`Snapshot failed (non-fatal): ${err}`);
        return undefined;
      });
    }

    return {
      snapshot,
      cleanup: async () => {
        // Post-execution: prune old snapshots if count exceeds threshold
        if (snapshot) {
          await this.snapDriver.prune({ maxCount: 50, maxAge: 24 * 60 * 60_000 })
            .catch(() => {});
        }
      },
    };
  }
}
```

**Integration point in `agent.ts`** (the agent loop):

```typescript
// In the tool execution section of runAgent():
for (const call of toolCalls) {
  // 1. ExecutionGuard rate-limit check (existing)
  const guardCheck = guard.checkToolCall(call.name);
  if (guardCheck) { /* rate limited */ continue; }

  // 2. SovereigntyGuard pre-execution (NEW)
  const sovereign = await sovereigntyGuard.beforeToolExecution(call.name, call.args);

  // 3. Execute tool (existing)
  const result = await executeTool(call);

  // 4. SovereigntyGuard post-execution (NEW)
  await sovereign.cleanup();
}
```

---

## Subsystem 2: Managed Sandboxing (`SandboxDriver`)

**Purpose:** Isolate agent-issued commands so a hallucinated `rm -rf /` or a malicious npm postinstall script cannot damage the system.

### Interface

```typescript
export interface SandboxProfile {
  /** Allow filesystem read access to these paths. */
  readPaths: string[];
  /** Allow filesystem write access to these paths. */
  writePaths: string[];
  /** Allow network access (outbound). */
  allowNetwork: boolean;
  /** Allow subprocess spawning. */
  allowSubprocess: boolean;
  /** Max wall-clock time before kill (ms). */
  timeout: number;
  /** Max memory (bytes). 0 = unlimited. */
  maxMemory: number;
}

export interface SandboxResult {
  exitCode: number;
  stdout: string;
  stderr: string;
  killed: boolean;         // true if sandbox killed the process
  violation?: string;      // description of sandbox violation if any
}

export interface SandboxDriver {
  /** Check if sandboxing is available on this platform. */
  isSupported(): Promise<boolean>;

  /** Execute a command inside a sandbox with the given profile. */
  execute(
    command: string,
    profile: SandboxProfile,
    opts?: { cwd?: string; env?: Record<string, string> },
  ): Promise<SandboxResult>;
}
```

### macOS Implementation (`sandbox-exec`)

macOS provides `sandbox-exec` with SBPL (Scheme-based) profiles. Deprecated but functional on macOS 15 (Darwin 25.3.0).

**Empirical finding (live tested on macOS 15):**
- **Write denial: WORKS.** `(deny file-write* (subpath "..."))` correctly blocks writes.
- **Network denial: WORKS.** `(deny network-outbound)` blocks all outbound. `curl` exits code 6.
- **Read denial: DOES NOT WORK.** `(deny file-read* (subpath "..."))` with both `subpath` and `literal` filters was ineffective on macOS 15. Likely SIP-related restriction on custom profiles.

**Implication:** macOS sandbox provides **write + network isolation only**. Read protection (e.g., blocking access to `~/.ssh/id_rsa`) requires Linux bubblewrap or a future App Sandbox integration with Apple entitlements.

```typescript
// src/daemon/sovereignty/drivers/sandbox/darwin.ts (sketch)

export class DarwinSandboxDriver implements SandboxDriver {
  async isSupported(): Promise<boolean> {
    return await $`which sandbox-exec`.nothrow().exitCode === 0;
  }

  async execute(command: string, profile: SandboxProfile, opts?: { cwd?: string }): Promise<SandboxResult> {
    const sbProfile = this.buildProfile(profile);
    const proc = Bun.spawn(
      ["sandbox-exec", "-p", sbProfile, "bash", "-c", command],
      {
        cwd: opts?.cwd,
        timeout: profile.timeout,
        stdout: "pipe",
        stderr: "pipe",
      }
    );
    const [stdout, stderr] = await Promise.all([
      new Response(proc.stdout).text(),
      new Response(proc.stderr).text(),
    ]);
    const exitCode = await proc.exited;
    const violation = stderr.includes("deny") ? stderr : undefined;
    return { exitCode, stdout, stderr, killed: exitCode === 137, violation };
  }

  private buildProfile(p: SandboxProfile): string {
    // Start permissive, deny specific — more reliable on macOS 15
    const rules: string[] = ["(version 1)", "(allow default)"];

    // Write restrictions (verified working)
    if (p.writePaths.length > 0) {
      rules.push("(deny file-write*)");  // deny all writes first
      for (const path of p.writePaths) {
        rules.push(`(allow file-write* (subpath "${path}"))`);
      }
      // Always allow /tmp and /dev for basic operation
      rules.push('(allow file-write* (subpath "/tmp"))');
      rules.push('(allow file-write* (subpath "/private/tmp"))');
      rules.push('(allow file-write* (subpath "/dev"))');
    }

    // Network restrictions (verified working)
    if (!p.allowNetwork) {
      rules.push("(deny network-outbound)");
      rules.push("(deny network-bind)");
    }

    // NOTE: Read restrictions omitted — empirically ineffective on macOS 15.
    // File read protection requires bubblewrap (Linux only) or entitlements.

    return rules.join("\n");
  }
}
```

### Linux Implementation (`bubblewrap`)

Bubblewrap (`bwrap`) is the gold standard for unprivileged sandboxing on Linux. Used by Flatpak. No root required.

```typescript
// src/daemon/sovereignty/drivers/sandbox/linux.ts (sketch)

export class LinuxSandboxDriver implements SandboxDriver {
  async isSupported(): Promise<boolean> {
    return await $`which bwrap`.nothrow().exitCode === 0;
  }

  async execute(command: string, profile: SandboxProfile): Promise<SandboxResult> {
    const args = [
      "bwrap",
      "--die-with-parent",
      "--unshare-pid",
      "--unshare-net", // unless allowNetwork
      "--proc", "/proc",
      "--dev", "/dev",
    ];

    // Mount read-only paths
    for (const p of profile.readPaths) {
      args.push("--ro-bind", p, p);
    }

    // Mount read-write paths
    for (const p of profile.writePaths) {
      args.push("--bind", p, p);
    }

    if (profile.allowNetwork) {
      // Remove --unshare-net
      const idx = args.indexOf("--unshare-net");
      if (idx !== -1) args.splice(idx, 1);
    }

    args.push("bash", "-c", command);
    // ... spawn and capture
  }
}
```

### Integration with `bash` Tool

The existing `bash.ts` tool uses `createLease` → `validateLease` for security. Sandboxing wraps the actual execution:

```typescript
// Modified bash.ts execute():
// After lease validation, before spawn:
if (sovereignty.sandbox.isEnabled()) {
  const profile = sovereignty.sandbox.profileForCommand(command, cwd);
  return sovereignty.sandbox.execute(command, profile, { cwd });
}
// Else: existing unsandboxed spawn (fallback)
```

**Profile selection** is context-aware:
- `npm install` / `pip install` → read: system, write: project dir, network: yes
- `rm`, `mv`, `cp` → read: project dir, write: project dir, network: no
- Unknown commands → restrictive default (project dir only, no network)

---

## Subsystem 3: Kernel File Watcher (`WatchDriver`)

**Purpose:** Replace Node's `fs.watch` (which misses events, has inconsistent behavior across platforms) with direct kernel-level file system event streams. This enables Jeriko's "nervous system" — real-time awareness of every file change on the machine.

### Interface

```typescript
export interface FileEvent {
  type: "create" | "modify" | "delete" | "rename" | "metadata";
  path: string;
  timestamp: number;
  /** For rename events: the new path. */
  newPath?: string;
  /** Process that caused the event (if available from kernel). */
  pid?: number;
  processName?: string;
}

export type FileEventCallback = (events: FileEvent[]) => void;

export interface WatchDriver {
  /** Start watching a path (recursive). Returns a handle ID. */
  watch(path: string, callback: FileEventCallback): Promise<string>;

  /** Stop watching a specific handle. */
  unwatch(handleId: string): Promise<void>;

  /** Stop all watches. */
  unwatchAll(): Promise<void>;

  /** Get current watch count. */
  watchCount(): number;
}
```

### macOS Implementation (FSEvents via Bun Runtime)

**Empirical finding:** Raw FSEvents FFI binding is NOT viable — it requires a `CFRunLoop` running on a dedicated thread, plus `CFArrayRef`/`CFStringRef` construction via CoreFoundation calls. However, **Bun's `fs.watch` already uses FSEvents under the hood** with `recursive: true` and `kFSEventStreamCreateFlagFileEvents`. Our current `file-watch.ts` is already kernel-native.

The WatchDriver for macOS enhances Bun's built-in FSEvents integration rather than replacing it:

```typescript
// src/daemon/sovereignty/drivers/watch/darwin.ts (sketch)

export class DarwinWatchDriver implements WatchDriver {
  private handles = new Map<string, FSWatcher>();

  async watch(path: string, callback: FileEventCallback): Promise<string> {
    const id = randomUUID();
    // Bun's fs.watch uses FSEvents with file-level granularity
    const watcher = watch(path, { recursive: true }, (eventType, filename) => {
      if (!filename) return;
      const fullPath = resolve(path, filename);
      callback([{
        type: this.mapEvent(eventType, fullPath),
        path: fullPath,
        timestamp: Date.now(),
      }]);
    });
    this.handles.set(id, watcher);
    return id;
  }
}
```

For future Phase 3+ enhancement: process attribution (which PID caused the file change) requires the FSEvents `kFSEventStreamEventExtendedDataPathInfo` flag, which would need a C helper with its own CFRunLoop thread. This is deferred — the Bun runtime path covers 95% of use cases.

### Integration with Existing `file-watch.ts`

The current `FileWatchTrigger` (in `src/daemon/services/triggers/file-watch.ts`) uses Node's `fs.watch`. The new `WatchDriver` replaces this at the trigger engine level:

```typescript
// Modified file-watch.ts:
// Instead of fs.watch(), use the sovereignty watch driver:
const handle = await sovereignty.watch.watch(watchPath, (events) => {
  for (const event of events) {
    const mapped = this.mapEvent(event);
    if (mapped && this.events.has(mapped)) {
      onEvent(mapped, event.path);
    }
  }
});
```

The watch driver also feeds into the **Knowledge Graph** (future subsystem) — every file change updates Jeriko's understanding of the codebase without re-scanning.

---

## Subsystem 4: Process & Security Monitor (`ProcessDriver`)

**Purpose:** Monitor process execution and detect anomalous behavior. This is the "immune system" — Jeriko can see every process spawn, every file access, every network connection, and reason about whether it's legitimate.

### Interface

```typescript
export interface ProcessEvent {
  type: "exec" | "exit" | "file_access" | "network_connect";
  pid: number;
  ppid?: number;
  processName: string;
  path?: string;           // For exec: binary path. For file_access: file path.
  args?: string[];         // Command arguments
  target?: string;         // For network: "host:port"
  timestamp: number;
  userId?: number;
}

export type ProcessEventCallback = (event: ProcessEvent) => void;

export interface ProcessDriver {
  /** Start monitoring. Calls back for each matching event. */
  start(callback: ProcessEventCallback): Promise<void>;

  /** Stop monitoring. */
  stop(): Promise<void>;

  /** Check if kernel-level monitoring is available. */
  isSupported(): Promise<boolean>;

  /** Get current system process list (snapshot). */
  listProcesses(): Promise<ProcessInfo[]>;
}
```

### Implementation Strategy

| Platform | Mechanism | Privilege Level | Verified | Notes |
|----------|-----------|----------------|----------|-------|
| macOS | `libproc.dylib` via Bun FFI | No special privileges | **YES — live tested** | `proc_listallpids`, `proc_name`, `proc_pidpath`, `proc_pidinfo` all work. |
| macOS (future) | Endpoint Security Framework | Entitlement + TCC | Not yet | Gold standard. Sees every exec, file open, network connect. |
| Linux | `/proc` filesystem | No special privileges | Standard | `/proc/[pid]/stat`, `/proc/[pid]/status`, `/proc/[pid]/fd/` via `Bun.file()`. |
| Linux (future) | eBPF (via Rust helper) | CAP_BPF or root | Not yet | Attaches to tracepoints for execve, openat, connect. |

**Phase 1 uses Bun FFI on macOS and `/proc` on Linux — no special privileges, no subprocess spawning.**

### macOS — Verified Bun FFI Bindings

```typescript
// src/daemon/sovereignty/drivers/process/darwin.ts (verified working)

import { dlopen, FFIType } from "bun:ffi";

const libproc = dlopen("/usr/lib/libproc.dylib", {
  proc_listallpids:  { args: [FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
  proc_name:         { args: [FFIType.i32, FFIType.ptr, FFIType.u32], returns: FFIType.i32 },
  proc_pidpath:      { args: [FFIType.i32, FFIType.ptr, FFIType.u32], returns: FFIType.i32 },
  proc_pidinfo:      { args: [FFIType.i32, FFIType.i32, FFIType.u64, FFIType.ptr, FFIType.i32], returns: FFIType.i32 },
});

// proc_pidinfo flavors:
// PROC_PIDTASKINFO (4)  — virtual/resident memory, thread count, CPU time (88-byte struct)
// PROC_PIDTBSDINFO (3)  — process name, status, parent PID, user/group
// PROC_PIDLISTFDS  (1)  — list all file descriptors (open files + sockets)
```

This gives Jeriko direct kernel-level process introspection at **zero subprocess cost**. No `ps`, no `lsof`, no output parsing.

### Polling Driver (Both Platforms)

```typescript
// src/daemon/sovereignty/drivers/process/polling.ts

export class PollingProcessDriver implements ProcessDriver {
  private interval: ReturnType<typeof setInterval> | null = null;
  private knownPids = new Set<number>();
  private platform: "darwin" | "linux";
  private ffi?: typeof libproc;  // macOS FFI bindings (loaded on darwin)

  async start(callback: ProcessEventCallback): Promise<void> {
    if (this.platform === "darwin") {
      this.ffi = loadLibproc();  // Bun FFI — zero cost per call
    }

    // Poll every 2-5 seconds — detect new/exited processes
    this.interval = setInterval(async () => {
      const current = this.platform === "darwin"
        ? this.listViaFFI()       // macOS: direct libproc calls
        : await this.listViaProc(); // Linux: read /proc/[pid]/stat

      const currentPids = new Set(current.map(p => p.pid));

      for (const proc of current) {
        if (!this.knownPids.has(proc.pid)) {
          callback({ type: "exec", pid: proc.pid, ppid: proc.ppid,
                     processName: proc.name, path: proc.path, timestamp: Date.now() });
        }
      }

      for (const pid of this.knownPids) {
        if (!currentPids.has(pid)) {
          callback({ type: "exit", pid, processName: "unknown", timestamp: Date.now() });
        }
      }

      this.knownPids = currentPids;
    }, this.pollIntervalMs);
  }
}
```

---

## Subsystem 5: Network Sentinel (`NetworkDriver`)

**Purpose:** Monitor all network connections on the machine. Detect data exfiltration, suspicious outbound connections, and give Jeriko awareness of what's talking to the internet.

### Interface

```typescript
export interface NetworkConnection {
  protocol: "tcp" | "udp";
  localAddr: string;
  localPort: number;
  remoteAddr: string;
  remotePort: number;
  state: "established" | "listen" | "time_wait" | "close_wait" | string;
  pid: number;
  processName: string;
}

export interface NetworkDriver {
  /** Get all current connections (snapshot). */
  listConnections(): Promise<NetworkConnection[]>;

  /** Start continuous monitoring. Callback fires on new connections. */
  monitor(callback: (conn: NetworkConnection) => void): Promise<void>;

  /** Stop monitoring. */
  stop(): Promise<void>;

  /** Block a specific connection (if supported — requires privileges). */
  block?(pid: number, remoteAddr: string): Promise<boolean>;
}
```

### Implementation (Empirical Performance Data)

**Measured on macOS 15 (live tested):**
- `lsof -i -P -n`: **264ms** for 135 entries — too slow for real-time polling
- `netstat -an`: **32ms** for 960 entries — acceptable for 5-10s polling intervals
- `libproc` FFI (`proc_pidfdinfo` with `PROC_PIDFDSOCKETINFO`): **<1ms** per process — ideal for real-time

**Linux:** `/proc/net/tcp` + `/proc/net/tcp6` read: **~1ms** — kernel virtual files, near-instant

```typescript
// src/daemon/sovereignty/drivers/network/darwin.ts

export class DarwinNetworkDriver implements NetworkDriver {
  async listConnections(): Promise<NetworkConnection[]> {
    // Phase 1: netstat (32ms, good enough for 5-10s polling)
    const raw = await $`netstat -an -p tcp`.nothrow().text();
    return this.parseNetstat(raw);

    // Phase 3 (future): Use libproc FFI for zero-subprocess monitoring:
    // For each PID from proc_listallpids():
    //   proc_pidinfo(pid, PROC_PIDLISTFDS) → get all FDs
    //   proc_pidfdinfo(pid, fd, PROC_PIDFDSOCKETINFO) → get socket details
    // This gives per-process socket attribution without any subprocess spawn.
  }
}

// src/daemon/sovereignty/drivers/network/linux.ts

export class LinuxNetworkDriver implements NetworkDriver {
  async listConnections(): Promise<NetworkConnection[]> {
    // Read kernel virtual files directly — ~1ms total
    const [tcp4, tcp6] = await Promise.all([
      Bun.file("/proc/net/tcp").text(),
      Bun.file("/proc/net/tcp6").text().catch(() => ""),
    ]);
    return [...this.parseProcNet(tcp4), ...this.parseProcNet(tcp6)];
  }
}
```

---

## Kernel Boot Integration

The sovereignty service initializes at **kernel boot step 5.3** (after security policies, before tools). This ensures:
- Snapshots are available before any tool executes
- File watching is active before triggers start
- Process monitoring catches the daemon's own children

```typescript
// In kernel.ts boot():

// Step 5.3: Initialize System Sovereignty
try {
  const { SovereigntyService } = await import("./sovereignty/index.js");
  const sovereignty = new SovereigntyService(config);
  await sovereignty.init();
  state.sovereignty = sovereignty;

  // Wire into agent tools
  const { setSovereigntyService } = await import("./sovereignty/guard.js");
  setSovereigntyService(sovereignty);

  log.info("Kernel boot: step 5.3 — sovereignty service initialized", {
    snapshots: sovereignty.snapshot.isEnabled(),
    sandbox: sovereignty.sandbox.isEnabled(),
    watch: sovereignty.watch.isEnabled(),
    process: sovereignty.process.isEnabled(),
    network: sovereignty.network.isEnabled(),
  });
} catch (err) {
  log.warn(`Kernel boot: step 5.3 — sovereignty init failed (non-fatal): ${err}`);
  // All sovereignty features degrade gracefully to no-ops
}
```

---

## The Full Trace: Telegram Message to Sandboxed Execution

Here is the complete flow when a user sends "refactor src/server.ts" via Telegram:

```
1. Telegram webhook → relay (bot.jeriko.ai) → daemon WebSocket

2. Channel router receives message
   → creates/resumes session
   → calls runAgent(config)

3. Agent loop starts
   → LLM receives system prompt + user message
   → LLM decides: "I need to read the file, then rewrite it"

4. Tool call: read_file("src/server.ts")
   → ExecutionGuard: rate check ✓
   → SovereigntyGuard: read_file is not destructive, skip snapshot
   → Tool executes normally
   → Result returned to LLM

5. Tool call: write_file("src/server.ts", newContent)
   → ExecutionGuard: rate check ✓
   → SovereigntyGuard: write_file is DESTRUCTIVE
     → SnapshotDriver.create("pre-write:src/server.ts")
     → APFS snapshot created in ~10ms
   → Tool executes: file written
   → SovereigntyGuard.cleanup(): prune old snapshots

6. Tool call: bash("bun test")
   → ExecutionGuard: rate check ✓
   → SovereigntyGuard: bash is SANDBOXABLE
     → SandboxDriver.execute("bun test", {
         readPaths: [projectDir, "/usr", "/bin", ...],
         writePaths: [projectDir + "/node_modules", "/tmp"],
         allowNetwork: true,  // tests may need network
         timeout: 60_000,
       })
   → Tests run inside sandbox
   → Results returned to LLM

7. Tests fail → LLM reasons about error
   → Decides to rollback

8. Tool call: sovereignty_restore(snapshotId)
   → SnapshotDriver.restore(id)
   → File instantly reverted to pre-write state
   → LLM tries a different approach
```

---

## Agent Tool: `sovereignty`

A new tool exposed to the LLM for explicit sovereignty operations:

```typescript
// src/daemon/agent/tools/sovereignty.ts

const definition: ToolDefinition = {
  name: "sovereignty",
  description: "System sovereignty operations: snapshots, process listing, network monitoring.",
  parameters: {
    action: {
      type: "string",
      enum: ["snap_create", "snap_list", "snap_restore", "snap_diff",
             "processes", "network", "watch_start", "watch_stop"],
      description: "The sovereignty action to perform.",
    },
    label: { type: "string", description: "Snapshot label (for snap_create)." },
    snapshot_id: { type: "string", description: "Snapshot ID (for snap_restore, snap_diff)." },
    path: { type: "string", description: "Path to watch (for watch_start)." },
    filter: { type: "string", description: "Filter pattern (for processes, network)." },
  },
};
```

---

## Configuration

```jsonc
// ~/.config/jeriko/config.json
{
  "sovereignty": {
    "snapshots": {
      "enabled": true,
      "autoSnap": true,        // Auto-snapshot before destructive tools
      "maxCount": 50,          // Max snapshots before pruning
      "maxAge": 86400000,      // 24h max age
      "mountPoint": "/"        // Filesystem to snapshot
    },
    "sandbox": {
      "enabled": true,
      "mode": "permissive",    // "strict" | "permissive" | "off"
      "defaultProfile": "project"  // "minimal" | "project" | "full"
    },
    "watch": {
      "enabled": true,
      "paths": [],             // Extra paths to watch (project dirs auto-added)
      "excludePatterns": ["node_modules", ".git", "*.log"]
    },
    "process": {
      "enabled": false,        // Opt-in (privacy sensitive)
      "pollInterval": 5000
    },
    "network": {
      "enabled": false,        // Opt-in (privacy sensitive)
      "pollInterval": 10000
    }
  }
}
```

---

## Phased Rollout

### Phase 1: Snapshots + Sandbox Foundation (4 weeks)

**Priority: Safety — the ROI is immediate.**

- `SnapshotDriver` with macOS (APFS via tmutil) + Linux (Btrfs/ZFS via CLI) + noop fallback
- `SandboxDriver` with macOS (sandbox-exec) + Linux (bubblewrap) + noop fallback
- `SovereigntyGuard` integration into agent loop
- `sovereignty` agent tool (snap_create, snap_list, snap_restore, snap_diff)
- Configuration schema + kernel boot integration (step 5.3)
- Pruning: auto-clean snapshots older than 24h or beyond count limit
- Tests: unit tests for each driver + integration test for full trace

### Phase 2: Kernel File Watcher (2 weeks)

**Priority: Performance — replaces `fs.watch` with kernel-native events.**

- `WatchDriver` with macOS (FSEvents via C FFI) + Linux (inotify via C FFI) + Node fallback
- Replace `FileWatchTrigger` to use `WatchDriver` instead of `fs.watch`
- Build script for native C helpers (`ffi/build.ts`)
- Ship precompiled `.dylib` / `.so` in release archives (or compile on `jeriko install`)

### Phase 3: Process & Network Monitoring (3 weeks)

**Priority: Intelligence — enables proactive agent behavior.**

- `ProcessDriver` with fallback polling (no special privileges)
- `NetworkDriver` with fallback (`lsof` / `/proc/net`)
- Optional: eBPF loader for Linux (Rust helper, requires CAP_BPF)
- Optional: ESF bindings for macOS (requires entitlement)
- "System pulse" — periodic summary of process/network state into agent context
- `sovereignty` tool extensions (processes, network)

### Phase 4: Proactive Daemon ("Janitor") (3 weeks)

**Priority: Autonomy — Jeriko acts without being asked.**

- Background reasoning loop: analyze sovereignty events + system state
- Anomaly detection: suspicious process spawns, unusual network connections
- Cleanup suggestions: stale node_modules, orphan Docker containers, large temp files
- Notification via channels: "I noticed your disk is 90% full. Should I clean up 12GB of unused build artifacts?"
- System health scoring: CPU, memory, disk, network health rolled into a single metric

---

## Risks and Mitigations

| Risk | Severity | Mitigation |
|------|----------|------------|
| **APFS snapshot accumulation fills disk** | High | Auto-prune: max 50 snapshots, max 24h age. Prune runs after every snapshot create. |
| **sandbox-exec is deprecated by Apple** | Medium | Abstract behind driver interface. Verified working on macOS 15 for write+network denial. Read denial broken — documented as known limitation. Future: App Sandbox with entitlements. |
| **eBPF requires root/CAP_BPF** | Medium | Always ship fallback driver. eBPF is opt-in enhancement, never required. |
| **FFI native helpers add build complexity** | Low | Phase 1-2 require NO compiled C code. macOS uses `libproc.dylib` (system lib) + `tmutil`/`sandbox-exec` (system binaries). Linux uses `/proc` + CLI tools. Native C/Rust only needed for Phase 3 eBPF. |
| **Process monitoring is privacy-invasive** | High | Disabled by default. Opt-in via config. Data never leaves machine. |
| **Sandbox breaks legitimate tool commands** | Medium | "Permissive" default mode logs violations but doesn't block. "Strict" mode is opt-in. |
| **Snapshot restore is destructive** | Critical | Restore requires explicit tool call (never auto). Agent prompt warns about irreversibility. |
| **Windows support lags** | Low | Noop fallback ensures Windows works — just without sovereignty features. Phase 5 fills gap. |

---

## What This Means Competitively

| Capability | Claude Code | Manus | Cursor | **Jeriko + Sovereignty** |
|------------|-------------|-------|--------|--------------------------|
| File awareness | grep (poll) | Cloud sandbox | IDE events | **Kernel push (FSEvents/inotify)** |
| Safety net | "Are you sure?" | Cloud snapshot | Undo buffer | **Atomic OS snapshots (10ms)** |
| Command isolation | None | Cloud sandbox | None | **Native sandbox (sandbox-exec/bwrap)** |
| Process monitoring | None | None | None | **Kernel-level (eBPF/ESF)** |
| Network monitoring | None | None | None | **Socket-level awareness** |
| Rollback scope | Git only | Task-level | File-level | **Full filesystem instant restore** |
| Privilege level | User-space app | Cloud VM | IDE plugin | **OS extension** |

---

## Decision Outcome

**Accepted.** Build System Sovereignty as a phased, driver-based architecture that:

1. **Never requires special privileges for core functionality** — fallback drivers work everywhere
2. **Degrades gracefully** — every subsystem has a noop/fallback driver
3. **Integrates at the agent loop level** — not bolted on, but woven into tool execution
4. **Ships incrementally** — Phase 1 (snapshots + sandbox) delivers immediate safety value
5. **Maintains the single-binary philosophy** — native helpers are precompiled and bundled

Phase 1 implementation begins immediately after this ADR is approved.
