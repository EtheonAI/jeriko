const { Telegraf } = require('telegraf');
const fs = require('fs');
const { isAdminTelegramId } = require('./auth');
const { route } = require('./router');
const { getConnectedNodes } = require('./websocket');
const { tools, execute: executeTool, getToolNames } = require('../tools');
const triggerStore = require('./triggers/store');
const triggerEngine = require('./triggers/engine');

let bot = null;

function setup() {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) {
    console.log('[telegram] No TELEGRAM_BOT_TOKEN set — skipping Telegram setup');
    return null;
  }

  bot = new Telegraf(token, { handlerTimeout: 600_000 }); // 10 min — complex tasks (app building) need time

  // Catch Telegraf errors so they don't crash the process
  bot.catch((err, ctx) => {
    console.error(`[telegram] Error for ${ctx.updateType}:`, err.message);
  });

  // Auth middleware — also capture chat ID for trigger notifications
  bot.use((ctx, next) => {
    console.log(`[telegram] Message from ${ctx.from?.id}: ${ctx.message?.text?.slice(0, 80) || ctx.updateType}`);
    if (!isAdminTelegramId(ctx.from?.id)) {
      console.log(`[telegram] Unauthorized user: ${ctx.from?.id}`);
      return ctx.reply('Unauthorized.');
    }
    // Set default chat for trigger notifications
    if (ctx.chat?.id) {
      triggerEngine.setDefaultChat(ctx.chat.id);
    }
    return next();
  });

  // /start
  bot.start((ctx) => {
    ctx.reply(
      'JerikoBot active.\n\n' +
      'Send any text → Claude executes it\n' +
      'Use @machineName to target a remote node\n\n' +
      'Core:\n' +
      '/nodes — connected machines\n' +
      '/status — health check\n' +
      '/tools — list all tools\n\n' +
      'Triggers (reactive AI):\n' +
      '/watch — create a new trigger\n' +
      '/triggers — list active triggers\n' +
      '/trigger_delete <id> — remove a trigger\n' +
      '/trigger_pause <id> — pause a trigger\n' +
      '/trigger_resume <id> — resume a trigger\n' +
      '/trigger_log — recent trigger executions'
    );
  });

  // /nodes
  bot.command('nodes', (ctx) => {
    const nodes = getConnectedNodes();
    if (nodes.length === 0) {
      return ctx.reply('No remote nodes connected.\nCommands run locally by default.');
    }
    const lines = nodes.map(n =>
      `• ${n.name} — connected ${timeAgo(n.connectedAt)}, last ping ${timeAgo(n.lastPing)}`
    );
    ctx.reply(`Connected nodes:\n${lines.join('\n')}`);
  });

  // /status
  bot.command('status', (ctx) => {
    const nodes = getConnectedNodes();
    const triggers = triggerStore.getEnabled();
    const uptime = process.uptime();
    ctx.reply(
      `JerikoBot Status\n` +
      `Uptime: ${formatDuration(uptime)}\n` +
      `Connected nodes: ${nodes.length}\n` +
      `Active triggers: ${triggers.length}\n` +
      `Memory: ${Math.round(process.memoryUsage().rss / 1024 / 1024)}MB`
    );
  });

  // /token <name>
  bot.command('token', (ctx) => {
    const name = ctx.message.text.split(/\s+/)[1];
    if (!name) return ctx.reply('Usage: /token <node-name>');
    const { generateToken } = require('./auth');
    const tkn = generateToken(name);
    ctx.reply(
      `Token for "${name}":\n\n\`${tkn}\`\n\nSet on the agent:\nNODE_NAME=${name}\nNODE_TOKEN=${tkn}\nPROXY_URL=wss://yourserver.com/ws`,
      { parse_mode: 'Markdown' }
    );
  });

  // ========== TRIGGER COMMANDS ==========

  // /watch — natural language trigger creation
  bot.command('watch', async (ctx) => {
    const input = ctx.message.text.replace('/watch', '').trim();
    if (!input) {
      return ctx.reply(
        'Usage: /watch <description>\n\n' +
        'Examples:\n' +
        '/watch cron "0 9 * * MON" run weekly report\n' +
        '/watch email from:boss@co.com summarize and notify me\n' +
        '/watch http https://mysite.com alert me if it goes down\n' +
        '/watch webhook stripe log payment details\n' +
        '/watch file /var/log/app.log alert on errors'
      );
    }

    const trigger = parseWatchCommand(input);
    if (!trigger) {
      return ctx.reply('Could not parse trigger. See /watch for examples.');
    }

    const saved = triggerStore.add(trigger);
    triggerEngine.activate(saved);

    let details = `Trigger created: ${saved.name}\n`;
    details += `ID: ${saved.id}\n`;
    details += `Type: ${saved.type}\n`;

    if (saved.type === 'cron') details += `Schedule: ${saved.schedule}\n`;
    if (saved.type === 'email') details += `Polling: every ${saved.config?.intervalMinutes || 2}m\n`;
    if (saved.type === 'webhook') details += `URL: POST /hooks/${saved.id}\n`;
    if (saved.type === 'http_monitor') details += `Watching: ${saved.config?.url}\n`;
    if (saved.type === 'file_watch') details += `Path: ${saved.config?.path}\n`;

    details += `Action: ${saved.action}`;

    ctx.reply(details);
  });

  // /triggers — list all
  bot.command('triggers', (ctx) => {
    const triggers = triggerStore.load();
    if (triggers.length === 0) {
      return ctx.reply('No triggers set. Use /watch to create one.');
    }
    const lines = triggers.map(t => {
      const status = t.enabled ? 'ON' : 'OFF';
      const runs = t.runCount || 0;
      const last = t.lastRunAt ? timeAgo(new Date(t.lastRunAt)) : 'never';
      return `[${status}] ${t.id} — ${t.name}\n    Type: ${t.type} | Runs: ${runs} | Last: ${last}`;
    });
    ctx.reply(`Triggers:\n\n${lines.join('\n\n')}`);
  });

  // /trigger_delete <id>
  bot.command('trigger_delete', (ctx) => {
    const id = ctx.message.text.split(/\s+/)[1];
    if (!id) return ctx.reply('Usage: /trigger_delete <id>');
    triggerEngine.deactivate(id);
    const removed = triggerStore.remove(id);
    ctx.reply(removed ? `Trigger ${id} deleted.` : `Trigger ${id} not found.`);
  });

  // /trigger_pause <id>
  bot.command('trigger_pause', (ctx) => {
    const id = ctx.message.text.split(/\s+/)[1];
    if (!id) return ctx.reply('Usage: /trigger_pause <id>');
    triggerEngine.deactivate(id);
    const updated = triggerStore.update(id, { enabled: false });
    ctx.reply(updated ? `Trigger "${updated.name}" paused.` : `Trigger ${id} not found.`);
  });

  // /trigger_resume <id>
  bot.command('trigger_resume', (ctx) => {
    const id = ctx.message.text.split(/\s+/)[1];
    if (!id) return ctx.reply('Usage: /trigger_resume <id>');
    const trigger = triggerStore.update(id, { enabled: true });
    if (!trigger) return ctx.reply(`Trigger ${id} not found.`);
    triggerEngine.activate(trigger);
    ctx.reply(`Trigger "${trigger.name}" resumed.`);
  });

  // /trigger_log — recent executions
  bot.command('trigger_log', (ctx) => {
    const logPath = require('path').join(__dirname, '..', 'data', 'trigger-log.json');
    if (!fs.existsSync(logPath)) return ctx.reply('No trigger executions yet.');
    const log = JSON.parse(fs.readFileSync(logPath, 'utf-8'));
    const recent = log.slice(-10).reverse();
    const lines = recent.map(e =>
      `${e.timestamp.slice(0, 19)} [${e.status}] ${e.triggerId}\n  ${e.summary?.slice(0, 100) || '(no output)'}`
    );
    ctx.reply(`Recent trigger executions:\n\n${lines.join('\n\n')}`);
  });

  // ========== TOOL COMMANDS ==========

  for (const toolName of getToolNames()) {
    bot.command(toolName, async (ctx) => {
      const args = ctx.message.text.replace(`/${toolName}`, '').trim();
      try {
        const result = await executeTool(toolName, args);
        if (result && typeof result === 'object' && (result.type === 'photo' || result.type === 'document')) {
          if (fs.existsSync(result.path)) {
            if (result.type === 'photo') {
              await ctx.replyWithPhoto(
                { source: fs.createReadStream(result.path) },
                { caption: result.caption || '' }
              );
            } else {
              await ctx.replyWithDocument(
                { source: fs.createReadStream(result.path), filename: result.caption || require('path').basename(result.path) },
                { caption: result.caption || '' }
              );
            }
          } else {
            await ctx.reply(`File saved: ${result.path}`);
          }
          return;
        }
        const text = typeof result === 'object' ? JSON.stringify(result, null, 2) : String(result);
        await ctx.reply(truncate(text, 4000) || '(empty)');
      } catch (err) {
        await ctx.reply(`Error: ${err.message}`);
      }
    });
  }

  // ========== FREE TEXT → CLAUDE ==========

  bot.on('text', async (ctx) => {
    const text = ctx.message.text;
    if (!text || text.startsWith('/')) return;

    const statusMsg = await ctx.reply('Processing...');
    const chatId = ctx.chat.id;
    const msgId = statusMsg.message_id;

    // Run in background — don't let Telegraf's handler timeout kill long tasks
    (async () => {
      try {
        // Track status for progress updates
        let lastStatus = 'thinking';
        let toolCallCount = 0;
        let lastUpdate = Date.now();
        const MIN_UPDATE_INTERVAL = 3000; // Don't spam edits

        const onStatus = async (status) => {
          const now = Date.now();
          if (now - lastUpdate < MIN_UPDATE_INTERVAL) return;

          let statusText;
          if (status.type === 'thinking') {
            statusText = toolCallCount > 0
              ? `Working... (${toolCallCount} command${toolCallCount > 1 ? 's' : ''} executed)`
              : 'Thinking...';
          } else if (status.type === 'tool_call') {
            toolCallCount++;
            const cmd = status.command?.slice(0, 60) || '';
            statusText = `Running: ${cmd}${cmd.length >= 60 ? '...' : ''}\n(${toolCallCount} command${toolCallCount > 1 ? 's' : ''})`;
          } else if (status.type === 'tool_result') {
            statusText = `Working... (${toolCallCount} command${toolCallCount > 1 ? 's' : ''} executed)`;
          } else if (status.type === 'responding') {
            statusText = 'Finishing up...';
          } else {
            return;
          }

          if (statusText && statusText !== lastStatus) {
            lastStatus = statusText;
            lastUpdate = now;
            try {
              await ctx.telegram.editMessageText(chatId, msgId, undefined, statusText);
            } catch { /* edit might fail if message unchanged */ }
          }
        };

        const result = await route(text, null, onStatus);

        // Extract file/screenshot paths from Claude's output
        const files = extractFiles(result);
        const cleanText = result
          .replace(/SCREENSHOT:\S+/g, '')
          .replace(/FILE:\S+/g, '')
          .trim();

        // Send any screenshots/files as photos or documents
        for (const file of files) {
          if (fs.existsSync(file.path)) {
            try {
              if (file.type === 'photo') {
                await ctx.replyWithPhoto({ source: fs.createReadStream(file.path) });
              } else {
                await ctx.replyWithDocument({ source: fs.createReadStream(file.path) });
              }
            } catch { /* file send failed — continue */ }
          }
        }

        // Send text response (edit the "Processing..." message)
        const response = truncate(cleanText, 4000);
        if (response) {
          await ctx.telegram.editMessageText(chatId, msgId, undefined, response, { parse_mode: undefined });
        } else if (files.length > 0) {
          await ctx.telegram.editMessageText(chatId, msgId, undefined, 'Done.');
        } else {
          await ctx.telegram.editMessageText(chatId, msgId, undefined, '(empty response)');
        }
      } catch (err) {
        try {
          await ctx.telegram.editMessageText(chatId, msgId, undefined, `Error: ${err.message}`);
        } catch { /* edit might fail */ }
      }
    })();
  });

  bot.launch();
  console.log('[telegram] Bot started');
  console.log(`[telegram] ${getToolNames().length} tools registered`);

  // Init trigger engine with bot reference
  triggerEngine.init(bot);

  return bot;
}

// ========== WATCH COMMAND PARSER ==========

function parseWatchCommand(input) {
  // /watch cron "0 9 * * MON" do something
  const cronMatch = input.match(/^cron\s+"([^"]+)"\s+(.+)$/s);
  if (cronMatch) {
    return {
      type: 'cron',
      name: `Cron: ${cronMatch[2].slice(0, 40)}`,
      schedule: cronMatch[1],
      action: cronMatch[2],
      actionType: 'claude',
    };
  }

  // /watch cron every 5m do something
  const everyMatch = input.match(/^cron\s+every\s+(\d+)(m|h|s)\s+(.+)$/s);
  if (everyMatch) {
    const [, num, unit, action] = everyMatch;
    const map = { s: '/', m: '*/', h: '0 */' };
    let schedule;
    if (unit === 's') schedule = `*/${num} * * * * *`;
    else if (unit === 'm') schedule = `*/${num} * * * *`;
    else schedule = `0 */${num} * * *`;
    return {
      type: 'cron',
      name: `Every ${num}${unit}: ${action.slice(0, 30)}`,
      schedule,
      action,
      actionType: 'claude',
    };
  }

  // /watch email from:addr@domain.com do something
  const emailMatch = input.match(/^email\s+(?:from:(\S+)\s+)?(.+)$/s);
  if (emailMatch) {
    return {
      type: 'email',
      name: `Email${emailMatch[1] ? ` from ${emailMatch[1]}` : ''}: ${emailMatch[2].slice(0, 30)}`,
      action: emailMatch[2],
      actionType: 'claude',
      config: {
        host: process.env.IMAP_HOST || 'imap.gmail.com',
        port: parseInt(process.env.IMAP_PORT) || 993,
        user: process.env.IMAP_USER,
        password: process.env.IMAP_PASSWORD,
        tls: true,
        from: emailMatch[1] || undefined,
        intervalMinutes: 2,
      },
    };
  }

  // /watch webhook stripe|github|custom do something
  const webhookMatch = input.match(/^webhook\s+(\S+)\s+(.+)$/s);
  if (webhookMatch) {
    return {
      type: 'webhook',
      name: `Webhook: ${webhookMatch[1]}`,
      action: webhookMatch[2],
      actionType: 'claude',
      config: { source: webhookMatch[1] },
    };
  }

  // /watch http https://url.com alert if down
  const httpMatch = input.match(/^http\s+(\S+)\s+(.+)$/s);
  if (httpMatch) {
    return {
      type: 'http_monitor',
      name: `Monitor: ${httpMatch[1].slice(0, 40)}`,
      action: httpMatch[2],
      actionType: 'claude',
      config: {
        url: httpMatch[1],
        intervalSeconds: 60,
        fireOn: 'down',
      },
    };
  }

  // /watch file /path/to/dir do something
  const fileMatch = input.match(/^file\s+(\S+)\s+(.+)$/s);
  if (fileMatch) {
    return {
      type: 'file_watch',
      name: `File: ${fileMatch[1].slice(0, 40)}`,
      action: fileMatch[2],
      actionType: 'claude',
      config: { path: fileMatch[1], recursive: true },
    };
  }

  return null;
}

function extractFiles(text) {
  const files = [];
  const seen = new Set();
  const imageExts = ['.png', '.jpg', '.jpeg', '.gif', '.webp'];
  const mediaExts = [...imageExts, '.mp4', '.mov', '.mp3', '.wav', '.pdf', '.zip'];

  // Match SCREENSHOT:/path/to/file.png
  const screenshotMatches = text.matchAll(/SCREENSHOT:(\S+)/g);
  for (const m of screenshotMatches) {
    if (!seen.has(m[1])) { seen.add(m[1]); files.push({ path: m[1], type: 'photo' }); }
  }

  // Match FILE:/path/to/file
  const fileMatches = text.matchAll(/FILE:(\S+)/g);
  for (const m of fileMatches) {
    if (seen.has(m[1])) continue;
    seen.add(m[1]);
    const ext = m[1].toLowerCase().slice(m[1].lastIndexOf('.'));
    files.push({ path: m[1], type: imageExts.includes(ext) ? 'photo' : 'document' });
  }

  // Match bare file paths to media files (e.g. /tmp/desktop-123.png mentioned by the AI)
  const pathMatches = text.matchAll(/(?:^|\s)(\/\S+\.(?:png|jpg|jpeg|gif|webp|mp4|mov|mp3|wav|pdf))\b/gi);
  for (const m of pathMatches) {
    const p = m[1];
    if (seen.has(p)) continue;
    seen.add(p);
    const ext = p.toLowerCase().slice(p.lastIndexOf('.'));
    files.push({ path: p, type: imageExts.includes(ext) ? 'photo' : 'document' });
  }

  // Match paths from JSON output (e.g. "path":"/tmp/screenshot-123.png")
  const jsonPathMatches = text.matchAll(/"path"\s*:\s*"(\/[^"]+\.(?:png|jpg|jpeg|gif|webp|mp4|mov|mp3|wav|pdf))"/gi);
  for (const m of jsonPathMatches) {
    const p = m[1];
    if (seen.has(p)) continue;
    seen.add(p);
    const ext = p.toLowerCase().slice(p.lastIndexOf('.'));
    files.push({ path: p, type: imageExts.includes(ext) ? 'photo' : 'document' });
  }

  return files;
}

function truncate(str, max) {
  if (!str) return str;
  if (str.length <= max) return str;
  return str.slice(0, max - 20) + '\n\n...(truncated)';
}

function timeAgo(date) {
  if (!(date instanceof Date)) date = new Date(date);
  const seconds = Math.floor((Date.now() - date.getTime()) / 1000);
  if (seconds < 60) return `${seconds}s ago`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
  return `${Math.floor(seconds / 3600)}h ago`;
}

function formatDuration(seconds) {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return [h && `${h}h`, m && `${m}m`, `${s}s`].filter(Boolean).join(' ');
}

function getBot() {
  return bot;
}

module.exports = { setup, getBot };
