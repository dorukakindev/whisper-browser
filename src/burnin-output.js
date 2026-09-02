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

function normalizeBurninRecovery(raw) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const videoPath = typeof raw.videoPath === 'string' ? raw.videoPath.trim() : '';
  const subPath = typeof raw.subPath === 'string' ? raw.subPath.trim() : '';
  const tempPath = typeof raw.tempPath === 'string' ? raw.tempPath.trim() : '';
  const outPath = typeof raw.outPath === 'string' ? raw.outPath.trim() : '';
  if (!videoPath || !subPath || !tempPath || !outPath) return null;
  return {
    version: 1,
    id: String(raw.id || '').slice(0, 100) || randomUUID(),
    videoPath: videoPath.slice(0, 8000),
    subPath: subPath.slice(0, 8000),
    tempPath: tempPath.slice(0, 8000),
    outPath: outPath.slice(0, 8000),
    pid: Number.isSafeInteger(Number(raw.pid)) && Number(raw.pid) > 0 ? Number(raw.pid) : null,
    totalSec: Math.max(0, Number(raw.totalSec) || 0),
    startedAt: Math.max(0, Number(raw.startedAt) || 0),
  };
}

function burninTempLooksComplete({ size = 0, duration = 0, totalSec = 0 } = {}) {
  const bytes = Number(size) || 0;
  const actual = Number(duration) || 0;
  const expected = Number(totalSec) || 0;
  if (bytes < 1024 || actual <= 0) return false;
  if (expected <= 0) return true;
  return actual >= Math.max(expected * 0.99, expected - 1);
}

function burninRecoveryPathsMatch(recovery) {
  const item = normalizeBurninRecovery(recovery);
  if (!item) return false;
  const expected = burninOutputPaths(item.videoPath, 'token');
  if (path.resolve(item.outPath) !== path.resolve(expected.outPath)) return false;
  if (path.dirname(path.resolve(item.tempPath)) !== path.dirname(path.resolve(expected.tempPath))) return false;
  const base = path.basename(item.videoPath, path.extname(item.videoPath))
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(`^${base}\\.altyazili\\.[^.\\/]+\\.tmp\\.mp4$`, 'i')
    .test(path.basename(item.tempPath));
}

module.exports = {
  burninOutputPaths,
  burninRecoveryPathsMatch,
  burninTempLooksComplete,
  normalizeBurninRecovery,
  removeFileQuietly,
  replaceBurninOutput,
};
