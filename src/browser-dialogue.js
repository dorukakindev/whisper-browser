'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { run } = require('./browser-media-tools');
async function dialogue({ video, start, end, model = 'base', language = '', python, ffmpeg, signal }) {
  if (![start, end].every(Number.isFinite) || start < 0 || end <= start || end - start > 60 || !['tiny', 'base', 'small'].includes(model) || !/^(?:[a-z]{2})?$/.test(language)) throw new Error('Konuşma aralığı en fazla 60 saniye ve model seçimi geçerli olmalı.');
  const backend = path.join(__dirname, '../backend'), separatorPython = path.join(backend, 'separator-venv/Scripts/python.exe');
  if (!fs.existsSync(separatorPython)) throw new Error('Konuşma ayırma ortamı eksik. install-browser-extras.bat dosyasını çalıştırın.');
  const folder = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-dialogue-'));
  try {
    const audio = path.join(folder, 'input.wav');
    await run(ffmpeg, ['-v', 'error', '-nostdin', '-ss', String(start), '-i', video, '-t', String(end - start), '-vn', '-ac', '2', '-ar', '44100', '-y', audio], '', signal, 60000);
    const script = path.join(backend, 'separate_dialogue.py');
    const separated = JSON.parse(await run(separatorPython, [script], JSON.stringify({ audio, output: folder, toolDirectory: path.dirname(ffmpeg), models: path.join(backend, 'separator-models') }), signal, 900000));
    if (!separated.ok) throw new Error(separated.error);
    if (path.dirname(path.resolve(separated.audio)) !== path.resolve(folder)) throw new Error('Konuşma çıktısı geçersiz.');
    const result = JSON.parse(await run(python, [script], JSON.stringify({ operation: 'transcribe', audio: separated.audio, start, model, language }), signal, 600000));
    if (!result.ok) throw new Error(result.error);
    return result;
  } finally {
    if (path.dirname(path.resolve(folder)) !== path.resolve(os.tmpdir()) || !path.basename(folder).startsWith('whisper-dialogue-')) throw new Error('Geçici konuşma yolu geçersiz.');
    fs.rmSync(folder, { recursive: true, force: true });
  }
}
module.exports = { dialogue };
