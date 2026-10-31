(function (root) {
  'use strict';
  const SyncMap = typeof module !== 'undefined' && module.exports ? require('./dub-sync-map') : root.DubSyncMap;
  const Mix = typeof module !== 'undefined' && module.exports ? require('./dub-workspace-model') : root.DubWorkspaceModel;
  class BrowserDubAudio {
    constructor({ audio, context, mute, changed = () => {}, error = () => {},
      now = () => Date.now(), urls = URL, setRate, backgroundAudio, musicAudio, ambienceAudio }) {
      Object.assign(this, { audio, context, mute, changed, error, now, urls, setRate, backgroundAudio, musicAudio, ambienceAudio });
      this.session = null; this.sample = null; this.offset = 0;
      this.cleanup = Promise.resolve();
      this.intent = 0;
      audio.addEventListener('loadedmetadata', () => this.tick());
      audio.addEventListener('error', () => this.fail('Ses dosyası açılamadı. WAV veya MP3 deneyin.'));
      audio.addEventListener('ended', () => this.changed(this.session, 'Dublaj sona erdi'));
      backgroundAudio?.addEventListener('loadedmetadata',()=>this.tick());
      for(const a of [backgroundAudio,musicAudio,ambienceAudio]){a?.addEventListener('loadedmetadata',()=>this.tick());a?.addEventListener('error',()=>this.layerFailed(a));}
    }
    matches(s = this.session) {
      const c = this.context();
      return !!s && ['browser', 'player'].includes(c.mode) && c.mode === s.mode && c.visible !== false && c.tabId === s.tabId
        && c.mediaKey === s.mediaKey && c.generation === s.generation && (c.mediaId || '') === (s.mediaId || '');
    }
    muteSession(s, muted, mode = 'update') {
      return this.mute(s.tabId, muted, s, mode);
    }
    async attach(file, c) {
      if (!c || !this.matches(c)) return false;
      const intent = ++this.intent;
      const sameMedia = this.matches(this.session);
      const priorMuted = sameMedia ? this.session.priorMuted : c.priorMuted;
      const priorRate = sameMedia && this.session.sync ? this.session.baseRate : c.playbackRate;
      await this.detachCurrent();
      if (intent !== this.intent || !this.matches(c)) return false;
      if (!file || !c.tabId || !c.mediaKey || !['browser', 'player'].includes(c.mode)) return false;
      const s = { ...c, priorMuted, muteOwner: root.crypto.randomUUID(), name: file.name, range: file.range || null, muted: false, url: null };
      s.master = { volume: c.mode === 'player' && Number.isFinite(c.volume) ? Math.max(0, Math.min(1, c.volume)) : 1,
        muted: c.mode === 'player' && !!priorMuted };
      try { s.sync = SyncMap.validate(file.sync); } catch (_) { this.error('Geçersiz dublaj zaman haritası.'); return false; }
      if (s.sync && !this.setRate) return false;
      s.background = file.background || null; s.layers=file.layers || {};s.mix=Mix.mix(file.mix);
      try{s.rows=Mix.groups(file.rows||[]);}catch(_){s.rows=[];}
      if((s.layers.music&&!this.musicAudio)||(s.layers.ambience&&!this.ambienceAudio))return false;
      if (s.background && !this.backgroundAudio) return false;
      s.baseRate = Math.max(.25, Math.min(4, Number(priorRate) || 1));
      s.ratePromise = Promise.resolve(); s.rateAt = -Infinity;
      if (s.range && (!Number.isFinite(s.range.start) || !Number.isFinite(s.range.end) || s.range.start < 0 || s.range.end <= s.range.start)) return false;
      this.session = s; this.sample = null; this.offset = 0;
      this.timer = setInterval(() => this.tick(), 200);
      this.changed(s, '');
      s.desiredMuted = s.range ? !!priorMuted : true;
      // A metadata/telemetry tick can queue a release while this first command
      // is pending. Record what this command applied, not the newer intent, so
      // removal can still restore it when that queued release is skipped.
      const initialMuted = s.desiredMuted;
      s.mutePromise = Promise.resolve().then(() => this.muteSession(s, initialMuted, 'acquire')).then(result => {
        s.muted = !!result?.ok && initialMuted;
        if (typeof result?.priorMuted === 'boolean') s.priorMuted = result.priorMuted;
        s.leaseOwned = result?.leaseOwned === true;
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
        this.setMix(s.mix,s.layers,false);
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
      for(const a of [this.musicAudio,this.ambienceAudio])if(a){a.pause();a.removeAttribute('src');a.load();}
      if (s?.url && s.isBlob) this.urls.revokeObjectURL(s.url);
      this.changed(null, '');
      if (!s) return this.cleanup;
      this.cleanup = this.cleanup.then(async () => {
        if (s.sync) {
          try {
            await s.ratePromise;
            const result = await this.setRate({tabId:s.tabId,mediaKey:s.mediaKey,generation:s.generation,mediaId:s.mediaId||'',rate:s.baseRate,baseRate:s.baseRate,release:true});
            if (!result?.ok) this.error('Video hızı geri yüklenemedi; hız ayarını kontrol edin.');
          } catch (_) { this.error('Video hızı geri yüklenemedi; hız ayarını kontrol edin.'); }
        }
        try {
          await s.mutePromise;
          if (s.muted || s.leaseOwned) {
            const restored = await this.muteSession(s, !!s.priorMuted, 'release');
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
      this.audio.pause(); this.backgroundAudio?.pause(); this.musicAudio?.pause();this.ambienceAudio?.pause();
      if(this.session)for(const key of ['music','ambience']){this.session[key+'Wanted']=false;this.session[key+'Epoch']=(this.session[key+'Epoch']||0)+1;this.session[key+'PlayPending']=false;}
    }
    // İsteğe bağlı katman (arka plan/müzik/ambiyans) çökerse yalnız o katman kapatılır; dublaj sesi ve oturum sürer.
    layerFailed(el) {
      const s=this.session;if(!s)return;
      const key=el===this.backgroundAudio?'background':el===this.musicAudio?'music':el===this.ambienceAudio?'ambience':null;
      if(!key||s[key+'Failed'])return;
      s[key+'Failed']=true;s[key+'Wanted']=false;s[key+'Epoch']=(s[key+'Epoch']||0)+1;s[key+'PlayPending']=false;try{el.pause();}catch(_){}
      this.error(root.UiLocale?.get?.()==='tr'?'Arka plan sesi başlatılamadı; dublaj sesi devam ediyor.':'Background audio could not start; dubbed voice continues.');
    }
    setMix(value,layers,refresh=true) {
      const s=this.session;if(!s)return;
      s.mix=Mix.mix({...s.mix,...value});
      if(layers){s.layers=layers;for(const key of ['music','ambience']){
        const a=this[key+'Audio'];if(!a)continue;
        const url=layers[key]?.url||'';
        if((a.getAttribute?.('src')||a.src||'')!==url){s[key+'Failed']=false;s[key+'Epoch']=(s[key+'Epoch']||0)+1;s[key+'PlayPending']=false;s[key+'Wanted']=false;a.pause();if(url)a.src=url;else a.removeAttribute('src');a.load();}
      }this.changed(s,'Dublaj açık');}
      this.audio.volume=s.mix.voice*s.master.volume;
      for(const a of [this.audio,this.backgroundAudio,this.musicAudio,this.ambienceAudio])if(a)a.muted=s.master.muted;
      if(refresh)this.tick();
    }
    setMaster(value) {
      const s=this.session;if(!s||s.mode!=='player'||!this.matches(s))return false;
      if(Number.isFinite(value.volume))s.master.volume=Math.max(0,Math.min(1,value.volume));
      if(typeof value.muted==='boolean'){s.master.muted=value.muted;s.priorMuted=value.muted;}
      this.setMix({},null,false);this.tick();return true;
    }
    syncBackground(s,time,rate,playing,target) {
      const duck=s.mix.duck?1-(1-s.mix.duckAmount)*Mix.duckAt(s.rows,target):1;
      for(const key of ['background','music','ambience']){
        const b=this[key+'Audio'];
        if(!(key==='background'?s.background:s.layers[key])||!b)continue;
        if(s[key+'Failed']){b.pause();continue;}
        b.volume=s.mix[key]*duck*s.master.volume;b.muted=s.master.muted;
        if(b.readyState<=0)continue;
        b.playbackRate=rate;
        if(Math.abs(b.currentTime-time)>.25){try{b.currentTime=Math.max(0,time);}catch(_){}}
        const wanted=key+'Wanted',epochKey=key+'Epoch',pending=key+'PlayPending';
        s[wanted]=playing&&time>=0&&time<b.duration;
        if(!s[wanted]){s[epochKey]=(s[epochKey]||0)+1;s[pending]=false;b.pause();continue;}
        if(b.paused&&!s[pending]){
          s[pending]=true;const epoch=s[epochKey]=(s[epochKey]||0)+1;
          Promise.resolve(b.play()).then(()=>{
            if(!this.session || (this.session===s&&(epoch===s[epochKey]||!s[wanted])&&(!s[wanted]||!this.matches(s)||this.sample?.paused||this.sample?.adPlaying||this.sample?.spinnerVisible||this.now()-this.sample.at>2200)))b.pause();
          }).catch(()=>{if(this.session===s&&epoch===s[epochKey]&&s[wanted])this.layerFailed(b);})
            .finally(()=>{if(epoch===s[epochKey])s[pending]=false;});
        }
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
        const result = await this.setRate({tabId:s.tabId,mediaKey:s.mediaKey,generation:s.generation,mediaId:s.mediaId||'',rate:desired,baseRate:s.baseRate,release});
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
        const result = await this.muteSession(s, desired);
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
        // Browser telemetry gaps release the original stream. A local full
        // replacement must stay muted until removal, including its first tick.
        if (s.mode !== 'player' || s.range || s.sync || s.background) {
          this.rangeMute(s, !!s.priorMuted);
        }
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
      if (s.range || s.sync || s.background || Number.isFinite(a.duration) || this.offset) {
        const stop = s.range?.end ?? s.sync?.videoDuration ?? (s.background && Number.isFinite(this.backgroundAudio?.duration) ? this.backgroundAudio.duration : Number.isFinite(a.duration) ? a.duration : Infinity);
        const inside = videoTime >= (s.range?.start || 0) && videoTime < stop && a.readyState > 0;
        this.rangeMute(s, inside || !!s.priorMuted);
        if (!inside || !s.muted) {
          if (s.sync && !inside) this.videoRate(s,s.baseRate,true);
          this.pauseAll(); return;
        }
      }
      this.audio.volume=s.mix.voice*s.master.volume;this.audio.muted=s.master.muted;
      this.syncBackground(s,localTime,rate,playing,target);
      if (s.sync) {
        const desired = Math.max(.0625, Math.min(4, s.baseRate / mapped.factor));
        if (desired * mapped.factor > 16) { void this.fail('Bu bölümün zaman aralığı çok kısa; dublaj metnini kısaltın.'); return; }
        this.videoRate(s, desired);
        // The observed rate can still belong to the previous segment while
        // the asynchronous video slowdown is pending. Keep the session alive.
        if (rate * mapped.factor > 16) { this.pauseAll(); return; }
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
          if (!this.session || (this.session === s && (epoch===s.voiceEpoch || !s.voiceWanted) && (!s.voiceWanted || !this.matches(s) || this.sample?.paused
              || this.sample?.adPlaying || this.sample?.spinnerVisible || this.now()-this.sample.at>2200))) a.pause();
        }).catch(() => {
          if (this.session === s && epoch===s.voiceEpoch && s.voiceWanted) void this.fail('Dublaj başlatılamadı; video sesi geri açıldı.');
        }).finally(() => { if(epoch===s.voiceEpoch)s.playPending = false; });
      }
    }
  }
  if (typeof module !== 'undefined' && module.exports) module.exports = BrowserDubAudio;
  else root.BrowserDubAudio = BrowserDubAudio;
})(typeof window === 'undefined' ? globalThis : window);
