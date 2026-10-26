'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function fixture(reduced = false) {
  const events = {}, preference = { matches: reduced, addEventListener: (_, fn) => events.change = fn };
  const window = { matchMedia: () => preference, addEventListener: (name, fn) => events[name] = fn };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/renderer/ui-motion.js'), 'utf8'), {
    window, getComputedStyle: () => ({ opacity: '.82', translate: '0px 2px' }),
  });
  const animations = [];
  const node = { isConnected: true, animate(frames, options) {
    let resolve;
    const animation = { frames, options, cancelled: false, finished: new Promise(r => resolve = r),
      cancel() { this.cancelled = true; resolve(); }, finish: () => resolve() };
    animations.push(animation); return animation;
  } };
  return { api: window.UiMotion, preference, events, node, animations };
}
test('rapid navigation replaces motion without leaving a stale animation in control', async () => {
  const f = fixture(); f.api.reveal(f.node); f.api.reveal(f.node);
  assert.equal(f.animations[0].cancelled, true);
  assert.equal(f.animations[1].frames[0].opacity, '.82');
  await Promise.resolve();
  f.api.stop(f.node);
  assert.equal(f.animations[1].cancelled, true);
});
test('reduced motion skips animation and changing preference cancels existing motion', () => {
  const f = fixture(true); f.api.reveal(f.node); assert.equal(f.animations.length, 0);
  f.preference.matches = false; f.api.reveal(f.node);
  f.preference.matches = true; f.events.change();
  assert.equal(f.animations[0].cancelled, true);
});
test('detached content stays inactive and leaving the document cancels live motion', () => {
  const f = fixture(); f.node.isConnected = false; f.api.reveal(f.node); assert.equal(f.animations.length, 0);
  f.node.isConnected = true; f.api.reveal(f.node, 'panel');
  assert.equal(f.animations[0].frames[0].translate, 'none');
  f.events.pagehide(); assert.equal(f.animations[0].cancelled, true);
});
