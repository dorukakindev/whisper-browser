'use strict';
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { run } = require('./browser-media-tools');
function readFonts(files) {
  if (files.length > 24) throw new Error('En fazla 24 font seçilebilir.');
  let total = 0;
  return files.map(file => {
    const stat = fs.statSync(file); if (!stat.isFile() || stat.size > 8e6 || (total += stat.size) > 24e6) throw new Error('Fontlar toplam en fazla 24 MB, tek dosya 8 MB olabilir.');
    const bytes = fs.readFileSync(file), signature = bytes.subarray(0, 4).toString('hex');
    if (!['00010000', '4f54544f', '74746366', '774f4646', '774f4632', '74727565'].includes(signature)) throw new Error('Geçersiz font dosyası: ' + path.basename(file));
    return { name: path.basename(file), base64: bytes.toString('base64') };
  });
}
async function extractFonts(video, ffmpeg, ffprobe, signal) {
  const probe = JSON.parse(await run(ffprobe, ['-v', 'error', '-show_streams', '-of', 'json', video], '', signal, 20000));
  const tracks = (probe.streams || []).filter(s => s.codec_type === 'attachment' && /\.(ttf|otf|woff2?)$/i.test(s.tags?.filename || ''));
  if (tracks.length > 24) throw new Error('Videoda 24 üzerinde font var; gerekli fontları ayrı seçin.');
  if (!tracks.length) return [];
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-fonts-'));
  try {
    const files = [];
    for (const [i, stream] of tracks.entries()) {
      const file = path.join(dir, `${i}${path.extname(stream.tags.filename)}`);
      await run(ffmpeg, ['-v', 'error', '-nostdin', '-y', `-dump_attachment:${stream.index}`, file, '-i', video, '-t', '0', '-f', 'null', '-'], '', signal, 30000);
      files.push(file);
    }
    return readFonts(files);
  } finally {
    if (path.dirname(path.resolve(dir)) !== path.resolve(os.tmpdir()) || !path.basename(dir).startsWith('whisper-fonts-')) throw new Error('Geçici font yolu geçersiz.');
    fs.rmSync(dir, { recursive: true, force: true });
  }
}
module.exports = { readFonts, extractFonts };
