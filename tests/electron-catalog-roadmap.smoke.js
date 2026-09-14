'use strict';
const { app, BrowserWindow, dialog } = require('electron');
const fs = require('node:fs'), path = require('node:path'), assert = require('node:assert/strict');
const root = path.resolve(__dirname, '..'), out = path.join(root, '.uiprev/catalog-roadmap-ui'); fs.mkdirSync(out, { recursive: true });
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.join(out, 'profile-' + Date.now());
app.setAppPath(root); app.commandLine.appendSwitch('disable-gpu');
const originalFetch = global.fetch;
global.fetch = async (url, options) => {
  if (!String(url).startsWith('https://api.themoviedb.org/')) return originalFetch(url, options);
  const data = String(url).includes('/search/') ? { results: [{ id: 42, name: 'Sentetik Dizi', first_air_date: '2025-01-01' }] }
    : String(url).includes('/season/') ? { episodes: [{ episode_number: 1, name: 'Başlangıç', air_date: '2026-12-20' }] }
    : { id: 42, name: 'Sağlayıcı Başlığı', original_name: 'Original', first_air_date: '2025-01-01', overview: 'Sağlayıcı özeti', genres: [{ name: 'Dram' }], credits: { cast: [{ name: 'Sentetik Oyuncu' }] }, seasons: [{ season_number: 1, episode_count: 1 }] };
  return new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
};
require('../src/main');
const wait = ms => new Promise(r => setTimeout(r, ms));
async function until(fn, label) { for (let i = 0; i < 150; i++) { if (await fn()) return; await wait(150); } throw new Error(label); }
app.whenReady().then(async () => {
  let win;
  await until(() => { win = BrowserWindow.getAllWindows().find(w => w.webContents.getURL().includes('index.html') && !w.webContents.isLoading()); return win; }, 'Pencere');
  win.setContentSize(1300, 850);
  const run = code => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
  const click = label => run(`const b=[...document.querySelectorAll('#mediaCatalogRoot button')].find(b=>b.textContent.trim()===${JSON.stringify(label)});if(!b||b.disabled)throw Error('Düğme: '+${JSON.stringify(label)});b.click();`);
  const settled = () => until(() => run(`return document.getElementById('mediaCatalogRoot').getAttribute('aria-busy')==='false'`), 'İşlem');
  await run('await initialSettingsReady; applyUiTheme("dark");');
  const saved = await run(`return window.api.mediaCatalog({action:'save',item:{kind:'series',title:'Benim Başlığım',synopsis:'Elle yazdığım konu',ratings:{personal:'9'},favorite:true}})`);
  assert(saved.ok, saved.error);
  await run(`document.getElementById('mediaCatalogOpen').click()`); await settled();
  await click('Diziler');
  await run(`document.querySelector('.mc-card').click()`); await click('Bilgileri eşleştir');
  await run(`const input=document.querySelector('#mediaCatalogRoot input[type=password]');input.value='${'x'.repeat(30)}';input.dispatchEvent(new Event('input',{bubbles:true}));`);
  await click('TMDB’de ara'); await settled(); await click('Sentetik Dizi · 2025-01-01'); await settled();
  const protectedFields = await run(`return [...document.querySelectorAll('.mc-check')].filter(l=>/^(Başlık|Konu):/.test(l.textContent)).map(l=>l.querySelector('input').checked)`);
  assert.deepEqual(protectedFields, [false, false]);
  fs.writeFileSync(path.join(out, 'metadata-dark.png'), (await win.webContents.capturePage()).toPNG());
  await click('Seçili bilgileri uygula'); await settled();
  const listed = await run(`return window.api.mediaCatalog({action:'list'})`); const item = listed.items.find(i => i.id === saved.item.id);
  assert.equal(item.title, 'Benim Başlığım'); assert.equal(item.synopsis, 'Elle yazdığım konu'); assert.equal(item.ratings.personal, '9'); assert.equal(item.tmdbId, 'tv:42'); assert.deepEqual(item.genres, ['Dram']);
  await click('Bilgileri eşleştir'); await click('Sezonu önizle'); await settled(); await click('Bölümleri takvime aktar'); await settled();
  await click('Takvim'); assert(await run(`return document.getElementById('mediaCatalogRoot').textContent.includes('20.12.2026')`));
  fs.writeFileSync(path.join(out, 'calendar.png'), (await win.webContents.capturePage()).toPNG());
  await click('Filmler'); await click('Çalışma paketi');
  const packageFile = path.join(out, 'ui-export.wbp'); dialog.showSaveDialog = async () => ({ canceled: false, filePath: packageFile });
  await click('Paketi dışa aktar'); await settled(); assert(fs.existsSync(packageFile));
  dialog.showOpenDialog = async () => ({ canceled: false, filePaths: [packageFile] }); await click('Geri yüklenecek paketi seç'); await settled();
  assert(await run(`return [...document.querySelectorAll('#mediaCatalogRoot button')].some(b=>b.textContent==='Geri yükle ve yeniden başlat')`));
  win.setContentSize(960, 720); await run(`applyUiTheme('light'); document.getElementById('mediaCatalogDialog').style.width='520px'`); await wait(250);
  assert(await run(`const d=document.getElementById('mediaCatalogDialog');return d.scrollWidth<=d.clientWidth+1`));
  fs.writeFileSync(path.join(out, 'package-narrow.png'), (await win.webContents.capturePage()).toPNG());
  await click('Kapat'); await run(`document.getElementById('mediaCatalogOpen').click()`); await settled(); await click('Diziler'); await run(`document.querySelector('.mc-card').click()`); await click('Bilgileri eşleştir');
  assert.equal(await run(`return document.querySelector('#mediaCatalogRoot input[type=password]').value`), '');
  await click('TMDB’de ara'); await settled(); assert(await run(`return !!document.querySelector('.mc-error')`));
  win.focus(); win.webContents.focus(); await wait(150);
  await run(`document.querySelector('#mediaCatalogRoot input[type=password]').focus()`); win.webContents.sendInputEvent({ type: 'keyDown', keyCode: 'Tab' }); win.webContents.sendInputEvent({ type: 'keyUp', keyCode: 'Tab' });
  await until(() => run(`return document.activeElement.tagName === 'BUTTON'`), 'Klavye ile sonraki düğmeye geçiş');
  console.log('catalog roadmap UI: metadata opt-in/manual data, season/calendar, export/restore preview, secret clearing, failure, keyboard and 520px passed'); app.exit(0);
}).catch(error => { console.error(error); app.exit(1); });
