const { spawn } = require('child_process');

// Env vars to strip from child processes for security
const SENSITIVE_KEYS = [
  'NODE_AUTH_SECRET', 'TELEGRAM_BOT_TOKEN', 'OPENAI_API_KEY',
  'IMAP_PASSWORD', 'ANTHROPIC_API_KEY', 'GEMINI_API_KEY',
];

function safeEnv() {
  const env = { ...process.env };
  for (const key of SENSITIVE_KEYS) delete env[key];
  return env;
}

function exec(command, opts = {}) {
  return new Promise((resolve, reject) => {
    const timeout = opts.timeout || 30000;
    const cwd = opts.cwd || process.cwd();

    const proc = spawn('bash', ['-c', command], {
      cwd,
      env: safeEnv(),
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout,
    });

    const chunks = [];
    const errChunks = [];

    proc.stdout.on('data', (d) => chunks.push(d.toString()));
    proc.stderr.on('data', (d) => errChunks.push(d.toString()));

    proc.on('close', (code) => {
      resolve({
        code,
        stdout: chunks.join('').slice(0, 10000),
        stderr: errChunks.join('').slice(0, 5000),
      });
    });

    proc.on('error', (err) => {
      reject(new Error(`Shell error: ${err.message}`));
    });
  });
}

module.exports = { exec };
