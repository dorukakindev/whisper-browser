'use strict';

const fs = require('fs');
const path = require('path');
const { MAX_SUBTITLE_BYTES } = require('./local-file-access');

function sameLocalPath(left, right) {
  const a = path.resolve(left);
  const b = path.resolve(right);
  return process.platform === 'win32' ? a.toLowerCase() === b.toLowerCase() : a === b;
}

function sanitizeWordSegments(payload) {
  if (!payload || !Array.isArray(payload.segments)) return [];
  const segments = [];
  for (const rawSegment of payload.segments) {
    if (!rawSegment || typeof rawSegment !== 'object') continue;
    const start = rawSegment.start;
    const end = rawSegment.end;
    if (typeof start !== 'number' || typeof end !== 'number'
        || !Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end < start
        || !Array.isArray(rawSegment.words)) continue;
    const words = [];
    for (const rawWord of rawSegment.words) {
      if (!rawWord || typeof rawWord !== 'object' || typeof rawWord.word !== 'string') continue;
      const word = rawWord.word.slice(0, 4096);
      const wordStart = rawWord.start;
      const wordEnd = rawWord.end === undefined ? wordStart : rawWord.end;
      if (!word.trim() || typeof wordStart !== 'number' || typeof wordEnd !== 'number'
          || !Number.isFinite(wordStart) || !Number.isFinite(wordEnd)
          || wordStart < 0 || wordEnd < wordStart
          || wordEnd < start - 0.05 || wordStart > end + 0.05) continue;
      const item = { word, start: wordStart, end: wordEnd };
      if (typeof rawWord.probability === 'number' && Number.isFinite(rawWord.probability)) {
        item.probability = rawWord.probability;
      }
      words.push(item);
    }
    if (words.length) {
      words.sort((a, b) => a.start - b.start || a.end - b.end);
      segments.push({ start, end, words });
    }
  }
  segments.sort((a, b) => a.start - b.start || a.end - b.end);
  return segments;
}

function readAdjacentWordSegments(subtitlePath) {
  if (path.extname(subtitlePath).toLowerCase() === '.json') return [];
  const directory = path.dirname(subtitlePath);
  const stem = path.basename(subtitlePath, path.extname(subtitlePath));
  const candidate = path.join(directory, `${stem}.json`);
  if (!fs.existsSync(candidate)) return [];

  // Yan dosya, yetkilendirilmiş altyazının gerçek klasöründen symlink ile
  // dışarı çıkamaz. Böylece bitişik JSON için ikinci izin istemeden yalnız
  // beklenen aynı-gövdeli çıktıyı okuyabiliriz.
  const realDirectory = fs.realpathSync(directory);
  const realCandidate = fs.realpathSync(candidate);
  if (!sameLocalPath(path.dirname(realCandidate), realDirectory)) return [];
  const stat = fs.statSync(realCandidate);
  if (!stat.isFile() || stat.size > MAX_SUBTITLE_BYTES) return [];
  const raw = fs.readFileSync(realCandidate, 'utf8').replace(/^\uFEFF/, '');
  return sanitizeWordSegments(JSON.parse(raw));
}

module.exports = { readAdjacentWordSegments, sanitizeWordSegments };
