const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
const start = source.indexOf('function flushBrowserTrackPublication(');
const end = source.indexOf('function flushBrowserTrackPublications(', start);
assert(start >= 0 && end > start);

const initialTimer = { name: 'initial' };
const scheduled = [];
const cleared = [];
const published = [];
const states = ['waiting', 'stable'];
const context = {
  browserTrackPublicationTimers: new Map([['stream-1', initialTimer]]),
  browserTrackPendingPublications: new Map([['stream-1', {
    fingerprint: 'fp-1', normalized: [{ text: 'Canlı metin' }], meta: {},
  }]]),
  browserTextStability: { observe: () => ({ state: states.shift() }) },
  clearTimeout: (timer) => cleared.push(timer),
  setTimeout: (callback, delay) => {
    const timer = { callback, delay, unref() {} };
    scheduled.push(timer);
    return timer;
  },
  publishBrowserTrackNow: (entry) => { published.push(entry); return entry; },
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

assert.equal(context.flushBrowserTrackPublication('stream-1'), null);
assert.deepEqual(cleared, [initialTimer], 'çalışmış timer kaydı temizlenmedi');
assert.equal(scheduled.length, 1, 'kararsız metin için yeni kontrol zamanlanmadı');
assert.equal(scheduled[0].delay, 650);
assert.equal(context.browserTrackPublicationTimers.get('stream-1'), scheduled[0]);
scheduled[0].callback();
assert.equal(published.length, 1, 'metin sabitlenince bekleyen iz yayımlanmadı');
assert.equal(context.browserTrackPendingPublications.has('stream-1'), false);
assert.equal(context.browserTrackPublicationTimers.has('stream-1'), false);

context.browserTrackPendingPublications.set('stream-2', {
  fingerprint: 'fp-2', normalized: [{ text: 'Kapanış metni' }], meta: {},
});
context.browserTrackPublicationTimers.set('stream-2', { name: 'closing' });
assert.ok(context.flushBrowserTrackPublication('stream-2', true));
assert.equal(published.length, 2, 'yaşam döngüsü flush işlemi bekleyen izi zorla yayımlamadı');
assert.equal(scheduled.length, 1, 'zorunlu flush yeni timer üretmemeli');

console.log('browser-track-publication: bekleme yeniden zamanlandı ve kararlı iz yayımlandı.');
