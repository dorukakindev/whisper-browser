'use strict';

function createBrowserSubtitleFileStore(options = {}) {
  const fs = options.fs;
  const path = options.path;
  if (!fs || !path) throw new TypeError('fs ve path bağımlılıkları gerekli.');
  const directory = path.resolve(String(options.directory || ''));
  const directoryKey = directory.toLowerCase();
  const limit = Math.max(1, Math.floor(Number(options.limit) || 64));
  let entries = null;

  function isOwnedFile(file) {
    const resolved = path.resolve(String(file || ''));
    return path.dirname(resolved).toLowerCase() === directoryKey
      && /^web-.*\.srt$/i.test(path.basename(resolved));
  }

  function ensureIndex() {
    if (entries) return entries;
    entries = new Map();
    try {
      for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
        if (!entry.isFile() || !/^web-.*\.srt$/i.test(entry.name)) continue;
        const file = path.resolve(path.join(directory, entry.name));
        try { entries.set(file, Number(fs.statSync(file).mtimeMs) || 0); } catch (_) {}
      }
    } catch (_) {}
    return entries;
  }

  function touch(file, protectedFiles = []) {
    const index = ensureIndex();
    if (!isOwnedFile(file)) return { count: index.size, removed: 0 };
    const resolved = path.resolve(file);
    index.set(resolved, Date.now());
    const protectedSet = new Set((Array.isArray(protectedFiles) ? protectedFiles : [])
      .filter(isOwnedFile)
      .map((item) => path.resolve(item).toLowerCase()));
    protectedSet.add(resolved.toLowerCase());
    let removed = 0;
    for (const [candidate] of [...index.entries()].sort((a, b) => a[1] - b[1])) {
      if (index.size <= limit) break;
      if (protectedSet.has(candidate.toLowerCase())) continue;
      try {
        fs.unlinkSync(candidate);
        index.delete(candidate);
        removed += 1;
      } catch (_) {}
    }
    return { count: index.size, removed };
  }

  function snapshot() {
    return { count: ensureIndex().size, limit };
  }

  return { snapshot, touch };
}

module.exports = { createBrowserSubtitleFileStore };
