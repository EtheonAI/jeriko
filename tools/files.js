const fs = require('fs');
const path = require('path');
const { execSync } = require('child_process');

function listDir(dirPath, opts = {}) {
  const entries = fs.readdirSync(dirPath, { withFileTypes: true });
  return entries.map(e => ({
    name: e.name,
    type: e.isDirectory() ? 'dir' : 'file',
    size: e.isFile() ? fs.statSync(path.join(dirPath, e.name)).size : null,
  }));
}

function readFile(filePath, opts = {}) {
  const stat = fs.statSync(filePath);
  if (stat.size > 1024 * 1024) {
    return { error: 'File too large (>1MB). Use line range.' };
  }
  const content = fs.readFileSync(filePath, 'utf-8');
  if (opts.startLine || opts.endLine) {
    const lines = content.split('\n');
    const start = (opts.startLine || 1) - 1;
    const end = opts.endLine || lines.length;
    return lines.slice(start, end).join('\n');
  }
  return content;
}

function writeFile(filePath, content, opts = {}) {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  if (opts.append) {
    fs.appendFileSync(filePath, content);
  } else {
    fs.writeFileSync(filePath, content);
  }
  return { written: filePath, bytes: Buffer.byteLength(content) };
}

function deleteFile(filePath) {
  fs.unlinkSync(filePath);
  return { deleted: filePath };
}

function searchFiles(dirPath, pattern, opts = {}) {
  try {
    const cmd = `grep -rl "${pattern.replace(/"/g, '\\"')}" "${dirPath}" --include="${opts.glob || '*'}" 2>/dev/null | head -20`;
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 10000 });
    return result.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function findFiles(dirPath, namePattern) {
  try {
    const cmd = `find "${dirPath}" -name "${namePattern.replace(/"/g, '\\"')}" -maxdepth 5 2>/dev/null | head -30`;
    const result = execSync(cmd, { encoding: 'utf-8', timeout: 10000 });
    return result.trim().split('\n').filter(Boolean);
  } catch {
    return [];
  }
}

function fileInfo(filePath) {
  const stat = fs.statSync(filePath);
  return {
    path: filePath,
    size: stat.size,
    modified: stat.mtime,
    created: stat.birthtime,
    isDirectory: stat.isDirectory(),
    permissions: stat.mode.toString(8),
  };
}

module.exports = { listDir, readFile, writeFile, deleteFile, searchFiles, findFiles, fileInfo };
