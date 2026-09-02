function pcm16Wav(data, sampleRate = 16000) {
  if (!Buffer.isBuffer(data) || !data.length || data.length % 2 || data.length > 16000 * 2 * 9 || sampleRate !== 16000) {
    throw new Error('Canlı ses PCM parçası geçersiz.');
  }
  const header = Buffer.alloc(44);
  header.write('RIFF'); header.writeUInt32LE(data.length + 36, 4);
  header.write('WAVEfmt ', 8); header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20); header.writeUInt16LE(1, 22);
  header.writeUInt32LE(sampleRate, 24); header.writeUInt32LE(sampleRate * 2, 28);
  header.writeUInt16LE(2, 32); header.writeUInt16LE(16, 34);
  header.write('data', 36); header.writeUInt32LE(data.length, 40);
  return Buffer.concat([header, data]);
}
module.exports = { pcm16Wav };
