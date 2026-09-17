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
  const references = new Map();
  const encodingPreviews = new Map();
  let seriesStore = null;
  const series = () => seriesStore ||= require('./browser-series-context').createBrowserSeriesContext({
    filePath: path.join(app.getPath('userData'), 'browser-series-context.json') });
  const mediaKey = tab => {
    const url = tab.view.webContents.getURL();
    let origin = ''; try { origin = new URL(url).origin; } catch {}
    return { origin, key: `${origin}|${tab.mediaId || url}` };
  };
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
    const temp = `${target}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temp, JSON.stringify(data()), { encoding: 'utf8', mode: 0o600, flag: 'wx' });
      fs.renameSync(temp, target);
    } finally { try { fs.unlinkSync(temp); } catch {} }
  }
  function writeOwnedSubtitle(filePath, text) {
    const temp = `${filePath}.${randomUUID()}.tmp`;
    try {
      fs.writeFileSync(temp, '\uFEFF' + text, 'utf8');
      fs.renameSync(temp, filePath);
    } finally { try { fs.unlinkSync(temp); } catch {} }
    grantSubtitle(filePath);
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
    return { mediaKey, seriesKey, origin };
  }
  function orphanedSeriesRecord(identity, record) {
    // Hiçbir medya bu seri anahtarına bağlı değilse kayıt yetimdir: aynı origin'in
    // yetim kayıtları listede görünsün ve silinebilsin (yazım hatasıyla açılmış
    // seri adları kalıcı çöp olmasın).
    return record.scope === 'series'
      && !Object.values(data().series).includes(record.scopeKey)
      && String(record.scopeKey).startsWith(`${identity.origin}|`);
  }
  function ownsRecord(identity, record) {
    return record.scopeKey === identity.mediaKey || record.scopeKey === identity.seriesKey
      || orphanedSeriesRecord(identity, record);
  }
  function visibleRecords(identity) {
    return data().records.filter(record => record.scope === 'media'
      ? record.scopeKey === identity.mediaKey
      : record.scopeKey === identity.seriesKey || orphanedSeriesRecord(identity, record));
  }
  function associate(identity) {
    const previous = data().series[identity.mediaKey] || '';
    const entries = Object.entries(data().series).filter(([key]) => key !== identity.mediaKey).slice(-499);
    data().series = Object.fromEntries(entries);
    if (identity.seriesKey) data().series[identity.mediaKey] = identity.seriesKey;
    // Yeniden bağlanan medya eski serinin son üyesiyse seri-kapsamlı kayıtlar
    // yetim kalmasın diye yeni anahtara taşınır (seri adı düzeltme senaryosu).
    if (previous && previous !== identity.seriesKey
        && !Object.values(data().series).includes(previous)) {
      for (const record of data().records) {
        if (record.scope === 'series' && record.scopeKey === previous) record.scopeKey = identity.seriesKey;
      }
    }
  }
  async function bestFrame(tab) {
    const found = await Promise.all(frames(tab.view).map(async frame => ({ frame,
      media: await Promise.race([
        frame.executeJavaScript(probeScript(), true),
        new Promise((_, reject) => setTimeout(() => reject(new Error('Video karesi taraması zaman aşımına uğradı.')), 5000)),
      ]).catch(() => null) })));
    const best = rankCandidates(found)[0];
    if (!best) throw new Error('Sayfada görünür video bulunamadı.');
    return best;
  }
  const mini = createBrowserMiniPlayer({ BrowserWindow, ipcMain, owner, restore: restoreLayout,
    command: async (tab, command, value) => {
      try {
        if (tab !== activeTab()) throw new Error('Etkin sekme değişti.');
        const best = await bestFrame(tab);
        const media = await best.frame.executeJavaScript(commandScript(command, value, best.media?.docToken), true);
        return { ok: !!media?.handled, media };
      } catch (error) { return { ok: false, error: error.message }; }
    } });
  function cancel(tab, lifecycle = true) {
    for (const [key, job] of jobs) if (key.startsWith(`${tab.id}:`)) { job.abort(); jobs.delete(key); }
    captures.delete(tab.id);
    encodingPreviews.delete(tab.id);
    if (lifecycle) references.delete(tab.id);
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
    if (payload.action === 'cancel') {
      if (!tab) return { ok: false, stale: true, error: 'Sekme artık bulunamıyor.' };
      const targetAction = String(payload.targetAction || '').slice(0, 80);
      if (targetAction) {
        const targetKey = `${tab.id}:${targetAction}`;
        jobs.get(targetKey)?.abort(); jobs.delete(targetKey);
      } else cancel(tab, false);
      return { ok: true };
    }
    const valid = () => tab && tab === activeTab() && !tab.closing && tab.view && !tab.view.webContents.isDestroyed()
      && context(tab).generation === payload.generation && (context(tab).mediaId || '') === (payload.mediaId || '');
    if (!valid()) return { ok: false, stale: true, error: 'Video veya sekme değişti.' };
    const key = `${tab.id}:${payload.action}`;
    jobs.get(key)?.abort();
    const controller = new AbortController(); jobs.set(key, controller);
    const current = () => valid() && !controller.signal.aborted && jobs.get(key) === controller;
    const assertCurrent = () => { if (!current()) throw new Error('Video değişti veya işlem iptal edildi.'); };
    const tools = () => createBrowserMediaTools({ pythonPath: pythonPath(), ffmpegPath: ffmpegPath(), ffprobePath: ffprobePath() });
    const referenceTools = () => require('./browser-reference-media').createBrowserReferenceMedia({ ffmpegPath: ffmpegPath(), ffprobePath: ffprobePath() });
    const videoAnalysis = () => require('./browser-video-analysis').createBrowserVideoAnalysis({ pythonPath: pythonPath(), ffmpegPath: ffmpegPath(), ffprobePath: ffprobePath() });
    const reference = () => {
      const ref = references.get(tab.id);
      if (!ref || ref.generation !== tab.generation || ref.mediaId !== tab.mediaId) throw new Error('Önce bu videonun yerel referans dosyasını seçin.');
      const stat = fs.statSync(ref.path);
      if (stat.mtimeMs !== ref.mtimeMs || stat.size !== ref.size) throw new Error('Referans dosya değişmiş; yeniden seçin.');
      return ref;
    };
    let result = {};
    try {
      switch (payload.action) {
        case 'encoding-preview': {
          const file = await choose('Karakter kodlaması düzeltilecek altyazıyı seç', ['srt', 'vtt', 'ass', 'ssa']); assertCurrent();
          if (fs.statSync(file).size > 8e6) throw new Error('Altyazı en fazla 8 MB olabilir.');
          const bytes = fs.readFileSync(file), token = randomUUID();
          encodingPreviews.set(tab.id, { token, bytes, extension: path.extname(file).toLowerCase(), created: Date.now() });
          result = { token, candidates: require('./subtitle-encoding-preview').preview(bytes) }; break;
        }
        case 'encoding-apply': {
          const preview = encodingPreviews.get(tab.id);
          if (!preview || preview.token !== payload.token || Date.now() - preview.created > 900000) {
            if (preview && Date.now() - preview.created > 900000) encodingPreviews.delete(tab.id);
            throw new Error('Kodlama önizlemesini yeniden açın.');
          }
          const text = require('./subtitle-encoding-preview').decode(preview.bytes, payload.encoding);
          const parsed = require('./browser-subtitles').parseSubtitlePayload(text, '', 'subtitle' + preview.extension);
          if (!parsed.cues?.length) throw new Error('Bu kodlamayla altyazı okunamadı; başka kodlama seçin.');
          const directory = path.join(app.getPath('userData'), 'browser-subtitles'); fs.mkdirSync(directory, { recursive: true });
          const filePath = path.join(directory, randomUUID() + preview.extension); writeOwnedSubtitle(filePath, text);
          result = { filePath }; encodingPreviews.delete(tab.id); break;
        }
        case 'reference-open': {
          const videoPath = await choose('İzlenen videoyla aynı sürümdeki yerel dosyayı seç', ['mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v']); assertCurrent();
          const meta = await referenceTools().probe(videoPath, { signal: controller.signal }); assertCurrent();
          const stat = fs.statSync(videoPath);
          const ref = { path: videoPath, name: path.basename(videoPath), ...meta, size: stat.size, mtimeMs: stat.mtimeMs,
            generation: tab.generation, mediaId: tab.mediaId, thumbnails: new Map(), waveform: null };
          references.set(tab.id, ref);
          result = { name: ref.name, duration: ref.duration }; break;
        }
        case 'reference-waveform': {
          const ref = reference();
          result = ref.waveform || await referenceTools().waveform(ref.path, ref.duration, { signal: controller.signal });
          assertCurrent(); if (reference() !== ref) throw new Error('Referans video değişti.');
          ref.waveform = result; break;
        }
        case 'dialogue-transcribe': {
          const ref = reference();
          if (!Number.isFinite(payload.end) || payload.end > ref.duration + .1) throw new Error('Aralık videonun içinde olmalı.');
          result = await require('./browser-dialogue').dialogue({ video: ref.path, start: payload.start, end: payload.end,
            model: payload.model, language: payload.language, python: pythonPath(), ffmpeg: ffmpegPath(), signal: controller.signal });
          assertCurrent(); if (reference() !== ref) throw new Error('Referans video değişti.');
          break;
        }
        case 'reference-thumbnail': {
          const ref = reference();
          const time = Math.floor(Math.max(0, Math.min(ref.duration - .04, Number(payload.time))) * 2) / 2;
          if (!Number.isFinite(time)) throw new Error('Önizleme zamanı geçersiz.');
          result = ref.thumbnails.get(time) || await referenceTools().thumbnail(ref.path, time, { signal: controller.signal });
          assertCurrent(); if (reference() !== ref) throw new Error('Referans video değişti.');
          ref.thumbnails.set(time, result);
          if (ref.thumbnails.size > 60) ref.thumbnails.delete(ref.thumbnails.keys().next().value);
          break;
        }
        case 'thumbnail-cancel': jobs.get(`${tab.id}:reference-thumbnail`)?.abort(); break;
        case 'alignment-preview': {
          const file = await choose('Doğru zamanlı referans altyazıyı seç', ['srt', 'vtt', 'ass', 'ssa']); assertCurrent();
          if (fs.statSync(file).size > 8 * 1024 * 1024) throw new Error('Referans altyazı en fazla 8 MB olabilir.');
          const decoded = require('./browser-textutil').decodeSubtitleBuffer(fs.readFileSync(file)).text;
          const parsed = require('./browser-subtitles').parseSubtitlePayload(decoded, '', file);
          result = await require('./browser-alignment').createBrowserAlignment({ pythonPath: pythonPath(), ffmpegPath: ffmpegPath() })
            .align({ referenceCues: parsed.cues, targetCues: payload.cues }, { signal: controller.signal });
          break;
        }
        case 'ocr-range': {
          const ref = reference();
          if (!Number.isFinite(payload.start) || !Number.isFinite(payload.end) || payload.start < 0 || payload.end > ref.duration + .1) throw new Error('OCR aralığı referans videonun içinde olmalı.');
          result = await videoAnalysis().ocrRange({ videoPath: ref.path, start: payload.start, end: payload.end, crop: payload.crop, interval: payload.interval ?? .5 }, { signal: controller.signal });
          assertCurrent(); if (reference() !== ref) throw new Error('Referans video değişti.');
          break;
        }
        case 'intro-detect': {
          const ref = reference();
          const other = await choose('Aynı dizinin karşılaştırılacak başka bölümünü seç', ['mp4', 'mkv', 'webm', 'mov', 'avi', 'm4v']); assertCurrent();
          if (path.resolve(other).toLowerCase() === path.resolve(ref.path).toLowerCase()) throw new Error('Aynı dosya yerine başka bir bölüm seçin.');
          result = await videoAnalysis().detectIntro({ videoPaths: [ref.path, other], maxScanSeconds: 120 }, { signal: controller.signal });
          assertCurrent(); if (reference() !== ref) throw new Error('Referans video değişti.');
          break;
        }
        case 'series-context:get': result = { context: series().get(mediaKey(tab).key) }; break;
        case 'series-context:bind': {
          const identity = mediaKey(tab);
          result = { context: series().bind(identity.key, payload.seriesName, identity.origin) }; break;
        }
        case 'series-context:save': {
          const identity = mediaKey(tab);
          result = { context: series().bindAndSave(identity.key, payload.seriesName, identity.origin, payload.profile) }; break;
        }
        case 'series-context:check': result = series().check(mediaKey(tab).key, { cues: payload.cues, translations: payload.translations }); break;
        case 'mini-open': result = mini.open(tab); break;
        case 'ass-load-fonts':
        case 'ass-load-mkv-fonts':
        case 'ass-load': {
          const file = await choose('Özgün ASS / SSA altyazısını seç', ['ass', 'ssa']); assertCurrent();
          if (fs.statSync(file).size > 2 * 1024 * 1024) throw new Error('ASS dosyası en fazla 2 MB olabilir.');
          const text = require('./browser-textutil').decodeSubtitleBuffer(fs.readFileSync(file)).text;
          if (!/\[Script Info\]/i.test(text) || !/\[Events\]/i.test(text)) throw new Error('Geçerli ASS / SSA dosyası seçin.');
          let fonts = [];
          if (payload.action === 'ass-load-fonts') {
            const choice = await dialog.showOpenDialog(owner(), { title: 'ASS fontlarını seç', properties: ['openFile', 'multiSelections'], filters: [{ name: 'Fontlar', extensions: ['ttf', 'otf', 'woff', 'woff2'] }] }); assertCurrent();
            if (choice.canceled) throw new Error('Font seçimi iptal edildi.');
            fonts = require('./browser-fonts').readFonts(choice.filePaths || []);
          } else if (payload.action === 'ass-load-mkv-fonts') {
            const video = await choose('Fontları içeren MKV dosyasını seç', ['mkv']); assertCurrent();
            fonts = await require('./browser-fonts').extractFonts(video, ffmpegPath(), ffprobePath(), controller.signal); assertCurrent();
            if (!fonts.length) throw new Error('MKV dosyasında font eki bulunamadı; fontları ayrı seçebilirsiniz.');
          }
          const frame = (await bestFrame(tab)).frame; assertCurrent();
          const operationId = randomUUID();
          const ass = require('./browser-ass-renderer');
          const abort = () => { try { void frame.executeJavaScript(ass.buildAssClearScript(operationId), true).catch(() => {}); } catch {} };
          controller.signal.addEventListener('abort', abort, { once: true });
          try {
            result = await frame.executeJavaScript(ass.buildAssInstallScript(text, operationId, fonts), true);
            result.fontCount = fonts.length;
            if (current() && result?.ok) tab.assFrame = frame;
            else abort();
          } finally { controller.signal.removeEventListener('abort', abort); }
          break;
        }
        case 'ass-clear': {
          const frame = tab.assFrame;
          try { if (frame) await frame.executeJavaScript(require('./browser-ass-renderer').buildAssClearScript(), true); }
          finally { tab.assFrame = null; }
          break;
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
          } finally { try { fs.rmSync(outputDir, { recursive: true, force: true }); } catch (_) {} }
          break;
        }
        case 'semantic-search': result = await tools().semanticSearch({ query: payload.query, cues: payload.cues }, { signal: controller.signal }); break;
        case 'subtitle-search': result = await subtitles.searchSubtitles(payload, payload.config || {}, { signal: controller.signal }); break;
        case 'subtitle-download': {
          const output = await subtitles.downloadSubtitle({ fileId: payload.fileId }, payload.config || {}, { signal: controller.signal }); assertCurrent();
          const directory = path.join(app.getPath('userData'), 'browser-subtitles'); fs.mkdirSync(directory, { recursive: true });
          const filePath = path.join(directory, `${randomUUID()}.${output.format === 'vtt' ? 'vtt' : 'srt'}`);
          writeOwnedSubtitle(filePath, output.text);
          result = { filePath, fileName: output.fileName }; break;
        }
        case 'skip-list': {
          const identity = keys(tab, payload.seriesName);
          result = { ...identity, records: visibleRecords(identity) }; break;
        }
        case 'skip-link-series': {
          const identity = keys(tab, payload.seriesName);
          if (!identity.seriesKey) throw new Error('Dizi adı gerekli.');
          associate(identity); save();
          result = { ...identity, records: visibleRecords(identity) }; break;
        }
        case 'skip-save': {
          const identity = keys(tab, payload.seriesName), raw = payload.record || {};
          const normalizedId = String(raw.id || '').trim().slice(0, 128);
          const existing = data().records.find(record => record.id === normalizedId);
          if (existing && !ownsRecord(identity, existing)) throw new Error('Bu kayıt başka videoya ait.');
          const scope = raw.scope === 'series' ? 'series' : 'media';
          const record = skips.normalizeRecord({ ...raw, id: raw.id || randomUUID(), scope,
            scopeKey: scope === 'series' ? identity.seriesKey : identity.mediaKey });
          if (!record) throw new Error('Geçerli başlangıç/bitiş süresi ve dizi adı girin.');
          if (!existing && data().records.length >= 500) throw new Error('500 aralık sınırına ulaşıldı. Önce kullanılmayan bir kaydı silin.');
          data().records = skips.upsertRecord(data().records, record).records;
          if (scope === 'series' && typeof payload.seriesName === 'string') associate(identity);
          save();
          result = { ...identity, records: visibleRecords(identity) }; break;
        }
        case 'skip-delete': {
          const identity = keys(tab);
          const record = data().records.find(r => r.id === payload.id);
          if (record && !ownsRecord(identity, record)) throw new Error('Bu kayıt başka videoya ait.');
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
  return { mini, cancel, hasJobs: () => jobs.size > 0, translationContext: tab => series().translationContext(mediaKey(tab).key) };
}
module.exports = { registerBrowserFeatureServices };
