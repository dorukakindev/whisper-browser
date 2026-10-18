'use strict';
const fs = require('node:fs');
const path = require('node:path');

function prepareVoiceReference({ source, start, end, reference, transcript, appRoot, python, ffmpeg,
  spawn, terminate, environment, onProcess, status, isCancelled }) {
  if (isCancelled()) throw new Error('Cancelled.');
  const child = spawn(python, [path.join(appRoot, 'backend', 'voice_reference.py'), '--source', source,
    '--start', String(start), '--end', String(end), '--output', reference, '--transcript', transcript,
    '--ffmpeg', ffmpeg], { cwd: appRoot, env: { ...environment(), PYTHONUTF8: '1', PYTHONIOENCODING: 'utf-8' }, windowsHide: true });
  onProcess(child);
  return new Promise((resolve, reject) => {
    let pending = '', failure = '', finished = false, timedOut = false;
    const timer = setTimeout(() => {
      timedOut = true;
      Promise.resolve().then(() => terminate(child)).catch(() => {});
      try { child.kill?.('SIGKILL'); } catch (_) {}
      const error = new Error('Reference preparation timed out.');
      error.processActive = child.exitCode == null && child.signalCode == null;
      done(error);
    }, 10 * 60 * 1000);
    const done = error => {
      if (finished) return; finished = true; clearTimeout(timer); if (!error?.processActive) onProcess(null);
      error ? reject(error) : resolve();
    };
    child.stdout.setEncoding('utf8'); child.stderr.resume();
    child.stdout.on('data', text => {
      pending = (pending + text).slice(-16384);
      const lines = pending.split(/\r?\n/); pending = lines.pop();
      for (const line of lines) {
        if (line.startsWith('VOICE_REFERENCE ')) status(line.slice(16).trim());
        if (line.startsWith('VOICE_REFERENCE_ERROR ')) {
          try { const value = JSON.parse(line.slice(22)); if (typeof value === 'string') failure = value.slice(0, 500); } catch (_) {}
        }
      }
    });
    child.once('error', () => done(new Error('Reference process could not start.')));
    child.once('close', code => done(code === 0 && !timedOut && fs.existsSync(reference) && fs.existsSync(transcript)
      ? null : new Error(timedOut ? 'Reference preparation timed out.' : failure || 'Reference preparation failed. Select clear speech and check the source.')));
  });
}
module.exports = { prepareVoiceReference };
