'use strict';

// R334 ölü-bölge kilidi — manga görsel indirme hattı (src/main.js):
// fetchMangaImageSource + fetchMangaImage + mangaRetryAfterMs —
// sıfır test referanslı. Sözleşmeler:
//   - data: URL inline yolu (ağ yok)
//   - isSafeMangaImageUrl kapısı: güvensiz kaynak → hata
//   - redirect zinciri ≤4, HER sıçrama yeniden güvenlik denetlenir (SSRF)
//   - HTTP hatası: error.httpStatus + mangaImageDownload işareti
//   - content-length > 14MB → reddedilir; mime whitelist dışı → sniff
//   - boş/aşırı büyük gövde → hata; nativeImage çözemezse sayfa-decode yedeği
//   - fetchMangaImage: kaynak dedupe, kaynak başına ≤2 deneme,
//     retryable değilse tek deneme, signal.aborted → anında fırlatır
//   - mangaRetryAfterMs: saniye/tarih/absent → 500..5000 kelepçe

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert(from >= 0 && to > from);
  return source.slice(from, to);
}

function fakeNativeImage(width = 100, height = 100) {
  return {
    isEmpty: () => width === 0,
    getSize: () => ({ width, height }),
    resize: (o) => fakeNativeImage(o.width, o.height),
    toJPEG: () => Buffer.from('j'.repeat(100)),
    crop: () => fakeNativeImage(10, 10),
    toBitmap: () => Buffer.alloc(400),
  };
}

function makeCtx(over = {}) {
  const calls = { pinned: [] };
  const ctx = vm.createContext(Object.assign({
    String, Number, Array, Set, Map, JSON, RegExp, Error, Promise, Buffer, URL,
    Math, Object, Date, console, process,
    AbortController, setTimeout, clearTimeout,
    MAX_MANGA_IMAGE_BYTES: 14 * 1024 * 1024,
    BROWSER_PARTITION: 'persist:b',
    session: { fromPartition: () => ({}) },
    dataUrlMangaImage: (u) => ctx.__dataUrl ? ctx.__dataUrl(u) : null,
    isSafeMangaImageUrl: (u) => ctx.__safe ? ctx.__safe(u) : /^https:/.test(u),
    requestPinnedMangaImage: async (sess, url, pageUrl, signal) => {
      calls.pinned.push(url);
      return ctx.__nextResponse();
    },
    detectMangaImageMime: (buf) => ctx.__sniff ? ctx.__sniff(buf) : 'image/png',
    decodeMangaImageViaPage: async () => ctx.__pageDecode ?? null,
    nativeImage: { createFromBuffer: () => ctx.__decoded ?? fakeNativeImage() },
    mangaRetryableDownloadError: (e) => !!e.mangaImageDownload,
    waitForMangaRetry: async () => { calls.retried = (calls.retried || 0) + 1; },
    __calls: calls,
  }, over));
  return { ctx, calls };
}

function evalFns(ctx) {
  vm.runInContext(
    section('async function fetchMangaImageSource(', 'async function requestMangaTranslationAtEndpoint('),
    ctx);
}

async function t_inline_data_url() {
  const { ctx, calls } = makeCtx();
  evalFns(ctx);
  ctx.__dataUrl = () => ({ buffer: Buffer.from('img'), mimeType: 'image/png' });
  const r = await vm.runInContext(
    "fetchMangaImageSource('data:image/png;base64,x', 'p', null)", ctx);
  assert.strictEqual(r.mimeType, 'image/png');
  assert.strictEqual(calls.pinned.length, 0, 'inline data URL ağa çıkmamalı');
}

async function t_unsafe_and_redirect_guards() {
  const { ctx, calls } = makeCtx();
  evalFns(ctx);
  // kaynak güvensiz
  await assert.rejects(
    vm.runInContext("fetchMangaImageSource('http://169.254.0.1/x.png','p',null)", ctx),
    /güvenli değil/);
  // 301 → güvensiz hedef: zincir iptal edilir
  let seq = [
    { status: 301, headers: { location: 'http://169.254.0.1/evil.png' } },
  ];
  ctx.__nextResponse = async () => seq.shift();
  await assert.rejects(
    vm.runInContext("fetchMangaImageSource('https://cdn.x/a.png','p',null)", ctx),
    /güvenli olmayan bir adrese yönlendirildi/);
  assert.strictEqual(calls.pinned.length, 1, 'güvensiz hedef indirilmedi');
  // 5 redirect → çok fazla yönlendirme
  seq = Array.from({ length: 5 }, () => ({ status: 302, headers: { location: 'https://cdn.x/next.png' } }));
  ctx.__nextResponse = async () => seq.shift() || { status: 200, headers: {}, buffer: Buffer.from('x') };
  await assert.rejects(
    vm.runInContext("fetchMangaImageSource('https://cdn.x/a.png','p',null)", ctx),
    /çok fazla kez yönlendirildi/);
}

async function t_http_and_size_errors() {
  const { ctx } = makeCtx();
  evalFns(ctx);
  // HTTP 403 → httpStatus + mangaImageDownload
  ctx.__nextResponse = async () => ({ status: 403, headers: {}, buffer: Buffer.alloc(0) });
  let err;
  try { await vm.runInContext("fetchMangaImageSource('https://cdn.x/a.png','p',null)", ctx); }
  catch (e) { err = e; }
  assert.strictEqual(err.httpStatus, 403);
  assert.strictEqual(err.mangaImageDownload, true);
  // content-length aşımı
  ctx.__nextResponse = async () => ({ status: 200, headers: { 'content-length': String(20 * 1024 * 1024) }, buffer: Buffer.from('x') });
  await assert.rejects(
    vm.runInContext("fetchMangaImageSource('https://cdn.x/a.png','p',null)", ctx),
    /14 MB sınırını aşıyor/);
  // mime whitelist dışı + sniff başarısız
  ctx.__nextResponse = async () => ({ status: 200, headers: { 'content-type': 'text/html' }, buffer: Buffer.from('<html>') });
  ctx.__sniff = () => null;
  await assert.rejects(
    vm.runInContext("fetchMangaImageSource('https://cdn.x/a.png','p',null)", ctx),
    /desteklenen bir görsel döndürmedi/);
  // boş gövde
  ctx.__nextResponse = async () => ({ status: 200, headers: { 'content-type': 'image/png' }, buffer: Buffer.alloc(0) });
  await assert.rejects(
    vm.runInContext("fetchMangaImageSource('https://cdn.x/a.png','p',null)", ctx),
    /boş veya 14 MB sınırından büyük/);
}

async function t_decode_fallback_and_resize() {
  const { ctx } = makeCtx();
  evalFns(ctx);
  const png = Buffer.from('real-png');
  ctx.__nextResponse = async () => ({ status: 200, headers: { 'content-type': 'image/png' }, buffer: Buffer.from('raw') });
  ctx.__decoded = fakeNativeImage(0); // ilk decode boş → sayfa yedeği
  ctx.__pageDecode = png;
  // ikinci createFromBuffer: PNG başarılı
  let n = 0;
  ctx.nativeImage.createFromBuffer = () => (++n === 1 ? fakeNativeImage(0) : fakeNativeImage(20, 20));
  const r = await vm.runInContext("fetchMangaImageSource('https://cdn.x/a.png','p',null,{id:1})", ctx);
  assert.strictEqual(r.buffer, png, 'sayfa-decode yedeği kullanılmadı');
  assert.strictEqual(r.mimeType, 'image/png');
  // hiçbiri çözemezse
  ctx.nativeImage.createFromBuffer = () => fakeNativeImage(0);
  ctx.__pageDecode = null;
  await assert.rejects(
    vm.runInContext("fetchMangaImageSource('https://cdn.x/a.png','p',null,{id:1})", ctx),
    /Görsel çözülemedi/);
  // büyük piksel → resize + JPEG dönüşü
  ctx.nativeImage.createFromBuffer = () => fakeNativeImage(10000, 2000); // 20M px
  const r2 = await vm.runInContext("fetchMangaImageSource('https://cdn.x/a.png','p',null)", ctx);
  assert.strictEqual(r2.mimeType, 'image/jpeg', 'büyük görsel JPEG\'e döndürülmedi');
}

async function t_fetch_retry_matrix() {
  const { ctx, calls } = makeCtx();
  evalFns(ctx);
  // retryable hata → 2 deneme; retryable değil → 1
  ctx.__nextResponse = async () => ({ status: 403, headers: {}, buffer: Buffer.alloc(0) });
  await assert.rejects(
    vm.runInContext("fetchMangaImage({urls:['https://cdn.x/a.png']},'p',null)", ctx));
  assert.strictEqual(calls.pinned.length, 2, 'retryable hata iki kez denenmedi');
  calls.pinned = [];
  ctx.__nextResponse = async () => { throw new Error('kalıcı'); };
  ctx.mangaRetryableDownloadError = () => false;
  await assert.rejects(
    vm.runInContext("fetchMangaImage({urls:['https://cdn.x/a.png']},'p',null)", ctx), /kalıcı/);
  assert.strictEqual(calls.pinned.length, 1, 'retryable değilken tekrar denendi');
  // dedupe: aynı URL urls+url içinde tek
  calls.pinned = [];
  ctx.__nextResponse = async () => ({ status: 200, headers: { 'content-type': 'image/png' }, buffer: Buffer.from('x') });
  await vm.runInContext("fetchMangaImage({urls:['https://cdn.x/a.png'],url:'https://cdn.x/a.png'},'p',null)", ctx);
  assert.strictEqual(calls.pinned.length, 1, 'dedupe yapılmadı');
  // sources boş → genel hata
  ctx.__nextResponse = async () => { throw new Error('x'); };
  await assert.rejects(
    vm.runInContext("fetchMangaImage({},'p',null)", ctx), /indirilebilir adresi bulunamadı/);
}

function t_retry_after_ms() {
  const { ctx } = makeCtx();
  evalFns(ctx);
  const hdr = (v) => ({ headers: { get: () => v } });
  const m = (r) => { ctx.__resp = r; return vm.runInContext('mangaRetryAfterMs(__resp)', ctx); };
  assert.strictEqual(m(hdr('2')), 2000);
  assert.strictEqual(m(hdr('0.1')), 500, 'alt sınır 500');
  assert.strictEqual(m(hdr('60')), 5000, 'üst sınır 5000');
  assert.strictEqual(m(hdr('')), 1200, 'yok → 1200');
  assert.strictEqual(m(hdr('garbage')), 1200, 'parse edilemez → 1200');
  const future = new Date(Date.now() + 3000).toUTCString();
  const got = m(hdr(future));
  assert.ok(got >= 500 && got <= 5000, `tarih → kelepçe: ${got}`);
}

async function main() {
  await t_inline_data_url();
  await t_unsafe_and_redirect_guards();
  await t_http_and_size_errors();
  await t_decode_fallback_and_resize();
  await t_fetch_retry_matrix();
  t_retry_after_ms();
  console.log('manga-fetch-deadzone: 6 senaryo geçti');
}

main().catch((e) => { console.error(e); process.exit(1); });
