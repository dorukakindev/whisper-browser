'use strict';

const { compareBrowserMediaCandidates } = require('./browser-media-selection');

// Media candidates are collected from every frame, but a command must be sent
// to exactly one frame. Keeping the ranking pure makes the cross-frame rule
// easy to test without starting Electron.
function rankBrowserMediaCandidates(entries) {
  return (Array.isArray(entries) ? entries : [])
    .filter((entry) => entry && entry.media && typeof entry.media === 'object')
    .map((entry, index) => ({ ...entry, _index: index }))
    .sort((a, b) => {
      // Kareler arasi secim, sayfa icindeki kalici controller ile ayni kurali
      // kullanmali. Yoksa dev bir duraklatilmis reklam/preview, oynamakta olan
      // asil videonun komutlarini calar.
      const candidate = (entry) => ({
        ...entry.media,
        clientWidth: Math.max(0, Number(entry.media.area) || 0),
        clientHeight: 1,
      });
      return compareBrowserMediaCandidates(candidate(a), candidate(b)) || a._index - b._index;
    })
    .map(({ _index, ...entry }) => entry);
}

module.exports = { rankBrowserMediaCandidates };
