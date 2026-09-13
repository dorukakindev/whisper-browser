const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const {performance} = require('node:perf_hooks');
const sync = require('../src/browser-subtitle-sync');
const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');
const block = renderer.slice(renderer.indexOf('function findCueAt('), renderer.indexOf('function applyPlaybackLearningPolicy('));
const findCueAt = new Function(block + '; return findCueAt;')();
// İki saat boyunca saniyede iki blok: sık seek, boşluk ve kanal senkronu.
const cues = Array.from({length: 14400}, (_, i) => ({id: String(i), start: i*.5, end: i*.5+.4, text: `Satır ${i}`}));
const transform = sync.calculateTwoPointTransform({sourceTime: 10, videoTime: 10.51}, {sourceTime: 7190, videoTime: 7197.69});
assert(Math.abs(transform.scale - 1.001) < 1e-12);
const start = performance.now();
let hint = -1;
for (let n=0;n<30000;n++) {
  const i=(n*7919)%cues.length;
  const sourceTime=cues[i].start+.2;
  const videoTime=sync.sourceToVideoTime(sourceTime, transform);
  hint=findCueAt(cues,sync.videoToSourceTime(videoTime,transform),hint);
  assert.equal(hint,i,'Sık ileri/geri sarmada yanlış blok');
  assert.equal(findCueAt(cues,cues[i].start+.45,hint),-1,'Altyazısız aralıkta eski blok kaldı');
}
const elapsed=performance.now()-start;
const exported=sync.transformCuesForExport(cues,transform);
assert.equal(exported.length,cues.length);
assert(Math.abs(exported.at(-1).start-sync.sourceToVideoTime(cues.at(-1).start,transform))<.002);
assert.equal(cues.at(-1).start,7199.5,'Dışa aktarma kaynak zamanlarını değiştirdi');
console.log(`İki saatlik zaman çizelgesi: 14.400 blok, 30.000 seek + boşluk kontrolü ${elapsed.toFixed(0)} ms; drift ve dışa aktarma geçti.`);
