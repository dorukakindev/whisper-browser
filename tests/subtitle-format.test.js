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
const F = new Function(body + '; return {parseAss, parseSubtitles, cuesToVtt, cuesToSrt, replaceAssDialogueText};')();

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

t('SRT yolu aynen calisiyor (regresyon)', () => {
  const srt = '1\n00:00:05,000 --> 00:00:07,500\nDuz SRT.\n\n2\n00:00:08,000 --> 00:00:09,000\nIkinci.\n';
  const cues = F.parseSubtitles(srt);
  ok(cues.length === 2, 'ayristirma');
  const out = F.cuesToSrt(cues);
  ok(out.includes('00:00:05,000 --> 00:00:07,500'), 'SRT zamani virgullu degil');
  ok(F.parseSubtitles(out).length === 2, 'tur-ici kararsiz');
});

console.log(`\n${pass} geçti, ${fails.length} başarısız (${pass + fails.length} test)`);
if (fails.length) { fails.forEach((f) => console.log('  - ' + f)); process.exit(1); }
