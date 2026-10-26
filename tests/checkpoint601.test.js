'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os'),{EventEmitter}=require('node:events');
const {safeShortening}=require('../src/dub-text-guard');
test('progressive and future negation changes remain blocked in the dubbing editor',()=>{
 const prefix='Bu uzun anlatım sırasında bütün ayrıntılar sırasıyla dikkatlice değerlendirildi ve sonunda ';
 for(const [a,b] of [['gelmiyor','geliyor'],['geçirmiyor','geçiriyor'],['geçirmeyecek','geçirecek'],['geçirmez','geçirir']])assert.equal(safeShortening(prefix+a,prefix+b,{natural:true}),false);
 assert.equal(safeShortening('Okula gelmeye başladı.','Okula gelmeye başladı.'),true);
});
test('identical book scopes reuse projects without merging different ranges or overwriting edited text',async(t)=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'checkpoint601-book-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=path.join(root,'Türkçe kitap.pdf');fs.writeFileSync(source,require('./helpers/pdf-fixture')());
 const app=new EventEmitter();app.getPath=()=>root;const sender={};let handler;
 const shelf={id:'shelf-one',path:source};
 require('../src/media-workflows').registerMediaWorkflows({app,ipcMain:{handle:(_,f)=>handler=f},authorized:()=>true,owner:()=>null,
  dialog:{showOpenDialog:async()=>({canceled:false,filePaths:[source]})},resolveShelfBook:id=>id===shelf.id?shelf:null,
  linkShelfBook:(_,id)=>shelf.productionProjectId=id,resolvePdf:()=>({filePath:source,title:'Book'})});
 const call=(action,r={})=>handler({sender},{action,...r});
 const a=await call('book-from-shelf',{shelfId:shelf.id});assert(a.ok,a.error);
 const pages=a.project.chapters.map(c=>({pageNumber:c.pageNumber,text:c.text}));
 const b=await call('book-from-reader',{pdfHash:'fixture',numPages:a.project.numPages,pages});assert(b.ok,b.error);assert.equal(b.project.id,a.project.id);
 const c=await call('book-import');assert(c.ok,c.error);assert.equal(c.project.id,a.project.id);
 const subset=await call('book-from-reader',{pdfHash:'fixture',numPages:a.project.numPages,pages:pages.slice(0,1)});assert(subset.ok,subset.error);assert.notEqual(subset.project.id,a.project.id);
 const again=await call('book-from-reader',{pdfHash:'fixture',numPages:a.project.numPages,pages:pages.slice(0,1)});assert.equal(again.project.id,subset.project.id);
 assert((await call('book-save',{id:a.project.id,chapter:0,text:'A user edited narration draft.'})).ok);
 const fresh=await call('book-from-reader',{pdfHash:'fixture',numPages:a.project.numPages,pages});assert(fresh.ok,fresh.error);assert.notEqual(fresh.project.id,a.project.id);
 assert.equal((await call('book-open',{id:a.project.id})).project.chapters[0].text,'A user edited narration draft.');
});
