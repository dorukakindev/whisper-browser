'use strict';

// Madde 48 — Windows uzun-yol (MAX_PATH >260) dayanıklılığı.
// Electron'un gömülü varsayılan manifesti longPathAware bildirmez; paket
// manifestine ws2 bildirimi ekleyen birleştirme + exe yama hattı kilitlenir.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { mergeLongPathAware, patchExeManifest, LONG_PATH_ELEMENT } = require('../tools/windows-manifest');

const TYPICAL_ELECTRON_MANIFEST = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">
  <assemblyIdentity name="Whisper Browser" version="1.0.0.0" type="win32"/>
  <compatibility xmlns="urn:schemas-microsoft-com:compatibility.v1">
    <application>
      <supportedOS Id="{8e0f7a12-bfb3-4fe8-b9a5-48fd50a15a9a}"/>
    </application>
  </compatibility>
  <application xmlns="urn:schemas-microsoft-com:asm.v3">
    <windowsSettings>
      <dpiAwareness xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">PerMonitorV2</dpiAwareness>
      <dpiAware xmlns="http://schemas.microsoft.com/SMI/2005/WindowsSettings">true</dpiAware>
    </windowsSettings>
  </application>
</assembly>`;

// 1) Tipik Electron manifesti → ws2 longPathAware mevcut windowsSettings'e eklenir.
{
  const out = mergeLongPathAware(TYPICAL_ELECTRON_MANIFEST);
  assert(out.includes('<ws2:longPathAware>true</ws2:longPathAware>'), 'ws2 öğesi eklenmedi');
  assert(out.includes('PerMonitorV2'), 'mevcut dpiAwareness kayboldu');
  assert.equal(out.indexOf('</windowsSettings>') > out.indexOf('longPathAware'), true, 'öğe blok dışına düştü');
  // windowsSettings blok sınırları içinde mi? longPathAware, </windowsSettings>'ten ÖNCE gelmeli.
  const wsClose = out.indexOf('</windowsSettings>', out.indexOf('asm.v3'));
  const lpIdx = out.indexOf('<ws2:longPathAware');
  assert(lpIdx > 0 && lpIdx < wsClose, 'longPathAware windowsSettings içinde değil');
}

// 2) Idempotent — zaten varsa dokunmaz.
{
  const once = mergeLongPathAware(TYPICAL_ELECTRON_MANIFEST);
  assert.equal(mergeLongPathAware(once), once, 'idempotent değil');
  const custom = TYPICAL_ELECTRON_MANIFEST.replace('</windowsSettings>', '<longPathAware xmlns="http://schemas.microsoft.com/SMI/2016/WindowsSettings">true</longPathAware></windowsSettings>');
  assert.equal(mergeLongPathAware(custom), custom);
}

// 3) asm.v3 application'ı olup <windowsSettings>'i olmayan manifest.
{
  const minimal = `<?xml version="1.0"?><assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0">${'<application xmlns="urn:schemas-microsoft-com:asm.v3"></application>'}</assembly>`;
  const out = mergeLongPathAware(minimal);
  assert(out.includes(LONG_PATH_ELEMENT), 'application bloğuna eklenmedi');
  assert(out.indexOf('<windowsSettings>') < out.indexOf(LONG_PATH_ELEMENT) &&
    out.indexOf(LONG_PATH_ELEMENT) < out.indexOf('</windowsSettings>'), 'windowsSettings blok biçimi bozuk');
}

// 4) Hiç asm.v3 application bloğu olmayan manifest → </assembly> öncesi komple ekler.
{
  const bare = `<?xml version="1.0"?><assembly xmlns="urn:schemas-microsoft-com:asm.v1" manifestVersion="1.0"><assemblyIdentity name="x" version="1" type="win32"/></assembly>`;
  const out = mergeLongPathAware(bare);
  assert(out.includes('urn:schemas-microsoft-com:asm.v3') && out.includes(LONG_PATH_ELEMENT));
  assert(out.trim().endsWith('</assembly>'), 'assembly kapanışı bozuldu');
}

// 5) Bozuk girdi güvenli — değişmez döner.
for (const bad of ['', 'x', '<assembly>', null, 42])
  assert.equal(mergeLongPathAware(bad), String(bad || ''));

// 6) patchExeManifest — sahte resedit ile uçtan-uca akış.
{
  const calls = [];
  const fakeResedit = {
    NtExecutable: {
      from: (buf) => ({ _bin: buf, generate: () => Buffer.from('PATCHEX') }),
    },
    NtExecutableResource: {
      from: () => ({
        entries: [{ type: 24, bin: Buffer.from(TYPICAL_ELECTRON_MANIFEST, 'utf8') }],
        outputResource: () => calls.push('outputResource'),
      }),
    },
  };
  const writes = [];
  patchExeManifest('x.exe', {
    loadModule: async () => fakeResedit,
    readFile: () => Buffer.from('EXE'),
    writeFile: (p, b) => writes.push([p, b]),
  }).then((r) => {
    assert.equal(r.patched, true);
    assert.deepEqual(writes[0][1].toString(), 'PATCHEX');
    assert.deepEqual(calls, ['outputResource']);
  });
}

// 7) patchExeManifest — kaynakta manifest yoksa hatayı net döndürür.
{
  const fakeResedit = {
    NtExecutable: { from: () => ({ generate: () => Buffer.alloc(0) }) },
    NtExecutableResource: { from: () => ({ entries: [], outputResource: () => {} }) },
  };
  patchExeManifest('x.exe', { loadModule: async () => fakeResedit, readFile: () => Buffer.alloc(4), writeFile: () => {} })
    .then((r) => {
      assert.equal(r.patched, false);
      assert(r.reason.includes('RT_MANIFEST'));
    });
}

// 8) Paketleme ratchet'i — package-windows.js manifest yamasını çağırır.
{
  const src = fs.readFileSync(path.join(__dirname, '..', 'tools', 'package-windows.js'), 'utf8');
  assert(src.includes('patchExeManifest'), 'paketleme manifest yaması çağırmıyor');
  assert(src.includes('windows-manifest'), 'windows-manifest bağı yok');
}

// 9) Gerçek resedit cjs modülü yüklenebilir (devDependency bağı).
{
  require('resedit/cjs').load().then((m) => {
    assert(m.NtExecutable && m.NtExecutableResource, 'resedit API eksik');
  });
}

console.log('windows-manifest-longpath: 9 bölüm geçti');
