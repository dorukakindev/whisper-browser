'use strict';
// Real Windows UI/IPC; metadata, thumbnail and translation boundaries controlled.
const {app,BrowserWindow,session,nativeImage,dialog}=require('electron');
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','home-entry-actions-'+Date.now());
fs.mkdirSync(out,{recursive:true});process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile');app.setAppPath(root);app.commandLine.appendSwitch('disable-gpu');
const image=nativeImage.createFromBitmap(Buffer.from([120,80,40,255,90,60,30,255,90,60,30,255,120,80,40,255]),{width:2,height:2}).resize({width:640,height:360}).toPNG();
const meta={id:'tt1234567',name:'Witness',description:'A witness does not claim certainty.',poster:'https://images.metahub.space/poster/fixture',genres:['Drama'],cast:['Actor'],releaseInfo:'2026'};
const originalFetch=global.fetch;
global.fetch=async(url,options)=>String(url).includes('cinemeta')?new Response(JSON.stringify(String(url).includes('/meta/')?{meta}:{metas:[meta]})):String(url).startsWith('https://images.metahub.space/')?new Response(image):originalFetch(url,options);
const discovery=require('../src/media-discovery-service'),register=discovery.registerMediaDiscovery;
discovery.registerMediaDiscovery=options=>register({...options,translateSynopsis:async()=> 'Bir tanık kesinlik iddia etmiyor.'});
const pdf=path.join(out,'book.pdf');fs.writeFileSync(pdf,require('./helpers/pdf-fixture')());dialog.showOpenDialog=async()=>({canceled:false,filePaths:[pdf]});
require('../src/main');
const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){for(let i=0;i<250;i++){if(await fn())return;await wait(80);}throw Error('Timeout: '+label);}
app.whenReady().then(async()=>{
  session.defaultSession.protocol.handle('https',()=>new Response(image,{headers:{'content-type':'image/png'}}));
  let win;await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'main');
  win.setContentSize(1440,1000);win.show();const run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);
  async function shot(name){await wait(250);for(let i=0;i<3;i++)try{fs.writeFileSync(path.join(out,name+'.png'),(await win.webContents.capturePage()).toPNG());return;}catch(e){if(i===2)throw e;await wait(300);}}
  await run('await initialSettingsReady;UiLocale.set("tr",false);applyUiTheme("dark");return true');
  const saved=await run('return window.api.updateWatchItem({key:"youtube:abcdefghijk",type:"youtube",sourceRef:"https://www.youtube.com/watch?v=abcdefghijk",title:"Devam edilen video",position:60,duration:600,lastWatched:Date.now()})');assert(saved.ok,saved.error);
  await run('document.dispatchEvent(new Event("media-library-changed"));return true');
  await until(()=>run('return [...document.querySelectorAll(".mh-hero-art img,.mh-wide img")].filter(n=>n.naturalWidth>0).length>=2'),'YouTube hero and rail thumbnails');await shot('home-thumbnails-tr');
  await run('document.querySelector("[data-home-page=discover]").click();return true');
  await until(()=>run('return !!document.querySelector(".md-card")'),'discovery');
  await run('document.querySelector(".md-card").click();return true');
  await until(()=>run('return !!document.querySelector("[data-discovery-action=translate]")'),'translation control');
  await run('document.querySelector("[data-discovery-action=translate]").click();return true');
  await until(()=>run('return document.querySelector(".md-synopsis").textContent==="Bir tanık kesinlik iddia etmiyor."'),'real service translation fixture');
  assert.equal(await run('return (await window.api.mediaCatalog({action:"list"})).items.length'),0,'translation does not add to library');await shot('discover-story-tr');
  await run('document.querySelector("[data-discovery-action=translate]").click();return true');
  assert.equal(await run('return document.querySelector(".md-synopsis").textContent'),meta.description);
  await run('document.querySelector("[data-discovery-action=reviews]").click();return true');
  await until(()=>run('return !!document.querySelector("input[name=letterboxd-reviews-url]")'),'Letterboxd review tools');
  assert(await run('return [...document.querySelectorAll("#mediaToolsDialog button")].some(n=>n.textContent.includes("Açık sayfayı getir"))'));await shot('letterboxd-tools-tr');
  await run('document.getElementById("mediaToolsDialog").close();document.querySelector(".md-detail").close();await openPlayer();await openPdfReader();return true');
  await until(()=>run('return player.pdfReader?.pages.get(1)?.article?.dataset.state==="ready"'),'PDF');
  await run('document.getElementById("pdfVoiceOpen").click();return true');
  assert(await run('const n=document.getElementById("pdfVoicePanel"),b=document.getElementById("pdfVoiceOpen");return !n.classList.contains("hidden")&&b.getBoundingClientRect().width>0'));
  await shot('pdf-narration-entry-tr');console.log(JSON.stringify({ok:true,out,controlledProvider:true}));app.exit(0);
}).catch(e=>{console.error(e);app.exit(1);});
