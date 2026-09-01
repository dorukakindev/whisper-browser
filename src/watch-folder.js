'use strict';

const path = require('path');

const WATCH_FORMATS = new Set(['srt', 'vtt', 'txt', 'ass', 'json']);

function normalizeWatchOutputConfig(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const formats = [...new Set(String(source.formats || 'srt')
    .split(',')
    .map((format) => format.trim().toLowerCase())
    .filter((format) => WATCH_FORMATS.has(format)))];
  return {
    formats: formats.length ? formats : ['srt'],
    langSuffix: source.langSuffix === true || source.langSuffix === 'true',
    outputDir: typeof source.outputDir === 'string' && source.outputDir.trim()
      ? source.outputDir.trim()
      : '',
    translateTo: typeof source.translateTo === 'string' && /^[a-z]{2,3}(?:-[a-z]{2,4})?$/i.test(source.translateTo.trim())
      ? source.translateTo.trim().toLowerCase()
      : '',
  };
}

function watchOutputNames(videoPath, config) {
  const normalized = normalizeWatchOutputConfig(config);
  const stem = path.basename(videoPath).replace(/\.[^.]+$/, '');
  const names = [];
  for (const format of normalized.formats) {
    names.push(`${stem}.${format}`);
    // Translation jobs and language-suffix mode both produce language-tagged
    // siblings. Treat these as completed output too, otherwise every scan
    // queues the same video again when only the translated file exists.
    names.push(`${stem}.dual.${format}`);
    names.push(`${stem}.ceviri.${format}`);
    names.push(`${stem}.tr.${format}`);
    names.push(`${stem}.en.${format}`);
    if (normalized.translateTo) names.push(`${stem}.${normalized.translateTo}.${format}`);
    if (normalized.langSuffix) {
      names.push(`${stem}.<lang>.${format}`);
    }
  }
  return { names, outputDir: normalized.outputDir || path.dirname(videoPath), stem };
}

function hasConfiguredWatchOutput(videoPath, config, exists = (filePath) => false) {
  const { names, outputDir, stem } = watchOutputNames(videoPath, config);
  const normalized = normalizeWatchOutputConfig(config);
  const candidates = names
    .filter((name) => !name.includes('<lang>'))
    .map((name) => path.join(outputDir, name));
  if (candidates.some(exists)) return true;
  if (!normalized.langSuffix) return false;
  const escapedStem = stem.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return normalized.formats.some((format) => {
    const pattern = new RegExp(`^${escapedStem}\\.[a-z]{2,3}(?:-[a-z]{2,4})?\\.${format}$`, 'i');
    let entries;
    try { entries = require('fs').readdirSync(outputDir); } catch (_) { return false; }
    return entries.some((entry) => pattern.test(entry));
  });
}

module.exports = { WATCH_FORMATS, normalizeWatchOutputConfig, watchOutputNames, hasConfiguredWatchOutput };
