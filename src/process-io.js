'use strict';

const { spawn } = require('child_process');
const { terminateProcessTree } = require('./process-lifecycle');

function probeCommand(command, args, options = {}) {
  const spawnImpl = options.spawnImpl || spawn;
  const timeoutMs = Number.isFinite(options.timeoutMs) ? Math.max(1, options.timeoutMs) : 8000;
  const maxChars = Number.isFinite(options.maxChars) ? Math.max(128, options.maxChars) : 64 * 1024;
  return new Promise((resolve) => {
    let output = '';
    let child = null;
    let settled = false;
    const finish = (value) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      resolve(value);
    };
    const timer = setTimeout(() => {
      try { if (child) terminateProcessTree(child, { spawn: spawnImpl }); } catch (_) {}
      finish(null);
    }, timeoutMs);
    try {
      child = spawnImpl(command, args, { windowsHide: true });
    } catch (_) {
      finish(null);
      return;
    }
    child.on('error', () => finish(null));
    child.stderr?.resume?.();
    if (child.stdout) child.stdout.on('data', (chunk) => {
      output += chunk;
      if (output.length > maxChars) {
        try { terminateProcessTree(child, { spawn: spawnImpl }); } catch (_) {}
        finish(null);
      }
    });
    child.on('close', (code) => {
      if (code !== 0) return finish(null);
      finish((output.split(/\r?\n/)[0] || '').trim() || null);
    });
  });
}

module.exports = { probeCommand };
