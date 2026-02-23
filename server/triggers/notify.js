const { execSync } = require('child_process');

function send({ title, message, sound, url }) {
  // macOS native notification via osascript (zero deps, works everywhere)
  try {
    const esc = (s) => (s || '').replace(/'/g, "'\\''").replace(/"/g, '\\"');
    const parts = [`display notification "${esc(message)}"`];
    if (title) parts.push(`with title "${esc(title)}"`);
    if (sound) parts.push(`sound name "${esc(sound)}"`);
    const script = parts.join(' ');
    execSync(`osascript -e '${script}'`, { timeout: 5000 });
  } catch {
    // Silently fail on non-macOS or permission issues
  }

  // Also try node-notifier for richer notifications (click support)
  try {
    const notifier = require('node-notifier');
    notifier.notify({
      title: title || 'JerikoBot',
      message: message || '',
      sound: sound || 'Ping',
      open: url || undefined,
      wait: false,
    });
  } catch {
    // node-notifier not available or failed
  }
}

module.exports = { send };
