const assert = require('assert');
const fs = require('fs');
const path = require('path');
const {
  DEFAULT_RESOURCE_SOAK_BUDGETS,
  evaluateResourceSoak,
  linearSlope,
} = require('../src/resource-soak');

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
    peaks: { mainTimers: 4, mainProjectTimers: 2, mainInternalTimers: 2 },
    samples: [sample('start', 0), sample('final', 200)],
  };
  assert.equal(evaluateResourceSoak(report).pass, true);
});

test('dosya ve timer büyümesini ayrı kontrollerle reddeder', () => {
  const start = sample('start', 0);
  const final = sample('final', 200, {
    disk: { browserSubtitleFiles: DEFAULT_RESOURCE_SOAK_BUDGETS.browserSubtitleFileCountMax + 1 },
    timers: { main: { active: 3, projectActive: 1, internalActive: 2 }, renderer: { total: 1 } },
  });
  const verdict = evaluateResourceSoak({
    cycles: 200, capture: { attempts: 200, successes: 200 },
    peaks: { mainTimers: 40, mainProjectTimers: 40, mainInternalTimers: 2 }, samples: [start, final],
  });
  assert.equal(verdict.pass, false);
  assert.equal(verdict.checks.find((check) => check.name === 'browser-subtitle-file-count').pass, false);
  assert.equal(verdict.checks.find((check) => check.name === 'main-timer-peak-delta').pass, false);
});

test('soak yalnız geçici userData ile start.bat üzerinden çalışır', () => {
  const runner = fs.readFileSync(path.join(__dirname, 'run-resource-soak.js'), 'utf8');
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  assert.match(runner, /start\.bat/);
  assert.match(runner, /WHISPER_RESOURCE_SOAK_USER_DATA/);
  assert.match(main, /WHISPER_RESOURCE_SOAK/);
  assert.match(main, /app\.setPath\('userData'/);
});

test('CDP hazırlık timeoutları sonuçlanınca temizlenen ortak yardımcıyı kullanır', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const start = main.indexOf('async function attachBrowserDebugger()');
  const end = main.indexOf('\nfunction browserTrackProbeScript()', start);
  const body = main.slice(start, end);
  assert.doesNotMatch(body, /Promise\.race/);
  assert.doesNotMatch(body, /const withTimeout/);
  assert.match(body, /withTimeout\(wc\.debugger\.sendCommand\(/);
  assert.match(body, /1500, 'CDP frame hazırlığı zaman aşımına uğradı\.'/);
});

test('tarayıcı yerleri diskten bir kez okunur ve yazım önbelleği yeniler', () => {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const start = main.indexOf("const BROWSER_PLACES_FILE = 'browser-places.json'");
  const end = main.indexOf('\nfunction browserCookieUrl(', start);
  const source = main.slice(start, end);
  let reads = 0;
  let written = null;
  const fakeFs = {
    readFileSync() {
      reads += 1;
      return JSON.stringify({
        history: [{ url: 'https://example.test/watch?token=secret', title: 'Önce' }],
        bookmarks: [],
      });
    },
  };
  const api = new Function('fs', 'path', 'app', 'writeJsonAtomic',
    `${source}\nreturn { readBrowserPlaces, writeBrowserPlaces };`)(
    fakeFs, path, { getPath: () => 'C:\\temp' }, (_file, value) => { written = value; }
  );
  assert.equal(api.readBrowserPlaces().history[0].url, 'https://example.test/watch');
  assert.equal(api.readBrowserPlaces().history.length, 1);
  assert.equal(reads, 1);
  api.writeBrowserPlaces({ history: [{ url: 'https://example.test/new', title: 'Yeni' }], bookmarks: [] });
  assert.equal(api.readBrowserPlaces().history[0].title, 'Yeni');
  assert.equal(written.history[0].url, 'https://example.test/new');
  assert.equal(reads, 1);
});

if (!process.exitCode) console.log(`\n${passed} kaynak soak testi geçti.`);
