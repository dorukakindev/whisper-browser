const assert = require('node:assert/strict');
const fs = require('node:fs');
const vm = require('node:vm');
const sync = require('../src/browser-subtitle-sync');
const { normalizeBrowserSession } = require('../src/browser-session-store');
const source = fs.readFileSync(require('node:path').join(__dirname, '../src/renderer/renderer.js'), 'utf8');
const extract = (from, to) => vm.runInNewContext('(' + source.slice(source.indexOf(from), source.indexOf(to, source.indexOf(from))) + ')');
const timed = extract('function replaceTimedCueTexts(', 'function replaceVttCueTexts(');
const ass = extract('function replaceAssDialogueText(', 'function syncPlayerSourceQuick(');
const vtt = 'WEBVTT\n\nSTYLE\n::cue { color: lime; }\n\nfirst\n00:00:01.000 --> 00:00:03.000 align:start\nÖzgün\n\nNOTE Korunmalı\nAçıklama\n';
const changed = timed(vtt, [{cue:{start:1,end:3,subtitleSourceIndex:0},newText:'Yeni',timing:{start:1.25,end:3.75}}]);
assert(changed.includes('00:00:01.250 --> 00:00:03.750 align:start\nYeni'));
assert(changed.includes('NOTE Korunmalı\nAçıklama'));
assert(changed.includes('STYLE\n::cue { color: lime; }'));
assert.equal(timed(vtt,[{cue:{start:9,end:10},newText:'Yanlış'}]),null);
const line = 'Dialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Özgün';
assert.equal(ass(line,0,'Yeni','',9,10,1,3,1,2,{start:1.25,end:3.75}),
 'Dialogue: 0,0:00:01.25,0:00:03.75,Default,,0,0,0,,Yeni');
const identity = {mediaId:'test-video',variantId:'tr',sourceHash:'s',cueId:'c',sourceCueHash:'h'};
const record = sync.createEditRecord({...identity,hasOverride:true,userOverride:'Düzeltilmiş',timingOverride:{start:1.5,end:4}});
const applied = sync.applyEditRecord({start:1,end:3,text:'Geç model'},record,identity);
assert.equal(applied.start,1.5);assert.equal(applied.end,4);assert.equal(applied.text,'Düzeltilmiş');
assert.equal(applied.sourceStart,1);assert.equal(applied.sourceCueHash,'h');assert.equal(applied.cueId,'c');
assert.equal(sync.applyEditRecord({start:1,end:3,text:'Başka video'},record,{...identity,mediaId:'other'}).start,1);
assert.throws(()=>sync.createEditRecord({...record,timingOverride:{start:3,end:2}}));
const session=normalizeBrowserSession({version:2,tabs:[{id:'t',url:'https://example.com/watch',subtitleEdits:[record]}]});
assert.deepEqual(session.tabs[0].subtitleEdits[0].timingOverride,{start:1.5,end:4});
console.log('Hızlı düzenleme: VTT metadata, ASS zamanları, satır kimliği, geç model ve oturum kalıcılığı geçti.');

// Exercise the real editor opener; remapping a correction is part of the saved draft, not just its text.
{
 const {JSDOM}=require('jsdom');const dom=new JSDOM(fs.readFileSync(require('node:path').join(__dirname,'../src/renderer/index.html'),'utf8'));
 const cue={start:1,end:3,text:'Original',cueId:'c1'},cues=[cue];let stored;
 const ctx={document:dom.window.document,$:id=>dom.window.document.getElementById(id),
  player:{mediaKey:'media-A',browserActiveTabId:'tab-A',cues,cues2:[],activeIdx:0,activeIdx2:-1},
  currentGeneration:()=>1,browserQuickEditor:null,browserSubtitleSync:{hashText:v=>v},
  persistQuickDraft(){},stopBrowserQuickPreview(){},subtitleFindDescriptors:()=>[{channel:'primary',path:'C:/sub.srt',cues,raw:'original',secondary:false}],
  browserSubtitleRoleCues:()=>({source:cues,translation:[]}),quickDrafts:()=>stored||{},
  interfaceChoice:tr=>tr,quickEditorValues:editor=>(editor||ctx.browserQuickEditor).rows.map(r=>({channel:r.channel,text:r.text.value,start:r.start.value,end:r.end.value})),
  NOTE_DRAFT_MAX_LENGTH:12000,browserCommand:async()=>{},setPlayerSidebarCollapsed(){},updateQuickEditorStatus(){},logLine(){}};
 dom.window.HTMLElement.prototype.scrollIntoView=()=>{};
 vm.createContext(ctx);vm.runInContext(source.slice(source.indexOf('function openBrowserQuickEditor('),source.indexOf('function quickEditorStillCurrent(')),ctx);
 ctx.openBrowserQuickEditor();const first=ctx.browserQuickEditor;
 const remap={scope:'old-scope',channel:'primary',record:{cueId:'old',edited:{text:'My correction',start:1,end:3}}};
 stored={[first.key]:{signature:first.signature,at:Date.now(),values:[{channel:'primary',text:'My correction',start:1,end:3}],remap}};
 ctx.localStorage={getItem:()=>JSON.stringify(stored)};ctx.browserQuickDraftKey='fixture';ctx.NOTE_DRAFT_MAX_AGE_MS=86400000;
 vm.runInContext(source.slice(source.indexOf('function quickDrafts()'),source.indexOf('function quickEditorValues(')),ctx);
 ctx.browserQuickEditor=null;ctx.openBrowserQuickEditor();assert.equal(ctx.browserQuickEditor.rows[0].text.value,'My correction');
 assert.equal(JSON.stringify(ctx.browserQuickEditor.remap),JSON.stringify(remap),'closing and reopening must preserve the correction remap');
 ctx.quickEditorStillCurrent=()=>true;
 vm.runInContext(source.slice(source.indexOf('function translationTargetCurrent('),source.indexOf('function requestQuickTranslations(')),ctx);
 vm.runInContext(source.slice(source.indexOf('function appendTranslationAlternatives('),source.indexOf("$('browserQuickSyncSave')")),ctx);
 const editor=ctx.browserQuickEditor,row=editor.rows[0],target={editor,row,draft:JSON.stringify(ctx.quickEditorValues(editor))};
 const bubble=dom.window.document.createElement('div');ctx.appendTranslationAlternatives(bubble,'{"alternatives":["Late model suggestion"]}',target);
 row.text.value='New manual correction';bubble.querySelector('button').click();
 assert.equal(row.text.value,'New manual correction');assert.match(bubble.querySelector('p').textContent,/taslak değişti/);
 dom.window.close();
}
