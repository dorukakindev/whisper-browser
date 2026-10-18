const assert = require('node:assert/strict');
const { test } = require('node:test');
const path = require('node:path');
const { createBrowserSubtitleFileStore } = require('../src/browser-subtitle-files');

for (const missing of [[0, 1], [2, 3]]) {
test(`missing cache files ${missing} do not evict live subtitles`, () => {
  const directory = path.resolve('fixture-subtitle-cache');
  const names = ['web-a.srt', 'web-b.srt', 'web-c.srt', 'web-d.srt', 'web-e.srt'];
  const files = new Set(names.map(name => path.join(directory, name)));
  const deleted = [];
  const fs = {
    readdirSync: () => names.map(name => ({ name, isFile: () => true })),
    statSync(file) {
      if (!files.has(file)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      return { mtimeMs: names.indexOf(path.basename(file)) + 1 };
    },
    unlinkSync(file) {
      if (!files.has(file)) throw Object.assign(new Error('missing'), { code: 'ENOENT' });
      files.delete(file); deleted.push(file);
    },
  };
  const store = createBrowserSubtitleFileStore({ fs, path, directory, limit: 3 });
  assert.equal(store.snapshot().count, 5);
  for (const index of missing) files.delete(path.join(directory, names[index]));
  const result = store.touch(path.join(directory, names[4]));
  assert.equal(result.count, 3);
  assert.equal(result.removed, 0);
  assert.deepEqual(deleted, []);
  assert.equal(files.size, 3);
});
}
