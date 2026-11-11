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
  'https://cinemeta.example/manifest.json': { id: 'c', name: 'Cinemeta', version: '1', types: ['movie', 'series'], resources: ['catalog', 'meta'], idPrefixes: ['tt'], catalogs: [{ type: 'series', id: 'top', name: 'Popüler', extra: [{ name: 'search' }] }] },
  'https://torr.example/manifest.json': { behaviorHints:{configurable:true}, id: 't', name: 'Torrentio', version: '1', types: ['series'], resources: ['stream'], catalogs: [] },
  'https://subs.example/manifest.json': { id: 's', name: 'Altyazı', version: '1', types: ['series'], resources: ['subtitles'], catalogs: [] },
};
let configureMode='success';let configurationOpened=0;
let metadataExtras=[];const resourceRequests=[];
const fetch = async (url) => {
  resourceRequests.push(url);
  if(url==='https://torr.example/debrid-fixture/manifest.json')return json(MANIFESTS['https://torr.example/manifest.json']);
  if (MANIFESTS[url]) return json(MANIFESTS[url]);
  if (url.startsWith('https://cinemeta.example/catalog/series/top')) return json({ metas: [{ id: 'tt1', type: 'series', name: 'Test Dizisi', releaseInfo: '2020', poster: 'https://img.example/p.jpg', background: 'https://img.example/b.jpg', description: 'Bir açıklama', imdbRating: '8.1', genres: ['Dram'] }] });
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
  assert.match(document.querySelector('.sx-feature-meta').textContent, /8\.1/);
  document.getElementById('sxMode-browse').click();
  await until(() => document.querySelector('.sx-browse .sx-card'), 'keşfet kataloğu');
  assert.equal(document.querySelector('.sx-home').hidden, true);
  const sels = document.querySelectorAll('.sx-browse-bar select');
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
  // A late title lookup must not park a newer playback to open its old details.
  const beforeShared=sharedDetailCalls.length;let finishMeta;
  window.api.stremio=request=>request.action==='meta'?new Promise(resolve=>{finishMeta=resolve;}):originalApi(request);
  const delayedTitle=UI.openTitle({type:'movie',id:'tt1234567',name:'Old selection'});
  window.player.generation=(window.player.generation||0)+1;
  finishMeta({ok:true,meta:{type:'movie',id:'tt1234567',name:'Old selection',genres:[],videos:[]}});
  assert.equal((await delayedTitle).cancelled,true);assert.equal(sharedDetailCalls.length,beforeShared);window.api.stremio=originalApi;
  console.log('stremio-ui.test.js: OK');
  process.exit(0);
})().catch((e) => { console.error(e); process.exit(1); });
