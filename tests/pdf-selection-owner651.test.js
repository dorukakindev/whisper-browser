'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),{JSDOM}=require('jsdom');
function setup(t){
 const dom=new JSDOM(fs.readFileSync(require.resolve('../src/renderer/index.html'),'utf8'),{runScripts:'outside-only'});t.after(()=>dom.window.close());const w=dom.window,d=w.document;
 w.HTMLMediaElement.prototype.pause=w.HTMLMediaElement.prototype.load=()=>{};
 d.getElementById('playerLayer').classList.remove('hidden');d.getElementById('pdfReader').classList.remove('hidden');
 const pages=d.getElementById('pdfReaderPages');pages.replaceChildren();const records=new Map();
 for(const n of [1,2]){const article=d.createElement('article');article.className='pdf-page';article.dataset.page=String(n);const text=d.createElement('p');text.textContent='Page '+n+' '.repeat(8);article.append(text);pages.append(article);records.set(n,{article,blocks:[{source:'Page '+n+' original text.'}]});}
 w.player={pdfReader:{pdfHash:'owned',currentPage:1,pages:records,pdf:{numPages:2},state:{pages:{}}}};w.UiLocale={get:()=> 'en'};
 w.eval(fs.readFileSync(require.resolve('../src/renderer/pdf-reader-experience'),'utf8'));w.PdfReaderExperience.opened();
 function select(anchor,focus,text,collapsed=false){w.getSelection=()=>({anchorNode:anchor,focusNode:focus,isCollapsed:collapsed,toString:()=>text});d.dispatchEvent(new w.Event('selectionchange'));}
 return {w,d,records,select,context:()=>w.PdfReaderExperience.context()};
}
test('PDF selection from an unrelated article cannot replace the active book passage',t=>{
 const h=setup(t),a=h.records.get(1).article.firstChild.firstChild;h.select(a,a,'Owned passage');assert.equal(h.context().selectedText,'Owned passage');
 const other=h.d.createElement('article');other.className='pdf-page';other.dataset.page='1';other.textContent='Foreign document';h.d.body.append(other);h.select(other.firstChild,other.firstChild,'Foreign document');assert.equal(h.context().selectedText,'Owned passage');
});
test('cross-page and collapsed in-reader selection clear a previous passage while assistant focus preserves it',t=>{
 const h=setup(t),a=h.records.get(1).article.firstChild.firstChild,b=h.records.get(2).article.firstChild.firstChild;
 h.select(a,a,'Owned');h.select(h.d.body,h.d.body,'',true);assert.equal(h.context().selectedText,'Owned','moving focus to assistant preserves chosen passage');
 h.select(a,b,'Across pages');assert.equal(h.context().selectedText,'');h.select(a,a,'Owned');h.select(a,a,'',true);assert.equal(h.context().selectedText,'');
});
test('long PDF selections expose the original truncation flag instead of silently claiming completeness',t=>{
 const h=setup(t),a=h.records.get(1).article.firstChild.firstChild;h.select(a,a,'x'.repeat(9000));assert.equal(h.context().selectedText.length,8000);assert.equal(h.context().selectedTextTruncated,true);
 h.select(a,a,'Short');assert.equal(h.context().selectedTextTruncated,false);h.w.player.pdfReader.currentPage=2;h.w.PdfReaderExperience.changed();assert.equal(h.context().selectedText,'');
});
