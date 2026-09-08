'use strict';

const fs = require('fs');
const path = require('path');

function runtimeRoot(userDataPath) {
  return path.join(userDataPath, 'yt-dlp-runtime');
}

function resolveInside(root, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath || path.isAbsolute(relativePath)) return '';
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath);
  const prefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;
  return resolved.startsWith(prefix) ? resolved : '';
}

function activeRuntimePath(root, fsImpl = fs) {
  let pointer;
  try {
    pointer = JSON.parse(fsImpl.readFileSync(path.join(root, 'active.json'), 'utf8'));
  } catch (_) {
    return '';
  }
  for (const candidate of [pointer && pointer.path, pointer && pointer.previous]) {
    const resolved = resolveInside(root, candidate);
    if (resolved && fsImpl.existsSync(path.join(resolved, 'yt_dlp', '__init__.py'))) return resolved;
  }
  return '';
}

function pythonEnvWithRuntime(baseEnv, root, fsImpl = fs) {
  const env = { ...(baseEnv || {}) };
  const active = activeRuntimePath(root, fsImpl);
  if (!active) return env;
  env.PYTHONPATH = env.PYTHONPATH ? `${active}${path.delimiter}${env.PYTHONPATH}` : active;
  return env;
}

module.exports = { activeRuntimePath, pythonEnvWithRuntime, resolveInside, runtimeRoot };
