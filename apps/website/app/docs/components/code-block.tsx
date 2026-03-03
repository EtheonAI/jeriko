"use client";

import { useState } from "react";

interface Tab {
  label: string;
  code: string;
}

interface CodeBlockProps {
  tabs: Tab[];
}

export function CodeBlock({ tabs }: CodeBlockProps) {
  const [active, setActive] = useState(0);
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await navigator.clipboard.writeText(tabs[active].code);
    setCopied(true);
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="docs-code">
      <div className="docs-code-tabs">
        {tabs.map((tab, i) => (
          <button
            key={tab.label}
            className={`docs-code-tab${i === active ? " active" : ""}`}
            onClick={() => setActive(i)}
          >
            {tab.label}
          </button>
        ))}
        <button className="docs-code-copy" onClick={copy} title="Copy to clipboard">
          {copied ? "Copied" : "Copy"}
        </button>
      </div>
      <pre className="docs-code-pre">
        <code>{tabs[active].code}</code>
      </pre>
    </div>
  );
}
