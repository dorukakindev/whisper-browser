const assert = require('assert');
const Omnibox = require('../src/browser-omnibox.js');
const Address = require('../src/browser-address-model.js');

const { foldSearchText, foldSearchQuery, buildAddressResults, inlineCompletion } = Address;
let checks = 0;
const ok = (cond, msg) => { checks++; assert.ok(cond, msg); };

// İki modülün katlaması birebir aynı kalmalı (renderer ikisinden birini alır).
for (const s of ['café', 'café', 'Işık', 'الأَخْبَار', 'a‪b', 'Ünïcodé', 'Łódź', 'Москва́', '', 'İstanbul IŞIK', 'ığdır', '🎬 Sinema', '한국어', '한']) {
  assert.equal(foldSearchText(s), Omnibox.foldSearchText(s), `katlama uyumsuz: ${JSON.stringify(s)}`);
  checks++;
}

// Vurgu/aksan katlaması — iki yönde eşleşme.
ok(foldSearchText('café') === 'cafe', 'NFC vurgulu → düz');
ok(foldSearchText('resume') === foldSearchText('resumé'), 'resumé↔resume');
ok(foldSearchText('naive') === foldSearchText('naïve'), 'naïve↔naive');
ok(foldSearchText('uber') === foldSearchText('über'), 'über↔uber');
ok(foldSearchText('isik') === foldSearchText('Işık'), 'Işık↔isik');
ok(foldSearchText('ISIK') === foldSearchText('ışık'), 'ışık↔ISIK');
ok(foldSearchText('agac') === foldSearchText('ağaç'), 'ağaç↔agac');
ok(foldSearchText('Ångström') === 'angstrom', 'Å→a');
ok(foldSearchText('Lodz') === 'lodz' && foldSearchText('Łódź') === 'lodz', 'Łódź→lodz');

// Metin tarafı: düşürülen karakterler işaretçiyle yer tutar — uzunluk HER ZAMAN
// korunur (vurgu ofsetleri özgün metinle hizalı kalır).
ok(foldSearchText('a‪b‬') === 'a￿b￿', 'bidi denetimleri işaretçi');
ok(foldSearchText('a​b') === 'a￿b', 'ZWSP işaretçi');
ok(foldSearchText('a‍b') === 'a￿b', 'ZWJ işaretçi');
ok(foldSearchText('a\x00b') === 'a\uFFFFb', 'NUL işaretçi');
ok(foldSearchText('a﻿b') === 'a￿b', 'BOM işaretçi');
ok(foldSearchText('café') === 'cafe￿', 'ayrışık işaret işaretçi');
for (const sample of ['İstanbul IŞIK', 'Interstellar', 'ığdır', 'café', 'a​b', '🎬 Sinema', '한국어']) {
  ok(foldSearchText(sample).length === sample.length, `uzunluk korunur: ${JSON.stringify(sample)}`);
}

// Korece heceler/jamo katlanmaz — başlangıç ünsüzüne indirgeme YAPILMAZ.
ok(foldSearchText('한국어') === '한국어', 'Korece hece korunur');
ok(foldSearchText('한') === '한', 'birleşik hece ilk ünsüze inmez');
ok(foldSearchText('한국어') !== 'ᄒᄀᄋ', 'hece→ünsüz katlaması yok');

// Sorgu tarafı: işaretçiler silinir — görünmez/ayrışık sorgu eşleşir.
ok(foldSearchQuery('ca​fe') === 'cafe', 'sorguda ZWSP silinir');
ok(foldSearchQuery('café') === 'cafe', 'ayrışık sorgu → düz');
ok(foldSearchQuery('‪test') === 'test', 'bidi işaretçi sorgudan düşer');
ok(foldSearchQuery('a\x00b') === 'ab', 'NUL sorguda silinir');

// Arapça hareke/şekiller katlanır; temel harfler korunur.
ok(foldSearchQuery('الأَخْبَار') === foldSearchQuery('الأخبار'), 'hareke sorguda katlanır');
ok(foldSearchText('الأخبار').includes(foldSearchQuery('أخبار')), 'Arapça alt dize');

// Türkçe gerileme kilitleri (audit testiyle aynı sözleşme).
ok(foldSearchText('İstanbul').includes(foldSearchQuery('istanbul')), 'İ↔i');
ok(foldSearchText('ISPANAK').includes(foldSearchQuery('ıspanak')), 'I↔ı');

// Sorgu→geçmiş eşleşmesi (buildAddressResults uçtan uca).
const places = {
  history: [
    { title: 'Café Society — Vikipedi', url: 'https://tr.wikipedia.org/wiki/Café', visitedAt: Date.now(), visits: 9 },
    { title: 'الأخبار العاجلة', url: 'https://example.com/news', visitedAt: Date.now(), visits: 5 },
    { title: 'Łódź Gezi Rehberi', url: 'https://example.com/lodz', visitedAt: Date.now(), visits: 3 },
    { title: '한국어 위키', url: 'https://example.com/korean', visitedAt: Date.now(), visits: 2 },
  ],
  bookmarks: [],
};
const found = (q) => buildAddressResults({ query: q, places }).filter((r) => r.section === 'history');
ok(found('cafe').length === 1, 'cafe → Café geçmişi');
ok(found('café').length === 1, 'café → Café geçmişi');
ok(found('café').length === 1, 'ayrışık sorgu → Café geçmişi');
ok(found('ca​fe').length === 1, 'görünmez karakterli sorgu → Café');
ok(found('أخبار').length === 1, 'harekesiz → harekeli başlık');
ok(found('lodz').length === 1, 'lodz → Łódź');
ok(found('한국').length === 1, 'Korece sorgu → Korece başlık');
ok(found('한가').length === 0, 'Korece ünsüz-katlama yanlış eşleşme yapmaz');
ok(found('yok').length === 0, 'eşleşmeyen sorgu boş döner');

// inlineCompletion: katlamalı needle ile tamamlama çalışır.
const items = [{ url: 'https://github.com/x', visits: 10, visitedAt: Date.now() }];
const completion = inlineCompletion('git', items);
ok(completion && completion.text === 'github.com', 'inlineCompletion bozulmadı');
const accentItems = [{ url: 'https://café.com/x', visits: 10, visitedAt: Date.now() }];
const accentCompletion = inlineCompletion('cafe', accentItems);
ok(accentCompletion && accentCompletion.text === 'cafe.com', 'aksanlı alan adı tamamlanır');

console.log(`PASS: omnibox-unicode (${checks} kontrol)`);
