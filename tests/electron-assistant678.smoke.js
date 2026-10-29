// Native long-content layout and conversation scrolling; controlled snapshots, no provider.
'use strict';
const {app,BrowserWindow}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','assistant678',Date.now()+'-'+process.pid);fs.mkdirSync(out,{recursive:true});app.setPath('userData',path.join(out,'profile'));app.commandLine.appendSwitch('disable-gpu');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
app.whenReady().then(async()=>{
 const win=new BrowserWindow({width:520,height:900,show:false,webPreferences:{preload:path.join(root,'src/assistant-overlay-preload.js'),contextIsolation:true,nodeIntegration:false,sandbox:true}});await win.loadFile(path.join(root,'src/renderer/assistant-overlay.html'));win.showInactive();const run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()');
 const messages=Array.from({length:24},(_,i)=>({id:'m'+i,role:i%2?'ai':'user',text:i%2?'Açık kaynakta verilen bilgileri karşılaştırdım. '+('Bağlamı koruyan uzun açıklama. '.repeat(12)):'Bu bölümün ana fikrini açıklar mısın?'}));
 const tool={id:'tools',role:'ai',text:'Çeviri önerisi hazır.',actions:[{id:'long',kind:'app_action',label:'Seçili altyazıyı çevir',excerpt:'Kaynak metin ve zaman bilgisi.\n'.repeat(90),resultStatus:'failed',resultText:'Kontrollü hata: ağ bağlantısı kurulamadı. Aynı kaynağı koruyarak tekrar deneyebilirsin.'}]};
 let value={opened:true,locale:'tr',theme:'dark',conversation:'first',context:'Uzun başlıklı kaynak · Bölüm 12',messages:[...messages,tool]};
 const send=async next=>{value=next;win.webContents.send('assistant:snapshot',value);await wait(130);};await send(value);
 assert(await run("const p=document.querySelector('.tool-card>p');return p.scrollHeight>p.clientHeight&&p.clientHeight<=145"),'long excerpt scrolls within its card');
 await run("document.getElementById('log').scrollTop=140;return true");const before=await run("return document.getElementById('log').scrollTop");
 await send({...value,messages:[...messages,{...tool,text:'Yeni iş sonucu geldi.'}]});assert(Math.abs(await run("return document.getElementById('log').scrollTop")-before)<2,'updates preserve reading position');
 await send({...value,conversation:'second',messages:[...messages,tool]});assert(await run("const l=document.getElementById('log');return l.scrollHeight-l.clientHeight-l.scrollTop<2"),'changing conversation opens at latest message');
 fs.writeFileSync(path.join(out,'long-tools-dark.png'),(await win.webContents.capturePage()).toPNG());
 win.setContentSize(360,580);await send({...value,busy:true,phase:'tool',activity:'İlgili kaynağın altyazısı okunuyor',suggestions:['Kaynağı özetle','Sayfayı Türkçeye çevir','Seçili aralığı seslendir','İşleri göster','Kaynakları karşılaştır'].map((label,id)=>({id:String(id),label,direct:true}))});
 fs.writeFileSync(path.join(out,'working-narrow.png'),(await win.webContents.capturePage()).toPNG());
 const narrow=await run("return {width:innerWidth,height:innerHeight,scrollWidth:document.documentElement.scrollWidth,rows:[...document.getElementById('panel').children].filter(n=>n.getBoundingClientRect().height).map(n=>({id:n.id||n.tagName,top:n.getBoundingClientRect().top,height:n.getBoundingClientRect().height,bottom:n.getBoundingClientRect().bottom}))}");fs.writeFileSync(path.join(out,'narrow-layout.json'),JSON.stringify(narrow,null,2));
 assert(await run("const f=document.getElementById('form').getBoundingClientRect(),l=document.getElementById('log').getBoundingClientRect();return document.documentElement.scrollWidth<=innerWidth+1&&f.bottom<=innerHeight&&l.height>=80"),'short window keeps composer and reading area reachable');
 await send({...value,busy:false,locale:'en',theme:'light'});await run("document.querySelector('.tool-card').focus();return true");assert(await run("return document.activeElement.closest('.tool-card')!==null"));fs.writeFileSync(path.join(out,'long-tools-light.png'),(await win.webContents.capturePage()).toPNG());

 // Expanded auxiliary panels must scroll without pushing the composer offscreen.
 await run("document.getElementById('sourceBox').open=true;document.getElementById('sourceDescription').textContent='Long source context. '.repeat(90);document.getElementById('review').hidden=false;document.getElementById('reviewText').textContent='Review this operation. '.repeat(50);document.getElementById('assistantWorkspace').scrollTop=99999;return true");
 fs.writeFileSync(path.join(out,'expanded-panels-debug.json'),JSON.stringify(await run("const f=document.getElementById('form').getBoundingClientRect(),w=document.getElementById('assistantWorkspace');return {form:{top:f.top,bottom:f.bottom},height:innerHeight,workspace:{top:w.getBoundingClientRect().top,bottom:w.getBoundingClientRect().bottom,scroll:w.scrollHeight,client:w.clientHeight},parents:[...document.getElementById('panel').children].map(n=>n.id||n.tagName)}"),null,2));
 assert(await run("const f=document.getElementById('form').getBoundingClientRect(),w=document.getElementById('assistantWorkspace');return f.bottom<=innerHeight&&w.scrollHeight>w.clientHeight&&w.getBoundingClientRect().bottom<=f.top+1"),'expanded panels scroll separately from the composer');
 assert(await run("const rows=[...document.querySelectorAll('#log>.message')];return rows.slice(1).every((row,i)=>row.getBoundingClientRect().top>=rows[i].getBoundingClientRect().bottom)"),'consecutive long messages never overlap');
 fs.writeFileSync(path.join(out,'expanded-panels-narrow.png'),(await win.webContents.capturePage()).toPNG());
 fs.writeFileSync(path.join(out,'result.json'),JSON.stringify({ok:true,longCards:true,readingPosition:true,threadSwitch:true,narrowComposer:true,liveProvider:false},null,2));console.log(JSON.stringify({ok:true,out}));app.exit(0);
}).catch(e=>{fs.writeFileSync(path.join(out,'failure.txt'),e.stack);console.error(e.stack);app.exit(1);});setTimeout(()=>app.exit(2),20000).unref();
