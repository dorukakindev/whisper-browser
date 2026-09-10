const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const path = require('node:path');
const source = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');

function harness() {
  let generation = 1;
  const signals = [], exports = [];
  const button = () => ({ disabled: false, attributes: {}, setAttribute(key, value) { this.attributes[key] = value; } });
  const controls = { browserTrackExport: button(), browserTranslationExport: button(),
    browserExportFormat: { value: 'vtt' }, translateTo: { value: 'de' }, playerSubSelect: { value: '' } };
  const ctx = {
    player: { workspaceMode: 'browser', browserActiveTabId: 'a', browserPageTitle: 'Bölüm A',
      cues: [], cues2: [], browserTracks: [], browserLiveTranslations: new Map() },
    $: (id) => controls[id], currentGeneration: () => generation, staleGeneration: (gen) => gen !== generation,
    browserTrackSelection: () => ({ id: 'source', path: 'source.srt', language: 'en' }),
    browserSubtitleRoleCues: () => ({ translation: [] }),
    attachBrowserCueIdentities: (_track, cues) => cues,
    parseSubtitles: (text) => [{ start: 0, end: 1, text }],
    setBrowserSignal: (message) => signals.push(message),
    updateBrowserSubtitleSummary() {}, syncSubtitlePrimaryAction() {},
    window: { api: { readSubtitle: async () => ({ ok: true, text: 'Hello' }),
      exportBrowserSubtitle: async (payload) => { exports.push(payload); return { ok: true, path: 'test.vtt' }; } } },
  };
  vm.createContext(ctx);
  vm.runInContext(source.slice(source.indexOf('async function runBrowserSubtitleExport('),
    source.indexOf('async function retryFailedBrowserTranslation(')), ctx);
  return { ctx, controls, signals, exports, advance: () => generation++ };
}

(async () => {
  // Her iki düğme tek dışa aktarma işi paylaşır; kaydetme açıkken tekrar açılmaz.
  const busy = harness();
  let finishSave;
  busy.ctx.window.api.exportBrowserSubtitle = (payload) => {
    busy.exports.push(payload); return new Promise((resolve) => { finishSave = resolve; });
  };
  const first = busy.ctx.exportSelectedBrowserTrack();
  assert.equal(busy.controls.browserTrackExport.disabled, true);
  assert.equal(busy.controls.browserTranslationExport.attributes['aria-busy'], 'true');
  await new Promise(setImmediate);
  await busy.ctx.exportSelectedBrowserTrack();
  assert.equal(busy.exports.length, 1);
  finishSave({ canceled: true });
  await first;
  assert.equal(busy.signals.length, 0, 'iptal hata olarak gösterildi');
  assert.equal(busy.controls.browserTrackExport.disabled, false);
  assert.equal(busy.controls.browserTranslationExport.attributes['aria-busy'], 'false');

  for (const phase of ['read', 'save', 'empty-result']) {
    const failure = harness();
    if (phase === 'read') failure.ctx.window.api.readSubtitle = async () => { throw Error('Dosya bağlantısı kesildi'); };
    else failure.ctx.window.api.exportBrowserSubtitle = async () => {
      if (phase === 'save') throw Error('Disk dolu');
      return null;
    };
    await failure.ctx.exportSelectedBrowserTrack();
    assert.match(failure.signals[0], /Dışa aktarılamadı:.*Yeniden deneyin/);
    assert.equal(failure.ctx.player.browserSubtitleExportBusy, false);
  }

  for (const change of ['tab', 'generation', 'workspace']) {
    const stale = harness();
    let finishRead;
    stale.ctx.window.api.readSubtitle = () => new Promise((resolve) => { finishRead = resolve; });
    const pending = stale.ctx.exportSelectedBrowserTrack();
    if (change === 'tab') stale.ctx.player.browserActiveTabId = 'b';
    if (change === 'generation') stale.advance();
    if (change === 'workspace') stale.ctx.player.workspaceMode = 'player';
    finishRead({ ok: true, text: 'Eski bölüm' });
    await pending;
    assert.equal(stale.exports.length, 0, `${change}: eski bölüm için kaydetme penceresi açıldı`);
    assert.equal(stale.signals.length, 0);
  }

  const snapshot = harness();
  let finishRead;
  snapshot.ctx.window.api.readSubtitle = () => new Promise((resolve) => { finishRead = resolve; });
  const pending = snapshot.ctx.exportSelectedBrowserTrack();
  snapshot.controls.browserExportFormat.value = 'srt';
  snapshot.ctx.player.browserPageTitle = 'Başka başlık';
  finishRead({ ok: true, text: 'Kaynak' });
  await pending;
  assert.equal(snapshot.exports[0].format, 'vtt');
  assert.equal(snapshot.exports[0].title, 'Bölüm A en');

  const savedElsewhere = harness();
  let finishElsewhere;
  savedElsewhere.ctx.window.api.exportBrowserSubtitle = () => new Promise((resolve) => { finishElsewhere = resolve; });
  const saving = savedElsewhere.ctx.exportSelectedBrowserTrack();
  await new Promise(setImmediate);
  savedElsewhere.ctx.player.browserActiveTabId = 'b';
  finishElsewhere({ ok: true, path: 'a.vtt' });
  await saving;
  assert.equal(savedElsewhere.signals.length, 0, 'A için kaydetme sonucu B sekmesine yazıldı');
  assert.equal(savedElsewhere.ctx.player.browserSubtitleExportBusy, false);

  for (const slot of ['primary', 'secondary', 'live']) {
    const translation = harness();
    const p = translation.ctx.player;
    const edited = [{ start: 2, end: 3, text: 'Düzeltilmiş' }, { start: 0, end: 1, text: 'İlk' }];
    p.browserLiveTranslations.set('stale', { start: 0, end: 1, text: 'Eski kopya' });
    if (slot !== 'live') {
      p.browserTracks = [{ id: 'tr', role: 'translation', language: 'tr' }];
      if (slot === 'primary') { p.browserLoadedTrackId = 'tr'; p.cuesRaw = edited; }
      else { p.browserLoadedTrackId2 = 'tr'; p.cues2Raw = edited; }
    }
    await translation.ctx.exportBrowserTranslation();
    const out = translation.exports[0];
    assert.equal(out.cues.length, slot === 'live' ? 1 : 2);
    assert.equal(out.cues.at(-1).text, slot === 'live' ? 'Eski kopya' : 'Düzeltilmiş');
    assert.equal(out.title, slot === 'live' ? 'Bölüm A-de-ceviri' : 'Bölüm A-tr-ceviri');
    assert.equal(edited[0].text, 'Düzeltilmiş', 'dışa aktarma kaynak diziyi sıralayarak değiştirdi');
  }

  // Dosya seçme penceresi eski sekmeye aittir; gecikmiş dosya yeni videoya bağlanmaz.
  for (const change of ['tab', 'generation', 'workspace', 'none']) {
    const manual = harness();
    let choose;
    let loaded = 0;
    manual.ctx.window.api.selectFile = () => new Promise((resolve) => { choose = resolve; });
    manual.ctx.addSubtitleOption = () => {};
    manual.ctx.setPlayerSidebarCollapsed = () => {};
    manual.ctx.loadSubtitle = async (file) => { loaded++; manual.ctx.player.subPath = file; };
    vm.runInContext(source.slice(source.indexOf('async function loadManualBrowserSubtitle('),
      source.indexOf('async function runBrowserSubtitleExport(')), manual.ctx);
    const selecting = manual.ctx.loadManualBrowserSubtitle();
    if (change === 'tab') manual.ctx.player.browserActiveTabId = 'b';
    if (change === 'generation') manual.advance();
    if (change === 'workspace') manual.ctx.player.workspaceMode = 'player';
    choose('manual.srt');
    await selecting;
    assert.equal(loaded, change === 'none' ? 1 : 0);
  }
  const notices = harness();
  const tab = {};
  notices.ctx.browserTabState = () => tab;
  vm.runInContext(source.slice(source.indexOf('function announceBrowserTrack('),
    source.indexOf('async function restoreBrowserSubtitleSelection(')), notices.ctx);
  notices.ctx.announceBrowserTrack({ id: 'source', cueCount: 1 });
  notices.ctx.announceBrowserTrack({ id: 'source', cueCount: 20 });
  assert.equal(notices.signals.length, 1, 'her yeni segment aynı çeviri teklifini tekrarladı');
  notices.ctx.player.browserTranslationTrackId = 'translated';
  notices.ctx.announceBrowserTrack({ id: 'translated' });
  assert.equal(notices.signals.length, 1, 'çevrilen iz için yeniden çeviri teklifi gösterildi');
  notices.ctx.announceBrowserTrack({ id: 'other' });
  assert.equal(notices.signals.length, 2, 'farklı iz için yeni teklif kayboldu');
  console.log('Browser subtitle export: busy/cancel/errors, navigation guards, format snapshot, edited translation and manual picker passed.');
})().catch((error) => { console.error(error); process.exitCode = 1; });
