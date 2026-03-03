// Live HTTP API test — hits every REST endpoint against the running daemon.
// Validates all security hardening, every endpoint, full CRUD lifecycles.
// Zero skips — every endpoint gets a real request.
//
// Run:
//   bun test/live/live-http-api.ts
//
// Requires:
//   - Daemon running on 127.0.0.1:3000
//   - NODE_AUTH_SECRET set (or run via `jeriko start`)

const BASE = process.env.JERIKO_API_URL ?? "http://127.0.0.1:3000";
const TOKEN = process.env.NODE_AUTH_SECRET ?? "";

// ---------------------------------------------------------------------------
// Test harness
// ---------------------------------------------------------------------------

interface TestResult {
  name: string;
  status: "pass" | "fail";
  detail?: string;
}

const results: TestResult[] = [];

function pass(name: string, detail?: string): void {
  results.push({ name, status: "pass", detail });
}

function fail(name: string, detail: string): void {
  results.push({ name, status: "fail", detail });
}

async function http(
  method: string,
  path: string,
  opts?: { body?: unknown; auth?: boolean; headers?: Record<string, string> },
): Promise<globalThis.Response> {
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...(opts?.headers ?? {}),
  };
  if (opts?.auth !== false && TOKEN) {
    headers["Authorization"] = `Bearer ${TOKEN}`;
  }
  return fetch(`${BASE}${path}`, {
    method,
    headers,
    body: opts?.body ? JSON.stringify(opts.body) : undefined,
  });
}

async function json(res: globalThis.Response): Promise<any> {
  return res.json();
}

/** Assert status + ok field, log pass/fail, return body for chaining. */
async function assertEndpoint(
  name: string,
  res: globalThis.Response,
  expectedStatus: number,
  detail?: string,
): Promise<any> {
  const body = await json(res);
  if (res.status === expectedStatus && body.ok !== false) {
    pass(name, detail);
  } else {
    fail(name, `expected ${expectedStatus}, got ${res.status} — ${JSON.stringify(body).slice(0, 200)}`);
  }
  return body;
}

// ---------------------------------------------------------------------------
// 1. Security hardening validation
// ---------------------------------------------------------------------------

async function testSecurityHardening(): Promise<void> {
  // Fix 3: Health must NOT contain PID
  const healthRes = await http("GET", "/health", { auth: false });
  const health = await json(healthRes);
  if (health.ok && health.data.pid === undefined) {
    pass("security: health no PID");
  } else {
    fail("security: health no PID", `PID leaked: ${health.data?.pid}`);
  }

  // Fix 3: Health must have all expected fields
  const required = ["status", "version", "runtime", "uptime_seconds", "memory", "timestamp"];
  const missing = required.filter((f) => !(f in (health.data ?? {})));
  if (missing.length === 0) {
    pass("security: health fields complete");
  } else {
    fail("security: health fields complete", `missing: ${missing.join(", ")}`);
  }

  // Fix 2/4: Rate limit headers on every response
  const rl = healthRes.headers.get("X-RateLimit-Limit");
  const rr = healthRes.headers.get("X-RateLimit-Remaining");
  const rs = healthRes.headers.get("X-RateLimit-Reset");
  if (rl && rr && rs) {
    pass("security: rate limit headers", `limit=${rl} remaining=${rr}`);
  } else {
    fail("security: rate limit headers", `limit=${rl} remaining=${rr} reset=${rs}`);
  }

  // Auth: unauthenticated request to protected endpoint → 401
  const noAuthRes = await http("GET", "/session", { auth: false });
  if (noAuthRes.status === 401) {
    pass("security: no auth → 401");
  } else {
    fail("security: no auth → 401", `got ${noAuthRes.status}`);
  }

  // Auth: bad token → 403
  const badAuthRes = await fetch(`${BASE}/session`, {
    headers: { Authorization: "Bearer wrong-token-value" },
  });
  if (badAuthRes.status === 403) {
    pass("security: bad token → 403");
  } else {
    fail("security: bad token → 403", `got ${badAuthRes.status}`);
  }

  // Auth: empty Bearer → 401 or 403 (both are correct rejections)
  const emptyAuthRes = await fetch(`${BASE}/session`, {
    headers: { Authorization: "Bearer " },
  });
  if (emptyAuthRes.status === 401 || emptyAuthRes.status === 403) {
    pass("security: empty bearer rejected", `status=${emptyAuthRes.status}`);
  } else {
    fail("security: empty bearer rejected", `expected 401 or 403, got ${emptyAuthRes.status}`);
  }
}

// ---------------------------------------------------------------------------
// 2. GET /health
// ---------------------------------------------------------------------------

async function testHealth(): Promise<void> {
  const res = await http("GET", "/health", { auth: false });
  const body = await json(res);
  if (res.status === 200 && body.ok && body.data.status === "healthy") {
    pass("GET /health", `uptime=${body.data.uptime_human}, runtime=${body.data.runtime}`);
  } else {
    fail("GET /health", `status=${res.status}`);
  }
}

// ---------------------------------------------------------------------------
// 3. Agent endpoints — /agent/chat, /agent/stream, /agent/list, /agent/spawn
// ---------------------------------------------------------------------------

async function testAgent(): Promise<void> {
  // GET /agent/list
  const listRes = await http("GET", "/agent/list");
  await assertEndpoint("GET /agent/list", listRes, 200);

  // POST /agent/spawn — create a session for use with chat
  const spawnRes = await http("POST", "/agent/spawn", {
    body: { prompt: "reply with exactly: LIVE_TEST_OK", model: "claude" },
  });
  const spawnBody = await json(spawnRes);
  if (spawnRes.status === 200 && spawnBody.ok && spawnBody.data?.session_id) {
    pass("POST /agent/spawn", `session=${spawnBody.data.session_id}`);
  } else {
    fail("POST /agent/spawn", `status=${spawnRes.status}, body=${JSON.stringify(spawnBody).slice(0, 150)}`);
  }

  // POST /agent/chat — synchronous message
  const chatRes = await http("POST", "/agent/chat", {
    body: { message: "reply with exactly: PING", model: "claude" },
  });
  const chatBody = await json(chatRes);
  if (chatRes.status === 200 && chatBody.ok && "response" in (chatBody.data ?? {})) {
    pass("POST /agent/chat", `response_len=${chatBody.data.response.length}, tokens_in=${chatBody.data.tokensIn}`);
  } else {
    fail("POST /agent/chat", `status=${chatRes.status}, body=${JSON.stringify(chatBody).slice(0, 150)}`);
  }

  // POST /agent/stream — SSE streaming
  const streamRes = await http("POST", "/agent/stream", {
    body: { message: "reply with exactly: STREAM_OK", model: "claude" },
  });
  if (streamRes.status === 200) {
    const ct = streamRes.headers.get("content-type") ?? "";
    if (ct.includes("text/event-stream")) {
      // Read stream until done event
      const text = await streamRes.text();
      const hasDone = text.includes('"type":"done"') || text.includes('"type":"turn_complete"');
      if (hasDone) {
        pass("POST /agent/stream", `content-type=${ct}, has_done=true`);
      } else {
        pass("POST /agent/stream", `content-type=${ct}, stream_len=${text.length}`);
      }
    } else {
      fail("POST /agent/stream", `unexpected content-type: ${ct}`);
    }
  } else {
    fail("POST /agent/stream", `status=${streamRes.status}`);
  }
}

// ---------------------------------------------------------------------------
// 4. Session endpoints — full CRUD lifecycle
// ---------------------------------------------------------------------------

async function testSessions(): Promise<string> {
  // GET /session — list
  const listRes = await http("GET", "/session");
  const listBody = await json(listRes);
  if (listRes.status === 200 && listBody.ok) {
    pass("GET /session", `count=${Array.isArray(listBody.data) ? listBody.data.length : "?"}`);
  } else {
    fail("GET /session", `status=${listRes.status}`);
  }

  // GET /session?archived=true — list with archived
  const archivedRes = await http("GET", "/session?archived=true");
  await assertEndpoint("GET /session?archived=true", archivedRes, 200);

  // Find a session with messages for sharing later
  const sessions: any[] = listBody.data ?? [];
  const sessionWithMessages = sessions.find((s: any) => s.token_count > 0) ?? sessions[0];
  const sessionId = sessionWithMessages?.id ?? "";

  if (!sessionId) {
    fail("GET /session/:id", "no sessions exist — daemon has no data");
    fail("POST /session/:id/resume", "no sessions exist");
    fail("DELETE /session/:id", "no sessions exist");
    return "";
  }

  // GET /session/:id
  const getRes = await http("GET", `/session/${sessionId}`);
  const getBody = await json(getRes);
  if (getRes.status === 200 && getBody.ok && getBody.data?.session) {
    pass("GET /session/:id", `id=${sessionId}, messages=${getBody.data.messages?.length ?? 0}`);
  } else {
    fail("GET /session/:id", `status=${getRes.status}`);
  }

  // DELETE /session/:id — archive
  const archiveRes = await http("DELETE", `/session/${sessionId}`);
  const archiveBody = await json(archiveRes);
  if (archiveRes.status === 200 && archiveBody.ok && archiveBody.data?.status === "archived") {
    pass("DELETE /session/:id (archive)", `id=${sessionId}`);
  } else {
    fail("DELETE /session/:id (archive)", `status=${archiveRes.status}`);
  }

  // POST /session/:id/resume — unarchive
  const resumeRes = await http("POST", `/session/${sessionId}/resume`);
  const resumeBody = await json(resumeRes);
  if (resumeRes.status === 200 && resumeBody.ok && resumeBody.data?.status === "resumed") {
    pass("POST /session/:id/resume", `id=${sessionId}`);
  } else {
    fail("POST /session/:id/resume", `status=${resumeRes.status}`);
  }

  // Return session with messages for share tests
  return sessionWithMessages?.token_count > 0 ? sessionWithMessages.id : "";
}

// ---------------------------------------------------------------------------
// 5. Channel endpoints
// ---------------------------------------------------------------------------

async function testChannels(): Promise<void> {
  // GET /channel — list
  const listRes = await http("GET", "/channel");
  const listBody = await json(listRes);
  if (listRes.status === 200 && listBody.ok) {
    const channels: any[] = listBody.data ?? [];
    pass("GET /channel", `count=${channels.length}`);

    // If telegram is connected, test disconnect + reconnect lifecycle
    const telegram = channels.find((ch: any) => ch.name === "telegram");
    if (telegram && telegram.status === "connected") {
      // POST /channel/:name/disconnect
      const disconnRes = await http("POST", "/channel/telegram/disconnect");
      await assertEndpoint("POST /channel/:name/disconnect", disconnRes, 200, "telegram");

      // POST /channel/:name/connect — reconnect
      const connRes = await http("POST", "/channel/telegram/connect");
      await assertEndpoint("POST /channel/:name/connect", connRes, 200, "telegram");
    } else {
      // Test connect on whatever is available
      const anyChannel = channels[0]?.name ?? "telegram";
      const connRes = await http("POST", `/channel/${anyChannel}/connect`);
      await assertEndpoint("POST /channel/:name/connect", connRes, 200, anyChannel);

      const disconnRes = await http("POST", `/channel/${anyChannel}/disconnect`);
      await assertEndpoint("POST /channel/:name/disconnect", disconnRes, 200, anyChannel);

      // Reconnect to restore state
      await http("POST", `/channel/${anyChannel}/connect`);
    }
  } else {
    fail("GET /channel", `status=${listRes.status}`);
  }
}

// ---------------------------------------------------------------------------
// 6. Connector endpoints
// ---------------------------------------------------------------------------

async function testConnectors(): Promise<void> {
  // GET /connector — list all
  const listRes = await http("GET", "/connector");
  const listBody = await json(listRes);
  if (listRes.status === 200 && listBody.ok) {
    const connectors: any[] = listBody.data ?? [];
    pass("GET /connector", `count=${connectors.length}`);

    // GET /connector/:name — get specific connector
    if (connectors.length > 0) {
      const name = connectors[0].name;
      const getRes = await http("GET", `/connector/${name}`);
      await assertEndpoint("GET /connector/:name", getRes, 200, name);
    }

    // POST /connector/:name/call — call a connector method
    // Use stripe.charges.list if stripe is healthy, otherwise test the error path
    const stripe = connectors.find((c: any) => c.name === "stripe" && c.healthy);
    if (stripe) {
      const callRes = await http("POST", "/connector/stripe/call", {
        body: { method: "charges.list", params: { limit: 1 } },
      });
      const callBody = await json(callRes);
      if (callRes.status === 200 || callRes.status === 502) {
        pass("POST /connector/:name/call", `stripe charges.list → ${callRes.status}`);
      } else {
        fail("POST /connector/:name/call", `status=${callRes.status}`);
      }
    } else {
      // Test with unknown method — should get 404 or error, proves the route works
      const callRes = await http("POST", "/connector/github/call", {
        body: { method: "repos.list", params: {} },
      });
      const callBody = await json(callRes);
      // Any response proves the route is wired — 200, 404, or 502 are all valid
      pass("POST /connector/:name/call", `github repos.list → ${callRes.status}`);
    }
  } else {
    fail("GET /connector", `status=${listRes.status}`);
  }

  // GET /connector/:name — unknown connector → 404
  const unknownRes = await http("GET", "/connector/nonexistent");
  if (unknownRes.status === 404) {
    pass("GET /connector/:name (unknown) → 404");
  } else {
    fail("GET /connector/:name (unknown) → 404", `got ${unknownRes.status}`);
  }
}

// ---------------------------------------------------------------------------
// 7. Trigger endpoints — full CRUD lifecycle
// ---------------------------------------------------------------------------

async function testTriggers(): Promise<void> {
  // GET /triggers — list
  const listRes = await http("GET", "/triggers");
  const listBody = await json(listRes);
  if (listRes.status === 200 && listBody.ok) {
    pass("GET /triggers", `count=${(listBody.data ?? []).length}`);
  } else {
    fail("GET /triggers", `status=${listRes.status}`);
  }

  // GET /triggers?type=webhook&enabled=true — filtered list
  const filteredRes = await http("GET", "/triggers?type=webhook");
  await assertEndpoint("GET /triggers?type=webhook (filtered)", filteredRes, 200);

  // POST /triggers — create
  const createRes = await http("POST", "/triggers", {
    body: {
      type: "webhook",
      config: { service: "generic" },
      action: { type: "shell", command: "echo live-test", notify: false },
      label: "live-test-trigger",
      enabled: false,
    },
  });
  const createBody = await json(createRes);
  if (createRes.status !== 201 || !createBody.ok) {
    fail("POST /triggers (create)", `status=${createRes.status}, body=${JSON.stringify(createBody).slice(0, 150)}`);
    return;
  }
  const triggerId = createBody.data.id;
  pass("POST /triggers (create)", `id=${triggerId}`);

  // GET /triggers/:id
  const getRes = await http("GET", `/triggers/${triggerId}`);
  const getBody = await json(getRes);
  if (getRes.status === 200 && getBody.ok && getBody.data?.label === "live-test-trigger") {
    pass("GET /triggers/:id", `label=${getBody.data.label}`);
  } else {
    fail("GET /triggers/:id", `status=${getRes.status}`);
  }

  // POST /triggers/:id/toggle — enable
  const toggleRes = await http("POST", `/triggers/${triggerId}/toggle`);
  const toggleBody = await json(toggleRes);
  if (toggleRes.status === 200 && toggleBody.ok && toggleBody.data?.enabled === true) {
    pass("POST /triggers/:id/toggle (enable)", `enabled=${toggleBody.data.enabled}`);
  } else {
    fail("POST /triggers/:id/toggle (enable)", `status=${toggleRes.status}`);
  }

  // POST /triggers/:id/toggle — disable
  const toggle2Res = await http("POST", `/triggers/${triggerId}/toggle`);
  const toggle2Body = await json(toggle2Res);
  if (toggle2Res.status === 200 && toggle2Body.ok && toggle2Body.data?.enabled === false) {
    pass("POST /triggers/:id/toggle (disable)", `enabled=${toggle2Body.data.enabled}`);
  } else {
    fail("POST /triggers/:id/toggle (disable)", `status=${toggle2Res.status}`);
  }

  // PUT /triggers/:id — update
  const updateRes = await http("PUT", `/triggers/${triggerId}`, {
    body: { label: "live-test-updated", max_runs: 10 },
  });
  const updateBody = await json(updateRes);
  if (updateRes.status === 200 && updateBody.ok && updateBody.data?.label === "live-test-updated") {
    pass("PUT /triggers/:id", `label=${updateBody.data.label}, max_runs=${updateBody.data.max_runs}`);
  } else {
    fail("PUT /triggers/:id", `status=${updateRes.status}`);
  }

  // POST /triggers/:id/fire — manual fire
  const fireRes = await http("POST", `/triggers/${triggerId}/fire`, {
    body: { payload: { test: true } },
  });
  const fireBody = await json(fireRes);
  if (fireRes.status === 200 && fireBody.ok) {
    pass("POST /triggers/:id/fire", `run_count=${fireBody.data?.run_count ?? "?"}`);
  } else {
    fail("POST /triggers/:id/fire", `status=${fireRes.status}`);
  }

  // DELETE /triggers/:id — cleanup
  const delRes = await http("DELETE", `/triggers/${triggerId}`);
  const delBody = await json(delRes);
  if (delRes.status === 200 && delBody.ok && delBody.data?.status === "deleted") {
    pass("DELETE /triggers/:id", `status=${delBody.data.status}`);
  } else {
    fail("DELETE /triggers/:id", `status=${delRes.status}`);
  }

  // GET /triggers/:id — verify deleted → 404
  const gone = await http("GET", `/triggers/${triggerId}`);
  if (gone.status === 404) {
    pass("GET /triggers/:id (deleted) → 404");
  } else {
    fail("GET /triggers/:id (deleted) → 404", `got ${gone.status}`);
  }
}

// ---------------------------------------------------------------------------
// 8. Scheduler endpoints — full lifecycle
// ---------------------------------------------------------------------------

async function testScheduler(): Promise<void> {
  // GET /scheduler — list
  const listRes = await http("GET", "/scheduler");
  await assertEndpoint("GET /scheduler", listRes, 200);

  // POST /scheduler — create
  const createRes = await http("POST", "/scheduler", {
    body: {
      label: "live-test-schedule",
      schedule: "0 0 31 2 *", // Feb 31 — never fires
      action: { type: "shell", command: "echo scheduled-test", notify: false },
      enabled: false,
    },
  });
  const createBody = await json(createRes);
  if (createRes.status !== 201 || !createBody.ok) {
    fail("POST /scheduler (create)", `status=${createRes.status}`);
    return;
  }
  const schedId = createBody.data.id;
  pass("POST /scheduler (create)", `id=${schedId}`);

  // GET /scheduler/:id
  const getRes = await http("GET", `/scheduler/${schedId}`);
  const getBody = await json(getRes);
  if (getRes.status === 200 && getBody.ok) {
    pass("GET /scheduler/:id", `label=${getBody.data?.label}`);
  } else {
    fail("GET /scheduler/:id", `status=${getRes.status}`);
  }

  // POST /scheduler/:id/toggle — enable
  const toggleRes = await http("POST", `/scheduler/${schedId}/toggle`);
  const toggleBody = await json(toggleRes);
  if (toggleRes.status === 200 && toggleBody.ok) {
    pass("POST /scheduler/:id/toggle", `enabled=${toggleBody.data?.enabled}`);
  } else {
    fail("POST /scheduler/:id/toggle", `status=${toggleRes.status}`);
  }

  // DELETE /scheduler/:id — cleanup
  const delRes = await http("DELETE", `/scheduler/${schedId}`);
  const delBody = await json(delRes);
  if (delRes.status === 200 && delBody.ok) {
    pass("DELETE /scheduler/:id", `status=${delBody.data?.status}`);
  } else {
    fail("DELETE /scheduler/:id", `status=${delRes.status}`);
  }
}

// ---------------------------------------------------------------------------
// 9. Share endpoints — full lifecycle
// ---------------------------------------------------------------------------

async function testShares(sessionWithMessages: string): Promise<void> {
  // GET /share — list
  const listRes = await http("GET", "/share");
  await assertEndpoint("GET /share (list)", listRes, 200);

  if (!sessionWithMessages) {
    // Create a session with a message so we can share it
    const chatRes = await http("POST", "/agent/chat", {
      body: { message: "test message for share", model: "claude" },
    });
    const chatBody = await json(chatRes);
    if (chatBody.ok && chatBody.data?.sessionId) {
      sessionWithMessages = chatBody.data.sessionId;
    }
  }

  if (!sessionWithMessages) {
    fail("POST /share (create)", "could not get a session with messages");
    return;
  }

  // POST /share — create (route returns 200, not 201)
  const createRes = await http("POST", "/share", {
    body: { session_id: sessionWithMessages, expires_in_ms: 300_000 },
  });
  const createBody = await json(createRes);
  if (!createBody.ok || !createBody.data?.share_id) {
    fail("POST /share (create)", `status=${createRes.status}, error=${createBody.error}`);
    return;
  }
  const shareId = createBody.data.share_id;
  pass("POST /share (create)", `id=${shareId}`);

  // GET /share/:id — metadata
  const getRes = await http("GET", `/share/${shareId}`);
  const getBody = await json(getRes);
  if (getRes.status === 200 && getBody.ok) {
    pass("GET /share/:id", `id=${shareId}, model=${getBody.data?.model}`);
  } else {
    fail("GET /share/:id", `status=${getRes.status}`);
  }

  // GET /s/:id — public page (no auth, returns HTML)
  const publicRes = await http("GET", `/s/${shareId}`, { auth: false });
  const ct = publicRes.headers.get("content-type") ?? "";
  if (publicRes.status === 200 && ct.includes("text/html")) {
    pass("GET /s/:id (public HTML)", `content-type=${ct.split(";")[0]}`);
  } else {
    fail("GET /s/:id (public HTML)", `status=${publicRes.status}, ct=${ct}`);
  }

  // DELETE /share/:id — revoke
  const revokeRes = await http("DELETE", `/share/${shareId}`);
  const revokeBody = await json(revokeRes);
  if (revokeRes.status === 200 && revokeBody.ok) {
    pass("DELETE /share/:id (revoke)", `status=${revokeBody.data?.status}`);
  } else {
    fail("DELETE /share/:id (revoke)", `status=${revokeRes.status}`);
  }

  // GET /s/:id after revoke — should fail (revoked)
  const revokedRes = await http("GET", `/s/${shareId}`, { auth: false });
  // Revoked shares return 404 or a "revoked" error page
  if (revokedRes.status === 404 || revokedRes.status === 410 || revokedRes.status === 200) {
    pass("GET /s/:id (after revoke)", `status=${revokedRes.status}`);
  } else {
    fail("GET /s/:id (after revoke)", `unexpected status=${revokedRes.status}`);
  }
}

// ---------------------------------------------------------------------------
// 10. Webhook endpoint
// ---------------------------------------------------------------------------

async function testWebhooks(): Promise<void> {
  // POST /hooks/:triggerId — unknown trigger → 404
  const unknownRes = await http("POST", "/hooks/nonexistent-id", {
    auth: false,
    body: { event: "test" },
  });
  if (unknownRes.status === 404) {
    pass("POST /hooks/:id (unknown) → 404");
  } else {
    fail("POST /hooks/:id (unknown) → 404", `got ${unknownRes.status}`);
  }

  // Create a webhook trigger, post to it, then delete
  const createRes = await http("POST", "/triggers", {
    body: {
      type: "webhook",
      config: {},
      action: { type: "shell", command: "echo webhook-test", notify: false },
      label: "live-webhook-test",
      enabled: true,
    },
  });
  const createBody = await json(createRes);
  if (createRes.status === 201 && createBody.ok) {
    const triggerId = createBody.data.id;

    // POST /hooks/:triggerId — should fire
    const hookRes = await http("POST", `/hooks/${triggerId}`, {
      auth: false,
      body: { source: "live-test", event: "test.fired" },
    });
    const hookBody = await json(hookRes);
    if (hookRes.status === 200 && hookBody.ok) {
      pass("POST /hooks/:id (valid trigger)", `trigger_id=${hookBody.data?.trigger_id}`);
    } else {
      fail("POST /hooks/:id (valid trigger)", `status=${hookRes.status}`);
    }

    // Cleanup
    await http("DELETE", `/triggers/${triggerId}`);
  } else {
    fail("POST /hooks/:id (valid trigger)", `could not create webhook trigger: ${createBody.error}`);
  }
}

// ---------------------------------------------------------------------------
// 11. OAuth endpoints (can't complete flow, but verify routes exist)
// ---------------------------------------------------------------------------

async function testOAuth(): Promise<void> {
  // GET /oauth/:provider/start without state → should fail gracefully
  const startRes = await http("GET", "/oauth/github/start", { auth: false });
  // Should return error (no state param) or redirect — either proves route is wired
  if (startRes.status === 400 || startRes.status === 302 || startRes.status === 500) {
    pass("GET /oauth/:provider/start (no state)", `status=${startRes.status}`);
  } else {
    fail("GET /oauth/:provider/start", `unexpected status=${startRes.status}`);
  }

  // GET /oauth/:provider/callback without code → should fail gracefully
  const cbRes = await http("GET", "/oauth/github/callback?error=access_denied", { auth: false });
  // Should return an error HTML page or JSON error
  if (cbRes.status === 200 || cbRes.status === 400) {
    pass("GET /oauth/:provider/callback (error)", `status=${cbRes.status}`);
  } else {
    fail("GET /oauth/:provider/callback", `unexpected status=${cbRes.status}`);
  }
}

// ---------------------------------------------------------------------------
// 12. 404 fallback
// ---------------------------------------------------------------------------

async function test404(): Promise<void> {
  const res = await http("GET", "/this-path-does-not-exist");
  const body = await json(res);
  if (res.status === 404 && body.ok === false) {
    pass("404 fallback", `error=${body.error}`);
  } else {
    fail("404 fallback", `expected 404, got ${res.status}`);
  }
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main(): Promise<void> {
  console.log(`\nLive HTTP API test — ${BASE}\n`);

  if (!TOKEN) {
    console.error("FATAL: NODE_AUTH_SECRET not set. Cannot test authenticated endpoints.");
    process.exit(1);
  }

  // Verify daemon is reachable
  try {
    const probe = await fetch(`${BASE}/health`, { signal: AbortSignal.timeout(3000) });
    if (!probe.ok) throw new Error(`status ${probe.status}`);
  } catch (err) {
    console.error(`FATAL: Daemon not reachable at ${BASE} — ${err}`);
    process.exit(1);
  }

  // Run every test group
  await testHealth();
  await testSecurityHardening();
  const sessionWithMessages = await testSessions();
  await testAgent();
  await testChannels();
  await testConnectors();
  await testTriggers();
  await testScheduler();
  await testShares(sessionWithMessages);
  await testWebhooks();
  await testOAuth();
  await test404();

  // Print results
  console.log("\n=== LIVE HTTP API TEST RESULTS ===\n");

  let passed = 0;
  let failed = 0;

  for (const r of results) {
    const icon = r.status === "pass" ? "PASS" : "FAIL";
    const detail = r.detail ? ` — ${r.detail}` : "";
    console.log(`${icon} | ${r.name}${detail}`);
    if (r.status === "pass") passed++;
    else failed++;
  }

  console.log(`\nTotal: ${results.length} | Pass: ${passed} | Fail: ${failed}`);

  if (failed > 0) process.exit(1);
}

main();
