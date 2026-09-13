const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  BROWSER_SESSION_PACKAGE_KIND,
  checksumPayload,
  createBrowserSessionPackage,
  inspectBrowserSessionPackage,
} = require('../src/browser-session-package');
const { BROWSER_SESSION_VERSION, normalizeBrowserSession } = require('../src/browser-session-store');

const cue = (index) => ({ id: String(index), start: index * 2, end: index * 2 + 1.5, text: `Türkçe özel karakter ${index}: ğüşiöç İ` });
const baseSession = {
  activeTabId: 'one',
  tabs: [{ id: 'one', url: 'https://example.test/watch/1?token=SECRET&utm_source=x&lang=tr',
    title: 'Bölüm', pinned: true, subtitleMode: 'translation',
    trackRefs: [{ id: 'web:one|source', assetId: 'a'.repeat(24) + ':' + 'b'.repeat(32), role: 'source' }],
    recoveryJobs: [{ id: 'subtitle-translation:one', kind: 'subtitle-translation', trackId: 'source', total: 10, completed: 4 }],
    subtitleSyncRecords: [{ mediaId: 'site:episode-one', sourceTrackId: 'source', sourceHash: 'hash-one',
      scale: 1.002, offsetSeconds: 1.25, updatedAt: 10 }],
    subtitleEdits: [{ mediaId: 'site:episode-one', variantId: 'translation-a', sourceHash: 'hash-one',
      cueId: 'cue-1', sourceCueHash: 'deadbeef', baseTranslation: 'Temel', hasOverride: true,
      userOverride: 'Kullanıcı düzeltmesi', revision: 2, userEditedAt: 11 }],
  }],
};

const bundle = createBrowserSessionPackage({
  session: baseSession,
  places: { history: [{ url: 'https://example.test/?oauth_token=SECRET&page=2', title: 'Site' }],
    siteZooms: { 'example.test': 1.25 } },
  variants: [{ assetId: 'old', mediaId: 'web:one', trackId: 'source', language: 'en',
    role: 'source', provider: 'https://provider.test/v1?api_key=SECRET&route=chat', cues: [cue(0), cue(1)] }],
  now: 0,
});

assert.equal(bundle.kind, BROWSER_SESSION_PACKAGE_KIND);
assert.match(bundle.checksum, /^sha256:[a-f0-9]{64}$/);
assert.equal(bundle.payload.session.version, BROWSER_SESSION_VERSION);
assert.equal(bundle.payload.session.splitSecondaryTabId, '', 'aktif olmayan sekme yoksa split ikincilisi temizlenir');
assert.equal(bundle.payload.session.tabs[0].pinned, true);
assert.equal(bundle.payload.session.tabs[0].recoveryJobs.length, 1);
assert.equal(bundle.payload.session.tabs[0].subtitleSyncRecords[0].scale, 1.002);
assert.equal(bundle.payload.session.tabs[0].subtitleEdits[0].userOverride, 'Kullanıcı düzeltmesi');
assert.equal(bundle.payload.variants[0].cues.length, 2);
assert.equal(bundle.payload.places.siteZooms['example.test'], 1.3);
assert.equal(bundle.payload.variants[0].provider, 'https://provider.test/v1?route=chat');
const serialized = JSON.stringify(bundle);
assert(!serialized.includes('SECRET'));
assert(!serialized.includes('oauth_token'));
assert(!serialized.includes('token='));

const inspected = inspectBrowserSessionPackage(JSON.parse(serialized));
assert.equal(inspected.session.tabs.length, 1);
assert.equal(inspected.session.tabs[0].subtitleSyncRecords[0].offsetSeconds, 1.25);
assert.equal(inspected.session.tabs[0].subtitleEdits[0].revision, 2);
assert.equal(inspected.variants.length, 1);
assert.equal(inspected.warnings.length, 0);

const tampered = JSON.parse(serialized);
tampered.payload.session.tabs[0].title = 'Değiştirildi';
assert.throws(() => inspectBrowserSessionPackage(tampered), /checksum/);

const partial = JSON.parse(serialized);
partial.payload.session.tabs.push({ id: 'broken', url: 'file:///C:/secret.txt' });
partial.payload.variants.push({ mediaId: '', cues: [] });
partial.checksum = `sha256:${checksumPayload(partial.payload)}`;
const recovered = inspectBrowserSessionPackage(partial);
assert.equal(recovered.session.tabs.length, 1);
assert.equal(recovered.variants.length, 1);
assert.equal(recovered.warnings.length, 2);

const legacyPayload = { browserSession: baseSession, browserPlaces: {}, tracks: [] };
const legacy = { kind: BROWSER_SESSION_PACKAGE_KIND, version: 0, payload: legacyPayload,
  checksum: `sha256:${checksumPayload(legacyPayload)}` };
assert.equal(inspectBrowserSessionPackage(legacy).session.tabs.length, 1);

const many = normalizeBrowserSession({ tabs: Array.from({ length: 100 }, (_, index) => ({
  id: `tab-${index}`, url: `https://example.test/watch/${index}`,
  recoveryJobs: Array.from({ length: 50 }, (_unused, job) => ({
    id: `job-${index}-${job}`, kind: 'subtitle-translation', trackId: `track-${job}`,
  })),
})) });
assert.equal(many.tabs.length, 24);
assert.equal(many.tabs[0].recoveryJobs.length, 50);

const distinctMedia = normalizeBrowserSession({ tabs: [
  { id: 'media-a', url: 'https://example.test/player', service: 'site', mediaId: 'site:episode-a' },
  { id: 'media-b', url: 'https://example.test/player', service: 'site', mediaId: 'site:episode-b' },
] });
assert.equal(distinctMedia.tabs[0].mediaId, 'site:episode-a');
assert.equal(distinctMedia.tabs[1].mediaId, 'site:episode-b');
assert.notEqual(distinctMedia.tabs[0].mediaId, distinctMedia.tabs[1].mediaId);

const beforeMemory = process.memoryUsage().heapUsed;
const started = performance.now();
const large = createBrowserSessionPackage({ session: many, variants: [{
  mediaId: 'youtube:large', trackId: 'large', role: 'source', cues: Array.from({ length: 10000 }, (_, index) => cue(index)),
}] });
const elapsed = performance.now() - started;
const memoryGrowth = process.memoryUsage().heapUsed - beforeMemory;
assert.equal(large.payload.variants[0].cues.length, 10000);
assert(elapsed < 2000, `10.000 cue paketleme çok yavaş: ${elapsed.toFixed(1)} ms`);
assert(memoryGrowth < 96 * 1024 * 1024, `Paketleme bellek artışı yüksek: ${memoryGrowth}`);

const root = path.join(__dirname, '..', 'src');
const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'renderer', 'index.html'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'renderer', 'renderer.js'), 'utf8');
const styles = fs.readFileSync(path.join(root, 'renderer', 'styles.css'), 'utf8');
assert.match(main, /browser:session:export/);
assert.match(main, /browser:session:import/);
assert.match(main, /browser:session:dismissRecovery/);
assert.match(main, /browser:network:setOnline/);
assert.match(preload, /exportBrowserSession/);
assert.match(preload, /importBrowserSession/);
assert.match(preload, /setBrowserNetworkOnline/);
assert.match(html, /id="browserSessionStatus"[^>]*role="status"[^>]*aria-live="polite"/);
assert.match(html, /id="browserRecoveryList"[^>]*role="region"[^>]*aria-live="polite"/);
assert.match(html, /id="browserDiagnosticsLastCapture"/);
assert.match(renderer, /Kurtarılabilir browser işi/);
assert.match(styles, /@container browser-workspace \(max-width: 760px\)[\s\S]*?\.browser-subtitle-settings-button \{ width: 38px; padding: 0; \}/);

console.log(`Browser session package: checksum, redaction, migration, partial recovery and scale passed (${elapsed.toFixed(1)} ms, ${Math.max(0, memoryGrowth / 1048576).toFixed(1)} MiB).`);

const localTab = { id: 'local', url: 'https://example.test/video', subtitleSelection: {
  primaryId: '', secondaryId: '', primaryFile: 'C:/private/movie.srt', secondaryFile: 'C:/private/movie.tr.vtt' } };
const localPackage = createBrowserSessionPackage({ session: { tabs: [localTab] }, places: { workspaces: [{name: 'test', tabs: [localTab]}] } });
assert(!JSON.stringify(localPackage).includes('C:/private'), 'Yerel dosya yolları taşınabilir pakete sızmamalı');
localPackage.payload.session.tabs[0].subtitleSelection.primaryFile = 'C:/injected.srt';
localPackage.checksum = `sha256:${checksumPayload(localPackage.payload)}`;
assert.equal(inspectBrowserSessionPackage(localPackage).session.tabs[0].subtitleSelection.primaryFile, undefined, 'İçe aktarılan paket dosya erişimi vermemeli');
