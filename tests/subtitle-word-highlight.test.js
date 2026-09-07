const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const root = path.join(__dirname, '..');
const renderer = fs.readFileSync(path.join(root, 'src', 'renderer', 'renderer.js'), 'utf8');
const html = fs.readFileSync(path.join(root, 'src', 'renderer', 'index.html'), 'utf8');
const css = fs.readFileSync(path.join(root, 'src', 'renderer', 'styles.css'), 'utf8');
const main = fs.readFileSync(path.join(root, 'src', 'main.js'), 'utf8');
const { readAdjacentWordSegments, sanitizeWordSegments } = require('../src/subtitle-word-sidecar');

const logicStart = renderer.indexOf('function wordAlignmentText(');
const logicEnd = renderer.indexOf('// Altyazi metnini kutulu bir span', logicStart);
assert(logicStart > 0 && logicEnd > logicStart, 'kelime hizalama fonksiyonları bulunamadı');
const { alignCueWords, attachTimedWordsToCues } = new Function(
  `${renderer.slice(logicStart, logicEnd)}; return { alignCueWords, attachTimedWordsToCues };`,
)();

assert.deepStrictEqual(alignCueWords('Hello world.', [
  { word: ' Hello' }, { word: ' world' },
]), [{ start: 0, end: 5 }, { start: 6, end: 11 }]);

assert.deepStrictEqual(alignCueWords('İstanbul güzel.', [
  { word: 'istanbul' }, { word: ' güzel' },
]), [{ start: 0, end: 8 }, { start: 9, end: 14 }]);

assert.deepStrictEqual(alignCueWords('Merhaba, dünya!', [
  { word: ' Merhaba ,' }, { word: 'dünya !' },
]), [{ start: 0, end: 7 }, { start: 9, end: 14 }]);

assert.strictEqual(alignCueWords('Bambaşka metin', [{ word: 'eşleşmez' }]), null);
assert.deepStrictEqual(alignCueWords('Boş liste', []), []);

const cues = [
  { start: 0, end: 1, text: 'Bir' },
  { start: 2, end: 4, text: 'İki, üç.' },
];
const segments = [
  { start: 0, end: 1, words: [{ word: ' Bir', start: .1, end: .7 }] },
  { start: 1.8, end: 2.4, words: [{ word: ' İki', start: 2.05, end: 2.4 }] },
  { start: 2.4, end: 3.2, words: [{ word: ' üç', start: 2.5, end: 3.1 }] },
];
assert.deepStrictEqual(attachTimedWordsToCues(cues, segments), {
  timed: 2, matched: 2, unmatched: 0,
});
assert.deepStrictEqual(cues[1].wordRanges, [
  { start: 0, end: 3, timeStart: 2.05, timeEnd: 2.4 },
  { start: 5, end: 7, timeStart: 2.5, timeEnd: 3.1 },
]);

assert.deepStrictEqual(sanitizeWordSegments({ segments: [
  { start: 0, end: 2, words: [
    { word: ' Sağlam', start: .1, end: .8, probability: .9 },
    { word: 'taşan', start: 3, end: 4 },
    { word: '', start: 1, end: 1.2 },
  ] },
  { start: '0', end: 1, words: [{ word: 'sayısal dize', start: 0, end: 1 }] },
] }), [{
  start: 0,
  end: 2,
  words: [{ word: ' Sağlam', start: .1, end: .8, probability: .9 }],
}]);

const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-word-sidecar-'));
try {
  const subtitle = path.join(temp, 'film.srt');
  fs.writeFileSync(subtitle, '1\n00:00:00,000 --> 00:00:01,000\nMerhaba\n', 'utf8');
  fs.writeFileSync(path.join(temp, 'film.json'), JSON.stringify({ segments: [
    { start: 0, end: 1, words: [{ word: ' Merhaba', start: .1, end: .8 }] },
  ] }), 'utf8');
  assert.equal(readAdjacentWordSegments(subtitle).length, 1);
  assert.deepStrictEqual(readAdjacentWordSegments(path.join(temp, 'film.json')), []);
} finally {
  fs.rmSync(temp, { recursive: true, force: true });
}

assert.match(main, /readAdjacentWordSegments\(filePath\)/);
assert.match(renderer, /CSS\.highlights\.set\('cue-word-active', _hl\.active\)/);
assert.match(renderer, /_hl\.picked\.priority = 3[\s\S]*_hl\.hover\.priority = 2|_hl\.hover\.priority = 2[\s\S]*_hl\.picked\.priority = 3/);
assert.match(renderer, /requestVideoFrameCallback[\s\S]*queuePlayerVideoFrame/);
assert.match(renderer, /PERSIST_CHECKBOX_CONTROLS[\s\S]*'playerWordHighlight'/);
assert.match(html, /<input type="checkbox" id="playerWordHighlight" \/>/);
assert.match(css, /::highlight\(cue-word-active\)[^{]*\{[^}]*var\(--sub-color/);
assert.doesNotMatch(css.match(/::highlight\(cue-word-active\)[\s\S]*?\}/)[0], /background/);

console.log('subtitle-word-highlight tests: OK');
