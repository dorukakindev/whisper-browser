'use strict';

// YouTube TV modu (youtube.com/tv ayrı pencerede, resmi kodla giriş) ve
// SmartTube TV görünümü sözleşmeleri.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const tv = require('../src/youtube-tv-mode.js');

let passed = 0;
const test = (name, fn) => { fn(); passed += 1; console.log(`  PASS  ${name}`); };
const read = (rel) => fs.readFileSync(path.join(__dirname, '..', rel), 'utf8');
const main = read('src/main.js');
const tvBlock = main.slice(main.indexOf('// ======================= YouTube TV modu'), main.indexOf('// ======================= YouTube OAuth (SmartTube'));

test('gezinme yalnız YouTube ve Google hesap sayfalarında kalır', () => {
  for (const url of ['https://www.youtube.com/tv', 'https://youtube.com/tv#/watch?v=dQw4w9WgXcQ',
    'https://accounts.google.com/ServiceLogin', 'https://consent.youtube.com/m', 'about:blank']) {
    assert.equal(tv.isAllowedTvNavigation(url), true, url);
  }
  for (const url of ['http://www.youtube.com/tv', 'https://evil.example/youtube.com', 'https://youtube.com.evil.example/',
    'https://user:pw@www.youtube.com/tv', 'javascript:alert(1)', 'file:///c:/x', 'https://ads.doubleclick.net/x']) {
    assert.equal(tv.isAllowedTvNavigation(url), false, url);
  }
});

test('TV uygulaması adresi ve video kimliği', () => {
  assert.equal(tv.isTvAppUrl('https://www.youtube.com/tv#/browse'), true);
  assert.equal(tv.isTvAppUrl('https://www.youtube.com/'), false, 'masaüstüne yönlendirme = reddedildi');
  assert.equal(tv.videoIdFromTvUrl('https://www.youtube.com/tv#/watch?v=dQw4w9WgXcQ&resume'), 'dQw4w9WgXcQ');
  assert.equal(tv.videoIdFromTvUrl('https://www.youtube.com/tv#/watch/video/control?v=dQw4w9WgXcQ'), 'dQw4w9WgXcQ');
  assert.equal(tv.videoIdFromTvUrl('https://www.youtube.com/tv#/browse?c=FEtopics'), '');
  assert.equal(tv.videoIdFromTvUrl('https://www.youtube.com/tv#/watch?v=bad"id'), '');
  assert.equal(tv.videoIdFromTvUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'), '', 'yalnız TV uygulaması');
  assert.equal(tv.watchUrlFor('dQw4w9WgXcQ', 42.9), 'https://www.youtube.com/watch?v=dQw4w9WgXcQ&t=42s');
  assert.equal(tv.watchUrlFor('x'), '');
});

test('TV kimlikleri seçilebilir, bilinmeyen kimlik ilkine düşer', () => {
  assert.ok(tv.TV_USER_AGENTS.length >= 3);
  assert.equal(tv.tvUserAgent('tizen').id, 'tizen');
  assert.equal(tv.tvUserAgent('nope').id, tv.TV_USER_AGENTS[0].id);
  for (const agent of tv.TV_USER_AGENTS) assert.match(agent.value, /TV|Cobalt|Web0S/);
});

test('TV penceresi yalıtılmış: ayrı bölüm, sandbox, gezinme bekçisi, yalnız tam ekran izni', () => {
  assert.match(tvBlock, /session\.fromPartition\(youtubeTvMode\.TV_PARTITION\)/);
  assert.equal(tv.TV_PARTITION, 'persist:youtube-tv');
  assert.match(tvBlock, /sandbox: true, contextIsolation: true, nodeIntegration: false/);
  assert.doesNotMatch(tvBlock, /preload:/, 'TV sayfasına köprü verilmez');
  assert.match(tvBlock, /tvContents\.on\('will-navigate', guard\)/);
  assert.match(tvBlock, /tvContents\.on\('will-redirect', guard\)/);
  assert.match(tvBlock, /setWindowOpenHandler\([\s\S]*?return \{ action: 'deny' \}/);
  assert.match(tvBlock, /callback\(permission === 'fullscreen'\)/);
  assert.match(tvBlock, /will-download', \(event\) => event\.preventDefault\(\)/);
  for (const channel of ['youtube-tv:open', 'youtube-tv:close', 'youtube-tv:state', 'youtube-tv:fullscreen', 'youtube-tv:signout']) {
    assert.match(tvBlock, new RegExp(`ipcMain\\.handle\\('${channel}', (?:async )?\\(event[^)]*\\) => \\{\\s*if \\(!authorizedBrowserSender\\(event\\)\\)`), channel);
  }
  assert.match(main, /mainWindow\.on\('closed', \(\) => \{[\s\S]{0,200}closeYoutubeTvWindow\(\)/);
});

test('TV modu hiçbir OAuth istemci kimliği gömmez (BROWSER_BUG_REPORT_94 sınırı)', () => {
  assert.doesNotMatch(tvBlock, /client_?id|client_?secret|apps\.googleusercontent\.com|oauth2/i);
  assert.doesNotMatch(read('src/youtube-tv-mode.js'), /client_?id|client_?secret|apps\.googleusercontent\.com/i);
});

test('preload ve renderer bağlantıları', () => {
  const preload = read('src/preload.js');
  for (const name of ['youtubeTvOpen', 'youtubeTvClose', 'youtubeTvState', 'youtubeTvFullscreen', 'youtubeTvSignOut', 'onYoutubeTvEvent']) {
    assert.match(preload, new RegExp(`${name}:`), name);
  }
  const html = read('src/renderer/index.html');
  assert.ok(html.indexOf('src="smarttube-tv.js"') > html.indexOf('src="renderer.js"'), 'renderer.js sonrasında yüklenir');
  for (const id of ['stTvModeBtn', 'stTvLayoutToggle', 'stFullscreen', 'stTvBanner', 'stTvAgent', 'ytTvModeLogin', 'ytCodeExpiry']) {
    assert.match(html, new RegExp(`id="${id}"`), id);
  }
  const module = read('src/renderer/smarttube-tv.js');
  assert.match(module, /surface\(\)\?\.addEventListener\('keydown', onSurfaceKeydown, true\)/);
  assert.match(module, /store\.get\(LAYOUT_KEY, '1'\) === '1'/, 'TV görünümü varsayılan açık');
  assert.match(read('src/renderer/renderer.js'), /startYoutubeCodeCountdown\(Number\(res\.data\.expires_in\) \|\| 0, gen\)/);
});

test('TV görünümü paleti token olarak tanımlı ve temadan bağımsız koyu', () => {
  const css = read('src/renderer/styles.css');
  const root = css.slice(css.indexOf(':root {'), css.indexOf('}', css.indexOf(':root {')));
  for (const token of ['--st-tv-bg', '--st-tv-text', '--st-tv-muted', '--st-tv-focus']) assert.match(root, new RegExp(`${token}:`), token);
  assert.match(css, /\.smarttube-browser\.st-tv \{\s*color-scheme: dark;\s*--bg: var\(--st-tv-bg\);/);
  assert.match(css, /\.st-tv \.st-card:focus-visible,\s*\.st-tv \.st-card:focus-within \{[^}]*outline: 3px solid var\(--st-tv-focus\)/);
});

console.log(`youtube-tv-mode: ${passed} test geçti`);
