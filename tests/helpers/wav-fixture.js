// Structurally valid little-endian PCM, no personal audio.
module.exports = function wavFixture(frames=28) {
  const b = Buffer.alloc(44 + frames*2); b.write('RIFF'); b.writeUInt32LE(b.length-8,4); b.write('WAVEfmt ',8);
  b.writeUInt32LE(16,16); b.writeUInt16LE(1,20); b.writeUInt16LE(1,22); b.writeUInt32LE(24000,24);
  b.writeUInt32LE(48000,28); b.writeUInt16LE(2,32); b.writeUInt16LE(16,34); b.write('data',36); b.writeUInt32LE(frames*2,40);
  return b;
};
