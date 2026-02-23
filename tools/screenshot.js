const { execSync } = require('child_process');
const path = require('path');
const os = require('os');

const TMP_DIR = os.tmpdir();

async function captureDesktop() {
  const filename = `desktop-${Date.now()}.png`;
  const filepath = path.join(TMP_DIR, filename);
  if (process.platform === 'darwin') {
    execSync(`screencapture -x "${filepath}"`, { timeout: 10000 });
  } else if (process.platform === 'linux') {
    execSync(`import -window root "${filepath}"`, { timeout: 10000 });
  } else {
    throw new Error(`Screenshot not supported on ${process.platform}`);
  }
  return { path: filepath, filename };
}

async function listDisplays() {
  if (process.platform === 'darwin') {
    const out = execSync('system_profiler SPDisplaysDataType -json', { encoding: 'utf-8', timeout: 10000 });
    const data = JSON.parse(out);
    const displays = [];
    for (const gpu of data.SPDisplaysDataType || []) {
      for (const d of gpu.spdisplays_ndrvs || []) {
        displays.push({ name: d._name, resolution: d._spdisplays_resolution });
      }
    }
    return displays;
  }
  return [{ name: 'default', id: 0 }];
}

async function captureDisplay(displayId) {
  const filename = `display-${displayId}-${Date.now()}.png`;
  const filepath = path.join(TMP_DIR, filename);
  if (process.platform === 'darwin') {
    execSync(`screencapture -x -D ${displayId} "${filepath}"`, { timeout: 10000 });
  } else {
    execSync(`import -window root "${filepath}"`, { timeout: 10000 });
  }
  return { path: filepath, filename };
}

module.exports = { captureDesktop, listDisplays, captureDisplay };
