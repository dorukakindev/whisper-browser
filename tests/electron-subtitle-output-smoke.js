'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawn, spawnSync } = require('node:child_process');
const { randomUUID } = require('node:crypto');

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
  fs.writeFileSync(sourcePath,
    '\uFEFF1\n00:00:00,000 --> 00:00:02,000\nHello world.\n', 'utf8');
  fs.writeFileSync(translationPath,
    '\uFEFF1\n00:00:00,000 --> 00:00:02,000\nMerhaba dünya.\n', 'utf8');

  const projectRoot = path.resolve(__dirname, '..');
  userDataDir = path.join(os.tmpdir(), `whisper-local-electron-profile-${randomUUID()}`);
  fs.mkdirSync(userDataDir, { recursive: true });
  const port = 19000 + Math.floor(Math.random() * 1000);
  const executable = path.join(projectRoot, 'node_modules', 'electron', 'dist', 'electron.exe');
  electronProcess = spawn(executable, [
    projectRoot,
    `--remote-debugging-port=${port}`,
    `--user-data-dir=${userDataDir}`,
    '--electron-subtitle-smoke',
    `--electron-subtitle-fixture=${sourcePath}`,
    `--electron-subtitle-fixture=${translationPath}`,
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
  console.log('electron-subtitle-output-smoke:', JSON.stringify(result));
  socket.close();
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
