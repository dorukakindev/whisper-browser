const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { spawnSync } = require('child_process');

const {
  BACKUP_VERSION,
  MAX_IMPORT_BYTES,
  MAX_JSON_DEPTH,
  PERSIST_CHECKBOX_CONTROLS,
  PERSIST_VALUE_CONTROLS,
  SettingsValidationError,
  assertSafeJsonFile,
  buildSecretEnv,
  createBackupPayload,
  parseImportText,
  publicSettings,
  recoverJsonTransaction,
  sanitizeAbsolutePath,
  sanitizeSettings,
  withoutSecretEnv,
  writeJsonTransaction,
} = require('../src/settings-security');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  PASS  ${name}`);
  } catch (error) {
    console.error(`  FAIL  ${name}: ${error.stack || error.message}`);
    process.exitCode = 1;
  }
}

function extractRendererList(source, name) {
  const match = source.match(new RegExp(`const ${name} = \\[(.*?)\\];`, 's'));
  assert(match, `${name} renderer içinde bulunamadı`);
  return [...match[1].matchAll(/'([^']+)'/g)].map((item) => item[1]);
}

function safeSettings(extra = {}) {
  return {
    glossary: ['mitoloji'],
    inputDir: 'C:\\Whisper\\GİRDİ',
    outputDir: 'C:\\Altyazilar',
    watchDir: 'D:\\Videolar',
    lastInputDir: 'D:\\Girdiler',
    preset: 'film',
    translate: {
      apiKey: 'yerel-ceviri',
      endpointPreset: 'https://api.openai.com/v1',
      customBaseUrl: '',
      model: 'gpt-test',
    },
    llm: {
      apiKey: 'yerel-llm',
      endpointPreset: 'https://api.deepseek.com',
      customBaseUrl: '',
      model: 'deepseek-test',
    },
    manga: {
      apiKey: 'yerel-manga',
      endpointPreset: 'inherit',
      customBaseUrl: '',
      model: 'vision-test',
    },
    hfToken: 'yerel-hf',
    ui: { model: 'tiny', engine: 'faster', fixTimings: true, translate: false },
    playerPositions: {
      'file:C:\\video.mkv': { t: 45, d: 3600, title: 'Video', at: 1700000000000 },
    },
    ...extra,
  };
}

function bundled(settings = safeSettings(), extra = {}) {
  return JSON.stringify({ backupVersion: BACKUP_VERSION, settings, browserPlaces: { history: [], bookmarks: [] }, watchLibrary: [], ...extra });
}

test('renderer kalıcılık listeleri güvenlik şemasıyla bire bir eşleşir', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
  assert.deepStrictEqual(extractRendererList(source, 'PERSIST_VALUE_CONTROLS'), PERSIST_VALUE_CONTROLS);
  assert.deepStrictEqual(extractRendererList(source, 'PERSIST_CHECKBOX_CONTROLS'), PERSIST_CHECKBOX_CONTROLS);
});

test('girdi ve çıktı klasörleri mutlak yol olarak korunur', () => {
  const clean = sanitizeSettings(safeSettings());
  assert.equal(clean.inputDir, 'C:\\Whisper\\GİRDİ');
  assert.equal(clean.outputDir, 'C:\\Altyazilar');
  assert.throws(
    () => sanitizeSettings(safeSettings({ inputDir: '..\\girdi' })),
    /Girdi klasörü mutlak bir yol/,
  );
});

test('main import/export ve Python env çağrı yolları güvenli yardımcılara bağlıdır', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const backend = fs.readFileSync(path.join(__dirname, '..', 'backend', 'transcribe.py'), 'utf8');
  const exportBody = main.slice(main.indexOf("ipcMain.handle('settings:export'"), main.indexOf("ipcMain.handle('settings:import'"));
  const importBody = main.slice(main.indexOf("ipcMain.handle('settings:import'"), main.indexOf("ipcMain.handle('maintenance:updateYtdlp'"));
  const transcribeBody = main.slice(main.indexOf("ipcMain.handle('transcribe:start'"), main.indexOf("ipcMain.handle('maintenance:updateYtdlp'", main.indexOf("ipcMain.handle('transcribe:start'")));
  assert.match(exportBody, /createBackupPayload/);
  assert.match(exportBody, /writeJsonTransaction/);
  assert.doesNotMatch(exportBody, /settings:\s*loadSettings\(\)/);
  assert.match(importBody, /parseImportText\(readImportFile/);
  assert.match(importBody, /writeJsonTransaction\(entries\)/);
  assert.match(transcribeBody, /buildSecretEnv\(process\.env, options\)/);
  assert.doesNotMatch(transcribeBody, /args\.push\(['"]--(?:hf-token|llm-api-key|translate-api-key)/);
  assert.match(backend, /os\.environ\.get\("WHISPER_HF_TOKEN"/);
  assert.match(backend, /os\.environ\.get\("WHISPER_LLM_API_KEY"/);
  assert.match(backend, /os\.environ\.get\("WHISPER_TRANSLATE_API_KEY"/);
  assert.match(main, /function spawn\(command, args, options = \{\}\)[\s\S]*options\.env \|\| withoutSecretEnv\(process\.env\)/);
  assert.match(main, /function spawnSync\(command, args, options = \{\}\)[\s\S]*options\.env \|\| withoutSecretEnv\(process\.env\)/);
  assert.strictEqual([...main.matchAll(/\brawSpawn\s*\(/g)].length, 1, 'spawn wrapper dışında ham spawn kullanılıyor');
  assert.strictEqual([...main.matchAll(/\brawSpawnSync\s*\(/g)].length, 1, 'spawnSync wrapper dışında ham spawnSync kullanılıyor');
  assert.match(main, /pythonEnvWithRuntime\([\s\S]*withoutSecretEnv\(process\.env\)/);
});

test('secret sentinel yalnız child env içinde kalır; argv, export ve görünür sonuçlarda yoktur', () => {
  const secrets = {
    hf: 'SENTINEL_HF_31_a91f',
    llm: 'SENTINEL_LLM_31_b82e',
    translate: 'SENTINEL_TRANSLATE_31_c73d',
    manga: 'SENTINEL_MANGA_31_d84f',
  };
  const settings = safeSettings({
    hfToken: secrets.hf,
    llm: { ...safeSettings().llm, apiKey: secrets.llm },
    translate: { ...safeSettings().translate, apiKey: secrets.translate },
    manga: { ...safeSettings().manga, apiKey: secrets.manga },
  });
  const backup = createBackupPayload(
    settings,
    { history: [{ url: 'https://example.test/', title: `Başlık ${secrets.hf}` }], bookmarks: [] },
    [{ key: 'file:x', title: `Film ${secrets.llm}` }],
    new Date('2026-09-01T00:00:00.000Z'),
  );
  const exported = JSON.stringify(backup);
  const visible = JSON.stringify(publicSettings(settings));
  for (const secret of Object.values(secrets)) {
    assert(!exported.includes(secret), 'secret export içinde bulundu');
    assert(!visible.includes(secret), 'secret public settings içinde bulundu');
  }

  const env = buildSecretEnv({ PATH: 'test' }, {
    diarize: true, hfToken: secrets.hf,
    llmPostprocess: true, llmApiKey: secrets.llm,
    translate: true, translateApiKey: secrets.translate,
  });
  const probe = spawnSync(process.execPath, ['-e', [
    "const names=['WHISPER_HF_TOKEN','WHISPER_LLM_API_KEY','WHISPER_TRANSLATE_API_KEY'];",
    "const values=names.map(n=>process.env[n]);",
    "process.stdout.write(JSON.stringify({envHas:values.every(Boolean),argvHas:values.some(v=>process.argv.includes(v))}));",
  ].join('')], { env, encoding: 'utf8' });
  assert.strictEqual(probe.status, 0);
  assert.deepStrictEqual(JSON.parse(probe.stdout), { envHas: true, argvHas: false });
  for (const secret of Object.values(secrets)) assert(!probe.stdout.includes(secret));
  const disabledEnv = buildSecretEnv({
    WHISPER_HF_TOKEN: secrets.hf,
    WHISPER_LLM_API_KEY: secrets.llm,
    WHISPER_TRANSLATE_API_KEY: secrets.translate,
  }, {});
  assert.strictEqual(disabledEnv.WHISPER_HF_TOKEN, undefined);
  assert.strictEqual(disabledEnv.WHISPER_LLM_API_KEY, undefined);
  assert.strictEqual(disabledEnv.WHISPER_TRANSLATE_API_KEY, undefined);
  const unrelatedEnv = withoutSecretEnv({
    PATH: 'test',
    WHISPER_HF_TOKEN: secrets.hf,
    WHISPER_LLM_API_KEY: secrets.llm,
    WHISPER_TRANSLATE_API_KEY: secrets.translate,
    whisper_hf_token: `${secrets.hf}-lower`,
    Whisper_Llm_Api_Key: `${secrets.llm}-mixed`,
  });
  assert.strictEqual(unrelatedEnv.WHISPER_HF_TOKEN, undefined);
  assert.strictEqual(unrelatedEnv.WHISPER_LLM_API_KEY, undefined);
  assert.strictEqual(unrelatedEnv.WHISPER_TRANSLATE_API_KEY, undefined);
  assert.strictEqual(unrelatedEnv.whisper_hf_token, undefined);
  assert.strictEqual(unrelatedEnv.Whisper_Llm_Api_Key, undefined);
  const unrelatedProbe = spawnSync(process.execPath, ['-e', [
    "const names=['WHISPER_HF_TOKEN','WHISPER_LLM_API_KEY','WHISPER_TRANSLATE_API_KEY'];",
    "process.stdout.write(JSON.stringify({envHas:names.some(n=>process.env[n]),argvHas:names.some(n=>process.argv.includes(process.env[n]||'__missing__'))}));",
  ].join('')], { env: unrelatedEnv, encoding: 'utf8' });
  assert.strictEqual(unrelatedProbe.status, 0);
  assert.deepStrictEqual(JSON.parse(unrelatedProbe.stdout), { envHas: false, argvHas: false });
  for (const secret of Object.values(secrets)) assert(!unrelatedProbe.stdout.includes(secret));

  const imported = parseImportText(bundled(settings), safeSettings());
  assert.strictEqual(imported.ignoredSecretCount, 4);
  const observable = JSON.stringify({ publicSettings: imported.publicSettings, ignoredSecrets: imported.ignoredSecretCount });
  for (const secret of Object.values(secrets)) assert(!observable.includes(secret));

  const oldMutant = JSON.stringify({ settings });
  assert(Object.values(secrets).some((secret) => oldMutant.includes(secret)), 'negatif arama eski davranış mutantını yakalamadı');
});

test('tüm secret girişleri ekranda parola alanı olarak maskelenir', () => {
  const html = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'index.html'), 'utf8');
  for (const id of ['hfToken', 'translateApiKey', 'mangaApiKey', 'llmApiKey']) {
    const match = html.match(new RegExp(`<input\\b[^>]*\\bid="${id}"[^>]*>`));
    assert(match, `${id} giriş alanı bulunamadı`);
    assert.match(match[0], /\btype="password"/, `${id} açık metin gösteriliyor`);
    assert.match(match[0], /\bautocomplete="off"/, `${id} otomatik doldurmaya açık`);
  }
});

test('tarayıcı yedek URLsi basic auth, hassas sorgu ve fragment secretlarını taşımaz', () => {
  const { safePlaceUrl: safeBrowserPlaceUrl } = require('../src/browser-place-url');
  const sentinels = ['SENTINEL_BASIC_AUTH_31', 'SENTINEL_QUERY_31', 'SENTINEL_HASH_31'];
  const clean = safeBrowserPlaceUrl(
    `https://demo:${sentinels[0]}@example.test/watch?token=${sentinels[1]}&lang=tr#${sentinels[2]}`,
  );
  assert.strictEqual(clean, 'https://example.test/watch?lang=tr');
  for (const sentinel of sentinels) assert(!clean.includes(sentinel));
  assert.strictEqual(safeBrowserPlaceUrl('file:///C:/secret.txt'), '');
});

test('tüm kalıcı UI ayarları kaydet ve yeniden yükle turunda korunur', () => {
  const enumValues = {
    model: 'tiny', engine: 'faster', task: 'transcribe', formats: 'srt', computeType: 'float16',
    device: 'cpu', splitMode: 'sentence', wrapMode: 'balanced', audioPreprocess: 'none',
    translateRegister: 'general', translateProfanity: 'medium', translateContext: '4',
    playerSpeed: '1.25', playerPlaybackPolicy: 'loop-cue', youtubeCookieBrowser: 'firefox',
    browserMangaTarget: 'tr', browserMangaFont: 'comic', browserPageTarget: 'en',
    browserPageMode: 'bilingual', browserSubtitleAutomation: 'ask',
    browserPreferredSubtitleMode: 'both', browserSponsorMode: 'auto', browserAudioProfile: 'night', uiTheme: 'light', uiLocale: 'tr',
  };
  const numericValues = {
    beamSize: '5', bestOf: '5', batchSize: '8', vadThreshold: '0.5', maxLineWidth: '42',
    timingGap: '0.6', hardMaxChars: '160', incompleteGap: '1', continuationGap: '1.5',
    maxCps: '20', temperature: '0.2', patience: '1', lengthPenalty: '1',
    repetitionPenalty: '1.1', noRepeatNgramSize: '2', compressionRatioThreshold: '2.4',
    logProbThreshold: '-1', noSpeechThreshold: '0.6', vadMinSpeechMs: '250',
    vadMinSilenceMs: '500', vadSpeechPadMs: '200', vadMaxSpeechS: '30',
    translateWorkers: '4', llmWorkers: '2', playerVolume: '75', playerCueRepeatCount: '7',
    subSize: '28', subOffset: '0',
    browserMangaWorkers: '2', browserMangaMaxImages: '48', browserMangaFontScale: '100',
    browserOverlayScale: '100', browserOverlayOpacity: '90', browserOverlayBottom: '7',
    browserOverlayWidth: '86', browserOverlayMaxLines: '3',
    browserOverlayGap: '24',
    browserVideoBrightness: '115', browserVideoContrast: '90',
    browserSilenceSpeedRate: '3', browserSilenceThresholdDb: '-45',
  };
  const ui = Object.fromEntries(PERSIST_VALUE_CONTROLS.map((id) => [
    id, enumValues[id] ?? numericValues[id] ?? (id.endsWith('BaseUrl') ? '' : `değer-${id}`),
  ]));
  for (const id of PERSIST_CHECKBOX_CONTROLS) ui[id] = id.length % 2 === 0;
  const expected = sanitizeSettings({
    ...safeSettings(),
    presetReference: 'film',
    subtitleModelDefault38Applied: true,
    manga: {
      apiKey: 'yerel-manga', endpointPreset: 'inherit', customBaseUrl: '', model: 'vision-test',
      targetLanguage: 'tr', workers: 2, maxImages: 48, fontScale: 1,
      autoTranslate: true, verticalText: false, sfxStyle: true,
    },
    browserSponsorExemptions: { 'browser:test': { ids: ['one'], updatedAt: 1 } },
    browserWorkflows: [{ id: 'workflow-1', name: 'Test' }],
    ui,
  }, { allowSecrets: true });
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-settings-roundtrip-'));
  try {
    const filePath = path.join(dir, 'settings.json');
    writeJsonTransaction([{ filePath, value: expected }]);
    const reloaded = sanitizeSettings(JSON.parse(fs.readFileSync(filePath, 'utf8')), { allowSecrets: true });
    assert.deepStrictEqual(reloaded, expected);
    assert.deepStrictEqual(Object.keys(reloaded.ui), [...PERSIST_VALUE_CONTROLS, ...PERSIST_CHECKBOX_CONTROLS]);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('eski düz ayar ve v2/v3 yedek migration işlemleri tekrarlanabilir ve idempotenttir', () => {
  const existing = safeSettings();
  const legacy = JSON.stringify({ preset: 'fast', ui: { model: 'small', fixTimings: false }, hfToken: 'ithal-hf' });
  const migratedLegacy = parseImportText(legacy, existing);
  assert.strictEqual(migratedLegacy.bundled, false);
  assert.strictEqual(migratedLegacy.settings.preset, 'fast');
  assert.strictEqual(migratedLegacy.settings.hfToken, existing.hfToken);
  assert.strictEqual(migratedLegacy.publicSettings.hfToken, undefined);
  for (const version of [2, 3]) {
    const first = parseImportText(JSON.stringify({ backupVersion: version, settings: safeSettings() }), existing).settings;
    const restarted = sanitizeSettings(JSON.parse(JSON.stringify(first)), { allowSecrets: true });
    assert.deepStrictEqual(restarted, first);
  }
});

test('prototype pollution anahtarları tüm derinliklerde reddedilir ve prototip değişmez', () => {
  const payloads = [
    '{"__proto__":{"polluted":true}}',
    '{"backupVersion":3,"settings":{"constructor":{"prototype":{"polluted":true}}}}',
    '{"backupVersion":3,"settings":{"ui":{"prototype":{"polluted":true}}}}',
  ];
  for (const payload of payloads) assert.throws(() => parseImportText(payload, safeSettings()), SettingsValidationError);
  assert.strictEqual({}.polluted, undefined);
});

test('boyut, derinlik, kök türü, enum, tip ve path traversal sınırları uygulanır', () => {
  assert.throws(() => parseImportText('[]', safeSettings()), /kökü nesne/);
  assert.throws(() => parseImportText('{"yarım":', safeSettings()), /geçerli JSON/);
  assert.throws(() => parseImportText(bundled(safeSettings({ preset: 'saldırgan' })), safeSettings()), /profili geçersiz/);
  assert.throws(() => parseImportText(bundled(safeSettings({ ui: { model: 7 } })), safeSettings()), /metin olmalıdır/);
  assert.throws(() => parseImportText(bundled(safeSettings({ ui: { model: 'evil-model' } })), safeSettings()), /geçersiz bir değer/);
  assert.throws(() => parseImportText(bundled(safeSettings({ ui: { model: 'tiny', beamSize: '999' } })), safeSettings()), /1-10 aralığında/);
  assert.throws(() => parseImportText(bundled(safeSettings({ outputDir: '..\\..\\kaçış' })), safeSettings()), /mutlak bir yol/);
  assert.throws(() => parseImportText(JSON.stringify({ backupVersion: 99, settings: {} }), safeSettings()), /sürümü desteklenmiyor/);

  let deep = { leaf: true };
  for (let i = 0; i < MAX_JSON_DEPTH + 2; i += 1) deep = { nested: deep };
  assert.throws(() => parseImportText(JSON.stringify({ backupVersion: 3, settings: { ui: {}, deep } }), safeSettings()), /seviye/);
  const oversized = JSON.stringify({ padding: 'x'.repeat(MAX_IMPORT_BYTES) });
  assert(Buffer.byteLength(oversized, 'utf8') > MAX_IMPORT_BYTES);
  assert.throws(() => parseImportText(oversized, safeSettings()), /bayt/);

  const unicode = parseImportText(JSON.stringify({ preset: 'film', 'ｍodel': 'evil', 'model\u200d': 'evil' }), safeSettings());
  assert.strictEqual(unicode.settings.preset, 'film');
  assert.strictEqual(unicode.settings['ｍodel'], undefined);
  assert.strictEqual(unicode.settings['model\u200d'], undefined);
});

test('en az 100 schema tabanlı adversarial payload deterministik olarak sınıflandırılır', () => {
  let seed = 0x31c0de;
  const random = () => {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    return seed / 0x100000000;
  };
  const total = 512;
  let accepted = 0;
  let rejected = 0;
  const durations = [];
  for (let i = 0; i < total; i += 1) {
    const category = i % 8;
    const raw = safeSettings();
    let shouldAccept = false;
    if (category === 0) {
      raw.ui = { model: ['tiny', 'small', 'medium'][Math.floor(random() * 3)], fixTimings: random() > 0.5 };
      shouldAccept = true;
    } else if (category === 1) {
      raw[`ünicode_${i}_鍵`] = { ignored: true };
      shouldAccept = true;
    } else if (category === 2) raw.preset = `geçersiz-${i}`;
    else if (category === 3) raw.ui = { fixTimings: i };
    else if (category === 4) raw.outputDir = `..\\kaçış-${i}`;
    else if (category === 5) raw.translate = { endpointPreset: 'javascript:alert(1)', apiKey: `SENTINEL_${i}` };
    else if (category === 6) raw.glossary = new Array(501).fill(`terim-${i}`);
    else raw.playerPositions = { x: { t: -1, d: 2, at: 3 } };
    const start = process.hrtime.bigint();
    let didAccept = false;
    try { parseImportText(bundled(raw), safeSettings()); didAccept = true; } catch (error) {
      assert(error instanceof SettingsValidationError);
    }
    durations.push(Number(process.hrtime.bigint() - start) / 1e6);
    assert.strictEqual(didAccept, shouldAccept, `payload ${i} yanlış sınıflandırıldı`);
    if (didAccept) accepted += 1; else rejected += 1;
  }
  durations.sort((a, b) => a - b);
  const p95 = durations[Math.floor(durations.length * 0.95)];
  assert.strictEqual(accepted, 128);
  assert.strictEqual(rejected, 384);
  console.log(`        fuzz=512 kabul=${accepted} ret=${rejected} p95=${p95.toFixed(3)} ms`);
});

test('normal JSON hedefi kabul edilir; .txt, göreli yol ve symlink hedefi reddedilir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-settings-path-'));
  let junctionDir = '';
  try {
    const regular = path.join(dir, 'ayar.json');
    fs.writeFileSync(regular, '{}', 'utf8');
    assert.doesNotThrow(() => assertSafeJsonFile(regular, fs, { mustExist: true }));
    assert.throws(() => assertSafeJsonFile(path.join(dir, 'ayar.txt'), fs), /\.json/);
    assert.throws(() => assertSafeJsonFile('göreli.json', fs), /mutlak/);
    assert.throws(() => sanitizeAbsolutePath('..\\kaçış.srt', 'Altyazı yolu'), /mutlak/);
    assert.strictEqual(sanitizeAbsolutePath('C:\\altyazı\\film.srt'), 'C:\\altyazı\\film.srt');
    const fakeFs = {
      existsSync: () => true,
      lstatSync: () => ({ isSymbolicLink: () => true, isFile: () => true }),
    };
    assert.throws(() => assertSafeJsonFile(path.join(dir, 'bag.json'), fakeFs, { mustExist: true }), /Sembolik bağlantı/);

    const junctionTarget = path.join(dir, 'junction-target');
    junctionDir = path.join(dir, 'junction-parent');
    fs.mkdirSync(junctionTarget);
    fs.writeFileSync(path.join(junctionTarget, 'inside.json'), '{}', 'utf8');
    fs.symlinkSync(junctionTarget, junctionDir, 'junction');
    assert.strictEqual(fs.lstatSync(junctionDir).isSymbolicLink(), true);
    assert.throws(
      () => assertSafeJsonFile(path.join(junctionDir, 'inside.json'), fs, { mustExist: true }),
      /Sembolik bağlantı/,
    );
  } finally {
    try { if (junctionDir && fs.existsSync(junctionDir)) fs.unlinkSync(junctionDir); } catch (_) {}
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('çok dosyalı atomic write başarıda idempotent, orta-commit faultunda tam rollback yapar', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-settings-tx-'));
  try {
    const files = ['settings.json', 'browser-places.json', 'watch-library.json'].map((name) => path.join(dir, name));
    files.forEach((file, index) => fs.writeFileSync(file, JSON.stringify({ old: index }), 'utf8'));
    const before = files.map((file) => fs.readFileSync(file, 'utf8'));
    const entries = files.map((file, index) => ({ filePath: file, value: { new: index } }));
    let renames = 0;
    const faultFs = new Proxy(fs, {
      get(target, prop) {
        if (prop === 'renameSync') return (...args) => {
          renames += 1;
          if (renames === 4) throw new Error('ENOSPC fault injection');
          return target.renameSync(...args);
        };
        const value = target[prop];
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    assert.throws(() => writeJsonTransaction(entries, faultFs, 'fault-31'), /fault injection/);
    assert.deepStrictEqual(files.map((file) => fs.readFileSync(file, 'utf8')), before);
    assert.deepStrictEqual(fs.readdirSync(dir).sort(), files.map((file) => path.basename(file)).sort());

    writeJsonTransaction(entries, fs, 'success-31');
    const once = files.map((file) => fs.readFileSync(file, 'utf8'));
    writeJsonTransaction(entries, fs, 'repeat-31');
    assert.deepStrictEqual(files.map((file) => fs.readFileSync(file, 'utf8')), once);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('işlem günlüğü ve tüm rename sınırlarında process kapanırsa eski durum geri kurulur', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-settings-crash-'));
  try {
    const modulePath = path.join(__dirname, '..', 'src', 'settings-security.js');
    let scenarios = 0;
    for (let existingMask = 0; existingMask < 8; existingMask += 1) {
      const existingCount = [0, 1, 2].filter((index) => existingMask & (1 << index)).length;
      const renameCount = 3 + existingCount;
      // crashAt=0: günlük diske yazıldı, ilk rename henüz yapılmadı.
      // Diğer değerler: ilgili rename tamamlandıktan hemen sonra process kapanır.
      for (let crashAt = 0; crashAt <= renameCount; crashAt += 1) {
        const caseDir = path.join(dir, `mask-${existingMask}-crash-${crashAt}`);
        fs.mkdirSync(caseDir);
        const files = ['settings.json', 'browser-places.json', 'watch-library.json']
          .map((name) => path.join(caseDir, name));
        const before = files.map((file, index) => {
          if (!(existingMask & (1 << index))) return null;
          const serialized = JSON.stringify({ old: index });
          fs.writeFileSync(file, serialized, 'utf8');
          return serialized;
        });
        const script = [
          `const api=require(${JSON.stringify(modulePath)});`,
          "const fs=require('fs');let n=0;",
          `const crashAt=${crashAt};`,
          "const f=new Proxy(fs,{get(t,p){if(p==='renameSync')return(...a)=>{const r=t.renameSync(...a);n++;if(n===crashAt)process.exit(90+crashAt);return r};if(p==='writeFileSync')return(...a)=>{const r=t.writeFileSync(...a);if(crashAt===0&&String(a[0]).endsWith('.whisper-settings-transaction.json'))process.exit(90);return r};const v=t[p];return typeof v==='function'?v.bind(t):v}});",
          `const files=${JSON.stringify(files)};`,
          `api.writeJsonTransaction(files.map((file,index)=>({filePath:file,value:{new:index}})),f,${JSON.stringify(`crash-${existingMask}-${crashAt}`)});`,
        ].join('');
        const child = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
        assert.strictEqual(child.status, 90 + crashAt, `mask=${existingMask} crashAt=${crashAt}\n${child.stderr}`);
        const journal = path.join(caseDir, '.whisper-settings-transaction.json');
        assert(fs.existsSync(journal), `mask=${existingMask} crashAt=${crashAt}: işlem günlüğü yok`);
        assert.strictEqual(recoverJsonTransaction(journal), true);
        files.forEach((file, index) => {
          if (before[index] === null) {
            assert.strictEqual(fs.existsSync(file), false, `mask=${existingMask} crashAt=${crashAt}: yeni dosya kaldı`);
          } else {
            assert.strictEqual(fs.readFileSync(file, 'utf8'), before[index], `mask=${existingMask} crashAt=${crashAt}: eski dosya dönmedi`);
          }
        });
        const expectedFiles = files
          .filter((_, index) => before[index] !== null)
          .map((file) => path.basename(file))
          .sort();
        assert.deepStrictEqual(fs.readdirSync(caseDir).sort(), expectedFiles);
        scenarios += 1;
      }
    }
    assert.strictEqual(scenarios, 44);
    console.log(`        process_crash_scenarios=${scenarios}`);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('commit işareti yazıldıktan hemen sonra process kapanırsa yeni durum korunur', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-settings-committed-crash-'));
  try {
    const files = ['settings.json', 'browser-places.json', 'watch-library.json'].map((name) => path.join(dir, name));
    files.forEach((file, index) => fs.writeFileSync(file, JSON.stringify({ old: index }), 'utf8'));
    const modulePath = path.join(__dirname, '..', 'src', 'settings-security.js');
    const script = [
      `const api=require(${JSON.stringify(modulePath)});`,
      "const fs=require('fs');",
      "const f=new Proxy(fs,{get(t,p){if(p==='writeFileSync')return(...a)=>{const r=t.writeFileSync(...a);if(String(a[0]).endsWith('.committed'))process.exit(97);return r};const v=t[p];return typeof v==='function'?v.bind(t):v}});",
      `const files=${JSON.stringify(files)};`,
      "api.writeJsonTransaction(files.map((file,index)=>({filePath:file,value:{new:index}})),f,'committed-crash-31');",
    ].join('');
    const child = spawnSync(process.execPath, ['-e', script], { encoding: 'utf8' });
    assert.strictEqual(child.status, 97, child.stderr);
    const journal = path.join(dir, '.whisper-settings-transaction.json');
    assert(fs.existsSync(journal), 'commit sonrası işlem günlüğü yok');
    assert.strictEqual(recoverJsonTransaction(journal), true);
    assert.deepStrictEqual(files.map((file) => JSON.parse(fs.readFileSync(file, 'utf8'))), [
      { new: 0 }, { new: 1 }, { new: 2 },
    ]);
    assert.deepStrictEqual(fs.readdirSync(dir).sort(), files.map((file) => path.basename(file)).sort());
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('commit sonrası backup temizleme hatası yeniden başlatmada yeni durumu koruyarak temizlenir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-settings-cleanup-'));
  try {
    const file = path.join(dir, 'settings.json');
    fs.writeFileSync(file, JSON.stringify({ old: true }), 'utf8');
    let injected = false;
    const cleanupFaultFs = new Proxy(fs, {
      get(target, prop) {
        if (prop === 'unlinkSync') return (targetPath) => {
          if (!injected && String(targetPath).endsWith('.bak')) {
            injected = true;
            throw new Error('cleanup fault');
          }
          return target.unlinkSync(targetPath);
        };
        const value = target[prop];
        return typeof value === 'function' ? value.bind(target) : value;
      },
    });
    writeJsonTransaction([{ filePath: file, value: { new: true } }], cleanupFaultFs, 'cleanup-31');
    const journal = path.join(dir, '.whisper-settings-transaction.json');
    assert(fs.existsSync(journal));
    assert.strictEqual(recoverJsonTransaction(journal), true);
    assert.deepStrictEqual(JSON.parse(fs.readFileSync(file, 'utf8')), { new: true });
    assert.deepStrictEqual(fs.readdirSync(dir), ['settings.json']);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('saldırgan işlem günlüğü kendi klasörü dışındaki dosyalara dokunamaz', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-settings-hostile-journal-'));
  try {
    for (const hostileField of ['filePath', 'tmp', 'backup', 'marker']) {
      const caseDir = path.join(dir, hostileField);
      const stateDir = path.join(caseDir, 'state');
      const outsideDir = path.join(caseDir, 'outside');
      fs.mkdirSync(stateDir, { recursive: true });
      fs.mkdirSync(outsideDir);
      const token = 'hostile-31';
      const settingsFile = path.join(stateDir, 'settings.json');
      const journal = path.join(stateDir, '.whisper-settings-transaction.json');
      const victim = path.join(outsideDir, 'victim.json');
      fs.writeFileSync(settingsFile, 'OLD', 'utf8');
      fs.writeFileSync(victim, 'KEEP', 'utf8');
      const payload = {
        version: 1,
        marker: `${journal}.${token}.committed`,
        records: [{
          filePath: settingsFile,
          tmp: `${settingsFile}.${token}.tmp`,
          backup: `${settingsFile}.${token}.bak`,
          existed: true,
        }],
      };
      if (hostileField === 'marker') payload.marker = victim;
      else payload.records[0][hostileField] = victim;
      if (hostileField === 'filePath') payload.records[0].existed = false;
      fs.writeFileSync(journal, JSON.stringify(payload), 'utf8');

      assert.throws(() => recoverJsonTransaction(journal), /Ayar işlem günlüğü/);
      assert.strictEqual(fs.readFileSync(victim, 'utf8'), 'KEEP', `${hostileField}: dış dosya değişti`);
      assert.strictEqual(fs.readFileSync(settingsFile, 'utf8'), 'OLD', `${hostileField}: ayar dosyası değişti`);
      assert.strictEqual(fs.existsSync(journal), true, `${hostileField}: reddedilen günlük silindi`);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('bozuk ve yarım import, mevcut ayar dosyasını değiştirmeden başarısız olur', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wl-settings-preserve-'));
  try {
    const currentFile = path.join(dir, 'settings.json');
    const current = JSON.stringify(safeSettings(), null, 2);
    fs.writeFileSync(currentFile, current, 'utf8');
    for (const bad of ['{"backupVersion":3,"settings":', '[]', JSON.stringify({ backupVersion: 99, settings: {} })]) {
      assert.throws(() => {
        const parsed = parseImportText(bad, safeSettings());
        writeJsonTransaction([{ filePath: currentFile, value: parsed.settings }], fs, `bad-${bad.length}`);
      });
      assert.strictEqual(fs.readFileSync(currentFile, 'utf8'), current);
    }
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

console.log(`\n${passed} settings güvenlik testi geçti${process.exitCode ? ' (başarısız test var)' : ''}`);
