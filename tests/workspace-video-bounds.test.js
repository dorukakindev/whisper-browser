'use strict';

// R166 — .wbp video çıkarımı gerçek-bayt sınırı.
// Bulgu: zipfile metaverisindeki file_size beyan edilen değerdir; sahte bir
// arşivde deflate çıktısı bundan büyük olabilir ve CRC kontrolü yalnızca akış
// tamamen yazıldıktan sonra tetiklenir — beyana güvenen toplam sınırı
// atlanabilir (disk doldurma). _copy_bounded gerçek yazılan baytı sayar.

const assert = require('node:assert');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { spawnSync } = require('node:child_process');
const { findTestPython } = require('./python-runtime');

const SCRIPT = path.resolve(__dirname, '../backend/workspace_video_package.py');
const python = findTestPython();

let n = 0;
const ok = (cond, msg) => { n += 1; assert(cond, msg); };

function tmpdir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix));
}

// Merkezi dizindeki file_size alanını hedef girdi için düşürerek sahte arşiv
// üretir: gerçek içerik limitin çok üstünde, beyan küçük kalır.
function forgedZip({ out, name, payloadBytes, declaredSize }) {
  const crafter = `
import io, struct, sys, zipfile
buf = io.BytesIO()
with zipfile.ZipFile(buf, 'w', compression=zipfile.ZIP_DEFLATED) as z:
    z.writestr('workspace.wbp', b'{}')
    z.writestr(sys.argv[2], sys.stdin.buffer.read())
data = bytearray(buf.getvalue())
i = 0
while True:
    i = data.find(b'PK\\x01\\x02', i)
    if i < 0:
        break
    namelen = struct.unpack_from('<H', data, i + 28)[0]
    entry = bytes(data[i + 46:i + 46 + namelen]).decode()
    if entry == sys.argv[2]:
        struct.pack_into('<I', data, i + 24, int(sys.argv[3]))
    i += 46 + namelen
open(sys.argv[1], 'wb').write(bytes(data))
`;
  const result = spawnSync(python, ['-c', crafter, out, name, String(declaredSize)], {
    input: Buffer.alloc(payloadBytes, 0x58), timeout: 60000 });
  assert.equal(result.status, 0, result.stderr?.toString() || 'zip crafter çöktü');
}

function runPackage(payload, timeout = 60000) {
  const result = spawnSync(python, [SCRIPT], {
    input: JSON.stringify(payload), encoding: 'utf8', timeout });
  assert.equal(result.status, 0, result.stderr || 'script çöktü');
  return JSON.parse(result.stdout);
}

if (!python) {
  console.log('workspace-video-bounds: python yok, atlandı');
  process.exit(0);
}

const work = tmpdir('wbp-bounds-');
try {
  const videoName = 'videos/' + 'a'.repeat(64) + '.mp4';

  // 1) Normal girdi: beyan == gerçek → çıkarım başarılı.
  {
    const fixture = path.join(work, 'kaynak.bin');
    fs.writeFileSync(fixture, Buffer.alloc(3 * 1024 * 1024, 0x59));
    const archive = path.join(work, 'normal.wbp');
    const manifest = path.join(work, 'm.gz');
    fs.writeFileSync(manifest, Buffer.from('x'));
    const written = runPackage({ action: 'write', manifest,
      videos: [{ source: fixture, name: videoName }], output: archive });
    ok(written.ok === true, 'yazma başarılı');
    const target = path.join(work, 'cikti', 'v1.mp4');
    const extracted = runPackage({ action: 'extract', archive,
      videos: [{ name: videoName, target }] });
    ok(extracted.ok === true, `normal çıkarım: ${extracted.error || ''}`);
    ok(fs.statSync(target).size === 3 * 1024 * 1024, 'boyut birebir korunur');
  }

  // 2) Sahte beyan: file_size=1024, gerçek ~2MB. stdlib çıktıyı beyana
  //    kırpar ve Bad CRC-32 yükseltir; _copy_bounded ikinci hat. Her iki
  //    durumda da çıkarım reddedilir ve yarım hedef dosya temizlenir
  //    (öncesi: kırpılmış hedef dosya diskte kalıyordu).
  {
    const archive = path.join(work, 'forged.wbp');
    forgedZip({ out: archive, name: videoName, payloadBytes: 2 * 1024 * 1024, declaredSize: 1024 });
    const target = path.join(work, 'cikti2', 'v2.mp4');
    const extracted = runPackage({ action: 'extract', archive,
      videos: [{ name: videoName, target }] });
    ok(extracted.ok === false, 'sahte beyan reddedilir');
    ok(/boyutu aşıyor|CRC/i.test(extracted.error || ''), `hata sınıfı: ${extracted.error}`);
    ok(!fs.existsSync(target), 'yarım hedef dosya temizlendi');
  }

  // 3) Sahte manifest beyanı: read yolu da aynı sınıra tabi.
  {
    const archive = path.join(work, 'forged-manifest.wbp');
    forgedZip({ out: archive, name: 'workspace.wbp', payloadBytes: 512 * 1024, declaredSize: 4096 });
    const manifest = path.join(work, 'extracted-manifest.gz');
    const read = runPackage({ action: 'read', archive, manifest });
    ok(read.ok === false, 'sahte manifest beyanı reddedilir');
    ok(/boyutu aşıyor|CRC/i.test(read.error || ''), `manifest hatası: ${read.error}`);
    ok(!fs.existsSync(manifest), 'yarım manifest temizlendi');
  }

  // 4) R190: hedef dosya zaten varsa 'xb' FileExistsError fırlatır — temizlik
  //    kolu var olanı SİLMEMELİ (öncesi os.remove koşulsuz çalışıp kullanıcının
  //    mevcut dosyasını siliyordu).
  {
    const archive = path.join(work, 'normal.wbp');
    const existing = path.join(work, 'cikti3', 'v3.mp4');
    fs.mkdirSync(path.dirname(existing), { recursive: true });
    fs.writeFileSync(existing, 'KULLANICI-DOSYASI');
    const extracted = runPackage({ action: 'extract', archive,
      videos: [{ name: videoName, target: existing }] });
    ok(extracted.ok === false, 'var olan hedefe çıkarım reddedilir');
    ok(fs.readFileSync(existing, 'utf8') === 'KULLANICI-DOSYASI',
      'var olan dosya silinmedi/bozulmadı');
  }

  // 5) Kaynak ratchetleri: sınırlı kopya her iki çıkarım yolunda da kullanılır.
  const src = fs.readFileSync(SCRIPT, 'utf8');
  ok(src.includes('_copy_bounded') && !src.includes('copyfileobj'),
    'sınırsız copyfileobj kalmadı');
  ok(src.includes('os.remove(destination)'), 'başarısız çıkarım hedefi temizlenir');
  ok(src.includes('created = True') || src.includes('created=True'), 'temizlik yalnız kendi oluşturduğu dosyaya');
  const js = fs.readFileSync(path.join(__dirname, '../src/workspace-package.js'), 'utf8');
  ok(js.includes('maxOutputLength'), 'gzip çıkış sınırı korunuyor');
  ok(js.includes("startsWith(path.resolve(root) + path.sep)"), 'zip-slip kapısı korunuyor');
} finally {
  fs.rmSync(work, { recursive: true, force: true });
}

console.log(`workspace-video-bounds: ${n} kontrol geçti`);
