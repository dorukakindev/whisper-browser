'use strict';

const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const { cuesToSrt, normalizeCues } = require('./browser-asset-store');

const ARCHIVE_VERSION = 1;
const INDEX_LIMIT = 5000;
const TRACKING_QUERY = /^(?:utm_.+|fbclid|gclid|dclid|msclkid|mc_[ce]id|ref_|referrer|source)$/i;
const SENSITIVE_QUERY = /^(?:access_?token|auth(?:orization)?|api_?key|code|credential|expires?|jwt|key|key-pair-id|pass(?:code|word)?|policy|secret|session(?:id)?|sig(?:nature)?|state|token|x-amz-.+)$/i;

function hash(value, length = 24) {
  return crypto.createHash('sha256').update(String(value || ''), 'utf8').digest('hex').slice(0, length);
}

function normalizeText(value) {
  return String(value || '').replace(/\r\n?/g, '\n').replace(/[ \t\f\v]+/g, ' ')
    .replace(/ *\n */g, '\n').trim();
}

function canonicalPageUrl(raw) {
  try {
    const url = new URL(String(raw || '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.username = '';
    url.password = '';
    url.hash = '';
    const kept = [...url.searchParams.entries()]
      .filter(([key]) => !TRACKING_QUERY.test(key) && !SENSITIVE_QUERY.test(key))
      .sort(([leftKey, leftValue], [rightKey, rightValue]) =>
        leftKey.localeCompare(rightKey) || leftValue.localeCompare(rightValue));
    url.search = '';
    for (const [key, value] of kept) url.searchParams.append(key, value);
    if (url.pathname.length > 1) url.pathname = url.pathname.replace(/\/+$/, '');
    return url.href;
  } catch (_) { return ''; }
}

function canonicalPageSite(raw) {
  const canonical = canonicalPageUrl(raw);
  if (!canonical) return '';
  try { return new URL(canonical).origin; }
  catch (_) { return ''; }
}

function safeName(value, fallback) {
  const normalized = String(value || '').normalize('NFKC')
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, ' ')
    .replace(/\s+/g, ' ').trim().replace(/[ .]+$/g, '').slice(0, 90);
  return normalized || fallback;
}

function languageCode(value, fallback = 'tr') {
  const normalized = String(value || '').trim().toLowerCase();
  return /^[a-z]{2,3}(?:-[a-z0-9]{2,8})?$/i.test(normalized) ? normalized : fallback;
}

function translationFor(translations, id) {
  if (translations instanceof Map) return translations.get(id);
  if (translations && typeof translations === 'object' && !Array.isArray(translations)) return translations[id];
  return '';
}

function normalizePageRows(blocks, translations) {
  return (Array.isArray(blocks) ? blocks : [...(blocks?.values?.() || [])])
    .map((block, order) => {
      const id = String(block?.id || '').slice(0, 240);
      const source = normalizeText(block?.text).slice(0, 12000);
      const translation = normalizeText(translationFor(translations, id)).slice(0, 12000);
      if (!id || !source || !translation) return null;
      return {
        id, source, translation,
        tag: String(block?.tag || '').toLowerCase().slice(0, 24),
        role: String(block?.role || '').toLowerCase().slice(0, 48),
        section: normalizeText(block?.section || 'Genel').slice(0, 160),
        order: Math.max(0, Number.isFinite(Number(block?.order)) ? Math.trunc(Number(block.order)) : order),
      };
    }).filter(Boolean).sort((left, right) => left.order - right.order);
}

function escapeHtml(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
  })[character]);
}

function buildPageTranslationExport(raw = {}) {
  const format = ['txt', 'md', 'html', 'json'].includes(raw.format) ? raw.format : 'txt';
  const blocks = (Array.isArray(raw.blocks) ? raw.blocks : [...(raw.blocks?.values?.() || [])])
    .map((block, index) => ({ ...block,
      id: String(block?.id || '').slice(0, 240),
      text: normalizeText(block?.text).slice(0, 12000),
      order: Number.isFinite(Number(block?.order)) ? Math.max(0, Math.trunc(Number(block.order))) : index,
      section: normalizeText(block?.section || 'Genel').slice(0, 160) || 'Genel',
    })).filter((block) => block.id && block.text).sort((left, right) => left.order - right.order);
  const failures = raw.failures instanceof Map ? raw.failures : new Map(Object.entries(raw.failures || {}));
  const excludedIds = raw.excludedIds instanceof Set ? raw.excludedIds : new Set(raw.excludedIds || []);
  const manualEditIds = raw.manualEditIds instanceof Set ? raw.manualEditIds : new Set(raw.manualEditIds || []);
  const rows = blocks.map((block) => {
    const translation = normalizeText(translationFor(raw.translations, block.id)).slice(0, 12000);
    const status = excludedIds.has(block.id) ? 'excluded' : translation ? 'translated'
      : failures.has(block.id) ? 'failed' : 'pending';
    return { id: block.id, source: block.text, translation, section: block.section,
      tag: String(block.tag || '').slice(0, 24), role: String(block.role || '').slice(0, 48),
      status, manualEdit: manualEditIds.has(block.id), order: block.order };
  });
  const translatedRows = rows.filter((row) => row.status === 'translated');
  const counts = { total: rows.length, translated: translatedRows.length,
    failed: rows.filter((row) => row.status === 'failed').length,
    excluded: rows.filter((row) => row.status === 'excluded').length,
    pending: rows.filter((row) => row.status === 'pending').length };
  const complete = counts.failed === 0 && counts.pending === 0;
  const title = normalizeText(raw.title || 'Sayfa çevirisi').slice(0, 300) || 'Sayfa çevirisi';
  const url = canonicalPageUrl(raw.url);
  const targetLanguage = languageCode(raw.targetLanguage);
  const notice = complete ? '' : `KISMİ ÇEVİRİ: ${counts.translated}/${counts.total} blok çevrildi; ${counts.failed} başarısız, ${counts.pending} bekliyor, ${counts.excluded} dışlandı.`;
  let text;
  if (format === 'json') {
    text = `${JSON.stringify({ version: 1, title, url, targetLanguage,
      sourceLanguage: languageCode(raw.sourceLanguage, ''), scope: raw.scope || 'article',
      mode: raw.mode === 'replace' ? 'replace' : 'bilingual', complete, counts, blocks: rows }, null, 2)}\n`;
  } else if (format === 'html') {
    const warning = notice ? `<p class="partial"><strong>${escapeHtml(notice)}</strong></p>` : '';
    text = `<!doctype html>\n<html lang="${escapeHtml(targetLanguage)}"><head><meta charset="utf-8"><title>${escapeHtml(title)}</title></head><body><main><h1>${escapeHtml(title)}</h1>${warning}\n${translatedRows.map((row) => `<section data-status="${row.status}"><h2>${escapeHtml(row.section)}</h2><p class="source">${escapeHtml(row.source)}</p><p class="translation" lang="${escapeHtml(targetLanguage)}">${escapeHtml(row.translation)}</p></section>`).join('\n')}\n</main></body></html>\n`;
  } else if (format === 'md') {
    text = `# ${title}\n\n${notice ? `> **${notice}**\n\n` : ''}${translatedRows.map((row) => `## ${row.section}\n\n${row.source}\n\n> ${row.translation}`).join('\n\n')}\n`;
  } else {
    text = `${notice ? `${notice}\n\n` : ''}${translatedRows.map((row) => `${row.source}\n${row.translation}`).join('\n\n')}${translatedRows.length ? '\n' : ''}`;
  }
  return { format, extension: format, text, complete, counts };
}

function pageRowKey(row) {
  return `${normalizeText(row?.source)}\u0000${String(row?.tag || '').toLowerCase()}\u0000${String(row?.role || '').toLowerCase()}`;
}

function matchArchivedPage(record, rawBlocks) {
  const blocks = (Array.isArray(rawBlocks) ? rawBlocks : []).map((block, order) => ({
    id: String(block?.id || '').slice(0, 240), source: normalizeText(block?.text).slice(0, 12000),
    tag: String(block?.tag || '').toLowerCase().slice(0, 24),
    role: String(block?.role || '').toLowerCase().slice(0, 48), order,
  })).filter((block) => block.id && block.source);
  const rows = Array.isArray(record?.rows) ? record.rows : [];
  const byId = new Map(blocks.map((block) => [block.id, block]));
  const used = new Set();
  const matches = [];
  const unmatchedRows = [];
  for (const row of rows) {
    const block = byId.get(String(row?.id || ''));
    if (block && block.source === normalizeText(row?.source) && !used.has(block.id)) {
      used.add(block.id);
      matches.push({ id: block.id, translation: normalizeText(row.translation), source: block.source });
    } else unmatchedRows.push(row);
  }
  const queues = new Map();
  for (const block of blocks) {
    if (used.has(block.id)) continue;
    const key = pageRowKey(block);
    if (!queues.has(key)) queues.set(key, []);
    queues.get(key).push(block);
  }
  for (const row of unmatchedRows) {
    const queue = queues.get(pageRowKey(row));
    const block = queue?.shift();
    const translation = normalizeText(row?.translation);
    if (!block || !translation) continue;
    used.add(block.id);
    matches.push({ id: block.id, translation, source: block.source });
  }
  matches.sort((left, right) => (byId.get(left.id)?.order || 0) - (byId.get(right.id)?.order || 0));
  return { matches, archived: rows.length, current: blocks.length,
    ratio: rows.length ? matches.length / rows.length : 0,
    exact: rows.length > 0 && matches.length === rows.length };
}

function pageMarkdown(record) {
  const meta = [`Kaynak: ${record.url}`, `Hedef dil: ${record.targetLanguage}`,
    `Kaydedilme: ${new Date(record.updatedAt).toISOString()}`].join('\n');
  const rows = record.rows.map((row) => `## ${row.section || 'Genel'}\n\n${row.source}\n\n> ${row.translation}`).join('\n\n');
  return `# ${record.title || 'Sayfa çevirisi'}\n\n${meta}\n\n${rows}\n`;
}

class BrowserTranslationArchive {
  constructor(rootDir, options = {}) {
    if (!rootDir) throw new TypeError('Çeviri arşivi dizini gerekli.');
    this.rootDir = path.resolve(rootDir);
    this.pageDir = path.join(this.rootDir, 'Sayfalar');
    this.subtitleDir = path.join(this.rootDir, 'Altyazılar');
    this.indexPath = path.join(this.rootDir, 'index.json');
    this.fs = options.fsModule || fs;
    this.index = null;
  }

  ensure() {
    this.fs.mkdirSync(this.pageDir, { recursive: true });
    this.fs.mkdirSync(this.subtitleDir, { recursive: true });
    return this.rootDir;
  }

  _readIndex() {
    if (this.index) return this.index;
    try {
      const parsed = JSON.parse(this.fs.readFileSync(this.indexPath, 'utf8'));
      this.index = parsed?.version === ARCHIVE_VERSION && Array.isArray(parsed.entries)
        ? { version: ARCHIVE_VERSION, entries: parsed.entries.filter((entry) => entry && typeof entry === 'object').slice(0, INDEX_LIMIT) }
        : { version: ARCHIVE_VERSION, entries: [] };
    } catch (_) { this.index = { version: ARCHIVE_VERSION, entries: [] }; }
    return this.index;
  }

  _writeText(filePath, content) {
    this.ensure();
    try {
      if (this.fs.existsSync(filePath) && this.fs.readFileSync(filePath, 'utf8') === content) return;
    } catch (_) {}
    const temp = `${filePath}.${process.pid}.${Date.now()}.tmp`;
    this.fs.writeFileSync(temp, content, 'utf8');
    this.fs.renameSync(temp, filePath);
  }

  _saveIndex(entry) {
    const index = this._readIndex();
    const previous = index.entries.find((item) => item.id === entry.id);
    index.entries = [entry, ...index.entries.filter((item) => item.id !== entry.id)].slice(0, INDEX_LIMIT);
    const temp = `${this.indexPath}.${process.pid}.${Date.now()}.tmp`;
    this.ensure();
    this.fs.writeFileSync(temp, `${JSON.stringify(index, null, 2)}\n`, 'utf8');
    this.fs.renameSync(temp, this.indexPath);
    // Index atomik olarak yeni revizyona gectikten sonra yalniz ayni mantiksal
    // kaydin eski dosyalarini ve yalniz arsiv kokunun icinde sil.
    for (const field of ['jsonPath', 'displayPath']) {
      const relative = String(previous?.[field] || '');
      if (!relative || relative === entry[field]) continue;
      const target = path.resolve(this.rootDir, relative);
      const parent = path.dirname(target);
      if (!target.startsWith(this.rootDir + path.sep)
          || ![this.pageDir, this.subtitleDir].includes(parent)) continue;
      try { if (this.fs.existsSync(target)) this.fs.unlinkSync(target); } catch (_) {}
    }
  }

  savePage(raw = {}) {
    const url = canonicalPageUrl(raw.url);
    const targetLanguage = languageCode(raw.targetLanguage);
    const rows = normalizePageRows(raw.blocks, raw.translations);
    if (!url || !rows.length) return { ok: false, error: 'Arşivlenecek sayfa çevirisi yok.' };
    const now = Date.now();
    const title = safeName(raw.title, 'Sayfa çevirisi');
    const scope = ['article', 'whole', 'selection'].includes(raw.scope) ? raw.scope : 'article';
    const id = `page:${hash(`${url}|${targetLanguage}|${scope}`, 32)}`;
    const record = { version: ARCHIVE_VERSION, kind: 'page', id, url,
      originalUrl: url, title, targetLanguage,
      sourceLanguage: languageCode(raw.sourceLanguage, ''), model: String(raw.model || '').slice(0, 160),
      mode: raw.mode === 'replace' ? 'replace' : 'bilingual', scope, complete: raw.complete === true,
      excludedSections: [...new Set((Array.isArray(raw.excludedSections) ? raw.excludedSections : [])
        .map((value) => normalizeText(value).slice(0, 160)).filter(Boolean))].slice(0, 80),
      createdAt: Number(raw.createdAt) || now, updatedAt: now, rows };
    const contentDigest = hash(JSON.stringify(rows), 16);
    const stem = `${title}-${targetLanguage}-${id.slice(-10)}-${contentDigest}`;
    const jsonName = `${stem}.json`;
    const markdownName = `${stem}.md`;
    this._writeText(path.join(this.pageDir, jsonName), `${JSON.stringify(record, null, 2)}\n`);
    this._writeText(path.join(this.pageDir, markdownName), pageMarkdown(record));
    this._saveIndex({ id, kind: 'page', url, title, targetLanguage, scope, complete: record.complete,
      updatedAt: now, count: rows.length, jsonPath: path.join('Sayfalar', jsonName),
      displayPath: path.join('Sayfalar', markdownName) });
    return { ok: true, id, path: path.join(this.pageDir, markdownName), count: rows.length };
  }

  hasPage(rawUrl, rawTargetLanguage = 'tr') {
    const url = canonicalPageUrl(rawUrl);
    const targetLanguage = languageCode(rawTargetLanguage);
    return !!url && this._readIndex().entries.some((entry) =>
      entry.kind === 'page' && entry.url === url && entry.targetLanguage === targetLanguage);
  }

  listPages(raw = {}) {
    const url = raw.url ? canonicalPageUrl(raw.url) : '';
    const targetLanguage = raw.targetLanguage ? languageCode(raw.targetLanguage) : '';
    const limit = Math.max(1, Math.min(100, Math.trunc(Number(raw.limit) || 20)));
    return this._readIndex().entries
      .filter((entry) => entry.kind === 'page' && (!url || entry.url === url)
        && (!targetLanguage || entry.targetLanguage === targetLanguage))
      .sort((left, right) => Number(right.updatedAt) - Number(left.updatedAt))
      .slice(0, limit).map((entry) => ({ ...entry }));
  }

  findPage(raw = {}) {
    const url = canonicalPageUrl(raw.url);
    const targetLanguage = languageCode(raw.targetLanguage);
    if (!url || !Array.isArray(raw.blocks) || !raw.blocks.length) return null;
    const candidates = this._readIndex().entries
      .filter((entry) => entry.kind === 'page' && entry.url === url && entry.targetLanguage === targetLanguage)
      .sort((left, right) => Number(right.updatedAt) - Number(left.updatedAt));
    let best = null;
    for (const entry of candidates) {
      try {
        const filePath = path.resolve(this.rootDir, String(entry.jsonPath || ''));
        if (!filePath.startsWith(this.rootDir + path.sep)) continue;
        const record = JSON.parse(this.fs.readFileSync(filePath, 'utf8'));
        if (record?.version !== ARCHIVE_VERSION || record.kind !== 'page' || record.url !== url) continue;
        const match = matchArchivedPage(record, raw.blocks);
        const minimum = record.rows.length <= 2 ? 1 : 2;
        if (match.matches.length < minimum || match.ratio < 0.5) continue;
        const candidate = { entry, record, ...match, path: path.join(this.rootDir, entry.displayPath) };
        if (!best || candidate.matches.length > best.matches.length
            || (candidate.matches.length === best.matches.length && entry.updatedAt > best.entry.updatedAt)) best = candidate;
      } catch (_) {}
    }
    return best;
  }

  saveSubtitle(raw = {}) {
    const cues = normalizeCues(raw.cues);
    const mediaId = String(raw.mediaId || '').slice(0, 300);
    if (!mediaId || !cues.length) return { ok: false, error: 'Arşivlenecek altyazı çevirisi yok.' };
    const targetLanguage = languageCode(raw.targetLanguage || raw.language);
    const title = safeName(raw.title, 'Web altyazısı');
    const sourceHash = String(raw.sourceHash || '').replace(/[^a-f0-9]/gi, '').toLowerCase().slice(0, 64);
    const trackId = String(raw.trackId || '').slice(0, 240);
    const id = `subtitle:${hash(`${mediaId}|${targetLanguage}|${sourceHash}|${trackId}`, 32)}`;
    const contentDigest = hash(JSON.stringify(cues), 16);
    const stem = `${title}-${targetLanguage}-${id.slice(-10)}-${contentDigest}`;
    const srtName = `${stem}.srt`;
    const jsonName = `${stem}.json`;
    const now = Date.now();
    const record = { version: ARCHIVE_VERSION, kind: 'subtitle', id, mediaId,
      url: canonicalPageUrl(raw.url), title, targetLanguage,
      sourceHash, trackId, model: String(raw.model || '').slice(0, 160),
      provider: String(raw.provider || '').slice(0, 300), createdAt: Number(raw.createdAt) || now,
      updatedAt: now, cueCount: cues.length, cues };
    this._writeText(path.join(this.subtitleDir, srtName), `\uFEFF${cuesToSrt(cues)}`);
    this._writeText(path.join(this.subtitleDir, jsonName), `${JSON.stringify(record, null, 2)}\n`);
    this._saveIndex({ id, kind: 'subtitle', mediaId, url: record.url, title, targetLanguage,
      updatedAt: now, count: cues.length, jsonPath: path.join('Altyazılar', jsonName),
      displayPath: path.join('Altyazılar', srtName) });
    return { ok: true, id, path: path.join(this.subtitleDir, srtName), count: cues.length };
  }
}

module.exports = { ARCHIVE_VERSION, BrowserTranslationArchive, canonicalPageUrl, canonicalPageSite,
  buildPageTranslationExport, matchArchivedPage, normalizePageRows };
