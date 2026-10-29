'use strict';
const {app,BrowserWindow,ipcMain,session,dialog,nativeImage}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),label=process.argv.includes('--before')?'before':'after',out=path.join(root,'.uiprev','design786-'+label+'-'+Date.now());fs.mkdirSync(out,{recursive:true});app.setAppPath(root);process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile');app.commandLine.appendSwitch('disable-gpu');global.fetch=async()=>{throw Error('Isolated design review: external network disabled');};require('../src/main');let win;const rows=[],wait=ms=>new Promise(r=>setTimeout(r,ms)),run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
async function until(fn,label){for(let i=0;i<250;i++){if(await fn())return;await wait(60);}throw Error('Missing state '+label);}
async function capture(name,scope){await run('await document.fonts.ready;return true');await wait(450);const metrics=await run(`const scope=document.querySelector(${JSON.stringify(scope)}),r=scope.getBoundingClientRect();return {scope:${JSON.stringify(scope)},width:innerWidth,height:innerHeight,scopeWidth:r.width,scopeHeight:r.height,overflow:scope.scrollWidth>scope.clientWidth+1,navHeight:document.querySelector('.mh-header').getBoundingClientRect().height,navPage:document.getElementById('mediaHome').dataset.page,dialogs:[...document.querySelectorAll('dialog[open]')].map(n=>n.id),tinyControls:[...scope.querySelectorAll('button,input,select,summary')].filter(n=>{const r=n.getBoundingClientRect();return r.width&&r.height&&r.height<35&&!n.closest('details:not([open])')}).slice(0,16).map(n=>({id:n.id,text:(n.textContent||n.getAttribute('aria-label')||'').slice(0,45),height:n.getBoundingClientRect().height}))};`);rows.push({name,...metrics});fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());assert(!metrics.overflow,name+' horizontal overflow');}
async function close(){await run("document.querySelectorAll('dialog[open]').forEach(d=>d.close());return true");}
async function clickNav(page){
 const selector=page==='books'?'[data-home-mode="books"]':`[data-home-page="${page}"]`;
 const point=await run(`const b=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect();return {x:b.x+b.width/2,y:b.y+b.height/2}`),z=win.webContents.getZoomFactor();
 win.webContents.sendInputEvent({type:'mouseDown',button:'left',clickCount:1,x:Math.round(point.x*z),y:Math.round(point.y*z)});
 win.webContents.sendInputEvent({type:'mouseUp',button:'left',clickCount:1,x:Math.round(point.x*z),y:Math.round(point.y*z)});
 await until(()=>run(`return document.getElementById('mediaHome').dataset.page==='${page}'&&document.getElementById('mediaHome').dataset.navigationInput==='pointer'`),'native nav '+page);
 if(page!=='books'){const style=await run(`const s=getComputedStyle(document.querySelector(${JSON.stringify(selector)}));return {outline:s.outlineStyle,background:s.backgroundColor,shadow:s.boxShadow}`);
 assert.equal(style.outline,'none');assert.equal(style.background,'rgba(0, 0, 0, 0)');assert.equal(style.shadow,'none');}
}
async function seed(){
 const names=['Kuzeyin Hikâyesi','Deniz ile Gelenler','A Long Journey Through the Quiet City','Son Perde','Arşivden Bir Gece','The Returning'];
 const pixels=Buffer.alloc(300*450*4);
 for(let y=0;y<450;y++)for(let x=0;x<300;x++){const i=(y*300+x)*4;pixels[i]=40+Math.round(y/9);pixels[i+1]=40+Math.round(x/7);pixels[i+2]=48+Math.round(y/14);pixels[i+3]=255;}
 const png=nativeImage.createFromBitmap(pixels,{width:300,height:450}).toPNG(),poster=path.join(out,'synthetic-cover.png');fs.writeFileSync(poster,png);
 session.defaultSession.protocol.handle('https',()=>new Response(png,{headers:{'Content-Type':'image/png'}}));
 const fixtures=names.map((title,index)=>({kind:'film',providerId:'tt'+(9900000+index),title,year:2026-index,rating:7.8,runtime:107,genres:['Drama','Adventure'],poster:'https://image.tmdb.org/t/p/w500/design786-'+index+'.png',cast:['Synthetic Actor','Another Actor'],synopsis:'A quiet journey brings a family together after years apart. Their unexpected meeting changes the way they understand the past and the place they call home.'}));
 ipcMain.removeHandler('media-discovery:request');ipcMain.handle('media-discovery:request',(_e,input)=>input.action==='detail'?{ok:true,item:fixtures.find(r=>r.providerId===input.id)}:{ok:true,rows:fixtures,nextSkip:null});
 for(const item of fixtures){
  const saved=await run(`return window.api.mediaCatalog({action:'save',item:${JSON.stringify({...item,favorite:true,watchStatus:'planned'})}})`);assert(saved.ok,saved.error);
  const original=dialog.showOpenDialog;dialog.showOpenDialog=async()=>({canceled:false,filePaths:[poster]});
  try{const result=await run(`return window.api.mediaCatalog({action:'poster-file',id:${JSON.stringify(saved.item.id)}})`);assert(result.ok,result.error);}finally{dialog.showOpenDialog=original;}
 }
 await run("document.dispatchEvent(new CustomEvent('media-library-changed'));return true");await wait(300);
}
app.whenReady().then(async()=>{
 await until(()=>{win=BrowserWindow.getAllWindows().find(w=>!w.isDestroyed()&&w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'window');win.showInactive();win.setMinimumSize(600,480);
 await run('await initialSettingsReady;return true');await until(()=>run("return document.body.classList.contains('media-home-active')&&!!document.querySelector('.mh-tools')"),'initial home');
 win.setContentSize(1440,1000);await capture('empty-home','#mediaHome');await seed();
 for(const [locale,theme,width,zoom] of [['tr','dark',1440,1],['en','light',800,1.25]]){
  win.setContentSize(width,1000);win.webContents.setZoomFactor(zoom);await run(`UiLocale.set('${locale}',false);applyUiTheme('${theme}');return true`);await wait(200);
  const suffix=locale+'-'+theme+'-'+width;
  for(const page of ['home','films','books','discover']){
   await close();await run(`await MediaHomeUI.navigate('${page}');return true`);await clickNav(page);if(page==='discover')await until(()=>run('return document.querySelectorAll(".md-card").length===6'),'discovery fixtures');await capture(page+'-'+suffix,'#mediaHome');
   if(page==='discover'){await run('document.querySelector(".md-card").click();return true');await until(()=>run('return !!document.querySelector(".md-detail-body")'),'details');await capture('discovery-detail-'+suffix,'.md-detail');await close();}
  }
  await run("document.querySelector('[data-home-page=films]').focus();return true");win.focus();win.webContents.focus();win.webContents.sendInputEvent({type:'keyDown',keyCode:'Tab'});win.webContents.sendInputEvent({type:'keyUp',keyCode:'Tab'});await wait(100);
  assert(await run("return document.getElementById('mediaHome').dataset.navigationInput==='keyboard'&&document.activeElement.matches('.mh-nav>button:focus-visible')&&getComputedStyle(document.activeElement).outlineStyle==='solid'"),'keyboard navigation restores a visible focus outline');
  await capture('keyboard-focus-'+suffix,'#mediaHome');
  await run("await AppSettingsUI.open('general');return true");await capture('settings-'+suffix,'#appSettingsDialog');await close();
  await run("MediaHomeUI.openStudio();return true");await until(()=>run("return !document.body.classList.contains('media-home-active')"),'studio');await capture('whisper-'+suffix,'.app');
  await run("await DubGeneratorUI.prepareCurrent();return true");await capture('dubbing-'+suffix,'#dubGeneratorDialog');await close();
  await run("await TextVoiceStudioUI.open();return true");await capture('textvoice-'+suffix,'#textVoiceStudio');await close();
 }
 fs.writeFileSync(path.join(out,'inventory.json'),JSON.stringify(rows,null,2));console.log(JSON.stringify({ok:true,out,screens:rows.length}));app.exit(0);
}).catch(e=>{console.error(e.stack);console.log(JSON.stringify({ok:false,out}));app.exit(1);});setTimeout(()=>app.exit(2),90000).unref();
