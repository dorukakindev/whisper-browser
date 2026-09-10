'use strict';

const fs = require('fs');
const path = require('path');

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, Math.max(0, Number(ms) || 0)));
}

async function waitForChildClose(child, timeoutMs, wait = delay) {
  if (!child || child.exitCode !== null) return true;
  let listener;
  const closed = new Promise((resolve) => {
    listener = () => resolve(true);
    child.once('close', listener);
  });
  const result = await Promise.race([closed, wait(timeoutMs).then(() => false)]);
  if (!result && listener) child.removeListener('close', listener);
  return result;
}

function waitForKiller(killer, timeoutMs, wait = delay) {
  if (!killer || typeof killer.once !== 'function') return Promise.resolve();
  let onClose;
  let onError;
  const settled = new Promise((resolve) => {
    const finish = () => {
      killer.removeListener('close', onClose);
      killer.removeListener('error', onError);
      resolve();
    };
    onClose = finish;
    onError = finish;
    killer.once('close', onClose);
    killer.once('error', onError);
  });
  return Promise.race([settled, wait(timeoutMs)]).finally(() => {
    killer.removeListener('close', onClose);
    killer.removeListener('error', onError);
  });
}

async function terminateProcessTree(child, options = {}) {
  if (!child) return { terminated: true, forced: false };
  const platform = options.platform || process.platform;
  const spawnFn = options.spawnFn;
  const wait = options.wait || delay;
  const graceMs = Math.max(0, Number(options.graceMs ?? 250));
  const forceWaitMs = Math.max(0, Number(options.forceWaitMs ?? 1500));
  if (typeof options.requestCancel === 'function') options.requestCancel();
  if (await waitForChildClose(child, graceMs, wait)) return { terminated: true, forced: false };

  // Kapanış dinleyicisini zorla sonlandırmadan önce kur. taskkill çok hızlı
  // tamamlanırsa, onu beklerken ChildProcess "close" olayı kaçmamalı.
  let forcedClose = waitForChildClose(child, forceWaitMs, wait);
  if (platform === 'win32' && child.pid && typeof spawnFn === 'function') {
    let killer = null;
    try {
      killer = spawnFn('taskkill', ['/pid', String(child.pid), '/T', '/F'], { windowsHide: true });
      await waitForKiller(killer, forceWaitMs, wait);
    } catch (_) {
      try { child.kill('SIGKILL'); } catch (_) {}
    }
  } else {
    try { child.kill('SIGTERM'); } catch (_) {}
    if (!(await forcedClose)) {
      try { child.kill('SIGKILL'); } catch (_) {}
      forcedClose = waitForChildClose(child, forceWaitMs, wait);
    }
  }
  const terminated = await forcedClose;
  return { terminated, forced: true };
}

function createJobTerminalGate(cleanup) {
  let settled = false;
  let cleanupCount = 0;
  return {
    settle(callback) {
      if (settled) return false;
      settled = true;
      try {
        if (typeof cleanup === 'function') cleanup();
      } finally {
        cleanupCount++;
      }
      if (typeof callback === 'function') callback();
      return true;
    },
    get settled() { return settled; },
    get cleanupCount() { return cleanupCount; },
  };
}

function createIdempotentCancel(action) {
  let promise = null;
  return () => {
    if (!promise) promise = Promise.resolve().then(action);
    return promise;
  };
}

function removeQuietly(filePath, fsImpl = fs) {
  try { fsImpl.unlinkSync(filePath); }
  catch (error) { if (!error || error.code !== 'ENOENT') throw error; }
}

function replaceRecoveredFile(source, destination, token, fsImpl = fs) {
  if (!fsImpl.existsSync(destination)) {
    fsImpl.renameSync(source, destination);
    return;
  }
  const displaced = `${destination}.${token}.recovery-old`;
  removeQuietly(displaced, fsImpl);
  fsImpl.renameSync(destination, displaced);
  try {
    fsImpl.renameSync(source, destination);
    removeQuietly(displaced, fsImpl);
  } catch (error) {
    try { removeQuietly(destination, fsImpl); } catch (_) {}
    try { fsImpl.renameSync(displaced, destination); } catch (_) {}
    throw error;
  }
}

function recoverOutputTransactions(outputDir, options = {}) {
  const fsImpl = options.fsImpl || fs;
  const root = path.resolve(String(outputDir || ''));
  const ownerPid = Number(options.ownerPid || 0);
  const summary = { recovered: 0, errors: [] };
  if (!outputDir || !fsImpl.existsSync(root)) return summary;

  let journalNames;
  try {
    journalNames = fsImpl.readdirSync(root).filter((name) =>
      /^\.whisper-output-transaction-[a-f0-9]{32}\.json$/i.test(name));
  } catch (error) {
    summary.errors.push(error.message);
    return summary;
  }

  for (const name of journalNames) {
    const journal = path.join(root, name);
    try {
      const data = JSON.parse(fsImpl.readFileSync(journal, 'utf8'));
      if (ownerPid && Number(data.owner_pid) !== ownerPid) continue;
      if (!Array.isArray(data.entries)) continue;
      const entries = data.entries;
      const local = entries.every((entry) => entry && ['final', 'staged', 'backup'].every(
        (key) => typeof entry[key] === 'string' && path.dirname(path.resolve(entry[key])) === root));
      if (!local) continue;

      if (data.state !== 'committed') {
        for (const entry of [...entries].reverse()) {
          if (entry.existed && fsImpl.existsSync(entry.backup)) {
            const recovery = `${entry.final}.${path.basename(journal)}.recovery`;
            fsImpl.copyFileSync(entry.backup, recovery);
            replaceRecoveredFile(recovery, entry.final, path.basename(journal), fsImpl);
          } else if (!entry.existed) {
            removeQuietly(entry.final, fsImpl);
          }
        }
      }
      for (const entry of entries) {
        removeQuietly(entry.staged, fsImpl);
        removeQuietly(entry.backup, fsImpl);
      }
      removeQuietly(`${journal}.tmp`, fsImpl);
      removeQuietly(journal, fsImpl);
      summary.recovered++;
    } catch (error) {
      summary.errors.push(`${name}: ${error.message}`);
    }
  }
  return summary;
}

module.exports = {
  createIdempotentCancel,
  createJobTerminalGate,
  recoverOutputTransactions,
  terminateProcessTree,
  waitForChildClose,
};
