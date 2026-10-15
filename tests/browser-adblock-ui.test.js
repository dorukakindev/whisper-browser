'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { JSDOM } = require('jsdom');
const { translate } = require('../src/renderer/ui-locale');
const root = path.resolve(__dirname, '..');
const source = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
function fn(name) {
  const start = source.search(new RegExp(`(?:async )?function ${name}\\(`));
  assert(start >= 0, name);
  return source.slice(start, source.indexOf('\n}', start) + 2);
}

async function run() {
  const dom = new JSDOM(html);
  const $ = id => dom.window.document.getElementById(id);
  const control = $('browserAdblockEnabled'), quick = $('browserAdblockQuick'), menu = $('browserAdblockMenuToggle');
  const group = menu.closest('.browser-more-sub');
  assert.equal(group.querySelector('summary .browser-menu-label').textContent.trim(), 'Sayfa');
  assert.equal(menu.dataset.browserProxy, 'browserAdblockQuick');
  assert.equal(menu.getAttribute('role'), 'menuitemcheckbox');
  const player = { browserActiveTabId: 'test', browserPageUrl: 'https://www.youtube.com/watch?v=fixture', workspaceMode: 'browser' };
  const tab = { generation: 1 }, calls = [];
  let siteOn = true, locale = 'tr', pending;
  const ctx = { $, player, PERSIST_VALUE_CONTROLS: [], PERSIST_CHECKBOX_CONTROLS: ['browserAdblockEnabled'],
    uiText: text => translate(text, locale), effectiveBrowserProfile: () => ({ origin: 'https://www.youtube.com', values: { adblockEnabled: siteOn } }),
    browserTabState: () => tab, Event: dom.window.Event, scheduleSave() {}, friendlySystemError: e => e,
    setBrowserSignal() {}, syncBrowserOcclusion() {}, renderBrowserSiteProfile() {},
    closeBrowserToolbarMenus() {}, browserProxyFallbacks: {},
    runBrowserChromeCommand: async command => { calls.push(command); }, window: { api: {
      setBrowserAdblockEnabled: async enabled => { calls.push(enabled); return { ok: true, requested: enabled, enabled, state: enabled ? 'enabled' : 'disabled', reloadRequired: true }; },
      updateBrowserSiteProfile: async request => { siteOn = request.value !== false; calls.push(request.value); return { ok: true, places: {} }; },
    } } };
  vm.createContext(ctx);
  for (const name of ['collectUiSettings', 'renderBrowserAdblockState', 'browserAdblockSiteState', 'syncBrowserAdblockQuick',
    'syncBrowserAdblockMenu', 'toggleBrowserAdblockForSite', 'setBrowserAdblockEnabled', 'browserProxyTargetState', 'runBrowserProxyAction']) {
    vm.runInContext(fn(name), ctx);
  }
  const render = result => ctx.renderBrowserAdblockState(result);
  control.checked = true;
  render({ requested: true, enabled: false, state: 'loading' });
  assert.equal(control.checked, true, 'loading must not overwrite saved intent');
  assert.equal(ctx.collectUiSettings().browserAdblockEnabled, true);
  assert.equal(menu.disabled, true);
  assert.equal($('browserAdblockMenuLabel').textContent, 'Reklam engelleyici: Hazırlanıyor…');
  render({ ok: false, requested: true, enabled: false, state: 'error', error: 'fixture unavailable' });
  assert.equal(control.checked, true, 'temporary error must not permanently disable protection');
  assert.match($('browserAdblockMenuLabel').textContent, /Hata/);
  assert.equal(menu.disabled, false, 'retry must remain available');
  render({ ok: true, requested: false, enabled: false, state: 'disabled' });
  assert.equal(control.checked, false, 'explicit off must stay off');
  assert.equal($('browserAdblockMenuLabel').textContent, 'Reklam engelleyici: Kapalı');
  control.addEventListener('change', () => { pending = ctx.setBrowserAdblockEnabled(control.checked); });
  quick.addEventListener('click', () => { pending = ctx.toggleBrowserAdblockForSite(); });
  menu.addEventListener('click', () => ctx.runBrowserProxyAction(menu, ctx.browserProxyTargetState(menu)));
  menu.click();
  await pending; await new Promise(setImmediate);
  assert(calls.includes(true), 'menu click must enable the actual API, not only change its label');
  assert.equal($('browserAdblockMenuLabel').textContent, 'Reklam engelleyici: Açık');
  assert.equal(menu.getAttribute('aria-checked'), 'true');
  menu.click(); await pending;
  assert.equal(siteOn, false, 'second click disables current site');
  assert.equal($('browserAdblockMenuLabel').textContent, 'Reklam engelleyici: Kapalı');
  menu.click(); await pending;
  assert.equal(siteOn, true);
  locale = 'en'; ctx.syncBrowserAdblockMenu();
  assert.equal($('browserAdblockMenuLabel').textContent, 'Ad blocker: On');
  render({ ok: false, requested: true, enabled: false, state: 'error' });
  menu.click(); await pending;
  assert.equal($('browserAdblockMenuLabel').textContent, 'Ad blocker: On', 'error click must retry global engine');
  const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
  assert(main.indexOf("app.setPath('userData', process.env.WHISPER_RESOURCE_SOAK_USER_DATA)") < main.indexOf('const browserAdblockInitiallyEnabled'),
    'test profile must be selected before launch preferences are read');
  dom.window.close();
  console.log('browser-adblock-ui: menu API toggles, locale, runtime vs saved intent and isolated startup passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
