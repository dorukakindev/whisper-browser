#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { auditSubtitlePair, parseSubtitleFile, sha256 } = require('../src/subtitle-pair-quality');

const manifestPath = path.resolve(process.argv[2] || 'quality/subtitle-quality-corpus.json');
const expand = value => String(value || '').replace(/%([^%]+)%/g, (_match, name) => process.env[name] || '');

try {
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const baseDir = path.resolve(expand(manifest.baseDir || path.dirname(manifestPath)));
  const results = [];
  for (const item of manifest.pairs || []) {
    const sourcePath = path.resolve(baseDir, item.source);
    const targetPath = path.resolve(baseDir, item.target);
    if (!fs.existsSync(sourcePath) || !fs.existsSync(targetPath)) {
      results.push({ name: item.name, pass: false, error: 'Kaynak veya hedef dosya bulunamadı.' });
      continue;
    }
    const sourceBuffer = fs.readFileSync(sourcePath);
    const targetBuffer = fs.readFileSync(targetPath);
    const source = parseSubtitleFile(sourceBuffer, sourcePath);
    const target = parseSubtitleFile(targetBuffer, targetPath);
    const audit = auditSubtitlePair(source.cues, target.cues, {
      targetLanguage: item.targetLanguage || 'tr',
      expectedMinSourceCues: item.expectedMinSourceCues,
      expectedMinTargetCues: item.expectedMinTargetCues,
    });
    results.push({
      name: item.name,
      ...audit,
      sourceSha256: sha256(sourceBuffer),
      targetSha256: sha256(targetBuffer),
    });
  }
  const report = {
    schemaVersion: 1,
    generatedAt: new Date().toISOString(),
    manifest: path.basename(manifestPath),
    pass: results.length > 0 && results.every(item => item.pass),
    results,
  };
  console.log(JSON.stringify(report, null, 2));
  process.exitCode = report.pass ? 0 : 2;
} catch (error) {
  console.error(`Altyazı kalite korpusu denetlenemedi: ${error.message}`);
  process.exitCode = 1;
}
