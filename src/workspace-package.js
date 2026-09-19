'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { gzipSync, gunzipSync } = require('node:zlib');
const { randomUUID, createHash } = require('node:crypto');
const ROOTS = new Set(['media-catalog.json', 'watch-library.json', 'watch-library-tombstones.json', 'browser-notes.json', 'browser-session.json', 'history.json',
  'browser-subtitle-preferences.json', 'browser-series-context.json', 'browser-skip-segments.json']);
const DIRS = new Set(['catalog-posters', 'browser-subtitles', 'workspace-assets', 'subtitle-edits']);
const LIMIT = 256 * 1024 * 1024;
const STORAGE_KEYS = ['subtitleStyle', 'subtitlePos', 'browser-source-edits-v1', 'browser-source-edit-scopes-v1'];
function storageValues(values) {
  const result = {};
  for (const key of STORAGE_KEYS) if (typeof values?.[key] === 'string') {
    if (values[key].length > 8e6) throw new Error('Altyazı taslağı çok büyük.');
    JSON.parse(values[key]); result[key] = values[key];
  }
  return result;
}
function allowed(name) {
  return typeof name === 'string' && !name.includes('\\') && !name.includes(':') && !name.split('/').some(p => !p || p === '.' || p === '..') &&
    (ROOTS.has(name) || (DIRS.has(name.split('/')[0]) && /\.(srt|vtt|ass|ssa|jsonl?|png|jpg|jpeg|webp|ttf|otf|woff2?)$/i.test(name)));
}
function rewrite(value, mappings) {
  // Yalnız bütün bir yol veya o yolun altındaki bir dosya yeniden eşlenir.
  // Serbest metin içindeki benzer alt dizileri değiştirmek kurcalanmış paketin
  // başlık, not ve altyazı metnini bozmasına izin verirdi.
  const replacements = [];
  const seen = new Set();
  for (const [rawFrom, rawTo] of mappings) {
    const from = String(rawFrom || '');
    if (!from || seen.has(from)) continue;
    seen.add(from); replacements.push([from, String(rawTo || '')]);
  }
  replacements.sort((a, b) => b[0].length - a[0].length);
  const replacePath = current => {
    for (const [from, to] of replacements) {
      if (current === from) return to;
      if (current.startsWith(from) && /[\\/]/.test(current.charAt(from.length))) {
        return to + current.slice(from.length);
      }
    }
    return current;
  };
  function visit(current) {
    if (typeof current === 'string') return replacePath(current);
    if (Array.isArray(current)) return current.map(visit);
    if (current && typeof current === 'object') return Object.fromEntries(Object.entries(current).map(([k, v]) => [visit(k), visit(v)]));
    return current;
  }
  return visit(value);
}
function exportPackage(root, output, rendererValues = {}) {
  const files = [], mappings = [], seen = new Set(); let total = 0;
  function add(file, name) {
    if (seen.has(name)) return;
    const stat = fs.lstatSync(file); if (!stat.isFile() || stat.isSymbolicLink()) return;
    if (stat.size > 16e6 || (total += stat.size) > LIMIT / 1.5) throw new Error('Çalışma paketi çok büyük (en fazla 170 MB veri).');
    let buffer = fs.readFileSync(file);
    if (ROOTS.has(name)) {
      // Gömülü mutlak yollar taşınabilir {{ROOT}}/... formuna çevrilir — paket
      // paylaşıldığında kaynak makinenin kullanıcı adı/klasör düzeni ve
      // mappings/sourceRoot içindeki mutlak yollar ifşa olmaz (R83-33).
      const visit = value => {
        if (typeof value === 'string' && path.isAbsolute(value)) {
          const relative = path.relative(root, value).replace(/\\/g, '/');
          const underRoot = !!relative && !relative.startsWith('..') && !path.isAbsolute(relative);
          if (/\.(srt|vtt|ass|ssa|png|jpe?g|webp)$/i.test(value) && fs.existsSync(value)) {
            if (underRoot && allowed(relative)) { add(value, relative); return `{{ROOT}}/${relative}`; }
            const target = 'workspace-assets/' + createHash('sha256').update(value).digest('hex') + path.extname(value).toLowerCase();
            add(value, target); return `{{ROOT}}/${target}`;
          }
          if (underRoot) return `{{ROOT}}/${relative}`;
          return value;
        }
        if (Array.isArray(value)) return value.map(visit);
        if (value && typeof value === 'object') return Object.fromEntries(Object.entries(value).map(([k, v]) => [k, visit(v)]));
        return value;
      };
      try { buffer = Buffer.from(JSON.stringify(visit(JSON.parse(buffer.toString('utf8'))))); } catch (_) {}
      seen.add(name); files.push({ name, data: buffer.toString('base64') });
      return;
    }
    seen.add(name); files.push({ name, data: buffer.toString('base64') });
  }
  for (const name of ROOTS) if (fs.existsSync(path.join(root, name))) add(path.join(root, name), name);
  function walk(dir, prefix) {
    if (!fs.existsSync(dir) || fs.lstatSync(dir).isSymbolicLink()) return;
    for (const ent of fs.readdirSync(dir, { withFileTypes: true })) {
      if (ent.isSymbolicLink()) continue;
      const name = prefix + '/' + ent.name;
      if (ent.isDirectory()) walk(path.join(dir, ent.name), name); else if (allowed(name)) add(path.join(dir, ent.name), name);
    }
  }
  for (const dir of DIRS) walk(path.join(root, dir), dir);
  // sourceRoot/mappings taşınabilir tutulur: {{ROOT}} işareti içe aktarımda
  // hedef köke eşlenir, pakette mutlak kaynak yolu kalmaz.
  const bundle = { format: 'whisper-workspace', version: 1, created: new Date().toISOString(), sourceRoot: '{{ROOT}}', mappings, files, rendererValues: storageValues(rendererValues) };
  const bytes = gzipSync(Buffer.from(JSON.stringify(bundle)));
  const temp = output + '.' + randomUUID() + '.tmp';
  try { fs.writeFileSync(temp, bytes, { flag: 'wx', mode: 0o600 }); fs.renameSync(temp, output); }
  finally { try { fs.unlinkSync(temp); } catch {} }
  return { count: files.length, bytes: bytes.length };
}
function readPackage(file) {
  if (fs.statSync(file).size > LIMIT) throw new Error('Paket çok büyük.');
  const data = JSON.parse(gunzipSync(fs.readFileSync(file), { maxOutputLength: LIMIT }).toString('utf8'));
  validate(data); return data;
}
function sanitizeImportedSession(value) {
  // Oturumdaki yerel altyazı yolları dışa aktarımda silinir (browser-session-package
  // portableSessionTab). El yapımı bir paket bu alanlara keyfi yol koyup açılıştaki
  // koşulsuz grant'i kötüye kullanabilir; içe aktarımda da aynı kural uygulanır.
  if (value && typeof value === 'object' && Array.isArray(value.tabs)) {
    for (const tab of value.tabs) {
      const sel = tab && typeof tab === 'object' ? tab.subtitleSelection : null;
      if (sel && typeof sel === 'object') {
        delete sel.primaryFile;
        delete sel.secondaryFile;
      }
    }
  }
  return value;
}

function sanitizeImportedCatalog(value) {
  // İçe aktarılan katalog kayıtlarındaki yerel dosya yolları bu makinede dosya
  // seçiciyle doğrulanmadı; 'play' sırasında bir kez yeniden seçim istenir.
  for (const item of (value && Array.isArray(value.items) ? value.items : [])) {
    if (item?.source?.type === 'local') item.source.imported = true;
    for (const episode of (Array.isArray(item?.episodes) ? item.episodes : [])) {
      if (episode?.source?.type === 'local') episode.source.imported = true;
    }
  }
  return value;
}
function validate(data) {
  storageValues(data?.rendererValues);
  if (data?.format !== 'whisper-workspace' || data.version !== 1 || !Array.isArray(data.files) || data.files.length > 20000 || typeof data.sourceRoot !== 'string' || data.sourceRoot.length < 3) throw new Error('Geçerli bir çalışma paketi seçin.');
  const names = new Set();
  for (const file of data.files) {
    if (!allowed(file.name) || names.has(file.name.toLowerCase()) || typeof file.data !== 'string' || file.data.length > 24e6 || !/^[A-Za-z0-9+/]*={0,2}$/.test(file.data)) throw new Error('Paket içeriği geçersiz.');
    names.add(file.name.toLowerCase());
    if (file.name.endsWith('.json')) {
      const value = JSON.parse(Buffer.from(file.data, 'base64').toString('utf8'));
      if (file.name === 'media-catalog.json') {
        if (value.version !== 1 || !Array.isArray(value.items) || value.items.length > 10000) throw new Error('Paket kataloğu geçersiz.');
        for (const item of value.items) require('./media-catalog-store').itemOf(item);
      }
    }
  }
  if (!Array.isArray(data.mappings) || data.mappings.some(m => !Array.isArray(m) || typeof m[0] !== 'string' || m[0].length < 3 || !allowed(m[1]))) throw new Error('Paket dosya eşleştirmeleri geçersiz.');
}
function restorePackage(root, data, videoMappings = []) {
  validate(data);
  const mappings = [...videoMappings, ...data.mappings.map(([from, relative]) => [from, path.join(root, relative)]), [data.sourceRoot, root]];
  const changes = data.files.map(file => {
    const destination = path.resolve(root, file.name);
    if (!destination.startsWith(path.resolve(root) + path.sep)) throw new Error('Paket yolu geçersiz.');
    let parent = path.dirname(destination);
    while (parent !== path.resolve(root)) { if (fs.existsSync(parent) && fs.lstatSync(parent).isSymbolicLink()) throw new Error('Yedek hedefi bağlantı içeriyor.'); parent = path.dirname(parent); }
    if (fs.existsSync(destination) && fs.lstatSync(destination).isSymbolicLink()) throw new Error('Yedek hedefi bağlantı içeriyor.');
    let bytes = Buffer.from(file.data, 'base64');
    if (file.name.endsWith('.json')) {
      let parsed = rewrite(JSON.parse(bytes.toString('utf8')), mappings);
      if (file.name === 'browser-session.json') parsed = sanitizeImportedSession(parsed);
      if (file.name === 'media-catalog.json') parsed = sanitizeImportedCatalog(parsed);
      bytes = Buffer.from(JSON.stringify(parsed));
    }
    return { destination, bytes, previous: fs.existsSync(destination) ? fs.readFileSync(destination) : null };
  });
  // A durable pre-restore copy lets the user reverse an intentional replacement.
  exportPackage(root, path.join(root, 'before-restore-' + Date.now() + '.wbp'));
  const applied = [];
  try {
    for (const change of changes) {
      fs.mkdirSync(path.dirname(change.destination), { recursive: true });
      const temp = change.destination + '.' + randomUUID() + '.tmp';
      try { fs.writeFileSync(temp, change.bytes, { flag: 'wx', mode: 0o600 }); fs.renameSync(temp, change.destination); applied.push(change); }
      finally { try { fs.unlinkSync(temp); } catch {} }
    }
  } catch (error) {
    for (const change of applied.reverse()) { if (change.previous) fs.writeFileSync(change.destination, change.previous); else fs.unlinkSync(change.destination); }
    throw error;
  }
  return changes.length;
}
function remapRendererValues(root, data, videoMappings = []) {
  const maps = [...videoMappings, ...data.mappings.map(([from, relative]) => [from, path.join(root, relative)]), [data.sourceRoot, root]];
  const values = storageValues(data.rendererValues);
  return Object.fromEntries(STORAGE_KEYS.map(key => [key, key in values ? JSON.stringify(rewrite(JSON.parse(values[key]), maps)) : null]));
}
module.exports = { exportPackage, readPackage, restorePackage, allowed, storageValues, STORAGE_KEYS, validate, remapRendererValues };
