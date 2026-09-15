const assert = require('assert');
const fs = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const { buildBrowserReaderScript, normalizeReaderPreferences, scoreReaderCandidate, chooseReaderCandidate } = require('../src/browser-reader');
const { filterResearchAnnotations, normalizeResearchLinks, normalizeResearchTags,
  researchAnnotationsToMarkdown, scheduleReview } = require('../src/browser-research-notebook');
const { browserPermissionDecision, permissionOrigin, withBrowserPermission } = require('../src/browser-site-permissions');
const { normalizeBrowserSession } = require('../src/browser-session-store');
const { normalizeTabGroup, reorderIds, splitBrowserBounds } = require('../src/browser-tab-layout');
const { buildTranscriptEvidence } = require('../src/browser-transcript-search');
const { createBrowserDownloads } = require('../src/browser-downloads');

const prefs = normalizeReaderPreferences({ fontSize: 90, lineHeight: .5, width: 20 });
assert.deepEqual(prefs, { fontSize: 32, lineHeight: 1.35, width: 520 });
assert(scoreReaderCandidate({ textLength: 1200, paragraphs: 8, links: 2, noise: 0 }) > scoreReaderCandidate({ textLength: 1200, paragraphs: 8, links: 20, noise: 3 }));
const readerChoice = chooseReaderCandidate([
  { selector: 'article', native: true, textLength: 400, paragraphs: 2, links: 4, noise: 2 },
  { selector: 'main', textLength: 1400, paragraphs: 12, links: 3, noise: 0 },
]);
assert.equal(readerChoice.selected.selector, 'main');
assert.equal(chooseReaderCandidate([{ selector: 'article', native: true, textLength: 1000, paragraphs: 8 }]).selected.selector, 'article');
const readerScript = buildBrowserReaderScript('open', prefs);
assert.match(readerScript, /attachShadow\(\{ mode: 'closed' \}\)/);
assert.match(readerScript, /textContent/);
assert.doesNotMatch(readerScript, /innerHTML\s*=/);
assert.match(readerScript, /ignored\.has\(node\.tagName\)\) return null/,
  'script/style içeriği metin düğümü olarak okuma görünümüne sızmamalı');
assert.match(readerScript, /event\.preventDefault\(\); heading\.scrollIntoView/,
  'kapalı shadow root içindekiler bağlantısı dış sayfanın hash rotasını değiştirmemeli');
assert.match(readerScript, /readability-heuristic/);
assert.match(readerScript, /readerComparison/);

assert.deepEqual(normalizeTabGroup({ name: '  Ders   notları  ', color: 'cyan' }),
  { name: 'Ders notları', color: 'cyan' });
assert.deepEqual(reorderIds(['a', 'b', 'c'], ['c', 'a', 'b']), ['c', 'a', 'b']);
assert.equal(reorderIds(['a', 'b'], ['a', 'a']), null);
const halves = splitBrowserBounds({ x: 10, y: 20, width: 1000, height: 600 }, .4, 6);
assert.equal(halves.primary.width + halves.secondary.width + 6, 1000);
assert.equal(halves.secondary.x, 10 + halves.primary.width + 6);
const tinyHalves = splitBrowserBounds({ x: 0, y: 0, width: 3, height: 10 }, .5, 24);
assert.equal(tinyHalves.primary.width + tinyHalves.secondary.width + 1, 3);

const cues = Array.from({ length: 12 }, (_, index) => ({
  start: index * 10, end: index * 10 + 4,
  text: index === 2 ? 'Felsefi argüman burada açıklanıyor' : `Replik ${index}`,
  translation: index === 2 ? 'The philosophical argument is explained' : '',
}));
const watched = buildTranscriptEvidence(cues, 'felsefi argüman nedir?', { scope: 'watched', position: 35 });
assert(watched.evidence.some((row) => row.id === 'T3'));
assert(watched.evidence.every((row) => row.baslangic <= 35.75));
const full = buildTranscriptEvidence(cues, 'Tüm videoyu özetle', { scope: 'full', position: 5 });
assert.equal(full.coverage, 'distributed');
assert(full.evidence.some((row) => row.baslangic > 35.75));
const turkishStopwords = buildTranscriptEvidence(cues, 'aslında çok şey diye', { scope: 'full', position: 5 });
assert.deepEqual(turkishStopwords.queryTerms, ['sey']);

assert.deepEqual(normalizeResearchTags(' mitoloji,  Dil ,mitoloji '), ['mitoloji', 'Dil']);
assert.deepEqual(normalizeResearchLinks(['javascript:alert(1)', 'https://example.com/x']),
  [{ label: '', url: 'https://example.com/x' }]);
const now = Date.UTC(2026, 8, 10);
const firstReview = scheduleReview({ status: 'new' }, 'good', now);
assert.equal(firstReview.reviewCount, 1);
assert.equal(firstReview.dueAt, now + 86400000);
assert.equal(scheduleReview({ status: 'learning', reviewCount: 4, intervalDays: 10 }, 'good', now).status,
  'known');
const due = filterResearchAnnotations([
  { id: 'a', type: 'quote', status: 'new', source: 'Mitoloji', tags: ['ritüel'], dueAt: 0 },
  { id: 'b', type: 'word', status: 'known', source: 'Başka', tags: [], dueAt: now + 1000 },
], { query: 'mitoloji', dueOnly: true }, now);
assert.deepEqual(due.map((row) => row.id), ['a']);
assert.match(researchAnnotationsToMarkdown([{ mediaTitle: 'Ders', type: 'quote', status: 'new', source: 'Alıntı' }]), /## Ders/);
const escapedMarkdown = researchAnnotationsToMarkdown([{ mediaTitle: 'Ders', note: 'Giriş\n# Sahte başlık\n- Sahte madde\n1. Sahte sıra' }]);
assert.match(escapedMarkdown, /\\# Sahte başlık/);
assert.match(escapedMarkdown, /\\- Sahte madde/);
assert.match(escapedMarkdown, /1\\\. Sahte sıra/);

assert.equal(permissionOrigin('https://example.com/a?x=1'), 'https://example.com');
assert.equal(browserPermissionDecision({}, 'https://example.com', 'camera'), 'ask');
assert.equal(browserPermissionDecision({}, 'https://example.com', 'fullscreen'), 'ask');
const permission = withBrowserPermission({}, 'https://example.com/a', 'camera', 'block', now);
assert.equal(permission.sitePermissions['https://example.com'].permissions.camera, 'block');

const session = normalizeBrowserSession({
  version: 7,
  activeTabId: 'a', splitSecondaryTabId: 'b', splitRatio: .7,
  tabs: [
    { id: 'a', url: 'https://example.com/a', group: { name: 'İş', color: 'green' },
      readerPreferences: { fontSize: 25, lineHeight: 1.8, width: 900 } },
    { id: 'b', url: 'https://example.com/b' },
  ],
});
assert.equal(session.splitSecondaryTabId, 'b');
assert.equal(session.splitRatio, .7);
assert.deepEqual(session.tabs[0].readerPreferences, { fontSize: 25, lineHeight: 1.8, width: 900 });

let savedDownloads = null;
const downloads = createBrowserDownloads({
  loadRecords: () => [{ id: 'old', filename: 'video.mp4', state: 'completed', path: 'C:\\video.mp4' }],
  saveRecords: (rows) => { savedDownloads = rows; }, exists: () => true, reveal: () => {},
});
assert.equal(downloads.snapshot().items[0].id, 'old');
assert.deepEqual(downloads.action('old', 'open-player'), { ok: true, path: 'C:\\video.mp4' });
downloads.persist();
assert.equal(savedDownloads[0].id, 'old');

const renderer = fs.readFileSync(path.join(ROOT, 'src/renderer/renderer.js'), 'utf8');
const html = fs.readFileSync(path.join(ROOT, 'src/renderer/index.html'), 'utf8');
const main = fs.readFileSync(path.join(ROOT, 'src/main.js'), 'utf8');
assert.match(renderer, /showBrowserPermissionPrompt\(event\)/);
assert.match(renderer, /loadResearchLibrary\(\)/);
assert.match(renderer, /syncBrowserReaderControl/);
assert.match(html, /id="researchStatus"/);
assert.match(html, /id="browserSplitDivider"/);
assert.match(main, /readerPreferences: normalizeReaderPreferences/);
assert.match(main, /browserSplitSecondaryTabId === tab\.id/);

console.log('browser-nine-features.test.js: OK');
