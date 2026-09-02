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
    this.clock = null;
    this.port.onmessage = ({ data }) => {
      if (data.type === 'flush') { this.flush(); this.clock = null; this.port.postMessage({ type: 'flushed' }); return; }
      if (data.type !== 'sync' || !Number.isFinite(data.time) || !Number.isFinite(data.contextTime)) return;
      const next = { ...data, rate: Math.max(.25, Math.min(4, Number(data.rate) || 1)) };
      const previous = this.clock;
      const predicted = previous && previous.time + (next.contextTime - previous.contextTime) * previous.rate;
      if (previous && (next.paused !== previous.paused || next.rate !== previous.rate || Math.abs(next.time - predicted) > .75)) {
        this.flush(); this.sum = 0; this.weight = 0;
      }
      this.clock = next;
    };
  }
  flush() {
    if (!this.length) return;
    const pcm = this.samples.slice(0, this.length);
    this.port.postMessage({ type: 'chunk', pcm: pcm.buffer, offset: this.offset, rate: this.rate }, [pcm.buffer]);
    this.length = 0; this.silence = 0;
  }
  process(inputs) {
    const channels = inputs[0];
    if (!channels?.length || !this.clock || this.clock.paused) return true;
    const ratio = sampleRate / 16000;
    for (let i = 0; i < channels[0].length; i++) {
      let sample = 0;
      for (const channel of channels) sample += channel[i] || 0;
      sample /= channels.length;
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
registerProcessor('whisper-pcm-capture', WhisperPcmCapture);
