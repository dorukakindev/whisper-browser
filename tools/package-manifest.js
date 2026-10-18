#!/usr/bin/env node
'use strict';

// Windows paketinin kanonik kaynak listesi ve packager ignore kalıpları.
// Üç tüketici paylaşır:
//   - tools/package-windows.js: packager sonrası listedeki her dosyanın
//     çıktıda varlığını doğrular (ignore-listesi kayması = derhal build hatası).
//   - src/main.js: açılışta BOOT_CRITICAL dosyalar eksikse pencere boş/
//     yarım açılmasın diye erken hata diyaloğu gösterir.
//   - tests/package-integrity.test.js: listede olup depoda olmayan ya da
//     ignore kalıplarına takılan dosya varsa test kırmızı olur.

const fs = require('node:fs');
const path = require('node:path');

// tools/package-windows.js içindeki @electron/packager `ignore` değeri.
// Burada tek kaynak tutulur; paketleme betiği ve testler aynı diziyi okur.
const PACKAGER_IGNORE = [
  /^\/(?:\.git|\.github|\.claude|\.agents|\.context_cache|\.uiprev|scratch|artifacts|tests|benchmarks|quality|design-system)(?:\/|$)/,
  /^\/docs\/(?:devir|raporlar)(?:\/|$)/,
  /^\/backend\/(?:venv|\.venv|\.venv-installing-[^/]+|\.venv-backup-[^/]+|separator-venv|separator-models|bin|__pycache__)(?:\/|$)/,
  /^\/(?:BROWSER|PROGRAM|BUG|DEEP_ANALYSIS|YOUTUBE_REKLAM_ENGELLEME)[^/]*\.md$/,
  // Çalışma oturumu notları ve iç tasarım sözleşmeleri kullanıcı paketine
  // girmez; kullanıcıya açık belgeler (README, KURULUM, PRIVACY, SUPPORT,
  // lisans bildirimleri) pakette kalır. tools/ hariç tutulur çünkü paket
  // içi install.bat, tools/install-orchestrator.js'i çağırır.
  /^\/(?:AGENTS|CLAUDE|DEVIR-NOTU|YENI-BILGISAYAR|DESIGN|UI-DESIGN-SYSTEM|UX-CONTRACT|CODE_OF_CONDUCT|CONTRIBUTING|DRM-KURULUM)\.md$/,
  /^\/(?:settings|window-state|premium-ui)\.json$/,
];

// Açılışta pencereyi anlamlı kılan en küçük küme. Bunlardan biri eksikse
// uygulama zaten çalışamaz; diyalog olmadan boş/kırık pencere açılırdı.
const BOOT_CRITICAL = [
  'src/main.js',
  'src/preload.js',
  'src/browser-preload.js',
  'src/youtube-ad-preload.js',
  'src/browser-mini-preload.js',
  'src/renderer/index.html',
  'src/renderer/browser-mini.html',
  'src/renderer/renderer.js',
  'src/renderer/browser-mini.js',
  'src/renderer/styles.css',
];

// main.js'in subprocess olarak çağırdığı Python giriş betikleri. Yerel
// import zinciri (ör. transcribe → ndjson_utils) aşağıda transitif eklenir.
const BACKEND_ENTRYPOINTS = [
  'transcribe.py',
  'media.py',
  'youtube.py',
  'invidious.py',
  'live_asr.py',
  'export_anki.py',
  'update_ytdlp.py',
  'model_benchmark.py',
  'browser_align.py',
  'separate_dialogue.py',
  'voice_reference.py',
  'browser_media_tools.py',
  'browser_video_analysis.py',
  'catalog_scan.py',
  'nmdb_catalog_import.py',
  'workspace_video_package.py',
];

// require() veya path.join(__dirname, ...) kalıbıyla yakalanamayan dosyalar
// (audioWorklet.addModule dizgesi, iki adımlı yol değişkeniyle spawn vb.).
const EXTRA_FILES = [
  'tools/voxcpm2/altyazi_oku.py',
  'tools/voxcpm2/dub_plan.py',
  'tools/voxcpm2/dub_timing.py',
  'tools/voxcpm2/prepare_background.py',
  'src/renderer/live-asr-worklet.js',
];

function toRepoPath(p) {
  return p.split(path.sep).join('/');
}

function isIgnored(repoPath) {
  const normalized = `/${toRepoPath(repoPath)}`;
  return PACKAGER_IGNORE.some((re) => re.test(normalized));
}

// Bir kaynak dosyanın require('./x') / require('../x') çağrılarının yerel
// kapanışı. Yalnız repo içi göreli yollar izlenir; modül yoksa atlanır
// (eksik dosya zaten aşağıdaki varlık kontrolüne takılır).
function requireClosure(root, entries) {
  const seen = new Set();
  const stack = [...entries];
  const out = [];
  while (stack.length) {
    const rel = stack.pop();
    if (seen.has(rel)) continue;
    seen.add(rel);
    out.push(rel);
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    const src = fs.readFileSync(abs, 'utf8');
    for (const m of src.matchAll(/require\(\s*['"](\.[^'"]+)['"]\s*\)/g)) {
      let target = toRepoPath(path.posix.normalize(path.posix.join(path.posix.dirname(toRepoPath(rel)), m[1])));
      if (!path.posix.extname(target)) target += '.js';
      if (fs.existsSync(path.join(root, target))) stack.push(target);
    }
    // preload/loadFile/spawn gibi require dışı dize referansları da yakala:
    // `preload: path.join(__dirname, 'x.js')`,
    // `loadFile(path.join(__dirname, 'renderer', 'x.html'))`,
    // `path.join(__dirname, '..', 'backend', 'x.py')`.
    for (const m of src.matchAll(/path\.(?:join|resolve)\(__dirname\s*((?:,\s*'[^']*')+)\s*\)/g)) {
      const parts = [...m[1].matchAll(/'([^']*)'/g)].map((x) => x[1]);
      const target = toRepoPath(path.posix.normalize(path.posix.join(path.posix.dirname(toRepoPath(rel)), ...parts)));
      if (fs.existsSync(path.join(root, target)) && /\.(?:js|html|css|py|json)$/.test(target)) stack.push(target);
    }
  }
  return out;
}

// HTML dosyasındaki <script src>/<link href> yerel referanslarının kapanışı.
// http/data/# ve javascript: URL'leri sayılmaz.
function htmlRefs(root, htmlRel) {
  const abs = path.join(root, htmlRel);
  if (!fs.existsSync(abs)) return [];
  const src = fs.readFileSync(abs, 'utf8');
  const out = [];
  for (const m of src.matchAll(/(?:src|href)\s*=\s*["']([^"']+)["']/g)) {
    const ref = m[1];
    if (/^(?:[a-z][a-z0-9+.-]*:|#|\/)/i.test(ref)) continue;
    const target = toRepoPath(path.posix.normalize(path.posix.join(path.posix.dirname(toRepoPath(htmlRel)), ref)));
    out.push(target);
  }
  return out;
}

function walkDir(root, relDir) {
  const abs = path.join(root, relDir);
  if (!fs.existsSync(abs)) return [];
  const out = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = toRepoPath(path.join(relDir, entry.name));
    if (entry.isDirectory()) out.push(...walkDir(root, rel));
    else if (entry.isFile()) out.push(rel);
  }
  return out;
}

// Python giriş betiklerinin backend-içi yerel import kapanışı
// (`import x` / `from x import ...`, `backend/x.py` varsa).
function pythonClosure(root, entries) {
  const seen = new Set();
  const stack = entries.map((e) => `backend/${e}`);
  const out = [];
  while (stack.length) {
    const rel = stack.pop();
    if (seen.has(rel)) continue;
    seen.add(rel);
    out.push(rel);
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    const src = fs.readFileSync(abs, 'utf8');
    for (const m of src.matchAll(/^\s*(?:from|import)\s+([a-zA-Z_][a-zA-Z0-9_]*)/gm)) {
      const target = `backend/${m[1]}.py`;
      if (fs.existsSync(path.join(root, target))) stack.push(target);
    }
  }
  return out;
}

// Paketin içermesi gereken tüm dosyalar (depo-kökü göreli, '/' ayracı).
function requiredPackageFiles(root) {
  const files = new Set();

  // Kök çalışma dosyaları: package.json + tüm .bat + bat'ların çağırdığı tools.
  files.add('package.json');
  for (const entry of fs.readdirSync(root)) {
    if (/\.bat$/i.test(entry)) {
      files.add(entry);
      const src = fs.readFileSync(path.join(root, entry), 'utf8');
      for (const m of src.matchAll(/tools[\\/]([A-Za-z0-9_.-]+)/g)) {
        files.add(`tools/${m[1]}`);
      }
    }
  }

  // Ana süreç + preload'lar + onların require/dize-referans kapanışı.
  const jsClosure = requireClosure(root, BOOT_CRITICAL.filter((f) => f.endsWith('.js')));
  for (const rel of jsClosure) files.add(rel);

  // Backend giriş betikleri + JS tarafında referans edilen betikler
  // (path.join ile spawn edilenler dahil) + yerel import kapanışı.
  const extraPyEntries = jsClosure
    .filter((rel) => rel.startsWith('backend/') && rel.endsWith('.py'))
    .map((rel) => rel.slice('backend/'.length));
  for (const rel of pythonClosure(root, [...BACKEND_ENTRYPOINTS, ...extraPyEntries])) {
    files.add(rel);
  }

  // Renderer HTML girişleri + script/link referansları + vendor ağacı.
  for (const html of ['src/renderer/index.html', 'src/renderer/browser-mini.html']) {
    files.add(html);
    for (const ref of htmlRefs(root, html)) files.add(ref);
  }
  for (const rel of walkDir(root, 'src/renderer/vendor')) files.add(rel);

  // Dize referansıyla yüklenenler (worklet, değişken-yollu spawn).
  for (const rel of EXTRA_FILES) files.add(rel);

  // Backend giriş betikleri + yerel import kapanışı.
  for (const rel of pythonClosure(root, BACKEND_ENTRYPOINTS)) files.add(rel);

  return [...files].sort();
}

// Paket çıktı dizininde gerekli dosyaları doğrular; eksikleri döndürür.
function missingInTarget(target, root) {
  return requiredPackageFiles(root).filter((rel) => !fs.existsSync(path.join(target, 'resources', 'app', ...rel.split('/'))));
}

// Tekrarlanabilir paket: aynı kaynak ağacı aynı parmak izini üretmeli.
// Kanonik dosya listesinin içerik hash'i + paketleme girdileri
// (package.json/lock, Electron sürümü, ignore kalıpları) tek SHA-256'da
// birleşir — iki üretim arasındaki gerçek fark bu alanla karşılaştırılır
// (createdAt gibi zamanla değişen provenance alanları hariç tutulur).
function packageInputSha256(root, electronVersion = '') {
  const { createHash } = require('node:crypto');
  const hash = createHash('sha256');
  hash.update(`electron:${electronVersion}\0`);
  hash.update(`ignore:${PACKAGER_IGNORE.map(String).join('\n')}\0`);
  for (const rel of requiredPackageFiles(root)) {
    hash.update(rel);
    hash.update('\0');
    try {
      hash.update(createHash('sha256').update(fs.readFileSync(path.join(root, rel))).digest('hex'));
    } catch (_) {
      hash.update('MISSING');
    }
    hash.update('\0');
  }
  for (const extra of ['package.json', 'package-lock.json']) {
    const abs = path.join(root, extra);
    if (fs.existsSync(abs)) hash.update(`${extra}\0${createHash('sha256').update(fs.readFileSync(abs)).digest('hex')}\0`);
  }
  return hash.digest('hex');
}

module.exports = {
  PACKAGER_IGNORE,
  BOOT_CRITICAL,
  BACKEND_ENTRYPOINTS,
  EXTRA_FILES,
  isIgnored,
  requireClosure,
  requiredPackageFiles,
  missingInTarget,
  packageInputSha256,
};
