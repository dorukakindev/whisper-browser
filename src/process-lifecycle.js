'use strict';

// Keep ownership until the CHILD closes, not until taskkill exits. A failed
// cancellation must never make a still-running process look idle.
function terminateProcessTree(proc, { spawn, platform = process.platform, onWarning = () => {},
  setTimeoutFn = setTimeout, clearTimeoutFn = clearTimeout, killFn = null }) {
  if (!proc || proc.exitCode != null || proc.signalCode != null || proc._terminating) return false;
  // UI iptali ile ust sure siniri ayni anda calisabilir. Ilk cagri sahiplenir;
  // sonraki cagri yeni taskkill/fallback zinciri baslatmaz.
  proc._terminating = true;
  let fallbackUsed = false;
  const fallback = () => {
    if (fallbackUsed || proc.exitCode != null || proc.signalCode != null) return;
    fallbackUsed = true;
    // Madde 29 (POSIX): detached:true ile grup lideri yapılan çocuklar için
    // -pid sinyali TÜM süreç grubunu öldürür — python'un ffmpeg/yt-dlp torunları
    // yetim kalmaz. Çocuk grup lideri değilse kill(-pid) ESRCH verir ve tek
    // süreç kill'ine düşeriz.
    if (platform !== 'win32' && Number.isInteger(proc.pid) && proc.pid > 0) {
      const group = killFn || ((pid, sig) => process.kill(pid, sig));
      try { if (group(-proc.pid, 'SIGKILL')) return; } catch (_) {}
    }
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
    const timer = setTimeoutFn(() => {
      cleanup();
      fallback();
      try { killer.kill?.(); } catch (_) {}
    }, 5000);
    timer?.unref?.();
    const cleanup = () => {
      clearTimeoutFn(timer);
      proc.removeListener?.('close', cleanup);
    };
    proc.once?.('close', cleanup);
    killer.once('error', () => { cleanup(); fallback(); });
    killer.once('exit', (code) => { if (code !== 0) { cleanup(); fallback(); } });
  } catch (_) { fallback(); }
  return true;
}

module.exports = { terminateProcessTree };
