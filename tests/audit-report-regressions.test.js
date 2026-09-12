'use strict';

const assert = require('assert');
const fs = require('fs');
const net = require('net');
const path = require('path');
const vm = require('vm');
const { EventEmitter } = require('events');
const { isPublicMangaIpAddress } = require('../src/browser-manga');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
const rendererSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
assert(/completedCount, failedCount, state/.test(source),
  'PDF kısmi sonucu sayfa bazlı başarı ve hata sayılarını taşımıyor');
assert(/result\.completedCount[\s\S]{0,500}result\.failedCount/.test(rendererSource),
  'PDF toplu çeviri kısmi sayfa sayılarını kullanıcı durumuna yansıtmıyor');

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

  const translation = section('async function requestBrowserSentenceTranslationAtEndpoint',
    '\nasync function requestBrowserSentenceTranslation(');
  assert.match(translation, /const timeoutMs = pageMode \? 60000 : grouped \? 45000 : 20000/);
  assert.match(translation, /<think\\b\[\^>\]\*>\[\\s\\S\]\*\?<\\\/think>/);

  const pdfExport = section("ipcMain.handle('pdf:export'", "ipcMain.handle('dialog:openVideo'");
  assert.match(pdfExport, /document\.title \|\| 'PDF'/);
  assert.match(pdfExport, /\\x00-\\x1F/);

  const renderer = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf8');
  assert.match(renderer, /job\.generation !== player\.generation/);
  assert.match(renderer, /player\.chatHistory\.length > 128/);
  assert.match(renderer, /messages\.length - 200/);
  assert.match(renderer, /snapshot\.mediaKey === \(player\.mediaKey \|\| ''\)/);

  const mediaPathGuard = section('function validateLocalMediaPath', 'async function scanMediaFromPaths');
  assert.match(mediaPathGuard, /mediaFileAccess\.inspect\(filePath\)/);
  assert.match(mediaPathGuard, /mediaFileAccess\.authorize\(filePath\)/);
  for (const channel of ['media:probeTracks', 'media:extractSubtitleTrack', 'media:waveform']) {
    assert.match(section(`ipcMain.handle('${channel}'`, '\n});'), /authorizeLocalMediaPath/);
  }

  const preview = rendererSource.slice(rendererSource.indexOf('function renderBrowserPagePreview'),
    rendererSource.indexOf('async function previewBrowserPage'));
  for (const field of ['totalBlocks', 'apiBlocks', 'memoryBlocks', 'excludedBlocks', 'pendingBlocks']) {
    assert.match(preview, new RegExp(`Number\\(result\\.${field}\\)`));
  }
  assert.match(section('function redactJobLogArgs', 'function startJobLog'),
    /--initial-prompt[\s\S]*--glossary[\s\S]*<gizlendi>/);
  assert.match(section("ipcMain.handle('settings:import'", "ipcMain.handle('media:probeTracks'"),
    /changedPaths[\s\S]*showMessageBox[\s\S]*canceled: true/);
  assert.match(section("ipcMain.handle('clipboard:write'", '// Bir komutu çalıştırıp'),
    /Buffer\.byteLength\(text, 'utf8'\) > 4 \* 1024 \* 1024/);
  assert.match(section('function acceptDynamicBrowserPageBlocks', 'const pdfDocuments'),
    /payload\.bridgeToken !== tab\.bridgeToken/);

  assert.match(source, /app\.isPackaged[\s\S]*removeSwitch\?\.\(switchName\)/);

  assert.match(rendererSource, /textContent\.replace\(\/\[ \\t\\f\\v\]\+\/g[\s\S]{0,100}replace\(\/\\r\?\\n\[ \\t\]\*\/g/);
  assert.match(rendererSource, /contains\('segment-text'\) && e\.key === 'Enter' && !e\.isComposing/);

  assert.match(section('function boundedIpcRows', "ipcMain.handle('browser:manga:start'"),
    /maxBytes = 4 \* 1024 \* 1024[\s\S]*boundedBrowserOverlayCues/);
  assert.match(section("ipcMain.handle('browser:translation:snapshot'",
    "ipcMain.handle('browser:translation:stop'"),
    /boundedIpcRows\(tab\.translationSourceCues\)[\s\S]*boundedIpcRows/);

  const progressivePreview = rendererSource.slice(rendererSource.indexOf('function flushPendingPreviewSegments'),
    rendererSource.indexOf('// Nihai segment listesini'));
  assert.match(progressivePreview, /createDocumentFragment\(\)[\s\S]*appendChild\(fragment\)/);
  assert.match(progressivePreview, /setTimeout\(flushPendingPreviewSegments, 16\)/);
  const pdfProtocol = section('function pdfProtocolHeaders', 'function pdfTranslationDirectory');
  assert.match(pdfProtocol, /'Access-Control-Allow-Origin': 'null'/);
  assert.match(pdfProtocol, /origin !== 'null'[\s\S]*referrer\.startsWith\('file:\/\/'\)[\s\S]*status: 403/);

  const selectionStart = rendererSource.indexOf('let inputSelectionGeneration');
  const selectionGuard = rendererSource.slice(selectionStart, rendererSource.indexOf('const dropZone', selectionStart));
  assert.match(selectionGuard, /const generation = \+\+inputSelectionGeneration[\s\S]*generation === inputSelectionGeneration/);
  assert.match(rendererSource, /async function handleDropPayload[\s\S]{0,300}inputSelectionGeneration \+= 1/);

  const controlLock = rendererSource.slice(rendererSource.indexOf('function syncProcessingControlState'),
    rendererSource.indexOf('function setProgress'));
  assert.match(controlLock, /PERSIST_VALUE_CONTROLS[\s\S]*PERSIST_CHECKBOX_CONTROLS[\s\S]*processing-locked/);
  assert.match(controlLock, /function setStatus[\s\S]*syncProcessingControlState\(\)/);

  const preloadSource = fs.readFileSync(path.join(__dirname, '..', 'src', 'preload.js'), 'utf8');
  assert.match(preloadSource, /scanDroppedFiles[\s\S]*webUtils\.getPathForFile[\s\S]*paths:scanMedia/);
  assert.doesNotMatch(preloadSource, /scanMediaPaths\s*:/);

  const transcribeStart = section("ipcMain.handle('transcribe:start'", "ipcMain.handle('transcribe:cancel'");
  assert.match(transcribeStart, /decideUrlPolicy\(options\.youtube, 'renderer-external'\)/);
  assert.match(transcribeStart, /authorizeLocalMediaPath\(options\.input\)/);

  const backendSource = fs.readFileSync(path.join(__dirname, '..', 'backend', 'transcribe.py'), 'utf8');
  assert.match(backendSource, /hallucination_skipped \+= 1[\s\S]*hallucination_skip_warning\(hallucination_skipped\)/);
  assert.match(backendSource, /warn_list\.append\(hallucination_warning\)/);

  assert.match(backendSource, /def should_skip_hallucination[\s\S]*avg_logprob >= -0\.65[\s\S]*no_speech_prob <= 0\.35/);
  assert.match(backendSource, /should_skip_hallucination\([\s\S]*segment_metric\["avg_logprob"\]/);

  const resultModal = rendererSource.slice(rendererSource.indexOf('function showResultModal'),
    rendererSource.indexOf('// ===== Kuyruk buton event'));
  assert.match(resultModal, /state\.resultModalFiles = Array\.isArray\(event\.files\)/);
  assert.match(rendererSource, /burnInStart\(state\.resultModalVideo, sub\)/);
  assert.match(rendererSource, /function openPlayer\(jobSnapshot = null\)[\s\S]*const jobVideo = jobSnapshot\?\.video[\s\S]*const jobFiles = jobSnapshot\?\.files/);

  console.log('audit-report-regressions: 41 test');
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
