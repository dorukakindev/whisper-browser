const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

let passed = 0;
async function test(name, fn) {
  try {
    await fn();
    passed++;
    console.log(`  OK  ${name}`);
  } catch (error) {
    console.error(`  FAIL ${name}\n${error.stack}`);
    process.exitCode = 1;
  }
}

function captureHlsFactory(context) {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const start = main.indexOf('async function captureHlsSubtitlePlaylist(');
  const end = main.indexOf('const CAPTURE_PROCESSED', start);
  assert(start >= 0 && end > start, 'captureHlsSubtitlePlaylist kaynakta bulunamadı');
  return vm.runInNewContext(`(${main.slice(start, end)})`, context);
}

function responseBodyFactory(context) {
  const main = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');
  const start = main.indexOf('async function getBrowserCapturedResponseBody(');
  const end = main.indexOf('async function captureBrowserResponse(', start);
  assert(start >= 0 && end > start, 'getBrowserCapturedResponseBody kaynakta bulunamadı');
  return vm.runInNewContext(`(${main.slice(start, end)})`, context);
}

(async () => {
  await test('kısmi HLS segment sonucu yazılır fakat tamamlandı sayılmaz', async () => {
    const fetchedBodies = new Map([
      ['https://cdn.test/a.vtt', 'ok-a'],
      ['https://cdn.test/b.vtt', new Error('geçici ağ hatası')],
    ]);
    const stored = [];
    const context = {
      isHlsSubtitlePlaylist: () => true,
      subtitleLanguage: () => 'tr',
      browserTrackStreamKey: (url) => url,
      browserHlsInFlight: new Set(),
      browserHlsFetchedSegments: new Map(),
      parseHlsSegments: () => [
        { url: 'https://cdn.test/a.vtt', start: 0, duration: 4 },
        { url: 'https://cdn.test/b.vtt', start: 4, duration: 4 },
      ],
      fetchBrowserText: async (url) => {
        const result = fetchedBodies.get(url);
        if (result instanceof Error) throw result;
        return result;
      },
      parseSubtitlePayload: (body) => ({
        cues: [{ start: 0, end: 1, text: body }],
      }),
      cuesUseLocalSegmentTimeline: () => false,
      storeBrowserTrack: (cues) => stored.push(cues),
    };
    const capture = captureHlsFactory(context);
    assert.equal(await capture('#EXTM3U', 'https://cdn.test/subs.m3u8'), false);
    assert.equal(stored.length, 1, 'başarılı kısmi cue kaybedildi');
    assert.deepEqual([...context.browserHlsFetchedSegments.values()][0],
      new Set(['https://cdn.test/a.vtt']));

    fetchedBodies.set('https://cdn.test/b.vtt', 'ok-b');
    assert.equal(await capture('#EXTM3U', 'https://cdn.test/subs.m3u8'), true);
    assert.equal(stored.length, 2);
    assert.equal(await capture('#EXTM3U', 'https://cdn.test/subs.m3u8'), true,
      'tamamlanmış segmentler sonraki transaction denemesinde yeniden hata sayıldı');
  });

  await test('bütün HLS segmentleri başarısızsa başarı sonucu ve çıktı üretilmez', async () => {
    const context = {
      isHlsSubtitlePlaylist: () => true,
      subtitleLanguage: () => '',
      browserTrackStreamKey: (url) => url,
      browserHlsInFlight: new Set(),
      browserHlsFetchedSegments: new Map(),
      parseHlsSegments: () => [{ url: 'https://cdn.test/a.vtt', start: 0, duration: 4 }],
      fetchBrowserText: async () => { throw new Error('timeout'); },
      parseSubtitlePayload: () => ({ cues: [] }),
      cuesUseLocalSegmentTimeline: () => false,
      storeBrowserTrack: () => { throw new Error('çıktı yazılmamalı'); },
    };
    const capture = captureHlsFactory(context);
    assert.equal(await capture('#EXTM3U', 'https://cdn.test/subs.m3u8'), false);
    assert.equal(context.browserHlsFetchedSegments.values().next().value.size, 0);
  });

  await test('CDP manifest gövdesi sınırlı backoff ile yeniden denenir ve iptalde kesilir', async () => {
    let calls = 0;
    const context = {
      BROWSER_SCRIPT_TIMEOUT: 50,
      browserStateGeneration: 4,
      withTimeout: (task) => task,
      setTimeout: (callback) => { callback(); return 1; },
      browserView: {
        webContents: {
          debugger: {
            sendCommand: async () => {
              calls++;
              if (calls < 3) throw new Error('CDP gövdesi hazır değil');
              return { body: '#EXTM3U', base64Encoded: false };
            },
          },
        },
      },
    };
    const readBody = responseBodyFactory(context);
    const result = await readBody({
      url: 'https://cdn.test/master.m3u8',
      mimeType: 'application/vnd.apple.mpegurl',
      requestId: 'one',
      captureGeneration: 4,
    });
    assert.equal(result.body, '#EXTM3U');
    assert.equal(calls, 3);

    calls = 0;
    context.browserStateGeneration = 4;
    context.browserView.webContents.debugger.sendCommand = async () => {
      calls++;
      context.browserStateGeneration = 5;
      return { body: '#EXTM3U', base64Encoded: false };
    };
    await assert.rejects(() => readBody({
      url: 'https://cdn.test/master.m3u8',
      requestId: 'cancelled',
      captureGeneration: 4,
    }), (error) => error.code === 'ECAPTURECANCELLED');
    assert.equal(calls, 1, 'iptal edilmiş gövde isteği yeniden denendi');
  });

  if (!process.exitCode) console.log(`\n${passed} manifest işleme testi geçti.`);
})();
