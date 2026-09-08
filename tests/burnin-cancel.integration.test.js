'use strict';

const assert = require('assert');
const childProcess = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { removeFileQuietly, terminateProcessTree } = require('../src/burnin-output');

async function main() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-burnin-cancel-'));
  const partial = path.join(root, 'yarım çıktı.tmp.mp4');
  let job = null;
  const startedAt = Date.now();
  try {
    job = childProcess.spawn('ffmpeg', [
      '-y', '-v', 'error', '-re', '-f', 'lavfi', '-i', 'testsrc2=s=160x90:d=30',
      '-movflags', 'frag_keyframe+empty_moov', partial,
    ], { windowsHide: true, stdio: 'ignore' });
    await new Promise((resolve, reject) => {
      job.once('error', reject);
      const deadline = Date.now() + 5000;
      const timer = setInterval(() => {
        if (fs.existsSync(partial) && fs.statSync(partial).size > 0) {
          clearInterval(timer);
          resolve();
        } else if (Date.now() > deadline) {
          clearInterval(timer);
          reject(new Error('ffmpeg yarım dosyası oluşmadı'));
        }
      }, 50);
    });
    assert.equal(terminateProcessTree(job), true);
    await new Promise((resolve) => job.once('close', resolve));
    assert(Date.now() - startedAt < 10000, 'iptal edilen ffmpeg süreç ağacı zamanında kapanmadı');
    removeFileQuietly(partial);
    assert.equal(fs.existsSync(partial), false, 'iptal edilen burn-in yarım dosyası temizlenmedi');
    console.log('  PASS  gerçek ffmpeg iptalinde süreç ağacı kapandı ve yarım çıktı temizlendi');
  } finally {
    if (job && job.exitCode === null) {
      try { terminateProcessTree(job); } catch (_) {}
    }
    fs.rmSync(root, { recursive: true, force: true });
  }
}

main().catch((error) => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
