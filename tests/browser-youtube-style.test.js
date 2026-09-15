'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {
  YOUTUBE_APPEARANCE_CSS,
  YOUTUBE_HIDE_SHORTS_CSS,
  isYoutubePageUrl,
  youtubeStyleCss,
} = require('../src/browser-youtube-style');

assert.equal(isYoutubePageUrl('https://www.youtube.com/watch?v=abc'), true);
assert.equal(isYoutubePageUrl('https://music.youtube.com/'), true);
assert.equal(isYoutubePageUrl('https://m.youtube.com/shorts/abc'), true);
assert.equal(isYoutubePageUrl('https://youtube.com.evil.example/watch'), false);
assert.equal(isYoutubePageUrl('javascript:alert(1)'), false);
assert.equal(isYoutubePageUrl('not a url'), false);
assert.match(YOUTUBE_APPEARANCE_CSS, /ytd-masthead#masthead/);
assert.match(YOUTUBE_APPEARANCE_CSS, /grid-template-columns:\s*repeat\(5/);
assert.match(YOUTUBE_APPEARANCE_CSS, /@media \(max-width: 860px\)/);
assert.match(YOUTUBE_HIDE_SHORTS_CSS, /ytd-reel-shelf-renderer/);
assert.match(YOUTUBE_HIDE_SHORTS_CSS, /a\[href\*="\/shorts\/"\]/);
assert.doesNotMatch(YOUTUBE_HIDE_SHORTS_CSS, /ytd-promoted|player-ads|ad-slot/i,
  'Shorts filtresi reklam veya tanıtım öğelerini hedeflememeli.');
assert.equal(youtubeStyleCss({ appearance: false, hideShorts: false }), '');
assert.match(youtubeStyleCss({ appearance: false, hideShorts: true }), /ytd-reel-shelf-renderer/);
assert.doesNotMatch(youtubeStyleCss({ appearance: false, hideShorts: true }), /ytd-masthead#masthead/);

const root = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(root, 'src/main.js'), 'utf8');
const renderer = fs.readFileSync(path.join(root, 'src/renderer/renderer.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src/renderer/index.html'), 'utf8');
const registry = fs.readFileSync(path.join(root, 'src/browser-settings-registry.js'), 'utf8');
assert.match(main, /command === 'page-youtube-style'/);
assert.match(main, /removeInsertedCSS\(tab\.youtubeStyleCssKey\)/);
assert.match(main, /youtubeStyleRequestSeq !== requestSeq/);
assert.match(main, /!isYoutubePageUrl\(wc\.getURL\(\)\)/);
assert.match(renderer, /scheduleBrowserYoutubeStyleSync\(\)/);
assert.match(renderer, /'browserYoutubeAppearance', 'browserYoutubeHideShorts'/);
assert.match(html, /id="browserYoutubeAppearance" checked/);
assert.match(html, /id="browserYoutubeHideShorts" checked/);
assert.match(registry, /id: 'browserYoutubeAppearance'/);
assert.match(registry, /id: 'browserYoutubeHideShorts'/);

console.log('browser-youtube-style: 25 test');