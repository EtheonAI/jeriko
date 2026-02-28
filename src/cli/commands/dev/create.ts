import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { mkdirSync, writeFileSync, existsSync, cpSync, readdirSync } from "node:fs";
import { resolve, join, dirname } from "node:path";
import { homedir } from "node:os";

// ---------------------------------------------------------------------------
// Template registry
// ---------------------------------------------------------------------------

interface TemplateInfo {
  name: string;
  description: string;
  category: "webdev" | "deploy" | "inline";
  /** Subdirectory under templates/ (e.g. "webdev/web-static" or "deploy/portfolio-template") */
  dir?: string;
}

const TEMPLATES: TemplateInfo[] = [
  // Webdev (pre-built full-stack)
  { name: "web-static", description: "Vite + React 19 + Tailwind 4 + shadcn/ui + Wouter + Framer Motion", category: "webdev", dir: "webdev/web-static" },
  { name: "web-db-user", description: "web-static + Express + Drizzle ORM + tRPC + JWT auth + database", category: "webdev", dir: "webdev/web-db-user" },

  // Deploy — Portfolios
  { name: "portfolio", description: "Clean portfolio website", category: "deploy", dir: "deploy/portfolio-template" },
  { name: "minimal-portfolio", description: "Minimal portfolio with clean design", category: "deploy", dir: "deploy/minimal-portfolio-template" },
  { name: "tech-portfolio", description: "Tech-focused portfolio", category: "deploy", dir: "deploy/tech-portfolio-template" },
  { name: "neo-portfolio", description: "Neo/modern portfolio", category: "deploy", dir: "deploy/neo-portfolio-template" },
  { name: "emoji-portfolio", description: "Fun emoji-styled portfolio", category: "deploy", dir: "deploy/emoji-portfolio-template" },
  { name: "freelance-portfolio", description: "Freelancer portfolio", category: "deploy", dir: "deploy/freelance-portfolio-template" },
  { name: "loud-portfolio", description: "Bold loud portfolio", category: "deploy", dir: "deploy/loud-portfolio-template" },
  { name: "prologue-portfolio", description: "Prologue-style portfolio", category: "deploy", dir: "deploy/prologue-portfolio-template" },
  { name: "bnw-landing", description: "Black & white landing page", category: "deploy", dir: "deploy/bnw-landing-template" },

  // Deploy — Dashboards
  { name: "dashboard", description: "Admin dashboard", category: "deploy", dir: "deploy/dashboard-template" },
  { name: "bold-dashboard", description: "Bold styled dashboard", category: "deploy", dir: "deploy/bold-dashboard-template" },
  { name: "dark-dashboard", description: "Dark theme dashboard", category: "deploy", dir: "deploy/dark-dashboard-template" },
  { name: "cyber-dashboard", description: "Cyberpunk dashboard", category: "deploy", dir: "deploy/cyber-dashboard-template" },

  // Deploy — Events
  { name: "event", description: "Event page", category: "deploy", dir: "deploy/event-template" },
  { name: "charity-event", description: "Charity event page", category: "deploy", dir: "deploy/charity-event-template" },
  { name: "dynamic-event", description: "Dynamic event page", category: "deploy", dir: "deploy/dynamic-event-template" },
  { name: "elegant-wedding", description: "Elegant wedding page", category: "deploy", dir: "deploy/elegant-wedding-template" },
  { name: "minimal-event", description: "Minimal event page", category: "deploy", dir: "deploy/minimal-event-template" },
  { name: "night-event", description: "Night event page", category: "deploy", dir: "deploy/night-event-template" },
  { name: "whimsical-event", description: "Whimsical event page", category: "deploy", dir: "deploy/whimsical-event-template" },
  { name: "zen-event", description: "Zen-styled event page", category: "deploy", dir: "deploy/zen-event-template" },

  // Deploy — Landing pages
  { name: "landing-page", description: "Landing page", category: "deploy", dir: "deploy/landing-page-template" },
  { name: "mobile-landing", description: "Mobile app landing page", category: "deploy", dir: "deploy/mobile-landing-template" },
  { name: "pixel-landing", description: "Pixel art landing page", category: "deploy", dir: "deploy/pixel-landing-template" },
  { name: "professional-landing", description: "Professional landing page", category: "deploy", dir: "deploy/professional-landing-template" },
  { name: "services-landing", description: "Services landing page", category: "deploy", dir: "deploy/services-landing-template" },
  { name: "tech-landing", description: "Tech landing page", category: "deploy", dir: "deploy/tech-landing-template" },

  // Deploy — Frameworks
  { name: "react", description: "React + Vite + Tailwind (deploy-ready)", category: "deploy", dir: "deploy/react" },
  { name: "react-js", description: "React JS (no TypeScript, deploy-ready)", category: "deploy", dir: "deploy/react-js" },
  { name: "nextjs", description: "Next.js with App Router (deploy-ready)", category: "deploy", dir: "deploy/next" },
  { name: "flask", description: "Flask Python web app (deploy-ready)", category: "deploy", dir: "deploy/flask" },

  // Inline (generated on the fly, no pre-built directory)
  { name: "node", description: "Node.js project (package.json + tsconfig)", category: "inline" },
  { name: "api", description: "Express/Hono API server", category: "inline" },
  { name: "cli", description: "CLI tool with jeriko patterns", category: "inline" },
  { name: "plugin", description: "Jeriko plugin scaffold", category: "inline" },
];

const TEMPLATE_MAP = new Map(TEMPLATES.map((t) => [t.name, t]));
const PROJECTS_DIR = join(homedir(), ".jeriko", "projects");

// ---------------------------------------------------------------------------
// Template resolution
// ---------------------------------------------------------------------------

/**
 * Locate a template directory on disk. Search order:
 *  1. Adjacent to the compiled binary (installed via install.sh)
 *  2. Repo root (dev mode: cwd is repo root)
 *  3. Installed library path (~/.local/lib/jeriko/templates/)
 */
function findTemplateDir(relPath: string): string | null {
  const candidates = [
    join(dirname(process.execPath), "..", "lib", "jeriko", "templates", relPath),
    join(process.cwd(), "templates", relPath),
    join(homedir(), ".local", "lib", "jeriko", "templates", relPath),
  ];

  for (const candidate of candidates) {
    if (existsSync(candidate)) return candidate;
  }
  return null;
}

/**
 * Deploy templates have inconsistent structures:
 *  - Some are FLAT (files directly in template dir: react, next, flask, etc.)
 *  - Some have a single subdirectory (e.g. portfolio-template/portfolio-new/)
 *  - Some have a template-website/ subdirectory
 *
 * This function resolves to the actual project root to copy.
 */
function resolveDeployDir(templateDir: string): string {
  const entries = readdirSync(templateDir, { withFileTypes: true });

  // Filter out metadata files
  const meaningful = entries.filter(
    (e) => e.name !== ".manus-template-version" && e.name !== ".DS_Store",
  );

  // If there's a package.json or index.html at root, it's flat — use as-is
  if (meaningful.some((e) => e.name === "package.json" || e.name === "index.html" || e.name === "requirements.txt")) {
    return templateDir;
  }

  // If there's exactly one subdirectory, descend into it
  const dirs = meaningful.filter((e) => e.isDirectory());
  if (dirs.length === 1 && dirs[0]) {
    const sub = join(templateDir, dirs[0].name);
    return sub;
  }

  // Check for template-website/ specifically
  const tw = join(templateDir, "template-website");
  if (existsSync(tw)) return tw;

  // Fallback: use root
  return templateDir;
}

// ---------------------------------------------------------------------------
// Help & list
// ---------------------------------------------------------------------------

function printHelp(): void {
  console.log("Usage: jeriko create <template> <name> [options]");
  console.log("\nScaffold a new project from a template.");
  console.log("\nFlags:");
  console.log("  --list            List all available templates");
  console.log("  --dir <path>      Output directory (default: ~/.jeriko/projects/<name>)");
  console.log("  --git             Initialize git repo");
  console.log("  --dev             Start dev server after creation");
  console.log("\nRun 'jeriko create --list' to see all templates.");
}

function printTemplateList(): void {
  console.log("Available templates:\n");

  const categories: Array<{ label: string; key: string }> = [
    { label: "Full-Stack (pre-built, instant)", key: "webdev" },
    { label: "Portfolios", key: "portfolio" },
    { label: "Dashboards", key: "dashboard" },
    { label: "Events", key: "event" },
    { label: "Landing Pages", key: "landing" },
    { label: "Frameworks", key: "framework" },
    { label: "Scaffolds (generated)", key: "inline" },
  ];

  for (const cat of categories) {
    let filtered: TemplateInfo[];
    if (cat.key === "webdev") {
      filtered = TEMPLATES.filter((t) => t.category === "webdev");
    } else if (cat.key === "inline") {
      filtered = TEMPLATES.filter((t) => t.category === "inline");
    } else if (cat.key === "portfolio") {
      filtered = TEMPLATES.filter((t) => t.category === "deploy" && (t.name.includes("portfolio") || t.name === "bnw-landing"));
    } else if (cat.key === "dashboard") {
      filtered = TEMPLATES.filter((t) => t.category === "deploy" && t.name.includes("dashboard"));
    } else if (cat.key === "event") {
      filtered = TEMPLATES.filter((t) => t.category === "deploy" && (t.name.includes("event") || t.name.includes("wedding")));
    } else if (cat.key === "landing") {
      filtered = TEMPLATES.filter((t) => t.category === "deploy" && t.name.includes("landing") && !t.name.includes("portfolio") && t.name !== "bnw-landing");
    } else if (cat.key === "framework") {
      filtered = TEMPLATES.filter((t) => t.category === "deploy" && ["react", "react-js", "nextjs", "flask"].includes(t.name));
    } else {
      continue;
    }

    if (filtered.length === 0) continue;
    console.log(`  ${cat.label}:`);
    const maxLen = Math.max(...filtered.map((t) => t.name.length));
    for (const t of filtered) {
      const pad = " ".repeat(maxLen - t.name.length + 2);
      console.log(`    ${t.name}${pad}${t.description}`);
    }
    console.log();
  }

  console.log("Usage: jeriko create <template> <name>");
}

// ---------------------------------------------------------------------------
// Command
// ---------------------------------------------------------------------------

export const command: CommandHandler = {
  name: "create",
  description: "Scaffold new project from template",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      printHelp();
      process.exit(0);
    }

    if (flagBool(parsed, "list")) {
      printTemplateList();
      process.exit(0);
    }

    const template = parsed.positional[0];
    const name = parsed.positional[1];
    if (!template) fail("Missing template. Run 'jeriko create --list' to see all templates.");
    if (!name) fail("Missing project name. Usage: jeriko create <template> <name>");

    const info = TEMPLATE_MAP.get(template);
    if (!info) {
      // Fuzzy suggest
      const similar = TEMPLATES.filter((t) => t.name.includes(template) || template.includes(t.name));
      let msg = `Unknown template: "${template}"`;
      if (similar.length > 0) {
        msg += `\n\nDid you mean?\n${similar.map((s) => `  ${s.name}`).join("\n")}`;
      }
      msg += "\n\nRun 'jeriko create --list' to see all templates.";
      fail(msg);
      return;
    }

    const initGit = flagBool(parsed, "git");
    const startDev = flagBool(parsed, "dev");

    // Rich templates (webdev + deploy) — copy from disk
    if (info.category === "webdev" || info.category === "deploy") {
      if (!info.dir) {
        fail(`Template "${template}" has no directory configured.`);
        return;
      }

      const templateDir = findTemplateDir(info.dir);
      if (!templateDir) {
        fail(`Template "${template}" not found on disk. Searched:\n` +
          `  ${join(dirname(process.execPath), "..", "lib", "jeriko", "templates", info.dir)}\n` +
          `  ${join(process.cwd(), "templates", info.dir)}\n` +
          `  ${join(homedir(), ".local", "lib", "jeriko", "templates", info.dir)}`);
        return;
      }

      // For deploy templates, resolve to the actual project root
      const sourceDir = info.category === "deploy" ? resolveDeployDir(templateDir) : templateDir;

      const dir = resolve(flagStr(parsed, "dir", "") || join(PROJECTS_DIR, name));
      if (existsSync(dir)) fail(`Directory already exists: "${dir}"`);

      mkdirSync(dir, { recursive: true });
      cpSync(sourceDir, dir, { recursive: true });

      // Remove metadata files
      const metaFiles = [".manus-template-version", ".DS_Store"];
      for (const meta of metaFiles) {
        const metaPath = join(dir, meta);
        try { if (existsSync(metaPath)) { const { unlinkSync } = await import("node:fs"); unlinkSync(metaPath); } } catch { /* ignore */ }
      }

      const files = countFiles(dir);

      if (initGit) {
        const { execSync } = await import("node:child_process");
        execSync("git init", { cwd: dir, encoding: "utf-8" });
      }

      if (startDev) {
        console.log(`\nInstalling dependencies and starting dev server...`);
        const { execSync } = await import("node:child_process");
        try {
          // Detect package manager
          const hasPnpmLock = existsSync(join(dir, "pnpm-lock.yaml"));
          const hasRequirements = existsSync(join(dir, "requirements.txt"));
          if (hasRequirements) {
            execSync("python3 -m venv venv && ./venv/bin/pip install -r requirements.txt", { cwd: dir, encoding: "utf-8", stdio: "inherit" });
            execSync("./venv/bin/python src/main.py", { cwd: dir, encoding: "utf-8", stdio: "inherit" });
          } else if (hasPnpmLock) {
            execSync("pnpm install --no-frozen-lockfile", { cwd: dir, encoding: "utf-8", stdio: "inherit" });
            execSync("pnpm run dev", { cwd: dir, encoding: "utf-8", stdio: "inherit" });
          } else {
            execSync("npm install", { cwd: dir, encoding: "utf-8", stdio: "inherit" });
            execSync("npm run dev", { cwd: dir, encoding: "utf-8", stdio: "inherit" });
          }
        } catch {
          // Dev server was stopped or install failed — non-fatal
        }
      }

      ok({ name, template, category: info.category, directory: dir, files });
      return;
    }

    // Inline templates (node, api, cli, plugin) — generated on the fly
    const dir = resolve(flagStr(parsed, "dir", "") || `./${name}`);
    if (existsSync(dir)) fail(`Directory already exists: "${dir}"`);

    mkdirSync(dir, { recursive: true });
    mkdirSync(join(dir, "src"), { recursive: true });

    writeFileSync(
      join(dir, "package.json"),
      JSON.stringify(
        {
          name,
          version: "0.1.0",
          type: "module",
          scripts: {
            build: "tsc",
            dev: "tsx watch src/index.ts",
            start: "node dist/index.js",
          },
          devDependencies: {
            typescript: "^5.0.0",
            tsx: "^4.0.0",
          },
        },
        null,
        2,
      ) + "\n",
    );

    writeFileSync(
      join(dir, "tsconfig.json"),
      JSON.stringify(
        {
          compilerOptions: {
            target: "ES2022",
            module: "Node16",
            moduleResolution: "Node16",
            outDir: "dist",
            rootDir: "src",
            strict: true,
            esModuleInterop: true,
            skipLibCheck: true,
          },
          include: ["src"],
        },
        null,
        2,
      ) + "\n",
    );

    writeFileSync(join(dir, "src", "index.ts"), `console.log("Hello from ${name}");\n`);
    writeFileSync(join(dir, ".gitignore"), "node_modules/\ndist/\n.env\n");

    const created = ["package.json", "tsconfig.json", "src/index.ts", ".gitignore"];

    if (initGit) {
      const { execSync } = await import("node:child_process");
      execSync("git init", { cwd: dir, encoding: "utf-8" });
      created.push(".git/");
    }

    ok({ name, template, category: "inline", directory: dir, files: created.length });
  },
};

function countFiles(dir: string): number {
  let count = 0;
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      if (entry.name === "node_modules" || entry.name === ".git") continue;
      if (entry.isDirectory()) {
        count += countFiles(join(dir, entry.name));
      } else {
        count++;
      }
    }
  } catch { /* ignore */ }
  return count;
}
