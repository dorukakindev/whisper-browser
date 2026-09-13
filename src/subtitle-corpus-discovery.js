'use strict';
const path = require('node:path');

function discoverHamFinalPairs(fs, root, excluded = []) {
  const skip = new Set((excluded || []).map((item) => String(item).replace(/\\/g, '/')));
  const pairs = [];
  const walk = (directory) => {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const fullPath = path.join(directory, entry.name);
      if (entry.isDirectory()) walk(fullPath);
      else if (entry.isFile() && entry.name.endsWith('.ham.srt')) {
        const target = fullPath.slice(0, -8) + '.srt';
        const relativeSource = path.relative(root, fullPath).replace(/\\/g, '/');
        if (skip.has(relativeSource) || !fs.existsSync(target)) continue;
        pairs.push({ name: path.basename(target, '.srt'), source: fullPath, target,
          relativeSource, relativeTarget: path.relative(root, target).replace(/\\/g, '/') });
      }
    }
  };
  walk(root);
  return pairs.sort((a, b) => a.relativeSource.localeCompare(b.relativeSource, 'tr'));
}

module.exports = { discoverHamFinalPairs };
