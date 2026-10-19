'use strict';
const test = require('node:test'), assert = require('node:assert/strict');
const fs = require('node:fs'), path = require('node:path'), vm = require('node:vm');
const security = require('../src/settings-security');
const { mergeSettingsSecrets, splitSettingsSecrets } = require('../src/secret-store');
const main = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8').replace(/\r\n/g, '\n');
const os = require('node:os');

test('browser meaning gate accepts meridiem conversion but rejects changed clock time', () => {
  const { translationMeaningIssues } = require('../src/subtitle-sentence-layout');
  assert.ok(!translationMeaningIssues('Call at 5:30 p.m.', "17.30'da ara.").includes('number_mismatch'));
  assert.ok(translationMeaningIssues('Call at 5:30 p.m.', "05.30'da ara.").includes('number_mismatch'));
  assert.ok(translationMeaningIssues('Call at 5:30 p.m.', "17.45'te ara.").includes('number_mismatch'));
});

test('imported endpoint changes cannot resurrect vaulted keys including inherited manga and UI endpoints', () => {
  for (const imported of [
    { translate: { endpointPreset: 'custom', customBaseUrl: 'https://new.example/v1' } },
    { ui: { translateEndpointPreset: 'custom', translateBaseUrl: 'https://new.example/v1' } },
  ]) {
    const old = { translate: { endpointPreset: 'https://api.openai.com/v1', apiKey: 'fixture-key' },
      manga: { endpointPreset: 'inherit', apiKey: 'fixture-key' } };
    const clean = security.sanitizeSettings(imported, { allowSecrets: false, existingSettings: old });
    const disk = splitSettingsSecrets(clean).publicSettings;
    const loaded = mergeSettingsSecrets(disk, { 'translate.apiKey': 'fixture-key',
      'translate.apiKeyProfiles': 'fixture-profiles', 'manga.apiKey': 'fixture-key' });
    assert.equal(loaded.translate?.apiKey, undefined);
    assert.equal(loaded.translate?.apiKeyProfiles, undefined);
    assert.equal(loaded.manga?.apiKey, undefined);
  }
});

test('same endpoint import retains valid keys but preserves an existing explicit clear', () => {
  const existing = { translate: { endpointPreset: 'https://api.openai.com/v1', apiKey: 'fixture-key' },
    clearedSecretFields: ['llm.apiKey'] };
  const clean = security.sanitizeSettings({ translate: { endpointPreset: 'https://api.openai.com/v1' } },
    { allowSecrets: false, existingSettings: existing });
  const loaded = mergeSettingsSecrets(splitSettingsSecrets(clean).publicSettings,
    { 'translate.apiKey': 'fixture-key', 'llm.apiKey': 'old-cleared-fixture' });
  assert.equal(loaded.translate.apiKey, 'fixture-key');
  assert.equal(loaded.llm?.apiKey, undefined);
});

test('LLM endpoint swap clears only the affected local vault fields', () => {
  const clean = security.sanitizeSettings({ llm: { endpointPreset: 'custom', customBaseUrl: 'https://new.example/v1' } },
    { allowSecrets: false, existingSettings: { llm: { endpointPreset: 'https://api.openai.com/v1', apiKey: 'fixture' } } });
  const loaded = mergeSettingsSecrets(splitSettingsSecrets(clean).publicSettings,
    { 'llm.apiKey': 'fixture', hfToken: 'fixture-hf' });
  assert.equal(loaded.llm.apiKey, undefined);
  assert.equal(loaded.hfToken, 'fixture-hf');
});

test('malformed recovery journal is quarantined without deleting evidence', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-r466-journal-'));
  const journal = path.join(root, '.whisper-settings-transaction.json');
  try {
    fs.writeFileSync(journal, '{broken');
    assert.equal(security.recoverJsonTransaction(journal), false);
    const quarantined = fs.readdirSync(root).find(file => file.startsWith('.whisper-settings-transaction.json.corrupt-'));
    assert.ok(quarantined);
    assert.equal(fs.readFileSync(path.join(root, quarantined), 'utf8'), '{broken');
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});

test('subtitle watcher decodes legacy Turkish bytes exactly like the initial reader', () => {
  const start = main.indexOf('function notifySubtitleFileChanged(');
  const body = main.slice(start, main.indexOf('\nfunction pollSubtitleWatchFiles', start));
  let result;
  vm.runInNewContext(body + '\nnotifySubtitleFileChanged("fixture.srt");', {
    fs: { statSync: () => ({ size: 20, mtimeMs: 1 }), readFileSync: (_file, encoding) => {
      assert.equal(encoding, undefined); return Buffer.from([0xfe, 0xf0, 0xfd]);
    } }, path, ownSubtitleWrites: new Map(), decodeSubtitleBuffer: () => ({ text: 'şğı' }),
    mainWindow: { isDestroyed: () => false, webContents: { send: (_channel, payload) => { result = payload; } } },
  });
  assert.equal(result?.content, 'şğı');
});

test('burn-in reserves preflight before authorization and releases it after failure', async () => {
  let handler, release;
  const gate = new Promise(resolve => { release = resolve; });
  const context = { ipcMain: { handle: (_name, fn) => { handler = fn; } },
    authorizedBrowserSender: () => true, burninJob: null, burninStartPending: false,
    jobStarting: false, activeJob: null, browserLiveAsr: null, modelBenchmarkJob: null,
    modelProcesses: new Map(), dubService: { running: () => false },
    authorizeMediaFile: async value => { await gate; return value; },
    authorizeSubtitleFile: async () => { throw Error('fixture access rejected'); } };
  const start = main.indexOf("ipcMain.handle('burnin:start',");
  vm.runInNewContext(main.slice(start, main.indexOf("ipcMain.handle('burnin:cancel',", start)), context);
  const first = handler({}, 'video.mp4', 'sub.srt');
  try {
    assert.equal(context.burninStartPending, true);
    assert.equal((await handler({}, 'video.mp4', 'sub.srt')).ok, false);
  } finally { release(); await first; }
  assert.equal(context.burninStartPending, false);
});

test('failed queue/history writes never replace a valid backup with a corrupt primary', () => {
  for (const name of ['writeQueueState', 'saveHistory']) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-r466-backup-'));
    const file = path.join(root, 'state.json');
    try {
      fs.writeFileSync(file, '{broken'); fs.writeFileSync(file + '.bak', '{"valid":true}');
      const start = main.indexOf(`function ${name}(`);
      const body = main.slice(start, main.indexOf('\n}\n', start) + 3);
      vm.runInNewContext(body + `\n${name}([]);`, { fs, queueStatePath: () => file,
        historyPath: () => file, queueSnapshotForDisk: value => value, HISTORY_LIMIT: 200,
        writeJsonAtomic: () => { throw Error('fixture disk failure'); } });
      assert.equal(fs.readFileSync(file + '.bak', 'utf8'), '{"valid":true}', name);
    } finally { fs.rmSync(root, { recursive: true, force: true }); }
  }
});

test('settings transaction flushes journal before replacing target files', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-r466-flush-'));
  const events = [], descriptors = new Map(), file = path.join(root, 'settings.json');
  const io = { ...fs, openSync(target, mode) { const fd = fs.openSync(target, mode); descriptors.set(fd, target); return fd; },
    fsyncSync(fd) { events.push(['flush', descriptors.get(fd)]); fs.fsyncSync(fd); },
    renameSync(from, to) { events.push(['rename', from]); fs.renameSync(from, to); } };
  try {
    fs.writeFileSync(file, '{}'); security.writeJsonTransaction([{ filePath: file, value: { updated: true } }], io, 'r466');
    const flush = events.findIndex(([kind, target]) => kind === 'flush' && target.endsWith('.whisper-settings-transaction.json'));
    const rename = events.findIndex(([kind]) => kind === 'rename');
    assert.ok(flush >= 0 && flush < rename);
  } finally { fs.rmSync(root, { recursive: true, force: true }); }
});
