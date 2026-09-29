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

  const invalidSchema = path.join(dir, 'invalid-schema.json');
  fs.writeFileSync(invalidSchema, JSON.stringify({ version: 99, entries: [['a', 'yanlış']] }), 'utf8');
  fs.writeFileSync(`${invalidSchema}.bak`, JSON.stringify({ version: 2, entries: [
    ['a', { value: 'Yedekten geldi', updatedAt: Date.now() }],
  ] }), 'utf8');
  const recoveredSchema = new PersistentTranslationCache(invalidSchema);
  assert.equal(recoveredSchema.get('a'), 'Yedekten geldi');
  assert(fs.readdirSync(dir).some((name) => name.startsWith('invalid-schema.json.corrupt-')),
    'geçerli JSON ama bozuk şema da yedek dönüşü için arşivlenmeli');

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
  // Sıralama yalnız sıkıştırmada kalıcılaşır; journal yolu base dosyayı
  // her flush'ta yeniden yazmaz.
  await lru.compact();
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
  racing = new PersistentTranslationCache(racingFile,
    { fsModule: delayedFs, minFlushIntervalMs: 500, journalMaxFlushes: 1 });
  racing.set('first', 'Önce');
  const raced = await racing.flush();
  assert(raced.ok, 'eşzamanlı set flush işlemini kilitlememeli');
  await racing.flush();
  const racedKeys = JSON.parse(fs.readFileSync(racingFile, 'utf8')).entries.map(([key]) => key);
  assert.deepEqual(racedKeys, ['first', 'late']);

  const journalFile = path.join(dir, 'journal.json');
  const journaled = new PersistentTranslationCache(journalFile, { limit: 100, journalMaxFlushes: 100 });
  journaled.set('k1', 'ilk');
  await journaled.flush();
  assert(fs.existsSync(journalFile), 'ilk flush temel dosyayı kurmalı');
  journaled.set('k2', 'ikinci');
  await journaled.flush();
  const journalPath = `${journalFile}.journal`;
  assert(fs.existsSync(journalPath), 'artımlı yazımlar .journal dosyasına eklenmeli');
  const baseBefore = fs.readFileSync(journalFile, 'utf8');
  assert(!baseBefore.includes('ikinci'), 'journal turunda temel dosya yeniden yazılmamalı');
  const replayed = new PersistentTranslationCache(journalFile);
  assert.equal(replayed.get('k1'), 'ilk');
  assert.equal(replayed.get('k2'), 'ikinci', 'yeni oturum journal satırlarını tekrar uygulamalı');
  const compacted = new PersistentTranslationCache(journalFile, { limit: 100, journalMaxFlushes: 1 });
  compacted.set('k3', 'üçüncü');
  await compacted.flush();
  assert(!fs.existsSync(journalPath), 'sıkıştırma journal dosyasını temizlemeli');
  assert(JSON.parse(fs.readFileSync(journalFile, 'utf8')).entries.some(([key]) => key === 'k3'));

  // Sıkıştırma unlink'i başarısız kalınca kalan bayat journal, temeldeki
  // aynı/yeni kaydın üstüne eski değeri uygulamamalı (satır-bazlı dedup).
  // Temelde olmayan satır kayıp değil kazanım — yine uygulanır.
  const staleFile = path.join(dir, 'stale.json');
  fs.writeFileSync(staleFile, JSON.stringify({ version: 2, entries: [['newK', { value: 'yeni', updatedAt: Date.now() }]] }));
  const staleJournal = `${staleFile}.journal`;
  fs.writeFileSync(staleJournal,
    JSON.stringify({ k: 'newK', v: 'ESKİ', t: Date.now() - 5000 }) + '\n');
  const staleLoaded = new PersistentTranslationCache(staleFile);
  assert.equal(staleLoaded.get('newK'), 'yeni', 'bayat journal satırı yeni değeri ezmemeli');

  // Hiç geçerli satır taşımayan (okunamaz/boş) journal temizlenir.
  const emptyJFile = path.join(dir, 'emptyj.json');
  fs.writeFileSync(emptyJFile, JSON.stringify({ version: 2, entries: [['eK', { value: 'e', updatedAt: Date.now() }]] }));
  const emptyJournal = `${emptyJFile}.journal`;
  fs.writeFileSync(emptyJournal, 'bozuk-satır\n{bad\n');
  new PersistentTranslationCache(emptyJFile);
  assert(!fs.existsSync(emptyJournal), 'geçerli satırsız journal yüklenirken silinmeli');

  // Birincil bozulup .bak'a düşüldüğünde journal satırları korunur —
  // son sıkıştırmanın eklediği çeviriler yedekte bulunmaz.
  const bakFile = path.join(dir, 'bakfall.json');
  const goodBak = JSON.stringify({ version: 2, entries: [['b1', { value: 'taban', updatedAt: Date.now() }]] });
  fs.writeFileSync(`${bakFile}.bak`, goodBak);
  fs.writeFileSync(bakFile, '{bozuk-json', 'utf8');
  const bakJournal = `${bakFile}.journal`;
  fs.writeFileSync(bakJournal, JSON.stringify({ k: 'b2', v: 'journal-değeri', t: Date.now() }) + '\n');
  const bakLoaded = new PersistentTranslationCache(bakFile);
  assert.equal(bakLoaded.get('b1'), 'taban', '.bak kurtarması çalışmalı');
  assert.equal(bakLoaded.get('b2'), 'journal-değeri', '.bak yolunda journal satırları korunmalı');

  // get() ile güncellenen LRU sırası journal'a biner: yeniden açılışta
  // yakın kullanılan kayıt eski sırayla kesilmez.
  const recencyFile = path.join(dir, 'recency.json');
  const recency = new PersistentTranslationCache(recencyFile, { journalMaxFlushes: 100 });
  recency.limit = 3; // kurucu limit'i ≥100'e kelepçeler; kesim yolunu küçük limitle egzersiz et
  recency.set('a', 'A'); await recency.flush();
  recency.set('b', 'B'); recency.set('c', 'C');
  recency.get('a'); // 'a' yeniden kullanıldı — en yeni konuma taşınmalı
  recency.set('d', 'D');
  await recency.flush();
  const recencyReload = new PersistentTranslationCache(recencyFile);
  recencyReload.limit = 3;
  // Yeniden açılış limiti load() içindeki slice(-limit) ile uygulanır —
  // kurucu ≥100'e kelepçelediği için aynı kesimi burada elle üret.
  recencyReload.map = new Map([...recencyReload.map].slice(-3));
  assert.equal(recencyReload.get('a'), 'A', 'yakın kullanılan kayıt yeniden açılışta yaşamalı');
  assert.equal(recencyReload.get('d'), 'D');
  assert.equal(recencyReload.get('b'), undefined, 'en eski kullanılan kayıt kesilmeli');

  const churnFile = path.join(dir, 'churn.json');
  for (let i = 0; i < 7; i++) {
    fs.writeFileSync(churnFile, `{bozuk-${i}`, 'utf8');
    new PersistentTranslationCache(churnFile, { limit: 10 });
  }
  const corruptArchives = fs.readdirSync(dir).filter((name) => name.startsWith('churn.json.corrupt-'));
  assert(corruptArchives.length >= 1 && corruptArchives.length <= 5,
    `.corrupt arşivleri sınırda kalmalı, bulundu: ${corruptArchives.length}`);

  // Kapasite kesimi mezar taşı: journal'daki eski satır kesilen kaydı
  // yeniden açılışta diriltmemeli (eskiden replay onu en yeni yapardı).
  const evictFile = path.join(dir, 'evict.json');
  const evict = new PersistentTranslationCache(evictFile, { journalMaxFlushes: 100 });
  evict.limit = 3;
  evict.set('old', 'eski');
  await evict.flush();
  evict.set('n1', 'v1'); evict.set('n2', 'v2'); evict.set('n3', 'v3');
  await evict.flush();
  const evictReload = new PersistentTranslationCache(evictFile);
  assert.equal(evictReload.get('old'), undefined, 'kesilen kayıt dirilmemeli');
  assert.equal(evictReload.get('n3'), 'v3', 'yaşayan kayıt kalmalı');

  // TTL'i aşmış journal satırları yüklemede elenir — temel dosyayla aynı kural.
  const ttlFile = path.join(dir, 'ttlj.json');
  fs.writeFileSync(ttlFile, JSON.stringify({ version: 2, entries: [] }));
  fs.writeFileSync(`${ttlFile}.journal`,
    JSON.stringify({ k: 'stale', v: 'bayat', t: Date.now() - 120_000 })
    + '\n' + JSON.stringify({ k: 'fresh', v: 'taze', t: Date.now() }) + '\n');
  const ttlLoaded = new PersistentTranslationCache(ttlFile, { ttlMs: 5_000 });
  assert.equal(ttlLoaded.get('stale'), undefined, 'süresi dolmuş journal satırı yüklenmemeli');
  assert.equal(ttlLoaded.get('fresh'), 'taze');

  // Bayat mezar taşı daha yeni temel kaydı silmez: sıkıştırma sonrası kalan
  // eski journal'daki v:'' satırı, temel dosyadaki güncel kaydı ezmeyi değil
  // atlanmayı hak eder (değer satırlarındaki dedup kuralının aynası).
  const staleTombFile = path.join(dir, 'staletomb.json');
  const freshStamp = Date.now();
  fs.writeFileSync(staleTombFile, JSON.stringify({ version: 2,
    entries: [['keep', { value: 'yeni', updatedAt: freshStamp }]] }));
  fs.writeFileSync(`${staleTombFile}.journal`,
    JSON.stringify({ k: 'keep', v: '', t: freshStamp - 60_000 }) + '\n');
  const staleTombLoaded = new PersistentTranslationCache(staleTombFile);
  assert.equal(staleTombLoaded.get('keep'), 'yeni', 'bayat mezar taşı yeni kaydı silmemeli');

  // `v` alanı olmayan bozuk satır mezar taşı sayılmaz.
  const noVFile = path.join(dir, 'nov.json');
  fs.writeFileSync(noVFile, JSON.stringify({ version: 2,
    entries: [['victim', { value: 'sağlam', updatedAt: Date.now() }]] }));
  fs.writeFileSync(`${noVFile}.journal`, JSON.stringify({ k: 'victim', t: Date.now() }) + '\n');
  const noVLoaded = new PersistentTranslationCache(noVFile);
  assert.equal(noVLoaded.get('victim'), 'sağlam', 'v-siz satır kaydı silmemeli');

  // .bak sıkıştırma SONRASI içeriği tutar: birincil bozulunca geri dönüşte
  // journal'dan katlanan son kayıtlar kaybolmaz.
  const bakCompFile = path.join(dir, 'bakcomp.json');
  const bakComp = new PersistentTranslationCache(bakCompFile, { journalMaxFlushes: 1 });
  bakComp.set('x1', 'v1');
  await bakComp.flush();
  bakComp.set('x2', 'v2');
  await bakComp.flush(); // 2. flush journal eşiğini aşar → compact + .bak
  fs.writeFileSync(bakCompFile, '{bozuk', 'utf8');
  const bakCompLoaded = new PersistentTranslationCache(bakCompFile);
  assert.equal(bakCompLoaded.get('x1'), 'v1', '.bak sıkıştırılmış içeriği korumalı');
  assert.equal(bakCompLoaded.get('x2'), 'v2', 'journal-katlı kayıt .bak ile kurtarılmalı');

  console.log('browser-translation-cache: 12 test');
} finally {
  fs.rmSync(dir, { recursive: true, force: true });
} })().catch((error) => { console.error(error); process.exitCode = 1; });
