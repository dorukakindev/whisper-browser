'use strict';
// Camera / telesync releases are recognised in their common spellings and never outrank a real release.
const test = require('node:test'), assert = require('node:assert/strict'), A = require('../src/stremio-addons');
const row = (file) => A.normalizeStream({ name: 'Addon\n1080p', description: file, url: 'https://cdn.example/a.mkv', behaviorHints: { filename: file } }, { key: 'a', name: 'A', host: 'a.example' });
test('HDCAM, CAMRip, HDTS, HDTC and TELESYNC are flagged as camera recordings', () => {
  for (const file of ['X.1080p.HDCAM.x264-TRASH.mkv', 'X.CAMRip.mkv', 'X.720p.HDTS.mkv', 'X.HDTC.mkv', 'X.1080p.CAM.x264.mkv', 'X.TELESYNC.1080p.mkv']) {
    const r = row(file); assert.ok(['cam', 'telesync'].includes(r.source), file + ' -> ' + r.source); assert.ok(r.warns.includes('cam'), file);
    assert.ok(r.score < row('X.1080p.WEB-DL.mkv').score, file + ' must score below a WEB-DL');
  }
});
test('titles that merely contain "cam" and plain .ts files are not camera recordings', () => {
  for (const file of ['Camera.Obscura.2021.1080p.WEB-DL.mkv', 'Cameraman.1080p.BluRay.mkv', 'Movie.2020.1080p.ts']) assert.ok(!row(file).warns.includes('cam'), file);
});
