'use strict';
// Collapses the same release reported by several Stremio addons into one source row.
// Pure and synchronous: input rows (output of stremio-addons.normalizeStream) are never mutated.
// Rows that need addon-supplied request headers are never merged across addons, because
// playback depends on which addon's headers are attached.

const AVAILABILITY_RANK = { cached: 2, unknown: 1, download: 0 };
const MAX_TRACKERS = 60;

function dedupeStreams(rows) {
  const list = Array.isArray(rows) ? rows : [];
  if (list.length < 2) return list.slice();
  const parent = list.map((_, i) => i);
  const find = (i) => { while (parent[i] !== i) { parent[i] = parent[parent[i]]; i = parent[i]; } return i; };
  const union = (a, b) => { const x = find(a), y = find(b); if (x !== y) parent[Math.max(x, y)] = Math.min(x, y); };
  const seen = new Map();
  const link = (key, i) => { if (!key) return; if (seen.has(key)) union(seen.get(key), i); else seen.set(key, i); };
  list.forEach((row, i) => {
    if (!row || !row.playable || row.usesHeaders || row.requestHeaders?.length) return;
    // Keep alternate links, subtitles and episode-continuation behavior available.
    // A matching filename/size alone never establishes playback identity.
    const behavior = JSON.stringify([row.subtitles || [], row.bingeGroup || '', !!row.notWebReady]);
    if (row.kind === 'torrent' && row.infoHash) {
      const slot = Number.isSafeInteger(row.fileIdx) ? row.fileIdx : 'unspecified';
      link(JSON.stringify(['torrent', row.infoHash, slot, behavior]), i);
    }
    if (row.kind === 'url' && row.url) link(JSON.stringify(['url', row.url, behavior]), i);
  });
  const groups = new Map();
  list.forEach((row, i) => { const root = find(i); if (!groups.has(root)) groups.set(root, []); groups.get(root).push(i); });
  const out = [];
  for (const [root, members] of [...groups].sort((a, b) => a[0] - b[0])) {
    if (members.length === 1) { out.push(list[members[0]]); continue; }
    const rank = (i) => list[i];
    const best = [...members].sort((a, b) => {
      const x = rank(a), y = rank(b);
      return (y.playable ? 1 : 0) - (x.playable ? 1 : 0)
        || (AVAILABILITY_RANK[y.availability] ?? 1) - (AVAILABILITY_RANK[x.availability] ?? 1)
        || (y.score || 0) - (x.score || 0)
        || (y.seeders ?? -1) - (x.seeders ?? -1)
        || a - b;
    })[0];
    const winner = { ...list[best] };
    const seeds = members.map((i) => list[i].seeders).filter(Number.isFinite);
    if (seeds.length) winner.seeders = Math.max(...seeds);
    if (Array.isArray(winner.trackers)) {
      winner.trackers = [...new Set(members.filter((i) => list[i].infoHash === winner.infoHash).flatMap((i) => Array.isArray(list[i].trackers) ? list[i].trackers : []))].slice(0, MAX_TRACKERS);
    }
    const others = new Map();
    for (const i of members) {
      const r = list[i];
      if (i !== best && r.addonKey && r.addonKey !== winner.addonKey && !others.has(r.addonKey)) others.set(r.addonKey, { addonKey: r.addonKey, addonName: r.addonName || '' });
    }
    winner.alsoFrom = [...others.values()];
    winner.duplicates = members.length - 1;
    out.push(winner);
  }
  return out;
}

module.exports = { dedupeStreams };
