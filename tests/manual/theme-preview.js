/* Electron renderer theme preview. Uses an isolated userData directory. */
'use strict';

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { spawn, spawnSync } = require('node:child_process');

const projectRoot = path.resolve(__dirname, '../..');
const outputDir = path.resolve(process.argv[2] || os.tmpdir());
const userDataDir = path.join(os.tmpdir(), `whisper-theme-preview-${randomUUID()}`);
const port = 26000 + Math.floor(Math.random() * 1000);
let electronProcess;

const delay = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
async function waitFor(fn, timeout = 20000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) { const value = await fn().catch(() => null); if (value) return value; await delay(150); }
  return null;
}

function cdp(url) {
  const socket = new WebSocket(url); let id = 0; const pending = new Map();
  socket.addEventListener('message', ({ data }) => {
    const message = JSON.parse(String(data)); const waiter = pending.get(message.id);
    if (!waiter) return; pending.delete(message.id);
    if (message.error) waiter.reject(new Error(message.error.message)); else waiter.resolve(message.result);
  });
  const opened = new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  });
  return { socket, opened, call(method, params = {}) {
    return new Promise((resolve, reject) => { const next = ++id; pending.set(next, { resolve, reject }); socket.send(JSON.stringify({ id: next, method, params })); });
  } };
}

async function evaluate(client, expression) {
  const response = await client.call('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true });
  if (response.exceptionDetails) throw new Error(response.exceptionDetails.text);
  return response.result?.value;
}

async function capture(client, name) {
  await delay(120);
  const shot = await client.call('Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
  fs.writeFileSync(path.join(outputDir, name), Buffer.from(shot.data, 'base64'));
}

async function setViewport(client, width, height = 900) {
  await client.call('Emulation.setDeviceMetricsOverride', {
    width, height, deviceScaleFactor: 1, mobile: false,
  });
  await delay(80);
}

async function layoutMetrics(client) {
  return evaluate(client, `
    (() => {
      const roundRect = (element) => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return {
          top: Math.round(rect.top), bottom: Math.round(rect.bottom),
          left: Math.round(rect.left), right: Math.round(rect.right),
          width: Math.round(rect.width), height: Math.round(rect.height)
        };
      };
      const left = document.querySelector('.panel-left');
      const actions = document.querySelector('.actions');
      const summary = document.getElementById('jobsCard');
      return {
        viewport: { width: innerWidth, height: innerHeight },
        documentOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        leftPanel: left ? {
          clientHeight: left.clientHeight, scrollHeight: left.scrollHeight, scrollTop: left.scrollTop,
          paddingBottom: getComputedStyle(left).paddingBottom,
          rect: roundRect(left)
        } : null,
        actions: roundRect(actions),
        jobSummary: roundRect(summary),
        browser: {
          workspaceMode: player.workspaceMode,
          surface: player.browserSurface,
          settingsOpen: player.browserSettingsOpen,
          layerClasses: document.getElementById('playerLayer')?.className || '',
          workspace: roundRect(document.getElementById('browserWorkspace')),
          toolbar: roundRect(document.querySelector('.browser-toolbar')),
          side: roundRect(document.querySelector('.player-side')),
          settings: roundRect(document.getElementById('browserSettingsSurface'))
        }
      };
    })()
  `);
}

async function productSurfaceMetrics(client) {
  return evaluate(client, `
    (() => {
      const roundRect = (element) => {
        if (!element) return null;
        const rect = element.getBoundingClientRect();
        return {
          top: Math.round(rect.top), bottom: Math.round(rect.bottom),
          left: Math.round(rect.left), right: Math.round(rect.right),
          width: Math.round(rect.width), height: Math.round(rect.height)
        };
      };
      const side = document.getElementById('playerSide');
      const visiblePanel = ['cueList', 'aiChat', 'playerLibraryPanel']
        .map((id) => document.getElementById(id))
        .find((element) => element && !element.classList.contains('hidden')
          && getComputedStyle(element).display !== 'none');
      const aiInput = document.getElementById('aiChatText');
      return {
        viewport: { width: innerWidth, height: innerHeight },
        documentOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        layerClasses: document.getElementById('playerLayer')?.className || '',
        sideTab: player.sideTab,
        side: roundRect(side),
        visiblePanel: roundRect(visiblePanel),
        aiInput: roundRect(aiInput),
        aiInputHeight: aiInput ? getComputedStyle(aiInput).height : '',
        aiClearLines: (() => {
          const clear = document.getElementById('aiChatClear');
          if (!clear) return 0;
          const range = document.createRange();
          range.selectNodeContents(clear);
          return range.getClientRects().length;
        })(),
        cueRows: document.querySelectorAll('#cueList .cue-card').length,
        cueListOverflowX: (() => {
          const list = document.getElementById('cueList');
          return !!list && list.scrollWidth > list.clientWidth + 1;
        })(),
        settings: roundRect(document.getElementById('settingsDrawer')),
        settingsHidden: document.getElementById('settingsDrawer')?.classList.contains('hidden') ?? true
      };
    })()
  `);
}

async function jobsSurfaceMetrics(client) {
  return evaluate(client, `
    (() => {
      const card = document.getElementById('jobsCard');
      const rows = [...document.querySelectorAll('.queue-item, .review-item')]
        .filter((row) => row.getClientRects().length > 0);
      const rect = card?.getBoundingClientRect();
      return {
        viewport: { width: innerWidth, height: innerHeight },
        documentOverflowX: document.documentElement.scrollWidth > document.documentElement.clientWidth + 1,
        card: rect ? { left: Math.round(rect.left), right: Math.round(rect.right), width: Math.round(rect.width), height: Math.round(rect.height) } : null,
        activeTab: document.querySelector('.jobs-tab.active')?.dataset.jobsTab || '',
        visibleRows: rows.length,
        rowOverflow: rows.some((row) => row.scrollWidth > row.clientWidth + 1)
      };
    })()
  `);
}

async function run() {
  fs.mkdirSync(userDataDir, { recursive: true });
  fs.mkdirSync(outputDir, { recursive: true });
  electronProcess = spawn(path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe'), [
    projectRoot, `--remote-debugging-port=${port}`, `--user-data-dir=${userDataDir}`,
  ], { cwd: projectRoot, windowsHide: true, stdio: 'ignore' });
  const targets = await waitFor(async () => {
    if (electronProcess.exitCode != null) throw new Error('Electron erken kapandı.');
    const response = await fetch(`http://127.0.0.1:${port}/json/list`); return response.ok ? response.json() : null;
  });
  const target = targets?.find((item) => item.type === 'page' && /renderer\/index\.html$/.test(item.url));
  if (!target) throw new Error('Renderer hedefi bulunamadı.');
  const client = cdp(target.webSocketDebuggerUrl); await client.opened;
  await client.call('Runtime.enable'); await client.call('Page.enable');
  await setViewport(client, 1440);
  const ready = await waitFor(() => evaluate(client,
    "document.readyState === 'complete' && typeof applyUiTheme === 'function' && !document.getElementById('browserViewSettings')"));
  if (!ready) throw new Error('Renderer hazır olmadı.');
  await evaluate(client, "applyUiTheme('dark'); document.getElementById('uiTheme').value='dark'; true");
  await capture(client, 'whisper-theme-dark.png');
  await evaluate(client, `
    (() => {
      const preview = document.getElementById('preview');
      const samples = [
        { start: 4.2, end: 7.4, text: 'Normal satır, ek bir durum işareti taşımaz.' },
        { start: 8.1, end: 11.8, text: 'Şu anda işlenen aktif satır.', previewActive: true },
        { start: 12.3, end: 15.6, text: 'Bu satırın güven değeri denetim gerektiriyor.', confidence: .41, lowConfidenceWords: 2 },
        { start: 16.2, end: 20.1, text: 'Kullanıcının düzelttiği metin burada korunur.', previewEdited: true },
        { start: 20.8, end: 25.2, text: 'The translation stays attached to its source.', translationText: 'Çeviri, kaynak satırın altında ve adıyla görünür.' },
      ];
      state.previewSegs = samples.map((sample) => ({ ...sample }));
      preview.replaceChildren(...state.previewSegs.map((sample, index) => createSegmentEl(sample, index)));
      return true;
    })()
  `);
  const previewStates = await evaluate(client, `
    (() => {
      const rows = [...document.querySelectorAll('#preview .segment')];
      return {
        rows: rows.length,
        states: rows.map((row) => row.dataset.states),
        overflow: document.getElementById('preview').scrollWidth > document.getElementById('preview').clientWidth + 1,
        translationLabel: document.querySelector('.segment-translation-label')?.textContent || ''
      };
    })()
  `);
  await capture(client, 'whisper-preview-states-dark.png');
  await evaluate(client, "applyUiTheme('light'); document.getElementById('uiTheme').value='light'; true");
  await capture(client, 'whisper-theme-light.png');
  await evaluate(client, "applyUiTheme('dark'); const panel=document.querySelector('.panel-left'); const card=document.querySelector('.settings-card'); panel.scrollTop=Math.max(0, card.offsetTop - panel.offsetTop - 12); true");
  await capture(client, 'whisper-settings-dark.png');
  await evaluate(client, "document.getElementById('primarySettingsOpen').open=true; true");
  await capture(client, 'whisper-settings-open-dark.png');
  await evaluate(client, "applyUiTheme('light'); document.getElementById('primarySettingsOpen').open=false; true");
  await capture(client, 'whisper-settings-light.png');
  await setViewport(client, 560);
  await evaluate(client, "document.querySelector('.settings-card').scrollIntoView({block:'start'}); true");
  const settingsLayout = await evaluate(client, "(() => { const rect=(selector)=>{const r=document.querySelector(selector).getBoundingClientRect(); return {left:Math.round(r.left),right:Math.round(r.right),width:Math.round(r.width)}}; return {overflow:document.documentElement.scrollWidth > document.documentElement.clientWidth + 1, viewport:document.documentElement.clientWidth, card:rect('.settings-card'), tools:rect('.settings-head-tools'), restore:rect('#importSettings')}; })()");
  await capture(client, 'whisper-settings-light-560.png');
  const mainNarrowMetrics = await layoutMetrics(client);
  await setViewport(client, 1440);
  await evaluate(client, "window.scrollTo(0,0); document.querySelector('.panel-left').scrollTop=0; true");
  const mainWideMetrics = await layoutMetrics(client);
  await evaluate(client, "applyUiTheme('dark'); document.getElementById('playerLayer').classList.remove('hidden'); setWorkspaceMode('browser', false); true");
  await waitFor(() => evaluate(client, "player.workspaceMode === 'browser' && !document.getElementById('browserWorkspace').classList.contains('hidden')"));
  await evaluate(client, `
    (() => {
      player.browserTabs = [
        { id: 'preview-pinned', title: 'Belgesel Arşivi', url: 'https://arsiv.example/belgesel', pinned: true },
        { id: 'preview-active', title: 'Kayıp Sinyaller · Bölüm 04', url: 'https://video.example/watch/04', audible: true },
        { id: 'preview-reference', title: 'Kaynak Notları', url: 'https://notlar.example/sinyaller' }
      ];
      player.browserActiveTabId = 'preview-active';
      player.browserPageUrl = 'https://video.example/watch/04';
      player.browserPageTitle = 'Kayıp Sinyaller · Bölüm 04';
      player.browserTracks = [
        { id: 'preview-source', label: 'English', role: 'source' },
        { id: 'preview-translation', label: 'Türkçe', role: 'translation' }
      ];
      renderBrowserTabs();
      updateBrowserSubtitleSummary();
      const address = document.getElementById('browserAddress');
      address.value = player.browserPageUrl + '?sahne=verici';
      address.focus();
      syncBrowserAddressAction();
      setBrowserSignal('2 altyazı izi hazır · kaynak ve çeviri eşleştirildi', false);
      return true;
    })()
  `);
  await delay(250);
  const browserWideMetrics = await layoutMetrics(client);
  await capture(client, 'whisper-browser-dark.png');
  await evaluate(client, "applyUiTheme('light'); true");
  await capture(client, 'whisper-browser-light.png');
  await evaluate(client, "applyUiTheme('dark'); true");
  const browserResponsiveMetrics = {};
  for (const width of [1920, 1366, 1024]) {
    await setViewport(client, width);
    await evaluate(client, "syncResponsivePlayerLayout(); syncBrowserAddressAction(); true");
    browserResponsiveMetrics[width] = await layoutMetrics(client);
    await capture(client, `whisper-browser-reading-dark-${width}.png`);
  }
  await setViewport(client, 940);
  await evaluate(client, "syncResponsivePlayerLayout(); true");
  await delay(180);
  const browserMinMetrics = await layoutMetrics(client);
  await capture(client, 'whisper-browser-dark-940.png');
  await setViewport(client, 1440);
  await evaluate(client, "syncResponsivePlayerLayout(); openBrowserSettings('site'); true");
  await waitFor(() => evaluate(client, "player.browserSurface === 'settings' && !document.getElementById('browserSettingsSurface').classList.contains('hidden')"));
  await delay(120);
  const browserSettingsWideMetrics = await layoutMetrics(client);
  await capture(client, 'whisper-browser-settings-dark.png');
  await evaluate(client, "applyUiTheme('light'); true");
  await capture(client, 'whisper-browser-settings-light.png');
  await evaluate(client, "applyUiTheme('dark'); true");
  await setViewport(client, 940);
  await evaluate(client, "syncResponsivePlayerLayout(); true");
  await delay(160);
  const browserSettingsMinMetrics = await layoutMetrics(client);
  await capture(client, 'whisper-browser-settings-dark-940.png');

  await evaluate(client, "closeBrowserSettings(); true");
  await delay(140);
  await setViewport(client, 1440);
  await evaluate(client, `
    (() => {
      setWorkspaceMode('player', false);
      document.getElementById('playerLayer').classList.remove('hidden');
      player.localPath = 'D:\\Arşiv\\Kayıp Sinyaller - Bölüm 04.mkv';
      player.mediaKey = 'theme-preview-local';
      player.subPath = 'D:\\Arşiv\\Kayıp Sinyaller - Bölüm 04.en.srt';
      player.sub2Path = 'D:\\Arşiv\\Kayıp Sinyaller - Bölüm 04.tr.srt';
      player.subRole = 'source';
      player.sub2Role = 'translation';
      player.savedOnly = false;
      player.qualityOnly = false;
      player.autoFollow = true;
      player.userScrolled = false;
      player.cues = [
        { start: 41.2, end: 44.1, text: 'The signal was never meant to reach this valley.' },
        { start: 45.0, end: 48.7, text: 'Someone redirected it before the storm arrived.' },
        { start: 49.1, end: 52.5, text: 'Listen. There is another voice beneath the static.', confidence: .47, lowConfidenceWords: 2 },
        { start: 53.0, end: 56.4, text: 'If we follow it now, we may still find the transmitter.' },
        { start: 57.1, end: 60.8, text: 'And if the warning was meant for us?' },
        { start: 61.4, end: 65.2, text: 'Then we are already too late.' }
      ];
      player.cues2 = [
        { start: 41.2, end: 44.1, text: 'Bu sinyalin bu vadiye ulaşması hiç amaçlanmamıştı.' },
        { start: 45.0, end: 48.7, text: 'Fırtına gelmeden önce biri yönünü değiştirmiş.' },
        { start: 49.1, end: 52.5, text: 'Dinle. Parazitin altında başka bir ses var.' },
        { start: 53.0, end: 56.4, text: 'Şimdi izini sürersek vericiyi hâlâ bulabiliriz.' },
        { start: 57.1, end: 60.8, text: 'Ya uyarı bizim için gönderildiyse?' },
        { start: 61.4, end: 65.2, text: 'O zaman zaten çok geç kaldık.' }
      ];
      player.activeIdx = 2;
      player.activeIdx2 = 2;
      document.getElementById('playerTitle').textContent = 'Kayıp Sinyaller · Bölüm 04';
      document.getElementById('playerMeta').textContent = 'Yerel video · 48:12 · EN + TR';
      setSideTab('subs');
      setSubtitleMode('both', false);
      updateSubtitleChips();
      syncPlayerSourceQuick();
      updateMakeTransState();
      renderCueList();
      highlightCueRow();
      syncResponsivePlayerLayout();
      return true;
    })()
  `);
  await delay(160);
  const playerTranscriptWideMetrics = await productSurfaceMetrics(client);
  await capture(client, 'whisper-player-transcript-dark.png');
  const playerTranscriptResponsiveMetrics = {};
  for (const width of [1920, 1366, 1024]) {
    await setViewport(client, width);
    await evaluate(client, "syncResponsivePlayerLayout(); true");
    playerTranscriptResponsiveMetrics[width] = await productSurfaceMetrics(client);
    await capture(client, `whisper-player-reading-dark-${width}.png`);
  }
  await setViewport(client, 940);
  await evaluate(client, "syncResponsivePlayerLayout(); true");
  await delay(160);
  const playerTranscriptMinMetrics = await productSurfaceMetrics(client);
  await capture(client, 'whisper-player-transcript-dark-940.png');

  await setViewport(client, 1440);
  await evaluate(client, "syncResponsivePlayerLayout(); setSideTab('ai'); renderAiChatContext(aiChatContext(), false); document.getElementById('aiContextPreview').open = true; true");
  await delay(120);
  const playerAiMetrics = await productSurfaceMetrics(client);
  await capture(client, 'whisper-player-ai-context-dark.png');
  const playerAiResponsiveMetrics = {};
  for (const width of [1920, 1366, 1024]) {
    await setViewport(client, width);
    await evaluate(client, "syncResponsivePlayerLayout(); renderAiChatContext(aiChatContext(), false); document.getElementById('aiContextPreview').open = true; true");
    playerAiResponsiveMetrics[width] = await productSurfaceMetrics(client);
    await capture(client, `whisper-player-ai-context-dark-${width}.png`);
  }
  await setViewport(client, 940);
  await evaluate(client, "syncResponsivePlayerLayout(); player.narrowPanelTakeover = true; syncResponsivePlayerLayout(); renderAiChatContext(aiChatContext(), true); document.getElementById('aiContextPreview').open = true; true");
  await delay(120);
  const playerAiMinMetrics = await productSurfaceMetrics(client);
  await capture(client, 'whisper-player-ai-context-dark-940.png');

  await setViewport(client, 1440);
  await evaluate(client, "syncResponsivePlayerLayout(); true");
  await evaluate(client, "setSideTab('library'); true");
  await delay(220);
  await evaluate(client, `
    (() => {
      const now = Date.now();
      watchLibraryCache = [
        {
          key: 'local:lost-signals', title: 'Kayıp Sinyaller · Bölüm 04', type: 'local',
          position: 1042, duration: 2892, completed: false, lastWatched: now - 18 * 60 * 1000,
          collections: ['İnceleme'], matches: [
            { seconds: 49.1, snippet: 'Parazitin altında başka bir ses var.', annotationType: 'note', annotationId: 'preview-note' }
          ], prefs: {}
        },
        {
          key: 'youtube:field-recording', title: 'Gece Kaydı: Terk Edilmiş Radyo İstasyonu', type: 'youtube',
          position: 128, duration: 754, completed: false, lastWatched: now - 2 * 86400000,
          collections: ['Araştırma'], matches: [], prefs: {}
        }
      ];
      playerLibraryResults = watchLibraryCache;
      playerUnifiedLibraryResults = [];
      playerLibraryView = 'search';
      document.getElementById('playerLibrarySearch').value = '';
      document.getElementById('playerLibraryFilter').value = 'all';
      renderPlayerLibrary();
      return true;
    })()
  `);
  await delay(100);
  const playerLibraryMetrics = await productSurfaceMetrics(client);
  await capture(client, 'whisper-player-library-dark.png');
  await setViewport(client, 940);
  await evaluate(client, "syncResponsivePlayerLayout(); true");
  await delay(120);
  const playerLibraryMinMetrics = await productSurfaceMetrics(client);
  await capture(client, 'whisper-player-library-dark-940.png');

  await setViewport(client, 1440);
  await evaluate(client, "syncResponsivePlayerLayout(); true");
  await evaluate(client, "setSideTab('subs'); setSettingsPage('source'); setSettingsDrawer(true); true");
  await delay(180);
  const playerSettingsMetrics = await productSurfaceMetrics(client);
  await capture(client, 'whisper-player-settings-dark.png');
  await setViewport(client, 940);
  await evaluate(client, "syncResponsivePlayerLayout(); true");
  await delay(160);
  const playerSettingsMinMetrics = await productSurfaceMetrics(client);
  await capture(client, 'whisper-player-settings-dark-940.png');

  await evaluate(client, "setSettingsDrawer(false); document.getElementById('playerLayer').classList.add('hidden'); true");
  await setViewport(client, 1440);
  await evaluate(client, `
    (() => {
      state.queue = [
        { id: 9101, type: 'local', input: 'D:\\Arşiv\\Kayıp Sinyaller 04.mkv', label: 'Kayıp Sinyaller 04.mkv', status: 'running', opts: { model: 'large-v3', engine: 'faster', formats: 'srt,json', language: 'en', translate: true, translateTo: 'tr' } },
        { id: 9102, type: 'youtube', input: 'https://www.youtube.com/watch?v=preview', label: 'Saha Kaydı · Radyo İstasyonu', status: 'pending', opts: { model: 'large-v3-turbo', engine: 'faster-batched', formats: 'srt', language: 'auto' } },
        { id: 9103, type: 'local', input: 'D:\\Arşiv\\Arşiv Görüşmesi.mov', label: 'Arşiv Görüşmesi.mov', status: 'done', warnings: ['2 blokta okuma hızı yüksek; elle kontrol önerilir.'], files: ['D:\\Çıktı\\Arşiv Görüşmesi.srt'], opts: { model: 'medium', engine: 'faster', formats: 'srt,vtt', language: 'tr' } }
      ];
      state.lastQualityReport = { blocks: 86, cps_violations: 2, overlaps: 1, too_long: 0 };
      state.queueRunning = true;
      renderQueue();
      setJobsTab('queue');
      document.getElementById('jobsCard').scrollIntoView({ block: 'start' });
      return true;
    })()
  `);
  await delay(160);
  const jobsQueueMetrics = await jobsSurfaceMetrics(client);
  await capture(client, 'whisper-jobs-queue-dark.png');
  await evaluate(client, "setJobsTab('review'); document.getElementById('jobsCard').scrollIntoView({ block: 'start' }); true");
  await delay(100);
  const jobsReviewMetrics = await jobsSurfaceMetrics(client);
  await capture(client, 'whisper-jobs-review-dark.png');
  await setViewport(client, 940);
  await evaluate(client, "setJobsTab('queue'); document.getElementById('jobsCard').scrollIntoView({ block: 'start' }); true");
  await delay(120);
  const jobsQueueMinMetrics = await jobsSurfaceMetrics(client);
  await capture(client, 'whisper-jobs-queue-dark-940.png');
  await evaluate(client, "setJobsTab('review'); document.getElementById('jobsCard').scrollIntoView({ block: 'start' }); true");
  await delay(100);
  const jobsReviewMinMetrics = await jobsSurfaceMetrics(client);
  await capture(client, 'whisper-jobs-review-dark-940.png');
  console.log(JSON.stringify({
    settingsLayout, previewStates, mainWideMetrics, mainNarrowMetrics,
    browserWideMetrics, browserMinMetrics, browserResponsiveMetrics,
    browserSettingsWideMetrics, browserSettingsMinMetrics,
    playerTranscriptWideMetrics, playerTranscriptMinMetrics, playerTranscriptResponsiveMetrics,
    playerAiMetrics, playerAiMinMetrics, playerAiResponsiveMetrics,
    playerLibraryMetrics, playerLibraryMinMetrics,
    playerSettingsMetrics, playerSettingsMinMetrics,
    jobsQueueMetrics, jobsReviewMetrics,
    jobsQueueMinMetrics, jobsReviewMinMetrics
  }));
  client.socket.close();
}

run().catch((error) => { console.error(error.stack || error.message); process.exitCode = 1; }).finally(() => {
  if (electronProcess && electronProcess.exitCode == null) spawnSync('taskkill.exe', ['/pid', String(electronProcess.pid), '/T', '/F'], { windowsHide: true, stdio: 'ignore' });
  fs.rmSync(userDataDir, { recursive: true, force: true });
});
