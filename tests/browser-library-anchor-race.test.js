'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
const start = source.indexOf('async function restorePendingLibraryAnchor(');
const end = source.indexOf('function showBrowserErrorSurface(', start);
assert(start >= 0 && end > start, 'Alıntı ankrajı geri yükleme işlevi bulunamadı.');

let resolveFirst;
const first = new Promise((resolve) => { resolveFirst = resolve; });
let calls = 0;
const notices = [];
const player = {
  browserActiveTabId: 'tab-a',
  pendingLibraryAnchor: {
    sequence: 7,
    annotationId: 'note-1',
    mediaId: 'film-1',
    expiresAt: Date.now() + 60_000,
    restoring: false,
    loginNotified: false,
  },
};
const context = {
  Date,
  player,
  browserTabState: () => ({ mediaId: 'browser:film-1' }),
  logLine: (message, level) => notices.push({ message, level }),
  osd: (message) => notices.push({ message, level: 'osd' }),
  window: { api: { restoreLearningAnnotationAnchor: async () => {
    calls += 1;
    return calls === 1 ? first : { ok: true };
  } } },
};
vm.createContext(context);
vm.runInContext(source.slice(start, end), context);

(async () => {
  const inFlight = context.restorePendingLibraryAnchor({ mediaId: 'browser:film-1' });
  assert.equal(player.pendingLibraryAnchor.restoring, true);
  player.browserActiveTabId = 'tab-b';
  resolveFirst({ ok: true });
  await inFlight;
  assert.equal(player.pendingLibraryAnchor.restoring, false,
    'Sekme değişimi bekleyen ankrajı kalıcı olarak kilitledi.');
  assert.equal(calls, 1);

  player.browserActiveTabId = 'tab-a';
  await context.restorePendingLibraryAnchor({ mediaId: 'browser:film-1' });
  assert.equal(calls, 2, 'Sekmeye dönünce ankraj yeniden denenmedi.');
  assert.equal(player.pendingLibraryAnchor, null);
  assert.equal(notices.at(-1).message, 'Alıntı bulundu');
  console.log('browser-library-anchor-race: passed');
})().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
