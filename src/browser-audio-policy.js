const AUDIO_PROFILES = Object.freeze({
  off: null,
  night: { threshold: -32, knee: 18, ratio: 6, attack: .006, release: .35 },
  dialogue: { threshold: -28, knee: 20, ratio: 3, attack: .008, release: .28 },
  guard: { threshold: -14, knee: 4, ratio: 12, attack: .002, release: .2 },
});

function audioLevelDb(samples) {
  if (!samples?.length) return -Infinity;
  let sum = 0;
  for (let index = 0; index < samples.length; index += 1) {
    const amplitude = (samples[index] - 128) / 128;
    sum += amplitude * amplitude;
  }
  const rms = Math.sqrt(sum / samples.length);
  return rms > 0 ? 20 * Math.log10(rms) : -Infinity;
}

function nextSilenceState(previous, levelDb, elapsedMs, thresholdDb) {
  const below = !Number.isNaN(levelDb) && levelDb <= thresholdDb;
  const quietMs = below ? previous.quietMs + elapsedMs : 0;
  // Boş örnek dizisi çağıran tarafından ayrıca reddedilir; -Infinity geçerli dijital sessizliktir.
  return { quietMs, active: below && quietMs >= 450 };
}

module.exports = { AUDIO_PROFILES, audioLevelDb, nextSilenceState };
