'use strict';

const assert = require('assert');
const fs = require('fs');
const net = require('net');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const { isPublicMangaIpAddress } = require('../src/browser-manga');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert(from >= 0 && to > from, 'Bölüm bulunamadı: ' + start);
  return source.slice(from, to);
}

async function main() {
  const helperSource = section(
    'async function assertPublicBrowserSubtitleUrl',
    'async function fetchBrowserBuffer'
  );
  const dns = { lookup: async () => [{ address: '93.184.216.34', family: 4 }] };
  const sandbox = {
    URL, String,
    isIP: net.isIP,
    isPublicMangaIpAddress,
    dns,
    withTimeout: (promise) => promise,
    browserSubtitleStateError: (code, message) => Object.assign(new Error(message), { code }),
  };
  vm.runInNewContext(helperSource + '\nthis.checkUrl = assertPublicBrowserSubtitleUrl;', sandbox);

  await assert.rejects(sandbox.checkUrl('http://127.0.0.1/private.srt'),
    (error) => error.code === 'EBROWSER_UNSAFE_URL');
  dns.lookup = async () => [{ address: '192.168.1.20', family: 4 }];
  await assert.rejects(sandbox.checkUrl('https://captions.example/private.srt'),
    (error) => error.code === 'EBROWSER_UNSAFE_URL');
  dns.lookup = async () => [{ address: '93.184.216.34', family: 4 }];
  await sandbox.checkUrl('https://captions.example/public.srt');

  const probeSource = section('function probeCommand(cmd, cmdArgs)', '// Açılış ortam kontrolü:');
  let timeoutCallback;
  let terminated = 0;
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  const probeSandbox = {
    spawn: () => child,
    terminateProcessTree: () => { terminated += 1; },
    setTimeout: (callback, ms) => {
      assert.equal(ms, 30000);
      timeoutCallback = callback;
      return { unref() {} };
    },
    clearTimeout: () => {},
  };
  vm.runInNewContext(probeSource + '\nthis.probeCommand = probeCommand;', probeSandbox);
  const pending = probeSandbox.probeCommand('ffprobe', ['-version']);
  timeoutCallback();
  assert.equal(await pending, null);
  assert.equal(terminated, 1);

  const burnin = section("ipcMain.handle('burnin:start'", "ipcMain.handle('burnin:cancel'");
  assert.match(burnin, /burninJob \|\| burninStartPending/);
  assert.match(burnin, /burninStartPending = true;[\s\S]*await probeCommand/);
  const transcribe = section("ipcMain.handle('transcribe:start'", "ipcMain.handle('transcribe:cancel'");
  assert.match(transcribe, /burninJob \|\| burninStartPending/);
  assert.match(transcribe, /failedJob\.once\?\.\('error'/);
  assert.match(transcribe, /terminateProcessTree\(failedJob, \{ spawn \}\)/);

  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
  assert.match(renderer, /job\.generation !== player\.generation/);
  assert.match(renderer, /player\.chatHistory\.length > 128/);
  assert.match(renderer, /messages\.length - 200/);
  assert.match(renderer, /snapshot\.mediaKey === \(player\.mediaKey \|\| ''\)/);

  console.log('audit-report-regressions: 14 test');
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});