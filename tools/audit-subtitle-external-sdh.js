#!/usr/bin/env node
'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { discoverHamFinalPairs } = require('../src/subtitle-corpus-discovery');
const { parseSubtitleFile, sha256 } = require('../src/subtitle-pair-quality');

const manifestPath = path.resolve(process.argv[2] || 'quality/subtitle-sdh-external-corpus.json');
try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const root = path.resolve(manifest.baseDir);
  const excluded = (manifest.excluded || []).map((item) => item.source);
  const pairs = discoverHamFinalPairs(fs, root, excluded).map((pair) => {
    const sourceBuffer = fs.readFileSync(pair.source);
    const targetBuffer = fs.readFileSync(pair.target);
    const source = parseSubtitleFile(sourceBuffer, pair.source).cues;
    const target = parseSubtitleFile(targetBuffer, pair.target).cues;
    const timestamp = (cue) => `${Number(cue.start).toFixed(3)}-${Number(cue.end).toFixed(3)}`;
    const sourceTimes = new Set(source.map(timestamp));
    const aligned = target.filter((cue) => sourceTimes.has(timestamp(cue))).length;
    const alignmentRatio = target.length ? aligned / target.length : 0;
    const retentionRatio = source.length ? target.length / source.length : 0;
    return { name: pair.name, sourceCues: source.length, targetCues: target.length,
      alignmentRatio: Number(alignmentRatio.toFixed(4)), retentionRatio: Number(retentionRatio.toFixed(4)),
      sourceSha256: sha256(sourceBuffer), targetSha256: sha256(targetBuffer),
      pass: source.length > 0 && target.length > 0 && alignmentRatio >= .98 && retentionRatio >= .8 };
  });
  const report = { schemaVersion: 1, kind: manifest.kind, pairCount: pairs.length,
    excluded: manifest.excluded || [], pass: pairs.length >= 10 && pairs.every((pair) => pair.pass), pairs };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.pass ? 0 : 2;
} catch (error) {
  console.error(`Harici SDH korpusu denetlenemedi: ${error.message}`);
  process.exitCode = 1;
}
