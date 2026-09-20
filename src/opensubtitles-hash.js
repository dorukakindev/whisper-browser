'use strict';

// B03: OpenSubtitles "moviehash" — dosyanın ilk ve son 64 KiB'ının
// little-endian u64 sözcüklerinin 2^64-mod toplamı + dosya boyutu.
// Kaynak: trac.opensubtitles.org/projects/opensubtitles/wiki/HashSourceCodes
const fs = require('node:fs');

const CHUNK = 65536;
const MASK64 = (1n << 64n) - 1n;

function sumWords(buffer) {
  let sum = 0n;
  for (let i = 0; i + 8 <= buffer.length; i += 8) {
    sum = (sum + buffer.readBigUInt64LE(i)) & MASK64;
  }
  // Kuyruk (<8 bayt) — referans algoritma son kısmı pad'leyerek toplar.
  if (buffer.length % 8) {
    const tail = Buffer.alloc(8);
    buffer.copy(tail, 0, buffer.length - (buffer.length % 8));
    sum = (sum + tail.readBigUInt64LE(0)) & MASK64;
  }
  return sum;
}

async function movieHash(filePath) {
  const handle = await fs.promises.open(filePath, 'r');
  try {
    const { size } = await handle.stat();
    let hash = BigInt(size);
    if (!size) return hash.toString(16).padStart(16, '0');
    const headSize = Math.min(CHUNK, size);
    const head = Buffer.alloc(headSize);
    await handle.read(head, 0, headSize, 0);
    hash = (hash + sumWords(head)) & MASK64;
    if (size > CHUNK) {
      const tailSize = Math.min(CHUNK, size - CHUNK);
      const tail = Buffer.alloc(tailSize);
      await handle.read(tail, 0, tailSize, size - tailSize);
      hash = (hash + sumWords(tail)) & MASK64;
    }
    return hash.toString(16).padStart(16, '0');
  } finally {
    await handle.close();
  }
}

module.exports = { movieHash };
