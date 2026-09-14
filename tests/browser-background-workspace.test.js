'use strict';
const assert = require('node:assert/strict'), fs = require('node:fs'), vm = require('node:vm');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/renderer/renderer.js'), 'utf8');
const start = source.indexOf("if (event.type === 'navigation') {", source.indexOf("if (event.tabId !== player.browserActiveTabId) {"));
const end = source.indexOf("} else if (event.type === 'title')", start);
const branch = source.slice(start, end) + '}';
function run(mediaId, url) {
  const cues = [{ text: 'Korunan altyazı' }];
  const tab = { id: 'background', mediaId: 'movie-1', url: 'https://video.test/watch?t=0', cues, sync: .4 };
  vm.runInNewContext(branch, { tab, event: { type: 'navigation', mediaId, url },
    newBrowserTabState: event => ({ ...event, cues: [], sync: 0 }) });
  return tab;
}
assert.equal(run('movie-1', 'https://video.test/watch?t=10').cues.length, 1,
  'aynı video içindeki URL değişikliği arka plan altyazısını silmemeli');
assert.equal(run('movie-1', 'https://video.test/watch?t=10').sync, .4);
assert.equal(run('movie-2', 'https://video.test/watch?t=0').cues.length, 0,
  'adres aynı olsa da yeni medya eski altyazıyı devralmamalı');
assert.equal(run('movie-2', 'https://video.test/other').cues.length, 0);
console.log('Arka plan çalışma alanı: aynı medya tercihleri korunuyor, farklı medya temizleniyor.');
