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

  // B03: moviehash sorguya eklenir ve sağlayıcının eşleşme işareti sıralamayı üstlenir
  const hashCalls = [];
  const hashFetch = async (url, options) => {
    hashCalls.push(url);
    return response({ total_count: 2, page: 1, data: [
      { id: '1', attributes: { language: 'en', release: 'Other.WEB', download_count: 9000, moviehash_match: false,
        files: [{ file_id: 11 }], feature_details: { title: 'Example' } } },
      { id: '2', attributes: { language: 'en', release: 'Other2.WEB', download_count: 1, moviehash_match: true,
        files: [{ file_id: 33 }], feature_details: { title: 'Farklı' } } },
    ] });
  };
  const hashed = await searchSubtitles({ query: 'Example', moviehash: '5f9fe02060a3cd40', filesize: 200000 }, { apiKey: 'k', fetch: hashFetch });
  assert.ok(hashCalls[0].includes('moviehash=5f9fe02060a3cd40'), 'moviehash sorgu parametresi');
  assert.equal(hashed.results[0].fileId, 33, 'hash eşleşmesi indirme sayısının önünde');
  assert.equal(hashed.results[0].hashMatch, true);
  assert.equal(hashed.results[1].hashMatch, false);

  // hash eşleşmesi boşsa salt başlık sorgusuna düşer
  const fbCalls = [];
  const fbFetch = async (url) => {
    fbCalls.push(url);
    if (url.includes('moviehash=')) return response({ total_count: 0, page: 1, data: [] });
    return response({ total_count: 1, page: 1, data: [
      { id: '9', attributes: { language: 'en', files: [{ file_id: 44 }], feature_details: { title: 'Example' } } }] });
  };
  const fb = await searchSubtitles({ query: 'Example', moviehash: '5f9fe02060a3cd40' }, { apiKey: 'k', fetch: fbFetch });
  assert.equal(fbCalls.length, 2, 'boş hash sonucu sonrası fallback sorgusu');
  assert.ok(!fbCalls[1].includes('moviehash'), 'fallback moviehashsiz');
  assert.equal(fb.results[0].fileId, 44);

  await assert.rejects(searchSubtitles({ query: 'x', moviehash: 'zz' }, { apiKey: 'k', fetch }), { code: 'INVALID_INPUT' });
  await assert.rejects(searchSubtitles({ query: 'x', filesize: -5 }, { apiKey: 'k', fetch }), { code: 'INVALID_INPUT' });
  console.log('browser-subtitle-search: fixture tests passed');
}

main().catch((error) => { console.error(error); process.exitCode = 1; });
