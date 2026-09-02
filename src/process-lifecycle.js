'use strict';

// Keep ownership until the CHILD closes, not until taskkill exits. A failed
// cancellation must never make a still-running process look idle.
function terminateProcessTree(proc, { spawn, platform = process.platform, onWarning = () => {} }) {
  if (!proc || proc.exitCode != null || proc.signalCode != null) return false;
  let fallbackUsed = false;
  const fallback = () => {
    if (fallbackUsed || proc.exitCode != null || proc.signalCode != null) return;
    fallbackUsed = true;
    try {
      if (!proc.kill('SIGKILL')) onWarning('Süreç durdurulamadı; kapanması bekleniyor.');
    } catch (_) { onWarning('Süreç durdurulamadı; kapanması bekleniyor.'); }
  };
  if (platform !== 'win32' || !Number.isInteger(proc.pid) || proc.pid <= 0) {
    fallback();
    return true;
  }
  try {
    const killer = spawn('taskkill', ['/pid', String(proc.pid), '/T', '/F'], { windowsHide: true });
    killer.once('error', fallback);
    killer.once('exit', (code) => { if (code !== 0) fallback(); });
  } catch (_) { fallback(); }
  return true;
}

module.exports = { terminateProcessTree };
