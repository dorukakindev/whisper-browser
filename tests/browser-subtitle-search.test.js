'use strict';
const assert = require('node:assert/strict');
const { searchSubtitles, downloadSubtitle } = require('../src/browser-subtitle-search');

function response(data, status = 200, headers = {}) {
  return new Response(typeof data === 'string' ? data : JSON.stringify(data), { status, headers });
}

async function main() {
  const calls = [];
  const fetch = async (url, options) => {
    calls.push({ url, options });
    return response({ total_count: 2, page: 1, data: [
      { id: '1', attributes: { language: 'en', release: 'Other.WEB', download_count: 500,
        files: [{ file_id: 11, file_name: 'other.srt' }], feature_details: { title: 'Example', season_number: 1, episode_number: 2 } } },
      { id: '2', attributes: { language: 'en', release: 'Example.S01E02.WEB', download_count: 20,
        files: [{ file_id: 22, file_name: 'best.srt' }], feature_details: { title: 'Example', season_number: 1, episode_number: 2 } } },
    ] });
  };
  const result = await searchSubtitles({ query: 'Example', season: 1, episode: 2, language: 'en', release: 'Example.S01E02.WEB' }, { apiKey: 'test-key', fetch });
  assert.equal(result.results[0].fileId, 22);
  assert.equal(result.results[0].matchScore, 115);
  assert.equal(result.totalCount, 2);
  assert.equal(calls[0].url, 'https://api.opensubtitles.com/api/v1/subtitles?query=Example&season_number=1&episode_number=2&languages=en');
  assert.equal(calls[0].options.headers['Api-Key'], 'test-key');

  const downloadCalls = [];
  const downloadFetch = async (url, options) => {
    downloadCalls.push({ url, options });
    if (url.endsWith('/download')) return response({ link: 'https://dl.opensubtitles.com/sub.srt', file_name: '../safe.srt' });
    return response('1\n00:00:00,000 --> 00:00:01,000\nHello\n');
  };
  const downloaded = await downloadSubtitle({ fileId: 22 }, { apiKey: 'test-key', token: 'test-token', fetch: downloadFetch });
  assert.equal(downloaded.fileName, 'safe.srt');
  assert.equal(downloaded.format, 'srt');
  assert.match(downloaded.text, /Hello/);
  assert.equal(downloadCalls[0].options.headers.Authorization, 'Bearer test-token');
  assert.equal(downloadCalls[1].options.headers, undefined);
  assert.equal(JSON.parse(downloadCalls[0].options.body).file_id, 22);

  await assert.rejects(downloadSubtitle({ fileId: 22 }, { apiKey: 'test-key', fetch: async () => response({ link: 'http://127.0.0.1/private' }) }), { code: 'UNSAFE_URL' });
  await assert.rejects(downloadSubtitle({ fileId: 22 }, { apiKey: 'test-key', fetch: async (url) =>
    url.endsWith('/download') ? response({ link: 'https://dl.opensubtitles.com/sub.srt' }) : response('x'.repeat(2 * 1024 * 1024 + 1)) }), { code: 'TOO_LARGE' });
  await assert.rejects(searchSubtitles({ query: 'Example' }, { apiKey: 'test-key', fetch: async () => response({}, 429, { 'Retry-After': '15' }) }), { code: 'RATE_LIMIT', retryAfter: '15' });
  await assert.rejects(searchSubtitles({ query: 'Example' }, { apiKey: 'test-key', fetch: async () => response({}, 401) }), { code: 'AUTH' });
  console.log('browser-subtitle-search: fixture tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
