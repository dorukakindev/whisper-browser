'use strict';
const assert = require('node:assert/strict');
const path = require('node:path');
const { findTestPython } = require('./python-runtime');
const executable = path.resolve('fixture-python.exe');
const calls = [];
const probe = (command, args) => {
  calls.push([command, args]);
  return command === 'py' && args[0] === '-3'
    ? { status: 0, stdout: executable + '\n' }
    : { status: 0, stdout: 'Python bulunamadı; Microsoft Store üzerinden yükleyin.' };
};
assert.equal(findTestPython({ env: {}, platform: 'win32', probe }), executable);
assert(calls.some(([command, args]) => command === 'py' && args[0] === '-3.11'));
assert.equal(findTestPython({ env: {}, probe: () => ({ error: Error('başlatılamadı') }) }), null);
assert.equal(findTestPython({ env: { WHISPER_TEST_PYTHON: executable }, probe: command => {
  assert.equal(command, executable); return {status:0,stdout:executable};
} }), executable);
console.log('Python keşfi: launcher, Store takma adı, eksik yorumlayıcı ve açık seçim geçti.');
