'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { createBrowserMediaTools } = require('./browser-media-tools');
const { createBrowserMiniPlayer } = require('./browser-mini-player');
const subtitles = require('./browser-subtitle-search');
const skips = require('./browser-skip-segments');

function registerBrowserFeatureServices(deps) {
  const { app, ipcMain, dialog, BrowserWindow, owner, getTab, activeTab, context, authorized,
    frames, probeScript, rankCandidates, commandScript, captureFrame, restoreLayout, grantSubtitle,
    pythonPath, ffmpegPath, ffprobePath } = deps;
  const jobs = new Map(), captures = new Map();
  let skipData;
  const dataPath = () => path.join(app.getPath('userData'), 'browser-skip-segments.json');
  function data() {
    if (!skipData) {
      try { skipData = JSON.parse(fs.readFileSync(dataPath(), 'utf8')); } catch { skipData = {}; }
      skipData = { records: skips.normalizeRecords(skipData?.records), series: Object.fromEntries(
        Object.entries(skipData?.series || {}).filter(([key, value]) => key.length <= 2048 && typeof value === 'string' && value.length <= 512).slice(-500)) };
    }
    return skipData;
  }
  function save() {
    const target = dataPath();
    fs.mkdirSync(path.dirname(target), { recursive: true });
    fs.writeFileSync(target + '.tmp', JSON.stringify(data()), 'utf8');
    fs.renameSync(target + '.tmp', target);
  }
  function keys(tab, seriesName) {
    const url = tab.view.webContents.getURL();
    let origin = ''; try { origin = new URL(url).origin; } catch {}
    const mediaKey = `${origin}|${tab.mediaId || url}`;
    const stored = data();
    let seriesKey = stored.series[mediaKey] || '';
    if (typeof seriesName === 'string') {
      const name = seriesName.trim().slice(0, 160);
      seriesKey = name ? `${origin}|${name.toLocaleLowerCase('tr')}` : '';
    }
    return { mediaKey, seriesKey };
  }
  function visibleRecords(identity) {
    return data().records.filter(record => record.scope === 'media' ? record.scopeKey === identity.mediaKey : record.scopeKey === identity.seriesKey);
  }
  function associate(identity) {
    const entries = Object.entries(data().series).filter(([key]) => key !== identity.mediaKey).slice(-499);
    data().series = Object.fromEntries(entries);
    if (identity.seriesKey) data().series[identity.mediaKey] = identity.seriesKey;
  }
  async function bestFrame(tab) {
    const found = await Promise.all(frames(tab.view).map(async frame => ({ frame,
      media: await frame.executeJavaScript(probeScript(), true).catch(() => null) })));
    const best = rankCandidates(found)[0];
    if (!best) throw new Error('Sayfada görünür video bulunamadı.');
    return best.frame;
  }
  const mini = createBrowserMiniPlayer({ BrowserWindow, ipcMain, owner, restore: restoreLayout,
    command: async (tab, command, value) => {
      try {
        if (tab !== activeTab()) throw new Error('Etkin sekme değişti.');
        const media = await (await bestFrame(tab)).executeJavaScript(commandScript(command, value), true);
        return { ok: !!media?.handled, media };
      } catch (error) { return { ok: false, error: error.message }; }
    } });
  function cancel(tab, lifecycle = true) {
    for (const [key, job] of jobs) if (key.startsWith(`${tab.id}:`)) { job.abort(); jobs.delete(key); }
    captures.delete(tab.id);
    if (lifecycle && tab.assFrame) {
      const frame = tab.assFrame; tab.assFrame = null;
      try { void frame.executeJavaScript(require('./browser-ass-renderer').buildAssClearScript(), true).catch(() => {}); } catch {}
    }
  }
  async function choose(title, extensions) {
    const result = await dialog.showOpenDialog(owner(), { title, properties: ['openFile'], filters: [{ name: title, extensions }] });
    if (result.canceled || !result.filePaths?.[0]) throw new Error('Dosya seçimi iptal edildi.');
    return result.filePaths[0];
  }
  ipcMain.handle('browser:extras', async (event, input) => {
    if (!authorized(event)) return { ok: false, error: 'Yetkisiz istek.' };
    const payload = input && typeof input === 'object' ? input : {};
    const tab = getTab(payload.tabId);
    const valid = () => tab && tab === activeTab() && !tab.closing && tab.view && !tab.view.webContents.isDestroyed()
      && context(tab).generation === payload.generation && (context(tab).mediaId || '') === (payload.mediaId || '');
    if (!valid()) return { ok: false, stale: true, error: 'Video veya sekme değişti.' };
    if (payload.action === 'cancel') { cancel(tab, false); return { ok: true }; }
    const key = `${tab.id}:${payload.action}`;
    jobs.get(key)?.abort();
    const controller = new AbortController(); jobs.set(key, controller);
    const current = () => valid() && !controller.signal.aborted && jobs.get(key) === controller;
    const assertCurrent = () => { if (!current()) throw new Error('Video değişti veya işlem iptal edildi.'); };
    const tools = () => createBrowserMediaTools({ pythonPath: pythonPath(), ffmpegPath: ffmpegPath(), ffprobePath: ffprobePath() });
    let result = {};
    try {
      switch (payload.action) {
        case 'mini-open': result = mini.open(tab); break;
        case 'ass-load': {
          const file = await choose('Özgün ASS / SSA altyazısını seç', ['ass', 'ssa']); assertCurrent();
          if (fs.statSync(file).size > 2 * 1024 * 1024) throw new Error('ASS dosyası en fazla 2 MB olabilir.');
          const text = fs.readFileSync(file, 'utf8').replace(/^\uFEFF/, '');
          if (!/\[Script Info\]/i.test(text) || !/\[Events\]/i.test(text)) throw new Error('Geçerli ASS / SSA dosyası seçin.');
          const frame = await bestFrame(tab); assertCurrent();
          const operationId = randomUUID();
          const ass = require('./browser-ass-renderer');
          const abort = () => { try { void frame.executeJavaScript(ass.buildAssClearScript(operationId), true).catch(() => {}); } catch {} };
          controller.signal.addEventListener('abort', abort, { once: true });
          try {
            result = await frame.executeJavaScript(ass.buildAssInstallScript(text, operationId), true);
            if (current() && result?.ok) tab.assFrame = frame;
            else abort();
          } finally { controller.signal.removeEventListener('abort', abort); }
          break;
        }
        case 'ass-clear': {
          if (tab.assFrame) await tab.assFrame.executeJavaScript(require('./browser-ass-renderer').buildAssClearScript(), true);
          tab.assFrame = null; break;
        }
        case 'ocr-frame': {
          const image = await captureFrame(tab, false); assertCurrent();
          captures.set(tab.id, { image: image.toDataURL(), ...image.getSize() });
          result = { image: captures.get(tab.id).image }; break;
        }
        case 'ocr-read': {
          const image = captures.get(tab.id);
          if (!image) throw new Error('Önce videodan bir kare yakalayın.');
          const crop = payload.crop || { x: 0, y: .65, width: 1, height: .35 };
          if (['x', 'y', 'width', 'height'].some(k => !Number.isFinite(crop[k]) || crop[k] < 0 || crop[k] > 1)
            || crop.width <= 0 || crop.height <= 0 || crop.x + crop.width > 1.001 || crop.y + crop.height > 1.001) throw new Error('Kırpma bölgesi görüntünün içinde olmalı.');
          result = await tools().ocrFrame({ imageBase64: image.image, crop: {
            x: Math.floor(crop.x * image.width), y: Math.floor(crop.y * image.height),
            width: Math.max(1, Math.floor(crop.width * image.width)), height: Math.max(1, Math.floor(crop.height * image.height)),
          } }, { signal: controller.signal }); break;
        }
        case 'scenes': {
          const videoPath = await choose('Sahne şeridi için izlediğiniz videonun yerel dosyasını seç', ['mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v']); assertCurrent();
          const outputDir = path.join(app.getPath('temp'), 'whisper-browser-scenes', randomUUID());
          try {
            const output = await tools().sceneStrip({ videoPath, outputDir }, { signal: controller.signal }); assertCurrent();
            result = { scenes: output.scenes.map(scene => ({ time: scene.time, thumbnail: `data:image/jpeg;base64,${fs.readFileSync(scene.thumbnailPath).toString('base64')}` })) };
          } finally { fs.rmSync(outputDir, { recursive: true, force: true }); }
          break;
        }
        case 'semantic-search': result = await tools().semanticSearch({ query: payload.query, cues: payload.cues }, { signal: controller.signal }); break;
        case 'subtitle-search': result = await subtitles.searchSubtitles(payload, payload.config || {}, { signal: controller.signal }); break;
        case 'subtitle-download': {
          const output = await subtitles.downloadSubtitle({ fileId: payload.fileId }, payload.config || {}, { signal: controller.signal }); assertCurrent();
          const directory = path.join(app.getPath('userData'), 'browser-subtitles'); fs.mkdirSync(directory, { recursive: true });
          const filePath = path.join(directory, `${randomUUID()}.${output.format === 'vtt' ? 'vtt' : 'srt'}`);
          fs.writeFileSync(filePath, '\uFEFF' + output.text, 'utf8'); grantSubtitle(filePath);
          result = { filePath, fileName: output.fileName }; break;
        }
        case 'skip-list': {
          const identity = keys(tab, payload.seriesName);
          if (typeof payload.seriesName === 'string') { associate(identity); save(); }
          result = { ...identity, records: visibleRecords(identity) }; break;
        }
        case 'skip-save': {
          const identity = keys(tab, payload.seriesName), raw = payload.record || {};
          const existing = data().records.find(record => record.id === raw.id);
          if (existing && existing.scopeKey !== identity.mediaKey && existing.scopeKey !== identity.seriesKey) throw new Error('Bu kayıt başka videoya ait.');
          const scope = raw.scope === 'series' ? 'series' : 'media';
          const record = skips.normalizeRecord({ ...raw, id: raw.id || randomUUID(), scope,
            scopeKey: scope === 'series' ? identity.seriesKey : identity.mediaKey });
          if (!record) throw new Error('Geçerli başlangıç/bitiş süresi ve dizi adı girin.');
          if (!existing && data().records.length >= 500) throw new Error('500 aralık sınırına ulaşıldı. Önce kullanılmayan bir kaydı silin.');
          data().records = skips.upsertRecord(data().records, record).records; associate(identity); save();
          result = { ...identity, records: visibleRecords(identity) }; break;
        }
        case 'skip-delete': {
          const identity = keys(tab);
          const record = data().records.find(r => r.id === payload.id);
          if (record && record.scopeKey !== identity.mediaKey && record.scopeKey !== identity.seriesKey) throw new Error('Bu kayıt başka videoya ait.');
          data().records = skips.removeRecord(data().records, payload.id).records; save();
          result = { ...identity, records: visibleRecords(identity) }; break;
        }
        default: throw new Error('Bu video aracı desteklenmiyor.');
      }
      assertCurrent();
      return { ok: true, ...result };
    } catch (error) {
      return { ok: false, stale: !current(), error: String(error.message || 'Video aracı çalıştırılamadı.').slice(0, 600) };
    } finally { if (jobs.get(key) === controller) jobs.delete(key); }
  });
  return { mini, cancel };
}
module.exports = { registerBrowserFeatureServices };
