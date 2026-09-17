#!/usr/bin/env node
'use strict';

const fs = require('fs');
const path = require('path');
const { compareSubtitleTranslations, parseSubtitleFile,
  sha256 } = require('../src/subtitle-pair-quality');

const args = process.argv.slice(2);
const json = args.includes('--json');
const files = args.filter(arg => arg !== '--json');
if (files.length !== 3) {
  console.error('Kullanım: npm run compare:subtitle-translations -- <kaynak.srt> <eski-ceviri.srt> <yeni-ceviri.srt> [--json]');
  process.exit(1);
}

try {
  const [sourcePath, baselinePath, candidatePath] = files.map(file => path.resolve(file));
  const read = file => {
    const buffer = fs.readFileSync(file);
    const parsed = parseSubtitleFile(buffer, file);
    if (!parsed.cues.length) throw new Error(`${path.basename(file)} içinde okunabilir altyazı bloğu yok.`);
    return { ...parsed, buffer };
  };
  const source = read(sourcePath);
  const baseline = read(baselinePath);
  const candidate = read(candidatePath);
  const report = {
    ...compareSubtitleTranslations(source.cues, baseline.cues, candidate.cues,
      { targetLanguage: 'tr' }),
    files: {
      source: { file: path.basename(sourcePath), sha256: sha256(source.buffer) },
      baseline: { file: path.basename(baselinePath), sha256: sha256(baseline.buffer) },
      candidate: { file: path.basename(candidatePath), sha256: sha256(candidate.buffer) },
    },
  };
  if (json) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Eski: ${report.baseline.blockingCount} kesin sorun · ${report.baseline.advisoryCount} inceleme uyarısı`);
    console.log(`Yeni: ${report.candidate.blockingCount} kesin sorun · ${report.candidate.advisoryCount} inceleme uyarısı`);
    console.log(`Fark: kesin ${report.delta.blocking >= 0 ? '+' : ''}${report.delta.blocking} · uyarı ${report.delta.advisory >= 0 ? '+' : ''}${report.delta.advisory}`);
    console.log(`Sonuç: ${report.verdict}`);
    console.log('Not: Bu ölçüm insan anlam/akıcılık incelemesinin yerini almaz.');
  }
  process.exitCode = report.noStructuralRegression ? 0 : 2;
} catch (error) {
  console.error(`A/B altyazı karşılaştırması yapılamadı: ${error.message}`);
  process.exitCode = 1;
}
