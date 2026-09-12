'use strict';

const assert = require('node:assert/strict');
const {
  browserMediaCandidateRank,
  compareBrowserMediaCandidates,
} = require('../src/browser-media-selection');

const hero = {
  tagName: 'VIDEO', clientWidth: 1920, clientHeight: 1080,
  paused: false, ended: false, muted: true, volume: 0, readyState: 4, duration: 30,
};
const player = {
  tagName: 'VIDEO', clientWidth: 1280, clientHeight: 720,
  paused: true, ended: false, muted: false, volume: 1, readyState: 4, duration: 3600,
};
assert(browserMediaCandidateRank(player)[0] > browserMediaCandidateRank(hero)[0]);
assert(compareBrowserMediaCandidates(player, hero) < 0,
  'sessiz hero videosu asıl sesli oynatıcıyı gasp etmemeli');

const mutedPlayer = { ...player, paused: false, muted: true, volume: 0 };
assert(browserMediaCandidateRank(mutedPlayer)[0] > 0,
  'kullanıcının sessize aldığı tek görünür oynatıcı kullanılabilir kalmalı');
console.log('browser-media-selection: audible player priority passed');
