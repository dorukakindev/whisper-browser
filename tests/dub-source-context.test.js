'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {sourceContextSnapshot,boundSourceContext}=require('../src/dub-source-context');
const {editorMessages}=require('../src/dub-editor-request');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'dub-source-context-'));
try {
  const file=path.join(root,'speech.srt');
  fs.writeFileSync(file,'1\n00:00:00,000 --> 00:00:01,000\n[MÜZİK]\n\n2\n00:00:02,000 --> 00:00:04,000\nKitabı ona verdim.\n\n3\n00:00:05,000 --> 00:00:07,000\nSonra ayrıldım.\n');
  // Real production planner identity, including an omitted SDH cue: the first
  // speech group must bind to original ordinal 2, never filtered position 1.
  const result=spawnSync('python',[path.join(__dirname,'../tools/voxcpm2/dub_plan.py'),file,'--grouping','satir'],{encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
  const plan=JSON.parse(result.stdout),bytes=fs.readFileSync(file);
  assert.deepEqual(plan.groups.map(row=>row.key),['2','3']);
  const originals={'2':'I gave her the book.','3':'Then I left.'};
  const evidence={subtitleHash:plan.sourceHash,groups:plan.groups.map(row=>({...row,original:originals[row.key]})),terminology:'book = kitap'};
  const snapshot=sourceContextSnapshot(evidence,bytes);
  const context=boundSourceContext(snapshot,{key:'2',sourceHash:plan.sourceHash,original:'invented'},plan.sourceHash);
  assert.equal(context.original,'I gave her the book.');
  const payload=JSON.parse(editorMessages(plan.groups[0].text,2,{...context,mode:'natural'})[1].content);
  assert.equal(payload.original,originals['2']);assert.equal(payload.terminology,'book = kitap');
  evidence.groups[0].original='mutated after capture';assert.equal(context.original,originals['2']);
  assert.equal(boundSourceContext(snapshot,{key:'1',sourceHash:plan.sourceHash},plan.sourceHash),null);
  assert.equal(boundSourceContext(snapshot,{key:'2',sourceHash:'stale'},plan.sourceHash),null);
  assert.equal(sourceContextSnapshot(evidence,Buffer.from('changed')).size,0);
  const empty={subtitleHash:createHash('sha256').update(bytes).digest('hex'),groups:[{key:'2',text:'Türkçe',original:''}]};
  assert.equal(sourceContextSnapshot(empty,bytes).size,0);
  const duplicate={...empty,groups:[{key:'2',text:'Türkçe',original:'one'},{key:'2',text:'Türkçe',original:'two'}]};
  assert.equal(sourceContextSnapshot(duplicate,bytes).size,0);
  console.log('dub-source-context: production planner ordinals bind immutable original evidence; stale and missing evidence fail closed');
} finally { fs.rmSync(root,{recursive:true,force:true}); }
