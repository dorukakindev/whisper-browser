'use strict';

// Electron smoke'un rapor toplamasını kabul kanıtı sanmaması için saf kapılar.
// Negatif örnekler ayrı testte çalışır; gerçek UI koşusu da aynı kapıları kullanır.
const assert = require('node:assert/strict');

function assertCeaPlan(plan) {
  assert(plan && plan.available === true, 'CEA planı bulunmalı ve kullanılabilir olmalı');
  assert(plan.tracks?.some((track) => track.instreamId === 'CC1'), 'CC1 plan izinde olmalı');
  assert(Number(plan.total) > 0, 'CEA planında video segmenti olmalı');
}

function assertCeaComplete(start, capture) {
  assert.equal(start?.ok, true, 'tam yakalama başlatılmalı');
  assert.equal(capture?.state, 'complete', 'CEA yakalama complete olmalı');
  assert.equal(capture?.planComplete, true, 'segment planı eksiksiz olmalı');
  assert.equal(Number(capture?.missing), 0, 'eksik segment kalmamalı');
  assert(Number(capture?.total) > 0, 'segment toplamı pozitif olmalı');
  assert.equal(Number(capture?.completed), Number(capture?.total), 'tüm segmentler işlenmeli');
  assert(Number(capture?.cueCount) > 0, 'CEA cue çıkmalı');
  assert(Number(capture?.durationPercent) >= 99, 'CEA planı video süresini kapsamalı');
}

function assertOverlayModes(source, both) {
  assert(source?.source?.visible && source.source.text.includes('First fixture cue'),
    'kaynak görünümünde fixture cue görünmeli');
  assert(!source.translation?.visible, 'yalnız kaynak görünümünde çeviri görünmemeli');
  assert(both?.source?.visible && both.source.text.includes('First fixture cue'),
    'çift dil görünümünde kaynak görünmeli');
  assert(both.translation?.visible && both.translation.text.includes('TR:'),
    'çift dil görünümünde çeviri görünmeli');
}

function assertSeekCue(text, partIndex) {
  assert(text?.includes(`·p${partIndex}`), `seek sonrası beklenen çeviri parçası p${partIndex} görünmeli`);
  assert(!text.includes(`·p${1 - partIndex}`), 'seek sonrası eski cue görünmemeli');
}

function assertLocaleLabels(english, turkish) {
  assert.equal(String(english).trim(), 'Fetch full subtitles', 'EN düğme etiketi yanlış');
  assert.equal(String(turkish).trim(), 'Tüm altyazıyı getir', 'TR düğme etiketi yanlış');
}

function assertReloadTracks(tracks) {
  assert(Array.isArray(tracks), 'yenileme sonrası iz listesi olmalı');
  assert(tracks.some((track) => track.role !== 'translation' && Number(track.cueCount) >= 3),
    'yenileme sonrası kaynak cue izleri geri gelmeli');
}

module.exports = {
  assertCeaPlan, assertCeaComplete, assertOverlayModes, assertSeekCue,
  assertLocaleLabels, assertReloadTracks,
};
