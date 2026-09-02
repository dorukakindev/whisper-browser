const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const messages = [];
let Processor;
class AudioWorkletProcessor {
  constructor() { this.port = { postMessage: message => messages.push(message), onmessage: null }; }
}
const context = {
  AudioWorkletProcessor,
  Int16Array,
  Math,
  Number,
  sampleRate: 16000,
  currentTime: 0,
  registerProcessor: (name, value) => { assert.equal(name, 'whisper-pcm-capture'); Processor = value; },
};
const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'live-asr-worklet.js'), 'utf8');
vm.runInNewContext(source, context);
const processor = new Processor();
processor.port.onmessage({ data: { type: 'sync', time: 42, contextTime: 0, paused: false, rate: 1.5 } });
for (let block = 0; block < 1000; block += 1) {
  context.currentTime = block * 128 / 16000;
  assert.equal(processor.process([[new Float32Array(128).fill(.1)]]), true);
}
const chunk = messages.find(message => message.type === 'chunk');
assert(chunk, 'Sekiz saniyede kesintisiz PCM parçası yayınlanmalı');
assert.equal(chunk.pcm.byteLength, 16000 * 8 * 2);
assert.equal(chunk.offset, 42);
assert.equal(chunk.rate, 1.5);
processor.port.onmessage({ data: { type: 'flush' } });
assert(messages.some(message => message.type === 'flushed'));
console.log('live-asr-worklet: 7 test');
