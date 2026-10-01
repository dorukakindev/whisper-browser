'use strict';

const fs = require('fs');
const path = require('path');

function runtimeRoot(userDataPath) {
  return path.join(userDataPath, 'yt-dlp-runtime');
}

function resolveInside(root, relativePath) {
  if (typeof relativePath !== 'string' || !relativePath
    || path.isAbsolute(relativePath) || path.win32.isAbsolute(relativePath)) return '';
  const resolvedRoot = path.resolve(root);
  const resolved = path.resolve(resolvedRoot, relativePath.replace(/\\/g, path.sep));
  const prefix = resolvedRoot.endsWith(path.sep) ? resolvedRoot : `${resolvedRoot}${path.sep}`;
  return resolved.startsWith(prefix) ? resolved : '';
}

// Sağlıklı bir yt-dlp paketinin asgari modül işaretleri — update_ytdlp.py
// tarafındaki _healthy_package listesiyle aynı tutulmalı.
const RUNTIME_REQUIRED_MODULES = [
  path.join('yt_dlp', '__init__.py'),
  path.join('yt_dlp', 'version.py'),
  path.join('yt_dlp', 'YoutubeDL.py'),
  path.join('yt_dlp', 'extractor', '__init__.py'),
];

function activeRuntimePath(root, fsImpl = fs) {
  let pointer;
  try {
    pointer = JSON.parse(fsImpl.readFileSync(path.join(root, 'active.json'), 'utf8'));
  } catch (_) {
    return '';
  }
  for (const candidate of [pointer && pointer.path, pointer && pointer.previous]) {
    const resolved = resolveInside(root, candidate);
    // Yarım silinmiş/karantinaya alınmış paket: __init__.py tek başına paketi
    // işe yaramaz kılmaz; validate_runtime'ın kullandığı yt_dlp.version ve
    // uygulamanın gerçekte içe aktardığı YoutubeDL modülleri de durmalı ki
    // eksik modüllü paket seçilip YouTube işlemleri import hataya düşmesin.
    if (resolved && RUNTIME_REQUIRED_MODULES.every((rel) => fsImpl.existsSync(path.join(resolved, rel)))) return resolved;
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
