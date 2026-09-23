// R114-B: gerçek Electron'da canlı rolling HLS oynatma ölçümü
import {connect, evalJs, shot, sleep} from '/home/ubuntu/qa-109/cdp.mjs';
const URL = process.env.LIVE_URL;
const SHOTS = '/home/ubuntu/qa-114/shots';
const c = await connect();

const state = () => evalJs(c, `JSON.stringify({
  t:+playerVideo.currentTime.toFixed(2), paused:playerVideo.paused,
  ready:playerVideo.readyState,
  buf:(playerVideo.buffered.length?+playerVideo.buffered.end(playerVideo.buffered.length-1).toFixed(2):0),
  live:!!player.isLive, ended:playerVideo.ended,
  tracks:[...playerVideo.textTracks].map(t=>({mode:t.mode,cues:t.cues?t.cues.length:0,active:(t.activeCues&&t.activeCues.length?String(t.activeCues[0].text).slice(0,60):'')})),
  cueCount:(player.cues||[]).length,
  overlay:(document.getElementById('subtitleOverlay')?.innerText||'').trim().slice(0,90),
  quality:[...document.getElementById('playerQuality').options].map(o=>o.value)
})`);

await evalJs(c, `openPlayer()`);
console.log('setHls:', await evalJs(c, `setPlayerHls(${JSON.stringify(URL)}, 'r114-live', 'fixture:live114', {isLive:true})`));
const samples = [];
for (let i = 0; i < 46; i++) {
  const s = JSON.parse(await state());
  samples.push({ i, ...s });
  if (i === 10) await shot(c, `${SHOTS}/live-a.png`);
  if (i === 24) await shot(c, `${SHOTS}/live-b.png`);
  if (i === 40) await shot(c, `${SHOTS}/live-c.png`);
  if (s.ended && i > 30) break;
  await sleep(1000);
}
console.log(JSON.stringify(samples));
console.log('FINAL:', await state());
process.exit(0);
