export default function Home() {
  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">Jeriko</p>
        <h1>Unix-first autonomous AI for your OS</h1>
        <p className="lead">
          Jeriko runs as a local daemon and CLI, using shell commands and native OS capabilities
          instead of brittle tool abstractions.
        </p>
        <div className="actions">
          <a href="https://github.com/khaleel737/jeriko" target="_blank" rel="noreferrer">
            View GitHub
          </a>
          <a href="#features">See Features</a>
        </div>
      </section>

      <section id="features" className="grid">
        <article>
          <h2>Daemon Core</h2>
          <p>Always-on kernel with agent loop, scheduling, channels, and connector services.</p>
        </article>
        <article>
          <h2>CLI First</h2>
          <p>Composable command interface for AI and humans. Unix pipelines are first-class.</p>
        </article>
        <article>
          <h2>Cross Platform</h2>
          <p>Built with Bun + TypeScript, targeting macOS, Linux, and Windows.</p>
        </article>
      </section>

      <footer className="footer">
        <p>&copy; {new Date().getFullYear()} Jeriko. All rights reserved.</p>
        <nav>
          <a href="/privacy-policy">Privacy Policy</a>
          <a href="/terms-and-conditions">Terms &amp; Conditions</a>
        </nav>
      </footer>
    </main>
  );
}
