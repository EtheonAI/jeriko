import type { CommandHandler } from "../../dispatcher.js";
import { parseArgs, flagBool, flagStr } from "../../../shared/args.js";
import { ok, fail } from "../../../shared/output.js";
import { readFileSync, existsSync, mkdirSync, unlinkSync } from "node:fs";
import { resolve, extname, basename, dirname, join } from "node:path";
import { execSync } from "node:child_process";
import { platform, tmpdir } from "node:os";

export const command: CommandHandler = {
  name: "doc",
  description: "Documents — read, convert, create slides & PDFs",
  async run(args: string[]) {
    const parsed = parseArgs(args);

    if (flagBool(parsed, "help")) {
      printHelp();
      process.exit(0);
    }

    const action = parsed.positional[0];

    // Backward compat: if first arg looks like a file path, treat as "read"
    if (action && !ACTIONS.has(action) && (action.includes(".") || action.includes("/"))) {
      return readDocument(action, parsed);
    }

    if (!action) fail("Missing action. Run: jeriko doc --help");

    switch (action) {
      case "read":
        return readDocument(parsed.positional[1]!, parsed);
      case "convert":
        return convertDocument(parsed);
      case "create":
        return createDocument(parsed);
      case "list-formats":
        return listFormats();
      default:
        fail(`Unknown action: "${action}". Run: jeriko doc --help`);
    }
  },
};

const ACTIONS = new Set(["read", "convert", "create", "list-formats"]);

// ---------------------------------------------------------------------------
// Help
// ---------------------------------------------------------------------------

function printHelp() {
  console.log(`Usage: jeriko doc <action> [options]

Actions:
  read <file>              Extract text from document
  convert <file>           Convert between formats
  create <type> [options]  Create PDF, slides, or documents
  list-formats             Show supported conversions

Read:
  jeriko doc read report.pdf
  jeriko doc read data.xlsx --sheet Sales
  jeriko doc report.docx                   (shorthand)

Convert:
  jeriko doc convert README.md --to pdf
  jeriko doc convert paper.md --to docx
  jeriko doc convert report.docx --to pdf
  jeriko doc convert slides.md --to pptx
  jeriko doc convert data.csv --to xlsx
  jeriko doc convert page.html --to pdf
  jeriko doc convert image.png --to pdf

  Flags:
    --to <format>      Target format (pdf, docx, html, txt, rtf, odt, pptx, csv, xlsx)
    --output <path>    Output file path (default: same name, new extension)
    --template <file>  Pandoc/LaTeX template for styled output

Create:
  jeriko doc create pdf --from notes.md
  jeriko doc create slides --from talk.md
  jeriko doc create slides --from talk.md --theme moon

  Types: pdf, slides
  Flags:
    --from <file>      Source markdown/html file
    --output <path>    Output file path
    --theme <name>     Slide theme (reveal.js: moon, black, white, league, beige, sky, night, serif, simple, solarized)
    --engine <name>    Slide engine: revealjs (default) or beamer (PDF)

Dependencies (installed via system package manager):
  macOS:   textutil (built-in), pdftotext (brew install poppler), pandoc (brew install pandoc)
  Linux:   pdftotext (apt install poppler-utils), pandoc (apt install pandoc), libreoffice (apt install libreoffice)
  Note:    textutil handles many conversions on macOS without pandoc`);
}

// ---------------------------------------------------------------------------
// Tool detection
// ---------------------------------------------------------------------------

function hasTool(name: string): boolean {
  // Validate tool name: only allow alphanumeric + hyphen + underscore
  if (!/^[a-zA-Z0-9_-]+$/.test(name)) return false;
  try {
    execSync(`which ${name}`, { encoding: "utf-8", stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function requireTool(name: string, installHint: string): void {
  if (!hasTool(name)) {
    fail(`"${name}" is required but not installed. Install with: ${installHint}`);
  }
}

function escShell(s: string): string {
  return `'${s.replace(/'/g, "'\"'\"'")}'`;
}

// ---------------------------------------------------------------------------
// READ — extract text content from any document
// ---------------------------------------------------------------------------

function readDocument(file: string | undefined, parsed: ReturnType<typeof parseArgs>) {
  if (!file) fail("Missing file path. Usage: jeriko doc read <file>");
  const fullPath = resolve(file);
  if (!existsSync(fullPath)) fail(`File not found: "${fullPath}"`, 5);

  const ext = extname(fullPath).toLowerCase();

  switch (ext) {
    // ── Plain text formats ──────────────────────────────────────
    case ".txt":
    case ".md":
    case ".csv":
    case ".json":
    case ".xml":
    case ".yaml":
    case ".yml":
    case ".toml":
    case ".ini":
    case ".log":
    case ".env":
    case ".html":
    case ".htm":
    case ".css":
    case ".js":
    case ".ts":
    case ".py":
    case ".sh":
    case ".sql": {
      const content = readFileSync(fullPath, "utf-8");
      ok({ path: fullPath, format: ext.slice(1), content, size: content.length });
      break;
    }

    // ── PDF ─────────────────────────────────────────────────────
    case ".pdf": {
      const content = readPdf(fullPath, parsed);
      ok({ path: fullPath, format: "pdf", content, size: content.length });
      break;
    }

    // ── Word (.docx, .doc) ──────────────────────────────────────
    case ".docx":
    case ".doc": {
      const content = readWord(fullPath);
      ok({ path: fullPath, format: ext.slice(1), content, size: content.length });
      break;
    }

    // ── Rich text / OpenDocument ────────────────────────────────
    case ".rtf":
    case ".odt": {
      const content = readViaTextutil(fullPath, ext);
      ok({ path: fullPath, format: ext.slice(1), content, size: content.length });
      break;
    }

    // ── Excel (.xlsx, .xls) ─────────────────────────────────────
    case ".xlsx":
    case ".xls": {
      const content = readExcel(fullPath, parsed);
      ok({ path: fullPath, format: ext.slice(1), content, size: content.length });
      break;
    }

    // ── PowerPoint ──────────────────────────────────────────────
    case ".pptx":
    case ".ppt": {
      const content = readPresentation(fullPath);
      ok({ path: fullPath, format: ext.slice(1), content, size: content.length });
      break;
    }

    default:
      fail(`Unsupported format: "${ext}". Run: jeriko doc list-formats`);
  }
}

function readPdf(fullPath: string, parsed: ReturnType<typeof parseArgs>): string {
  const pages = flagStr(parsed, "pages", "");

  // Try pdftotext (poppler)
  if (hasTool("pdftotext")) {
    const pageFlag = pages ? `-f ${pages.split("-")[0]} -l ${pages.split("-")[1] || pages.split("-")[0]}` : "";
    try {
      return execSync(
        `pdftotext ${pageFlag} ${escShell(fullPath)} -`,
        { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024, timeout: 30000 },
      ).trim();
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      fail(`pdftotext failed: ${msg}`);
    }
  }

  // Try pandoc
  if (hasTool("pandoc")) {
    try {
      return execSync(
        `pandoc -f pdf -t plain ${escShell(fullPath)}`,
        { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024, timeout: 30000 },
      ).trim();
    } catch { /* fall through */ }
  }

  fail("PDF reading requires pdftotext. Install: brew install poppler (macOS) / apt install poppler-utils (Linux)");
}

function readWord(fullPath: string): string {
  const os = platform();

  // macOS: textutil is built-in
  if (os === "darwin") {
    return readViaTextutil(fullPath, ".docx");
  }

  // pandoc fallback
  if (hasTool("pandoc")) {
    try {
      return execSync(
        `pandoc -t plain ${escShell(fullPath)}`,
        { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024, timeout: 30000 },
      ).trim();
    } catch { /* fall through */ }
  }

  // libreoffice fallback
  if (hasTool("libreoffice")) {
    return readViaLibreOffice(fullPath, "txt");
  }

  fail("DOCX reading requires textutil (macOS), pandoc, or libreoffice");
}

function readViaTextutil(fullPath: string, _ext: string): string {
  if (platform() !== "darwin") {
    if (hasTool("pandoc")) {
      return execSync(
        `pandoc -t plain ${escShell(fullPath)}`,
        { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024, timeout: 30000 },
      ).trim();
    }
    fail(`Reading ${_ext} files on Linux requires pandoc. Install: apt install pandoc`);
  }
  const tmp = join(tmpdir(), `jeriko-read-${Date.now()}.txt`);
  try {
    execSync(
      `textutil -convert txt -output ${escShell(tmp)} ${escShell(fullPath)}`,
      { encoding: "utf-8", timeout: 15000 },
    );
    const content = readFileSync(tmp, "utf-8").trim();
    unlinkSync(tmp);
    return content;
  } catch (err: unknown) {
    try { unlinkSync(tmp); } catch {}
    const msg = err instanceof Error ? err.message : String(err);
    fail(`textutil failed: ${msg}`);
  }
}

function readExcel(fullPath: string, parsed: ReturnType<typeof parseArgs>): string {
  const sheet = flagStr(parsed, "sheet", "");

  // Try in2csv (csvkit)
  if (hasTool("in2csv")) {
    const sheetFlag = sheet ? `--sheet ${escShell(sheet)}` : "";
    try {
      return execSync(
        `in2csv ${sheetFlag} ${escShell(fullPath)}`,
        { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024, timeout: 30000 },
      ).trim();
    } catch { /* fall through */ }
  }

  // Try libreoffice
  if (hasTool("libreoffice")) {
    return readViaLibreOffice(fullPath, "csv");
  }

  // Try ssconvert (gnumeric)
  if (hasTool("ssconvert")) {
    const tmp = join(tmpdir(), `jeriko-read-${Date.now()}.csv`);
    try {
      execSync(
        `ssconvert ${escShell(fullPath)} ${escShell(tmp)}`,
        { encoding: "utf-8", timeout: 30000 },
      );
      const content = readFileSync(tmp, "utf-8").trim();
      unlinkSync(tmp);
      return content;
    } catch {
      try { unlinkSync(tmp); } catch {}
    }
  }

  fail("Excel reading requires in2csv (pip install csvkit), libreoffice, or ssconvert (gnumeric)");
}

function readPresentation(fullPath: string): string {
  if (hasTool("pandoc")) {
    try {
      return execSync(
        `pandoc -t plain ${escShell(fullPath)}`,
        { encoding: "utf-8", maxBuffer: 50 * 1024 * 1024, timeout: 30000 },
      ).trim();
    } catch { /* fall through */ }
  }

  if (hasTool("libreoffice")) {
    return readViaLibreOffice(fullPath, "txt");
  }

  fail("PPTX reading requires pandoc or libreoffice");
}

function readViaLibreOffice(fullPath: string, targetFmt: string): string {
  const tmp = join(tmpdir(), `jeriko-lo-${Date.now()}`);
  mkdirSync(tmp, { recursive: true });
  try {
    execSync(
      `libreoffice --headless --convert-to ${targetFmt} --outdir ${escShell(tmp)} ${escShell(fullPath)}`,
      { encoding: "utf-8", timeout: 60000 },
    );
    const base = basename(fullPath, extname(fullPath));
    const outFile = join(tmp, `${base}.${targetFmt}`);
    const content = readFileSync(outFile, "utf-8").trim();
    unlinkSync(outFile);
    return content;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    fail(`libreoffice conversion failed: ${msg}`);
  }
}

// ---------------------------------------------------------------------------
// CONVERT — transform between document formats
// ---------------------------------------------------------------------------

function convertDocument(parsed: ReturnType<typeof parseArgs>) {
  const file = parsed.positional[1];
  if (!file) fail("Missing file. Usage: jeriko doc convert <file> --to <format>");
  const fullPath = resolve(file);
  if (!existsSync(fullPath)) fail(`File not found: "${fullPath}"`, 5);

  const to = flagStr(parsed, "to", "");
  if (!to) fail("Missing --to flag. Usage: jeriko doc convert <file> --to pdf|docx|html|txt|rtf|odt|pptx|csv|xlsx");

  const template = flagStr(parsed, "template", "");
  const fromExt = extname(fullPath).toLowerCase().slice(1);
  const base = basename(fullPath, extname(fullPath));
  const outDir = dirname(fullPath);
  const output = resolve(flagStr(parsed, "output", join(outDir, `${base}.${to}`)));

  // Ensure output directory exists
  const outputDir = dirname(output);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  const os = platform();

  // ── macOS textutil conversions (built-in, no deps) ──────────
  const textutilFormats = new Set(["txt", "html", "rtf", "rtfd", "doc", "docx", "wordml", "odt", "webarchive"]);
  if (os === "darwin" && textutilFormats.has(fromExt) && textutilFormats.has(to)) {
    try {
      execSync(
        `textutil -convert ${to} -output ${escShell(output)} ${escShell(fullPath)}`,
        { encoding: "utf-8", timeout: 30000 },
      );
      ok({ converted: true, from: fromExt, to, input: fullPath, output, via: "textutil" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      fail(`textutil conversion failed: ${msg}`);
    }
    return;
  }

  // ── Image → PDF ─────────────────────────────────────────────
  const imageFormats = new Set(["png", "jpg", "jpeg", "gif", "bmp", "tiff", "tif", "webp"]);
  if (imageFormats.has(fromExt) && to === "pdf") {
    convertImageToPdf(fullPath, output);
    return;
  }

  // ── Pandoc (universal converter) ────────────────────────────
  if (hasTool("pandoc")) {
    try {
      const templateFlag = template ? `--template=${escShell(template)}` : "";
      // Special handling for pdf output (needs latex or wkhtmltopdf)
      let extraFlags = "";
      if (to === "pdf" && fromExt === "md") {
        // Try html→pdf engine if wkhtmltopdf available, else default to latex
        if (hasTool("wkhtmltopdf")) {
          extraFlags = "--pdf-engine=wkhtmltopdf";
        }
      }
      if (to === "pptx") {
        extraFlags = "-t pptx";
      }

      execSync(
        `pandoc ${escShell(fullPath)} -o ${escShell(output)} ${templateFlag} ${extraFlags}`.trim(),
        { encoding: "utf-8", timeout: 60000 },
      );
      ok({ converted: true, from: fromExt, to, input: fullPath, output, via: "pandoc" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // If pandoc fails for PDF (no latex), try textutil chain on macOS
      if (to === "pdf" && os === "darwin") {
        convertViaMacOSChain(fullPath, fromExt, output);
        return;
      }
      fail(`pandoc conversion failed: ${msg}`);
    }
    return;
  }

  // ── macOS chain: textutil → html → cupsfilter/sips for PDF ──
  if (to === "pdf" && os === "darwin" && textutilFormats.has(fromExt)) {
    convertViaMacOSChain(fullPath, fromExt, output);
    return;
  }

  // ── LibreOffice (headless) ──────────────────────────────────
  if (hasTool("libreoffice")) {
    try {
      const outDir = dirname(output);
      execSync(
        `libreoffice --headless --convert-to ${to} --outdir ${escShell(outDir)} ${escShell(fullPath)}`,
        { encoding: "utf-8", timeout: 120000 },
      );
      // LibreOffice uses its own naming; rename if needed
      const loOutput = join(outDir, `${base}.${to}`);
      if (loOutput !== output && existsSync(loOutput)) {
        execSync(`mv ${escShell(loOutput)} ${escShell(output)}`);
      }
      ok({ converted: true, from: fromExt, to, input: fullPath, output, via: "libreoffice" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      fail(`libreoffice conversion failed: ${msg}`);
    }
    return;
  }

  fail(
    `No converter available for ${fromExt} → ${to}. Install pandoc (brew install pandoc) or libreoffice.`,
  );
}

function convertImageToPdf(fullPath: string, output: string) {
  // Try sips + cupsfilter on macOS
  if (platform() === "darwin") {
    try {
      // sips can't make PDF, but Preview can via automator or we use cupsfilter
      execSync(
        `/usr/sbin/cupsfilter ${escShell(fullPath)} > ${escShell(output)} 2>/dev/null`,
        { encoding: "utf-8", timeout: 30000 },
      );
      ok({ converted: true, from: extname(fullPath).slice(1), to: "pdf", input: fullPath, output, via: "cupsfilter" });
      return;
    } catch { /* fall through */ }
  }

  // Try img2pdf
  if (hasTool("img2pdf")) {
    try {
      execSync(
        `img2pdf ${escShell(fullPath)} -o ${escShell(output)}`,
        { encoding: "utf-8", timeout: 30000 },
      );
      ok({ converted: true, from: extname(fullPath).slice(1), to: "pdf", input: fullPath, output, via: "img2pdf" });
      return;
    } catch { /* fall through */ }
  }

  // Try ImageMagick convert
  if (hasTool("convert")) {
    try {
      execSync(
        `convert ${escShell(fullPath)} ${escShell(output)}`,
        { encoding: "utf-8", timeout: 30000 },
      );
      ok({ converted: true, from: extname(fullPath).slice(1), to: "pdf", input: fullPath, output, via: "imagemagick" });
      return;
    } catch { /* fall through */ }
  }

  fail("Image→PDF requires cupsfilter (macOS), img2pdf (pip install img2pdf), or ImageMagick");
}

function convertViaMacOSChain(fullPath: string, fromExt: string, output: string) {
  // textutil → html → then cupsfilter to PDF
  const tmpHtml = join(tmpdir(), `jeriko-conv-${Date.now()}.html`);
  try {
    execSync(
      `textutil -convert html -output ${escShell(tmpHtml)} ${escShell(fullPath)}`,
      { encoding: "utf-8", timeout: 15000 },
    );
    execSync(
      `/usr/sbin/cupsfilter ${escShell(tmpHtml)} > ${escShell(output)} 2>/dev/null`,
      { encoding: "utf-8", timeout: 30000 },
    );
    try { unlinkSync(tmpHtml); } catch {}
    ok({ converted: true, from: fromExt, to: "pdf", input: fullPath, output, via: "textutil+cupsfilter" });
  } catch (err: unknown) {
    try { unlinkSync(tmpHtml); } catch {}
    const msg = err instanceof Error ? err.message : String(err);
    fail(`macOS PDF conversion failed: ${msg}. Install pandoc for reliable PDF: brew install pandoc`);
  }
}

// ---------------------------------------------------------------------------
// CREATE — generate PDFs, slide decks from markdown
// ---------------------------------------------------------------------------

function createDocument(parsed: ReturnType<typeof parseArgs>) {
  const docType = parsed.positional[1];
  if (!docType) fail("Missing type. Usage: jeriko doc create <pdf|slides> --from <file>");

  const from = flagStr(parsed, "from", "");
  if (!from) fail("Missing --from flag. Usage: jeriko doc create " + docType + " --from <file>");
  const fullPath = resolve(from);
  if (!existsSync(fullPath)) fail(`File not found: "${fullPath}"`, 5);

  switch (docType) {
    case "pdf":
      return createPdf(fullPath, parsed);
    case "slides":
      return createSlides(fullPath, parsed);
    default:
      fail(`Unknown document type: "${docType}". Use pdf or slides.`);
  }
}

function createPdf(fullPath: string, parsed: ReturnType<typeof parseArgs>) {
  const base = basename(fullPath, extname(fullPath));
  const outDir = dirname(fullPath);
  const output = resolve(flagStr(parsed, "output", join(outDir, `${base}.pdf`)));
  const template = flagStr(parsed, "template", "");
  const fromExt = extname(fullPath).toLowerCase().slice(1);

  // Ensure output directory exists
  const outputDir = dirname(output);
  if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

  // Try pandoc first (best quality)
  if (hasTool("pandoc")) {
    const templateFlag = template ? `--template=${escShell(template)}` : "";
    let engineFlag = "";
    if (hasTool("wkhtmltopdf")) {
      engineFlag = "--pdf-engine=wkhtmltopdf";
    } else if (hasTool("weasyprint")) {
      engineFlag = "--pdf-engine=weasyprint";
    }
    // pdflatex/xelatex are pandoc's defaults

    try {
      execSync(
        `pandoc ${escShell(fullPath)} -o ${escShell(output)} ${templateFlag} ${engineFlag} --standalone`.trim(),
        { encoding: "utf-8", timeout: 60000 },
      );
      ok({ created: true, type: "pdf", from: fullPath, output, via: "pandoc" });
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      // Fall through to macOS chain
      if (platform() === "darwin") {
        convertViaMacOSChain(fullPath, fromExt, output);
        return;
      }
      fail(`PDF creation failed: ${msg}`);
    }
    return;
  }

  // macOS fallback: textutil chain
  if (platform() === "darwin") {
    convertViaMacOSChain(fullPath, fromExt, output);
    return;
  }

  fail("PDF creation requires pandoc. Install: brew install pandoc (macOS) / apt install pandoc (Linux)");
}

function createSlides(fullPath: string, parsed: ReturnType<typeof parseArgs>) {
  const engine = flagStr(parsed, "engine", "revealjs");
  const theme = flagStr(parsed, "theme", "black");
  const base = basename(fullPath, extname(fullPath));
  const outDir = dirname(fullPath);

  requireTool("pandoc", "brew install pandoc (macOS) / apt install pandoc (Linux)");

  switch (engine) {
    case "revealjs": {
      const output = resolve(flagStr(parsed, "output", join(outDir, `${base}-slides.html`)));
      const outputDir = dirname(output);
      if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

      try {
        execSync(
          `pandoc ${escShell(fullPath)} -t revealjs -s --self-contained -V theme=${escShell(theme)} -o ${escShell(output)}`,
          { encoding: "utf-8", timeout: 60000 },
        );
        ok({
          created: true,
          type: "slides",
          engine: "revealjs",
          theme,
          from: fullPath,
          output,
          hint: `Open in browser: open ${output}`,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        fail(`Slide creation failed: ${msg}`);
      }
      break;
    }

    case "beamer": {
      const output = resolve(flagStr(parsed, "output", join(outDir, `${base}-slides.pdf`)));
      const outputDir = dirname(output);
      if (!existsSync(outputDir)) mkdirSync(outputDir, { recursive: true });

      try {
        const themeFlag = theme !== "black" ? `-V theme:${escShell(theme)}` : "";
        execSync(
          `pandoc ${escShell(fullPath)} -t beamer ${themeFlag} -o ${escShell(output)}`,
          { encoding: "utf-8", timeout: 60000 },
        );
        ok({
          created: true,
          type: "slides",
          engine: "beamer",
          theme,
          from: fullPath,
          output,
        });
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : String(err);
        fail(`Beamer slide creation failed: ${msg}. Ensure LaTeX is installed: brew install --cask mactex`);
      }
      break;
    }

    default:
      fail(`Unknown slide engine: "${engine}". Use revealjs or beamer.`);
  }
}

// ---------------------------------------------------------------------------
// LIST-FORMATS — show what conversions are available
// ---------------------------------------------------------------------------

function listFormats() {
  const os = platform();
  const tools: Record<string, boolean> = {
    textutil: os === "darwin", // always on macOS
    pdftotext: hasTool("pdftotext"),
    pandoc: hasTool("pandoc"),
    libreoffice: hasTool("libreoffice"),
    wkhtmltopdf: hasTool("wkhtmltopdf"),
    img2pdf: hasTool("img2pdf"),
    imagemagick: hasTool("convert"),
    cupsfilter: existsSync("/usr/sbin/cupsfilter"),
  };

  const conversions: Array<{ from: string; to: string; tool: string; available: boolean }> = [];

  // Always available: plain text reading
  const textFormats = ["txt", "md", "csv", "json", "xml", "yaml", "html"];
  for (const fmt of textFormats) {
    conversions.push({ from: fmt, to: "read", tool: "built-in", available: true });
  }

  // PDF reading
  conversions.push({ from: "pdf", to: "read/txt", tool: "pdftotext", available: !!tools.pdftotext });

  // Word reading
  conversions.push({ from: "docx", to: "read/txt", tool: os === "darwin" ? "textutil" : "pandoc", available: os === "darwin" || !!tools.pandoc });

  // textutil conversions (macOS)
  if (os === "darwin") {
    const tu = ["txt", "html", "rtf", "doc", "docx", "odt"];
    for (const f of tu) {
      for (const t of tu) {
        if (f !== t) conversions.push({ from: f, to: t, tool: "textutil", available: true });
      }
    }
  }

  // pandoc conversions
  if (tools.pandoc) {
    const pandocPairs = [
      ["md", "pdf"], ["md", "docx"], ["md", "html"], ["md", "rtf"], ["md", "odt"], ["md", "pptx"],
      ["html", "pdf"], ["html", "docx"], ["html", "md"],
      ["docx", "pdf"], ["docx", "md"], ["docx", "html"],
      ["rst", "pdf"], ["rst", "docx"], ["rst", "html"],
      ["csv", "html"], ["latex", "pdf"],
    ];
    for (const [f, t] of pandocPairs) {
      conversions.push({ from: f!, to: t!, tool: "pandoc", available: true });
    }
  }

  // Slides
  conversions.push({ from: "md", to: "slides (html)", tool: "pandoc+revealjs", available: !!tools.pandoc });
  conversions.push({ from: "md", to: "slides (pdf)", tool: "pandoc+beamer", available: !!tools.pandoc });

  // Image → PDF
  conversions.push({ from: "png/jpg/gif", to: "pdf", tool: "cupsfilter/img2pdf/imagemagick", available: !!tools.cupsfilter || !!tools.img2pdf || !!tools.imagemagick });

  ok({
    platform: os,
    tools,
    conversions: conversions.filter((c) => c.available),
    unavailable: conversions.filter((c) => !c.available),
  });
}
