'use strict';
const { app, BrowserWindow, session, nativeImage } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const { createMediaCatalogStore } = require('../src/media-catalog-store');
const root = path.resolve(__dirname, '..'), live = process.env.WHISPER_DISCOVERY_LIVE === '1';
const out = path.join(root, '.uiprev', 'media-discovery', `${Date.now()}-${process.pid}-${live ? 'live' : 'fixture'}`);
const profile = path.join(out, 'profile'); fs.mkdirSync(profile, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = profile;
createMediaCatalogStore({ filePath: path.join(profile, 'media-catalog.json') }).upsert({ title: 'Liked seed', kind: 'film', imdbId: 'tt9999999', favorite: true, genres: ['Drama'], ratings: { personal: '4.5' } });
const rgba = Buffer.alloc(120 * 180 * 4);
for (let index = 0; index < rgba.length; index += 4) { rgba[index] = 30 + Math.floor(index / 480) % 100; rgba[index + 1] = 74; rgba[index + 2] = 100; rgba[index + 3] = 255; }
const poster = nativeImage.createFromBitmap(rgba, { width: 120, height: 180 }).toPNG();
const rows = Array.from({ length: 24 }, (_, index) => ({ id: 'tt' + String(1000000 + index), name: `Sentetik Hikâye ${index + 1}`, type: 'movie', poster: `https://images.metahub.space/poster/small/tt${1000000 + index}/img`, background: `https://images.metahub.space/background/small/tt${1000000 + index}/img`, releaseInfo: String(2026 - index % 8), imdbRating: (7 + index % 3 / 10).toFixed(1), genres: ['Drama'], description: 'Bu yapım yalnız arayüz ve akış doğrulaması için oluşturulmuş sentetik test verisidir.', runtime: '110 min', cast: ['Örnek Oyuncu'] }));
if (!live) {
  const original = global.fetch;
  global.fetch = async (url, options) => {
    const value = String(url);
    if (value.startsWith('https://images.metahub.space/')) return new Response(poster, { headers: { 'content-type': 'image/png' } });
    if (!value.startsWith('https://v3-cinemeta.strem.io/')) return original(url, options);
    const kind = value.includes('/series/') ? 'series' : 'movie';
    if (value.includes('/meta/')) { const id = /\/(tt\d+)\.json/.exec(value)?.[1]; return new Response(JSON.stringify({ meta: { ...rows.find(row => row.id === id), type: kind } })); }
    const search = /search=([^&/]+)/.exec(value)?.[1], skip = Number(/skip=(\d+)/.exec(value)?.[1] || 0), year = value.includes('/year/') ? /genre=(\d{4})/.exec(value)?.[1] : '';
    if (search === 'error') return new Response('temporary', { status: 503 });
    return new Response(JSON.stringify({ metas: rows.filter(row => (!search || row.name.includes(decodeURIComponent(search).replace(/\+/g, ' '))) && (!year || row.releaseInfo === year)).slice(skip, skip + 24).map(row => ({ ...row, type: kind })) }));
  };
}
app.setAppPath(root); app.commandLine.appendSwitch('disable-gpu'); app.commandLine.appendSwitch('disable-backgrounding-occluded-windows'); app.commandLine.appendSwitch('disable-renderer-backgrounding');
require('../src/main.js');
const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
async function until(fn, label, timeout = 25000) { const deadline = Date.now() + timeout; while (Date.now() < deadline) { if (await fn()) return; await wait(100); } throw Error(`Timed out: ${label}`); }
app.whenReady().then(async () => {
  if (!live) session.defaultSession.protocol.handle('https', request => new URL(request.url).hostname === 'images.metahub.space' ? new Response(poster, { headers: { 'content-type': 'image/png' } }) : Response.error());
  let win; await until(() => { win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('index.html') && !w.webContents.isLoading()); return win; }, 'main');
  win.webContents.setBackgroundThrottling(false); win.showInactive(); win.setContentSize(1920, 1080);
  const run = code => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
  await run('await initialSettingsReady;window.UiLocale.set("tr",false);applyUiTheme("dark");document.querySelector("[data-home-page=discover]").click();return true');
  await until(() => run('return document.querySelectorAll(".md-card").length>0'), 'discover list');
  const fonts = await run('await document.fonts.ready;return {heading:getComputedStyle(document.querySelector(".md-heading h1")).fontFamily,plex:document.fonts.check(\'400 14px "IBM Plex Sans"\',"İstanbul şğ"),sora:document.fonts.check(\'600 32px Sora\',"Keşfet")}');
  assert(fonts.plex && fonts.sora, JSON.stringify(fonts)); assert(fonts.heading.includes('Sora'));
  const beforeHover = await run('return getComputedStyle(document.querySelectorAll(".md-tab")[1]).backgroundColor');
  const hover = await run('const r=document.querySelectorAll(".md-tab")[1].getBoundingClientRect();return {x:Math.round(r.x+r.width/2),y:Math.round(r.y+r.height/2)}');
  win.webContents.sendInputEvent({ type: 'mouseMove', ...hover }); await wait(100);
  assert.notEqual(await run('return getComputedStyle(document.querySelectorAll(".md-tab")[1]).backgroundColor'), beforeHover, 'Actual renderer pointer hover feedback');
  win.webContents.sendInputEvent({ type: 'mouseMove', x: 5, y: 45 });
  win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
  assert(await run('return document.activeElement!==document.body && getComputedStyle(document.activeElement).outlineStyle!=="none"'), 'Keyboard focus remains visible');
  await wait(500); fs.writeFileSync(path.join(out, 'discover-1920-tr.png'), (await win.webContents.capturePage()).toPNG());
  if (!live) {
    await run('document.querySelector(".md-more").click();return true');
    await until(() => run('return document.querySelector(".md-more").hidden'), 'page end');
    assert.equal(await run('return document.querySelectorAll(".md-card").length'), 24, 'No duplicate rows on pagination');
    await run('const kind=document.querySelector(".md-filters select");kind.value="series";kind.dispatchEvent(new Event("change"));return true');
    await until(() => run('return document.querySelectorAll(".md-card").length===24 && !document.querySelector(".md-filters select").disabled'), 'series filter');
    await run('const kind=document.querySelector(".md-filters select");kind.value="film";kind.dispatchEvent(new Event("change"));return true');
    await until(() => run('return !document.querySelector(".md-filters select").disabled'), 'film return');
    await run('const mode=document.querySelectorAll(".md-filters select")[1];mode.value="year";mode.dispatchEvent(new Event("change"));return true');
    await until(() => run('return document.querySelectorAll(".md-card").length===3'), 'year filter');
    await run('const mode=document.querySelectorAll(".md-filters select")[1];mode.value="top";mode.dispatchEvent(new Event("change"));return true');
    await until(() => run('return document.querySelectorAll(".md-card").length===24'), 'popular return');
    await run('document.querySelector(".md-search input").value="error";document.querySelector(".md-filters").requestSubmit();return true');
    await until(() => run('return document.querySelector(".md-status").classList.contains("mh-error")'), 'provider error visible');
    assert.equal((await run('return window.api.mediaCatalog({action:"list"})')).items.length, 1, 'Provider error does not mutate catalog');
    await run('document.querySelector(".md-search input").value="";document.querySelector(".md-filters").requestSubmit();return true');
    await until(() => run('return document.querySelectorAll(".md-card").length===24'), 'error recovery');
  }
  const initialCount = await run('return (await window.api.mediaCatalog({action:"list"})).items.length'); assert.equal(initialCount, 1);
  const title = await run('const card=document.querySelector(".md-card");const title=card.querySelector(".mh-card-title").textContent;card.click();return title');
  await until(() => run('return !!document.querySelector(".md-detail-body h2")'), 'details');
  assert.equal(await run('return document.querySelector(".md-detail h2").textContent'), title);
  await run('await new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)));return true'); await wait(300);
  fs.writeFileSync(path.join(out, 'discover-details-tr.png'), (await win.webContents.capturePage()).toPNG());
  await run('document.querySelector(".md-detail .mh-primary").click();return true');
  await until(() => run('return document.getElementById("mediaCatalogDialog").open && !!document.querySelector(".mc-detail")'), 'watchlist record');
  assert.equal(await run('return (await window.api.mediaCatalog({action:"list"})).items.length'), 2);
  await run('document.getElementById("mediaCatalogDialog").close();return true');
  await until(() => run('return document.querySelectorAll(".md-card").length>0'), 'return discovery');
  // Personal recommendations explain a real library genre seed and exclude owned titles.
  await run('document.querySelectorAll(".md-tab")[1].click();return true');
  await until(() => run('return !!document.querySelector(".md-reason")'), 'explained personal recommendations');
  assert(await run('return [...document.querySelectorAll(".md-reason")].every(n=>n.textContent.includes("Liked seed"))'));
  await wait(200); fs.writeFileSync(path.join(out, 'discover-personal-tr.png'), (await win.webContents.capturePage()).toPNG());
  const results = [];
  for (const [width, height, locale, theme] of [[940,780,'en','light'],[680,900,'tr','dark']]) {
    win.setMinimumSize(400,500); win.setContentSize(width,height);
    await run(`window.UiLocale.set(${JSON.stringify(locale)},false);applyUiTheme(${JSON.stringify(theme)});return true`);
    await until(() => run('return !document.querySelector(".md-status")?.textContent.includes("Loading") && !document.querySelector(".md-status")?.textContent.includes("yükleniyor")'), 'locale data');
    await wait(300); const layout = await run('return {width:innerWidth,scroll:document.documentElement.scrollWidth,cards:document.querySelectorAll(".md-card").length}');
    assert(layout.scroll <= layout.width + 1, JSON.stringify(layout)); results.push(layout);
    fs.writeFileSync(path.join(out, `discover-${width}-${locale}.png`), (await win.webContents.capturePage()).toPNG());
  }
  console.log(JSON.stringify({ ok: true, live, out, title, results })); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
