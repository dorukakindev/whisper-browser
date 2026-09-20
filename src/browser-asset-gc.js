'use strict';
// İzleme dizini budaması ile varlık süpürmesi tek koruma kümesi paylaşır
// (R86-02): açık sekme, kalıcı oturum ve workspace trackRefs'leri
// pruneTracks'ten ÖNCE toplanır; yaş eşiğini aşmış olsa bile referanslı
// varlığın hem dizin satırı hem JSON/SRT dosya çifti korunur.
function collectTrackAssetRefs(...tabLists) {
  const refs = new Set();
  for (const tabs of tabLists) {
    for (const tab of Array.isArray(tabs) ? tabs : []) {
      for (const ref of Array.isArray(tab?.trackRefs) ? tab.trackRefs : []) {
        if (ref?.assetId) refs.add(String(ref.assetId).toLowerCase());
      }
    }
  }
  return refs;
}

function pruneAndSweepTracks(index, assetStore, referencedRefs) {
  const keep = referencedRefs instanceof Set ? referencedRefs : new Set(referencedRefs || []);
  for (const row of index.pruneTracks({ keep })) {
    if (row.asset_path) assetStore.removeTrack(row.asset_path);
  }
  const protectedAssets = new Set(keep);
  for (const assetPath of index.listTrackAssetPaths()) protectedAssets.add(assetPath);
  assetStore.sweepOrphans(protectedAssets);
}

module.exports = { collectTrackAssetRefs, pruneAndSweepTracks };
