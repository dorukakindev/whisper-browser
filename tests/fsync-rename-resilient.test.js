'use strict';
// Windows'ta antivirüs/indeksleyici dosya kilidi: hedef üzerine renameSync
// geçici EPERM/EACCES/EBUSY fırlatır; kalıcı hata ve başka kodlar aynen
// yayılır. Tüm atomik yazıcıların bu sözleşmeyi paylaştığı kilitlenir.
const { test } = require('node:test');
const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { renameSyncResilient, atomicWriteFileSync } = require('../src/fsync-utils');

function makeIo(failCount, code) {
  let calls = 0;
  return {
    calls: () => calls,
    renameSync(tmp, target) {
      calls++;
      if (calls <= failCount) {
        const err = new Error(`simulated ${code}`);
        err.code = code;
        throw err;
      }
      return fs.renameSync(tmp, target);
    },
  };
}

test('geçici EPERM kilidi çözülünce rename başarır', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-ren-'));
  const tmp = path.join(dir, 'a.tmp');
  const target = path.join(dir, 'a.json');
  fs.writeFileSync(target, 'eski');
  fs.writeFileSync(tmp, 'yeni');
  const io = makeIo(3, 'EPERM');
  renameSyncResilient(io, tmp, target);
  assert.strictEqual(fs.readFileSync(target, 'utf8'), 'yeni');
  assert.strictEqual(io.calls(), 4);
});

test('EACCES ve EBUSY aynı geçici sınıfa girer', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-ren-'));
  const tmp = path.join(dir, 'b.tmp');
  const target = path.join(dir, 'b.json');
  fs.writeFileSync(tmp, 'x');
  for (const code of ['EACCES', 'EBUSY']) {
    fs.writeFileSync(tmp, 'x');
    const io = makeIo(2, code);
    renameSyncResilient(io, tmp, target);
    assert.strictEqual(io.calls(), 3);
  }
});

test('kalıcı EPERM deneme tavanına kadar tekrarlar sonra fırlatır', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-ren-'));
  const tmp = path.join(dir, 'c.tmp');
  fs.writeFileSync(tmp, 'x');
  const io = makeIo(Number.MAX_SAFE_INTEGER, 'EPERM');
  assert.throws(() => renameSyncResilient(io, tmp, path.join(dir, 'c.json'), { attempts: 4, delayMs: 5 }), /EPERM/);
  assert.strictEqual(io.calls(), 4);
});

test('retry sınıfı dışı kodlar (ENOENT, ENOSPC, EXDEV) ilk denemede fırlatılır', () => {
  for (const code of ['ENOENT', 'ENOSPC', 'EXDEV']) {
    const io = makeIo(Number.MAX_SAFE_INTEGER, code);
    assert.throws(() => renameSyncResilient(io, 't', 'u'), new RegExp(code));
    assert.strictEqual(io.calls(), 1);
  }
});

test('atomicWriteFileSync kilitli hedefi de tolere eder', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-aw-'));
  const target = path.join(dir, 's.json');
  fs.writeFileSync(target, 'eski');
  let renameCalls = 0;
  const io = {
    ...fs,
    renameSync(tmp, t) {
      renameCalls++;
      if (renameCalls === 1) { const e = new Error('AV kilit'); e.code = 'EBUSY'; throw e; }
      return fs.renameSync(tmp, t);
    },
  };
  atomicWriteFileSync(target, '{"v":1}', { io });
  assert.strictEqual(fs.readFileSync(target, 'utf8'), '{"v":1}');
});

test('tek-geçişli atomik yazıcılar sahte-io sözleşmesini bozmaz', () => {
  // io'ya enjekte edilen renameSync'in tek bir çağrıyla başardığı mevcut testler
  // aynen geçmeli — davranış değişikliği yalnız hata durumundadır.
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-once-'));
  const target = path.join(dir, 'o.json');
  let renames = 0;
  const io = {
    ...fs,
    renameSync(tmp, t) { renames++; return fs.renameSync(tmp, t); },
  };
  atomicWriteFileSync(target, 'payload', { io });
  assert.strictEqual(renames, 1);
});
