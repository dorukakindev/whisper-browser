const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '../src/renderer/index.html'), 'utf8');
const css = fs.readFileSync(path.join(__dirname, '../src/renderer/styles.css'), 'utf8');

const renderTabs = renderer.slice(renderer.indexOf('function renderBrowserTabs('),
  renderer.indexOf('const MAX_BROWSER_TABS', renderer.indexOf('function renderBrowserTabs(')));
assert.match(renderTabs, /for \(const tab of player\.browserTabs\)/,
  'Web sekmeleri gerçek sekme modelinden çizilmeli.');
assert.match(renderTabs, /if \(player\.browserSettingsOpen\)/,
  'Ayarlar yalnız açıkken özel sekme olarak çizilmeli.');
assert.match(renderTabs, /dataset\.browserSettingsTabActivate = 'true'/,
  'Özel Ayarlar girdisi tab şeridinde etkinleştirilebilir olmalı.');
assert.match(renderTabs, /dataset\.browserSettingsTabClose = 'true'/,
  'Özel Ayarlar girdisinin kendi kapatma eylemi olmalı.');

const availability = renderer.slice(renderer.indexOf('function updateBrowserNewTabAvailability('),
  renderer.indexOf('function updateBrowserTabPresentation('));
assert.match(availability, /player\.browserTabs\.length >= MAX_BROWSER_TABS/,
  'Sekme sınırı yalnız gerçek web sekmelerini saymalı.');
assert.doesNotMatch(availability, /browserSettingsOpen/,
  'Özel Ayarlar sekmesi sekme sınırı hesabına karışmamalı.');

const activate = renderer.slice(renderer.indexOf('async function activateBrowserTab('),
  renderer.indexOf('async function createBrowserTab('));
assert.match(activate, /player\.browserSurface === 'settings'\) showBrowserWebSurface\(\)/,
  'Web sekmesine geçmek Ayarlar yüzeyinden çıkmalı.');
const create = renderer.slice(renderer.indexOf('async function createBrowserTab('),
  renderer.indexOf('async function reopenClosedBrowserTab('));
assert.match(create, /player\.browserSurface === 'settings'\) showBrowserWebSurface\(\)/,
  'Yeni web sekmesi oluşturmak Ayarlar yüzeyinden çıkmalı.');
const navigate = renderer.slice(renderer.indexOf('async function navigateBrowserFromAddress('),
  renderer.indexOf("if ($('workspacePlayerMode'))"));
assert.match(navigate, /player\.browserSurface === 'settings'\) showBrowserWebSurface\(\)/,
  'Adres gezinmesi Ayarlar yüzeyinden çıkmalı.');

const closeSettings = renderer.slice(renderer.indexOf('async function closeBrowserSettings('),
  renderer.indexOf('function browserChromeCommandBlocked('));
assert.match(closeSettings, /browserTabState\(returnTabId\)/,
  'Ayarlar kapanırken gelinen web sekmesi hâlâ açıksa ona dönülmeli.');
assert.match(closeSettings, /returnFocus\?\.isConnected/,
  'Ayarlar kapanınca odağın açan denetime dönmesi korunmalı.');

assert(!html.includes('settingsTabBrowserView') && !html.includes('settingsPageBrowserView'),
  'Eski Görünüm ve manga çekmece rotası kaldırılmalı.');
assert(!renderer.includes("setSettingsPage('browser-view')")
  && !renderer.includes("player.settingsPage === 'browser-view'"),
  'Kaldırılan browser-view çekmece rotasına çalışma zamanı çağrısı kalmamalı.');
assert.match(renderer, /setBrowserSettingsToggleState\(true\)/,
  'Özel Ayarlar sekmesi açıldığında araç çubuğu durumu eşzamanlanmalı.');
assert.match(renderer, /setBrowserSettingsToggleState\(false\)/,
  'Web yüzeyine dönüldüğünde araç çubuğu durumu temizlenmeli.');
assert.match(renderer, /browserSettingsRegistry\(\)\?\.list\(\)\.find/,
  'Ayar navigasyonu registry kaydından hedef kontrolü çözmeli.');
assert.match(renderer, /\.\.\.browserSettingsPaletteCommands\(\)/,
  'Komut paleti ayar girdilerini registry üzerinden üretmeli.');

assert.match(html, /class="browser-profile-scope-control"[^>]*>\s*Ayar kapsamı/,
  'Profil kapsamı yerel tarayıcı select görünümüne düşmemeli.');
assert.match(css, /\.browser-settings-main\s*\{[\s\S]*?width:\s*min\(100%,\s*1040px\)/,
  'Ayar formu geniş ekranda okunamayacak kadar uzamamalı.');
assert.match(css, /\.browser-profile-field select[\s\S]*?appearance:\s*none[\s\S]*?background(?:-color)?:\s*var\(--surface-control\)/,
  'Üretilen profil selectleri koyu tema kontrol tokenını kullanmalı.');

console.log('browser-settings-tab: özel sekme ve tek-yol sözleşmesi geçti.');
