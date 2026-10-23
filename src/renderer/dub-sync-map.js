(function (root) {
  'use strict';
  function validate(value) {
    if (value == null) return null;
    if (value.version !== 1 || !Number.isFinite(value.videoDuration) || value.videoDuration <= 0
        || !Number.isFinite(value.audioDuration) || value.audioDuration < value.videoDuration - .05
        || !Array.isArray(value.segments) || !value.segments.length || value.segments.length > 10000) throw new Error('Geçersiz dublaj zaman haritası.');
    let lastV = 0, lastA = 0;
    const segments = value.segments.map(s => {
      const expectedA0 = lastA + (s.v0 - lastV);
      if (![s.v0,s.v1,s.a0,s.a1].every(Number.isFinite) || s.v0 < 0 || s.a0 < 0 || s.v0 < lastV - 1e-9 || s.a0 < lastA - 1e-9
          || s.v1 <= s.v0 || s.a1 <= s.a0 || s.a1 - s.a0 < s.v1 - s.v0 - .05
          || Math.abs(s.a0 - expectedA0) > .001 || s.a1 <= expectedA0
          || s.v1 > value.videoDuration + .05 || s.a1 > value.audioDuration + .05) throw new Error('Geçersiz dublaj zaman haritası.');
      lastV = s.v1; lastA = s.a1;
      // Snap sub-millisecond serialization noise at gaps to keep the map
      // continuous. Larger mismatches must never produce a backward seek.
      return { v0:s.v0, v1:s.v1, a0:expectedA0, a1:s.a1 };
    });
    if (Math.abs((value.audioDuration - lastA) - (value.videoDuration - lastV)) > .05) throw new Error('Geçersiz dublaj zaman haritası.');
    return {version:1, videoDuration:value.videoDuration, audioDuration:value.audioDuration, segments,
      ...(value.smooth === true ? {smooth:true} : {})};
  }
  function at(sync, time) {
    if (!sync) return {time, factor:1};
    let delta = 0;
    for (const s of sync.segments) {
      if (time < s.v0) return {time:time + delta, factor:1};
      if (time < s.v1) {
        const span = s.v1 - s.v0, stretch = (s.a1 - s.a0) / span;
        if (sync.smooth && stretch >= 1) {
          const x = (time - s.v0) / span, extra = stretch - 1;
          // Integral of the smooth speed curve preserves both endpoints and
          // the complete audio. Speed returns continuously to 1 at boundaries.
          return {time:s.a0 + span * (x + extra * (x - Math.sin(2 * Math.PI * x) / (2 * Math.PI))),
            factor:1 + extra * (1 - Math.cos(2 * Math.PI * x))};
        }
        return {time:s.a0 + (time - s.v0) * stretch, factor:stretch};
      }
      delta = s.a1 - s.v1;
    }
    return {time:time + delta, factor:1};
  }
  const api = {validate, at};
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.DubSyncMap = api;
})(typeof window === 'undefined' ? globalThis : window);
