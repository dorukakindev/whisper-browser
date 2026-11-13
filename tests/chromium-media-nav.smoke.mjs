// Üst medya gezinmesi: menüye taşınan sayfalar açıldığında üst çubukta ait oldukları giriş (veya "Daha fazla") etkin görünür.
// Önceki davranış: İçerik ağı/Anime/Manga/Podcast/Zevkim/Stremio/Diziler'de hiçbir üst giriş etkin değildi.
// Kontrollü fixture; gerçek Electron veya canlı sağlayıcı kabulü değildir.
import assert from 'node:assert/strict';
import path from 'node:path';
import { launch, stageRenderer, ROOT, sleep } from './support/chromium-fixture.mjs';
const staged = stageRenderer([path.join(ROOT, 'tests/support/discover-fixture-stub.js')]);
const browser = await launch({ width: 1920, height: 1080 });
const read = `(()=>({page:document.getElementById('mediaHome').dataset.page,top:[...document.querySelectorAll('#mediaHome .mh-nav > button')].filter(n=>n.getAttribute('aria-current')==='page').map(n=>n.dataset.homePage||'more'),
  menu:[...document.querySelectorAll('#mediaHome .mh-menu-nav [data-home-page]')].filter(n=>n.getAttribute('aria-current')==='page').map(n=>n.dataset.homePage)}))()`;
const expected = { recall: 'more', feeds: 'more', radio: 'more', anime: 'watched', manga: 'watched', taste: 'watched', stremio: 'discover', series: 'discover', home: 'home', discover: 'discover', watched: 'watched' };
try {
  await browser.goto(staged.url); await sleep(1800);
  await browser.until('window.__fx&&document.querySelector("[data-home-page=discover]")', 'home'); await sleep(500);
  await browser.evaluate(`window.__fx.setLocale('tr')`);
  for (const [key, owner] of Object.entries(expected)) {
    await browser.evaluate(`(()=>{const direct=document.querySelector('#mediaHome .mh-nav > [data-home-page="${key}"]');if(direct){direct.click();return}document.querySelector('#mediaHome .mh-nav-more').click();document.querySelector('#mediaHome [data-home-page="${key}"]').click()})()`);
    await sleep(450);
    const got = await browser.evaluate(read);
    assert.equal(got.page, key, JSON.stringify(got));
    assert.deepEqual(got.top, [owner], `${key}: üst gezinmede ${owner} etkin olmalı → ${JSON.stringify(got)}`);
  }
  // Yapışkan üst çubuk odaklanan/kaydırılan öğeyi örtmez (WCAG 2.4.11): kaydırma kapsayıcısında scroll-padding-top var.
  await browser.evaluate(`document.querySelector('#mediaHome [data-home-page="discover"]').click()`);
  await browser.until(`document.querySelectorAll('.cn-poster').length>3`, 'Keşfet kartları'); await sleep(400);
  const cover = await browser.evaluate(`(()=>{const h=document.getElementById('mediaHome');h.scrollTop=2000;const t=document.querySelectorAll('.cn-poster')[3];t.scrollIntoView({block:'nearest'});const r=t.getBoundingClientRect(),e=document.elementFromPoint(r.x+r.width/2,r.y+4);return {top:Math.round(r.top),header:Math.round(document.querySelector('.mh-header').getBoundingClientRect().bottom),covered:!!e&&!!e.closest('.mh-header')}})()`);
  assert.equal(cover.covered, false, 'kaydırılan öğe yapışkan üst çubuğun altında kaldı ' + JSON.stringify(cover));
  assert.ok(cover.top >= cover.header, JSON.stringify(cover));
  assert.deepEqual([...browser.pageErrors], [], 'renderer hata verdi');
  console.log('Media nav: ' + Object.keys(expected).length + ' sayfada üst gezinme etkin girişi doğru');
} finally { await browser.close(); staged.cleanup(); }
