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
// UMD ikili-yükleme kalıbı (`typeof module === 'object' && module.exports`)
// altında require/module.exports/process.* serbesttir — satır birden fazla
// satıra bölünebildiği için koruma ±1 satırlık pencerede aranır.
const UMD_GUARD = /typeof\s+module/;
const FORBIDDEN = [
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

// Yorum/dize içindeki görünür-eşleşmeleri (JSDoc'taki `require(` örnekleri)
// dışlamak için yüzeysel masker — coverage-map.js'deki stripNonCode ile aynı
// yaklaşım; FORBIDDEN kalıpları maskelenmiş metne uygulanır.
function maskNonCode(src) {
  const out = [];
  let state = 'code'; // code | block | sq | dq | tpl
  for (const line of src.split('\n')) {
    let masked = '';
    for (let i = 0; i < line.length; i++) {
      const c = line[i], n = line[i + 1];
      if (state === 'block') {
        if (c === '*' && n === '/') { state = 'code'; i++; masked += '  '; }
        else masked += ' ';
        continue;
      }
      if (state === 'sq' || state === 'dq' || state === 'tpl') {
        if (c === '\\') { masked += '  '; i++; continue; }
        if ((state === 'sq' && c === "'") || (state === 'dq' && c === '"') || (state === 'tpl' && c === '`')) state = 'code';
        masked += ' ';
        continue;
      }
      if (c === '/' && n === '/') { masked += ' '.repeat(line.length - i); break; }
      if (c === '/' && n === '*') { state = 'block'; i++; masked += '  '; continue; }
      if (c === "'") { state = 'sq'; masked += ' '; continue; }
      if (c === '"') { state = 'dq'; masked += ' '; continue; }
      if (c === '`') { state = 'tpl'; masked += ' '; continue; }
      masked += c;
    }
    out.push(masked);
  }
  return out.join('\n');
}

// index.html'in gerçekten yüklediği scriptler — realm sözleşmesi bunlara da
// bağlar; `../` ile src/ altından gelen dosyalar renderer/ taramasının dışında
// kalır. Döndürülen yollar index.html'e göre çözülmüş mutlak yollardır.
function listLoadedScripts() {
  const html = fs.readFileSync(path.join(RDIR, 'index.html'), 'utf8');
  const out = [];
  for (const m of html.matchAll(/<script\s+src="([^"]+)"/g)) {
    const rel = m[1];
    if (/^https?:/i.test(rel)) continue;
    const abs = path.normalize(path.join(RDIR, rel));
    const parts = abs.split(path.sep);
    if (parts.includes('vendor') || parts.includes('node_modules')) continue;
    out.push(abs);
  }
  return out;
}

describe('R328-2: renderer realm sadakati — Node-globe referansı yok', () => {
  it('renderer realm dosyaları Node-globe içermez', () => {
    const violations = [];
    // Taranan yüzey: src/renderer/ altındaki tüm .js + index.html'in yüklediği
    // scriptler (`../` ile gelen src/*.js de buna dahil — sandbox'ta koşarlar).
    const files = new Set([...listRendererFiles(), ...listLoadedScripts()]);
    for (const file of files) {
      const rel = path.relative(RDIR, file);
      const rawLines = fs.readFileSync(file, 'utf8').split('\n');
      // Kalıplar maskelenmiş metne uygulanır: yorum/JSDoc/string içindeki
      // `require(` veya `process.` metinleri Node-globe bağımlılığı değildir.
      const lines = maskNonCode(rawLines.join('\n')).split('\n');
      for (const [ln, line] of lines.entries()) {
        for (const [re, label] of FORBIDDEN) {
          if (re.test(line)) {
            violations.push(`${rel}:${ln + 1} ${label}: ${rawLines[ln].trim().slice(0, 100)}`);
          }
        }
        // require( / module.exports yalnız UMD korumalı ifadede serbest —
        // koruma aynı ifade içinde önceki/sonraki satıra taşabilir.
        if (/\brequire\s*\(|\bmodule\.exports\b/.test(line)) {
          const window3 = `${lines[ln - 1] || ''}\n${line}\n${lines[ln + 1] || ''}`;
          if (!UMD_GUARD.test(window3)) {
            const which = /\bmodule\.exports\b/.test(line) ? 'korumasız module.exports' : 'korumasız require(';
            violations.push(`${rel}:${ln + 1} ${which}: ${rawLines[ln].trim().slice(0, 100)}`);
          }
        }
      }
    }
    assert.deepEqual(violations, []);
  });

  it('çift-korumalı modüller globesiz (renderer-sadık) realmde yüklenir', () => {
    // Realm: window var; module/require/process/Buffer/global YOK —
    // sandboxed renderer'ın gerçek yüzeyi.
    const window = {};
    // ui-locale.js DOM'e kapılıdır (`typeof document === 'undefined'` erken
    // çıkar) — gerçek realm yüzeyini görmek için minimum DOM stub'ları.
    const ctx = vm.createContext({
      window, console,
      document: {
        body: { nodeType: 1, querySelectorAll: () => [], matches: () => false, closest: () => null },
        documentElement: {},
        getElementById: () => null,
        dispatchEvent: () => true,
        querySelector: () => null,
        querySelectorAll: () => [],
        createTreeWalker: () => ({ nextNode: () => null }),
      },
      Node: { TEXT_NODE: 3, ELEMENT_NODE: 1 },
      NodeFilter: { SHOW_ELEMENT: 1, SHOW_TEXT: 4 },
      Element: class Element {},
      MutationObserver: class { observe() {} disconnect() {} },
      CustomEvent: class { constructor(type, init) { this.type = type; this.detail = init && init.detail; } },
      localStorage: { getItem: () => null, setItem: () => {} },
    });
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
    // UiLocale DOM stub'ıyla gerçekten bağlanmalı — gevşek `Object.keys`
    // kontrolü StatusCopy sayesinde modül hiç yüklenmese de geçerdi.
    assert.ok(window.UiLocale, 'UiLocale window üzerine bağlanmadı');
    assert.equal(typeof window.UiLocale.t, 'function');
    assert.equal(typeof window.UiLocale.get, 'function');
    assert.equal(typeof window.UiLocale.set, 'function');
    // QueueLifecycle globalThis'e bağlanır (renderer'da globalThis===window;
    // VM'de context nesnesine düşer) — window değil ctx üzerinde doğrula.
    assert.ok(ctx.QueueLifecycle, 'QueueLifecycle global yüzeye bağlanmadı');
    assert.equal(typeof ctx.QueueLifecycle.beginQueueRun, 'function');
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
