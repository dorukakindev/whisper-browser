const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');
const { normalizeProviderModelProfiles, serializeProviderModelProfiles } = require('./provider-model-profiles');
const { isSensitiveKey, startsWithSensitivePrefix } = require('./browser-sensitive-keys');

const SETTINGS_VERSION = 3;
const BACKUP_VERSION = 3;
const MAX_IMPORT_BYTES = 16 * 1024 * 1024;
const MAX_JSON_DEPTH = 12;
const MAX_JSON_NODES = 500000;
const MAX_TRANSACTION_RECORDS = 16;

const DANGEROUS_KEYS = new Set(['__proto__', 'prototype', 'constructor']);
const SECRET_KEYS = new Set([
  'hftoken', 'apikey', 'apikeyprofiles', 'llmapikey', 'translateapikey', 'token', 'secret', 'password',
]);

const PERSIST_VALUE_CONTROLS = Object.freeze([
  'model', 'engine', 'batchSize', 'language', 'task', 'formats', 'computeType', 'device',
  'beamSize', 'bestOf', 'vadThreshold', 'maxLineWidth', 'splitMode', 'timingGap',
  'wrapMode', 'hardMaxChars', 'maxCps', 'initialPrompt', 'incompleteGap', 'continuationGap', 'audioPreprocess',
  'temperature', 'patience', 'lengthPenalty', 'repetitionPenalty', 'noRepeatNgramSize',
  'compressionRatioThreshold', 'logProbThreshold', 'noSpeechThreshold',
  'vadMinSpeechMs', 'vadMinSilenceMs', 'vadSpeechPadMs', 'vadMaxSpeechS',
  'minSpeakers', 'maxSpeakers', 'llmWorkers',
  'translateTo', 'translateEndpointPreset', 'translateModel', 'translateWorkers',
  'translateRegister', 'translateProfanity', 'translateBaseUrl', 'translateContext',
  'subSize', 'subOffset', 'playerSpeed', 'playerVolume', 'playerPlaybackPolicy', 'playerCueRepeatCount', 'youtubeCookieBrowser',
  'browserMangaTarget', 'browserMangaFont', 'browserMangaWorkers', 'browserMangaMaxImages', 'browserMangaFontScale',
  'browserOverlayScale', 'browserOverlayOpacity', 'browserOverlayBottom', 'browserOverlayGap', 'browserOverlayWidth', 'browserOverlayMaxLines',
  'browserVideoBrightness', 'browserVideoContrast', 'browserSilenceSpeedRate', 'browserSilenceThresholdDb', 'browserAudioProfile',
  'browserPageTarget', 'browserPageMode',
  'browserSubtitleAutomation', 'browserPreferredSubtitleMode', 'browserSponsorMode', 'uiTheme', 'uiLocale',
  'stCardScale', 'stCardFontScale',
]);

const PERSIST_CHECKBOX_CONTROLS = Object.freeze([
  'fixTimings', 'snapToSpeech', 'mergeShort', 'mergeIncomplete', 'mergeContinuation', 'fixPunctuationCollapse',
  'confidenceReport', 'fixCommonErrors', 'dropRepeatedHallucinations', 'syncFixFramerate', 'syncPiecewise',
  'dedupe', 'langSuffix', 'vadFilter', 'conditionOnPrevious', 'temperatureFallback', 'qualityReport',
  'notifyOnDone', 'resume', 'diarize', 'labelSpeakers', 'translate', 'translateKeepSource',
  'translateRefine', 'translateCache', 'translateDedupe', 'dualSubtitle', 'watchEnabled',
  'primarySettingsOpen', 'playerAutoNext', 'playerWordHighlight',
  'llmPostprocess',
  'llmFixCensorship', 'llmFixHallucination', 'llmFixPunctuation', 'llmFixConsistency',
  'browserMangaAuto', 'browserMangaVertical', 'browserMangaSfx', 'browserOverlaySourceFirst',
  'browserHideSiteCaptions', 'browserRateFightback', 'browserPreservesPitch', 'browserDarkMode', 'browserReaderAuto',
  'browserYoutubeAppearance', 'browserYoutubeHideShorts',
  'browserNormalizeAudio', 'browserSilenceSpeedEnabled', 'browserPageAuto', 'browserPageIndexEnabled', 'browserHardwareAcceleration', 'browserAdblockEnabled',
  'browserAutoSkipAds', 'browserPlayerResponseAdPrune',
  'stHideShorts', 'stHideWatched', 'stHideLive', 'stHideTrending', 'stAutoRelated',
  'browserAutoPip',
]);

const UI_ENUMS = Object.freeze({
  model: ['large-v3', 'large-v3-turbo', 'large-v2', 'medium', 'small', 'base', 'tiny'],
  engine: ['faster', 'faster-batched', 'whisperx'],
  task: ['transcribe', 'translate'],
  formats: ['srt', 'vtt', 'txt', 'ass', 'json', 'srt,vtt,txt', 'srt,ass,json', 'srt,vtt,txt,ass,json'],
  computeType: ['float16', 'int8_float16', 'int8', 'float32'],
  device: ['cuda', 'cpu', 'auto'],
  splitMode: ['sentence', 'none', 'timing', 'smart'],
  wrapMode: ['none', 'sentence', 'balanced'],
  audioPreprocess: ['none', 'loudnorm', 'denoise', 'both'],
  translateRegister: ['documentary', 'drama', 'comedy', 'action', 'general'],
  translateProfanity: ['soft', 'medium', 'explicit'],
  translateContext: ['0', '2', '4', '6', '10'],
  playerSpeed: ['0.5', '0.75', '1', '1.25', '1.5', '1.75', '2'],
  playerPlaybackPolicy: ['normal', 'accelerate-gaps', 'skip-gaps', 'shadowing', 'loop-cue'],
  youtubeCookieBrowser: ['', 'firefox', 'chrome', 'edge', 'brave', 'vivaldi', 'opera'],
  browserMangaTarget: ['tr', 'en', 'de', 'fr', 'es', 'it', 'ru', 'ar'],
  browserMangaFont: ['comic', 'system', 'compact'],
  browserPageTarget: ['tr', 'en', 'de', 'fr', 'es', 'it', 'ru', 'ar'],
  browserPageMode: ['bilingual', 'replace'],
  browserSubtitleAutomation: ['off', 'ask', 'auto'],
  browserPreferredSubtitleMode: ['translation', 'both', 'source', 'off'],
  browserSponsorMode: ['off', 'ask', 'auto'],
  browserAudioProfile: ['off', 'night', 'dialogue', 'guard'],
  uiTheme: ['system', 'dark', 'light'],
  uiLocale: ['en', 'tr'],
});

const UI_NUMERIC_RANGES = Object.freeze({
  beamSize: [1, 10], bestOf: [1, 10], batchSize: [1, 32], vadThreshold: [0.1, 0.9],
  maxLineWidth: [20, 80], timingGap: [0.2, 1.5], hardMaxChars: [80, 320],
  incompleteGap: [0.5, 4], continuationGap: [0.5, 5], maxCps: [10, 30], temperature: [0, 1],
  patience: [0.5, 3], lengthPenalty: [0.5, 2], repetitionPenalty: [1, 2], noRepeatNgramSize: [0, 6],
  compressionRatioThreshold: [1.5, 4], logProbThreshold: [-3, 0], noSpeechThreshold: [0.1, 0.9],
  vadMinSpeechMs: [0, 1000], vadMinSilenceMs: [100, 3000], vadSpeechPadMs: [0, 500],
  vadMaxSpeechS: [0, 60], translateWorkers: [1, 10], llmWorkers: [1, 10], playerVolume: [0, 100],
  playerCueRepeatCount: [2, 20],
  subSize: [14, 56], subOffset: [-10, 10], browserMangaWorkers: [1, 6],
  browserMangaMaxImages: [1, 120], browserMangaFontScale: [70, 170],
  browserOverlayScale: [65, 180], browserOverlayOpacity: [20, 100], browserOverlayBottom: [0, 75],
  browserOverlayWidth: [40, 98], browserOverlayMaxLines: [1, 6],
  browserOverlayGap: [0, 48],
  browserVideoBrightness: [40, 200], browserVideoContrast: [40, 200],
  browserSilenceSpeedRate: [2, 8], browserSilenceThresholdDb: [-70, -20],
  stCardScale: [60, 160], stCardFontScale: [75, 150],
});

const ENDPOINT_PRESETS = new Set([
  'https://api.shuaiapi.com/v1', 'https://oai.sb/v1', 'https://api.oai.sb/v1',
  'https://cdn.shuaiapi.com/v1', 'https://api.openai.com/v1', 'https://api.deepseek.com',
  'https://codecraftapi.com/v1', 'https://4sapi.com/v1',
  'https://openrouter.ai/api/v1', 'https://api.groq.com/openai/v1',
  'https://generativelanguage.googleapis.com/v1beta/openai', 'custom',
]);

const SECRET_FIELD_PATHS = Object.freeze([
  'hfToken', 'llm.apiKey', 'translate.apiKey', 'translate.apiKeyProfiles',
  'manga.apiKey', 'manga.apiKeyProfiles',
]);

class SettingsValidationError extends Error {
  constructor(message) {
    super(message);
    this.name = 'SettingsValidationError';
  }
}

function isPlainRecord(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

function normalizedKey(key) {
  return String(key).normalize('NFKC').toLocaleLowerCase('en-US').replace(/[^a-z0-9]/g, '');
}

function isSecretKey(key) {
  return SECRET_KEYS.has(normalizedKey(key));
}

function scanJsonShape(value, depth = 0, state = { nodes: 0 }) {
  if (depth > MAX_JSON_DEPTH) throw new SettingsValidationError(`JSON en fazla ${MAX_JSON_DEPTH} seviye içerebilir.`);
  if (value === null || typeof value !== 'object') return state;
  for (const key of Object.keys(value)) {
    state.nodes += 1;
    if (state.nodes > MAX_JSON_NODES) throw new SettingsValidationError(`JSON en fazla ${MAX_JSON_NODES} alan içerebilir.`);
    if (DANGEROUS_KEYS.has(String(key).normalize('NFKC').toLocaleLowerCase('en-US'))) {
      throw new SettingsValidationError('Güvensiz nesne anahtarı bulundu.');
    }
    scanJsonShape(value[key], depth + 1, state);
  }
  return state;
}

function boundedString(value, label, maxLength = 4000) {
  if (typeof value !== 'string') throw new SettingsValidationError(`${label} metin olmalıdır.`);
  if (value.includes('\0')) throw new SettingsValidationError(`${label} geçersiz karakter içeriyor.`);
  if (value.length > maxLength) throw new SettingsValidationError(`${label} en fazla ${maxLength} karakter olabilir.`);
  return value;
}

function pathSetting(value, label) {
  const text = boundedString(value, label, 4000);
  if (!text) return '';
  // Ürün Windows birincil; fakat Linux/macOS geliştirme/CI ortamında POSIX
  // mutlak yolları da geçerli sayılmalı — yoksa `path.win32.isAbsolute('/x')`
  // false döner ve her ayar kaydı ile her iş başlangıcı bu hatayla düşer.
  // (defaultMediaFolders da aynı çift kontrolü kullanır.)
  if (!path.isAbsolute(text) && !path.win32.isAbsolute(text)) {
    throw new SettingsValidationError(`${label} mutlak bir yol olmalıdır.`);
  }
  return text;
}

function sanitizeAbsolutePath(value, label = 'Dosya yolu') {
  return pathSetting(value, label);
}

function endpointSetting(value, label) {
  const text = boundedString(value, label, 2048);
  if (!text) return '';
  let parsed;
  try { parsed = new URL(text); } catch (_) {
    throw new SettingsValidationError(`${label} geçerli bir URL olmalıdır.`);
  }
  if (!['http:', 'https:'].includes(parsed.protocol) || parsed.username || parsed.password) {
    throw new SettingsValidationError(`${label} yalnız kimlik bilgisi içermeyen HTTP/HTTPS URL olabilir.`);
  }
  // Sorguya gömülü sırlar (`?api_key=`, `?token=`): endpoint'i işlevsiz
  // kılmadan hassas parametreleri sil — yedeğe "secretsExcluded" sözüyle
  // düz metin düşmesinler (B80-01). Fonksiyonel sorgu parametreleri korunur.
  let stripped = false;
  for (const key of [...parsed.searchParams.keys()]) {
    if (isSensitiveKey(key) || startsWithSensitivePrefix(key)) {
      parsed.searchParams.delete(key);
      stripped = true;
    }
  }
  // Silme olmadıysa ham metni aynen döndür — URL.href normalizasyonu
  // (sondaki / gibi) mevcut endpoint'lerin davranışını değiştirmesin.
  return stripped ? parsed.href : text;
}

function sanitizeUiSettings(ui, { strict = true } = {}) {
  if (!isPlainRecord(ui)) throw new SettingsValidationError('Arayüz ayarları nesne olmalıdır.');
  const clean = {};
  for (const id of PERSIST_VALUE_CONTROLS) {
    if (!Object.prototype.hasOwnProperty.call(ui, id)) continue;
    const value = boundedString(ui[id], `Arayüz ayarı ${id}`, id === 'initialPrompt' ? 20000 : 2048);
    if (UI_ENUMS[id] && !UI_ENUMS[id].includes(value)) {
      // Yerel kayıtta (strict=false) tek bozuk kontrol değeri tüm ayar
      // kaydını öldürmemeli — alan atlanır, diğer tercihler korunur.
      // İçe aktarımda (strict) bozuk dosya bütün olarak reddedilir.
      if (strict) throw new SettingsValidationError(`Arayüz ayarı ${id} geçersiz bir değer içeriyor.`);
      continue;
    }
    if (UI_NUMERIC_RANGES[id]) {
      const number = Number(value);
      const [min, max] = UI_NUMERIC_RANGES[id];
      if (!Number.isFinite(number) || number < min || number > max) {
        if (strict) throw new SettingsValidationError(`Arayüz ayarı ${id} ${min}-${max} aralığında olmalıdır.`);
        continue;
      }
    }
    if (id === 'translateBaseUrl' && value) {
      try {
        // Dönüş değeri sorgu-sırrı temizlenmiş URL'dir — ham değeri değil
        // onu sakla; yoksa ?api_key= yedeğe düz metin düşer (B80-01).
        clean[id] = endpointSetting(value, 'Çeviri özel endpoint');
        continue;
      } catch (error) {
        if (strict) throw error;
        continue;
      }
    }
    clean[id] = value;
  }
  for (const id of PERSIST_CHECKBOX_CONTROLS) {
    if (!Object.prototype.hasOwnProperty.call(ui, id)) continue;
    if (typeof ui[id] !== 'boolean') {
      if (strict) throw new SettingsValidationError(`Arayüz ayarı ${id} doğru/yanlış olmalıdır.`);
      continue;
    }
    clean[id] = ui[id];
  }
  return clean;
}

const TRANSLATE_UI_ENDPOINT_KEYS = Object.freeze(['translateEndpointPreset', 'translateBaseUrl']);
const TRANSLATE_DEFAULT_ENDPOINT = 'https://api.shuaiapi.com/v1';

// Endpoint kimliği: grup alanları + ui fallback'leri + varsayılan preset ile
// browserTranslationConfig'in çalışma-zamanı çözümünü taklit eder. İçe aktarımda
// kimlik değiştiyse eski anahtar yeni endpoint'e sızmasın diye sır taşınmaz.
function endpointIdentity(group, { inherited = '', ui = null, uiKeys = null, defaultPreset = '' } = {}) {
  if (!isPlainRecord(group)) group = {};
  let preset = String(group.endpointPreset || '').trim();
  let custom = String(group.customBaseUrl || '').trim();
  if (Array.isArray(uiKeys) && isPlainRecord(ui)) {
    preset = preset || String(ui[uiKeys[0]] || '').trim();
    custom = custom || String(ui[uiKeys[1]] || '').trim();
  }
  preset = preset || defaultPreset;
  if (preset === 'custom') return `custom:${custom.toLowerCase()}`;
  if (preset === 'inherit') return inherited;
  return preset ? `preset:${preset}` : '';
}

function sanitizeEndpointGroup(value, label, allowSecrets, existing,
    { allowInherit = false, nextIdentity = null, previousIdentity = null } = {}) {
  if (!isPlainRecord(value)) throw new SettingsValidationError(`${label} ayarları nesne olmalıdır.`);
  const clean = {};
  if (Object.prototype.hasOwnProperty.call(value, 'endpointPreset')) {
    const preset = boundedString(value.endpointPreset, `${label} endpoint seçimi`, 2048);
    if (!ENDPOINT_PRESETS.has(preset) && !(allowInherit && preset === 'inherit')) {
      throw new SettingsValidationError(`${label} endpoint seçimi geçersiz.`);
    }
    clean.endpointPreset = preset;
  }
  if (Object.prototype.hasOwnProperty.call(value, 'customBaseUrl')) {
    clean.customBaseUrl = endpointSetting(value.customBaseUrl, `${label} özel endpoint`);
  }
  if (Object.prototype.hasOwnProperty.call(value, 'model')) clean.model = boundedString(value.model, `${label} model`, 300);
  if (Object.prototype.hasOwnProperty.call(value, 'modelProfiles')) {
    try {
      clean.modelProfiles = serializeProviderModelProfiles(
        normalizeProviderModelProfiles(value.modelProfiles, { strict: true }));
    } catch (error) {
      throw new SettingsValidationError(`${label} sağlayıcı model listesi geçersiz: ${error.message}`);
    }
  }
  // İçe aktarımda endpoint kimliği değiştiyse mevcut anahtar yeni (muhtemelen
  // saldırganın) endpoint'e Authorization olarak gider; bu durumda sır taşınmaz.
  const secretsInheritable = allowSecrets || !nextIdentity
    || endpointIdentity(clean, nextIdentity) === endpointIdentity(existing, previousIdentity || {});
  if (allowSecrets && Object.prototype.hasOwnProperty.call(value, 'apiKey')) {
    clean.apiKey = boundedString(value.apiKey, `${label} API anahtarı`, 10000);
  } else if (secretsInheritable && existing && typeof existing.apiKey === 'string') {
    clean.apiKey = existing.apiKey;
  }
  if (allowSecrets && Object.prototype.hasOwnProperty.call(value, 'apiKeyProfiles')) {
    const serialized = boundedString(value.apiKeyProfiles, `${label} sağlayıcı anahtar profilleri`, 128000);
    if (serialized) {
      let profiles;
      try { profiles = JSON.parse(serialized); } catch (_) {
        throw new SettingsValidationError(`${label} sağlayıcı anahtar profilleri geçerli JSON değil.`);
      }
      if (!isPlainRecord(profiles) || Object.keys(profiles).length > 32) {
        throw new SettingsValidationError(`${label} en fazla 32 sağlayıcı anahtarı saklayabilir.`);
      }
      const cleanProfiles = {};
      for (const [scope, apiKey] of Object.entries(profiles)) {
        const safeScope = boundedString(scope, `${label} sağlayıcı kimliği`, 600).trim();
        const safeKey = boundedString(apiKey, `${label} sağlayıcı API anahtarı`, 10000).trim();
        if (DANGEROUS_KEYS.has(safeScope)) {
          throw new SettingsValidationError(`${label} sağlayıcı kimliği güvenli değil.`);
        }
        if (safeScope && safeKey) cleanProfiles[safeScope] = safeKey;
      }
      clean.apiKeyProfiles = JSON.stringify(cleanProfiles);
    } else clean.apiKeyProfiles = '';
  } else if (secretsInheritable && existing && typeof existing.apiKeyProfiles === 'string') {
    clean.apiKeyProfiles = existing.apiKeyProfiles;
  }
  return clean;
}

function sanitizeMangaSettings(value, allowSecrets, existing, inherited = {}) {
  const clean = sanitizeEndpointGroup(value, 'Manga', allowSecrets, existing, { allowInherit: true, ...inherited });
  const language = value.targetLanguage;
  if (language !== undefined) {
    clean.targetLanguage = boundedString(language, 'Manga hedef dili', 16);
    if (!UI_ENUMS.browserMangaTarget.includes(clean.targetLanguage)) {
      throw new SettingsValidationError('Manga hedef dili geçersiz.');
    }
  }
  const font = value.fontFamily;
  if (font !== undefined) {
    clean.fontFamily = boundedString(font, 'Manga yazı tipi', 32);
    if (!UI_ENUMS.browserMangaFont.includes(clean.fontFamily)) {
      throw new SettingsValidationError('Manga yazı tipi geçersiz.');
    }
  }
  for (const [key, min, max] of [['workers', 1, 6], ['maxImages', 1, 120], ['fontScale', 0.7, 1.7]]) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    const number = Number(value[key]);
    if (!Number.isFinite(number) || number < min || number > max) {
      throw new SettingsValidationError(`Manga ayarı ${key} ${min}-${max} aralığında olmalıdır.`);
    }
    clean[key] = number;
  }
  for (const key of ['autoTranslate', 'verticalText', 'sfxStyle']) {
    if (!Object.prototype.hasOwnProperty.call(value, key)) continue;
    if (typeof value[key] !== 'boolean') throw new SettingsValidationError(`Manga ayarı ${key} doğru/yanlış olmalıdır.`);
    clean[key] = value[key];
  }
  return clean;
}

function sanitizeStructuredSetting(value, label, maxBytes) {
  if (!isPlainRecord(value) && !Array.isArray(value)) {
    throw new SettingsValidationError(`${label} nesne veya dizi olmalıdır.`);
  }
  const serialized = JSON.stringify(value);
  if (Buffer.byteLength(serialized, 'utf8') > maxBytes) {
    throw new SettingsValidationError(`${label} güvenli boyut sınırını aştı.`);
  }
  return JSON.parse(serialized);
}

function sanitizePlayerPositions(value) {
  if (!isPlainRecord(value)) throw new SettingsValidationError('Oynatıcı konumları nesne olmalıdır.');
  const clean = {};
  const keys = Object.keys(value).slice(-60);
  for (const rawKey of keys) {
    const key = boundedString(rawKey, 'Oynatıcı konum anahtarı', 4000);
    const item = value[rawKey];
    if (!isPlainRecord(item)) throw new SettingsValidationError('Oynatıcı konumu nesne olmalıdır.');
    const t = Number(item.t);
    const d = Number(item.d);
    const at = Number(item.at);
    if (![t, d, at].every(Number.isFinite) || t < 0 || d < 0 || at < 0) {
      throw new SettingsValidationError('Oynatıcı konumu geçersiz sayı içeriyor.');
    }
    clean[key] = { t, d, title: boundedString(String(item.title || ''), 'Oynatıcı başlığı', 500), at };
  }
  return clean;
}

function sanitizeSettings(input, { allowSecrets = false, existingSettings = {} } = {}) {
  if (!isPlainRecord(input)) throw new SettingsValidationError('Ayarlar bir JSON nesnesi olmalıdır.');
  scanJsonShape(input);
  const clean = { settingsVersion: SETTINGS_VERSION };

  if (Object.prototype.hasOwnProperty.call(input, 'glossary')) {
    if (!Array.isArray(input.glossary) || input.glossary.length > 500) {
      throw new SettingsValidationError('Sözlük en fazla 500 terimlik bir dizi olmalıdır.');
    }
    clean.glossary = [...new Set(input.glossary.map((item) => boundedString(item, 'Sözlük terimi', 200).trim()).filter(Boolean))];
  }
  for (const [key, label] of [
    ['inputDir', 'Girdi klasörü'],
    ['outputDir', 'Çıktı klasörü'],
    ['watchDir', 'İzleme klasörü'],
    ['lastInputDir', 'Son girdi klasörü'],
  ]) {
    if (Object.prototype.hasOwnProperty.call(input, key)) clean[key] = pathSetting(input[key], label);
  }
  if (Object.prototype.hasOwnProperty.call(input, 'preset')) {
    const preset = boundedString(input.preset, 'Ayar profili', 30);
    if (!['film', 'custom', 'fast', 'balanced', 'quality'].includes(preset)) {
      throw new SettingsValidationError('Ayar profili geçersiz.');
    }
    clean.preset = preset;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'presetReference')) {
    const reference = boundedString(input.presetReference, 'Ayar profili referansı', 30);
    if (!['film', 'fast', 'balanced', 'quality'].includes(reference)) {
      throw new SettingsValidationError('Ayar profili referansı geçersiz.');
    }
    clean.presetReference = reference;
  }
  if (Object.prototype.hasOwnProperty.call(input, 'subtitleModelDefault38Applied')) {
    if (typeof input.subtitleModelDefault38Applied !== 'boolean') {
      throw new SettingsValidationError('Altyazı model göç işareti doğru/yanlış olmalıdır.');
    }
    clean.subtitleModelDefault38Applied = input.subtitleModelDefault38Applied;
  }
  // Silme işaretleri yalnız yerel kayıt yolunda anlamlıdır: içe aktarılan dosya
  // sır taşıyamaz (allowSecrets=false), bu yüzden kasadaki anahtarı gizleyen
  // işaret de taşıyamaz — aksi halde crafted bir yedek mevcut anahtarları
  // yeniden girilene dek sessizce devre dışı bırakırdı.
  if (allowSecrets && Object.prototype.hasOwnProperty.call(input, 'clearedSecretFields')) {
    if (!Array.isArray(input.clearedSecretFields)) {
      throw new SettingsValidationError('Temizlenen gizli alan listesi dizi olmalıdır.');
    }
    clean.clearedSecretFields = [...new Set(input.clearedSecretFields
      .map((item) => boundedString(item, 'Temizlenen gizli alan', 100))
      .filter((item) => SECRET_FIELD_PATHS.includes(item)))];
  }
  // Yerel kayıt (allowSecrets) hoşgörülü: tek bozuk kontrol değeri diğer tüm
  // tercihlerin kalıcılığını durduramaz. İçe aktarma katı kalır.
  if (Object.prototype.hasOwnProperty.call(input, 'ui')) {
    clean.ui = sanitizeUiSettings(input.ui, { strict: !allowSecrets });
  }
  if (Object.prototype.hasOwnProperty.call(input, 'playerPositions')) clean.playerPositions = sanitizePlayerPositions(input.playerPositions);
  const nextTranslateOpts = { ui: clean.ui, uiKeys: TRANSLATE_UI_ENDPOINT_KEYS, defaultPreset: TRANSLATE_DEFAULT_ENDPOINT };
  const prevTranslateOpts = { ui: existingSettings.ui, uiKeys: TRANSLATE_UI_ENDPOINT_KEYS, defaultPreset: TRANSLATE_DEFAULT_ENDPOINT };
  const existingTranslateIdentity = endpointIdentity(existingSettings.translate, prevTranslateOpts);
  if (Object.prototype.hasOwnProperty.call(input, 'translate')) {
    clean.translate = sanitizeEndpointGroup(input.translate, 'Çeviri', allowSecrets, existingSettings.translate, {
      nextIdentity: nextTranslateOpts, previousIdentity: prevTranslateOpts,
    });
  } else if (!allowSecrets && existingSettings.translate
      && endpointIdentity(null, nextTranslateOpts) === existingTranslateIdentity
      && (typeof existingSettings.translate.apiKey === 'string'
        || typeof existingSettings.translate.apiKeyProfiles === 'string')) {
    clean.translate = {};
    if (typeof existingSettings.translate.apiKey === 'string') {
      clean.translate.apiKey = existingSettings.translate.apiKey;
    }
    if (typeof existingSettings.translate.apiKeyProfiles === 'string') {
      clean.translate.apiKeyProfiles = existingSettings.translate.apiKeyProfiles;
    }
  }
  const cleanTranslateIdentity = endpointIdentity(clean.translate, nextTranslateOpts);
  if (Object.prototype.hasOwnProperty.call(input, 'llm')) {
    clean.llm = sanitizeEndpointGroup(input.llm, 'LLM', allowSecrets, existingSettings.llm, {
      nextIdentity: {}, previousIdentity: {},
    });
  } else if (!allowSecrets && existingSettings.llm && !endpointIdentity(existingSettings.llm)
      && typeof existingSettings.llm.apiKey === 'string') {
    clean.llm = { apiKey: existingSettings.llm.apiKey };
  }
  const mangaOpts = (inherited) => ({ inherited, defaultPreset: 'inherit' });
  if (Object.prototype.hasOwnProperty.call(input, 'manga')) {
    clean.manga = sanitizeMangaSettings(input.manga, allowSecrets, existingSettings.manga, {
      nextIdentity: mangaOpts(cleanTranslateIdentity),
      previousIdentity: mangaOpts(existingTranslateIdentity),
    });
  } else if (!allowSecrets && existingSettings.manga
      && endpointIdentity(null, mangaOpts(cleanTranslateIdentity))
        === endpointIdentity(existingSettings.manga, mangaOpts(existingTranslateIdentity))
      && (typeof existingSettings.manga.apiKey === 'string'
        || typeof existingSettings.manga.apiKeyProfiles === 'string')) {
    clean.manga = {};
    if (typeof existingSettings.manga.apiKey === 'string') {
      clean.manga.apiKey = existingSettings.manga.apiKey;
    }
    if (typeof existingSettings.manga.apiKeyProfiles === 'string') {
      clean.manga.apiKeyProfiles = existingSettings.manga.apiKeyProfiles;
    }
  }
  if (Object.prototype.hasOwnProperty.call(input, 'browserSponsorExemptions')) {
    clean.browserSponsorExemptions = sanitizeStructuredSetting(
      input.browserSponsorExemptions, 'SponsorBlock istisnaları', 2 * 1024 * 1024,
    );
  }
  if (Object.prototype.hasOwnProperty.call(input, 'browserWorkflows')) {
    clean.browserWorkflows = sanitizeStructuredSetting(
      input.browserWorkflows, 'Tarayıcı iş akışları', 4 * 1024 * 1024,
    );
  }
  if (allowSecrets && Object.prototype.hasOwnProperty.call(input, 'hfToken')) {
    clean.hfToken = boundedString(input.hfToken, 'HuggingFace token', 10000);
  } else if (!allowSecrets && typeof existingSettings.hfToken === 'string') {
    clean.hfToken = existingSettings.hfToken;
  }
  return clean;
}

function collectSecretValues(settings) {
  return [settings && settings.hfToken, settings && settings.translate && settings.translate.apiKey,
    settings && settings.translate && settings.translate.apiKeyProfiles,
    settings && settings.llm && settings.llm.apiKey, settings && settings.manga && settings.manga.apiKey,
    settings && settings.manga && settings.manga.apiKeyProfiles]
    .filter((value) => typeof value === 'string' && value);
}

function collectAllSecretValues(value, found = []) {
  if (value === null || typeof value !== 'object') return found;
  if (Array.isArray(value)) {
    value.forEach((item) => collectAllSecretValues(item, found));
    return found;
  }
  for (const [key, child] of Object.entries(value)) {
    if (isSecretKey(key) && typeof child === 'string' && child) found.push(child);
    collectAllSecretValues(child, found);
  }
  return found;
}

function redactForBackup(value, secretValues = new Set(), depth = 0) {
  if (depth > MAX_JSON_DEPTH) return null;
  if (typeof value === 'string') {
    let clean = value;
    for (const secret of secretValues) clean = clean.split(secret).join('[GİZLİ]');
    return clean;
  }
  if (value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((item) => redactForBackup(item, secretValues, depth + 1));
  const clean = {};
  for (const [key, child] of Object.entries(value)) {
    if (DANGEROUS_KEYS.has(String(key).normalize('NFKC').toLocaleLowerCase('en-US')) || isSecretKey(key)) continue;
    clean[key] = redactForBackup(child, secretValues, depth + 1);
  }
  return clean;
}

function publicSettings(settings) {
  return redactForBackup(settings, new Set(collectSecretValues(settings)));
}

function createBackupPayload(settings, browserPlaces, watchLibrary, now = new Date(), extra = {}) {
  const secrets = new Set(collectSecretValues(settings));
  const backup = {
    backupVersion: BACKUP_VERSION,
    exportedAt: now.toISOString(),
    secretsExcluded: true,
    settings,
    browserPlaces,
    watchLibrary,
    ...(isPlainRecord(extra) ? extra : {}),
  };
  return redactForBackup(backup, secrets);
}

function parseImportText(text, existingSettings = {}) {
  if (typeof text !== 'string') throw new SettingsValidationError('Ayar dosyası metin olarak okunamadı.');
  if (Buffer.byteLength(text, 'utf8') > MAX_IMPORT_BYTES) {
    throw new SettingsValidationError(`Ayar dosyası en fazla ${MAX_IMPORT_BYTES} bayt olabilir.`);
  }
  let data;
  try { data = JSON.parse(text.replace(/^\uFEFF/, '')); } catch (_) {
    throw new SettingsValidationError('Ayar dosyası geçerli JSON değil.');
  }
  if (!isPlainRecord(data)) throw new SettingsValidationError('Ayar dosyasının kökü nesne olmalıdır.');
  const shape = scanJsonShape(data);
  const importedSecretValues = collectAllSecretValues(data);
  const redactedData = redactForBackup(data, new Set(importedSecretValues));
  const hasVersion = Object.prototype.hasOwnProperty.call(redactedData, 'backupVersion');
  let bundled = false;
  let rawSettings = redactedData;
  if (hasVersion) {
    const version = Number(redactedData.backupVersion);
    if (![2, 3].includes(version) || !isPlainRecord(redactedData.settings)) {
      throw new SettingsValidationError('Yedek sürümü desteklenmiyor veya ayar bölümü geçersiz.');
    }
    bundled = true;
    rawSettings = redactedData.settings;
  }
  const settings = sanitizeSettings(rawSettings, { allowSecrets: false, existingSettings });
  return {
    bundled,
    settings,
    publicSettings: publicSettings(settings),
    browserPlaces: bundled ? redactedData.browserPlaces : undefined,
    watchLibrary: bundled ? redactedData.watchLibrary : undefined,
    learningAnnotations: bundled ? redactedData.learningAnnotations : undefined,
    ignoredSecretCount: importedSecretValues.length,
    nodes: shape.nodes,
  };
}

function assertSafeJsonFile(filePath, fsImpl = fs, { mustExist = false } = {}) {
  if (typeof filePath !== 'string' || !path.isAbsolute(filePath) || path.extname(filePath).toLocaleLowerCase('en-US') !== '.json') {
    throw new SettingsValidationError('Yalnız mutlak yoldaki .json dosyaları kullanılabilir.');
  }
  const normalizedPath = path.resolve(filePath);
  const parsed = path.parse(normalizedPath);
  let currentPath = parsed.root;
  for (const part of normalizedPath.slice(parsed.root.length).split(path.sep).filter(Boolean)) {
    currentPath = path.join(currentPath, part);
    if (!fsImpl.existsSync(currentPath)) break;
    if (fsImpl.lstatSync(currentPath).isSymbolicLink()) {
      throw new SettingsValidationError('Sembolik bağlantı hedefleri ayar dosyası olarak kullanılamaz.');
    }
  }
  if (!fsImpl.existsSync(filePath)) {
    if (mustExist) throw new SettingsValidationError('Ayar dosyası bulunamadı.');
    return;
  }
  const stat = fsImpl.lstatSync(filePath);
  if (stat.isSymbolicLink()) throw new SettingsValidationError('Sembolik bağlantı hedefleri ayar dosyası olarak kullanılamaz.');
  if (!stat.isFile()) throw new SettingsValidationError('Seçilen ayar yolu normal bir dosya değil.');
}

function readImportFile(filePath, fsImpl = fs) {
  assertSafeJsonFile(filePath, fsImpl, { mustExist: true });
  const size = fsImpl.statSync(filePath).size;
  if (size > MAX_IMPORT_BYTES) throw new SettingsValidationError(`Ayar dosyası en fazla ${MAX_IMPORT_BYTES} bayt olabilir.`);
  return fsImpl.readFileSync(filePath, 'utf8');
}

function transactionJournalPath(filePath) {
  return path.join(path.dirname(filePath), '.whisper-settings-transaction.json');
}

function fsPathKey(filePath) {
  const resolved = path.resolve(filePath);
  return process.platform === 'win32' ? resolved.toLocaleLowerCase('en-US') : resolved;
}

function hasExactKeys(value, expected) {
  if (!isPlainRecord(value)) return false;
  const actualKeys = Object.keys(value).sort();
  const expectedKeys = [...expected].sort();
  return actualKeys.length === expectedKeys.length
    && actualKeys.every((key, index) => key === expectedKeys[index]);
}

function validateTransactionJournal(journal, journalPath, fsImpl = fs) {
  if (!hasExactKeys(journal, ['version', 'marker', 'records']) || journal.version !== 1
    || typeof journal.marker !== 'string' || !Array.isArray(journal.records)
    || journal.records.length < 1 || journal.records.length > MAX_TRANSACTION_RECORDS) {
    throw new SettingsValidationError('Ayar işlem günlüğü geçersiz.');
  }
  const markerPrefix = `${journalPath}.`;
  const markerSuffix = '.committed';
  if (!journal.marker.startsWith(markerPrefix) || !journal.marker.endsWith(markerSuffix)) {
    throw new SettingsValidationError('Ayar işlem günlüğü geçersiz tamamlanma işareti içeriyor.');
  }
  const token = journal.marker.slice(markerPrefix.length, -markerSuffix.length);
  if (!/^[A-Za-z0-9-]{1,200}$/.test(token)
    || journal.marker !== `${journalPath}.${token}.committed`) {
    throw new SettingsValidationError('Ayar işlem günlüğü geçersiz işlem kimliği içeriyor.');
  }
  const journalDirKey = fsPathKey(path.dirname(journalPath));
  const journalKey = fsPathKey(journalPath);
  const seen = new Set();
  for (const record of journal.records) {
    if (!hasExactKeys(record, ['filePath', 'tmp', 'backup', 'existed'])
      || typeof record.filePath !== 'string' || typeof record.tmp !== 'string'
      || typeof record.backup !== 'string' || typeof record.existed !== 'boolean') {
      throw new SettingsValidationError('Ayar işlem günlüğü geçersiz kayıt içeriyor.');
    }
    const fileKey = fsPathKey(record.filePath);
    if (path.extname(record.filePath).toLocaleLowerCase('en-US') !== '.json'
      || fsPathKey(path.dirname(record.filePath)) !== journalDirKey
      || fileKey === journalKey || seen.has(fileKey)
      || record.tmp !== `${record.filePath}.${token}.tmp`
      || record.backup !== `${record.filePath}.${token}.bak`) {
      throw new SettingsValidationError('Ayar işlem günlüğü güvenli olmayan dosya yolu içeriyor.');
    }
    seen.add(fileKey);
    assertSafeJsonFile(record.filePath, fsImpl);
    for (const temporaryPath of [record.tmp, record.backup]) {
      if (!fsImpl.existsSync(temporaryPath)) continue;
      const temporaryStat = fsImpl.lstatSync(temporaryPath);
      if (temporaryStat.isSymbolicLink() || !temporaryStat.isFile()) {
        throw new SettingsValidationError('Ayar işlem günlüğü normal olmayan geçici dosya içeriyor.');
      }
    }
  }
  if (fsImpl.existsSync(journal.marker)) {
    const markerStat = fsImpl.lstatSync(journal.marker);
    if (markerStat.isSymbolicLink() || !markerStat.isFile()) {
      throw new SettingsValidationError('Ayar işlem günlüğü normal olmayan commit işareti içeriyor.');
    }
  }
  return journal;
}

function recoverJsonTransaction(journalPath, fsImpl = fs) {
  if (!fsImpl.existsSync(journalPath)) return false;
  assertSafeJsonFile(journalPath, fsImpl, { mustExist: true });
  let journal;
  try { journal = JSON.parse(fsImpl.readFileSync(journalPath, 'utf8')); } catch (_) {
    // Commit, günlük tamamen yazıldıktan sonra başlar. Yarım günlük varsa
    // hedeflere henüz dokunulmamıştır; mevcut ayarı okuyabilmek için günlüğü kaldır.
    try { fsImpl.unlinkSync(journalPath); } catch (_) {}
    return false;
  }
  validateTransactionJournal(journal, journalPath, fsImpl);
  const committed = fsImpl.existsSync(journal.marker);
  for (const record of [...journal.records].reverse()) {
    if (!committed) {
      if (fsImpl.existsSync(record.backup)) {
        try { if (fsImpl.existsSync(record.filePath)) fsImpl.unlinkSync(record.filePath); } catch (_) {}
        fsImpl.renameSync(record.backup, record.filePath);
      } else if (!record.existed && fsImpl.existsSync(record.filePath)) {
        fsImpl.unlinkSync(record.filePath);
      }
    }
    try { if (fsImpl.existsSync(record.tmp)) fsImpl.unlinkSync(record.tmp); } catch (_) {}
    try { if (fsImpl.existsSync(record.backup)) fsImpl.unlinkSync(record.backup); } catch (_) {}
  }
  try { fsImpl.unlinkSync(journalPath); } catch (_) {}
  try { if (fsImpl.existsSync(journal.marker)) fsImpl.unlinkSync(journal.marker); } catch (_) {}
  return true;
}

function writeJsonTransaction(entries, fsImpl = fs, token = randomUUID()) {
  if (!Array.isArray(entries) || entries.length === 0) throw new SettingsValidationError('Yazılacak ayar verisi yok.');
  if (entries.length > MAX_TRANSACTION_RECORDS) throw new SettingsValidationError('Tek işlemde çok fazla ayar dosyası var.');
  if (!entries[0] || typeof entries[0].filePath !== 'string') throw new SettingsValidationError('Ayar dosyası yolu geçersiz.');
  if (typeof token !== 'string' || !/^[A-Za-z0-9-]{1,200}$/.test(token)) {
    throw new SettingsValidationError('Ayar işlemi kimliği geçersiz.');
  }
  assertSafeJsonFile(entries[0].filePath, fsImpl);
  const journalPath = transactionJournalPath(entries[0].filePath);
  recoverJsonTransaction(journalPath, fsImpl);
  const seen = new Set();
  const journalDirKey = fsPathKey(path.dirname(journalPath));
  const journalKey = fsPathKey(journalPath);
  const records = entries.map(({ filePath, value }) => {
    if (typeof filePath !== 'string') throw new SettingsValidationError('Ayar dosyası yolu geçersiz.');
    const fileKey = fsPathKey(filePath);
    if (fsPathKey(path.dirname(filePath)) !== journalDirKey) {
      throw new SettingsValidationError('Aynı işlemdeki ayar dosyaları tek klasörde olmalıdır.');
    }
    if (fileKey === journalKey) throw new SettingsValidationError('Ayar dosyası işlem günlüğüyle çakışamaz.');
    if (seen.has(fileKey)) throw new SettingsValidationError('Aynı ayar dosyası iki kez yazılamaz.');
    seen.add(fileKey);
    assertSafeJsonFile(filePath, fsImpl);
    scanJsonShape(value);
    const serialized = JSON.stringify(value, null, 2);
    if (Buffer.byteLength(serialized, 'utf8') > MAX_IMPORT_BYTES) {
      throw new SettingsValidationError(`JSON dosyası en fazla ${MAX_IMPORT_BYTES} bayt olabilir.`);
    }
    fsImpl.mkdirSync(path.dirname(filePath), { recursive: true });
    return {
      filePath,
      value,
      serialized,
      existed: fsImpl.existsSync(filePath),
      tmp: `${filePath}.${token}.tmp`,
      backup: `${filePath}.${token}.bak`,
      movedOriginal: false,
      installed: false,
    };
  });
  const marker = `${journalPath}.${token}.committed`;
  try {
    for (const record of records) {
      fsImpl.writeFileSync(record.tmp, record.serialized, { encoding: 'utf8', flag: 'wx' });
    }
    fsImpl.writeFileSync(journalPath, JSON.stringify({
      version: 1,
      marker,
      records: records.map(({ filePath, tmp, backup, existed }) => ({ filePath, tmp, backup, existed })),
    }), { encoding: 'utf8', flag: 'wx' });
    for (const record of records) {
      if (record.existed) {
        fsImpl.renameSync(record.filePath, record.backup);
        record.movedOriginal = true;
      }
      fsImpl.renameSync(record.tmp, record.filePath);
      record.installed = true;
    }
    fsImpl.writeFileSync(marker, 'committed', { encoding: 'utf8', flag: 'wx' });
  } catch (error) {
    for (const record of [...records].reverse()) {
      try { if (record.installed && fsImpl.existsSync(record.filePath)) fsImpl.unlinkSync(record.filePath); } catch (_) {}
      try {
        if (record.movedOriginal && fsImpl.existsSync(record.backup)) fsImpl.renameSync(record.backup, record.filePath);
      } catch (_) {}
      try { if (fsImpl.existsSync(record.tmp)) fsImpl.unlinkSync(record.tmp); } catch (_) {}
      try { if (fsImpl.existsSync(record.backup)) fsImpl.unlinkSync(record.backup); } catch (_) {}
    }
    try { if (fsImpl.existsSync(journalPath)) fsImpl.unlinkSync(journalPath); } catch (_) {}
    try { if (fsImpl.existsSync(marker)) fsImpl.unlinkSync(marker); } catch (_) {}
    throw error;
  }
  // Tüm hedefler kurulduktan sonra kalan yedekleri temizlemek best-effort'tur.
  // Temizlik hatası başarılı commit'i rollback etmeye kalkıp veri kaybettirmemeli.
  let cleanupComplete = true;
  for (const record of records) {
    try { if (record.movedOriginal && fsImpl.existsSync(record.backup)) fsImpl.unlinkSync(record.backup); } catch (_) { cleanupComplete = false; }
  }
  // Yedeklerden biri kaldıysa marker+journal da kalsın; sonraki açılış yeni
  // hedefleri koruyup yalnız artıkları temizleyebilsin.
  if (cleanupComplete) {
    try { if (fsImpl.existsSync(journalPath)) fsImpl.unlinkSync(journalPath); } catch (_) { cleanupComplete = false; }
    if (cleanupComplete) {
      try { if (fsImpl.existsSync(marker)) fsImpl.unlinkSync(marker); } catch (_) {}
    }
  }
}

function withoutSecretEnv(baseEnv) {
  const env = { ...baseEnv };
  const secretNames = new Set([
    'WHISPER_HF_TOKEN', 'WHISPER_LLM_API_KEY', 'WHISPER_TRANSLATE_API_KEY',
  ]);
  for (const key of Object.keys(env)) {
    if (secretNames.has(key.toLocaleUpperCase('en-US'))) delete env[key];
  }
  return env;
}

function buildSecretEnv(baseEnv, options) {
  const env = { ...withoutSecretEnv(baseEnv), PYTHONIOENCODING: 'utf-8', PYTHONUNBUFFERED: '1' };
  // Uygulama ebeveyn ortamında bu adlarla başlatılmış olsa bile kapalı bir
  // özellik kendi anahtarını ilgisiz Python işine miras bırakmamalı.
  if (options && options.diarize && options.hfToken) env.WHISPER_HF_TOKEN = options.hfToken;
  if (options && options.llmPostprocess && options.llmApiKey) env.WHISPER_LLM_API_KEY = options.llmApiKey;
  if (options && options.translate && options.translateApiKey) env.WHISPER_TRANSLATE_API_KEY = options.translateApiKey;
  return env;
}

module.exports = {
  BACKUP_VERSION,
  MAX_IMPORT_BYTES,
  MAX_JSON_DEPTH,
  MAX_JSON_NODES,
  PERSIST_CHECKBOX_CONTROLS,
  PERSIST_VALUE_CONTROLS,
  SETTINGS_VERSION,
  SettingsValidationError,
  assertSafeJsonFile,
  buildSecretEnv,
  createBackupPayload,
  endpointIdentity,
  parseImportText,
  publicSettings,
  readImportFile,
  recoverJsonTransaction,
  sanitizeAbsolutePath,
  sanitizeSettings,
  scanJsonShape,
  withoutSecretEnv,
  writeJsonTransaction,
};
