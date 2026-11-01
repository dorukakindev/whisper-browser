'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const vm = require('node:vm');
const fs = require('node:fs');
const path = require('node:path');
function fixture(reduced = false, tokens = {}) {
  const events = {}, preference = { matches: reduced, addEventListener: (_, fn) => events.change = fn };
  const window = { matchMedia: () => preference, addEventListener: (name, fn) => events[name] = fn };
  vm.runInNewContext(fs.readFileSync(path.join(__dirname, '../src/renderer/ui-motion.js'), 'utf8'), {
    window, getComputedStyle: () => ({ opacity: '.82', translate: '0px 2px', getPropertyValue: name => tokens[name] || '' }),
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


test('CSS motion tokens control finite section and panel entry without changing reentry origin', () => {
  const tokens = { '--ui-motion-surface': ' .24s ', '--ui-motion-panel': '120ms',
    '--ui-motion-section-offset': '3px', '--ui-motion-panel-offset': '1px',
    '--ui-motion-ease': 'cubic-bezier(0.1, 0.7, 0.2, 1)' };
  const f = fixture(false, tokens);
  f.api.reveal(f.node);
  assert.equal(f.animations[0].options.duration, 240);
  assert.equal(f.animations[0].options.easing, tokens['--ui-motion-ease']);
  assert.equal(f.animations[0].frames[0].translate, '0 3px');
  tokens['--ui-motion-panel'] = '140ms';
  f.api.reveal(f.node, 'panel');
  assert.equal(f.animations[0].cancelled, true);
  assert.equal(f.animations[1].options.duration, 140);
  assert.equal(f.animations[1].frames[0].translate, '0px 2px');
  f.api.stop(f.node);
  f.api.reveal(f.node, 'panel');
  assert.equal(f.animations[2].frames[0].translate, '0 1px');
  f.preference.matches = true;
  f.events.change();
  assert.equal(f.animations[2].cancelled, true);
});

test('absent, malformed and unbounded CSS tokens use safe timing and offset defaults', () => {
  for (const tokens of [{}, { '--ui-motion-surface': '-10ms', '--ui-motion-panel': 'Infinityms',
    '--ui-motion-section-offset': 'calc(4px + 1em)', '--ui-motion-panel-offset': '100px',
    '--ui-motion-ease': 'cubic-bezier(2, 0, -1, 1)' },
    { '--ui-motion-surface': '99999s', '--ui-motion-panel': 'auto',
      '--ui-motion-section-offset': 'NaNpx', '--ui-motion-ease': 'not-an-easing' }]) {
    const f = fixture(false, tokens);
    f.api.reveal(f.node);
    assert.equal(f.animations[0].options.duration, 180);
    assert.equal(f.animations[0].options.easing, 'cubic-bezier(.2,.8,.2,1)');
    assert.equal(f.animations[0].frames[0].translate, '0 4px');
    f.api.stop(f.node);
    f.api.reveal(f.node, 'panel');
    assert.equal(f.animations[1].options.duration, 160);
    assert.equal(f.animations[1].frames[0].translate, 'none');
  }
});
