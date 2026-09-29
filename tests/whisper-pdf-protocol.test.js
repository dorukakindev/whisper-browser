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
    createHash: require('node:crypto').createHash,
    randomBytes: require('node:crypto').randomBytes,
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

// Kaynak kimliği içerik karmasından tek başına türetilirse dosyayı bilen bir
// sayfa kimliği hesaplayıp Origin'siz istekle belgeyi açabilir — oturum
// nonce'u kimliği tahmin edilemez kılar.
test('kaynak kimliği oturum nonce\'u ile tahmin edilemez (içerik bilinse bile)', () => {
  const { pdfHashPlan, pdfHashFromFirstChunk } = require('../src/pdf-translate');
  const { createHash, randomBytes } = require('node:crypto');
  const source = fs.readFileSync(path.join(__dirname, '../src/main.js'), 'utf8');
  const start = source.indexOf('const pdfDocuments = new Map();');
  const end = source.indexOf('function pdfDocumentByHash(');
  assert.ok(start > 0 && end > start, 'pdf kaynak dilimi bulunamadı');
  const slice = source.slice(start, end);
  const makeInspect = (nonceBytes) => {
    const context = {
      protocol: { handle: () => {} },
      pdfFileAccess: { has: () => true, inspect: (p) => p },
      fs, path, URL, Response, decodeURIComponent,
      Readable: require('node:stream').Readable,
      Buffer,
      createHash, randomBytes: nonceBytes ?? randomBytes,
      pdfHashPlan, pdfHashFromFirstChunk,
      pdfTranslationJobs: null,
    };
    vm.createContext(context);
    vm.runInContext(slice, context);
    return context.inspectPdfDocument;
  };
  const docPath = path.join(__dirname, 'whisper-pdf-protocol.test.js');
  const docA = makeInspect()(docPath);
  const docB = makeInspect()(docPath);
  assert.notEqual(docA.resourceId, docB.resourceId,
    'aynı belge iki oturumda aynı kaynak kimliğini almamalı');
  assert.match(docA.resourceId, /^[a-f0-9]{64}$/);
  assert.equal(docA.pdfHash, docB.pdfHash, 'pdfHash deterministik durum anahtarı olarak kalır');
  // Kontrollü nonce: türetim formülünü kilitle — içerik karması tek başına
  // kimliği üretmez (oturum başlangıcından tahmin edilebilir tuz geçemez).
  const knownNonce = Buffer.alloc(24, 0x42).toString('hex');
  const docC = makeInspect(() => Buffer.alloc(24, 0x42))(docPath);
  const expected = createHash('sha256').update(`pdf-resource:${knownNonce}:${docA.pdfHash}`).digest('hex');
  assert.equal(docC.resourceId, expected, 'kimlik oturum nonce\'u ile karıştırılmalı');
});

test('geçerli kaynak kimliği okunur (izinli belge)', async () => {
  const handled = {};
  const context = {
    protocol: { handle: (scheme, fn) => { handled[scheme] = fn; } },
    pdfFileAccess: { has: () => true, inspect: (p) => p },
    fs,
    Readable: require('node:stream').Readable,
    URL, Response, decodeURIComponent,
    createHash: require('node:crypto').createHash,
    randomBytes: require('node:crypto').randomBytes,
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
