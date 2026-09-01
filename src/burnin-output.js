'use strict';

const fs = require('fs');
const path = require('path');
const { randomUUID } = require('crypto');

function burninOutputPaths(videoPath, token = randomUUID()) {
  const dir = path.dirname(videoPath);
  const base = path.basename(videoPath, path.extname(videoPath));
  return {
    outPath: path.join(dir, `${base}.altyazili.mp4`),
    tempPath: path.join(dir, `${base}.altyazili.${token}.tmp.mp4`),
  };
}

function removeFileQuietly(filePath, fsImpl = fs) {
  if (!filePath) return;
  try { fsImpl.unlinkSync(filePath); }
  catch (error) { if (!error || error.code !== 'ENOENT') throw error; }
}

function replaceBurninOutput(tempPath, outPath, fsImpl = fs, token = randomUUID()) {
  if (!fsImpl.existsSync(outPath)) {
    fsImpl.renameSync(tempPath, outPath);
    return;
  }
  const backupPath = `${outPath}.${token}.replace-backup`;
  fsImpl.renameSync(outPath, backupPath);
  try {
    fsImpl.renameSync(tempPath, outPath);
    removeFileQuietly(backupPath, fsImpl);
  } catch (error) {
    try { removeFileQuietly(outPath, fsImpl); } catch (_) {}
    try { fsImpl.renameSync(backupPath, outPath); } catch (_) {}
    throw error;
  }
}

module.exports = { burninOutputPaths, removeFileQuietly, replaceBurninOutput };
