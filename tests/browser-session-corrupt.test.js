// Sekme/oturum persist şeması bozuk-veri matrisi (R291):
// browser-session-store'un normalize/migrate/readback yolları
// eksik alan, tip-bozuk değer, gelecek-sürüm anahtarı ve sınır-aşımı
// girdileriyle beslenir — hiçbiri fırlatmamalı, çıktı invariant'ları
// (dizi alanları, kelepçeler, kimlik tutarlılığı) her koşulda korunur.
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  BROWSER_SESSION_VERSION,
  MAX_SESSION_TABS,
  normalizeBrowserSession,
  normalizeSessionTab,
  migrateBrowserSession,
  readBrowserSessionWithStatus,
  writeBrowserSessionAtomic,
} = require('../src/browser-session-store');

let checks = 0;
const ok = (name, cond) => { checks += 1; assert.ok(cond, name); };

const VALID_TAB = {
  id: 'tab-1', url: 'https://example.com/page', title: 'Örnek',
  position: 12.5, rate: 1.25, pinned: true,
  group: { id: 'g1', label: 'Grup', color: 'blue' },
  trackRefs: [{ id: 't1' }], lifecycle: 'background',
};

const checkSessionInvariants = (session, name) => {
  ok(`${name}: session nesnesi`, session && typeof session === 'object');
  ok(`${name}: tabs dizi`, Array.isArray(session.tabs));
  ok(`${name}: tabs sınır`, session.tabs.length <= MAX_SESSION_TABS);
  ok(`${name}: splitRatio kelepçe`, session.splitRatio >= 0.25 && session.splitRatio <= 0.75);
  ok(`${name}: activeTabId üyeliği`, !session.activeTabId
    || session.tabs.some((t) => t.id === session.activeTabId));
  ok(`${name}: splitSecondaryTabId tutarlılığı`, !session.splitSecondaryTabId
    || (session.splitSecondaryTabId !== session.activeTabId
      && session.tabs.some((t) => t.id === session.splitSecondaryTabId)));
  for (const tab of session.tabs) {
    ok(`${name}: tab id dizgi`, typeof tab.id === 'string');
    ok(`${name}: tab url güvenli`, /^https?:/i.test(tab.url) || /^file:/i.test(tab.url));
    ok(`${name}: tab dizileri`, Array.isArray(tab.trackRefs)
      && Array.isArray(tab.recoveryJobs) && Array.isArray(tab.subtitleSyncRecords));
    ok(`${name}: rate kelepçe`, tab.rate >= 0.25 && tab.rate <= 4);
    ok(`${name}: volume kelepçe`, tab.volume >= 0 && tab.volume <= 1);
  }
};

// --- Kök-seviye tip bozukluğu ----------------------------------------
const ROOT_CASES = [null, undefined, 0, 'x', true, [], { tabs: 'x' },
  { tabs: {} }, { tabs: null }, { tabs: [null, 42, 'x', {}, []] },
  { tabs: [VALID_TAB], activeTabId: { evil: 1 }, splitRatio: 'NaN' },
  { tabs: [VALID_TAB], splitRatio: Infinity }, { tabs: [VALID_TAB], splitRatio: -5 },
  { version: 99, tabs: [VALID_TAB], futureKey: { deep: { nested: [1, 2] } } }];
ROOT_CASES.forEach((raw, i) => {
  const s = normalizeBrowserSession(raw);
  checkSessionInvariants(s, `root#${i}`);
});

// --- Sekme alanı bozukluğu --------------------------------------------
const TAB_CASES = [
  { url: 'javascript:alert(1)' }, { url: 'data:text/html,<script>' },
  { url: '   ' }, { url: 12345 }, { url: null }, { url: {} },
  { url: 'https://a.com', id: { x: 1 }, title: Buffer.alloc(5000, 'y').toString() },
  { url: 'https://a.com', position: NaN, duration: -Infinity, rate: 0 },
  { url: 'https://a.com', rate: 999, volume: 7, offset: 1e12 },
  { url: 'https://a.com', group: 'not-object', lifecycle: 'zombie' },
  { url: 'https://a.com', viewMode: 'evil', subtitleMode: 42 },
  { url: 'https://a.com', trackRefs: 'boom', recoveryJobs: 7,
    subtitleSyncRecords: null, subtitleEdits: 'x' },
  // Nesne literalinde __proto__ kendi veri özelliği değil prototip atamasıdır;
  // own-key __proto__ yalnız JSON.parse ile üretilir.
  JSON.parse('{"url":"https://a.com","__proto__":{"polluted":true},"constructor":"x"}'),
  { url: 'https://a.com', mangaPosition: 'corrupt' },
];
TAB_CASES.forEach((tab, i) => {
  const t = normalizeSessionTab(tab);
  if (t) {
    ok(`tab#${i}: normalize çıktısı diziler`, Array.isArray(t.trackRefs)
      && Array.isArray(t.recoveryJobs));
  }
  const s = normalizeBrowserSession({ tabs: [tab], activeTabId: 'x' });
  checkSessionInvariants(s, `tab#${i}`);
});
ok('proto kirliliği yok', ({}).polluted === undefined);

// --- Kimlik/sınır senaryoları ------------------------------------------
{
  const tabs = Array.from({ length: MAX_SESSION_TABS + 5 }, (_, i) => ({
    id: `t${i}`, url: `https://x${i}.com` }));
  const s = normalizeBrowserSession({ tabs, activeTabId: `t${MAX_SESSION_TABS + 4}` });
  checkSessionInvariants(s, 'overflow');
  ok('sınır-dışı aktif başa alındı', s.activeTabId === `t${MAX_SESSION_TABS + 4}`
    && s.tabs[0].id === `t${MAX_SESSION_TABS + 4}`);
  ok('kapasite kesimi', s.tabs.length === MAX_SESSION_TABS);
}
{
  const s = normalizeBrowserSession({
    tabs: [VALID_TAB, { ...VALID_TAB, id: 'tab-2', url: 'https://b.com' }],
    activeTabId: 'tab-1', splitSecondaryTabId: 'tab-1' });
  ok('aktif==secondary → secondary boş', s.splitSecondaryTabId === '');
}
{
  const s = normalizeBrowserSession({ version: 1,
    tabs: [{ url: 'https://old.com', position: 'bad' }] });
  checkSessionInvariants(s, 'v1-migrate');
  const m = migrateBrowserSession({ version: 1, tabs: [{ url: 'https://old.com' }] });
  ok('migrate v1→güncel alanlar', Array.isArray(m.tabs[0].recoveryJobs)
    && 'compatibilityMode' in m.tabs[0] && 'keepAwake' in m.tabs[0]);
}
{
  // Aynı id'li çift sekme + aktif ikincisi
  const s = normalizeBrowserSession({
    tabs: [{ ...VALID_TAB, id: 'dup', url: 'https://a.com' },
           { ...VALID_TAB, id: 'dup', url: 'https://b.com' }],
    activeTabId: 'dup', splitSecondaryTabId: 'dup' });
  checkSessionInvariants(s, 'dup-id');
  ok('dup secondary boş', s.splitSecondaryTabId === '');
  ok('dup-id ikinci sekme tekil kimlikle korunur',
    s.tabs.length === 2
    && s.tabs[0].id === 'dup' && s.tabs[0].url === 'https://a.com/'
    && s.tabs[1].id === 'dup-dup2' && s.tabs[1].url === 'https://b.com/');
}

// --- Disk okuma matrisi ------------------------------------------------
{
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-session-'));
  const target = path.join(dir, 'browser-session.json');
  try {
    // 1) Birincil bozuk + .bak sağlam → kurtarma
    const good = { version: BROWSER_SESSION_VERSION, tabs: [VALID_TAB],
      activeTabId: 'tab-1', splitRatio: 0.5 };
    fs.writeFileSync(target, '{corrupt', 'utf8');
    fs.writeFileSync(`${target}.bak`, JSON.stringify(good), 'utf8');
    const r1 = readBrowserSessionWithStatus(target);
    ok('bozuk primary + .bak kurtarma', r1.session.tabs.length === 1
      && r1.session.tabs[0].id === 'tab-1');
    // 2) tabs dizi değil → damaged
    fs.writeFileSync(target, JSON.stringify({ tabs: 'nope' }), 'utf8');
    fs.writeFileSync(`${target}.bak`, JSON.stringify({ tabs: 'alsono' }), 'utf8');
    const r2 = readBrowserSessionWithStatus(target);
    ok('tabs-tip-bozuk → damaged uyarısı', r2.warning.length > 0
      && r2.session.tabs.length === 0);
    // 3) Tüm sekmeler geçersiz → damaged
    fs.writeFileSync(target, JSON.stringify({ tabs: [{ url: 'javascript:x' }, {}] }), 'utf8');
    const r3 = readBrowserSessionWithStatus(target);
    ok('tümü-geçersiz → damaged', r3.session.tabs.length === 0);
    // 4) Kısmen geçersiz → droppedTabs uyarısı
    fs.writeFileSync(target, JSON.stringify({
      tabs: [VALID_TAB, { url: 'javascript:x' }] }), 'utf8');
    const r4 = readBrowserSessionWithStatus(target);
    ok('kısmi kayıp uyarısı', r4.droppedTabs === 1 && r4.session.tabs.length === 1);
    // 5) writeBrowserSessionAtomic → okuma roundtrip
    const back = writeBrowserSessionAtomic(target, good);
    ok('atomik yazım döndü', back && back.ok !== false);
    const r5 = readBrowserSessionWithStatus(target);
    ok('yaz→oku roundtrip', r5.session.tabs.length === 1
      && r5.session.tabs[0].url === VALID_TAB.url
      && r5.session.version === BROWSER_SESSION_VERSION);
    // 6) .bak aynası: yeni oturumu değil ÖNCEKİ geçerli birincili tutar
    // (adım-4 içeriği: 2 sekme — normalize okuma anında süzer)
    const bak = JSON.parse(fs.readFileSync(`${target}.bak`, 'utf8'));
    ok('.bak önceki-birincil aynası', Array.isArray(bak.tabs) && bak.tabs.length === 2);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

console.log(`browser-session-corrupt: ${checks} kontrol geçti`);
