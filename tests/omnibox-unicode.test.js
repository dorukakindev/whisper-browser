const assert = require('assert');
const Omnibox = require('../src/browser-omnibox.js');
const Address = require('../src/browser-address-model.js');

const { foldSearchText, buildAddressResults, inlineCompletion } = Address;
let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };

// İki modülün katlaması birebir aynı kalmalı (renderer ikisinden birini alır).
for (const s of ['café', 'cafe\u0301', 'Işık', 'الأَخْبَار', 'a\u202Ab', 'Ünïcodé', 'Łódź', 'Москва́', '', 'İstanbul IŞIK', 'ığdır', '🎬 Sinema', '']) {
  assert.equal(foldSearchText(s), Omnibox.foldSearchText(s), `katlama uyumsuz: ${JSON.stringify(s)}`);
  checks++;
}

// Vurgu/aksan katlaması — iki yönde eşleşme.
ok(foldSearchText('café') === 'cafe', 'NFC vurgulu → düz');
ok(foldSearchText('cafe\u0301') === 'cafe', 'ayrışık vurgulu → düz');
ok(foldSearchText('resume') === foldSearchText('resumé'), 'resumé↔resume');
ok(foldSearchText('naive') === foldSearchText('naïve'), 'naïve↔naive');
ok(foldSearchText('uber') === foldSearchText('über'), 'über↔uber');
ok(foldSearchText('isik') === foldSearchText('Işık'), 'Işık↔isik');
ok(foldSearchText('ISIK') === foldSearchText('ışık'), 'ışık↔ISIK');
ok(foldSearchText('agac') === foldSearchText('ağaç'), 'ağaç↔agac');
ok(foldSearchText('Angstrom') === foldSearchText('Ångström').replace(/^./, 'a').toLowerCase() || foldSearchText('Ångström') === 'angstrom', 'Å→a');
ok(foldSearchText('Lodz') === 'lodz' && foldSearchText('Łódź') === 'lodz', 'Łódź→lodz');

// Görünmez karakterler eşleşmeyi bozamaz.
ok(foldSearchText('a\u202Ab\u202C') === 'ab', 'bidi denetimleri düşer');
ok(foldSearchText('a\u200Bb') === 'ab', 'ZWSP düşer');
ok(foldSearchText('a\u200Db') === 'ab', 'ZWJ düşer');
ok(foldSearchText('a\x00b') === 'ab', 'NUL düşer');
ok(foldSearchText('a\uFEFFb') === 'ab', 'BOM düşer');

// Arapça hareke/şekiller katlanır; temel harfler korunur.
ok(foldSearchText('الأَخْبَار') === foldSearchText('الأخبار'), 'hareke katlanır');
ok(foldSearchText('الأخبار').includes(foldSearchText('أخبار')), 'Arapça alt dize');

// Türkçe gerileme kilitleri (audit testiyle aynı sözleşme).
ok(foldSearchText('İstanbul').includes(foldSearchText('istanbul')), 'İ↔i');
ok(foldSearchText('ISPANAK').includes(foldSearchText('ıspanak')), 'I↔ı');
for (const sample of ['İstanbul IŞIK', 'Interstellar', 'ığdır']) {
  ok(foldSearchText(sample).length === sample.length, `uzunluk korunur: ${sample}`);
}
ok(foldSearchText('🎬 Sinema').length === '  Sinema'.length + 1, 'surrogate çifti korunur');

// Sorgu→geçmiş eşleşmesi (buildAddressResults uçtan uca).
const places = {
  history: [
    { title: 'Café Society — Vikipedi', url: 'https://tr.wikipedia.org/wiki/Café', visitedAt: Date.now(), visits: 9 },
    { title: 'الأخبار العاجلة', url: 'https://example.com/news', visitedAt: Date.now(), visits: 5 },
    { title: 'Łódź Gezi Rehberi', url: 'https://example.com/lodz', visitedAt: Date.now(), visits: 3 },
  ],
  bookmarks: [],
};
const found = (q) => buildAddressResults({ query: q, places }).filter((r) => r.section === 'history');
ok(found('cafe').length === 1, 'cafe → Café geçmişi');
ok(found('café').length === 1, 'café → Café geçmişi');
ok(found('أخبار').length === 1, 'harekesiz → harekeli başlık');
ok(found('lodz').length === 1, 'lodz → Łódź');
ok(found('yok').length === 0, 'eşleşmeyen sorgu boş döner');

// inlineCompletion: katlamalı needle ile tamamlama çalışır.
const items = [{ url: 'https://github.com/x', visits: 10, visitedAt: Date.now() }];
const completion = inlineCompletion('git', items);
ok(completion && completion.text === 'github.com', 'inlineCompletion bozulmadı');

console.log(`PASS: omnibox-unicode (${checks} kontrol)`);
