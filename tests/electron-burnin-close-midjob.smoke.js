'use strict';

// İş ortasında ana pencere kapanışı E2E'si (plan maddesi 12) — iki semantik:
//   A) Düzenli kapanış (win.close): gömme süreci öldürülür ve finish() artık
//      temizliği koşar → çıktı/tmp/kurtarma artığı KALMAZ (temiz iptal).
//   B) Sert çökme (SIGKILL): kurtarma kaydı + yarım tmp kalır → sonraki açılış
//      burnin-recovery'yi görür, recoveryId ile işi bitirir.
// Sürücü gerçek Electron çocuk süreçleri başlatır (kapanış/çökme gerçek
// uygulama çıkışıdır — aynı süreçte taklit edilemez).
//
// Çalıştırma: xvfb-run -a npx electron tests/electron-burnin-close-midjob.smoke.js --disable-gpu

const assert = require('assert');
const { spawn, spawnSync } = require('child_process');
const fs = require('fs');
const os = require('os');
const path = require('path');

const out = fs.mkdtempSync(path.join(os.tmpdir(), 'burnin-close-'));
const profileDir = path.join(out, 'profile');
fs.mkdirSync(profileDir, { recursive: true });

const repoRoot = path.resolve(__dirname, '..');
const childScript = path.join(__dirname, 'electron-burnin-close-midjob.child.js');

// resolveFfTool önceliğiyle aynı: backend/bin → PATH.
const ffTool = (name) => {
  const exe = process.platform === 'win32' ? `${name}.exe` : name;
  const local = path.join(repoRoot, 'backend', 'bin', exe);
  return fs.existsSync(local) ? local : name;
};

const videoPath = path.join(out, 'orta-is-video.mp4');
const subPath = path.join(out, 'orta-is.srt');
const outName = 'orta-is-video.altyazili.mp4';
const outPath = path.join(out, outName);
const recoveryPath = path.join(profileDir, 'burnin-recovery.json');

// Çocuk = temiz env + kendi X sunucusu (ebeveynin Chrome env'leri iç içe
// zygote/GPU sürecini kırar; Windows'ta doğrudan çağrı yeterli).
const spawnChild = (phase) => {
  const env = { ...process.env };
  for (const k of Object.keys(env)) if (/^(CHROME|ELECTRON)/.test(k)) delete env[k];
  Object.assign(env, {
    WHISPER_RESOURCE_SOAK_USER_DATA: profileDir,
    BURN_VIDEO: videoPath,
    BURN_SUB: subPath,
  });
  const [cmd, args] = process.platform === 'win32'
    ? [process.execPath, [childScript, `--phase=${phase}`, '--disable-gpu']]
    : ['xvfb-run', ['-a', process.execPath, childScript, `--phase=${phase}`, '--disable-gpu']];
  const child = spawn(cmd, args, { env, stdio: ['ignore', 'pipe', 'pipe'], detached: true });
  const state = { proc: child, stdout: '', stderr: '' };
  child.stdout.on('data', (d) => { state.stdout += d; });
  child.stderr.on('data', (d) => { state.stderr += d; });
  // xvfb-run sarmalını değil süreç GRUBUNU öldür (içteki electron + Xvfb dahil).
  state.kill = () => { try { process.kill(-child.pid, 'SIGKILL'); } catch (_) { child.kill('SIGKILL'); } };
  state.done = new Promise((resolve) => {
    const killer = setTimeout(() => state.kill(), 240000);
    child.on('close', (code, signal) => { clearTimeout(killer); resolve({ code, signal }); });
  });
  return state;
};

const waitMarker = async (state, marker, ms = 240000) => {
  const started = Date.now();
  while (Date.now() - started < ms) {
    if (state.stdout.includes(marker)) return;
    await new Promise((r) => setTimeout(r, 200));
  }
  throw new Error(`işaret yok: ${marker}\n--- stdout ---\n${state.stdout}\n--- stderr ---\n${state.stderr.slice(-2000)}`);
};
const waitExit = async (state, label) => {
  const { code, signal } = await state.done;
  if (code === 0) return;
  throw new Error(`${label} çıkışı ${code}/${signal}\n--- stdout ---\n${state.stdout}\n--- stderr ---\n${state.stderr.slice(-2000)}`);
};

(async () => {
  try {
    const gen = spawnSync(ffTool('ffmpeg'), [
      '-y', '-f', 'lavfi', '-i', 'color=c=navy:s=1280x720:d=60:r=24',
      '-f', 'lavfi', '-i', 'sine=frequency=330:duration=60',
      '-c:v', 'libx264', '-pix_fmt', 'yuv420p', '-preset', 'veryfast', '-c:a', 'aac',
      '-shortest', videoPath,
    ], { encoding: 'utf8' });
    assert.equal(gen.status, 0, `fixture ffmpeg: ${(gen.stderr || '').slice(-300)}`);
    fs.writeFileSync(subPath,
      '1\n00:00:00,000 --> 00:00:05,000\nUzun gömme testi birinci satır\n\n'
      + '2\n00:00:05,000 --> 00:00:10,000\nİkinci satır\n',
      'utf8');
    console.log('[close-midjob] fixture hazır');

    // A) Düzenli kapanış: temiz iptal — artık kalmaz.
    const run1 = spawnChild('run');
    await waitMarker(run1, '[child] iş koşuyor');
    await waitExit(run1, 'faz-run');
    assert(!fs.existsSync(outPath), 'kapanışta çıktı tamamlanmış olamaz');
    assert(fs.readdirSync(out).filter((f) => f.includes('.tmp')).length === 0,
      `tmp artığı: ${fs.readdirSync(out)}`);
    assert(!fs.existsSync(recoveryPath) && !fs.existsSync(`${recoveryPath}.bak`),
      'düzenli kapanış kurtarma kaydını temizlemeli');
    const check = spawnChild('check');
    await waitMarker(check, '[child] check:');
    await waitExit(check, 'faz-check');
    assert(/"available":\s*false/.test(check.stdout), `kurtarma kalmamalı: ${check.stdout.slice(-400)}`);
    console.log('[close-midjob] A: düzenli kapanış temiz iptal (artık yok)');

    // B) Sert çökme: kurtarma kaydı kalır → recoveryId ile bitirilir.
    const crash = spawnChild('crash');
    await waitMarker(crash, '(çökme bekleniyor)');
    crash.kill();
    await crash.done;
    assert(fs.existsSync(recoveryPath), 'çökme sonrası kurtarma kaydı yok');
    const recovery = JSON.parse(fs.readFileSync(recoveryPath, 'utf8'));
    assert.equal(path.resolve(recovery.videoPath), path.resolve(videoPath), 'kurtarma video yolu');
    console.log('[close-midjob] B: çökme sonrası kurtarma kaydı duruyor');

    const run2 = spawnChild('recover');
    await waitMarker(run2, '[child] kurtarma tamamlandı');
    await waitExit(run2, 'faz-recover');
    assert(fs.existsSync(outPath), 'kurtarma çıktısı yazılmadı');
    const dur = parseFloat(spawnSync(ffTool('ffprobe'), [
      '-v', 'error', '-show_entries', 'format=duration', '-of', 'csv=p=0', outPath,
    ], { encoding: 'utf8' }).stdout.trim());
    assert(dur > 55 && dur < 70, `kurtarma çıktı süresi: ${dur}`);
    console.log(`[close-midjob] B: kurtarma tamamlandı (${dur.toFixed(1)}s çıktı)`);

    console.log('PASS: kapanış-iş-ortasında E2E — temiz iptal + çökme kurtarması');
    process.exit(0);
  } catch (error) {
    console.error('[close-midjob] hata:', error && error.stack || error);
    process.exit(1);
  }
})();
