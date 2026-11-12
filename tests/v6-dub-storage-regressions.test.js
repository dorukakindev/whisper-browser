'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),{EventEmitter}=require('node:events'),{createRequire}=require('node:module');
test('V6 markup permits balanced reordered styles, but rejects lost attributes and broken nesting',()=>{
 const {translationBlockingIssues:issues}=require('../src/subtitle-sentence-layout');
 assert(!issues('<i>Hello</i> <b>world</b>','<b>Dünya</b> <i>merhaba</i>','tr').includes('markup_mismatch'));
 assert(!issues('<font color="#ff0000">Hi</font>','<font color="#FF0000">Merhaba</font>','tr').includes('markup_mismatch'));
 assert(issues('<i><b>Hello</b></i>','<i><b>Merhaba</i></b>','tr').includes('markup_mismatch'));
 assert(issues('<font color="#ff0000">Hi</font>','<font color="#00ff00">Merhaba</font>','tr').includes('markup_mismatch'));
 assert(!issues('<v Alice>Hello','<v Alice>Merhaba','tr').includes('markup_mismatch'));
});
test('V6 Windows package mappings honor separators/case and keep prefix boundaries',()=>{
 const {remapRendererValues}=require('../src/workspace-package');
 const data={sourceRoot:'C:\\OLD',mappings:[],rendererValues:{'subtitleStyle':JSON.stringify({fontFile:'c:/old/font.ttf'})}};
 const out=remapRendererValues('D:\\NEW',data);assert.equal(JSON.parse(out.subtitleStyle).fontFile,'D:\\NEW/font.ttf');
 data.rendererValues.subtitleStyle=JSON.stringify({fontFile:'c:/older/font.ttf'});assert.equal(JSON.parse(remapRendererValues('D:\\NEW',data).subtitleStyle).fontFile,'c:/older/font.ttf');
});
test('V6 cancelling one FIFO media lookup keeps its sibling and consumes the cancelled reply',async()=>{
 const file=require.resolve('../src/browser-media-tools'),realRequire=createRequire(file);let child,kills=0;
 const spawn=()=>{child=new EventEmitter();child.stdout=new EventEmitter();child.stderr=new EventEmitter();child.stdin=new EventEmitter();for(const s of [child.stdout,child.stderr,child.stdin]){s.setEncoding=()=>{};s.unref=()=>{};}child.stdin.write=()=>{};child.kill=()=>{kills++;};child.unref=()=>{};return child;};
 const context={__dirname:path.dirname(file),module:{exports:{}},require:n=>n==='node:child_process'?{spawn,spawnSync:()=>({status:0})}:realRequire(n),process:{env:{},once(){}},Buffer,setTimeout,clearTimeout};
 vm.runInNewContext(fs.readFileSync(file,'utf8'),context);
 const api=context.module.exports.createBrowserMediaTools({pythonPath:process.execPath});const c=new AbortController();
 const first=api.semanticSearch({query:'first',cues:[]},{signal:c.signal});const rejected=assert.rejects(first,/iptal/);const second=api.semanticSearch({query:'second',cues:[]});c.abort();await rejected;
 assert.equal(kills,0);child.stdout.emit('data','{"ok":true,"rows":["cancelled"]}\n{"ok":true,"rows":["second"]}\n');assert.equal((await second).rows[0],'second');
});
test('V6 content indexing collapses time fragments but retains real section fragments',()=>{
 const {safePageIndexUrl:clean}=require('../src/watch-index');assert.equal(clean('https://example.org/video#t=10s'),clean('https://example.org/video#t=20s'));assert.equal(clean('https://example.org/video#start=10'),clean('https://example.org/video'));
});
test('V6 watch replacement can be staged without committing and retains tombstones',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v6-stage-')),file=path.join(dir,'watch-library.json');try{
 const {createWatchLibraryStore}=require('../src/watch-library-store'),store=createWatchLibraryStore({filePath:file});store.upsert({key:'file:C:/a.mp4',title:'A'});store.remove('file:C:/a.mp4');const before=fs.readFileSync(file);
 const staged=store.prepareReplaceItems([{key:'file:C:/a.mp4',title:'Imported'},{key:'file:C:/b.mp4',title:'B'}]);assert.deepEqual(fs.readFileSync(file),before);assert(!staged.document.items.some(x=>x.key==='file:c:/a.mp4'));assert(staged.document.items.some(x=>x.title==='B'));
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('V6 integrity dedupe preserves sessions, collections and subtitles from both records',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v6-integrity-')),file=path.join(dir,'watch-library.json');try{
 fs.writeFileSync(file,JSON.stringify({schemaVersion:3,items:[{key:'file:C:/a.mp4',lastWatched:10,collections:['old'],subtitlePaths:['old.srt'],sessions:[{id:'old',watchSeconds:7}]},{key:'file:c:/a.mp4',lastWatched:20,collections:['new'],subtitlePaths:['new.srt'],sessions:[{id:'new',watchSeconds:9}]}]}));
 const api=require('../src/data-integrity'),issue=api.auditUserData(dir).issues.find(i=>i.kind==='duplicate');assert(issue);assert.deepEqual(api.applyRepairs(dir,[issue.id]).errors,[]);
 const result=JSON.parse(fs.readFileSync(file)).items[0];assert.deepEqual(result.collections,['old','new']);assert.deepEqual(result.subtitlePaths,['old.srt','new.srt']);assert.equal(result.sessions.length,2);assert.equal(result.totalWatchSeconds,16);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('V6 missing text history returns an actionable missing-media error without a raw path',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v6-text-'));try{
 const app={getPath:()=>dir},history=require('../src/text-voice-history').createTextVoiceHistory(app);assert.throws(()=>history.get('text-12345678-1234-1234-1234-123456789012'),e=>e.message.includes('Saved text audio')&&!e.message.includes(dir));assert.deepEqual(history.list(),[]);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('V6 explicit secret clear survives corrupt mirror while preserving opaque encrypted fields',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v6-vault-')),file=path.join(dir,'vault.json');try{
 const {SafeSecretStore}=require('../src/secret-store');const safeStorage={isEncryptionAvailable:()=>true,encryptString:s=>Buffer.from(s),decryptString:b=>{if(String(b)==='opaque')throw Error('unavailable');return String(b);}};
 const entries={apiKey:Buffer.from('example-only').toString('base64'),token:Buffer.from('opaque').toString('base64')};fs.writeFileSync(file,JSON.stringify({version:1,entries}));fs.writeFileSync(file+'.bak','{');
 const store=new SafeSecretStore({filePath:file,safeStorage,fields:['apiKey','token']});assert.equal(store.save({}, {dropFields:['apiKey']}).ok,true);
 for(const name of [file,file+'.bak']){const value=JSON.parse(fs.readFileSync(name));assert.equal(value.entries.apiKey,undefined);assert.equal(value.entries.token,entries.token);}
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
test('V6 catalog and companion JSON import roll back together without publishing new cache',()=>{
 const dir=fs.mkdtempSync(path.join(os.tmpdir(),'v6-catalog-tx-')),file=path.join(dir,'catalog.json'),shelf=path.join(dir,'shelf.json');try{
 let fail=false;const io={...fs,renameSync:(from,to)=>{if(fail&&to===shelf&&from.endsWith('.tmp')){fail=false;const error=Error('injected install failure');error.code='EIO';throw error;}return fs.renameSync(from,to);}};
 const store=require('../src/media-catalog-store').createMediaCatalogStore({filePath:file,fsImpl:io});
 store.upsert({kind:'film',title:'Existing'});fs.writeFileSync(shelf,JSON.stringify({items:['old']}));const before=fs.readFileSync(file),shelfBefore=fs.readFileSync(shelf);fail=true;
 assert.throws(()=>store.upsertMany([{kind:'film',title:'New'}],{transactionEntries:[{filePath:shelf,value:{items:['new']}}]}),/injected/);
 assert.deepEqual(fs.readFileSync(file),before);assert.deepEqual(fs.readFileSync(shelf),shelfBefore);assert.deepEqual(fs.readFileSync(file+'.bak'),before);assert.equal(store.list().length,1);
 store.upsertMany([{kind:'film',title:'New'}],{transactionEntries:[{filePath:shelf,value:{items:['new']}}]});assert.equal(store.list().length,2);assert.deepEqual(JSON.parse(fs.readFileSync(shelf)),{items:['new']});
 const {writeJsonTransaction,MAX_IMPORT_BYTES}=require('../src/settings-security'),largeShelf={items:['new'],payload:'x'.repeat(MAX_IMPORT_BYTES)};
 assert.throws(()=>writeJsonTransaction([{filePath:shelf,value:largeShelf}]),/JSON dosyası/);
 assert.throws(()=>writeJsonTransaction([{filePath:shelf,value:{}}],fs,undefined,{maxBytes:32_000_001}),/sınırı geçersiz/);
 store.upsertMany([{kind:'film',title:'Third'}],{transactionEntries:[{filePath:shelf,value:largeShelf}]});assert.equal(store.list().length,3);assert.equal(JSON.parse(fs.readFileSync(shelf)).payload.length,MAX_IMPORT_BYTES);
 }finally{fs.rmSync(dir,{recursive:true,force:true});}
});
