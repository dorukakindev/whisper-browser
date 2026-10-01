// Video codec/kapsayıcı sniffing matrisi (madde 8): mkv/webm/avi/mp4/mov
// temsili ffprobe çıktıları + bozuk-probe girdileri. Özellikle gömülü
// altyazı izlerinde mutlak-indeks sözleşmesi (`-map 0:N`) kilitlenir:
// index alanı eksik/bozuk olan iz ASLA altyazı-göreli sıraya düşmemeli
// (yanlış akış — genelde video/ses — haritalanırdı) ve negatif/ondalıklı
// indeksler reddedilmeli.
const assert = require('assert');
const {
  BITMAP_SUBTITLE_CODECS,
  TEXT_SUBTITLE_CODECS,
  buildSubtitleExtractionArgs,
  buildSubtitleProbeArgs,
  parseSubtitleStreams,
  subtitleOutputExtension,
  subtitleTrackLabel,
} = require('../src/media-subtitle-tracks');

let checks = 0;
const ok = (name, cond) => { checks += 1; assert.ok(cond, name); };

// --- Kapsayıcı temsili prob matrisi ----------------------------------------
const CONTAINERS = {
  mkv: { streams: [
    { index: 0, codec_type: 'video', codec_name: 'h264' },
    { index: 1, codec_type: 'audio', codec_name: 'aac', tags: { language: 'tur' } },
    { index: 2, codec_type: 'subtitle', codec_name: 'subrip', tags: { language: 'tur', title: 'Türkçe' }, disposition: { default: 1 } },
    { index: 3, codec_type: 'subtitle', codec_name: 'ass', tags: { language: 'eng' }, disposition: {} },
    { index: 4, codec_type: 'subtitle', codec_name: 'hdmv_pgs_subtitle', tags: { language: 'jpn' }, disposition: { forced: 1 } },
  ] },
  mp4: { streams: [
    { index: 0, codec_type: 'video', codec_name: 'h264' },
    { index: 1, codec_type: 'audio', codec_name: 'aac' },
    { index: 2, codec_type: 'subtitle', codec_name: 'mov_text', tags: { language: 'eng' }, disposition: {} },
  ] },
  webm: { streams: [
    { index: 0, codec_type: 'video', codec_name: 'vp9' },
    { index: 1, codec_type: 'audio', codec_name: 'opus' },
    { index: 2, codec_type: 'subtitle', codec_name: 'webvtt', tags: { language: 'tur' }, disposition: {} },
  ] },
  avi: { streams: [
    { index: 0, codec_type: 'video', codec_name: 'mpeg4' },
    { index: 1, codec_type: 'audio', codec_name: 'mp3' },
    { index: 2, codec_type: 'subtitle', codec_name: 'xsub', tags: {}, disposition: {} },
  ] },
  mov: { streams: [
    { index: 0, codec_type: 'video', codec_name: 'prores' },
    { index: 1, codec_type: 'subtitle', codec_name: 'mov_text', tags: { language: 'eng' }, disposition: { hearing_impaired: 1 } },
  ] },
};

const mkv = parseSubtitleStreams(CONTAINERS.mkv);
ok('mkv: 3 altyazı izi', mkv.length === 3);
ok('mkv: mutlak indeksler korunur', mkv.map((t) => t.streamIndex).join(',') === '2,3,4');
ok('mkv: srt çıkarılabilir', mkv[0].extractable && mkv[0].textBased);
ok('mkv: pgs bitmap OCR ister', mkv[2].requiresOcr && !mkv[2].extractable);
ok('mkv: -map mutlak indeks kullanır', buildSubtitleExtractionArgs('f.mkv', mkv[1], 'o.ass').join(' ').includes('-map 0:3'));

const mp4 = parseSubtitleStreams(CONTAINERS.mp4);
ok('mp4: mov_text metin izi', mp4.length === 1 && mp4[0].extractable && mp4[0].codec === 'mov_text');
ok('mp4: mov_text → .srt', subtitleOutputExtension(mp4[0]) === '.srt');

const webm = parseSubtitleStreams(CONTAINERS.webm);
ok('webm: webvtt metin izi', webm[0].extractable && webm[0].codec === 'webvtt');
ok('webm: webvtt → .srt dönüşümü', buildSubtitleExtractionArgs('f.webm', webm[0], 'o.srt').includes('-c:s'));

const avi = parseSubtitleStreams(CONTAINERS.avi);
ok('avi: xsub bitmap — metin çıkarılamaz', avi[0].bitmap && !avi[0].extractable);
ok('avi: bitmap için args null', buildSubtitleExtractionArgs('f.avi', avi[0], 'o.srt') === null);

const mov = parseSubtitleStreams(CONTAINERS.mov);
ok('mov: tek iz + SDH etiketi', mov.length === 1 && mov[0].hearingImpaired && subtitleTrackLabel(mov[0]).includes('SDH'));

// --- Mutlak-indeks sözleşmesi: eksik/bozuk index alanı ----------------------
// Gerçek senaryo: bozuk prob çıktısında index alanı düşerse iz listede
// görünsün ama 0:N haritalamasıyla başka akışa gitmesin.
const noIndex = parseSubtitleStreams({ streams: [
  { codec_type: 'subtitle', codec_name: 'subrip', tags: { language: 'tur' } },
  { index: 5, codec_type: 'subtitle', codec_name: 'subrip', tags: { language: 'eng' } },
] });
ok('eksik index: iz listede kalır', noIndex.length === 2);
ok('eksik index: streamIndex null', noIndex[0].streamIndex === null);
ok('eksik index: extractable=false (yanlış akışa gitmez)', noIndex[0].extractable === false);
ok('eksik index: args üretilmez', buildSubtitleExtractionArgs('f.mkv', noIndex[0], 'o.srt') === null);
ok('eksik index: sağlam iz etkilenmez', noIndex[1].streamIndex === 5 && noIndex[1].extractable);

// Negatif/ondalıklı indeks reddi — `-map 0:-3` ve `0:1.5` ffmpeg'de geçersiz.
[-3, 1.5].forEach((idx) => {
  const t = parseSubtitleStreams({ streams: [{ index: idx, codec_type: 'subtitle', codec_name: 'subrip' }] })[0];
  ok(`bozuk index ${idx}: streamIndex null`, t.streamIndex === null);
  ok(`bozuk index ${idx}: args null`, buildSubtitleExtractionArgs('f.mkv', t, 'o.srt') === null);
});
// Sayısal dizgi zararsız şekilde aynı mutlak indekse koerce edilir;
// sayısal olmayan/boş tipler reddedilir.
ok('index "3" → 3 (sayısal dizgi toleransı)',
  parseSubtitleStreams({ streams: [{ index: '3', codec_type: 'subtitle', codec_name: 'subrip' }] })[0].streamIndex === 3);
['abc', '-1', '1.5x', '3;evil', {}, [], null, undefined, NaN, Infinity].forEach((bad) => {
  const t = parseSubtitleStreams({ streams: [{ index: bad, codec_type: 'subtitle', codec_name: 'subrip' }] })[0];
  ok(`index ${JSON.stringify(bad)}: streamIndex null`, t.streamIndex === null);
});
// IPC sınırlayıcısı: renderer'dan gelen track nesnesi doğrudan kontrol edilir.
[null, undefined, {}, { textBased: true }, { textBased: true, streamIndex: null },
 { textBased: true, streamIndex: '2' }, { textBased: true, streamIndex: -1 },
 { textBased: true, streamIndex: 1.5 }].forEach((t) => {
  ok(`hostile track ${JSON.stringify(t)}: args null`, buildSubtitleExtractionArgs('f.mkv', t, 'o.srt') === null);
});

// --- Bozuk probe gövdesi matrisi --------------------------------------------
[null, undefined, '', 'bozuk json {', '{"streams":42}', '{"streams":{}}', 42, [],
 { streams: null }, { streams: 'x' }, { streams: [null, 5, 'x'] }].forEach((raw, i) => {
  const out = parseSubtitleStreams(raw);
  ok(`probe#${i}: dizi döner + elenir`, Array.isArray(out));
});
// codec_type'suz akış (select_streams s çıktısı) altyazı sayılır; başka
// codec_type'lar elenir.
const mixed = parseSubtitleStreams({ streams: [
  { index: 2, codec_name: 'subrip' },                              // codec_type yok → select_streams s çıktısı
  { index: 3, codec_type: 'attachment', codec_name: 'ttf' },       // font eki → altyazı değil
  { index: 4, codec_type: 'data', codec_name: 'bin_data' },        // data akışı → elenir
] });
ok('codec_type yok: altyazı sayılır', mixed.some((t) => t.streamIndex === 2));
ok('attachment elenir', !mixed.some((t) => t.streamIndex === 3));
ok('data elenir', !mixed.some((t) => t.streamIndex === 4));

// --- tags/disposition bozukluğu ----------------------------------------------
const messy = parseSubtitleStreams({ streams: [
  { index: 2, codec_type: 'subtitle', codec_name: 'SUBRIP', tags: { LANGUAGE: 'TUR', TITLE: 'Büyük' } },
  { index: 3, codec_type: 'subtitle', codec_name: 'srt', tags: 'bozuk', disposition: 'bozuk' },
  { index: 4, codec_type: 'subtitle', tags: {} },                  // codec_name yok → '' → metin sayılmaz
] });
ok('büyük-harf codec normalize', messy[0].codec === 'subrip' && messy[0].extractable);
ok('büyük-harf tag anahtarı', messy[0].language === 'tur' && messy[0].title === 'Büyük');
ok('bozuk tags/disposition güvenli', messy[1].language === '' && !messy[1].default);
ok('codec yok: metin değil, bitmap değil', !messy[2].textBased && !messy[2].extractable && !messy[2].requiresOcr);
ok('codec yok: label fallback', subtitleTrackLabel(messy[2]) === 'Altyazı 3');

// --- Probe/çıkarım argüman güvenliği ------------------------------------------
const probeArgs = buildSubtitleProbeArgs('C:\\Videolar\\film adı.mkv');
ok('probe: select_streams s', probeArgs.includes('-select_streams') && probeArgs.includes('s'));
ok('probe: dosya sonda', probeArgs[probeArgs.length - 1] === 'C:\\Videolar\\film adı.mkv');
const exArgs = buildSubtitleExtractionArgs('in.mkv', mkv[0], 'out.srt');
ok('extract: -y + hata sessizliği', exArgs[0] === '-y' && exArgs.includes('error'));
ok('extract: tek map', exArgs.filter((a) => a === '-map').length === 1);
ok('extract: srt codec', exArgs[exArgs.indexOf('-c:s') + 1] === 'srt');
ok('ssa → .ass + ass codec', subtitleOutputExtension({ codec: 'ssa' }) === '.ass'
  && buildSubtitleExtractionArgs('i', { textBased: true, codec: 'ssa', streamIndex: 2 }, 'o.ass').includes('ass'));

// --- subtitleTrackLabel matrisi ------------------------------------------------
ok('label: dil+bayrak', subtitleTrackLabel({ language: 'tur', forced: 1 }) === 'TUR · Zorunlu');
ok('label: boş → sıra adı', subtitleTrackLabel({ subtitleIndex: 4 }) === 'Altyazı 5');
ok('label: bitmap', subtitleTrackLabel({ bitmap: true, subtitleIndex: 0 }).includes('Görüntü altyazısı'));

// --- Codec seti tutarlılığı -----------------------------------------------------
ok('srt/ass/webvtt/mov_text metin', ['subrip', 'srt', 'ass', 'ssa', 'webvtt', 'mov_text'].every((c) => TEXT_SUBTITLE_CODECS.has(c)));
ok('pgs/dvd/dvb/xsub bitmap', ['hdmv_pgs_subtitle', 'dvd_subtitle', 'dvb_subtitle', 'xsub'].every((c) => BITMAP_SUBTITLE_CODECS.has(c)));
ok('kümeler ayrık', [...TEXT_SUBTITLE_CODECS].every((c) => !BITMAP_SUBTITLE_CODECS.has(c)));

console.log(`Medya codec/kapsayıcı sniffing matrisi geçti (${checks} kontrol).`);
