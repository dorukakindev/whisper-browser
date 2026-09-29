'use strict';

// R246: whisper-pdf:// koruma kapısı file:// renderer'ın kendi fetch'ini de
// reddediyordu — GET fetch'lerde Origin başlığı gönderilmediğinde
// `origin !== 'null'` (null) true kalıyor ve özel şemada referrer da boş
// geldiği için istek 403'e düşüyordu; Windows'ta PDF okuyucu
// "PDF verisi alınamadı (HTTP 403)" ile açılmıyordu.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

function makeContext() {
  const handled = {};
  const context = {
    protocol: { handle: (scheme, fn) => { handled[scheme] = fn; } },
    pdfFileAccess: { has: () => true, inspect: (p) => p },
    fs,
    Readable: require('node:stream').Readable,
    URL,
    Response,
    decodeURIComponent,
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const start = source.indexOf('const pdfDocuments = new Map();');
  const end = source.indexOf('function pdfTranslationDirectory(');
  assert.ok(start > 0 && end > start, 'pdf protokol kaynağı bulunamadı');
  vm.runInContext(source.slice(start, end), context);
  context.installPdfDocumentProtocol();
  return handled['whisper-pdf'];
}

function makeRequest({ origin, referrer = '', method = 'GET', path: p = 'document/' + 'a'.repeat(64) }) {
  const headers = new Map();
  if (origin !== undefined) headers.set('origin', origin);
  headers.set('referer', referrer);
  return { url: `whisper-pdf://${p}`, method, headers, referrer };
}

const HEX = 'a'.repeat(64);

test('file:// renderer fetch\'i korumaya takılmadan kaynağa ulaşır (404 bekler, 403 değil)', async () => {
  const handle = makeContext();
  // GET fetch'leri Origin başlığı göndermez; özel şemada referrer da boş gelir.
  const res = await handle(makeRequest({}));
  assert.notEqual(res.status, 403, 'kendi renderer isteği koruma kapısına takılmamalı');
  assert.equal(res.status, 404);
});

test('Origin: null opak köken de kabul edilir', async () => {
  const handle = makeContext();
  const res = await handle(makeRequest({ origin: 'null' }));
  assert.equal(res.status, 404);
});

test('file:// referrer yalnız başına yeterlidir', async () => {
  const handle = makeContext();
  const res = await handle(makeRequest({ referrer: 'file:///D:/Whisper%20Local/index.html' }));
  assert.equal(res.status, 404);
});

test('dış http kökeni reddedilir', async () => {
  const handle = makeContext();
  const res = await handle(makeRequest({ origin: 'https://evil.example' }));
  assert.equal(res.status, 403);
});

test('http referrer reddedilir', async () => {
  const handle = makeContext();
  const res = await handle(makeRequest({ referrer: 'https://evil.example/page' }));
  assert.equal(res.status, 403);
});

test('yöntem/host kısıtları korunur (POST → 405, yanlış host → 405)', async () => {
  const handle = makeContext();
  const post = await handle(makeRequest({ method: 'POST' }));
  assert.equal(post.status, 405);
  const wrongHost = await handle(makeRequest({ path: `thumb/${HEX}` }));
  assert.equal(wrongHost.status, 405);
});

test('geçerli kaynak kimliği okunur (izinli belge)', async () => {
  const handled = {};
  const context = {
    protocol: { handle: (scheme, fn) => { handled[scheme] = fn; } },
    pdfFileAccess: { has: () => true, inspect: (p) => p },
    fs,
    Readable: require('node:stream').Readable,
    URL, Response, decodeURIComponent,
  };
  vm.createContext(context);
  const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const start = source.indexOf('const pdfDocuments = new Map();');
  const end = source.indexOf('function pdfTranslationDirectory(');
  vm.runInContext(source.slice(start, end), context);
  context.installPdfDocumentProtocol();
  const docPath = path.join(__dirname, 'whisper-pdf-protocol.test.js');
  // Top-seviye const bildirimleri context özelliği olmaz; harita kaydını
  // aynı context içinde çalışan script ile ek.
  vm.runInContext(`pdfDocumentsByResourceId.set('${HEX}', { filePath: ${JSON.stringify(docPath)} })`, context);
  const res = await handled['whisper-pdf'](makeRequest({}));
  assert.equal(res.status, 200);
  assert.equal(res.headers.get('Content-Type'), 'application/pdf');
});
