'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { auditSubtitlePair, parseSubtitleFile } = require('../src/subtitle-pair-quality');

const srt = rows => Buffer.from('\ufeff' + rows.map((row, index) => (
  `${index + 1}\r\n${row.time}\r\n${row.text}\r\n`
)).join('\r\n'), 'utf8');

const source = parseSubtitleFile(srt([
  { time: '00:00:00,000 --> 00:00:02,000', text: 'He never carried 80 bags.' },
  { time: '00:00:02,000 --> 00:00:04,000', text: 'What happened next?' },
  { time: '00:00:04,000 --> 00:00:06,000', text: 'This is a longer source sentence.' },
]), 'source.srt').cues;

const clean = parseSubtitleFile(srt([
  { time: '00:00:00,000 --> 00:00:02,000', text: 'Asla seksen paket taşımadı.' },
  { time: '00:00:02,000 --> 00:00:04,000', text: 'Sonra ne oldu?' },
  { time: '00:00:04,000 --> 00:00:06,000', text: 'Bu daha uzun bir kaynak cümlesidir.' },
]), 'target.srt').cues;

const valid = auditSubtitlePair(source, clean);
assert.equal(valid.pass, true);
assert.equal(valid.matchedCues, 3);
assert.equal(valid.issues.numberMismatch.length, 0, '80 → seksen yanlış pozitif olmamalı');

const broken = parseSubtitleFile(srt([
  { time: '00:00:00,000 --> 00:00:02,000', text: 'He never carried 8 bags.' },
  { time: '00:00:02,000 --> 00:00:04,000', text: 'What happened next?' },
  { time: '00:00:06,000 --> 00:00:08,000', text: 'Fazladan satır.' },
]), 'broken.srt').cues;
const failed = auditSubtitlePair(source, broken);
assert.equal(failed.pass, false);
assert.equal(failed.issues.numberMismatch.length, 1);
assert.equal(failed.issues.sourceEcho.length, 1);
assert.equal(failed.issues.missingTarget.length, 1);
assert.equal(failed.issues.extraTarget.length, 1);

const duplicateTimes = auditSubtitlePair(
  [{ start: 0, end: 1, text: 'One.' }, { start: 0, end: 1, text: 'Two.' }],
  [{ start: 0, end: 1, text: 'Bir.' }, { start: 0, end: 1, text: 'İki.' }],
);
assert.equal(duplicateTimes.matchedCues, 2, 'aynı zamanlı cue sıra içinde kaybolmamalı');

const jointlyTruncated = auditSubtitlePair(
  [{ start: 0, end: 1, text: 'Tek kaynak satırı.' }],
  [{ start: 0, end: 1, text: 'Tek hedef satırı.' }],
  { expectedMinSourceCues: 100, expectedMinTargetCues: 100 },
);
assert.equal(jointlyTruncated.pass, false, 'iki dosyanın birlikte küçülmesi başarı sayılmamalı');
assert.equal(jointlyTruncated.issues.sourceBelowMinimum[0].expectedMinimum, 100);
assert.equal(jointlyTruncated.issues.targetBelowMinimum[0].actual, 1);

const golden = JSON.parse(fs.readFileSync(
  path.join(__dirname, '..', 'quality', 'subtitle-quality-golden.json'), 'utf8'
));
for (const [name, rows] of [['knownGood', golden.knownGood], ['expectedRepairs', golden.expectedRepairs]]) {
  const goldenAudit = auditSubtitlePair(
    rows.map((row, index) => ({ start: index * 2, end: index * 2 + 1.8, text: row.source })),
    rows.map((row, index) => ({ start: index * 2, end: index * 2 + 1.8, text: row.target })),
  );
  assert.equal(goldenAudit.blockingCount, 0,
    `${name} iyi çevirilerinde sert kapı yanlış reddi olmamalı`);
}

console.log('subtitle-pair-quality: timestamp eşleme ve anlam kalite kapıları geçti.');
