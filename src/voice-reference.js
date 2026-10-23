'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { validVoiceOutput } = require('./voice-output');

function prepareVoiceReference({ source, start, end, reference, transcript, appRoot, python, ffmpeg,
  spawn, terminate, environment, onProcess, status, isCancelled, setTimeoutFn=setTimeout, clearTimeoutFn=clearTimeout }) {
  if (isCancelled()) throw new Error('Cancelled.');
  const child = spawn(python, [path.join(appRoot, 'backend', 'voice_reference.py'), '--source', source,
    '--start', String(start), '--end', String(end), '--output', reference, '--transcript', transcript,
    '--ffmpeg', ffmpeg], { cwd: appRoot, env: { ...environment(), PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }, windowsHide: true });
  onProcess(child);
  return new Promise((resolve, reject) => {
    let pending = '', failure = '', finished = false, timedOut = false, workerError = false;
    const timer = setTimeoutFn(() => {
      timedOut = true;
      status('stopping');
      // Killing just the parent can orphan ffmpeg/yt-dlp before taskkill /T
      // reaches them. Keep ownership until close, including failed stops.
      Promise.resolve().then(() => terminate(child)).then(stopped => {
        if (!finished && stopped === false) status('stop_failed');
      }).catch(() => { if (!finished) status('stop_failed'); });
    }, 10 * 60 * 1000);
    timer.unref?.();
    const done = error => {
      if (finished) return; finished = true; clearTimeoutFn(timer); onProcess(null);
      error ? reject(error) : resolve();
    };
    child.stdout.setEncoding('utf8'); child.stderr.resume();
    child.stdout.on('data', text => {
      pending = (pending + text).slice(-16384);
      const lines = pending.split(/\r?\n/); pending = lines.pop();
      for (const line of lines) {
        if (!timedOut && !workerError && line.startsWith('VOICE_REFERENCE ')) status(line.slice(16).trim());
        if (line.startsWith('VOICE_REFERENCE_ERROR ')) {
          try { const value = JSON.parse(line.slice(22)); if (typeof value === 'string') failure = value.slice(0, 500); } catch (_) {}
        }
      }
    });
    // An error can mean a failed kill/send while the worker is still alive.
    child.on('error', () => { workerError = true; });
    child.once('close', code => done(code === 0 && !workerError && !timedOut && !isCancelled() && validVoiceOutput(reference) && fs.existsSync(transcript)
      ? null : new Error(timedOut ? 'Reference preparation timed out.' : failure || (workerError ? 'Reference process failed.' : '') || 'Reference preparation failed. Select clear speech and check the source.')));
  });
}
module.exports = { prepareVoiceReference };
