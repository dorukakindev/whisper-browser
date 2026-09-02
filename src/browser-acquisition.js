const ACQUISITION_STAGES = Object.freeze([
  { id: 'native-text-track', label: 'Sayfanın hazır altyazısı', automatic: true, capability: 'nativeTextTrack' },
  { id: 'network-capture', label: 'Ağ altyazısı yakalama', automatic: true, capability: 'networkCapture' },
  { id: 'manifest', label: 'HLS/DASH manifest altyazısı', automatic: true, capability: 'manifestCapture' },
  { id: 'persisted-track', label: 'Daha önce kaydedilmiş altyazı', automatic: true, capability: 'persistedTrack' },
  { id: 'manual-track', label: 'Dosyadan veya gömülü altyazı', automatic: false, capability: 'manualTrack' },
  { id: 'live-asr', label: 'Canlı ses Whisper', automatic: false, capability: 'liveAsr', consent: 'liveAsr' },
]);

const TERMINAL_STATUSES = new Set(['success', 'failed', 'skipped', 'blocked']);

function normalizeCapabilities(raw = {}) {
  return {
    nativeTextTrack: !!raw.nativeTextTrack,
    networkCapture: raw.networkCapture !== false,
    manifestCapture: raw.manifestCapture !== false,
    persistedTrack: !!raw.persistedTrack,
    manualTrack: raw.manualTrack !== false,
    liveAsr: !!raw.liveAsr,
  };
}

function normalizeConsent(raw = {}) {
  return { liveAsr: !!raw.liveAsr };
}

function initialStageState(stage, capabilities, consent) {
  if (!capabilities[stage.capability]) {
    return { id: stage.id, label: stage.label, status: 'skipped', reason: 'Bu kaynak kullanılamıyor.', attempts: 0 };
  }
  if (stage.consent && !consent[stage.consent]) {
    return { id: stage.id, label: stage.label, status: 'blocked', reason: 'Kullanıcı onayı gerekiyor.', attempts: 0 };
  }
  return { id: stage.id, label: stage.label, status: 'waiting', reason: '', attempts: 0 };
}

class CaptionAcquisitionPlan {
  constructor(options = {}) {
    this.capabilities = normalizeCapabilities(options.capabilities);
    this.consent = normalizeConsent(options.consent);
    this.mediaId = String(options.mediaId || '');
    this.acquisitionId = String(options.acquisitionId || '');
    this.stages = ACQUISITION_STAGES.map((stage) => initialStageState(stage, this.capabilities, this.consent));
    this.winner = '';
  }

  updateConsent(next = {}) {
    this.consent = normalizeConsent({ ...this.consent, ...next });
    for (const definition of ACQUISITION_STAGES) {
      if (!definition.consent || !this.consent[definition.consent]) continue;
      const stage = this.stage(definition.id);
      if (stage && stage.status === 'blocked') {
        stage.status = 'waiting';
        stage.reason = '';
      }
    }
    return this.snapshot();
  }

  stage(id) {
    return this.stages.find((stage) => stage.id === id) || null;
  }

  next(options = {}) {
    if (this.winner) return null;
    const includeManual = options.includeManual === true;
    for (const definition of ACQUISITION_STAGES) {
      const state = this.stage(definition.id);
      if (!state || state.status !== 'waiting') continue;
      if (!definition.automatic && !includeManual) continue;
      return { ...definition, ...state };
    }
    return null;
  }

  start(id) {
    const stage = this.stage(id);
    if (!stage || stage.status !== 'waiting' || this.winner) return false;
    stage.status = 'running';
    stage.reason = '';
    stage.attempts += 1;
    return true;
  }

  finish(id, result = {}) {
    const stage = this.stage(id);
    if (!stage || !['waiting', 'running'].includes(stage.status)) return false;
    // Birden fazla edinme yolu aynı anda çalışıyor olabilir. İlk başarılı yol
    // kazandıktan sonra geciken bir manifest/ağ sonucu kazananı değiştirmesin.
    if (this.winner && this.winner !== id) {
      stage.status = 'skipped';
      stage.reason = 'Altyazı başka bir edinme yolunda daha önce bulundu.';
      return false;
    }
    const success = result.success === true;
    stage.status = success ? 'success' : 'failed';
    stage.reason = String(result.reason || '').slice(0, 500);
    stage.trackCount = Math.max(0, Math.trunc(Number(result.trackCount) || 0));
    if (success) {
      this.winner = id;
      for (const other of this.stages) {
        if (other.id !== id && other.status === 'waiting') {
          other.status = 'skipped';
          other.reason = 'Altyazı daha önceki bir basamakta bulundu.';
        }
      }
    }
    return true;
  }

  reset(options = {}) {
    if (options.capabilities) this.capabilities = normalizeCapabilities(options.capabilities);
    if (options.consent) this.consent = normalizeConsent(options.consent);
    if (options.mediaId !== undefined) this.mediaId = String(options.mediaId || '');
    if (options.acquisitionId !== undefined) this.acquisitionId = String(options.acquisitionId || '');
    this.winner = '';
    this.stages = ACQUISITION_STAGES.map((stage) => initialStageState(stage, this.capabilities, this.consent));
    return this.snapshot();
  }

  snapshot() {
    return {
      mediaId: this.mediaId,
      acquisitionId: this.acquisitionId,
      winner: this.winner,
      complete: !!this.winner || this.stages.every((stage) => TERMINAL_STATUSES.has(stage.status)),
      needsConsent: this.stages.filter((stage) => stage.status === 'blocked').map((stage) => stage.id),
      stages: this.stages.map((stage) => ({ ...stage })),
    };
  }
}

function capabilityMatrixEntry(service, capabilities = {}, verifiedAt = '') {
  const caps = normalizeCapabilities(capabilities);
  return {
    service: String(service || 'generic').slice(0, 64),
    signIn: capabilities.signIn !== false,
    playback: capabilities.playback !== false,
    captionDetection: caps.nativeTextTrack || caps.networkCapture || caps.manifestCapture,
    dualTrack: !!capabilities.dualTrack,
    overlay: capabilities.overlay !== false,
    fullscreen: !!capabilities.fullscreen,
    translation: capabilities.translation !== false,
    verifiedAt: /^\d{4}-\d{2}-\d{2}$/.test(verifiedAt) ? verifiedAt : '',
  };
}

module.exports = {
  ACQUISITION_STAGES,
  CaptionAcquisitionPlan,
  capabilityMatrixEntry,
  normalizeCapabilities,
};
