const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { PersistentTranslationCache } = require('../src/browser-translation-cache');

const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-translation-cache-'));
(async () => { try {
  const file = path.join(dir, 'cache.json');
  const cache = new PersistentTranslationCache(file, { limit: 100 });
  assert.equal(cache.set('a', 'Merhaba'), true);
  assert.equal(cache.get('a'), 'Merhaba');
  assert((await cache.flush()).ok);
  const restored = new PersistentTranslationCache(file);
  assert.equal(restored.get('a'), 'Merhaba');
  assert.equal(JSON.parse(fs.readFileSync(file, 'utf8')).version, 2);

  const expiredFile = path.join(dir, 'expired.json');
  fs.writeFileSync(expiredFile, JSON.stringify({ version: 2, entries: [
    ['old', { value: 'Eski', updatedAt: Date.now() - 120_000 }],
  ] }));
  const expiring = new PersistentTranslationCache(expiredFile, { ttlMs: 60_000 });
  assert.equal(expiring.get('old'), undefined);
  await expiring.flush();
  console.log('browser-translation-cache: 2 test');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
} })().catch((error) => { console.error(error); process.exitCode = 1; });
