#!/usr/bin/env node
// Podcast ve Çift dilli Sahne kompozisyonları: gerçek renderer HTML/CSS/JS'si, kontrollü shelf kaynağıyla Chromium'da.
//   node tests/chromium-sahne.smoke.mjs [--shots <klasör>] [--tag <ad>] [--only a,b] [--root <klasör>] [--browser <yol>]
// Mock; gerçek Electron, canlı sağlayıcı, native video veya ses kanıtı değildir.
import path from 'node:path';
import { launch, stageRenderer, ROOT, sleep } from './support/chromium-fixture.mjs';
const args = process.argv.slice(2), option = (n, d = '') => { const i = args.indexOf(n); return i >= 0 && args[i + 1] ? args[i + 1] : d; };
const ROOT_DIR = option('--root', ROOT), SHOTS = option('--shots'), TAG = option('--tag', 'run'), ONLY = option('--only').split(',').filter(Boolean), BROWSER = option('--browser');
const results = [], check = (name, ok, detail = '') => { results.push({ ok: !!ok }); console.log(`${ok ? '  ✓' : '  ✗'} ${name}${ok ? '' : ' — ' + detail}`); };
const staged = stageRenderer([path.join(ROOT, 'tests/support/discover-fixture-stub.js'), path.join(ROOT, 'tests/support/dub-panel-fixture-stub.js')], { rootDir: ROOT_DIR });
const browser = await launch({ browser: BROWSER, width: 1440, height: 900 });
const open = async (mode, variant) => {
  await browser.goto(staged.url); await sleep(1500);
  await browser.until(`window.__dub&&window.CinemaSahne`, 'sahne');
  const r = await browser.evaluate(`window.__fx.setLocale('tr');applyUiTheme('dark');window.__dub.sahne('${mode}','${variant}')`); await sleep(1200); return r;
};
const geometry = () => browser.evaluate(`(()=>{const q=s=>document.querySelector(s),r=el=>{if(!el)return null;const b=el.getBoundingClientRect();return {x:Math.round(b.x),y:Math.round(b.y),w:Math.round(b.width),h:Math.round(b.height)}};
 const cards=[...document.querySelectorAll('.sh-cards [data-i]')],vis=cards.filter(c=>c.getClientRects().length);
 return {mounted:!!q('.sh'),mode:q('.sh')?.dataset.mode||'',main:r(q('.sh-main')),media:r(q('.sh-theater')),panel:r(q('.sh-cardsbox')),cover:r(q('.sh-cover')),title:q('.sh-title')?.textContent||'',cards:cards.length,visibleCards:vis.length,
  blank:vis.filter(c=>!c.textContent.replace(/\\d+:\\d{2}/,'').trim()).length,docScrollX:document.documentElement.scrollWidth>document.documentElement.clientWidth,active:q('.sh-cards .on, .sh-cards [aria-current]')?.textContent.slice(0,60)||''}})()`);
const shot = async name => { if (SHOTS) await browser.screenshot(path.join(SHOTS, `${TAG}-${name}.png`)); };
const cases = [['podcast', 'both', 'podcast-both'], ['study', 'both', 'study-both'], ['podcast', 'single', 'podcast-single'], ['study', 'single', 'study-single'], ['podcast', 'untimed', 'podcast-untimed']];
for (const [mode, variant, name] of cases) {
  if (ONLY.length && !ONLY.includes(name)) continue; console.log(`\n[${name}]`);
  try {
    const r = await open(mode, variant); const g = await geometry(); await shot(name); console.log('  bilgi:', JSON.stringify(g));
    check(`${name}: Sahne açıldı`, r?.ok && g.mounted, JSON.stringify({ r, g }));
    check(`${name}: görünen metin satırı var ve hiçbiri boş değil, sayfa yatay taşmıyor`, g.visibleCards > 0 && g.blank === 0 && !g.docScrollX, JSON.stringify(g));
  } catch (error) { check(name + ' çalıştı', false, error.message); }
}
const errors = await browser.evaluate(`window.__fxErrors||[]`).catch(() => []);
check('sayfa hatası yok', errors.length === 0, JSON.stringify(errors).slice(0, 300));
await browser.close?.(); staged.cleanup();
const failed = results.filter(r => !r.ok).length; console.log(`\n${results.length - failed}/${results.length} kontrol geçti`); process.exit(failed ? 1 : 0);
