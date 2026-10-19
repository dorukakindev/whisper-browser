const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),os=require('node:os');
const {BrowserNoteStore}=require('../src/browser-note-store');
const geo=require('../src/manga-geometry'),pdf=require('../src/pdf-translate');
function temp(t){const d=fs.mkdtempSync(path.join(os.tmpdir(),'r480-'));t.after(()=>fs.rmSync(d,{recursive:true,force:true}));return d;}
test('480-01: malformed note rows cannot abort recovery of valid notes',t=>{
 const file=path.join(temp(t),'notes.json');fs.writeFileSync(file,JSON.stringify({version:1,annotations:[null,{id:'ok',mediaId:'movie',note:'Keep'}]}));
 const store=new BrowserNoteStore(file);assert.equal(store.list().length,1);
 assert.equal(store.importMissing([null,{id:'next',mediaId:'movie'}]),1);
});
test('480-02: public note results cannot mutate nested persisted state',t=>{
 const store=new BrowserNoteStore(path.join(temp(t),'notes.json'));
 const created=store.upsert({id:'ok',mediaId:'movie',tags:['keep'],links:[{url:'https://example.test',label:'Keep'}]});
 created.tags[0]='changed';store.list()[0].links[0].label='changed';store.snapshot().annotations[0].tags.push('changed');
 assert.deepEqual(store.get('ok').tags,['keep']);assert.equal(store.get('ok').links[0].label,'Keep');
});
test('480-03: CSS object-position keywords respect their axes and omitted center',()=>{
 const opts={offsetWidth:400,offsetHeight:300,naturalWidth:200,naturalHeight:100,objectFit:'none'};
 assert.deepEqual(geo.mangaImageContentRect({...opts,objectPosition:'top'}),{left:100,top:0,width:200,height:100});
 assert.deepEqual(geo.mangaImageContentRect({...opts,objectPosition:'left'}),{left:0,top:100,width:200,height:100});
 assert.deepEqual(geo.mangaImageContentRect({...opts,objectPosition:'top right'}),{left:200,top:0,width:200,height:100});
});
test('480-04: perspective transforms are not presented as supported axis maps',()=>{
 assert.equal(geo.mangaAxisTransform('matrix3d(1,0,0,0.01,0,1,0,0,0,0,1,0,0,0,0,1)').kind,'arbitrary');
});
test('480-05: hyphenated PDF lines cannot cross column or table boundaries',()=>{
 const lines=[{text:'inter-',x:0,y:800,width:50,height:10,column:0},{text:'Other column',x:200,y:790,width:80,height:10,column:1}];
 assert.equal(pdf.mergePdfLines(lines).length,2);
 assert.equal(pdf.mergePdfLines(lines.map(l=>({...l,tableCell:true}))).length,2);
});
test('480-06: generated anchor code uses whitespace normalization in positional matching',t=>{
 const {JSDOM}=require('jsdom');const dom=new JSDOM('<p id="one">lesson   text</p><p id="two">lesson text</p>',{runScripts:'outside-only'});t.after(()=>dom.window.close());
 dom.window.Element.prototype.scrollIntoView=()=>{};
 const script=require('../src/browser-library-tools').textAnchorRestoreScript({exact:'lesson text',positionStart:0,positionEnd:10});
 const result=dom.window.eval(script);assert.equal(result.status,'found');assert.equal(dom.window.document.querySelector('[data-whisper-note-highlight]').id,'one');
});
test('480-07: PDF user edits are not reapplied to a changed source sharing an ID',()=>{
 let state=pdf.createPdfTranslationState({pdfHash:'fixture',targetLanguage:'tr',model:'m'});
 state=pdf.recordPdfPageTranslation(state,1,[{id:'a',source:'First',translation:'First TR',userText:'My first TR'}]);
 const changed=pdf.recordPdfPageTranslation(state,1,[{id:'a',source:'Different',translation:'Different TR'}]);
 assert.equal(changed.pages[1][0].userText,undefined);
 assert.equal(pdf.recordPdfPageTranslation(state,1,[{id:'a',source:'First',translation:'New TR'}]).pages[1][0].userText,'My first TR');
});
test('480-08: malformed partial PDF results cannot silently become a completed page',()=>{
 const state=pdf.createPdfTranslationState({pdfHash:'fixture'});
 assert.throws(()=>pdf.recordPdfPageTranslation(state,1,[{source:'Keep',translation:'Kept'},null]));
 assert.deepEqual(state.pages,{});
});
test('480-09: null and boolean manga coordinates do not create fabricated boxes',()=>{
 const {normalizeMangaRegions}=require('../src/browser-manga');
 for(const missing of [null,false,''])assert.equal(normalizeMangaRegions([{box:[missing,0,500,500],source:'x',translation:'y'}]).length,0);
 assert.equal(normalizeMangaRegions([{box:[0,0,500,500],source:'x',translation:'y'}]).length,1);
});
test('480-10: explicitly supplied short PDF tail bytes cannot produce a cache identity',()=>{
 const size=2*1024*1024,head=Buffer.alloc(1024*1024);
 assert.throws(()=>pdf.pdfHashFromFirstChunk(size,head,Buffer.alloc(1)));
 assert.doesNotThrow(()=>pdf.pdfHashFromFirstChunk(size,head,Buffer.alloc(pdf.pdfHashPlan(size).tailLength)));
});
