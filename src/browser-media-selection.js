// Shared by the persistent command controller and subtitle overlay. Kept free
// of DOM globals so it can be serialized into an isolated web page.
function browserMediaCandidateRank(item) {
  if (!item || item.isConnected === false) return [-1, 0, 0, 0];
  const area = Math.max(0, (Number(item.clientWidth) || 0) * (Number(item.clientHeight) || 0));
  const playing = !item.paused && !item.ended;
  const audio = String(item.tagName || '').toLowerCase() === 'audio';
  // A 1px tracking/ad video must not steal commands from the visible player.
  // Playing visible media wins; audible audio wins over paused video; then the
  // largest usable paused video. Hidden playing videos are a last resort.
  const tier = playing && area > 16 ? 4 : playing && audio ? 3 : area > 16 ? 2 : playing ? 1 : 0;
  const duration = Number(item.duration);
  return [tier, area, Number(item.readyState) || 0, Number.isFinite(duration) ? duration : 0];
}

function compareBrowserMediaCandidates(a, b) {
  const left = browserMediaCandidateRank(a);
  const right = browserMediaCandidateRank(b);
  for (let index = 0; index < left.length; index++) {
    if (left[index] !== right[index]) return right[index] - left[index];
  }
  return 0;
}

module.exports = { browserMediaCandidateRank, compareBrowserMediaCandidates };
