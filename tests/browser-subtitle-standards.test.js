'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const crypto = require('node:crypto');
const fs = require('node:fs');
const path = require('node:path');
const MP4Box = require('mp4box');
const imscDoc = require('imsc/src/main/js/doc');
const imscISD = require('imsc/src/main/js/isd');
const { WebVTT, VTTCue, VTTRegion } = require('vtt.js');
const {
  dashSegmentOffset,
  detectHlsCea608,
  parseDashSubtitleMatchers,
  parseMp4WebVtt,
  parseSubtitlePayload,
} = require('../src/browser-subtitles');
const { captureDashSegments } = require('../src/browser-dash-capture');

const fixtureRoot = path.join(__dirname, 'fixtures', 'browser-standards');
const read = (name) => fs.readFileSync(path.join(fixtureRoot, name), 'utf8');

test('standart oracle provenance kaydı sabit, anonim ve hash doğrulamalıdır', () => {
  const manifest = JSON.parse(read('manifest.json'));
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.sources.length, 6);
  assert.match(manifest.fixturePolicy, /DRM anahtarı veya canlı URL kopyalanmamıştır/);
  for (const source of manifest.sources) {
    assert.match(source.url, /^https:\/\/github\.com\//);
    assert.match(source.commit, /[0-9a-f]{40}/i);
    assert.ok(source.license && source.use);
  }
  for (const fixture of manifest.fixtures) {
    const body = fs.readFileSync(path.join(fixtureRoot, fixture.file));
    assert.equal(crypto.createHash('sha256').update(body).digest('hex'), fixture.sha256, fixture.file);
    assert.doesNotMatch(body.toString('utf8'), /(?:license[_-]?key|bearer\s|widevine_key|token=)/i);
  }
});

test('DASH-IF livesim biçimli statik Number ve Time şablonları son parçaya kadar genişler', () => {
  const numbered = parseDashSubtitleMatchers(read('livesim-static-number.mpd'), 'https://fixture.invalid/show/manifest.mpd');
  assert.equal(numbered.length, 4);
  assert.deepEqual(numbered.map((item) => path.basename(new URL(item.segmentUrl).pathname)),
    ['00007.m4s', '00008.m4s', '00009.m4s', '00010.m4s']);
  assert.deepEqual(numbered.map(dashSegmentOffset), [0, 2, 4, 6]);
  assert.ok(numbered.every((item) => item.initializationUrl.endsWith('/text/cc-en/init.mp4')));

  const timed = parseDashSubtitleMatchers(read('livesim-time-cea.mpd'), 'https://fixture.invalid/show/manifest.mpd');
  assert.deepEqual(timed.map((item) => path.basename(new URL(item.segmentUrl).pathname)),
    ['4000.m4s', '6000.m4s', '8000.m4s']);
  assert.deepEqual(timed.map(dashSegmentOffset), [0, 2, 4]);
  assert.deepEqual(detectHlsCea608(read('cea-master.m3u8')).map((item) => item.instreamId), ['CC1']);
});

test('statik SegmentTemplate en son altyazı parçasını indirir ve ekseni korur', async () => {
  const matchers = parseDashSubtitleMatchers(read('livesim-static-number.mpd'),
    'https://fixture.invalid/show/manifest.mpd');
  const fetched = [];
  const stored = [];
  const complete = await captureDashSegments(matchers, {
    current: () => true,
    completed: new Map(),
    fetchBuffer: async (url) => {
      fetched.push(url);
      return Buffer.from('WEBVTT\n\n00:00.000 --> 00:01.500\n' + path.basename(url), 'utf8');
    },
    store: (cues) => { stored.push(...cues); return true; },
  });
  assert.equal(complete, true);
  assert.equal(fetched.length, 4);
  assert.ok(fetched.at(-1).endsWith('/00010.m4s'));
  assert.deepEqual(stored.map((cue) => cue.start), [0, 2, 4, 6]);
  assert.equal(stored.at(-1).text, '00010.m4s');
});

test('HbbTV/Axinom biçimli DRM yanındaki açık altyazı çok dönem ve reklam sınırında ayrılır', () => {
  const matchers = parseDashSubtitleMatchers(read('multiperiod-drm-text.mpd'),
    'https://fixture.invalid/catalog/manifest.mpd');
  assert.equal(matchers.length, 6);
  assert.deepEqual(matchers.map(dashSegmentOffset), [0, 2, 4, 6, 8, 10]);
  assert.deepEqual([...new Set(matchers.map((item) => item.language))], ['en', 'tr']);
  assert.ok(matchers.every((item) => /\/captions\//.test(item.segmentUrl)));
  assert.ok(matchers.every((item) => !/\/video\/|\/ad\//.test(item.segmentUrl)));
});

test('videojs/vtt.js parçalı oracle ile WebVTT zaman, metin ve sunum ayarları uyuşur', () => {
  global.navigator ||= { userAgent: '' };
  const body = read('webvtt-settings.vtt');
  const oracle = [];
  const parser = new WebVTT.Parser({ VTTCue, VTTRegion }, WebVTT.StringDecoder());
  parser.oncue = (cue) => oracle.push(cue);
  for (let cursor = 0; cursor < body.length; cursor += 17) parser.parse(body.slice(cursor, cursor + 17));
  parser.flush();
  const ours = parseSubtitlePayload(body, 'text/vtt', 'https://fixture.invalid/sub.vtt').cues;
  assert.equal(ours.length, oracle.length);
  for (let index = 0; index < ours.length; index++) {
    assert.equal(ours[index].start, oracle[index].startTime);
    assert.equal(ours[index].end, oracle[index].endTime);
    assert.equal(ours[index].text, oracle[index].text);
    assert.equal(Number.parseFloat(ours[index].line), oracle[index].line);
    assert.equal(Number.parseFloat(ours[index].position), oracle[index].position);
    assert.equal(Number.parseFloat(ours[index].size), oracle[index].size);
    assert.equal(ours[index].align, oracle[index].align);
    assert.equal(ours[index].writingMode || '', oracle[index].vertical || '');
  }
  const canonicalPositionAlign = { 'line-left': 'start', center: 'center', 'line-right': 'end' };
  assert.equal(canonicalPositionAlign[ours[0].positionAlign] || ours[0].positionAlign, oracle[0].positionAlign);
  assert.equal(ours[0].region, 'lower');
});

test('imscJS oracle IMSC zaman olaylarını ve bölge sunumunu doğrular', () => {
  const body = read('imsc-regions.ttml');
  const diagnostics = [];
  const handler = {
    info: () => false,
    warn: (message) => { diagnostics.push({ level: 'warn', message }); return false; },
    error: (message) => { diagnostics.push({ level: 'error', message }); return false; },
    fatal: (message) => { diagnostics.push({ level: 'fatal', message }); return false; },
  };
  const oracle = imscDoc.fromXML(body, handler);
  const events = oracle.getMediaTimeEvents();
  const rendered = imscISD.generateISD(oracle, 1.5, handler);
  const ours = parseSubtitlePayload(body, 'application/ttml+xml', 'https://fixture.invalid/sub.ttml').cues;
  assert.deepEqual(ours.map((cue) => [cue.start, cue.end]), [[1, 3], [3, 5]]);
  assert.ok([1, 3, 5].every((time) => events.includes(time)));
  assert.ok(rendered && typeof rendered === 'object');
  assert.equal(diagnostics.some((item) => item.level === 'fatal'), false);
  assert.deepEqual(ours.map((cue) => cue.region), ['lower', 'lower']);
  assert.deepEqual(ours.map((cue) => cue.position), ['10%', '10%']);
  assert.deepEqual(ours.map((cue) => cue.line), ['70%', '70%']);
});

function box(type, payload) {
  const head = Buffer.alloc(8);
  head.writeUInt32BE(payload.length + 8);
  head.write(type, 4, 4, 'ascii');
  return Buffer.concat([head, payload]);
}

function full(flags, payload, version = 0) {
  const head = Buffer.alloc(4);
  head[0] = version;
  head.writeUIntBE(flags, 1, 3);
  return Buffer.concat([head, payload]);
}

test('MP4Box.js oracle wvtt tfdt/trun zamanını özel ayrıştırıcıyla diferansiyel doğrular', () => {
  const sample = box('vttc', box('payl', Buffer.from('Oracle satırı', 'utf8')));
  const tfhd = Buffer.alloc(4); tfhd.writeUInt32BE(1);
  const tfdt = Buffer.alloc(4); tfdt.writeUInt32BE(6000);
  const rows = Buffer.alloc(16); rows.writeUInt32BE(1);
  rows.writeUInt32BE(2000, 4); rows.writeUInt32BE(sample.length, 8); rows.writeUInt32BE(500, 12);
  const fragment = Buffer.concat([
    box('moof', box('traf', Buffer.concat([
      box('tfhd', full(0, tfhd)), box('tfdt', full(0, tfdt)), box('trun', full(0xb00, rows)),
    ]))),
    box('mdat', sample),
  ]);

  const file = MP4Box.createFile();
  const input = fragment.buffer.slice(fragment.byteOffset, fragment.byteOffset + fragment.byteLength);
  input.fileStart = 0;
  file.appendBuffer(input);
  file.flush();
  const traf = file.boxes.find((item) => item.type === 'moof').trafs[0];
  const trun = traf.truns[0];
  const oracleStart = (traf.tfdt.baseMediaDecodeTime + trun.sample_composition_time_offset[0]) / 1000;
  const oracleEnd = oracleStart + trun.sample_duration[0] / 1000;
  assert.deepEqual(parseMp4WebVtt(fragment, { timescale: 1000 }), [
    { start: oracleStart, end: oracleEnd, text: 'Oracle satırı' },
  ]);
});
