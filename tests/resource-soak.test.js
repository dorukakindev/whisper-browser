'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { DEFAULT_RESOURCE_SOAK_BUDGETS, evaluateResourceSoak, linearSlope } = require('../src/resource-soak');

let passed = 0;
function test(name, fn) {
  try { fn(); passed++; console.log(`  OK  ${name}`); }
  catch (error) { console.error(`  FAIL ${name}\n${error.stack}`); process.exitCode = 1; }
}
function sample(label, cycle, overrides = {}) {
  return {
    label, cycle,
    main: { rssBytes: 100, heapUsedBytes: 100 },
    renderer: { heapUsedBytes: 100 },
    browser: { heapUsedBytes: 100 },
    processes: { totalWorkingSetBytes: 100 },
    gpu: { workingSetBytes: 100, processCount: 1 },
    listeners: { total: 10 },
    timers: { main: { active: 3, projectActive: 1, internalActive: 2 }, renderer: { total: 1 } },
    performance: { overlay: { renderAverageMs: 1, renderMaxMs: 3, boundaryCallbacks: 2 } },
    disk: { browserSubtitleFiles: 2 },
    io: { writeOps: cycle, byFile: {} },
    ...overrides,
  };
}
test('doğrusal eğim döngü başına büyümeyi hesaplar', () => {
  assert.equal(linearSlope([
    { cycle: 0, renderer: { heapUsedBytes: 10 } },
    { cycle: 10, renderer: { heapUsedBytes: 30 } },
    { cycle: 20, renderer: { heapUsedBytes: 50 } },
  ], 'renderer.heapUsedBytes'), 2);
});
test('bütçe değerlendiricisi kararlı ölçümü geçirir', () => {
  const report = {
    cycles: 200, capture: { attempts: 200, successes: 200 },
    hibernation: { attempts: 50, successes: 50 },
    peaks: { mainTimers: 4, mainProjectTimers: 2, mainInternalTimers: 2 },
    samples: [sample('start', 0), sample('final', 200)],
  };
  assert.equal(evaluateResourceSoak(report).pass, true);
});
test('hibernasyon çevrimindeki tek kayıp bile bütçeyi düşürür', () => {
  const verdict = evaluateResourceSoak({
    cycles: 200, capture: { attempts: 200, successes: 200 },
    hibernation: { attempts: 50, successes: 49 },
    peaks: { mainTimers: 4, mainProjectTimers: 2, mainInternalTimers: 2 },
    samples: [sample('start', 0), sample('final', 200)],
  });
  assert.equal(verdict.pass, false);
  assert.equal(verdict.checks.find((check) => check.name === 'hibernation-success-rate').pass, false);
});
test('dosya ve timer büyümesini ayrı kontrollerle reddeder', () => {
  const final = sample('final', 200, {
    disk: { browserSubtitleFiles: DEFAULT_RESOURCE_SOAK_BUDGETS.browserSubtitleFileCountMax + 1 },
  });
  const verdict = evaluateResourceSoak({
    cycles: 200, capture: { attempts: 200, successes: 200 },
    peaks: { mainTimers: 40, mainProjectTimers: 40, mainInternalTimers: 2 },
    samples: [sample('start', 0), final],
  });
  assert.equal(verdict.pass, false);
  assert.equal(verdict.checks.find(check => check.name === 'browser-subtitle-file-count').pass, false);
  assert.equal(verdict.checks.find(check => check.name === 'main-timer-peak-delta').pass, false);
});
test('katman render süresi ve sınır callback sayısı ölçülür', () => {
  const verdict = evaluateResourceSoak({
    cycles: 200, capture: { attempts: 200, successes: 200 },
    peaks: { mainTimers: 4, mainProjectTimers: 2, mainInternalTimers: 2 },
    samples: [sample('start', 0), sample('final', 200, {
      performance: { overlay: {
        renderAverageMs: DEFAULT_RESOURCE_SOAK_BUDGETS.overlayRenderAverageMsMax + 1,
        renderMaxMs: 4, boundaryCallbacks: 17,
      } },
    })],
  });
  assert.equal(verdict.pass, false);
  assert.equal(verdict.values.overlayBoundaryCallbacksMaxObserved, 17);
  assert.equal(verdict.checks.find(check => check.name === 'overlay-render-average-ms').pass, false);
});
test('kütüphane yedek okumasını döngü başına sınırlar', () => {
  const start = sample('start', 0, {
    io: { writeOps: 0, byFile: { 'C:\\temp\\watch-library.json': { readOps: 1 } } },
  });
  const final = sample('final', 200, {
    io: { writeOps: 200, byFile: { 'C:\\temp\\watch-library.json': { readOps: 201 } } },
  });
  const verdict = evaluateResourceSoak({
    cycles: 200, capture: { attempts: 200, successes: 200 },
    peaks: { mainProjectTimers: 1, mainInternalTimers: 2 },
    samples: [start, final],
  });
  assert.equal(verdict.values.watchLibraryReadOpsPerCycle, 1);
  assert.equal(verdict.checks.find(check => check.name === 'watch-library-read-ops-per-cycle').pass, true);
});
test('soak yalnız geçici userData ve yerel fixture ile start.bat üzerinden çalışır', () => {
  const runner = fs.readFileSync(path.join(__dirname, 'run-resource-soak.js'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.match(runner, /start\.bat/);
  assert.match(runner, /WHISPER_RESOURCE_SOAK_USER_DATA/);
  assert.match(runner, /http:\/\/127\.0\.0\.1/);
  assert.match(main, /WHISPER_RESOURCE_SOAK/);
  assert.match(main, /app\.setPath\('userData'/);
  assert.match(main, /fixture yalnız 127\.0\.0\.1/);
});
test('kısa smoke koşusu bütçe kanıtı sayılmaz', () => {
  const runner = fs.readFileSync(path.join(__dirname, 'run-resource-soak.js'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.match(runner, /const smoke = process\.argv\.includes\('--smoke'\)/);
  assert.match(runner, /report\.meaningful = !smoke && cycles >= 200/);
  assert.match(runner, /Number\(report\.hibernation\?\.attempts\) >= 50/);
  assert.match(main, /resourceSoakHibernationSession\(hibernationCycles, fixtureRoot\)/);
  assert.match(main, /resourceSoakHibernationSession\(1, fixtureRoot\)/);
  assert.match(main, /primedBeforeBaseline: hibernationPrimed/);
  assert.match(runner, /report\.meaningful !== false/);
});
test('normal tarayıcı yoklama aralıkları değişmeden kalır', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.match(main, /\? \{ track: 75, capture: 35, media: 45 \}/);
  assert.match(main, /: \{ track: 6500, capture: 900, media: 1000 \}/);
});
test('renderer dinleyici ölçümü DOMdan çıkarılmış sekme düğümlerini sızıntı saymaz', () => {
  const probe = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'resource-soak-probe.js'), 'utf8');
  assert.match(probe, /target instanceof Node && !target\.isConnected/);
  assert.match(probe, /activeListenerSnapshot\(\)/);
  assert.match(probe, /listenerBreakdown/);
  assert.doesNotMatch(probe, /listeners: listenerCount/);
});
if (!process.exitCode) console.log(`\n${passed} kaynak soak testi geçti.`);
