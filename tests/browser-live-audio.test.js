const assert = require('assert');
const { pcm16Wav } = require('../src/browser-live-audio');

const pcm = Buffer.from([0, 0, 255, 127, 0, 128]);
const wav = pcm16Wav(pcm);
assert.equal(wav.toString('ascii', 0, 4), 'RIFF');
assert.equal(wav.toString('ascii', 8, 12), 'WAVE');
assert.equal(wav.readUInt32LE(24), 16000);
assert.equal(wav.readUInt16LE(22), 1);
assert.equal(wav.readUInt16LE(34), 16);
assert.equal(wav.readUInt32LE(40), pcm.length);
assert.deepEqual(wav.subarray(44), pcm);
assert.throws(() => pcm16Wav(Buffer.alloc(3)), /geçersiz/);
assert.throws(() => pcm16Wav(Buffer.alloc(16000 * 2 * 10)), /geçersiz/);
console.log('browser-live-audio: 9 test');
