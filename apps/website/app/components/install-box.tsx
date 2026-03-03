"use client";

import { useState } from "react";
import { PLATFORMS } from "../../lib/install";

/**
 * Platform tab-switcher with copy-to-clipboard.
 * Renders the install one-liner for each supported platform.
 * Used on the homepage and anywhere else an install prompt is needed.
 */
export function InstallBox() {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(PLATFORMS[active].command);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="install">
      <div className="install-tabs">
        {PLATFORMS.map((p, i) => (
          <button
            key={p.label}
            className={`install-tab${i === active ? " active" : ""}`}
            onClick={() => setActive(i)}
          >
            {p.label}
          </button>
        ))}
        <button className="install-copy" onClick={copy}>
          {copied ? "Copied!" : "Copy"}
        </button>
      </div>
      <pre>
        <code>{PLATFORMS[active].command}</code>
      </pre>
    </div>
  );
}
