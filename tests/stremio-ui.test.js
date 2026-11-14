'use strict';
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { JSDOM } = require('jsdom');
const { createStremioService } = require('../src/stremio-service');
const { decodeDownloadedSubtitle } = require('../src/browser-subtitle-search');

const json = (data) => new Response(JSON.stringify(data), { status: 200 });
const MANIFESTS = {
  'https://cinemeta.example/manifest.json': { id: 'c', name: 'Cinemeta', version: '1', types: ['movie', 'series'], resources: ['catalog', 'meta'], idPrefixes: ['tt'], catalogs: [{ type: 'series', id: 'top', name: 'Popüler', extra: [{ name: 'search' }, { name: 'genre', options: ['Drama'] }] }] },
  'https://torr.example/manifest.json': { behaviorHints:{configurable:true}, id: 't', name: 'Torrentio', version: '1', types: ['series'], resources: ['stream'], catalogs: [] },
  'https://subs.example/manifest.json': { id: 's', name: 'Altyazı', version: '1', types: ['series'], resources: ['subtitles'], catalogs: [] },
};
let configureMode='success';let configurationOpened=0;
let metadataExtras=[];const resourceRequests=[];
const fetch = async (url) => {
  resourceRequests.push(url);
  if(url==='https://torr.example/debrid-fixture/manifest.json')return json(MANIFESTS['https://torr.example/manifest.json']);
  if (MANIFESTS[url]) return json(MANIFESTS[url]);
  if (url.startsWith('https://cinemeta.example/catalog/series/top')) return json({ metas: [{ id: 'tt1', type: 'series', name: 'Test Dizisi', releaseInfo: '2020', poster: 'https://img.example/p.jpg', background: 'https://img.example/b.jpg', logo: 'https://img.example/black-transparent-logo.png', description: 'Bir açıklama', imdbRating: '8.1', genres: ['Drama'] }] });
  if (url === 'https://cinemeta.example/meta/series/tt1.json') return json({ meta: { id: 'tt1', type: 'series', name: 'Test Dizisi', releaseInfo: '2020', description: 'Açıklama', videos: [
    ...metadataExtras, { id: 'tt1:1:1', season: 1, episode: 1, title: 'Pilot' }, { id: 'tt1:1:2', season: 1, episode: 2, title: 'İkinci' }, { id: 'tt1:2:1', season: 2, episode: 1, title: 'Yeni sezon' }] } });
  if (url==='https://torr.example/stream/series/tt1:0:0.json')return json({streams:[{name:'Special source',url:'https://cdn.example/special.mp4'}]});
  if (url.startsWith('https://torr.example/stream/series/tt1:1:')) return json({ streams: [{ name: 'T\n1080p', title: 'Dizi.1080p\n👤 50', url: 'https://cdn.example/a.mp4' }, { name: 'T\n720p', title: 'Dizi.720p\n👤 5', url: 'https://cdn.example/b.mp4' }] });
  if (url.startsWith('https://subs.example/subtitles/series/tt1:1:1')) return json({ subtitles: [{ url: 'https://subs.example/tr.srt', lang: 'tur' }] });
  if (url === 'https://subs.example/tr.srt') return new Response('1\n00:00:01,000 --> 00:00:02,000\nMerhaba\n\n');
  return new Response('x', { status: 404 });
};
const tick = (ms = 20) => new Promise((r) => setTimeout(r, ms));
const until = async (fn, label) => { for (let i = 0; i < 80; i++) { if (fn()) return; await tick(10); } assert.fail('zaman aşımı: ' + label); };

(async () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'stremio-ui-'));
  const granted = [];
  const service = createStremioService({ root: () => root, fetch, configureAddon:async()=>{configurationOpened++;return configureMode==='cancel'?{cancelled:true}:{manifestUrl:'stremio://torr.example/debrid-fixture/manifest.json'};}, assertUrl: async () => {}, decodeSubtitle: (b) => decodeDownloadedSubtitle(b, 'tr'), grantSubtitle: (f) => granted.push(f), searchSubtitles: async () => ({ results: [] }) });
  const dom = new JSDOM('<!doctype html><body><main id="mediaHome"></main><div id="playerLayer"><video id="playerVideo"></video><div id="playerControls"><details id="playerMore"></details></div></div><button id="makeSubsBtn"></button><button id="makeTransBtn"></button></body>', { url: 'https://fixture.invalid', runScripts: 'outside-only', pretendToBeVisual: true });
  const { window } = dom, { document } = window;
  window.HTMLDialogElement.prototype.showModal = function showModal() { this.setAttribute('open', ''); };
  window.HTMLDialogElement.prototype.close = function close() { if (!this.hasAttribute('open')) return; this.removeAttribute('open'); this.dispatchEvent(new window.Event('close')); };
  window.UiLocale = { get: () => 'tr' };
  window.eval(fs.readFileSync(path.join(__dirname, '../src/renderer/media-visual.js'), 'utf8'));
  window.api = { stremio: (request) => service.handle({}, request).then((r) => ({ ok: true, ...r }), (e) => ({ ok: false, error: e.message, code: e.code })) };
  const opened = [];
  window.MediaHubUI = { playStream: async (result, seconds) => { opened.push({ result, seconds }); Object.assign(window.player,{mediaKey:result.key,workKey:result.workKey||'',subPath:'',sub2Path:'',cues:[],cues2:[],offset:0,offset2:0}); }, open: () => {} };
  window.player = { mediaKey: '' };
  window.eval('var player = window.player; var addSubtitleOption = (...a) => { window.__subs = (window.__subs||[]).concat([a]); }; var loadSubtitle = async (p) => { window.__loaded = p; };');
  window.MediaTitleUI = { createPage(cls) { const page = document.createElement('section'); page.className = cls + ' media-title-page'; page.open = true; page.close = () => { if (!page.open) return; page.open = false; page.dispatchEvent(new window.Event('close')); page.remove(); }; document.getElementById('mediaHome').append(page); return page; }, close() {} };
  const sharedDetailCalls=[];
  window.MediaDiscoveryUI={openDetail:async(row,options)=>{
    sharedDetailCalls.push({row,options});const page=window.MediaTitleUI.createPage('md-detail');
    const actions=document.createElement('div');actions.className='cn-hero-actions';const sourceHost=document.createElement('section');sourceHost.className='cn-film-sources';const status=document.createElement('p');page.append(actions,sourceHost,status);
    const dispose=options.onReady({page,item:options.fallbackDetail.item,actions,sourceHost,status,close:()=>page.close()});page.addEventListener('close',()=>dispose?.(),{once:true});
    return {ok:true};
  }};
  const video = document.getElementById('playerVideo');
  let sharedSleep={at:0,mode:''};window.PlayerPlaybackControls={setRate:async rate=>{video.playbackRate=rate;return true;},getRate:()=>video.playbackRate||1,setSleep:minutes=>{sharedSleep={at:minutes?Date.now()+minutes*60000:0,mode:''};return true;},getSleep:()=>sharedSleep};
  Object.defineProperty(video, 'duration', { configurable: true, get: () => 3000 });
  Object.defineProperty(video, 'currentTime', { configurable: true, writable: true, value: 0 });
  window.eval(fs.readFileSync(path.join(__dirname, '../src/renderer/stremio-ui.js'), 'utf8'));
  const UI = window.StremioUI;
  const click = (node) => node.dispatchEvent(new window.MouseEvent('click', { bubbles: true }));

  // Eklenti yokken yönlendirme
  const host = document.getElementById('mediaHome');
  let page = UI.mount(host);
  await until(() => host.querySelector('.sx-onboard'), 'ilk açılış yönlendirmesi');
  assert.match(host.textContent, /İlk eklentilerini ekle/);
  page.dispose();

  // Eklenti ekleme akışı (arayüz üzerinden)
  UI.openAddons();
  const dialog = document.querySelector('.sx-addons');
  for (const url of Object.keys(MANIFESTS)) {
    dialog.querySelector('.sx-add-form input').value = url;
    dialog.querySelector('.sx-add-form').dispatchEvent(new window.Event('submit', { cancelable: true }));
    await until(() => !dialog.querySelector('.sx-preview').hidden && dialog.querySelector('.sx-preview .mh-primary'), 'önizleme ' + url);
    click([...dialog.querySelectorAll('.sx-preview button')].pop());
    await until(() => dialog.querySelectorAll('.sx-addon').length === Object.keys(MANIFESTS).indexOf(url) + 1, 'eklendi ' + url);
  }
  assert.equal(dialog.querySelectorAll('.sx-addon').length, 3);
  assert.ok(!dialog.textContent.includes('cdn.example'));
  dialog.close();

  // Sayfa: katalog rafı + arama
  page = UI.mount(host);
  await until(() => host.querySelector('.sx-shelf .sx-card'), 'katalog rafı');
  assert.equal(host.querySelector('.sx-shelf .sx-card strong').textContent, 'Test Dizisi');
  host.querySelector('.sx-search input').value = 'test';
  host.querySelector('.sx-search').dispatchEvent(new window.Event('submit', { cancelable: true }));
  await until(() => host.querySelector('.sx-results .sx-card'), 'arama sonucu');

  // Başlık sayfası: sezon ve bölümler
  click(host.querySelector('.sx-shelf .sx-card'));
  await until(() => document.querySelector('.md-detail .sx-episode'), 'ortak yapım sayfasındaki bölüm listesi');
  assert.equal(sharedDetailCalls.length,1,'Stremio uses the existing Discovery detail owner');assert.equal(sharedDetailCalls[0].row.providerId,'tt1');
  assert.equal(document.querySelectorAll('.md-detail .sx-episode').length, 2, 'ilk sezonun iki bölümü');
  assert.equal(document.querySelector('.sx-season').options.length, 2);
  const episodeSearch=document.querySelector('.sx-episode-search');episodeSearch.value='Pilot';episodeSearch.dispatchEvent(new window.Event('input'));assert.equal(document.querySelectorAll('.sx-episode').length,1);assert.match(document.querySelector('.sx-episode').textContent,/Pilot/);
  episodeSearch.value='ikinci';episodeSearch.dispatchEvent(new window.Event('input'));assert.equal(document.querySelectorAll('.sx-episode').length,1);assert.match(document.querySelector('.sx-episode').textContent,/İkinci/);
  episodeSearch.value='not-a-real-episode';episodeSearch.dispatchEvent(new window.Event('input'));assert(document.querySelector('.sx-episodes-empty'));document.querySelector('.sx-episodes-empty button').click();await tick();assert.equal(document.querySelectorAll('.sx-episode').length,2);assert.equal(episodeSearch.value,'');
  assert.match(document.querySelector('.md-detail .sx-actions button').textContent, /Oynat/);

  // Bölüm 1 → kaynak seçici → en iyi kaynak
  click(document.querySelector('.sx-episode button'));
  await until(() => document.querySelector('.sx-streams .sx-best button'), 'kaynak seçici');
  assert.equal(document.querySelectorAll('.sx-streams .sx-stream').length, 2);
  click(document.querySelector('.sx-streams .sx-best button'));
  await until(() => opened.length === 1, 'oynatma başladı');
  assert.equal(opened[0].result.url, 'https://cdn.example/a.mp4');
  assert.equal(opened[0].seconds, 0);
  assert.equal(UI.whisperSource().key,window.player.mediaKey);
  assert.equal(UI.whisperSource().streamId,UI._test.session().streamId);
  assert(!JSON.stringify(UI.whisperSource()).includes('https:'),'audio preparation sends only main-issued source identifiers');
  assert.ok(document.getElementById('playerStremioBtn') && !document.getElementById('playerStremioBtn').hidden, 'oynatıcı menü düğmesi görünür');
  assert.ok(!document.querySelector('.md-detail'), 'ortak başlık sayfası oynatma açılınca kapanır');

  // Devam kaydı: zaman ilerler → kaydedilir; sıradaki bölüm bilgisi taşınır
  video.currentTime = 900; video.dispatchEvent(new window.Event('pause'));
  await until(async () => true, 'bekle'); await tick(60);
  let saved = (await service.handle({}, { action: 'continue-list' })).items;
  assert.equal(saved.length, 1);
  assert.equal(saved[0].position, 900); assert.equal(saved[0].episode, 1);
  assert.deepEqual(saved[0].next, { season: 1, episode: 2, title: 'İkinci' });
  // OYN-13: a failed write keeps the saved row and offers an owner-bound retry.
  const originalApi=window.api.stremio;
  window.api.stremio=q=>q.action==='progress-save'?Promise.resolve({ok:false,code:'CAPACITY'}):originalApi(q);
  video.currentTime=905;video.dispatchEvent(new window.Event('pause'));
  await until(()=>document.querySelector('.sx-progress-warning'),'progress failure notice');
  assert.match(document.querySelector('.sx-progress-warning').textContent,/kapasite/);
  window.UiLocale.get=()=> 'en';document.dispatchEvent(new window.Event('ui-locale-change'));assert.match(document.querySelector('.sx-progress-warning').textContent,/capacity/);window.UiLocale.get=()=> 'tr';document.dispatchEvent(new window.Event('ui-locale-change'));
  assert.equal((await service.handle({}, {action:'continue-list'})).items[0].position,900,'capacity failure cannot overwrite history');
  window.api.stremio=originalApi;document.querySelector('.sx-progress-warning button').click();
  await until(()=>!document.querySelector('.sx-progress-warning'),'progress retry clears warning');
  assert.equal((await service.handle({}, {action:'continue-list'})).items[0].position,905);video.currentTime=900;


  // Oynatıcı paneli: kaynak değiştirme konumu korur, altyazı, yapay zekâ kısayolları
  click(document.getElementById('playerStremioBtn'));
  await until(() => document.querySelector('.sx-player-panel .sx-stream'), 'panel kaynakları');
  const rows = [...document.querySelectorAll('.sx-player-panel .sx-stream')];
  assert.ok(rows.some((r) => r.classList.contains('is-current')), 'mevcut kaynak işaretli');
  const firstWork=window.player.workKey;assert.match(firstWork,/^work:stremio:/);Object.assign(window.player,{subPath:'old-source.srt',sub2Path:'old-translation.srt',subRole:'source',sub2Role:'translation',cues:[{text:'Earlier source sample'}],cues2:[{text:'Earlier translated sample'}],offset:3,offset2:-2});
  click(rows.find((r) => !r.classList.contains('is-current')).querySelector('button'));
  await until(() => opened.length === 2, 'kaynak değişti');
  assert.equal(opened[1].seconds, 900, 'kaynak değişince konum korunur');
  assert.equal(opened[1].result.url, 'https://cdn.example/b.mp4');
  assert.equal(window.player.workKey,firstWork);assert.equal(window.player.subPath,'');assert.equal(window.player.sub2Path,'');assert.equal(window.player.offset,0);const workRefs=JSON.parse(window.localStorage.getItem('stremio.workTracks.'+firstWork));assert.equal(workRefs.rows[0].tracks.length,2);assert.equal(workRefs.rows[0].tracks[0].offset,3);assert(!JSON.stringify(workRefs).includes('Earlier source sample'),'only references, not transcript text, persist');

  click(document.getElementById('playerStremioBtn'));
  [...document.querySelectorAll('.sx-tab')].find((b) => /Altyazı/.test(b.textContent)).click();
  await until(() => document.querySelector('.sx-player-panel .sx-sub'), 'altyazı listesi');
  assert.match(document.querySelector('.sx-work-tracks').textContent,/zaman ve ses eşleşmesi doğrulanmadı/);assert.match(document.querySelector('.sx-work-tracks').textContent,/Earlier translated sample/);assert(!document.querySelector('.sx-work-tracks button'),'unverified previous track has no apply/seek action');
  click(document.querySelector('.sx-player-panel .sx-sub button'));
  await until(() => window.__loaded, 'altyazı yüklendi');
  assert.ok(window.__loaded.startsWith(root) && granted.includes(window.__loaded));
  assert.equal(window.__subs[0][2].language, 'tr');

  [...document.querySelectorAll('.sx-tab')].find((b) => /Yapay/.test(b.textContent)).click();
  let clicked = 0; document.getElementById('makeTransBtn').addEventListener('click', () => clicked++);
  click([...document.querySelectorAll('.sx-ai')].find((b) => /çevir/.test(b.textContent)));
  assert.equal(clicked, 1, 'çeviri kısayolu mevcut düğmeyi tetikler');
  assert.ok(!document.querySelector('.sx-player-panel'), 'eylemden sonra panel kapanır');

  // ALT-04: target language seeds search; explicit Any and uncommon languages survive locale changes.
  const target=document.createElement('select');target.id='translateTo';target.append(new window.Option('Dutch','nl'));document.body.append(target);
  const languages=[];window.api.stremio=q=>{if(q.action==='subtitles')languages.push(q.language);return originalApi(q);};
  UI.togglePanel('subs');await until(()=>languages.length,'target subtitle language');assert.equal(languages.at(-1),'nl');let language=document.querySelector('.sx-player-panel select');assert.equal(language.value,'nl');
  language.value='';language.dispatchEvent(new window.Event('change'));await tick();assert.equal(languages.at(-1),'');assert.equal(window.localStorage.getItem('stremio.subtitleLanguage'),'');UI.togglePanel();window.UiLocale.get=()=> 'en';UI.togglePanel('subs');await tick();assert.equal(document.querySelector('.sx-player-panel select').value,'');assert.equal(languages.at(-1),'');UI.togglePanel();
  window.localStorage.setItem('stremio.subtitleLanguage','tr');window.UiLocale.get=()=> 'tr';window.api.stremio=originalApi;
  // Old searches and downloads cannot attach subtitles after selection/source changes.
  const pendingSearch=[];let finishDownload;window.api.stremio=q=>q.action==='subtitles'?new Promise(resolve=>pendingSearch.push({q,resolve})):q.action==='subtitle-save'?new Promise(resolve=>{finishDownload=resolve;}):originalApi(q);
  UI.togglePanel('subs');await until(()=>pendingSearch.length===1,'first subtitle request');language=document.querySelector('.sx-player-panel select');language.value='de';language.dispatchEvent(new window.Event('change'));await until(()=>pendingSearch.length===2,'second subtitle request');
  const result=(id,label)=>({ok:true,token:'fixture',subtitles:[{id,label,addonName:'Fixture',language:'de'}]});pendingSearch[1].resolve(result('new','Current search'));await tick();pendingSearch[0].resolve(result('old','Stale search'));await tick();assert.match(document.querySelector('.sx-sub-list').textContent,/Current search/);assert(!document.querySelector('.sx-sub-list').textContent.includes('Stale search'));
  const subCount=window.__subs.length,previousGeneration=window.player.generation;document.querySelector('.sx-sub button').click();await until(()=>finishDownload,'pending subtitle download');window.player.generation=1;finishDownload({ok:true,filePath:'stale.srt',label:'Stale',language:'de'});await tick();assert.equal(window.__subs.length,subCount,'old download cannot bind another generation');window.player.generation=previousGeneration;UI.togglePanel();window.api.stremio=originalApi;window.localStorage.setItem('stremio.subtitleLanguage','tr');
  // OYN-02: native-only controls use reserved image space, without an occlusion/snapshot marker.
  const stage=document.createElement('div');stage.id='playerStage';document.getElementById('playerLayer').append(stage);let nativeActive=true;window.NativePlayerUI={active:()=>nativeActive,layout(){},state:()=>({chapters:[]})};
  UI.togglePanel('play');await tick();assert(stage.querySelector('.sx-native-tools > .sx-player-panel'));assert(!document.querySelector('.sx-player-panel').hasAttribute('data-pw-occludes-native'));
  nativeActive=false;document.dispatchEvent(new window.Event('native-player-state-changed'));await tick();assert(!stage.querySelector('.sx-native-tools'));assert.equal(document.querySelector('.sx-player-panel').parentElement.id,'playerLayer');UI.togglePanel();
  window.NativePlayerUI=undefined;

  // İzlendi → sıradaki bölüm önerisi
  video.currentTime = 2950; video.dispatchEvent(new window.Event('ended'));
  await until(() => document.querySelector('.sx-next'), 'sıradaki bölüm istemi');
  assert.match(document.querySelector('.sx-next').textContent, /S1E2/);
  window.NativePlayerUI={active:()=>true,layout(){},state:()=>({chapters:[]})};document.dispatchEvent(new window.Event('native-player-state-changed'));await tick();assert(stage.querySelector('.sx-native-tools > .sx-next'),'up-next moves into reserved native space');window.NativePlayerUI=undefined;document.dispatchEvent(new window.Event('native-player-state-changed'));await tick();
  saved = (await service.handle({}, { action: 'continue-list' })).items;
  assert.equal(saved[0].completed, true);

  // Sıradaki bölüm: geri sayım + otomatik oynatma tercihi
  assert.match(document.querySelector('.sx-next .sx-next-count').textContent, /sn içinde başlıyor/, 'otomatik oynatma geri sayımı');
  const autoBox = document.querySelector('.sx-next input[type=checkbox]');
  assert.equal(autoBox.checked, true, 'varsayılan: otomatik oynat');
  autoBox.checked = false; autoBox.dispatchEvent(new window.Event('change'));
  assert.equal(window.localStorage.getItem('stremio.autoNext'), '0', 'tercih saklanır');
  assert.equal(document.querySelector('.sx-next .sx-next-count').textContent, '', 'kapatınca geri sayım durur');
  click([...document.querySelectorAll('.sx-next button')].find((b) => /Sıradakini oynat/.test(b.textContent)));
  await until(() => opened.length === 3, 'sıradaki bölüm oynatıldı');
  assert.equal(opened[2].result.url, 'https://cdn.example/b.mp4', 'sıradaki bölüm, çalan kaynağın kalitesini (720p) korur');
  assert.ok(!document.querySelector('.sx-next'), 'istem oynatınca kapanır');
  window.localStorage.removeItem('stremio.autoNext');

  // Native oynatıcı önerisi (yerleşik oynatıcı hata verirse) ve bölüm adından giriş atlama
  let nativeStarted = 0; const chapters = [{ time: 0, title: 'Intro' }, { time: 90, title: 'Bölüm' }];
  window.NativePlayerUI = { start: async () => { nativeStarted++; return true; }, active: () => nativeStarted > 0, state: () => ({ chapters, tracks: [{ id: 3, type: 'sub', lang: 'eng', title: 'English', codec: 'subrip' }] }), command: async () => ({ ok: true }) };
  video.dispatchEvent(new window.Event('error'));
  await until(() => document.querySelector('.sx-native-hint'), 'native önerisi');
  click([...document.querySelectorAll('.sx-native-hint button')].find((b) => /Native oynatıcıyı kullan/.test(b.textContent)));
  await until(() => nativeStarted === 1 && !document.querySelector('.sx-native-hint'), 'native başlatıldı ve öneri kapandı');
  video.currentTime = 10;
  await until(() => document.querySelector('.sx-skip'), 'giriş atla düğmesi');
  assert.match(document.querySelector('.sx-skip').textContent, /Girişi atla/);
  click(document.querySelector('.sx-skip'));
  assert.equal(video.currentTime, 90, 'bölüm bitişine atlar');
  video.currentTime = 200; await tick(900); assert.ok(!document.querySelector('.sx-skip'), 'giriş dışında düğme yok');
  click(document.getElementById('playerStremioBtn'));
  [...document.querySelectorAll('.sx-tab')].find((b) => /Altyazı/.test(b.textContent)).click();
  await until(() => [...document.querySelectorAll('.sx-player-panel .sx-audio')].some((b) => /English/.test(b.textContent)), 'native gömülü altyazı izleri');
  click(document.getElementById('playerStremioBtn'));
  delete window.NativePlayerUI;

  // Dublaj sekmesi: aktif altyazıyı gösterir, profil/ayar uygular, stüdyoyu açar
  window.player.subPath = path.join(root, 'stremio-subtitles', 'x.srt'); window.player.sub2Path = ''; window.player.sub2Role = '';
  let studioOpened = 0, presetClicked = 0, registerChanged = '',studioPreparations=0;
  window.DubGeneratorUI={prepareWithPreset:async options=>{assert.equal(options.preset,'Balanced');assert(options.isCurrent());studioPreparations++;return {ok:true};}};
  const dubBtn = document.createElement('button'); dubBtn.id = 'playerDubGenerate'; dubBtn.addEventListener('click', () => studioOpened++); document.body.append(dubBtn);
  const presetBtn = document.createElement('button'); presetBtn.id = 'dubPresetBalanced'; Object.defineProperty(presetBtn, 'offsetParent', { get: () => document.body }); presetBtn.addEventListener('click', () => presetClicked++); document.body.append(presetBtn);
  const reg = document.createElement('select'); reg.id = 'translateRegister'; for (const v of ['documentary', 'drama', 'general']) reg.append(new window.Option(v, v)); reg.addEventListener('change', () => { registerChanged = reg.value; }); document.body.append(reg);
  click(document.getElementById('playerStremioBtn'));
  [...document.querySelectorAll('.sx-tab')].find((b) => /Dublaj/.test(b.textContent)).click();
  await until(() => document.querySelector('.sx-dub-card.is-ready'), 'dublaj sekmesi');
  assert.match(document.querySelector('.sx-dub-card').textContent, /x\.srt/, 'aktif altyazı gösterilir');
  click([...document.querySelectorAll('.sx-panel-body button')].find((b) => /stüdyosunu aç/.test(b.textContent)));
  await until(() => studioPreparations === 1 && registerChanged === 'drama', 'stüdyo mevcut API ile hazırlandı');
  assert.equal(studioOpened,0,'no synthetic studio-button click');assert.equal(presetClicked,0,'no preset DOM polling/click');
  assert.equal(registerChanged, 'drama', 'dizi profili dram üslubunu seçer');
  assert.ok(!document.querySelector('.sx-player-panel'), 'panel kapanır');
  // Oynatma sekmesi: hız, bölüm gezinmesi
  click(document.getElementById('playerStremioBtn'));
  [...document.querySelectorAll('.sx-tab')].find((b) => /Oynatma/.test(b.textContent)).click();
  click([...document.querySelectorAll('.sx-quick button')].find((b) => b.textContent === '1.5×'));
  await tick();assert.equal(video.playbackRate, 1.5, 'hız ortak sahibi üzerinden ayarlanır');
  click(document.getElementById('playerStremioBtn'));

  // Kaynak karşılaştırma
  await UI.openStreams({ type: 'series', id: 'tt1', name: 'Test Dizisi', season: 1, episode: 1, episodeTitle: 'Pilot' });
  await until(() => document.querySelectorAll('.sx-streams .sx-compare input').length === 2, 'karşılaştırma kutuları');
  const boxes = [...document.querySelectorAll('.sx-streams .sx-compare input')];
  boxes[0].checked = true; boxes[0].dispatchEvent(new window.Event('change'));
  assert.ok(document.querySelector('.sx-compare-box').hidden, 'tek kaynakla karşılaştırma açılmaz');
  boxes[1].checked = true; boxes[1].dispatchEvent(new window.Event('change'));
  assert.equal(document.querySelectorAll('.sx-compare-table thead th[scope=col]').length, 2);
  assert.ok(document.querySelector('.sx-compare-table .is-best'), 'üstün değer işaretlenir');
  document.querySelector('.sx-streams').close();

  // Keşfet görünümü: hero, süzgeçler
  const page2 = UI.mount(document.getElementById('mediaHome'));
  await until(() => document.querySelector('.sx-feature:not([hidden]) .sx-feature-title'), 'vitrin');
  assert.equal(document.querySelector('.sx-feature-title').textContent, 'Test Dizisi');
  assert.equal(document.querySelector('.sx-feature-title').hidden, false, 'an addon logo never hides the readable title');
  assert.match(document.querySelector('.sx-feature-meta').textContent, /8\.1/);
  assert.match(document.querySelector('.sx-feature-meta').textContent, /Dram/);
  assert.doesNotMatch(document.querySelector('.sx-feature-meta').textContent, /Drama/);
  document.getElementById('sxMode-browse').click();
  await until(() => document.querySelector('.sx-browse .sx-card'), 'keşfet kataloğu');
  assert.equal(document.querySelector('.sx-home').hidden, true);
  const sels = document.querySelectorAll('.sx-browse-bar select');
  const genre = [...sels].find(x => [...x.options].some(option => option.value === 'Drama'));
  assert.equal(genre.querySelector('option[value="Drama"]').textContent, 'Dram');
  genre.value = 'Drama'; genre.dispatchEvent(new window.Event('change'));
  await until(() => resourceRequests.some(url => url.includes('genre=Drama')), 'raw addon genre filter');
  await until(() => document.querySelector('.sx-browse .sx-card'), 'localized genre result');
  assert.match(document.querySelector('.sx-active-filters')?.textContent || document.querySelector('.sx-browse').textContent, /Dram/);
  const rating = [...sels].find((x) => /puan/i.test(x.getAttribute('aria-label')));
  const year = [...sels].find((x) => /yıl/i.test(x.getAttribute('aria-label')));
  year.value = 'old'; year.dispatchEvent(new window.Event('change'));
  assert.equal(document.querySelectorAll('.sx-browse .sx-card').length, 0, 'yıl süzgeci uygulanır (2020 yapımı 2000 öncesinde yok)');
  year.value = ''; year.dispatchEvent(new window.Event('change'));
  rating.value = '8'; rating.dispatchEvent(new window.Event('change'));
  assert.equal(document.querySelectorAll('.sx-browse .sx-card').length, 1, '8+ puan eşleşir');
  assert.ok(document.querySelector('.sx-browse .sx-rating'));
  document.getElementById('sxMode-home').click();
  const heart = document.querySelector('.sx-feature .sx-actions button[aria-pressed]');
  await until(() => heart && /Listeme ekle/.test(heart.textContent), 'liste düğmesi');
  click(heart); await until(() => /Listemde/.test(heart.textContent), 'listeye eklendi');
  await until(() => document.querySelector('.sx-mylist .sx-card'), 'Listem rafı');
  assert.equal((await service.handle({}, { action: 'library-list' })).items.length, 1);
  click(heart); await until(() => /Listeme ekle/.test(heart.textContent), 'listeden çıkarıldı');
  assert.equal((await service.handle({}, { action: 'library-list' })).items.length, 0);
  // Kütüphane: geçmiş + istatistik, puanlarım
  document.getElementById('sxMode-library').click();
  await until(() => document.querySelector('.sx-lib .sx-stat'), 'kütüphane istatistikleri');
  assert.ok(document.querySelectorAll('.sx-lib .sx-stat').length === 5, 'beş istatistik kartı');
  await until(() => document.querySelector('.sx-hist'), 'geçmiş satırı');
  assert.match(document.querySelector('.sx-day .sx-h3').textContent, /Bugün/, 'günlere göre gruplanır');
  const histFilter = document.querySelector('.sx-lib input[type=search]'); histFilter.value = 'yokböyleşey'; histFilter.dispatchEvent(new window.Event('input'));
  assert.ok(document.querySelector('.sx-lib .sx-empty-state'), 'filtre boş durum gösterir'); histFilter.value = ''; histFilter.dispatchEvent(new window.Event('input'));
  // Başlık sayfasında puan + durum + not
  document.getElementById('sxMode-home').click();
  UI.openTitle({ type: 'series', id: 'tt1', name: 'Test Dizisi' });
  await until(() => document.querySelector('.md-detail .sx-mine'), 'değerlendirme paneli');
  const star8 = document.querySelector('.md-detail .sx-star[data-n="8"]'); click(star8);
  await until(async () => true, 'bekle'); await tick(60);
  let ratingRow = (await service.handle({}, { action: 'rating-get', type: 'series', id: 'tt1' })).rating;
  assert.equal(ratingRow?.score, 8, 'yıldız tıklaması puanı kaydeder');
  const statusSel = document.querySelector('.md-detail .sx-mine select'); statusSel.value = 'watching'; statusSel.dispatchEvent(new window.Event('change')); await tick(60);
  const noteBox = document.querySelector('.md-detail .sx-mine textarea'); noteBox.value = 'Harika başlangıç'; noteBox.dispatchEvent(new window.Event('input')); noteBox.dispatchEvent(new window.Event('blur')); await tick(80);
  ratingRow = (await service.handle({}, { action: 'rating-get', type: 'series', id: 'tt1' })).rating;
  assert.equal(ratingRow.status, 'watching'); assert.equal(ratingRow.note, 'Harika başlangıç');
  click(document.querySelector('.md-detail .sx-star[data-n="8"]')); await tick(60);
  assert.equal((await service.handle({}, { action: 'rating-get', type: 'series', id: 'tt1' })).rating.score, 0, 'aynı yıldıza tekrar basınca puan kalkar (not kalır)');
  document.querySelector('.md-detail').close();
  document.getElementById('sxMode-library').click(); [...document.querySelectorAll('.sx-lib .sx-seg-btn')].find((b) => b.dataset.v === 'rated').click();
  await until(() => document.querySelector('.sx-rated'), 'puanlarım kartı');
  assert.match(document.querySelector('.sx-rated').textContent, /Harika başlangıç/);
  page2.dispose();

  // C855-01: actual metadata -> renderer -> source query; missing numbers never become special0.
  metadataExtras=[{id:'unknown-null',title:'Unknown null',season:null,number:null},{id:'unknown-blank',title:'Unknown blank',season:' ',episode:''},{id:'unknown-bool',title:'Unknown bool',season:false,episode:false}];
  await UI.openTitle({type:'series',id:'tt1'});
  const unknownTitle=document.querySelector('.md-detail');assert(!unknownTitle.textContent.includes('Unknown null'));assert(!unknownTitle.textContent.includes('Unknown blank'));assert(!unknownTitle.textContent.includes('Unknown bool'));assert(![...unknownTitle.querySelector('.sx-season').options].some(o=>o.value==='0'),'missing metadata must not add a special season');unknownTitle.close();
  metadataExtras.push({id:'special-zero',title:'Actual special zero',season:0,episode:'0'});
  await UI.openTitle({type:'series',id:'tt1'});const specialTitle=document.querySelector('.md-detail'),seasonPicker=specialTitle.querySelector('.sx-season');assert([...seasonPicker.options].some(o=>o.value==='0'),'real special season remains selectable');seasonPicker.value='0';seasonPicker.dispatchEvent(new window.Event('change'));assert.equal(specialTitle.querySelectorAll('.sx-episode').length,1);assert.match(specialTitle.querySelector('.sx-episode').textContent,/Actual special zero/);
  const sourceQueries=[];window.api.stremio=q=>{if(q.action==='streams')sourceQueries.push(q);return originalApi(q);};click(specialTitle.querySelector('.sx-episode .sx-ep-actions button'));await until(()=>sourceQueries.length===1,'actual special source request');assert.equal(sourceQueries[0].season,0);assert.equal(sourceQueries[0].episode,0);await until(()=>resourceRequests.includes('https://torr.example/stream/series/tt1:0:0.json'),'special resource id');await until(()=>document.querySelector('.sx-streams .sx-stream'),'special source listing');document.querySelector('.sx-streams').close();specialTitle.close();window.api.stremio=originalApi;metadataExtras=[];

  let finishProgress;window.api.stremio=q=>q.action==='progress-save'?new Promise(resolve=>{finishProgress=resolve;}):originalApi(q);
  video.dispatchEvent(new window.Event('pause'));await until(()=>!!finishProgress,'pending old progress');
  window.player.mediaKey='new-owner';video.dispatchEvent(new window.Event('loadstart'));finishProgress({ok:false,code:'CAPACITY'});await tick();assert(!document.querySelector('.sx-progress-warning'),'late failure is not shown for another source');window.api.stremio=originalApi;
  // Anahtar başka videoya geçince panel düğmesi gizlenir ve kayıt yazılmaz
  window.player.mediaKey = 'baska';
  video.currentTime = 100; video.dispatchEvent(new window.Event('pause')); await tick(40);
  assert.equal((await service.handle({}, { action: 'progress-title', type: 'series', id: 'tt1' })).entries.filter((e) => e.position === 100).length, 0);
  // Missing torrent engine keeps the exact selection and never auto-plays after installation.
  let engineReady=false,engineInstalls=0;const sourceAttempts=[];window.api.stremio=q=>{if(q.action==='play'){sourceAttempts.push(q);if(!engineReady)return Promise.resolve({ok:false,code:'NEEDS_TORRENT_ENGINE',error:'fixture missing engine'});}return originalApi(q);};
  window.MediaHubUI.installTorrentEngine=async({isCurrent})=>{assert(isCurrent());engineInstalls++;engineReady=true;return {ok:true,installed:true};};
  await UI.openStreams({type:'series',id:'tt1',name:'Controlled episode',season:1,episode:1});await until(()=>document.querySelector('.sx-streams .sx-best button'),'engine source selector');document.querySelector('.sx-streams .sx-best button').click();await until(()=>document.querySelector('.sx-engine'),'missing engine recovery');
  assert(document.querySelector('.sx-engine-retry').disabled,'retry waits for verified engine setup');
  [...document.querySelectorAll('.sx-engine button')].find(b=>b.textContent==='Torrent motorunu kur').click();await until(()=>engineInstalls===1,'explicit engine install');await tick();assert.equal(sourceAttempts.length,1,'install alone does not start torrent/media');assert.match(document.querySelector('.sx-streams .sx-status').textContent,/motoru hazır/);
  document.querySelector('.sx-engine-retry').click();await until(()=>sourceAttempts.length===2,'explicit selected retry');assert.equal(sourceAttempts[1].token,sourceAttempts[0].token);assert.equal(sourceAttempts[1].streamId,sourceAttempts[0].streamId);await until(()=>!document.querySelector('.sx-streams'),'successful retry closes selector');window.api.stremio=originalApi;

  engineReady=false;let finishEngineInstall;window.api.stremio=q=>{if(q.action==='play'){sourceAttempts.push(q);return Promise.resolve({ok:false,code:'NEEDS_TORRENT_ENGINE',error:'fixture missing engine'});}return originalApi(q);};window.MediaHubUI.installTorrentEngine=()=>new Promise(resolve=>{finishEngineInstall=resolve;});
  await UI.openStreams({type:'series',id:'tt1',name:'Controlled stale source',season:1,episode:1});await until(()=>document.querySelector('.sx-streams .sx-best button'),'stale source selector');document.querySelector('.sx-streams .sx-best button').click();await until(()=>document.querySelector('.sx-engine'),'stale engine help');[...document.querySelectorAll('.sx-engine button')].find(b=>b.textContent==='Torrent motorunu kur').click();await until(()=>finishEngineInstall,'pending engine install');const priorAttempts=sourceAttempts.length;window.player.mediaKey='different-source';window.player.generation=(window.player.generation||0)+1;finishEngineInstall({ok:true,installed:true});await tick();assert.equal(sourceAttempts.length,priorAttempts);assert(!document.querySelector('.sx-streams .sx-status').textContent.includes('motoru hazır'),'stale installation cannot claim the old source is ready');document.querySelector('.sx-streams').close();window.api.stremio=originalApi;

  // Installed optional settings open their own page and return to an explicit save preview.
  const addonFile=path.join(root,'stremio-addons.json'),initialConfig=JSON.parse(fs.readFileSync(addonFile,'utf8')),torrentIndex=initialConfig.addons.findIndex(a=>a.manifest.id==='t');initialConfig.addons[torrentIndex].enabled=false;delete initialConfig.addons[torrentIndex].manifest.configurable;fs.writeFileSync(addonFile,JSON.stringify(initialConfig));assert.equal((await service.handle({},{action:'status'})).addons[torrentIndex].configurationUnknown,true);
  UI.openAddons();await until(()=>document.querySelector('.sx-addon-settings'),'legacy installed addon settings');const addonDialog=document.querySelector('.sx-addons');
  addonDialog.querySelector('.sx-addon-settings').click();await until(()=>[...addonDialog.querySelectorAll('.sx-preview button')].some(b=>b.textContent==='Ayarları kaydet'),'configured addon preview');assert.equal(configurationOpened,1);assert(!addonDialog.textContent.includes('debrid-fixture'));assert.equal(JSON.parse(fs.readFileSync(addonFile,'utf8')).addons[torrentIndex].manifestUrl,initialConfig.addons[torrentIndex].manifestUrl,'settings return still needs explicit save');
  [...addonDialog.querySelectorAll('.sx-preview button')].find(b=>b.textContent==='Ayarları kaydet').click();await until(()=>JSON.parse(fs.readFileSync(addonFile,'utf8')).addons[torrentIndex].manifestUrl.includes('debrid-fixture'),'explicit configured save');const afterConfig=JSON.parse(fs.readFileSync(addonFile,'utf8'));assert.equal(afterConfig.addons.length,3);assert.equal(afterConfig.addons[torrentIndex].enabled,false);assert.equal(afterConfig.addons[torrentIndex].installedAt,initialConfig.addons[torrentIndex].installedAt);
  await until(()=>addonDialog.querySelector('.sx-preview').hidden,'settings save redraw complete');
  configureMode='cancel';const cancelBytes=fs.readFileSync(addonFile,'utf8');addonDialog.querySelector('.sx-addon-settings').click();await until(()=>configurationOpened===2,'reopen settings');await tick();assert.equal(fs.readFileSync(addonFile,'utf8'),cancelBytes);assert.match(addonDialog.querySelector('.sx-status').textContent,/Mevcut eklenti korundu/);addonDialog.close();
  // The app-owned approval is asynchronous: no remove before it settles, and
  // Cancel must preserve the exact addon file rather than merely redraw a row.
  const removeCalls=[];let removalApproval;
  window.confirm=()=>{throw Error('Native confirm must not be used for addon removal');};
  window.api.stremio=request=>{if(request.action==='addon-remove')removeCalls.push(request);return originalApi(request);};
  window.openAppDialog=options=>new Promise(resolve=>{removalApproval={options,resolve};});
  UI.openAddons();await until(()=>document.querySelector('.sx-addon .sx-act-danger'),'addon remove action');
  const removalDialog=document.querySelector('.sx-addons'),beforeRemoval=fs.readFileSync(addonFile,'utf8'),beforeRemovalRows=JSON.parse(beforeRemoval).addons,selectedRemoval=beforeRemovalRows[0];
  const removeSelected=()=>removalDialog.querySelectorAll('.sx-addon')[0].querySelector('.sx-act-danger');
  click(removeSelected());await until(()=>!!removalApproval,'app-owned removal approval');
  assert.equal(removeCalls.length,0);assert.equal(fs.readFileSync(addonFile,'utf8'),beforeRemoval);assert.equal(removalApproval.options.intent,'danger');assert.match(removalApproval.options.description,new RegExp(selectedRemoval.manifest.name));
  removalApproval.resolve(false);await tick();assert.equal(removeCalls.length,0);assert.equal(fs.readFileSync(addonFile,'utf8'),beforeRemoval);assert.equal(removalDialog.querySelectorAll('.sx-addon').length,beforeRemovalRows.length);
  removalApproval=null;click(removeSelected());await until(()=>!!removalApproval,'renewed removal approval');assert.equal(removeCalls.length,0);
  removalApproval.resolve(true);await until(()=>removeCalls.length===1&&removalDialog.querySelectorAll('.sx-addon').length===beforeRemovalRows.length-1,'confirmed selected addon removed');assert.equal(removeCalls[0].key,selectedRemoval.key);assert.deepEqual(JSON.parse(fs.readFileSync(addonFile,'utf8')).addons.map(a=>a.key),beforeRemovalRows.filter(a=>a.key!==selectedRemoval.key).map(a=>a.key));
  assert(removalDialog.querySelector('.sx-list-head .sx-h2'));assert(removalDialog.querySelector('.sx-list-head .sx-refresh-all'),'refresh-all remains owned by the list heading');removalDialog.close();window.api.stremio=originalApi;

  // Browsing title details keeps the explicit navigation intent when playback changes.
  const beforeShared=sharedDetailCalls.length;let finishMeta;
  window.api.stremio=request=>request.action==='meta'?new Promise(resolve=>{finishMeta=resolve;}):originalApi(request);
  const delayedTitle=UI.openTitle({type:'movie',id:'tt1234567',name:'Old selection'});
  window.player.generation=(window.player.generation||0)+1;
  finishMeta({ok:true,meta:{type:'movie',id:'tt1234567',name:'Old selection',genres:[],videos:[]}});
  assert.notEqual((await delayedTitle)?.cancelled,true);assert.equal(sharedDetailCalls.length,beforeShared+1);window.api.stremio=originalApi;
  // “From the beginning” must override the saved resume point; plain play still resumes.
  await service.handle({},{action:'progress-save',type:'series',id:'tt1',season:1,episode:1,name:'Test Dizisi',position:1200,duration:3000});
  // Cinemeta was removed above; build the title context the picker receives from the detail page.
  const metaTt1={type:'series',id:'tt1',name:'Test Dizisi',poster:'',genres:[],videos:[{id:'tt1:1:1',season:1,episode:1,title:'Pilot'},{id:'tt1:1:2',season:1,episode:2,title:'İkinci'}]};
  const fileRow=(id,extra={})=>({id,addonKey:'k',addonName:'Torrentio',name:'T',label:'T',title:'Dizi',description:'',kind:'url',playable:true,reason:'',resolution:'1080p',seeders:null,sizeBytes:null,provider:'',codec:'',hdr:'',source:'',flags:[],multiAudio:false,notWebReady:false,usesHeaders:false,bingeGroup:'',score:60,tags:[],warns:[],audio:'',channels:'',group:'',filename:'a.mp4',host:'cdn.example',embeddedSubtitles:0,whisperAudio:'ready',...extra});
  const stubSources=(rows,play)=>{window.api.stremio=q=>q.action==='streams'?Promise.resolve({ok:true,token:'t-'+rows[0].id,videoId:'tt1:1:1',groups:[{addonKey:'k',addonName:'Torrentio',count:rows.length,error:null}],streams:rows})
    :q.action==='play'?Promise.resolve({ok:true,workKey:'',whisperAudio:rows.find(r=>r.id===q.streamId).whisperAudio,meta:{type:'series',id:'tt1',season:1,episode:1},...play(q)})
    :q.action==='subtitles'?Promise.resolve({ok:true,token:'s',subtitles:[],groups:[]}):originalApi(q);};
  // Pending debrid files remain visible, but must not win automatic playback over a ready source.
  stubSources([fileRow('waiting',{addonName:'Waiting',availability:'download',score:99,whisperAudio:'pending'}),fileRow('ready',{addonName:'Ready',filename:'release.mkv',codec:'hevc',hdr:'DV',source:'webdl',audio:'atmos',tags:['hevc','dv','webdl','atmos','instant'],availability:'cached'})],()=>({url:'https://cdn.example/ready.mkv',key:'stream:'+'c'.repeat(64)}));
  const recommendation=await UI.openStreams(UI._test.baseCtx(metaTt1,1,1));
  assert.match(recommendation.querySelector('.sx-best-title').textContent,/Ready/);
  assert.match(recommendation.querySelector('.sx-best-why').textContent,/native oynatıcı önerilir/);
  assert.doesNotMatch(recommendation.querySelector('.sx-best-why').textContent,/yerleşik oynatıcıda açılır/);
  assert.match(recommendation.querySelector('.sx-pill-wait').textContent,/hazırlıyor/);
  const compactFacts=[...recommendation.querySelectorAll('.sx-stream')].find(row=>row.querySelector('.sx-stream-title').textContent==='release.mkv').querySelector('.sx-facts').textContent;
  assert.equal((compactFacts.match(/HEVC/g)||[]).length,1);
  const sourceSearch=recommendation.querySelector('.sx-search-controls input'),scopes=recommendation.querySelectorAll('[data-scope]');
  scopes[1].click();await tick();assert.equal(recommendation.querySelectorAll('.sx-stream').length,1);assert.match(recommendation.querySelector('.sx-stream-title').textContent,/release.mkv/);
  scopes[0].click();await tick();sourceSearch.value='Ready';sourceSearch.dispatchEvent(new window.Event('input'));assert.equal(recommendation.querySelectorAll('.sx-stream').length,1,'search includes addon names');
  sourceSearch.value='not-a-source';sourceSearch.dispatchEvent(new window.Event('input'));assert(recommendation.querySelector('.sx-source-empty'));
  [...recommendation.querySelectorAll('.sx-source-empty button')].find(b=>b.textContent==='Filtreleri temizle').click();await tick();assert.equal(recommendation.querySelectorAll('.sx-stream').length,2);assert.equal(sourceSearch.value,'');
  assert(recommendation.querySelector('.sx-filter-drawer .sx-filters select'),'advanced filters remain reachable');recommendation.close();
  const openedBeforePending=opened.length;
  stubSources([fileRow('only-waiting',{availability:'download',whisperAudio:'pending'})],()=>({url:'https://cdn.example/wait.mkv',key:'stream:'+'c'.repeat(64)}));
  const pendingOnly=await UI.openStreams({...UI._test.baseCtx(metaTt1,1,1),autoplayBest:true});await tick(40);
  assert.equal(opened.length,openedBeforePending);assert.equal(pendingOnly.querySelector('.sx-best'),null);pendingOnly.close();

  // “From the beginning” must override the saved resume point; plain play still resumes.
  stubSources([fileRow('r1')],()=>({url:'https://cdn.example/a.mp4',key:'stream:'+'d'.repeat(64),resume:{position:1200,duration:3000}}));
  let picker=await UI.openStreams({...UI._test.baseCtx(metaTt1,1,1),resumeSeconds:0});
  let before=opened.length;click(picker.querySelector('.sx-best button'));
  await until(()=>opened.length===before+1,'explicit start opened');assert.equal(opened.at(-1).seconds,0,'explicit start from the beginning');
  picker=await UI.openStreams(UI._test.baseCtx(metaTt1,1,1));before=opened.length;click(picker.querySelector('.sx-best button'));
  await until(()=>opened.length===before+1,'resume opened');assert.equal(opened.at(-1).seconds,1200,'default play resumes');
  assert.equal(UI.whisperStatus().ok,true);assert(UI.whisperSource(),'direct HTTPS file feeds Whisper');window.api.stremio=originalApi;
  // Source tools on the shared title page surface their errors in the page status.
  window.api.stremio=q=>q.action==='library-toggle'?Promise.resolve({ok:false,code:'CAPACITY'}):originalApi(q);
  await UI.openTitle({type:'movie',id:'tt7777777',name:'Film'});await until(()=>document.querySelector('.md-detail .sx-source-personal button'),'title list control');
  const titleStatus=document.querySelector('.md-detail > p');assert.match(titleStatus.textContent,/Cinemeta/,'missing details explained in the shared status');
  click(document.querySelector('.md-detail .sx-source-personal button'));
  await until(()=>/kapasite/.test(titleStatus.textContent),'title page error visible');document.querySelector('.md-detail').close();window.api.stremio=originalApi;
  // A picker the user closed must never start playback when late addon answers arrive.
  stubSources([fileRow('r2')],()=>({url:'https://cdn.example/b.mp4',key:'stream:'+'e'.repeat(64),resume:null}));const stubbed=window.api.stremio;
  let releaseStreams;window.api.stremio=q=>q.action==='streams'?new Promise(r=>{releaseStreams=()=>r(stubbed(q));}):stubbed(q);
  before=opened.length;const playCalls=[];const lateApi=window.api.stremio;window.api.stremio=q=>{if(q.action==='play')playCalls.push(q);return lateApi(q);};
  picker=await Promise.race([UI.openStreams({...UI._test.baseCtx(metaTt1,1,2),autoplayBest:true}),tick(30).then(()=>document.querySelector('.sx-streams'))]);
  await until(()=>!!releaseStreams,'deferred streams');document.querySelector('.sx-streams').close();releaseStreams();await tick(80);
  assert.equal(playCalls.length,0,'closed picker does not autoplay');assert.equal(opened.length,before);window.api.stremio=originalApi;
  // Closing a picker also cancels a play reply already in flight, not just its source lookup.
  stubSources([fileRow('pending-play')],()=>({url:'https://cdn.example/pending.mp4',key:'stream:'+'b'.repeat(64),resume:null}));
  const pendingApi=window.api.stremio;let releasePlay;
  window.api.stremio=q=>q.action==='play'?new Promise(resolve=>{releasePlay=()=>resolve(pendingApi(q));}):pendingApi(q);
  picker=await UI.openStreams(UI._test.baseCtx(metaTt1,1,1));before=opened.length;
  click(picker.querySelector('.sx-best button'));await until(()=>!!releasePlay,'pending play IPC');picker.close();releasePlay();await tick(60);
  assert.equal(opened.length,before,'closed picker does not open a delayed play result');window.api.stremio=originalApi;
  // A different media open while IPC is pending owns the player; the old picker cannot reclaim it.
  stubSources([fileRow('pending-owner')],()=>({url:'https://cdn.example/pending.mp4',key:'stream:'+'b'.repeat(64),resume:null}));
  const ownerApi=window.api.stremio;releasePlay=null;
  window.api.stremio=q=>q.action==='play'?new Promise(resolve=>{releasePlay=()=>resolve(ownerApi(q));}):ownerApi(q);
  picker=await UI.openStreams(UI._test.baseCtx(metaTt1,1,1));before=opened.length;
  click(picker.querySelector('.sx-best button'));await until(()=>!!releasePlay,'pending media owner');
  window.player.generation=(window.player.generation||0)+1;releasePlay();await tick(60);
  assert.equal(opened.length,before,'new player generation cancels old play reply');picker.close();window.api.stremio=originalApi;
  // Cancellation remains visible during MediaHub preparation (secure remember/flush), before it sets the source.
  stubSources([fileRow('pending-hub')],()=>({url:'https://cdn.example/pending.mp4',key:'stream:'+'b'.repeat(64),resume:null}));
  const realPlayStream=window.MediaHubUI.playStream;let releaseHub,hubCancelled;
  window.MediaHubUI.playStream=async(result,seconds,options)=>{await new Promise(resolve=>{releaseHub=resolve;});hubCancelled=options.isCancelled();if(hubCancelled)return false;return realPlayStream(result,seconds);};
  picker=await UI.openStreams(UI._test.baseCtx(metaTt1,1,1));before=opened.length;
  click(picker.querySelector('.sx-best button'));await until(()=>!!releaseHub,'pending MediaHub preparation');picker.close();releaseHub();await tick(60);
  assert.equal(hubCancelled,true,'picker cancellation reaches MediaHub');assert.equal(opened.length,before);
  window.MediaHubUI.playStream=realPlayStream;window.api.stremio=originalApi;
  // Addon failures are explained per code (EN/TR), never as raw upstream text, with a retry.
  const failedList={ok:true,token:'t-fail',videoId:'tt1:1:1',groups:[{addonKey:'k',addonName:'Torrentio',count:0,error:{message:'Altyazı alan adı çözümlenemedi',code:'EBROWSER_UNSAFE_URL'}}],streams:[]};
  let streamCalls=0;window.api.stremio=q=>q.action==='streams'?(streamCalls++,Promise.resolve(failedList)):originalApi(q);
  picker=await UI.openStreams(UI._test.baseCtx(metaTt1,1,1));
  assert.match(picker.textContent,/Torrentio: adresi genel bir adres olarak doğrulanamadı \(DNS/);assert(!picker.textContent.includes('Altyazı alan adı'));
  assert.match(picker.textContent,/Hiçbir eklenti kaynak döndüremedi/);click(picker.querySelector('.sx-retry'));await until(()=>streamCalls===2,'retry searched again');
  assert(!picker.isConnected,'retry replaces the old picker');document.querySelector('.sx-streams')?.close();window.api.stremio=originalApi;
  // An HLS source plays but explains why Whisper is unavailable and offers Whisper-ready sources.
  const hlsKey='stream:'+'c'.repeat(64),hlsRow={id:'hls1',addonKey:'k',addonName:'HLS',name:'HLS',label:'HLS',title:'Live',description:'',kind:'url',playable:true,reason:'',resolution:'1080p',seeders:null,sizeBytes:null,provider:'',codec:'',hdr:'',source:'',flags:[],multiAudio:false,notWebReady:false,usesHeaders:false,bingeGroup:'',score:50,tags:[],warns:[],audio:'',channels:'',group:'',filename:'',host:'cdn.example',embeddedSubtitles:0,whisperAudio:'adaptive'};
  window.api.stremio=q=>q.action==='streams'?Promise.resolve({ok:true,token:'t-hls',videoId:'tt1:1:1',groups:[{addonKey:'k',addonName:'HLS',count:1,error:null}],streams:[hlsRow]})
    :q.action==='play'?Promise.resolve({ok:true,url:'https://cdn.example/live/master.m3u8',key:hlsKey,workKey:'',whisperAudio:'adaptive',resume:null,meta:{type:'series',id:'tt1',season:1,episode:1}})
    :q.action==='subtitles'?Promise.resolve({ok:true,token:'s',subtitles:[],groups:[]}):originalApi(q);
  picker=await UI.openStreams(UI._test.baseCtx(metaTt1,1,1));assert.match(picker.querySelector('.sx-source-summary').textContent,/1 oynatılabilir · 1 doğrudan\/debrid · 0 Whisper uygun/);
  assert.match(picker.querySelector('.sx-why').textContent,/HLS\/DASH/);click(picker.querySelector('.sx-best button'));await until(()=>window.player.mediaKey===hlsKey,'hls opened');
  assert.equal(UI.whisperSource(),null,'adaptive source is not offered to Whisper');const ws=UI.whisperStatus();assert.equal(ws.ok,false);assert.equal(ws.kind,'adaptive');assert.match(ws.message,/HLS\/DASH/);
  UI.togglePanel('ai');await until(()=>document.querySelector('.sx-whisper-next'),'whisper next step');click(document.querySelector('.sx-whisper-next'));
  await until(()=>document.querySelector('.sx-player-panel .sx-source-empty'),'whisper-ready filter applied');
  assert.match(document.querySelector('.sx-player-panel .sx-source-empty').textContent,/Tüm oynatılabilirleri göster/);click([...document.querySelectorAll('.sx-player-panel .sx-source-empty button')].find(b=>/Tüm oynatılabilir/.test(b.textContent)));
  await until(()=>document.querySelector('.sx-player-panel .sx-stream.is-current'),'all playable shown again');UI.togglePanel();window.api.stremio=originalApi;
  // Raw torrent: Whisper waits for the download; once the local file is attached the notice flips and the open tab refreshes.
  const torKey='torrent:'+'f'.repeat(40)+':2',torRow=fileRow('rt',{kind:'torrent',whisperAudio:'torrent',filename:'t.mkv',seeders:50,host:''});
  stubSources([torRow],()=>({url:'whisper-media://t/video',key:torKey,hash:'f'.repeat(40),index:2,resume:null}));
  picker=await UI.openStreams(UI._test.baseCtx(metaTt1,1,1));click(picker.querySelector('.sx-best button'));await until(()=>window.player.mediaKey===torKey,'torrent opened');
  assert.equal(UI.whisperStatus().kind,'torrent');assert.match(UI.whisperStatus().message,/indirme bitince/);
  UI.togglePanel('ai');await until(()=>document.querySelector('.sx-player-panel .sx-whisper-blocked'),'torrent notice');
  window.player.localPath='/videos/t.mkv';document.dispatchEvent(new window.CustomEvent('player-local-file-ready',{detail:{key:torKey}}));
  await until(()=>!document.querySelector('.sx-player-panel .sx-whisper-blocked')&&/tamamlanmış yerel dosyayı/.test(document.querySelector('.sx-player-panel').textContent),'panel refreshed after download');
  assert.equal(UI.whisperStatus().ok,true);assert.equal(UI.whisperStatus().kind,'local');
  document.dispatchEvent(new window.CustomEvent('player-local-file-ready',{detail:{key:'torrent:other:0'}}));UI.togglePanel();window.player.localPath='';window.api.stremio=originalApi;
  // An expired source list explains itself and offers a fresh search instead of a dead row.
  stubSources([fileRow('rx')],()=>({url:'https://cdn.example/x.mp4',key:'stream:'+'a'.repeat(64),resume:null}));const okStub=window.api.stremio;
  window.api.stremio=q=>q.action==='play'?Promise.resolve({ok:false,code:'EXPIRED',error:'Kaynak listesinin süresi doldu; yeniden getir.'}):okStub(q);
  picker=await UI.openStreams(UI._test.baseCtx(metaTt1,1,1));click(picker.querySelector('.sx-best button'));
  await until(()=>picker.querySelector('.sx-body > .sx-retry'),'expired retry offered');assert.match(picker.textContent,/süresi doldu/);assert.equal(picker.querySelectorAll('.sx-body > .sx-retry').length,1);
  let reopened=0;window.api.stremio=q=>{if(q.action==='streams')reopened++;return okStub(q);};click(picker.querySelector('.sx-body > .sx-retry'));await until(()=>reopened===1,'expired retry searches again');await tick(40);
  document.querySelector('.sx-streams')?.close();
  // Same recovery inside the player's source tab (switching source with an expired list).
  window.api.stremio=q=>q.action==='play'?Promise.resolve({ok:false,code:'EXPIRED',error:'x'}):okStub(q);
  picker=await UI.openStreams(UI._test.baseCtx(metaTt1,1,1));click(picker.querySelector('.sx-best button'));await until(()=>picker.querySelector('.sx-body > .sx-retry'),'dialog expired');picker.close();
  stubSources([fileRow('rx'),fileRow('ry',{resolution:'720p',filename:'b.mp4'})],q=>({url:'https://cdn.example/x.mp4',key:'stream:'+'a'.repeat(64),resume:null}));const okStub2=window.api.stremio;
  window.api.stremio=okStub2;const sw=await UI.openStreams(UI._test.baseCtx(metaTt1,1,1));click(sw.querySelector('.sx-best button'));await until(()=>window.player.mediaKey==='stream:'+'a'.repeat(64),'reopened');
  window.api.stremio=q=>q.action==='play'?Promise.resolve({ok:false,code:'EXPIRED',error:'x'}):okStub2(q);UI.togglePanel('sources');await until(()=>document.querySelector('.sx-player-panel .sx-stream button:not([disabled])'),'panel rows');
  click(document.querySelector('.sx-player-panel .sx-stream button:not([disabled])'));await until(()=>document.querySelector('.sx-player-panel .sx-panel-body > .sx-retry'),'panel expired retry');UI.togglePanel();
  window.api.stremio=originalApi;
  console.log('stremio-ui.test.js: OK');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
