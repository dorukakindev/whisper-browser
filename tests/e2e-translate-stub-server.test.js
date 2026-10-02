'use strict';
// Yeni-100 batch-5 — backend çeviri hattının uçtan uca doğrulaması:
// gerçek argparse → gerçek OpenAI SDK → yerel stub /v1/chat/completions →
// gerçek NDJSON akışı → gerçek .tr.srt dosyası. Ağa çıkmaz; deterministik.
//
// Sözleşmeler:
//   * --translate-only: zaman kodlarına DOKUNULMAZ, satır sayısı korunur,
//     her cue'nun metni sağlayıcı yanıtıyla değişir.
//   * 429/500 gibi geçici hatalarda iç retry çalışır; sürekli hata temiz
//     `error` olayı + sıfırdan farklı çıkış kodu verir (traceback YOK).
//   * Çok bloklu cümle grubu 'sentences' anahtarıyla kabul edilir.
const assert = require('assert');
const { spawn, spawnSync } = require('child_process');
const http = require('http');
const fs = require('fs');
const os = require('os');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const VENV_PY = process.platform === 'win32'
  ? path.join(ROOT, 'backend', 'venv', 'Scripts', 'python.exe')
  : path.join(ROOT, 'backend', 'venv', 'bin', 'python');

const SKIP = !fs.existsSync(VENV_PY)
  || spawnSync(VENV_PY, ['-c', 'import openai'], { encoding: 'utf8' }).status !== 0;

if (SKIP) {
  console.log('e2e-translate-stub-server: atlandı (venv/openai yok)');
  process.exit(0);
}

let n = 0;
const ok = (c, m) => { n += 1; assert(c, m); };

const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-tr-stub-'));

// ---- armatür SRT: 5 cue, 4. ve 5. aynı cümle grubunda (aralık < sahne eşiği) ----
const srcSrt = path.join(tmp, 'film.en.srt');
fs.writeFileSync(srcSrt, [
  '1', '00:00:01,000 --> 00:00:02,500', 'Hello there.', '',
  '2', '00:00:03,000 --> 00:00:05,000', 'How are you?', '',
  '3', '00:00:05,500 --> 00:00:07,000', 'It was 10 days ago.', '',
  '4', '00:00:07,100 --> 00:00:08,000', 'I came home', '',
  '5', '00:00:08,100 --> 00:00:09,000', 'and opened the door.', '',
].join('\n'), 'utf8');

// ---- stub OpenAI sunucusu ----
const requests = [];
let mode = 'ok'; // ok | always429 | once429 | always500 | always401 | empty | garbage
let served429 = false;
const server = http.createServer((req, res) => {
  if (req.method !== 'POST' || !req.url.startsWith('/v1/chat/completions')) {
    res.writeHead(404).end('{}'); return;
  }
  let body = '';
  req.on('data', (c) => { body += c; });
  req.on('end', () => {
    let payload = null;
    try {
      const parsed = JSON.parse(body);
      payload = JSON.parse(parsed.messages[1].content);
      requests.push({ model: parsed.model, items: payload.items.length,
        texts: payload.items.map((it) => String(it.t)) });
    } catch (_) {
      res.writeHead(400).end('{"error":{"message":"bad request"}}'); return;
    }
    if (mode === 'always429' || (mode === 'once429' && !served429)) {
      served429 = true;
      res.writeHead(429, { 'Content-Type': 'application/json', 'Retry-After': '0' });
      res.end('{"error":{"message":"rate limited","type":"rate_limit_error"}}'); return;
    }
    if (mode === 'always500') {
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end('{"error":{"message":"boom"}}'); return;
    }
    if (mode === 'always401') {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end('{"error":{"message":"invalid api key","type":"authentication_error"}}'); return;
    }
    if (mode === 'empty') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(''); return;
    }
    if (mode === 'garbage') {
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end('definitely not json{'); return;
    }
    const items = {};
    for (const item of payload.items) {
      // Kapı sözleşmesi: rakamlar sırayla korunur + kaynak cümle sonu hizası.
      const digits = (String(item.t).match(/\d+/g) || []).join(' ');
      const end = (String(item.t).match(/[.!?…]+["'”’)\]}]*$/) || [''])[0];
      const body = `Çeviri kelime${digits ? ` ${digits}` : ''}${end}`;
      const t = String(item.t);
      // SDH sözleşmesi: işaret kabuğu (köşeli/parantez/konuşmacı) hedefte kalır.
      let wrapped = body;
      if (/^\s*\[[^\[\]]+\]\s*$/.test(t)) wrapped = `[Müzik]`;
      else if (/^\s*\([^\(\)]+\)\s*$/.test(t)) wrapped = `(Kahkaha)`;
      else if (/^\s*[A-ZÇĞİÖŞÜ]{2,}\s*:/.test(t)) {
        wrapped = t.replace(/^\s*([A-ZÇĞİÖŞÜ]{2,})\s*:/, '$1: ') + body;
      } else if (t.includes('♪')) wrapped = `♪ ${body} ♪`;
      items[String(item.i)] = wrapped;
    }
    const sentences = {};
    for (const g of payload.sentence_groups || []) {
      // Kabul sözleşmesi: tam cümle = parçaların boşluk-birleşimi (parts_match).
      sentences[String(g.ids[0])] = g.ids.map((i) => items[String(i)]).join(' ');
    }
    const reply = { items, sentences };
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      id: 'chatcmpl-stub', object: 'chat.completion', created: 1,
      model: 'stub-model',
      choices: [{ index: 0, finish_reason: 'stop',
        message: { role: 'assistant', content: JSON.stringify(reply) } }],
      usage: { prompt_tokens: 10, completion_tokens: 10, total_tokens: 20 },
    }));
  });
});

const parseSrt = (file) => fs.readFileSync(file, 'utf8')
  .replace(/^﻿/, '').split(/\r?\n\r?\n/)
  .map((b) => b.split(/\r?\n/)).filter((l) => l.length >= 3)
  .map((l) => ({ times: l[1], text: l.slice(2).join(' ') }));

// İkinci armatür: SDH/korunan satır sınıfları + CJK kaynak.
const sdhSrt = path.join(tmp, 'sdh.en.srt');
fs.writeFileSync(sdhSrt, [
  '1', '00:00:01,000 --> 00:00:02,000', '[MUSIC]', '',
  '2', '00:00:02,500 --> 00:00:03,500', '♪ la la la ♪', '',
  '3', '00:00:04,000 --> 00:00:05,000', 'Hello there.', '',
  '4', '00:00:05,500 --> 00:00:06,500', '(LAUGHTER)', '',
].join('\n'), 'utf8');

const jaSrt = path.join(tmp, 'film.ja.srt');
fs.writeFileSync(jaSrt, [
  '1', '00:00:01,000 --> 00:00:02,000', 'こんにちは。', '',
  '2', '00:00:03,000 --> 00:00:04,500', '元気ですか？', '',
  '3', '00:00:05,000 --> 00:00:06,000', 'さようなら。', '',
].join('\n'), 'utf8');

// Backend async çalışır — event loop stub sunucuyu beslemeye devam eder
// (spawnSync burada deadlock üretirdi).
const runTranslate = ({ input, extra = [], cacheDir = null, workers = '1' } = {}) => new Promise((resolve) => {
  const outDir = fs.mkdtempSync(path.join(tmp, 'out-'));
  const args = [
    path.join(ROOT, 'backend', 'transcribe.py'),
    '--input', input || srcSrt, '--translate-only', 'true',
    '--translate-to', 'tr', '--translate-base-url', base,
    '--translate-api-key', 'stub-key', '--translate-model', 'stub-model',
    '--translate-workers', workers,
    '--translate-cache', cacheDir ? 'true' : 'false',
    '--translate-context', '0', '--translate-scene-gap', '8',
    '--output-dir', outDir, '--formats', 'srt',
  ];
  if (cacheDir) args.push('--cache-dir', cacheDir);
  args.push(...extra);
  const child = spawn(VENV_PY, args);
  let stdout = '';
  let stderr = '';
  const killer = setTimeout(() => child.kill('SIGKILL'), 240000);
  child.stdout.on('data', (d) => { stdout += d; });
  child.stderr.on('data', (d) => { stderr += d; });
  child.on('close', (code) => {
    clearTimeout(killer);
    const events = String(stdout || '').split('\n').filter(Boolean)
      .map((line) => { try { return JSON.parse(line); } catch (_) { return null; } })
      .filter(Boolean);
    resolve({ status: code, stdout, stderr, events, outDir });
  });
});

let base = null;
server.listen(0, '127.0.0.1', async () => {
  base = `http://127.0.0.1:${server.address().port}/v1`;
  try {
    // ---- 1. mutlu yol: tam kapsama + zaman koruması ----
    requests.length = 0; mode = 'ok';
    let { status, events, outDir, stdout } = await runTranslate();
    ok(status === 0, `çeviri işi çıkış kodu ${status} (reqs:${requests.length} warns: ${events.filter((e) => e.type === 'log' && e.level !== 'info').map((e) => e.message).join(' | ').slice(0, 600)})`);
    const done = events.find((e) => e.type === 'done');
    ok(done, 'done olayı bekleniyor');
    ok(!events.some((e) => e.type === 'error'), 'error olayı olmamalı');
    const out = path.join(outDir, 'film.tr.srt');
    ok(fs.existsSync(out), 'film.tr.srt üretilmeli');
    const cues = parseSrt(out);
    const srcCues = parseSrt(srcSrt);
    ok(cues.length === srcCues.length, `satır sayısı korunmalı (${cues.length} vs ${srcCues.length})`);
    ok(cues.every((c, i) => c.times === srcCues[i].times), 'zaman kodları birebir korunmalı');
    ok(cues.every((c) => c.text.startsWith('Çeviri')), 'her cue çevrilmiş olmalı');
    const q = events.find((e) => e.type === 'quality_report');
    ok(q && q.translation_untranslated === 0, 'kapsama: çevrilmemiş cue 0 olmalı');
    ok(requests.length >= 1, 'sağlayıcıya en az bir istek gitti');
    ok(requests.every((r) => r.model === 'stub-model'), 'istek model alanı doğru');

    // ---- 2. tek 429 sonra başarı (iç retry) ----
    requests.length = 0; served429 = false; mode = 'once429';
    ({ status, events } = await runTranslate());
    ok(status === 0, 'tek 429 sonrası iş tamamlanmalı');
    ok(events.some((e) => e.type === 'done'), '429 retry sonrası done');
    ok(served429, '429 bir kez sunuldu');

    // ---- 3. sürekli 500: temiz hata, traceback yok ----
    requests.length = 0; mode = 'always500';
    ({ status, events, stdout } = await runTranslate());
    const err = events.find((e) => e.type === 'error');
    ok(err, 'sürekli 500 error olayı üretmeli');
    ok(status !== 0, 'başarısız iş sıfırdan farklı çıkış kodu');
    ok(/çevrilemedi|çevrilemez|başarısız|hata/i.test(String(err.message || '')),
      'error olayı dostu mesaj taşımalı');

    // ---- 4. çok bloklu cümle grubu üyeleri ayrı çevirilerle kabul ----
    ok(cues[3].text === 'Çeviri kelime' && cues[4].text === 'Çeviri kelime.',
      `grup üyeleri ayrı çevirilerle kabul edilmeli (${cues[3] && cues[3].text} / ${cues[4] && cues[4].text})`);

    // ---- 5. paralel işçi sıra güvenliği (workers 4) ----
    requests.length = 0; mode = 'ok';
    let r5 = await runTranslate({ workers: '4' });
    ok(r5.status === 0, `workers=4 çıkış kodu ${r5.status}`);
    const cues5 = parseSrt(path.join(r5.outDir, 'film.tr.srt'));
    ok(cues5.length === srcCues.length
       && cues5.every((c, i) => c.times === srcCues[i].times),
      'workers=4 zaman kodları ve satır sayısı korunmalı');
    ok(cues5.every((c) => c.text.startsWith('Çeviri')),
      'workers=4 tüm cue metinleri çevrilmeli');

    // ---- 6. SDH/korunan satır muhasebesi ----
    requests.length = 0;
    let r6 = await runTranslate({ input: sdhSrt });
    ok(r6.status === 0, `SDH işi çıkış kodu ${r6.status}`);
    const sdhCues = parseSrt(path.join(r6.outDir, 'sdh.tr.srt'));
    ok(sdhCues.length === 4, 'SDH dosya satır sayısı korunmalı');
    // SDH betimlemeleri yerelleşmiş biçimde korunur (köşeli/parantez):
    ok(sdhCues[0].text === '[Müzik]' && sdhCues[3].text === '(Kahkaha)',
      `SDH işaretleri yerelleşerek korunmalı (${sdhCues[0].text} / ${sdhCues[3].text})`);
    // ♪ şarkı işareti API'ye gönderilmeden kaynak metniyle korunur:
    const sentTexts = requests.flatMap((r) => r.texts);
    ok(sdhCues[1].text === '♪ la la la ♪',
      `şarkı satırı kaynak metniyle korunmalı (${sdhCues[1].text})`);
    ok(!sentTexts.some((t) => t.includes('la la la')),
      'şarkı satırı sağlayıcıya hiç gönderilmemeli');
    const q6 = r6.events.find((e) => e.type === 'quality_report');
    ok(q6 && q6.translation_untranslated === 0,
      'korunan satırlar çevrilmemiş sayılmamalı');
    ok(q6 && q6.translation_failed === 0, 'SDH işinde başarısız blok olmamalı');

    // ---- 7. CJK (boşluksuz alfabe) kaynak ----
    requests.length = 0;
    let r7 = await runTranslate({ input: jaSrt });
    ok(r7.status === 0, `CJK işi çıkış kodu ${r7.status}`);
    const jaCues = parseSrt(path.join(r7.outDir, 'film.tr.srt'));
    ok(jaCues.length === 3 && jaCues.every((c) => c.text.startsWith('Çeviri')),
      'CJK kaynak tüm cue çevirilmeli');

    // ---- 8. HTTP hata matrisi: 401 (kesin) / boş gövde / bozuk JSON ----
    for (const m of ['always401', 'empty', 'garbage']) {
      requests.length = 0; mode = m;
      const r8 = await runTranslate();
      const err8 = r8.events.find((e) => e.type === 'error');
      ok(err8, `${m} error olayı üretmeli`);
      ok(r8.status !== 0, `${m} çıkış kodu sıfır olmamalı`);
      // error olayındaki 'traceback' alanı protokolün tanı verisidir (izinli);
      // çıplak çökme izi stderr'de görünür — orada olmamalı.
      ok(!/Traceback/.test(String(r8.stderr)),
        `${m} stderr'de çıplak traceback olmamalı`);
      // stdout yalnız NDJSON olaylarından oluşmalı — protokol dışı satır yok.
      const nonJson = String(r8.stdout).split('\n').filter(Boolean)
        .filter((line) => { try { JSON.parse(line); return false; } catch (_) { return true; } });
      ok(nonJson.length === 0, `${m} stdout yalnız NDJSON olmalı (${nonJson[0] || ''})`);
    }
    mode = 'ok';

    // ---- 9. translate-cache (TM) ikinci turda sağlayıcıyı baypas eder ----
    const cacheDir = fs.mkdtempSync(path.join(tmp, 'cache-'));
    requests.length = 0;
    const first = await runTranslate({ cacheDir });
    ok(first.status === 0, 'cache ilk tur tamamlanmalı');
    const firstReqs = requests.length;
    ok(firstReqs >= 1, 'ilk tur sağlayıcıya gitmeli');
    requests.length = 0;
    const second = await runTranslate({ cacheDir });
    ok(second.status === 0, 'cache ikinci tur tamamlanmalı');
    ok(requests.length === 0,
      `TM ısınınca ikinci tur istek atmamalı (gitti: ${requests.length})`);
    const secondCues = parseSrt(path.join(second.outDir, 'film.tr.srt'));
    ok(secondCues.every((c) => c.text.startsWith('Çeviri')),
      'cache turu da çevrilmiş çıktı üretmeli');

    console.log(`e2e-translate-stub-server: ${n} kontrol GEÇTİ`);
    process.exit(0);
  } catch (error) {
    console.error('e2e-translate-stub-server HATA:', error.message);
    process.exit(1);
  } finally {
    server.close();
  }
});
