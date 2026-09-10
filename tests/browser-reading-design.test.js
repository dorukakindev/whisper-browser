const assert = require('assert/strict');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');

function loadBetween(start, end, context) {
  const from = renderer.indexOf(start);
  const to = renderer.indexOf(end, from + start.length);
  assert(from >= 0 && to > from, `${start} kaynak bloğu bulunamadı`);
  vm.runInNewContext(renderer.slice(from, to), context);
  return context;
}

function fakeClassList() {
  const values = new Set();
  return {
    values,
    toggle(name, force) {
      const enabled = force === undefined ? !values.has(name) : !!force;
      if (enabled) values.add(name); else values.delete(name);
      return enabled;
    },
    contains(name) { return values.has(name); },
  };
}

function fakeButton() {
  const attrs = {};
  return {
    attrs,
    classList: fakeClassList(),
    dataset: {},
    disabled: false,
    hidden: false,
    tabIndex: 0,
    title: '',
    setAttribute(name, value) { attrs[name] = String(value); },
  };
}

// Sekme sabitleme, sekme satırını kalabalıklaştırmadan mevcut Diğer menüsünde
// aktif sekmenin gerçek durumunu yansıtmalı.
{
  const label = { textContent: '' };
  const button = fakeButton();
  button.querySelector = () => label;
  let tab = { pinned: false };
  const context = loadBetween('function updateBrowserPinMenu()', 'const MAX_BROWSER_TABS', {
    $: () => button,
    browserTabState: () => tab,
  });
  context.updateBrowserPinMenu();
  assert.equal(button.attrs['aria-checked'], 'false');
  assert.match(label.textContent, /sabitle$/);
  tab.pinned = true;
  context.updateBrowserPinMenu();
  assert.equal(button.attrs['aria-checked'], 'true');
  assert.match(label.textContent, /kaldır$/);
  tab = null;
  context.updateBrowserPinMenu();
  assert.equal(button.disabled, true);
  const tabsBlock = renderer.slice(renderer.indexOf('function renderBrowserTabs'), renderer.indexOf('function updateBrowserPinMenu'));
  assert(!tabsBlock.includes('browser-tab-pin'), 'sekme başına sabitleme düğmesi yeniden eklenmiş');
}

// Adres oku yalnız tarayıcıda, alan düzenlenirken ve yazılan değer açık URL'den
// farklıyken görünür olmalı.
{
  const wrap = { classList: fakeClassList() };
  const address = { value: 'https://example.test/', closest: () => wrap };
  const button = fakeButton();
  const player = { workspaceMode: 'browser', browserPageUrl: 'https://example.test/' };
  const document = { activeElement: address };
  const context = loadBetween('function syncBrowserAddressAction()', 'async function navigateBrowserFromAddress', {
    $: (id) => id === 'browserAddress' ? address : button,
    player,
    document,
  });
  context.syncBrowserAddressAction();
  assert.equal(button.hidden, true);
  address.value = 'https://example.test/next';
  context.syncBrowserAddressAction();
  assert.equal(button.hidden, false);
  assert.equal(button.tabIndex, 0);
  player.workspaceMode = 'player';
  context.syncBrowserAddressAction();
  assert.equal(button.hidden, true);
  assert(/event\.key === 'Escape'[\s\S]*browserPageUrl[\s\S]*syncBrowserAddressAction\(\)/.test(renderer),
    'Escape adres taslağını açık URL ile sıfırlamıyor');
}

// Altyazı düğmesinin etiketi gerçek iz sayısından, durumu da gerçek iş
// durumundan türetilmeli.
{
  const button = fakeButton();
  const label = { textContent: '' };
  const tab = { browserTranslationComplete: true };
  const player = {
    browserTracks: [], browserTranslatePreparing: false, browserTranslationTrackId: '',
    browserActiveTabId: 'tab-1', job: null,
  };
  const state = { running: false };
  const context = loadBetween('function updateBrowserSubtitleSummary()', 'function clearBrowserTracks', {
    $: (id) => id === 'browserSubtitleLabel' ? label : button,
    browserTabState: () => tab,
    player,
    state,
  });
  context.updateBrowserSubtitleSummary();
  assert.equal(label.textContent, 'Altyazı');
  assert.equal(button.dataset.state, 'idle');
  player.browserTracks.push({}, {});
  context.updateBrowserSubtitleSummary();
  assert.equal(label.textContent, 'Altyazı · 2');
  assert.equal(button.dataset.state, 'ready');
  player.browserTranslatePreparing = true;
  context.updateBrowserSubtitleSummary();
  assert.equal(button.dataset.state, 'busy');
  assert.equal(button.attrs['aria-busy'], 'true');
}

// Kaynak seçme satırı yalnız gerçekten kaynak yokken görünür; birincil eylem
// kaynak -> çeviri -> dışa aktarma akışını izler.
{
  const sourceRow = { classList: fakeClassList() };
  const player = { workspaceMode: 'player', localPath: '', originalUrl: '', mediaKey: 'video' };
  const sourceContext = loadBetween('function syncPlayerSourceQuick()', 'function setPlayerSource', {
    document: { querySelector: () => sourceRow },
    player,
  });
  sourceContext.syncPlayerSourceQuick();
  assert.equal(sourceRow.classList.contains('hidden'), false);
  player.localPath = 'C:/video.mp4';
  sourceContext.syncPlayerSourceQuick();
  assert.equal(sourceRow.classList.contains('hidden'), true);
  player.localPath = '';
  player.workspaceMode = 'browser';
  sourceContext.syncPlayerSourceQuick();
  assert.equal(sourceRow.classList.contains('hidden'), true);

  const row = { dataset: {} };
  const create = fakeButton();
  const translate = fakeButton();
  const exportButton = fakeButton();
  let roles = { source: [], translation: [] };
  const controls = { makeSubsBtn: create, makeTransBtn: translate, exportTranslationBtn: exportButton };
  const state = { running: false, queueRunning: false };
  player.workspaceMode = 'browser';
  const actionContext = loadBetween('function syncSubtitlePrimaryAction()', 'function updateMakeTransState', {
    document: { querySelector: () => row },
    $: (id) => controls[id],
    browserSubtitleRoleCues: () => roles,
    currentBrowserYoutubeUrl: () => 'https://youtube.test/watch?v=1',
    player,
    state,
  });
  actionContext.syncSubtitlePrimaryAction();
  assert.equal(row.dataset.actionState, 'create');
  assert.equal(create.dataset.primaryAction, 'true');
  roles = { source: [{}], translation: [] };
  actionContext.syncSubtitlePrimaryAction();
  assert.equal(row.dataset.actionState, 'translate');
  assert.equal(translate.dataset.primaryAction, 'true');
  roles = { source: [{}], translation: [{}] };
  actionContext.syncSubtitlePrimaryAction();
  assert.equal(row.dataset.actionState, 'ready');
  assert.equal(exportButton.dataset.primaryAction, 'true');
  state.running = true;
  actionContext.syncSubtitlePrimaryAction();
  assert.equal(row.dataset.actionState, 'busy');
  assert.equal(create.dataset.primaryAction, 'false');
  assert.equal(translate.dataset.primaryAction, 'false');
  assert.equal(exportButton.dataset.primaryAction, 'false');
}

// Okuma ve AI yüzeyleri aynı veri sözleşmesini kullanmalı; gönderilen bağlam,
// iş bitene kadar sayfa hareketlerinden etkilenmeden dondurulmalı.
{
  for (const mode of ['source', 'both', 'translation']) {
    assert(html.includes(`data-subtitle-display="${mode}"`), `${mode} okuma modu yok`);
  }
  assert(html.includes('id="selectedCueActions"') && html.includes('role="toolbar"'),
    'seçili replik eylem çubuğu yok');
  const cueMeta = renderer.slice(renderer.indexOf('function updateCueMeta'), renderer.indexOf('function savedWordStorageKey'));
  assert(/activeIdx >= 0[\s\S]*classList\.toggle\('is-empty', !selected\)/.test(cueMeta)
    && /button\.disabled = !selected/.test(cueMeta),
  'replik eylemleri seçim durumuna bağlı değil');

  const chatSend = renderer.slice(renderer.indexOf('async function aiChatSend'), renderer.indexOf('function aiChatCopyFromBubble'));
  assert.equal((chatSend.match(/aiChatContext\(\)/g) || []).length, 1,
    'AI gönderimi bağlamı birden çok kez üretiyor');
  assert(/const chatContext = aiChatContext\(\)/.test(chatSend)
    && /context: chatContext/.test(chatSend)
    && /kind: 'chat'[\s\S]*chatContext/.test(chatSend)
    && /renderAiChatContext\(chatContext, true\)/.test(chatSend),
  'önizleme ve modele giden veri aynı bağlam nesnesini paylaşmıyor');
  const labelSync = renderer.slice(renderer.indexOf('function aiChatCtxLabel'), renderer.indexOf('function aiTimeToSeconds'));
  assert(/job\?\.chatContext/.test(labelSync)
    && /job\.running \|\| player\.job\.awaitingExit/.test(labelSync)
    && /frozenJob\.chatContext/.test(labelSync),
  'çalışan AI işinin gönderilmiş bağlamı önizlemede dondurulmuyor');
}

// Dar ekran paneli, yalnız kullanıcının açık panel eylemiyle içerik alanını
// devralmalı; geri dönüş geniş ekran tercihine yazmamalı.
{
  const responsive = renderer.slice(renderer.indexOf('function responsivePanelTakeoverActive'), renderer.indexOf('function setViewMode'));
  assert(/!!player\.narrowPanelTakeover && \(drawerIsOpen\(\) \|\| sidebarIsVisible\(\)\)/.test(responsive),
    'dar panel devralması açık kullanıcı niyetine bağlı değil');
  const styles = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'styles.css'), 'utf8');
  const narrowStart = styles.indexOf('@media (max-width: 1020px)');
  const narrowCss = styles.slice(narrowStart, styles.indexOf('@media (max-width: 860px)', narrowStart));
  assert(/:not\(\.narrow-panel-takeover\) \.player-side[\s\S]*display:\s*none/.test(narrowCss),
    'devralma kapalıyken sıfır sütundan taşan dar panel tamamen gizlenmiyor');
  const backStart = renderer.indexOf("if ($('narrowPanelBack'))");
  const back = renderer.slice(backStart, renderer.indexOf("for (const id of ['subtitleFindText'", backStart));
  assert(/player\.narrowPanelTakeover = false/.test(back));
  assert(!/setPlayerSidebarCollapsed\(true\)/.test(back),
    'dar panel geri dönüşü kalıcı panel tercihini değiştiriyor');
}

console.log('browser-reading-design: sekme, adres, altyazı, okuma, AI bağlamı, eylem ve dar panel sözleşmeleri geçti');
