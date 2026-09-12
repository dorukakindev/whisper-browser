#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { auditSubtitlePair, parseSubtitleFile, sha256 } = require('../src/subtitle-pair-quality');

const args = process.argv.slice(2);
const json = args.includes('--json');
const files = args.filter(arg => arg !== '--json');
if (files.length !== 2) {
  console.error('Kullanım: npm run audit:subtitle-pair -- <kaynak.srt> <çeviri.srt> [--json]');
  process.exit(1);
}

try {
  const sourcePath = path.resolve(files[0]);
  const targetPath = path.resolve(files[1]);
  const sourceBuffer = fs.readFileSync(sourcePath);
  const targetBuffer = fs.readFileSync(targetPath);
  const source = parseSubtitleFile(sourceBuffer, sourcePath);
  const target = parseSubtitleFile(targetBuffer, targetPath);
  if (!source.cues.length || !target.cues.length) {
    throw new Error('Kaynak veya çeviri dosyasında okunabilir altyazı bloğu bulunamadı.');
  }
  const audit = auditSubtitlePair(source.cues, target.cues, { targetLanguage: 'tr' });
  const report = {
    ...audit,
    source: { file: path.basename(sourcePath), format: source.format, sha256: sha256(sourceBuffer) },
    target: { file: path.basename(targetPath), format: target.format, sha256: sha256(targetBuffer) },
  };
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Kaynak/çeviri: ${report.sourceCues}/${report.targetCues} blok · eşleşen ${report.matchedCues}`);
    console.log(`Kesin sorun: ${report.blockingCount} · inceleme uyarısı: ${report.advisoryCount}`);
    for (const [name, entries] of Object.entries(report.issues)) {
      if (name === 'contextReview' || !entries.length) continue;
      console.log(`  ${name}: ${entries.length}`);
    }
    console.log(report.pass ? 'Sonuç: GEÇTİ' : 'Sonuç: KALDI');
  }
  process.exitCode = report.pass ? 0 : 2;
} catch (error) {
  console.error(`Altyazı çifti denetlenemedi: ${error.message}`);
  process.exitCode = 1;
}
