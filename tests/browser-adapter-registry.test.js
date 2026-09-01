const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const {
  BrowserAdapterRegistry,
  createBuiltinAdapterRegistry,
} = require('../src/browser-adapter-registry');

let passed = 0;
function test(name, fn) {
  fn();
  passed += 1;
}

test('yerleşik registry mevcut ve yeni servisleri eşler', () => {
  const registry = createBuiltinAdapterRegistry();
  assert.equal(registry.forPage('https://www.netflix.com/watch/123').id, 'netflix');
  assert.equal(registry.forPage('https://www.primevideo.com/detail/ABC123').id, 'prime-video');
  assert.equal(registry.forPage('https://www.crunchyroll.com/watch/GXYZ').id, 'crunchyroll');
  assert.equal(registry.forPage('https://www.arte.tv/en/videos/abc').id, 'arte');
  assert.equal(registry.forPage('https://example.com/video'), null);
});

test('CDN yanıtı sayfa adaptörü bağlamında kalır', () => {
  const registry = createBuiltinAdapterRegistry();
  const adapter = registry.forResponse(
    'https://www.primevideo.com/detail/ABC123',
    'https://cdn.elsewhere.test/subtitle/en/segment.vtt?sig=x');
  assert.equal(adapter.id, 'prime-video');
});

test('yetenek matrisi doğrulanmamış desteği doğrulanmış gibi göstermez', () => {
  const matrix = createBuiltinAdapterRegistry().capabilityMatrix();
  const prime = matrix.find((entry) => entry.service === 'prime-video');
  assert(prime.captionDetection);
  assert.equal(prime.verificationStatus, 'unverified');
  assert.equal(prime.verifiedAt, '');
});

test('registry çekirdeğe dokunmadan yeni adaptör kaydeder', () => {
  const registry = new BrowserAdapterRegistry();
  registry.register({ id: 'example-video', hosts: ['video.example'], label: 'Example' });
  assert.equal(registry.forPage('https://video.example/watch/1').id, 'example-video');
  assert.throws(() => registry.register({ id: 'example-video', hosts: ['x.test'] }), /zaten kayıtlı/);
});

test('registry kanonik medya kimliği üretir', () => {
  const identity = createBuiltinAdapterRegistry().mediaIdentity('https://www.youtube.com/watch?v=abc123&utm_source=x');
  assert.equal(identity.key, 'youtube:abc123');
  assert(!identity.canonicalUrl.includes('utm_source'));
});

test('bildirimsel kullanıcı adaptörü kod çalıştırmadan yüklenir', () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-adapter-'));
  fs.writeFileSync(path.join(directory, 'example.json'), JSON.stringify({
    version: 1, id: 'example-stream', label: 'Example Stream', hosts: ['stream.example'],
    capabilities: { nativeTextTrack: true, networkCapture: true },
  }));
  const registry = new BrowserAdapterRegistry();
  const result = registry.loadJsonDirectory(directory);
  assert.deepEqual(result.errors, []);
  assert.equal(registry.forPage('https://stream.example/watch/1').source, 'user');
  assert.equal(registry.capabilityMatrix()[0].verificationStatus, 'unverified');
  fs.rmSync(directory, { recursive: true, force: true });
});

console.log(`browser-adapter-registry: ${passed} test`);
