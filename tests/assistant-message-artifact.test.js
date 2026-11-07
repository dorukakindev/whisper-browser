'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { registerAssistantArtifacts, validateEnvelope, FILE } = require('../src/assistant-artifact-service');
const { registerAssistantThreads } = require('../src/assistant-thread-store');
const { makeThreadRef } = require('../src/assistant-artifact-store');
const { exportPackage, readPackage, restorePackage } = require('../src/workspace-package');

test('cited replies become bounded outputs with protected edits and reply-owned thread references', async t => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'assistant-output-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  const deps = { app: { getPath: () => root }, ipcMain: { handle() {} }, authorized: sender => sender === 'owner' };
  const threads = registerAssistantThreads(deps).handle;
  const artifacts = registerAssistantArtifacts({ ...deps, catalogStore: () => ({ list: () => [] }) }).handle;
  const sourceKey = 'video:original-source';
  const reply = { id: 'answer', parentId: 'question', role: 'assistant', status: 'complete',
    text: 'The letter arrives. [T0]\n\nThe boat leaves. [T1]\n\nUncited opinion.\n\nForged claim. [T99]',
    evidence: [{ id: 'T0', start: 3, end: 5, text: 'A letter arrived.' }, { id: 'T1', start: 10, end: 12, text: 'The boat left.' }] };
  let thread = { id: 'thread', sourceKey, title: 'The letter', revision: 0, headId: 'answer', messages: [
    { id: 'question', parentId: null, role: 'user', status: 'complete', text: 'Explain.' }, reply,
  ] };
  thread = (await threads('owner', { action: 'save', sourceKey, thread })).thread;
  const request = { action: 'from-message', threadId: thread.id, messageId: reply.id, sourceKey, kind: 'dossier' };
  assert.equal((await artifacts('iframe', request)).ok, false);
  assert.equal((await artifacts('owner', { ...request, sourceKey: 'other' })).code, 'reply-unavailable');
  const result = await artifacts('owner', request);
  assert.equal(result.ok, true);
  const doc = result.doc, id = doc.id;
  assert.equal(doc.modelBody.sections[0].passages.length, 2);
  assert.equal(doc.modelBody.omittedParagraphs, 2);
  assert.equal(doc.modelBody.evidence[0].sourceKey, sourceKey);
  assert.equal((await artifacts('owner', request)).doc.id, id, 'Retry recovers the same saved output');

  thread.messages[1].artifacts = [makeThreadRef(doc)];
  const attached = await threads('owner', { action: 'save', sourceKey, thread });
  assert.equal(attached.ok, true);
  thread = attached.thread;
  assert.deepEqual(Object.keys(thread.messages[1].artifacts[0]).sort(), ['artifactId', 'kind', 'revision', 'title']);
  const forged = structuredClone(thread);
  forged.id = 'other-thread';forged.revision = 0;
  assert.equal((await threads('owner', { action: 'save', sourceKey, thread: forged })).ok, false);
  forged.parentThreadId = thread.id;
  assert.equal((await threads('owner', { action: 'save', sourceKey, thread: forged })).ok, true, 'A branch preserves copied reply references');
  const nested = structuredClone(forged);
  nested.id = 'nested';nested.parentThreadId = forged.id;
  assert.equal((await threads('owner', { action: 'save', sourceKey, thread: nested })).ok, true);
  const unrelated = structuredClone(forged);
  unrelated.id = 'unrelated';unrelated.parentThreadId = 'missing-parent';
  assert.equal((await threads('owner', { action: 'save', sourceKey, thread: unrelated })).ok, false);
  forged.messages[1].text = 'Different reply';
  forged.id = 'forged-copy';
  assert.equal((await threads('owner', { action: 'save', sourceKey, thread: forged })).ok, false);

  const edited = await artifacts('owner', { action: 'edit', id, expectedRevision: 1, key: 'passage:p0', value: 'My correction.' });
  assert.equal(edited.doc.revision, 2);
  assert.equal((await artifacts('owner', { action: 'edit', id, expectedRevision: 2, key: '__proto__', value: 'x' })).code, 'invalid-edit');
  assert.equal((await artifacts('owner', { ...request, expectedRevision: 1 })).code, 'revision-conflict');
  const refreshed = await artifacts('owner', { ...request, expectedRevision: 2 });
  assert.equal(refreshed.doc.revision, 3);
  assert.equal((await artifacts('owner', { action: 'get', id })).body.sections[0].passages[0].text, 'My correction.');
  assert.equal(refreshed.doc.modelBody.sections[0].passages[0].text, 'The letter arrives. [T0]');

  const timeline = await artifacts('owner', { ...request, kind: 'timeline' });
  assert.deepEqual(timeline.doc.modelBody.nodes.map(row => row.time), [3, 10]);
  const corrupt = { version: 1, documents: [structuredClone(timeline.doc)] };
  corrupt.documents[0].modelBody.nodes[0].time = 100;
  assert.throws(() => validateEnvelope(corrupt), /claim/i);
  const wrongSource = { version: 1, documents: [structuredClone(timeline.doc)] };
  wrongSource.documents[0].modelBody.evidence[0].sourceKey = 'video:other';
  assert.throws(() => validateEnvelope(wrongSource), /identity/i);


  const backup = path.join(root, 'output.wbp');
  exportPackage(root, backup);
  const bundle = readPackage(backup);
  fs.unlinkSync(path.join(root, FILE));
  restorePackage(root, bundle);
  assert.equal((await artifacts('owner', { action: 'get', id })).body.sections[0].passages[0].text, 'My correction.');
  assert.equal((await threads('owner', { action: 'list', sourceKey })).threads.find(row => row.id === thread.id).messages[1].artifacts[0].artifactId, id);
  const restored = await artifacts('owner', { action: 'restore', id, expectedRevision: 3, revision: 1 });
  assert.equal(restored.doc.revision, 4);
  assert.deepEqual(restored.doc.userEdits, {});
  thread.messages[1].status = 'streaming';
  thread = (await threads('owner', { action: 'save', sourceKey, thread })).thread;
  assert.equal((await artifacts('owner', request)).code, 'reply-unavailable');
});

test('saved podcast citations become podcast sources, not books, and never enter the subtitle timeline',()=>{
 const {fromMessage}=require('../src/assistant-message-artifact'),id='P'+'1'.repeat(8)+'-1111-1111-1111-'+'1'.repeat(12);
 const card={id,kind:'podcast',role:'translation',quote:'The lighthouse blinks.',timed:true,seconds:12,end:15,locator:{token:'b'.repeat(64),episode:'entry-1'}};
 const thread={id:'t',sourceKey:'s',title:'Podcast question'},message={id:'m',role:'assistant',status:'complete',text:'The lighthouse blinks ['+id+'].',citations:[card]};
 const dossier=fromMessage(thread,message,'dossier');
 assert.deepEqual(dossier.body.evidence.map(row=>[row.id,row.sourceKind,row.text]),[[id,'podcast','The lighthouse blinks.']]);
 assert.equal(dossier.body.evidence[0].time,undefined);
 assert.deepEqual(fromMessage(thread,message,'timeline'),{ok:false,code:'no-cited-content'});
});
