#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { auditSubtitlePair } = require('../src/subtitle-pair-quality');

const goldenPath = path.resolve(process.argv[2] || 'quality/subtitle-quality-golden.json');
try {
  const golden = JSON.parse(fs.readFileSync(goldenPath, 'utf8'));
  const evaluate = rows => {
    const source = rows.map((row, index) => ({ start: index * 2, end: index * 2 + 1.8, text: row.source }));
    const target = rows.map((row, index) => ({ start: index * 2, end: index * 2 + 1.8, text: row.target }));
    const audit = auditSubtitlePair(source, target, { targetLanguage: 'tr' });
    return {
      examples: rows.length,
      blockingFalseRejections: audit.blockingCount,
      blockingFalseRejectionRate: audit.blockingCount / Math.max(1, rows.length),
      advisoryFlags: audit.advisoryCount,
      pass: audit.blockingCount === 0,
    };
  };
  const knownGood = evaluate(golden.knownGood || []);
  const expectedRepairs = evaluate(golden.expectedRepairs || []);
  const report = { schemaVersion: 1, knownGood, expectedRepairs,
    pass: knownGood.pass && expectedRepairs.pass };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.pass ? 0 : 2;
} catch (error) {
  console.error(`Altın çeviri kümesi denetlenemedi: ${error.message}`);
  process.exitCode = 1;
}
