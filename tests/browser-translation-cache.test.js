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
  cache.set('b', 'Dünya');
  await cache.flush();
  fs.writeFileSync(file, '{bozuk');
  const fromBackup = new PersistentTranslationCache(file);
  assert.equal(fromBackup.get('a'), 'Merhaba');
  assert(fs.readdirSync(dir).some((name) => name.startsWith('cache.json.corrupt-')),
    'bozuk ana cache geri dönüş için arşivlenmeli');

  const bothBroken = path.join(dir, 'both-broken.json');
  fs.writeFileSync(bothBroken, '{bozuk', 'utf8');
  fs.writeFileSync(`${bothBroken}.bak`, '[bozuk', 'utf8');
  const empty = new PersistentTranslationCache(bothBroken);
  assert.equal(empty.get('a'), undefined);
  assert(fs.readdirSync(dir).some((name) => name.startsWith('both-broken.json.corrupt-')));
  assert(fs.readdirSync(dir).some((name) => name.startsWith('both-broken.json.bak.corrupt-')));

  const expiredFile = path.join(dir, 'expired.json');
  fs.writeFileSync(expiredFile, JSON.stringify({ version: 2, entries: [
    ['old', { value: 'Eski', updatedAt: Date.now() - 120_000 }],
  ] }));
  const expiring = new PersistentTranslationCache(expiredFile, { ttlMs: 60_000 });
  assert.equal(expiring.get('old'), undefined);
  await expiring.flush();

  const lruFile = path.join(dir, 'lru.json');
  const lru = new PersistentTranslationCache(lruFile, { limit: 100 });
  lru.set('once', 'Bir');
  lru.set('recent', 'İki');
  await lru.flush();
  assert.equal(lru.get('once'), 'Bir');
  await lru.flush();
  assert.deepEqual(JSON.parse(fs.readFileSync(lruFile, 'utf8')).entries.map(([key]) => key), ['recent', 'once']);
  const quietFile = path.join(dir, 'quiet.json');
  const quiet = new PersistentTranslationCache(quietFile, { limit: 100 });
  quiet.set('read', 'Sessiz');
  await quiet.flush();
  assert.equal(quiet.get('read'), 'Sessiz');
  assert.equal(quiet.timer, null, 'get() tek başına disk yazımı planlamamalı');
  quiet.map.set('expired-live', { value: 'Eski', updatedAt: Date.now() - quiet.ttlMs - 1 });
  assert.equal(quiet.get('expired-live'), undefined);
  assert.equal(quiet.timer, null, 'süresi dolmuş get() sıcak yolda disk yazımı planlamamalı');

  const racingFile = path.join(dir, 'racing.json');
  let racing;
  let firstWrite = true;
  const delayedFs = Object.assign({}, fs, { promises: Object.assign({}, fs.promises, {
    async writeFile(...args) {
      if (firstWrite) {
        firstWrite = false;
        setTimeout(() => racing.set('late', 'Sonra'), 5);
        await new Promise((resolve) => setTimeout(resolve, 30));
      }
      return fs.promises.writeFile(...args);
    },
  }) });
  racing = new PersistentTranslationCache(racingFile, { fsModule: delayedFs, minFlushIntervalMs: 500 });
  racing.set('first', 'Önce');
  const raced = await racing.flush();
  assert(raced.ok, 'eşzamanlı set flush işlemini kilitlememeli');
  await racing.flush();
  const racedKeys = JSON.parse(fs.readFileSync(racingFile, 'utf8')).entries.map(([key]) => key);
  assert.deepEqual(racedKeys, ['first', 'late']);
  console.log('browser-translation-cache: 5 test');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
} })().catch((error) => { console.error(error); process.exitCode = 1; });
