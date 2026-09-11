'use strict';

const CRITICAL_FEATURES = ['videoDecode', 'webgl', 'gpuCompositing'];
const FEATURE_LABELS = {
  videoDecode: 'video çözme',
  webgl: 'WebGL',
  gpuCompositing: 'kompozisyon',
};
const REMOTE_OR_SOFTWARE_RE = /remote desktop|remote display|rdpdd|microsoft basic render|software adapter|swiftshader|llvmpipe|\bwarp\b/i;

function featureValue(value) {
  const normalized = String(value || '').trim().toLowerCase();
  return normalized || 'bilinmiyor';
}

function isAcceleratedFeature(value) {
  return featureValue(value).startsWith('enabled');
}

function normalizeFeatures(status) {
  const source = status && typeof status === 'object' ? status : {};
  return {
    videoDecode: featureValue(source.video_decode || source.videoDecode),
    canvas: featureValue(source['2d_canvas'] || source.canvas),
    webgl: featureValue(source.webgl),
    gpuCompositing: featureValue(source.gpu_compositing || source.gpuCompositing),
  };
}

function finiteNumber(value, fallback = 0) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function normalizeGpuProcesses(metrics) {
  if (!Array.isArray(metrics)) return [];
  return metrics.filter((metric) => metric && metric.type === 'GPU').map((metric) => ({
    pid: Math.max(0, Math.trunc(finiteNumber(metric.pid))),
    creationTime: Math.max(0, finiteNumber(metric.creationTime)),
    cpuPercent: Math.max(0, finiteNumber(metric.cpu && metric.cpu.percentCPUUsage)),
    memoryMiB: Math.max(0, finiteNumber(metric.memory && metric.memory.workingSetSize)) / 1024,
    sandboxed: metric.sandboxed === true,
  }));
}

function gpuInfoText(value, depth = 0) {
  if (depth > 5 || value === null || value === undefined) return '';
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
    return String(value);
  }
  if (Array.isArray(value)) return value.map((item) => gpuInfoText(item, depth + 1)).join(' ');
  if (typeof value === 'object') {
    return Object.values(value).map((item) => gpuInfoText(item, depth + 1)).join(' ');
  }
  return '';
}

function detectsRemoteOrSoftwareAdapter(gpuInfo) {
  return REMOTE_OR_SOFTWARE_RE.test(gpuInfoText(gpuInfo));
}

function adapterId(value) {
  const number = Number(value);
  return Number.isFinite(number) ? `0x${Math.trunc(number).toString(16).padStart(4, '0')}` : '';
}

function normalizeGpuAdapter(gpuInfo) {
  const info = gpuInfo && typeof gpuInfo === 'object' ? gpuInfo : {};
  const devices = Array.isArray(info.gpuDevice) ? info.gpuDevice
    : Array.isArray(info.gpu_device) ? info.gpu_device : [];
  const device = devices.find((item) => item && item.active) || devices[0] || {};
  const aux = info.auxAttributes && typeof info.auxAttributes === 'object' ? info.auxAttributes : {};
  return {
    vendorId: adapterId(device.vendorId),
    deviceId: adapterId(device.deviceId),
    driverVendor: String(device.driverVendor || '').trim().slice(0, 80),
    driverVersion: String(device.driverVersion || '').trim().slice(0, 80),
    renderer: String(aux.glRenderer || aux.gl_renderer || '').trim().slice(0, 160),
  };
}

function safeProcessEvent(event) {
  if (!event || typeof event !== 'object') return null;
  return {
    reason: String(event.reason || 'bilinmiyor').slice(0, 80),
    exitCode: Math.trunc(finiteNumber(event.exitCode)),
    at: Math.max(0, finiteNumber(event.at)),
    generation: Math.max(0, Math.trunc(finiteNumber(event.generation))),
  };
}

function summarizeGpuDiagnostics(input = {}) {
  const features = normalizeFeatures(input.featureStatus);
  const gpuProcesses = normalizeGpuProcesses(input.metrics);
  const featureReady = input.featureReady === true;
  const hardwareAcceleration = input.hardwareAcceleration !== false;
  const generation = Math.max(0, Math.trunc(finiteNumber(input.generation)));
  const lastProcessEvent = safeProcessEvent(input.lastProcessEvent);
  const remoteDesktop = detectsRemoteOrSoftwareAdapter(input.gpuInfo);
  const adapter = normalizeGpuAdapter(input.gpuInfo);
  const missingFeatures = CRITICAL_FEATURES.filter((key) => !isAcceleratedFeature(features[key]));
  const recovered = !!(featureReady && gpuProcesses.length && lastProcessEvent
    && generation > lastProcessEvent.generation);

  let state;
  let summary;
  if (!featureReady) {
    state = lastProcessEvent ? 'recovering' : 'pending';
    summary = lastProcessEvent
      ? 'GPU süreci yeniden başlatılıyor; hızlandırma henüz doğrulanmadı.'
      : 'Chromium GPU bilgisi bekleniyor; hızlandırma henüz doğrulanmadı.';
  } else if (remoteDesktop) {
    state = 'fallback';
    summary = 'Uzak masaüstü veya yazılım görüntü bağdaştırıcısı algılandı.';
  } else if (!hardwareAcceleration) {
    state = 'fallback';
    summary = 'Chromium donanım hızlandırması kapalı.';
  } else if (!gpuProcesses.length) {
    state = lastProcessEvent ? 'recovering' : 'fallback';
    summary = lastProcessEvent
      ? 'GPU süreci kayboldu; yeniden başlatma bekleniyor.'
      : 'Çalışan Chromium GPU süreci doğrulanamadı.';
  } else if (missingFeatures.length) {
    state = 'fallback';
    summary = `Donanım hattı sınırlı: ${missingFeatures.map((key) => FEATURE_LABELS[key]).join(', ')} hızlandırılmıyor.`;
  } else {
    state = 'healthy';
    summary = recovered
      ? 'GPU süreci toparlandı; Chromium hızlandırma özellikleri yeniden etkin.'
      : 'Chromium video çözme, WebGL ve kompozisyon özellikleri GPU hızlandırmalı.';
  }

  return {
    state,
    accelerated: state === 'healthy',
    featureReady,
    hardwareAcceleration,
    remoteDesktop,
    adapter,
    recovered,
    generation,
    capturedAt: Math.max(0, finiteNumber(input.capturedAt, Date.now())),
    trigger: String(input.trigger || 'bilinmiyor').slice(0, 80),
    features,
    missingFeatures,
    gpuProcesses,
    lastProcessEvent,
    summary,
  };
}

module.exports = {
  CRITICAL_FEATURES,
  detectsRemoteOrSoftwareAdapter,
  isAcceleratedFeature,
  normalizeGpuAdapter,
  normalizeFeatures,
  normalizeGpuProcesses,
  summarizeGpuDiagnostics,
};
