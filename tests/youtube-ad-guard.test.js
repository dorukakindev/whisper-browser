'use strict';
const assert = require('node:assert/strict');
const { JSDOM } = require('jsdom');
const { installYoutubeAdGuard } = require('../src/youtube-ad-preload');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

async function run() {
  const dom = new JSDOM('<!doctype html><ytd-rich-item-renderer id="ad"><ytd-ad-slot-renderer></ytd-ad-slot-renderer></ytd-rich-item-renderer>'
    + '<ytd-rich-item-renderer id="normal"><a>Normal video</a></ytd-rich-item-renderer>',
  { url: 'https://www.youtube.com/watch?v=fixture', runScripts: 'outside-only' });
  const w = dom.window;
  const rawParse = w.JSON.parse;
  w.Response = class { constructor(url, body) { this.url = url; this.body = body; }
    async json() { return rawParse(this.body); } };
  w.XMLHttpRequest = class { constructor(body, type = '') {
    this.body = body; this.responseURL = 'https://www.youtube.com/youtubei/v1/player'; this.responseType = type;
  } };
  Object.defineProperty(w.XMLHttpRequest.prototype, 'response', { configurable: true,
    get() { return this.responseType === 'json' ? rawParse(this.body) : this.body; } });
  Object.defineProperty(w.XMLHttpRequest.prototype, 'responseText', { configurable: true, get() { return this.body; } });
  const install = policy => w.eval(`(${installYoutubeAdGuard.toString()})(${JSON.stringify(policy)})`);
  const body = JSON.stringify({ videoDetails: { videoId: 'fixture' }, streamingData: { adaptiveFormats: [1] },
    captions: { tracks: [2] }, adPlacements: [3], playerAds: [4], adSlots: [5], adBreakHeartbeatParams: 'ad' });
  assert.equal(install({ enabled: true }).active, true);
  assert.equal(w.JSON.parse.name, rawParse.name);
  assert.equal(w.JSON.parse.length, rawParse.length);
  w.eval(`window.ytInitialPlayerResponse = ${body}`);
  assert.equal(w.ytInitialPlayerResponse.adBreakHeartbeatParams, undefined);
  assert.equal(w.ytInitialPlayerResponse.videoDetails.videoId, 'fixture');
  assert.equal(w.ytInitialPlayerResponse.captions.tracks[0], 2);
  assert.equal(w.ytInitialPlayerResponse.streamingData.adaptiveFormats[0], 1);
  const parsed = w.JSON.parse(body);
  assert.equal(parsed.playerAds, undefined);
  assert.doesNotThrow(() => w.JSON.parse(body, (name, value) => name === '' ? Object.freeze(value) : value));
  const response = await new w.Response('https://www.youtube.com/youtubei/v1/player?key=fixture', body).json();
  assert.equal(response.adSlots, undefined);
  const unrelated = await new w.Response('https://example.org/player', body).json();
  assert.equal(unrelated.adSlots[0], 5, 'external response must stay untouched');
  const xhr = new w.XMLHttpRequest(body, 'json');
  assert.equal(xhr.response.adPlacements, undefined);
  assert.equal(rawParse(new w.XMLHttpRequest(body).responseText).playerAds, undefined);
  w.eval('window.ytInitialData = {contents: [{richItemRenderer:{content:{adSlotRenderer:{x:1}}}},'
    + '{richItemRenderer:{content:{videoRenderer:{title:"Ad is a word"}}}},'
    + '{promotedSparklesWebRenderer:{x:2}}]}');
  assert.equal(w.ytInitialData.contents.length, 1);
  assert.equal(w.ytInitialData.contents[0].richItemRenderer.content.videoRenderer.title, 'Ad is a word');
  w.document.dispatchEvent(new w.Event('DOMContentLoaded'));
  assert.equal(w.document.getElementById('ad').style.display, 'none');
  assert.notEqual(w.document.getElementById('normal').style.display, 'none');
  const late = w.document.createElement('ytd-ad-slot-renderer');
  await new Promise((resolve, reject) => {
    const observer = new w.MutationObserver(() => {
      if (late.style.display !== 'none') return;
      clearTimeout(deadline); observer.disconnect(); resolve();
    });
    const deadline = setTimeout(() => { observer.disconnect(); reject(new Error('SPA ad was not hidden')); }, 2000);
    observer.observe(late, { attributes: true, attributeFilter: ['style'] });
    w.document.body.appendChild(late);
  });
  assert.equal(late.style.display, 'none', 'SPA-added ad must be collapsed');
  const installedParse = w.JSON.parse;
  install({ enabled: true });
  assert.equal(w.JSON.parse, installedParse, 'duplicate policy must not stack wrappers');
  install({ enabled: false });
  assert.equal(w.JSON.parse, rawParse);
  assert.equal(w.document.getElementById('ad').style.display, '');
  assert.equal(late.style.display, '');
  assert.equal(w.JSON.parse(body).playerAds[0], 4);
  assert.equal(w.__whisperYoutubeAdGuard, undefined);
  dom.window.close();

  const outside = new JSDOM('', { url: 'https://youtube.com.example.org/', runScripts: 'outside-only' });
  const outsideParse = outside.window.JSON.parse;
  const result = outside.window.eval(`(${installYoutubeAdGuard.toString()})({enabled:true})`);
  assert.equal(result.active, false);
  assert.equal(outside.window.JSON.parse, outsideParse);
  outside.window.close();

  // Exercise the production policy and sender checks without launching the app.
  const main = fs.readFileSync(path.resolve(__dirname, '../src/main.js'), 'utf8');
  const start = main.indexOf('function browserYoutubeGuardPolicy(');
  const end = main.indexOf('\nfunction refreshBrowserYoutubeGuards', start);
  const tab = { siteOverrideOrigin: '', siteOverrides: null };
  const frame = { url: 'https://www.youtube.com/watch?v=fixture' };
  const sender = { mainFrame: frame, isDestroyed: () => false };
  tab.view = { webContents: sender };
  let requested = true, paused = false, listener;
  const context = { browserSiteOrigin: value => { try { return new URL(value).origin; } catch (_) { return ''; } },
    isYoutubePageUrl: require('../src/browser-youtube-style').isYoutubePageUrl,
    browserAdblockController: { getState: () => ({ requested }) }, browserAdblockInitiallyEnabled: true,
    readBrowserPlaces: () => ({ siteProfiles: { 'https://www.youtube.com': { adblockEnabled: !paused } } }),
    browserTabs: new Map([['test', tab]]), ipcMain: { on: (_name, fn) => { listener = fn; } } };
  vm.runInNewContext(main.slice(start, end), context);
  const listenerStart = main.indexOf("ipcMain.on('browser:youtube-guard:policy'");
  vm.runInNewContext(main.slice(listenerStart, main.indexOf('\n});', listenerStart) + 4), context);
  const call = (eventSender = sender, eventFrame = frame) => {
    let reply, replies = 0;
    const event = { sender: eventSender, senderFrame: eventFrame,
      set returnValue(value) { if (replies++ === 0) reply = value; } };
    listener(event); assert.equal(replies, 1, 'Electron sync IPC must reply exactly once'); return reply.enabled;
  };
  assert.equal(call(), true);
  paused = true; assert.equal(call(), false);
  paused = false; requested = false; assert.equal(call(), false);
  requested = true; assert.equal(call(sender, { url: frame.url }), false, 'subframe must not request policy');
  assert.equal(call({ mainFrame: frame, isDestroyed: () => false }), false, 'foreign WebContents must be rejected');
  tab.siteOverrideOrigin = 'https://www.youtube.com'; tab.siteOverrides = { adblockEnabled: false };
  assert.equal(call(), false);
  console.log('youtube-ad-guard: initial data, JSON/fetch/XHR, SPA cards, teardown and host boundary passed');
}
run().catch(error => { console.error(error); process.exitCode = 1; });
