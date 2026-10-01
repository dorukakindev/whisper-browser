'use strict';
// Tur 4 IPC/güvenlik düzeltmelerinin regresyon kilitleri.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');

const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const main = read('src/main.js');

function extractFunction(source, name) {
  const match = new RegExp(`(?:async\\s+)?function\\s+${name}\\s*\\(`).exec(source);
  assert.ok(match, `${name} bulunamadı`);
  let depth = 0;
  for (let k = source.indexOf('{', match.index); k < source.length; k++) {
    if (source[k] === '{') depth++;
    else if (source[k] === '}' && --depth === 0) return source.slice(match.index, k + 1);
  }
  throw new Error(`${name} kapanışı bulunamadı`);
}

let passed = 0;
function test(title, fn) {
  try { fn(); passed++; console.log(`  ok  ${title}`); }
  catch (error) { console.error(`  FAIL ${title}\n${error.stack}`); process.exitCode = 1; }
}

test('altyazı dil kodu yol ayırıcı/.. taşıyamaz ve -- ile başlayan değer bayrak sanılmaz', () => {
  const ctx = vm.createContext({});
  const decl = main.slice(main.indexOf('const SUBTITLE_LANG_CODE'), main.indexOf('function subtitleLangArg'));
  vm.runInContext(`${decl}\n${extractFunction(main, 'subtitleLangArg')}\nthis.f = subtitleLangArg;`, ctx);
  assert.equal(ctx.f('tr'), 'tr');
  assert.equal(ctx.f('pt-BR'), 'pt-BR');
  assert.equal(ctx.f(''), 'en');
  for (const bad of ['..\\..\\AppData\\x', '../../etc/x', 'a/b', 'tr.srt', 'x'.repeat(40), 'en:ads']) {
    assert.equal(ctx.f(bad), null, `kabul edilmemeli: ${bad}`);
  }
  assert.match(main, /`--sub-lang=\$\{subLang\}`/);
  assert.match(main, /`--lang=\$\{subLang\}`/);
  assert.match(main, /`--title=\$\{String\(o\.title/, 'başlık - ile başlarsa argparse bayrak sanıyordu');
  assert.match(main, /`--query=\$\{/);
});

test('invidious.py dil kodunu ve çıktı yolunu doğrular', () => {
  const py = read('backend/invidious.py');
  assert.match(py, /re\.fullmatch\(r"\[A-Za-z0-9_-\]\{1,32\}", str\(lang or ""\)\)/);
  assert.match(py, /out_path\.resolve\(\)\.parent != out\.resolve\(\)/);
});

test('web içeriğinin dış uygulama açması kısılır (mailto döngüsü)', () => {
  const opened = [];
  const ctx = vm.createContext({ Date, WeakMap, Promise, openExternalByPolicy: (url) => { opened.push(url); return Promise.resolve(true); } });
  const decl = main.slice(main.indexOf('const browserExternalOpenAt'), main.indexOf('function openExternalFromWebContent'));
  vm.runInContext(`${decl}\n${extractFunction(main, 'openExternalFromWebContent')}\nthis.f = openExternalFromWebContent;`, ctx);
  const page = {};
  for (let i = 0; i < 5; i++) ctx.f(page, `mailto:a${i}@x.test`);
  assert.equal(opened.length, 1, 'aynı sayfa arka arkaya dış uygulama açtı');
  ctx.f({}, 'mailto:b@x.test');
  assert.equal(opened.length, 2, 'başka bir sekme etkilenmemeli');
  assert.ok(!/openExternal: \(url\) => openExternalByPolicy\(url\),\n\s*\}\);\n\s*contents\.on\('did-create-window'/.test(main),
    'açılır pencere navigasyon koruması kısılmamış yolu kullanıyor');
});

test('farklı kökenli favicon yalnız genel adresten ve yönlendirmesiz indirilir', () => {
  // Favicon zincirinin her hop'unda aynı-köken dışı adres genel-adres
  // doğrulamasından geçer ve 'follow' yerine manual redirect kullanılır.
  assert.match(main, /browserSiteOrigin\(candidate\) === browserSiteOrigin\(faviconPageUrl\)/);
  assert.match(main, /if \(!sameOriginAsPage\(faviconUrl\)\) await assertPublicBrowserSubtitleUrl\(faviconUrl\);/);
  assert.match(main, /redirect: 'manual'/);
});

test('otomatik devam eden sayfa çevirisi sınırsız büyümez', () => {
  assert.match(main, /session\.blocks\.size >= MAX_AUTO_CONTINUE_SESSION_BLOCKS/);
  assert.match(main, /job\.dynamicBlocks\.size >= MAX_PENDING_DYNAMIC_BLOCKS/);
});

test('içe aktarılan geçmiş işaretlenir; onaysız erişim ve UNC dokunuşu yok', () => {
  const { restorePackage } = require('../src/workspace-package');
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-r4-hist-'));
  try {
    const history = [{ id: 'h1', video: '\\\\attacker\\share\\v.mp4', files: ['\\\\attacker\\share\\v.srt'] }];
    const data = {
      format: 'whisper-workspace', version: 1, sourceRoot: '{{ROOT}}', mappings: [], rendererValues: {},
      files: [{ name: 'history.json', data: Buffer.from(JSON.stringify(history)).toString('base64') }],
    };
    restorePackage(root, data, []);
    const restored = JSON.parse(fs.readFileSync(path.join(root, 'history.json'), 'utf8'));
    assert.equal(restored[0].imported, true, 'içe aktarılan geçmiş kaydı işaretlenmedi');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
  const handler = main.slice(main.indexOf("ipcMain.handle('history:authorizeFiles'"), main.indexOf("ipcMain.handle('history:remove'"));
  assert.match(handler, /record\.imported && \/\^\(\?:\\\\\\\\\|\\\/\\\/\)\/\.test\(value\)/, 'içe aktarılan UNC video yoluna dokunuluyor');
  assert.match(handler, /importedRoots\.some/, 'içe aktarılan altyazılar klasör sınırı olmadan yetkilendiriliyor');
});

test('Python gizli anahtar ortam değişkenleri alt süreçlere miras kalmaz', () => {
  const py = read('backend/transcribe.py');
  assert.match(py, /for secret_env in \("WHISPER_HF_TOKEN", "WHISPER_LLM_API_KEY", "WHISPER_TRANSLATE_API_KEY"\):\s*os\.environ\.pop\(secret_env, None\)/);
});

test('çıktı işlemi kurtarması "staging" durumunda final dosyaya dokunmaz (JS)', () => {
  const job = read('src/pipeline-job.js');
  assert.match(job, /else if \(!entry\.existed && data\.state === 'prepared'\)/);
});

console.log(`core-security-r4: ${passed} test geçti`);
