'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { createCipheriv } = require('crypto');
const {
  CeaCaptionDecoder,
  buildHlsCeaSegmentMatchers,
  decryptHlsAes128,
  hlsAes128Iv,
  isLikelyMpegTsResponse,
  matchHlsCeaSegmentUrl,
} = require('../src/browser-cea-captions');
const {
  mp4VideoFragmentCompositionStart,
  mp4VideoFragmentStart,
} = require('../src/browser-subtitles');

const ROOT = path.join(__dirname, '..');
let passed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  OK  ${name}`);
    passed++;
  } catch (error) {
    console.error(`  FAIL ${name}`);
    throw error;
  }
}

test('gerçek MPEG-TS segmentinden CC1 ve CC3 cue üretir', () => {
  const fixture = fs.readFileSync(path.join(ROOT,
    'node_modules', 'mux.js', 'test', 'segments', 'multi-channel-608-captions.ts'));
  const cues = new CeaCaptionDecoder().decodeTransportStream(fixture);
  assert.ok(cues.some((cue) => cue.stream === 'CC1' && /PERIOD, FOLKS/.test(cue.text)));
  assert.ok(cues.some((cue) => cue.stream === 'CC3' && cue.text.includes('période')));
  assert.ok(cues.every((cue) => cue.end > cue.start));
});

test('gerçek fMP4 segmentinden CC1 cue üretir', () => {
  const dir = path.join(ROOT, 'node_modules', 'mux.js', 'test', 'segments');
  const init = fs.readFileSync(path.join(dir, 'dash-608-captions-init.mp4'));
  const segment = fs.readFileSync(path.join(dir, 'dash-608-captions-seg.m4s'));
  const cues = new CeaCaptionDecoder().decodeFragmentedMp4(segment, init);
  assert.deepEqual(cues.map((cue) => [cue.stream, cue.text, cue.start, cue.end]),
    [['CC1', '00:00:00', 0, 119]]);
});

test('fMP4 tfdt epoku HLS parça başlangıcına taşınır', () => {
  const dir = path.join(ROOT, 'node_modules', 'mux.js', 'test', 'segments');
  const init = fs.readFileSync(path.join(dir, 'dash-608-captions-init.mp4'));
  const shifted = Buffer.from(fs.readFileSync(path.join(dir, 'dash-608-captions-seg.m4s')));
  const tfdt = shifted.indexOf('tfdt');
  assert.ok(tfdt > 0);
  assert.equal(shifted[tfdt + 4], 1);
  shifted.writeBigUInt64BE(8n * 90000n, tfdt + 8);
  const raw = new CeaCaptionDecoder().decodeFragmentedMp4(shifted, init);
  assert.equal(raw[0].start, 8);
  const mapped = new CeaCaptionDecoder().decodeFragmentedMp4(shifted, init,
    { start: 0, duration: 120 });
  assert.equal(mapped[0].start, 0);
  assert.equal(mapped[0].timelineMapped, true);
  const later = new CeaCaptionDecoder().decodeFragmentedMp4(shifted, init,
    { start: 20, duration: 120 });
  assert.equal(later[0].start, 20);
});

test('fMP4 trun kompozisyon ofseti decode zamanından ayrı tutulur', () => {
  const box = (type, payload) => {
    const header = Buffer.alloc(8);
    header.writeUInt32BE(payload.length + 8, 0);
    header.write(type, 4, 4, 'ascii');
    return Buffer.concat([header, payload]);
  };
  const tfhd = Buffer.alloc(8);
  tfhd.writeUInt32BE(0, 0);
  tfhd.writeUInt32BE(1, 4);
  const tfdt = Buffer.alloc(12);
  tfdt[0] = 1;
  tfdt.writeBigUInt64BE(0n, 4);
  const trun = Buffer.alloc(12);
  trun.writeUInt32BE(0x00000800, 0);
  trun.writeUInt32BE(1, 4);
  trun.writeUInt32BE(8 * 90000, 8);
  const fragment = box('moof', box('traf', Buffer.concat([
    box('tfhd', tfhd), box('tfdt', tfdt), box('trun', trun),
  ])));
  assert.equal(mp4VideoFragmentStart(fragment, [1], { 1: 90000 }), 0);
  assert.equal(mp4VideoFragmentCompositionStart(fragment, [1], { 1: 90000 }), 8);
});

test('HLS segment eşleyicisi imzalı sorgu değişse de yalnız tanımlı yolu kabul eder', () => {
  const playlist = '#EXTM3U\n#EXT-X-TARGETDURATION:6\n#EXT-X-MAP:URI="init.mp4"\n'
    + '#EXTINF:6,\nseg-1.m4s?token=old\n#EXTINF:6,\nseg-2.m4s?token=old\n';
  const tracks = [{ instreamId: 'CC1', language: 'en', supported: true }];
  const matchers = buildHlsCeaSegmentMatchers(playlist,
    'https://cdn.test/v/playlist.m3u8', tracks, 'https://cdn.test/master.m3u8');
  assert.equal(matchers.length, 2);
  const match = matchHlsCeaSegmentUrl('https://cdn.test/v/seg-2.m4s?token=fresh', matchers);
  assert.equal(match.sequence, 1);
  assert.equal(match.initializationUrl, 'https://cdn.test/v/init.mp4');
  assert.equal(match.tracks[0].instreamId, 'CC1');
  assert.equal(matchHlsCeaSegmentUrl('https://cdn.test/v/other.m4s', matchers), null);
});

test('yalnız MPEG-TS video yanıtını erken yakalama adayı sayar', () => {
  assert.equal(isLikelyMpegTsResponse({ mimeType: 'video/mp2t', url: 'https://x/seg' }), true);
  assert.equal(isLikelyMpegTsResponse({ mimeType: 'video/mp4', url: 'https://x/seg.m4s' }), false);
  assert.equal(isLikelyMpegTsResponse({ mimeType: 'text/vtt', url: 'https://x/a.vtt' }), false);
});

test('AES-128 HLS segmentini örtük sıra IV değeriyle çözer', () => {
  const key = Buffer.from('00112233445566778899aabbccddeeff', 'hex');
  const plain = Buffer.from('CEA segment deneme gövdesi');
  const cipher = createCipheriv('aes-128-cbc', key, hlsAes128Iv(258));
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  assert.deepEqual(decryptHlsAes128(encrypted, key, 258), plain);
  assert.equal(hlsAes128Iv(258).toString('hex'), '00000000000000000000000000000102');
});

console.log(`browser-cea-captions: ${passed}/${passed} OK`);
