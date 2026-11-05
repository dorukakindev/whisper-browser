'use strict';

// R322-c: subtitleSourceTime / subtitleVideoTime yerel-oynatıcı ve tarayıcı
// dönüşümleri — offset çift yönlü ve tek noktadan tutarlı olmalı; bozuk
// browserSubtitleSync sarmalıcısı hatayı yutup ham değere düşmeli.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeContext({ sync = null } = {}) {
  const context = {
    player: { workspaceMode: 'local', offset: 42 },
    browserSubtitleSync: sync,
    browserTransformForChannel: () => ({ scale: 2, offsetSeconds: 5 }),
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
  const start = source.indexOf('function subtitleSourceTime(');
  const end = source.indexOf('function browserTransformForRole(');
  assert.ok(start > 0 && end > start, 'zaman dönüşümü kaynağı bulunamadı');
  vm.runInContext(source.slice(start, end), context);
  return context;
}

test('yerel mod: kaynak↔video dönüşümü offset çevresinde tersinir', () => {
  const ctx = makeContext();
  for (const v of [0, 0.5, 42, 100.75, 3599.999]) {
    const source = ctx.subtitleSourceTime(v);
    assert.equal(source, v - 42);
    assert.equal(ctx.subtitleVideoTime(source), v);
  }
});

test('sonlu olmayan girdi NaN kalır (bölme/if karışmaz)', () => {
  const ctx = makeContext();
  assert.ok(Number.isNaN(ctx.subtitleSourceTime(NaN)));
  assert.ok(Number.isNaN(ctx.subtitleVideoTime(Infinity)));
  assert.ok(Number.isNaN(ctx.subtitleSourceTime('abc')));
});

test('tarayıcı modu: eşitleme sarmalıcısına delege eder, hata verirse ham değere düşer', () => {
  const ctx = makeContext();
  ctx.player.workspaceMode = 'browser';
  // Gerçek modül sözleşmesi (src/browser-subtitle-sync.js:62-73):
  // video = source*scale + offset; source = (video - offset)/scale.
  ctx.browserSubtitleSync = {
    videoToSourceTime: (v, t) => (v - t.offsetSeconds) / t.scale,
    sourceToVideoTime: (v, t) => v * t.scale + t.offsetSeconds,
  };
  // transform scale=2, offset=5 → source = (video-5)/2
  assert.equal(ctx.subtitleSourceTime(10), 2.5);
  assert.equal(ctx.subtitleVideoTime(10), 25);

  ctx.browserSubtitleSync = { videoToSourceTime() { throw new Error('bozuk'); }, sourceToVideoTime() { throw new Error('bozuk'); } };
  assert.equal(ctx.subtitleSourceTime(7), 7, 'hata yutulup ham değer dönmeli');
  assert.equal(ctx.subtitleVideoTime(9), 9, 'hata yutulup ham değer dönmeli');
});

test('browser projection may reuse one current transform without repeating source identity work', () => {
  const ctx = makeContext({ sync: require('../src/browser-subtitle-sync') });
  ctx.player.workspaceMode = 'browser';
  let reads = 0;
  ctx.browserTransformForChannel = () => { reads++; return { scale: 2, offsetSeconds: 5 }; };
  const transform = { scale: .5, offsetSeconds: 7 };
  assert.equal(ctx.subtitleVideoTime(10, true, transform), 12);
  assert.equal(reads, 0);
  assert.equal(ctx.subtitleVideoTime(10, true), 25);
  assert.equal(reads, 1);
  assert.equal(ctx.subtitleVideoTime(10, true, { scale: -1 }), 10, 'invalid transform retains raw-time fallback');
  ctx.browserTransformForChannel = () => { reads++; throw new Error('lookup failed'); };
  const fallback = ctx.subtitleVideoTransform(true);
  assert.equal(reads, 2); assert.equal(ctx.subtitleVideoTime(10, true, fallback), 10);
  assert.equal(ctx.subtitleVideoTime(12, true, fallback), 12); assert.equal(reads, 2, 'failed lookup is not repeated for endpoints');
});
