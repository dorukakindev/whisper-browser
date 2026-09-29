'use strict';

// browserSplit state-machine fuzz: tohumlu PRNG ile rastgele sekme/split
// operasyon dizileri koşar, her adımdan sonra renderer görünümü
// (`player.browserSplit` + DOM) ile ana-süreç oracle'ı
// (`window.api.getBrowserState().split`) karşılaştırılır.
//
// İnvariantlar (her adımda, kısa settle ile):
//   1. split.active  ⇔  secondaryTabId !== ''
//   2. secondaryTabId açık sekmelerden biri ve aktif sekmeden farklı
//   3. ratio ∈ [0.25, 0.75]
//   4. renderer player.browserSplit === main split (id/active/ratio)
//   5. DOM: sekme öğesi sayısı === tabs.length; is-split-secondary öğe sayısı
//      === (active ? 1 : 0) ve id'si secondary ile eşleşir
//   6. browserTabEventGate.contexts anahtarları ⊆ açık sekme id'leri
//   7. unhandledrejection = 0
//
// Çalıştırma: xvfb-run -a npx electron tests/electron-browser-split-fuzz.smoke.js --disable-gpu

const { app, BrowserWindow } = require('electron');
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'split-fuzz-'));
process.env.WHISPER_RESOURCE_SOAK_USER_DATA = path.join(out, 'profile');
fs.mkdirSync(process.env.WHISPER_RESOURCE_SOAK_USER_DATA, { recursive: true });

const OPS = Number(process.env.SPLIT_FUZZ_OPS) || 240;
const SEED = Number(process.env.SPLIT_FUZZ_SEED) || 20260929;

const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const until = async (fn, label, timeoutMs = 15000, stepMs = 150) => {
  const started = Date.now(); let last;
  while (Date.now() - started < timeoutMs) {
    try { last = await fn(); if (last) return last; } catch (error) { last = error; }
    await wait(stepMs);
  }
  throw new Error(`Zaman aşımı: ${label} (son: ${JSON.stringify(last)})`);
};
const stepTimeout = (promise, ms, label) => Promise.race([
  promise,
  wait(ms).then(() => Promise.reject(new Error(`adım zaman aşımı: ${label}`))),
]);

let renderProcessGone = 0;
app.setAppPath(path.resolve(__dirname, '..'));
require('../src/main.js');

app.whenReady().then(async () => {
  try {
    const win = await until(() => BrowserWindow.getAllWindows()
      .find((item) => item.webContents.getURL().includes('index.html') && !item.webContents.isLoading()),
      'Ana pencere', 90000);
    const run = (code) => win.webContents.executeJavaScript(`(async()=>{${code}})()`, true);
    win.webContents.on('render-process-gone', () => { renderProcessGone += 1; });
    await until(() => run('return typeof initialSettingsReady !== "undefined"'
      + ' ? await initialSettingsReady.then(()=>true).catch(()=>false) : false'), 'Ayarlar', 90000);
    await run(`window.__unhandledCount = 0;
      window.addEventListener('unhandledrejection', () => window.__unhandledCount++);
      // Kapatma onayları headless'ta kullanıcı bekler; smoke tam yolu koşarken
      // onayı otomatik geçer.
      openAppDialog = async () => true;
      // Deterministik PRNG — aynı tohum aynı operasyon dizisini üretir.
      window.__rngState = ${SEED} >>> 0;
      window.__rng = () => (window.__rngState = (window.__rngState * 1664525 + 1013904223) >>> 0) / 4294967296;
      return true;`);

    await run('setWorkspaceMode("browser"); return true;');
    await until(() => run('return player.workspaceMode === "browser"'), 'Tarayıcı yüzeyi');
    await run('showBrowserWebSurface(); return true;');
    console.log('[split-fuzz] hazır');

    // Tek eval'de hem operasyon hem oracle okuması — IPC gidiş-dönüşünü azaltır.
    const OP = `
      const rng = window.__rng;
      const pick = (arr) => arr[Math.floor(rng() * arr.length)];
      const ids = player.browserTabs.map((t) => t.id);
      const others = ids.filter((id) => id !== player.browserActiveTabId);
      const op = ${JSON.stringify('__OP__')};
      let detail = {};
      if (op === 'create' && ids.length < 24) {
        const tab = await createBrowserTab();
        detail = { created: tab && tab.id };
      } else if (op === 'close' && ids.length > 1) {
        const id = pick(ids); detail = { closed: id };
        await closeBrowserTab(id);
      } else if (op === 'activate' && others.length) {
        const id = pick(others); detail = { activated: id };
        await activateBrowserTab(id);
      } else if (op === 'pin' && ids.length) {
        const id = pick(ids); detail = { pinned: id };
        await window.api.setBrowserTabPinned(id, !(player.browserTabs.find((t) => t.id === id) || {}).pinned);
      } else if (op === 'reorder' && ids.length > 1) {
        const shuffled = [...ids].sort(() => rng() - .5); detail = { order: shuffled.length };
        await window.api.reorderBrowserTabs(shuffled);
      } else if (op === 'splitOn' && others.length) {
        const id = pick(others); const ratio = [0, 10, 25, 50, 75, 120, 500][Math.floor(rng() * 7)];
        detail = { secondary: id, ratio };
        await setBrowserSplit(id, ratio);
      } else if (op === 'splitOff') {
        await setBrowserSplit('', 50);
      } else if (op === 'ratio') {
        const ratio = [0, 24.9, 50, 75.1, 100, 400][Math.floor(rng() * 6)];
        detail = { ratio };
        await setBrowserSplit(player.browserSplit.secondaryTabId, ratio);
      } else if (op === 'reopen') {
        await reopenClosedBrowserTab();
      }
      return { op, detail };`;

    const ORACLE = `
      const main = await window.api.getBrowserState();
      const split = main.split || {};
      const rendererSplit = player.browserSplit;
      const tabs = player.browserTabs.map((t) => t.id);
      const domTabs = document.querySelectorAll('#browserTabStrip [data-browser-tab-id]');
      const domSecondary = [...domTabs].filter((el) => el.classList.contains('is-split-secondary'))
        .map((el) => el.dataset.browserTabId);
      return {
        ok: main.ok !== false,
        mainActive: main.activeTabId, mainSplit: split,
        rActive: player.browserActiveTabId, rSplit: rendererSplit,
        rTabs: tabs, domCount: domTabs.length, domSecondary,
        gates: [...player.browserTabEventGate.contexts.keys()],
        closing: player.browserClosingTabs.size,
      };`;

    const ops = ['create', 'create', 'close', 'activate', 'activate', 'pin',
      'reorder', 'splitOn', 'splitOn', 'splitOff', 'ratio', 'reopen'];
    // Başlangıçta split'i kapatılabilir duruma getirmek için birkaç sekme aç.
    for (let i = 0; i < 3; i += 1) {
      await stepTimeout(run('return (await createBrowserTab())?.id || null'), 15000, `ilk sekme ${i}`);
    }
    console.log(`[split-fuzz] tohum=${SEED} ops=${OPS}`);

    let checked = 0;
    for (let i = 0; i < OPS; i += 1) {
      const op = ops[i % ops.length];
      const applied = await stepTimeout(run(OP.replace('__OP__', op)), 15000, `op ${i} (${op})`);
      const oracle = await until(async () => {
        const o = await run(ORACLE);
        if (!o.ok) return o; // ok:false da değerlendirilsin
        // renderer ↔ main split yakınsaması bekle
        const conv = o.rSplit.active === o.mainSplit.active
          && o.rSplit.secondaryTabId === o.mainSplit.secondaryTabId
          && Math.abs(o.rSplit.ratio - o.mainSplit.ratio) < 1e-9
          && o.rActive === o.mainActive;
        return conv ? o : (window.__lastOracle = o, null);
      }, `oracle yakınsaması op ${i}`, 8000);
      checked += 1;

      // İnvariantlar
      const s = oracle.mainSplit;
      const r = oracle.rSplit;
      assert(s.active === (s.secondaryTabId !== ''), `op ${i} (${op}): main active⇔secondary kırık ${JSON.stringify(s)}`);
      if (s.secondaryTabId) {
        assert(oracle.rTabs.includes(s.secondaryTabId), `op ${i}: secondary sekme listede yok`);
        assert.notEqual(s.secondaryTabId, oracle.mainActive, `op ${i}: secondary == aktif sekme`);
      }
      assert(s.ratio >= 0.25 && s.ratio <= 0.75, `op ${i}: ratio aralık dışı ${s.ratio}`);
      assert.equal(r.active, s.active, `op ${i}: renderer active uyuşmazlığı`);
      assert.equal(r.secondaryTabId, s.secondaryTabId, `op ${i}: renderer secondary uyuşmazlığı`);
      assert.equal(oracle.domCount, oracle.rTabs.length, `op ${i}: DOM/sözleşme sekme sayısı ${oracle.domCount}≠${oracle.rTabs.length}`);
      assert.equal(oracle.domSecondary.length, s.active ? 1 : 0,
        `op ${i}: is-split-secondary ${JSON.stringify(oracle.domSecondary)}`);
      if (s.active) assert.equal(oracle.domSecondary[0], s.secondaryTabId, `op ${i}: DOM secondary id`);
      const stray = oracle.gates.filter((id) => !oracle.rTabs.includes(id));
      assert.equal(stray.length, 0, `op ${i}: gate kalıntısı ${JSON.stringify(stray)}`);
      if ((i + 1) % 40 === 0) console.log(`[split-fuzz] ${i + 1}/${OPS} OK (tabs=${oracle.rTabs.length} split=${s.active ? s.secondaryTabId : 'kapalı'})`);
    }
    const unhandled = await run('return window.__unhandledCount || 0');
    assert.equal(unhandled, 0, `unhandledrejection: ${unhandled}`);
    assert.equal(renderProcessGone, 0, 'Renderer süreci çöktü');
    console.log(`PASS: browserSplit state-machine fuzz (${checked} adım, tohum ${SEED}, ${OPS} op)`);
    win.close();
    app.exit(0);
  } catch (error) {
    console.error('[split-fuzz] hata:', error && error.stack || error);
    app.exit(1);
  }
});
