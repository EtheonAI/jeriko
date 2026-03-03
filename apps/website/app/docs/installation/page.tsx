import type { Metadata } from "next";
import { CodeBlock } from "../components/code-block";
import { PLATFORMS } from "../../../lib/install";

export const metadata: Metadata = {
  title: "Installation | Jeriko",
  description: "Install Jeriko on macOS, Linux, or Windows in one command.",
};

export default function InstallationPage() {
  return (
    <article>
      <h1>Installation</h1>
      <p>
        Jeriko installs as a single binary — no runtime dependencies. Pick your
        platform and run the one-liner.
      </p>

      <h2>Quick Install</h2>
      <CodeBlock
        tabs={PLATFORMS.map((p) => ({
          label: p.label,
          code: p.command,
        }))}
      />

      <h2>Verify</h2>
      <CodeBlock tabs={[{ label: "Shell", code: "jeriko --version" }]} />

      <h2>Get Started</h2>
      <p>
        Run the setup wizard, then start chatting:
      </p>
      <CodeBlock
        tabs={[
          {
            label: "Setup Wizard",
            code: `# Interactive setup — configures AI provider, channels, and connectors
jeriko init`,
          },
          {
            label: "Interactive Chat",
            code: `# Start the AI chat interface
jeriko`,
          },
          {
            label: "Run a Command",
            code: `# Check system info
jeriko sys --format text

# Start the daemon
jeriko server start`,
          },
        ]}
      />

      <h2>Build from Source</h2>
      <p>
        Requires <a href="https://bun.sh" target="_blank" rel="noreferrer">Bun</a> v1.1+.
      </p>
      <CodeBlock
        tabs={[
          {
            label: "Shell",
            code: `git clone https://github.com/khaleel737/jeriko.git
cd jeriko
bun install
bun run build
./jeriko install`,
          },
        ]}
      />

      <h2>System Requirements</h2>
      <div className="docs-requirements">
        <div className="docs-requirement">
          <strong>macOS</strong>
          <span>12 Monterey or later (ARM / Intel)</span>
        </div>
        <div className="docs-requirement">
          <strong>Linux</strong>
          <span>x86_64 or ARM64, glibc 2.17+</span>
        </div>
        <div className="docs-requirement">
          <strong>Windows</strong>
          <span>10 or later (x64)</span>
        </div>
        <div className="docs-requirement">
          <strong>Disk</strong>
          <span>~100 MB for the binary + data</span>
        </div>
      </div>

      <h2>Update</h2>
      <CodeBlock tabs={[{ label: "Shell", code: "jeriko update" }]} />

      <h2>Uninstall</h2>
      <CodeBlock
        tabs={PLATFORMS.map((p) => ({
          label: p.label,
          code: p.uninstall,
        }))}
      />
    </article>
  );
}
