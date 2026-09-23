// R114: gerçek oynatıcıda gerçek transkripsiyon SRT'si — clip.mp4 + kardeş clip.srt
import {connect, evalJs, shot, sleep} from '/home/ubuntu/qa-109/cdp.mjs';
import {execSync} from 'node:child_process';
const J = JSON.stringify;
const MEDIA = '/home/ubuntu/qa-114/media/clip.mp4';
const SHOTS = '/home/ubuntu/qa-114/shots';
const c = await connect();

async function grantIfDialog() {
  try {
    const out = execSync('DISPLAY=:0 wmctrl -l').toString();
    if (/erişim|access/i.test(out)) {
      const wid = execSync("DISPLAY=:0 wmctrl -l | grep -iE 'erişim|access' | awk '{print $1}'").toString().trim();
      execSync(`DISPLAY=:0 wmctrl -a ${wid}`); await sleep(400);
      execSync('DISPLAY=:0 xdotool key Tab Return');
      return true;
    }
  } catch(e) {}
  return false;
}
async function state() {
  return await evalJs(c, `JSON.stringify({
    t:+playerVideo.currentTime.toFixed(2), paused:playerVideo.paused,
    ready:playerVideo.readyState, dur:+playerVideo.duration.toFixed(2),
    layer:!document.getElementById('playerLayer').classList.contains('hidden'),
    cues:(player.cues||[]).length, role:player.subRole,
    overlay:(document.getElementById('subtitleOverlay')?.innerText||'').trim(),
    sel:[...document.getElementById('playerSubSelect').options].map(o=>o.value)})`);
}

const step = process.argv[2] || 'open';
if (step === 'open') {
  await evalJs(c, `openLocalMedia(${J(MEDIA)}, 0)`, false);
  await sleep(1500); await grantIfDialog(); await sleep(1500); await grantIfDialog();
  console.log('open:', await state());
} else if (step === 'seek') {
  const t = parseFloat(process.argv[3] || '0');
  await evalJs(c, `playerVideo.currentTime=${t}; playerVideo.pause()`, false);
  await sleep(900);
  console.log(`seek ${t}:`, await state());
} else if (step === 'play') {
  await evalJs(c, `playerVideo.play()`, false);
  await sleep(1200);
  console.log('play:', await state());
} else if (step === 'shot') {
  await shot(c, `${SHOTS}/${process.argv[3] || 'shot'}.png`);
  console.log('shot saved');
} else if (step === 'state') {
  console.log('state:', await state());
}
process.exit(0);
