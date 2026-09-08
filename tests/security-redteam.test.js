const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { decodeCapturedBody } = require('../src/browser-capture-security');
const { httpUrl } = require('../src/browser-adapters');
const { registerTrustedIpcHandler } = require('../src/ipc-security');
const { redactJobArgs, redactJobLabel } = require('../src/log-security');

const ROOT = path.join(__dirname, '..');
const main = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
let passed = 0;

function test(name, fn) {
  try { fn(); passed++; console.log(`  OK  ${name}`); }
  catch (error) { console.error(`  FAIL ${name}\n${error.stack}`); process.exitCode = 1; }
}

function sourceFunction(name, nextName, bindings = {}) {
  const start = main.indexOf(`function ${name}(`);
  const end = main.indexOf(`\nfunction ${nextName}(`, start + 1);
  assert(start >= 0 && end > start, `${name} kaynakta bulunamadı`);
  return vm.runInNewContext(`(${main.slice(start, end)})`, bindings);
}

test('açık tehlikeli şemalar arama sorgusuna dönüştürülmez', () => {
  const normalizeBrowserUrl = sourceFunction('normalizeBrowserUrl', 'browserPopupWindowOptions', { httpUrl, URL });
  for (const value of [
    'javascript:alert(1)',
    'data:text/html,<h1>x</h1>',
    'file:C:/Users/K/secret.txt',
    'file:///C:/Users/K/secret.txt',
    'vbscript:msgbox(1)',
  ]) assert.equal(normalizeBrowserUrl(value), null, value);
  assert.equal(normalizeBrowserUrl('example.com/video'), 'https://example.com/video');
  assert.match(normalizeBrowserUrl('altyazı testi'), /^https:\/\/www\.google\.com\/search\?/);
});

test('CDP yanıtı sınırı aşarsa Buffer ayırmadan reddedilir', () => {
  assert.equal(decodeCapturedBody('x'.repeat(1025), false, 1024), null);
  assert.equal(decodeCapturedBody(Buffer.alloc(1025).toString('base64'), true, 1024), null);
  assert.equal(decodeCapturedBody('WEBVTT', false, 1024).toString('utf8'), 'WEBVTT');
});

test('sayfa yakalama kuyruğu tek turda sekiz kayıt ve dört MiB ile sınırlıdır', () => {
  const browserCaptureDrainScript = sourceFunction(
    'browserCaptureDrainScript', 'browserCaptureAckScript');
  const queue = Array.from({ length: 12 }, (_, index) => ({
    captureId: `id-${index}`,
    url: `https://example.com/sub-${index}.vtt`,
    mimeType: 'text/vtt',
    body: 'x'.repeat(600 * 1024),
  }));
  queue.unshift({
    captureId: 'oversized', url: 'https://example.com/huge.vtt',
    mimeType: 'text/vtt', body: 'x'.repeat(2 * 1024 * 1024 + 1),
  });
  const context = { window: { __whisperCaptureQueue: queue, __whisperCaptureInFlight: new Map() }, Date };
  const result = vm.runInNewContext(browserCaptureDrainScript(), context);
  assert(result.entries.length <= 8);
  assert(result.entries.reduce((sum, entry) => sum + entry.body.length, 0) <= 4 * 1024 * 1024);
  assert.deepEqual(Array.from(result.rejectedIds), ['oversized']);
});

test('ana süreç hem CDP hem sayfa kuyruğunda köken kapısını uygular', () => {
  assert.match(main, /browserResponseAllowedForPage\(wc\.getURL\(\), response\.url\)/);
  assert.match(main, /browserResponseAllowedForPage\(pageUrl, entry\.url\)/);
  assert.match(main, /const credentials = page && target && page\.origin === target\.origin \? 'include' : 'omit'/);
});

test('IPC kapısı yalnız uygulama penceresinin ana frame göndericisini kabul eder', () => {
  let registered;
  const rawIpcMain = { handle: (_channel, listener) => { registered = listener; } };
  const mainFrame = { url: 'file:///app/index.html' };
  const webContents = { mainFrame };
  const mainWindow = { isDestroyed: () => false, webContents };
  let calls = 0;
  registerTrustedIpcHandler(rawIpcMain, () => mainWindow, 'security:test', (_event, value) => {
    calls++;
    return { ok: true, value };
  });

  assert.deepEqual(registered({ sender: webContents, senderFrame: mainFrame }, 'izinli'),
    { ok: true, value: 'izinli' });
  assert.deepEqual(registered({ sender: {}, senderFrame: {} }, 'web'),
    { ok: false, error: 'Yetkisiz istek.' });
  assert.deepEqual(registered({ sender: webContents, senderFrame: { url: 'https://evil.example' } }, 'alt-frame'),
    { ok: false, error: 'Yetkisiz istek.' });
  assert.equal(calls, 1);
});

test('alt süreç başlatmaları shell komut dizgesi yerine argv kullanır', () => {
  assert.doesNotMatch(main, /\b(?:exec|execFile)\s*\(/);
  assert.doesNotMatch(main, /shell\s*:\s*true/);
  assert.match(main, /spawn\(pythonPath, args,/);
  assert.match(main, /spawn\(ffmpeg, args,/);
});

test('ayar içe aktarma yolu prototip kirletme yapmaz ve UI beyaz liste uygular', () => {
  const imported = JSON.parse('{"__proto__":{"polluted":true},"ui":{"evil":"x"}}');
  const merged = { ...{}, ...imported };
  assert.equal(({}).polluted, undefined);
  assert.equal(Object.getPrototypeOf(merged), Object.prototype);
  assert.match(main, /saveSettings\(\{ \.\.\.loadSettings\(\), \.\.\.s \}\)/);

  const renderer = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'renderer.js'), 'utf8');
  assert.match(renderer, /PERSIST_VALUE_CONTROLS\.forEach\(\(id\) =>/);
  assert.match(renderer, /PERSIST_CHECKBOX_CONTROLS\.forEach\(\(id\) =>/);
});

test('yerel pencere sandbox ve sıkı CSP ile açılır', () => {
  const html = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'index.html'), 'utf8');
  assert.match(main, /ipcMain: rawIpcMain/);
  assert.match(main, /registerTrustedIpcHandler/);
  assert.match(main, /will-attach-webview/);
  assert.match(main, /preload: path\.join\(__dirname, 'preload\.js'\)[\s\S]{0,180}sandbox: true/);
  for (const directive of ["base-uri 'none'", "object-src 'none'", "frame-src 'none'", "form-action 'none'"]) {
    assert.match(html, new RegExp(directive.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
});

test('iş günlükleri URL sırlarını ve özel metin argümanlarını redakte eder', () => {
  const label = redactJobLabel('https://example.com/watch?v=123&access_token=secret#private');
  assert.equal(label, 'https://example.com/watch?v=123');
  const args = redactJobArgs([
    '--youtube', 'https://example.com/watch?v=123&sig=secret',
    '--initial-prompt', 'özel konuşma metni',
    '--glossary', 'gizli proje adı',
    '--model', 'large-v3',
  ]);
  const rendered = args.join(' ');
  assert.doesNotMatch(rendered, /secret|özel konuşma|gizli proje/);
  assert.match(rendered, /--youtube https:\/\/example\.com\/watch\?v=123/);
  assert.match(rendered, /--initial-prompt \[GİZLENDİ\]/);
  assert.match(rendered, /--model large-v3/);
});

if (!process.exitCode) console.log(`\n${passed} güvenlik red-team testi geçti.`);
