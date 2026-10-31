'use strict';
// Controlled DOM/IPC/IO boundaries; no personal profile, live site or GPU.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const vm = require('node:vm');
const { randomUUID } = require('node:crypto');
const { EventEmitter } = require('node:events');
const { createRequire } = require('node:module');
const { JSDOM } = require('jsdom');
const { BrowserReadingList } = require('../src/browser-reading-list');
const { BrowserAssetStore } = require('../src/browser-asset-store');
const subs = require('../src/browser-subtitles');
const pack = require('../src/browser-session-package');
const media = require('../src/browser-media-controller');
const { BrowserSubtitlePreferences } = require('../src/browser-subtitle-preferences');
const { canonicalMediaIdentity, deriveStreamMediaIdentity } = require('../src/browser-media-identity');
const { buildBrowserLinkHintsScript } = require('../src/browser-link-hints');
const mainSource = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const root = fs.mkdtempSync(path.join(os.tmpdir(), 'report815-browser-'));
const results = [];
function fn(name) { const start = mainSource.search(new RegExp(`^(?:async )?function ${name}\\(`, 'm')); assert(start >= 0); return mainSource.slice(start, mainSource.indexOf('\n}', start) + 2); }
function ipc(name, next) { const start = mainSource.indexOf(`ipcMain.handle('${name}'`); return mainSource.slice(start, mainSource.indexOf(`ipcMain.handle('${next}'`, start)); }
function deferred() { let resolve; const promise = new Promise(r => { resolve = r; }); return { promise, resolve }; }
function dom(html = '') { return new JSDOM(html, { url: 'https://fixture.example/watch', pretendToBeVisual: true, runScripts: 'outside-only' }); }
function setupVideo(window, id, width = 400) { const v = window.document.getElementById(id); Object.defineProperties(v, { clientWidth: { value: width }, clientHeight: { value: 200 }, duration: { value: 60 }, readyState: { value: 4 } }); v.getBoundingClientRect = () => ({ x: 0, y: 0, left: 0, top: 0, right: width, bottom: 200, width, height: 200 }); return v; }
async function test(ids, body) { await body(); results.push(ids); console.log(`OK ${ids}`); }
function load(file, overrides) { const filename = path.join(__dirname, '..', file), req = createRequire(filename), module = { exports: {} }; vm.runInNewContext(fs.readFileSync(filename, 'utf8'), { module, exports: module.exports, require: id => Object.hasOwn(overrides, id) ? overrides[id] : req(id), __dirname: path.dirname(filename), process, console, Buffer, URL, AbortController, AbortSignal, setTimeout, clearTimeout, queueMicrotask, structuredClone }); return module.exports; }
async function run() {
  await test('B09 B20 B21', () => {
    const dir = path.join(root, 'reading'); fs.mkdirSync(dir); const store = new BrowserReadingList(dir);
    fs.writeFileSync(store.indexPath, '{bad'); const original = fs.readFileSync(store.indexPath, 'utf8');
    assert.equal(store.prepare({ url: 'https://fixture.example' }).ok, false); assert.equal(fs.readFileSync(store.indexPath, 'utf8'), original);
    fs.unlinkSync(store.indexPath); const plan = store.prepare({ url: 'https://fixture.example' }); fs.writeFileSync(plan.filePath, 'good'); assert(store.commit(plan.entry).ok);
    const rev = store.revision(plan.entry.id);
    const locked = new BrowserReadingList(dir, new Proxy(fs, { get: (target, key) => key === 'unlinkSync' ? () => { throw Error('EPERM'); } : target[key] }));
    assert.equal(locked.remove(plan.entry.id).ok, false); assert.equal(locked.list().length, 1); assert(fs.existsSync(plan.filePath));
    assert(store.remove(plan.entry.id).ok); assert.equal(store.commit(plan.entry, rev).ok, false); assert.equal(store.list().length, 0);
  });
  await test('B18 B29', async () => {
    let url = 'https://fixture.example/a', dialogWait = deferred(); const tab = { generation: 1, view: { webContents: { isDestroyed: () => false, getURL: () => url, printToPDF: async () => Buffer.from('PDF'), savePage: async target => fs.writeFileSync(target, 'MHTML') } } };
    const selected = path.join(root, 'selected.txt'), unselected = `${selected}.pdf`; fs.writeFileSync(unselected, 'sentinel');
    const ctx = vm.createContext({ Buffer, path, app: { getPath: () => root }, mainWindow: {}, browserExportTitle: () => 'A', dt: (_, en) => en, dialog: { showSaveDialog: () => dialogWait.promise }, writeBufferAtomic: fs.writeFileSync });
    vm.runInContext(fn('saveBrowserPagePdf') + '\n' + fn('saveBrowserPageArchive'), ctx);
    let pending = ctx.saveBrowserPagePdf(tab); url = 'https://fixture.example/b'; dialogWait.resolve({ filePath: selected }); assert.equal((await pending).stale, true); assert(!fs.existsSync(selected));
    url = 'https://fixture.example/a'; dialogWait = deferred(); pending = ctx.saveBrowserPageArchive(tab); tab.generation++; dialogWait.resolve({ filePath: selected }); assert.equal((await pending).stale, true);
    dialogWait = deferred(); pending = ctx.saveBrowserPagePdf(tab); dialogWait.resolve({ filePath: selected }); assert((await pending).ok); assert.equal(fs.readFileSync(selected, 'utf8'), 'PDF'); assert.equal(fs.readFileSync(unselected, 'utf8'), 'sentinel');
  });
  await test('B19 B21', async () => {
    const dir = path.join(root, 'refresh'); fs.mkdirSync(dir); const store = new BrowserReadingList(dir);
    const plan = store.prepare({ url: 'https://fixture.example/a' }); fs.writeFileSync(plan.filePath, 'KNOWN GOOD'); store.commit(plan.entry);
    const ctx = vm.createContext({ fs, path, randomUUID, browserReadingList: () => store }); vm.runInContext(fn('saveBrowserPageToReadingList'), ctx);
    const wc = { isDestroyed: () => false, savePage: async target => { fs.writeFileSync(target, 'PARTIAL'); throw Error('ENOSPC'); } };
    assert.equal((await ctx.saveBrowserPageToReadingList({ view: { webContents: wc } }, plan)).ok, false); assert.equal(fs.readFileSync(plan.filePath, 'utf8'), 'KNOWN GOOD');
    const gate = deferred(); wc.savePage = async target => { await gate.promise; fs.writeFileSync(target, 'new'); };
    const pending = ctx.saveBrowserPageToReadingList({ view: { webContents: wc } }, plan); store.remove(plan.entry.id); gate.resolve(); assert.equal((await pending).ok, false); assert.equal(store.list().length, 0); assert.equal(fs.readdirSync(dir).filter(file => file.endsWith('.mhtml')).length, 0);
  });
  await test('B22', async () => {
    let clip; const debuggerApi = { isAttached: () => true, sendCommand: async (command, opts) => command === 'Page.getLayoutMetrics' ? { cssContentSize: { width: 1000, height: 45000 } } : (clip = opts.clip, { data: '' }) };
    const ctx = vm.createContext({ Buffer, browserDebuggerAttachPromise: null, nativeImage: { createFromBuffer: () => ({}) } }); vm.runInContext(fn('captureBrowserFullPage'), ctx); await ctx.captureBrowserFullPage({ debugger: debuggerApi }); assert.equal(clip.height, 45000);
  });
  await test('B23 B24', async () => {
    const page = dom('<div class="ytp-chrome-bottom"></div>'); const gates = [], rects = [];
    const frame = { executeJavaScript: async script => page.window.eval(script) };
    const wc = { mainFrame: frame, getZoomFactor: () => 1, capturePage: rect => { rects.push(rect); const gate = deferred(); gates.push(gate); return gate.promise; } };
    const ctx = vm.createContext({ randomUUID, browserFrames: () => [frame], buildBrowserMediaProbeScript: () => 'null', rankBrowserMediaCandidates: rows => rows.map(row => ({ ...row, media: { bounds: { x: -100, y: -80, width: 640, height: 360 } } })), withTimeout: p => p, dt: (_, en) => en }); vm.runInContext(fn('captureBrowserVideoFrame'), ctx);
    const tab = { view: { webContents: wc, getBounds: () => ({ width: 1000, height: 800 }) } };
    const first = ctx.captureBrowserVideoFrame(tab, false), second = ctx.captureBrowserVideoFrame(tab, true);
    while (gates.length < 2) await new Promise(resolve => setImmediate(resolve));
    assert.deepEqual({ ...rects[0] }, { x: 0, y: 0, width: 540, height: 280 });
    gates[0].resolve({}); await first; assert.equal(page.window.document.querySelector('div').style.visibility, 'hidden');
    gates[1].resolve({}); await second; assert.equal(page.window.document.querySelector('div').style.visibility, ''); page.window.close();
  });
  await test('B26 B27', async () => {
    const page = dom('<input type="checkbox"><div contenteditable>draft</div><div id="shadow"></div>');
    page.window.document.querySelector('input').checked = true; page.window.document.getElementById('shadow').attachShadow({ mode: 'open' }).innerHTML = '<textarea></textarea>'; page.window.document.querySelector('#shadow').shadowRoot.querySelector('textarea').value = 'draft';
    const child = dom('<textarea></textarea>'); child.window.document.querySelector('textarea').value = 'child draft';
    const ctx = vm.createContext({ browserScriptExecutionReady: () => true, withTimeout: p => p, browserFrames: () => [page, child].map(item => ({ executeJavaScript: async script => item.window.eval(script) })) }); vm.runInContext(fn('browserTabRuntimeState'), ctx);
    const state = await ctx.browserTabRuntimeState({ view: { webContents: {} } }); assert(state.stateKnown && state.formOrLogin && state.dirtyDraft);
    page.window.close(); child.window.close();
  });
  await test('B28 B59 B60 B61 B62', async () => {
    const page = dom('<div id="host"></div>'); const w = page.window; let mediaClock = 10000; w.Date.now = () => mediaClock; assert.equal(w.eval(media.buildBrowserMediaProbeScript()), null);
    w.document.getElementById('host').attachShadow({ mode: 'open' }).innerHTML = '<video id="late"></video>';
    const late = w.document.getElementById('host').shadowRoot.querySelector('video'); Object.defineProperties(late, { clientWidth: { value: 200 }, clientHeight: { value: 100 } }); mediaClock += 1000; assert(w.eval(media.buildBrowserMediaProbeScript()));
    w.document.body.innerHTML = '<video id="small" src="small.mp4"></video><video id="large" src="large.mp4" style="visibility:hidden"></video>';
    mediaClock += 1000;
    const small = setupVideo(w, 'small', 200), large = setupVideo(w, 'large', 800); let probe = w.eval(media.buildBrowserMediaProbeScript()); assert.equal(probe.area, 40000);
    large.style.visibility = ''; await w.eval(media.buildBrowserMediaCommandScript('loop', 0, null, { src: small.src, x: 10, y: 10 })); assert(small.loop); assert(!large.loop);
    probe = w.eval(media.buildBrowserMediaProbeScript()); large.remove(); const stale = await w.eval(media.buildBrowserMediaCommandScript('loop', 0, probe.docToken)); assert(stale.stale); assert(!small.loop === false);
    await w.eval(media.buildBrowserMediaCommandScript('dub-rate', { rate: .5, baseRate: 1 })); assert.equal(small.playbackRate, .5); small.src = 'next.mp4'; small.dispatchEvent(new w.Event('loadedmetadata')); assert.equal(small.playbackRate, 1); page.window.close();
  });
  await test('B65', () => {
    const url = 'https://fixture.example/watch', base = canonicalMediaIdentity(url).key; let disk;
    const prefs = new BrowserSubtitlePreferences({ read: () => ({ version: 1, items: [] }), write: value => { disk = value; } });
    const a = deriveStreamMediaIdentity(base, 'https://fixture.example/a.mpd'), b = deriveStreamMediaIdentity(base, 'https://fixture.example/b.mpd');
    prefs.put({ url, mediaId: a, subtitleSelection: { primaryId: 'en' } }); prefs.put({ url, mediaId: b, subtitleSelection: { primaryId: 'tr' } });
    assert(prefs.get(a)); assert(prefs.get(b)); const restored = new BrowserSubtitlePreferences({ read: () => disk, write: () => {} }); assert.equal(restored.get(a).subtitleSelection.primaryId, 'en');
  });
  await test('B63 mitigation signal (audio restoration remains unresolved)', () => {
    const page = dom('<audio id="a" src="same-origin.wav"></audio>');
    const node = () => ({ connect() {}, disconnect() {} });
    page.window.AudioContext = class {
      constructor() { this.destination = {}; this.state = 'running'; }
      createMediaElementSource() { return node(); }
      createDynamicsCompressor() { return { ...node(), ...Object.fromEntries(['threshold','knee','ratio','attack','release'].map(key => [key, { value: 0 }])) }; }
      resume() { return Promise.resolve(); }
    };
    page.window.eval(media.buildBrowserMediaPreferenceScript({ normalizeAudio: true }));
    assert.equal(page.window.eval(media.buildBrowserMediaProbeScript()).audioRecoveryRequired, false);
    page.window.document.getElementById('a').src = 'https://foreign.example/audio.wav';
    page.window.document.getElementById('a').dispatchEvent(new page.window.Event('loadstart'));
    assert.equal(page.window.eval(media.buildBrowserMediaProbeScript()).audioRecoveryRequired, true); page.window.close();
  });
  await test('B83 B84 B90', () => {
    const store = new BrowserAssetStore({ rootDir: path.join(root, 'assets') }); const cue = { start: 1, end: 3, text: 'Hello', speaker: 'Alice', writingMode: 'rl', line: '10%', position: '20%' };
    const saved = store.putTrack({ mediaId: 'web:fixture', trackId: 'en', forSpeech: true, speechProtocol: 'speech-v15-idiom-anchor-feedback', cues: [cue] }); assert(saved.ok); const restored = store.getTrack(saved.assetId); assert(restored.ok); assert.equal(restored.document.cues[0].writingMode, 'rl');
    const bundle = pack.createBrowserSessionPackage({ session: { tabs: [] }, places: {}, variants: [saved.document] }); const imported = store.putTrack(pack.inspectBrowserSessionPackage(bundle).variants[0]); assert(imported.ok); assert(imported.document.forSpeech); assert.equal(imported.document.speechProtocol, saved.document.speechProtocol);
    const before = fs.readFileSync(saved.srtPath, 'utf8'), corrupt = JSON.parse(fs.readFileSync(saved.jsonPath, 'utf8')); corrupt.cues[0].text = 'Jello'; fs.writeFileSync(saved.jsonPath, JSON.stringify(corrupt)); assert.equal(store.getTrack(saved.assetId).ok, false); assert.equal(fs.readFileSync(saved.srtPath, 'utf8'), before);
  });
  await test('B85 B86 B87 B88 B89', () => {
    const inherited = '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011" mediaPresentationDuration="PT10S"><Period><AdaptationSet mimeType="text/vtt"><SegmentTemplate media="sub-$Number$.vtt" duration="5" timescale="1"/><Representation id="en"><SegmentTemplate initialization="init.vtt"/></Representation></AdaptationSet></Period></MPD>';
    assert(subs.parseDashSubtitleMatchers(inherited, 'https://fixture.example/a.mpd').length > 0);
    const direct = '<MPD xmlns="urn:mpeg:dash:schema:mpd:2011"><Period><AdaptationSet mimeType="text/vtt"><Representation><BaseURL>en.vtt</BaseURL></Representation></AdaptationSet></Period></MPD>';
    const prefixed = direct.replace('xmlns=', 'xmlns:dash=').replace(/<(\/?)(MPD|Period|AdaptationSet|Representation|BaseURL)\b/g, '<$1dash:$2'); assert.equal(subs.parseDashSubtitleTracks(prefixed, 'https://fixture.example/a.mpd').length, 1);
    const parse = xml => subs.parseSubtitlePayload(xml, 'application/ttml+xml', 'https://fixture.example/a.ttml').cues;
    assert.equal(parse('<tt><body><div begin="10s" dur="2s"><p begin="0s" dur="20s">Hello</p></div></body></tt>')[0].end, 12);
    assert.deepEqual(parse('<tt><body><div dur="2s"><p begin="5s" dur="1s">Outside active parent</p></div></body></tt>'), []);
    assert.deepEqual(parse('<tt><body><div><p begin="0s" end="10s">Static <span begin="5s" end="10s">Late</span></p></div></body></tt>').map(({ start, end, text }) => [start, end, text]), [[0, 5, 'Static'], [5, 10, 'Static Late']]);
    assert.deepEqual(parse('<tt><body><div timeContainer="seq"><p dur="2s">First</p><p dur="3s">Second</p></div></body></tt>').map(({ start, end, text }) => [start, end, text]), [[0, 2, 'First'], [2, 5, 'Second']]);
  });
  await test('B31', async () => {
    let handler, child; const ctx = vm.createContext({ ipcMain: { handle: (_, value) => { handler = value; } }, authorizedBrowserSender: () => true, EXTERNAL_PLAYER_NAMES: ['mpv'], resolveExternalPlayerPath: () => 'mpv.exe', decideUrlPolicy: url => ({ action: 'external', protocol: 'https:', url }), spawn: () => { child = new EventEmitter(); child.unref = () => {}; return child; } }); vm.runInContext(ipc('player:external', 'browser:elementRules'), ctx);
    const pending = handler({}, { player: 'mpv', url: 'https://fixture.example' }); child.emit('error', Error('EACCES')); assert.equal((await pending).ok, false);
    const success = handler({}, { player: 'mpv', url: 'https://fixture.example' }); child.emit('spawn'); assert((await success).ok);
  });
  await test('B30', async () => {
    let handler, typed = false, closed = false, calls = 0; const gate = deferred();
    const a = { id: 'a', view: { webContents: { isDestroyed: () => false } } }, b = { id: 'b' }; const tabs = new Map([['a', a], ['b', b]]);
    const ctx = vm.createContext({ ipcMain: { handle: (_, value) => { handler = value; } }, queueBrowserTabTransition: work => work(), authorizedBrowserSender: () => true,
      browserTabById: id => tabs.get(id), browserHlsCeaFullCaptureJob: null, browserTabRuntimeState: async () => { calls++; return { stateKnown: true, formOrLogin: typed }; },
      browserTabProtectionReasons: tab => tab.formOrLogin ? ['form_or_login'] : [], browserProtectionMessage: () => 'draft protected', browserTabs: tabs, browserActiveTabId: 'a',
      persistActiveBrowserTabState: () => {}, stopBrowserPolling: () => {}, withTimeout: promise => promise, drainBrowserCaptureBeforeClose: () => gate.promise, BROWSER_CLOSE_DRAIN_TIMEOUT: 5000,
      browserCaptureCloseNeedsWarning: () => false, browserClosedTabs: [], browserTabSnapshot: tab => ({ id: tab.id }), destroyBrowserTab: () => { closed = true; }, browserVisible: true,
      executeBrowserViewFrames: async () => {}, browserCaptureHookScript: () => '', browserCaptureToggleScript: () => '', startBrowserPolling: () => {} });
    vm.runInContext(ipc('browser:tab:close', 'browser:show'), ctx); const pending = handler({}, { tabId: 'a' });
    await Promise.resolve(); await Promise.resolve(); typed = true; gate.resolve({ pending: 0 }); const result = await pending;
    assert(result.requiresConfirmation); assert(!closed); assert.equal(calls, 2);
  });
  await test('B64', async () => {
    const top = dom('<button id="top">top</button>'), child = dom('<button id="child">child</button>');
    const tw = top.window, cw = child.window; let topClicks = 0, childClicks = 0;
    for (const w of [tw, cw]) { const button = w.document.querySelector('button'); button.getBoundingClientRect = () => ({ left: 0, top: 0, right: 100, bottom: 30, width: 100, height: 30 }); }
    tw.document.querySelector('button').onclick = () => topClicks++; cw.document.querySelector('button').onclick = () => childClicks++;
    tw.eval(buildBrowserLinkHintsScript({ session: 'fixture-session', prefix: 'a' })); cw.eval(buildBrowserLinkHintsScript({ session: 'fixture-session', prefix: 's' }));
    assert.equal(tw.document.querySelector('[data-whisper-link-hints] span').textContent, 'AA'); assert.equal(cw.document.querySelector('[data-whisper-link-hints] span').textContent, 'SA');
    // Dispatch the bridge messages main routes through the frame tree. This is
    // a DOM protocol test; native Chromium routing is a separate smoke check.
    for (const key of ['s', 'a']) { for (const w of [tw, cw]) w.dispatchEvent(new w.MessageEvent('message', { data: { __whisperLinkHintsSession: 'fixture-session', key } })); }
    assert.equal(topClicks, 0); assert.equal(childClicks, 1);
    tw.dispatchEvent(new tw.MessageEvent('message', { data: { __whisperLinkHintsCleanup: true } })); assert(!tw.document.querySelector('[data-whisper-link-hints]')); assert(!cw.document.querySelector('[data-whisper-link-hints]'));
    tw.close(); cw.close();
  });
  await test('B121', () => {
    let handler, url = 'https://www.youtube.com/shorts/abcdefghijk', stored;
    const profiles = require('../src/browser-site-profiles');
    const tab = { generation: 3 }; const ctx = vm.createContext({ ipcMain: { handle: (_, value) => { handler = value; } }, authorizedBrowserSender: () => true,
      activeRequestedBrowserTab: () => tab, browserTabSnapshot: () => ({ url }), browserSiteOrigin: profiles.browserSiteOrigin, browserPathKey: profiles.browserPathKey,
      readBrowserPlaces: () => ({ pathProfiles: {}, siteProfiles: {} }), withBrowserPathProfileField: profiles.withBrowserPathProfileField,
      setBrowserPlaces: value => { stored = value; }, flushBrowserPlaces: () => true, sendBrowserEvent: () => {}, browserPlacesSnapshot: () => stored,
      MAX_BROWSER_SITE_PROFILES: 100 });
    vm.runInContext(ipc('browser:profile:update', 'browser:page:start'), ctx);
    const request = { tabId: 't', generation: 3, origin: 'https://www.youtube.com', scope: 'path', url: 'https://www.youtube.com/watch?v=abcdefghijk', field: 'subtitleMode', value: 'both' };
    assert.equal(handler({}, request).stale, true); assert.equal(stored, undefined);
    url = request.url; assert(handler({}, request).ok); assert(stored.pathProfiles['https://www.youtube.com/watch']);
  });
  await test('B25 B32', async () => {
    let factories = 0, fail = true;
    const tools = { createBrowserMediaTools: () => { factories++; return { semanticSearch: async () => ({ hits: [] }) }; } };
    const features = load('src/browser-feature-services.js', { './browser-media-tools': tools });
    let handler; const tab = { id: 't', generation: 1, mediaId: 'media', view: { webContents: { getURL: () => 'https://fixture.example/watch', isDestroyed: () => false } } };
    const io = new Proxy(fs, { get: (target, key) => key === 'writeFileSync' ? (...args) => { if (fail && String(args[0]).includes('browser-skip-segments')) throw Error('EACCES'); return target.writeFileSync(...args); } : target[key] });
    features.registerBrowserFeatureServices({ app: { getPath: () => root }, ipcMain: { handle: (name, value) => { if (name === 'browser:extras') handler = value; } }, BrowserWindow: class {}, owner: () => ({}), getTab: () => tab, activeTab: () => tab, context: () => ({ generation: 1, mediaId: 'media' }), authorized: () => true, frames: () => [], pythonPath: () => 'python', ffmpegPath: () => '', ffprobePath: () => '', fsImpl: io });
    const call = (action, extra = {}) => handler({}, { action, tabId: 't', generation: 1, mediaId: 'media', ...extra });
    assert((await call('semantic-search', { query: 'a', cues: [] })).ok); assert((await call('semantic-search', { query: 'b', cues: [] })).ok); assert.equal(factories, 1);
    assert.equal((await call('skip-save', { record: { id: 'failed', kind: 'intro', start: 0, end: 5 } })).ok, false); assert.equal((await call('skip-list')).records.length, 0);
    fail = false; assert((await call('skip-save', { record: { id: 'good', kind: 'intro', start: 10, end: 15 } })).ok); assert.deepEqual(JSON.parse(fs.readFileSync(path.join(root, 'browser-skip-segments.json'), 'utf8')).records.map(row => row.id), ['good']);
  });
  console.log(`report815-browser-boundaries: ${results.length} grouped checks passed`);
}
run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => fs.rmSync(root, { recursive: true, force: true }));
