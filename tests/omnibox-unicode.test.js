const assert = require('assert');
const Omnibox = require('../src/browser-omnibox.js');
const Address = require('../src/browser-address-model.js');

const { foldSearchText, foldSearchIndex, foldSearchQuery, buildAddressResults, inlineCompletion } = Address;
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
ok(accentCompletion && accentCompletion.text === 'café.com', 'aksanlı alan adı tamamlanır (adayın kendi yazımı)');
ok(accentCompletion.prefix === 'café', 'aksanlı tamamlama prefix i adayın özgün başı');

// foldSearchIndex: yoğun form + özgün-konum haritası.
{
  const fi = foldSearchIndex('ca\u200Bfe');
  ok(fi.dense === 'cafe', 'görünmez karakter yoğun formdan düşer');
  ok(fi.map.length === 4 && fi.map[2][0] === 3, 'yoğun konum → özgün konum haritası');
}
{
  const fi = foldSearchIndex('\u1112\u1161\u11AB\u1100\u116E\u11A8');  // ayrışık jamo: 한국
  ok(fi.dense === '한국', 'jamo dizisi heceye katlanır');
  ok(fi.map.length === 2 && fi.map[0][1] === 3, 'hece aralığı özgün jamo çalışısını kapsar');
}

// Devin Review düzeltmeleri:
// 1) Metindeki görünmez karakterler eşleşmeyi BÖLMEZ (eskiden işaretçi sözü
//    kesiyordu: 'ca\u200Bfe' içinde 'cafe' bulunamıyordu).
const invisPlaces = { history: [
  { title: 'ca\u200Bfe note', url: 'https://ex-1.test/x', visitedAt: Date.now(), visits: 5 },
  { title: 'sinema \uD83C\uDFAC gecesi', url: 'https://ex-2.test/y', visitedAt: Date.now(), visits: 5 },
], bookmarks: [] };
const fInvis = (q) => buildAddressResults({ query: q, places: invisPlaces }).filter((r) => r.section === 'history');
ok(fInvis('cafe').length === 1, 'görünmez-karakterli başlık düz sorguyla bulunur');
// 2) Emoji sorgusu boşa düşüp her şeyi döndürmez — vekil ÇİFTİ aranabilir kalır.
ok(foldSearchQuery('\uD83C\uDFAC') === '\uD83C\uDFAC', 'vekil çifti sorguda korunur');
ok(fInvis('\uD83C\uDFAC').length === 1, 'emoji sorgusu emoji başlığı bulur');
ok(fInvis('\u200B\u200B').length === 0, 'yalnız-işaretçi sorgu hiçbir kayıtla eşleşmez');
// 3) Ayrışık Korece jamo ⇄ birleşik hece iki yönde eşleşir.
const jamoPlaces = { history: [
  { title: '\u1112\u1161\u11AB\u1100\u116E\u11A8 위키', url: 'https://ex-3.test/k', visitedAt: Date.now(), visits: 5 },
], bookmarks: [] };
const fJamo = (q) => buildAddressResults({ query: q, places: jamoPlaces }).filter((r) => r.section === 'history');
ok(fJamo('한국').length === 1, 'birleşik sorgu → ayrışık başlık');
const hangulPlaces = { history: [
  { title: '한국 위키', url: 'https://ex-4.test/k', visitedAt: Date.now(), visits: 5 },
], bookmarks: [] };
ok(buildAddressResults({ query: '\u1112\u1161\u11AB', places: hangulPlaces })
    .filter((r) => r.section === 'history').length === 1, 'ayrışık sorgu → birleşik başlık');
// 4) Tamamlama: görünmez karakterli sorguda adayın KENDİ yazımı önerilir —
//    sorgudaki işaretçi üretilen metne sızmaz.
const invisItems = [{ url: 'https://cafe.com/x', visits: 10, visitedAt: Date.now() }];
const invisCompletion = inlineCompletion('ca\u200B', invisItems);
ok(invisCompletion && invisCompletion.text === 'cafe.com' && invisCompletion.prefix === 'ca',
  'görünmez sorguda temiz aday tamamlanır');
// Vekil çifti olmayan yalın yarılar işaretçiye düşmeye devam eder.
ok(foldSearchText('a\uD83Dz') === 'a\uFFFFz', 'yalın vekil yarı işaretçi');
ok(foldSearchText('\uD83C\uDFAC') === '\uD83C\uDFAC', 'vekil çifti metinde korunur');
// 5) map↔dense hizası: vekil çifti dense'de 2 UTF-16 birimi kaplar; map de
//    iki kayıt taşımalı — aksi halde vurgu ofsetleri emoji sonrasında kayar
//    (Devin Review: appendHighlighted map sınırını aşıyordu).
{
  const fi = foldSearchIndex('a\uD83C\uDFACz');
  ok(fi.map.length === fi.dense.length, 'map dense ile aynı uzunlukta (vekil çift)');
  const at = fi.dense.indexOf('\uD83C\uDFAC');
  ok(fi.map[at][0] === 1 && fi.map[at][1] === 2, 'emoji başlangıç aralığı');
  ok(fi.map[at + 1][0] === 1 && fi.map[at + 1][1] === 2, 'emoji ikinci yarı aynı aralığa');
  ok(fi.map[at + 2][0] === 3, 'emoji sonrası karakter ofseti kaymadı');
  // appendHighlighted sözleşmesi: at+q.length-1 her zaman geçerli map kaydı.
  const fi2 = foldSearchIndex('x\uD83C\uDFACy\uD83C\uDFACz');
  const q = foldSearchQuery('\uD83C\uDFACy');
  const pos = fi2.dense.indexOf(q);
  ok(pos >= 0 && fi2.map[pos + q.length - 1] !== undefined, 'emoji + ASCII kuyruk eşleşmesi map sınırında');
}

console.log(`PASS: omnibox-unicode (${checks} kontrol)`);
