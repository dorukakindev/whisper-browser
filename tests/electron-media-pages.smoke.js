'use strict';
// Visible, isolated Electron renderer acceptance. Public artwork and all data are fixtures;
// this does not claim live metadata, playback, model, or production IPC acceptance.
const { app, BrowserWindow, screen, session } = require('electron');
const fs = require('node:fs');
const path = require('node:path');
const assert = require('node:assert/strict');
const { pathToFileURL } = require('node:url');
const root = path.resolve(__dirname, '..');
const out = path.join(root, '.uiprev', 'media-pages-20261113');
fs.mkdirSync(out, { recursive: true });
app.setPath('userData', path.join(out, `profile-${process.pid}`));
app.commandLine.appendSwitch('disable-gpu');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const log = (...values) => fs.appendFileSync(path.join(out, 'result.log'), values.map(v=>typeof v==='string'?v:JSON.stringify(v)).join(' ')+'\n');
const watchdog = setTimeout(() => { console.error('Media pages smoke timed out'); app.exit(1); }, 90000);
let staged;
app.whenReady().then(async () => {
  const { stageRenderer, artworkSvg } = await import(pathToFileURL(path.join(__dirname, 'support/chromium-fixture.mjs')));
  staged = stageRenderer(['discover-fixture-stub.js', 'dub-panel-fixture-stub.js'].map(f => path.join(__dirname, 'support', f)));
  await session.defaultSession.protocol.handle('https', request => new Response(artworkSvg(request.url), { headers: { 'Content-Type': 'image/svg+xml' } }));
  const display = screen.getAllDisplays().find(d => /asus/i.test(d.label)) || screen.getPrimaryDisplay();
  const win = new BrowserWindow({ ...display.bounds, show: false, frame: false, webPreferences: { sandbox: true, contextIsolation: true, nodeIntegration: false } });
  win.setFullScreen(true);
  await win.loadURL(staged.url);
  win.show();
  await wait(1600);
  const run = code => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
  const shot = async name => { await wait(200); fs.writeFileSync(path.join(out, name + '.png'), (await win.webContents.capturePage()).toPNG()); };
  await run(`__fx.setLocale('tr');applyUiTheme('dark');return true`);
  const viewport = await run('return {width:innerWidth,height:innerHeight}');
  log('Visible Electron fullscreen', { display: display.label, bounds: display.bounds, scale: display.scaleFactor, viewport, fullscreen: win.isFullScreen() });
  await run(`
    window.fixtureRows=[{id:'mal:anime:5114',providerId:'5114',domain:'anime',kind:'anime',title:'Fullmetal Alchemist: Brotherhood',status:'watching',rating:9,progress:12,total:64,metadata:{aliases:['鋼の錬金術師'],year:2009,format:'TV',status:'FINISHED',genres:['Action','Drama'],description:'Two brothers search for a way to restore their bodies. A journey about sacrifice, responsibility and family.',studios:['bones'],averageScore:90,total:64,themes:[{name:'Alchemy'}],cover:'https://s4.anilist.co/cover/anime.jpg',banner:'https://s4.anilist.co/background/anime.jpg',providerId:5114}},
      {id:'mal:manga:121496',providerId:'121496',domain:'manga',kind:'manhwa',title:'Solo Leveling',status:'watching',rating:null,progress:80,total:200,metadata:{year:2018,format:'MANGA',country:'KR',genres:['Action','Fantasy'],description:'A hunter discovers a path to grow stronger. His decisions reshape the world around him.',averageScore:84,total:200,cover:'https://s4.anilist.co/cover/manga.jpg',banner:'https://s4.anilist.co/background/manga.jpg',providerId:105398}}];
    const base=window.api;window.api=new Proxy({}, {get(_,key){if(key==='then')return undefined;if(key==='mediaShelf')return async input=>input.action==='collection-list'?{ok:true,rows:fixtureRows,catalog:[]}:input.action==='collection-detail'?{ok:true,id:input.id,metadata:fixtureRows.find(r=>r.id===input.id).metadata,canRefresh:true}:input.action==='collection-cover-get'?{ok:true,image:''}:base.mediaShelf(input);return base[key];}});
    document.querySelector('#mediaHome').classList.remove('hidden');document.body.classList.add('media-home-active');
    document.querySelector('#mhContent')?.remove();window.testHost=document.createElement('main');testHost.className='mh-content';testHost.style.cssText='position:relative;min-height:80vh';document.querySelector('#mediaHome').append(testHost);
    window.libraryView=PersonalLibraryUI.mount(testHost,{page:'anime'});return true;
  `);
  await wait(250);
  const library = await run(`return {cards:document.querySelectorAll('.plog-card').length,hero:document.querySelector('.plog-hero').getBoundingClientRect().height,scrollX:document.documentElement.scrollWidth>innerWidth}`);
  assert(!library.scrollX && library.hero < 240, JSON.stringify(library));
  await shot('anime-library');
  for (const [i, name] of [[0, 'anime-detail'], [1, 'manhwa-detail']]) {
    await run(`window.detail=CollectionTitleUI.open(fixtureRows[${i}],{onEdit:()=>{}});return true`);
    await wait(250);
    const detail = await run(`return {title:detail.querySelector('h1')?.textContent,kind:detail.dataset.pageKind,personal:detail.textContent.includes('Senin kaydın'),scrollX:detail.scrollWidth>detail.clientWidth+1}`);
    assert(detail.kind === 'collection' && detail.personal && !detail.scrollX, JSON.stringify(detail));
    await shot(name);
    await run('detail.close();return true');
  }
  await run(`libraryView.dispose();testHost.replaceChildren();window.disposePodcast=PodcastLibraryUI.mount(testHost,{podcasts:[{id:'spotify:fixture',sourceKind:'spotify',title:'ULUS BAKER | Sanat ve Arzu Seminerleri | Ders 1 — Uzun bir kaynak başlığı',url:'https://open.spotify.com/show/fixture',episodes:[]}]},{openSpotify:()=>{},queue:()=>({rows:[],index:0})});return true`);
  const podcast=await run(`const card=testHost.querySelector('.pl-spotify'),title=card.querySelector('h3');return {height:card.getBoundingClientRect().height,font:parseFloat(getComputedStyle(title).fontSize),overflow:card.scrollWidth>card.clientWidth+1}`);
  assert(podcast.height<420 && podcast.font<=28 && !podcast.overflow,JSON.stringify(podcast));
  await shot('podcast-library');
  await run(`disposePodcast();testHost.replaceChildren();window.networkView=RecallNetworkUI.render({host:testHost,locale:'tr',api:async()=>({ok:true,nodes:Array.from({length:60},(_,i)=>({id:'node:'+i,title:'Bir anime veya manganın uzun başlığı '+i,domain:i%2?'anime':'manga',ref:{kind:'collection',id:String(i)}})),edges:[],views:[],counts:{visibleNodes:60,totalNodes:60,visibleEdges:0}})});return true`);
  await wait(250); await shot('content-network');
  await run(`networkView.dispose();testHost.remove();document.querySelector('#mediaHome').classList.add('hidden');document.body.classList.remove('media-home-active');await __dub.sahne('cinema','single');const stage=CinemaSahne.current,info=stage.a.info;stage.a.info=()=>({...info(),audio:true});stage.tick();return true`);
  const deadline=Date.now()+8000;
  while(await run('return !!CinemaSahne.current?.q(".sh-bars")')){if(Date.now()>deadline)throw Error('Sahne intro did not finish');await wait(100);}
  const controls = await run(`const stage=CinemaSahne.current,box=e=>{const r=e.getBoundingClientRect();return {x:r.x,y:r.y,right:r.right,bottom:r.bottom,width:r.width,height:r.height}};const groups=['.sh-cinema-transport','.sh-cinema-sentences','.sh-local-extra','.sh-dock-tools'].map(s=>box(stage.q(s)));return {groups,overlaps:groups.flatMap((a,i)=>groups.slice(i+1).filter(b=>Math.min(a.right,b.right)>Math.max(a.x,b.x)+1&&Math.min(a.bottom,b.bottom)>Math.max(a.y,b.y)+1)).length}`);
  assert.equal(controls.overlaps, 0, JSON.stringify(controls));
  await shot('audio-cinema');
  log('Library, anime/manhwa details, network and narrow audio controls passed', { library, controls });
  log('Audio ancestors',await run(`const list=[];for(let e=CinemaSahne.current.root;e;e=e.parentElement){const s=getComputedStyle(e),r=e.getBoundingClientRect();list.push({tag:e.tagName,cls:e.className,display:s.display,visibility:s.visibility,opacity:s.opacity,h:r.height,overflow:s.overflow});}return list`));
  win.destroy(); staged.cleanup(); clearTimeout(watchdog); app.exit(0);
}).catch(error => { log(error.stack); clearTimeout(watchdog); app.exit(1); });
