const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const { parseSubtitlePayload } = require('../src/browser-subtitles');

const corpusRoot = path.resolve(__dirname, 'fixtures', 'subtitle-realworld');
const manifestPath = path.join(corpusRoot, 'manifest.json');
const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

assert.equal(manifest.schemaVersion, 1);
assert.equal(manifest.policy?.noLiveNetwork, true);
assert.equal(manifest.policy?.contentSynthetic, true);
assert(Array.isArray(manifest.fixtures) && manifest.fixtures.length >= 6,
  'gerçek-dünya korpusu en az altı sabit biçim örneği içermeli');

const ids = new Set();
const files = new Set();
let cueCount = 0;
for (const fixture of manifest.fixtures) {
  assert(fixture.id && !ids.has(fixture.id), `yinelenen fixture kimliği: ${fixture.id}`);
  ids.add(fixture.id);
  assert(fixture.file && !files.has(fixture.file), `yinelenen fixture dosyası: ${fixture.file}`);
  files.add(fixture.file);
  assert.match(fixture.sha256 || '', /^[a-f0-9]{64}$/);
  assert(fixture.provenance?.kind && fixture.provenance?.source && fixture.provenance?.sourceUrl
    && fixture.provenance?.sourceLicense && fixture.provenance?.transformation,
  `${fixture.id}: provenance alanları eksik`);
  assert(/synthetic|reconstruction|original|replaced/i.test(
    `${fixture.provenance.kind} ${fixture.provenance.transformation} ${fixture.provenance.sourceLicense}`),
  `${fixture.id}: sentetikleştirme kaydı yok`);

  const target = path.resolve(corpusRoot, fixture.file);
  assert(target.startsWith(`${corpusRoot}${path.sep}`), `${fixture.id}: fixture yolu korpus dışına çıkıyor`);
  const bytes = fs.readFileSync(target);
  assert(bytes.length > 0 && bytes.length <= 1024 * 1024, `${fixture.id}: fixture boyutu geçersiz`);
  assert.equal(crypto.createHash('sha256').update(bytes).digest('hex'), fixture.sha256,
    `${fixture.id}: fixture manifestten sonra değişmiş`);
  const parserUrl = new URL(fixture.parserUrl);
  assert(parserUrl.hostname.endsWith('.invalid'), `${fixture.id}: parser URL canlı bir hosta bağlı`);

  const first = parseSubtitlePayload(bytes.toString('utf8'), fixture.mimeType, fixture.parserUrl);
  const second = parseSubtitlePayload(bytes.toString('utf8'), fixture.mimeType, fixture.parserUrl);
  assert.equal(first.format, fixture.format, `${fixture.id}: biçim yanlış algılandı`);
  assert.deepEqual(first, second, `${fixture.id}: parser deterministik değil`);
  assert.equal(first.cues.length, fixture.expected.length, `${fixture.id}: cue sayısı farklı`);
  fixture.expected.forEach((expected, index) => {
    for (const [key, value] of Object.entries(expected)) {
      if (typeof value === 'number') {
        assert(Math.abs(Number(first.cues[index]?.[key]) - value) < 0.001,
          `${fixture.id}: cue ${index} ${key} farklı`);
      } else {
        assert.equal(first.cues[index]?.[key], value, `${fixture.id}: cue ${index} ${key} farklı`);
      }
    }
  });
  cueCount += first.cues.length;
}

const diskFiles = fs.readdirSync(corpusRoot)
  .filter((name) => name !== 'manifest.json')
  .sort();
assert.deepEqual([...files].sort(), diskFiles, 'manifest dışı bırakılmış veya sahipsiz fixture var');
assert(cueCount >= 12, `korpus cue sayısı beklenenden düşük: ${cueCount}`);

console.log(`Gerçek-dünya altyazı korpusu: ${manifest.fixtures.length} fixture, ${cueCount} cue, hash/provenance OK`);
