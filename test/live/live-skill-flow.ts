#!/usr/bin/env bun
// Live test — Skill system end-to-end flow.
//
// Tests the complete skill lifecycle: scaffold → list → tool actions →
// validate → remove → confirm empty. No LLM needed, no database needed.
// Uses HOME isolation via tmpdir to avoid polluting the real skills directory.
//
// Usage: bun test/live/live-skill-flow.ts

import { mkdtempSync, mkdirSync, writeFileSync, chmodSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Guard against double-execution
const RUN_GUARD = Symbol.for("live-skill-flow");
if ((globalThis as Record<symbol, boolean>)[RUN_GUARD]) process.exit(0);
(globalThis as Record<symbol, boolean>)[RUN_GUARD] = true;

// ── Test infra ──────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function ok(name: string, detail?: string) {
  passed++;
  console.log(`  \u2705  ${name}${detail ? ` \u2014 ${detail}` : ""}`);
}
function fail(name: string, detail: string) {
  failed++;
  console.log(`  \u274C  ${name} \u2014 ${detail}`);
}
function header(name: string) {
  console.log(`\n\u2500\u2500\u2500 ${name} ${"\u2500".repeat(Math.max(2, 60 - name.length))}`);
}

// ── HOME isolation ──────────────────────────────────────────────────────────

const originalHome = process.env.HOME;
const tempHome = mkdtempSync(join(tmpdir(), "jeriko-skill-test-"));

function isolateHome(): void {
  process.env.HOME = tempHome;
}

function restoreHome(): void {
  process.env.HOME = originalHome;
  try {
    rmSync(tempHome, { recursive: true, force: true });
  } catch {
    // Best effort cleanup
  }
}

// ── Test constants ──────────────────────────────────────────────────────────

const TEST_SKILL_NAME = "test-deploy";
const TEST_SKILL_DESCRIPTION = "Automated deployment pipeline for testing purposes";

// ── Tests ───────────────────────────────────────────────────────────────────

async function main() {
  console.log("\u2699\uFE0F  Jeriko Skill System \u2014 Live Flow Test\n");

  isolateHome();

  try {
    await runAllSections();
  } finally {
    restoreHome();
  }

  summary();
}

async function runAllSections() {
  // Dynamic imports after HOME is set so skill-loader resolves to our temp dir
  const {
    scaffoldSkill,
    listSkills,
    loadSkill,
    removeSkill,
    validateSkill,
    getSkillsDir,
  } = await import("../../src/shared/skill-loader.js");

  // ────────────────────────────────────────────────────────────────────────
  header("1. Scaffold Skill");
  // ────────────────────────────────────────────────────────────────────────

  let skillDir: string;
  try {
    skillDir = await scaffoldSkill(TEST_SKILL_NAME, TEST_SKILL_DESCRIPTION);
    const expectedDir = join(getSkillsDir(), TEST_SKILL_NAME);
    if (skillDir === expectedDir) {
      ok("scaffoldSkill", `created at ${skillDir}`);
    } else {
      fail("scaffoldSkill", `expected ${expectedDir}, got ${skillDir}`);
      return;
    }
  } catch (err) {
    fail("scaffoldSkill", err instanceof Error ? err.message : String(err));
    return;
  }

  // ────────────────────────────────────────────────────────────────────────
  header("2. List Skills");
  // ────────────────────────────────────────────────────────────────────────

  const skills = await listSkills();
  if (skills.length === 1 && skills[0]!.name === TEST_SKILL_NAME) {
    ok("listSkills", `found "${TEST_SKILL_NAME}" (${skills.length} total)`);
  } else {
    fail("listSkills", `expected 1 skill, got ${skills.length}: ${JSON.stringify(skills)}`);
  }

  if (skills[0]?.description === TEST_SKILL_DESCRIPTION) {
    ok("listSkills description", `matches "${TEST_SKILL_DESCRIPTION}"`);
  } else {
    fail("listSkills description", `expected "${TEST_SKILL_DESCRIPTION}", got "${skills[0]?.description}"`);
  }

  // ────────────────────────────────────────────────────────────────────────
  header("3. use_skill list action");
  // ────────────────────────────────────────────────────────────────────────

  // Import and manually invoke the skill tool execute function
  const { skillTool } = await import("../../src/daemon/agent/tools/skill.js");

  const listResult = JSON.parse(await skillTool.execute({ action: "list" }));
  if (listResult.ok && listResult.data.count === 1) {
    const found = listResult.data.skills.find(
      (s: { name: string }) => s.name === TEST_SKILL_NAME,
    );
    if (found) {
      ok("use_skill list", `found ${listResult.data.count} skill(s)`);
    } else {
      fail("use_skill list", `skill "${TEST_SKILL_NAME}" not in results: ${JSON.stringify(listResult.data.skills)}`);
    }
  } else {
    fail("use_skill list", JSON.stringify(listResult));
  }

  // ────────────────────────────────────────────────────────────────────────
  header("4. use_skill load action");
  // ────────────────────────────────────────────────────────────────────────

  const loadResult = JSON.parse(
    await skillTool.execute({ action: "load", name: TEST_SKILL_NAME }),
  );
  if (loadResult.ok && loadResult.data.name === TEST_SKILL_NAME) {
    ok("use_skill load", `loaded instructions (${loadResult.data.instructions.length} chars)`);
  } else {
    fail("use_skill load", JSON.stringify(loadResult));
  }

  if (typeof loadResult.data?.instructions === "string" && loadResult.data.instructions.length > 0) {
    ok("use_skill load body", "instructions body is non-empty");
  } else {
    fail("use_skill load body", "instructions body is empty or missing");
  }

  // ────────────────────────────────────────────────────────────────────────
  header("5. Read Reference");
  // ────────────────────────────────────────────────────────────────────────

  // Create a reference file
  const refsDir = join(skillDir, "references");
  mkdirSync(refsDir, { recursive: true });
  const refContent = "# API Reference\n\nEndpoint: POST /deploy\nAuth: Bearer token required\n";
  writeFileSync(join(refsDir, "api-docs.md"), refContent, "utf-8");

  const refResult = JSON.parse(
    await skillTool.execute({
      action: "read_reference",
      name: TEST_SKILL_NAME,
      path: "api-docs.md",
    }),
  );
  if (refResult.ok && refResult.data.content === refContent) {
    ok("read_reference", `read ${refResult.data.content.length} chars`);
  } else if (refResult.ok) {
    fail("read_reference", `content mismatch: "${refResult.data.content?.slice(0, 50)}..."`);
  } else {
    fail("read_reference", JSON.stringify(refResult));
  }

  // Verify path traversal is blocked
  const traversalResult = JSON.parse(
    await skillTool.execute({
      action: "read_reference",
      name: TEST_SKILL_NAME,
      path: "../../etc/passwd",
    }),
  );
  if (!traversalResult.ok && traversalResult.error.includes("traversal")) {
    ok("read_reference traversal blocked", traversalResult.error);
  } else {
    fail("read_reference traversal blocked", `should have been rejected: ${JSON.stringify(traversalResult)}`);
  }

  // ────────────────────────────────────────────────────────────────────────
  header("6. Run Script");
  // ────────────────────────────────────────────────────────────────────────

  // Create an executable script that echoes env vars
  const scriptsDir = join(skillDir, "scripts");
  mkdirSync(scriptsDir, { recursive: true });
  const scriptContent = [
    "#!/bin/sh",
    'echo "skill_name=$SKILL_NAME"',
    'echo "skill_dir=$SKILL_DIR"',
    'echo "status=success"',
    "",
  ].join("\n");
  const scriptPath = join(scriptsDir, "check-env.sh");
  writeFileSync(scriptPath, scriptContent, "utf-8");
  chmodSync(scriptPath, 0o755);

  const scriptResult = JSON.parse(
    await skillTool.execute({
      action: "run_script",
      name: TEST_SKILL_NAME,
      script: "check-env.sh",
    }),
  );
  if (scriptResult.ok) {
    const output = scriptResult.data.output as string;
    const hasSkillName = output.includes(`skill_name=${TEST_SKILL_NAME}`);
    const hasSkillDir = output.includes("skill_dir=") && output.includes(TEST_SKILL_NAME);
    const hasStatus = output.includes("status=success");

    if (hasSkillName && hasSkillDir && hasStatus) {
      ok("run_script", "env vars SKILL_NAME, SKILL_DIR present, script succeeded");
    } else {
      fail("run_script", `missing env vars in output: "${output}"`);
    }
  } else {
    fail("run_script", JSON.stringify(scriptResult));
  }

  // Verify path traversal is blocked for scripts too
  const scriptTraversalResult = JSON.parse(
    await skillTool.execute({
      action: "run_script",
      name: TEST_SKILL_NAME,
      script: "../../malicious.sh",
    }),
  );
  if (!scriptTraversalResult.ok && scriptTraversalResult.error.includes("traversal")) {
    ok("run_script traversal blocked", scriptTraversalResult.error);
  } else {
    fail("run_script traversal blocked", `should have been rejected: ${JSON.stringify(scriptTraversalResult)}`);
  }

  // ────────────────────────────────────────────────────────────────────────
  header("7. List Files");
  // ────────────────────────────────────────────────────────────────────────

  const filesResult = JSON.parse(
    await skillTool.execute({ action: "list_files", name: TEST_SKILL_NAME }),
  );
  if (filesResult.ok) {
    const files = filesResult.data.files as string[];
    const hasSkillMd = files.includes("SKILL.md");
    const hasScript = files.some((f: string) => f.includes("check-env.sh"));
    const hasRef = files.some((f: string) => f.includes("api-docs.md"));

    if (hasSkillMd && hasScript && hasRef) {
      ok("list_files", `${files.length} files: ${files.join(", ")}`);
    } else {
      fail("list_files", `missing expected files: ${files.join(", ")}`);
    }
  } else {
    fail("list_files", JSON.stringify(filesResult));
  }

  // ────────────────────────────────────────────────────────────────────────
  header("8. Validate Skill");
  // ────────────────────────────────────────────────────────────────────────

  const validation = validateSkill(skillDir);
  if (validation.valid) {
    ok("validateSkill", "skill is valid");
  } else {
    fail("validateSkill", `errors: ${validation.errors.join("; ")}`);
  }

  // ────────────────────────────────────────────────────────────────────────
  header("9. Remove Skill");
  // ────────────────────────────────────────────────────────────────────────

  try {
    await removeSkill(TEST_SKILL_NAME);
    ok("removeSkill", `removed "${TEST_SKILL_NAME}"`);
  } catch (err) {
    fail("removeSkill", err instanceof Error ? err.message : String(err));
  }

  // ────────────────────────────────────────────────────────────────────────
  header("10. Confirm Empty");
  // ────────────────────────────────────────────────────────────────────────

  const postRemoveSkills = await listSkills();
  if (postRemoveSkills.length === 0) {
    ok("post-remove listSkills", "0 skills — directory is clean");
  } else {
    fail("post-remove listSkills", `expected 0, got ${postRemoveSkills.length}`);
  }

  const postRemoveToolList = JSON.parse(await skillTool.execute({ action: "list" }));
  if (postRemoveToolList.ok && postRemoveToolList.data.count === 0) {
    ok("post-remove use_skill list", "tool also reports 0 skills");
  } else {
    fail("post-remove use_skill list", JSON.stringify(postRemoveToolList));
  }
}

function summary() {
  console.log(`\n${"=".repeat(65)}`);
  console.log(`  TOTAL: ${passed + failed}  \u2705 ${passed} passed  \u274C ${failed} failed`);
  console.log(`${"=".repeat(65)}\n`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  restoreHome();
  console.error("Fatal:", err);
  process.exit(1);
});
