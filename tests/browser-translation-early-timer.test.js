'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { createRequire } = require('node:module');
const file = path.resolve(__dirname, '../src/browser-translation-scheduler.js');
let now = 0, nextId = 0;
const timers = new Map();
const mod = { exports: {} };
vm.runInNewContext(fs.readFileSync(file, 'utf8'), {
  module: mod, exports: mod.exports, require: createRequire(file), AbortController,
  Date: class extends Date { static now() { return now; } },
  setTimeout: (callback, delay) => { const id = ++nextId; timers.set(id, { callback, delay }); return id; },
  clearTimeout: id => timers.delete(id),
});
const flush = async () => { for (let i = 0; i < 30; i++) await Promise.resolve(); };
const fire = async timestamp => {
  now = timestamp;
  const [id, timer] = timers.entries().next().value;
  timers.delete(id); timer.callback(); await flush();
};
(async () => {
  let calls = 0, idle = false;
  const scheduler = new mod.exports.BrowserTranslationScheduler({ maxAttempts: 3, retryBaseMs: 10, retryMaxMs: 20,
    translate: async () => { calls++; throw Error('Kontrollü sağlayıcı hatası'); } });
  scheduler.setSentences([{id:'early',start:0,end:2,text:'Hello.',pieces:[{cueId:'a',start:0,end:2,text:'Hello.'}]}]);
  scheduler.updatePlayhead(0);
  const done = scheduler.whenIdle().then(() => { idle = true; });
  await flush(); assert.equal(calls,1);
  await fire(9);
  assert.equal(calls,1,'Backoff dolmadan yeni sağlayıcı isteği başlamamalı');
  assert.equal(timers.size,1,'Erken uyanan zamanlayıcı kalan süreyi tekrar beklemeli');
  assert.equal(idle,false,'Bekleyen retry varken whenIdle çözülmemeli');
  await fire(10); assert.equal(calls,2);
  await fire(29); assert.equal(calls,2); assert.equal(idle,false);
  await fire(30); await done;
  assert.equal(calls,3); assert.equal(timers.size,0);
  assert.equal(scheduler.snapshot().failures[0].terminal,true);
  console.log('Erken retry zamanlayıcısı: 3 deneme, backoff ve whenIdle sözleşmesi geçti.');
})().catch(error=>{console.error(error);process.exitCode=1;});
