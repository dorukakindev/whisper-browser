const {test}=require('node:test'),assert=require('node:assert/strict');
const fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {BrowserTranslationArchive,matchArchivedPage}=require('../src/browser-translation-archive');
const Contract=require('../src/subtitle-output-contract');
const {normalizeClosedBrowserTab}=require('../src/browser-tab-history');
const {calibrateCueTimeline}=require('../src/browser-cue-timeline-calibration');
const {calculateMultiPointTransform}=require('../src/browser-subtitle-sync');
const {createBrowserSubtitleFileStore}=require('../src/browser-subtitle-files');
const row={id:'x',source:'Open',translation:'Aç',tag:'button',role:'button'};
test('489-01 archive ID match also requires tag and role',()=>{
 assert.equal(matchArchivedPage({rows:[row]},[{id:'x',text:'Open',tag:'p',role:''}]).matches.length,0);
});
test('489-02 duplicate current IDs never receive ambiguous archived translations',()=>{
 const blocks=[{id:'x',text:'Open',tag:'button',role:'button'},{id:'x',text:'Open',tag:'button',role:'button'}];
 assert.equal(matchArchivedPage({rows:[row]},blocks).matches.length,0);
});
function archiveProbe(change){
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'archive489-'));
 try{
  const a=new BrowserTranslationArchive(root),blocks=[{id:'x',text:'Open',tag:'button',role:'button'}];
  a.savePage({url:'https://example.test/article',targetLanguage:'tr',blocks,translations:{x:'Aç'}});
  const entry=a.index.entries[0],file=path.join(root,entry.jsonPath);
  const record=JSON.parse(fs.readFileSync(file,'utf8'));change(entry,record);fs.writeFileSync(file,JSON.stringify(record));
  return a.findPage({url:'https://example.test/article',targetLanguage:'tr',blocks});
 }finally{fs.rmSync(root,{recursive:true,force:true});}
}
test('489-03 mismatched archived payload language is not restored',()=>{
 assert.equal(archiveProbe((_e,r)=>{r.targetLanguage='de';r.rows[0].translation='Öffnen';}),null);
});
test('489-04 archive display path cannot escape its page folder',()=>{
 assert.equal(archiveProbe(e=>{e.displayPath='../outside.md';}),null);
});
test('489-05 nonfinite subtitle counters cannot propagate infinity to UI',()=>{
 const item=Contract.outputDescriptors({outputs:[{path:'a.srt',role:'translation',total:Infinity,failed:Infinity}]})[0];
 assert.ok([item.total,item.failed,item.completed].every(Number.isFinite));
});
test('489-06 absent/null completed counts derive from total minus failures',()=>{
 const item=Contract.outputDescriptors({outputs:[{path:'a.srt',role:'translation',total:10,failed:2,completed:null}]})[0];
 assert.equal(item.completed,8);assert.equal(item.failed,2);
});
test('489-07 one uncloneable optional field cannot break closed-tab recovery',()=>{
 const value=normalizeClosedBrowserTab({url:'https://example.test/',trackRefs:[{id:'keep'},{id:'bad',f:()=>{}}],subtitleSelection:{f:()=>{}}});
 assert.deepEqual(value.trackRefs,[{id:'keep'}]);assert.equal(value.subtitleSelection,null);
});
test('489-08 missing cue times must not be interpreted as calibration at time zero',()=>{
 const text='A sufficiently long unique sentence for automatic alignment.';
 const result=calibrateCueTimeline([{start:10,text}],[{start:null,text}]);assert.equal(result.accepted,false);
});
test('489-09 centered multi-point regression works at a large timeline origin',()=>{
 for(const [origin,steps] of [[100000,[0,1.1,2.2]],[1e9,[0,1,2]]]){
 const result=calculateMultiPointTransform(steps.map(n=>({sourceTime:origin+n,videoTime:origin+n+4})));
 assert.equal(result.scale,1);assert.equal(result.offsetSeconds,4);assert.equal(result.confidence.rmsError,0);
 }
});
test('489-10 POSIX cache ownership respects case and never touches sibling directory',()=>{
 const removed=[];
 const store=createBrowserSubtitleFileStore({directory:'/case/Cache',path:path.posix,limit:1,
  fs:{readdirSync:()=>[],statSync:()=>({mtimeMs:1}),unlinkSync:p=>removed.push(p)}});
 store.touch('/case/cache/web-unowned.srt');store.touch('/case/Cache/web-owned.srt');
 assert.equal(store.snapshot().count,1);assert.deepEqual(removed,[]);
});
