#!/usr/bin/env node
'use strict';

// Windows paketinin kanonik kaynak listesi ve packager ignore kalÄ±plarÄ±.
// ÃœÃ§ tÃ¼ketici paylaÅŸÄ±r:
//   - tools/package-windows.js: packager sonrasÄ± listedeki her dosyanÄ±n
//     Ã§Ä±ktÄ±da varlÄ±ÄŸÄ±nÄ± doÄŸrular (ignore-listesi kaymasÄ± = derhal build hatasÄ±).
//   - src/main.js: aÃ§Ä±lÄ±ÅŸta BOOT_CRITICAL dosyalar eksikse pencere boÅŸ/
//     yarÄ±m aÃ§Ä±lmasÄ±n diye erken hata diyaloÄŸu gÃ¶sterir.
//   - tests/package-integrity.test.js: listede olup depoda olmayan ya da
//     ignore kalÄ±plarÄ±na takÄ±lan dosya varsa test kÄ±rmÄ±zÄ± olur.

const fs = require('node:fs');
const path = require('node:path');

// tools/package-windows.js iÃ§indeki @electron/packager `ignore` deÄŸeri.
// Burada tek kaynak tutulur; paketleme betiÄŸi ve testler aynÄ± diziyi okur.
const PACKAGER_IGNORE = [
  /^\/(?:\.git|\.github|\.claude|\.agents|\.context_cache|\.uiprev|scratch|artifacts|tests|benchmarks|quality|design-system)(?:\/|$)/,
  /^\/docs\/(?:devir|raporlar)(?:\/|$)/,
  /^\/backend\/(?:venv|\.venv|\.venv-installing-[^/]+|\.venv-backup-[^/]+|separator-venv|separator-models|bin|__pycache__)(?:\/|$)/,
  /^\/(?:BROWSER|PROGRAM|BUG|DEEP_ANALYSIS|YOUTUBE_REKLAM_ENGELLEME)[^/]*\.md$/,
  // Ã‡alÄ±ÅŸma oturumu notlarÄ± ve iÃ§ tasarÄ±m sÃ¶zleÅŸmeleri kullanÄ±cÄ± paketine
  // girmez; kullanÄ±cÄ±ya aÃ§Ä±k belgeler (README, KURULUM, PRIVACY, SUPPORT,
  // lisans bildirimleri) pakette kalÄ±r. tools/ hariÃ§ tutulur Ã§Ã¼nkÃ¼ paket
  // iÃ§i install.bat, tools/install-orchestrator.js'i Ã§aÄŸÄ±rÄ±r.
  /^\/(?:AGENTS|CLAUDE|DEVIR-NOTU|YENI-BILGISAYAR|DESIGN|UI-DESIGN-SYSTEM|UX-CONTRACT|CODE_OF_CONDUCT|CONTRIBUTING|DRM-KURULUM)\.md$/,
  /^\/(?:settings|window-state|premium-ui)\.json$/,
];

// AÃ§Ä±lÄ±ÅŸta pencereyi anlamlÄ± kÄ±lan en kÃ¼Ã§Ã¼k kÃ¼me. Bunlardan biri eksikse
// uygulama zaten Ã§alÄ±ÅŸamaz; diyalog olmadan boÅŸ/kÄ±rÄ±k pencere aÃ§Ä±lÄ±rdÄ±.
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

// main.js'in subprocess olarak Ã§aÄŸÄ±rdÄ±ÄŸÄ± Python giriÅŸ betikleri. Yerel
// import zinciri (Ã¶r. transcribe â†’ ndjson_utils) aÅŸaÄŸÄ±da transitif eklenir.
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

// require() veya path.join(__dirname, ...) kalÄ±bÄ±yla yakalanamayan dosyalar
// (audioWorklet.addModule dizgesi, iki adÄ±mlÄ± yol deÄŸiÅŸkeniyle spawn vb.).
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

// Bir kaynak dosyanÄ±n require('./x') / require('../x') Ã§aÄŸrÄ±larÄ±nÄ±n yerel
// kapanÄ±ÅŸÄ±. YalnÄ±z repo iÃ§i gÃ¶reli yollar izlenir; modÃ¼l yoksa atlanÄ±r
// (eksik dosya zaten aÅŸaÄŸÄ±daki varlÄ±k kontrolÃ¼ne takÄ±lÄ±r).
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
    // preload/loadFile/spawn gibi require dÄ±ÅŸÄ± dize referanslarÄ± da yakala:
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

// HTML dosyasÄ±ndaki <script src>/<link href> yerel referanslarÄ±nÄ±n kapanÄ±ÅŸÄ±.
// http/data/# ve javascript: URL'leri sayÄ±lmaz.
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

// Python giriÅŸ betiklerinin backend-iÃ§i yerel import kapanÄ±ÅŸÄ±
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

// Paketin iÃ§ermesi gereken tÃ¼m dosyalar (depo-kÃ¶kÃ¼ gÃ¶reli, '/' ayracÄ±).
function requiredPackageFiles(root) {
  const files = new Set();

  // KÃ¶k Ã§alÄ±ÅŸma dosyalarÄ±: package.json + tÃ¼m .bat + bat'larÄ±n Ã§aÄŸÄ±rdÄ±ÄŸÄ± tools.
  files.add('package.json');
  for (const entry of fs.readdirSync(root)) {
    if (/\.bat$/i.test(entry)) {
      files.add(entry);
      const src = fs.readFileSync(path.join(root, entry), 'utf8');
      for (const m of src.matchAll(/tools[\\/]([A-Za-z0-9_.-]+(?:[\\/][A-Za-z0-9_.-]+)*)/g)) {
        const rel = `tools/${m[1].replace(/\\/g, '/')}`;
        const absolute = path.join(root, rel);
        if (fs.existsSync(absolute) && fs.statSync(absolute).isDirectory()) {
          for (const file of walkDir(root, rel)) if (/\.(?:py|js|json|bat)$/i.test(file)) files.add(file);
        } else files.add(rel);
      }
    }
  }

  // Ana sÃ¼reÃ§ + preload'lar + onlarÄ±n require/dize-referans kapanÄ±ÅŸÄ±.
  const jsClosure = requireClosure(root, BOOT_CRITICAL.filter((f) => f.endsWith('.js')));
  for (const rel of jsClosure) files.add(rel);

  // Backend giriÅŸ betikleri + JS tarafÄ±nda referans edilen betikler
  // (path.join ile spawn edilenler dahil) + yerel import kapanÄ±ÅŸÄ±.
  const extraPyEntries = jsClosure
    .filter((rel) => rel.startsWith('backend/') && rel.endsWith('.py'))
    .map((rel) => rel.slice('backend/'.length));
  for (const rel of pythonClosure(root, [...BACKEND_ENTRYPOINTS, ...extraPyEntries])) {
    files.add(rel);
  }

  // Renderer HTML giriÅŸleri + script/link referanslarÄ± + vendor aÄŸacÄ±.
  for (const html of ['src/renderer/index.html', 'src/renderer/browser-mini.html']) {
    files.add(html);
    for (const ref of htmlRefs(root, html)) files.add(ref);
  }
  for (const rel of walkDir(root, 'src/renderer/vendor')) files.add(rel);

  // Dize referansÄ±yla yÃ¼klenenler (worklet, deÄŸiÅŸken-yollu spawn).
  for (const rel of EXTRA_FILES) files.add(rel);
  // VoxCPM scripts import sibling helpers outside the backend closure.
  for (const rel of walkDir(root, 'tools/voxcpm2')) {
    if (/\.py$/i.test(rel) && !rel.split('/').includes('__pycache__')) files.add(rel);
  }

  // Backend giriÅŸ betikleri + yerel import kapanÄ±ÅŸÄ±.
  for (const rel of pythonClosure(root, BACKEND_ENTRYPOINTS)) files.add(rel);

  return [...files].sort();
}

// Paket Ã§Ä±ktÄ± dizininde gerekli dosyalarÄ± doÄŸrular; eksikleri dÃ¶ndÃ¼rÃ¼r.
function missingInTarget(target, root) {
  return requiredPackageFiles(root).filter((rel) => !fs.existsSync(path.join(target, 'resources', 'app', ...rel.split('/'))));
}

// Tekrarlanabilir paket: aynÄ± kaynak aÄŸacÄ± aynÄ± parmak izini Ã¼retmeli.
// Kanonik dosya listesinin iÃ§erik hash'i + paketleme girdileri
// (package.json/lock, Electron sÃ¼rÃ¼mÃ¼, ignore kalÄ±plarÄ±) tek SHA-256'da
// birleÅŸir â€” iki Ã¼retim arasÄ±ndaki gerÃ§ek fark bu alanla karÅŸÄ±laÅŸtÄ±rÄ±lÄ±r
// (createdAt gibi zamanla deÄŸiÅŸen provenance alanlarÄ± hariÃ§ tutulur).
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
