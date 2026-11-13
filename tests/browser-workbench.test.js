'use strict';
// Browser çalışma tezgâhı sözleşmesi: araç çubuğu grupları, Altyazı merkezi, Asistan/Ayarlar
// kısayolları, Ayarlar sayfası araç grupları ve altyazı şeridi yükseklik sabitliği.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { JSDOM } = require('jsdom');

const root = path.join(__dirname, '..');
const read = (rel) => fs.readFileSync(path.join(root, rel), 'utf8');
const html = read('src/renderer/index.html');
const renderer = read('src/renderer/renderer.js');
const locale = read('src/renderer/ui-locale.js');
const doc = new JSDOM(html).window.document;
const byId = (id) => doc.getElementById(id);

// 1) Eski araç çubuğu kimlikleri korunur (işlev kaybı yok), hepsi gruplardan birinde durur.
const toolbarIds = ['browserDubGenerate', 'browserDubAdd', 'browserProfileChip', 'browserPanelMain', 'browserTranslateMenu',
  'browserPageTranslate', 'browserPageQuickMenu', 'browserMangaTranslate', 'browserReaderToggle', 'browserViewSettingsToggle',
  'browserDiagnosticsToolbar', 'browserDownloadsToggle', 'browserPlacesToggle', 'browserSignalToggle', 'browserChromeToggle',
  'browserStudyOpen', 'browserPodcastOpen', 'browserSidebarToggle', 'browserMoreMenu'];
for (const id of toolbarIds) {
  const el = byId(id);
  assert(el, `${id} araç çubuğundan kaybolmuş`);
  assert(el.closest('.browser-toolbar-actions > .tb-group'), `${id} etiketli bir araç grubunda değil`);
}
const groups = [...doc.querySelectorAll('.browser-toolbar-actions > .tb-group')];
assert.equal(groups.length, 5, 'beş araç grubu bekleniyor');
for (const group of groups) assert(group.getAttribute('aria-label'), 'araç grubu erişilebilir ad taşımıyor');

// 2) Altyazı merkezi: dublaj, Whisper ve ayarlar aynı menüde; vekiller var olan eylemlere bağlı.
const hub = byId('browserTranslateMenu');
for (const id of ['browserPanelQuickTracks', 'browserSubtitleSettingsMenu', 'browserWhisperSubtitlesMenu', 'browserWhisperTranslateMenu',
  'browserWhisperRangeSettings', 'browserVoiceReferenceOpen', 'browserHubStatus', 'browserHubStatusTitle', 'browserHubStatusText']) {
  assert(hub.querySelector('#' + id), `${id} Altyazı merkezinde yok`);
}
for (const target of ['browserDubGenerate', 'browserDubAdd']) {
  const proxy = hub.querySelector(`[data-browser-proxy="${target}"]`);
  assert(proxy && byId(target), `${target} menüde vekil olarak bulunmalı ve hedefi var olmalı`);
}
assert.deepEqual([...hub.querySelectorAll('.browser-hub-step')].map((el) => el.dataset.step), ['1', '2', '3'], 'adım sırası 1-2-3 değil');
for (const el of doc.querySelectorAll('[data-browser-proxy]')) {
  assert(byId(el.dataset.browserProxy), `vekil hedefi yok: ${el.dataset.browserProxy}`);
}

// 3) Asistan ve Ayarlar kısayolları görünür, mevcut yollara bağlı (ikinci servis yolu yok).
assert(byId('browserAssistantOpen')?.closest('.tb-end'), 'Asistan düğmesi yok');
assert.equal(byId('browserSettingsQuick')?.dataset.browserProxy, 'playerHeadSettings', 'Ayarlar kısayolu mevcut ayar girişine bağlı olmalı');
assert(byId('playerHeadSettings'), 'ayar girişi hedefi yok');
assert(/\$\('browserAssistantOpen'\)\?\.addEventListener\('click'[\s\S]{0,400}setSideTab\('ai'/.test(renderer), 'Asistan düğmesi mevcut Asistan sekmesine bağlı değil');

// 4) Merkez video yokken gizlenmez; durum nedenini ve sonraki adımı söyler. Kaynak adı çeviriciye girmez.
assert(/translateMenu\.classList\.remove\('hidden'\)/.test(renderer), 'Altyazı merkezi yine gizleniyor');
assert(byId('browserHubStatusTitle').hasAttribute('data-ui-untranslated') && byId('browserSettingsTargetName').hasAttribute('data-ui-untranslated'),
  'kaynak adı arayüz çeviricisine açık');

// 5) Ayarlar sayfası: kaynak bandı ve etiketli araç grupları; sekiz araç da korunur.
assert(byId('settingsPageBrowserSubtitles').querySelector('#browserSettingsTarget'), 'Ayarlar sayfasında "Uygulandığı kaynak" bandı yok');
const tools = byId('browserSignalTools');
assert.equal(tools.querySelectorAll('.browser-tool-group').length, 3);
for (const id of ['browserManualSubtitle', 'browserCopyAb', 'browserQueuePage', 'browserArchivePage', 'browserExportClip',
  'browserWhisperSubtitles', 'browserWhisperTranslate', 'browserLiveAsr']) {
  assert(tools.querySelector('#' + id), `${id} altyazı araçlarından kaybolmuş`);
}

// 6) Stil katmanı bağlı; EN karşılıkları var.
assert(/<link rel="stylesheet" href="browser-workbench\.css">/.test(html), 'browser-workbench.css bağlı değil');
for (const key of ['Asistan', 'Altyazı araçları', 'Oluştur ve çevir', 'Uygulandığı kaynak', 'Altyazı al', 'Sayfa araçları']) {
  assert(locale.includes(`"${key}"`) || locale.includes(`'${key}'`), `EN karşılığı yok: ${key}`);
}

// 7) Çift dilli/Podcast altyazı şeridi konuşma aralarında yükseklik değiştirmez.
const study = read('src/renderer/browser-study-view.css');
assert(/\.sh-browser-study \.sh-subs\{flex:none;height:108px;min-height:0;max-height:120px;/.test(study), 'yerel 108px altyazı şeridi sözleşmesi korunmadı');
assert(/\.sh-subs \{ grid-row:3;margin-inline:8px;height:(\d+)px;min-height:\1px;max-height:\1px; \}/.test(study), 'Podcast şeridi sabit yükseklikte değil');


// 8) ⋯ menüsü: dört grup hep açık, 29 komutun hepsi var, hızlı eylemler etiketli, arama/proxy kimlikleri korunur.
const more = byId('browserMoreMenu');
const subs = [...more.querySelectorAll('.browser-more-groups > .browser-more-sub')];
assert.deepEqual(subs.map((el) => el.querySelector('summary').textContent.trim()),
  ['Sayfa araçları', 'Video ve oynatma', 'Site ve yerler', 'Görünüm ve gelişmiş'], 'menü grupları beklenen sırada değil');
for (const sub of subs) assert(sub.hasAttribute('open'), 'grup varsayılan olarak açık değil');
const moreIds = ['browserUserScriptsOpen', 'browserMechanismsOpen', 'browserAdblockMenuToggle', 'browserExportPdf', 'browserCopyPageMarkdown',
  'browserShowQr', 'browserElementPick', 'browserElementClear', 'browserQuickYoutubeMenu', 'browserWatchInPlayer', 'browserPlayMpv',
  'browserPlayVlc', 'browserPinActiveTab', 'browserReadLater', 'browserCommandPaletteToggle'];
for (const id of moreIds) assert(more.querySelector('.browser-more-sub-body #' + id), `${id} ⋯ menüsünden kaybolmuş`);
for (const target of ['browserReaderToggle', 'pdfReaderOpen', 'browserProfileChip', 'browserDubGenerate', 'browserDubAdd', 'playerQuickDownload',
  'playerBookmark', 'browserDownloadsToggle', 'browserPlacesToggle', 'playerLayoutQuick', 'browserViewSettingsToggle', 'browserSignalToggle',
  'browserChromeToggle', 'browserDiagnosticsToolbar']) {
  assert(more.querySelector(`.browser-more-sub-body [data-browser-proxy="${target}"]`), `${target} vekili ⋯ menüsünden kaybolmuş`);
}
assert.equal(more.querySelectorAll('.browser-more-sub-body button').length, 29, '⋯ menüsünde 29 komut bekleniyor');
for (const el of more.querySelectorAll('.browser-more-quick > button')) {
  assert(el.querySelector('.browser-more-quick-label'), 'hızlı eylem görünür etiket taşımıyor');
}
assert(/summary'\)\.forEach\(\(summary\) => \{\s*summary\.addEventListener\('click', \(event\) => event\.preventDefault\(\)\)/.test(renderer),
  'grup başlıkları kapanabiliyor');

// 9) Sayfa çevirisi menüsü: durum üstte, hedef dil gelişmiş ayarların dışında, kimlikler korunur.
const pageMenu = byId('browserPageQuickMenu').querySelector('.browser-page-quick-popover');
assert(pageMenu.firstElementChild.classList.contains('browser-page-status'), 'durum satırı menünün başında değil');
assert(pageMenu.querySelector('.browser-page-status #browserPageQuickProgress'), 'ilerleme metni durum satırında değil');
assert(!byId('browserPageAdvanced').contains(byId('browserPageQuickTarget')), 'hedef dil yine gelişmiş ayarların içinde gizli');
for (const id of ['browserPageScope', 'browserPageBudget', 'browserPageQuickAuto', 'browserPageAutoContinue', 'browserPagePause', 'browserPagePreview', 'browserPagePreviewPanel']) {
  assert(byId(id), `${id} sayfa çevirisi menüsünden kaybolmuş`);
}
assert.equal(pageMenu.querySelectorAll('[data-page-view]').length, 3, 'sayfa görünümü seçenekleri eksik');


// 10) "İşler" göstergesi: Görev merkezi toplayıcısından beslenir; çalışma → tamamlandı → hata geçişleri doğru işlenir.
const vm = require('vm');
assert(byId('browserJobsChip')?.closest('.tb-end'), 'İşler göstergesi yok');
assert.equal(byId('browserJobsChip').dataset.browserProxy, 'playerTaskCenterToggle', 'İşler göstergesi mevcut Görev merkezini açmalı');
assert(/renderBrowserJobsDock\(rows\);\s*const list = listTarget/.test(renderer), 'gösterge Görev merkezi toplayıcısından beslenmiyor');
{
  const start = renderer.indexOf('// --- browser jobs dock');
  const end = renderer.indexOf('// --- end browser jobs dock');
  assert(start > 0 && end > start, 'iş göstergesi bölümü bulunamadı');
  const mkEl = () => ({ textContent: '', dataset: {}, style: {}, title: '', attrs: {}, offsetWidth: 1,
    classList: { set: new Set(['hidden']), toggle(n, on) { on ? this.set.add(n) : this.set.delete(n); }, add(n) { this.set.add(n); }, remove(n) { this.set.delete(n); }, contains(n) { return this.set.has(n); } },
    setAttribute(k, v) { this.attrs[k] = v; }, querySelector() { return this.ring; }, ring: { style: {} }, addEventListener() {} });
  const els = { browserJobsChip: mkEl(), browserJobsState: mkEl(), browserJobsLabel: mkEl(), browserJobsAnnounce: mkEl() };
  let now = 1000, timerId = 0, collectedRows = [], terminalRefresh = null;
  const timers = new Map(), player = { mediaKey: 'source:A', generation: 1 }, state = {};
  const sandbox = { $: (id) => els[id] || null, player, state, interfaceChoice: (tr) => tr,
    updatePlayerTaskCenter() { sandbox.render(collectedRows); },
    setTimeout: (fn) => { timers.set(++timerId, fn); return timerId; }, clearTimeout: id => timers.delete(id),
    PlayerTaskCenterModel: { progressOf: (row) => ({ percent: row.percent ?? null }) }, Date: { now: () => now } };
  vm.createContext(sandbox);
  vm.runInContext(renderer.slice(start, end) + '\nthis.render = renderBrowserJobsDock; this.dock = browserJobsDock;', sandbox);
  const snapshotStart = renderer.indexOf('function playerTaskSnapshot()');
  vm.runInContext(renderer.slice(snapshotStart, renderer.indexOf('\nfunction maybeShowBrowserRecovery', snapshotStart))
    + '\nthis.snapshot = playerTaskSnapshot;', sandbox);
  const settleStart = renderer.indexOf('function settlePlayerJobBar(');
  vm.runInContext(renderer.slice(settleStart, renderer.indexOf('\nfunction completedSubtitleOutputs', settleStart))
    + '\nthis.settle = settlePlayerJobBar;', sandbox);
  const chip = els.browserJobsChip;
  sandbox.render([]);
  assert.equal(chip.dataset.state, 'idle'); assert(chip.classList.contains('hidden'), 'boşta gösterge görünür');
  sandbox.render([{ id: 'a', label: 'Whisper altyazı', state: 'running', percent: 40 }]);
  assert.equal(chip.dataset.state, 'running'); assert(!chip.classList.contains('hidden'));
  assert.equal(els.browserJobsState.textContent, 'Altyazı oluşturuluyor · %40'); assert.equal(els.browserJobsLabel.textContent, 'Whisper altyazı'); assert.equal(chip.dataset.kind, 'subtitle');
  assert.equal(chip.dataset.indeterminate, 'false'); assert.equal(els.browserJobsChip.ring.style.strokeDashoffset, '60');
  sandbox.render([{ id: 'a', label: 'Whisper altyazı', state: 'running' }, { id: 'b', label: 'Dublaj', state: 'running', percent: 10 }]);
  assert.equal(els.browserJobsState.textContent, '2 iş sürüyor'); assert.equal(chip.dataset.indeterminate, 'true');
  sandbox.render([{ id: 'a', label: 'Whisper altyazı', state: 'done' }, { id: 'b', label: 'Dublaj', state: 'running', percent: 10 }]);
  assert.equal(chip.dataset.state, 'done', 'biten iş için tamamlandı durumu gösterilmedi');
  assert.equal(els.browserJobsState.textContent, 'Altyazı hazır'); assert.equal(chip.dataset.kind, 'subtitle');
  assert.equal(els.browserJobsLabel.textContent, 'Whisper altyazı'); assert(chip.classList.contains('jobs-celebrate'));
  assert(/Altyazı hazır: Whisper altyazı/.test(els.browserJobsAnnounce.textContent), 'tamamlanma ekran okuyucuya duyurulmadı');
  now += 7000;
  sandbox.render([{ id: 'b', label: 'Dublaj', state: 'running', percent: 10 }]);
  assert.equal(chip.dataset.state, 'running', 'tamamlanma bildirimi süre dolunca kaldırılmıyor');
  sandbox.render([{ id: 'b', label: 'Dublaj', state: 'failed', failed: 1 }]);
  assert.equal(chip.dataset.state, 'error', 'hata gösterilmedi');
  now += 60000;
  sandbox.render([{ id: 'b', label: 'Dublaj', state: 'failed', failed: 1 }]);
  assert.equal(chip.dataset.state, 'error', 'hata kullanıcı görmeden kayboldu');
  assert.equal(els.browserJobsState.textContent, 'Dublaj başarısız'); assert.equal(chip.dataset.kind, 'dub');
  sandbox.render([]);
  assert.equal(chip.dataset.state, 'idle', 'temizlenen hata göstergede kaldı');
  // Dublaj bitince "Dublaj hazır" ve dublaja özgü tür işareti gösterilir.
  sandbox.render([{ id: 'd', label: 'Ses üretimi', state: 'running' }]);
  assert.equal(chip.dataset.kind, 'dub'); assert.equal(els.browserJobsState.textContent, 'Dublaj üretiliyor');
  sandbox.render([{ id: 'd', label: 'Ses üretimi', state: 'done' }]);
  assert.equal(els.browserJobsState.textContent, 'Dublaj hazır'); assert.equal(chip.dataset.kind, 'dub');
  now += 7000;
  sandbox.render([]);
  // Hiç çalışırken görülmemiş (ör. zaten tamamlanmış) iş kutlama başlatmaz.
  sandbox.render([{ id: 'c', label: 'Eski iş', state: 'done' }]);
  assert.equal(chip.dataset.state, 'idle', 'çalışmamış iş için sahte tamamlanma gösterildi');

  // The real timeout must collect current jobs, not replay the completed job's
  // old array and hide a job started during the completion flash.
  sandbox.render([{ id: 'timer-a', label: 'Whisper', state: 'running' }]);
  sandbox.render([{ id: 'timer-a', label: 'Whisper', state: 'done' }]);
  terminalRefresh = timers.get(sandbox.dock.timer);
  collectedRows = [{ id: 'timer-b', label: 'Dublaj', state: 'running' }];
  sandbox.render(collectedRows); now += 7000; terminalRefresh();
  assert.equal(chip.dataset.state, 'running');
  assert.equal(els.browserJobsLabel.textContent, 'Dublaj');

  // Feed the actual local snapshot + canonical bar terminal helper. Removing a
  // job alone is never success; completion needs the same job/source receipt.
  const job = { kind: 'progressive', mediaKey: player.mediaKey, generation: player.generation, running: true };
  player.job = job; collectedRows = sandbox.snapshot(); sandbox.render(collectedRows);
  job.running = false; player.job = null; collectedRows = sandbox.snapshot();
  sandbox.settle(job, 'done');
  assert.equal(chip.dataset.state, 'done'); assert.equal(els.browserJobsState.textContent, 'Altyazı hazır');
  now += 7000; sandbox.render(collectedRows);
  const cancelled = { kind: 'progressive', mediaKey: player.mediaKey, generation: player.generation, running: true };
  player.job = cancelled; collectedRows = sandbox.snapshot(); sandbox.render(collectedRows);
  cancelled.cancelled = true; cancelled.running = false; player.job = null; collectedRows = sandbox.snapshot();
  sandbox.settle(cancelled, 'cancelled');
  assert.equal(chip.dataset.state, 'idle', 'iptal edilen Whisper tamamlandı diye gösterildi');
  const old = { kind: 'progressive', mediaKey: player.mediaKey, generation: player.generation, running: true };
  player.job = old; collectedRows = sandbox.snapshot(); sandbox.render(collectedRows);
  player.generation++; player.job = null; collectedRows = sandbox.snapshot(); sandbox.settle(old, 'done');sandbox.render(collectedRows);
  assert.equal(chip.dataset.state, 'idle', 'önceki medya nesli terminali eklendi');
  const output = { kind: 'global', mediaKey: player.mediaKey, generation: player.generation, input: 'fixture.mp4' };
  state.running = true; state.activeOutputJob = output; collectedRows = sandbox.snapshot();sandbox.render(collectedRows);
  state.running = false; state.activeOutputJob = null; collectedRows = sandbox.snapshot();
  sandbox.recordBrowserJobTerminal('global-output-job', output, 'done');
  assert.equal(chip.dataset.state, 'done', 'gerçek çıktı işi terminali gösterilmedi');
  player.generation++;sandbox.render(collectedRows);
  assert.equal(chip.dataset.state, 'idle', 'eski medya neslinin tamamlandı bildirimi kaldı');
  const next = { ...output, generation: player.generation, running: true };state.running=true;state.activeOutputJob=next;collectedRows=sandbox.snapshot();sandbox.render(collectedRows);
  sandbox.recordBrowserJobTerminal('global-output-job', output, 'failed');
  assert.equal(chip.dataset.state, 'running', 'eski işin terminali yeni işi ezdi');
  sandbox.recordBrowserJobTerminal('global-output-job', next, 'failed');
  assert.equal(chip.dataset.state, 'error', 'güncel işin gerçek hata terminali gösterilmedi');
}

// 11) Yan panel boş durumu eylem sunar; kütüphane kartı açık grid alanlarıyla kurulur.
assert(/data-empty-action="address"[\s\S]*data-empty-action="file"[\s\S]*data-empty-action="library"/.test(renderer), 'boş durum eylemleri yok');
const css = read('src/renderer/browser-workbench.css');
assert(/\.plog-card \{[^}]*grid-template-areas: "chk id body" "chk id actions"/.test(css), 'kütüphane kartı grid alanları yok');
assert(/\.plog-card:not\(:has\(> \.plog-record-check\)\) \{[^}]*grid-template-areas: "id body" "id actions"/.test(css), 'onay kutusuz kart şablonu yok');
assert(/prefers-reduced-motion/.test(css) && /\[data-motion=off\]/.test(css), 'iş animasyonları hareket tercihine bağlı değil');


// 12) Keşfet bağlantı hatası: belirgin kart + mevcut `.md-retry` yolunu tetikleyen yeniden dene (ikinci yükleme yolu yok).
{
  const discovery = read('src/renderer/media-discovery-ui.js');
  assert(/md-status-retry[\s\S]{0,200}retry\.click\(\)/.test(discovery), 'Keşfet hata durumunda yeniden dene düğmesi yok');
  assert(/\.cn-discover-page > \.md-status\.mh-error/.test(css), 'Keşfet hata kartı stili yok');
}

console.log('browser-workbench: gruplar, Altyazı merkezi, Asistan/Ayarlar, kaynak bandı ve şerit sabitliği doğrulandı.');

// 11) Etiket kademeleri, hub'da "Sayfayı çevir" vekili, ayrı Ayarlar simgesi ve Whisper boş-durum/neden sahipliği.
{
  const css = read('src/renderer/browser-workbench.css');
  const step2 = hub.querySelector('.browser-hub-step[data-step="2"]'), step3 = hub.querySelector('.browser-hub-step[data-step="3"]');
  const proxy = hub.querySelector('[data-browser-proxy="browserPageTranslate"]');
  assert(proxy && (step2.compareDocumentPosition(proxy) & 4) && (proxy.compareDocumentPosition(step3) & 4), 'Sayfayı çevir vekili hub 2. adımında değil');
  assert(!byId('browserSettingsQuick').innerHTML.includes('M12 2v3M12 19v3'), 'Ayarlar simgesi parlaklık/güneş simgesine benziyor');
  assert(/@container browser-workspace \(max-width: 1399px\) \{\s*\.browser-tool-btn:not\(\.browser-jobs-chip\) > span \{ display: none; \}/.test(css), 'Asistan/Ayarlar etiket kademesi 1399px değil');
  assert(/@container browser-workspace \(max-width: 1259px\) \{\s*html:root body \.tb-media \.browser-panel-menu-label \{ display: none; \}/.test(css), 'merkez etiketi kademesi 1259px değil');
  for (const key of ['Çeviri ve dublaj', 'Web sayfasındaki metni hedef dile çevirir; seçenekler yan ok menüsünde']) assert(locale.includes(`'${key}'`), `EN karşılığı yok: ${key}`);
  // Boş durum Whisper düğmeleri render anında kopyalanmaz; sahibi updateBrowserWhisperActions'tır ve gerçek neden menüde data-reason olur.
  assert(/syncCueEmptyWhisperActions\(\);\s*updateBrowserSubtitleSummary\(\);/.test(renderer), 'updateBrowserWhisperActions boş durumu senkronlamıyor');
  assert(/syncCueEmptyWhisperActions\(\);\s*return;\s*\}\s*\$\('playerSide'\)\?\.classList\.remove\('no-cues'\)/.test(renderer), 'renderCueList boş durum sonunda senkron çağrısı yok');
  assert(/menuButton\.dataset\.reason = browserWhisperBlockReason\(available, busy, true\)/.test(renderer), 'menü öğesi gerçek neden taşımıyor');
  assert(/pause\.hidden = !\(player\.browserPageTranslateBusy \|\| player\.browserPagePaused\)/.test(renderer), 'Duraklat yalnız ilgili durumda görünmüyor');
}

// The start-only empty-state hint must never invoke the live button's Stop/Cancel action.
{
  const fixture = new JSDOM('<div id="cueList"><button data-empty-action="source"></button><p data-empty-reason></p><button data-empty-action="live">Open Live Whisper</button></div><button id="browserLiveAsr"></button>');
  const helpers = read('src/renderer/renderer-helpers.js');
  const start = renderer.indexOf('function browserWhisperBlockReason('), end = renderer.indexOf('function updateBrowserWhisperActions(', start);
  const buttonStart = helpers.indexOf('function updateBrowserLiveAsrButton('), buttonEnd = helpers.indexOf('function syncBrowserLiveAsrClock(', buttonStart);
  const player = {workspaceMode:'browser',browserLiveAsrActive:false,browserLiveAsrStarting:false};
  const state = {running:false,queueRunning:false};
  const context = {player,state,browserAudioPreparation:null,$:id=>fixture.window.document.getElementById(id),
    currentBrowserYoutubeUrl:()=>'',currentBrowserWhisperAudio:()=>null,interfaceChoice:(_tr,en)=>en};
  vm.createContext(context);vm.runInContext(renderer.slice(start,end)+helpers.slice(buttonStart,buttonEnd),context);
  const hint = fixture.window.document.querySelector('[data-empty-action="live"]');
  context.syncCueEmptyWhisperActions();assert.equal(hint.hidden,false,'an idle unsupported page still offers live capture');
  player.browserLiveAsrActive=true;context.updateBrowserLiveAsrButton();
  assert.equal(hint.hidden,true,'Open Live Whisper must not stop an active capture');
  player.browserLiveAsrActive=false;player.browserLiveAsrStarting=true;context.updateBrowserLiveAsrButton();
  assert.equal(hint.hidden,true,'Open Live Whisper must not cancel capture startup');
  player.browserLiveAsrStarting=false;player.browserLiveAsrCapture={stopping:true};context.updateBrowserLiveAsrButton();
  assert.equal(hint.hidden,true,'a stopping capture must settle before offering Start');
  player.browserLiveAsrCapture=null;context.updateBrowserLiveAsrButton();assert.equal(hint.hidden,false);
  state.running=true;context.syncCueEmptyWhisperActions();assert.equal(hint.hidden,true,'busy reason still suppresses live startup');
  fixture.window.close();
}
