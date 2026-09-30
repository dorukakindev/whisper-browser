'use strict';

// argv kaçış matrisi: kullanıcı-serbest metin seçeneklerinin transcribe.py
// argv'sine `--ad=değer` biçiminde bağlanmasını kilitler. argparse iki-parça
// itiminde `-` ile başlayan değeri seçenek sanıp fail-closed düşer; `=`
// biçimi tek öğe olarak bağlar.

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');
const { pushBoundOption, argvHasUnboundOptionValue } = require('../src/argv-escape');
const { findTestPython } = require('./python-runtime');

let passed = 0;
let skipped = 0;
const test = (name, fn) => {
  const skipsBefore = skipped;
  fn();
  // skip() ile çıkan kontrol "geçti" sayılmaz — ayrı sayaçta tutulur.
  if (skipped === skipsBefore) { passed += 1; console.log('  ✓', name); }
};
const skip = () => { skipped += 1; };

test('pushBoundOption: normal değer iki-parça, -li değer tek-parça', () => {
  const a = [];
  pushBoundOption(a, '--input', '/tmp/video.mp4');
  assert.deepEqual(a, ['--input', '/tmp/video.mp4']);
  pushBoundOption(a, '--input', '-foo.mp4');
  assert.deepEqual(a.slice(2), ['--input=-foo.mp4']);
  pushBoundOption(a, '--youtube', '--help');
  assert.deepEqual(a.slice(-1), ['--youtube=--help']);
  pushBoundOption(a, '--glossary', '');
  assert.deepEqual(a.slice(-2), ['--glossary', '']); // boş değer iki-parça da bağlı
});

test('argvHasUnboundOptionValue: kaçmamış -li değer yakalanır', () => {
  assert.equal(argvHasUnboundOptionValue(
    ['--input', '/x'], ['--input']), null);
  assert.deepEqual(argvHasUnboundOptionValue(
    ['--input', '-evil'], ['--input']), { index: 1, option: '--input', value: '-evil' });
  assert.equal(argvHasUnboundOptionValue(
    ['--input=-evil'], ['--input']), null); // tek öğe — bağlı
});

test('kaynak ratchet: duyarlı seçenekler iki-parça itilmiyor', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const sensitive = [
    '--input', '--youtube', '--input-dir', '--output-dir', '--model',
    '--engine', '--device', '--compute-type', '--language', '--task',
    '--initial-prompt', '--formats', '--sync-srt', '--split-mode',
    '--wrap-mode', '--glossary', '--llm-base-url', '--llm-model',
    '--translate-to', '--translate-base-url', '--translate-model',
    '--translate-register', '--translate-profanity', '--translate-existing',
    '--explain-kind', '--explain-word', '--explain-translation',
    '--audio-preprocess', '--youtube-audio-lang', '--youtube-cookie-browser',
    '--instance', '--tab', '--continuation', '--audio-url', '--audio-lang',
    '--cookie-browser', '--search-type', '--features', '--compare-model',
    '--url', '--output-dir', '--output-file', '--video-url', '--channel-id',
    '--playlist-id', '--browse-id', '--translate-context', '--cache-dir',
    '--explain-index', '--height', '--username',
  ];
  const bad = [];
  for (const name of sensitive) {
    const pattern = new RegExp(`args\\.push\\(\\s*'${name.replace(/-/g, '\\-')}'\\s*,`, 'g');
    let m;
    while ((m = pattern.exec(src))) {
      // İstisna: aynı satırda üç+ argümanlı çoklu itim değilse iki-parçadır.
      bad.push(`${name} @${src.slice(0, m.index).split('\n').length}`);
    }
  }
  assert.deepEqual(bad, [], 'iki-parça kalan duyarlı seçenekler: ' + bad.join(', '));
});

test('matris: main.js pushBoundOption adları gerçek argparse ile -li değeri kabul eder', () => {
  // Seçenek adları main.js kaynağından çıkarılır ve gerçek Python argparse'a
  // `--ad=değer` tek öğesi olarak gönderilir — değer bayt-bayt aynen gelmeli.
  const src = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const names = [...new Set(
    [...src.matchAll(/pushBoundOption\([^,]+,\s*'(--[^']+)'/g)].map((m) => m[1]))];
  assert(names.length >= 30, `beklenmedik az seçenek: ${names.length}`);
  const hostile = ['--help', '-x', '--', '-foo.mp4', '--config=/etc/x', '-9', '-m'];

  const py = [
    'import argparse, sys, json',
    'p = argparse.ArgumentParser()',
    'names = json.loads(sys.argv[1])',
    'for n in names: p.add_argument(n)',
    'ns, _ = p.parse_known_args(json.loads(sys.argv[2]))',
    'out = {n.lstrip("-").replace("-", "_"): getattr(ns, n.lstrip("-").replace("-", "_")) for n in names}',
    'print(json.dumps(out))',
  ].join('\n');
  const argv = [];
  for (const n of names) argv.push(`${n}=${hostile[names.indexOf(n) % hostile.length]}`);
  // Yorumlayıcı keşfi ortamdan ortama değişir (venv/py launcher/python3) —
  // bulunamazsa matrisin argparse ayağı atlanır, kaynak taraması sürer.
  const python = findTestPython();
  if (!python) {
    skip();
    console.log('  SKIP argparse ayağı: yorumlayıcı bulunamadı');
    return;
  }
  const res = spawnSync(python, ['-c', py, JSON.stringify(names), JSON.stringify(argv)],
    { encoding: 'utf8' });
  assert.equal(res.status, 0, `argparse reddetti: ${res.stderr.slice(0, 300)}`);
  const got = JSON.parse(res.stdout);
  for (const n of names) {
    const key = n.replace(/^--/, '').replace(/-/g, '_');
    const want = hostile[names.indexOf(n) % hostile.length];
    assert.equal(got[key], want, `${n}: '${got[key]}' !== '${want}'`);
  }
});

console.log(`PASS: argv-escape-matrix (${passed} kontrol${skipped ? `, ${skipped} atlandı` : ''})`);
