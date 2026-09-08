'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { mutationEvidence, runChaosIteration, writeFailureArtifacts } = require('./helpers/browser-chaos-lab');

(async () => {
  const started = process.hrtime.bigint();
  const results = [];
  const failures = [];
  for (let iteration = 1; iteration <= 20; iteration++) {
    try { results.push(await runChaosIteration(iteration)); }
    catch (error) { failures.push({ iteration, message: error.message, artifacts: error.artifacts }); }
  }
  const mutation = await mutationEvidence();
  assert.deepEqual(mutation, {
    popupMutationCaught: true,
    retryMutationCaught: true,
    staleMutationCaught: true,
  });

  const artifactDir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-chaos-artifacts-'));
  writeFailureArtifacts(artifactDir, new Error('sentinel hata'), [{ seq: 1, name: 'sentinel' }], { secret: '[SENTINEL]' });
  for (const file of ['screenshot.svg', 'event-trace.json', 'chaos.log']) {
    assert(fs.existsSync(path.join(artifactDir, file)), `${file} üretilmedi`);
  }
  fs.rmSync(artifactDir, { recursive: true, force: true });

  if (failures.length) {
    failures.forEach((failure) => console.error(`  FAIL iterasyon ${failure.iteration}: ${failure.message} · ${failure.artifacts || 'artefakt yok'}`));
    process.exitCode = 1;
    return;
  }
  assert.equal(results.length, 20);
  assert(results.every((result) => result.flows >= 11), 'kritik akış sayısı 11 altına düştü');
  assert(results.every((result) => result.processSnapshot.electronModuleLoaded === false));
  const durations = results.map((result) => result.durationMs).sort((a, b) => a - b);
  const p95Ms = durations[Math.ceil(durations.length * 0.95) - 1];
  const attempts = results.reduce((total, result) => total + result.networkAttempts, 0);
  const elapsedMs = Number(process.hrtime.bigint() - started) / 1e6;
  console.log(`\n20 chaos tekrarı geçti · 0 flake · ${results[0].flows} sözleşme akışı/tekrar · ${attempts} ağ denemesi`);
  console.log(`Süre: p95 ${p95Ms.toFixed(1)} ms/tekrar · ${elapsedMs.toFixed(1)} ms toplam`);
  console.log('Electron modülü yüklenmedi; harness mevcut Node süreci, yerel HTTP sunucusu ve bellek içi BrowserWindow/webContents/session/GPU fake nesnelerini kullandı.');
})().catch((error) => {
  console.error(error.stack || error);
  process.exit(1);
});
