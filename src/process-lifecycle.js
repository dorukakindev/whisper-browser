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
      try { if (group(-proc.pid, 'SIGKILL')) return true; } catch (_) {}
    }
    try {
      if (proc.kill('SIGKILL')) return true;
    } catch (_) {}
    // No signal was delivered. Keep the live child owned by its caller, but
    // allow another explicit stop attempt after the underlying failure clears.
    proc._terminating = false;
    onWarning('Süreç durdurulamadı; kapanması bekleniyor.');
    return false;
  };
  if (platform !== 'win32' || !Number.isInteger(proc.pid) || proc.pid <= 0) {
    return fallback();
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
  } catch (_) { return fallback(); }
  return true;
}

// A UI Stop button needs confirmed closure, not merely a spawned taskkill.
// Failure leaves the owning job live and permits another explicit Stop request.
function terminateProcessTreeAndWait(proc, options = {}) {
  if (!proc || proc.exitCode != null || proc.signalCode != null) return Promise.resolve(true);
  const waitMs = Number.isFinite(options.waitMs) ? Math.max(1, options.waitMs) : 6500;
  return new Promise(resolve => {
    let timer, settled = false;
    const closed = () => proc.exitCode != null || proc.signalCode != null;
    const finish = value => {
      if (settled) return;
      settled = true; clearTimeout(timer); proc.removeListener?.('close', onClose); resolve(value);
    };
    const onClose = () => finish(true);
    proc.once?.('close', onClose);
    timer = setTimeout(() => finish(closed()), waitMs);
    try {
      const requested = terminateProcessTree(proc, options);
      if (!requested && !proc._terminating) finish(closed());
    } catch (_) { finish(closed()); }
  });
}

module.exports = { terminateProcessTree, terminateProcessTreeAndWait };
