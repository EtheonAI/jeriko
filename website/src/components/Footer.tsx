export default function Footer() {
  return (
    <footer className="relative border-t border-white/[0.06] py-16 px-6">
      <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-6">
        <div className="flex items-center gap-3">
          <span className="font-mono text-sm font-bold gradient-text">
            JerikoBot
          </span>
          <span className="text-foreground/20 text-sm">by Etheon</span>
        </div>

        <div className="flex items-center gap-6 text-sm text-foreground/25">
          <span>MIT License</span>
          <a
            href="https://github.com/etheon/jerikobot"
            target="_blank"
            rel="noopener noreferrer"
            className="hover:text-foreground/50 transition-colors"
          >
            GitHub
          </a>
          <span>&copy; 2026</span>
        </div>
      </div>
    </footer>
  );
}
