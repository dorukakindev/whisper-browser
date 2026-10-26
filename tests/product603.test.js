'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),{EventEmitter}=require('node:events');
const {safeShortening}=require('../src/dub-text-guard');
const {buildPdfNarrationPages,mergePdfTextItems}=require('../src/pdf-translate');
const item=(str,x,y,width=120,height=10)=>({str,width,height,transform:[1,0,0,height,x,y]});
test('editor retains scope, spoken quantities, numeric ordering and named roles',()=>{
 const prefix='Bu uzun açıklamada bütün ayrıntılar özenle kaydedildi ve son raporda açıkça belirtildi: ';
 for(const [a,b] of [['sadece bugün','bugün'],['herkes hariç','herkes dahil'],['en az üç kişi','en fazla üç kişi'],['henüz hazır','artık hazır'],['üç kişi','beş kişi'],['iki yüz kişi','yüz iki kişi'],['3 kişi 5 gün','5 kişi 3 gün'],["Ahmet'e verdi","Ahmet'ten aldı"],['gelmeyecek','gelecek'],['3 kişi 3 gün','3 kişi gün']]) assert.equal(safeShortening(prefix+a,prefix+b,{natural:true}),false,`${a} / ${b}`);
 assert(safeShortening(prefix+'sadece bugün',prefix+'yalnızca bugün',{natural:true}));
 assert(safeShortening("Ahmet’e verdi.","Ahmet'e verdi."));
});
test('three prose columns remain column-major with a spanning heading; tables remain row-major',()=>{
 const items=[item('Spanning chapter title',40,720,520,20)];
 const columns=[['First column starts here','First column ends here.'],['Second column starts here','Second column ends here.'],['Third column starts here','Third column ends here.']];
 for(let row=0;row<2;row++)for(let col=0;col<3;col++)items.push(item(columns[col][row],40+col*180,680-row*15,125+row*5));
 const text=mergePdfTextItems(items,{pageNumber:1,pageHeight:800,pageWidth:600}).map(p=>p.text).join('\n');
 assert(text.indexOf('Spanning')<text.indexOf('First'));assert(text.indexOf('First column ends')<text.indexOf('Second column starts'));assert(text.indexOf('Second column ends')<text.indexOf('Third column starts'));
 const table=[];for(let row=0;row<3;row++)for(let col=0;col<3;col++)table.push(item(`${row}${col}`,40+180*col,650-15*row,10));
 assert.deepEqual(mergePdfTextItems(table,{pageNumber:1,pageHeight:800,pageWidth:600}).map(p=>p.text),['00','01','02','10','11','12','20','21','22']);
});
test('repeated marginal labels and page numbers are excluded, body numeric text survives',()=>{
 const pages=[1,2].map(pageNumber=>({pageNumber,pageHeight:800,pageWidth:600,items:[item('Repeated book header',40,780),item('42',50,400,10),item(`Page ${pageNumber}`,250,20,30)]}));
 const prepared=buildPdfNarrationPages(pages);for(const page of prepared){assert.equal(page.text,'42');assert.equal(page.preparation.removedMarginLines,2);}
});
test('native PDF page count rejects a forged reader count and out-of-file page',async(t)=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'product603-'));t.after(()=>fs.rmSync(root,{recursive:true,force:true}));
 const source=path.join(root,'Türkçe kitap.pdf');fs.writeFileSync(source,require('./helpers/pdf-fixture')());
 assert.equal(await require('../src/pdf-document-info').pdfPageCount(source),2);
 const app=new EventEmitter();app.getPath=()=>root;let handle;
 require('../src/media-workflows').registerMediaWorkflows({app,ipcMain:{handle:(_,f)=>handle=f},authorized:()=>true,owner:()=>null,resolvePdf:()=>({filePath:source,title:'Book'})});
 const call=r=>handle({sender:{}},{action:'book-from-reader',pdfHash:'authorized',...r});
 assert.equal((await call({numPages:3,pages:[{pageNumber:3,text:'Forged page'}]})).ok,false);
 assert.equal((await call({numPages:2,pages:[{pageNumber:3,text:'Beyond file'}]})).ok,false);
 assert((await call({numPages:2,pages:[{pageNumber:2,text:'Valid selected page'}]})).ok);
});
