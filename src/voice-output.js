'use strict';
const fs = require('node:fs');

// Generation workers write WAV/WAVEX/RF64. Exit status alone does not prove
// that a crash or interrupted writer left playable sample data.
function inspectVoiceOutput(file) {
  let fd;
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size <= 44) return false;
    fd = fs.openSync(file, 'r');
    const header = Buffer.alloc(12);
    if (fs.readSync(fd, header, 0, 12, 0) !== 12) return false;
    if (!['RIFF','RF64'].includes(header.toString('ascii',0,4)) || header.toString('ascii',8,12) !== 'WAVE') return false;
    const rf64 = header.toString('ascii',0,4) === 'RF64';
    const declared = header.readUInt32LE(4);
    const boundary = rf64 ? stat.size : declared + 8;
    if (boundary > stat.size || boundary < 12) return false;
    let offset = 12, format = false, blockAlign = 0, dataSize = null, formatKey = null, audio = null;
    for (let n = 0; n < 1024 && offset + 8 <= boundary; n++) {
      const chunk = Buffer.alloc(8);
      if (fs.readSync(fd, chunk, 0, 8, offset) !== 8) return false;
      const id = chunk.toString('ascii',0,4), size = chunk.readUInt32LE(4);
      if (id === 'data') {
        const frames = size === 0xffffffff && rf64 ? dataSize : size;
        const valid = format && Number.isSafeInteger(frames) && frames >= blockAlign
          && frames % blockAlign === 0 && offset + 8 + frames <= boundary;
        return valid ? {formatKey, ...audio, seconds: frames / blockAlign / audio.sampleRate} : false;
      }
      if (offset + 8 + size > boundary) return false;
      if (id === 'ds64' && rf64 && size >= 28) {
        const ds = Buffer.alloc(16);
        if (fs.readSync(fd, ds, 0, 16, offset + 8) !== 16) return false;
        const count = ds.readBigUInt64LE(8);
        if (count > BigInt(Number.MAX_SAFE_INTEGER)) return false;
        dataSize = Number(count);
      }
      if (id === 'fmt ' && size >= 16) {
        const fmt = Buffer.alloc(Math.min(size, 40));
        if (fs.readSync(fd, fmt, 0, fmt.length, offset + 8) !== fmt.length) return false;
        let codec = fmt.readUInt16LE(0);
        if (codec === 0xfffe) {
          if (size < 40 || fmt.readUInt16LE(16) < 22
              || fmt.subarray(28,40).toString('hex') !== '00001000800000aa00389b71') return false;
          codec = fmt.readUInt32LE(24);
        }
        const channels = fmt.readUInt16LE(2), rate = fmt.readUInt32LE(4), bits = fmt.readUInt16LE(14);
        blockAlign = fmt.readUInt16LE(12);
        format = channels > 0 && channels <= 32 && rate >= 8000 && rate <= 384000
          && ((codec === 1 && [8,16,24,32].includes(bits)) || (codec === 3 && [32,64].includes(bits)))
          && blockAlign === channels * bits / 8 && fmt.readUInt32LE(8) === rate * blockAlign;
        audio = format ? {channels, sampleRate:rate, bits} : null;
        // Only fully known PCM/float fmt layouts qualify for stream concatenation.
        formatKey = format && (size === 16 || (size === 18 && fmt.readUInt16LE(16) === 0) ||
          (size === 40 && fmt.readUInt16LE(0) === 0xfffe && fmt.readUInt16LE(16) === 22)) ? fmt.toString('hex') : null;
      }
      offset += 8 + size + (size % 2);
    }
    return false;
  } catch (_) { return false; }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}
function validVoiceOutput(file) { return !!inspectVoiceOutput(file); }
module.exports = {validVoiceOutput, inspectVoiceOutput};
