'use strict';
// R152: timecode ayrıştırma kenar-durum kilitleri — parseTime (birimli/saatli
// girdiler), parseTimedBlocks (SRT/VTT satır taraması + X-TIMESTAMP-MAP),
// formatSrtTime/cuesToSrt/cuesToVtt biçimleme sözleşmesi.
const assert = require('node:assert');
const {
  parseTime, parseTimedBlocks, formatSrtTime, cuesToSrt, cuesToVtt,
} = require('../src/browser-subtitles');

let n = 0; const ok = (c, m) => { n += 1; assert(c, m); };
const close = (a, b, m) => ok(Math.abs(a - b) < 1e-6, `${m}: ${a} != ${b}`);

// --- parseTime ---
close(parseTime('90'), 90, 'düz saniye');
close(parseTime('1:30'), 90, 'd:ss');
close(parseTime('01:02:03'), 3723, 'hh:mm:ss');
close(parseTime('1:30.5'), 90.5, 'ondalık');
close(parseTime('00:00:00,500'), 0.5, 'virgüllü kesir');
close(parseTime('.5s'), 0.5, '.5s birimli');
close(parseTime('90ms'), 0.09, 'ms birimi');
close(parseTime('2m'), 120, 'm birimi');
close(parseTime('1h'), 3600, 'h birimi');
close(parseTime('1H'), 3600, 'büyük birim harfi');
ok(parseTime('') === null, 'boş');
ok(parseTime(null) === null, 'null');
ok(parseTime('abc') === null, 'metin');
ok(parseTime('1:2:3:4') === null, 'dört parça');
ok(parseTime('1h30m') === null, 'karışık birim reddedilir');
ok(parseTime('  5s  ') === 5, 'boşluklu birim');
ok(parseTime('1:60') === 120, '60 saniye toleranslı (lenient)');

// --- parseTimedBlocks ---
const SRT = `1\n00:00:01,000 --> 00:00:02,500\nMerhaba\n\n2\n00:00:03.000 --> 00:00:04.000\nDünya\n\n`;
{
  const cues = parseTimedBlocks(SRT);
  ok(cues.length === 2, 'SRT 2 cue');
  close(cues[0].start, 1, 'srt start');
  close(cues[0].end, 2.5, 'srt end');
  ok(cues[0].text === 'Merhaba', 'srt metin');
}
{
  // BOM + CRLF toleransı
  const cues = parseTimedBlocks(`﻿WEBVTT\r\n\r\n00:00:05.000 --> 00:00:06.000\r\nA\r\n`);
  ok(cues.length === 1 && cues[0].start === 5, 'BOM+CRLF');
}
{
  // Nokta yerine virgül VTT'de de kabul
  const cues = parseTimedBlocks(`WEBVTT\n\n00:00:07,250 --> 00:00:08,000\nB\n`);
  ok(cues.length === 1 && Math.abs(cues[0].start - 7.25) < 1e-6, 'VTT virgül toleransı');
}
{
  // Ayraçsız SRT + sıra numarası metne karışmaz
  const cues = parseTimedBlocks(`1\n00:00:01.000 --> 00:00:02.000\nBir\n2\n00:00:03.000 --> 00:00:04.000\nİki\n`);
  ok(cues.length === 2 && cues[0].text === 'Bir' && cues[1].text === 'İki', 'sıra no ayrımı');
}
{
  // Saat bileşeni 3 basamağı aşabilir
  const cues = parseTimedBlocks(`100:00:00.000 --> 100:00:01.000\nUzun\n`);
  ok(cues.length === 1 && cues[0].start === 360000, '100 saat');
}
{
  // X-TIMESTAMP-MAP → MPEGTS eşleme ofseti
  const body = `#EXT-X-TIMESTAMP-MAP=LOCAL:00:00:00.000,MPEGTS:900000\n00:00:01.000 --> 00:00:02.000\nK\n`;
  const cues = parseTimedBlocks(body, { mpegTsState: {} });
  ok(cues.length === 1 && cues[0].start !== 1, `MPEGTS ofseti uygulandı: ${cues[0].start}`);
}
{
  // NOTE bloğu son cue'a konuşma eklenmez
  const body = `WEBVTT\n\n00:00:01.000 --> 00:00:02.000\nSon cue\n\nNOTE bu bir nottur\n00:99:99\n`;
  const cues = parseTimedBlocks(body);
  ok(cues.length === 1 && !cues[0].text.includes('NOTE'), 'NOTE ayrımı');
}

// --- formatSrtTime / cuesToSrt / cuesToVtt ---
ok(formatSrtTime(0) === '00:00:00,000', 'sıfır');
ok(formatSrtTime(3723.5) === '01:02:03,500', 'hh:mm:ss,ms');
ok(formatSrtTime(-5) === '00:00:00,000', 'negatif kelepçe');
ok(formatSrtTime(360000) === '100:00:00,000', '3 basamak saat');
{
  const srt = cuesToSrt([{ start: 1, end: 2.5, text: 'A\nB' }]);
  ok(srt.includes('1\r\n00:00:01,000 --> 00:00:02,500\r\nA\r\nB'), 'cuesToSrt biçimi');
  const vtt = cuesToVtt([{ start: 1, end: 2.5, text: 'A' }]);
  ok(vtt.startsWith('WEBVTT') && vtt.includes('00:00:01.000 --> 00:00:02.500'), 'cuesToVtt nokta biçimi');
}

console.log(`subtitle-timecode: ${n} kontrol geçti`);
