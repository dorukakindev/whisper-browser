'use strict';

const assert = require('assert');
const http = require('http');
const { parseSubtitlePayload } = require('../src/browser-subtitles');
const { CAPTURE_RETRY, runBoundedCapture } = require('../src/browser-capture-recovery');

const VALID_VTT = 'WEBVTT\n\n00:00.000 --> 00:01.000\nBir\n\n00:01.000 --> 00:02.000\nİki\n';
const ONE_CUE_VTT = 'WEBVTT\n\n00:00.000 --> 00:01.000\nEksik\n';

function listen(server) {
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve(server.address().port));
  });
}

function close(server) {
  return new Promise((resolve) => server.close(resolve));
}

async function main() {
  const counts = new Map();
  const server = http.createServer((req, res) => {
    const name = new URL(req.url, 'http://127.0.0.1').pathname.slice(1);
    const count = (counts.get(name) || 0) + 1;
    counts.set(name, count);
    res.setHeader('content-type', 'text/vtt; charset=utf-8');

    if (name === 'reset' && count === 1) {
      req.socket.destroy();
      return;
    }
    if ((name === 'timeout' || name === 'abort') && count === 1) {
      const timer = setTimeout(() => { if (!res.destroyed) res.end(VALID_VTT); }, 80);
      res.once('close', () => clearTimeout(timer));
      return;
    }
    const status = Number(name.replace('http-', ''));
    if ([403, 429, 500].includes(status) && count === 1) {
      res.statusCode = status;
      res.end(`HTTP ${status}`);
      return;
    }
    if (name === 'incomplete' && count === 1) {
      res.end(ONE_CUE_VTT);
      return;
    }
    if (name === 'parse-error' && count === 1) {
      res.end('WEBVTT\n\nbozuk zaman kodu');
      return;
    }
    if (name === 'always-500') {
      res.statusCode = 500;
      res.end('HTTP 500');
      return;
    }
    res.end(VALID_VTT);
  });

  const port = await listen(server);
  const origin = `http://127.0.0.1:${port}`;
  const matrix = ['timeout', 'http-403', 'http-429', 'http-500', 'abort', 'reset', 'incomplete', 'parse-error'];
  try {
    for (const name of matrix) {
      const recovery = await runBoundedCapture(async () => {
        const controller = new AbortController();
        let timer = null;
        if (name === 'timeout') timer = setTimeout(() => controller.abort(new Error('timeout')), 20);
        if (name === 'abort') timer = setTimeout(() => controller.abort(new Error('manual abort')), 5);
        try {
          const response = await fetch(`${origin}/${name}`, { signal: controller.signal });
          if (!response.ok) return CAPTURE_RETRY;
          const body = await response.text();
          const parsed = parseSubtitlePayload(body, 'text/vtt', `${origin}/${name}`);
          return parsed.cues.length >= 2 ? 'processed' : CAPTURE_RETRY;
        } catch (_) {
          return CAPTURE_RETRY;
        } finally {
          if (timer) clearTimeout(timer);
        }
      }, { retryDelays: [1, 2, 4] });
      assert.equal(recovery.outcome, 'processed', `${name} sonrasında iz yeniden yakalanmadı`);
      assert(recovery.attempts >= 2 && recovery.attempts <= 3,
        `${name} ayrı bir geçici hata olarak üretilmedi (deneme=${recovery.attempts}, istek=${counts.get(name)})`);
      assert.equal(recovery.exhausted, false);
      console.log(`  OK  ${name}: ${recovery.attempts}. denemede yeniden yakalandı`);
    }

    const exhausted = await runBoundedCapture(async () => {
      const response = await fetch(`${origin}/always-500`);
      return response.ok ? 'processed' : CAPTURE_RETRY;
    }, { retryDelays: [0, 0] });
    assert.equal(exhausted.exhausted, true);
    assert.equal(exhausted.attempts, 3);
    assert.equal(counts.get('always-500'), 3);
    console.log('  OK  kalıcı hata sınırlı üç denemede durdu');

    let current = true;
    const stale = await runBoundedCapture(async () => CAPTURE_RETRY, {
      retryDelays: [1, 2],
      isCurrent: () => current,
      wait: async () => { current = false; },
    });
    assert.equal(stale.outcome, 'stale');
    assert.equal(stale.attempts, 1);
    console.log('  OK  navigation/video değişimi eski retry zincirini kesti');
  } finally {
    await close(server);
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
