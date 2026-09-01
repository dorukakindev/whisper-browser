'use strict';

// Media candidates are collected from every frame, but a command must be sent
// to exactly one frame. Keeping the ranking pure makes the cross-frame rule
// easy to test without starting Electron.
function rankBrowserMediaCandidates(entries) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && entry.media && typeof entry.media === 'object')
    .map((entry, index) => ({ ...entry, _index: index }))
    .sort((a, b) => {
      const area = (Number(b.media.area) || 0) - (Number(a.media.area) || 0);
      if (area) return area;
      const playing = Number(!b.media.paused) - Number(!a.media.paused);
      if (playing) return playing;
      const duration = (Number(b.media.duration) || 0) - (Number(a.media.duration) || 0);
      return duration || a._index - b._index;
    })
    .map(({ _index, ...entry }) => entry);
}

module.exports = { rankBrowserMediaCandidates };
