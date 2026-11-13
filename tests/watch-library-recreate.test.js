'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { createWatchLibraryStore } = require('../src/watch-library-store');

function fixture(t) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-watch-recreate-'));
  t.after(() => fs.rmSync(dir, { recursive: true, force: true }));
  const filePath = path.join(dir, 'watch-library.json');
  return { open: () => createWatchLibraryStore({ filePath }) };
}
function progress(item, position, sequence = 1) {
  return { key: item.key, position, prefs: { speed: 3 }, _watchMutation: {
    kind: 'progress', writerId: 'synthetic-renderer', sequence,
    baseItemRevision: item.revision, allowCreate: false,
  } };
}

for (const method of ['restore', 'replaceItems']) {
  test(`${method}: a delayed old progress/close snapshot cannot overwrite a restored record after disk reopen`, t => {
    const f = fixture(t), store = f.open();
    const old = store.upsert({ key: 'file:a', position: 10, prefs: { speed: 1 } });
    const delayed = progress(old, 90);
    store.remove(old.key);
    if (method === 'restore') store.restore({ key: old.key, position: 25, prefs: { speed: 1.5 } });
    else store.replaceItems([{ ...old, position: 25, prefs: { speed: 1.5 } }], { restoreRemoved: true });
    const reopened = f.open();
    assert.equal(reopened.upsert(delayed), null);
    assert.equal(reopened.upsert({ ...delayed, _watchMutation: { ...delayed._watchMutation, kind: 'close-progress' } }), null);
    assert.equal(f.open().loadAll()[0].position, 25);
    assert.equal(f.open().loadAll()[0].prefs.speed, 1.5);
    const restored = reopened.loadAll()[0];
    assert(reopened.upsert(progress(restored, 30, 2)), 'new-generation progress remains writable');
    assert(reopened.upsert(progress(restored, 35, 3)), 'queued writes from the same generation remain writable');
    assert.equal(f.open().loadAll()[0].position, 35);
  });
}

test('legacy unstamped edits and ordinary queued snapshots retain their existing contract', t => {
  const store = fixture(t).open();
  const initial = store.upsert({ key: 'file:a', position: 1 });
  assert(store.upsert(progress(initial, 2)));
  assert(store.upsert(progress(initial, 3, 2)));
  store.remove(initial.key);
  const restored = store.restore({ key: initial.key, position: 4 });
  assert(store.upsert({ key: initial.key, title: 'Legacy manual edit' }));
  assert(store.upsert({ ...progress(restored, 5, 3), _createdRevision: 0 }));
  assert.equal(store.upsert(progress(initial, 99, 4)), null, 'incoming snapshots cannot lower the generation floor');
  assert.equal(store.loadAll()[0].position, 5);
});
