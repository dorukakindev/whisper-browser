const fs = require('node:fs');
const path = require('node:path');
const { spawnSync } = require('node:child_process');

function ensureVideo(target) {
  if (fs.existsSync(target)) return target;
  fs.mkdirSync(path.dirname(target), { recursive: true });
  const ffmpeg = path.resolve(__dirname, '..', 'backend', 'bin', process.platform === 'win32' ? 'ffmpeg.exe' : 'ffmpeg');
  const result = spawnSync(fs.existsSync(ffmpeg) ? ffmpeg : 'ffmpeg', [
    '-hide_banner', '-loglevel', 'error', '-f', 'lavfi', '-i',
    'testsrc2=size=640x360:rate=24:duration=6', '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-y', target,
  ], { windowsHide: true, timeout: 30000 });
  if (result.error || result.status !== 0) throw new Error(`Test videosu üretilemedi: ${result.error?.message || result.stderr?.toString()}`);
  return target;
}
module.exports = { ensureVideo };
