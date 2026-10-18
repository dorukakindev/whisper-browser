const assert = require('node:assert/strict');
const { EventEmitter } = require('node:events');
const { PassThrough } = require('node:stream');
const { prepareVoiceReference } = require('../src/voice-reference');
(async () => {
  const child = new EventEmitter(); child.stdout = new PassThrough(); child.stderr = new PassThrough();
  const stages = [];
  const result = prepareVoiceReference({ source: 'fixture.wav', start: 5, end: 25,
    reference: 'unused.wav', transcript: 'unused.txt', appRoot: '.', python: 'python', ffmpeg: 'ffmpeg',
    spawn: () => child, terminate: async () => {}, environment: () => ({}), onProcess() {},
    status: stage => stages.push(stage), isCancelled: () => false });
  child.stdout.write('VOICE_REFERENCE extract\nVOICE_REFERENCE_ERR');
  child.stdout.write('OR "Audio server connection failed. Check your network or proxy."\n');
  child.emit('close', 1);
  await assert.rejects(result, /Audio server connection failed/);
  assert.deepEqual(stages, ['extract']);
  console.log('voice-reference-process: split protocol error reaches caller without raw stderr');
})().catch(error => { console.error(error); process.exitCode = 1; });
