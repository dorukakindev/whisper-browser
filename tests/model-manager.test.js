const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { MODEL_CATALOG, deleteCachedModel, modelCacheRoots, repositoryMatchesModel, scanModelCache } = require('../src/model-manager');

let passed = 0;
function test(name, fn) { fn(); passed += 1; }

test('Hugging Face önbellek yollarını tekrarsız üretir', () => {
  const roots = modelCacheRoots('C:\\app', { HF_HOME: 'C:\\hf', USERPROFILE: 'C:\\user' });
  assert(roots.some((item) => item.endsWith(path.join('hf', 'hub'))));
  assert.equal(new Set(roots).size, roots.length);
});

test('model depo adları güvenli biçimde eşlenir', () => {
  assert(repositoryMatchesModel('models--Systran--faster-whisper-small', 'small'));
  assert(repositoryMatchesModel('models--mobiuslabsgmbh--faster-whisper-large-v3-turbo', 'large-v3-turbo'));
  assert(!repositoryMatchesModel('models--mobiuslabsgmbh--faster-whisper-large-v3-turbo', 'large-v3'));
  assert(!repositoryMatchesModel('models--example--large-v3-turbo-corrupt-copy', 'large-v3-turbo'));
  assert(!repositoryMatchesModel('models--Systran--faster-whisper-base', 'large-v3'));
});

test('yalnızca tamamlanmış model anlık görüntüsü indirilmiş görünür', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-model-cache-'));
  const repo = path.join(root, 'models--Systran--faster-whisper-small');
  fs.mkdirSync(repo);
  let result = scanModelCache('', { HUGGINGFACE_HUB_CACHE: root });
  assert.equal(result.models.find((item) => item.id === 'small').installed, false);
  const snapshot = path.join(repo, 'snapshots', 'abc123');
  fs.mkdirSync(snapshot, { recursive: true });
  for (const name of ['config.json', 'model.bin', 'tokenizer.json']) {
    fs.writeFileSync(path.join(snapshot, name), name);
  }
  result = scanModelCache('', { HUGGINGFACE_HUB_CACHE: root });
  assert.equal(result.models.find((item) => item.id === 'small').installed, true);
  assert.equal(result.models.find((item) => item.id === 'medium').installed, false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('önbellek taraması boyut, katalog ve boş disk bilgisi taşır', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-model-cache-'));
  const snapshot = path.join(root, 'models--Systran--faster-whisper-tiny', 'snapshots', 'abc');
  fs.mkdirSync(snapshot, { recursive: true });
  for (const name of ['config.json', 'model.bin', 'tokenizer.json']) {
    fs.writeFileSync(path.join(snapshot, name), 'x'.repeat(100));
  }
  const result = scanModelCache('', { HUGGINGFACE_HUB_CACHE: root });
  const tiny = result.models.find((item) => item.id === 'tiny');
  assert.equal(tiny.installed, true);
  assert(tiny.sizeBytes >= 300, 'kurulu boyut ölçülmeli');
  assert.equal(tiny.downloadMb, MODEL_CATALOG.tiny.downloadMb);
  assert.equal(tiny.vramMb, MODEL_CATALOG.tiny.vramMb);
  assert(typeof result.freeBytes === 'number' && result.freeBytes > 0, 'boş disk');
  fs.rmSync(root, { recursive: true, force: true });
});

test('henüz oluşmamış önbellek kökünde üst dizinden boş disk ölçülür', () => {
  const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-model-parent-'));
  const missing = path.join(parent, 'not-created', 'hub');
  const result = scanModelCache('', { HUGGINGFACE_HUB_CACHE: missing });
  assert(typeof result.freeBytes === 'number' && result.freeBytes > 0);
  fs.rmSync(parent, { recursive: true, force: true });
});

test('yarım model indirmesi görünür ve açıkça temizlenebilir', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-model-partial-'));
  const repo = path.join(root, 'models--Systran--faster-whisper-small');
  fs.mkdirSync(path.join(repo, 'blobs'), { recursive: true });
  fs.writeFileSync(path.join(repo, 'blobs', 'partial'), 'incomplete');
  const env = { HUGGINGFACE_HUB_CACHE: root };
  const entry = scanModelCache('', env).models.find((item) => item.id === 'small');
  assert.equal(entry.installed, false);
  assert.equal(entry.cached, true);
  assert.equal(entry.partial, true);
  const result = deleteCachedModel('', 'small', env);
  assert.equal(result.ok, true);
  assert.equal(fs.existsSync(repo), false);
  fs.rmSync(root, { recursive: true, force: true });
});

test('başka kökteki sağlam model daha önceki yarım kopyaya tercih edilir', () => {
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-model-multi-'));
  const first = path.join(temp, 'first');
  const second = path.join(temp, 'second');
  fs.mkdirSync(path.join(first, 'models--Systran--faster-whisper-small', 'snapshots', 'partial'), { recursive: true });
  const usable = path.join(second, 'models--Systran--faster-whisper-small', 'snapshots', 'complete');
  fs.mkdirSync(usable, { recursive: true });
  for (const name of ['config.json', 'model.bin', 'tokenizer.json']) {
    fs.writeFileSync(path.join(usable, name), name);
  }
  const status = scanModelCache('', {
    HUGGINGFACE_HUB_CACHE: first,
    TRANSFORMERS_CACHE: second,
  });
  const small = status.models.find((entry) => entry.id === 'small');
  assert.equal(small.installed, true);
  assert.equal(small.partial, false);
  fs.rmSync(temp, { recursive: true, force: true });
});

test('deleteCachedModel yalnız kurulu modeli, yalnız önbellek kökü içinde siler', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-model-cache-'));
  const env = { HUGGINGFACE_HUB_CACHE: root };
  assert.equal(deleteCachedModel('', 'nonexistent-model', env).ok, false);
  assert.equal(deleteCachedModel('', 'small', env).ok, false);
  const snapshot = path.join(root, 'models--Systran--faster-whisper-base', 'snapshots', 'def');
  fs.mkdirSync(snapshot, { recursive: true });
  for (const name of ['config.json', 'model.bin', 'tokenizer.json']) {
    fs.writeFileSync(path.join(snapshot, name), 'x'.repeat(50));
  }
  const sibling = path.join(root, 'models--Systran--faster-whisper-small');
  fs.mkdirSync(sibling, { recursive: true });
  const res = deleteCachedModel('', 'base', env);
  assert.equal(res.ok, true);
  assert(res.freedBytes >= 150, 'boşalan boyut raporlanmalı');
  assert(!fs.existsSync(path.join(root, 'models--Systran--faster-whisper-base')));
  assert(fs.existsSync(sibling), 'başka depo dokunulmasın');
  assert.equal(scanModelCache('', env).models.find((m) => m.id === 'base').installed, false);
  fs.rmSync(root, { recursive: true, force: true });
});

console.log(`model-manager: ${passed} test`);
