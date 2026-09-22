'use strict';

// Yerelleştirme kapsamı: index.html'deki Türkçe arayüz metinleri ve öznitelikleri
// (title / aria-label / placeholder) ile renderer.js'teki sabit tarayıcı sinyalleri
// EN sözlüğünde bulunmalı. Eskiden eksikler ancak EN arayüzde gözle fark ediliyordu.
// Bilinen ve bilerek bırakılan istisnalar ALLOW listesindedir; yeni eksik eklenirse
// test başarısız olur.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const { entries } = require('../src/renderer/ui-locale.js');
const en = new Map(entries);
const html = fs.readFileSync(path.join(ROOT, 'src/renderer/index.html'), 'utf8');
const renderer = fs.readFileSync(path.join(ROOT, 'src/renderer/renderer.js'), 'utf8');

const TURKISH = /[çğıöşüÇĞİÖŞÜ]|\b(?:ve|veya|ile|için|bir|bu|yok|aç|kapat|sayfa|altyazı|çeviri)\b/i;
const norm = (value) => value.replace(/\s+/g, ' ').trim();
const decode = (value) => value.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&').replace(/&quot;/g, '"');

// Kullanıcı verisi, dosya yolu örneği ya da dil adı: çevrilmemesi DOĞRU olanlar.
const ALLOW = new Set([
  'İndirilenler\\Whisper\\GİRDİ',
  'İndirilenler\\Whisper\\ÇIKTI',
  'Türkçe',
  // Tema seçeneği: setLocale() metni doğrudan 'Light' yapar; genel 'Açık' girdisi
  // "açık/kapalı" anlamındaki diğer yerleri yanlış çevirirdi.
  'Açık',
]);

function lineOf(index) { return html.slice(0, index).split('\n').length; }

function htmlMissing() {
  const missing = [];
  const body = html.replace(/<(script|style)\b[\s\S]*?<\/\1>/g, (block) => ' '.repeat(block.length));
  for (const match of body.matchAll(/>([^<>]+)</g)) {
    const text = norm(decode(match[1]));
    if (!text || ALLOW.has(text) || !TURKISH.test(text) || en.has(text)) continue;
    const tag = body.slice(body.lastIndexOf('<', match.index), match.index + 1);
    if (/^<option value="(?:tr|en)"/.test(tag) || /data-ui-untranslated/.test(tag)) continue;
    missing.push(`${lineOf(match.index)}: "${text}"`);
  }
  for (const match of body.matchAll(/\s(title|aria-label|placeholder)="([^"]+)"/g)) {
    const text = norm(decode(match[2]));
    if (!text || ALLOW.has(text) || !TURKISH.test(text) || en.has(text)) continue;
    missing.push(`${lineOf(match.index)}: ${match[1]}="${text}"`);
  }
  return missing;
}

function signalMissing() {
  const missing = [];
  for (const match of renderer.matchAll(/setBrowserSignal\(\s*'((?:[^'\\]|\\.)+)'/g)) {
    const text = norm(match[1].replace(/\\'/g, "'"));
    if (TURKISH.test(text) && !en.has(text)) missing.push(text);
  }
  return [...new Set(missing)];
}

const htmlGaps = htmlMissing();
assert.deepEqual(htmlGaps, [], `index.html içinde EN karşılığı olmayan ${htmlGaps.length} metin:\n  ${htmlGaps.join('\n  ')}`);

// Sabit sinyal metinleri için kademeli sınır: sayı yalnız AZALABİLİR.
const SIGNAL_BASELINE = Number(fs.readFileSync(path.join(__dirname, 'fixtures', 'i18n-signal-baseline.txt'), 'utf8').trim());
const signalGaps = signalMissing();
assert.ok(signalGaps.length <= SIGNAL_BASELINE,
  `EN karşılığı olmayan setBrowserSignal metni ${signalGaps.length} (sınır ${SIGNAL_BASELINE}). Yeni eklenenler:\n  ${signalGaps.slice(-10).join('\n  ')}`);
if (signalGaps.length < SIGNAL_BASELINE) {
  console.log(`  not: sinyal eksikleri ${SIGNAL_BASELINE} → ${signalGaps.length}; tests/fixtures/i18n-signal-baseline.txt değerini düşürün.`);
}

console.log(`i18n-coverage: index.html tam; sabit sinyal eksikleri ${signalGaps.length}/${SIGNAL_BASELINE}`);
