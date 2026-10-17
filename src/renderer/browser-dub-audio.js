(function (root) {
  'use strict';
  const SyncMap = typeof module !== 'undefined' && module.exports ? require('./dub-sync-map') : root.DubSyncMap;
  class BrowserDubAudio {
    constructor({ audio, context, mute, changed = () => {}, error = () => {},
      now = () => Date.now(), urls = URL, setRate, backgroundAudio }) {
      Object.assign(this, { audio, context, mute, changed, error, now, urls, setRate, backgroundAudio });
      this.session = null; this.sample = null; this.offset = 0;
      this.cleanup = Promise.resolve();
      this.intent = 0;
      audio.addEventListener('loadedmetadata', () => this.tick());
      audio.addEventListener('error', () => this.fail('Ses dosyası açılamadı. WAV veya MP3 deneyin.'));
      audio.addEventListener('ended', () => this.changed(this.session, 'Dublaj sona erdi'));
      backgroundAudio?.addEventListener('loadedmetadata',()=>this.tick());
      backgroundAudio?.addEventListener('error',()=>this.fail('Arka plan sesi açılamadı.'));
    }
    matches(s = this.session) {
      const c = this.context();
      return !!s && ['browser', 'player'].includes(c.mode) && c.mode === s.mode && c.visible !== false && c.tabId === s.tabId
        && c.mediaKey === s.mediaKey && c.generation === s.generation;
    }
    async attach(file, c) {
      const intent = ++this.intent;
      const priorMuted = this.session?.tabId === c.tabId ? this.session.priorMuted : c.priorMuted;
      const priorRate = this.session?.tabId === c.tabId && this.session.sync ? this.session.baseRate : c.playbackRate;
      await this.detachCurrent();
      if (intent !== this.intent) return false;
      if (!file || !c.tabId || !c.mediaKey || !['browser', 'player'].includes(c.mode)) return false;
      const s = { ...c, priorMuted, name: file.name, range: file.range || null, muted: false, url: null };
      try { s.sync = SyncMap.validate(file.sync); } catch (_) { this.error('Geçersiz dublaj zaman haritası.'); return false; }
      if (s.sync && !this.setRate) return false;
      s.background = file.background || null;
      if (s.background && !this.backgroundAudio) return false;
      s.baseRate = Math.max(.25, Math.min(4, Number(priorRate) || 1));
      s.ratePromise = Promise.resolve(); s.rateAt = -Infinity;
      if (s.range && (!Number.isFinite(s.range.start) || !Number.isFinite(s.range.end) || s.range.start < 0 || s.range.end <= s.range.start)) return false;
      this.session = s; this.sample = null; this.offset = 0;
      this.timer = setInterval(() => this.tick(), 200);
      this.changed(s, '');
      s.desiredMuted = s.range ? !!priorMuted : true;
      s.mutePromise = Promise.resolve().then(() => this.mute(s.tabId, s.desiredMuted)).then(result => {
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
        if (s.background) { this.backgroundAudio.src=s.background.url; this.backgroundAudio.load(); }
        this.changed(s, 'Dublaj açık');
        return true;
      } catch (_) {
        if (this.session === s) await this.fail('Dublaj başlatılamadı; video sesi geri açıldı.');
        return false;
      }
    }
    remove() { ++this.intent; return this.detachCurrent(); }
    async detachCurrent() {
      const s = this.session; this.session = null; this.sample = null;
      clearInterval(this.timer); this.timer = null;
      this.pauseAll(); this.audio.removeAttribute('src'); this.audio.load();
      if (this.backgroundAudio) { this.backgroundAudio.removeAttribute('src'); this.backgroundAudio.load(); }
      if (s?.url && s.isBlob) this.urls.revokeObjectURL(s.url);
      this.changed(null, '');
      if (!s) return this.cleanup;
      this.cleanup = this.cleanup.then(async () => {
        if (s.sync) {
          try {
            await s.ratePromise;
            const result = await this.setRate({tabId:s.tabId,generation:s.generation,mediaId:s.mediaId||'',rate:s.baseRate,baseRate:s.baseRate,release:true});
            if (!result?.ok) this.error('Video hızı geri yüklenemedi; hız ayarını kontrol edin.');
          } catch (_) { this.error('Video hızı geri yüklenemedi; hız ayarını kontrol edin.'); }
        }
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
    pauseAll() {
      if (this.session) {
        const s = this.session;
        s.voiceWanted = s.backgroundWanted = false;
        s.voiceEpoch = (s.voiceEpoch || 0) + 1; s.backgroundEpoch = (s.backgroundEpoch || 0) + 1;
        s.playPending = s.backgroundPlayPending = false;
      }
      this.audio.pause(); this.backgroundAudio?.pause();
    }
    syncBackground(s,time,rate,playing) {
      const b=this.backgroundAudio;
      if (!s.background || !b || b.readyState<=0) return;
      b.playbackRate=rate;
      if (Math.abs(b.currentTime-time)>.25) { try { b.currentTime=Math.max(0,time); } catch (_) {} }
      s.backgroundWanted = playing && time>=0 && time<b.duration;
      if (!s.backgroundWanted) { s.backgroundEpoch = (s.backgroundEpoch || 0)+1; s.backgroundPlayPending=false; b.pause();return; }
      if (b.paused && !s.backgroundPlayPending) {
        s.backgroundPlayPending=true;
        const epoch = s.backgroundEpoch = (s.backgroundEpoch || 0)+1;
        Promise.resolve(b.play()).then(()=>{
          if (this.session===s && (epoch===s.backgroundEpoch || !s.backgroundWanted) && (!s.backgroundWanted || !this.matches(s) || this.sample?.paused || this.sample?.adPlaying || this.sample?.spinnerVisible || this.now()-this.sample.at>2200)) b.pause();
        }).catch(()=>{ if (this.session===s && epoch===s.backgroundEpoch && s.backgroundWanted) void this.fail('Arka plan sesi başlatılamadı.'); })
          .finally(()=>{if(epoch===s.backgroundEpoch)s.backgroundPlayPending=false;});
      }
    }
    setBaseRate(rate) {
      if (this.session?.sync && Number.isFinite(Number(rate))) this.session.baseRate = Math.max(.25,Math.min(4,Number(rate)));
    }
    videoRate(s, desired, release = false) {
      if (s.ratePending || (desired === s.requestedRate && release === s.requestedRelease && this.now() - s.rateAt < 700)) return;
      s.requestedRate = desired; s.requestedRelease = release;
      s.ratePending = true; s.rateAt = this.now();
      const requestedAt=this.now();
      s.ratePromise = s.ratePromise.then(async () => {
        if (this.session !== s) return;
        const result = await this.setRate({tabId:s.tabId,generation:s.generation,mediaId:s.mediaId||'',rate:desired,baseRate:s.baseRate,release});
        if (!result?.ok) throw new Error('rate failed');
        if (this.session===s && this.sample) {
          const m=this.sample, observed=result.media || {};
          const actual=Number.isFinite(observed.playbackRate)?observed.playbackRate:desired;
          if (m.at<=requestedAt) {
            const current=Number.isFinite(observed.currentTime)?observed.currentTime:
              Number(m.currentTime||0)+(m.paused?0:Math.max(0,this.now()-m.at)/1000*(Number(m.playbackRate)||1));
            this.sample={...m,currentTime:current,playbackRate:actual,at:this.now()};
          } else this.sample={...m,playbackRate:actual};
          this.tick();
        }
      }).catch(() => {
        if (this.session === s) void this.fail('Video hızı değiştirilemedi; dublaj durduruldu.');
      }).finally(() => { s.ratePending = false; });
    }
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
        if (s.range || s.sync || s.background) this.rangeMute(s, !!s.priorMuted);
        if (s.sync) this.videoRate(s, s.baseRate, true);
        this.pauseAll(); return;
      }
      const rate = Math.max(0.0625, Math.min(4, Number(m.playbackRate) || 1));
      const playing = !m.paused && !m.ended;
      const videoTime = Math.max(0, Number(m.currentTime) || 0)
        + (playing ? Math.max(0, this.now() - m.at) / 1000 * rate : 0) - this.offset;
      const localTime = videoTime - (s.range?.start || 0);
      const mapped = SyncMap.at(s.sync, localTime);
      const target = mapped.time;
      if (s.range || s.sync || s.background) {
        const stop = s.range?.end ?? s.sync?.videoDuration ?? (Number.isFinite(this.backgroundAudio?.duration) ? this.backgroundAudio.duration : Infinity);
        const inside = videoTime >= (s.range?.start || 0) && videoTime < stop && a.readyState > 0;
        this.rangeMute(s, inside || !!s.priorMuted);
        if (!inside || !s.muted) {
          if (s.sync && !inside) this.videoRate(s,s.baseRate,true);
          this.pauseAll(); return;
        }
      }
      this.syncBackground(s,localTime,rate,playing);
      if (s.sync) {
        const desired = Math.max(.0625, Math.min(4, s.baseRate / mapped.factor));
        if (rate * mapped.factor > 16) { void this.fail('Bu bölümün zaman aralığı çok kısa; dublaj metnini kısaltın.'); return; }
        this.videoRate(s, desired);
        a.playbackRate = Math.max(.0625, Math.min(16, rate * mapped.factor));
        if (Math.abs((s.factor || 1) - mapped.factor) > .01) {
          s.factor = mapped.factor;
          this.changed(s, mapped.factor > 1.01 ? 'Video konuşmaya göre yavaşlatılıyor' : 'Dublaj açık');
        }
      } else a.playbackRate = rate;
      const end = Number.isFinite(a.duration) ? a.duration : Infinity;
      const ended = target >= end;
      if (!!s.ended !== ended) {
        s.ended = ended; this.changed(s, ended ? 'Dublaj sona erdi' : 'Dublaj açık');
      }
      const seek = Math.max(0, Math.min(target, end));
      if (a.readyState > 0 && Math.abs(a.currentTime - seek) > 0.25) {
        try { a.currentTime = seek; } catch (_) { /* metadata not seekable yet */ }
      }
      s.voiceWanted = playing && target >= 0 && target < end;
      if (!s.voiceWanted) { s.voiceEpoch=(s.voiceEpoch || 0)+1; s.playPending=false; a.pause(); return; }
      if (a.paused && !s.playPending && a.readyState > 0) {
        s.playPending = true;
        const epoch = s.voiceEpoch = (s.voiceEpoch || 0)+1;
        Promise.resolve(a.play()).then(() => {
          if (this.session === s && (epoch===s.voiceEpoch || !s.voiceWanted) && (!s.voiceWanted || !this.matches(s) || this.sample?.paused
              || this.sample?.adPlaying || this.sample?.spinnerVisible || this.now()-this.sample.at>2200)) a.pause();
        }).catch(() => {
          if (this.session === s && epoch===s.voiceEpoch && s.voiceWanted) void this.fail('Dublaj başlatılamadı; video sesi geri açıldı.');
        }).finally(() => { if(epoch===s.voiceEpoch)s.playPending = false; });
      }
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = BrowserDubAudio;
  else root.BrowserDubAudio = BrowserDubAudio;
})(typeof window === 'undefined' ? globalThis : window);
