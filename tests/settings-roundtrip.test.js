// R299 — settings:export ↔ settings:import tam-tur sadakat ratchet'i.
// Export zarfı → JSON metni → parseImportText → sanitizeSettings zincirinin
// her izinli alanı kayıpsız taşıdığını ve kayıplı alanların bilinen/kilitli
// davranış olduğunu doğrular.

const assert = require('assert');

const {
  PERSIST_CHECKBOX_CONTROLS,
  PERSIST_VALUE_CONTROLS,
  SettingsValidationError,
  createBackupPayload,
  parseImportText,
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

// Deterministik tohum — test dosyalarında Math.random yasak (ci-determinism).
function mulberry32(seed) {
  let a = seed >>> 0;
  return () => {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const ENUM_VALUES = {
  model: 'tiny', engine: 'faster-batched', task: 'translate', formats: 'srt,vtt,txt',
  computeType: 'int8_float16', device: 'auto', splitMode: 'sentence', wrapMode: 'balanced',
  audioPreprocess: 'loudnorm', translateRegister: 'documentary', translateProfanity: 'medium',
  translateContext: '4', playerPlaybackPolicy: 'loop-cue', youtubeCookieBrowser: 'firefox',
  browserMangaTarget: 'tr', browserMangaFont: 'comic', browserPageTarget: 'en',
  browserPageMode: 'bilingual', browserSubtitleAutomation: 'ask',
  browserPreferredSubtitleMode: 'both', browserSponsorMode: 'auto',
  browserAudioProfile: 'night', uiTheme: 'dark', uiLocale: 'tr',
  browserSearchEngine: 'duckduckgo', aiTranscriptScope: 'watched',
  browserPageScope: 'article', browserExportFormat: 'srt', browserExportTiming: 'synchronized',
  pdfExportFormat: 'md', pdfTargetLanguage: 'tr', browserPageExportFormat: 'json',
  networkBudget: 'balanced',
};
const MULTI_VALUES = {
  browserSponsorCategories: ['sponsor', 'intro'],
};
const NUMERIC_VALUES = {
  playerSpeed: '1.4', beamSize: '5', bestOf: '3', batchSize: '8', vadThreshold: '0.5',
  maxLineWidth: '42', timingGap: '0.8', hardMaxChars: '120', incompleteGap: '1.5',
  continuationGap: '2.5', maxCps: '17', temperature: '0.2', patience: '1.2',
  lengthPenalty: '1.0', repetitionPenalty: '1.1', noRepeatNgramSize: '3',
  compressionRatioThreshold: '2.4', logProbThreshold: '-1.0', noSpeechThreshold: '0.6',
  vadMinSpeechMs: '250', vadMinSilenceMs: '800', vadSpeechPadMs: '200',
  vadMaxSpeechS: '30', translateWorkers: '4', llmWorkers: '2', playerVolume: '80',
  playerCueRepeatCount: '5', subSize: '28', subOffset: '2', browserMangaWorkers: '3',
  browserMangaMaxImages: '60', browserMangaFontScale: '110', browserOverlayScale: '100',
  browserOverlayOpacity: '85', browserOverlayBottom: '8', browserOverlayWidth: '70',
  browserOverlayMaxLines: '2', browserOverlayGap: '12', browserVideoBrightness: '110',
  browserVideoContrast: '95', browserSilenceSpeedRate: '4',
  browserSilenceThresholdDb: '-45', stCardScale: '100', stCardFontScale: '100',
  timelineZoom: '60',
  minSpeakers: '1', maxSpeakers: '4', translatePriceIn: '0.01', translatePriceOut: '0.03',
};
const FREE_VALUES = {
  language: 'tr', translateTo: 'en', translateEndpointPreset: 'https://api.openai.com/v1',
  translateModel: 'gpt-test', initialPrompt: 'Altyazı için ön bilgi',
  translateBaseUrl: 'https://api.openai.com/v1',
  speakerMap: 'S01:Ahmet', abModel: 'gemini-test',
};

function fullUi() {
  const ui = {};
  for (const id of PERSIST_VALUE_CONTROLS) {
    ui[id] = MULTI_VALUES[id] ?? ENUM_VALUES[id] ?? NUMERIC_VALUES[id] ?? FREE_VALUES[id] ?? `değer-${id}`;
  }
  for (const id of PERSIST_CHECKBOX_CONTROLS) ui[id] = true;
  return ui;
}

function fullSettings() {
  return {
    glossary: ['mitoloji', 'Türkçe terim', 'süreklilik'],
    inputDir: 'C:\\Whisper\\GİRDİ',
    outputDir: 'D:\\Altyazı Çıktıları',
    watchDir: 'E:\\İzleme',
    lastInputDir: 'C:\\Son\\Girdi',
    preset: 'balanced',
    presetReference: 'quality',
    subtitleModelDefault38Applied: true,
    ui: fullUi(),
    playerPositions: {
      'media-α': { t: 12.5, d: 3600, title: 'Film — Türkçe başlık', at: 1727000000000 },
      'media-β': { t: 0, d: 0, title: '', at: 1 },
    },
    translate: {
      endpointPreset: 'https://api.openai.com/v1',
      customBaseUrl: '',
      model: 'gpt-test',
      modelProfiles: JSON.stringify({ 'https://api.openai.com/v1': ['gpt-test'] }),
    },
    manga: {
      endpointPreset: 'inherit', customBaseUrl: '', model: 'gpt-manga',
      modelProfiles: JSON.stringify({ 'https://api.openai.com/v1': ['gpt-manga'] }),
      targetLanguage: 'tr', fontFamily: 'comic',
      workers: 3, maxImages: 60, fontScale: 1.1,
      autoTranslate: true, verticalText: true, sfxStyle: false,
    },
    llm: {
      endpointPreset: 'https://api.deepseek.com', customBaseUrl: '',
      model: 'deepseek-chat',
      modelProfiles: JSON.stringify({ 'https://api.deepseek.com': ['deepseek-chat'] }),
    },
    browserSponsorExemptions: { 'örnek.test': ['segment-1', 'segment-2'], 'site.test': [] },
    browserWorkflows: [
      { id: 'wf-1', name: 'Gece işleri', enabled: true, steps: [{ op: 'transcribe' }] },
    ],
  };
}

function bundled(settings, extra = {}) {
  return JSON.stringify({ backupVersion: 3, exportedAt: '2026-09-30T00:00:00.000Z', secretsExcluded: true, settings, ...extra });
}

test('export → import tam-tur: tüm izinli alanlar sadakatle döner', () => {
  const settings = fullSettings();
  const backup = createBackupPayload(settings, { history: [], bookmarks: [] }, [], new Date('2026-09-30T00:00:00.000Z'));
  const imported = parseImportText(JSON.stringify(backup), {});
  const s = imported.settings;

  for (const key of ['glossary', 'inputDir', 'outputDir', 'watchDir', 'lastInputDir',
    'preset', 'presetReference', 'subtitleModelDefault38Applied', 'playerPositions']) {
    assert.deepStrictEqual(s[key], settings[key], `alan kaybı/değişimi: ${key}`);
  }
  assert.deepStrictEqual(s.ui, settings.ui, 'ui kontrolleri tam-turda değişti');
  // Endpoint grupları alan-bazlı değil bütün nesne olarak karşılaştırılır —
  // modelProfiles/customBaseUrl/manga seçeneklerinin kaybı yakalanır.
  assert.deepStrictEqual(s.translate, settings.translate, 'translate grubu kayıplı');
  assert.deepStrictEqual(s.manga, settings.manga, 'manga grubu kayıplı');
  assert.deepStrictEqual(s.llm, settings.llm, 'llm grubu kayıplı');
  assert.deepStrictEqual(s.browserSponsorExemptions, settings.browserSponsorExemptions, 'sponsor istisnaları kayıplı');
  assert.deepStrictEqual(s.browserWorkflows, settings.browserWorkflows, 'iş akışları kayıplı');
  assert(imported.bundled, 'zarf sürümü bundled sayılmalı');
});

test('tam-tur idempotent — ikinci içe aktarma aynı sonucu verir', () => {
  const settings = fullSettings();
  const first = parseImportText(bundled(settings), {});
  const second = parseImportText(bundled(first.settings), {});
  assert.deepStrictEqual(second.settings, first.settings);
  assert.deepStrictEqual(second.publicSettings, first.publicSettings);
});

test('endpoint kimliği değişirse mevcut apiKey taşınmaz, aynı kalırsa taşınır', () => {
  const existing = {
    translate: { endpointPreset: 'https://api.openai.com/v1', apiKey: 'MEVCUT_ANAHTAR_299' },
  };
  const sameEndpoint = parseImportText(bundled(fullSettings()), existing);
  assert.strictEqual(sameEndpoint.settings.translate.apiKey, 'MEVCUT_ANAHTAR_299');

  const changed = parseImportText(bundled(fullSettings()), {
    translate: { endpointPreset: 'https://api.deepseek.com', apiKey: 'MEVCUT_ANAHTAR_299' },
  });
  assert.strictEqual(changed.settings.translate.apiKey, undefined, 'yeni endpoint\'e sır sızdı');
});

test('bilinmeyen/gelecek-sürüm alanları düşürülür (downgrade kilitli davranış)', () => {
  const settings = { ...fullSettings(), futureField: 'x', ui: { ...fullUi(), futureUiKey: 'y' } };
  const imported = parseImportText(bundled(settings), {});
  assert.strictEqual(imported.settings.futureField, undefined);
  assert.strictEqual(imported.settings.ui.futureUiKey, undefined);
});

test('zarf bölümleri (browserPlaces/watchLibrary/learningAnnotations) taşınır', () => {
  const browserPlaces = { history: [{ url: 'https://örnek.test/film', title: 'Film' }], bookmarks: [{ url: 'https://yerimi.test/', title: 'Yer imi' }] };
  const watchLibrary = [{ key: 'media-1', title: 'Film', sourceRef: 'ref', localPath: 'D:\\film.mkv' }];
  const learningAnnotations = [{ id: 'n1', mediaUrl: 'https://x.test/v', quote: 'not' }];
  // Üretim yoluyla: zarfı createBackupPayload kurar (bundled() taklidi değil)
  // — export yarısındaki bölüm kaybı bu kontrolde yakalanır.
  const backup = createBackupPayload(
    fullSettings(), browserPlaces, watchLibrary,
    new Date('2026-09-30T00:00:00.000Z'), { learningAnnotations },
  );
  const imported = parseImportText(JSON.stringify(backup), {});
  assert.deepStrictEqual(imported.browserPlaces, browserPlaces);
  assert.deepStrictEqual(imported.watchLibrary, watchLibrary);
  assert.deepStrictEqual(imported.learningAnnotations, learningAnnotations);
});

test('backupVersion 2 mirası ve BOM/whitespace toleransı', () => {
  const v2 = parseImportText(`\uFEFF  {"backupVersion":2,"settings":{"preset":"fast","ui":{"model":"small"}}}  `, {});
  assert.strictEqual(v2.settings.preset, 'fast');
  assert.strictEqual(v2.settings.ui.model, 'small');
});

test('__proto__ içeren dosya bütün olarak reddedilir, sır-anahtarı düşer', () => {
  const sneaky = JSON.parse('{"__proto__":{"x":1},"glossary":["a"]}');
  assert.throws(() => parseImportText(bundled(sneaky), {}), SettingsValidationError);
  const imported = parseImportText(bundled(JSON.parse('{"hfToken":"SIZAN","glossary":["a"]}')), {});
  assert.strictEqual(imported.settings.hfToken, undefined, 'hfToken yedeğe içe aktarıldı');
  assert(!JSON.stringify(imported.publicSettings).includes('SIZAN'));
});

test('glossary trim/dedupe/boyut kuralları tam-turda korunur', () => {
  const s = parseImportText(bundled({ glossary: ['  alfa  ', 'alfa', 'beta', '  '] }), {});
  assert.deepStrictEqual(s.settings.glossary, ['alfa', 'beta']);
  assert.throws(
    () => parseImportText(bundled({ glossary: Array(501).fill('x') }), {}),
    SettingsValidationError,
  );
});

test('tohumlu fuzz — geçerli alt-kümeler tam-turda kayıpsız, bozuklar SettingsValidationError', () => {
  const rand = mulberry32(299001);
  const fields = ['glossary', 'inputDir', 'outputDir', 'preset', 'subtitleModelDefault38Applied', 'ui', 'playerPositions', 'translate', 'manga', 'llm'];
  const full = fullSettings();
  let roundtripped = 0;
  let rejected = 0;
  for (let i = 0; i < 150; i++) {
    const subset = {};
    for (const key of fields) {
      if (rand() < 0.6) subset[key] = full[key];
    }
    const hostile = rand();
    if (hostile < 0.15) subset.preset = `bozuk-${i}`;
    else if (hostile < 0.3) subset.inputDir = 'göreli/yol';
    else if (hostile < 0.4) subset.ui = { ...full.ui, beamSize: '999' };
    else if (hostile < 0.45) subset.ui = { ...full.ui, fixTimings: 'evet' };
    else if (hostile < 0.5) subset.playerPositions = { k: { t: 'NaN-miş', d: 1, at: 2 } };
    try {
      const first = parseImportText(bundled(subset), {});
      const second = parseImportText(bundled(first.settings), {});
      assert.deepStrictEqual(second.settings, first.settings, `tohum ${i}: idempotans bozuldu`);
      for (const [key, value] of Object.entries(subset)) {
        if (key === 'ui') assert.deepStrictEqual(first.settings.ui, value, `tohum ${i}: ui alanı değişti`);
        else assert.deepStrictEqual(first.settings[key], value, `tohum ${i}: ${key} alanı değişti`);
      }
      roundtripped += 1;
    } catch (error) {
      assert(error instanceof SettingsValidationError, `tohum ${i}: beklenmeyen hata tipi ${error.name}`);
      rejected += 1;
    }
  }
  assert(roundtripped > 40, `yeterli geçerli vaka yok: ${roundtripped}`);
  assert(rejected > 15, `yeterli bozuk vaka yok: ${rejected}`);
});

test('export zarfı şema sözleşmesi kilitli', () => {
  const backup = createBackupPayload(fullSettings(), {}, [], new Date('2026-09-30T00:00:00.000Z'));
  assert.strictEqual(backup.backupVersion, 3);
  assert.strictEqual(backup.exportedAt, '2026-09-30T00:00:00.000Z');
  assert.strictEqual(backup.secretsExcluded, true);
  assert.strictEqual(typeof backup.settings, 'object');
});

console.log(`settings-roundtrip: ${passed} kontrol geçti`);
