#!/usr/bin/env node
'use strict';
// R328-3 — modül-bazlı kapsam haritası üreteci.
// Kullanım: `node tools/coverage-map.js` → stdout'a markdown tablosu.
// tests/coverage-map.test.js aynı tarama mantığını ratchet olarak kullanır
// (bu dosyayı require eder; ayrıştırma kuralları tek yerde yaşar).
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const SRC_DIRS = [
  { dir: 'src', ext: '.js' },
  { dir: 'backend', ext: '.py', exclude: /^test_/ },
];
const TEST_GLOBS = [
  { dir: 'tests', re: /\.test\.js$/, exclude: /^coverage-map\.test\.js$/ },
  { dir: 'backend', re: /^test_.*\.py$/ },
];

function listFiles(rel, re, excludeRe) {
  const dir = path.join(ROOT, rel);
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir)
    .filter((n) => re.test(n) && !(excludeRe && excludeRe.test(n)))
    .sort();
}

function escapeRe(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

// mod → doğrudan tarama kalıbı (require/import ailesi)
function directPattern(base, ext) {
  if (ext === '.js') {
    return new RegExp(`require\\(['"][^'"]*${escapeRe(base)}(?:\\.js)?['"]\\)`);
  }
  return new RegExp(
    `(?:import\\s+${escapeRe(base)}\\b|from\\s+${escapeRe(base)}\\s+import` +
    `|importlib\\.import_module\\(['"]${escapeRe(base)}['"]\\)` +
    `|sys\\.modules\\[['"]${escapeRe(base)}['"]\\])`);
}

function scan() {
  const modules = [];
  for (const { dir, ext, exclude } of SRC_DIRS) {
    for (const name of listFiles(dir, new RegExp(`\\${ext}$`), exclude)) {
      modules.push({ name, base: name.slice(0, -ext.length), ext, dir });
    }
  }
  const tests = [];
  for (const { dir, re, exclude } of TEST_GLOBS) {
    // coverage-map.test.js kendisi whitelist satırlarında modül adları taşır —
    // öz-referansı taramadan dışla.
    for (const name of listFiles(dir, re, exclude)) {
      const rel = path.join(dir, name).split(path.sep).join('/');
      tests.push({ rel, body: fs.readFileSync(path.join(ROOT, rel), 'utf8') });
    }
  }
  const rows = modules.map((mod) => {
    const dp = directPattern(mod.base, mod.ext);
    const np = new RegExp(escapeRe(mod.base));
    const direct = tests.filter((t) => dp.test(t.body)).map((t) => t.rel);
    const named = tests.filter((t) => !direct.includes(t.rel) && np.test(t.body)).map((t) => t.rel);
    let klass = 'none';
    if (direct.length) klass = 'direct';
    else if (named.length) klass = 'named';
    return { module: `${mod.dir}/${mod.name}`, klass, direct, named };
  });
  return { rows, testCount: tests.length, moduleCount: modules.length };
}

function markdown(scanResult) {
  const { rows, testCount, moduleCount } = scanResult;
  const direct = rows.filter((r) => r.klass === 'direct');
  const named = rows.filter((r) => r.klass === 'named');
  const none = rows.filter((r) => r.klass === 'none');
  const out = [];
  out.push('# Modül-bazlı test kapsam haritası');
  out.push('');
  out.push(`Üretici: \`node tools/coverage-map.js\` — ${moduleCount} taraf-1 modül × ${testCount} test dosyası.`);
  out.push('');
  out.push('| Sınıf | Adet | Anlam |');
  out.push('| --- | ---: | --- |');
  out.push(`| direct | ${direct.length} | Test dosyası modülü require/import ediyor |`);
  out.push(`| named | ${named.length} | Modül adı test gövdesinde geçiyor (dolaylı/süreç-içi sürüş) |`);
  out.push(`| none | ${none.length} | Hiçbir testte referans yok |`);
  out.push('');
  out.push('## none — hiç referanssız modüller');
  out.push('');
  for (const r of none) out.push(`- \`${r.module}\``);
  out.push('');
  out.push('## named — yalnız ad-referanslı modüller');
  out.push('');
  for (const r of named) out.push(`- \`${r.module}\` — ${r.named.length} test (ör. ${r.named.slice(0, 3).map((t) => `\`${t}\``).join(', ')})`);
  out.push('');
  out.push('## direct — require/import edilen modüller');
  out.push('');
  for (const r of direct) out.push(`- \`${r.module}\` — ${r.direct.length} test`);
  out.push('');
  return out.join('\n');
}

module.exports = { scan, markdown };

if (require.main === module) {
  process.stdout.write(markdown(scan()) + '\n');
}
