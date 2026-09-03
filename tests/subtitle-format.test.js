/**
 * Altyazi bicimi korunuyor mu? (ASS cerrahi duzenleme + VTT yazici)
 *
 * Neden var: duzenleme kaydi her bicimi cuesToSrt ile yaziyordu; .ass dosyasina
 * duz SRT yaziliyor (stiller, konumlar, konusmaci adlari yok oluyor), .vtt de
 * WEBVTT basligini kaybediyordu.
 *
 * Calistirma:  node tests/subtitle-format.test.js
 */
const fs = require('fs');
const src = fs.readFileSync(require('path').join(__dirname, '..', 'src', 'renderer', 'renderer.js'), 'utf-8');
const body = src.slice(src.indexOf('function parseAss'), src.indexOf('function setPlayerSource'));
const F = new Function(body + '; return {parseAss, parseSubtitles, cuesToVtt, cuesToSrt, replaceAssDialogueText, replaceVttCueText};')();

const BS = String.fromCharCode(92);
let pass = 0; const fails = [];
const t = (name, fn) => { try { fn(); pass++; console.log('  PASS  ' + name); }
                          catch (e) { fails.push(name + ': ' + e.message); console.log('  FAIL  ' + name + ' — ' + e.message); } };
const ok = (c, m) => { if (!c) throw new Error(m || 'assert'); };

// ---- gercekci bir ASS dosyasi (stiller, konumlandirma, konusmaci adi) ----
const ASS = [
  '[Script Info]',
  'Title: Test',
  'ScriptType: v4.00+',
  'PlayResX: 1920',
  '',
  '[V4+ Styles]',
  'Format: Name, Fontname, Fontsize, PrimaryColour, Bold, Alignment, MarginV',
  'Style: Default,Arial,48,&H00FFFFFF,0,2,40',
  'Style: Ust,Arial,42,&H0000FFFF,1,8,40',
  '',
  '[Events]',
  'Format: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text',
  'Dialogue: 0,0:00:05.00,0:00:07.50,Default,ANLATICI,0,0,0,,{' + BS + 'i1}Egik{' + BS + 'i0} birinci satir',
  'Dialogue: 0,0:00:08.20,0:00:10.00,Ust,KADIN,0,0,0,,{' + BS + 'pos(960,100)}Ikinci, virgullu satir',
  'Dialogue: 0,0:00:11.00,0:00:13.00,Default,,0,0,0,,Ucuncu' + BS + 'Nsatir sonlu',
].join('\n');

t('ASS ayristirma satir numarasi tutuyor', () => {
  const cues = F.parseSubtitles(ASS);
  ok(cues.length === 3, 'blok sayisi ' + cues.length);
  ok(cues[0].line === 12, 'ilk blok satiri ' + cues[0].line);
  ok(cues[2].text.includes('\n'), 'satir sonu cevrilmemis');
});

t('ASS duzenleme STILLERI ve digerlerini korur', () => {
  const cues = F.parseSubtitles(ASS);
  const out = F.replaceAssDialogueText(ASS, cues[1].line, 'Duzeltilmis metin');
  ok(out !== null, 'null dondu');
  // dosya yapisi duruyor mu
  ok(out.includes('[V4+ Styles]'), 'stil bolumu kayboldu');
  ok(out.includes('Style: Ust,Arial,42,&H0000FFFF,1,8,40'), 'Ust stili kayboldu');
  ok(out.includes('[Script Info]') && out.includes('PlayResX: 1920'), 'script info kayboldu');
  // hedef satir degisti, alanlar korundu
  const line = out.split('\n').find((l) => l.includes('Duzeltilmis metin'));
  ok(line.startsWith('Dialogue: 0,0:00:08.20,0:00:10.00,Ust,KADIN,0,0,0,,'), 'alanlar bozuldu: ' + line);
  // DIGER satirlar aynen duruyor
  ok(out.includes('{' + BS + 'i1}Egik{' + BS + 'i0} birinci satir'), 'birinci satir bozuldu');
  ok(out.includes('Ucuncu' + BS + 'Nsatir sonlu'), 'ucuncu satir bozuldu');
  // SRT'ye donusmedi
  ok(!/^\d+$/m.test(out.split('[Events]')[1] || ''), 'SRT numarasi sizmis');
});

t('ASS duzenlemede satir sonu ' + BS + 'N olarak yazilir', () => {
  const cues = F.parseSubtitles(ASS);
  const out = F.replaceAssDialogueText(ASS, cues[0].line, 'Ilk satir\nIkinci satir');
  const line = out.split('\n').find((l) => l.includes('Ilk satir'));
  ok(line.endsWith(',,Ilk satir' + BS + 'NIkinci satir'), 'satir: ' + line);
  ok(!line.includes('\r'), 'CR sizmis');
});

t('ASS duzenleme CRLF yapisini korur, komut parantezini metne cevirir ve hedef zamani dogrular', () => {
  const raw = ASS.replace(/\n/g, '\r\n');
  const cue = F.parseSubtitles(raw)[0];
  const out = F.replaceAssDialogueText(raw, cue.line, 'Metin {yanlis}\n\nDevam', cue.assLead,
    cue.assTextIndex, cue.assFieldCount, cue.start, cue.end, cue.assStartIndex, cue.assEndIndex);
  ok(out && out.includes('\r\n') && !/(^|[^\r])\n/.test(out), 'CRLF korunmadi');
  ok(out.includes('Metin ｛yanlis｝' + BS + 'NDevam'), 'ASS komutu veya bos satir sizdi');
  ok(F.replaceAssDialogueText(raw, cue.line, 'Yanlis', cue.assLead,
    cue.assTextIndex, cue.assFieldCount, cue.start + 1, cue.end) === null, 'zaman uyusmazligi kabul edildi');
});

t('gecersiz satir numarasinda null doner (dosya bozulmaz)', () => {
  ok(F.replaceAssDialogueText(ASS, 999, 'x') === null, '999');
  ok(F.replaceAssDialogueText(ASS, 0, 'x') === null, 'Dialogue olmayan satir');
  ok(F.replaceAssDialogueText(ASS, undefined, 'x') === null, 'undefined');
});

// ---- VTT ----
t('VTT yazici gecerli VTT uretir', () => {
  const vtt = 'WEBVTT\n\n00:00:05.000 --> 00:00:07.500\nBirinci.\n\n00:00:08.000 --> 00:00:09.250\nIkinci.\n';
  const cues = F.parseSubtitles(vtt);
  ok(cues.length === 2, 'ayristirma ' + cues.length);
  const out = F.cuesToVtt(cues);
  ok(out.startsWith('WEBVTT\n\n'), 'WEBVTT basligi yok');
  ok(out.includes('00:00:05.000 --> 00:00:07.500'), 'zaman bicimi (nokta) yanlis: ' + out.slice(0, 60));
  ok(!out.includes(','), 'SRT virgullu zaman sizmis');
  // tur-icinde kararli: yeniden ayristirinca ayni bloklar
  const again = F.parseSubtitles(out);
  ok(again.length === 2 && again[0].text === 'Birinci.', 'tur-ici kararsiz');
  ok(Math.abs(again[1].start - 8.0) < 0.001 && Math.abs(again[1].end - 9.25) < 0.001, 'zamanlar kaymis');
});

t('VTT saat alani olmayan MM:SS.mmm zamanlarini ayristirir', () => {
  const vtt = 'WEBVTT\n\n00:12.500 --> 01:03.250\nKisa VTT.\n\n02:03.5 --> 02:04.75\nOndalik basamaklari.\n';
  const cues = F.parseSubtitles(vtt);
  ok(cues.length === 2, 'blok sayisi ' + cues.length);
  ok(Math.abs(cues[0].start - 12.5) < .001, 'ilk baslangic ' + cues[0].start);
  ok(Math.abs(cues[0].end - 63.25) < .001, 'ilk bitis ' + cues[0].end);
  ok(Math.abs(cues[1].start - 123.5) < .001, 'tek basamakli ms ' + cues[1].start);
  ok(Math.abs(cues[1].end - 124.75) < .001, 'iki basamakli ms ' + cues[1].end);
});

t('VTT tek ve uc haneli dakika alanlarini ayristirir', () => {
  const cues = F.parseSubtitles('WEBVTT\n\n5:23.500 --> 5:28.100\nKisa\n\n123:45.000 --> 123:46.000\nUzun\n');
  ok(cues.length === 2, 'blok sayisi ' + cues.length);
  ok(cues[0].start === 323.5, 'tek haneli dakika yanlis');
  ok(cues[1].start === 7425, 'uc haneli dakika yanlis');
});

t('SRT yolu aynen calisiyor (regresyon)', () => {
  const srt = '1\n00:00:05,000 --> 00:00:07,500\nDuz SRT.\n\n2\n00:00:08,000 --> 00:00:09,000\nIkinci.\n';
  const cues = F.parseSubtitles(srt);
  ok(cues.length === 2, 'ayristirma');
  const out = F.cuesToSrt(cues);
  ok(out.includes('00:00:05,000 --> 00:00:07,500'), 'SRT zamani virgullu degil');
  ok(F.parseSubtitles(out).length === 2, 'tur-ici kararsiz');
});

// ---- VTT metadata korunuyor mu (cerrahi duzenleme) ----
const VTT_RICH = [
  'WEBVTT - Test dosyasi',
  'Kind: captions',
  'Language: tr',
  '',
  'STYLE',
  '::cue { color: yellow; }',
  '',
  'REGION',
  'id:r1 width:40%',
  '',
  'NOTE Bu bir yorum satiri',
  '',
  'cue-1',
  '00:00:05.000 --> 00:00:07.500 align:start position:10%',
  'Birinci satir.',
  '',
  'cue-2',
  '00:00:08.000 --> 00:00:09.250',
  'Ikinci satir.',
  'Devami.',
  '',
].join('\n');

t('VTT duzenleme STYLE/REGION/NOTE/cue ayarlarini korur', () => {
  const cues = F.parseSubtitles(VTT_RICH);
  ok(cues.length === 2, 'blok sayisi ' + cues.length);
  const out = F.replaceVttCueText(VTT_RICH, cues[1], 'Duzeltilmis metin');
  ok(out !== null, 'null dondu');
  ok(out.startsWith('WEBVTT - Test dosyasi'), 'baslik metadatasi kayboldu');
  ok(out.includes('Kind: captions') && out.includes('Language: tr'), 'header kayboldu');
  ok(out.includes('STYLE') && out.includes('::cue { color: yellow; }'), 'STYLE kayboldu');
  ok(out.includes('REGION') && out.includes('id:r1 width:40%'), 'REGION kayboldu');
  ok(out.includes('NOTE Bu bir yorum satiri'), 'NOTE kayboldu');
  ok(out.includes('cue-1') && out.includes('cue-2'), 'cue kimlikleri kayboldu');
  ok(out.includes('align:start position:10%'), 'cue ayarlari kayboldu');
  ok(out.includes('Duzeltilmis metin'), 'yeni metin yok');
  ok(!out.includes('Ikinci satir.') && !out.includes('Devami.'), 'eski metin kalmis');
  ok(out.includes('Birinci satir.'), 'diger blok bozuldu');
});

t('VTT duzenleme CRLF yapisini korur ve bos satirin cue bolmesini engeller', () => {
  const raw = VTT_RICH.replace(/\n/g, '\r\n');
  const cue = F.parseSubtitles(raw)[0];
  const out = F.replaceVttCueText(raw, cue, 'Bir\n\nIki');
  ok(out && out.includes('Bir\r\nIki'), 'metin satirlari korunmadi');
  ok(!out.includes('Bir\r\n\r\nIki'), 'bos satir yeni cue olusturdu');
  ok(!/(^|[^\r])\n/.test(out), 'LF sizdi');
});

t('VTT zamanlamasi bellekte degisse de kaynak blok duzenlenir', () => {
  const cues = F.parseSubtitles(VTT_RICH);
  cues[1].start += 1.25;
  cues[1].end += 1.25;
  const out = F.replaceVttCueText(VTT_RICH, cues[1], 'Zamanlamadan sonra duzenlendi');
  ok(out !== null && out.includes('Zamanlamadan sonra duzenlendi'), 'kaynak zaman kimligi kayboldu');
  ok(out.includes('00:00:08.000 --> 00:00:09.250'), 'zaman satiri bozuldu');
});

t('VTT: eslesmeyen blokta null (dosya bozulmaz)', () => {
  ok(F.replaceVttCueText(VTT_RICH, { start: 99, end: 100 }, 'x') === null, 'eslesmemeliydi');
});

t('VTT duzenleme bir ve iki haneli kesirleri doğru milisaniyeye çevirir', () => {
  const raw = 'WEBVTT\n\n00:01.5 --> 00:02.50\nEski\n';
  const cues = F.parseSubtitles(raw);
  ok(cues.length === 1 && cues[0].start === 1.5 && cues[0].end === 2.5, 'VTT ayrıştırılamadı');
  const out = F.replaceVttCueText(raw, cues[0], 'Yeni');
  ok(out && out.includes('Yeni') && !out.includes('Eski'), 'kısa kesirli cue güncellenemedi');
});

// ---- ASS satir ici etiketler ----
t('ASS: bastaki konum/stil etiketi duzenlemede KORUNUR', () => {
  const cues = F.parseSubtitles(ASS);
  const c = cues[1];                       // {\pos(960,100)} ile baslayan satir
  ok(c.assLead.includes('pos('), 'lead yakalanmadi: ' + c.assLead);
  const out = F.replaceAssDialogueText(ASS, c.line, 'Yeni metin', c.assLead);
  const line = out.split('\n').find((l) => l.includes('Yeni metin'));
  ok(line.includes('pos(960,100)'), 'konum etiketi kayboldu: ' + line);
});

t('ASS: metin ICINDEKI etiket isaretlenir (uyari icin)', () => {
  const cues = F.parseSubtitles(ASS);
  ok(cues[0].assInner === true, 'ic etiket tespit edilmedi');   // {\i1}Egik{\i0} ...
  ok(cues[2].assInner === false, 'yanlis tespit');              // duz metin
});

t('ASS tek haneli kesri onda bir saniye olarak okur', () => {
  const raw = '[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\n'
    + 'Dialogue: 0,0:00:01.5,0:00:02.5,Default,,0,0,0,,Kisa kesir';
  const cue = F.parseSubtitles(raw)[0];
  ok(cue && cue.start === 1.5 && cue.end === 2.5, `zaman yanlis: ${cue && cue.start}`);
});

t('ASS Events Format alan sırasını ayrıştırma ve düzenlemede izler', () => {
  const raw = '[Events]\nFormat: Style, End, Start, Name, Text\n'
    + 'Dialogue: Default,0:00:04.25,0:00:03.5,ANLATICI,Eski, virgullu metin';
  const cue = F.parseSubtitles(raw)[0];
  ok(cue && cue.start === 3.5 && cue.end === 4.25, 'özel alan sırası okunmadı');
  const out = F.replaceAssDialogueText(raw, cue.line, 'Yeni, metin', cue.assLead,
    cue.assTextIndex, cue.assFieldCount);
  ok(out && out.includes('Dialogue: Default,0:00:04.25,0:00:03.5,ANLATICI,Yeni, metin'),
    `özel Format düzenlemesi bozuk: ${out}`);
});

t('VTT üç haneli dakika cue metni düzenlenebilir', () => {
  const raw = 'WEBVTT\n\n123:45.000 --> 123:46.000\nEski\n';
  const cue = F.parseSubtitles(raw)[0];
  const out = F.replaceVttCueText(raw, cue, 'Yeni');
  ok(out && out.includes('Yeni') && !out.includes('Eski'), 'üç haneli dakika eşleşmedi');
});

// ---- ms yuvarlama tasmasi ----
t('ms yuvarlamasi 1000 uretmez (tasma)', () => {
  const bad = [{ start: 1.9996, end: 2.9999, text: 'x' }];
  const srt = F.cuesToSrt(bad);
  ok(!/,1000/.test(srt), 'SRT tasmasi: ' + srt.split('\n')[1]);
  ok(srt.includes('00:00:02,000 --> 00:00:03,000'), 'SRT yanlis: ' + srt.split('\n')[1]);
  const vtt = F.cuesToVtt(bad);
  ok(!/\.1000/.test(vtt), 'VTT tasmasi');
  ok(vtt.includes('00:00:02.000 --> 00:00:03.000'), 'VTT yanlis');
  const edge = F.cuesToSrt([{ start: 59.9999, end: 3599.9999, text: 'x' }]);
  ok(edge.includes('00:01:00,000 --> 01:00:00,000'), 'sinir tasmasi: ' + edge.split('\n')[1]);
});

console.log(`\n${pass} geçti, ${fails.length} başarısız (${pass + fails.length} test)`);
if (fails.length) { fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
