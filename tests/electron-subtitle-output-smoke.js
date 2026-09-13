'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');
const { pathToFileURL } = require('node:url');

let fixtureDir = '';
let userDataDir = '';
let electronProcess = null;

function cleanupFixtures() {
  if (!fixtureDir) return;
  fs.rmSync(fixtureDir, { recursive: true, force: true });
  fixtureDir = '';
  if (userDataDir) {
    try { fs.rmSync(userDataDir, { recursive: true, force: true }); } catch (_) {}
    userDataDir = '';
  }
}

function withTimeout(promise, ms, label) {
  let timer;
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      timer = setTimeout(() => reject(new Error(`${label} zaman aşımına uğradı.`)), ms);
    }),
  ]).finally(() => clearTimeout(timer));
}

async function run() {
  fixtureDir = path.join(os.tmpdir(), `whisper-local-subtitle-smoke-${randomUUID()}`);
  fs.mkdirSync(fixtureDir, { recursive: true });
  const sourcePath = path.join(fixtureDir, 'kaynak.en.srt');
  const translationPath = path.join(fixtureDir, 'ceviri.tr.srt');
  const diagnosticsPath = path.join(fixtureDir, 'browser-diagnostics.json');
  const mediaPath = path.join(fixtureDir, 'oynatma-saati.webm');
  fs.writeFileSync(sourcePath,
    '\uFEFF1\n00:00:00,000 --> 00:00:02,000\nHello world.\n', 'utf8');
  fs.writeFileSync(translationPath,
    '\uFEFF1\n00:00:00,000 --> 00:00:02,000\nMerhaba dünya.\n', 'utf8');
  const mediaFixture = spawnSync('ffmpeg.exe', [
    '-hide_banner', '-loglevel', 'error', '-y',
    '-f', 'lavfi', '-i', 'color=c=black:s=160x90:r=10:d=7',
    '-f', 'lavfi', '-i', 'anullsrc=channel_layout=stereo:sample_rate=48000',
    '-shortest', '-c:v', 'libvpx', '-deadline', 'realtime', '-pix_fmt', 'yuv420p',
    '-c:a', 'libopus', mediaPath,
  ], { windowsHide: true, encoding: 'utf8' });
  assert.equal(mediaFixture.status, 0,
    `Sentetik WebM üretilemedi: ${mediaFixture.stderr || mediaFixture.error || 'bilinmeyen hata'}`);
  const mediaUrl = pathToFileURL(mediaPath).href;

  const projectRoot = path.resolve(__dirname, '..');
  userDataDir = path.join(os.tmpdir(), `whisper-local-electron-profile-${randomUUID()}`);
  fs.mkdirSync(userDataDir, { recursive: true });
  const port = 19000 + Math.floor(Math.random() * 1000);
  const mainInspectPort = 21000 + Math.floor(Math.random() * 1000);
  const executable = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
  electronProcess = spawn(executable, [
    '--disable-background-media-suspend',
    '--disable-renderer-backgrounding',
    '--disable-background-timer-throttling',
    projectRoot,
    `--inspect=${mainInspectPort}`,
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--electron-subtitle-smoke',
    `--electron-subtitle-fixture=${sourcePath}`,
    `--electron-subtitle-fixture=${translationPath}`,
    `--electron-diagnostics-output=${diagnosticsPath}`,
    '--electron-diagnostics-sensitive-smoke',
  ], { cwd: projectRoot, windowsHide: true, stdio: 'ignore' });

  let ready = false;
  for (let attempt = 0; attempt < 50; attempt++) {
    if (electronProcess.exitCode != null) throw new Error(`Electron erken kapandı: ${electronProcess.exitCode}`);
    try {
      const response = await fetch(`http://127.0.0.1:${port}/json/list`);
      if (response.ok) { ready = true; break; }
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  assert.equal(ready, true, 'Electron DevTools hedefi açılmadı.');

  const targets = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
  const target = targets.find((entry) => entry.type === 'page'
    && /\/src\/renderer\/index\.html$/u.test(new URL(entry.url).pathname));
  assert.ok(target?.webSocketDebuggerUrl, 'Whisper Altyazı renderer hedefi bulunamadı.');

  let mainTarget = null;
  for (let attempt = 0; attempt < 50; attempt++) {
    try {
      const response = await fetch(`http://127.0.0.1:${mainInspectPort}/json/list`);
      const list = response.ok ? await response.json() : [];
      if (list[0]?.webSocketDebuggerUrl) { mainTarget = list[0]; break; }
    } catch (_) {}
    await new Promise((resolve) => setTimeout(resolve, 200));
  }
  assert.ok(mainTarget?.webSocketDebuggerUrl, 'Electron ana süreç denetim hedefi bulunamadı.');

  const socket = new WebSocket(target.webSocketDebuggerUrl);
  await withTimeout(new Promise((resolve, reject) => {
    socket.addEventListener('open', resolve, { once: true });
    socket.addEventListener('error', reject, { once: true });
  }), 5000, 'DevTools bağlantısı');

  let sequence = 0;
  const pending = new Map();
  const exceptions = [];
  socket.addEventListener('message', (message) => {
    const payload = JSON.parse(String(message.data));
    if (payload.id && pending.has(payload.id)) {
      const waiter = pending.get(payload.id);
      pending.delete(payload.id);
      if (payload.error) waiter.reject(new Error(payload.error.message));
      else waiter.resolve(payload.result);
      return;
    }
    if (payload.method === 'Runtime.exceptionThrown') {
      const details = payload.params?.exceptionDetails || {};
      exceptions.push(details.exception?.description || details.text || 'Bilinmeyen renderer istisnası');
    }
  });

  const call = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++sequence;
    pending.set(id, { resolve, reject });
    socket.send(JSON.stringify({ id, method, params }));
  });
  const mainSocket = new WebSocket(mainTarget.webSocketDebuggerUrl);
  await withTimeout(new Promise((resolve, reject) => {
    mainSocket.addEventListener('open', resolve, { once: true });
    mainSocket.addEventListener('error', reject, { once: true });
  }), 5000, 'Ana süreç DevTools bağlantısı');
  let mainSequence = 0;
  const mainPending = new Map();
  mainSocket.addEventListener('message', (message) => {
    const payload = JSON.parse(String(message.data));
    if (!payload.id || !mainPending.has(payload.id)) return;
    const waiter = mainPending.get(payload.id);
    mainPending.delete(payload.id);
    if (payload.error) waiter.reject(new Error(payload.error.message));
    else waiter.resolve(payload.result);
  });
  const mainCall = (method, params = {}) => new Promise((resolve, reject) => {
    const id = ++mainSequence;
    mainPending.set(id, { resolve, reject });
    mainSocket.send(JSON.stringify({ id, method, params }));
  });
  await mainCall('Runtime.enable');
  await call('Runtime.enable');
  exceptions.length = 0;
  let rendererReady = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    const probe = await call('Runtime.evaluate', {
      expression: "document.readyState === 'complete' && typeof attachCompletedJobSubtitles === 'function' && typeof player === 'object'",
      returnByValue: true,
    });
    if (probe.result?.value === true) { rendererReady = true; break; }
    await new Promise((resolve) => setTimeout(resolve, 250));
  }
  assert.equal(rendererReady, true, 'Renderer altyazı yüzeyi hazır olmadı.');

  const expression = `
    (async () => {
      const sourcePath = ${JSON.stringify(sourcePath)};
      const translationPath = ${JSON.stringify(translationPath)};
      const source = {
        path: sourcePath, role: 'source', language: 'en', sourceId: 'electron-smoke-source',
        sourceHash: 'electron-smoke-hash', status: 'complete', total: 1, completed: 1, failed: 0
      };
      const translation = {
        path: translationPath, role: 'translation', language: 'tr', sourceId: 'electron-smoke-source',
        sourceHash: 'electron-smoke-hash', status: 'complete', total: 1, completed: 1, failed: 0
      };

      function resetScenario(workspaceMode, mediaKey) {
        player.generation += 1;
        player.workspaceMode = workspaceMode;
        player.mediaKey = mediaKey;
        player.subtitles = [];
        player.subOrigins = {};
        player.cues = [];
        player.cues2 = [];
        player.cuesRaw = null;
        player.cues2Raw = null;
        player.subPath = '';
        player.sub2Path = '';
        player.subRole = 'source';
        player.sub2Role = 'translation';
        player.browserTracks = [];
        player.browserLoadedTrackId = '';
        player.browserLoadedTrackId2 = '';
        player.browserTranslationTrackId = '';
        player.browserLiveTranslations = new Map();
        state.pendingPlayerLoad = null;
        for (const id of ['playerSubSelect', 'playerSubSelect2']) {
          const select = document.getElementById(id);
          select.replaceChildren(new Option(id === 'playerSubSelect' ? 'Altyazı yok' : 'Kapalı', ''));
          select.value = '';
        }
      }

      async function onlyTranslation(workspaceMode, mediaKey) {
        resetScenario(workspaceMode, mediaKey);
        const job = { kind: 'translate', mediaKey, selectedSubPath: '', secondSubPath: '' };
        const result = await attachCompletedJobSubtitles({ outputs: [translation] }, job);
        return {
          loaded: result.loaded,
          path: player.subPath,
          role: player.subRole,
          secondary: player.sub2Path,
          text: player.cues[0]?.text || '',
          optionRole: player.subtitles.find((item) => item.path === translationPath)?.role || '',
          pending: !!state.pendingPlayerLoad,
        };
      }

      async function paired(workspaceMode, mediaKey) {
        resetScenario(workspaceMode, mediaKey);
        const job = { kind: 'translate', mediaKey, selectedSubPath: '', secondSubPath: '' };
        const result = await attachCompletedJobSubtitles({ outputs: [source, translation] }, job);
        return {
          loaded: result.loaded,
          sourcePath: player.subPath,
          sourceRole: player.subRole,
          sourceText: player.cues[0]?.text || '',
          translationPath: player.sub2Path,
          translationRole: player.sub2Role,
          translationText: player.cues2[0]?.text || '',
          pending: !!state.pendingPlayerLoad,
        };
      }

      async function measured(label, operation) {
        const startedAt = performance.now();
        try {
          const value = await Promise.race([
            operation(),
            new Promise((_, reject) => setTimeout(() => reject(new Error(label + ' zaman aşımı')), 20000)),
          ]);
          return { ok: true, elapsedMs: Math.round(performance.now() - startedAt), value };
        } catch (error) {
          return { ok: false, elapsedMs: Math.round(performance.now() - startedAt), error: error.message };
        }
      }

      return {
        local: await measured('yerel', () => onlyTranslation('local', 'local:electron-smoke')),
        youtubePlayer: await measured('YouTube oynatıcı',
          () => onlyTranslation('local', 'youtube:electron-smoke')),
        browserYoutube: await measured('browser YouTube',
          () => onlyTranslation('browser', 'browser:youtube:electron-smoke')),
        pair: await measured('kaynak ve çeviri',
          () => paired('local', 'youtube:electron-smoke-pair')),
      };
    })()
  `;

  const evaluation = await withTimeout(call('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  }), 90000, 'Electron altyazı bağlama değerlendirmesi');
  if (evaluation.exceptionDetails) {
    throw new Error(evaluation.exceptionDetails.exception?.description || evaluation.exceptionDetails.text);
  }
  const result = evaluation.result?.value;
  console.log('Electron subtitle result:', JSON.stringify(result));
  assert.equal(exceptions.length, 0, `Renderer istisnaları: ${exceptions.join(' | ')}`);
  for (const name of ['local', 'youtubePlayer', 'browserYoutube']) {
    assert.equal(result[name].ok, true, result[name].error || `${name} başarısız`);
    assert.deepEqual(result[name].value, {
      loaded: true,
      path: translationPath,
      role: 'translation',
      secondary: '',
      text: 'Merhaba dünya.',
      optionRole: 'translation',
      pending: false,
    }, `${name} yalnız çeviri çıktısını doğru bağlamadı`);
  }
  assert.equal(result.pair.ok, true, result.pair.error || 'eşli çıktı başarısız');
  assert.deepEqual(result.pair.value, {
    loaded: true,
    sourcePath,
    sourceRole: 'source',
    sourceText: 'Hello world.',
    translationPath,
    translationRole: 'translation',
    translationText: 'Merhaba dünya.',
    pending: false,
  });

  const generationRace = await call('Runtime.evaluate', {
    expression: `(async () => {
      const sourcePath = ${JSON.stringify(sourcePath)};
      player.generation += 1;
      player.workspaceMode = 'local';
      player.mediaKey = 'race:old';
      player.subPath = '';
      player.sub2Path = '';
      player.cues = [];
      player.cues2 = [];
      state.pendingPlayerLoad = null;
      const job = { kind: 'transcribe', mediaKey: 'race:old', selectedSubPath: '', secondSubPath: '' };
      const pending = attachCompletedJobSubtitles({ outputs: [{ path: sourcePath, role: 'source', status: 'complete' }] }, job);
      player.generation += 1;
      player.mediaKey = 'race:new';
      const result = await pending;
      return { result, mediaKey: player.mediaKey, pending: !!state.pendingPlayerLoad };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  assert.equal(generationRace.result?.value?.result?.loaded, false,
    'Video değişimiyle yarışan eski altyazı yüklemesi kabul edildi.');
  assert.equal(generationRace.result?.value?.mediaKey, 'race:new');

  const pairedGenerationRace = await call('Runtime.evaluate', {
    expression: `(async () => {
      const sourcePath = ${JSON.stringify(sourcePath)};
      const translationPath = ${JSON.stringify(translationPath)};
      player.generation += 1;
      player.workspaceMode = 'local';
      player.mediaKey = 'pair-race:old';
      player.subPath = '';
      player.sub2Path = '';
      player.cues = [];
      player.cues2 = [];
      state.pendingPlayerLoad = null;
      const job = { kind: 'translate', mediaKey: 'pair-race:old', selectedSubPath: '', secondSubPath: '' };
      const pending = attachCompletedJobSubtitles({ outputs: [
        { path: sourcePath, role: 'source', status: 'complete' },
        { path: translationPath, role: 'translation', status: 'complete' },
      ] }, job);
      player.generation += 1;
      player.mediaKey = 'pair-race:new';
      const result = await pending;
      return { result, mediaKey: player.mediaKey, primary: player.subPath,
        secondary: player.sub2Path, pending: !!state.pendingPlayerLoad };
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  assert.deepEqual(pairedGenerationRace.result?.value, {
    result: { loaded: false, reason: 'Video değişti.' },
    mediaKey: 'pair-race:new', primary: '', secondary: '', pending: false,
  }, 'İki altyazı yüklenirken medya değişimi eski çifti yeni videoya taşıdı.');

  const playbackIntegration = await call('Runtime.evaluate', {
    expression: `(() => {
      const video = document.getElementById('playerVideo');
      player.workspaceMode = 'local';
      player.offset = 0;
      player.editing = false;
      player.holdingSpeed = false;
      player.seekDragging = false;
      player.abA = null;
      player.abB = null;
      player.cues = [
        { id: 'cue-a', start: 0, end: 1, text: 'Birinci satır.' },
        { id: 'cue-b', start: 5, end: 6, text: 'İkinci satır.' },
      ];
      player.playbackPolicy = 'loop-cue';
      player.autoPause = false;
      player.loopCueId = '';
      player.loopCueRepeats = 0;
      applyPlaybackLearningPolicy(1.05, .95, false, false);
      const loop = { time: video.currentTime, cueId: player.loopCueId, repeats: player.loopCueRepeats };

      player.playbackPolicy = 'skip-gaps';
      player.loopCueId = '';
      player.loopCueRepeats = 0;
      applyPlaybackLearningPolicy(1.5, 1.4, false, false);
      const skippedTo = video.currentTime;

      player.playbackPolicy = 'accelerate-gaps';
      video.playbackRate = 1;
      applyPlaybackLearningPolicy(1.5, 1.4, false, false);
      const acceleratedRate = video.playbackRate;
      player.playbackPolicy = 'normal';
      player.cues = [];
      return { loop, skippedTo, acceleratedRate };
    })()`,
    returnByValue: true,
  });
  assert.deepEqual(playbackIntegration.result?.value?.loop,
    { time: 0, cueId: 'cue-a', repeats: 1 },
    'loopCue üretim rendererı gerçek HTMLMediaElement zamanını başa sarmadı.');
  assert.ok(Math.abs(playbackIntegration.result?.value?.skippedTo - 4.85) < 0.001,
    'skip-gaps üretim rendererı gerçek HTMLMediaElement zamanını sonraki cue öncesine taşımadı.');
  assert.equal(playbackIntegration.result?.value?.acceleratedRate, 2,
    'accelerate-gaps üretim rendererı gerçek HTMLMediaElement hızını değiştirmedi.');

  const decodedMediaClock = await call('Runtime.evaluate', {
    expression: `(async () => {
      const video = document.getElementById('playerVideo');
      const layer = document.getElementById('playerLayer');
      player.workspaceMode = 'local';
      player.offset = 0;
      player.editing = false;
      player.holdingSpeed = false;
      player.seekDragging = false;
      player.abA = null;
      player.abB = null;
      player.cues = [
        { id: 'clock-a', start: 0, end: .7, text: 'İlk saat aralığı.' },
        { id: 'clock-b', start: 4, end: 5, text: 'İkinci saat aralığı.' },
      ];
      player.playbackPolicy = 'skip-gaps';
      player.autoPause = false;
      player.lastT = undefined;
      layer.classList.remove('hidden');
      video.src = ${JSON.stringify(mediaUrl)};
      video.load();
      if (video.readyState < 1) await new Promise((resolve, reject) => {
        const timer = setTimeout(() => reject(new Error('Sentetik medya metadata zaman aşımı.')), 5000);
        video.addEventListener('loadedmetadata', () => { clearTimeout(timer); resolve(); }, { once: true });
        video.addEventListener('error', () => { clearTimeout(timer); reject(new Error('Sentetik medya açılamadı.')); }, { once: true });
      });
      await video.play();
      const startedAt = performance.now();
      while (video.currentTime < 3.8 && performance.now() - startedAt < 4000) {
        await new Promise((resolve) => setTimeout(resolve, 50));
      }
      const observed = { jumped: video.currentTime >= 3.8, currentTime: video.currentTime,
        duration: video.duration, paused: video.paused };
      video.pause();
      video.removeAttribute('src');
      video.load();
      player.playbackPolicy = 'normal';
      player.cues = [];
      layer.classList.add('hidden');
      return observed;
    })()`,
    awaitPromise: true,
    returnByValue: true,
    userGesture: true,
  });
  if (decodedMediaClock.exceptionDetails) {
    throw new Error(decodedMediaClock.exceptionDetails.exception?.description
      || decodedMediaClock.exceptionDetails.text || 'Kodlanmış medya saati değerlendirilemedi.');
  }
  assert.equal(decodedMediaClock.result?.value?.jumped, true,
    `skip-gaps gerçek kodlanmış medya saatinde boşluğu atlamadı: ${JSON.stringify(decodedMediaClock.result?.value)}`);
  assert.ok(decodedMediaClock.result?.value?.duration >= 6.9,
    'Sentetik WebM beklenen gerçek süreyi sağlamadı.');

  const doubleStart = await call('Runtime.evaluate', {
    expression: `(async () => {
      const originalStart = startTranscribeSafe;
      let calls = 0;
      let release;
      startTranscribeSafe = async () => {
        calls += 1;
        return new Promise((resolve) => { release = resolve; });
      };
      state.running = false;
      state.queueRunning = false;
      state.source = 'file';
      state.inputFile = ${JSON.stringify(sourcePath)};
      document.getElementById('startBtn').classList.remove('hidden');
      document.getElementById('startBtn').click();
      document.getElementById('startBtn').click();
      await new Promise((resolve) => setTimeout(resolve, 20));
      const during = {
        calls, running: state.running,
        startHidden: document.getElementById('startBtn').classList.contains('hidden'),
      };
      if (release) release({ ok: true });
      await new Promise((resolve) => setTimeout(resolve, 20));
      startTranscribeSafe = originalStart;
      finishRun(false);
      state.activeOutputJob = null;
      return during;
    })()`,
    awaitPromise: true,
    returnByValue: true,
  });
  assert.deepEqual(doubleStart.result?.value, { calls: 1, running: true, startHidden: true },
    'Başlat düğmesine çift tıklama aynı renderer tickinde iki iş başlattı.');

  const prepared = await call('Runtime.evaluate', {
    expression: `(() => {
      state.queueRunning = true;
      state.running = true;
      state.cancelled = false;
      state.awaitingExit = true;
      state.currentQueueId = 101;
      state.activeJobId = 'job-new';
      state.activeOutputJob = null;
      state.queue = [{ id: 101, status: 'running', error: '', files: [] }];
      state.outputFiles = ['korunacak.srt'];
      return true;
    })()`,
    returnByValue: true,
  });
  assert.equal(prepared.result?.value, true);
  const sendMainEvent = async (event) => {
    const sent = await mainCall('Runtime.evaluate', {
      expression: `(() => { const req=process.getBuiltinModule('module').createRequire(process.execPath);`
        + `const electron=req('electron'); const wc=electron.webContents.getAllWebContents().find((entry)=>/\\/src\\/renderer\\/index\\.html$/u.test(new URL(entry.getURL()).pathname));`
        + `if(!wc)return false; wc.send('transcribe:event',${JSON.stringify(event)}); return true; })()`,
      returnByValue: true,
    });
    assert.equal(sent.result?.value, true, 'Ana süreç renderer olayını gönderemedi.');
  };
  await sendMainEvent({ type: 'done', jobId: 'job-old', queueItemId: 100, files: ['eski.srt'], segments: 99 });
  await sendMainEvent({ type: 'exit', jobId: 'job-old', queueItemId: 100, code: 0 });
  await new Promise((resolve) => setTimeout(resolve, 80));
  const staleState = await call('Runtime.evaluate', {
    expression: "({status:state.queue[0].status,currentQueueId:state.currentQueueId,activeJobId:state.activeJobId,files:state.outputFiles,running:state.running})",
    returnByValue: true,
  });
  assert.deepEqual(staleState.result?.value, {
    status: 'running', currentQueueId: 101, activeJobId: 'job-new', files: ['korunacak.srt'], running: true,
  }, 'Bayat done/exit gerçek renderer durumuna sızdı.');

  const validDone = { type: 'done', jobId: 'job-new', queueItemId: 101,
    files: [translationPath], segments: 1, warnings: [] };
  await sendMainEvent(validDone);
  await sendMainEvent(validDone);
  await new Promise((resolve) => setTimeout(resolve, 80));
  const doneBeforeExit = await call('Runtime.evaluate', {
    expression: "({status:state.queue[0].status,currentQueueId:state.currentQueueId,activeJobId:state.activeJobId,running:state.running,queueRunning:state.queueRunning,awaitingExit:state.awaitingExit,startHidden:document.getElementById('startBtn').classList.contains('hidden'),cancelHidden:document.getElementById('cancelBtn').classList.contains('hidden'),statusText:document.getElementById('statusPill')?.textContent||''})",
    returnByValue: true,
  });
  assert.deepEqual(doneBeforeExit.result?.value, {
    status: 'done', currentQueueId: 101, activeJobId: 'job-new',
    running: true, queueRunning: true, awaitingExit: true,
    startHidden: true, cancelHidden: true, statusText: 'Tamamlandı · süreç kapanıyor',
  }, 'done sonrasında süreç exit vermeden arayüz yeni işi başlatılabilir gösterdi.');
  await sendMainEvent({ type: 'exit', jobId: 'job-new', queueItemId: 101, code: 0 });
  await new Promise((resolve) => setTimeout(resolve, 450));
  const terminalState = await call('Runtime.evaluate', {
    expression: "({status:state.queue[0].status,currentQueueId:state.currentQueueId,activeJobId:state.activeJobId,files:state.queue[0].files,running:state.running,queueRunning:state.queueRunning})",
    returnByValue: true,
  });
  assert.deepEqual(terminalState.result?.value, {
    status: 'done', currentQueueId: null, activeJobId: null,
    files: [translationPath], running: false, queueRunning: false,
  }, 'done/done/exit sırası kuyruk işini tek terminal duruma getirmedi.');

  const exported = await call('Runtime.evaluate', {
    expression: 'window.api.exportBrowserDiagnostics()', awaitPromise: true, returnByValue: true,
  });
  assert.equal(exported.result?.value?.ok, true, exported.result?.value?.error || 'Tanı IPC dışa aktarımı başarısız.');
  assert.equal(fs.existsSync(diagnosticsPath), true, 'Tanı IPC dosyayı yazmadı.');
  const diagnosticsText = fs.readFileSync(diagnosticsPath, 'utf8');
  for (const secret of ['user', 'pass', 'PAGE_SECRET', 'ACQ_SECRET', 'STAGE_SECRET',
    'COVERAGE_SECRET', 'private', 'subtitle.srt', 'RECENT_SECRET', 'Gizli cue metni']) {
    assert.equal(diagnosticsText.includes(secret), false, `Tanı IPC çıktısında hassas veri kaldı: ${secret}`);
  }
  assert.match(diagnosticsText, /\[altyazı metni gizlendi\]/u);
  console.log('electron-subtitle-output-smoke:', JSON.stringify(result));
  socket.close();
  mainSocket.close();
  if (electronProcess && electronProcess.exitCode == null) {
    spawnSync('taskkill.exe', ['/pid', String(electronProcess.pid), '/T', '/F'], {
      windowsHide: true, stdio: 'ignore', timeout: 10000,
    });
  }
  electronProcess = null;
  cleanupFixtures();
}

run().catch((error) => {
  if (electronProcess && electronProcess.exitCode == null) {
    spawnSync('taskkill.exe', ['/pid', String(electronProcess.pid), '/T', '/F'], {
      windowsHide: true, stdio: 'ignore', timeout: 10000,
    });
  }
  electronProcess = null;
  cleanupFixtures();
  console.error(error.stack || error.message);
  process.exit(1);
});
