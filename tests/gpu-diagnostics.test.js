const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { summarizeGpuDiagnostics } = require('../src/gpu-diagnostics');

const ROOT = path.join(__dirname, '..');
const fixtures = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'gpu-diagnostics.json'), 'utf8'));
let passed = 0;

function test(name, fn) {
  try {
    fn();
    passed += 1;
    console.log(`  OK  ${name}`);
  } catch (error) {
    console.error(`  FAIL ${name}\n${error.stack}`);
    process.exitCode = 1;
  }
}

test('gpu-info-update öncesinde etkin rozeti verilmez', () => {
  const result = summarizeGpuDiagnostics(fixtures.beforeGpuInfo);
  assert.equal(result.state, 'pending');
  assert.equal(result.accelerated, false);
});

test('üç kritik özellik ve yaşayan GPU süreci birlikte hızlandırmayı doğrular', () => {
  const result = summarizeGpuDiagnostics(fixtures.healthy);
  assert.equal(result.state, 'healthy');
  assert.equal(result.accelerated, true);
  assert.equal(result.gpuProcesses[0].pid, 4200);
  assert.equal(result.gpuProcesses[0].memoryMiB, 96);
  assert.equal(result.adapter.driverVendor, 'NVIDIA');
  assert.match(result.adapter.renderer, /RTX fixture/);
  assert.equal(Object.hasOwn(result, 'gpuInfo'), false, 'ham GPUInfo renderer sürecine sızdırıldı');
});

test('yalnız WebGL ve kompozisyon açıkken video decode fallback gizlenmez', () => {
  const result = summarizeGpuDiagnostics(fixtures.driverFallback);
  assert.equal(result.state, 'fallback');
  assert.equal(result.accelerated, false);
  assert.deepEqual(result.missingFeatures, ['videoDecode']);
});

test('uzak masaüstü yazılım bağdaştırıcısı etkin özellikleri geçersiz kılar', () => {
  const result = summarizeGpuDiagnostics(fixtures.remoteDesktop);
  assert.equal(result.state, 'fallback');
  assert.equal(result.remoteDesktop, true);
  assert.equal(result.accelerated, false);
});

test('GPU süreci kaybı eski etkin durumu yerine toparlanıyor gösterir', () => {
  const result = summarizeGpuDiagnostics(fixtures.processGone);
  assert.equal(result.state, 'recovering');
  assert.equal(result.accelerated, false);
  assert.match(result.summary, /yeniden başlatılıyor/);
});

test('yeni kuşakta süreç ve özellikler dönünce toparlanma doğrulanır', () => {
  const result = summarizeGpuDiagnostics(fixtures.recovered);
  assert.equal(result.state, 'healthy');
  assert.equal(result.recovered, true);
  assert.match(result.summary, /toparlandı/);
});

test('ana süreç olayları GPU durumu hazır olmadan önce kaydeder ve süreç kanıtı toplar', () => {
  const main = fs.readFileSync(path.join(ROOT, 'src', 'main.js'), 'utf8');
  const readyEvent = main.indexOf("app.on('gpu-info-update'");
  const childGone = main.indexOf("app.on('child-process-gone'");
  const appReady = main.indexOf('app.whenReady().then');
  assert(readyEvent > 0 && readyEvent < appReady, 'gpu-info-update dinleyicisi başlangıçtan sonra kuruluyor');
  assert(childGone > 0 && childGone < appReady, 'GPU süreç kaybı dinleyicisi başlangıçtan sonra kuruluyor');
  assert.match(main, /app\.getAppMetrics\(\)/);
  assert.match(main, /app\.getGPUInfo\('complete'\)/);
  assert.match(main, /details\.type !== 'GPU'/);
  assert.match(main, /gpuFeatureReady[\s\S]*app\.getGPUFeatureStatus\(\)/);
});

test('sandbox köprüsü yalnız amaçlı GPU tanı IPC hattını açar', () => {
  const preload = fs.readFileSync(path.join(ROOT, 'src', 'preload.js'), 'utf8');
  const renderer = fs.readFileSync(path.join(ROOT, 'src', 'renderer', 'renderer.js'), 'utf8');
  assert.match(preload, /getBrowserGpuDiagnostics: \(\) => ipcRenderer\.invoke\('browser:gpuDiagnostics'\)/);
  assert.match(renderer, /diagnostics\.accelerated \? 'doğrulandı' : 'doğrulanmadı'/);
  assert.doesNotMatch(renderer, /gpuFeatures[\s\S]{0,300}\.some\(/,
    'eski herhangi-biri-etkin yanlış olumlu denetimi geri geldi');
});

console.log(`gpu-diagnostics: ${passed} test`);
