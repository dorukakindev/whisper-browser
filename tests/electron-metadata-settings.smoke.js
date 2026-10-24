'use strict';
const {app,BrowserWindow,nativeImage}=require('electron'),fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..'),out=path.join(root,'.uiprev','metadata-settings',Date.now()+'-'+process.pid);
fs.mkdirSync(out,{recursive:true});process.env.WHISPER_RESOURCE_SOAK_USER_DATA=path.join(out,'profile');app.setAppPath(root);app.commandLine.appendSwitch('disable-gpu');app.commandLine.appendSwitch('disable-backgrounding-occluded-windows');app.commandLine.appendSwitch('disable-renderer-backgrounding');
const originalFetch=global.fetch;let requests=[];
global.fetch=async(url,options)=>{const u=new URL(url);if(u.hostname==='api.themoviedb.org'){
 assert.equal(options.headers.Authorization,'Bearer fixture-tmdb-credential-not-a-real-key');assert.equal(u.searchParams.get('language'),'en-US');requests.push(u.pathname);
 if(u.pathname.includes('/search/'))return new Response(JSON.stringify({results:[{id:42,title:'Synthetic Artwork',release_date:'2024-01-01'}]}));
 return new Response(JSON.stringify({id:42,title:'Synthetic Artwork',overview:'Verified synthetic metadata.',release_date:'2024-01-01',poster_path:'/fixture.png',credits:{cast:[{name:'Synthetic Actor'}]},genres:[{name:'Drama'}],runtime:100}));
 }if(u.hostname==='image.tmdb.org'){requests.push(u.pathname);return new Response(nativeImage.createFromBitmap(Buffer.from([80,100,160,255]),{width:1,height:1}).toPNG());}return originalFetch(url,options);};
require('../src/main');const wait=ms=>new Promise(r=>setTimeout(r,ms));
async function until(fn,label){const end=Date.now()+15000;while(Date.now()<end){if(await fn())return;await wait(75);}throw Error('Timed out: '+label);}
app.whenReady().then(async()=>{
 let win;await until(()=>{win=BrowserWindow.getAllWindows().find(w=>w.webContents.getURL().includes('index.html')&&!w.webContents.isLoading());return win;},'parent');
 const run=code=>win.webContents.executeJavaScript('(async()=>{'+code+'})()',true);win.setContentSize(1920,1080);win.showInactive();
 await until(()=>run("return !!window.AppSettingsUI"),'settings');
 await run("await initialSettingsReady;window.UiLocale.set('tr',false);applyUiTheme('dark');window.fixtureItem=(await window.api.mediaCatalog({action:'save',item:{kind:'film',title:'Synthetic Missing Poster',favorite:true,ratings:{personal:'8'}}})).item;document.dispatchEvent(new Event('media-library-changed'));return true");
 assert(await run("return !document.getElementById('mhLocale') && !!document.querySelector('#mhSettings svg') && !document.getElementById('mhSettings').textContent.trim()"),'Home has one settings icon; locale belongs inside settings');
 const header=await run("const n=document.querySelector('.mh-nav'),s=document.getElementById('mhSettings').getBoundingClientRect();return {scroll:n.scrollWidth,width:n.clientWidth,gear:s.right,w:innerWidth};");assert(header.scroll<=header.width+1,'Navigation cannot scroll horizontally');assert(header.gear<=header.w);
 await run("await window.AppSettingsUI.open('metadata');document.getElementById('tmdbApiKey').value='fixture-tmdb-credential-not-a-real-key';document.getElementById('tmdbApiKey').dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('tmdbLanguage').value='en-US';document.getElementById('tmdbLanguage').dispatchEvent(new Event('change',{bubbles:true}));document.getElementById('appSettingsSave').click();return true");
 await until(()=>run("return document.getElementById('appSettingsStatus').textContent==='Ayarlar kaydedildi.'"),'TMDB secret saved');
 assert(!fs.readFileSync(path.join(out,'profile','settings.json'),'utf8').includes('fixture-tmdb-credential'),'TMDB key cannot be plain in settings.json');
 await until(()=>run("return !!document.querySelector('.aps-metadata-row button')"),'missing artwork list');
 await run('await document.fonts.ready;return true');fs.writeFileSync(path.join(out,'tmdb-settings-dark.png'),(await win.webContents.capturePage()).toPNG());
 await run("document.querySelector('.aps-metadata-row button').click();return true");
 await until(()=>run("return document.getElementById('mediaCatalogDialog').open && document.getElementById('mediaCatalogRoot').textContent.includes('TMDB')"),'metadata match workflow');
 const result=await run("const search=await window.api.mediaCatalog({action:'metadata-search',id:fixtureItem.id,query:'Synthetic'});if(!search.ok)throw Error(search.error);const preview=await window.api.mediaCatalog({action:'metadata-preview',id:fixtureItem.id,providerId:search.results[0].id});if(!preview.ok)throw Error(preview.error);const saved=await window.api.mediaCatalog({action:'metadata-apply',token:preview.token,fields:['synopsis','poster']});if(!saved.ok)throw Error(saved.error);window.MediaCatalogUI.close();document.dispatchEvent(new Event('media-library-changed'));return saved.item;");
 assert(result.hasPoster);assert.equal(result.favorite,true);assert.equal(result.ratings.personal,'8');assert.equal(result.synopsis,'Verified synthetic metadata.');
 try{await until(()=>run("return !!document.querySelector('.mh-art img')"),'downloaded poster appears on home');}catch(error){console.log(await run("return {home:document.getElementById('mediaHome').className,inert:document.getElementById('mediaHome').inert,cards:document.querySelectorAll('.mh-art').length,dialog:document.getElementById('mediaCatalogDialog').open,posters:[...document.querySelectorAll('.mh-art')].map(n=>({id:n.dataset.homePoster,rect:n.getBoundingClientRect().toJSON(),html:n.innerHTML.slice(0,120)})),scroll:document.getElementById('mediaHome').scrollTop}"));throw error;}
 await run("window.identifiedItem=(await window.api.mediaCatalog({action:'save',item:{kind:'film',title:'Identified Missing Artwork',tmdbId:'movie:43',favorite:true,ratings:{personal:'9'}}})).item;await window.AppSettingsUI.open('metadata');return true");
 await until(()=>run("return [...document.querySelectorAll('#appSettingsDialog button')].some(b=>b.textContent.includes('Kimliği olanların'))"),'identified-title completion');
 await run("[...document.querySelectorAll('#appSettingsDialog button')].find(b=>b.textContent.includes('Kimliği olanların')).click();return true");
 await until(()=>run("return document.getElementById('appSettingsDialog').textContent.includes('1 tamamlandı')"),'missing-only completion');
 const preserved=await run("return (await window.api.mediaCatalog({action:'list'})).items.find(row=>row.id===identifiedItem.id)");assert(preserved.hasPoster);assert.equal(preserved.title,'Identified Missing Artwork');assert.equal(preserved.ratings.personal,'9');assert(preserved.favorite);
 await run("window.AppSettingsUI.close();document.dispatchEvent(new Event('media-library-changed'));return true");
 await wait(150);fs.writeFileSync(path.join(out,'home-header-artwork-dark.png'),(await win.webContents.capturePage()).toPNG());
 win.setMinimumSize(0,0);win.setContentSize(940,760);await run("window.UiLocale.set('en',false);applyUiTheme('light');return true");await wait(180);
 const compact=await run("const n=document.querySelector('.mh-nav');return {scroll:n.scrollWidth,width:n.clientWidth,page:document.documentElement.scrollWidth,w:innerWidth};");assert(compact.scroll<=compact.width+1);assert(compact.page<=compact.w+1);fs.writeFileSync(path.join(out,'home-header-compact-light.png'),(await win.webContents.capturePage()).toPNG());
 assert.equal(requests.length,5);console.log(JSON.stringify({ok:true,out,tmdbFixtureRequests:requests.length,realTmdbRequests:0}));app.exit(0);
}).catch(error=>{console.error(error);app.exit(1);});
