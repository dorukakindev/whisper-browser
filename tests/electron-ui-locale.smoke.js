const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { app, BrowserWindow } = require('electron');

const testProfile = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-ui-locale-'));
app.setPath('userData', testProfile);

(async () => {
  await app.whenReady();
  const win = new BrowserWindow({ show: false, width: 1400, height: 900,
    webPreferences: { contextIsolation: true, sandbox: true, nodeIntegration: false } });
  try {
    await win.loadFile(path.join(__dirname, '../src/renderer/index.html'));
    const en = await win.webContents.executeJavaScript(`({
      lang: document.documentElement.lang,
      action: document.getElementById('openPlayer').textContent.trim(),
      library: document.getElementById('mediaCatalogOpen').textContent.trim(),
      heading: document.querySelector('.source-card h2').textContent.trim(),
      ui: document.getElementById('uiLocale').value,
      playerUi: document.getElementById('playerUiLocale').value
    })`);
    assert.deepEqual(en, { lang: 'en', action: 'BROWSER', library: 'Media library',
      heading: 'Choose a source', ui: 'en', playerUi: 'en' });
    const preservedCue = await win.webContents.executeJavaScript(`(() => {
      const cue = document.createElement('span');
      cue.className = 'cue-text';
      cue.textContent = 'Kaynağını seç';
      document.getElementById('cueList').append(cue);
      window.UiLocale.set('tr');
      window.UiLocale.set('en');
      return cue.textContent;
    })()`);
    assert.equal(preservedCue, 'Kaynağını seç', 'User subtitle text must never be localized');
    const preservedTitle = await win.webContents.executeJavaScript(`(() => {
      const title = document.getElementById('playerTitle');
      title.textContent = 'Kaynağını seç';
      window.UiLocale.set('tr');
      window.UiLocale.set('en');
      const value = title.textContent;
      title.textContent = 'Oynatıcı';
      window.UiLocale.set('en');
      return value;
    })()`);
    assert.equal(preservedTitle, 'Kaynağını seç', 'User media title must never be localized');
    const tr = await win.webContents.executeJavaScript(`(() => {
      window.UiLocale.set('tr');
      return { lang: document.documentElement.lang,
        action: document.getElementById('openPlayer').textContent.trim(),
        library: document.getElementById('mediaCatalogOpen').textContent.trim(),
        heading: document.querySelector('.source-card h2').textContent.trim(),
        ui: document.getElementById('uiLocale').value,
        playerUi: document.getElementById('playerUiLocale').value };
    })()`);
    assert.deepEqual(tr, { lang: 'tr', action: 'BROWSER', library: 'Arşiv',
      heading: 'Kaynağını seç', ui: 'tr', playerUi: 'tr' });
    await win.webContents.reload();
    const restored = await win.webContents.executeJavaScript(`({
      lang: document.documentElement.lang,
      ui: document.getElementById('uiLocale').value,
      playerUi: document.getElementById('playerUiLocale').value
    })`);
    assert.deepEqual(restored, { lang: 'tr', ui: 'tr', playerUi: 'tr' });
    await win.webContents.executeJavaScript(`window.UiLocale.set('en');`);
    const screenshot = path.join(testProfile, 'ui-main-en.png');
    fs.writeFileSync(screenshot, (await win.capturePage()).toPNG());
    const untranslatedMain = await win.webContents.executeJavaScript(`[...document.querySelectorAll('body *')]
      .filter(e => e.children.length === 0 && e.getClientRects().length && /[çğıöşüÇĞİÖŞÜ]/.test(e.textContent || ''))
      .map(e => e.textContent.trim()).filter(Boolean).slice(0, 60)`);
    await win.webContents.executeJavaScript(`(() => {
      const layer = document.getElementById('playerLayer');
      layer.classList.remove('hidden');
      layer.style.animation = 'none';
      document.querySelector('.app-main').style.visibility = 'hidden';
      document.querySelector('.app-header').style.visibility = 'hidden';
    })()`);
    await new Promise(resolve => setTimeout(resolve, 250));
    const playerScreenshot = path.join(testProfile, 'ui-player-en.png');
    fs.writeFileSync(playerScreenshot, (await win.capturePage()).toPNG());
    const untranslatedPlayer = await win.webContents.executeJavaScript(`[...document.querySelectorAll('#playerLayer *')]
      .filter(e => e.children.length === 0 && e.getClientRects().length && /[çğıöşüÇĞİÖŞÜ]/.test(e.textContent || ''))
      .map(e => e.textContent.trim()).filter(Boolean).slice(0, 60)`);
    console.log('Visible remaining TR · main:', JSON.stringify(untranslatedMain));
    console.log('Visible remaining TR · player:', JSON.stringify(untranslatedPlayer));
    await win.webContents.executeJavaScript(`(() => {
      document.getElementById('playerLayer').classList.add('hidden');
      document.querySelector('.app-main').style.visibility = '';
      document.querySelector('.app-header').style.visibility = '';
      window.syncBrowserOcclusion = () => {};
      document.getElementById('mediaCatalogOpen').click();
    })()`);
    await new Promise(resolve => setTimeout(resolve, 150));
    const catalogState = await win.webContents.executeJavaScript(`({
      open: document.getElementById('mediaCatalogDialog').open,
      children: document.getElementById('mediaCatalogRoot').children.length,
      heading: document.querySelector('#mediaCatalogRoot .mc-brand h2')?.textContent,
      nav: [...document.querySelectorAll('#mediaCatalogRoot .mc-nav button')].map(button => button.textContent),
      empty: document.querySelector('#mediaCatalogRoot .mc-empty')?.textContent
    })`);
    assert.deepEqual(catalogState, { open: true, children: 4,
      heading: 'Movies and series', nav: ['Movies', 'Series', 'Watchlist', 'Calendar'],
      empty: 'Your library is empty. Add your first movie or series.' });
    const catalogScreenshot = path.join(testProfile, 'ui-library-en.png');
    fs.writeFileSync(catalogScreenshot, (await win.capturePage()).toPNG());
    console.log(`UI locale smoke passed · screenshots: ${screenshot} · ${playerScreenshot} · ${catalogScreenshot}`);
  } finally {
    win.destroy();
    app.quit();
  }
})().catch(error => { console.error(error); app.exit(1); });
