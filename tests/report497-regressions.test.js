'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const root=process.env.REPORT497_BASE || path.resolve(__dirname,'..');
const mod=name=>require(path.join(root,'src',name));
const {safeShortening:safe}=mod('dub-text-guard');
for(const [id,title,source,bad,good] of [
 ['01','currency','Tutar tam olarak 50 dolar olacak.','Tutar 50 euro.','Tutar 50 dolar.'],
 ['02','question','Bu sorunun yanıtını biliyor musun?','Yanıtı biliyorsun.','Yanıtı biliyor musun?'],
 ['03','acronym','NASA bu görevi gelecek yıl yapacak.','NATO görevi yapacak.','NASA görevi yapacak.'],
 ['04','comparison','Sıcaklık < 50 olarak ölçüldü.','Sıcaklık > 50.','Sıcaklık < 50.'],
 ['05','past negation','Bu kişi dün buraya gelmedi.','Bu kişi geldi.','Bu kişi gelmedi.'],
 ['06','uncertainty','Bu sonuç doğru olabilir.','Bu sonuç doğru.','Doğru olabilir.'],
])test(`497-${id} rewritten speech preserves ${title}`,()=>{
 assert.equal(safe(source,bad),false);assert.equal(safe(source,good),true);
});
const R=mod('browser-subtitle-review');
const base={start:1,end:3,text:'Source'},edited={start:1.2,end:3.2,text:'Reviewed'};
test('497-07 review cannot migrate to a different explicit cue identity',()=>{
 const result=R.reconcile([{...base,cueId:'different'}],[{cueId:'original',base,edited}]);
 assert.equal(result.cues[0].text,'Source');assert.equal(result.conflicts.length,1);
 assert.equal(R.reconcile([base],[{cueId:'original',base,edited}]).cues[0].text,'Reviewed','identity-less file fallback remains available');
});
test('497-08 reapplying a timing edit retains original source times',()=>{
 const cue={...edited,cueId:'original',sourceStart:1,sourceEnd:3};
 const result=R.reconcile([cue],[{cueId:'original',base,edited}]).cues[0];
 assert.equal(result.sourceStart,1);assert.equal(result.sourceEnd,3);
});
const P=mod('browser-subtitles');
test('497-09 normalization retains distinct simultaneous source identities',()=>{
 const cues=P.normalizeCues([{...base,cueId:'a'},{...base,cueId:'b'}]);
 assert.equal(cues.length,2);assert.deepEqual(cues.map(c=>c.cueId),['a','b']);
 assert.equal(P.normalizeCues([base,{...base,start:1.1}]).length,1,'identity-less rolling repeats still collapse');
});
test('497-10 LRC offset metadata aligns lyrics without becoming spoken text',()=>{
 const parse=text=>P.parseSubtitlePayload(text,'','lyrics.lrc').cues;
 assert.equal(parse('[offset:-2000]\n[00:01.00]Hello\n[00:03.00]World')[0].start,3);
 const negative=parse('[offset:2000]\n[00:01.00]Hello\n[00:03.00]World');
 assert.equal(negative[0].start,0);assert.equal(negative[0].end,1);
 assert.deepEqual(negative.map(c=>c.text),['Hello','World']);
});
test('497-11 portable project tolerates an absent optional mix object',()=>{
 assert.deepEqual(mod('renderer/dub-workspace-model').mix(null),mod('renderer/dub-workspace-model').mix());
});
test('497-12 saving cannot silently discard a missing linked subtitle',async()=>{
 const folder=fs.mkdtempSync(path.join(os.tmpdir(),'report497-project-'));
 try{
  const voice=path.join(folder,'voice.wav'),subtitle=path.join(folder,'missing.srt'),target=path.join(folder,'saved.dubproject');fs.writeFileSync(voice,'fixture');
  const handlers={};const svc=mod('dub-workspace').registerDubWorkspace({ipcMain:{handle:(n,f)=>handlers[n]=f},authorized:()=>true,owner:()=>null,
   dialog:{showSaveDialog:async()=>({filePath:target})},authorizeMedia:async p=>p,authorizeSubtitle:async p=>p,grantMedia:()=>{},grantSubtitle:()=>{}});
  svc.register({path:voice,subtitle});
  const result=await handlers['dub:projectSave']({sender:{isDestroyed:()=>false}},{path:voice});
  assert.equal(result.ok,false);assert.equal(fs.existsSync(target),false);assert.equal(svc.running(),false);
  assert.deepEqual(fs.readdirSync(folder),['voice.wav']);
 }finally{fs.rmSync(folder,{recursive:true,force:true});}
});
const A=mod('browser-translation-archive');
function archiveTest(fn){const folder=fs.mkdtempSync(path.join(os.tmpdir(),'report497-archive-'));try{fn(new A.BrowserTranslationArchive(folder));}finally{fs.rmSync(folder,{recursive:true,force:true});}}
const raw={url:'https://example.test/article',title:'Article',targetLanguage:'tr',complete:true,
 blocks:[{id:'a',text:'First source',section:'A'},{id:'b',text:'Second source',section:'B'}],translations:{a:'İlk çeviri',b:'İkinci çeviri'}};
test('497-13 separate selections from one page remain independently saved',()=>archiveTest(archive=>{
 const first=archive.savePage({...raw,scope:'selection',blocks:[raw.blocks[0]]});
 const second=archive.savePage({...raw,scope:'selection',blocks:[raw.blocks[1]]});
 assert.notEqual(first.id,second.id);assert.equal(fs.existsSync(first.path),true);assert.equal(archive.listPages({url:raw.url}).length,2);
}));
test('497-14 partial rerun cannot replace a complete archived article',()=>archiveTest(archive=>{
 const first=archive.savePage(raw);archive.savePage({...raw,complete:false,translations:{a:'Yeni kısmi çeviri'}});
 assert.equal(fs.existsSync(first.path),true);
 assert.equal(archive.listPages({url:raw.url}).filter(e=>e.complete).length,1);
 assert.equal(archive.findPage({url:raw.url,blocks:raw.blocks}).matches.length,2);
}));
test('497-15 archived context cannot swap same-text blocks between sections',()=>{
 const record={rows:[{id:'bank',source:'Bank',tag:'p',role:'',section:'Finance',translation:'Banka'}]};
 assert.equal(A.matchArchivedPage(record,[{id:'bank',text:'Bank',tag:'p',section:'River'}]).matches.length,0);
 assert.equal(A.matchArchivedPage(record,[{id:'new',text:'Bank',tag:'p',section:'River'}]).matches.length,0);
 assert.equal(A.matchArchivedPage(record,[{id:'new',text:'Bank',tag:'p',section:'Finance'}]).matches[0].translation,'Banka');
});
