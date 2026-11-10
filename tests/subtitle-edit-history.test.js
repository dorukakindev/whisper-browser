const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

// Kuyruk-50/8: toplu düzenleme geçmişi × zamanlama paneli tutarlılığı.
// İki paralel geçmiş (bellek-içi timeline.undo ve dosya-yazan cueEditUndo)
// kronolojik karışamadığı için: dosya-yazan işlemler kirli paneli reddeder,
// toptan değişimler bekleyen zamanlama geçmişini görünür sıfırlar. Fonksiyonlar
// renderer.js'ten kesilip vm'de çalışır — metin kilidi değil davranış kanıtı.
const renderer = fs.readFileSync(path.join(__dirname, '../src/renderer/renderer.js'), 'utf8');

let passed = 0, failed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`ok ${passed + failed} - ${name}`); }
  catch (error) { failed++; console.error(`not ok ${passed + failed} - ${name}\n  ${error.stack || error}`); }
}
function slice(from, to) {
  const start = renderer.indexOf(from);
  assert(start >= 0, 'başlangıç bulunamadı: ' + from);
  const end = renderer.indexOf(to, start);
  assert(end > start, 'bitiş bulunamadı: ' + to);
  return renderer.slice(start, end);
}

// --- Kesitler --------------------------------------------------------------
const historySlice = slice('function timelinePushUndo(', 'function drawTimeline(');
const bulkMemorySlice = slice('function applySubtitleBulkMemory(', 'function applyBrowserBulkMemory(');
const editedChannelSlice = slice('function refreshBrowserEditedChannel(', 'function stopReplacedBrowserTranslation(');
const undoListener = slice("if ($('timelineUndo')) $('timelineUndo').addEventListener", "$('timelineRedo')) $('timelineRedo').addEventListener");

function makeNode() {
  const classes = new Set();
  return {
    classList: {
      add: (c) => classes.add(c), remove: (c) => classes.delete(c),
      contains: (c) => classes.has(c),
    },
    _classes: classes, disabled: false, textContent: '', value: '',
  };
}

function timelineCtx() {
  const nodes = {};
  const logs = [];
  const player = {
    timeline: { undo: [], redo: [], drag: null, selected: -1, annotationSnapshot: null, recovery: null, recoveryTimer: null },
    cues: [], cuesRaw: [],
  };
  const ctx = {
    player, logs,
    $: (id) => (nodes[id] ||= makeNode()),
    _nodes: nodes,
    logLine: (m) => logs.push(m),
    renderCueList: () => {}, renderCue: () => {}, drawTimeline: () => {},
    scheduleBrowserOverlaySync: () => {},
    clearTimeout: () => {},
    timelineClearRecovery: () => {},
  };
  vm.createContext(ctx);
  vm.runInContext(historySlice
    + '\nthis.editsPending = timelineEditsPending; this.invalidate = invalidateTimelineEdits;'
    + 'this.blocks = timelineBlocksFileWrites; this.pushUndo = timelinePushUndo;', ctx);
  return ctx;
}

test('timelineEditsPending: boşta temiz; undo/redo/dirty her biri kirli sayar', () => {
  const ctx = timelineCtx();
  assert.equal(ctx.editsPending(), false);
  ctx.player.timeline.undo.push([{ start: 0 }]);
  assert.equal(ctx.editsPending(), true);
  ctx.player.timeline.undo = [];
  ctx.player.timeline.redo = [[{ start: 0 }]];
  assert.equal(ctx.editsPending(), true);
  ctx.player.timeline.redo = [];
  ctx._nodes.timelineDrawer.classList.add('dirty');
  assert.equal(ctx.editsPending(), true);
});

test('invalidateTimelineEdits: temizken dokunmaz; kirliyken yığın+dirty+mesaj', () => {
  const ctx = timelineCtx();
  assert.equal(ctx.invalidate('x'), false, 'temiz durumda mesaj yazmamalı');
  ctx.player.timeline.undo.push([{ start: 0 }]);
  ctx.player.timeline.redo = [[{ start: 1 }]];
  ctx.$('timelineUndo').disabled = false;
  ctx.$('timelineDrawer').classList.add('dirty');
  assert.equal(ctx.invalidate('dosya değişti'), true);
  assert.equal(ctx.player.timeline.undo.length, 0);
  assert.equal(ctx.player.timeline.redo.length, 0);
  assert.equal(ctx._nodes.timelineDrawer.classList.contains('dirty'), false);
  assert.equal(ctx._nodes.timelineUndo.disabled, true);
  assert.equal(ctx._nodes.timelineRedo.disabled, true);
  assert.equal(ctx._nodes.timelineStatus.textContent, 'dosya değişti');
  assert.equal(ctx.editsPending(), false, 'sıfırlama sonrası dosya işlemleri serbest');
});

test('timelineBlocksFileWrites: temizken izin; kirliyken uyarıyla reddeder', () => {
  const ctx = timelineCtx();
  assert.equal(ctx.blocks(), false);
  ctx.player.timeline.undo.push([{ start: 0 }]);
  assert.equal(ctx.blocks(), true);
  assert.ok(ctx.logs.some((m) => m.includes('kaydedilmemiş düzenlemeler')),
    'engel mesajı kullanıcıya yol göstermeli');
});

test('timelinePushUndo: snapshot + redo sıfırlama + 30 kapasitesi', () => {
  const ctx = timelineCtx();
  ctx.player.cues = [{ start: 0, end: 1, text: 'a' }];
  ctx.player.timeline.redo = [[{ start: 9 }]];
  ctx.pushUndo();
  assert.equal(ctx.player.timeline.undo.length, 1);
  assert.equal(ctx.player.timeline.redo.length, 0, 'yeni işlem redo yığınını boşaltır');
  assert.notEqual(ctx.player.timeline.undo[0][0], ctx.player.cues[0], 'kopya snapshot');
  for (let i = 0; i < 40; i++) ctx.pushUndo();
  assert.equal(ctx.player.timeline.undo.length, 30, 'yığın 30 ile sınırlı');
});

// --- applySubtitleBulkMemory: birincil kanal değişimi geçmişi sıfırlar ------
function bulkMemoryCtx(calls) {
  const player = {
    cues: [{ start: 0, end: 1, text: 'x' }], cuesRaw: [], cues2: [], cues2Raw: [],
    subRaw: '', sub2Raw: '', sub2Path: '', subPath: 'p.srt',
    activeIdx: 0, activeIdx2: -1, mergeCont: false,
    workspaceMode: 'player', cueQualitySource: '',
  };
  const ctx = {
    player,
    parseSubtitles: (raw) => JSON.parse(raw),
    attachBrowserCueIdentities: (t, cues) => cues,
    mergeCueContinuation: (c) => c,
    applyCueQuality: (c) => c,
    reviewSourceCues: (t, p, c) => c,
    browserLoadedTrack: () => null,
    migrateSavedCueAssociation: () => {},
    invalidateTimelineEdits: (m) => { calls.push(m); return true; },
  };
  vm.createContext(ctx);
  vm.runInContext(bulkMemorySlice + '\nthis.applyBulk = applySubtitleBulkMemory;', ctx);
  return ctx;
}

test('applySubtitleBulkMemory: birincil kanal geçmişi sıfırlar, ikincil dokunmaz', () => {
  const calls = [];
  const ctx = bulkMemoryCtx(calls);
  const primary = { path: 'p.srt', before: '[]', after: '[{"start":0,"end":1,"text":"y"}]',
    channels: ['primary'], changes: [] };
  ctx.applyBulk([primary], 'after');
  assert.equal(calls.length, 1, 'birincil toptan değişim kirli zamanlamayı sıfırlamalı');
  calls.length = 0;
  const secondary = { path: 'p2.srt', before: '[]', after: '[{"start":0,"end":1,"text":"z"}]',
    channels: ['secondary'], changes: [] };
  ctx.applyBulk([secondary], 'after');
  assert.equal(calls.length, 0, 'ikincil kanal değişimi zamanlama geçmişine dokunmaz');
  assert.equal(ctx.player.cues2.length, 1);
});

// --- refreshBrowserEditedChannel: yalnız birincil iz sıfırlar ----------------
test('refreshBrowserEditedChannel: birincil iz yenilenince zamanlama sıfırlanır', () => {
  const calls = [];
  const nodes = {};
  const player = {
    cues: [], cuesRaw: [], cues2: [], cues2Raw: [], mergeCont: false,
    browserLoadedTrackId: 'tr1', browserLoadedTrackId2: 'tr2',
    browserTime: 0, browserPaused: true,
  };
  const tracks = [{ id: 'tr1' }, { id: 'tr2' }];
  const ctx = {
    player,
    $: (id) => (nodes[id] ||= makeNode()),
    browserLoadedTrack: (secondary) => secondary ? tracks[1] : tracks[0],
    browserBaseCueMap: () => new Map([['k', { start: 0, end: 1, text: 'a' }]]),
    effectiveBrowserTranslationCues: (t, base) => base,
    mergeCueContinuation: (c) => c,
    browserTabState: () => null,
    renderCueList: () => {}, renderBrowserCueAt: () => {},
    scheduleBrowserOverlaySync: () => {}, scheduleSubtitleFindReplace: () => {},
    invalidateTimelineEdits: (m) => { calls.push(m); return true; },
  };
  vm.createContext(ctx);
  vm.runInContext(editedChannelSlice + '\nthis.refresh = refreshBrowserEditedChannel;', ctx);
  ctx.refresh('tr2');
  assert.equal(calls.length, 0, 'ikincil iz zamanlama geçmişine dokunmaz');
  ctx.refresh('tr1');
  assert.equal(calls.length, 1, 'birincil iz yenilemesi kirli zamanlamayı sıfırlar');
});

// --- Statik kilit: dosya-yazan giriş noktaları kirli paneli reddeder ---------
test('dosya-yazan geçmiş yolları kirli panelde reddedilir (statik kilit)', () => {
  for (const name of ['applyCueEditHistoryCore', 'applySubtitleFindReplacement', 'saveCueEdit']) {
    const at = renderer.indexOf(`function ${name}(`);
    assert(at >= 0, name + ' yok');
    assert.ok(renderer.slice(at, at + 500).includes('timelineBlocksFileWrites'),
      name + ' kirli zamanlama panelinde dosya yazmamalı');
  }
  const quickAt = renderer.indexOf('async function saveBrowserQuickEditor(');
  assert.ok(renderer.slice(quickAt, quickAt + 400).includes('timelineEditsPending'),
    'hızlı düzenleyici kaydı kirli panelde engellenmeli');
});

test('geri alma ilk snapshot\'a ulaşınca panel temiz sayılır (statik kilit)', () => {
  assert.ok(/undo\.length\) \{\s*\$\('timelineDrawer'\)\?\.classList\.remove\('dirty'\)/.test(undoListener),
    'tam geri alma dirty bayrağını kaldırıp dosya işlemlerini serbest bırakmalı');
});

test('loadSubtitle: birincil altyazı değişimi kirli zamanlamayı sıfırlar (statik kilit)', () => {
  const load = slice('async function loadSubtitle(', 'async function attachSiblingSubtitles(');
  assert.ok(/player\.cues = player\.mergeCont[^;]+;\s*\n\s*invalidateTimelineEdits\(/.test(load),
    'birincil cues yeniden yüklenince bekleyen zamanlama geçmişi sıfırlanmalı');
});

test('single edit separates session history from explicit file writes', () => {
  const save = slice('async function saveCueEdit(', 'function youtubeCookieBrowser');
  const session = save.indexOf('if (!overwrite)');
  const write = save.indexOf('window.api.writeSubtitle(targetPath');
  assert.ok(session >= 0 && write > session);
  assert.match(save.slice(session, write), /sessionOnly: true/);
  assert.match(save, /staleGeneration\(localTarget.generation\)/);
  assert.match(save, /player.subRaw !== localTarget.raw/);
  assert.doesNotMatch(save, /mergeCueEditOntoExternal/);
});
console.log(`
${passed} geçti, ${failed} düştü`);
if (failed) process.exit(1);

const nt=require('node:test');
const functionSource=name=>{const text=renderer.replace(/\r\n/g,'\n');let i=text.indexOf('function '+name+'(');assert(i>=0,name);if(text.slice(i-6,i)==='async ')i-=6;return text.slice(i,text.indexOf('\n}',i)+2);};
nt('R28 single undo/redo uses the loaded disk receipt and keeps both history stacks on conflict',async()=>{
 const record={path:'A.srt',mediaKey:'A',before:'Before',after:'After',index:0},player={subPath:'A.srt',mediaKey:'A',cues:[{text:'After'}],cueEditUndo:[record],cueEditRedo:[],subtitleFindReplace:{}},stamp={mtimeMs:1,size:5},calls=[];
 const ctx={player,timelineBlocksFileWrites:()=>false,currentGeneration:()=>1,staleGeneration:()=>false,subtitleStatFor:()=>stamp,noteSubtitleStat(){},window:{api:{writeSubtitle:async(...args)=>{calls.push(args);return args[3]===stamp?{ok:false,error:'External change'}:{ok:true};}}},logLine(){},loadSubtitle:async()=>{},migrateSavedCueAssociation(){},updateCueEditHistoryButtons(){},renderCueList(){},renderCue(){},osd(){},$:()=>({value:''})};vm.createContext(ctx);vm.runInContext(functionSource('applyCueEditHistoryCore'),ctx);await ctx.applyCueEditHistoryCore('undo');assert.equal(calls[0][3],stamp);assert.equal(player.cueEditUndo.length,1);assert.equal(player.cueEditRedo.length,0);ctx.window.api.writeSubtitle=async(...args)=>({ok:true,mtimeMs:2,size:6});await ctx.applyCueEditHistoryCore('undo');assert.equal(player.cueEditUndo.length,0);assert.equal(player.cueEditRedo.length,1);await ctx.applyCueEditHistoryCore('redo');assert.equal(player.cueEditUndo.length,1);assert.equal(player.cueEditRedo.length,0);
});
function lateTimeline(){const nodes={},records=new Map(),player={workspaceMode:'player',mediaKey:'A',subPath:'A.srt',localPath:'A.mp4',cues:[{start:1,end:2,text:'A base'}],timeline:{undo:[],redo:[],recovery:{baseSig:'A'}}};const ctx={player,currentGeneration:()=>1,window:{api:{timelineRecovery:async p=>{if(p.action==='clear')records.delete(p.sourceKey);return {ok:true,record:records.get(p.sourceKey)};}}},TimelineIssueScan:require('../src/renderer/timeline-issue-scan'),$:id=>nodes[id]||=(Object.assign(makeNode(),{classList:{add(){},remove(){},contains:()=>true}})),logLine(){},clearTimeout(){},setTimeout:()=>1,uiText:x=>x,clearCueWordData(){},migrateTimelineAssociations(){},renderTimelineIssues(){},scheduleBrowserOverlaySync(){},renderCueList(){},renderCue(){},drawTimeline(){},timelineIssueList:()=>[{kind:'empty',i:0}],pSecToTime:String};vm.createContext(ctx);for(const name of ['cuesToSrt','timelineOperationOwner','timelineOperationCurrent','timelineMarkDirty','timelinePersistRecovery','timelinePushUndo','timelineSourceKey','timelineCueSig','timelineClearRecovery','timelineCheckRecovery','saveTimelineCopy','timelineRemoveEmptyCues']){if(renderer.includes('function '+name+'('))vm.runInContext(functionSource(name),ctx);}return {ctx,player,records,toB(){player.mediaKey='B';player.subPath='B.srt';player.cues=[{start:20,end:22,text:'B current'}];player.timeline={undo:[],redo:[],recovery:{baseSig:'B'}};records.set('B.srt',{cues:player.cues});}};}
nt('R29 late recovery, copy save and empty-cue approval preserve the newer source/revision',async()=>{
 const a=lateTimeline();a.records.set('A.srt',{baseSig:a.ctx.timelineCueSig(a.player.cues),cues:[{start:4,end:6,text:'A restored'}]});let confirm;a.ctx.openAppDialog=()=>new Promise(r=>confirm=r);let work=a.ctx.timelineCheckRecovery();await new Promise(setImmediate);a.toB();confirm(true);await work;assert.equal(a.player.cues[0].text,'B current');
 const b=lateTimeline();let finish;b.ctx.window.api.saveSubtitleCopy=()=>new Promise(r=>finish=r);work=b.ctx.saveTimelineCopy();b.toB();const newer=b.player.timeline;finish({ok:true,path:'A.copy.srt'});await work;assert.equal(b.player.timeline,newer);assert(newer.recovery);assert(b.records.has('B.srt'));
 for(const switchSource of [false,true]){const c=lateTimeline();c.player.cues[0].text='';let yes;c.ctx.openAppDialog=()=>new Promise(r=>yes=r);work=c.ctx.timelineRemoveEmptyCues();if(switchSource)c.toB();else c.player.cues[0].text='New nonempty revision';yes(true);await work;assert.equal(c.player.cues.length,1);}
 const valid=lateTimeline();valid.records.set('A.srt',{baseSig:valid.ctx.timelineCueSig(valid.player.cues),cues:[{start:4,end:6,text:'A restored'}]});valid.ctx.openAppDialog=async()=>true;await valid.ctx.timelineCheckRecovery();assert.equal(valid.player.cues[0].text,'A restored');
});

nt('R28 external-change review displays only an exact-time candidate and never writes or moves history',async()=>{
 let description='',writes=0;const entry={path:'A.srt',mediaKey:'A',start:1,beforeText:'Requested target'},ctx={player:{mediaKey:'A',subPath:'A.srt'},staleGeneration:()=>false,interfaceChoice:(_tr,en)=>en,window:{api:{readSubtitle:async()=>({ok:true,text:'1\n00:00:01,000 --> 00:00:02,000\nExternal target\n'}),writeSubtitle:async()=>writes++}},openAppDialog:async p=>{description=p.description;},cleanLocalCueText:x=>x};vm.createContext(ctx);vm.runInContext(functionSource('parseSubtitles')+functionSource('reviewCueEditHistoryConflict'),ctx);await ctx.reviewCueEditHistoryConflict(entry,'undo',1);assert.match(description,/Requested target/);assert.match(description,/External target/);assert.equal(writes,0);
});

nt('E04 controlled target merge preserves external blocks, cancellation and stale-stat failure preserve history',async()=>{
 for(const outcome of ['ok','cancel','conflict']){
 const entry={path:'A.srt',mediaKey:'A',start:1,beforeText:'Wanted',afterText:'Old'},disk='1\n00:00:01,000 --> 00:00:02,000\nExternal target\n\n2\n00:00:04,000 --> 00:00:05,000\nExternal added block\n';let writes=[],loads=0;
 const ctx={player:{subPath:'A.srt',mediaKey:'A',cueEditUndo:[entry],cueEditRedo:[],subtitleFindReplace:{}},staleGeneration:()=>false,interfaceChoice:(_tr,en)=>en,cleanLocalCueText:x=>x,window:{api:{readSubtitle:async()=>({ok:true,text:disk,mtimeMs:12,size:disk.length}),writeSubtitle:async(...args)=>{writes.push(args);return {ok:outcome==='ok',error:'external change',mtimeMs:13,size:99};}}},openAppDialog:async()=>outcome!=='cancel',timelineBlocksFileWrites:()=>false,logLine(){},noteSubtitleStat(){},loadSubtitle:async()=>loads++,updateCueEditHistoryButtons(){}};
 vm.createContext(ctx);for(const name of ['parseSubtitles','replaceTimedCueTexts','replaceVttCueTexts','replaceVttCueText','reviewCueEditHistoryConflict'])vm.runInContext(functionSource(name),ctx);
 await ctx.reviewCueEditHistoryConflict(entry,'undo',1);
 if(outcome==='ok'){assert.equal(loads,1);assert.equal(ctx.player.cueEditUndo.length,0);assert.equal(ctx.player.cueEditRedo.length,1);assert.match(writes[0][1],/Wanted/);assert.match(writes[0][1],/External added block/);assert.equal(writes[0][3].mtimeMs,12);}else{assert.equal(ctx.player.cueEditUndo.length,1);assert.equal(loads,0);if(outcome==='cancel')assert.equal(writes.length,0);}
 }
});

nt('E03 two independent channels retain honest loaded/session/written/copy/failure receipts',()=>{
 const s=require('../src/renderer/subtitle-work-status');s.record('a','loaded','Original');s.record('b','loaded','Translation');assert.equal(s.view('a','Changed').sessionChanged,true);assert.equal(s.view('b','Translation').sessionChanged,false);s.record('a','copy',null,'a-copy.srt');assert.equal(s.view('a','Changed').write,'loaded');assert.equal(s.view('a','Changed').copy,'a-copy.srt');s.record('a','written','Changed');assert.equal(s.view('a','Changed').write,'written');assert.equal(s.view('a','Changed').sessionChanged,false);s.record('b','failed');assert.equal(s.view('b','Translation').write,'failed');assert.equal(s.view('a','Changed').write,'written');assert.equal(s.view('unknown','X').known,false);
});

nt('E06 draft ownership separates generations/channels and old-source events retain their identity',()=>{
 const s=require('../src/renderer/subtitle-work-status'),a={mediaKey:'A',path:'a.srt',generation:1,channel:'secondary',revision:'one'};assert(s.sameOwner(a,{...a}));for(const change of [{generation:2},{channel:'primary'},{revision:'two'},{mediaKey:'B'}])assert.equal(s.sameOwner(a,{...a,...change}),false);s.event(a,'copy-cancelled');s.event({...a,mediaKey:'B',generation:2},'recovery-skipped');assert.equal(s.events().at(-2).owner.mediaKey,'A');assert.equal(s.events().at(-1).owner.mediaKey,'B');
});

nt('E01 secondary single edit stays on its frozen channel and separates session/file writes',async()=>{
 for(const mode of ['session','write','stale','failure','merged']){let writes=0,closed=0,channels=[],refresh=0;const original=[{start:1,end:3,text:'Original'}],secondary=[{start:1,end:3,text:'Translation'}],target={mediaKey:'A',generation:1,path:'tr.srt',raw:'Before',index:0,signature:'Translation',secondary:true};const player={workspaceMode:'player',mediaKey:'A',subPath:'en.srt',sub2Path:'tr.srt',sub2Raw:'Before',cues:original,cues2:secondary,cues2Raw:mode==='merged'?[{start:1,end:5,text:'Merged'}]:secondary,cueEditUndo:[],cueEditRedo:[]};
 const c={player,staleGeneration:()=>mode==='stale',cueSignature:cue=>cue?.text,interfaceChoice:(_tr,en)=>en,logLine(){},subtitleStatFor:()=>({mtimeMs:1,size:6}),prepareSubtitleBulkOperations:plans=>{channels=plans.map(p=>p.channel);return {files:[{path:'tr.srt',channels:['secondary'],before:'Before',after:'After'}]};},writeSubtitleBulkFiles:async()=>{writes++;return {ok:mode!=='failure',error:'write failed'};},applySubtitleBulkMemory:()=>{player.sub2Raw='After';player.cues2=[{start:1,end:3,text:'Edited'}];},refreshAfterSubtitleBulkEdit:()=>refresh++,closeCueEditor:()=>closed++};vm.createContext(c);vm.runInContext(functionSource('saveSecondaryCueEdit'),c);await c.saveSecondaryCueEdit(target,'Edited',mode!=='session');assert.equal(player.cues,original);assert.equal(player.cues[0].text,'Original');if(['session','write'].includes(mode)){assert.deepEqual(Array.from(channels),['secondary']);assert.equal(closed,1);assert.equal(refresh,1);assert.equal(player.cueEditUndo[0].sessionOnly,mode==='session');assert.equal(writes,mode==='write'?1:0);}else{assert.equal(player.sub2Raw,'Before');assert.equal(closed,0);assert.equal(player.cueEditUndo.length,0);}
 }
});

nt('E02 candidate review shows exact text/overlap and refuses stale-source editing',()=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<div id="subtitlePairCandidates"></div>');try{let generation=1,edits=[];const descriptors=[{role:'source',channel:'primary',secondary:false,path:'source.srt',raw:'source',cues:[{start:1,end:3,text:'Source'}]},{role:'translation',channel:'secondary',secondary:true,path:'translation.srt',raw:'translation',cues:[{start:1,end:3,text:'<img onerror=bad>'},{start:1.5,end:3,text:'Second'}]}];const c={window:{PlayerTranscriptModel:require('../src/renderer/player-transcript-model')},document:dom.window.document,$:id=>dom.window.document.getElementById(id),player:{workspaceMode:'player',mediaKey:'A',activeIdx:0},subtitleFindDescriptors:()=>descriptors,subtitleProfileOwner:()=>String(generation),subtitleVideoTime:t=>t,currentGeneration:()=>generation,interfaceChoice:(_tr,en)=>en,openCueEditor:(secondary,target)=>edits.push({secondary,target})};vm.createContext(c);vm.runInContext(functionSource('reviewSubtitlePairCandidates'),c);c.reviewSubtitlePairCandidates();assert.match(c.$('subtitlePairCandidates').textContent,/uncertain/);assert.match(c.$('subtitlePairCandidates').textContent,/Overlap: 2.000/);assert.equal(c.$('subtitlePairCandidates').querySelector('img'),null);const buttons=c.$('subtitlePairCandidates').querySelectorAll('button');assert.equal(buttons.length,2);buttons[1].click();assert.equal(edits[0].secondary,true);assert.equal(edits[0].target.index,1);generation++;buttons[0].click();assert.equal(edits.length,1);assert.match(c.$('subtitlePairCandidates').textContent,/changed/);
 }finally{dom.window.close();}
});

nt('E07 profile UI previews both channels; cancel, stale source and changed audio never restore another profile',async()=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<div id="subtitleProfileList"></div><input id="subOffset"><input id="sub2Offset"><input id="cueSearch">');try{let generation=1,approve=true,saves=0,resolve;const p={mediaKey:'A',workspaceMode:'player',subPath:'a.srt',sub2Path:'b.srt',subRaw:'A',sub2Raw:'B',localAudioProfileId:'main-en',offset:0,offset2:0,offsetProfiles:{'p|main-en|a.srt':1,'s|main-en|b.srt':2,'p|commentary-en|a.srt':3,'s|commentary-en|b.srt':4}},c={player:p,window:{SubtitleWorkStatus:require('../src/renderer/subtitle-work-status')},document:dom.window.document,$:id=>dom.window.document.getElementById(id),currentGeneration:()=>generation,interfaceChoice:(_tr,en)=>en,openAppDialog:()=>approve==='pending'?new Promise(r=>resolve=r):Promise.resolve(approve),setLocalSyncProfileValue(){},renderCueList(){},renderCue(){},scheduleSave:()=>saves++};vm.createContext(c);vm.runInContext(functionSource('subtitleProfileOwner')+functionSource('renderSubtitleProfiles'),c);
 c.renderSubtitleProfiles();let buttons=c.$('subtitleProfileList').querySelectorAll('button');assert.equal(buttons[0].disabled,false);assert.equal(buttons[1].disabled,true);assert.match(c.$('subtitleProfileList').textContent,/0 → 1/);assert.match(c.$('subtitleProfileList').textContent,/0 → 2/);
 approve=false;await buttons[0].onclick();assert.equal(p.offset,0);assert.equal(saves,0);
 approve='pending';let running=buttons[0].onclick();generation++;resolve(true);await running;assert.equal(p.offset2,0);
 c.renderSubtitleProfiles();buttons=c.$('subtitleProfileList').querySelectorAll('button');p.localAudioProfileId='commentary-en';approve=true;await buttons[0].onclick();assert.equal(p.offset,0,'old main-audio control cannot apply to a newly selected commentary track');
 p.localAudioProfileId='main-en';c.renderSubtitleProfiles();await c.$('subtitleProfileList').querySelector('button').onclick();assert.equal(p.offset,1);assert.equal(p.offset2,2);assert.equal(saves,1);assert.equal(p.offsetProfiles['p|commentary-en|a.srt'],3);
 }finally{dom.window.close();}
});

nt('E05 history preview distinguishes session, disk, browser and mixed operations without applying',()=>{
 const m=require('../src/renderer/subtitle-work-status'),nodes={},entry={kind:'subtitle-bulk',mediaKey:'A',sessionOnly:true,files:[{path:'secondary.srt',channels:['secondary'],changes:[{}]}]},player={mediaKey:'A',subPath:'primary.srt',cueEditUndo:[entry],cueEditRedo:[],timeline:{undo:[[]],redo:[]}},before=JSON.stringify(player),c={window:{SubtitleWorkStatus:m},player,$:id=>nodes[id]||=( {title:'',textContent:''}),interfaceChoice:(_tr,en)=>en,timelineEditsPending:()=>true};vm.createContext(c);vm.runInContext(functionSource('renderSubtitleHistoryScope'),c);c.renderSubtitleHistoryScope();assert.match(nodes.subtitleEditUndo.title,/session only.*secondary.*secondary.srt/);assert.match(nodes.subtitleEditUndo.title,/timing edits pending/);assert.match(nodes.timelineUndo.title,/session memory only/);assert.equal(JSON.stringify(player),before);assert.equal(m.history({...entry,sessionOnly:false}).effect,'disk');assert.equal(m.history({kind:'browser-override'}).effect,'browser');assert.equal(m.history({...entry,sessionOnly:false,browserEdits:[{}]}).effect,'disk-browser');assert.equal(m.history(null),null);
});

nt('E10 editor Ctrl-Z/Y stays native text history while file undo remains explicit',()=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<textarea id="subtitleEditBox"></textarea>');try{let applicationCalls=0,escaped=0;const c={document:dom.window.document,$:id=>dom.window.document.getElementById(id),applyCueEditHistory:()=>applicationCalls++,saveCueEdit:()=>applicationCalls++,closeCueEditor:()=>escaped++};vm.createContext(c);const start=renderer.indexOf("if ($('subtitleEditBox')) {"),end=renderer.indexOf("if ($('subOffset'))",start);vm.runInContext(renderer.slice(start,end),c);let bubbled=0;dom.window.document.addEventListener('keydown',()=>bubbled++);for(const [key,shift]of [['z',false],['y',false],['z',true]]){const e=new dom.window.KeyboardEvent('keydown',{key,ctrlKey:true,shiftKey:shift,bubbles:true,cancelable:true});c.$('subtitleEditBox').dispatchEvent(e);assert.equal(e.defaultPrevented,false);}assert.equal(applicationCalls,0);assert.equal(bubbled,0);c.$('subtitleEditBox').dispatchEvent(new dom.window.KeyboardEvent('keydown',{key:'Escape',bubbles:true,cancelable:true}));assert.equal(escaped,1);
 }finally{dom.window.close();}
});

nt('S03 repair preview binds only reviewed bytes/role; cancel, wrong range, source change and read failure preserve healthy channel',async()=>{
 for(const mode of ['ok','cancel','range','stale','read-failed']){const healthy=[{start:1,end:3,text:'Healthy translation'}],player={workspaceMode:'player',mediaKey:'A',subPath:'old.srt',sub2Path:'healthy.srt',subRaw:'old',sub2Raw:'healthy',cues:[],cues2:healthy},state={pendingPlayerLoad:{missing:true}};let loads=0,flushes=0,options;
 const c={player,state,currentGeneration:()=>1,staleGeneration:()=>false,$:id=>id==='playerVideo'?{duration:100}:{value:''},window:{api:{selectFile:async()=>{if(mode==='stale')player.mediaKey='B';return mode==='read-failed'?'old.srt':'replacement.srt';},readSubtitle:async()=>({ok:true,text:'source',sha256:'a'.repeat(64)})}},parseSubtitles:()=>[{start:0,end:mode==='range'?999:3,text:'Reviewed cue'}],openAppDialog:async()=>mode!=='cancel',interfaceChoice:(_tr,en)=>en,addSubtitleOption(){},loadSubtitle:async(file,secondary,opts)=>{loads++;options=opts;if(mode==='read-failed')return {ok:false};player.subPath=file;player.cues=[{start:0,end:3,text:'Reviewed cue'}];return {ok:true,loaded:true};},flushWatchState:()=>flushes++,updatePlayerTaskCenter(){},logLine(){}};
 vm.createContext(c);vm.runInContext(functionSource('locateMissingSubtitle'),c);await c.locateMissingSubtitle('old.srt',false,'source');assert.equal(player.cues2,healthy);assert.equal(player.sub2Path,'healthy.srt');if(mode==='ok'){assert.equal(loads,1);assert.equal(options.expectedHash,'a'.repeat(64));assert.equal(options.role,'source');assert.equal(flushes,1);}else{assert.equal(player.subPath,'old.srt');assert.equal(flushes,0);assert(state.pendingPlayerLoad);if(mode!=='read-failed')assert.equal(loads,0);}
 }
});
