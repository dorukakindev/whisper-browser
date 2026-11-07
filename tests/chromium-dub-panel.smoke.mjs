#!/usr/bin/env node
// Ortak dublaj paneli, Podcast durumları: gerçek renderer HTML/CSS/JS'si kontrollü servis yanıtlarıyla Chromium'da.
//   node tests/chromium-dub-panel.smoke.mjs [--shots <klasör>] [--tag <ad>] [--only a,b] [--browser <yol>]
// Mock; gerçek Electron, canlı sağlayıcı, ses üretimi veya mpv kanıtı değildir.
import path from 'node:path';
import { launch, stageRenderer, ROOT, sleep } from './support/chromium-fixture.mjs';
const args = process.argv.slice(2), option = (n, d = '') => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const ROOT_DIR = option('--root', ROOT), SHOTS = option('--shots'), TAG = option('--tag', 'run'), ONLY = option('--only').split(',').filter(Boolean), BROWSER = option('--browser');
const results = [], check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok ? '' : ' — ' + detail}`); };
const staged = stageRenderer([path.join(ROOT, 'tests/support/discover-fixture-stub.js'), path.join(ROOT, 'tests/support/dub-panel-fixture-stub.js')], { rootDir: ROOT_DIR });
const browser = await launch({ browser: BROWSER, width: 1440, height: 900 });
const open = async name => {
  await browser.goto(staged.url); await sleep(1500);
  await browser.until(`window.__dub&&typeof DubGeneratorUI==='object'`, 'dub stub');
  await browser.evaluate(`window.__fx.setLocale('tr');applyUiTheme('dark');window.__dub.reset('${name}');DubGeneratorUI.prepareCurrent();true`); await sleep(1100);
};
const snapshot = () => browser.evaluate(`(()=>{const q=id=>document.getElementById(id),d=q('dubGeneratorDialog'),r=d.getBoundingClientRect(),box=q('dubPodcastSource'),sel=q('dubPodcastTrack');
 const vis=el=>!!el&&!el.hidden&&el.getClientRects().length>0;
 return {open:d.open,srt:q('dubSrtName').textContent,box:vis(box),options:[...sel.options].map(o=>o.textContent+(o.disabled?' [x]':'')),meta:q('dubPodcastMeta').textContent,notice:vis(q('dubPodcastNotice'))?q('dubPodcastNotice').textContent:'',action:vis(q('dubPodcastAction'))?q('dubPodcastAction').textContent:'',
  episode:q('dubPodcastEpisode')?.textContent||'',scrollW:d.scrollWidth,clientW:d.clientWidth,dialogH:Math.round(r.height),boxH:box?Math.round(box.getBoundingClientRect().height):0,calls:window.__dub.calls.join(',')}})()`);
const startRun = async () => { await browser.evaluate(`document.getElementById('dubGeneratorStart').click();true`); await sleep(1300); };
const emit = async ev => { await browser.evaluate(`window.__dub.emit(Object.assign({id:window.__dub.started.id},${JSON.stringify(ev)}));true`); await sleep(500); };
const phase = () => browser.evaluate(`(()=>{const q=id=>document.getElementById(id),d=q('dubGeneratorDialog'),pr=q('dubGeneratorProgress'),vis=el=>!!el&&!el.hidden&&!el.classList.contains('hidden')&&el.getClientRects().length>0;
 return {phase:d.dataset.phase,chip:q('dubStateLabel').textContent,reason:q('dubStartRequirement').textContent,next:q('dubStartNext').hidden?'':q('dubStartNext').textContent,startDisabled:q('dubGeneratorStart').disabled,startLabel:q('dubGeneratorStart').textContent,
 cancelDisabled:q('dubGeneratorCancel').disabled,status:q('dubGeneratorStatus').textContent,count:q('dubGeneratorCount').textContent,progress:pr.hasAttribute('value')?pr.value:'indeterminate',started:!!window.__dub.started,
 gate:vis(q('dubGenerationGate')),usePrimary:q('dubGeneratorUse').classList.contains('btn-primary')&&vis(q('dubGeneratorUse')),resultVisible:vis(q('dubPreviewCard')),scrollW:d.scrollWidth,clientW:d.clientWidth}})()`);
const shot = async name => { if (SHOTS) await browser.screenshot(path.join(SHOTS, `${TAG}-${name}.png`)); };
const scenarios = {
  async ready() { await open('ready'); const s = await snapshot(); await shot('ready');
    check('ready: panel açık, çeviri izi seçili ve SRT adı görünür', s.open && s.srt === 'translation-dub-one.srt' && s.options.length === 2, JSON.stringify(s)); return s; },
  async longnames() { await open('longnames'); const s = await snapshot(); await shot('longnames');
    check('longnames: kısmi Whisper aralığı seçicide, yatay taşma yok', /10:00–12:30/.test(s.options.join('|')) && s.scrollW <= s.clientW, JSON.stringify(s)); return s; },
  async untimed() { await open('untimed'); const s = await snapshot(); await shot('untimed');
    check('untimed: açıklama ve gerçek eylem görünür, SRT yok', /zamansız/.test(s.notice) && s.action && s.srt === '—', JSON.stringify(s)); return s; },
  async unverified() { await open('unverified'); const s = await snapshot(); await shot('unverified');
    check('unverified: izler devre dışı, kopyayı aç eylemi görünür', s.options.every(o => /\[x\]/.test(o)) && /kopya/i.test(s.action), JSON.stringify(s)); return s; },
  async failed() { await open('failed'); const s = await snapshot(); await shot('failed');
    check('failed: hata görünür, SRT benimsenmedi', /korunamadı/.test(s.notice) && s.srt === '—', JSON.stringify(s)); return s; },
  async stale() { await open('ready'); await browser.evaluate(`window.__dub.revision='two';document.getElementById('dubGeneratorStart').click();true`); await sleep(900);
    const s = await snapshot(); await shot('stale');
    check('stale: güncel iz yüklendi ve yenilenme bildirimi görünür', s.srt === 'translation-dub-two.srt' && /değişti/.test(s.notice), JSON.stringify(s)); return s; },

  // --- Üretim durumları: gerçek renderer, kontrollü olaylar (canlı sağlayıcı/ses üretimi değildir) ---
  async novoice() { await open('novoice'); const s = await phase(); await shot('novoice');
    check('novoice: hazır değil, neden ve sonraki adım görünür, ana eylem kapalı', s.phase === 'notready' && /referans ses/i.test(s.reason) && /Referans ses seç/.test(s.next) && s.startDisabled, JSON.stringify(s)); return s; },
  async preparing() { await open('ready'); await browser.evaluate(`window.__dub.holdPlan=true;document.getElementById('dubGeneratorStart').click();true`); await sleep(600);
    const s = await phase(); await shot('preparing'); await browser.evaluate(`window.__dub.holdPlan=false;window.__dub.releasePlan&&window.__dub.releasePlan();true`); await sleep(400);
    check('preparing: hazırlanıyor, neden görünür, ana eylem kapalı', s.phase === 'preparing' && /hazırlanıyor/.test(s.reason) && s.startDisabled, JSON.stringify(s)); return s; },
  async review() { await open('partialsrt'); await startRun(); const s = await phase(); await shot('review');
    check('review: onay bekliyor, denetime git eylemi görünür, üretim başlamadı', s.phase === 'review' && /Denetime git/.test(s.next) && !s.started, JSON.stringify(s));
    await browser.evaluate(`const t=document.getElementById('dubPodcastTrack'),o=[...t.options].find(x=>x.value!==t.value&&!x.disabled);t.value=o.value;t.dispatchEvent(new Event('change',{bubbles:true}));true`); await sleep(900);
    const after = await phase(); check('review: iz değişince eski onay kapısı kapanır', after.phase !== 'review' && !after.gate, JSON.stringify(after)); return s; },
  async running() { await open('ready'); await startRun(); const s = await phase(); await shot('running');
    check('running: üretiliyor, ilerleme belirsiz (sahte yüzde yok), Durdur açık, başlat kapalı', s.phase === 'running' && s.progress === 'indeterminate' && !s.cancelDisabled && s.startDisabled && s.started, JSON.stringify(s));
    await emit({ type: 'progress', done: 3, total: 8 }); const p = await phase(); await shot('running-progress');
    check('running: gerçek olaydan 3/8 ve yüzde', p.phase === 'running' && p.count === '3/8' && Math.round(p.progress) === 38, JSON.stringify(p)); return p; },
  async done() { await open('ready'); await startRun(); await emit({ type: 'done', name: 'dub.wav', url: 'data:audio/wav;base64,UklGRgAAAABXQVZF', path: 'C:/Dubs/dub.wav', elapsedSeconds: 83, quality: { groups: [{ key: 'g1', group: 1, status: 'ready' }, { key: 'g2', group: 2, status: 'ready' }] }, timing: { accelerated: 1, clipped: 0 } });
    const s = await phase(); await shot('done');
    check('done: tamamlandı, Sesi kullan ana eylem, yeniden üretme ikincil', s.phase === 'done' && /Baştan üret/.test(s.startLabel) && s.usePrimary && s.resultVisible, JSON.stringify(s)); return s; },
  async partial() { await open('ready'); await startRun(); await emit({ type: 'done', name: 'dub.wav', url: 'data:audio/wav;base64,UklGRgAAAABXQVZF', path: 'C:/Dubs/dub.wav', elapsedSeconds: 61, quality: { groups: [{ key: 'g1', group: 1, status: 'ready' }, { key: 'g2', group: 2, status: 'failed' }, { key: 'g3', group: 3, status: 'review' }] } });
    const s = await phase(); await shot('partial');
    check('partial: kısmi, eksik parçaları tamamla ana eylem, sayılar gerçek sonuçtan', s.phase === 'partial' && /Eksik parçaları tamamla/.test(s.next) && /1 parça üretilemedi/.test(s.reason) && /1 parça inceleme/.test(s.reason), JSON.stringify(s)); return s; },
  async failedrun() { await open('ready'); await startRun(); await emit({ type: 'done', name: 'dub.wav', url: 'data:audio/wav;base64,UklGRgAAAABXQVZF', path: 'C:/Dubs/dub.wav', elapsedSeconds: 40, quality: { groups: [{ key: 'g1', group: 1, status: 'ready' }] } });
    await browser.evaluate(`document.getElementById('dubGeneratorStart').click();true`); await sleep(1200); await emit({ type: 'error', error: 'Engine closed unexpectedly / Motor beklenmedik biçimde kapandı.', elapsedSeconds: 12 });
    const s = await phase(); await shot('failed-keeps-previous');
    check('failedrun: başarısız, önceki geçerli sonuç silinmedi, yeniden dene görünür', s.phase === 'failed' && /Yeniden dene/.test(s.startLabel) && /Önceki sonuç korundu/.test(s.reason) && s.resultVisible, JSON.stringify(s)); return s; },
};
for (const [name, run] of Object.entries(scenarios)) { if (ONLY.length && !ONLY.includes(name)) continue; console.log(`\n[${name}]`); try { const s = await run(); console.log('  bilgi:', JSON.stringify(s)); } catch (error) { check(name + ' çalıştı', false, error.message); } }
const errors = await browser.evaluate(`window.__fxErrors||[]`).catch(() => []);
check('sayfa hatası yok', errors.length === 0, JSON.stringify(errors).slice(0, 300));
await browser.close?.(); staged.cleanup();
const failed = results.filter(r => !r.ok).length; console.log(`\n${results.length - failed}/${results.length} kontrol geçti`); process.exit(failed ? 1 : 0);
