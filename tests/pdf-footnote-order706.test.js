'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {buildPdfParagraphPages}=require('../src/pdf-translate');
const item=(str,x,y,height,width=str.length*height*.45)=>({str,width,height,transform:[height,0,0,height,x,y]});
function page(n){return {pageNumber:n,pageWidth:612,pageHeight:792,items:[item('Repeated running header',50,780,12),item('Chapter '+n,50,750,22),...Array.from({length:4},(_,i)=>[item('Left sentence '+(i+1)+'.',50,700-i*20,12),item('Right sentence '+(i+1)+'.',320,700-i*20,12)]).flat(),item('1 Footnote belongs after columns.',50,55,8),item(String(n),300,20,8)]};}
test('Repeated numbered footnotes survive margin cleanup and follow both prose columns',()=>{
 const pages=buildPdfParagraphPages([page(1),page(2)]);
 for(const p of pages){const text=p.paragraphs.map(p=>p.text).join(' ');assert.equal(text,['Chapter '+p.pageNumber,...Array.from({length:4},(_,i)=>'Left sentence '+(i+1)+'.'),...Array.from({length:4},(_,i)=>'Right sentence '+(i+1)+'.'),'1 Footnote belongs after columns.'].join(' '));assert.equal(p.paragraphs[0].kind,'heading');assert.equal(p.paragraphs.at(-1).kind,'footnote');assert(!text.includes('Repeated running header'));}
});
test('Ordinary repeated footer copy and standalone page numbers remain removable',()=>{
 const pages=[page(1),page(2)].map(p=>({...p,items:[...p.items,item('Repeated footer',50,35,12)]}));
 for(const p of buildPdfParagraphPages(pages)){const text=p.paragraphs.map(r=>r.text).join(' ');assert(!text.includes('Repeated footer'));assert(text.includes('1 Footnote belongs after columns.'));}
});
