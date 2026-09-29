'use strict';
// R279 derin tur — worklet buffer aşırı/altta-dolum + saat/flush sözleşmesi.
// vm ile gerçek worklet kodu koşulur; ortam (sampleRate, currentTime)
// senaryo başına kontrollü.
const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const SOURCE = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'live-asr-worklet.js'), 'utf8');

function makeProcessor({ sampleRate = 16000 } = {}) {
  const messages = [];
  let Processor;
  class AudioWorkletProcessor {
    constructor() { this.port = { postMessage: (m) => messages.push(m), onmessage: null }; }
  }
  const context = {
    AudioWorkletProcessor, Int16Array, Math, Number, Float32Array,
    sampleRate, currentTime: 0,
    registerProcessor: (name, value) => { assert.equal(name, 'whisper-pcm-capture'); Processor = value; },
  };
  vm.runInNewContext(SOURCE, context);
  return { processor: new Processor(), messages, context };
}

const sync = (p, msg) => p.port.onmessage({ data: { type: 'sync', ...msg } });
const feed = (p, ctx, blocks, { amp = 0.1, channels = 1, blockLen = 128 } = {}) => {
  for (let b = 0; b < blocks; b += 1) {
    ctx.currentTime += blockLen / ctx.sampleRate;
    const chans = Array.from({ length: channels }, () => new Float32Array(blockLen).fill(amp));
    assert.equal(p.process([chans]), true);
  }
};
const chunks = (messages) => messages.filter((m) => m.type === 'chunk');

let passed = 0;
const ok = (name, fn) => { fn(); passed += 1; console.log(`  PASS ${name}`); };

// Mevcut temel akış (R167): 8 sn kesintisiz parça + flush sözleşmesi.
ok('temel akış: 8 sn parça, offset/rate taşınır, flush→flushed', () => {
  const { processor, messages, context } = makeProcessor();
  assert.doesNotThrow(() => processor.port.onmessage({ data: null }));
  assert.doesNotThrow(() => processor.port.onmessage({}));
  sync(processor, { time: 42, contextTime: 0, paused: false, rate: 1.5 });
  feed(processor, context, 1000);
  const chunk = chunks(messages)[0];
  assert(chunk, 'sekiz saniyede kesintisiz PCM parçası yayınlanmalı');
  assert.equal(chunk.pcm.byteLength, 16000 * 8 * 2);
  // feed() currentTime'ı blok sonuna ilerletir — ilk örnek ~yarım blok sonrası.
  assert(Math.abs(chunk.offset - 42) < 0.05, `offset ${chunk.offset} ≈ 42 bekleniyordu`);
  assert.equal(chunk.rate, 1.5);
  processor.port.onmessage({ data: { type: 'flush' } });
  assert(messages.some((m) => m.type === 'flushed'));
});

// Aşırı-dolum: 8 sn buffer dolunca erken flush; tek örnek kaybı yok,
// length hiçbir zaman kapasiteyi aşmaz (yazma→kontrol sırası).
ok('aşırı-dolum: kesintisiz sesde 8 sn üst sınırında flush', () => {
  const { processor, messages, context } = makeProcessor();
  sync(processor, { time: 0, contextTime: 0, paused: false, rate: 1 });
  feed(processor, context, 3000); // ~24 sn
  const list = chunks(messages);
  assert(list.length >= 3, `en az 3 parça bekleniyordu, ${list.length}`);
  assert(list.every((c) => c.pcm.byteLength <= 16000 * 8 * 2), 'parça 8 sn sınırını aştı');
  assert(list.every((c) => c.pcm.byteLength % 2 === 0), 'tek baytlık parça');
});

// Sessizlik sınırı: 4 sn + 0.2 sn sessizlik → erken flush.
ok('sessizlik sınırı: ≥4 sn sonra 0.2 sn sessizlikte erken flush', () => {
  const { processor, messages, context } = makeProcessor();
  sync(processor, { time: 0, contextTime: 0, paused: false, rate: 1 });
  feed(processor, context, 500, { amp: 0.4 });   // 4 sn yüksek
  assert.equal(chunks(messages).length, 0, 'sessizlik gelmeden flush olmamalı');
  feed(processor, context, 80, { amp: 0.0001 }); // ~0.64 sn sessizlik
  assert.equal(chunks(messages).length, 1, 'sessizlik sınırında flush bekleniyordu');
});

// Pause: çekim durur; duraklama geçişi önceki buffer'ı flush eder.
ok('pause: duraklamada çekim yok; geçiş synci bufferı boşaltır', () => {
  const { processor, messages, context } = makeProcessor();
  sync(processor, { time: 0, contextTime: 0, paused: false, rate: 1 });
  feed(processor, context, 100);
  sync(processor, { time: 5, contextTime: context.currentTime, paused: true, rate: 1 });
  const afterPauseSync = chunks(messages).length;
  assert.equal(afterPauseSync, 1, 'duraklama geçişinde parça yayınlanmalı');
  feed(processor, context, 200);
  assert.equal(chunks(messages).length, afterPauseSync, 'duraklamada yeni parça olmamalı');
  sync(processor, { time: 5, contextTime: context.currentTime, paused: false, rate: 1 });
  feed(processor, context, 2000); // ~16 sn — 8 sn sınırını aşar
  assert(chunks(messages).length > afterPauseSync, 'sürdürme sonrası çekim devam etmeli');
});

// Drift: |Δt|>0.75 flush + sum/weight sıfırlanır; küçük sapmada devam.
ok('drift: 0.75 sn üzeri sapma bufferı boşaltır, altı boşaltmaz', () => {
  const { processor, messages, context } = makeProcessor();
  sync(processor, { time: 0, contextTime: 0, paused: false, rate: 1 });
  feed(processor, context, 100);
  // Küçük sapma: zaman saatinde 0.2 sn kayma — flush yok.
  sync(processor, { time: context.currentTime + 0.2, contextTime: context.currentTime, paused: false, rate: 1 });
  assert.equal(chunks(messages).length, 0, 'küçük sapma flush tetiklememeli');
  feed(processor, context, 50);
  // Büyük seek: medya +30 sn ileri sıçradı.
  sync(processor, { time: 200, contextTime: context.currentTime, paused: false, rate: 1 });
  assert.equal(chunks(messages).length, 1, 'seek drift eski bufferı boşaltmalı');
  const fresh = chunks(messages)[0];
  assert(fresh.offset < 0.1, `eski parça eski saatle yayınlanmalı, offset=${fresh.offset}`);
  feed(processor, context, 20);
  // Yeni parçanın offset'i yeni saat ekseninde.
  const next = () => chunks(messages).length;
  feed(processor, context, 1200); // ~9.6 sn — 8 sn sınırını aşar
  assert(next() >= 2, 'drift sonrası yeni parçalar gelmeli');
  const last = chunks(messages).at(-1);
  assert(last.offset >= 199 && last.offset <= 210, `yeni offset eski eksende kaldı: ${last.offset}`);
});

// Hız kelepçesi: rate aralık dışıysa [0.0625, 16]'ya sıkıştırılır.
ok('hız kelepçesi: rate 100→16, 0.001→0.0625', () => {
  const { processor, messages, context } = makeProcessor();
  sync(processor, { time: 0, contextTime: 0, paused: false, rate: 100 });
  feed(processor, context, 2000);
  assert.equal(chunks(messages)[0].rate, 16);
  processor.port.onmessage({ data: { type: 'flush' } });
  sync(processor, { time: 0, contextTime: context.currentTime, paused: false, rate: 0.001 });
  feed(processor, context, 2000);
  const last = chunks(messages).at(-1);
  assert.equal(last.rate, 0.0625);
});

// Bozuk sync/NaN alanlar görmezden gelinir; süreç çökmez.
ok('bozuk sync alanları reddedilir (NaN time/contextTime)', () => {
  const { processor, messages, context } = makeProcessor();
  sync(processor, { time: NaN, contextTime: 0, paused: false, rate: 1 });
  feed(processor, context, 100);
  assert.equal(chunks(messages).length, 0, 'NaN saatle çekim başlamamalı');
  sync(processor, { time: 10, contextTime: NaN, paused: false, rate: 1 });
  feed(processor, context, 100);
  assert.equal(chunks(messages).length, 0, 'NaN contextTime reddedilmeli');
  sync(processor, { time: 10, contextTime: context.currentTime, paused: false, rate: 1 });
  feed(processor, context, 2000);
  assert(chunks(messages).length >= 1, 'geçerli sync sonrası çekim çalışmalı');
});

// Aşırı genlik: ±1'i aşan örnekler int16 aralığına kelepçelenir.
ok('genlik kelepçesi: >1 örnekler int16 sınırına sıkıştırılır', () => {
  const { processor, messages, context } = makeProcessor();
  sync(processor, { time: 0, contextTime: 0, paused: false, rate: 1 });
  feed(processor, context, 3000, { amp: 4 });   // taşan genlik
  const pcm = new Int16Array(chunks(messages)[0].pcm);
  assert([...pcm.slice(0, 100)].every((v) => v <= 32767 && v >= -32768), 'int16 dışı örnek');
  assert.equal(pcm[0], 32767);
});

// Kanal karışımı: çok kanal ortalaması alınır; kanal sayısı değişse çökmez.
ok('çok-kanal karışımı + kanal sayısı değişimi güvenli', () => {
  const { processor, messages, context } = makeProcessor();
  sync(processor, { time: 0, contextTime: 0, paused: false, rate: 1 });
  // Stereo: L=0.2, R=-0.2 → ortalama 0 (sessizlik)
  for (let b = 0; b < 300; b += 1) {
    context.currentTime += 128 / 16000;
    const L = new Float32Array(128).fill(0.2), R = new Float32Array(128).fill(-0.2);
    processor.process([[L, R]]);
  }
  // Kanalsız kare + boş giriş — çökme yok.
  assert.equal(processor.process([[]]), true);
  assert.equal(processor.process([]), true);
  feed(processor, context, 3000, { amp: 0.3 });
  assert(chunks(messages).length >= 1);
  const pcm = new Int16Array(chunks(messages).at(-1).pcm);
  // Son parçanın son örneği yüksek genlikli bölgeden gelir.
  assert.equal(pcm[pcm.length - 1], Math.round(0.3 * 32767));
});

// Altta-dolum: seyrek kısa bloklar 8 sn'de dolmadan flush'lanmaz (sessizlik
// sınırı dışında); 'flush' mesajı kısmi bufferı boşaltır.
ok('altta-dolum: kısmi buffer yalnız flush mesajı/sınırıyla boşalır', () => {
  const { processor, messages, context } = makeProcessor();
  sync(processor, { time: 0, contextTime: 0, paused: false, rate: 1 });
  feed(processor, context, 100, { amp: 0.3 }); // ~0.8 sn — eşikler altında
  assert.equal(chunks(messages).length, 0, 'kısmi buffer erken flush olmamalı');
  processor.port.onmessage({ data: { type: 'flush' } });
  const flushed = chunks(messages);
  assert.equal(flushed.length, 1, 'flush mesajı kısmi bufferı boşaltmalı');
  assert(flushed[0].pcm.byteLength < 16000 * 8 * 2, 'kısmi parça tam-boy olmamalı');
  assert(messages.some((m) => m.type === 'flushed'));
});

// 'flush' sonrası saat sıfırlanır: sonraki process çağrıları üretim yapmaz.
ok('flush sonrası saat temizlenir — senkron yoksa çekim durur', () => {
  const { processor, messages, context } = makeProcessor();
  sync(processor, { time: 0, contextTime: 0, paused: false, rate: 1 });
  feed(processor, context, 2000);
  processor.port.onmessage({ data: { type: 'flush' } });
  const n = chunks(messages).length;
  feed(processor, context, 500);
  assert.equal(chunks(messages).length, n, 'saatsiz çekim üretim yapmamalı');
});

// Tek-örnek sınırı: buffer dolunca bir örnek kaybı olmadan tam sınırda flush.
ok('tam sınır: parça tam 16000*8 örneğinde flush edilir', () => {
  const { processor, messages, context } = makeProcessor();
  sync(processor, { time: 0, contextTime: 0, paused: false, rate: 1 });
  feed(processor, context, 3000, { amp: 0.5 });
  const first = chunks(messages)[0];
  assert.equal(first.pcm.byteLength, 16000 * 8 * 2, 'ilk parça tam kapasitede olmalı');
});

// Yüksek oran (16x): saat tahmini aynı aralığı kabul eder (yorumdaki sözleşme).
ok('16x hızda drift-flush spamı yok (sync aralığı kabul edilir)', () => {
  const { processor, messages, context } = makeProcessor();
  sync(processor, { time: 0, contextTime: 0, paused: false, rate: 16 });
  for (let b = 0; b < 50; b += 1) {
    context.currentTime += 128 / 16000;
    // Üretimdeki sync her medya olayında gerçek saatle gelir; 16x'te
    // time 16x hızla ilerler — predicted buna uyum sağlamalı.
    sync(processor, { time: context.currentTime * 16, contextTime: context.currentTime, paused: false, rate: 16 });
    processor.process([[new Float32Array(128).fill(0.2)]]);
  }
  assert.equal(chunks(messages).length, 0, 'uyumlu saatte gereksiz flush olmamalı');
});

console.log(`live-asr-worklet: ${passed} test`);
process.exit(0);
