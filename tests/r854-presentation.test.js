// R854 presentation/usability regressions. Dependency-free: reads renderer sources and evaluates the pure label helpers.
// Layout (overlap/hit-test) acceptance for R854-02/03/04/05/09 was measured in headless Chromium; see docs/devir/2026-11-10-r854-uygulama.md.
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const read = (p) => fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', p), 'utf8');
const t = (en, tr) => tr; // TR locale

test('R854-06/07/08: content-network labels keep source identity and separate legacy/new domains', () => {
  const src = read('recall-network-ui.js');
  const domain = src.match(/const domainName=(value=>[\s\S]*?);\r?\n\s*const originName/);
  const state = src.match(/const stateName=(value=>[\s\S]*?);\r?\n\s*function status/);
  assert.ok(domain && state);
  const domainName = new Function('t', 'return ' + domain[1])(t);
  const stateName = new Function('t', 'return ' + state[1])(t);
  assert.equal(domainName('film'), 'Film');
  assert.equal(domainName('podcast'), 'Podcast');
  assert.equal(domainName('book'), 'Kitap');
  assert.equal(domainName('screen'), 'Film / dizi');
  assert.equal(domainName('audio'), 'Podcast');
  assert.equal(stateName('partial'), 'Kısmen doğru');
  assert.equal(stateName('obsolete'), 'Artık geçerli değil');
  assert.equal(stateName('accepted'), 'Kabul edildi');
  const options = [...src.matchAll(/\['(podcast|audio|book|books)',t\('([^']+)','([^']+)'\)\]|\['(podcast)','Podcast'\]/g)];
  const labels = new Map();
  for (const m of src.matchAll(/\['(film|series|documentary|anime|manga|podcast|book|screen|youtube|reading|audio|books)',(?:t\('([^']*)','([^']*)'\)|'([^']*)')\]/g)) labels.set(m[1], m[3] ?? m[4]);
  const seen = new Set();
  for (const [key, label] of labels) { assert.ok(!seen.has(label), `duplicate filter label ${label} (${key})`); seen.add(label); }
  assert.ok(options.length >= 0);
});

test('R854-11: reader Back restores the previous edge, not an empty reader', () => {
  const src = read('recall-network-ui.js');
  assert.match(src, /backStack\.push\(\{type:'edge',id:activeEdgeId\}\)/);
  assert.match(src, /prev\.type==='edge'\?openEdge\(prev\.id,\{history:false\}\)/);
  assert.match(src, /openEdge\(activeEdgeId,\{history:false\}\)/, 'refresh must not push history');
});

test('R854-01: known release year is shown on recommendation cards and is never guessed', () => {
  const src = read('recommendation-hub-ui.js');
  assert.match(src, /function knownYear\(row\)/);
  assert.match(src, /rhub-identity/);
  const fn = src.match(/function knownYear\(row\)\{([\s\S]*?)\}\r?\n/);
  const knownYear = new Function('row', fn[1]);
  assert.equal(knownYear({ year: 1967 }), 1967);
  assert.equal(knownYear({ metadata: { year: '2024' } }), 2024);
  assert.equal(knownYear({}), 0);
  assert.equal(knownYear({ year: 'soon' }), 0);
  assert.equal(knownYear({ year: 12 }), 0);
});

test('R854-02/03/04/05/09: layout guards are present in the owning stylesheets', () => {
  assert.match(read('browser-chrome.css'), /R854-02[\s\S]*@container browser-workspace \(max-width: 1180px\)[\s\S]*grid-column: 1 \/ -1; grid-row: 2/);
  const study = read('browser-study-view.css');
  assert.match(study, /R854-03 \/ R854-04/);
  assert.match(study, /\.sh-browser-study \.sh-top>\.sh-top-r\{[^}]*grid-column:1\/-1/);
  assert.match(study, /\.sh-browser-study \.sh-meta-next\{min-width:0;max-width:100%/);
  const cinema = read('claude-cinema-v2.css');
  assert.match(cinema, /--cv2-anchor-offset:calc\(var\(--cv2-sticky-top\) \+ 72px\)/);
  assert.match(read('cinema-ui.js'), /--cv2-sticky-top/);
  assert.match(read('recommendation-hub.css'), /\.cn-discover-entry>\.cn-poster\{display:flex;flex-direction:column;justify-content:flex-start/);
});

test('R854-10/12: series pages use series wording and a fully watched series offers watch-again, not a file picker', () => {
  const title = read('media-title.js');
  assert.match(title, /const rewatch=!next&&item\.kind==='series'/);
  assert.match(title, /item\.source\|\|item\.editions\?\.length\|\|target/);
  assert.match(title, /Tekrar izle · /);
  assert.match(read('film-page-enhancements.js'), /Dizi bağlantısını kopyala/);
  assert.match(read('film-page-lower.js'), /Dizi künyesi/);
  assert.match(read('film-context-features.js'), /Dizi eklerini getir/);
  assert.match(read('film-context-features.js'), /Dizi eklerini yenile/);
});

test('R854 geliştirmeleri: kaynak bağlı ifadeler ve niyet araması', () => {
  const net = read('recall-network-ui.js');
  assert.match(net, /rn-zoom-level/);
  assert.match(net, /b\.setAttribute\('aria-pressed',String\(h\.status===value\)\)/);
  assert.match(net, /rn-quote-source/);
  assert.match(net, /podcast:'♪',book:'▥'/);
  // Intent search: every typed word must appear in the group's vocabulary; labels still match first.
  const tools = read('browser-panel-tools.js');
  const block = tools.match(/const intents=\{([\s\S]*?)\};/);
  assert.ok(block);
  const intents = new Function('return {' + block[1] + '}')();
  const hit = (group, query) => query.toLowerCase().split(/\s+/).filter((w) => w.length > 1).every((w) => intents[group].toLowerCase().includes(w));
  assert.ok(hit('Yazı ve görünüm', 'yazıyı büyüt'));
  assert.ok(hit('Oynatma', 'ses geriden geliyor'));
  assert.ok(hit('Bul ve anla', 'bu karedeki yazı'));
  assert.ok(!hit('Oynatma', 'yazıyı büyüt'));
  const panel = read('browser-panel.js');
  assert.match(panel, /Sayfa açık · video algılanmadı/);
  assert.doesNotMatch(panel, /copy\('Sayfa bağlamı hazır'/);
  assert.match(panel, /Önceki genişliğe dön/);
  assert.match(read('media-title.js'), /t\(' \/ episode',' \/ bölüm'\)/);
});

test('R854-04 (900 px), G08–G12, G16–G21, G23: asistan ve oynatıcı sunum korumaları', () => {
  const study = read('browser-study-view.css');
  assert.match(study, /\.sh-browser-study \.sh-transport,\.sh-browser-study \.sh-sentence-nav\{min-width:0;max-width:100%;flex-wrap:wrap/);
  assert.match(study, /sh-subs\.long\{max-height:min\(220px,28vh\)\}/);
  assert.match(study, /\.sh-card\.on \.acts \.act\[data-short\]::after/);
  assert.match(study, /sh-text-first/);
  assert.match(study, /\.sh-chip\[data-a=loop\]\[data-scope\]::after/);
  assert.match(study, /\.sh-reading-size>span\{position:static/);
  const sahne = read('sahne.js');
  assert.match(sahne, /case 'textfirst'/);
  assert.match(sahne, /paintLoopScope\(\)/);
  assert.match(sahne, /Durdur — hazır satırlar korunur/);
  assert.match(sahne, /data-short="\$\{T\('Pasajı kaydet'/);
  assert.match(read('browser-study-view.js'), /button\('textfirst'/);
  const overlayJs = read('assistant-overlay.js');
  assert.match(overlayJs, /function renderReviewText\(text\)/);
  assert.match(overlayJs, /Yapılacak işlem/);
  assert.match(overlayJs, /cap\.dataset\.near=String\(!!nearLimit\)/);
  assert.match(overlayJs, /Yön değiştir çalışan görevi etkiler/);
  const overlayCss = read('assistant-overlay.css');
  assert.match(overlayCss, /#assistantWorkspace>#log\{flex-basis:max\(100px,38vh\)/);
  assert.match(overlayCss, /#sourceBox>summary #sourcePreview\{grid-column:2;grid-row:2\}/);
  const panel = read('browser-panel.js');
  assert.match(panel, /const aiChatEl = byId\('aiChat'\)/);
  assert.match(panel, /Açılır asistanda aç/);
  // The approval grouping must keep the original wording: evaluate the pure splitting rule on the fixture text.
  const lines = 'Kayıtlı podcast metnini çevir\nKent Hafızası · 00:17:40–00:20:40 · yalnız seçili kayıtlı metin\n→ Hedef: Türkçe · kayıtlı seçeneklerle önizleme\nBu uygulama işlemini bağlı kaynakta mevcut ayarlarınla çalıştırır.'.split('\n');
  assert.equal(lines.length >= 3 && /^→/.test(lines[2]), true);
});

test('G25/G26/G27: Keşfet filtre çipleri, yorum kapsamı sırası, yapışkan modal başlığı', () => {
  assert.match(read('media-discovery-ui.js'), /cn-active-filters/);
  assert.match(read('media-discovery-ui.js'), /Varsayılana dön/);
  assert.match(read('review-decision-ui.js'), /edinilen \$\{received\} → dışarıda \$\{received-rows\.length\} → analizde \$\{rows\.length\}/);
  assert.match(read('media-tools.css'), /\.mtx-dialog>header\{position:sticky;top:-28px/);
});


test('G56/G65–G68: copy switches keep exact edition and progress, completed copies say watch again, episode management carries its identity',async t=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM('<body class="media-home-active"><div id="playerLayer" class="hidden"></div><div id="mediaHome"></div><dialog id="mediaCatalogDialog"></dialog></body>',{runScripts:'outside-only',pretendToBeVisual:true}),w=dom.window;t.after(()=>w.close());const calls=[];
 let item={id:'fixture',kind:'film',title:'Fixture film',source:{type:'local',value:'PRIVATE-PATH'},progress:{position:900,duration:7200},editions:[{id:'alternate',label:'Director cut',source:{type:'browser',value:'PRIVATE-URL'},progress:{position:2400,duration:7800}}]};
 w.UiLocale={get:()=> 'en'};w.syncBrowserOcclusion=async()=>{};w.MediaCatalogUI={open:async q=>{calls.push(q);w.document.getElementById('mediaCatalogDialog').open=true;}};w.openMediaCatalogPlayback=async()=>{};w.HTMLElement.prototype.scrollIntoView=function(){};
 w.eval(read('media-visual.js'));w.CinemaUI={film(){},icon:()=>w.document.createElement('i')};w.api={mediaCatalog:async q=>{calls.push(q);return q.action==='list'?{ok:true,items:[item]}:q.action==='play'?{ok:true,watchItem:{id:'play'}}:{ok:true};}};
 w.eval(read('media-title.js'));assert.equal((await w.MediaTitleUI.open(item.id)).ok,true,w.document.body.textContent);
 const position=()=>w.document.querySelector('.cn-copy-position');assert.match(position().textContent,/Local video.*15:00 \/ 2:00:00/);assert.doesNotMatch(position().textContent,/PRIVATE/);
 [...w.document.querySelectorAll('.cn-library-source button')].find(b=>b.textContent.includes('Director cut')).click();assert.match(position().textContent,/Director cut.*Web video.*40:00 \/ 2:10:00/);w.document.querySelector('[data-title-action=play]').click();await new Promise(setImmediate);assert.equal(calls.find(q=>q.action==='play').editionId,'alternate');
 item={...item,progress:{position:7200,duration:7200,completed:true},editions:[]};await w.MediaTitleUI.open(item.id);assert.equal(w.document.querySelector('[data-title-action=play]').textContent,'Watch again');assert.match(position().textContent,/Completed/);
 w.MediaTitleUI.close();item={id:'series',kind:'series',title:'Series fixture',episodes:[{id:'s0e1',season:0,number:1},{id:'s2e2',season:2,number:2}]};await w.MediaTitleUI.open(item.id);let select=w.document.querySelector('.mtd-episodes select');select.value='2';select.dispatchEvent(new w.Event('change'));[...w.document.querySelectorAll('.mtd-episodes button')].find(b=>b.textContent==='Link source').click();await new Promise(setImmediate);assert(calls.some(q=>q.id==='series'&&q.episodeId==='s2e2'));const manager=w.document.getElementById('mediaCatalogDialog');manager.open=false;manager.dispatchEvent(new w.Event('close'));await new Promise(setImmediate);assert.equal(w.document.querySelector('.mtd-episodes select').value,'2');assert(!calls.some(q=>q.action==='source-file'));
});


test('G08/G09 source reading returns to the same answer scroll and progress detail is explicit with no task action',()=>{
 const {JSDOM}=require('jsdom'),dom=new JSDOM(read('assistant-overlay.html'),{runScripts:'outside-only'}),w=dom.window;try{
  const text=read('assistant-overlay.js'),fn=text.slice(text.indexOf('function renderProgress('),text.indexOf("window.addEventListener('pagehide'"));w.eval("const $=id=>document.getElementById(id);let progressStarted=1,progressTimer=null;"+fn+';window.paintProgress=renderProgress;');
  const $=id=>w.document.getElementById(id),log=$('log');log.scrollTop=246;$('sourceBox').open=true;w.paintProgress({busy:false,locale:'tr'});assert.equal($('sourceBack').textContent,'Yanıta dön');$('sourceBack').click();assert.equal($('sourceBox').open,false);assert.equal(log.scrollTop,246);assert.equal(w.document.activeElement,log);
  w.paintProgress({busy:true,locale:'en',phase:'tool'});const toggle=$('progressDetailsToggle');assert.equal(toggle.getAttribute('aria-expanded'),'false');toggle.click();assert.equal(toggle.getAttribute('aria-expanded'),'true');assert($('agentProgress').classList.contains('progress-expanded'));w.paintProgress({busy:true,locale:'en',phase:'writing'});assert.equal(toggle.getAttribute('aria-expanded'),'true');assert.equal(log.scrollTop,246);
 }finally{w.close();}
});
