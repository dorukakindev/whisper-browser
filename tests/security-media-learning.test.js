const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const {
  SafeSecretStore,
  mergeSettingsSecrets,
  splitSettingsSecrets,
} = require('../src/secret-store');
const {
  buildSubtitleExtractionArgs,
  buildSubtitleProbeArgs,
  parseSubtitleStreams,
  subtitleOutputExtension,
  subtitleTrackLabel,
} = require('../src/media-subtitle-tracks');
const {
  matchingLearningAnnotation,
  normalizeAnnotation,
  playbackLearningAction,
} = require('../src/browser-learning');

let passed = 0;
function test(name, fn) {
  try {
    fn();
    passed++;
  } catch (error) {
    error.message = `${name}: ${error.message}`;
    throw error;
  }
}

test('düzenlenmiş cue eski kalıcı alıntıyı track ve cue kimliğiyle bulur', () => {
  const found = matchingLearningAnnotation([
    { id: 'annotation:old', type: 'quote', mediaId: 'm1', trackId: 'track-1',
      cueId: 'cue-1', start: 1, source: 'Eski metin' },
  ], 'quote', { mediaId: 'm1', trackId: 'track-1', cueId: 'cue-1', start: 1, source: 'Yeni metin' });
  assert.equal(found.id, 'annotation:old');
});

const fakeSafeStorage = {
  isEncryptionAvailable: () => true,
  encryptString: (value) => Buffer.from(`encrypted:${value}`, 'utf8'),
  decryptString: (buffer) => buffer.toString('utf8').replace(/^encrypted:/, ''),
};

test('ayarlar public bölüm ve gizli değerler olarak ayrılır', () => {
  const input = {
    glossary: ['Karah'],
    hfToken: 'hf-secret',
    llm: { apiKey: 'llm-secret', model: 'x' },
    translate: { apiKey: 'translate-secret', apiKeyProfiles: '{"provider:codecraftapi":"cc-secret"}', target: 'tr' },
    manga: { apiKey: 'manga-secret', apiKeyProfiles: '{"provider:gemini":"gemini-secret"}', model: 'vision-x' },
  };
  const { publicSettings, secrets } = splitSettingsSecrets(input);
  assert.equal(secrets.hfToken, 'hf-secret');
  assert.equal(secrets['llm.apiKey'], 'llm-secret');
  assert.equal(secrets['translate.apiKey'], 'translate-secret');
  assert.equal(secrets['translate.apiKeyProfiles'], '{"provider:codecraftapi":"cc-secret"}');
  assert.equal(secrets['manga.apiKey'], 'manga-secret');
  assert.equal(secrets['manga.apiKeyProfiles'], '{"provider:gemini":"gemini-secret"}');
  const text = JSON.stringify(publicSettings);
  assert(!text.includes('secret'));
  assert.equal(publicSettings.llm.model, 'x');
  assert.equal(publicSettings.translate.target, 'tr');
  assert.equal(publicSettings.manga.model, 'vision-x');
  const merged = mergeSettingsSecrets(publicSettings, secrets);
  assert.equal(merged.llm.apiKey, 'llm-secret');
  assert.equal(merged.translate.apiKeyProfiles, '{"provider:codecraftapi":"cc-secret"}');
  assert.equal(merged.manga.apiKey, 'manga-secret');
});

test('OS güvenli deposu şifreli yazar ve ayarlarla geri birleştirir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-secrets-'));
  const file = path.join(dir, 'secrets.safe.json');
  try {
    const store = new SafeSecretStore({ safeStorage: fakeSafeStorage, filePath: file });
    const saved = store.saveFromSettings({
      hfToken: 'hf-value',
      llm: { apiKey: 'llm-value', model: 'model' },
      translate: { apiKey: 'tr-value', apiKeyProfiles: '{"provider:codecraftapi":"cc-value"}' },
      manga: { apiKey: 'manga-value', apiKeyProfiles: '{"provider:gemini":"gemini-value"}' },
      ordinary: true,
    });
    assert(saved.ok, saved.error);
    assert.equal(saved.publicSettings.hfToken, undefined);
    const disk = fs.readFileSync(file, 'utf8');
    assert(!disk.includes('hf-value'));
    assert(!disk.includes('llm-value'));
    assert(!disk.includes('manga-value'));
    assert(!disk.includes('cc-value'));
    assert(!disk.includes('gemini-value'));
    const loaded = store.withSecrets(saved.publicSettings);
    assert(loaded.ok, loaded.error);
    assert.equal(loaded.settings.hfToken, 'hf-value');
    assert.equal(loaded.settings.llm.apiKey, 'llm-value');
    assert.equal(loaded.settings.translate.apiKeyProfiles, '{"provider:codecraftapi":"cc-value"}');
    assert.equal(loaded.settings.manga.apiKey, 'manga-value');
    assert.equal(loaded.settings.ordinary, true);
    assert(!JSON.stringify(store.forExport(loaded.settings)).includes('value'));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('güvenli depo yoksa düz metne sessizce düşmez', () => {
  const store = new SafeSecretStore({
    safeStorage: { isEncryptionAvailable: () => false },
    filePath: path.join(os.tmpdir(), 'should-not-exist.safe.json'),
  });
  const result = store.save({ hfToken: 'plain' });
  assert.equal(result.ok, false);
  assert.equal(result.unavailable, true);
});

test('boş anahtar güvenli kasadaki eski değeri temizler', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-secrets-clear-'));
  const file = path.join(dir, 'secrets.safe.json');
  try {
    const store = new SafeSecretStore({ safeStorage: fakeSafeStorage, filePath: file });
    assert(store.saveFromSettings({ hfToken: 'once' }).ok);
    assert.equal(store.withSecrets({}).settings.hfToken, 'once');
    assert(store.saveFromSettings({ hfToken: '' }).ok);
    assert.equal(store.withSecrets({}).settings.hfToken, undefined);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('tek bozuk gizli alan sağlam anahtarların yüklenmesini engellemez', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-secrets-partial-'));
  const file = path.join(dir, 'secrets.safe.json');
  const selectiveStorage = {
    ...fakeSafeStorage,
    decryptString: (buffer) => {
      const text = buffer.toString('utf8');
      if (text.includes('broken')) throw new Error('bozuk kayıt');
      return text.replace(/^encrypted:/, '');
    },
  };
  try {
    fs.writeFileSync(file, JSON.stringify({
      version: 1,
      entries: {
        hfToken: Buffer.from('encrypted:hf-ok').toString('base64'),
        'llm.apiKey': Buffer.from('encrypted:broken').toString('base64'),
      },
    }));
    const store = new SafeSecretStore({ safeStorage: selectiveStorage, filePath: file });
    const loaded = store.withSecrets({ ordinary: true });
    assert.equal(loaded.ok, false);
    assert.equal(loaded.partial, true);
    assert.equal(loaded.settings.hfToken, 'hf-ok');
    assert.equal(loaded.settings.llm?.apiKey, undefined);
    assert.equal(loaded.errors[0].field, 'llm.apiKey');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('güvenli kasa bozuk/eksik primary için yedekten döner; sağlam boş kayıt önceliklidir', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-secrets-backup-'));
  const file = path.join(dir, 'secrets.safe.json');
  try {
    const store = new SafeSecretStore({ safeStorage: fakeSafeStorage, filePath: file });
    assert(store.save({ hfToken: 'old' }).ok);
    assert(store.save({ hfToken: 'new' }).ok);
    fs.writeFileSync(file, '{broken');
    assert.equal(store.load().secrets.hfToken, 'old');
    assert.equal(store.load().recovered, true);
    // Saving after recovery must not replace the usable backup with corruption.
    assert(store.save({ hfToken: 'recovered' }).ok);
    assert.equal(store.loadFile(file + '.bak').secrets.hfToken, 'old');
    assert(store.save({}).ok);
    assert.deepEqual(store.load().secrets, {});
    assert.equal(store.load().recovered, false);
    fs.unlinkSync(file);
    assert.equal(store.load().secrets.hfToken, 'recovered');
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

test('güvenli kasa başarısız replace sonrası eski veriyi korur, temp dosyasını temizler', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-secrets-failure-'));
  const file = path.join(dir, 'secrets.safe.json');
  try {
    const store = new SafeSecretStore({ safeStorage: fakeSafeStorage, filePath: file });
    assert(store.save({ hfToken: 'old' }).ok);
    let flushed = false;
    store.fs = { ...fs, writeFileSync: (...args) => { flushed = args[2].flush === true; return fs.writeFileSync(...args); },
      renameSync: () => { throw new Error('locked'); } };
    assert.equal(store.save({ hfToken: 'new' }).ok, false);
    assert(flushed);
    assert.equal(store.load().secrets.hfToken, 'old');
    assert.equal(store.loadFile(file + '.bak').secrets.hfToken, 'old');
    assert.deepEqual(fs.readdirSync(dir).sort(), ['secrets.safe.json', 'secrets.safe.json.bak']);
  } finally { fs.rmSync(dir, { recursive: true, force: true }); }
});

const probe = {
  streams: [
    { index: 3, codec_name: 'subrip', tags: { language: 'tur', title: 'Türkçe' }, disposition: { default: 1 } },
    { index: 4, codec_name: 'ass', tags: { language: 'eng' }, disposition: { hearing_impaired: 1 } },
    { index: 5, codec_name: 'hdmv_pgs_subtitle', tags: { language: 'jpn' }, disposition: { forced: 1 } },
  ],
};

test('ffprobe altyazı akışları metin ve bitmap olarak ayrılır', () => {
  const tracks = parseSubtitleStreams(probe);
  assert.equal(tracks.length, 3);
  assert(tracks[0].textBased && tracks[0].extractable);
  assert.equal(tracks[0].streamIndex, 3);
  assert.equal(tracks[0].language, 'tur');
  assert(tracks[1].hearingImpaired);
  assert(tracks[2].bitmap && tracks[2].requiresOcr && !tracks[2].extractable);
  assert.match(subtitleTrackLabel(tracks[2]), /Zorunlu/);
  assert.match(subtitleTrackLabel(tracks[2]), /Görüntü altyazısı/);
});

test('metin altyazısı doğru stream index ile çıkarılır, bitmap otomatik çıkarılmaz', () => {
  const tracks = parseSubtitleStreams(probe);
  const args = buildSubtitleExtractionArgs('film.mkv', tracks[0], 'film.tur.srt');
  assert.deepEqual(args.slice(args.indexOf('-map'), args.indexOf('-map') + 2), ['-map', '0:3']);
  assert.equal(args[args.indexOf('-c:s') + 1], 'srt');
  assert.equal(buildSubtitleExtractionArgs('film.mkv', tracks[2], 'x.srt'), null);
  assert.equal(subtitleOutputExtension(tracks[1]), '.ass');
  assert.deepEqual(buildSubtitleProbeArgs('film.mkv').slice(-2), ['json', 'film.mkv']);
});

const cues = [
  { id: 'a', start: 2, end: 4, text: 'Hello.' },
  { id: 'b', start: 10, end: 12, text: 'Again.' },
];

test('altyazısız bölge hızlandırma ve atlama politikaları eylem üretir', () => {
  assert.deepEqual(playbackLearningAction(cues, 5, 4.9, 'accelerate-gaps', { gapRate: 2 }),
    { type: 'set-rate', rate: 2, until: 10 });
  const skip = playbackLearningAction(cues, 5, 4.9, 'skip-gaps', { lead: 0.2 });
  assert.equal(skip.type, 'seek');
  assert.equal(skip.time, 9.8);
  assert.equal(playbackLearningAction(cues, 2.5, 2.4, 'accelerate-gaps').rate, 1);
});

test('cue sonu otomatik dur gap atlamasından önce gelir ve seek yarışına girmez', () => {
  const pause = playbackLearningAction(cues, 4.1, 3.9, 'skip-gaps', { autoPause: true });
  assert.deepEqual(pause, { type: 'pause-at-cue-end', cueId: 'a' });
  assert.notEqual(playbackLearningAction(cues, 10, 3.9, 'skip-gaps', { autoPause: true }).type,
    'pause-at-cue-end', 'kullanıcı seek hareketi cue sonu sanıldı');
});

test('cue sonu otomatik dur bitişik cue sınırında durur fakat örtüşen konuşmayı kesmez', () => {
  const adjacent = [
    { id: 'a', start: 2, end: 4, text: 'Bir' },
    { id: 'b', start: 4, end: 6, text: 'İki' },
  ];
  assert.deepEqual(playbackLearningAction(adjacent, 4.05, 3.95, 'normal', { autoPause: true }),
    { type: 'pause-at-cue-end', cueId: 'a' });
  const overlapping = [
    { id: 'speaker-a', start: 10, end: 14, text: 'Birinci konuşmacı' },
    { id: 'speaker-b', start: 13.5, end: 17, text: 'İkinci konuşmacı' },
  ];
  const action = playbackLearningAction(overlapping, 14.05, 13.95, 'normal', { autoPause: true });
  assert.notEqual(action.type, 'pause-at-cue-end');
});

test('shadowing cue bitişinde süreli duraklatma üretir', () => {
  const action = playbackLearningAction(cues, 4.1, 3.9, 'shadowing', { shadowingFactor: 1.5 });
  assert.equal(action.type, 'pause-for-shadowing');
  assert.equal(action.cueId, 'a');
  assert.equal(action.durationMs, 3000);
  assert.notEqual(playbackLearningAction(cues, 4.2, 4.1, 'shadowing', {
    lastShadowCueId: 'a', shadowingFactor: 1.5,
  }).type, 'pause-for-shadowing');
  assert.notEqual(playbackLearningAction(cues, 4.1, 0.2, 'shadowing', { shadowingFactor: 1.5 }).type,
    'pause-for-shadowing', 'kullanıcı seek hareketi gölgeleme duraklatması sanıldı');
});

test('shadowing örtüşen başka konuşmacının aktif cue sunu ortasında duraklatmaz', () => {
  const overlapping = [
    { id: 'speaker-a', start: 10, end: 14, text: 'Birinci konuşmacı' },
    { id: 'speaker-b', start: 13.5, end: 17, text: 'İkinci konuşmacı' },
  ];
  const action = playbackLearningAction(overlapping, 14.05, 13.95, 'shadowing');
  assert.equal(action.type, 'set-rate');
  assert.equal(action.cueId, 'speaker-b');
});

test('cue döngüsü yapılandırılan sayıda tekrarlar ve kullanıcı seek hareketini yutmaz', () => {
  const first = playbackLearningAction(cues, 4.05, 3.95, 'loop-cue', {
    repeatCount: 3, loopCueId: '', completedRepeats: 0,
  });
  assert.deepEqual(first, { type: 'loop-cue', cueId: 'a', time: 2,
    completedRepeats: 1, repeatCount: 3 });
  const second = playbackLearningAction(cues, 4.05, 3.95, 'loop-cue', {
    repeatCount: 3, loopCueId: 'a', completedRepeats: 1,
  });
  assert.equal(second.completedRepeats, 2);
  assert.deepEqual(playbackLearningAction(cues, 4.05, 3.95, 'loop-cue', {
    repeatCount: 3, loopCueId: 'a', completedRepeats: 2,
  }), { type: 'loop-cue-finished', cueId: 'a', repeatCount: 3 });
  assert.notEqual(playbackLearningAction(cues, 10, 3.95, 'loop-cue', { repeatCount: 3 }).type,
    'loop-cue', 'kullanıcı seek hareketi cue döngüsü sanıldı');
  const zeroDuration = [{ id: 'broken', start: 4, end: 4, text: 'Bozuk' }, ...cues];
  assert.notEqual(playbackLearningAction(zeroDuration, 4.05, 3.95, 'loop-cue', {
    repeatCount: 3,
  }).cueId, 'broken', 'sıfır süreli cue döngü eylemine girdi');
});

test('öğrenme notu medya ve zaman bağını korur', () => {
  const annotation = normalizeAnnotation({
    type: 'word', mediaId: 'netflix:1', start: 12.5, end: 14,
    source: 'break a leg', translation: 'bol şans', note: 'deyim', status: 'learning',
  });
  assert.match(annotation.id, /^annotation:/);
  assert.equal(annotation.mediaId, 'netflix:1');
  assert.equal(annotation.status, 'learning');
  assert.equal(annotation.start, 12.5);
});

console.log(`security-media-learning: ${passed} test`);
