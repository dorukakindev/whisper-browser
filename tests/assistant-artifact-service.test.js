'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { FILE, registerAssistantArtifacts } = require('../src/assistant-artifact-service');
const { exportPackage, readPackage, restorePackage, describePackage } = require('../src/workspace-package');

test('catalog comparison revisions persist, serialize, and round-trip in workspace backups', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'assistant-artifacts-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const rows = [{ id: 'film-one', title: 'First', kind: 'film', year: 2000 }, { id: 'film-two', title: 'Second', kind: 'series', runtime: 40 }];
  const open = () => registerAssistantArtifacts({
    app: { getPath: () => root },
    ipcMain: { handle() {} },
    authorized: sender => sender === 'owner',
    catalogStore: () => ({ list: () => rows }),
  }).handle;
  const input = { action: 'save', ids: rows.map(row => row.id), locale: 'en' };
  let handle = open();
  assert.equal((await handle('iframe', input)).ok, false);
  const created = await handle('owner', input);
  assert.equal(created.ok, true);
  const id = created.doc.id;
  assert.deepEqual(created.doc.modelBody.cells.find(cell => cell.value === '2000').claims.map(c => c.sourceId), ['film-one']);
  rows[0].year = 2001;
  const update = { ...input, id, expectedRevision: 1 };
  const [first, second] = await Promise.all([handle('owner', update), handle('owner', update)]);
  assert.equal(first.doc.revision, 2);
  assert.equal(second.code, 'revision-conflict');
  assert.equal((await handle('owner', { ...update, ids: input.ids.slice().reverse() })).code, 'source-mismatch');

  const backup = path.join(root, 'workspace.wbp');
  exportPackage(root, backup);
  const packageData = readPackage(backup);
  assert.equal(describePackage(packageData).assistantArtifacts, 1);
  const file = path.join(root, FILE);
  const before = fs.readFileSync(file, 'utf8');
  const malformed = structuredClone(packageData);
  const entry = malformed.files.find(row => row.name === FILE);
  const payload = JSON.parse(Buffer.from(entry.data, 'base64').toString('utf8'));
  payload.documents[0].modelBody.cells[0].claims[0].sourceId = 'wrong-catalog-id';
  entry.data = Buffer.from(JSON.stringify(payload)).toString('base64');
  assert.throws(() => restorePackage(root, malformed), /artifact archive/i);
  assert.equal(fs.readFileSync(file, 'utf8'), before);

  fs.unlinkSync(file);
  restorePackage(root, packageData);
  handle = open();
  assert.equal((await handle('owner', { action: 'list' })).artifacts[0].artifactId, id);
  assert.equal((await handle('owner', { action: 'get', id })).body.cells.find(cell => cell.value === '2001').colId, 'film-one');
  const restored = await handle('owner', { action: 'restore', id, expectedRevision: 2, revision: 1 });
  assert.equal(restored.doc.revision, 3);
  assert.ok(restored.doc.modelBody.cells.some(cell => cell.value === '2000'));
  rows.pop();
  assert.equal((await handle('owner', { ...input, id, expectedRevision: 3 })).code, 'source-missing');
  assert.equal((await handle('owner', { action: 'get', id })).doc.revision, 3);
  fs.writeFileSync(file, 'corrupt archive');
  assert.equal((await handle('owner', input)).code, 'archive-unavailable');
  assert.equal(fs.readFileSync(file, 'utf8'), 'corrupt archive');

});

test('matrix rejects invalid numeric edits and refreshes only explicitly chosen fields', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'assistant-matrix-fields-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const rows = [{ id: 'one', title: 'First', kind: 'film', year: 2000, runtime: 90 }, { id: 'two', title: 'Second', kind: 'film', year: 2020, runtime: 100 }];
  const handle = registerAssistantArtifacts({ app: { getPath: () => root }, ipcMain: { handle() {} }, authorized: () => true, catalogStore: () => ({ list: () => rows }) }).handle;
  const created = await handle(null, { action: 'save', ids: ['one', 'two'] });
  const id = created.doc.id;
  for (const value of ['hello', '2000.5', '2e3', '1887', '2101']) {
    assert.equal((await handle(null, { action: 'edit', id, expectedRevision: 1, key: 'cell:year:one', value })).code, 'invalid-number');
  }
  await handle(null, { action: 'edit', id, expectedRevision: 1, key: 'cell:year:one', value: '1999' });
  await handle(null, { action: 'edit', id, expectedRevision: 2, key: 'cell:runtime:two', value: '123' });
  rows[0].year = 2001; rows[0].runtime = 95; rows[1].runtime = 105;
  const refreshed = await handle(null, { action: 'save', id, ids: ['one', 'two'], expectedRevision: 3, refreshKeys: ['cell:year:one'] });
  assert.equal(refreshed.ok, true);
  const current = await handle(null, { action: 'get', id });
  assert.equal(current.body.cells.find(c => c.rowId === 'year' && c.colId === 'one').value, '2001');
  assert.equal(current.body.cells.find(c => c.rowId === 'runtime' && c.colId === 'one').value, '90');
  assert.equal(current.body.cells.find(c => c.rowId === 'runtime' && c.colId === 'two').value, '123');
  assert.equal(current.doc.userEdits['cell:year:one'], undefined);
  assert.equal(current.doc.userEdits['cell:runtime:two'], '123');
  assert.equal((await handle(null, { action: 'save', id, ids: ['one', 'two'], expectedRevision: 4, refreshKeys: ['cell:year:foreign'] })).code, 'invalid-refresh');
  const restored = await handle(null, { action: 'restore', id, expectedRevision: 4, revision: 3 });
  assert.equal(restored.doc.userEdits['cell:year:one'], '1999');
});
