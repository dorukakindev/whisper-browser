'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { JSDOM } = require('jsdom');

test('home entries reuse active shelf audio before considering an old browser or local workspace', async () => {
  const dom = new JSDOM('<div id="playerLayer" class="hidden"></div>', {runScripts:'outside-only'}), w = dom.window;
  const calls = [];
  w.player = {browserPageUrl:'https://open.spotify.com/episode/old', mediaKey:'old-local'};
  w.MediaShelfUI = {readSnapshot:() => ({mediaKey:'active-rss',generation:3})};
  w.CinemaSahne = {openShelf:async options => {calls.push(options.mode);return {ok:true};}};
  w.PlayerUiKit = {iconButton:() => w.document.createElement('button')};
  w.eval(fs.readFileSync(require.resolve('../src/renderer/podcast-link-ui'), 'utf8'));
  assert.equal((await w.PodcastLinkUI.enter('podcast')).ok, true);
  assert.equal((await w.PodcastLinkUI.enter('bilingual')).ok, true);
  assert.deepEqual(calls, ['podcast','study']);
  assert.equal(w.document.querySelector('dialog'), null);
  dom.window.close();
});
