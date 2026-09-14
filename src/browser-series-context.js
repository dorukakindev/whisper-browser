'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');

const MAX_MEDIA = 500;
const MAX_SERIES = 200;
const MAX_TERMS = 80;
const MAX_ISSUES = 100;

function fail(message) { throw new Error(message); }
function clean(value, max) { return String(value || '').trim().slice(0, max); }
function originOf(value) {
  try {
    const url = new URL(value);
    if (!['https:', 'http:'].includes(url.protocol)) fail('Dizi bağlamı için geçerli site adresi gerekli.');
    return url.origin;
  } catch { fail('Dizi bağlamı için geçerli site adresi gerekli.'); }
}
function seriesId(origin, name) { return `${origin}|${name.toLocaleLowerCase('tr')}`; }
function profileOf(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) fail('Dizi bağlamı geçersiz.');
  const synopsis = clean(raw.synopsis, 2000);
  const addressStyle = clean(raw.addressStyle, 500);
  const terms = [];
  const seen = new Set();
  if (raw.terms != null && !Array.isArray(raw.terms)) fail('Dizi terimleri liste olmalı.');
  for (const item of (raw.terms || []).slice(0, MAX_TERMS)) {
    const source = clean(item?.source, 100), target = clean(item?.target, 100);
    if (!source || !target) continue;
    const key = source.toLocaleLowerCase('tr');
    if (seen.has(key)) continue;
    seen.add(key); terms.push({ source, target });
  }
  return { synopsis, addressStyle, terms };
}
function blank() { return { version: 1, media: {}, series: {} }; }
function validStore(raw) {
  if (!raw || raw.version !== 1 || !raw.media || !raw.series ||
      typeof raw.media !== 'object' || typeof raw.series !== 'object' ||
      Array.isArray(raw.media) || Array.isArray(raw.series)) fail('Dizi bağlamı dosyası geçersiz; veri korunuyor.');
  return raw;
}
function createBrowserSeriesContext({ filePath }) {
  if (typeof filePath !== 'string' || !filePath) fail('Dizi bağlamı dosya yolu gerekli.');
  let state;
  function read() {
    if (state) return state;
    try { state = validStore(JSON.parse(fs.readFileSync(filePath, 'utf8'))); }
    catch (error) {
      if (error.code === 'ENOENT') state = blank();
      else if (error instanceof SyntaxError) fail('Dizi bağlamı dosyası okunamadı; veri korunuyor.');
      else throw error;
    }
    return state;
  }
  function commit(next) {
    const target = path.resolve(filePath);
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temp = `${target}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temp, JSON.stringify(next), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      fs.renameSync(temp, target);
      state = next;
    } finally { try { fs.unlinkSync(temp); } catch {} }
  }
  function mediaKeyOf(value) {
    const key = clean(value, 1024);
    if (!key) fail('Video kimliği gerekli.');
    return key;
  }
  function get(mediaKey) {
    const binding = read().media[mediaKeyOf(mediaKey)];
    if (!binding) return null;
    const record = read().series[binding.seriesId];
    if (!record || record.origin !== binding.origin) return null;
    return { seriesName: record.seriesName, origin: record.origin,
      profile: profileOf(record.profile || {}), seriesId: binding.seriesId };
  }
  function bind(mediaKey, seriesName, origin) {
    const key = mediaKeyOf(mediaKey);
    const name = clean(seriesName, 120);
    if (!name) fail('Dizi adı gerekli.');
    const site = originOf(origin);
    if (!key.startsWith(`${site}|`)) fail('Video kimliği ile site uyuşmuyor.');
    const id = seriesId(site, name);
    const old = read();
    const next = structuredClone(old);
    if (!next.media[key] && Object.keys(next.media).length >= MAX_MEDIA) fail('Video bağlantısı sınırına ulaşıldı.');
    if (!next.series[id] && Object.keys(next.series).length >= MAX_SERIES) fail('Dizi sınırına ulaşıldı.');
    next.media[key] = { seriesId: id, origin: site };
    next.series[id] ||= { seriesName: name, origin: site, profile: profileOf({}) };
    commit(next);
    return get(key);
  }
  function save(mediaKey, profile) {
    const key = mediaKeyOf(mediaKey), found = get(key);
    if (!found) fail('Önce videoyu bir diziye bağlayın.');
    const next = structuredClone(read());
    next.series[found.seriesId].profile = profileOf(profile);
    commit(next);
    return get(key);
  }
  function bindAndSave(mediaKey, seriesName, origin, profile) {
    const key = mediaKeyOf(mediaKey);
    const name = clean(seriesName, 120);
    if (!name) fail('Dizi adı gerekli.');
    const site = originOf(origin);
    if (!key.startsWith(`${site}|`)) fail('Video kimliği ile site uyuşmuyor.');
    const normalizedProfile = profileOf(profile);
    const id = seriesId(site, name);
    const next = structuredClone(read());
    if (!next.media[key] && Object.keys(next.media).length >= MAX_MEDIA) fail('Video bağlantısı sınırına ulaşıldı.');
    if (!next.series[id] && Object.keys(next.series).length >= MAX_SERIES) fail('Dizi sınırına ulaşıldı.');
    next.media[key] = { seriesId: id, origin: site };
    next.series[id] = { seriesName: name, origin: site, profile: normalizedProfile };
    commit(next);
    return get(key);
  }
  function translationContext(mediaKey) {
    const found = get(mediaKey);
    return found ? { seriesName: found.seriesName, ...found.profile } : null;
  }
  function check(mediaKey, { cues, translations } = {}) {
    const found = get(mediaKey);
    if (!found) return { issues: [], checked: 0 };
    if (!Array.isArray(cues) || !Array.isArray(translations) || cues.length > 10000 || translations.length > 10000)
      fail('Kontrol için en çok 10000 kaynak ve çeviri repliği verin.');
    const timed = translations.filter((row) => Number.isFinite(Number(row?.start)) && Number.isFinite(Number(row?.end)))
      .sort((a, b) => Number(a.start) - Number(b.start));
    const prefixEnd = [];
    for (const row of timed) prefixEnd.push(Math.max(prefixEnd.at(-1) ?? -Infinity, Number(row.end)));
    const issues = [];
    let checked = 0;
    for (let index = 0; index < cues.length; index++) {
      const cue = cues[index];
      const sourceText = clean(typeof cue === 'string' ? cue : cue?.text, 4000);
      if (!sourceText) continue;
      const start = Number(cue?.start), end = Number(cue?.end);
      let translated = null;
      if (!Number.isFinite(start) || !Number.isFinite(end)) translated = translations[index] || null;
      else {
        let low = 0, high = timed.length;
        while (low < high) {
          const mid = (low + high) >>> 1;
          if (Number(timed[mid].start) < end) low = mid + 1;
          else high = mid;
        }
        const overlapping = [];
        for (let position = low - 1; position >= 0 && prefixEnd[position] > start; position--) {
          const row = timed[position];
          if (Math.min(end, Number(row.end)) - Math.max(start, Number(row.start)) > 0) overlapping.push(row);
        }
        if (overlapping.length) translated = { text: overlapping.reverse().map(row => row.text || '').join(' ') };
      }
      if (!translated) continue;
      checked++;
      const actual = clean(typeof translated === 'string' ? translated : translated?.text, 4000);
      for (const term of found.profile.terms) {
        if (!sourceText.toLocaleLowerCase('tr').includes(term.source.toLocaleLowerCase('tr'))) continue;
        if (actual.toLocaleLowerCase('tr').includes(term.target.toLocaleLowerCase('tr'))) continue;
        issues.push({ index, start: Number.isFinite(start) ? start : null,
          end: Number.isFinite(end) ? end : null, source: term.source, target: term.target,
          actual, reason: 'Terim çeviride görünmüyor; inceleyin.' });
        if (issues.length >= MAX_ISSUES) return { issues, checked, truncated: true };
      }
    }
    return { issues, checked, truncated: false };
  }
  return { get, bind, save, bindAndSave, translationContext, check };
}
module.exports = { createBrowserSeriesContext, profileOf };
