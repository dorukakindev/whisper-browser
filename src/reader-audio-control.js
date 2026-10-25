(function (root, factory) {
  if (typeof module === "object" && module.exports) module.exports = factory();
  else root.ReaderAudioControl = factory();
})(typeof window === "object" ? window : globalThis, () => {
  "use strict";
  function create(
    audio,
    {
      position = 0,
      autoplay = false,
      isCurrent = () => true,
      onError = () => {},
      timeoutMs = 10000,
      errors = {},
    } = {},
  ) {
    let disposed = false,
      explicitSeek = false,
      sequence = 0,
      cancelWait = null;
    const current = () => !disposed && isCurrent();
    const report = (message) => {
      if (current()) onError(Error(message));
    };
    function ready() {
      if (audio.readyState >= 1) return Promise.resolve(true);
      return new Promise((resolve) => {
        let timer;
        const finish = (value) => {
          clearTimeout(timer);
          audio.removeEventListener("loadedmetadata", loaded);
          audio.removeEventListener("error", failed);
          cancelWait = null;
          resolve(value);
        };
        const loaded = () => finish(true);
        const failed = () => {
          report(errors.unavailable || "Audio could not be loaded.");
          finish(false);
        };
        cancelWait = () => finish(false);
        audio.addEventListener("loadedmetadata", loaded);
        audio.addEventListener("error", failed);
        timer = setTimeout(() => {
          report(errors.timeout || "Audio metadata timed out.");
          finish(false);
        }, timeoutMs);
      });
    }
    async function playFrom(start) {
      if (!current()) return false;
      if (!Number.isFinite(start) || start < 0) {
        report(errors.range || "Invalid audio range.");
        return false;
      }
      explicitSeek = true;
      const request = ++sequence;
      cancelWait?.();
      audio.pause();
      if (!(await ready()) || !current() || request !== sequence) return false;
      if (!Number.isFinite(audio.duration) || start >= audio.duration) {
        report(errors.range || "Invalid audio range.");
        return false;
      }
      try {
        audio.currentTime = start;
        await audio.play();
        if (!current()) audio.pause();
        return current() && request === sequence;
      } catch (error) {
        if (error?.name === "AbortError" && audio.paused) return false;
        if (current() && request === sequence) onError(error);
        return false;
      }
    }
    function restore() {
      if (!current() || explicitSeek) return;
      if (
        Number.isFinite(position) &&
        position > 0 &&
        position < audio.duration - 1
      )
        audio.currentTime = position;
      if (autoplay) void playFrom(audio.currentTime || 0);
    }
    audio.addEventListener("loadedmetadata", restore);
    if (audio.readyState >= 1) restore();
    return {
      playFrom,
      dispose() {
        disposed = true;
        sequence++;
        cancelWait?.();
        audio.removeEventListener("loadedmetadata", restore);
      },
    };
  }
  return { create };
});
