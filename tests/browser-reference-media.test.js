'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { createBrowserReferenceMedia } = require('../src/browser-reference-media');

const ffmpegPath = path.resolve(__dirname, '..', 'backend', 'bin', 'ffmpeg.exe');
const ffprobePath = path.resolve(__dirname, '..', 'backend', 'bin', 'ffprobe.exe');
const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-reference-media-'));
const videoPath = path.join(temp, 'reference.mp4');
const generated = spawnSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-y',
  '-f', 'lavfi', '-i', 'sine=frequency=440:sample_rate=48000:duration=1',
  '-f', 'lavfi', '-i', 'anullsrc=channel_layout=mono:sample_rate=48000:duration=1',
  '-f', 'lavfi', '-i', 'sine=frequency=660:sample_rate=48000:duration=1',
  '-f', 'lavfi', '-i', 'color=c=blue:s=320x180:r=15:d=3',
  '-filter_complex', '[0:a][1:a][2:a]concat=n=3:v=0:a=1[a]', '-map', '3:v', '-map', '[a]',
  '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-c:a', 'aac', '-shortest', videoPath], { encoding: 'utf8' });
assert.equal(generated.status, 0, generated.stderr);

async function run() {
  const media = createBrowserReferenceMedia({ ffmpegPath, ffprobePath });
  const probe = await media.probe(videoPath);
  assert(probe.duration > 2.9 && probe.duration < 3.2, `Süre yanlış: ${probe.duration}`);
  const waveform = await media.waveform(videoPath, probe.duration);
  assert(waveform.points.length >= 100);
  const band = (from, to) => waveform.points.slice(Math.floor(from * waveform.points.length),
    Math.floor(to * waveform.points.length));
  const firstTone = Math.max(...band(.08, .24));
  const silence = Math.max(...band(.43, .57));
  const secondTone = Math.max(...band(.77, .92));
  assert(firstTone > .02 && secondTone > .02, `Ton dalgası yok: ${firstTone}, ${secondTone}`);
  assert(silence < .005, `Sessizlik dalgası yanlış: ${silence}`);
  const thumbnail = await media.thumbnail(videoPath, 1.5);
  assert.equal(thumbnail.time, 1.5);
  assert.match(thumbnail.image, /^data:image\/jpeg;base64,/);
  const jpeg = Buffer.from(thumbnail.image.split(',')[1], 'base64');
  assert.equal(jpeg.subarray(0, 2).toString('hex'), 'ffd8');
  assert.equal(jpeg.subarray(-2).toString('hex'), 'ffd9');
  await assert.rejects(media.thumbnail(videoPath, -1), /geçersiz/i);
  await assert.rejects(media.thumbnail(videoPath, 14401), /geçersiz/i);
  await assert.rejects(media.waveform(videoPath, NaN), /geçersiz/i);
  await assert.rejects(media.waveform(videoPath, 14401), /geçersiz/i);
  const preabort = new AbortController(); preabort.abort();
  await assert.rejects(media.probe(videoPath, { signal: preabort.signal }), /iptal/i);
  const abort = new AbortController();
  const pending = media.waveform(videoPath, probe.duration, { signal: abort.signal });
  abort.abort();
  await assert.rejects(pending, /iptal/i);
  console.log(JSON.stringify({ ok: true, duration: probe.duration, points: waveform.points.length,
    firstTone, silence, secondTone, jpegBytes: jpeg.length }));
}

run().catch(error => { console.error(error); process.exitCode = 1; }).finally(() => {
  fs.rmSync(temp, { recursive: true, force: true });
});
