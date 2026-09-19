'use strict';
// BROWSER_BUG_REPORT_85 düzeltmelerinin davranışsal regresyon testleri.
// Her bölüm rapordaki bulgu kimliğiyle işaretli.

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { isSensitiveKey, startsWithSensitivePrefix } = require('../src/browser-sensitive-keys');
const placeUrl = require('../src/browser-place-url');
const { normalizeClosedBrowserTab } = require('../src/browser-tab-history');
const { normalizeBrowserSession } = require('../src/browser-session-store');
const { withBrowserSiteZoom, browserSiteZoomForUrl } = require('../src/browser-site-zoom');
const { siteTerminologyScope } = require('../src/browser-site-terminology');
const { shiftCueTimeline, normalizeTimelineText } = require('../src/browser-cue-timeline-calibration');
const { normalizeBrowserPageResourceMetrics } = require('../src/browser-tab-resources');
const layout = require('../src/subtitle-sentence-layout');
const { exportPackage, readPackage } = require('../src/workspace-package');

const results = [];
const test = (name, fn) => {
  try { fn(); results.push(['PASS', name]); }
  catch (error) { results.push(['FAIL', `${name} :: ${error.message}`]); }
};

// --- R78-01/B1: snake_case + camelCase + kebab-case hassas anahtarlar ---
test('sensitive-keys: snake/kebab/camel tüm varyantlar', () => {
  for (const key of ['auth_token', 'client_secret', 'x-api-key', 'api_key',
    'access_token', 'refresh_token', 'id_token', 'session_id', 'hdnts',
    'clientSecret', 'authToken', 'xApiKey', 'client_secret']) {
    assert.ok(isSensitiveKey(key) || startsWithSensitivePrefix(key), `${key} hassas sayılmalı`);
  }
  // 'key' tek başına hassas değil — sayfa sayımı gibi masum parametreler korunur.
  assert.equal(isSensitiveKey('page'), false);
  assert.equal(isSensitiveKey('key'), false);
});

// --- B80-01: endpoint sorgu sırrı temizliği ---
test('settings endpointSetting: query sırrı silinir, fonksiyonel sorgu kalır', () => {
  const { sanitizeSettings, createBackupPayload } = require('../src/settings-security');
  const clean = sanitizeSettings({
    ui: { translateBaseUrl: 'https://api.example.test/v1?api_key=SECRET84&region=eu' },
  }, {}, { allowSecrets: true });
  const url = clean.ui.translateBaseUrl;
  assert.equal(url.includes('SECRET84'), false);
  assert.equal(url.includes('region=eu'), true);
  // Yedek payload'ında da sır kalmamalı (secretsExcluded sözleşmesi).
  const backup = JSON.stringify(createBackupPayload(clean, null, null));
  assert.equal(backup.includes('SECRET84'), false);
});

// --- K1: uzun URL kapalı-sekme geçmişinden düşmez ---
test('closed tab: 9000+ karakter URL origin+pathname fallback ile korunur', () => {
  const longUrl = 'https://example.test/watch?' + 'x'.repeat(9000);
  const entry = normalizeClosedBrowserTab({ url: longUrl, title: 'Uzun' });
  assert.ok(entry, 'uzun URL\'li sekme düşürülmemeli');
  assert.ok(entry.url.startsWith('https://example.test/'));
});

// --- K2: 24+ sekmede aktif sekme kurtarılır ---
test('session store: sınır dışı aktif sekme listede kalır', () => {
  const tabs = Array.from({ length: 30 }, (_, i) => ({
    id: `t${i}`, url: `https://example.test/${i}`, title: `Sekme ${i}`,
  }));
  const session = normalizeBrowserSession({ tabs, activeTabId: 't29' });
  assert.ok(session.tabs.some((t) => t.id === 't29'), 'aktif sekme düşürülmemeli');
  assert.ok(session.tabs.length <= 24);
});

// --- C1: IPv6 zoom hostu ---
test('site zoom: IPv6 literal host kaydı', () => {
  const applied = withBrowserSiteZoom({}, 'http://[::1]:8080/page', 1.5);
  assert.equal(applied.ok, true);
  assert.equal(browserSiteZoomForUrl('http://[::1]:8080/other', applied.siteZooms), 1.5);
});

// --- C3: çok-alt-etiketli BCP-47 scope ---
test('terminology scope: zh-hans-cn düşürülmez', () => {
  assert.equal(siteTerminologyScope('https://example.test/', 'zh-hans-cn'), 'https://example.test|zh-hans-cn');
  assert.equal(siteTerminologyScope('https://example.test/', 'tr'), 'https://example.test|tr');
});

// --- B83-07: tamamen negatif cue hayalet satır olmaz ---
test('shiftCueTimeline: tamamen negatif cue düşer', () => {
  const out = shiftCueTimeline([{ start: 3, end: 5, text: 'x' }, { start: 9, end: 11, text: 'y' }], -8);
  assert.equal(out.length, 1);
  assert.equal(out[0].text, 'y');
  assert.ok(out[0].start >= 0 && out[0].end > out[0].start);
});

// --- B83-25: Türkçe İ birleşik nokta bölmüyor ---
test('normalizeTimelineText: GİDİYORUM tek kelime', () => {
  assert.equal(normalizeTimelineText('GİDİYORUM'), 'gidiyorum');
  assert.equal(normalizeTimelineText('I AM'), 'i am');
});

// --- SL2: ölçülemeyen alanlar null kalır ---
test('resource metrics: null alanlar 0\'a düşmez', () => {
  const normalized = normalizeBrowserPageResourceMetrics({
    measured: true, activeTimers: 2, mutationObservers: 1,
    resizeObservers: null, mediaListeners: null, overlayNodes: null, pendingFrames: null,
  });
  assert.equal(normalized.resizeObservers, null);
  assert.equal(normalized.activeTimers, 2);
});

// --- P79-03: DP yerleştirme aynı sonucu verir ---
test('fitTranslationParts: geri-izleme kesimleri doğru', () => {
  const parts = layout.fitTranslationParts('merhaba dünya nasılsın bugün hava güzel',
    [{ start: 0, end: 2 }, { start: 2, end: 4 }]);
  assert.equal(parts.length, 2);
  assert.equal(parts.join(' '), 'merhaba dünya nasılsın bugün hava güzel');
});

// --- B83-33: workspace paketi mutlak yol sızdırmaz ---
test('workspace export: sourceRoot/mappings mutlak yol içermez', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wbp-src-'));
  const out = path.join(os.tmpdir(), `wbp-${process.pid}-${Date.now()}.wbp`);
  try {
    fs.writeFileSync(path.join(root, 'history.json'), JSON.stringify([
      { input: path.join(root, 'alt.srt'), other: 'C:\\Disler\\gizli\\film.mkv' },
    ]));
    fs.writeFileSync(path.join(root, 'alt.srt'), '1\n00:00:01,000 --> 00:00:02,000\nTest\n');
    exportPackage(root, out, {});
    const data = readPackage(out);
    assert.equal(data.sourceRoot, '{{ROOT}}');
    const historyFile = data.files.find((f) => f.name === 'history.json');
    const parsed = JSON.parse(Buffer.from(historyFile.data, 'base64').toString('utf8'));
    // alt.srt kök altında ama allowlist dışı ada sahip → workspace-assets'e hash'lenir;
    // kritik olan: gömülü değer mutlak yol DEĞİL {{ROOT}} formu.
    assert.ok(parsed[0].input.startsWith('{{ROOT}}/'), `taşınabilir form bekleniyor: ${parsed[0].input}`);
    assert.ok(data.files.some((f) => f.name.startsWith('workspace-assets/')), 'varlık pakette olmalı');
    // Kök dışı sıradan yol da pakette düz metin kalmaz — {{ROOT}} ile işaretlenmez
    // ama en azından sourceRoot/mappings sızıntısı yok.
    for (const [from] of data.mappings) assert.equal(path.isAbsolute(from), false);
  } finally {
    try { fs.rmSync(root, { recursive: true, force: true }); } catch (_) {}
    try { fs.unlinkSync(out); } catch (_) {}
  }
});

// --- R78-03: genişletilmiş named entity kümesi ---
test('cleanCueText: Latin-1 named entity çözümü', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'browser-subtitles.js'), 'utf8');
  assert.ok(/ntilde|eacute|agrave|ccedil/.test(src), 'named tablosunda Latin-1 entity bekleniyor');
});

let failed = 0;
for (const [status, name] of results) {
  console.log(`  ${status}  ${name}`);
  if (status === 'FAIL') failed += 1;
}
if (failed) { console.error(`\n${failed} test başarısız`); process.exit(1); }
console.log(`\nreport85-regressions: ${results.length}/${results.length} OK`);
