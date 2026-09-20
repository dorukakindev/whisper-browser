'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function findMediaTool(name, { root = path.resolve(__dirname, '..'), env = process.env,
  platform = process.platform, probe = spawnSync } = {}) {
  const envName = `WHISPER_TEST_${name.toUpperCase()}`;
  const executable = platform === 'win32' ? `${name}.exe` : name;
  const candidates = [env[envName], path.join(root, 'backend', 'bin', executable), name]
    .filter(Boolean);
  for (const command of candidates) {
    if (path.isAbsolute(command) && !fs.existsSync(command)) continue;
    const result = probe(command, ['-version'], { cwd: root, encoding: 'utf8', timeout: 5000,
      windowsHide: true });
    if (!result.error && result.status === 0) {
      if (path.isAbsolute(command)) return command;
      const locator = platform === 'win32' ? 'where.exe' : 'which';
      const located = probe(locator, [command], { cwd: root, encoding: 'utf8', timeout: 5000,
        windowsHide: true });
      const resolved = String(located.stdout || '').split(/\r?\n/).map(value => value.trim())
        .find(value => path.isAbsolute(value) && fs.existsSync(value));
      if (resolved) return resolved;
    }
  }
  return null;
}

module.exports = { findMediaTool };
