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
};
for (const [name, run] of Object.entries(scenarios)) { if (ONLY.length && !ONLY.includes(name)) continue; console.log(`\n[${name}]`); try { const s = await run(); console.log('  bilgi:', JSON.stringify(s)); } catch (error) { check(name + ' çalıştı', false, error.message); } }
const errors = await browser.evaluate(`window.__fxErrors||[]`).catch(() => []);
check('sayfa hatası yok', errors.length === 0, JSON.stringify(errors).slice(0, 300));
await browser.close?.(); staged.cleanup();
const failed = results.filter(r => !r.ok).length; console.log(`\n${results.length - failed}/${results.length} kontrol geçti`); process.exit(failed ? 1 : 0);
