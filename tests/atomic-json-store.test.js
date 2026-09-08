/** Atomik JSON yazıcısı: crash, disk/rename hatası, recovery ve yarış testleri. */
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawn, spawnSync } = require('child_process');
const {
  atomicWriteJson,
  readJsonWithBackup,
} = require('../src/atomic-json-store');

let pass = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; console.log(`  PASS  ${name}`); }
  catch (error) { failures.push(`${name}: ${error.stack || error.message}`); console.log(`  FAIL  ${name} — ${error.message}`); }
}
function assert(value, message) { if (!value) throw new Error(message || 'assert'); }
function json(filePath) { return JSON.parse(fs.readFileSync(filePath, 'utf8')); }
function tempDir(name) { return fs.mkdtempSync(path.join(os.tmpdir(), `${name}-`)); }
function noTemps(directory) {
  return !fs.readdirSync(directory).some((name) => name.endsWith('.tmp'));
}
function fsProxy(overrides) {
  return new Proxy(fs, {
    get(target, property) {
      return Object.prototype.hasOwnProperty.call(overrides, property)
        ? overrides[property]
        : target[property];
    },
  });
}
function seedStore(directory) {
  const filePath = path.join(directory, 'watch-library.json');
  atomicWriteJson(filePath, [{ key: 'old', title: 'İlk sağlam' }], { validate: Array.isArray });
  atomicWriteJson(filePath, [{ key: 'stable', title: 'Son sağlam' }], { validate: Array.isArray });
  return filePath;
}
function waitForFile(filePath, timeoutMs = 5000) {
  const sleeper = new Int32Array(new SharedArrayBuffer(4));
  const deadline = Date.now() + timeoutMs;
  while (!fs.existsSync(filePath) && Date.now() < deadline) Atomics.wait(sleeper, 0, 0, 10);
  return fs.existsSync(filePath);
}

test('fsync öncesi temp ile doğrulanmış önceki dosyayı atomik yedekler', () => {
  const dir = tempDir('atomic-json-basic');
  const filePath = seedStore(dir);
  assert(json(filePath)[0].key === 'stable', 'ana dosya yeni sürüm değil');
  assert(json(`${filePath}.bak`)[0].key === 'old', 'yedek önceki sürüm değil');
  assert(noTemps(dir), 'başarılı yazım temp bıraktı');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('her dayanıklılık aşamasındaki fault injection en az bir sağlam kopya bırakır', () => {
  const stages = [
    'directory-created',
    'primary-temp-opened', 'primary-temp-written', 'primary-temp-synced', 'primary-temp-closed',
    'backup-link-attempt', 'backup-linked',
    'backup-rename-attempt', 'backup-renamed', 'backup-directory-synced',
    'primary-rename-attempt', 'primary-renamed', 'primary-directory-synced',
  ];
  for (const targetStage of stages) {
    const dir = tempDir('atomic-json-stage');
    const filePath = seedStore(dir);
    let injected = false;
    try {
      atomicWriteJson(filePath, [{ key: 'next', stage: targetStage }], {
        validate: Array.isArray,
        onStage(stage) {
          if (stage === targetStage) {
            injected = true;
            const error = new Error(`fault:${stage}`);
            error.code = 'EFAULTINJECT';
            throw error;
          }
        },
      });
    } catch (error) {
      assert(error.code === 'EFAULTINJECT', `${targetStage}: beklenmeyen hata ${error.code}`);
    }
    assert(injected, `${targetStage}: aşamaya ulaşılmadı`);
    const primary = json(filePath);
    const backup = json(`${filePath}.bak`);
    assert(Array.isArray(primary) && primary[0].key, `${targetStage}: ana dosya bozuk`);
    assert(Array.isArray(backup) && backup[0].key, `${targetStage}: yedek bozuk`);
    assert(noTemps(dir), `${targetStage}: yakalanan hata temp bıraktı`);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('hard-link desteklenmezse yedek kopyasının tüm yazım/fsync aşamaları güvenlidir', () => {
  const stages = [
    'backup-link-fallback',
    'backup-temp-opened', 'backup-temp-written', 'backup-temp-synced', 'backup-temp-closed',
  ];
  for (const targetStage of stages) {
    const dir = tempDir('atomic-json-copy-fallback');
    const filePath = seedStore(dir);
    const injectedFs = fsProxy({
      linkSync() {
        const error = new Error('hard-link desteklenmiyor');
        error.code = 'ENOTSUP';
        throw error;
      },
    });
    let injected = false;
    try {
      atomicWriteJson(filePath, [{ key: 'fallback', stage: targetStage }], {
        fsImpl: injectedFs,
        validate: Array.isArray,
        onStage(stage) {
          if (stage === targetStage) {
            injected = true;
            const error = new Error(`fault:${stage}`);
            error.code = 'EFAULTINJECT';
            throw error;
          }
        },
      });
    } catch (error) {
      assert(error.code === 'EFAULTINJECT', `${targetStage}: beklenmeyen hata ${error.code}`);
    }
    assert(injected, `${targetStage}: aşamaya ulaşılmadı`);
    assert(Array.isArray(json(filePath)), `${targetStage}: ana dosya bozuk`);
    assert(Array.isArray(json(`${filePath}.bak`)), `${targetStage}: yedek bozuk`);
    assert(noTemps(dir), `${targetStage}: yakalanan hata temp bıraktı`);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('disk dolu ve yarım temp yazımı ana dosyayı değiştirmez', () => {
  const dir = tempDir('atomic-json-full');
  const filePath = seedStore(dir);
  const before = fs.readFileSync(filePath);
  let failNextWrite = true;
  const injectedFs = fsProxy({
    writeFileSync(descriptor, data) {
      if (!failNextWrite) return fs.writeFileSync(descriptor, data);
      failNextWrite = false;
      fs.writeSync(descriptor, data, 0, Math.max(1, Math.floor(data.length / 2)));
      const error = new Error('disk dolu');
      error.code = 'ENOSPC';
      throw error;
    },
  });
  let error = null;
  try {
    atomicWriteJson(filePath, [{ key: 'yarım', title: 'Türkçe 🧿' }], {
      fsImpl: injectedFs,
      validate: Array.isArray,
    });
  } catch (caught) { error = caught; }
  assert(error && error.code === 'ENOSPC', 'ENOSPC çağırana ulaşmadı');
  assert(fs.readFileSync(filePath).equals(before), 'ana dosya yarım içerikle değişti');
  assert(noTemps(dir), 'yarım temp temizlenmedi');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('geçici antivirus rename kilidi sınırlı tekrar sonunda tamamlanır', () => {
  const dir = tempDir('atomic-json-av-retry');
  const filePath = seedStore(dir);
  let attempts = 0;
  const injectedFs = fsProxy({
    renameSync(source, destination) {
      if (destination === filePath && attempts++ < 2) {
        const error = new Error('antivirus kilidi');
        error.code = 'EACCES';
        throw error;
      }
      return fs.renameSync(source, destination);
    },
  });
  atomicWriteJson(filePath, [{ key: 'after-lock' }], {
    fsImpl: injectedFs,
    validate: Array.isArray,
    renameRetryDelaysMs: [0, 0, 0, 0],
    waitSync: () => {},
  });
  assert(attempts === 3, `rename ${attempts} kez denendi`);
  assert(json(filePath)[0].key === 'after-lock', 'kilit kalkınca yeni sürüm yazılmadı');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('kalıcı rename kilidi önceki ana dosyayı ve cache adayı korur', () => {
  const dir = tempDir('atomic-json-av-fail');
  const filePath = seedStore(dir);
  const before = fs.readFileSync(filePath);
  let attempts = 0;
  const injectedFs = fsProxy({
    renameSync(source, destination) {
      if (destination === filePath) {
        attempts++;
        const error = new Error('kalıcı kilit');
        error.code = 'EPERM';
        throw error;
      }
      return fs.renameSync(source, destination);
    },
  });
  let error = null;
  try {
    atomicWriteJson(filePath, [{ key: 'blocked' }], {
      fsImpl: injectedFs,
      validate: Array.isArray,
      renameRetryDelaysMs: [0, 0, 0],
      waitSync: () => {},
    });
  } catch (caught) { error = caught; }
  assert(error && error.code === 'EPERM', 'kalıcı rename hatası çağırana ulaşmadı');
  assert(attempts === 3, `rename sınırı korunmadı: ${attempts}`);
  assert(fs.readFileSync(filePath).equals(before), 'kilitte önceki ana dosya değişti');
  assert(noTemps(dir), 'rename hatası temp bıraktı');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('yarım UTF-8/JSON ana dosya son sağlam yedekten okunur', () => {
  const dir = tempDir('atomic-json-recover');
  const filePath = seedStore(dir);
  const bytes = Buffer.from('[{"key":"bozuk","title":"Türkçe 🧿"}]', 'utf8');
  fs.writeFileSync(filePath, bytes.subarray(0, bytes.length - 3));
  const recovered = readJsonWithBackup(filePath, {
    defaultValue: [],
    displayName: 'İzleme kütüphanesi',
    validate: Array.isArray,
  });
  assert(recovered.source === 'backup', 'yedek recovery seçilmedi');
  assert(recovered.value[0].key === 'old', 'son sağlam yedek dönmedi');
  assert(/yedekten kurtarıldı/.test(recovered.warning), 'Türkçe uyarı yok');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('bozuk ana dosya sağlam yedeği hiçbir yazımda ezmez', () => {
  const dir = tempDir('atomic-json-preserve-backup');
  const filePath = seedStore(dir);
  fs.writeFileSync(filePath, '{bozuk', 'utf8');
  atomicWriteJson(filePath, [{ key: 'repaired' }], { validate: Array.isArray });
  assert(json(filePath)[0].key === 'repaired', 'ana dosya onarılmadı');
  assert(json(`${filePath}.bak`)[0].key === 'old', 'bozuk ana dosya sağlam yedeği ezdi');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('iki süreç aynı anda kaydederse benzersiz temp çakışmaz ve son tamamlayan kazanır', () => {
  const dir = tempDir('atomic-json-concurrent');
  const filePath = seedStore(dir);
  const modulePath = path.join(__dirname, '..', 'src', 'atomic-json-store.js');
  const readyPath = path.join(dir, 'writer-a-ready');
  const releasePath = path.join(dir, 'writer-a-release');
  const donePath = path.join(dir, 'writer-a-done');
  const code = [
    "const fs = require('fs');",
    "const { atomicWriteJson } = require(process.argv[1]);",
    'const [filePath, readyPath, releasePath, donePath] = process.argv.slice(2);',
    'const sleeper = new Int32Array(new SharedArrayBuffer(4));',
    "atomicWriteJson(filePath, [{ key: 'writer-a' }], {",
    '  validate: Array.isArray,',
    '  onStage(stage) {',
    "    if (stage !== 'primary-rename-attempt') return;",
    "    fs.writeFileSync(readyPath, '1');",
    '    while (!fs.existsSync(releasePath)) Atomics.wait(sleeper, 0, 0, 10);',
    '  },',
    '});',
    "fs.writeFileSync(donePath, '1');",
  ].join('\n');
  const writerA = spawn(process.execPath, [
    '-e', code, modulePath, filePath, readyPath, releasePath, donePath,
  ], { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
  writerA.unref();
  assert(waitForFile(readyPath), 'ilk yazar rename öncesine ulaşmadı');
  atomicWriteJson(filePath, [{ key: 'writer-b' }], { validate: Array.isArray });
  fs.writeFileSync(releasePath, '1');
  assert(waitForFile(donePath), 'ilk yazar tamamlanmadı');
  assert(json(filePath)[0].key === 'writer-a', 'son tamamlayan yazar diskte kalmadı');
  assert(Array.isArray(json(`${filePath}.bak`)), 'eşzamanlı yazım yedeği bozdu');
  fs.rmSync(dir, { recursive: true, force: true });
});

test('gerçek süreç sonlandırma benzetiminde eski veya yeni JSON bütünüyle kalır', () => {
  const modulePath = path.join(__dirname, '..', 'src', 'atomic-json-store.js');
  const crashStages = [
    ['primary-temp-written', 'stable'],
    ['backup-renamed', 'stable'],
    ['primary-renamed', 'next'],
  ];
  for (const [stage, expectedPrimary] of crashStages) {
    const dir = tempDir('atomic-json-crash');
    const filePath = seedStore(dir);
    const code = [
      "const { atomicWriteJson } = require(process.argv[1]);",
      'const filePath = process.argv[2];',
      'const target = process.argv[3];',
      "atomicWriteJson(filePath, [{ key: 'next' }], {",
      '  validate: Array.isArray,',
      '  onStage(stage) { if (stage === target) process.exit(86); },',
      '});',
    ].join('\n');
    const child = spawnSync(process.execPath, ['-e', code, modulePath, filePath, stage], {
      cwd: path.join(__dirname, '..'),
      encoding: 'utf8',
    });
    assert(child.status === 86, `${stage}: child exit ${child.status}, ${child.stderr}`);
    assert(json(filePath)[0].key === expectedPrimary, `${stage}: ana dosya semantiği yanlış`);
    assert(Array.isArray(json(`${filePath}.bak`)), `${stage}: yedek parse edilemiyor`);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

console.log(`\n${pass} geçti, ${failures.length} başarısız (${pass + failures.length} test)`);
if (failures.length) {
  failures.forEach((failure) => console.error('  - ' + failure));
  process.exit(1);
}
