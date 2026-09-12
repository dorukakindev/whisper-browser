'use strict';

const assert = require('assert');
const { createHlsRecoveryState } = require('../src/hls-recovery');

let pass = 0;
const failures = [];
function test(name, fn) {
  try { fn(); pass++; console.log(`  PASS  ${name}`); }
  catch (error) { failures.push(`${name}: ${error.message}`); console.log(`  FAIL  ${name} — ${error.message}`); }
}

function progressFor(machine, durationMs, stepMs = 250, rate = 1, startClock = 0, startMedia = 0) {
  machine.playbackStarted(startMedia, startClock);
  let result = { stable: false, reset: false };
  for (let elapsed = stepMs; elapsed <= durationMs; elapsed += stepMs) {
    result = machine.playbackProgress(startMedia + (elapsed / 1000) * rate, startClock + elapsed, rate);
  }
  return result;
}

test('ağ ve medya hakları bağımsız tüketilir ve sınırlıdır', () => {
  const machine = createHlsRecoveryState();
  machine.sourceChanged('video-a');
  const network = machine.beginRecovery('network');
  assert(network.ok);
  machine.completeRecovery(network.token);
  const media = machine.beginRecovery('media');
  assert(media.ok);
  machine.completeRecovery(media.token);
  const state = machine.snapshot();
  assert.equal(state.networkAttempts, 1);
  assert.equal(state.mediaAttempts, 1);

  const network2 = machine.beginRecovery('network');
  assert(network2.ok);
  machine.completeRecovery(network2.token);
  assert.equal(machine.beginRecovery('network').reason, 'exhausted');
  assert.equal(machine.snapshot().mediaAttempts, 1, 'ağ hakkı medya bütçesini değiştirdi');
});

test('yinelenen fatal olay tek uçuş sırasında ikinci hakkı tüketmez', () => {
  const machine = createHlsRecoveryState();
  machine.sourceChanged('video-a');
  const first = machine.beginRecovery('network');
  const duplicate = machine.beginRecovery('network');
  assert(first.ok);
  assert.equal(duplicate.reason, 'in-flight');
  assert.strictEqual(duplicate.token, first.token);
  assert.equal(machine.snapshot().networkAttempts, 1);
});

test('fatal olmayan olay bütçeyi ve kararlılık durumunu değiştirmez', () => {
  const machine = createHlsRecoveryState();
  machine.sourceChanged('video-a');
  machine.playbackStarted(12, 0);
  machine.playbackProgress(12.25, 250);
  const before = machine.snapshot();
  // Renderer fatal olmayan HLS ERROR olayında beginRecovery çağırmadan döner.
  const after = machine.snapshot();
  assert.deepEqual(after, before);
});

test('stall eski kararlılık penceresinin hakları sıfırlamasını engeller', () => {
  const machine = createHlsRecoveryState();
  machine.sourceChanged('video-a');
  const attempt = machine.beginRecovery('media');
  machine.completeRecovery(attempt.token);
  assert.equal(progressFor(machine, 9000).reset, false);
  machine.interruptStability();
  assert.equal(machine.playbackProgress(20, 10000).reset, false, 'stall sonrası geç progress eski pencereyi tamamladı');
  assert.equal(machine.snapshot().mediaAttempts, 1);
});

test('seviye geçişi sonrası yeni ve tam ilerleme penceresi gerekir', () => {
  const machine = createHlsRecoveryState();
  machine.sourceChanged('video-a');
  const attempt = machine.beginRecovery('network');
  machine.completeRecovery(attempt.token);
  assert.equal(progressFor(machine, 7500).reset, false);
  machine.interruptStability(); // LEVEL_SWITCHING
  assert.equal(progressFor(machine, 9750, 250, 1, 8000, 8).reset, false);
  assert.equal(machine.snapshot().networkAttempts, 1);
  assert.equal(progressFor(machine, 10000, 250, 1, 18000, 18).reset, true);
  assert.equal(machine.snapshot().networkAttempts, 0);
});

test('kararlı oynatma gerçek ilerlemeyle 10 saniyede iki bütçeyi de yeniler', () => {
  const machine = createHlsRecoveryState();
  machine.sourceChanged('video-a');
  for (const kind of ['network', 'media']) {
    const attempt = machine.beginRecovery(kind);
    machine.completeRecovery(attempt.token);
  }
  assert.equal(progressFor(machine, 9750).reset, false);
  assert.deepEqual(machine.snapshot().networkAttempts, 1);
  assert.equal(progressFor(machine, 10000, 250, 0.5, 11000, 30).reset, true,
    '0.5x oynatma gerçek ilerleme olmasına rağmen kararlı sayılmadı');
  const state = machine.snapshot();
  assert.equal(state.networkAttempts, 0);
  assert.equal(state.mediaAttempts, 0);
});

test('uzun event boşluğu ve seek sıçraması kararlılık ölçümüne eklenmez', () => {
  const machine = createHlsRecoveryState({ maxProgressGapMs: 1500 });
  machine.sourceChanged('video-a');
  const attempt = machine.beginRecovery('media');
  machine.completeRecovery(attempt.token);
  machine.playbackStarted(0, 0);
  machine.playbackProgress(1, 1000);
  machine.playbackProgress(20, 2000); // seek: bir saniyede 19 saniye
  assert.equal(machine.snapshot().stableElapsedMs, 0);
  machine.playbackProgress(21, 5000); // throttle: video yalnız 1 saniye ilerledi
  assert.equal(machine.snapshot().stableElapsedMs, 1000,
    'arka plan throttle aralığında yalnız kanıtlanan medya ilerlemesi sayılmalı');
  assert.equal(machine.snapshot().mediaAttempts, 1);
});

test('aynı kare örnekleri kararlılık penceresini silmez', () => {
  const machine = createHlsRecoveryState({ stableMs: 1000 });
  machine.sourceChanged('video-a');
  const attempt = machine.beginRecovery('network');
  machine.completeRecovery(attempt.token);
  machine.playbackStarted(0, 0);
  machine.playbackProgress(.25, 250);
  machine.playbackProgress(.25, 260);
  assert.equal(machine.snapshot().stableElapsedMs, 250);
  machine.playbackProgress(.5, 500);
  machine.playbackProgress(.75, 750);
  assert.equal(machine.playbackProgress(1, 1000).reset, false);
  assert.equal(machine.playbackProgress(1.01, 1010).reset, true);
});

test('kaynak değişimi geç başarı tokenını reddeder ve bütçeleri sıfırlar', () => {
  const machine = createHlsRecoveryState();
  machine.sourceChanged('video-a');
  const late = machine.beginRecovery('network');
  machine.sourceChanged('video-b');
  assert.equal(machine.isCurrent(late.token), false);
  assert.equal(machine.completeRecovery(late.token), false);
  const state = machine.snapshot();
  assert.equal(state.sourceId, 'video-b');
  assert.equal(state.networkAttempts, 0);
  assert.equal(state.networkInFlight, false);
});

test('oynatıcı kapanışı bekleyen probe sonucunu aynı medya kuşağında bile geçersiz kılar', () => {
  const machine = createHlsRecoveryState();
  machine.sourceChanged('video-a');
  const late = machine.beginRecovery('network');
  machine.deactivate();
  assert.equal(machine.isCurrent(late.token), false);
  assert.equal(machine.completeRecovery(late.token), false);
  assert.equal(machine.snapshot().active, false);
});

test('geçici ağ hatası sonrası yenileme ve kararlı oynatma tekrar kurtarılabilir durumdadır', () => {
  const machine = createHlsRecoveryState();
  machine.sourceChanged('video-a');
  const refresh = machine.beginRecovery('network');
  assert(refresh.ok, 'geçici ağ hatası yenileme başlatmadı');
  assert(machine.completeRecovery(refresh.token), 'başarılı manifest yenilemesi kabul edilmedi');
  assert.equal(progressFor(machine, 10000).reset, true, 'yenilenen yayın kararlı oynatmaya dönemedi');
  assert(machine.beginRecovery('network').ok, 'kararlı oynatmadan sonra yeni geçici hata kurtarılamıyor');
});

test('model matrisi tüm kısa olay sıralarında sınır ve token değişmezlerini korur', () => {
  const events = ['network', 'media', 'complete-network', 'complete-media', 'playing', 'progress', 'stall', 'source'];
  let sequences = 0;
  function visit(prefix, depth) {
    if (depth === 0) {
      const machine = createHlsRecoveryState();
      machine.sourceChanged('source-0');
      const tokens = { network: null, media: null };
      let source = 0;
      let clock = 0;
      let mediaTime = 0;
      for (const event of prefix) {
        const before = machine.snapshot();
        if (event === 'network' || event === 'media') {
          const result = machine.beginRecovery(event);
          if (result.ok) tokens[event] = result.token;
          if (result.reason === 'in-flight') {
            assert.equal(machine.snapshot()[`${event}Attempts`], before[`${event}Attempts`]);
          }
        } else if (event.startsWith('complete-')) {
          const kind = event.slice('complete-'.length);
          if (tokens[kind]) machine.completeRecovery(tokens[kind]);
        } else if (event === 'playing') {
          machine.playbackStarted(mediaTime, clock);
        } else if (event === 'progress') {
          clock += 250;
          mediaTime += 0.25;
          machine.playbackProgress(mediaTime, clock);
        } else if (event === 'stall') {
          machine.interruptStability();
        } else if (event === 'source') {
          machine.sourceChanged(`source-${++source}`);
        }
        const state = machine.snapshot();
        assert(state.networkAttempts >= 0 && state.networkAttempts <= 2);
        assert(state.mediaAttempts >= 0 && state.mediaAttempts <= 2);
        if (event === 'source') {
          assert.equal(state.networkAttempts, 0);
          assert.equal(state.mediaAttempts, 0);
          for (const token of Object.values(tokens)) if (token) assert.equal(machine.isCurrent(token), false);
        }
      }
      sequences++;
      return;
    }
    for (const event of events) visit(prefix.concat(event), depth - 1);
  }
  visit([], 5);
  assert.equal(sequences, events.length ** 5);
});

test('yüz ardışık hata sonsuz kurtarma döngüsü oluşturmaz', () => {
  const machine = createHlsRecoveryState();
  machine.sourceChanged('video-a');
  let started = 0;
  for (let i = 0; i < 100; i++) {
    const attempt = machine.beginRecovery('network');
    if (attempt.ok) {
      started++;
      machine.completeRecovery(attempt.token);
    }
  }
  assert.equal(started, 2);
  assert.equal(machine.snapshot().networkAttempts, 2);
});

console.log(`\n${pass} geçti, ${failures.length} başarısız (${pass + failures.length} test)`);
if (failures.length) {
  console.error('\nBaşarısız:');
  failures.forEach((failure) => console.error('  - ' + failure));
  process.exit(1);
}
