'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  assertDistinctBurninPaths,
  buildBurninArgs,
  classifyFfmpegError,
  ffSubtitlesArg,
  inspectFfTool,
} = require('../src/ffmpeg-io');
const {
  burninOutputPaths,
  prepareSubtitleFilterPath,
  removeFileQuietly,
  replaceBurninOutput,
} = require('../src/burnin-output');

function run(command, args) {
  const result = childProcess.spawnSync(command, args, {
    encoding: 'utf8',
    windowsHide: true,
    timeout: 20000,
  });
  if (result.error) throw result.error;
  return result;
}

const ffmpeg = 'ffmpeg';
const version = run(ffmpeg, ['-version']);
assert.equal(version.status, 0, `ffmpeg çalıştırılamadı: ${version.stderr}`);
assert.equal(inspectFfTool(ffmpeg, { requireSubtitles: true }).ok, true, 'gerçek ffmpeg subtitles capability tanısı başarısız');

const pathFixtures = [
  'C:\\film\\altyazi.srt',
  'D:\\Film Arşivi\\altyazı.srt',
  'E:\\Türkçe\\ğüşiöç İ.srt',
  '\\\\sunucu\\paylaşım\\altyazı.srt',
  '\\\\sunucu adı\\paylaşım adı\\altyazı.srt',
  'C:\\köşeli[1]\\altyazı.srt',
  'C:\\amp&ersand\\altyazı.srt',
  'C:\\yüzde%25\\altyazı.srt',
  'C:\\virgül,iki\\altyazı.srt',
  'C:\\noktalı;iki\\altyazı.srt',
  'C:\\eşittir=iki\\altyazı.srt',
  'C:\\artı+iki\\altyazı.srt',
  'C:\\parantez(1)\\altyazı.srt',
  'C:\\süslü{1}\\altyazı.srt',
  'C:\\kare#işaret\\altyazı.srt',
  'C:\\ünlem!işaret\\altyazı.srt',
  'C:\\şapka^işaret\\altyazı.srt',
  'C:\\dolar$işaret\\altyazı.srt',
  'C:\\at@işaret\\altyazı.srt',
  'C:\\tilde~işaret\\altyazı.srt',
  'C:\\backtick`işaret\\altyazı.srt',
  'C:\\-başlangıç\\-altyazı.srt',
  'C:\\alt çizgi\\altyazı_test.srt',
  'C:\\nokta.dizin\\altyazı.v1.srt',
  'C:\\çok  boşluk\\iki  boşluk.srt',
  'C:\\emoji-🎬\\altyazı.srt',
  'C:\\CJK-日本語\\字幕.srt',
  'C:\\Kiril-Кино\\субтитр.srt',
  'C:\\Arapça-فيلم\\ترجمة.srt',
  'C:\\İbranice-סרט\\כתוביות.srt',
  'C:\\aksan-éàñ\\sous-titre.srt',
  'C:\\combining-é\\subtitle.srt',
  'C:\\1234567890\\0001.srt',
  'Z:\\tek\\a.srt',
  'c:\\küçük-sürücü\\a.srt',
  'C:/ileri/eğik/altyazı.srt',
  'C:\\karma/ayraç\\altyazı.srt',
  'C:\\sonunda boşluk değil\\altyazı .srt',
  'C:\\çoklu...nokta\\altyazı...srt',
  'C:\\reserved-benzeri-CONx\\altyazı.srt',
  `C:\\uzun\\${'segment-'.repeat(20)}\\altyazı.srt`,
  `\\\\sunucu\\paylaşım\\${'uzun-'.repeat(20)}altyazı.srt`,
  'C:\\pipe-benzeri||||\\altyazı.srt',
  'C:\\küçük-büyük-AaZz\\AlTyAzI.SRT',
  'C:\\sıfır olmayan 0\\0.srt',
  'C:\\nbsp-benzeri boşluk\\altyazı.srt',
  'C:\\ince boşluk dizini\\altyazı.srt',
  'C:\\tam genişlik［1］\\altyazı.srt',
];
assert.equal(pathFixtures.length, 48);
for (const subtitlePath of pathFixtures) {
  const filter = ffSubtitlesArg(subtitlePath);
  assert(filter.startsWith("subtitles=filename='"));
  assert(!/[\0\r\n]/.test(filter));
  const args = buildBurninArgs('C:\\video & güvenli.mp4', subtitlePath, 'C:\\çıktı % güvenli.tmp.mp4');
  assert.equal(args[args.indexOf('-i') + 1], 'C:\\video & güvenli.mp4');
  assert.equal(args[args.indexOf('-vf') + 1], filter);
  assert.equal(args.at(-1), 'C:\\çıktı % güvenli.tmp.mp4');
}
assert.throws(() => ffSubtitlesArg("C:\\it's\\a.srt"), /apostrof/);
for (const bad of ['C:\\a\0b.srt', 'C:\\a\nb.srt', 'C:\\a\rb.srt', '']) {
  assert.throws(() => ffSubtitlesArg(bad));
}
assert.throws(() => assertDistinctBurninPaths('C:\\A.mp4', 'C:\\a.MP4', 'C:\\tmp.mp4', 'C:\\out.mp4'), /aynı dosya/);

const missing = inspectFfTool('missing', {
  spawnSyncImpl: () => ({ status: null, error: Object.assign(new Error('missing'), { code: 'ENOENT' }) }),
});
assert.equal(missing.ok, false);
assert.match(missing.error, /bulunamadı/);
assert.equal(inspectFfTool('old', { spawnSyncImpl: () => ({ status: 0, stdout: 'ffmpeg version 3.4', stderr: '' }) }).ok, false);
assert.equal(inspectFfTool('broken', { spawnSyncImpl: () => ({ status: 1, stdout: '', stderr: 'broken' }) }).ok, false);
assert.equal(inspectFfTool('impostor', { spawnSyncImpl: () => ({ status: 0, stdout: 'totally different tool', stderr: '' }) }).ok, false);
const thrownProbe = inspectFfTool('secret-path', {
  spawnSyncImpl: () => { throw new Error('SECRET-TOKEN C:\\private\\ffmpeg.exe'); },
});
assert.equal(thrownProbe.ok, false);
assert.doesNotMatch(thrownProbe.error, /SECRET|private/i);
for (const [raw, phrase] of [
  ['No space left on device', 'boş alan'],
  ['Permission denied', 'kilitlenmiş'],
  ['No such filter: subtitles', 'libass'],
  ['moov atom not found', 'bozuk'],
  ['Unable to open file', 'açılamadı'],
]) assert.match(classifyFfmpegError(raw, 1), new RegExp(phrase, 'i'));

const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-ffmpeg-io-'));
try {
  const baseVideo = path.join(root, 'base.mp4');
  const generated = run(ffmpeg, [
    '-y', '-v', 'error', '-f', 'lavfi', '-i', 'color=c=black:s=160x90:d=0.5',
    '-c:v', 'libx264', '-pix_fmt', 'yuv420p', baseVideo,
  ]);
  assert.equal(generated.status, 0, generated.stderr);

  const realCases = [
    ['normal', '.srt'],
    ['boş luk', '.srt'],
    ['Türkçe-ğüşi', '.srt'],
    ["apostrof-it's", '.srt'],
    ['köşeli[1]', '.srt'],
    ['amp&percent%', '.srt'],
    ['virgül,iki', '.srt'],
    ['noktalı;iki', '.srt'],
    ['ASS biçimi', '.ass'],
    [`uzun-${'dizin-'.repeat(20)}`, '.srt'],
  ];

  const failures = [];
  for (let caseIndex = 0; caseIndex < realCases.length; caseIndex++) {
    const [name, extension] = realCases[caseIndex];
    const dir = path.join(root, name);
    fs.mkdirSync(dir);
    const video = path.join(dir, 'video.mp4');
    const subtitle = path.join(dir, `altyazı${extension}`);
    const paths = burninOutputPaths(video, `real-${caseIndex}`);
    fs.copyFileSync(baseVideo, video);
    const subtitleBody = extension === '.ass'
      ? '[Script Info]\nScriptType: v4.00+\n[V4+ Styles]\nFormat: Name, Fontname, Fontsize, PrimaryColour, SecondaryColour, OutlineColour, BackColour, Bold, Italic, Underline, StrikeOut, ScaleX, ScaleY, Spacing, Angle, BorderStyle, Outline, Shadow, Alignment, MarginL, MarginR, MarginV, Encoding\nStyle: Default,Arial,24,&H00FFFFFF,&H000000FF,&H00000000,&H00000000,0,0,0,0,100,100,0,0,1,1,0,2,10,10,10,1\n[Events]\nFormat: Layer, Start, End, Style, Name, MarginL, MarginR, MarginV, Effect, Text\nDialogue: 0,0:00:00.00,0:00:00.45,Default,,0,0,0,,GERÇEK TEST\n'
      : '1\n00:00:00,000 --> 00:00:00,450\nGERÇEK TEST\n';
    fs.writeFileSync(subtitle, subtitleBody, 'utf8');
    const prepared = prepareSubtitleFilterPath(subtitle, [root], fs, `case-${caseIndex}`);
    if (caseIndex === 0) fs.writeFileSync(paths.outPath, 'önceki çıktı');
    const args = buildBurninArgs(video, prepared.filterPath, paths.tempPath);
    const result = run(ffmpeg, ['-v', 'error', ...args]);
    if (prepared.temporary) removeFileQuietly(prepared.filterPath);
    if (result.status !== 0) {
      failures.push(`${name}: ${(result.stderr || '').trim().split(/\r?\n/)[0]}`);
      continue;
    }
    replaceBurninOutput(paths.tempPath, paths.outPath, fs, `replace-${caseIndex}`);
    if (!fs.existsSync(paths.outPath) || fs.statSync(paths.outPath).size <= 1000) {
      failures.push(`${name}: çıktı oluşmadı`);
      continue;
    }
    const probe = run('ffprobe', ['-v', 'error', '-count_frames', '-select_streams', 'v:0',
      '-show_entries', 'stream=width,height,nb_read_frames', '-of', 'json', paths.outPath]);
    const stream = JSON.parse(probe.stdout).streams[0];
    if (stream.width !== 160 || stream.height !== 90 || Number(stream.nb_read_frames) < 1) {
      failures.push(`${name}: ffprobe frame/boyut doğrulaması başarısız`);
    }
    const baseHash = run(ffmpeg, ['-v', 'error', '-i', video, '-f', 'framemd5', '-']).stdout;
    const outputHash = run(ffmpeg, ['-v', 'error', '-i', paths.outPath, '-f', 'framemd5', '-']).stdout;
    if (baseHash === outputHash) failures.push(`${name}: altyazı pikselleri görüntüyü değiştirmedi`);
    if (fs.existsSync(paths.tempPath)) failures.push(`${name}: finalize sonrası geçici çıktı kaldı`);
  }

  assert.deepEqual(failures, [], failures.join('\n'));
  console.log(`  PASS  48 yol/argv fixture + gerçek ffmpeg matrisi (${realCases.length} vaka)`);
} finally {
  fs.rmSync(root, { recursive: true, force: true });
}
