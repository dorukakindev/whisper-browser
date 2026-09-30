'use strict';
// R328-2 — jsdom/VM-realism ratchet'i.
//
// Sandboxed renderer (`src/renderer/*.js`, index.html'in klasik <script>
// dosyaları) contextIsolation altında çalışır: `require`, `process`,
// `Buffer`, `module`, `__dirname`, `global` YOKTUR. VM-stub'lı testlerde
// bu globaller yanlışlıkla sağlanırsa, gerçek üründe ReferenceError ile
// çökecek kod yeşil görünür — bu ratchet renderer kaynağının Node-globe
// bağımlılığı taşımadığını ve çift-korumalı (UMD) modüllerin globe'siz
// realm'de gerçekten yüklenebildiğini kilitler.
const { describe, it } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const RDIR = path.join(__dirname, '../src/renderer');

// Node-globe referans kalıpları: üretim renderer'ında bir eşleşme = bug.
// Notlar:
//  - `process.X` yalnız Node'a özgü üyeliklerde yasak (yerel değişken
//    gölgeleri, ör. gpuProcesses[i].pid, serbest).
//  - `module.exports` yalnız `typeof module` korumalı satırda serbest
//    (UMD dual-export kalıbı: tests de aynı dosyayı require edebilsin diye).
const FORBIDDEN = [
  [/\brequire\s*\(/, 'require('],
  [/\b__dirname\b/, '__dirname'],
  [/\b__filename\b/, '__filename'],
  [/\bBuffer\b/, 'Buffer'],
  [/\bglobal\.[A-Za-z_$]/, 'global.<x>'],
  [/\bexports\s*\.\s*[A-Za-z_$]/, 'exports.<x>'],
  [/\bprocess\.(?:env|argv|cwd|platform|exit|stdin|stdout|stderr|nextTick|binding|execPath|memoryUsage|uptime|hrtime|kill|abort|chdir|report|resourceUsage|dlopen|mainModule|version|versions)\b/, 'process.<node-global>'],
];

// Üçüncü-taraf vendor paketleri Node-globe serbestliğiyle gelir (UMD
// shim'leri); realm sözleşmesi yalnız taraf-1 kaynağı bağlar.
const EXCLUDED_DIRS = new Set(['vendor']);

function listRendererFilesDir(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (!EXCLUDED_DIRS.has(entry.name)) out.push(...listRendererFilesDir(path.join(dir, entry.name)));
    } else if (entry.name.endsWith('.js')) {
      out.push(path.join(dir, entry.name));
    }
  }
  return out;
}
function listRendererFiles() {
  return listRendererFilesDir(RDIR);
}

describe('R328-2: renderer realm sadakati — Node-globe referansı yok', () => {
  it('src/renderer/*.js Node-globe içermez', () => {
    const violations = [];
    for (const file of listRendererFiles()) {
      const rel = path.relative(RDIR, file);
      for (const [ln, line] of fs.readFileSync(file, 'utf8').split('\n').entries()) {
        for (const [re, label] of FORBIDDEN) {
          if (re.test(line)) {
            violations.push(`${rel}:${ln + 1} ${label}: ${line.trim().slice(0, 100)}`);
          }
        }
        // module.exports yalnız typeof-module korumalı satırda
        if (/\bmodule\.exports\b/.test(line) && !/typeof\s+module/.test(line)) {
          violations.push(`${rel}:${ln + 1} korumasız module.exports: ${line.trim().slice(0, 100)}`);
        }
      }
    }
    assert.deepEqual(violations, []);
  });

  it('çift-korumalı modüller globesiz (renderer-sadık) realmde yüklenir', () => {
    // Realm: window var; module/require/process/Buffer/global YOK —
    // sandboxed renderer'ın gerçek yüzeyi.
    const window = {};
    const ctx = vm.createContext({ window, console });
    for (const name of ['status-copy.js', 'ui-locale.js', 'queue-lifecycle.js']) {
      const src = fs.readFileSync(path.join(RDIR, name), 'utf8');
      assert.doesNotThrow(
        () => vm.runInContext(src, ctx, { filename: name }),
        `${name} renderer realm'inde Node-globe istedi`,
      );
    }
    assert.ok(window.StatusCopy, 'StatusCopy window üzerine bağlanmadı');
    assert.equal(typeof window.StatusCopy.clock, 'function');
    assert.equal(window.StatusCopy.clock(75), '1:15');
    assert.ok(window.uiLocale || window.UILocale || Object.keys(window).length >= 1,
      'ui-locale realmde hiç yüzey bırakmadı');
  });

  it('index.html tarafından yüklenen renderer scriptleri mevcut klasik dosyalar', () => {
    const html = fs.readFileSync(path.join(RDIR, 'index.html'), 'utf8');
    for (const m of html.matchAll(/<script\s+src="([^"]+)"/g)) {
      const rel = m[1];
      assert.ok(!/^https?:/i.test(rel), `harici script: ${rel}`);
      assert.ok(fs.existsSync(path.join(RDIR, rel)), `eksik script: ${rel}`);
    }
  });
});
