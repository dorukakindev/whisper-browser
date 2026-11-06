// podcast-transcript — namespace normalizasyonu, zamanlılık sınıfı, güvenli URL, HTTP sınıflandırması.
const assert = require('node:assert');
const P = require('../src/podcast-transcript.js');

// 1) VTT/SRT zamanlı; plain/html zamansız; JSON şema doğrulanmadan zamanlı değil; dil geri dönüşü beslemeden
{
  const d = P.normalizePodcastTranscripts([
    { url: 'https://cdn.example.com/ep1.vtt', type: 'text/vtt; charset=utf-8', language: 'en-US', rel: 'captions' },
    { url: 'https://cdn.example.com/ep1.srt', type: 'application/x-subrip' },
    { url: 'https://cdn.example.com/ep1.txt', type: 'text/plain', language: 'tr' },
    { url: 'https://cdn.example.com/ep1.json', type: 'application/json' },
    { url: 'https://cdn.example.com/ep1.html', type: 'TEXT/HTML' },
    { url: 'https://cdn.example.com/ep1.ttml', type: 'application/ttml+xml' },
  ], 'en_GB');
  assert.deepStrictEqual(d.map((x) => [x.mime, x.timed, x.language, x.relation]), [
    ['text/vtt', 'yes', 'en-us', 'captions'], ['application/x-subrip', 'yes', 'en-gb', 'transcript'], ['text/plain', 'no', 'tr', 'transcript'],
    ['application/json', 'unknown', 'en-gb', 'transcript'], ['text/html', 'no', 'en-gb', 'transcript'], ['application/ttml+xml', 'conditional', 'en-gb', 'transcript'],
  ]);
  assert.ok(d.every((x) => x.provenance === 'publisher'));
}
// 2) Güvensiz/eksik girdi atılır ve nedeni kayda geçer; yineleme tek kayıt
{
  const { descriptors, rejected } = P.normalizeDetailed([
    { url: 'http://cdn.example.com/a.vtt', type: 'text/vtt' }, { url: 'https://user:pw@cdn.example.com/a.vtt', type: 'text/vtt' },
    { url: 'https://127.0.0.1/a.vtt', type: 'text/vtt' }, { url: 'https://localhost/a.vtt', type: 'text/vtt' }, { url: 'file:///etc/passwd', type: 'text/plain' },
    { url: 'https://192.168.1.5/a.vtt', type: 'text/vtt' }, { url: 'https://[::1]/a.vtt', type: 'text/vtt' }, { url: 'https://cdn.example.com/x.vtt' },
    { url: '', type: 'text/vtt' }, null, 'çöp',
    { url: 'https://cdn.example.com/ok.vtt', type: 'text/vtt' }, { url: 'https://cdn.example.com/ok.vtt', type: 'text/vtt' },
  ], null);
  assert.strictEqual(descriptors.length, 1); assert.strictEqual(descriptors[0].language, null);
  assert.deepStrictEqual(rejected.map((r) => r.reason).sort(), ['missing-type', 'missing-url', 'missing-url', 'missing-url', ...Array(7).fill('unsafe-url')].sort());
}
// 3) SSRF sözdizimsel kapı
{
  for (const h of ['10.0.0.1', '172.16.5.5', '172.31.255.255', '192.168.0.1', '169.254.1.1', '100.64.0.1', '0.0.0.0', 'foo.local', 'db.internal', '[fd00::1]', 'fe80::1'])
    assert.ok(P.isPrivateHost(h), h);
  for (const h of ['172.15.0.1', '172.32.0.1', '8.8.8.8', 'example.com', 'cdn.example.com']) assert.ok(!P.isPrivateHost(h), h);
}
// 4) Biçim koklama: zaman damgası yoksa zamansız
{
  assert.deepStrictEqual(P.sniffTranscriptFormat('\uFEFFWEBVTT\n\n00:00.000 --> 00:02.000\nHi'), { format: 'vtt', timed: 'yes' });
  assert.deepStrictEqual(P.sniffTranscriptFormat('1\n00:00:01,000 --> 00:00:02,500\nHi\n'), { format: 'srt', timed: 'yes' });
  assert.deepStrictEqual(P.sniffTranscriptFormat('Konuşmacı: Merhaba. Bugün...'), { format: 'plain', timed: 'no' });
  assert.strictEqual(P.sniffTranscriptFormat('<html><body>x</body></html>').timed, 'unknown');
}
// 5) HTTP sonuçları: 403/429/503 boş başarı değil; MIME uyumsuzluğu; boyut
{
  const d = { mime: 'text/vtt' };
  assert.deepStrictEqual(P.classifyTranscriptResponse({ descriptor: d, status: 429, retryAfterSeconds: 30 }), { ok: false, code: 'rate-limited', retryAfterSeconds: 30 });
  assert.strictEqual(P.classifyTranscriptResponse({ descriptor: d, status: 403 }).code, 'forbidden');
  assert.strictEqual(P.classifyTranscriptResponse({ descriptor: d, status: 503 }).code, 'unavailable');
  assert.strictEqual(P.classifyTranscriptResponse({ descriptor: d, status: 404 }).code, 'not-found');
  assert.strictEqual(P.classifyTranscriptResponse({ descriptor: d, status: 200, contentType: 'text/html', byteLength: 10 }).code, 'mime-mismatch');
  assert.strictEqual(P.classifyTranscriptResponse({ descriptor: d, status: 200, contentType: 'text/vtt', byteLength: 6 * 1024 * 1024 }).code, 'too-large');
  assert.strictEqual(P.classifyTranscriptResponse({ descriptor: d, status: 200, contentType: 'text/vtt; charset=utf-8', byteLength: 100 }).ok, true);
  assert.strictEqual(P.classifyTranscriptResponse({ descriptor: { mime: 'text/plain' }, status: 200, contentType: 'text/html', byteLength: 1 }).ok, true, 'plain/html aynı zamansız sınıf');
}
// 6) En iyi aday ve yetenek: zamansız metin seek vaat etmez
{
  const ds = P.normalizePodcastTranscripts([{ url: 'https://a.example/x.txt', type: 'text/plain', language: 'tr' }, { url: 'https://a.example/x.vtt', type: 'text/vtt', language: 'en' }, { url: 'https://a.example/y.vtt', type: 'text/vtt', language: 'tr' }], 'en');
  assert.strictEqual(P.pickBestTranscript(ds, { preferLanguages: ['tr'] }).url, 'https://a.example/y.vtt', 'tercih dili + zamanlı');
  assert.strictEqual(P.pickBestTranscript(ds, {}).mime, 'text/vtt');
  assert.deepStrictEqual(P.transcriptCapability(ds[0]), { support: 'no', reason: 'untimed' });
  assert.deepStrictEqual(P.transcriptCapability(null), { support: 'no', reason: 'no-transcript' });
  assert.strictEqual(P.pickBestTranscript([]), null);
}
console.log('podcast-transcript.test.js: OK');

// Existing saved workspaces are searched without creating another transcript store.
{
 const {searchPodcastTranscripts:find}=require('../src/media-shelf-service');
 const e={title:'Episode',episodeIdentity:'ep',sourceVersion:'v1',sourceBinding:{episodeIdentity:'ep',resource:'https://example.com/a.mp3'},podcastWorkspace:{sourceVersion:'v1',transcript:{state:'timed',format:'vtt',text:'WEBVTT\n\n00:00:02.000 --> 00:00:04.000\nA real phrase\n'},translation:{state:'timed',format:'vtt',text:'WEBVTT\n\n00:00:02.000 --> 00:00:04.000\nGerçek ifade\n'}}};
 const d={podcasts:[{title:'Show',episodes:[e]}]},empty={entries:[],feeds:[]};
 const original=find(d,empty,'real phrase')[0],translated=find(d,empty,'ifade')[0];assert(original.timed);assert.equal(original.seconds,2);assert.equal(translated.role,'translation');assert.equal(translated.end,4);assert.equal(find(d,empty,'').length,0);assert.equal(find(d,empty,'missing').length,0);
 e.podcastWorkspace.transcript.text=e.podcastWorkspace.transcript.text.replace('real','changed');assert.notEqual(find(d,empty,'phrase')[0].token,original.token);
 e.sourceVersion='v2';assert.equal(find(d,empty,'phrase').length,0);
 e.podcastWorkspace={sourceVersion:'v2',transcript:{state:'untimed',format:'plain',text:'A publisher phrase'}};const plain=find(d,empty,'phrase')[0];assert.equal(plain.timed,false);assert.equal(plain.seconds,null);assert.equal(plain.end,null);
 e.podcastWorkspace.transcript.text='é'.repeat(5000)+' A publisher phrase at the end';assert.match(find(d,empty,'phrase')[0].quote,/phrase at the end/);
 d.podcasts=[];assert.equal(find(d,empty,'phrase').length,0);
 const session=require('../src/podcast-session'),entry={id:'saved',feedId:'show',externalId:'one',kind:'podcast',title:'Canonical',enclosures:[{url:'https://example.com/c.mp3',type:'audio/mpeg'}]};entry.podcastWorkspace={sourceVersion:session.sourceVersion(entry),transcript:{state:'timed',format:'vtt',provenance:'asr',text:'WEBVTT\n\n00:00:02.000 --> 00:00:04.000\nSaved phrase\n'}};
 const rss={entries:[entry],feeds:[{id:'show',title:'Show'}]},readonly=find(d,rss,'phrase')[0];assert.equal(readonly.timed,false,'download/ASR timestamps do not prove the current RSS stream');assert.equal(readonly.seconds,null);entry.podcastWorkspace.transcript.provenance='publisher';assert.equal(find(d,rss,'phrase')[0].seconds,2);
}
