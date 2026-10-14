(function (root) {
  'use strict';
  class BrowserDubAudio {
    constructor({ audio, context, mute, changed = () => {}, error = () => {},
      now = () => Date.now(), urls = URL }) {
      Object.assign(this, { audio, context, mute, changed, error, now, urls });
      this.session = null; this.sample = null; this.offset = 0; this.playPending = false;
      this.cleanup = Promise.resolve();
      audio.addEventListener('loadedmetadata', () => this.tick());
      audio.addEventListener('error', () => this.fail('Ses dosyası açılamadı. WAV veya MP3 deneyin.'));
      audio.addEventListener('ended', () => this.changed(this.session, 'Dublaj sona erdi'));
    }
    matches(s = this.session) {
      const c = this.context();
      return !!s && c.mode === 'browser' && c.visible !== false && c.tabId === s.tabId
        && c.mediaKey === s.mediaKey && c.generation === s.generation;
    }
    async attach(file, c) {
      const priorMuted = this.session?.tabId === c.tabId ? this.session.priorMuted : c.priorMuted;
      await this.remove();
      if (!file || !c.tabId || !c.mediaKey || c.mode !== 'browser') return false;
      const s = { ...c, priorMuted, name: file.name, range: file.range || null, muted: false, url: null };
      if (s.range && (!Number.isFinite(s.range.start) || !Number.isFinite(s.range.end) || s.range.start < 0 || s.range.end <= s.range.start)) return false;
      this.session = s; this.sample = null; this.offset = 0;
      this.timer = setInterval(() => this.tick(), 200);
      this.changed(s, '');
      s.desiredMuted = s.range ? !!priorMuted : true;
      s.mutePromise = Promise.resolve(this.mute(s.tabId, s.desiredMuted)).then(result => {
        s.muted = !!result?.ok && s.desiredMuted;
        return result;
      });
      try {
        const result = await s.mutePromise;
        if (this.session !== s) return false;
        if (!result?.ok) { await this.remove(); this.error('Video sesi kapatılamadı; dublaj başlatılmadı.'); return false; }
        if (!this.matches()) { await this.remove(); return false; }
        s.isBlob = !file.url;
        s.url = file.url || this.urls.createObjectURL(file);
        this.audio.src = s.url; this.audio.load();
        this.changed(s, 'Dublaj açık');
        return true;
      } catch (_) {
        if (this.session === s) await this.fail('Dublaj başlatılamadı; video sesi geri açıldı.');
        return false;
      }
    }
    async remove() {
      const s = this.session; this.session = null; this.sample = null;
      clearInterval(this.timer); this.timer = null;
      this.audio.pause(); this.audio.removeAttribute('src'); this.audio.load();
      if (s?.url && s.isBlob) this.urls.revokeObjectURL(s.url);
      this.changed(null, '');
      if (!s) return this.cleanup;
      this.cleanup = this.cleanup.then(async () => {
        try {
          await s.mutePromise;
          if (s.muted) {
            const restored = await this.mute(s.tabId, !!s.priorMuted);
            if (!restored?.ok) this.error('Video sesi geri yüklenemedi; sekmenin ses düğmesini kullanın.');
          }
        } catch (_) { this.error('Video sesi geri yüklenemedi; sekmenin ses düğmesini kullanın.'); }
      });
      return this.cleanup;
    }
    async fail(message) { await this.remove(); this.error(message); }
    rangeMute(s, desired) {
      if (s.desiredMuted === desired) return;
      s.desiredMuted = desired;
      s.mutePromise = s.mutePromise.then(async () => {
        if (this.session !== s) return;
        const result = await this.mute(s.tabId, desired);
        if (!result?.ok) throw new Error('mute failed');
        s.muted = desired;
      }).then(() => { if (this.session === s) this.tick(); }).catch(() => {
        if (this.session === s) void this.fail('Video sesi değiştirilemedi; dublaj durduruldu.');
      });
    }
    update(media) { this.sample = { ...media, at: this.now() }; this.tick(); }
    tick() {
      const s = this.session;
      if (!s) return;
      if (!this.matches()) { void this.remove(); return; }
      const m = this.sample, a = this.audio;
      if (!s.url || !m || this.now() - m.at > 2200 || m.adPlaying
          || m.spinnerVisible || (m.readyState !== undefined && m.readyState < 3)) {
        if (s.range) this.rangeMute(s, !!s.priorMuted);
        a.pause(); return;
      }
      const rate = Math.max(0.25, Math.min(4, Number(m.playbackRate) || 1));
      const playing = !m.paused && !m.ended;
      const videoTime = Math.max(0, Number(m.currentTime) || 0)
        + (playing ? Math.max(0, this.now() - m.at) / 1000 * rate : 0) - this.offset;
      const target = videoTime - (s.range?.start || 0);
      if (s.range) {
        const inside = videoTime >= s.range.start && videoTime < s.range.end && a.readyState > 0;
        this.rangeMute(s, inside || !!s.priorMuted);
        if (!inside || !s.muted) { a.pause(); return; }
      }
      a.playbackRate = rate;
      const end = Number.isFinite(a.duration) ? a.duration : Infinity;
      const ended = target >= end;
      if (!!s.ended !== ended) {
        s.ended = ended; this.changed(s, ended ? 'Dublaj sona erdi' : 'Dublaj açık');
      }
      const seek = Math.max(0, Math.min(target, end));
      if (a.readyState > 0 && Math.abs(a.currentTime - seek) > 0.25) {
        try { a.currentTime = seek; } catch (_) { /* metadata not seekable yet */ }
      }
      if (!playing || target < 0 || target >= end) { a.pause(); return; }
      if (a.paused && !this.playPending && a.readyState > 0) {
        this.playPending = true;
        Promise.resolve(a.play()).then(() => {
          if (this.session !== s || !this.matches(s) || this.sample?.paused
              || this.sample?.adPlaying || this.sample?.spinnerVisible) a.pause();
        }).catch(() => {
          if (this.session === s) void this.fail('Dublaj başlatılamadı; video sesi geri açıldı.');
        }).finally(() => { this.playPending = false; });
      }
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = BrowserDubAudio;
  else root.BrowserDubAudio = BrowserDubAudio;
})(typeof window === 'undefined' ? globalThis : window);
