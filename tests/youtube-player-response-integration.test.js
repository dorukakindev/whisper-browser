const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
const preload = fs.readFileSync(path.join(root, 'src', 'preload.js'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
const registry = require('../src/browser-settings-registry');

assert.match(main, /urlPattern:\s*'\*:\/\/\*\.youtube\.com\/youtubei\/v1\/player\*'[\s\S]*?requestStage:\s*'Response'/,
  'Fetch deseni yalnız YouTube player yanıtına ve Response aşamasına bağlı kalmalı');
assert.match(main, /if \(browserPlayerResponseAdPruneEnabled\) \{[\s\S]*?Fetch\.enable/,
  'Fetch.enable yalnız deneysel ayar açıkken çalışmalı');
assert.ok(main.indexOf("method === 'Fetch.requestPaused'")
  < main.indexOf('tab.id !== browserActiveTabId', main.indexOf("wc.debugger.on('message'")),
  'Duraklatılmış istek aktif-sekme erken dönüşünden önce mutlaka devam ettirilmeli');
assert.match(main, /Fetch\.getResponseBody[\s\S]*?pruneYoutubePlayerResponseBody[\s\S]*?Fetch\.fulfillRequest/,
  'Yanıt gövdesi saf budayıcıdan geçip CDP ile tamamlanmalı');
assert.match(main, /catch \(_\) \{[\s\S]*?continueOriginal\(\)/,
  'Her budama hatası özgün isteği fail-open sürdürmeli');
assert.match(main, /Fetch\.disable/,
  'Ayar kapatıldığında Fetch alanı kapatılmalı');
assert.match(main, /Network\.disable/,
  'Altyazı yakalama kapatılırken gereksiz Network alanı kapatılmalı');
assert.match(main, /if \(!browserPlayerResponseAdPruneEnabled\) \{[\s\S]*?detachBrowserDebugger/,
  'Yakalama kapanırken deneysel koruma açıksa ortak debugger bağlı kalmalı');

assert.match(preload, /getBrowserPlayerAdPruneState/);
assert.match(preload, /setBrowserPlayerAdPruneEnabled/);
assert.match(html, /id="browserPlayerResponseAdPrune"[^>]*role="switch"/);
assert.doesNotMatch(html, /id="browserPlayerResponseAdPrune"[^>]*checked/,
  'Deneysel koruma varsayılan kapalı olmalı');
assert.match(renderer, /PERSIST_CHECKBOX_CONTROLS\s*=\s*\[[\s\S]*?'browserPlayerResponseAdPrune'/,
  'Deneysel ayar settings.json içine kalıcı yazılmalı');
assert.match(renderer, /function renderBrowserPlayerAdPruneState/);
assert.match(renderer, /event\.type === 'player-ad-prune-status'/);
assert.match(renderer, /setBrowserPlayerAdPruneEnabled\(event\.target\.checked\)/);

const pruneSetting = registry.list().find((entry) => entry.id === 'browserPlayerResponseAdPrune');
assert(pruneSetting, 'Deneysel koruma ayar kayıt defterinde bulunmalı');
assert.equal(pruneSetting.category, 'privacy');
assert.equal(pruneSetting.scope, 'global');
assert(registry.search('oynatıcı yanıt').some((entry) => entry.id === pruneSetting.id));

console.log('youtube-player-response-integration: dar CDP, fail-open ve ayar sözleşmeleri geçti.');
