/**
 * Language preset — Bash / POSIX shell.
 */

import type { Language } from "../types.js";

export const bash: Language = {
  id: "bash",
  displayName: "Bash",
  aliases: ["sh", "shell", "zsh"],
  rules: [
    { pattern: /#.*$/gm,                   kind: "comment"  },
    { pattern: /"(?:[^"\\]|\\.)*"/g,       kind: "string"   },
    { pattern: /'[^']*'/g,                 kind: "string"   },
    { pattern: /\$\w+/g,                   kind: "variable" },
    { pattern: /\$\{[^}]+\}/g,             kind: "variable" },
    {
      pattern: /\b(if|then|else|elif|fi|for|do|done|while|until|case|esac|in|function|return|local|export|source|alias|unalias|eval|exec|exit|set|unset|shift|trap|wait)\b/g,
      kind: "keyword",
    },
    {
      pattern: /\b(echo|cd|ls|cat|grep|sed|awk|find|sort|head|tail|wc|cut|tr|xargs|mkdir|rm|cp|mv|chmod|chown|curl|wget|git|npm|bun|node|python)\b/g,
      kind: "builtin",
    },
  ],
};
