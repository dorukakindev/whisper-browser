'use strict';

const { redactCaptureUrl } = require('./browser-adapters');

const SUBTITLE_REDACTION = '[altyazı metni gizlendi]';
const LOCAL_PATH_REDACTION = '[yol gizlendi]';

function redactBrowserDiagnosticsText(value, maxLength = 400) {
  return String(value == null ? '' : value)
    .replace(/https?:\/\/[^\s)"',;<>]+/gi, (url) => redactCaptureUrl(url))
    .replace(/\bfile:(?:\/\/\/?)?[^\r\n,;)"'}\]]+/gi, LOCAL_PATH_REDACTION)
    .replace(/(^|[\s"'(=:])(?:[A-Za-z]:[\\/]|\\\\[^\\/\s]+[\\/]|\/(?:home|Users)\/)[^\r\n,;)"'}\]]+/gim,
      '$1' + LOCAL_PATH_REDACTION)
    .replace(/\b(api[_-]?key|token|sig|signature|secret|authorization|cookie|password)\s*[=:]\s*(?:(?:Bearer|Basic)\s+)?[^\s,;]+/gi,
      '$1=[gizlendi]')
    .replace(/\b(Bearer|Basic)\s+[^\s,;]+/gi, '$1 [gizlendi]')
    .slice(0, Math.max(0, Number(maxLength) || 400));
}

function sanitizeDiagnosticsSecrets(value) {
  function visit(current) {
    if (typeof current === 'string') return redactBrowserDiagnosticsText(current, 2048);
    if (Array.isArray(current)) return current.map(visit);
    if (!current || typeof current !== 'object') return current;
    return Object.fromEntries(Object.entries(current).map(([key, entry]) => [key, visit(entry)]));
  }
  return visit(value);
}

function capturedCueTexts(trackBuffers) {
  const texts = new Set();
  const collections = trackBuffers instanceof Map
    ? trackBuffers.values()
    : (Array.isArray(trackBuffers) ? trackBuffers : []);
  for (const cues of collections) {
    if (!Array.isArray(cues)) continue;
    for (const cue of cues) {
      const text = String(cue?.text || '').trim();
      if (text) texts.add(text);
    }
  }
  return [...texts].sort((left, right) => right.length - left.length);
}

function redactCapturedCueText(value, cueTexts = []) {
  let output = String(value == null ? '' : value);
  for (const rawText of cueTexts) {
    const text = String(rawText || '').trim();
    if (!text) continue;
    // Çok kısa altyazılar ("No", "I" gibi) sıradan tanı sözcüklerinin içinde
    // bulunabilir. Bunları yalnız alanın tamamı cue ise gizle; daha uzun
    // cümleleri ise hata öneki/soneki içine yanlışlıkla taşınsa da kaldır.
    if (text.length < 8) {
      if (output.trim() === text) output = SUBTITLE_REDACTION;
      continue;
    }
    if (output.includes(text)) output = output.split(text).join(SUBTITLE_REDACTION);
  }
  return output;
}

function sanitizeDiagnosticsAgainstCueText(value, trackBuffers) {
  const cueTexts = capturedCueTexts(trackBuffers);
  function visit(current) {
    if (typeof current === 'string') return redactCapturedCueText(current, cueTexts);
    if (Array.isArray(current)) return current.map(visit);
    if (!current || typeof current !== 'object') return current;
    return Object.fromEntries(Object.entries(current).map(([key, entry]) => [key, visit(entry)]));
  }
  return visit(value);
}

module.exports = {
  LOCAL_PATH_REDACTION,
  SUBTITLE_REDACTION,
  capturedCueTexts,
  redactCapturedCueText,
  redactBrowserDiagnosticsText,
  sanitizeDiagnosticsSecrets,
  sanitizeDiagnosticsAgainstCueText,
};
