const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const source = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
const code = source.slice(source.indexOf('async function locateMissingSubtitle('), source.indexOf('window.api.onEvent('));
(async () => {
  for (const sameContent of [true, false]) {
    const tab = { subtitleSyncRecords: [{sourceTrackId: 'file:old.srt', sourceHash: 'original', offsetSeconds: .5}] };
    const ctx = { currentGeneration: () => 1, staleGeneration: () => false,
      window: {api: { selectFile: async () => 'new.srt' }}, addSubtitleOption() {}, $: () => ({}),
      player: {workspaceMode: 'browser', subPath: ''}, state: {pendingPlayerLoad: {}},
      browserTabState: () => tab, browserSyncTrack: () => ({ id: 'file:new.srt', sourceHash: sameContent ? 'original' : 'changed' }),
      browserSubtitleSync: {hashText: x => x}, saveActiveBrowserTabWorkspace() {}, renderBrowserCueAt() {},
      scheduleBrowserOverlaySync() {}, flushWatchState() {}, updatePlayerTaskCenter() {}, logLine() {} };
    ctx.loadSubtitle = async file => { ctx.player.subPath = file; };
    vm.createContext(ctx); vm.runInContext(code, ctx);
    await ctx.locateMissingSubtitle('old.srt', false, 'source');
    assert.equal(tab.subtitleSyncRecords[0].sourceTrackId, sameContent ? 'file:new.srt' : 'file:old.srt');
    assert.equal(ctx.state.pendingPlayerLoad, null);
    ctx.player.subPath = ''; ctx.staleGeneration = () => true;
    await ctx.locateMissingSubtitle('old.srt', false, 'source');
    assert.equal(ctx.player.subPath, '', 'Dosya seçilirken medya değişirse sonuç uygulanmamalı');
  }
  console.log('Taşınan altyazı: içerik eşleşmesi, senkron aktarımı ve medya değişimi geçti.');
})().catch(error => { console.error(error); process.exitCode = 1; });
