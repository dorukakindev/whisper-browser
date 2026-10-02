#!/usr/bin/env node
'use strict';

// Sürüm kabul kampanyası (kuyruk-50 madde 50).
// Transkripsiyon → çeviri → düzenleme → kayıt → yeniden açma hatlarını
// kontrollü korpus üzerinde ölçer: süre, tepe RSS, cue/zamanlama sadakati,
// metin koruma oranı. Çıktı: makine-okunur JSON + markdown rapor.
//
// Koşu:  node tools/release-acceptance.js [--keep-tmp]
// Gereksinim: backend/venv (faster_whisper+openai), ffmpeg, python3+gtts.
// Opt-in değildir ama ağır — CI'ye girmez; periyodik/manuel kampanya.

const { spawnSync, spawn } = require('node:child_process');
const { createHash } = require('node:crypto');
const fs = require('node:fs');
const http = require('node:http');
const os = require('node:os');
const path = require('node:path');
const { promisify } = require('node:util');

const ROOT = path.join(__dirname, '..');
const VENV_PY = process.platform === 'win32'
  ? path.join(ROOT, 'backend', 'venv', 'Scripts', 'python.exe')
  : path.join(ROOT, 'backend', 'venv', 'bin', 'python');
const TRANSCRIBE = path.join(ROOT, 'backend', 'transcribe.py');
const KEEP_TMP = process.argv.includes('--keep-tmp');

function fail(msg) { console.error(`acceptance: ${msg}`); process.exit(1); }

// ---------- ortam kapıları ----------
if (!fs.existsSync(VENV_PY)) fail('backend/venv yok');
{
  const probe = spawnSync(VENV_PY, ['-c', 'import faster_whisper, openai'], { encoding: 'utf8' });
  if (probe.status !== 0) fail(`venv eksik: ${probe.stderr}`);
}
if (spawnSync('ffmpeg', ['-version'], { encoding: 'utf8' }).status !== 0) fail('ffmpeg yok');
if (spawnSync('python3', ['-c', 'import gtts'], { encoding: 'utf8' }).status !== 0) fail('gtts yok');

// ---------- korpus ----------
// Lisanslı uzun medya yerine: kamuya açık metinden gTTS ile sentezlenmiş
// uzun konuşma (kutusuz, lisans sorunu yok). Varsayılan ~4 dakika;
// `--minutes N` uzun-film kabul koşusu için süreyi ölçekler (satır başına
// gTTS + ffmpeg concat — tek dev isteğin sınırına takılmadan).
const TARGET_MINUTES = (() => {
  const i = process.argv.indexOf('--minutes');
  const n = i >= 0 ? Number(process.argv[i + 1]) : 0;
  return Number.isFinite(n) && n > 0 ? n : 0;
})();
const SPEECH_LINES = [
  'The committee approved the proposal on March 14, 1982.',
  'Prices rose by 12.5 percent, from $3.40 to $3.83 a share.',
  'Dr. Adams said the patient, Mr. O\'Neil, recovered quickly.',
  'It was raining heavily in İzmir when the ferry left at 09:45.',
  'The subtitle says: «Café, naïveté, façade — and £250.»',
  'Chapter 7 discusses ΔE = mc², written plainly for students.',
  'In 1978, over 3,000 people attended the rally in Lyon.',
  'He whispered, «Do not forget the keys — they are in the drawer.»',
  'The 25-kilometre pipeline cost roughly 4.6 million euros.',
  'Next Tuesday at 8:00 a.m., the lecture resumes in Hall B.',
];

function makeSpeechText() {
  const out = [];
  // Bir tur ≈ 55 saniye konuşma üretir (ölçülü); hedef süreye göre tur sayısı.
  const rounds = TARGET_MINUTES > 0 ? Math.max(1, Math.ceil(TARGET_MINUTES * 60 / 55)) : 5;
  for (let round = 0; round < rounds; round += 1) {
    for (const line of SPEECH_LINES) out.push(line);
    out.push(`Segment ${round + 1} ends. A brief pause follows.`);
  }
  return out.join(' ');
}

// Zor altyazı korpusu — her dosya belirli bir risk sınıfını sınar.
const CORPUS = {
  'sdh.srt': `1\n00:00:01,000 --> 00:00:03,000\n[DOOR SLAMMING] - Hey!\n\n2\n00:00:03,500 --> 00:00:05,000\n<i>(music playing)</i> [GASPS]\n`,
  'numbers.srt': `1\n00:00:01,000 --> 00:00:02,500\nIn 1997, we sold 4.5 million units at $19.99 each.\n\n2\n00:00:02,750 --> 00:00:04,000\nA 12-hour shift: 08:30 to 20:30, 6 days a week.\n`,
  'cjk-rtl.srt': `1\n00:00:01,000 --> 00:00:03,000\nこんにちは — مرحبا بالعالم — hello\n\n2\n00:00:03,200 --> 00:00:04,500\nのと Türkçe altyazı birlikte.\n`,
  'longlines.srt': `1\n00:00:01,000 --> 00:00:04,000\nThis is an intentionally very long subtitle line that stretches well beyond the recommended forty-two character limit to probe wrap handling.\n\n2\n00:00:04,100 --> 00:00:05,500\nSecond block, short.\n`,
  'entities.srt': `1\n00:00:01,000 --> 00:00:02,000\nTom &amp; Jerry said &quot;5 &lt; 7&quot; &gt; 4.\n\n2\n00:00:02,100 --> 00:00:03,500\nA &lt;b&gt;bold&lt;/b&gt; &amp; an &lt;i&gt;italic&lt;/i&gt;.\n`,
  'overlaps.srt': `1\n00:00:01,000 --> 00:00:03,500\nFirst cue, three and a half seconds long.\n\n2\n00:00:03,000 --> 00:00:04,000\nSecond cue overlaps the first by half a second.\n`,
  'edge-times.srt': `1\n00:00:00,000 --> 00:00:00,900\nZero-start cue.\n\n2\n01:00:00,000 --> 01:00:02,000\nOne-hour-offset cue for deep media.\n`,
  'empty.srt': `1\n00:00:01,000 --> 00:00:02,000\n\n\n2\n00:00:02,500 --> 00:00:03,500\nActual text here.\n`,
};

// ---------- yardımcılar ----------
// NOT: stub sağlayıcı BU süreçte çalışır — spawnSync event loop'u dondurup
// backend isteklerini cevapsız bırakır (deadlock). Mutlaka async spawn.
function runBackend(args, label) {
  return new Promise((resolve) => {
    const t0 = Date.now();
    const timeFile = path.join(tmpDir, `time-${label}.txt`);
    const proc = spawn('/usr/bin/time', ['-v', '-o', timeFile, VENV_PY, TRANSCRIBE, ...args],
      { env: { ...process.env, WHISPER_LLM_API_KEY: 'stub' } });
    let stdout = ''; let stderr = '';
    proc.stdout.on('data', (c) => { stdout += c; });
    proc.stderr.on('data', (c) => { stderr += c; });
    proc.on('close', (status) => {
      const wallMs = Date.now() - t0;
      let peakMib = 0;
      try {
        const m = fs.readFileSync(timeFile, 'utf8').match(/Maximum resident set size \(kbytes\): (\d+)/);
        if (m) peakMib = Number(m[1]) / 1024;
      } catch (_) {}
      resolve({ status, stdout, stderr, wallMs, peakMib });
    });
  });
}

function parseSrtFile(file) {
  const src = fs.readFileSync(file);
  const bom = src[0] === 0xEF && src[1] === 0xBB && src[2] === 0xBF;
  const text = src.toString('utf8').replace(/^﻿/, '');
  const cues = [];
  for (const block of text.split(/\r?\n\r?\n/)) {
    const lines = block.trim().split(/\r?\n/);
    if (!lines.length) continue;
    const t = lines.find((l) => l.includes('-->'));
    if (!t) continue;
    const [a, b] = t.split('-->').map((s) => s.trim());
    cues.push({ start: a, end: b, text: lines.slice(lines.indexOf(t) + 1).join(' ') });
  }
  return { bom, cues };
}

const toMs = (t) => {
  const m = t.match(/(\d+):(\d+):(\d+)[,.](\d+)/);
  return m ? (((+m[1]) * 60 + +m[2]) * 60 + +m[3]) * 1000 + +m[4] : NaN;
};

const wordRatio = (a, b) => {
  const A = new Set(a.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean));
  const B = new Set(b.toLowerCase().replace(/[^\p{L}\p{N} ]/gu, '').split(/\s+/).filter(Boolean));
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const w of A) if (B.has(w)) hit += 1;
  return hit / A.size;
};

// ---------- stub OpenAI sağlayıcısı ----------
let providerRequests = 0;
const providerLog = [];
const provider = http.createServer((req, res) => {
  const chunks = [];
  req.on('data', (c) => chunks.push(c));
  req.on('end', () => {
    try {
      const body = JSON.parse(Buffer.concat(chunks).toString('utf8'));
      providerRequests += 1;
      const user = JSON.parse(body.messages[1].content);
      const items = user.items || {};
      if (providerLog.length < 5) providerLog.push({ groups: (user.sentence_groups || []).length, items: Object.keys(items).length });
      const outItems = {}; const sents = {};
      for (const g of user.sentence_groups || []) {
        // items: [{i, max, t}] listesi; ids pozisyon. Sözleşme kapıları:
        // echo ret + anlam kapıları (sayı/tarih/birim/SDH/özel ad çapası,
        // olumsuzluk/modal). Stub parçaları çapa tokenları korur ama kaynak
        // metni taşımaz — 'TR-i <çapalar> çeviri'.
        const parts = g.ids.map((i) => {
          const src = items[i] && items[i].t ? String(items[i].t) : '';
          const digits = src.match(/[\$£€₺]?\d[\d.,:%/+-]*/g) || [];
          const sdh = src.match(/[[(][^\])]{1,30}[\])]/g) || [];
          const proper = src.match(/\b[A-ZÇĞİÖŞÜ][\p{L}']*(?:-[\p{L}']+)*\b/gu) || [];
          const money = src.match(/\b(?:dollars?|euros?|pounds?|lira|yen|usd|eur|gbp|try)\b/gi) || [];
          const units = src.match(/\b(?:percent|kilometres?|kilometers?|meters?|metres?|miles?|kg|hours?|minutes?|days?|weeks?|months?|years?|million|billion|units?|each|a\.m\.|p\.m\.|am|pm)\b/gi) || [];
          const months = src.match(/\b(?:January|February|March|April|May|June|July|August|September|October|November|December)\b/g) || [];
          const neg = /\bnot\b|n't/i.test(src) ? 'değil' : '';
          const modal = /\b(?:must|shall|should|have to)\b/i.test(src) ? 'gerekir'
            : /\b(?:may|might|can|could)\b/i.test(src) ? 'olabilir' : '';
          const anchors = [...digits, ...sdh, ...proper, ...money, ...units, ...months, modal, neg].filter(Boolean);
          return `TR-${i} ${anchors.join(' ')} çeviri`;
        });
        for (const [k, i] of g.ids.entries()) outItems[String(i)] = parts[k];
        sents[String(g.ids[0])] = parts.join(' ');
      }
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({
        choices: [{ message: { role: 'assistant', content: JSON.stringify({ sentences: sents, items: outItems, memory: {} }) }, finish_reason: 'stop' }],
      }));
    } catch (e) { res.writeHead(500).end(JSON.stringify({ error: { message: e.message } })); }
  });
});

const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'wb-acceptance-'));
const metrics = { generatedAt: new Date().toISOString(), stages: [], corpus: [], issues: [] };
const stage = (name, data) => metrics.stages.push({ name, ...data });

(async () => {
  // ---- Korpus hazırlığı ----
  provider.listen(0, '127.0.0.1');
  await promisify(provider.once.bind(provider))('listening');
  const port = provider.address().port;
  const translateArgs = ['--translate', 'tr', '--translate-api-key', 'stub',
    '--translate-base-url', `http://127.0.0.1:${port}`, '--translate-model', 'stub-model'];

  const media = path.join(tmpDir, 'long-speech.mp3');
  const speechText = makeSpeechText();
  {
    // Uzun koşularda tek dev gTTS isteği sınıra takılır; metni cümle
    // sınırlarından ~3500 karakterlik parçalara böl, her parçayı ayrı
    // sentezle ve ffmpeg concat ile birleştir. Kısa koşu tek parçada kalır.
    const chunks = [];
    let rest = speechText;
    while (rest.length) {
      let cut = Math.min(rest.length, 3500);
      if (cut < rest.length) {
        const boundary = rest.lastIndexOf('. ', cut);
        if (boundary > 1200) cut = boundary + 1;
      }
      chunks.push(rest.slice(0, cut).trim());
      rest = rest.slice(cut).trim();
    }
    const parts = [];
    for (let i = 0; i < chunks.length; i += 1) {
      const part = path.join(tmpDir, `speech-part-${i}.mp3`);
      const g = spawnSync('python3', ['-c',
        'import sys\nfrom gtts import gTTS\ntext=sys.argv[1]\ngTTS(text, lang="en").save(sys.argv[2])',
        chunks[i], part], { encoding: 'utf8' });
      if (g.status !== 0) fail(`gTTS başarısız (parça ${i}): ${g.stderr}`);
      parts.push(part);
    }
    if (parts.length === 1) {
      fs.copyFileSync(parts[0], media);
    } else {
      const listFile = path.join(tmpDir, 'speech-parts.txt');
      fs.writeFileSync(listFile, parts.map((p) => `file '${p.replace(/'/g, "'\\''")}'`).join('\n'), 'utf8');
      const c = spawnSync('ffmpeg', ['-y', '-v', 'error', '-f', 'concat', '-safe', '0',
        '-i', listFile, '-c', 'copy', media], { encoding: 'utf8' });
      if (c.status !== 0) fail(`ffmpeg concat başarısız: ${c.stderr}`);
    }
  }
  const mediaSec = (() => {
    const p = spawnSync('ffprobe', ['-v', 'error', '-show_entries', 'format=duration',
      '-of', 'default=nw=1:nk=1', media], { encoding: 'utf8' });
    return Number(p.stdout.trim()) || 0;
  })();
  stage('corpus', { mediaBytes: fs.statSync(media).size, mediaSec, hardCases: Object.keys(CORPUS).length });

  const corpusDir = path.join(tmpDir, 'corpus');
  fs.mkdirSync(corpusDir, { recursive: true });
  for (const [name, body] of Object.entries(CORPUS)) fs.writeFileSync(path.join(corpusDir, name), body, 'utf8');

  // ---- A: Uzun medya transkripsiyonu (tiny/CPU, gerçek backend) ----
  const outA = path.join(tmpDir, 'A');
  {
    const r = await runBackend(['--input', media, '--model', 'tiny', '--device', 'cpu',
      '--language', 'en', '--formats', 'srt,vtt,json', '--output-dir', outA,
      '--split-mode', 'sentence'], 'A');
    if (r.status !== 0) fail(`transcribe başarısız: ${r.stderr}\n${r.stdout.slice(-800)}`);
    const srt = parseSrtFile(path.join(outA, 'long-speech.srt'));
    const vtt = parseSrtFile(path.join(outA, 'long-speech.vtt'));
    const json = JSON.parse(fs.readFileSync(path.join(outA, 'long-speech.json'), 'utf8'));
    const mono = srt.cues.every((c, i) => i === 0 || toMs(c.start) >= toMs(srt.cues[i - 1].start) - 1);
    const transcriptText = srt.cues.map((c) => c.text).join(' ');
    // Madde 3 ölçümü: kaliteyi dosya başı/ortası/sonundan ayrı örnekle —
    // model yalnız ilk dakikalarda doğruysa ortalama skor bunu gizlerdi.
    // Referans metin tur tekrarlı; aynı indeks üçlüsüne bölünerek karşılaştırılır.
    const regionOverlap = {};
    for (const [name, lo, hi] of [['start', 0, 1 / 3], ['middle', 1 / 3, 2 / 3], ['end', 2 / 3, 1]]) {
      const cueSlice = srt.cues.slice(Math.floor(srt.cues.length * lo), Math.ceil(srt.cues.length * hi));
      const refSlice = speechText.split(/(?<=\.)\s+/).slice(
        Math.floor(speechText.split(/(?<=\.)\s+/).length * lo),
        Math.ceil(speechText.split(/(?<=\.)\s+/).length * hi));
      regionOverlap[name] = Number(wordRatio(cueSlice.map((c) => c.text).join(' '), refSlice.join(' ')).toFixed(3));
    }
    stage('transcribe', {
      wallMs: r.wallMs, peakMib: Math.round(r.peakMib),
      cues: { srt: srt.cues.length, vtt: vtt.cues.length, json: (json.segments || json.cues || []).length },
      srtBom: srt.bom, vttBom: vtt.bom, monotonicTimes: mono,
      wordOverlapVsReference: Number(wordRatio(transcriptText, speechText).toFixed(3)),
      wordOverlapByRegion: regionOverlap,
    });
    // Sözleşme: SRT/ASS utf-8-sig; WebVTT spec BOM'u YASAKLAR — vttBom=false beklenir.
    if (!srt.bom) metrics.issues.push('B-50-01: SRT çıktı BOM eksik');
    if (vtt.bom) metrics.issues.push('B-50-01b: VTT çıktıya BOM kaçmış (spec ihlali)');
    if (!mono) metrics.issues.push('B-50-02: cue zamanları monoton değil');
  }

  const producedSrt = path.join(outA, 'long-speech.srt');

  // ---- B: Çeviri (stub sağlayıcı, zamanlama invariantsı) ----
  const outB = path.join(tmpDir, 'B');
  {
    const r = await runBackend(['--translate-only', 'true', '--input', producedSrt,
      '--output-dir', outB, '--formats', 'srt', ...translateArgs], 'B');
    if (r.status !== 0) fail(`translate başarısız: ${r.stderr}\n${r.stdout.slice(-800)}`);
    const trFiles = fs.readdirSync(outB).filter((f) => f.endsWith('.srt'));
    const tr = parseSrtFile(path.join(outB, trFiles[0]));
    const src = parseSrtFile(producedSrt);
    const timeKept = tr.cues.length === src.cues.length
      && tr.cues.every((c, i) => c.start === src.cues[i].start && c.end === src.cues[i].end);
    const translated = tr.cues.filter((c) => /TR-\d+/.test(c.text)).length;
    // Ret nedenlerini NDJSON akışından topla (acceptance kanıtı).
    const rejects = [...r.stdout.matchAll(/kabul|reject|echo|atla[ndy]ı|skipped|dropped/gi)].length;
    stage('translate', {
      wallMs: r.wallMs, peakMib: Math.round(r.peakMib), file: trFiles[0],
      cuesIn: src.cues.length, cuesOut: tr.cues.length, providerRequests,
      providerSamples: providerLog,
      translatedCues: translated, timingsPreserved: timeKept,
      stdoutTail: r.stdout.split('\n').filter(Boolean).slice(-6).map((l) => l.slice(0, 160)),
      rejectishLines: rejects,
    });
    if (!timeKept) metrics.issues.push('B-50-03: çeviri zaman kodlarını bozdu');
    if (translated < src.cues.length * 0.9) metrics.issues.push(`B-50-04: çeviri kapsaması düşük (${translated}/${src.cues.length})`);
  }

  // ---- C: Düzenleme → kayıt → yeniden açma ----
  {
    const src = parseSrtFile(producedSrt);
    const edited = path.join(tmpDir, 'edited.srt');
    const editIdx = new Set([1, 4, 7].filter((i) => i < src.cues.length));
    let n = 0;
    const body = src.cues.map((c) => {
      n += 1;
      const text = editIdx.has(n - 1) ? `DÜZENLENDİ kısa not ${n}` : c.text;
      return `${n}\n${c.start} --> ${c.end}\n${text}`;
    }).join('\n\n');
    fs.writeFileSync(edited, `${body}\n\n`, 'utf8');
    const back = parseSrtFile(edited);
    const editedOk = [...editIdx].every((i) => back.cues[i] && back.cues[i].text.includes('DÜZENLENDİ'));
    const untouchedOk = back.cues.every((c, i) => editIdx.has(i) ? true : c.text === src.cues[i].text);
    const timeOk = back.cues.every((c, i) => c.start === src.cues[i].start && c.end === src.cues[i].end);
    stage('edit-save-reopen', { cues: back.cues.length, editsApplied: editIdx.size,
      editsPersisted: editedOk, untouchedIdentical: untouchedOk, timingsPreserved: timeOk });
    if (!(editedOk && untouchedOk && timeOk)) metrics.issues.push('B-50-05: düzenleme/kayıt/yeniden-açma sadakati bozuldu');
  }

  // ---- D: Zor korpus matrisi (parse+çeviri+zamanlama) ----
  for (const [name, body] of Object.entries(CORPUS)) {
    const file = path.join(corpusDir, name);
    const ref = parseSrtFile(file);
    const outDir = path.join(tmpDir, 'D', name.replace(/\W/g, '_'));
    const r = await runBackend(['--translate-only', 'true', '--input', file,
      '--output-dir', outDir, '--formats', 'srt', ...translateArgs], `D-${name}`);
    const ok = r.status === 0;
    let row = { file: name, refCues: ref.cues.length, translateOk: ok };
    if (ok) {
      const outFile = fs.readdirSync(outDir).filter((f) => f.endsWith('.srt'))[0];
      const out = parseSrtFile(path.join(outDir, outFile));
      // drop_empty_entries: metinsiz cue'lar tasarım gereği düşer — beklenti
      // 'drop yoksa 1:1' değil 'dolu cue'ların zamanlaması korunur'.
      const expectedDrop = ref.cues.filter((c) => !c.text.trim()).length;
      row = { ...row, outCues: out.cues.length, droppedEmpty: expectedDrop,
        timingsPreserved: out.cues.every((c) => ref.cues.some((r2) => r2.start === c.start && r2.end === c.end)),
        trCovered: out.cues.filter((c) => /TR-\d+/.test(c.text)).length };
      if (!row.timingsPreserved) metrics.issues.push(`B-50-06: ${name} çeviride zamanlama bozuldu`);
      if (out.cues.length < ref.cues.length - expectedDrop) metrics.issues.push(`B-50-07: ${name} cue kaybı ${ref.cues.length}→${out.cues.length}`);
    } else {
      row.error = (r.stderr || r.stdout).split('\n').filter(Boolean).slice(-2).join(' | ').slice(0, 220);
      row.stdoutTail = r.stdout.split('\n').filter((l) => /error|warn|atla|kabul/i.test(l)).slice(-4).map((l) => l.slice(0, 200));
      if (name !== 'empty.srt') metrics.issues.push(`B-50-08: ${name} çeviri çöktü: ${row.error}`);
      else row.note = 'boş-korpus beklendiği gibi reddedildi (graceful)';
    }
    metrics.corpus.push(row);
  }

  // ---- Rapor ----
  const jsonPath = path.join(tmpDir, 'acceptance.json');
  metrics.inputSha256 = createHash('sha256').update(JSON.stringify({ CORPUS, SPEECH_LINES })).digest('hex');
  fs.writeFileSync(jsonPath, `${JSON.stringify(metrics, null, 2)}\n`, 'utf8');

  const lines = [
    '# Sürüm kabul kampanyası — madde 50', '',
    `Koşu: ${metrics.generatedAt} · korpusHash: ${metrics.inputSha256.slice(0, 12)}`, '',
    '## Aşama özeti', '',
    '| Aşama | Duvar ms | Tepe MiB | Sonuç |', '|---|---|---|---|',
    ...metrics.stages.map((s) => `| ${s.name} | ${s.wallMs || '—'} | ${s.peakMib || '—'} | ${Object.entries(s).filter(([k]) => !['name', 'wallMs', 'peakMib'].includes(k)).map(([k, v]) => `${k}=${typeof v === 'object' ? JSON.stringify(v) : v}`).join(', ')} |`),
    '', '## Zor korpus matrisi', '', '| Dosya | Ref cue | Çıktı cue | tr kapsama | Zamanlama | Durum |', '|---|---|---|---|---|---|',
    ...metrics.corpus.map((c) => `| ${c.file} | ${c.refCues} | ${c.outCues ?? '—'} | ${c.trCovered ?? '—'} | ${c.timingsPreserved ?? '—'} | ${c.translateOk ? 'ok' : (c.note || c.error)} |`),
    '', '## Bulgular', '',
    ...(metrics.issues.length ? metrics.issues.map((i) => `- ${i}`) : ['- Doğrulanmış kusur yok.']),
    '', '## Kalan sınırlar', '',
    '- Gerçek lisanslı uzun medya (≥1 saat, sinema/dizi) Windows makinede `D:\\Whisper Local` altında koşulmadı — bu kampanya sentetik ~4dk gTTS ile yürüdü.',
    '- GPU/CUDA yolu (RTX 4070 Ti) bu kutuda yok; tiny/CPU kullanıldı — GPU hız/bellek karşılaştırması Windows devrinde.',
    '- Gerçek sağlayıcı kalitesi (ücretli LLM) stub ile temsil edildi; kelime düzeyi WER karşılaştırması üretilmedi.',
    '- Kuyruk/UI kanalıyla yeniden-açma (sonuç modalı, kuyruk devamı) bu koşu dışında — Electron acceptance smoke ayrı kaplar.',
  ];
  const mdPath = path.join(tmpDir, 'RELEASE_ACCEPTANCE.md');
  fs.writeFileSync(mdPath, `${lines.join('\n')}\n`, 'utf8');
  console.log(`acceptance: JSON=${jsonPath}\nacceptance: rapor=${mdPath}`);
  console.log(lines.join('\n'));
  provider.close();
  if (!KEEP_TMP) process.on('exit', () => { try { fs.rmSync(tmpDir, { recursive: true, force: true }); } catch (_) {} });
})().catch((e) => { console.error(e); provider.close(); process.exit(1); });
