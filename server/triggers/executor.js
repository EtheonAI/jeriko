const { spawn } = require('child_process');

async function executeAction(trigger, prompt, eventData) {
  // Two modes: "claude" (AI processes event) or "shell" (direct command)
  const mode = trigger.actionType || 'claude';

  if (mode === 'shell') {
    return executeShell(trigger.shellCommand, eventData);
  }

  return executeClaude(prompt);
}

function executeClaude(prompt) {
  return new Promise((resolve, reject) => {
    const env = { ...process.env };
    delete env.CLAUDECODE;

    const proc = spawn('claude', ['-p', '--output-format', 'text', '--dangerously-skip-permissions', prompt], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 5 * 60 * 1000,
    });

    const chunks = [];

    proc.stdout.on('data', (data) => chunks.push(data.toString()));
    proc.stderr.on('data', (data) => chunks.push(data.toString()));

    proc.on('close', (code) => {
      const output = chunks.join('');
      if (code !== 0 && !output) {
        reject(new Error(`claude exited with code ${code}`));
      } else {
        resolve(output || '(no output)');
      }
    });

    proc.on('error', (err) => {
      reject(new Error(`Failed to run claude: ${err.message}`));
    });
  });
}

function executeShell(command, eventData) {
  return new Promise((resolve, reject) => {
    // Inject event data as env vars
    const env = { ...process.env };
    delete env.CLAUDECODE;
    env.TRIGGER_EVENT = JSON.stringify(eventData);

    const proc = spawn('bash', ['-c', command], {
      env,
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 60 * 1000,
    });

    const chunks = [];
    proc.stdout.on('data', (d) => chunks.push(d.toString()));
    proc.stderr.on('data', (d) => chunks.push(d.toString()));

    proc.on('close', (code) => {
      resolve(chunks.join('') || `(exit code ${code})`);
    });

    proc.on('error', (err) => reject(err));
  });
}

module.exports = { executeAction };
