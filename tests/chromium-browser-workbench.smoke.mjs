// Browser çalışma tezgâhı hedefli Chromium kabulü (kontrollü fixture): araç çubuğu etiket kademeleri ve taşma,
// Whisper boş-durum/menü senkronu (bayat devre dışı düğme hatası), menü nedeni, Escape + odak dönüşü,
// hub'dan "Sayfayı çevir" vekili ve sayfa çevirisi menüsünde duraklat/otomatik devam görünürlüğü.
// Mock gerçek Electron, canlı sağlayıcı, Whisper/GPU veya medya kabulü değildir; yalnız renderer yerleşimi ve mantığıdır.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, stageRenderer, ROOT, sleep } from './support/chromium-fixture.mjs';
const staged = stageRenderer([path.join(ROOT, 'tests/support/discover-fixture-stub.js'), path.join(ROOT, 'tests/support/browser-workbench-fixture-stub.js')]);
const shotsAt = process.argv.indexOf('--shots'); const shots = shotsAt >= 0 ? process.argv[shotsAt + 1] : '';
const browser = await launch({ width: 1920, height: 1080 });
const seeWhisper = `(()=>{const m=document.querySelector('#cueList [data-empty-action="make"]'),s=document.querySelector('#cueList [data-empty-action="source"]'),n=document.querySelector('#cueList [data-empty-reason]'),l=document.querySelector('#cueList [data-empty-action="live"]');
  return {make:m?m.disabled:null,source:s?s.disabled:null,reason:n&&!n.hidden?n.textContent:'',live:l?!l.hidden:null,button:document.getElementById('makeSubsBtn').disabled,menu:document.getElementById('browserWhisperSubtitlesMenu').disabled,menuReason:document.getElementById('browserWhisperSubtitlesMenu').dataset.reason||''}})()`;
// Closed details can retain layout rectangles while their content is not painted.
const toolbar = `(()=>{const vis=e=>e&&e.checkVisibility({checkVisibilityCSS:true})&&e.getClientRects().length;const bar=document.querySelector('.browser-toolbar'),ws=document.getElementById('browserWorkspace');const br=bar.getBoundingClientRect();
  const lab=id=>{const e=document.querySelector(id);return !!e&&vis(e)&&getComputedStyle(e).display!=='none'};
  const acts=[...document.querySelectorAll('.browser-toolbar-actions > .tb-group')].filter(vis);const last=acts.length?Math.max(...acts.map(g=>g.getBoundingClientRect().right)):0;
  const addr=document.querySelector('.browser-address-wrap').getBoundingClientRect();
  const clipped=[...bar.querySelectorAll('.browser-toolbar-actions button, .browser-toolbar-actions summary')].filter(vis).filter(e=>{const r=e.getBoundingClientRect();return r.right>br.right+1||r.left<br.left-1});
  return {container:Math.round(ws.getBoundingClientRect().width),barRight:Math.round(br.right),actionsRight:Math.round(last),addressWidth:Math.round(addr.width),wrapped:bar.scrollHeight>bar.clientHeight+2,clipped:clipped.map(e=>e.id||e.className).slice(0,4),
    hubLabel:lab('#browserSubtitleLabel'),assistantLabel:lab('#browserAssistantOpen > span'),settingsLabel:lab('#browserSettingsQuick > span')}})()`;
try {
  await browser.goto(staged.url); await sleep(1500);
  await browser.until('typeof openPlayer==="function"&&typeof setWorkspaceMode==="function"', 'renderer');
  await browser.evaluate(`(async()=>{window.__fx.setLocale('en');openPlayer();await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));setWorkspaceMode('browser',false);})()`);
  await sleep(900);
  await browser.evaluate(`(()=>{player.browserMediaSeen=true;player.browserPageUrl='https://workbench.test/watch';updateBrowserNavigation({tabId:player.browserActiveTabId,generation:1,url:'https://workbench.test/watch',title:'Offline video fixture',loading:false});updateBrowserSubtitleSummary();updateBrowserSignalQuiet();renderCueList('');updateBrowserWhisperActions();})()`);
  await sleep(400);

  // 1) Whisper uygun değil: düğmeler pasif, gerçek neden ve sonraki adım görünür, menü nedeni genel metin değil.
  const blocked = await browser.evaluate(seeWhisper);
  assert.equal(blocked.make, true, JSON.stringify(blocked)); assert.ok([true, null].includes(blocked.source), 'Yalnız altyazı düğmesi yalnız çeviri hazırken çizilir: ' + JSON.stringify(blocked));
  assert.match(blocked.reason, /YouTube/, JSON.stringify(blocked)); assert.match(blocked.menuReason, /YouTube/, JSON.stringify(blocked)); assert.ok(blocked.menuReason.length < 80, 'menü nedeni kısa kalmalı (menüyü şişirmemeli): ' + blocked.menuReason);
  await browser.click(`document.querySelector('#browserSubtitleSettingsToggle')`); await sleep(300);
  const hubGeometry=await browser.evaluate(`(()=>{const e=document.querySelector('.browser-hub-popover'),r=e.getBoundingClientRect();return {width:r.width,x:r.x,right:r.right,overflow:e.scrollWidth>e.clientWidth+1}})()`);
  assert.ok(hubGeometry.width>=360&&hubGeometry.x>=0&&hubGeometry.right<=1920&&!hubGeometry.overflow,'hub must use its readable desktop width: '+JSON.stringify(hubGeometry));
  const reasonText = await browser.evaluate(`document.querySelector('#browserWhisperSubtitlesMenu .sy-reason')?.textContent||''`);
  assert.match(reasonText, /YouTube/, 'menüde genel neden yerine gerçek neden olmalı: ' + reasonText);
  assert.doesNotMatch(reasonText, /^Not available for this source/, reasonText);

  // 2) Önceki hata: URL YouTube olunca menü açılıyor ama boş durum düğmesi pasif kalıyordu.
  await browser.evaluate(`(()=>{player.browserPageUrl='https://www.youtube.com/watch?v=abcdefghijk';updateBrowserWhisperActions();})()`);
  const ready = await browser.evaluate(seeWhisper);
  assert.equal(ready.button, false); assert.equal(ready.menu, false);
  assert.equal(ready.make, false, 'boş durum Whisper düğmesi bayat kaldı: ' + JSON.stringify(ready)); assert.ok([false, null].includes(ready.source)); assert.equal(ready.reason, '');
  // 3) İş sürerken tersi: düğme etkin kalıp tıklamayı sessizce yutmamalı.
  await browser.evaluate(`(()=>{state.running=true;updateBrowserWhisperActions();})()`);
  const busy = await browser.evaluate(seeWhisper);
  assert.equal(busy.make, true, JSON.stringify(busy)); assert.match(busy.reason, /another subtitle job/i, JSON.stringify(busy)); assert.equal(busy.live, false);
  await browser.evaluate(`(()=>{state.running=false;player.browserPageUrl='https://workbench.test/watch';updateBrowserWhisperActions();})()`);

  // 4) Hub: "Sayfayı çevir" vekili mevcut düğmeyi çalıştırır (ikinci servis yolu yok); Escape kapatır ve odak summary'ye döner.
  await browser.evaluate(`window.__pt=0;document.getElementById('browserPageTranslate').addEventListener('click',()=>{window.__pt++},{once:true});document.getElementById('browserPageTranslate').disabled=false`);
  await browser.evaluate(`document.getElementById('browserSubtitleSettingsToggle').closest('details').open=true`); await sleep(200);
  await browser.click(`document.querySelector('#browserTranslateMenu [data-browser-proxy="browserPageTranslate"]')`); await sleep(250);
  assert.equal(await browser.evaluate('window.__pt'), 1, 'hub vekili Sayfayı çevir düğmesini çalıştırmadı');
  assert.equal(await browser.evaluate(`document.getElementById('browserTranslateMenu').open`), false, 'vekil seçimi hub menüsünü kapatmalı');
  await browser.click(`document.querySelector('#browserSubtitleSettingsToggle')`); await sleep(250);
  await browser.key('Escape'); await sleep(250);
  const esc = await browser.evaluate(`({open:document.getElementById('browserTranslateMenu').open,focus:document.activeElement?.id})`);
  assert.deepEqual(esc, { open: false, focus: 'browserSubtitleSettingsToggle' });

  // 5) Sayfa çevirisi menüsü: boştayken duraklat/otomatik devam görünmez; iş sürerken görünür.
  const pageIdle = await browser.evaluate(`(()=>{player.browserPageTranslateBusy=false;player.browserPagePaused=false;player.browserPageTranslated=0;renderBrowserPageReport({});return {pause:document.getElementById('browserPagePause').hidden,auto:document.getElementById('browserPageAutoContinue').hidden}})()`);
  assert.deepEqual(pageIdle, { pause: true, auto: true });
  const pageBusy = await browser.evaluate(`(()=>{player.browserPageTranslateBusy=true;renderBrowserPageReport({});return {pause:document.getElementById('browserPagePause').hidden,auto:document.getElementById('browserPageAutoContinue').hidden}})()`);
  assert.deepEqual(pageBusy, { pause: false, auto: false });
  await browser.evaluate(`(()=>{player.browserPageTranslateBusy=false;renderBrowserPageReport({});})()`);

  // 5b) Hub iş satırı: çalışan iş adı + yüzde, bitince "hazır", hata olunca "başarısız"; boşta gizli. Vekil Görev merkezini açar.
  const jobLine = () => browser.evaluate(`(()=>{const l=document.getElementById('browserHubJob'),o=document.getElementById('browserHubJobOpen');return {hidden:l.hidden,text:l.textContent,state:l.dataset.state,openHidden:o.hidden,proxyTarget:!!document.getElementById(o.dataset.browserProxy)}})()`);
  assert.equal((await jobLine()).hidden, true, 'boşta iş satırı gizli olmalı');
  await browser.evaluate(`renderBrowserJobsDock([{id:'hub-j1',label:'Whisper altyazı',state:'running',percent:40}])`);
  let job = await jobLine(); assert.equal(job.hidden, false); assert.match(job.text, /Creating subtitles · 40% — Whisper altyazı/, JSON.stringify(job)); assert.equal(job.openHidden, false); assert.equal(job.proxyTarget, true);
  // Uygulamanın hareket tercihi, OS tam harekete izin verse bile iş noktası animasyonunu durdurur.
  await browser.send('Emulation.setEmulatedMedia', { features: [{ name: 'prefers-reduced-motion', value: 'no-preference' }] });
  const jobMotion = await browser.evaluate(`(()=>{const html=document.documentElement,previous=html.getAttribute('data-motion'),line=document.getElementById('browserHubJob'),names={};
    try{for(const value of ['on','off','reduce']){html.dataset.motion=value;names[value]=getComputedStyle(line,'::before').animationName;}}
    finally{if(previous===null)html.removeAttribute('data-motion');else html.setAttribute('data-motion',previous);}return names;})()`);
  await browser.send('Emulation.setEmulatedMedia', { features: [] });
  assert.equal(jobMotion.on, 'hubjob-pulse', JSON.stringify(jobMotion));
  assert.equal(jobMotion.off, 'none', JSON.stringify(jobMotion));
  assert.equal(jobMotion.reduce, 'none', JSON.stringify(jobMotion));
  if (shots) { await browser.click(`document.querySelector('#browserSubtitleSettingsToggle')`); await sleep(350); await browser.screenshot(path.join(shots, 'browser-workbench-hub-job.png')); await browser.key('Escape'); await sleep(200);
    // Gerçek görev merkezi yenilemesi sentetik satırı sildi; geçişi görebilmesi için çalışan satırı yeniden çiz.
    await browser.evaluate(`renderBrowserJobsDock([{id:'hub-j1',label:'Whisper altyazı',state:'running',percent:40}])`); }
  await browser.evaluate(`renderBrowserJobsDock([{id:'hub-j1',label:'Whisper altyazı',state:'running',percent:40}]);renderBrowserJobsDock([{id:'hub-j1',label:'Whisper altyazı',state:'done'}])`);
  job = await jobLine(); assert.equal(job.state, 'done'); assert.match(job.text, /Subtitles ready — Whisper altyazı/, JSON.stringify(job));
  await browser.evaluate(`renderBrowserJobsDock([{id:'hub-j2',label:'Dublaj',state:'running',percent:10}]);renderBrowserJobsDock([{id:'hub-j2',label:'Dublaj',state:'failed'}])`);
  job = await jobLine(); assert.equal(job.state, 'error'); assert.match(job.text, /Dub failed — Dublaj/, JSON.stringify(job));
  await browser.evaluate(`renderBrowserJobsDock([])`);

  // 6) Araç çubuğu kademeleri: etiketler genişliğe göre iner, adres alanı ezilmez, hiçbir kontrol çubuğun dışına taşmaz.
  const tiers = {};
  for (const [w, h] of [[1920, 1080], [1700, 1000], [1500, 900], [1366, 768], [1100, 800]]) {
    await browser.viewport(w, h); await sleep(450);
    const m = await browser.evaluate(toolbar); tiers[w] = m;
    assert.deepEqual(m.clipped, [], `${w}px: kontrol çubuğun dışına taştı ${JSON.stringify(m)}`);
    assert.ok(m.actionsRight <= m.barRight + 1, `${w}px: araç grupları taştı ${JSON.stringify(m)}`);
    assert.ok(m.addressWidth >= 220, `${w}px: adres alanı ezildi ${JSON.stringify(m)}`);
    if (m.container >= 1400) assert.ok(m.assistantLabel && m.settingsLabel, `${w}px: Asistan/Ayarlar etiketi görünmeli ${JSON.stringify(m)}`);
    if (m.container >= 1260) assert.ok(m.hubLabel, `${w}px: Çeviri ve dublaj etiketi görünmeli ${JSON.stringify(m)}`);
    if (shots && (w === 1920 || w === 1100)) await browser.screenshot(path.join(shots, `browser-workbench-${w}.png`));
  }
  // 7) Dar pencerede erişim: Asistan, Ayarlar, Çeviri ve dublaj, ⋯ menüsü ve adres alanı görünür ve ekran içinde kalır.
  for (const w of [900, 640]) {
    await browser.viewport(w, 800); await sleep(600);
    const access = await browser.evaluate(`(()=>{const out={};for(const [k,s] of Object.entries({assistant:'#browserAssistantOpen',settings:'#browserSettingsQuick',hub:'#browserSubtitleSettingsToggle',more:'#browserMoreMenu > summary',address:'#browserAddress'})){const e=document.querySelector(s);const r=e?.getClientRects().length?e.getBoundingClientRect():null;out[k]=!!r&&r.left>=-1&&r.right<=innerWidth+1&&r.width>0}return out})()`);
    assert.deepEqual(Object.values(access).every(Boolean), true, `${w}px: kontrol erişilemiyor ${JSON.stringify(access)}`);
  }
  await browser.viewport(1920, 1080); await sleep(400);
  if (shots) {
    await browser.click(`document.querySelector('#browserSubtitleSettingsToggle')`); await sleep(350); await browser.screenshot(path.join(shots, 'browser-workbench-hub.png')); await browser.key('Escape');
    await browser.evaluate(`window.__fx.setLocale('tr')`); await sleep(500); await browser.screenshot(path.join(shots, 'browser-workbench-tr.png'));
  }
  const errors = [...browser.pageErrors, ...(await browser.evaluate('window.__fxErrors||[]'))];
  assert.deepEqual(errors, [], 'renderer hata verdi');
  console.log('Browser workbench: Whisper senkronu, menü nedeni, Escape/odak, vekil, sayfa menüsü ve araç çubuğu kademeleri geçti');
  console.log(JSON.stringify(tiers));
} finally { await browser.close(); staged.cleanup(); }
