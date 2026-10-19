const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { entries, translate, normalize } = require('../src/renderer/ui-locale');

assert.equal(normalize('tr'), 'tr');
assert.equal(normalize('en'), 'en');
assert.equal(normalize('invalid'), 'en');
assert.equal(translate('Kaynağını seç', 'en'), 'Choose a source');
assert.equal(translate('  Kaynağını seç  ', 'en'), '  Choose a source  ');
assert.equal(translate('Choose a source', 'tr'), 'Kaynağını seç');
assert.equal(translate('Some user subtitle text', 'en'), 'Some user subtitle text');
assert.equal(translate('Media library', 'tr'), 'Arşiv');
assert.equal(translate('BROWSER', 'tr'), 'BROWSER');
assert.equal(translate('Çeviri oluşturuluyor · %42 · 106/252 blok · 3 eksik · Sağlayıcı yanıtı bekleniyor · 35 sn', 'en'),
  'Translating · 42% · 106/252 blocks · 3 missing · Waiting for provider response · 35 s');
assert.equal(translate('Altyazı hazırlanıyor · %80', 'en'), 'Generating subtitles · 80%');

// R95: SmartTube giriş/abonelik paneli dinamik metinleri sözlükte olmalı
for (const key of [
  'Tarayıcıda yetkilendir',
  'Cihaz kodu üret',
  'Cihaz kodu alınamadı',
  'Bu grupta kanal yok.',
  'Yerel abonelik listesi boş — kart menüsünden "Kanala abone ol" veya dosyadan içe aktar.',
  'Liste bu cihazda tutulur; YouTube/Invidious hesabına yüklenmez.',
]) {
  const en = translate(key, 'en');
  assert.notEqual(en, key, `Çeviri eksik: ${key}`);
}

const originals = entries.map(([source]) => source);
assert.equal(new Set(originals).size, originals.length, 'Each Turkish UI key must be unique');

const html = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8');
assert.match(html, /<html lang="en">/);
assert.match(html, /id="openPlayer"[^>]*>BROWSER<\/button>/);
assert.match(html, /id="uiLocale"/);
assert.match(html, /id="playerUiLocale"/);
assert.match(html, /<script src="ui-locale\.js"><\/script>\s*<script src="status-copy\.js"><\/script>\s*<script src="timeline-issue-scan\.js"><\/script>\s*<script src="renderer-helpers\.js"><\/script>\s*<script src="renderer\.js"><\/script>/);
const localized = new Map(entries);
const staticCopy = html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
// HTML entity'leri sözlük anahtarlarıyla eşleşmesi için çözülür (&lt;ad&gt; → <ad>).
const decodeEntities = (value) => value
  .replace(/&(lt|gt|quot|amp|times|nbsp|rarr|larr|hellip|darr|uarr|middot|ndash|mdash|deg);/g,
    (_, name) => ({ lt: '<', gt: '>', quot: '"', amp: '&', times: '×', nbsp: ' ',
      rarr: '→', larr: '←', hellip: '…', darr: '↓', uarr: '↑', middot: '·',
      ndash: '–', mdash: '—', deg: '°' })[name])
  .replace(/&#39;|&apos;/g, "'").replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(Number(n)))
  .replace(/&amp;/g, '&');
const untranslated = new Set();
for (const match of staticCopy.matchAll(/>([^<>]+)</g)) {
  const value = decodeEntities(match[1].replace(/\s+/g, ' ').trim());
  // T9/R175: Türkçe karakter kapısı ASCII-TR dizgileri (ör. "Yeni sekme", "Sezon")
  // kaçırıyordu; artık sözlükte olmayan HER dizgi nötr izin listesine düşmeli.
  if (value && !localized.has(value)) untranslated.add(value);
}
for (const match of staticCopy.matchAll(/(?:title|aria-label|placeholder)="([^"]+)"/g)) {
  const value = decodeEntities(match[1].trim());
  if (value && !localized.has(value)) untranslated.add(value);
}
// Yerelleştirilmez metinler: birimler, marka/model adları, klavye glifleri,
// dosya adları, URL'ler, örnek değerler. Türkçe bir dizgi buraya eklenemez —
// sözlüğe girilmeli.
const NEUTRAL = [
  '%', '%100', '%50', '%7', '%86', '+', '+100 ms',
  ', .', '----', '-1.0', '.', '.bak', '.comments\n.recommendations', '/',
  '0', '0%', '0.0', '0.00', '0.30', '0.5×', '0.50', '0.60', '0.75×', '0:00', '0:00 / 0:00',
  '0–9', '1×', '1.0', '1.25×', '1.5×', '1.75×', '100%', '16', '1:30', '2',
  '2×', '2× ▶▶', '2.4', '2.50', '20', '2000', '220', '28', '3.0', '4', '400', '42',
  '45', '4SAPI · GPT-5.4 / Gemini 3.8 Flash', '5', '5:00', '70', '8', '<', '< >',
  '<ad>.synced.srt', '<ad>.tr.srt', '>', '?', 'A', 'A D', 'A-B', 'API Key', 'ASS',
  'ASS (Aegisub — stil/renk/karaoke)', 'Açık', 'B', 'BROWSER', 'Backspace',
  'Bilingual viewing workspace', 'Bing', 'Brave', 'Brave Search', 'C', 'CPU',
  'CUDA (GPU)', 'CUDA · float16', 'Cambridge (EN→TR)', 'Captain = Kaptan',
  'Chrome', 'Client ID', 'Client Secret', 'CodeCraftAPI · Gemini 3.7 Flash',
  'Ctrl+K', 'Ctrl+L', 'D', 'DeepSeek', 'DuckDuckGo', 'E', 'EN', 'Edge',
  'Endpoint (base URL)', 'Esc', 'F', 'FFmpeg', 'G', 'G H', 'GPU', 'Gemini',
  'Google', 'Groq', 'H', 'HTML', 'HuggingFace Token', 'I', 'IMDb', 'J', 'J L',
  'JSON', 'K', 'L', 'M', 'Manga', 'Manga API Key', 'Manga JSON', 'Markdown',
  'Media library', 'Model', 'N', 'No-repeat n-gram:', 'Normal', 'O', 'OpenAI',
  'Open the browser and player', 'OpenRouter', 'Opera', 'Patience:', 'R', 'S',
  'SRT', 'SRT (standart)', 'SRT + ASS + JSON', 'SRT + VTT + TXT', 'Serif',
  'Sponsor', 'SponsorBlock', 'Startpage', 'T', 'TR', 'TXT', 'TXT (sadece metin)',
  'Tureng (EN↔TR)', 'V', 'VTT', 'VTT (web)', 'Vivaldi', 'W', 'WEB-DL, BluRay…',
  'WhisperX', 'YouTube', 'YouTube (yt-dlp)', 'YouTube browser', 'base', 'batched',
  'cc_... / sk-...', 'deepseek-v4-flash', 'diarization', 'faster-whisper',
  'float16', 'gemini-3.8-flash', 'gemini-3.8-pro', 'google.com/device', 'gpt-5.4', 'hf_...',
  'hotwords', 'https://api.example.com/v1', 'https://youtube.com/watch?v=...',
  'install-diarize.bat', 'install-whisperx.bat', 'int8', 'large-v2', 'large-v3',
  'large-v3-turbo', 'large-v3-turbo · faster', 'medium', 'no_repeat_ngram_size=3',
  'platform.deepseek.com', 'px', 'repetition_penalty=1.15', 'segmentation',
  'shuaiapi · Asya Pasifik CDN', 'shuaiapi · Asya Pasifik CDN 2',
  'shuaiapi · CF optimize', 'shuaiapi · Global', 'sk-...', 'small', 'tiny', 'tr',
  'tt0133093', 'vs base', 'vs large-v3', 'vs large-v3-turbo', 'vs medium',
  'vs small', 'vs tiny', 'xxxxx.apps.googleusercontent.com', 'yt-dlp', '×', '–',
  '—', '— / —', '← →', '↑', '↑ ↓', '↓', '↗', '−', '−100 ms', '▣', '▶',
  // R406: SmartTube rayının metin glifleri (⌂ ★ ⚿ ✎ …) aynı çizgide SVG simgelere
  // dönüştü; artık çevrilmemiş statik metin olarak görünmezler.
];
// 'Açık' tema seçeneği setLocale içinde açıkça güncellenir; sayı/glif/marka
// dizgileri her iki dilde aynı kalır.
assert.deepEqual([...untranslated].sort(), NEUTRAL.slice().sort(),
  'Static UI copy must have a translation or a documented neutral exception');
console.log('ui-locale: 14 assertions passed');
