'use strict';
const assert=require('node:assert/strict');
const fs=require('node:fs'),os=require('node:os'),path=require('node:path');
const {spawnSync}=require('node:child_process');
const {createHash}=require('node:crypto');
const {BrowserAssetStore}=require('../src/browser-asset-store');
const {createSourceResolver,fromMetadata,fromBrowserDocuments}=require('../src/dub-source-resolver');
const {editorMessages}=require('../src/dub-editor-request');
const root=fs.mkdtempSync(path.join(os.tmpdir(),'dub-source-resolver-'));
const hash=value=>createHash('sha256').update(value).digest('hex');
(async()=>{try {
  // Exercise the real translation output transaction and metadata producer.
  // Only the paid translator is replaced; source parsing, writing, provenance,
  // and production group planning all run normally.
  const script=String.raw`
import sys,json
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0,str(Path.cwd()/'backend'))
import test_transcribe as F
T=F.T
folder=Path(sys.argv[1]);source=folder/'original.en.srt'
source.write_text('1\n00:00:01,125 --> 00:00:03,250\nI gave her the book.\n\n2\n00:00:04,375 --> 00:00:06,500\nThen I left.\n',encoding='utf-8-sig')
args=F._TrArgs(input=str(source),output_dir=str(folder),language='en',max_lines=2,wrap_mode='sentence',formats='srt',dual_subtitle=False,dual_translation_first=False,translate_for_speech=True,translate_cache=False)
def translate(entries,args,warnings,source_lang=None,status_out=None,precompleted=None):
    status_out.update(completed=list(range(len(entries))),failed=[])
    return [(s,e,['Kitabı ona verdim.','Sonra ayrıldım.'][i]) for i,(s,e,_) in enumerate(entries)]
with patch.object(T,'llm_translate',side_effect=translate),patch.object(T,'emit'),patch.object(T,'log'):
    T.translate_existing_subtitle(args)
sys.path.insert(0,str(Path.cwd()/'tools'/'voxcpm2'))
from dub_plan import plan
output=folder/'original.tr.speech.srt'
(folder/'plan.json').write_text(json.dumps(plan(output,grouping='satir')),encoding='utf-8')
from test_dub_source_metadata import produce_whisper_translation
normal=produce_whisper_translation(folder)
(folder/'whisper-plan.json').write_text(json.dumps(plan(normal,grouping='satir')),encoding='utf-8')
`;
  const result=spawnSync(process.env.WHISPER_TEST_PYTHON||'python',['-c',script,root],{cwd:path.join(__dirname,'..'),encoding:'utf8'});
  assert.equal(result.status,0,result.error?.message||result.stderr);
  const file=path.join(root,'original.tr.speech.srt'),bytes=fs.readFileSync(file);
  const plan=JSON.parse(fs.readFileSync(path.join(root,'plan.json'),'utf8'));
  const meta=JSON.parse(fs.readFileSync(file+'.meta.json','utf8'));
  assert.equal(meta.originalCues[0].text,'I gave her the book.');
  assert.equal(meta.subtitleHash,hash(bytes));
  const resolver=createSourceResolver();
  const resolved=await resolver({srt:file,subtitleBytes:bytes,preparedGroups:plan.groups});
  assert.equal(resolved.groups[0].original,'I gave her the book.');
  assert.equal(resolved.groups[0].originalAfter,'Then I left.');
  const payload=JSON.parse(editorMessages(resolved.groups[0].text,2,{mode:'natural',...resolved.groups[0]})[1].content);
  assert.equal(payload.original,'I gave her the book.');
  assert.equal(fromMetadata(Buffer.from(bytes.toString()+'changed'),plan.groups,meta),null);
  assert.equal(fromMetadata(bytes,plan.groups,{...meta,originalHash:'0'.repeat(64)}),null);
  assert.equal(fromMetadata(bytes,plan.groups,{...meta,sourceHash:'0'.repeat(64)}),null);
  const failed=structuredClone(meta);failed.cues[0].status='failed';
  assert(!fromMetadata(bytes,plan.groups,failed)?.groups.some(row=>row.key==='1'));
  const unrelated=structuredClone(meta);unrelated.originalCues[0].endMs++;
  unrelated.originalHash=hash(JSON.stringify(unrelated.originalCues));
  assert.equal(fromMetadata(bytes,plan.groups,unrelated),null);
  assert.equal(await resolver({srt:file,subtitleBytes:bytes,preparedGroups:null}),null);
  const whisperFile=path.join(root,'whisper.tr.speech.srt'),whisperBytes=fs.readFileSync(whisperFile);
  const whisperPlan=JSON.parse(fs.readFileSync(path.join(root,'whisper-plan.json'),'utf8'));
  const whisperSource=await resolver({srt:whisperFile,subtitleBytes:whisperBytes,preparedGroups:whisperPlan.groups});
  assert.equal(whisperSource.groups[0].original,'I gave her the book.','Normal Whisper+translation must carry original into the last editor');
  const whisperPayload=JSON.parse(editorMessages(whisperSource.groups[0].text,2,{mode:'natural',...whisperSource.groups[0]})[1].content);
  assert.equal(whisperPayload.original,'I gave her the book.');

  // Browser evidence is supplied by the verified app-owned asset store.
  const store=new BrowserAssetStore({rootDir:path.join(root,'assets')});
  const sourceCues=[{id:'a',cueId:'a',start:1,end:3,text:'I gave her the book.',speaker:'Ali'}];
  const sourceHash=hash(JSON.stringify(sourceCues.map(row=>[row.start,row.end,row.text])));
  const source=store.putTrack({mediaId:'video1',trackId:'en',role:'source',sourceHash,cues:sourceCues});
  const translation=store.putTrack({mediaId:'video1',trackId:'tr',role:'translation',sourceHash,sourceTrackId:'en',
    cues:[{id:'web-tr-a',cueId:'a',start:1,end:3,text:'Kitabı ona verdim.'}]});
  const browserBytes=fs.readFileSync(translation.srtPath),groups=[{key:'1',text:'Kitabı ona verdim.'}];
  const browser=createSourceResolver({getAssetStore:()=>store,getIndex:()=>({listTrackAssetPaths:()=>[source.assetId,translation.assetId]})});
  const browserResult=await browser({srt:translation.srtPath,subtitleBytes:browserBytes,preparedGroups:groups});
  assert.equal(browserResult.groups[0].original,'I gave her the book.');
  assert.equal(browserResult.groups[0].speaker,'Ali');
  assert.equal(fromBrowserDocuments(browserBytes,groups,translation.document,{...source.document,mediaId:'other'}),null);
  assert.equal(fromBrowserDocuments(browserBytes,groups,translation.document,{...source.document,sourceHash:'0'.repeat(64)}),null);
  console.log('dub-source-resolver: real translation metadata + planner -> editor; verified browser assets; stale/failed/mismatched evidence rejected');
}finally{fs.rmSync(root,{recursive:true,force:true});}})().catch(error=>{console.error(error);process.exitCode=1;});
