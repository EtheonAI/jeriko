const { Cron } = require('croner');
const store = require('./store');
const notify = require('./notify');
const { executeAction } = require('./executor');

// Active cron jobs: triggerId -> Cron instance
const cronJobs = new Map();

// Active pollers: triggerId -> interval handle
const pollers = new Map();

// Webhook handlers: triggerId -> handler config
const webhookHandlers = new Map();

let telegramBot = null;
let telegramChatId = null;

function init(bot) {
  telegramBot = bot;
  console.log('[triggers] Engine initializing...');
  loadAll();
}

function setDefaultChat(chatId) {
  telegramChatId = chatId;
}

function loadAll() {
  // Stop all existing
  stopAll();

  const triggers = store.getEnabled();
  for (const trigger of triggers) {
    activate(trigger);
  }
  console.log(`[triggers] ${triggers.length} triggers loaded`);
}

function activate(trigger) {
  switch (trigger.type) {
    case 'cron':
      activateCron(trigger);
      break;
    case 'webhook':
      activateWebhook(trigger);
      break;
    case 'email':
      activateEmailPoller(trigger);
      break;
    case 'http_monitor':
      activateHttpMonitor(trigger);
      break;
    case 'file_watch':
      activateFileWatch(trigger);
      break;
    default:
      console.log(`[triggers] Unknown type: ${trigger.type}`);
  }
}

function deactivate(triggerId) {
  if (cronJobs.has(triggerId)) {
    cronJobs.get(triggerId).stop();
    cronJobs.delete(triggerId);
  }
  if (pollers.has(triggerId)) {
    clearInterval(pollers.get(triggerId));
    pollers.delete(triggerId);
  }
  webhookHandlers.delete(triggerId);
}

function stopAll() {
  for (const [id] of cronJobs) deactivate(id);
  for (const [id] of pollers) deactivate(id);
  webhookHandlers.clear();
}

// --- CRON ---
function activateCron(trigger) {
  const job = new Cron(trigger.schedule, { name: trigger.id }, async () => {
    await fireTrigger(trigger, { type: 'cron', time: new Date().toISOString() });
  });
  cronJobs.set(trigger.id, job);
  console.log(`[triggers] Cron "${trigger.name}" active: ${trigger.schedule}`);
}

// --- WEBHOOK ---
function activateWebhook(trigger) {
  webhookHandlers.set(trigger.id, trigger);
  console.log(`[triggers] Webhook "${trigger.name}" listening at POST /hooks/${trigger.id}`);
}

function getWebhookHandler(triggerId) {
  return webhookHandlers.get(triggerId) || null;
}

// --- EMAIL POLLING ---
function activateEmailPoller(trigger) {
  const interval = (trigger.config?.intervalMinutes || 2) * 60 * 1000;
  const { pollEmail } = require('./pollers/email');

  // Initial poll after 5 seconds
  setTimeout(() => pollEmailTrigger(trigger), 5000);

  const handle = setInterval(() => pollEmailTrigger(trigger), interval);
  pollers.set(trigger.id, handle);
  console.log(`[triggers] Email poller "${trigger.name}" active every ${trigger.config?.intervalMinutes || 2}m`);
}

async function pollEmailTrigger(trigger) {
  try {
    const { pollEmail } = require('./pollers/email');
    const emails = await pollEmail(trigger.config);
    if (emails.length > 0) {
      for (const email of emails) {
        await fireTrigger(trigger, {
          type: 'email',
          from: email.from,
          subject: email.subject,
          date: email.date,
          snippet: email.text?.slice(0, 500) || '',
        });
      }
    }
  } catch (err) {
    console.error(`[triggers] Email poll error for "${trigger.name}":`, err.message);
    store.update(trigger.id, {
      consecutiveErrors: (trigger.consecutiveErrors || 0) + 1,
      lastStatus: 'error',
    });
  }
}

// --- HTTP MONITOR ---
function activateHttpMonitor(trigger) {
  const interval = (trigger.config?.intervalSeconds || 60) * 1000;

  const handle = setInterval(async () => {
    try {
      const start = Date.now();
      const response = await fetch(trigger.config.url, {
        method: trigger.config.method || 'GET',
        signal: AbortSignal.timeout(10000),
      });
      const elapsed = Date.now() - start;
      const ok = response.ok;

      // Fire on status change or if condition matches
      if (trigger.config.fireOn === 'down' && !ok) {
        await fireTrigger(trigger, { type: 'http_monitor', url: trigger.config.url, status: response.status, elapsed, state: 'down' });
      } else if (trigger.config.fireOn === 'up' && ok) {
        await fireTrigger(trigger, { type: 'http_monitor', url: trigger.config.url, status: response.status, elapsed, state: 'up' });
      } else if (trigger.config.fireOn === 'any') {
        await fireTrigger(trigger, { type: 'http_monitor', url: trigger.config.url, status: response.status, elapsed, state: ok ? 'up' : 'down' });
      } else if (trigger.config.fireOn === 'slow' && elapsed > (trigger.config.slowThresholdMs || 3000)) {
        await fireTrigger(trigger, { type: 'http_monitor', url: trigger.config.url, status: response.status, elapsed, state: 'slow' });
      }
    } catch (err) {
      if (trigger.config.fireOn === 'down' || trigger.config.fireOn === 'any') {
        await fireTrigger(trigger, { type: 'http_monitor', url: trigger.config.url, status: 0, elapsed: 0, state: 'error', error: err.message });
      }
    }
  }, interval);

  pollers.set(trigger.id, handle);
  console.log(`[triggers] HTTP monitor "${trigger.name}" watching ${trigger.config.url} every ${trigger.config.intervalSeconds || 60}s`);
}

// --- FILE WATCH ---
function activateFileWatch(trigger) {
  const fs = require('fs');
  try {
    const watcher = fs.watch(trigger.config.path, { recursive: trigger.config.recursive || false }, async (eventType, filename) => {
      if (trigger.config.pattern && !filename?.match(new RegExp(trigger.config.pattern))) return;
      await fireTrigger(trigger, { type: 'file_watch', event: eventType, filename, path: trigger.config.path });
    });
    // Store watcher close function
    pollers.set(trigger.id, { close: () => watcher.close() });
    console.log(`[triggers] File watch "${trigger.name}" on ${trigger.config.path}`);
  } catch (err) {
    console.error(`[triggers] File watch error for "${trigger.name}":`, err.message);
  }
}

// --- CORE: Fire a trigger ---
async function fireTrigger(trigger, eventData) {
  console.log(`[triggers] Firing "${trigger.name}" (${trigger.type})`);
  const start = Date.now();

  try {
    // Build prompt with event context
    const prompt = buildPrompt(trigger, eventData);

    // Execute the action (claude -p or shell command)
    const result = await executeAction(trigger, prompt, eventData);
    const durationMs = Date.now() - start;

    // Update trigger state
    store.update(trigger.id, {
      runCount: (trigger.runCount || 0) + 1,
      lastRunAt: new Date().toISOString(),
      lastStatus: 'ok',
      consecutiveErrors: 0,
    });

    // Log execution
    store.logExecution(trigger.id, { status: 'ok', output: result, durationMs });

    // Notify user
    await notifyUser(trigger, result, eventData);

    // Check max runs
    if (trigger.maxRuns && (trigger.runCount || 0) + 1 >= trigger.maxRuns) {
      store.update(trigger.id, { enabled: false });
      deactivate(trigger.id);
      await notifyUser(trigger, `Trigger "${trigger.name}" reached max runs (${trigger.maxRuns}) and has been disabled.`, {});
    }

    return result;
  } catch (err) {
    const durationMs = Date.now() - start;
    const errCount = (trigger.consecutiveErrors || 0) + 1;

    store.update(trigger.id, {
      lastRunAt: new Date().toISOString(),
      lastStatus: 'error',
      consecutiveErrors: errCount,
    });

    store.logExecution(trigger.id, { status: 'error', error: err.message, durationMs });

    // Notify on error
    await notifyUser(trigger, `Trigger "${trigger.name}" failed: ${err.message}`, eventData);

    // Disable after 5 consecutive errors
    if (errCount >= 5) {
      store.update(trigger.id, { enabled: false });
      deactivate(trigger.id);
      await notifyUser(trigger, `Trigger "${trigger.name}" disabled after ${errCount} consecutive errors.`, {});
    }
  }
}

function buildPrompt(trigger, eventData) {
  const eventContext = JSON.stringify(eventData, null, 2);
  return (
    `[Trigger Event: ${trigger.type}]\n` +
    `Trigger: ${trigger.name}\n` +
    `Event data:\n${eventContext}\n\n` +
    `Instructions: ${trigger.action}`
  );
}

async function notifyUser(trigger, result, eventData) {
  // If the shell command handles its own notification (e.g. calls jeriko notify),
  // skip the engine's auto-notification to avoid duplicates
  if (trigger.config?.selfNotify) return;

  const text = typeof result === 'string' ? result : JSON.stringify(result);

  // Clean up the message — strip jeriko notify JSON wrapper if present
  let cleanText = text;
  try {
    const parsed = JSON.parse(text);
    if (parsed.ok && parsed.data?.result?.text) {
      // This is a jeriko notify response — the message was already sent
      return;
    }
    if (parsed.ok && parsed.data) {
      cleanText = typeof parsed.data === 'string' ? parsed.data : JSON.stringify(parsed.data, null, 2);
    }
  } catch {
    // Not JSON, use as-is
  }

  const message = `${trigger.name}\n\n${cleanText}`.slice(0, 4000);

  // Telegram notification
  if (telegramBot && telegramChatId) {
    try {
      await telegramBot.telegram.sendMessage(telegramChatId, message);
    } catch (err) {
      console.error('[triggers] Telegram notify failed:', err.message);
    }
  }

  // macOS notification
  notify.send({
    title: `JerikoBot: ${trigger.name}`,
    message: cleanText.slice(0, 200),
    sound: trigger.notifySound || 'Ping',
  });
}

module.exports = {
  init, setDefaultChat, loadAll, activate, deactivate, stopAll,
  fireTrigger, getWebhookHandler,
};
