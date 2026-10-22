'use strict';
const fs = require('node:fs');

// Generation workers write WAV/WAVEX/RF64. Exit status alone does not prove
// that a crash or interrupted writer left playable sample data.
function validVoiceOutput(file) {
  let fd;
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size <= 44) return false;
    fd = fs.openSync(file, 'r');
    const header = Buffer.alloc(12);
    if (fs.readSync(fd, header, 0, 12, 0) !== 12) return false;
    if (!['RIFF','RF64'].includes(header.toString('ascii',0,4)) || header.toString('ascii',8,12) !== 'WAVE') return false;
    let offset = 12, format = false;
    for (let n = 0; n < 1024 && offset + 8 <= stat.size; n++) {
      const chunk = Buffer.alloc(8);
      if (fs.readSync(fd, chunk, 0, 8, offset) !== 8) return false;
      const id = chunk.toString('ascii',0,4), size = chunk.readUInt32LE(4);
      if (id === 'data') return format && size > 0 && (size === 0xffffffff
        ? header.toString('ascii',0,4) === 'RF64' && stat.size > offset + 8
        : offset + 8 + size <= stat.size);
      if (offset + 8 + size > stat.size) return false;
      if (id === 'fmt ' && size >= 16) {
        const fmt = Buffer.alloc(16);
        fs.readSync(fd, fmt, 0, 16, offset + 8);
        format = fmt.readUInt16LE(2) > 0 && fmt.readUInt32LE(4) > 0 && fmt.readUInt16LE(12) > 0;
      }
      offset += 8 + size + (size % 2);
    }
    return false;
  } catch (_) { return false; }
  finally { if (fd !== undefined) fs.closeSync(fd); }
}
module.exports = {validVoiceOutput};
