const ACQUISITION_STAGES = Object.freeze([
  { id: 'native-text-track', label: 'Sayfanın hazır altyazısı', automatic: true, capability: 'nativeTextTrack' },
  { id: 'network-capture', label: 'Ağ altyazısı yakalama', automatic: true, capability: 'networkCapture' },
  { id: 'manifest', label: 'HLS/DASH manifest altyazısı', automatic: true, capability: 'manifestCapture' },
  { id: 'persisted-track', label: 'Daha önce kaydedilmiş altyazı', automatic: true, capability: 'persistedTrack' },
  { id: 'manual-track', label: 'Dosyadan veya gömülü altyazı', automatic: false, capability: 'manualTrack' },
  { id: 'live-asr', label: 'Canlı ses Whisper', automatic: false, capability: 'liveAsr', consent: 'liveAsr' },
]);

const TERMINAL_STATUSES = new Set(['success', 'failed', 'skipped', 'blocked']);

const DISCOVERY_PHASES = Object.freeze({
  navigation_started: { order: 0, message: 'Sayfa açılıyor.' },
  document_ready: { order: 1, message: 'Sayfa hazır; video aranıyor.' },
  video_found: { order: 2, message: 'Video bulundu; medya bilgileri bekleniyor.' },
  media_metadata_ready: { order: 3, message: 'Video hazır; altyazı izi aranıyor.' },
  track_candidate_found: { order: 4, message: 'Altyazı izi bulundu; cue\'lar okunuyor.' },
  cue_list_growing: { order: 5, message: 'Altyazı cue listesi büyüyor.' },
  source_verified: { order: 6, message: 'Altyazı kaynağı doğrulandı.' },
  capture_ready: { order: 7, message: 'Altyazı yakalamaya hazır.' },
  capture_failed: { order: 8, message: 'Altyazı yakalama tamamlanamadı.' },
});

function normalizeDiscoveryDetails(raw = {}) {
  const count = (value) => Math.max(0, Math.min(20000, Math.trunc(Number(value) || 0)));
  return {
    mediaCount: count(raw.mediaCount),
    trackCount: count(raw.trackCount),
    cueCount: count(raw.cueCount),
  };
}

class CaptionDiscoveryState {
  constructor() { this.reset(); }

  reset(at = Date.now()) {
    this.phase = 'navigation_started';
    this.message = DISCOVERY_PHASES.navigation_started.message;
    this.updatedAt = Number(at) || Date.now();
    this.details = normalizeDiscoveryDetails();
    return this.snapshot();
  }

  observe(phase, details = {}, at = Date.now()) {
    const next = DISCOVERY_PHASES[String(phase || '')];
    if (!next) return false;
    if (phase === 'navigation_started') {
      this.reset(at);
      return true;
    }
    const current = DISCOVERY_PHASES[this.phase] || DISCOVERY_PHASES.navigation_started;
    // DOMContentLoaded gibi geç gelen düşük seviyeli bir olay, zaten bulunan
    // track/cue durumunu geriye taşımamalı. Yeni gezinme yalnız açık reset ile
    // başlar.
    if (next.order < current.order && this.phase !== 'capture_failed') return false;
    this.phase = phase;
    this.updatedAt = Number(at) || Date.now();
    this.details = normalizeDiscoveryDetails({ ...this.details, ...details });
    if (details.message) this.message = String(details.message).trim().slice(0, 240);
    else if (phase === 'media_metadata_ready' && this.details.trackCount === 0) {
      this.message = 'Video hazır; henüz okunabilir bir altyazı izi görünmüyor.';
    } else if (phase === 'track_candidate_found' && this.details.cueCount === 0) {
      this.message = 'Altyazı izi bulundu; cue verisi bekleniyor.';
    } else this.message = next.message;
    return true;
  }

  snapshot() {
    return { phase: this.phase, message: this.message, updatedAt: this.updatedAt, ...this.details };
  }
}

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
    this.discovery = new CaptionDiscoveryState();
  }

  updateConsent(next = {}) {
    this.consent = normalizeConsent({ ...this.consent, ...next });
    for (const definition of ACQUISITION_STAGES) {
      if (!definition.consent) continue;
      const stage = this.stage(definition.id);
      if (!this.consent[definition.consent]) {
        if (stage && ['waiting', 'running'].includes(stage.status)) {
          stage.status = 'blocked';
          stage.reason = 'Kullanıcı onayı geri çekildi.';
        }
        continue;
      }
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
      this.discovery.observe('capture_ready', { trackCount: result.trackCount });
      for (const other of this.stages) {
        if (other.id !== id && ['waiting', 'running'].includes(other.status)) {
          other.status = 'skipped';
          other.reason = 'Altyazı daha önceki bir basamakta bulundu.';
        }
      }
    } else {
      const automatic = this.stages.filter((candidate) =>
        ACQUISITION_STAGES.find((definition) => definition.id === candidate.id)?.automatic);
      if (!this.winner && automatic.every((candidate) => TERMINAL_STATUSES.has(candidate.status))) {
        this.discovery.observe('capture_failed', {
          message: 'Altyazı bulunamadı; dosya seçin veya canlı Whisper kullanın.',
        });
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
    this.discovery.reset();
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
      discovery: this.discovery.snapshot(),
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
  CaptionDiscoveryState,
  CaptionAcquisitionPlan,
  capabilityMatrixEntry,
  normalizeCapabilities,
};
