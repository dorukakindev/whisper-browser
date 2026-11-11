#!/usr/bin/env node
// Stremio kaynak seçici ve oynatıcı Whisper sonraki adımı: gerçek renderer, kontrollü Stremio yanıtları, başsız Chromium.
//   node tests/chromium-stremio-sources.smoke.mjs [--shots <klasör>] [--browser <yol>]
// Mock; gerçek eklenti/debrid/Electron/mpv/GPU kabulü değildir.
import path from 'node:path';
import { launch, stageRenderer, ROOT, sleep } from './support/chromium-fixture.mjs';
const args = process.argv.slice(2), option = (n, f = '') => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : f; };
const SHOTS = option('--shots'), results = [];
const check = (name, ok, detail = '') => { results.push({ name, ok: !!ok }); console.log(`  ${ok ? '✓' : '✗'} ${name}${ok ? '' : ' — ' + detail}`); };
const staged = stageRenderer([path.join(ROOT, 'tests/support/discover-fixture-stub.js'), path.join(ROOT, 'tests/support/stremio-sources-fixture-stub.js')]);
const browser = await launch({ browser: option('--browser'), width: 1920, height: 1080 });
const ctx = `{type:'movie',id:'tt7000001',name:'Night Train',poster:'',season:null,episode:null,episodeTitle:'',next:null}`;
const geometry = sel => browser.evaluate(`(()=>{const d=document.querySelector('${sel}');if(!d)return null;const r=d.getBoundingClientRect(),b=d.querySelector('.sx-body')||d;
  const btns=[...d.querySelectorAll('.sx-stream>button')].map(x=>x.getBoundingClientRect().width);const clipped=[...d.querySelectorAll('button,select,input')].filter(x=>x.getClientRects().length&&(x.scrollWidth>x.clientWidth+2)).length;
  return {top:r.top,left:r.left,right:r.right,bottom:r.bottom,vw:innerWidth,vh:innerHeight,hOverflow:b.scrollWidth-b.clientWidth,minBtn:Math.min(...btns,999),clipped,docOverflow:document.documentElement.scrollWidth-innerWidth};})()`);
const fresh = async (w, h, locale = 'tr', theme = 'dark') => {
  await browser.viewport(w, h); await browser.goto(staged.url); await sleep(1600);
  await browser.until(`window.__fx&&window.StremioUI&&window.__sx`, 'renderer'); await browser.evaluate(`window.__fx.setLocale('${locale}');applyUiTheme('${theme}');true`);
};
try {
  for (const [w, h, tag] of [[1920, 1080, 'wide'], [900, 900, 'narrow']]) {
    await fresh(w, h);
    await browser.evaluate(`window.StremioUI.openStreams(${ctx});true`);
    await browser.until(`document.querySelector('.sx-streams .sx-source-summary')`, 'picker ' + tag); await sleep(400);
    const g = await geometry('.sx-streams');
    check(`${tag}: picker inside viewport`, g && g.top >= 0 && g.left >= 0 && g.right <= g.vw + 1 && g.bottom <= g.vh + 1, JSON.stringify(g));
    check(`${tag}: no horizontal overflow`, g && g.hOverflow <= 1 && g.docOverflow <= 1, JSON.stringify(g));
    check(`${tag}: play buttons not squashed`, g && g.minBtn >= 64, JSON.stringify(g));
    check(`${tag}: no clipped controls`, g && g.clipped === 0, JSON.stringify(g));
    const text = await browser.evaluate(`document.querySelector('.sx-streams').textContent`);
    check(`${tag}: summary explains playability`, /4 oynatılabilir · 3 doğrudan\/debrid · 1 ham torrent · 2 Whisper uygun · 1 burada oynatılamaz/.test(text), text.slice(0, 300));
    check(`${tag}: failing addon localized`, /Slow addon: zamanında yanıt vermedi/.test(text) && !/raw/.test(text), '');
    if (SHOTS) await browser.screenshot(path.join(SHOTS, `stremio-sources-${tag}.png`));
    // keyboard: Tab moves into the picker and focus stays inside the modal
    await browser.key('Tab'); await browser.key('Tab');
    check(`${tag}: focus stays in picker`, await browser.evaluate(`!!document.activeElement?.closest('.sx-streams')`));
    await browser.key('Escape'); await sleep(200);
    check(`${tag}: Escape closes picker`, await browser.evaluate(`!document.querySelector('.sx-streams')`));
  }
  // All addons failed: explicit reason and retry.
  await fresh(1920, 1080, 'tr', 'light'); await browser.evaluate(`window.__sx.mode='failed';window.StremioUI.openStreams(${ctx});true`);
  await browser.until(`document.querySelector('.sx-streams .sx-retry')`, 'failed state');
  const failedText = await browser.evaluate(`document.querySelector('.sx-streams').textContent`);
  check('failed: DNS/private reason shown', /Torrentio: adresi genel bir adres olarak doğrulanamadı \(DNS/.test(failedText), failedText.slice(0, 300));
  if (SHOTS) await browser.screenshot(path.join(SHOTS, 'stremio-sources-failed.png'));
  const before = await browser.evaluate(`window.__sx.calls.filter(a=>a==='streams').length`);
  await browser.click(`document.querySelector('.sx-streams .sx-retry')`); await sleep(400);
  check('failed: retry asks again', (await browser.evaluate(`window.__sx.calls.filter(a=>a==='streams').length`)) === before + 1);
  await browser.evaluate(`document.querySelector('.sx-streams')?.close();window.__sx.mode='mixed';true`);
  // Adaptive source in the player: AI tab explains and offers Whisper-ready sources.
  await browser.evaluate(`window.StremioUI.openStreams(${ctx});true`); await browser.until(`document.querySelector('.sx-streams .sx-stream')`, 'picker');
  await browser.click(`[...document.querySelectorAll('.sx-streams .sx-stream')].find(r=>/adaptive/.test(r.textContent))?.querySelector('button')`);
  await browser.until(`window.StremioUI.whisperStatus()?.kind==='adaptive'`, 'adaptive session');
  const reason = await browser.evaluate(`document.getElementById('playerTranscriptionAvailability')?.textContent||''`);
  check('player: Whisper notice names HLS/DASH', /HLS\/DASH/.test(reason), reason);
  await browser.evaluate(`window.StremioUI.togglePanel('ai');true`); await browser.until(`document.querySelector('.sx-whisper-next')`, 'ai tab'); await sleep(300);
  if (SHOTS) await browser.screenshot(path.join(SHOTS, 'stremio-player-whisper.png'));
  // Readability in the panel for both themes: selected tab and the Whisper notice contrast.
  for (const theme of ['light', 'dark']) {
    await browser.evaluate(`applyUiTheme('${theme}');true`); await sleep(150);
    const ratio = await browser.evaluate(`(()=>{const lum=c=>{const m=c.match(/[\\d.]+/g).map(Number);const unit=/^color\\(srgb/.test(c)?1:255;const [r,g,b]=m.slice(0,3).map(v=>{v/=unit;return v<=.03928?v/12.92:((v+.055)/1.055)**2.4});return .2126*r+.7152*g+.0722*b};
      const bgOf=e=>{for(let n=e;n;n=n.parentElement){const c=getComputedStyle(n).backgroundColor;const a=(c.match(/[\\d.]+/g)||[]).map(Number);if(a.length>=3&&(a[3]===undefined||a[3]>.5))return c;}return 'rgb(0,0,0)';};
      const cr=e=>{const f=lum(getComputedStyle(e).color),b=lum(bgOf(e));return (Math.max(f,b)+.05)/(Math.min(f,b)+.05)};
      return {tab:cr(document.querySelector('.sx-tab[aria-selected=true]')),hint:cr(document.querySelector('.sx-whisper-blocked'))};})()`);
    check(`player panel ${theme}: readable tab/notice (≥4.5)`, ratio.tab >= 4.5 && ratio.hint >= 4.5, JSON.stringify(ratio));
    if (SHOTS) await browser.screenshot(path.join(SHOTS, `stremio-player-whisper-${theme}.png`));
  }
  await browser.click(`document.querySelector('.sx-whisper-next')`); await browser.until(`document.querySelector('.sx-player-panel .sx-stream')`, 'whisper-ready list');
  const shown = await browser.evaluate(`[...document.querySelectorAll('.sx-player-panel .sx-stream')].map(r=>r.querySelector('.sx-whisper-ok')?1:0)`);
  check('player: Whisper-ready filter shows only ready sources', shown.length === 2 && shown.every(Boolean), JSON.stringify(shown));
  const pg = await geometry('.sx-player-panel'); check('player: panel inside viewport', pg && pg.right <= pg.vw + 1 && pg.bottom <= pg.vh + 1 && pg.hOverflow <= 1, JSON.stringify(pg));
  if (SHOTS) await browser.screenshot(path.join(SHOTS, 'stremio-player-whisper-sources.png'));
  const errors = browser.pageErrors.filter(e => !/net::|Failed to load resource|ERR_|MEDIA_ERR|NotSupportedError|no supported source/i.test(e));
  check('no page errors', errors.length === 0, errors.slice(0, 3).join(' | '));
} catch (error) { check('scenario completed', false, error.message); }
finally { await browser.close(); staged.cleanup(); }
const failed = results.filter(r => !r.ok).length; console.log(`chromium-stremio-sources: ${results.length - failed}/${results.length}`); process.exit(failed ? 1 : 0);
