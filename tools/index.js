const { execSync } = require('child_process');
const path = require('path');
const browser = require('./browser');
const screenshot = require('./screenshot');
const files = require('./files');
const system = require('./system');
const shell = require('./shell');
const search = require('./search');

const JERIKO = path.join(__dirname, '..', 'bin', 'jeriko');

// Run a jeriko CLI command and return parsed JSON data or raw output
function jerikoExec(cmd, opts = {}) {
  try {
    const raw = execSync(`node ${JERIKO} ${cmd}`, {
      encoding: 'utf-8',
      timeout: opts.timeout || 30000,
      maxBuffer: 1024 * 512,
    });
    try {
      const parsed = JSON.parse(raw);
      return parsed.ok ? parsed.data : `Error: ${parsed.error}`;
    } catch {
      return raw.trim();
    }
  } catch (e) {
    const stderr = e.stderr?.toString() || '';
    try {
      const parsed = JSON.parse(stderr);
      return `Error: ${parsed.error}`;
    } catch {
      return `Error: ${e.message}`;
    }
  }
}

// Tool registry — maps command names to handler functions
const tools = {
  // Browser tools
  'browse': {
    description: 'Navigate to a URL and get page content',
    usage: '/browse <url>',
    handler: async (args) => {
      const url = args.trim();
      if (!url) return 'Usage: /browse <url>';
      const result = await browser.navigate(url);
      const text = await browser.getText();
      return `Navigated to: ${result.title}\nURL: ${result.url}\n\n${text.slice(0, 3000)}`;
    },
  },
  'screenshot_web': {
    description: 'Take a screenshot of the current browser page',
    usage: '/screenshot_web [url]',
    handler: async (args) => {
      if (args.trim()) await browser.navigate(args.trim());
      const result = await browser.screenshot();
      return { type: 'photo', path: result.path, caption: `Web screenshot: ${result.filename}` };
    },
  },
  'click': {
    description: 'Click an element on the page',
    usage: '/click <css-selector>',
    handler: async (args) => {
      const result = await browser.click(args.trim());
      return `Clicked: ${result.clicked}`;
    },
  },
  'type': {
    description: 'Type text into an input field',
    usage: '/type <selector> | <text>',
    handler: async (args) => {
      const [selector, ...textParts] = args.split('|');
      const text = textParts.join('|').trim();
      const result = await browser.type(selector.trim(), text);
      return `Typed "${result.typed}" into ${result.into}`;
    },
  },
  'links': {
    description: 'Get all links on the current page',
    usage: '/links',
    handler: async () => {
      const links = await browser.getLinks();
      return links.map((l, i) => `[${i}] ${l.text} → ${l.href}`).join('\n') || 'No links found';
    },
  },
  'js': {
    description: 'Execute JavaScript in the browser',
    usage: '/js <code>',
    handler: async (args) => {
      const result = await browser.evaluate(args.trim());
      return JSON.stringify(result, null, 2);
    },
  },

  // Desktop screenshot
  'screenshot': {
    description: 'Take a screenshot of the desktop',
    usage: '/screenshot',
    handler: async () => {
      const result = await screenshot.captureDesktop();
      return { type: 'photo', path: result.path, caption: `Desktop: ${result.filename}` };
    },
  },

  // File tools
  'ls': {
    description: 'List files in a directory',
    usage: '/ls <path>',
    handler: async (args) => {
      const dirPath = args.trim() || process.cwd();
      const entries = files.listDir(dirPath);
      return entries.map(e =>
        `${e.type === 'dir' ? '📁' : '📄'} ${e.name}${e.size !== null ? ` (${formatBytes(e.size)})` : ''}`
      ).join('\n') || 'Empty directory';
    },
  },
  'cat': {
    description: 'Read a file',
    usage: '/cat <path>',
    handler: async (args) => {
      const content = files.readFile(args.trim());
      if (typeof content === 'object' && content.error) return content.error;
      return content.slice(0, 4000);
    },
  },
  'write': {
    description: 'Write content to a file',
    usage: '/write <path> | <content>',
    handler: async (args) => {
      const [filePath, ...contentParts] = args.split('|');
      const content = contentParts.join('|').trim();
      const result = files.writeFile(filePath.trim(), content);
      return `Written ${result.bytes} bytes to ${result.written}`;
    },
  },
  'find': {
    description: 'Find files by name pattern',
    usage: '/find <dir> <pattern>',
    handler: async (args) => {
      const parts = args.trim().split(/\s+/);
      const dir = parts[0] || '.';
      const pattern = parts[1] || '*';
      const results = files.findFiles(dir, pattern);
      return results.join('\n') || 'No files found';
    },
  },
  'grep': {
    description: 'Search file contents',
    usage: '/grep <dir> <pattern>',
    handler: async (args) => {
      const parts = args.trim().split(/\s+/);
      const dir = parts[0] || '.';
      const pattern = parts.slice(1).join(' ');
      const results = files.searchFiles(dir, pattern);
      return results.join('\n') || 'No matches';
    },
  },
  'info': {
    description: 'Get file info',
    usage: '/info <path>',
    handler: async (args) => {
      const result = files.fileInfo(args.trim());
      return Object.entries(result).map(([k, v]) => `${k}: ${v}`).join('\n');
    },
  },

  // System tools
  'sysinfo': {
    description: 'Full system information',
    usage: '/sysinfo',
    handler: async () => {
      const info = await system.getSystemInfo();
      return [
        `Host: ${info.hostname}`,
        `OS: ${info.platform} (${info.arch})`,
        `CPU: ${info.cpu}`,
        `Load: ${info.cpuLoad}`,
        `Memory: ${info.memory.used} / ${info.memory.total} (${info.memory.percent})`,
        `Uptime: ${info.uptime}`,
        '',
        'Disks:',
        ...info.disks.map(d => `  ${d.mount}: ${d.used} / ${d.size} (${d.percent})`),
      ].join('\n');
    },
  },
  'ps': {
    description: 'Top processes by CPU',
    usage: '/ps [count]',
    handler: async (args) => {
      const limit = parseInt(args) || 10;
      const procs = await system.getProcesses({ limit });
      return procs.map(p =>
        `${p.pid} ${p.name} — CPU:${p.cpu} MEM:${p.mem} [${p.state}]`
      ).join('\n');
    },
  },
  'net': {
    description: 'Network information',
    usage: '/net',
    handler: async () => {
      const info = await system.getNetworkInfo();
      return info.interfaces
        .filter(i => i.ip4)
        .map(i => `${i.name}: ${i.ip4} (${i.type}, ${i.speed})`)
        .join('\n');
    },
  },
  'battery': {
    description: 'Battery status',
    usage: '/battery',
    handler: async () => {
      const b = await system.getBattery();
      if (!b.hasBattery) return 'No battery detected';
      return `Battery: ${b.percent} ${b.charging ? '(charging)' : ''}\nTime remaining: ${b.timeRemaining}`;
    },
  },

  // Shell
  'exec': {
    description: 'Execute a shell command',
    usage: '/exec <command>',
    handler: async (args) => {
      const result = await shell.exec(args.trim());
      let output = '';
      if (result.stdout) output += result.stdout;
      if (result.stderr) output += `\n[stderr] ${result.stderr}`;
      output += `\n[exit: ${result.code}]`;
      return output.trim();
    },
  },

  // Search
  'search': {
    description: 'Search the web',
    usage: '/search <query>',
    handler: async (args) => {
      const results = await search.webSearch(args.trim());
      return results.map(r =>
        `${r.title}\n${r.snippet}\n${r.url || ''}`
      ).join('\n\n');
    },
  },

  // ========== NEW COMMANDS (via CLI exec) ==========

  'camera': {
    description: 'Take a photo or video with webcam',
    usage: '/camera [--video --duration N]',
    handler: async (args) => {
      const flags = args.trim();
      const data = jerikoExec(`camera ${flags}`);
      if (typeof data === 'object' && data.path) {
        return { type: 'photo', path: data.path, caption: `Camera: ${data.filename}` };
      }
      return typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
    },
  },
  'email': {
    description: 'Read emails via IMAP',
    usage: '/email [--unread|--search <q>|--from <addr>]',
    handler: async (args) => {
      const data = jerikoExec(`email ${args.trim()}`);
      if (Array.isArray(data)) {
        return data.map(e => `From: ${e.from}\nSubject: ${e.subject}\nDate: ${e.date}\n${e.snippet?.slice(0, 200) || ''}`).join('\n---\n') || 'No emails found';
      }
      return typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
    },
  },
  'notes': {
    description: 'Apple Notes — list, search, read, create',
    usage: '/notes --list|--search <q>|--read <name>|--create <title>',
    handler: async (args) => {
      const data = jerikoExec(`notes ${args.trim()}`);
      if (Array.isArray(data)) {
        return data.map(n => `${n.name} (${n.date || ''})`).join('\n') || 'No notes found';
      }
      return typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
    },
  },
  'remind': {
    description: 'Apple Reminders — list, create, complete',
    usage: '/remind --list|--create <text>|--complete <text>',
    handler: async (args) => {
      const data = jerikoExec(`remind ${args.trim()}`);
      if (Array.isArray(data)) {
        return data.map(r => `${r.name}${r.due ? ` (due: ${r.due})` : ''}`).join('\n') || 'No reminders';
      }
      return typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
    },
  },
  'calendar': {
    description: 'Apple Calendar — events, create',
    usage: '/calendar [--today|--week|--create <title>]',
    handler: async (args) => {
      const data = jerikoExec(`calendar ${args.trim()}`);
      if (Array.isArray(data)) {
        return data.map(e => `${e.summary} | ${e.start} - ${e.end} [${e.calendar}]`).join('\n') || 'No events';
      }
      return typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
    },
  },
  'contacts': {
    description: 'Apple Contacts — search, list',
    usage: '/contacts --search <name>|--list',
    handler: async (args) => {
      const data = jerikoExec(`contacts ${args.trim()}`);
      if (Array.isArray(data)) {
        return data.map(c => `${c.name} | ${c.phone || ''} | ${c.email || ''}`).join('\n') || 'No contacts found';
      }
      return typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
    },
  },
  'clipboard': {
    description: 'System clipboard — read/write',
    usage: '/clipboard [--set <text>]',
    handler: async (args) => {
      const data = jerikoExec(`clipboard ${args.trim()}`);
      return typeof data === 'object' ? JSON.stringify(data, null, 2) : String(data).slice(0, 4000);
    },
  },
  'audio': {
    description: 'Mic recording, TTS, volume control',
    usage: '/audio --record [s]|--say <text>|--volume [0-100]|--mute|--unmute',
    handler: async (args) => {
      const data = jerikoExec(`audio ${args.trim()}`);
      if (typeof data === 'object' && data.path) {
        return { type: 'document', path: data.path, caption: `Audio: ${data.filename}` };
      }
      return typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
    },
  },
  'music': {
    description: 'Control Apple Music or Spotify',
    usage: '/music [--play [track]|--pause|--next|--prev]',
    handler: async (args) => {
      const data = jerikoExec(`music ${args.trim()}`);
      if (typeof data === 'object') {
        if (data.track) return `Now playing: ${data.track} — ${data.artist} (${data.album})`;
        if (data.action) return `Music: ${data.action}`;
        return JSON.stringify(data, null, 2);
      }
      return data;
    },
  },
  'msg': {
    description: 'iMessage — send and read',
    usage: '/msg --send <phone> --message <text>|--read',
    handler: async (args) => {
      const data = jerikoExec(`msg ${args.trim()}`);
      if (Array.isArray(data)) {
        return data.map(c => `${c.name}: ${c.lastMessage}`).join('\n') || 'No chats';
      }
      return typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
    },
  },
  'location': {
    description: 'IP-based geolocation',
    usage: '/location',
    handler: async () => {
      const data = jerikoExec('location');
      if (typeof data === 'object') {
        return `${data.city}, ${data.region}, ${data.country}\nIP: ${data.ip}\nCoords: ${data.lat}, ${data.lon}\nTimezone: ${data.timezone}\nISP: ${data.isp}`;
      }
      return data;
    },
  },
  'memory': {
    description: 'Session memory — view, search, store',
    usage: '/memory [--search <q>|--set <key> --value <val>|--get <key>]',
    handler: async (args) => {
      const data = jerikoExec(`memory ${args.trim()}`);
      if (Array.isArray(data)) {
        return data.map(e => `[${e.ts}] ${e.command || 'unknown'}`).join('\n') || 'No session history';
      }
      return typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
    },
  },
  'discover': {
    description: 'List all available jeriko commands',
    usage: '/discover [--list|--json]',
    handler: async (args) => {
      const data = jerikoExec(`discover --list`);
      if (Array.isArray(data)) {
        return `Available commands (${data.length}):\n` + data.map(c => `  jeriko ${c}`).join('\n');
      }
      return data;
    },
  },

  // Window/App management
  'window': {
    description: 'Window and app management (macOS)',
    usage: '/window --list|--focus <app>|--minimize <app>|--close <app>|--apps|--quit <app>',
    handler: async (args) => {
      const data = jerikoExec(`window ${args.trim() || '--list'}`);
      if (Array.isArray(data)) {
        if (typeof data[0] === 'string') return data.join('\n');
        return data.map(w => w.app ? `${w.app} | ${w.title} | ${w.position} | ${w.size}` : w).join('\n') || 'No windows';
      }
      return typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
    },
  },
  'proc': {
    description: 'Process management — list, kill, start background',
    usage: '/proc [--list|--kill <pid>|--kill-name <name>|--find <name>|--start <cmd>]',
    handler: async (args) => {
      const data = jerikoExec(`proc ${args.trim() || '--list'}`);
      if (Array.isArray(data)) {
        return data.map(p => p.pid ? `${p.pid} ${p.user || ''} CPU:${p.cpu || ''}% ${p.command || ''}` : JSON.stringify(p)).join('\n');
      }
      return typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
    },
  },
  'netutil': {
    description: 'Network utilities — ping, DNS, ports, curl, download',
    usage: '/netutil --ping <host>|--dns <domain>|--ports|--curl <url>|--download <url>',
    handler: async (args) => {
      const data = jerikoExec(`net ${args.trim()}`);
      return typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
    },
  },
  'open': {
    description: 'Open URLs, files, or apps',
    usage: '/open <url|file|app>',
    handler: async (args) => {
      const data = jerikoExec(`open ${args.trim()}`);
      return typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
    },
  },

  // Stripe
  'stripe': {
    description: 'Stripe payments, customers, invoices, subscriptions',
    usage: '/stripe <resource> <action> [flags]',
    handler: async (args) => {
      const data = jerikoExec(`stripe ${args.trim()}`, { timeout: 15000 });
      if (Array.isArray(data)) {
        return data.map(item => {
          if (item.id && item.name) return `${item.id} | ${item.name} | ${item.email || ''}`;
          if (item.id && item.amount !== undefined) return `${item.id} | ${item.amount/100} ${item.currency} | ${item.status}`;
          return JSON.stringify(item);
        }).join('\n') || 'No results';
      }
      return typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
    },
  },

  // X.com (Twitter)
  'x': {
    description: 'X.com (Twitter) — post, search, timeline, DMs, follows, likes',
    usage: '/x <command> [flags] — e.g. /x post "hello" | /x search "query" | /x me',
    handler: async (args) => {
      const data = jerikoExec(`x ${args.trim()}`, { timeout: 30000 });
      if (Array.isArray(data)) {
        return data.map(item => {
          if (item.text && item.author) return `${item.author}: ${item.text}${item.likes !== undefined ? ` [${item.likes}♥]` : ''}`;
          if (item.username) return `${item.username} ${item.name || ''} — ${item.followers || 0} followers`;
          if (item.name && item.members !== undefined) return `${item.name} (${item.members} members)`;
          return JSON.stringify(item);
        }).join('\n') || 'No results';
      }
      if (typeof data === 'object') {
        if (data.username && data.name) return `${data.username} (${data.name}) — ${data.followers || 0} followers, ${data.tweets || 0} tweets`;
        if (data.url && data.text) return `Posted: ${data.text}\n${data.url}`;
        if (data.authenticated !== undefined) return data.authenticated ? `Logged in as ${data.username}` : data.message;
        return JSON.stringify(data, null, 2);
      }
      return data;
    },
  },

  // Plugin management
  'install_plugin': {
    description: 'Install a JerikoBot plugin from npm or local path',
    usage: '/install_plugin <package> | --list | --info <name> | --upgrade <name>',
    handler: async (args) => {
      const data = jerikoExec(`install ${args.trim()}`, { timeout: 60000 });
      if (Array.isArray(data)) {
        return data.map(p => `${p.name} v${p.version} [${p.trusted ? 'trusted' : 'untrusted'}] — ${(p.commands || []).join(', ')}`).join('\n') || 'No plugins installed';
      }
      return typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
    },
  },
  'trust_plugin': {
    description: 'Trust or revoke a JerikoBot plugin',
    usage: '/trust_plugin <name> --yes | --revoke <name> | --list | --audit',
    handler: async (args) => {
      const data = jerikoExec(`trust ${args.trim()}`);
      if (Array.isArray(data)) {
        return data.map(p => `${p.name} v${p.version} [${p.trusted ? 'TRUSTED' : 'untrusted'}]`).join('\n');
      }
      return typeof data === 'object' ? JSON.stringify(data, null, 2) : data;
    },
  },

  // Help
  'tools': {
    description: 'List all available tools',
    usage: '/tools',
    handler: async () => {
      return Object.entries(tools)
        .map(([name, t]) => `/${name} — ${t.description}`)
        .join('\n');
    },
  },
};

function formatBytes(bytes) {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(1)} ${sizes[i]}`;
}

async function execute(name, args) {
  const tool = tools[name];
  if (!tool) return null;
  return tool.handler(args || '');
}

function getToolNames() {
  return Object.keys(tools);
}

function getToolHelp(name) {
  const tool = tools[name];
  if (!tool) return null;
  return { name, description: tool.description, usage: tool.usage };
}

module.exports = { tools, execute, getToolNames, getToolHelp };
