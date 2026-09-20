const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const {
  browserNavigationCapabilities,
  cueFingerprint,
  cuesToSrt,
  cuesToVtt,
  detectHlsCea608,
  isLikelySubtitleResponse,
  manifestFingerprint,
  parseAss,
  parseHlsSubtitleTracks,
  parseHlsVariantStreams,
  parseHlsSegmentUris,
  parseHlsSegments,
  isHlsSubtitlePlaylist,
  parseDashSubtitleTracks,
  parseDashSubtitleMatchers,
  matchDashSubtitleUrl,
  dashSegmentOffset,
  cuesUseLocalSegmentTimeline,
  normalizeCues,
  browserActiveCuesAt,
  parseMp4Stpp,
  parseMp4WebVtt,
  parseMp4SampleDefaults,
  parseMp4Timescale,
  parseTimedBlocks,
  mergeBrowserStreamCues,
  decodeSubtitleBuffer,
  findSubtitleUrls,
  parseLrc,
  parseSami,
  parseSubtitlePayload,
  parseTime,
  parseYoutubeCaptionMetadata,
} = require('../src/browser-subtitles');
const { captureBodyFingerprint } = require('../src/browser-capture-recovery');

let passed = 0;
const tests = [];
function test(name, fn) {
  tests.push({ name, fn });
}

test('WebVTT satırlarını ve HTML etiketlerini ayrıştırır', () => {
  const result = parseSubtitlePayload(`WEBVTT\n\n00:01.000 --> 00:03.500\n<c.green>Hello &amp; welcome</c>\n\n00:04.000 --> 00:06.000\nSecond line`, 'text/vtt', 'https://cdn.test/captions.vtt');
  assert.equal(result.format, 'vtt');
  assert.deepEqual(result.cues, [
    { start: 1, end: 3.5, text: 'Hello & welcome' },
    { start: 4, end: 6, text: 'Second line' },
  ]);
});

test('saat alanı olmayan üç haneli WebVTT dakikasını ayrıştırır', () => {
  const result = parseSubtitlePayload('WEBVTT\n\n123:45.000 --> 123:47.500\nUzun video',
    'text/vtt', 'https://cdn.test/long.vtt');
  assert.deepEqual(result.cues, [{ start: 7425, end: 7427.5, text: 'Uzun video' }]);
});

test('Bozuk HTML sayısal entity altyazı yakalamayı çökertmez', () => {
  const result = parseSubtitlePayload('WEBVTT\n\n00:00.000 --> 00:01.000\nGeçersiz &#9999999; değer',
    'text/vtt', 'https://cdn.test/captions.vtt');
  assert.equal(result.cues.length, 1);
  assert.match(result.cues[0].text, /Geçersiz .* değer/);
});

test('örtüşen kaydırılmış web caption kopyasını siler, gerçek tekrarı korur', () => {
  const text = 'Welcome to the Sea of Silt.';
  assert.deepEqual(normalizeCues([
    { start: 1.300, end: 9.520, text },
    { start: 1.664, end: 9.520, text },
  ]), [{ start: 1.3, end: 9.52, text }]);
  assert.equal(normalizeCues([
    { start: 0, end: 1, text: 'Hayır.' },
    { start: 1, end: 2, text: 'Hayır.' },
  ]).length, 2);
  assert.equal(normalizeCues([
    { start: 0, end: 4, text: 'Hayır.' },
    { start: 1.2, end: 2, text: 'Hayır.' },
  ]).length, 2);
  assert.equal(normalizeCues([
    { start: 0, end: 2, text: 'Hayır.', speaker: 'A' },
    { start: .5, end: 2, text: 'Hayır.', speaker: 'B' },
  ]).length, 2);
});

test('Whisper ve WhisperX segments JSON çıktısını doğrudan ayrıştırır', () => {
  const result = parseSubtitlePayload(JSON.stringify({ segments: [
    { start: 1.2, end: 3.4, text: 'İlk satır' },
    { start: 3.4, end: 5.1, text: 'İkinci satır' },
  ] }), 'application/json', 'whisper.json');
  assert.equal(result.format, 'json3');
  assert.deepEqual(result.cues, [
    { start: 1.2, end: 3.4, text: 'İlk satır' },
    { start: 3.4, end: 5.1, text: 'İkinci satır' },
  ]);
  assert.deepEqual(parseSubtitlePayload(JSON.stringify({ segments: [] }),
    'application/json', 'empty-whisper.json'), { cues: [], format: '' });
});
test('Parçalı WebVTT MPEGTS zaman haritasını video zamanına uygular', () => {
  const result = parseSubtitlePayload('WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:900000\n\n00:00.500 --> 00:02.000\nMapped cue', 'text/vtt', 'https://cdn.test/seg-1.vtt');
  assert.deepEqual(result.cues, [{ start: 10.5, end: 12, text: 'Mapped cue' }]);
});

test('TTML begin/end ve begin/dur zamanlarını ayrıştırır', () => {
  const result = parseSubtitlePayload(`<tt><body><div>
    <p begin="00:00:02.000" end="00:00:04.250">First<br/>line</p>
    <p begin="5.5s" dur="2s">Second</p>
  </div></body></tt>`, 'application/ttml+xml', 'https://cdn.test/subtitle');
  assert.equal(result.format, 'ttml');
  assert.equal(result.cues.length, 2);
  assert.deepEqual(result.cues[0], { start: 2, end: 4.25, text: 'First\nline' });
  assert.deepEqual(result.cues[1], { start: 5.5, end: 7.5, text: 'Second' });
});

test('TTML tick ve frame zamanlarını kök oranıyla saniyeye çevirir', () => {
  const ticks = parseSubtitlePayload('<tt ttp:tickRate="1000"><body><p begin="1500t" dur="500t">Tick</p></body></tt>', 'application/ttml+xml', 'https://cdn.test/1.m4s');
  assert.deepEqual(ticks.cues, [{ start: 1.5, end: 2, text: 'Tick' }]);
  const frames = parseSubtitlePayload('<tt ttp:frameRate="25"><body><p begin="50f" end="75f">Frame</p></body></tt>', 'application/ttml+xml', 'https://cdn.test/2.m4s');
  assert.deepEqual(frames.cues, [{ start: 2, end: 3, text: 'Frame' }]);
});

test('TTML saat:kare zamanını ve start alanını doğru ölçekle ayrıştırır', () => {
  const clock = parseSubtitlePayload('<tt ttp:frameRate="25"><body><p begin="00:00:01:12" end="00:00:02:00">Kare</p></body></tt>',
    'application/ttml+xml', 'https://cdn.test/frame.ttml');
  assert.deepEqual(clock.cues, [{ start: 1.48, end: 2, text: 'Kare' }]);
  const explicit = parseSubtitlePayload('<tt><body><p start="5" t="5000" dur="2">Başlangıç</p></body></tt>',
    'application/ttml+xml', 'https://cdn.test/start.ttml');
  assert.deepEqual(explicit.cues, [{ start: 5, end: 7, text: 'Başlangıç' }]);
});

test('UTF-16 BOM altyazı gövdelerini metne dönüştürür', () => {
  const text = 'WEBVTT\n\n00:00.000 --> 00:01.000\nTürkçe';
  const littleEndian = Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]);
  assert.equal(decodeSubtitleBuffer(littleEndian), text);
  const bigEndianBody = Buffer.from(text, 'utf16le');
  for (let index = 0; index + 1 < bigEndianBody.length; index += 2) {
    const first = bigEndianBody[index];
    bigEndianBody[index] = bigEndianBody[index + 1];
    bigEndianBody[index + 1] = first;
  }
  assert.equal(decodeSubtitleBuffer(Buffer.concat([Buffer.from([0xfe, 0xff]), bigEndianBody])), text);
  const oddBigEndian = Buffer.concat([Buffer.from([0xfe, 0xff]), bigEndianBody, Buffer.from([0x41])]);
  assert.equal(decodeSubtitleBuffer(oddBigEndian), text,
    'tek kalan bayt ayrılmamış bellekle doldurulmamalı');
});

test('MPEGTS 33-bit rollover sonrasında parçalı WebVTT zaman çizelgesini sürekli tutar', () => {
  const rollover = 2 ** 33;
  const mpegTsState = {};
  const before = parseTimedBlocks(`WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:${rollover - 180000}\n\n00:00.250 --> 00:01.000\nÖnce`, { mpegTsState });
  const after = parseTimedBlocks('WEBVTT\nX-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:90000\n\n00:00.250 --> 00:01.000\nSonra', { mpegTsState });
  assert.equal(before.length, 1);
  assert.equal(after.length, 1);
  assert(Math.abs(after[0].start - before[0].start - 3) < 1e-6,
    `rollover sonrası cue sürekliliği bozuldu: ${before[0].start} -> ${after[0].start}`);
  assert(after[0].start > 95000, 'sarma sonrası cue önceki 33-bit döneme geri düştü');
});

test('entity ile kodlanmış etiketleri temizlerken matematik karşılaştırmasını korur', () => {
  const result = parseSubtitlePayload('WEBVTT\n\n00:00.000 --> 00:02.000\n&lt;i&gt;5 &lt; 10 ve 20 &gt; 15&lt;/i&gt;',
    'text/vtt', 'https://cdn.test/math.vtt');
  assert.deepEqual(result.cues, [{ start: 0, end: 2, text: '5 < 10 ve 20 > 15' }]);
});

test('WebVTT alfanümerik cue kimliğini önceki metne sızdırmaz', () => {
  const result = parseSubtitlePayload('WEBVTT\n\ncue-a\n00:01.000 --> 00:02.000\nBir\n\ncue-b\n00:03.000 --> 00:04.000\nİki',
    'text/vtt', 'https://cdn.test/ids.vtt');
  assert.deepEqual(result.cues.map(cue => cue.text), ['Bir', 'İki']);
});

test('WebVTT sonundaki NOTE STYLE ve REGION bloklarını konuşmaya eklemez', () => {
  for (const metadata of [
    'NOTE editör notu\nkonuşma değildir',
    'STYLE\n::cue { color: lime; }',
    'REGION\nid:bottom\nwidth:80%',
  ]) {
    const result = parseSubtitlePayload(`WEBVTT\n\n00:01.000 --> 00:02.000\nGerçek metin\n\n${metadata}`,
      'text/vtt', 'https://cdn.test/metadata.vtt');
    assert.deepEqual(result.cues, [{ start: 1, end: 2, text: 'Gerçek metin' }]);
  }
});

test('namespace kullanan TTML p ve iç span zamanlarını ayrı cue olarak ayrıştırır', () => {
  const namespaced = parseSubtitlePayload(
    '<tt:tt xmlns:tt="urn:tt"><tt:body begin="2s"><tt:div><tt:p begin="1s"><tt:span begin="0.5s" dur="1s">Bir</tt:span><tt:span begin="1.5s" dur="1s">İki</tt:span></tt:p></tt:div></tt:body></tt:tt>',
    'application/ttml+xml', 'https://cdn.test/namespaced.ttml');
  assert.deepEqual(namespaced.cues, [
    { start: 3.5, end: 4.5, text: 'Bir' },
    { start: 4.5, end: 5.5, text: 'İki' },
  ]);
});

test('namespace kullanan TTML içerik MIME ipucu olmadan da tanınır', () => {
  const result = parseSubtitlePayload('<tt:tt xmlns:tt="urn:tt"><tt:body><tt:p begin="1s" end="2s">Metin</tt:p></tt:body></tt:tt>',
    'application/octet-stream', 'https://cdn.test/chunk.bin');
  assert.equal(result.format, 'ttml');
  assert.deepEqual(result.cues, [{ start: 1, end: 2, text: 'Metin' }]);
});

test('bozuk TTML namespace kapanışını komşu paragrafları yutmadan tolere eder', () => {
  const result = parseSubtitlePayload(
    '<tt:tt xmlns:tt="urn:tt"><tt:body><tt:p begin="1s" end="2s">Bir</p><tt:p begin="3s" end="4s">İki</tt:p></tt:body></tt:tt>',
    'application/ttml+xml', 'https://cdn.test/mixed-prefix.ttml');
  assert.deepEqual(result.cues, [
    { start: 1, end: 2, text: 'Bir' },
    { start: 3, end: 4, text: 'İki' },
  ]);
});

test('yaygın adlandırılmış HTML entity değerlerini çözer', () => {
  const result = parseSubtitlePayload('WEBVTT\n\n00:00.000 --> 00:01.000\nTom&nbsp;&amp;&nbsp;Jerry &copy;',
    'text/vtt', 'https://cdn.test/entities.vtt');
  assert.equal(result.cues[0].text, 'Tom & Jerry ©');
});

test('Türkçe HTML entityleri ve yüksek hassasiyetli zamanları çözer', () => {
  const result = parseSubtitlePayload('WEBVTT\n\n00:00:01.1234 --> 00:00:04.5678\nG&ouml;r&uuml;&scedil;mek &uuml;zere &gbreve;eldi: &Idot;stanbul.',
    'text/vtt', 'https://cdn.test/tr.vtt');
  assert.deepEqual(result.cues, [{ start: 1.1234, end: 4.5678, text: 'Görüşmek üzere ğeldi: İstanbul.' }]);
});

test('sayısal entity kontrol karakterlerini altyazı metnine taşımaz', () => {
  const result = parseSubtitlePayload(
    'WEBVTT\n\n00:00.000 --> 00:01.000\nA&#x0;B&#9;C&#10;D&#13;E&#x7f;F',
    'text/vtt', 'https://cdn.test/control.vtt');
  assert.equal(result.cues[0].text, 'AB\tC\nDEF');
  assert(!/[\x00-\x08\x0b-\x1f\x7f]/.test(result.cues[0].text));
});

test('boş satırlı ve ayracı olmayan cue metinleri korunur', () => {
  const result = parseSubtitlePayload('WEBVTT\n\n00:00:01.000 --> 00:00:03.000\nBirinci paragraf\n\nİkinci paragraf\n00:00:04.000 --> 00:00:05.000\nSon cue',
    'text/vtt', 'https://cdn.test/paragraphs.vtt');
  assert.equal(result.cues.length, 2);
  assert.equal(result.cues[0].text, 'Birinci paragraf\nİkinci paragraf');
  assert.equal(result.cues[1].text, 'Son cue');
});

test('ayraçsız zaman bloklarında rakamdan oluşan diyalog satırı kaybolmaz', () => {
  const result = parseSubtitlePayload(
    '00:00:01.000 --> 00:00:02.000\nGeri sayım:\n3\n00:00:03.000 --> 00:00:04.000\nBitti',
    'text/vtt', 'https://cdn.test/countdown.vtt');
  assert.deepEqual(result.cues.map((cue) => cue.text), ['Geri sayım:\n3', 'Bitti']);
});

test('numarasız başlayan kompakt SRT sonraki sıra numarasını metne sızdırmaz', () => {
  const result = parseSubtitlePayload(
    '00:00:01,000 --> 00:00:02,000\nİlk\n2\n00:00:03,000 --> 00:00:04,000\nİkinci',
    'application/x-subrip', 'https://cdn.test/compact.srt');
  assert.deepEqual(result.cues.map((cue) => cue.text), ['İlk', 'İkinci']);
});

test('cue normalizasyonu konuşmacı ve kimlik metadatasını korur', () => {
  assert.deepEqual(normalizeCues([{ start: 1, end: 2, text: 'Merhaba', speaker: 'Alice', id: 'cue-1' }]),
    [{ start: 1, end: 2, text: 'Merhaba', speaker: 'Alice', id: 'cue-1' }]);
});

test('LRC satırındaki aralıklı çoklu zaman etiketleri metne sızmaz', () => {
  assert.deepEqual(parseLrc('[00:12.00] [00:15.00]Nakarat').map((cue) => ({ start: cue.start, text: cue.text })),
    [{ start: 12, text: 'Nakarat' }, { start: 15, text: 'Nakarat' }]);
});

test('boş LRC zaman etiketi önceki sözün kesin bitişini belirler', () => {
  const cues = parseLrc('[00:01.00]Merhaba\n[00:03.00]\n[00:20.00]Sonraki söz');
  assert.deepEqual(cues.map(({ start, end, text }) => ({ start, end, text })), [
    { start: 1, end: 3, text: 'Merhaba' },
    { start: 20, end: 25, text: 'Sonraki söz' },
  ]);
});

test('karışık TTML p içeriği zamanlı span dışındaki metni de korur', () => {
  const result = parseSubtitlePayload(
    '<tt><body><div><p begin="00:01.00" end="00:05.00">Ahmet: <span begin="00:02.00" dur="00:01.00">Selam</span> nasılsın?</p></div></body></tt>',
    'application/ttml+xml', 'https://cdn.test/mixed.ttml');
  assert.equal(result.cues.map((cue) => cue.text).join(' '), 'Ahmet: Selam nasılsın?');
});

test('SAMI kapanış etiketleri son diyalog metnine sızmaz', () => {
  const cues = parseSami('<SAMI><BODY><SYNC Start=1000><P>İlk<SYNC Start=3000><P>Son</BODY></SAMI>');
  assert.equal(cues.at(-1).text, 'Son');
});

test('çok dilli SAMI bloklarında ilk dil izini tutarlı biçimde seçer', () => {
  const cues = parseSami('<SAMI><BODY>'
    + '<SYNC Start=1000><P Class=ENCC>Hello</P><P Class=TRCC>Merhaba</P></SYNC>'
    + '<SYNC Start=3000><P Class=ENCC>World</P><P Class=TRCC>Dünya</P></SYNC>'
    + '<SYNC Start=5000><P Class=ENCC>&nbsp;</P><P Class=TRCC>&nbsp;</P></SYNC>'
    + '</BODY></SAMI>');
  assert.deepEqual(cues.map(({ start, end, text }) => ({ start, end, text })), [
    { start: 1, end: 3, text: 'Hello' },
    { start: 3, end: 5, text: 'World' },
  ]);
});

test('tırnaksız timed-text nitelikleri zaman damgasını korur', () => {
  const result = parseSubtitlePayload('<tt><body><div><p t=1500 d=2000>Tırnaksız</p></div></body></tt>',
    'application/ttml+xml', 'https://cdn.test/unquoted.ttml');
  assert.deepEqual(result.cues, [{ start: 1.5, end: 3.5, text: 'Tırnaksız' }]);
});

test('yerel segment zamanında komşu cue sınırını aşan son metin korunur', () => {
  assert.equal(cuesUseLocalSegmentTimeline([{ start: 0.5, end: 9.5, text: 'Taşan replik' }], 6, 12), true);
});

test('TTML kapsayıcı begin zamanını alt p cue zamanına ekler', () => {
  const result = parseSubtitlePayload('<tt><body begin="10s"><div begin="2s"><p begin="1s" dur="2s">İç içe</p></div></body></tt>',
    'application/ttml+xml', 'https://cdn.test/nested.ttml');
  assert.deepEqual(result.cues, [{ start: 13, end: 15, text: 'İç içe' }]);
});

test('IMSC bölge, konum, boyut ve yazım yönünü cue metadata’sında korur', () => {
  const xml = `<?xml version="1.0"?><tt xmlns:tts="urn:ttml:styling"><head><styling>
    <style xml:id="vertical" tts:writingMode="tbrl" tts:textAlign="center"/>
    </styling><layout>
    <region xml:id="left" tts:origin="5% 70%" tts:extent="40% 20%"/>
    <region xml:id="right" style="vertical" tts:origin="55% 70%" tts:extent="40% 20%"/>
    </layout></head><body><div>
    <p begin="1s" end="2s" region="left">Aynı</p>
    <p begin="1s" end="2s" region="right">Aynı</p>
    </div></body></tt>`;
  const cues = parseSubtitlePayload(xml, 'application/ttml+xml', 'https://cdn.test/imsc.ttml').cues;
  assert.equal(cues.length, 2);
  assert.deepEqual(cues.map((cue) => cue.region), ['left', 'right']);
  assert.equal(cues[0].position, '5%');
  assert.equal(cues[0].line, '70%');
  assert.equal(cues[0].regionExtent, '40% 20%');
  assert.equal(cues[1].writingMode, 'tbrl');
  assert.equal(cues[1].align, 'center');
});

test('Windows-1254 ağ altyazısı Türkçe karakterleriyle çözülür', () => {
  const cp1254 = Buffer.from([0xde, 0x69, 0x6d, 0xfe, 0x65, 0x6b, 0x20, 0xfd, 0xfe, 0xfd, 0x6e, 0xfd]);
  assert.equal(decodeSubtitleBuffer(cp1254), 'Şimşek ışını');
});

test('YouTube json3 olaylarını saniyeye çevirir', () => {
  const result = parseSubtitlePayload(JSON.stringify({ events: [
    { tStartMs: 1250, dDurationMs: 2250, segs: [{ utf8: 'Hello ' }, { utf8: 'world' }] },
    { tStartMs: 4000, dDurationMs: 1000, segs: [{ utf8: 'Again' }] },
  ] }), 'application/json', 'https://youtube.com/api/timedtext?fmt=json3');
  assert.equal(result.format, 'json3');
  assert.deepEqual(result.cues[0], { start: 1.25, end: 3.5, text: 'Hello world' });
});

test('YouTube json3 aAppend canlı metnini önceki cue ile birleştirir', () => {
  const result = parseSubtitlePayload(JSON.stringify({ events: [
    { tStartMs: 1000, dDurationMs: 1000, segs: [{ utf8: 'Merha' }] },
    { tStartMs: 1800, dDurationMs: 1200, aAppend: 1, segs: [{ utf8: 'ba' }] },
  ] }), 'application/json', 'https://youtube.com/api/timedtext?fmt=json3');
  assert.deepEqual(result.cues, [{ start: 1, end: 3, text: 'Merhaba' }]);
});

test('YouTube otomatik iz ve servis çeviri dillerini ayrı metadata olarak verir', () => {
  assert.deepEqual(parseYoutubeCaptionMetadata(JSON.stringify({ kind: 'asr', translationLanguages: [
    { languageCode: 'tr', languageName: { simpleText: 'Türkçe' } },
  ] })), {
    automatic: true, translatedByService: false,
    translationLanguages: [{ languageCode: 'tr', languageName: 'Türkçe' }],
  });
  assert.deepEqual(parseYoutubeCaptionMetadata('{}',
    'https://www.youtube.com/api/timedtext?kind=asr&tlang=tr'), {
    automatic: true, translatedByService: true, translationLanguages: [],
  });
});

test('YouTube srv3 kısa t/d değerlerini de milisaniye kabul eder', () => {
  const result = parseSubtitlePayload('<timedtext><body><p t="80" d="40">Kısa</p></body></timedtext>',
    'text/xml', 'https://youtube.com/api/timedtext?fmt=srv3');
  // Normalleştirici, görünür kalması için bloklara en az 80 ms süre verir.
  assert.deepEqual(result.cues, [{ start: .08, end: .16, text: 'Kısa' }]);
});

test('Genel altyazı JSON dizisini açık zaman alanlarıyla ayrıştırır', () => {
  const result = parseSubtitlePayload(JSON.stringify({ captions: [
    { startTimeMs: 1250, endTimeMs: 2500, text: 'Bir' },
    { startTimeMs: 3000, durationMs: 750, text: 'İki' },
  ] }), 'application/json', 'https://cdn.test/captions');
  assert.deepEqual(result.cues, [
    { start: 1.25, end: 2.5, text: 'Bir' },
    { start: 3, end: 3.75, text: 'İki' },
  ]);
});

test('Normal JSON API yanıtını altyazı diye kabul etmez', () => {
  const result = parseSubtitlePayload('{"status":"ok","items":[1,2,3]}', 'application/json', 'https://example.test/api/caption-settings');
  assert.equal(result.cues.length, 0);
});

test('Altyazı ipucu olmayan genel metin yanıtını izlemez', () => {
  assert.equal(isLikelySubtitleResponse({ url: 'https://example.test/api/profile', mimeType: 'application/json' }), false);
  assert.equal(isLikelySubtitleResponse({ url: 'https://example.test/media/movie.vtt', mimeType: 'text/vtt' }), true);
  assert.equal(isLikelySubtitleResponse({ url: 'https://example.test/api/timedtext?lang=en', mimeType: 'application/json' }), true);
  assert.equal(isLikelySubtitleResponse({ url: 'https://example.test/altyazi/seg-2.m4s', mimeType: 'application/mp4' }), true);
  assert.equal(isLikelySubtitleResponse({ url: 'https://example.test/video/seg-2.m4s', mimeType: 'application/mp4' }), false);
});

test('Aynı cue içeriği kararlı parmak izi üretir', () => {
  const cues = [{ start: 1, end: 2, text: 'A' }, { start: 3, end: 4, text: 'B' }];
  assert.equal(cueFingerprint(cues), cueFingerprint(cues.map((cue) => ({ ...cue }))));
  assert.notEqual(cueFingerprint(cues), cueFingerprint([{ start: 1, end: 2, text: 'C' }]));
});

test('Canlı iz parmak izi 80 satırdan sonraki büyümeyi yakalar', () => {
  const cues = Array.from({ length: 100 }, (_, index) => ({ start: index, end: index + 0.8, text: `Satır ${index}` }));
  assert.notEqual(cueFingerprint(cues), cueFingerprint([...cues, { start: 101, end: 102, text: 'Yeni satır' }]));
  const changedTail = cues.map((cue) => ({ ...cue }));
  changedTail[99].text = 'Değişen son satır';
  assert.notEqual(cueFingerprint(cues), cueFingerprint(changedTail));
});

test('Manifest parmak izi aynı uzunluktaki orta bölüm değişikliğini yakalar', () => {
  const prefix = 'A'.repeat(500);
  const suffix = 'Z'.repeat(500);
  assert.notEqual(manifestFingerprint(`${prefix}X${suffix}`), manifestFingerprint(`${prefix}Y${suffix}`));
});

test('SRT çıktısı UTF-8 metni ve zamanları korur', () => {
  const srt = cuesToSrt([{ start: 1.005, end: 3.21, text: 'Türkçe metin' }]);
  assert.match(srt, /00:00:01,005 --> 00:00:03,210/);
  assert.match(srt, /Türkçe metin/);
});

test('Genel JSON altyazısının sağlayıcı cue kimliğini korur', () => {
  const result = parseSubtitlePayload(JSON.stringify({ cues: [
    { cueId: 'provider-42', start: 1, end: 2, text: 'Kimlikli satır' },
  ] }), 'application/json', 'https://cdn.test/captions.json');
  assert.equal(result.cues[0].id, 'provider-42');
});

test('Canlı ASR aynı başlangıçlı düzeltme hipotezini son cue üzerine yazar', () => {
  const previous = [{ id: 'live-1', start: 10, end: 11, text: 'Merhaba' }];
  const merged = mergeBrowserStreamCues(previous,
    [{ id: 'live-1b', start: 10.005, end: 12, text: 'Merhaba dünya' }]);
  assert.notEqual(merged, previous, 'önceki dizi korunmalı');
  assert.deepEqual(previous, [{ id: 'live-1', start: 10, end: 11, text: 'Merhaba' }]);
  assert.deepEqual(merged, [{ id: 'live-1b', start: 10.005, end: 12, text: 'Merhaba dünya' }]);
});

test('büyüyen canlı altyazı gecikmiş kısa prefix yanıtıyla geriye dönmez', () => {
  const current = [{ start: 10, end: 13, text: "Bugün Sidney'de sınır görevlileri" }];
  const stale = mergeBrowserStreamCues(current,
    [{ start: 10.005, end: 12.9, text: "Bugün Sidney'de" }]);
  assert.deepEqual(stale, current);
  const correction = mergeBrowserStreamCues(current,
    [{ start: 10.005, end: 13, text: "Bugün Sydney'de sınır görevlileri" }]);
  assert.equal(correction[0].text, "Bugün Sydney'de sınır görevlileri");
});

test('komşu segmentte yinelenen aynı cueyu uzatır', () => {
  const merged = mergeBrowserStreamCues(
    [{ start: 4, end: 6, text: 'Devam eden cümle', sourceMode: 'pop-on' }],
    [{ start: 6.05, end: 8, text: 'Devam eden cümle', sourceMode: 'pop-on' }]);
  assert.deepEqual(merged, [{ start: 4, end: 8, text: 'Devam eden cümle', sourceMode: 'pop-on' }]);
});

test('farklı caption modu ve konuşmacı aynı metin olsa da korunur', () => {
  const modes = mergeBrowserStreamCues(
    [{ start: 1, end: 3, text: 'Evet', sourceMode: 'pop-on' }],
    [{ start: 2.9, end: 4, text: 'Evet', sourceMode: 'roll-up' }]);
  assert.equal(modes.length, 2);
  const speakers = normalizeCues([
    { start: 5, end: 7, text: 'Merhaba', speaker: 'A' },
    { start: 5.2, end: 7.2, text: 'Merhaba', speaker: 'B' },
  ]);
  assert.equal(speakers.length, 2);
});

test('aynı kimlikli cue kaymış zamanla yeniden gelince eski kopya silinir (S2)', () => {
  const previous = [
    { id: 'x', start: 10, end: 10.3, text: 'Evet' },
    { id: 'y', start: 20, end: 21, text: 'Hayır' },
  ];
  const merged = mergeBrowserStreamCues(previous,
    [{ id: 'x', start: 10.7, end: 11, text: 'Evet' }]);
  assert.deepEqual(merged.map((cue) => `${cue.id}@${cue.start}`), ['x@10.7', 'y@20'],
    'aynı kimlik+metin revizyonunda eski zaman damgası ikiz satır bırakmamalı');
  // Metin değiştiyse iki zaman damgası da korunur (revizyon değil yeni içerik olabilir)
  const revised = mergeBrowserStreamCues(previous,
    [{ id: 'x', start: 10.7, end: 11, text: 'Belki' }]);
  assert.equal(revised.length, 3);
  // Kimliksiz cue'lar revizyon dedupe'ına hiç girmez (eski davranış korunur)
  const noId = mergeBrowserStreamCues(
    [{ start: 10, end: 10.3, text: 'Evet' }],
    [{ start: 10.7, end: 11, text: 'Evet' }]);
  assert.equal(noId.length, 2, 'kimliksiz cue kayması ayrı satır olarak korunmalı');
});

test('HLS reklam veya bölüm discontinuity sınırındaki aynı metin birleşmez', () => {
  const merged = mergeBrowserStreamCues(
    [{ start: 10, end: 12, text: 'Birazdan devam edeceğiz.', discontinuity: 0 }],
    [{ start: 12, end: 14, text: 'Birazdan devam edeceğiz.', discontinuity: 1 }]);
  assert.equal(merged.length, 2);
  assert.deepEqual(merged.map((cue) => cue.discontinuity), [0, 1]);
});

test('Genel altyazı JSON zaman kodlarını saat:dakika:saniye biçiminde ayrıştırır', () => {
  const result = parseSubtitlePayload(JSON.stringify({ captions: [
    { start: '01:02:03.500', end: '01:02:05.000', text: 'Uzun içerik' },
    { start: '00:10.000', duration: '00:02.500', text: 'Kısa içerik' },
  ] }), 'application/json', 'https://cdn.test/captions');
  assert.deepEqual(result.cues, [
    { start: 10, end: 12.5, text: 'Kısa içerik' },
    { start: 3723.5, end: 3725, text: 'Uzun içerik' },
  ]);
});

test('SRT ve VTT dışa aktarımı cue metnindeki boş blok sınırını temizler', () => {
  const cue = [{ start: 1, end: 2, text: 'Bir\n\nİki' }];
  assert.doesNotMatch(cuesToSrt(cue), /Bir\r?\n\r?\nİki/);
  assert.doesNotMatch(cuesToVtt(cue), /Bir\r?\n\r?\nİki/);
});

test('WebVTT dışa aktarımı başlık ve noktalı zaman damgası üretir', () => {
  const vtt = cuesToVtt([{ start: 1.005, end: 3.21, text: 'Türkçe metin' }]);
  assert.match(vtt, /^WEBVTT\r?\n\r?\n/);
  assert.match(vtt, /00:00:01\.005 --> 00:00:03\.210/);
  assert.match(vtt, /Türkçe metin/);
});

test('Zaman ayrıştırıcı saatli ve birimli değerleri destekler', () => {
  assert.equal(parseTime('01:02:03.500'), 3723.5);
  assert.equal(parseTime('2500ms'), 2.5);
  assert.equal(parseTime('1.5m'), 90);
});

test('Hulu benzeri HLS manifestinden altyazı izlerini çıkarır', () => {
  const tracks = parseHlsSubtitleTracks('#EXT-X-MEDIA:TYPE=SUBTITLES,GROUP-ID="cc",LANGUAGE="en",NAME="English",URI="captions/en.m3u8"\n#EXT-X-MEDIA:TYPE=AUDIO,GROUP-ID="a",URI="audio.m3u8"', 'https://cdn.test/video/master.m3u8');
  assert.deepEqual(tracks, [{ url: 'https://cdn.test/video/captions/en.m3u8', language: 'en', label: 'English', forced: false }]);
  assert.deepEqual(parseHlsSegmentUris('#EXTINF:4,\npart-1.vtt\n#EXTINF:4,\npart-2.vtt', 'https://cdn.test/video/captions/en.m3u8'), ['https://cdn.test/video/captions/part-1.vtt', 'https://cdn.test/video/captions/part-2.vtt']);
  assert.deepEqual(parseHlsSegments('#EXTINF:4,\npart-1.vtt\n#EXTINF:5.5,\npart-2.vtt', 'https://cdn.test/video/captions/en.m3u8'), [
    { url: 'https://cdn.test/video/captions/part-1.vtt', start: 0, duration: 4, sequence: 0, discontinuity: 0, targetDuration: 0 },
    { url: 'https://cdn.test/video/captions/part-2.vtt', start: 4, duration: 5.5, sequence: 1, discontinuity: 0, targetDuration: 0 },
  ]);
  assert.deepEqual(parseHlsSegments('#EXTINF:2,\nsame.vtt\n#EXTINF:3,\nsame.vtt\n#EXTINF:4,\nnext.vtt', 'https://cdn.test/video/captions/en.m3u8'), [
    { url: 'https://cdn.test/video/captions/same.vtt', start: 0, duration: 2, sequence: 0, discontinuity: 0, targetDuration: 0 },
    { url: 'https://cdn.test/video/captions/same.vtt', start: 2, duration: 3, sequence: 1, discontinuity: 0, targetDuration: 0 },
    { url: 'https://cdn.test/video/captions/next.vtt', start: 5, duration: 4, sequence: 2, discontinuity: 0, targetDuration: 0 },
  ]);
  assert.deepEqual(parseHlsSegments('#EXT-X-MEDIA-SEQUENCE:40\n#EXT-X-TARGETDURATION:6\n#EXTINF:4,\na.vtt\n#EXT-X-DISCONTINUITY\n#EXTINF:5,\nb.vtt', 'https://cdn.test/live.m3u8')
    .map(({ sequence, discontinuity, targetDuration }) => ({ sequence, discontinuity, targetDuration })), [
    { sequence: 40, discontinuity: 0, targetDuration: 6 },
    { sequence: 41, discontinuity: 1, targetDuration: 6 },
  ]);
  assert.deepEqual(parseHlsSegments('#EXT-X-TARGETDURATION:6\nfirst.vtt\nsecond.vtt', 'https://cdn.test/live.m3u8')
    .map(({ start, duration }) => ({ start, duration })), [
    { start: 0, duration: 6 },
    { start: 6, duration: 6 },
  ]);
  assert.deepEqual(parseHlsSegments('#EXTINF:2,\n#EXT-X-BYTERANGE:100@50\nshared.bin\n#EXTINF:2,\n#EXT-X-BYTERANGE:80\nshared.bin', 'https://cdn.test/live.m3u8')
    .map(({ url, byteRange }) => ({ url, byteRange })), [
    { url: 'https://cdn.test/shared.bin', byteRange: { start: 50, end: 149 } },
    { url: 'https://cdn.test/shared.bin', byteRange: { start: 150, end: 229 } },
  ]);
  assert.deepEqual(parseHlsSegments('#EXTINF:2,\n#EXT-X-BYTERANGE:100@50\na.bin\n#EXTINF:2,\n#EXT-X-BYTERANGE:80\nb.bin', 'https://cdn.test/live.m3u8')
    .map(({ url, byteRange }) => ({ url, byteRange })), [
    { url: 'https://cdn.test/a.bin', byteRange: { start: 50, end: 149 } },
    { url: 'https://cdn.test/b.bin', byteRange: { start: 0, end: 79 } },
  ]);
  assert.deepEqual(parseHlsSegments('#EXT-X-MAP:URI="init.mp4",BYTERANGE="900@20"\n#EXTINF:2,\npart-1.m4s',
    'https://cdn.test/subs/index.m3u8')[0], {
    url: 'https://cdn.test/subs/part-1.m4s', start: 0, duration: 2, sequence: 0,
    discontinuity: 0, targetDuration: 0, initializationUrl: 'https://cdn.test/subs/init.mp4',
    initializationByteRange: { start: 20, end: 919 },
  });
  assert.deepEqual(parseHlsSegments(
    '#EXT-X-MAP:URI="init.mp4",BYTERANGE="100@20"\n#EXTINF:2,\npart-1.m4s\n#EXT-X-MAP:URI="init.mp4",BYTERANGE="50"\n#EXTINF:2,\npart-2.m4s',
    'https://cdn.test/subs/index.m3u8').map(({ initializationByteRange }) => initializationByteRange), [
    { start: 20, end: 119 },
    { start: 120, end: 169 },
  ]);
  assert.equal(isHlsSubtitlePlaylist('#EXTM3U\n#EXTINF:4,\npart-1.vtt', 'https://cdn.test/master.m3u8'), true);
  assert.equal(isHlsSubtitlePlaylist('#EXTM3U\n#EXTINF:4,\nvideo-1.ts', 'https://cdn.test/video.m3u8'), false);
});

test('DASH MPD içindeki doğrudan TTML ve VTT adaptasyonlarını bulur', () => {
  const mpd = '<MPD><Period><AdaptationSet contentType="text" lang="en" mimeType="application/ttml+xml"><Representation id="en"><BaseURL>subs/en.ttml</BaseURL></Representation></AdaptationSet><AdaptationSet contentType="video"><Representation><BaseURL>video.m4s</BaseURL></Representation></AdaptationSet></Period></MPD>';
  assert.deepEqual(parseDashSubtitleTracks(mpd, 'https://cdn.test/movie/manifest.mpd'), [{ url: 'https://cdn.test/movie/subs/en.ttml', language: 'en', label: 'en', format: 'ttml' }]);
  const nested = '<MPD><BaseURL>https://media.test/root/</BaseURL><Period><BaseURL>period/</BaseURL><AdaptationSet contentType="text" lang="tr"><BaseURL>subs/</BaseURL><Representation id="tr"><BaseURL>main.ttml</BaseURL></Representation></AdaptationSet></Period></MPD>';
  assert.equal(parseDashSubtitleTracks(nested, 'https://origin.test/a.mpd')[0].url, 'https://media.test/root/period/subs/main.ttml');
  const selfClosing = '<MPD><Period><AdaptationSet contentType="text" mimeType="text/vtt"><BaseURL>captions.vtt</BaseURL><Representation id="tr"/></AdaptationSet></Period></MPD>';
  assert.deepEqual(parseDashSubtitleTracks(selfClosing, 'https://cdn.test/movie/manifest.mpd'), [
    { url: 'https://cdn.test/movie/captions.vtt', language: '', label: 'tr', format: 'vtt' },
  ]);
});

test('çok dönemli DASH BaseURL değerlerini kardeş Periodlar arasında zincirlemez', () => {
  const mpd = '<MPD><BaseURL>root/</BaseURL>'
    + '<Period><BaseURL>p1/</BaseURL><AdaptationSet contentType="text" lang="en">'
    + '<Representation id="en"><BaseURL>a.vtt</BaseURL></Representation></AdaptationSet></Period>'
    + '<Period><BaseURL>p2/</BaseURL><AdaptationSet contentType="text" lang="tr">'
    + '<Representation id="tr"><BaseURL>b.vtt</BaseURL></Representation></AdaptationSet></Period></MPD>';
  assert.deepEqual(parseDashSubtitleTracks(mpd, 'https://cdn.test/manifest.mpd').map((track) => track.url), [
    'https://cdn.test/root/p1/a.vtt',
    'https://cdn.test/root/p2/b.vtt',
  ]);

  const templated = '<MPD><BaseURL>root/</BaseURL>'
    + '<Period><BaseURL>p1/</BaseURL><AdaptationSet contentType="text">'
    + '<SegmentTemplate media="s-$Number$.m4s" duration="2"/><Representation id="one"/></AdaptationSet></Period>'
    + '<Period><BaseURL>p2/</BaseURL><AdaptationSet contentType="text">'
    + '<SegmentTemplate media="s-$Number$.m4s" duration="2"/><Representation id="two"/></AdaptationSet></Period></MPD>';
  const matchers = parseDashSubtitleMatchers(templated, 'https://cdn.test/manifest.mpd');
  assert.ok(matchDashSubtitleUrl('https://cdn.test/root/p1/s-1.m4s', matchers));
  assert.ok(matchDashSubtitleUrl('https://cdn.test/root/p2/s-1.m4s', matchers));
  assert.equal(matchDashSubtitleUrl('https://cdn.test/root/p1/p2/s-1.m4s', matchers), null);
});

test('DASH parçalı altyazı eşleştiricisi video segmentlerini dışarıda bırakır', () => {
  const mpd = `<MPD><Period><AdaptationSet contentType="video" mimeType="video/mp4"><SegmentTemplate media="video/$Number$.m4s" duration="5000" timescale="1000"/><Representation id="v1"/></AdaptationSet><AdaptationSet contentType="text" lang="en" mimeType="application/mp4" codecs="stpp"><SegmentTemplate media="text/$RepresentationID$/$Number%05d$.m4s" duration="6000" timescale="1000" startNumber="1"/><Representation id="eng" bandwidth="1000"/></AdaptationSet></Period></MPD>`;
  const matchers = parseDashSubtitleMatchers(mpd, 'https://cdn.test/movie/manifest.mpd');
  assert.equal(matchers.length, 1);
  assert.equal(matchDashSubtitleUrl('https://cdn.test/movie/video/2.m4s', matchers), null);
  const subtitle = matchDashSubtitleUrl('https://cdn.test/movie/text/eng/00003.m4s', matchers);
  assert.equal(subtitle.language, 'en');
  assert.equal(dashSegmentOffset(subtitle), 12);
  assert.ok(matchDashSubtitleUrl('https://cdn.test/movie/text/eng/00003.m4s?token=signed', matchers));
  const repTyped = '<MPD><Period><AdaptationSet><SegmentTemplate media="cc/$Number$.m4s"/><Representation id="tr" mimeType="application/ttml+xml"/></AdaptationSet></Period></MPD>';
  assert.equal(parseDashSubtitleMatchers(repTyped, 'https://cdn.test/a.mpd').length, 1);
  const initOnly = '<MPD><Period><AdaptationSet contentType="text" codecs="wvtt"><SegmentTemplate media="cc/$Number$.m4s" initialization="cc/$RepresentationID$/init.mp4"/><Representation id="en"/></AdaptationSet></Period></MPD>';
  const initMatcher = parseDashSubtitleMatchers(initOnly, 'https://cdn.test/movie/a.mpd')[0];
  assert.equal(initMatcher.timescale, 0);
  assert.equal(initMatcher.initializationUrl, 'https://cdn.test/movie/cc/en/init.mp4');
  for (const formatter of ['%d', '%u']) {
    const plain = `<MPD><Period><AdaptationSet contentType="text"><SegmentTemplate media="cc/$Number${formatter}$.m4s"/><Representation id="tr"/></AdaptationSet></Period></MPD>`;
    assert.ok(matchDashSubtitleUrl('https://cdn.test/cc/12.m4s',
      parseDashSubtitleMatchers(plain, 'https://cdn.test/a.mpd')), formatter);
  }
});

test('HLS gömülü CEA-608/708 izini ve bağlı varyantı yakalamaya hazırlar', () => {
  const body = '#EXTM3U\n#EXT-X-MEDIA:TYPE=CLOSED-CAPTIONS,GROUP-ID="cc",NAME="English",LANGUAGE="en",INSTREAM-ID="CC1"\n'
    + '#EXT-X-STREAM-INF:BANDWIDTH=800000,AVERAGE-BANDWIDTH=640000,CODECS="avc1.4d401f,mp4a.40.2",RESOLUTION=640x360,CLOSED-CAPTIONS="cc"\nvideo/low.m3u8\n';
  assert.deepEqual(detectHlsCea608(body), [{ instreamId: 'CC1', language: 'en', name: 'English',
    groupId: 'cc', supported: true, standard: 'cea-608' }]);
  assert.deepEqual(parseHlsVariantStreams(body, 'https://cdn.test/master.m3u8'), [{
    url: 'https://cdn.test/video/low.m3u8', bandwidth: 800000, averageBandwidth: 640000,
    codecs: 'avc1.4d401f,mp4a.40.2', resolution: '640x360', closedCaptionsGroup: 'cc',
  }]);
  assert.deepEqual(detectHlsCea608('#EXTM3U\n#EXT-X-MEDIA:TYPE=SUBTITLES,URI="sub.vtt"'), []);
});

test('HLS AES-128 anahtarını yalnız takip eden segmentlere taşır ve NONE ile temizler', () => {
  const body = '#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:7\n'
    + '#EXT-X-KEY:METHOD=AES-128,URI="keys/k.bin",IV=0x00000000000000000000000000000007\n'
    + '#EXTINF:6,\na.ts\n#EXT-X-KEY:METHOD=NONE\n#EXTINF:6,\nb.ts\n';
  const segments = parseHlsSegments(body, 'https://cdn.test/v/list.m3u8');
  assert.deepEqual(segments[0].encryption, {
    method: 'AES-128', keyUrl: 'https://cdn.test/v/keys/k.bin',
    iv: '0x00000000000000000000000000000007',
  });
  assert.equal(segments[0].sequence, 7);
  assert.equal(segments[1].encryption, undefined);
});

test('HLS AES-128 anahtarı şifreli fMP4 başlangıç parçasına ayrı kapsamla taşınır', () => {
  const body = '#EXTM3U\n#EXT-X-MEDIA-SEQUENCE:12\n'
    + '#EXT-X-KEY:METHOD=AES-128,URI="keys/init.bin",IV=0x0c\n'
    + '#EXT-X-MAP:URI="init.mp4"\n'
    + '#EXT-X-KEY:METHOD=NONE\n#EXTINF:6,\npart-12.m4s\n';
  const segment = parseHlsSegments(body, 'https://cdn.test/v/list.m3u8')[0];
  assert.deepEqual(segment.initializationEncryption, {
    method: 'AES-128', keyUrl: 'https://cdn.test/v/keys/init.bin', iv: '0x0c',
  });
  assert.equal(segment.encryption, undefined);
});

test('DASH SegmentList altyazı parçalarını tek iz ve doğru sıra ofsetiyle eşleştirir', () => {
  const mpd = '<MPD><Period><AdaptationSet contentType="text" lang="tr" codecs="wvtt">'
    + '<Representation id="std"><BaseURL>subs/</BaseURL><SegmentList timescale="1000" duration="2000" startNumber="5">'
    + '<Initialization sourceURL="init.mp4"/><SegmentURL media="a.m4s"/><SegmentURL media="b.m4s"/>'
    + '</SegmentList></Representation></AdaptationSet></Period></MPD>';
  const matchers = parseDashSubtitleMatchers(mpd, 'https://cdn.test/movie/manifest.mpd');
  assert.equal(matchers.length, 2);
  const second = matchDashSubtitleUrl('https://cdn.test/movie/subs/b.m4s?token=x', matchers);
  assert.equal(second.segmentValue, 6);
  assert.equal(dashSegmentOffset(second), 2);
  assert.equal(second.initializationUrl, 'https://cdn.test/movie/subs/init.mp4');
  assert.equal(matchers[0].streamKey, matchers[1].streamKey);
});

test('Segment zaman kararı mutlak cueyu ikinci kez kaydırmaz', () => {
  assert.equal(cuesUseLocalSegmentTimeline([{ start: 0.25, end: 3, text: 'Yerel' }], 6, 12), true);
  assert.equal(cuesUseLocalSegmentTimeline([{ start: 3.5, end: 5.8, text: 'Müzikten sonra' }], 6, 12), true);
  assert.equal(cuesUseLocalSegmentTimeline([{ start: 6.1, end: 9, text: 'Mutlak' }], 6, 6), false);
  assert.equal(cuesUseLocalSegmentTimeline([{ start: 4, end: 7.5, text: 'Mutlak HLS' }], 4, 4), false);
});

test('Aynı anda etkin olan çakışan altyazıların tamamını korur', () => {
  const cues = [
    { start: 1, end: 4, text: 'Konuşmacı bir' },
    { start: 2, end: 5, text: 'Konuşmacı iki' },
    { start: 6, end: 7, text: 'Sonraki' },
  ];
  assert.deepEqual(browserActiveCuesAt(cues, 3).map((cue) => cue.text),
    ['Konuşmacı bir', 'Konuşmacı iki']);
  assert.deepEqual(browserActiveCuesAt(cues, 5.5), []);
});

test('DASH base URL çözülemediğinde boş adresli sahte iz üretmez', () => {
  const mpd = '<MPD><Period><AdaptationSet mimeType="application/ttml+xml"><Representation id="tr"><BaseURL>subs/tr.ttml</BaseURL></Representation></AdaptationSet></Period></MPD>';
  assert.deepEqual(parseDashSubtitleTracks(mpd, ''), []);
});

test('bitiş anında eski cue kapanır ve yalnız komşu cue etkin kalır', () => {
  const cues = [
    { start: 0, end: 2, text: 'Eski' },
    { start: 2, end: 4, text: 'Yeni' },
  ];
  assert.deepEqual(browserActiveCuesAt(cues, 2).map((cue) => cue.text), ['Yeni']);
});

test('64 kısa cue gerisindeki uzun süreli aktif altyazıyı kaybetmez', () => {
  const cues = [{ start: 0, end: 100, text: 'Uzun açıklama' }]
    .concat(Array.from({ length: 80 }, (_, index) => ({
      start: index + 1, end: index + 1.2, text: `Kısa ${index}`,
    })));
  assert.deepEqual(browserActiveCuesAt(cues, 81).map((cue) => cue.text), ['Uzun açıklama']);
});

test('canlı cue dizisi sona büyürken prefix önbelleğini artımlı genişletir', () => {
  let endReads = 0;
  const cue = (start, end, text) => ({
    start, text,
    get end() { endReads++; return end; },
  });
  const cues = Array.from({ length: 1000 }, (_, index) => cue(index, index + .75, String(index)));
  browserActiveCuesAt(cues, 999.5);
  const initialReads = endReads;
  cues.push(cue(1000, 1000.75, 'yeni'));
  browserActiveCuesAt(cues, 1000.5);
  assert(initialReads >= 1000);
  assert(endReads - initialReads < 12, 'sona ekleme bütün prefix dizisini yeniden kurdu');
});

test('DASH wvtt MP4 örneklerini gerçek trun zamanlarıyla ayrıştırır', () => {
  const box = (type, payload) => {
    const head = Buffer.alloc(8); head.writeUInt32BE(payload.length + 8); head.write(type, 4, 4, 'ascii');
    return Buffer.concat([head, payload]);
  };
  const full = (flags, payload, version = 0) => {
    const head = Buffer.alloc(4); head[0] = version; head.writeUIntBE(flags, 1, 3);
    return Buffer.concat([head, payload]);
  };
  const cueSample = (text) => box('vttc', box('payl', Buffer.from(text, 'utf-8')));
  const first = cueSample('Bir'); const second = cueSample('İki');
  const tfhdPayload = Buffer.alloc(4); tfhdPayload.writeUInt32BE(1);
  const tfdtPayload = Buffer.alloc(4); tfdtPayload.writeUInt32BE(6000);
  const rows = Buffer.alloc(4 + 2 * 8); rows.writeUInt32BE(2);
  rows.writeUInt32BE(2000, 4); rows.writeUInt32BE(first.length, 8);
  rows.writeUInt32BE(2000, 12); rows.writeUInt32BE(second.length, 16);
  const traf = box('traf', Buffer.concat([
    box('tfhd', full(0, tfhdPayload)), box('tfdt', full(0, tfdtPayload)), box('trun', full(0x300, rows)),
  ]));
  const fragment = Buffer.concat([box('moof', traf), box('mdat', Buffer.concat([first, second]))]);
  assert.deepEqual(parseMp4WebVtt(fragment, { timescale: 1000 }), [
    { start: 6, end: 8, text: 'Bir' }, { start: 8, end: 10, text: 'İki' },
  ]);
  const mdhd = Buffer.alloc(20); mdhd.writeUInt32BE(1000, 12);
  const init = box('moov', box('trak', box('mdia', box('mdhd', mdhd))));
  assert.equal(parseMp4Timescale(init), 1000);
  const mvhd = Buffer.alloc(20); mvhd.writeUInt32BE(48000, 12);
  const movieOnlyInit = box('moov', box('mvhd', mvhd));
  assert.equal(parseMp4Timescale(movieOnlyInit), 48000);
  const movieAndTrackInit = box('moov', Buffer.concat([
    box('mvhd', mvhd), box('trak', box('mdia', box('mdhd', mdhd))),
  ]));
  assert.equal(parseMp4Timescale(movieAndTrackInit), 1000);
  const track = (trackId, timescale, handler) => {
    const tkhd = Buffer.alloc(16); tkhd.writeUInt32BE(trackId, 12);
    const trackMdhd = Buffer.alloc(20); trackMdhd.writeUInt32BE(timescale, 12);
    const hdlr = Buffer.alloc(12); hdlr.write(handler, 8, 4, 'ascii');
    return box('trak', Buffer.concat([
      box('tkhd', tkhd), box('mdia', Buffer.concat([box('mdhd', trackMdhd), box('hdlr', hdlr)])),
    ]));
  };
  const multiTrackInit = box('moov', Buffer.concat([
    track(1, 90000, 'vide'), track(2, 1000, 'text'),
  ]));
  assert.equal(parseMp4Timescale(multiTrackInit), 1000,
    'çok kanallı init segmentinde video değil altyazı zaman ölçeği seçilmeli');
  const subtitleTfhdPayload = Buffer.alloc(4); subtitleTfhdPayload.writeUInt32BE(2);
  const subtitleTraf = box('traf', Buffer.concat([
    box('tfhd', full(0, subtitleTfhdPayload)), box('tfdt', full(0, tfdtPayload)),
    box('trun', full(0x300, rows)),
  ]));
  assert.deepEqual(parseMp4WebVtt(Buffer.concat([
    multiTrackInit, box('moof', subtitleTraf), box('mdat', Buffer.concat([first, second])),
  ]), {}), [
    { start: 6, end: 8, text: 'Bir' }, { start: 8, end: 10, text: 'İki' },
  ]);
  assert.deepEqual(parseMp4WebVtt(fragment, {}), []);
  const secondTfdt = Buffer.alloc(4); secondTfdt.writeUInt32BE(10000);
  const secondRows = Buffer.alloc(12); secondRows.writeUInt32BE(1);
  secondRows.writeUInt32BE(1000, 4); secondRows.writeUInt32BE(first.length, 8);
  const secondTraf = box('traf', Buffer.concat([
    box('tfhd', full(0, tfhdPayload)), box('tfdt', full(0, secondTfdt)), box('trun', full(0x300, secondRows)),
  ]));
  const twoFragments = Buffer.concat([
    fragment,
    box('moof', secondTraf), box('mdat', first),
  ]);
  assert.deepEqual(parseMp4WebVtt(twoFragments, { timescale: 1000 }), [
    { start: 6, end: 8, text: 'Bir' }, { start: 8, end: 10, text: 'İki' },
    { start: 10, end: 11, text: 'Bir' },
  ]);

  const trexPayload = Buffer.alloc(20);
  trexPayload.writeUInt32BE(1, 0); // track_ID
  trexPayload.writeUInt32BE(1, 4); // default_sample_description_index
  trexPayload.writeUInt32BE(2000, 8);
  trexPayload.writeUInt32BE(first.length, 12);
  const initWithDefaults = box('moov', box('mvex', box('trex', full(0, trexPayload))));
  const sampleDefaults = parseMp4SampleDefaults(initWithDefaults);
  assert.deepEqual(sampleDefaults, { 1: { duration: 2000, size: first.length } });
  const defaultRows = Buffer.alloc(4); defaultRows.writeUInt32BE(1);
  const defaultTraf = box('traf', Buffer.concat([
    box('tfhd', full(0, tfhdPayload)), box('tfdt', full(0, tfdtPayload)), box('trun', full(0, defaultRows)),
  ]));
  assert.deepEqual(parseMp4WebVtt(Buffer.concat([box('moof', defaultTraf), box('mdat', first)]), {
    timescale: 1000, sampleDefaults,
  }), [{ start: 6, end: 8, text: 'Bir' }]);

  // trun data_offset örnek yükünü mdat başından değil moof tabanından
  // işaretleyebilir; mdat içindeki dolgu altyazı olarak okunmamalıdır.
  const offsetRows = Buffer.alloc(4 + 4 + 8); offsetRows.writeUInt32BE(1);
  offsetRows.writeInt32BE(0, 4); // moof uzunluğu bilindikten sonra yamalanacak
  offsetRows.writeUInt32BE(1000, 8); offsetRows.writeUInt32BE(first.length, 12);
  const offsetTraf = box('traf', Buffer.concat([
    box('tfhd', full(0, tfhdPayload)), box('tfdt', full(0, tfdtPayload)),
    box('trun', full(0x301, offsetRows)),
  ]));
  const offsetMoof = box('moof', offsetTraf);
  const padding = Buffer.from('not-a-vtt-sample');
  // data_offset kutu başındaki moof konumuna görelidir; mdat başlığını da geçer.
  offsetRows.writeInt32BE(offsetMoof.length + 8 + padding.length, 4);
  const patchedTraf = box('traf', Buffer.concat([
    box('tfhd', full(0, tfhdPayload)), box('tfdt', full(0, tfdtPayload)),
    box('trun', full(0x301, offsetRows)),
  ]));
  const offsetFragment = Buffer.concat([
    box('moof', patchedTraf), box('mdat', Buffer.concat([padding, first])),
  ]);
  assert.deepEqual(parseMp4WebVtt(offsetFragment, { timescale: 1000 }), [
    { start: 6, end: 7, text: 'Bir' },
  ]);

  const emptyRows = Buffer.alloc(4 + 2 * 8); emptyRows.writeUInt32BE(2);
  emptyRows.writeUInt32BE(2000, 4); emptyRows.writeUInt32BE(0, 8);
  emptyRows.writeUInt32BE(2000, 12); emptyRows.writeUInt32BE(first.length, 16);
  const emptyTraf = box('traf', Buffer.concat([
    box('tfhd', full(0, tfhdPayload)), box('tfdt', full(0, tfdtPayload)), box('trun', full(0x300, emptyRows)),
  ]));
  assert.deepEqual(parseMp4WebVtt(Buffer.concat([box('moof', emptyTraf), box('mdat', first)]), {
    timescale: 1000,
  }), [{ start: 8, end: 10, text: 'Bir' }]);
});

test('DASH stpp MP4 örneklerini sample zamanına taşıyarak ayrıştırır', () => {
  const box = (type, payload) => {
    const head = Buffer.alloc(8); head.writeUInt32BE(payload.length + 8); head.write(type, 4, 4, 'ascii');
    return Buffer.concat([head, payload]);
  };
  const full = (flags, payload, version = 0) => {
    const head = Buffer.alloc(4); head[0] = version; head.writeUIntBE(flags, 1, 3);
    return Buffer.concat([head, payload]);
  };
  const xml = Buffer.from('<?xml version="1.0"?><tt xmlns="http://www.w3.org/ns/ttml"><body><div><p begin="0s" end="2s">Merhaba <span>dünya</span></p></div></body></tt>', 'utf8');
  const tfhdPayload = Buffer.alloc(4); tfhdPayload.writeUInt32BE(3);
  const tfdtPayload = Buffer.alloc(4); tfdtPayload.writeUInt32BE(12000);
  const rows = Buffer.alloc(12); rows.writeUInt32BE(1);
  rows.writeUInt32BE(2000, 4); rows.writeUInt32BE(xml.length, 8);
  const traf = box('traf', Buffer.concat([
    box('tfhd', full(0, tfhdPayload)), box('tfdt', full(0, tfdtPayload)), box('trun', full(0x300, rows)),
  ]));
  const fragment = Buffer.concat([box('moof', traf), box('mdat', xml)]);
  assert.deepEqual(parseMp4Stpp(fragment, { timescale: 1000 }), [
    { start: 12, end: 14, text: 'Merhaba dünya' },
  ]);
  assert.deepEqual(parseMp4Stpp(Buffer.concat([box('moof', traf), box('mdat', xml.subarray(0, 24))]), {
    timescale: 1000,
  }), [], 'yarım mdat/XML sessizce yanlış cue üretmemeli');
});

test('JSON manifest içindeki timed-text URLlerini false positive üretmeden bulur', () => {
  const body = JSON.stringify({ movieId: 'x', timedtexttracks: [{ language: 'en', url: '/text/en.ttml' }], image: '/poster.jpg' });
  assert.deepEqual(findSubtitleUrls(body, 'https://media.test/playback/manifest'), ['https://media.test/text/en.ttml']);
  const huluPlaylist = JSON.stringify({
    transcripts_urls: { webvtt: { en: 'https://cdn.test/signed/english?token=private' } },
  });
  assert.deepEqual(findSubtitleUrls(huluPlaylist, 'https://play.hulu.com/v6/playlist'),
    ['https://cdn.test/signed/english?token=private']);
  assert.deepEqual(findSubtitleUrls('{"status":"ok","url":"/api/profile"}', 'https://media.test/'), []);
  assert.deepEqual(findSubtitleUrls(JSON.stringify({ language: 'en', value: 'en/US' }), 'https://media.test/'), []);
  assert.deepEqual(findSubtitleUrls(JSON.stringify({ caption: 'captions/en.vtt' }), 'https://media.test/'),
    ['https://media.test/captions/en.vtt']);
});

test('altyazı alanındaki uzantısız göreli REST yolunu çözer', () => {
  assert.deepEqual(findSubtitleUrls(JSON.stringify({ subtitles: { url: 'api/v1/subtitles?track=tr' } }),
    'https://player.test/watch/1'), ['https://player.test/watch/api/v1/subtitles?track=tr']);
  assert.deepEqual(findSubtitleUrls(JSON.stringify({ title: 'api/v1/not-a-resource?x=1' }),
    'https://player.test/watch/1'), []);
});

test('ASS, SAMI ve LRC metinleri ortak cue modeline dönüştürür', () => {
  assert.deepEqual(parseAss('[Events]\nDialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\i1}Merhaba\\N dünya'), [{ start: 1, end: 3, text: 'Merhaba\ndünya' }]);
  assert.equal(parseSami('<SAMI><SYNC Start=1000><P>Bir</P><SYNC Start=3000><P>İki</P></SYNC>').length, 2);
  assert.deepEqual(parseLrc('[00:01.00]Bir\n[00:03.00]İki').map((cue) => cue.start), [1, 3]);
  assert.deepEqual(parseLrc('[00:01.00]Bir\n[00:03.00]İki').map((cue) => cue.end), [3, 8]);
  assert.deepEqual(parseLrc('[01:02:03.50]Saatli\n[01:02:20.00]Sonraki'), [
    { start: 3723.5, end: 3730.5, text: 'Saatli' },
    { start: 3740, end: 3745, text: 'Sonraki' },
  ]);
  assert.deepEqual(parseSami('<SAMI><SYNC Start=1000><P>Bir<P>İki<SYNC Start=3000><P>Üç</SAMI>')[0].text,
    'Bir\nİki');
});

test('ASS yalnız Events bölümüyle tanınır; yorum ve sabit boşlukları temizlenir', () => {
  const result = parseSubtitlePayload('[Events]\nDialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,Merhaba{çevirmen notu}\\h dünya',
    'text/plain', 'https://cdn.test/subtitle.data');
  assert.equal(result.format, 'ass');
  assert.deepEqual(result.cues, [{ start: 1, end: 3, text: 'Merhaba dünya' }]);
});

test('ASS Events Format alan sırası değiştiğinde zaman ve metni korur', () => {
  const cues = parseAss('[Events]\nFormat: Style, End, Layer, Start, Text\nDialogue: Default,0:00:04.50,0,0:00:02.00,Merhaba, dünya');
  assert.deepEqual(cues, [{ start: 2, end: 4.5, text: 'Merhaba, dünya' }]);
});

test('ASS vektör çizimini konuşma metnine dönüştürmez', () => {
  const cues = parseAss('[Events]\nDialogue: 0,0:00:01.00,0:00:03.00,Default,,0,0,0,,{\\p1}m 0 0 l 100 0 100 50{\\p0}Merhaba');
  assert.deepEqual(cues, [{ start: 1, end: 3, text: 'Merhaba' }]);
});

test('Tarayıcı geri/ileri durumu yeni Electron API ve eski API ile güvenli okunur', () => {
  const modern = browserNavigationCapabilities({
    navigationHistory: {
      canGoBack: () => true,
      canGoForward: () => false,
    },
    canGoBack: () => false,
    canGoForward: () => true,
  });
  assert.deepEqual(modern, { canGoBack: true, canGoForward: false });

  const legacy = browserNavigationCapabilities({
    canGoBack: () => false,
    canGoForward: () => true,
  });
  assert.deepEqual(legacy, { canGoBack: false, canGoForward: true });

  const unavailable = browserNavigationCapabilities({
    navigationHistory: { canGoBack: () => { throw new Error('hazır değil'); } },
  });
  assert.deepEqual(unavailable, { canGoBack: false, canGoForward: false });
});

test('Tarayıcı modu IPC ve güvenlik sınırları üç katmanda bağlıdır', async () => {
  const root = path.join(__dirname, '..', 'src');
  const main = fs.readFileSync(path.join(root, 'main.js'), 'utf8');
  const overlayController = fs.readFileSync(path.join(root, 'browser-overlay-controller.js'), 'utf8');
  const browserPreload = fs.readFileSync(path.join(root, 'browser-preload.js'), 'utf8');
  const preload = fs.readFileSync(path.join(root, 'preload.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(root, 'renderer', 'renderer.js'), 'utf8');
  const html = fs.readFileSync(path.join(root, 'renderer', 'index.html'), 'utf8');
  const extractFunction = (name, nextName) => new Function(
    `${main.slice(main.indexOf(`function ${name}(`), main.indexOf(`function ${nextName}(`))}; return ${name};`,
  )();
  const normalizeAddress = extractFunction('normalizeBrowserUrl', 'browserPopupWindowOptions');
  assert.equal(normalizeAddress('localhost:8080/video'), 'http://localhost:8080/video');
  assert.equal(normalizeAddress('example.com/video'), 'https://example.com/video');
  assert.equal(normalizeAddress('https://guvenli.test@kotu.invalid/video'), null);
  assert.equal(normalizeAddress('https://user:secret@example.test/video'), null);
  const streamKey = extractFunction('browserTrackStreamKey', 'browserWatchMediaId');
  assert.equal(streamKey('https://cdn.test/captions.vtt?seq=1&lang=tr'),
    streamKey('https://cdn.test/captions.vtt?seq=2&lang=tr'));
  assert.match(html, /base-uri 'none'; object-src 'none'; form-action 'none'/);
  assert.match(main, /new WebContentsView/);
  assert.match(main, /app\.commandLine\.appendSwitch\('disable-quic'\)/);
  assert.match(main, /partition: BROWSER_PARTITION/);
  assert.match(main, /BROWSER_PARTITION = 'persist:whisper-browser'/);
  const shutdownCalls = [];
  await require('../src/browser-session-privacy').shutdownBrowserSession({
    closeAllConnections: async () => shutdownCalls.push('close'),
    flushStorageData: () => shutdownCalls.push('storage'),
    cookies: { flushStore: async () => shutdownCalls.push('cookies') },
  });
  assert.deepEqual(shutdownCalls, ['close', 'storage', 'cookies']);
  assert.match(main, /await flushBrowserSession\(\)/);
  assert.match(main, /nodeIntegration: false/);
  assert.match(main, /contextIsolation: true/);
  assert.match(main, /sandbox: true/);
  assert.match(main, /ipcMain\.handle\('browser:navigate'/);
  assert.match(main, /async function scanMediaFromPaths/);
  // R51-27: kardeş dosya taraması maxDepth:1 kullanır (0'da walk hemen çıkar → liste hep boş).
  assert.match(main, /maxDepth: 1, maxResults: 5000/);
  assert.match(main, /yt-dlp güncellemesi 10 dakika içinde tamamlanmadı/);
  assert.match(main, /parseHlsSubtitleTracks/);
  assert.match(main, /headers: \{ Range: `bytes=\$\{byteRange\.start\}-\$\{byteRange\.end\}` \}/);
  assert.match(main, /segment\.initializationUrl/);
  assert.match(main, /parseMp4WebVtt\(partBuffer, matcher\)/);
  assert.match(main, /fetchBrowserBufferWithRetry\(segment\.initializationUrl[\s\S]{0,160}range\)/);
  assert.match(main, /const manifestHandled = !manifestRetryNeeded[\s\S]{0,100}ceaMatcherCount > 0/);
  assert.match(main, /matchHlsCeaSegmentUrl\(response\.url, browserHlsCeaSegmentMatchers,[\s\S]{0,120}response\.headers, \{ seen: !!requestInfo/);
  // R51-17/A2: isteğin Range başlığı requestWillBeSent'te saklanır ve yanıt
  // Content-Range taşımadığında eşleyiciye verilir; belirsizlikte eşleşme reddedilir.
  assert.match(main, /method === 'Network\.requestWillBeSent'/);
  assert.match(main, /browserRequestRanges\.set\(`\$\{sessionId \|\| 'root'\}:\$\{params\.requestId\}`, \{ range \}\)/);
  assert.match(main, /captureBrowserHlsCeaSegment\(responseBuffer, candidate, context\)/);
  assert.match(main, /findSubtitleUrls/);
  assert.match(main, /Network\.responseReceived/);
  assert.match(main, /Target\.setAutoAttach/);
  assert.match(main, /browserCaptureHookScript/);
  assert.match(main, /browserCaptureAckScript/);
  assert.match(main, /browserCaptureReleaseScript/);
  assert.match(main, /browserCaptureResetScript/);
  assert.match(main, /bodyFingerprint\(sample\)/);
  assert.match(main, /shouldRetryCaptureResponseBody\(candidate\)/);
  assert.match(main, /__whisperCaptureInFlight instanceof Map/);
  assert.match(main, /now - leasedAt <= 15000/);
  assert.match(main, /lease\.deliveryId !== receipt\.deliveryId/);
  assert.match(main, /window\.__whisperCaptureQueue\.length > 128/);
  assert.match(main, /captureOutcomeStatus\(outcome\) === CAPTURE_RETRY/);
  assert.ok(main.indexOf('const outcome = await processBrowserCapturedPayload')
    < main.indexOf('(captureOutcomeStatus(outcome) === CAPTURE_RETRY'),
  'ack kararı payload işlenmeden veriliyor');
  assert.match(main, /browserManifestTransactions\.begin/);
  assert.match(main, /fetchBrowserTextWithRetry/);
  assert.match(main, /manifestRetryNeeded = true/);
  assert.match(main, /browserManifestTransactions\.commit\(transaction\)/);
  assert.match(main, /!\[CAPTURE_RETRY, CAPTURE_ABANDONED\]\.includes\(captureOutcomeStatus\(outcome\)\)/);
  assert.match(main, /browserTrackPendingPublications\.has\(streamKey\)/);
  assert.match(main, /browserDashSubtitleMatchers\[existingIndex\]/);
  assert.match(main, /const bodyBase64 = String\(entry\.bodyBase64/);
  assert.match(main, /\(!body && !bodyBase64\)/);
  assert.match(main, /processBrowserCapturedPayload/);
  assert.match(main, /capture-status/);
  assert.match(main, /\.framesInSubtree/);
  assert.match(main, /node\.shadowRoot/);
  assert.match(main, /executeBrowserTrustedMain\(browserView, browserOverlayScript/);
  assert.match(main, /executeJavaScriptInIsolatedWorld/);
  assert.match(browserPreload, /ipcRenderer\.send\('browser:trusted-bridge'/);
  assert.match(overlayController, /document\.fullscreenElement/);
  assert.match(overlayController, /fullscreenchange/);
  assert.match(overlayController, /state\.offset/);
  assert.match(main, /browserManifestTransactions = new ManifestTransactionRegistry/);
  assert.match(main, /requestMediaKeySystemAccess\('com\.widevine\.alpha'/);
  assert.match(main, /components\.whenReady\(\)/);
  assert.match(main, /waitForProtectedPlayback\(url\)/);
  assert.match(main, /type: 'drm-wait'/);
  assert.match(main, /widevineReadinessPromise = readiness/);
  assert.match(main, /setUserAgent\(sanitizeBrowserUserAgent\(/);
  assert.match(main, /type: 'playback-diagnostics'/);
  assert.doesNotMatch(main, /browserDrmFailureMessage\(rawMsg\)/);
  assert.match(main, /require\('\.\/browser-drm'\)/);
  assert.match(main, /matchDashSubtitleUrl/);
  assert.match(main, /parseMp4Timescale\(init\)/);
  assert.match(main, /parseMp4SampleDefaults\(init\)/);
  assert.match(main, /ev\.type === 'subs'[\s\S]{0,100}subtitleFileAccess\.grant\(ev\.path\)/);
  assert.match(main, /subtitleFileAccess\.grant\(outputPath\)/);
  assert.match(main, /browserNavigationCapabilities\(wc\)/);
  assert.match(main, /type: 'load-error'[\s\S]*browserNavigationState(?:ForTab)?\([^)]*\{ loading: false \}\)/);
  assert.match(main, /ERR_NETWORK_ACCESS_DENIED/);
  assert.match(main, /Proton VPN ayrılmış tünellemesinde/);
  assert.match(main, /overrideBrowserWindowOptions: browserPopupWindowOptions\(\)/);
  assert.doesNotMatch(main, /setTimeout\(\(\) => wc\.loadURL\(safe\)/);
  assert.match(main, /'frame-step', 'speed'/);
  assert.match(main, /updatedAt: Date\.now\(\)/);
  assert.match(main, /browser:places:list/);
  assert.match(main, /browser:places:toggleBookmark/);
  assert.match(main, /browser:places:clearHistory/);
  assert.match(main, /browser:cookies:clearSite/);
  assert.match(main, /browser:cookies:clearAll/);
  const { clearAllBrowserCookies } = require('../src/browser-session-privacy');
  let valuesRead = false;
  const maintenance = [];
  const cleared = await clearAllBrowserCookies({
    closeAllConnections: async () => maintenance.push('close'),
    clearData: async options => maintenance.push(['clear', options]),
    cookies: {
      get: async () => { valuesRead = true; return []; },
      flushStore: async () => maintenance.push('flush'),
    },
  });
  assert.equal(cleared.ok, true);
  assert.equal(valuesRead, false);
  assert.deepEqual(maintenance, [
    'close',
    ['clear', { dataTypes: ['cookies'] }],
    'flush',
  ]);
  assert.match(main, /clearAllBrowserCookiesInSession\(browserSession\)/);
  assert.match(main, /trackBrowserSessionMutation/);
  assert.match(main, /shutdownPersistentBrowserSession/);
  assert.match(main, /browser:session:reset/);
  assert.match(main, /mergeBrowserStreamCues\(previous, normalized, 20000\)/);
  assert.match(main, /browser:subtitle:export/);
  assert.match(main, /rememberBrowserVisit\(wc\.getURL\(\)/);
  assert.match(main, /let browserSessionLastWriteAt = 0/);
  assert.match(main, /restoreEnabled:\s*browserSessionRestoreEnabled,[\s\S]{0,900}tabs:\s*browserTabsSnapshot\(\)/,
    'geri yuklemeyi kapatmak mevcut sekme anlik goruntulerini diskte silmemeli');
  assert.match(main, /effectiveDelay = elapsed >= 10_000 \? 0/);
  assert.match(main, /let browserPlacesCache = null/);
  assert.match(main, /setTimeout\(\(\) => flushBrowserPlaces\(\), 400\)/);
  const quitStart = main.indexOf("app.on('before-quit'");
  const quitEnd = main.indexOf("\n});", quitStart);
  assert(quitStart >= 0 && quitEnd > quitStart);
  assert.match(main.slice(quitStart, quitEnd), /flushBrowserPlaces\(\)/);
  assert.match(main, /for \(const candidate of \[primary, `\$\{primary\}\.bak`\]\)/,
    'bozuk browser places dosyasi yedekten kurtarilmiyor');
  assert.match(main, /JSON\.parse\(fs\.readFileSync\(primary, 'utf8'\)\)[\s\S]{0,240}fs\.copyFileSync\(primary, backup\)/,
    'browser places yazimindan once yalniz gecerli ana dosya yedeklenmiyor');
  assert.match(main, /type: 'places-save-error'/,
    'browser places yazma hatasi renderer tarafina bildirilmiyor');
  assert.match(renderer, /event\.type === 'places-save-error'/,
    'browser places yazma hatasi kullaniciya gosterilmiyor');
  assert.match(main, /const cueList = track\.cues \|\| null[\s\S]{0,1600}previous\.fingerprint === fingerprint[\s\S]{0,300}const list = Array\.from/,
    'HTML5 iz probu tum cue degisikliklerini parmak iziyle izlemiyor');
  assert(main.indexOf('image = await tab.view.webContents.capturePage()')
    < main.indexOf('const result = await dialog.showSaveDialog(mainWindow', main.indexOf('async function saveBrowserPageCapture')),
  'sayfa görüntüsü kayıt diyaloğundan sonra alınıyor');
  assert.match(main, /type: 'popup-opened', host: decision\.hostname \|\| '', capture: false/);
  assert.match(main, /did-create-window[\s\S]{0,180}configureBrowserPopup\(popup, tab, details\)/);
  assert.match(main, /function configureBrowserPopup[\s\S]{0,700}setUserAgent\(sanitizeBrowserUserAgent/);
  assert.match(main, /if \(count < 1\) continue/);
  assert.match(main, /const prior = browserOverlay \|\| tab\.overlay/);
  assert.match(preload, /navigateBrowser:/);
  assert.match(preload, /onBrowserEvent:/);
  assert.match(preload, /listBrowserPlaces:/);
  assert.match(preload, /toggleBrowserBookmark:/);
  assert.match(preload, /resetBrowserSession:/);
  assert.match(preload, /clearBrowserSiteCookies:/);
  assert.match(preload, /clearBrowserCookies:/);
  assert.match(preload, /exportBrowserSubtitle:/);
  assert.match(renderer, /function setWorkspaceMode/);
  assert.match(renderer, /offset: player\.offset/);
  assert.match(renderer, /scheduleActiveBrowserTrackRefresh/);
  assert.match(renderer, /waitForBrowserTrackStable/);
  assert.match(renderer, /opts\.language = browserLanguage/);
  assert.match(renderer, /browserSourceCueCount/);
  assert.doesNotMatch(renderer, /attempt < 120/);
  assert.match(renderer, /selectedBefore \|\| event\.track\.id/);
  assert.match(renderer, /preserveInspector/);
  assert.match(renderer, /function renderBrowserPlaces/);
  assert.match(renderer, /browserPlacesSeq/);
  assert.match(renderer, /browserAddressSuggestions/);
  assert.match(renderer, /browserBookmarkToggle/);
  assert.match(renderer, /function renderBrowserDiagnostics/);
  assert.match(renderer, /function updateBrowserTabPresentation/);
  assert.match(renderer, /updateBrowserTabPresentation\(tab\)[\s\S]{0,80}return/);
  assert.match(renderer, /browserAdapterPluginErrors/);
  assert.match(html, /id="workspaceBrowserMode"/);
  assert.match(html, /id="browserTrackTranslate"/);
  assert.match(html, /id="browserDiagnosticsPanel"/);
  assert.match(html, /id="browserAdapterPluginErrors"/);
  assert.match(html, /id="browserPlacesPanel"/);
  assert.match(html, /id="browserBookmarkToggle"/);
  assert.match(html, /id="browserAddressSuggestions"/);
  assert.match(html, /id="browserPlacesClear"/);
  assert.match(html, /id="browserSessionReset"/);
  assert.match(html, /id="browserSiteCookiesClear"/);
  assert.match(html, /id="browserCookiesClear"/);
  assert.match(renderer, /clearBrowserCookieScope/);
  assert.match(renderer, /clearBrowserSiteCookies/);
  assert.match(renderer, /clearBrowserCookies/);
  const generatedScriptEnd = {
    browserCaptureHookScript: '\nfunction browserCaptureDrainScript',
    browserOverlayScript: '\nasync function applyBrowserOverlay',
  };
  for (const name of Object.keys(generatedScriptEnd)) {
    const start = main.indexOf(`function ${name}(`);
    const end = main.indexOf(generatedScriptEnd[name], start + 1);
    assert(start >= 0 && end > start, `${name} kaynakta bulunamadı`);
    const factory = vm.runInNewContext(`(${main.slice(start, end)})`, {
      browserActiveCuesAt,
      captureBodyFingerprint,
      buildBrowserOverlayScript: require('../src/browser-overlay-controller').buildBrowserOverlayScript,
    });
    const generated = name === 'browserOverlayScript'
      ? factory({ source: [], translation: [], mode: 'both', offset: 0, visible: true })
      : factory();
    assert.doesNotThrow(() => new vm.Script(generated), `${name} geçerli JavaScript üretmiyor`);
  }
  const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'package.json'), 'utf8'));
  assert.match(pkg.devDependencies.electron, /castlabs\/electron-releases#v43\.2\.0\+wvcus/);
  const installBat = fs.readFileSync(path.join(__dirname, '..', 'install.bat'), 'utf8');
  assert.match(
    installBat,
    /tools[\\/]install-orchestrator\.js"? core/,
    'install.bat çekirdek kurulum orkestratörünü çağırmıyor',
  );
  const coreLock = fs.readFileSync(
    path.join(__dirname, '..', 'backend', 'requirements-core.lock'),
    'utf8',
  );
  assert.match(coreLock, /^castlabs-evs==1\.3\.2$/m, 'DRM EVS bağımlılığı kilit dosyasında eksik');
});

(async () => {
  for (const { name, fn } of tests) {
    try {
      await fn();
      passed++;
      console.log(`  OK  ${name}`);
    } catch (err) {
      console.error(`  FAIL ${name}\n${err.stack}`);
      process.exitCode = 1;
    }
  }
  if (!process.exitCode) console.log(`\n${passed} tarayıcı altyazısı testi geçti.`);
})();
