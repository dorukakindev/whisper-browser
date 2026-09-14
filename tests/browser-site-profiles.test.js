const assert = require('assert');
const {
  browserSiteOrigin,
  normalizeBrowserSiteProfiles,
  resolveEffectiveBrowserSettings,
  withBrowserSiteProfileField,
  withoutBrowserSiteProfile,
} = require('../src/browser-site-profiles');

let passed = 0;
function test(name, fn) {
  fn(); passed += 1; console.log(`  PASS  ${name}`);
}

test('origin scheme, host ve portu korur; path ve sorguyu atar', () => {
  assert.equal(browserSiteOrigin('https://Example.com:8443/a?token=x'), 'https://example.com:8443');
  assert.equal(browserSiteOrigin('https://example.com.attacker.test/'), 'https://example.com.attacker.test');
});

test('false ve sifir fallback sayılmaz', () => {
  const result = resolveEffectiveBrowserSettings({
    defaults: { pageAuto: true, subtitleMode: 'both', zoom: 1 },
    general: { pageAuto: false, subtitleMode: 'off', zoom: 0.5 },
    profile: { pageAuto: true },
    tab: { pageAuto: false },
  });
  assert.deepEqual(result.values, { subtitleMode: 'off', pageAuto: false, zoom: 0.5 });
  assert.equal(result.sources.pageAuto, 'tab');
});

test('site reklam koruması false değeri profilde açıkça korunur', () => {
  const result = withBrowserSiteProfileField({}, 'https://video.test/watch', 'adblockEnabled', false);
  assert.equal(result.ok, true);
  assert.equal(result.profile.adblockEnabled, false);
});

test('site medya tercihleri güvenli aralıkta kalır', () => {
  let profiles = withBrowserSiteProfileField({}, 'https://video.test/watch', 'playbackRate', 1.25).profiles;
  profiles = withBrowserSiteProfileField(profiles, 'https://video.test/watch', 'enforcePlaybackRate', true).profiles;
  profiles = withBrowserSiteProfileField(profiles, 'https://video.test/watch', 'preservesPitch', false).profiles;
  profiles = withBrowserSiteProfileField(profiles, 'https://video.test/watch', 'videoBrightness', 1.4).profiles;
  const profile = profiles['https://video.test'];
  assert.deepEqual(profile, { playbackRate: 1.25, enforcePlaybackRate: true,
    preservesPitch: false, videoBrightness: 1.4 });
  assert.equal(withBrowserSiteProfileField(profiles, 'https://video.test', 'playbackRate', 9).ok, false);
  assert.equal(withBrowserSiteProfileField(profiles, 'https://video.test', 'videoContrast', .2).ok, false);
});

test('sessizlik ve ses profili site ayarlarında doğrulanır', () => {
  let profiles = withBrowserSiteProfileField({}, 'https://video.test/watch', 'silenceSpeedEnabled', true).profiles;
  profiles = withBrowserSiteProfileField(profiles, 'https://video.test/watch', 'silenceSpeedRate', 3.5).profiles;
  profiles = withBrowserSiteProfileField(profiles, 'https://video.test/watch', 'silenceThresholdDb', -45).profiles;
  profiles = withBrowserSiteProfileField(profiles, 'https://video.test/watch', 'audioProfile', 'night').profiles;
  assert.deepEqual(profiles['https://video.test'], { silenceSpeedEnabled: true,
    silenceSpeedRate: 3.5, silenceThresholdDb: -45, audioProfile: 'night' });
  assert.equal(withBrowserSiteProfileField(profiles, 'https://video.test', 'silenceSpeedRate', 9).ok, false);
  assert.equal(withBrowserSiteProfileField(profiles, 'https://video.test', 'audioProfile', 'boost').ok, false);
});

test('site override genel değişiklikle ezilmez ve kaldırılınca güncel genel gelir', () => {
  let profiles = withBrowserSiteProfileField({}, 'https://example.test/watch', 'targetLanguage', 'tr').profiles;
  let result = resolveEffectiveBrowserSettings({ general: { targetLanguage: 'de' }, profile: profiles['https://example.test'] });
  assert.equal(result.values.targetLanguage, 'tr');
  profiles = withBrowserSiteProfileField(profiles, 'https://example.test/watch', 'targetLanguage', null).profiles;
  result = resolveEffectiveBrowserSettings({ general: { targetLanguage: 'de' }, profile: profiles['https://example.test'] });
  assert.equal(result.values.targetLanguage, 'de');
});

test('alt alan adı veya taklit domain profil devralmaz', () => {
  const profiles = normalizeBrowserSiteProfiles({ 'https://example.test': { subtitleMode: 'translation' } });
  assert.equal(profiles[browserSiteOrigin('https://sub.example.test')], undefined);
  assert.equal(profiles[browserSiteOrigin('https://example.test.attacker.test')], undefined);
});

test('eski hostname zoom kaydı tek HTTPS origin şemasına taşınır', () => {
  const profiles = normalizeBrowserSiteProfiles({}, { 'Example.test': 1.4 });
  assert.deepEqual(profiles['https://example.test'], { zoom: 1.4 });
});

test('bozuk alanlar atılır ve profil bütünü sıfırlanabilir', () => {
  const profiles = normalizeBrowserSiteProfiles({
    'https://example.test/a': { zoom: 99, pageAuto: false, secret: 'x' },
    'javascript:alert(1)': { pageAuto: true },
  });
  assert.deepEqual(profiles, { 'https://example.test': { pageAuto: false } });
  assert.deepEqual(withoutBrowserSiteProfile(profiles, 'https://example.test/x').profiles, {});
});

test('sıfır ve boş metin açık değerlerdir; çözülmüş iş ayarı sonradan değişmez', () => {
  const general = { overlayOpacity: 0.8, targetLanguage: 'tr' };
  const profile = { overlayOpacity: 0, targetLanguage: '' };
  const snapshot = resolveEffectiveBrowserSettings({ general, profile });
  profile.overlayOpacity = 1; general.targetLanguage = 'en';
  assert.equal(snapshot.values.overlayOpacity, 0);
  assert.equal(snapshot.values.targetLanguage, '');
});
test('profil sınırında yeni kayıt sessizce kaybolmaz ve eski kayıt güncellenebilir', () => {
  const profiles = Object.fromEntries(Array.from({ length: 200 }, (_, i) => [`https://s${i}.test`, { overlayBottom: 0 }]));
  assert.equal(withBrowserSiteProfileField(profiles, 'https://new.test', 'zoom', 1.2).ok, false);
  assert.equal(withBrowserSiteProfileField(profiles, 'https://s0.test', 'zoom', 1.2).profile.zoom, 1.2);
  assert.equal(normalizeBrowserSiteProfiles(profiles, { 's0.test': 1.4 })['https://s0.test'].zoom, 1.4);
});
test('zoom migration açık yeni profil değerini ezmez', () => {
  assert.equal(normalizeBrowserSiteProfiles({ 'https://s.test': { zoom: 1.7 } }, { 's.test': 1.2 })['https://s.test'].zoom, 1.7);
});
test('çok alt etiketli BCP 47 dili kabul eder; traversal ve uzun etiketi reddeder', () => {
  const accepted = withBrowserSiteProfileField({}, 'https://language.test', 'targetLanguage', 'zh-Hant-TW');
  assert.equal(accepted.ok, true);
  assert.equal(accepted.profile.targetLanguage, 'zh-hant-tw');
  assert.equal(withBrowserSiteProfileField({}, 'https://language.test', 'targetLanguage', 'en-../../secret').ok, false);
  assert.equal(withBrowserSiteProfileField({}, 'https://language.test', 'targetLanguage', 'tr-9x').ok, false);
  assert.equal(withBrowserSiteProfileField({}, 'https://language.test', 'targetLanguage', 'es-419').ok, true);
  assert.equal(withBrowserSiteProfileField({}, 'https://language.test', 'targetLanguage',
    'en-abcdefgh-abcdefgh-abcdefgh-extra').ok, false);
});
test('profil paketinde yalnız izinli ayarlar kalır ve import aynı değerleri korur', () => {
  const { createBrowserSessionPackage, inspectBrowserSessionPackage } = require('../src/browser-session-package');
  const bundle = createBrowserSessionPackage({ session: { tabs: [] }, places: { siteProfiles: {
    'https://site.test:8443/path?token=SECRET': { targetLanguage: 'tr', overlayBottom: 0, hideSiteCaptions: false, token: 'SECRET' },
  } } });
  assert.equal(JSON.stringify(bundle).includes('SECRET'), false);
  const restored = inspectBrowserSessionPackage(JSON.parse(JSON.stringify(bundle)));
  assert.deepEqual(restored.places.siteProfiles['https://site.test:8443'], { targetLanguage: 'tr', overlayBottom: 0, hideSiteCaptions: false });
});
console.log(`browser-site-profiles: ${passed} test`);
