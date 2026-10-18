/* Continuous mono capture. No MediaRecorder restart gaps and no WebM fragments
 * requiring an earlier container header. The host supplies the media clock. */
class WhisperPcmCapture extends AudioWorkletProcessor {
  constructor() {
    super();
    this.samples = new Int16Array(16000 * 8);
    this.length = 0;
    this.sum = 0;
    this.weight = 0;
    this.silence = 0;
    this.peak = 0;
    this.clock = null;
    this.inFlight = new Set(); this.nextChunk = 0; this.maxPending = 0;
    this.port.onmessage = ({ data }) => {
      if (!data || typeof data !== 'object') return;
      if (data.type === 'configure') { this.maxPending = 4; return; }
      if (data.type === 'ack') { this.inFlight.delete(data.id); return; }
      if (data.type === 'flush') { this.flush(); this.clock = null; this.port.postMessage({ type: 'flushed' }); return; }
      if (data.type !== 'sync' || !Number.isFinite(data.time) || !Number.isFinite(data.contextTime)) return;
      // Ana süreç gözlenen hızı 16x'e dek raporlar; saat tahmini aynı aralığı
      // kabul etmeli yoksa >4x oynatmada tahmin sapması sürekli flush tetikler.
      const next = { ...data, rate: Math.max(.0625, Math.min(16, Number(data.rate) || 1)) };
      const previous = this.clock;
      const predicted = previous && previous.time + (next.contextTime - previous.contextTime) * previous.rate;
      if (previous && (next.paused !== previous.paused || next.rate !== previous.rate || Math.abs(next.time - predicted) > .75)) {
        this.flush(); this.sum = 0; this.weight = 0;
      }
      this.clock = next;
    };
  }
  flush() {
    this.sum = 0; this.weight = 0;
    if (!this.length) return;
    const length = this.length, peak = this.peak;
    this.length = 0; this.silence = 0; this.peak = 0;
    // Duraklatma/atlama/hız değişimi her seferinde tamponu boşaltır; bunun
    // 50-200 ms'lik kırıntıları Whisper'a gitmez. Bu kadar kısa sesle model
    // sözcük çıkaramaz ama "Teşekkürler." gibi halüsinasyon üretir.
    if (length < WhisperPcmCapture.MIN_SAMPLES) { this.port.postMessage({ type: 'dropped', reason: 'short', samples: length }); return; }
    // Tamamen sessiz parça (video sessize alınmış, ses kapalı, reklam arası
    // boşluğu): GPU'ya göndermek boşa iş ve sessizlik halüsinasyonu riskidir.
    // Ev sahibi art arda sessizlikte kullanıcıyı uyarır.
    if (peak < WhisperPcmCapture.SILENT_PEAK) { this.port.postMessage({ type: 'silent', samples: length, offset: this.offset }); return; }
    if (this.maxPending && this.inFlight.size >= this.maxPending) { this.port.postMessage({ type: 'dropped', reason: 'backpressure', samples: length }); return; }
    const pcm = this.samples.slice(0, length);
    const id = ++this.nextChunk;
    if (this.maxPending) this.inFlight.add(id);
    this.port.postMessage({ type: 'chunk', id, pcm: pcm.buffer, offset: this.offset, rate: this.rate }, [pcm.buffer]);
  }
  process(inputs) {
    const channels = inputs[0];
    if (!channels?.length) { this.flush(); this.lastInputTime = null; return true; }
    if (!this.clock || this.clock.paused) return true;
    if (this.lastInputTime != null && currentTime - this.lastInputTime > .05) this.flush();
    this.lastInputTime = currentTime;
    let strongest = channels[0], strongestEnergy = 0, mixEnergy = 0;
    for (const channel of channels) {
      let energy = 0; for (const value of channel) energy += value * value;
      if (energy > strongestEnergy) { strongestEnergy = energy; strongest = channel; }
    }
    for (let i=0; i<channels[0].length; i++) {
      let mix=0; for (const channel of channels) mix += channel[i] || 0;
      mixEnergy += (mix/channels.length) ** 2;
    }
    const cancelPhase = channels.length > 1 && mixEnergy < strongestEnergy * .05;
    const ratio = sampleRate / 16000;
    for (let i = 0; i < channels[0].length; i++) {
      let sample = 0;
      for (const channel of channels) sample += channel[i] || 0;
      sample /= channels.length;
      if (cancelPhase) sample = strongest[i] || 0;
      // Weighted box resampling also handles non-integer 44.1kHz input rates.
      let remaining = 1;
      while (remaining > 1e-8) {
        const take = Math.min(remaining, ratio - this.weight);
        this.sum += sample * take; this.weight += take; remaining -= take;
        if (this.weight >= ratio - 1e-8) {
          if (!this.length) {
            this.offset = Math.max(0, this.clock.time + (currentTime + i / sampleRate - this.clock.contextTime) * this.clock.rate);
            this.rate = this.clock.rate;
          }
          const value = Math.max(-1, Math.min(1, this.sum / ratio));
          this.samples[this.length++] = Math.round(value * (value < 0 ? 32768 : 32767));
          const magnitude = Math.abs(value);
          if (magnitude > this.peak) this.peak = magnitude;
          this.silence = Math.abs(value) < .008 ? this.silence + 1 : 0;
          this.sum = 0; this.weight = 0;
          // Prefer a quiet boundary after four seconds; bound latency at eight.
          if (this.length >= this.samples.length || (this.length >= 64000 && this.silence >= 3200)) this.flush();
        }
      }
    }
    return true;
  }
}
// 0,25 sn (16 kHz): bundan kısa kırıntı tek sözcük bile taşımaz.
WhisperPcmCapture.MIN_SAMPLES = 4000;
// ≈ -48 dBFS: en sessiz diyalog bile tepe değerde bunun üzerindedir.
WhisperPcmCapture.SILENT_PEAK = 0.004;
registerProcessor('whisper-pcm-capture', WhisperPcmCapture);
