'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID, createHash } = require('node:crypto');
const { gzipSync, gunzipSync } = require('node:zlib');
const { run } = require('./browser-media-tools');
const core = require('./workspace-package');
const VIDEO = /\.(mp4|mkv|avi|webm|mov|m4v|ts)$/i;
// Manifest ve içe aktarılan katalog kayıtlarında video kaynağının kararlı,
// paket-içi takma kimliği — mutlak yerel yol asla yazılmaz (R86-01).
const VIDEO_ALIAS = '{{VIDEO}}/';
async function python(exe, payload) {
  // Video bytes are streamed by Python; only bounded manifest metadata crosses IPC.
  const data = JSON.parse(await run(exe, [path.join(__dirname, '../backend/workspace_video_package.py')], JSON.stringify(payload), null, 3600000));
  if (!data.ok) throw new Error('Video paketi: ' + data.error); return data;
}
function sources(root) {
  const catalog = path.join(root, 'media-catalog.json'); if (!fs.existsSync(catalog)) return [];
  const files = new Set();
  for (const item of JSON.parse(fs.readFileSync(catalog, 'utf8')).items || []) for (const source of [item.source, ...(item.episodes || []).map(e => e.source)]) {
    if (source?.type === 'local' && VIDEO.test(source.value)) files.add(source.value);
  }
  let total = 0;
  return [...files].map(source => {
    if (!fs.existsSync(source)) throw new Error('Pakete eklenecek video bulunamadı; kaynağı yeniden bağlayın veya video seçimini kapatın.');
    const stat = fs.lstatSync(source); total += stat.size;
    if (!stat.isFile() || stat.isSymbolicLink() || total > 100 * 1024 ** 3) throw new Error('En fazla 100 GB normal video dosyası paketlenebilir.');
    return { source, name: 'videos/' + createHash('sha256').update(source).digest('hex') + path.extname(source).toLowerCase(), size: stat.size };
  });
}
async function exportWithVideos(root, output, values, exe) {
  const videos = sources(root), manifest = path.join(root, randomUUID() + '.wbp'), temp = output + '.' + randomUUID() + '.tmp';
  try {
    // Manifest'e taşınabilir kaynak yazılır: video girdileri paket-içi adlarına
    // (`videos/<sha256>.<ext>`) takma kimlikle bağlanır; kök dışı videolarda
    // dahi kaynak makinenin mutlak yolu, kullanıcı dizini veya sürücü harfi
    // pakete yazılmaz (R86-01). `extract()` videoMappings'i bu kimlikten yeni
    // yerel hedefe çözer; kimliği olmayan eski mutlak-yol girdileri de aynen
    // eşleştiği için geriye uyumluluk korunur. Arşivleme için gerçek yollar
    // ayrıca `videos` parametresinde gider ve pakete yazılmaz.
    const videoAliases = new Map(videos.map(v => [v.source, `${VIDEO_ALIAS}${v.name}`]));
    const report = core.exportPackage(root, manifest, values, videoAliases), data = core.readPackage(manifest);
    data.videos = videos.map(v => ({ ...v, source: videoAliases.get(v.source) }));
    fs.writeFileSync(manifest, gzipSync(Buffer.from(JSON.stringify(data))));
    await python(exe, { action: 'write', manifest, videos, output: temp });
    fs.renameSync(temp, output); return { ...report, videos: videos.length };
  } finally { for (const file of [manifest, temp]) { try { fs.unlinkSync(file); } catch {} } }
}
async function read(file, exe) {
  const fd = fs.openSync(file, 'r'), signature = Buffer.alloc(2); try { fs.readSync(fd, signature, 0, 2, 0); } finally { fs.closeSync(fd); }
  if (signature.toString() !== 'PK') {
    const data = core.readPackage(file);
    delete data.archive; delete data.videoMappings; delete data.videos;
    return data;
  }
  const manifest = path.join(require('node:os').tmpdir(), 'whisper-package-' + randomUUID() + '.wbp');
  let data;
  try { await python(exe, { action: 'read', archive: file, manifest }); data = core.readPackage(manifest); }
  finally { try { fs.unlinkSync(manifest); } catch {} }
  core.validate(data);
  delete data.videoMappings;
  if (!Array.isArray(data.videos) || data.videos.length > 5000 || data.videos.some(v => !/^videos\/[a-f0-9]{64}\.(mp4|mkv|avi|webm|mov|m4v|ts)$/i.test(v.name) || typeof v.source !== 'string' || v.source.length < 3)) throw new Error('Video dizini geçersiz.');
  if (new Set(data.videos.map(v => v.name)).size !== data.videos.length) throw new Error('Tekrarlı video girdisi.');
  data.archive = { path: file, size: fs.statSync(file).size, mtime: fs.statSync(file).mtimeMs }; return data;
}
async function extract(root, data, exe) {
  if (!data.archive) return null;
  const stat = fs.statSync(data.archive.path);
  if (stat.size !== data.archive.size || stat.mtimeMs !== data.archive.mtime) throw new Error('Paket önizlemeden sonra değişti.');
  const folder = path.join(root, 'workspace-videos', randomUUID());
  const parent = path.dirname(folder); if (fs.existsSync(parent) && fs.lstatSync(parent).isSymbolicLink()) throw new Error('Video hedefi bağlantı olamaz.');
  const videos = data.videos.map(v => ({ ...v, target: path.join(folder, path.basename(v.name)) }));
  let result;
  try { result = await python(exe, { action: 'extract', archive: data.archive.path, videos }); }
  catch (error) { clean(root, folder); throw error; }
  // Arşivde olmayan video sessizce yanlış dosyaya bağlanmaz: yalnız gerçekten
  // çıkarılan girdiler eşlenir; kalanlar 'imported' işaretli kalır ve ilk
  // oynatmada kullanıcıdan yeniden seçim ister (R86-01).
  const missingNames = new Set(Array.isArray(result?.missing) ? result.missing : []);
  const extracted = videos.filter(v => !missingNames.has(v.name));
  data.missingVideos = videos.filter(v => missingNames.has(v.name)).map(v => v.source);
  // These mappings are trusted local extraction results, never archive-provided paths.
  data.videoMappings = extracted.map(v => [v.source, v.target]); return folder;
}
function clean(root, folder) {
  if (path.dirname(path.resolve(folder)) !== path.resolve(root, 'workspace-videos')) throw new Error('Video temizleme yolu geçersiz.');
  fs.rmSync(folder, { recursive: true, force: true });
}
module.exports = { exportWithVideos, read, extract, clean, sources };
