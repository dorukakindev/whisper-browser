const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { mergeBrowserChapters, normalizeChapter } = require('../src/browser-chapters');

const native = [
  { start: 0, title: 'Yerleşik giriş' },
  { start: 60, title: 'Yerleşik ikinci bölüm' },
];
const sponsor = [
  { start: 0.8, end: 30, title: 'Topluluk girişi', source: 'sponsorblock' },
  { start: 31, end: 59, title: 'Topluluk ara bölümü', source: 'sponsorblock' },
  { start: 60.9, end: 90, title: 'Topluluk ikinci bölüm', source: 'sponsorblock' },
];

const merged = mergeBrowserChapters(native, sponsor, 1.5);
assert.deepEqual(merged.map(({ start, title, source }) => ({ start, title, source })), [
  { start: 0, title: 'Yerleşik giriş', source: 'native' },
  { start: 31, title: 'Topluluk ara bölümü', source: 'sponsorblock' },
  { start: 60, title: 'Yerleşik ikinci bölüm', source: 'native' },
]);
assert.equal(normalizeChapter({ start: -1, title: 'Hatalı' }), null);
assert.equal(normalizeChapter({ start: 1, title: '' }), null);
const cleaned = normalizeChapter({ start_time: 2, end_time: 4, description: 'Başlık\u0000' }, 'sponsorblock');
assert.equal(cleaned.title, 'Başlık');
assert.equal(cleaned.source, 'sponsorblock');

const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
const renderStart = renderer.indexOf('function renderResolvedChapters()');
const renderEnd = renderer.indexOf('\nfunction buildBookmarkOptions', renderStart);
const renderBody = renderer.slice(renderStart, renderEnd);
assert.match(renderBody, /mergeBrowserChapters/,
  'yerleşik ve topluluk bölümleri ortak modele birleştirilmiyor');
assert.match(renderBody, /source === 'sponsorblock'[\s\S]*Topluluk/,
  'topluluk bölümü kullanıcıya kaynağıyla gösterilmiyor');

const handlerStart = renderer.lastIndexOf("if ($('playerChapters'))");
const handlerBody = renderer.slice(handlerStart, handlerStart + 1100);
assert.match(handlerBody, /workspaceMode === 'browser'[\s\S]*browserCommand\('seek'/,
  'tarayıcıdaki bölüm seçimi web videosuna seek göndermiyor');
assert.match(handlerBody, /browserCommand\('play'\)/,
  'tarayıcıdaki bölüm seçimi başarılı seek sonrasında oynatmayı başlatmıyor');

const sponsorRefreshStart = renderer.indexOf('async function refreshBrowserSponsorSegments()');
const sponsorRefreshBody = renderer.slice(sponsorRefreshStart, sponsorRefreshStart + 2200);
assert.match(sponsorRefreshBody,
  /browserSponsorMode\(\) === 'off'[\s\S]*browserSponsorChapters = \[\][\s\S]*renderResolvedChapters\(\)/,
  'SponsorBlock kapatıldığında eski topluluk bölümleri görünümden kaldırılmıyor');

const temporaryStart = renderer.indexOf("if ($('browserSponsorTemporary'))");
const temporaryBody = renderer.slice(temporaryStart, temporaryStart + 1500);
assert.match(temporaryBody,
  /browserSponsorTemporaryDisabled[\s\S]*browserSponsorFetchSeq \+= 1[\s\S]*browserSponsorSegments = \[\][\s\S]*browserSponsorChapters = \[\][\s\S]*renderResolvedChapters\(\)/,
  'geçici kapatma sürmekte olan isteği iptal etmiyor veya eski topluluk bölümlerini temizlemiyor');
assert.match(sponsorRefreshBody,
  /await window\.api\.getBrowserSponsorSegments[\s\S]*browserSponsorTemporaryDisabled[\s\S]*return/,
  'geç gelen SponsorBlock yanıtı geçici kapatmadan sonra yeniden uygulanabiliyor');

console.log('Tarayıcı chapter birleştirme ve UI: 13/13 OK');
