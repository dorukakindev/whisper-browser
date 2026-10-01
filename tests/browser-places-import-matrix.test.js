// Yer-imi/geçmiş içe aktarma bozuk-veri matrisi (madde 7):
// settings:import yolundaki normalizeBrowserPlaces + cloneBrowserPlaces
// eksik alan, tip-bozuk değer, şema-dışı şema, kimlik bilgili/hassas
// parametreli URL ve sınır-aşımı girdileriyle beslenir — hiçbiri
// fırlatmamalı, çıktı invariant'ları (http/https URL, kelepçeler,
// dizi sınırları, prototip temizliği) her koşulda korunur.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const src = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8')
  .replace(/\r\n/g, '\n');
const slice = src.slice(
  src.indexOf('function normalizeBrowserPlaces('),
  src.indexOf('function browserCompatibilityModeForUrl('));
assert.ok(slice.includes('function cloneBrowserPlaces'), 'dilim iki işlevi de içermeli');

const { safePlaceUrl } = require('../src/browser-place-url');
const { normalizeSessionTab, MAX_SESSION_TABS } = require('../src/browser-session-store');
const { normalizeBrowserSiteProfiles, normalizeBrowserPathProfiles } = require('../src/browser-site-profiles');
const { normalizeBrowserSiteTerminology } = require('../src/browser-site-terminology');
const { normalizeBrowserCompatibilityHosts } = require('../src/browser-cloudflare-compat');
const { normalizeBrowserSitePermissions } = require('../src/browser-site-permissions');

const sandbox = {
  BROWSER_PLACE_LIMIT: 100,
  MAX_SESSION_TABS,
  safeBrowserPlaceUrl: safePlaceUrl,
  normalizeSessionTab,
  normalizeBrowserSiteProfiles,
  normalizeBrowserPathProfiles,
  normalizeBrowserSiteTerminology,
  normalizeBrowserCompatibilityHosts,
  normalizeBrowserSitePermissions,
};
vm.createContext(sandbox);
vm.runInContext(slice, sandbox);
const { normalizeBrowserPlaces, cloneBrowserPlaces } = sandbox;

let checks = 0;
const ok = (name, cond) => { checks += 1; assert.ok(cond, name); };

const SHAPE = ['history', 'bookmarks', 'workspaces', 'siteZooms', 'siteProfiles',
  'pathProfiles', 'siteTerminology', 'compatibilityHosts', 'sitePermissions'];
const checkShape = (out, name) => {
  ok(`${name}: 8 anahtarlı şema`, SHAPE.every((k) => k in out));
  ok(`${name}: history dizi`, Array.isArray(out.history));
  ok(`${name}: bookmarks dizi`, Array.isArray(out.bookmarks));
  ok(`${name}: workspaces dizi`, Array.isArray(out.workspaces));
  for (const item of [...out.history, ...out.bookmarks]) {
    ok(`${name}: url http(s)`, /^https?:\/\//i.test(item.url));
    ok(`${name}: url kimliksiz`, !/@/.test(new URL(item.url).host) === false
      || (new URL(item.url).username === '' && new URL(item.url).password === ''));
    ok(`${name}: url uzunluk`, item.url.length <= 8192);
    ok(`${name}: hassas sorgu yok`, ![...new URL(item.url).searchParams.keys()]
      .some((k) => /^(token|access[_-]?token|api[_-]?key|key|utm_.+|fbclid|gclid|ref|sid)$/i.test(k)));
    ok(`${name}: title sınır`, item.title.length <= 240);
    ok(`${name}: folder sınır`, item.folder.length <= 64);
    ok(`${name}: visits kelepçe`, item.visits >= 1 && item.visits <= 100000 && Number.isInteger(item.visits));
    ok(`${name}: visitedAt sayı`, Number.isFinite(item.visitedAt) && item.visitedAt > 0);
    ok(`${name}: media bool`, typeof item.media === 'boolean');
  }
};

// --- Kök-seviye tip bozukluğu ------------------------------------------
[null, undefined, 0, 'x', true, []].forEach((raw, i) => {
  const out = normalizeBrowserPlaces(raw);
  checkShape(out, `root#${i}`);
  ok(`root#${i}: boş geçmiş`, out.history.length === 0);
});

// --- Koleksiyon tip bozukluğu -------------------------------------------
const LIST_CASES = [
  { history: 'x' }, { history: {} }, { history: null },
  { bookmarks: 42 }, { bookmarks: [null, 5, 'str', {}, { url: null }, { url: 99 }] },
];
LIST_CASES.forEach((raw, i) => {
  const out = normalizeBrowserPlaces(raw);
  checkShape(out, `list#${i}`);
  ok(`list#${i}: geçersiz öğeler elenir`, out.history.concat(out.bookmarks).length === 0);
});

// --- URL şema/kimlik/hassas-parametre matrisi -----------------------------
const URL_CASES = [
  ['javascript:alert(1)', ''], ['data:text/html,<script>', ''], ['file:///etc/passwd', ''],
  ['ftp://a.com/f', ''], ['chrome://x', ''], ['vbscript:x', ''], ['mailto:a@b.c', ''],
  ['https://user:pass@host.tld/x', 'https://host.tld/x'],
  ['https://a.tld/?token=ABC&utm_source=x&ok=1', 'https://a.tld/?ok=1'],
  ['https://a.tld/p;jsessionid=ABC/x', 'https://a.tld/p/x'],
  ['https://a.tld/x?PHPSESSID=abc&k=1', 'https://a.tld/x?k=1'],
  ['https://a.tld/x?sessionid=abc', 'https://a.tld/x'],
  ['https://a.tld/#access_token=SECRET&id_token=X', 'https://a.tld/'],
  ['https://a.tld/#!/route/sub', 'https://a.tld/#!/route/sub'],
  ['https://a.tld/#t=1h2m3s', 'https://a.tld/#t=1h2m3s'],
  ['https://a.tld/' + 'x'.repeat(9000), ''],
  ['  https://b.tld/?q=1  ', 'https://b.tld/?q=1'],
];
URL_CASES.forEach(([raw, want], i) => {
  const out = normalizeBrowserPlaces({ bookmarks: [{ url: raw, title: 't' }] });
  if (want === '') ok(`url#${i} düşer: ${String(raw).slice(0, 40)}`, out.bookmarks.length === 0);
  else ok(`url#${i} → ${want.slice(0, 50)}`, out.bookmarks[0]?.url === want);
});

// --- Alan kelepçeleri ----------------------------------------------------
const clamp = normalizeBrowserPlaces({ history: [
  { url: 'https://a.tld', title: 'x'.repeat(500), folder: 'y'.repeat(200), visits: 0, media: 'yes' },
  { url: 'https://b.tld', visits: -5, visitedAt: 'bozuk' },
  { url: 'https://c.tld', visits: 1e9, visitedAt: NaN },
  { url: 'https://d.tld', visits: 3.9, visitedAt: Infinity },
  { url: 'https://e.tld', visits: '50', media: 0 },
  // Negatif damga bozuk değere eşdeğerdir: geçmişteki (sıralamayı bozan)
  // negatif visitedAt şimdiye kelepçelenir.
  { url: 'https://f.tld', visits: 2, visitedAt: -5 },
] });
checkShape(clamp, 'kelepçe');
ok('title 240', clamp.history[0].title.length === 240);
ok('folder 64', clamp.history[0].folder.length === 64);
ok('visits 0→1', clamp.history[0].visits === 1);
ok('media truthy→true', clamp.history[0].media === true);
ok('visits -5→1', clamp.history[1].visits === 1);
ok('visitedAt bozuk→şimdi', clamp.history[1].visitedAt > 1e12);
ok('visits 1e9→100000', clamp.history[2].visits === 100000);
ok('visits 3.9→3', clamp.history[3].visits === 3);
ok('visits "50"→50', clamp.history[4].visits === 50);
ok('media 0→false', clamp.history[4].media === false);
ok('visitedAt -5→şimdi', clamp.history[5].visitedAt > 1e12);

// --- Kapasite sınırı -------------------------------------------------------
const big = normalizeBrowserPlaces({ history: Array.from({ length: 150 }, (_, i) => ({ url: `https://h${i}.tld/` })) });
ok('history 100 ile kesilir', big.history.length === 100);
ok('kesim ilk 100 korur', big.history[0].url === 'https://h0.tld/' && big.history[99].url === 'https://h99.tld/');

// --- Prototip kirliliği denemesi -------------------------------------------
const polluted = JSON.parse('{"history":[{"url":"https://a.tld"}],"siteProfiles":{"__proto__":{"x":1}},"pathProfiles":{"__proto__":{"y":1}},"bookmarks":[{"url":"https://b.tld","__proto__":{"polluted":true}}]}');
const pout = normalizeBrowserPlaces(polluted);
checkShape(pout, 'proto');
ok('__proto__ kirletmez', ({}).polluted === undefined && ({}).x === undefined);
// vm realm'inin prototipi de kirlenmemeli — normalize çıktısı o realm'de üretilir.
ok('vm realm prototipi temiz', vm.runInContext('({}).polluted === undefined && ({}).x === undefined', sandbox));

// --- Workspace bozukluğu ---------------------------------------------------
const ws = normalizeBrowserPlaces({ workspaces: [
  { name: ' ', tabs: [] },                                                    // isimsiz+sekmesiz → düşer
  { name: 'W', tabs: 'x' },                                                    // bozuk tabs → düşer
  { name: 'W2', tabs: [{ id: 'a', url: 'https://a.tld' }, { id: 'b', url: 'https://b.tld' }],
    activeTabId: 'yok', splitSecondaryTabId: 'yok', splitRatio: 5 },           // kelepçe+fallback
  { name: 'W3', tabs: [{ id: 'a', url: 'https://a.tld' }],
    activeTabId: 'a', splitSecondaryTabId: 'a', splitRatio: -1 },              // split==active → ''
] });
ok('workspace isimsiz düşer', ws.workspaces.length === 2);
ok('activeTabId fallback ilk sekme', ws.workspaces[0].activeTabId === 'a');
ok('splitSecondary aktifken silinir', ws.workspaces[0].splitSecondaryTabId === '');
ok('splitRatio 5→0.75', ws.workspaces[0].splitRatio === 0.75);
ok('splitRatio -1→0.25', ws.workspaces[1].splitRatio === 0.25);
const wsCap = normalizeBrowserPlaces({ workspaces: Array.from({ length: 30 },
  (_, i) => ({ name: `w${i}`, tabs: [{ id: 'a', url: 'https://a.tld' }] })) });
ok('workspaces 20 ile kesilir', wsCap.workspaces.length === 20);

// --- Alt normalizasyonlar tip-bozuk girdi ---------------------------------
const sub = normalizeBrowserPlaces({
  siteProfiles: 'x', pathProfiles: [1], siteTerminology: 42,
  compatibilityHosts: { evil: 1 }, sitePermissions: 'boom', siteZooms: { a: 1 },
});
checkShape(sub, 'alt');
ok('siteZooms her zaman sıfırlanır', Object.keys(sub.siteZooms).length === 0);

// --- cloneBrowserPlaces derin kopya ----------------------------------------
const norm = normalizeBrowserPlaces({
  history: [{ url: 'https://a.tld', title: 't' }],
  bookmarks: [{ url: 'https://b.tld' }],
  workspaces: [{ name: 'W', tabs: [{ id: 'a', url: 'https://a.tld', trackRefs: [{ id: 'r' }] }] }],
});
const clone = cloneBrowserPlaces(norm);
clone.history[0].url = 'https://degisti.tld';
clone.workspaces[0].tabs[0].trackRefs[0].id = 'degisti';
ok('kopya history bağımsız', norm.history[0].url === 'https://a.tld/');
ok('kopya trackRefs bağımsız', norm.workspaces[0].tabs[0].trackRefs[0].id === 'r');
const cloneBad = cloneBrowserPlaces(JSON.parse('{"history":[{"__proto__":{"z":1}}],"sitePermissions":{"__proto__":{"permissions":{"k":1}}}}'));
ok('clone proto kirletmez', ({}).z === undefined && ({}).k === undefined);

// --- Tohumlu fuzz: hiçbir girdi fırlatmamalı --------------------------------
function mulberry32(seed) {
  return function () {
    seed |= 0; seed = (seed + 0x6D2B79F5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
const rnd = mulberry32(20260930);
const JUNK = [null, undefined, 0, -1, 1e18, NaN, Infinity, '', 'x', 'javascript:x',
  'https://a.tld/?token=t&ok=1', {}, [], { url: 'https://f.tld' }, true, 'https://u:p@h.tld/'];
const junk = () => JUNK[Math.floor(rnd() * JUNK.length)];
for (let round = 0; round < 500; round += 1) {
  const raw = JSON.parse(JSON.stringify({
    history: Array.from({ length: Math.floor(rnd() * 8) },
      () => ({ url: junk(), title: junk(), folder: junk(), visits: junk(), visitedAt: junk(), media: junk() })),
    bookmarks: Array.from({ length: Math.floor(rnd() * 8) },
      () => ({ url: junk(), title: junk() })),
    workspaces: Array.from({ length: Math.floor(rnd() * 4) },
      () => ({ name: junk(), tabs: junk(), activeTabId: junk(), splitRatio: junk() })),
    siteProfiles: junk(), pathProfiles: junk(), siteTerminology: junk(),
    compatibilityHosts: junk(), sitePermissions: junk(),
  }));
  let out;
  try { out = normalizeBrowserPlaces(raw); }
  catch (e) { ok(`fuzz#${round} fırlatmaz`, false); throw e; }
  checkShape(out, `fuzz#${round}`);
}
console.log(`Yer-imi içe aktarma bozuk-veri matrisi geçti (${checks} kontrol).`);
