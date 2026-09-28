'use strict';
// R182: src/browser-dialogue.js — doğrulama kapıları, çıktı kapsama kontrolü ve
// geçici-klasör temizliği. fs ve run Module._load kancasıyla stub'lanır:
// hiç ffmpeg/Python spawn'u yok (builtin'ler require.cache'i atlar).
const assert = require('node:assert/strict');
const Module = require('node:module');
const os = require('node:os');
const path = require('node:path');

const realFs = require('node:fs');
const calls = { run: [], removed: [] };
const state = { venvExists: true, transcribeReply: null, separatedAudio: null };
let folder;

const fakeFs = new Proxy(realFs, {
  get(target, prop) {
    if (prop === 'existsSync') return () => state.venvExists;
    if (prop === 'mkdtempSync') return () => { folder = path.join(os.tmpdir(), 'whisper-dialogue-test'); return folder; };
    if (prop === 'rmSync') return (p) => { calls.removed.push(p); };
    return target[prop];
  },
});
const realRun = { current: null };
const realLoad = Module._load;
Module._load = function (request, parent, isMain) {
  if (request === 'node:fs') return fakeFs;
  if (request === './browser-media-tools' || request.endsWith('/browser-media-tools')) {
    return { run: (...args) => realRun.current(...args) };
  }
  return realLoad.call(this, request, parent, isMain);
};
const { dialogue } = require('../src/browser-dialogue');
Module._load = realLoad; // kanca yalnız yükleme anında gerekli; bağlam sabitlendi

const defaultRun = async (exe, args, input) => {
  calls.run.push({ exe, args, input });
  if (input && input.includes('"audio"') && !input.includes('"operation"')) {
    state.separatedAudio = path.join(folder, 'vocals.wav');
    return JSON.stringify({ ok: true, audio: state.separatedAudio });
  }
  if (input && input.includes('"operation"')) {
    return state.transcribeReply
      || JSON.stringify({ ok: true, cues: [{ start: 0, end: 1, text: 'selam' }] });
  }
  return 'ok';
};
realRun.current = defaultRun;

async function expectError(opts, part) {
  await assert.rejects(() => dialogue(opts), (error) => {
    assert.ok(String(error.message).includes(part), `${part} bekleniyor, gelen: ${error.message}`);
    return true;
  });
}

const base = { video: '/video/film.mp4', start: 0, end: 10, model: 'base', language: 'tr',
               python: '/venv/python', ffmpeg: '/bin/ffmpeg' };

async function main() {
  // Doğrulama kapıları — fs/run'a hiç ulaşmadan reddedilmeli.
  await expectError({ ...base, start: -1 }, '60 saniye');
  await expectError({ ...base, start: 10, end: 10 }, '60 saniye');
  await expectError({ ...base, end: 61 }, '60 saniye');
  await expectError({ ...base, model: 'large-v3' }, '60 saniye');
  await expectError({ ...base, language: 'TUR' }, '60 saniye');
  await expectError({ ...base, start: NaN }, '60 saniye');
  assert.equal(calls.run.length, 0, 'kapılar spawn öncesi reddetmeli');

  // Eksik ayırıcı ortamı → kurulum talimatı.
  state.venvExists = false;
  await expectError(base, 'install-browser-extras.bat');

  // Tam akış: ffmpeg argümanları + yanıt zinciri + klasör temizliği.
  state.venvExists = true;
  const out = await dialogue(base);
  assert.equal(out.ok, true);
  assert.equal(out.cues[0].text, 'selam');
  const ffmpeg = calls.run.find((c) => c.exe === '/bin/ffmpeg');
  assert.ok(ffmpeg.args.includes('-nostdin'));
  assert.equal(ffmpeg.args[ffmpeg.args.indexOf('-t') + 1], '10');
  assert.deepEqual(calls.removed, [path.join(os.tmpdir(), 'whisper-dialogue-test')]);

  // Çıktı kapsama ihlali → reddedilir ve klasör yine temizlenir.
  calls.run.length = 0; calls.removed.length = 0;
  realRun.current = async (exe, args, input) => {
    calls.run.push({ exe, args, input });
    if (input && input.includes('"audio"')) return JSON.stringify({ ok: true, audio: '/etc/passwd' });
    return 'ok';
  };
  await expectError(base, 'Konuşma çıktısı geçersiz');
  assert.deepEqual(calls.removed, [path.join(os.tmpdir(), 'whisper-dialogue-test')], 'ihlalde de temizlik çalışmalı');

  // Bozuk JSON yanıtı → ham SyntaxError yerine Türkçe mesaj.
  realRun.current = defaultRun;
  calls.removed.length = 0;
  state.transcribeReply = 'NOT-JSON';
  await expectError(base, 'geçersiz yanıt');
  assert.deepEqual(calls.removed, [path.join(os.tmpdir(), 'whisper-dialogue-test')], 'parse hatasında da temizlik');

  console.log('browser-dialogue kapı/kapsama/temizlik testleri geçti (8 senaryo).');
}

main().catch((error) => { console.error(error); process.exit(1); });
