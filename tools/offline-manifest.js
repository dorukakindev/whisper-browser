#!/usr/bin/env node
'use strict';

// Madde 47 — çevrimdışı kurulum manifesti.
// Kurulumun ihtiyaç duyduğu tüm indirilebilir bileşenleri tek belgede
// toplar: pip kilit dosyaları, CUDA torch indeksi, npm bağımlılıkları,
// yerel binary'ler (ffmpeg/yt-dlp) ve model kaynakları.
//
// Koşu:  node tools/offline-manifest.js [--json]
// Çıktı: docs/OFFLINE-MANIFEST.md (+ --json ile stdout'a makine-okunur veri)

const fs = require('node:fs');
const path = require('node:path');

const ROOT = path.join(__dirname, '..');
const OUT_MD = path.join(ROOT, 'docs', 'OFFLINE-MANIFEST.md');

function readUtf8(rel) {
  return fs.readFileSync(path.join(ROOT, rel), 'utf-8');
}

function parsePins(text) {
  const pins = [];
  for (const raw of String(text || '').split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#') || line.startsWith('-')) continue;
    const m = line.match(/^([A-Za-z0-9._-]+(?:\[[^\]]+\])?)\s*==\s*(\S+)/);
    if (m) pins.push({ name: m[1], version: m[2] });
  }
  return pins;
}

function collectLockfile(rel, required) {
  const p = path.join(ROOT, rel);
  if (!fs.existsSync(p)) {
    return { file: rel, required: !!required, present: false, pins: [] };
  }
  return { file: rel, required: !!required, present: true, pins: parsePins(readUtf8(rel)) };
}

function npmDependencies() {
  const pkg = JSON.parse(readUtf8('package.json'));
  let lockCount = null;
  try {
    const lock = JSON.parse(readUtf8('package-lock.json'));
    lockCount = Object.keys(lock.packages || {}).length - 1; // "" kök girişi hariç
  } catch (_) {}
  return {
    direct: { ...(pkg.dependencies || {}), ...(pkg.devDependencies || {}) },
    lockedPackageCount: lockCount,
  };
}

function whisperModelChoices() {
  // UI'daki model <option> değerleri — faster-whisper CTranslate2 HF repoları.
  const html = readUtf8(path.join('src', 'renderer', 'index.html'));
  const m = html.match(/<select id="model">([\s\S]*?)<\/select>/);
  const opts = [...(m ? m[1] : '').matchAll(/value="([^"]+)"/g)].map((x) => x[1]);
  return opts;
}

function main() {
  const pkg = JSON.parse(readUtf8('package.json'));
  const manifest = {
    generatedAt: new Date().toISOString(),
    appVersion: pkg.version || '',
    python: {
      supported: '3.10–3.11 (CPython, Windows x64)',
      torchIndex: 'https://download.pytorch.org/whl/cu121',
      torchPins: ['torch==2.5.1+cu121', 'torchaudio==2.5.1+cu121'],
      lockfiles: [
        collectLockfile('backend/requirements-core.lock', true),
        collectLockfile('backend/constraints-install.lock', true),
        collectLockfile('backend/requirements-whisperx.lock', false),
        collectLockfile('backend/requirements-diarize.lock', false),
        collectLockfile('backend/requirements-separator.lock', false),
      ],
    },
    npm: npmDependencies(),
    binaries: [
      { name: 'ffmpeg.exe + ffprobe.exe', dest: 'backend/bin/', required: true,
        note: 'Windows x64 static build (ör. gyan.dev veya BtbN). install-orchestrator ikisini de ister.' },
      { name: 'yt-dlp.exe', dest: 'backend/bin/ (veya pip kurulumu)', required: true,
        note: 'requirements-core.lock içinde pip paketi olarak da var; standalone exe alternatif.' },
    ],
    models: [
      { kind: 'whisper-ct2', names: whisperModelChoices(),
        source: 'HuggingFace — Systran/faster-whisper-* repoları',
        note: 'İlk indirmeden sonra HF önbelleği çevrimdışı kullanılabilir; hedef makineye %USERPROFILE%\\.cache\\huggingface altından veya --cache-dir ile kopyalanır.' },
      { kind: 'pyannote/speaker-diarization', names: ['community-1 (HF gated)'],
        source: 'HuggingFace — kapalı lisans, HF_TOKEN + koşul kabulü gerekir',
        note: 'Çevrimdışı aktarım için model dosyalarını HF önbelleğinden kopyalayın; token olmadan indirilemez.' },
      { kind: 'rapidocr', names: ['rapidocr_onnxruntime modelleri'],
        source: 'pip paketinin içinde gelir (aynalar değişebilir)',
        note: 'requirements kapsamındadır; ek indirme gerekmez.' },
      { kind: 'whisperx-align', names: ['wav2vec2 dil hizalama modelleri'],
        source: 'HuggingFace — motor başına ayrı model',
        note: 'requirements-whisperx.lock kurulursa ilk hizalamada indirilir.' },
    ],
    offlineInstall: {
      wheels: 'internetli makinede: pip download -r backend/requirements-core.lock -c backend/constraints-install.lock -d wheels\\core (torch için: --index-url https://download.pytorch.org/whl/cu121 -d wheels\\torch)',
      steps: [
        'Paketi aç → install.bat yerine wheels\\ üzerinden kur: venv oluştur, pip install --no-index --find-links wheels\\core -r backend/requirements-core.lock',
        'torch: pip install --no-index --find-links wheels\\torch torch==2.5.1+cu121 torchaudio==2.5.1+cu121',
        'npm: internetli makinede npm ci ile node_modules üretip klasörü kopyala veya npm pack ile taşı.',
        'backend/bin/ffmpeg.exe + ffprobe.exe yerleştir.',
        'Model önbelleğini kopyala (HF cache veya uygulama model dizini).',
      ],
      licensing: 'Her bileşen kendi lisansıyla gelir; pyannote kapalı lisanslıdır ve HF hesabıyla koşul kabulü ister. Whisper modelleri MIT (CTranslate2 portu).',
    },
  };

  const lines = [];
  lines.push('# Çevrimdışı Kurulum Manifesti');
  lines.push('');
  lines.push(`Oluşturulma: ${manifest.generatedAt} · sürüm ${manifest.appVersion || '—'}`);
  lines.push('Bu dosya `node tools/offline-manifest.js` ile üretilir; elle düzenlemeyin.');
  lines.push('');
  lines.push('## Python (pip) bileşenleri');
  lines.push('');
  lines.push(`Desteklenen: ${manifest.python.supported}`);
  lines.push(`Torch CUDA indeksi: ${manifest.python.torchIndex} — ${manifest.python.torchPins.join(', ')}`);
  lines.push('');
  for (const lf of manifest.python.lockfiles) {
    if (!lf.present) { lines.push(`- \`${lf.file}\` — EKSİK`); continue; }
    lines.push(`- \`${lf.file}\` — ${lf.pins.length} pin${lf.required ? ' (zorunlu)' : ' (opsiyonel)'}`);
    for (const pin of lf.pins) lines.push(`  - ${pin.name}==${pin.version}`);
  }
  lines.push('');
  lines.push('## npm bileşenleri');
  lines.push('');
  const np = manifest.npm;
  lines.push(`Doğrudan bağımlılık: ${Object.keys(np.direct).length} · kilitli paket (package-lock): ${np.lockedPackageCount ?? 'yok'}`);
  for (const [name, range] of Object.entries(np.direct).sort()) lines.push(`- ${name}@${range}`);
  lines.push('');
  lines.push('## Yerel binary\'ler');
  lines.push('');
  for (const b of manifest.binaries) {
    lines.push(`- **${b.name}** → \`${b.dest}\` ${b.required ? '(zorunlu)' : ''} — ${b.note}`);
  }
  lines.push('');
  lines.push('## Model kaynakları');
  lines.push('');
  for (const mod of manifest.models) {
    lines.push(`- **${mod.kind}** — ${mod.names.join(', ')}`);
    lines.push(`  - Kaynak: ${mod.source}`);
    lines.push(`  - Not: ${mod.note}`);
  }
  lines.push('');
  lines.push('## Çevrimdışı kurulum akışı');
  lines.push('');
  lines.push(`Wheels üretimi: \`${manifest.offlineInstall.wheels}\``);
  lines.push('');
  manifest.offlineInstall.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
  lines.push('');
  lines.push(`Lisans notu: ${manifest.offlineInstall.licensing}`);
  lines.push('');

  fs.mkdirSync(path.dirname(OUT_MD), { recursive: true });
  const next = lines.join('\n');
  // İçerik değişmediyse mevcut "Oluşturulma" satırını koru — aksi halde her
  // koşu yeni timestamp ile çalışan ağacı kirletir.
  if (fs.existsSync(OUT_MD)) {
    const prev = fs.readFileSync(OUT_MD, 'utf-8');
    const stripTs = (s) => s.replace(/^Oluşturulma: .*$/m, '');
    const ts = prev.match(/^Oluşturulma: .*$/m);
    if (ts && stripTs(prev).trim() === stripTs(next).trim()) {
      if (process.argv.includes('--json')) {
        process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
        return;
      }
      process.stdout.write('OFFLINE-MANIFEST değişmedi — mevcut dosya korundu.\n');
      return;
    }
  }
  fs.writeFileSync(OUT_MD, next, 'utf-8');
  if (process.argv.includes('--json')) {
    process.stdout.write(JSON.stringify(manifest, null, 2) + '\n');
    return;
  }
  process.stdout.write(`OFFLINE-MANIFEST yazıldı: ${path.relative(ROOT, OUT_MD)} `
    + `(pip pinleri: ${manifest.python.lockfiles.reduce((n, l) => n + l.pins.length, 0)}, `
    + `npm direkt: ${Object.keys(manifest.npm.direct).length}, modeller: ${manifest.models.length})\n`);
}

main();
