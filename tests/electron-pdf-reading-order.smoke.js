'use strict';
const {app,BrowserWindow,dialog}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','pdf-order706-'+Date.now());fs.mkdirSync(out,{recursive:true});process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile');app.setAppPath(root);app.commandLine.appendSwitch('disable-gpu');
const expected=[];
function makePdf(){
 const objects=['<< /Type /Catalog /Pages 2 0 R >>','<< /Type /Pages /Kids [3 0 R 5 0 R] /Count 2 >>'];
 for(let page=1;page<=2;page++){
  const rows=[{text:'Chapter '+page,x:50,y:750,size:22}];
  for(let i=0;i<4;i++)rows.push({text:'Left column sentence '+(i+1)+'.',x:50,y:700-i*20,size:12},{text:'Right column sentence '+(i+1)+'.',x:320,y:700-i*20,size:12});
  rows.push({text:'1 Footnote belongs after both columns.',x:50,y:55,size:8});
  expected.push(['Chapter '+page,...Array.from({length:4},(_,i)=>'Left column sentence '+(i+1)+'.'),...Array.from({length:4},(_,i)=>'Right column sentence '+(i+1)+'.'),'1 Footnote belongs after both columns.'].join(' '));
  const content=rows.map(r=>`BT /F1 ${r.size} Tf ${r.x} ${r.y} Td (${r.text}) Tj ET`).join('\n');
  objects.push(`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 7 0 R >> >> /Contents ${4+(page-1)*2} 0 R >>`,`<< /Length ${Buffer.byteLength(content)} >>\nstream\n${content}\nendstream`);
 }
 objects.push('<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>');let pdf='%PDF-1.4\n',offsets=[0];for(let i=0;i<objects.length;i++){offsets.push(Buffer.byteLength(pdf));pdf+=`${i+1} 0 obj\n${objects[i]}\nendobj\n`;}
 const xref=Buffer.byteLength(pdf);pdf+=`xref\n0 ${objects.length+1}\n0000000000 65535 f \n`+offsets.slice(1).map(n=>String(n).padStart(10,'0')+' 00000 n \n').join('')+`trailer\n<< /Size ${objects.length+1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;return pdf;
}
const source=path.join(out,'Çift sütun dipnot.pdf');fs.writeFileSync(source,makePdf());dialog.showOpenDialog=async()=>({canceled:false,filePaths:[source]});require('../src/main');const wait=ms=>new Promise(r=>setTimeout(r,ms));async function until(fn,label){const end=Date.now()+25000;while(Date.now()<end){if(await fn())return;await wait(80);}throw Error('Timeout '+label);}
app.whenReady().then(async()=>{
 let win;await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'main');const run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);win.webContents.setBackgroundThrottling(false);win.setContentSize(1400,950);win.show();
 await run('await initialSettingsReady;UiLocale.set("tr",false);applyUiTheme("dark");await openPlayer();await openPdfReader();return true');await until(()=>run('return player.pdfReader?.pages.get(1)?.article?.dataset.state==="ready"'),'pdf');
 const pages=await run('const out=[];for(let page=1;page<=2;page++){const blocks=await extractPdfReaderPage(page);out.push({page,blocks});}return out');fs.writeFileSync(path.join(out,'extracted.json'),JSON.stringify({pages,expected},null,2));
 for(const p of pages){const actual=p.blocks.map(b=>b.source).join(' ').replace(/\s+/g,' ').trim();assert.equal(actual,expected[p.page-1],'Narration order: heading, left column, right column, then footnote');assert.equal(p.blocks[0].kind,'heading');assert.equal(p.blocks.at(-1).kind,'footnote');}
 await run('setPdfReaderView("reading");document.getElementById("pdfVoiceOpen").click();document.getElementById("pdfVoiceFrom").value="1";document.getElementById("pdfVoiceTo").value="2";document.getElementById("pdfVoicePreviewOpen").click();return true');await until(()=>run('return !document.getElementById("pdfVoicePreview").hidden&&!document.getElementById("pdfVoicePreviewOpen").disabled'),'preview');
 assert.equal(await run('return document.getElementById("pdfVoicePreviewText").value.replace(/\\s+/g," ").trim()'),expected[0]);
 fs.writeFileSync(path.join(out,'preview.png'),(await win.webContents.capturePage()).toPNG());fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:true,realPdf:true,actualGpu:false,pages:2,expectedOrder:'heading,left,right,footnote',previewMatchesExtraction:true},null,2));console.log(JSON.stringify({ok:true,out}));app.exit(0);
}).catch(e=>{fs.writeFileSync(path.join(out,'error.txt'),e.stack);console.error(e.message);app.exit(1);});setTimeout(()=>app.exit(2),70000).unref();
