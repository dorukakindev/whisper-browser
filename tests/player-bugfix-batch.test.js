'use strict';
// Rapor düzeltmeleri: iptal beklemesi, ilk sarma, ffmpeg tırnağı, Backspace, basılı tutma hızı, önizleme tombstone.
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const { spawn } = require('node:child_process');
const { terminateProcessTreeAndWait } = require('../src/process-lifecycle');
const Model = require('../src/renderer/player-workspace-model');
const read = (f) => fs.readFileSync(require.resolve('../' + f), 'utf8');

test('doğal kapanmış süreç iptali 6,5 sn beklemeden onaylanır', async () => {
  const child = spawn(process.execPath, ['-e', '0'], { stdio: ['ignore', 'pipe', 'pipe'] });
  child.stdout.resume(); child.stderr.resume();
  await new Promise((resolve) => child.once('close', resolve));
  const started = Date.now();
  assert.equal(await terminateProcessTreeAndWait(child), true);
  assert.ok(Date.now() - started < 1000);
});

test('süre henüz bilinmezken seek reddedilmez', () => {
  const src = read('src/renderer/player-workspace-model.js');
  assert.match(src, /snap\.duration > 0 && command\.time > snap\.duration/);
  assert.equal(typeof Model.createPlayerWorkspaceBridge, 'function');
});

test('ffmpeg subtitles filtresi tek tırnağı kapat-kaçır-aç biçiminde kaçırır', () => {
  const src = read('src/main.js');
  const body = src.slice(src.indexOf('function ffSubtitlesArg'), src.indexOf('function stageBurninSubtitle'));
  const fn = new Function(body + '; return ffSubtitlesArg;')();
  assert.equal(fn("C:\\Users\\O'Connor\\a.srt"), "subtitles='C\\:/Users/O'\\''Connor/a.srt'");
});

test('Backspace yalnız odak serbestken kapatır; basılı tutma hızı yavaşlatmaz; başarısız önizleme tekrar denenmez', () => {
  const src = read('src/renderer/renderer.js');
  assert.match(src, /const focusFree = e\.target === document\.body/);
  const expression=src.match(/heldRate = ([^;]+);[^\n]*zaten h/)[1];
  const held=new Function('prevRate','return '+expression);
  for(const [before,after] of [[1,2],[2,3],[4,4],[8,8]])assert.equal(held(before),after);
  assert.match(src, /player\.seekLocalFailed\?\.has\(key\)/);
  assert.match(src, /if \(video\.muted\) video\.muted = false; setPlayerVolume\(video\.volume \+ 0\.05\)/);
});
