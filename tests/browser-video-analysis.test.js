'use strict';

const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { execFileSync } = require('node:child_process');
const { createBrowserVideoAnalysis } = require('../src/browser-video-analysis');

async function main() {
  const root = path.resolve(__dirname, '..');
  const pythonPath = path.join(root, 'backend', 'venv', 'Scripts', 'python.exe');
  const ffmpegPath = path.join(root, 'backend', 'bin', 'ffmpeg.exe');
  const ffprobePath = path.join(root, 'backend', 'bin', 'ffprobe.exe');
  const temp = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-analysis-test-'));
  try {
    const fixture = `from PIL import Image,ImageDraw,ImageFont\nimport numpy as np,wave,os\np=${JSON.stringify(temp)}\nim=Image.new('RGB',(640,180),'white'); d=ImageDraw.Draw(im); d.text((40,40),'HELLO VIDEO',fill='black',font=ImageFont.truetype('C:/Windows/Fonts/arial.ttf',54)); im.save(os.path.join(p,'text.png'))\nsr=8000;t=np.arange(sr*12)/sr; melody=np.sin(2*np.pi*(220+55*np.floor(t/1.5))*t)*0.5\nfor i in (0,1):\n tail=np.sin(2*np.pi*(700+i*220)*np.arange(sr*3)/sr)*0.5; data=np.concatenate([melody,tail]); w=wave.open(os.path.join(p,f'a{i}.wav'),'wb');w.setnchannels(1);w.setsampwidth(2);w.setframerate(sr);w.writeframes((data*30000).astype('<i2').tobytes());w.close()\n`;
    execFileSync(pythonPath, ['-c', fixture], { windowsHide: true });
    const videos = [];
    for (let i = 0; i < 2; i++) {
      const file = path.join(temp, `video-${i}.mp4`);
      execFileSync(ffmpegPath, ['-hide_banner', '-loglevel', 'error', '-loop', '1', '-framerate', '2', '-i', path.join(temp, 'text.png'), '-i', path.join(temp, `a${i}.wav`), '-shortest', '-c:v', 'mpeg4', '-c:a', 'aac', '-y', file], { windowsHide: true });
      videos.push(file);
    }
    const tool = createBrowserVideoAnalysis({ pythonPath, ffmpegPath, ffprobePath });
    const ocr = await tool.ocrRange({ videoPath: videos[0], start: 0, end: 3, crop: { x: 0, y: 0, width: 1, height: 1 }, interval: 1 });
    assert.ok(ocr.cues.some(cue => cue.text.includes('HELLO VIDEO')), JSON.stringify(ocr));
    const intro = await tool.detectIntro({ videoPaths: videos, maxScanSeconds: 15 });
    assert.ok(intro.candidates.length && intro.candidates[0].start < 2 && intro.candidates[0].score > 0.78, JSON.stringify(intro));
    assert.equal(intro.diagnostics.autoSkip, false);
    await assert.rejects(() => tool.detectIntro({ videoPaths: [videos[0]] }), /2–4/);
    const cancelled = new AbortController(); cancelled.abort();
    await assert.rejects(() => tool.ocrRange({ videoPath: videos[0], start: 0, end: 2 }, { signal: cancelled.signal }), /iptal/);
    console.log(JSON.stringify({ ocr, intro }));
  } finally { fs.rmSync(temp, { recursive: true, force: true }); }
}

main().catch(error => { console.error(error); process.exitCode = 1; });
