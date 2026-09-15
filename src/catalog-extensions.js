'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { scanFolder, createMetadataClient } = require('./catalog-discovery');
function createCatalogExtensions({ store, userData, pythonPath, dialog, owner, visible, nativeImage, restart, canRestore = () => true, removeOwnedPoster = () => false }) {
  const client = createMetadataClient(), previews = new Map();
  function remember(event, data) {
    for (const [key, row] of previews) if (Date.now() - row.created > 900000) previews.delete(key);
    if (previews.size >= 4) previews.delete(previews.keys().next().value);
    const token = randomUUID(); previews.set(token, { ...data, sender: event.sender.id, created: Date.now() }); return token;
  }
  function take(event, token, type) {
    const row = previews.get(token);
    if (!row || row.sender !== event.sender.id || row.type !== type || Date.now() - row.created > 900000) throw new Error('Önizleme sona erdi; yeniden başlatın.');
    return row;
  }
  return async function handle(event, input) {
    const item = () => { const value = store().get(input.id); if (!value) throw new Error('Eser bulunamadı.'); return value; };
    switch (input.action) {
      case 'folder-preview': {
        const choice = await dialog.showOpenDialog(owner(), { title: 'Film ve dizi klasörünü seç', properties: ['openDirectory'] });
        if (choice.canceled || !choice.filePaths?.[0]) return { ok: false, canceled: true };
        const data = await scanFolder(choice.filePaths[0], pythonPath());
        return { ok: true, token: remember(event, { type: 'folder', ...data }), items: data.items.map(i => visible(i)), warnings: data.warnings, summary: store().previewImport(data.items) };
      }
      case 'folder-apply': {
        const data = take(event, input.token, 'folder');
        if (!Array.isArray(input.ids) || !input.ids.length) throw new Error('En az bir kayıt seçin.');
        const summary = store().mergeImport(data.items, { selectedIds: input.ids }); previews.delete(input.token); return { ok: true, summary };
      }
      case 'metadata-search': return { ok: true, results: await client.search(item(), input.credential, input.query) };
      case 'metadata-preview': {
        const current = item(), data = await client.detail(current, Number(input.providerId), input.credential);
        return { ok: true, ...data, token: remember(event, { type: 'metadata', id: current.id, before: JSON.stringify(current), ...data }) };
      }
      case 'metadata-apply': {
        const data = take(event, input.token, 'metadata'), current = store().get(data.id);
        if (JSON.stringify(current) !== data.before) throw new Error('Eser önizleme sırasında değişti; yeniden eşleştirin.');
        const fields = Array.isArray(input.fields) ? input.fields : [];
        const patch = { id: current.id, tmdbId: data.patch.tmdbId };
        for (const key of ['title', 'originalTitle', 'year', 'synopsis', 'imdbId', 'genres', 'cast', 'runtime']) if (fields.includes(key)) patch[key] = data.patch[key];
        if (fields.includes('poster') && data.poster) {
          const response = await fetch('https://image.tmdb.org/t/p/w500' + data.poster, { signal: AbortSignal.timeout(20000), redirect: 'error' });
          if (!response.ok) throw new Error('Afiş indirilemedi; seçimi kaldırıp yeniden deneyin.');
          const buffer = Buffer.from(await response.arrayBuffer()); if (buffer.length > 8e6) throw new Error('Afiş çok büyük.');
          const image = nativeImage.createFromBuffer(buffer); if (image.isEmpty()) throw new Error('Afiş biçimi geçersiz.');
          const folder = path.join(userData(), 'catalog-posters'); fs.mkdirSync(folder, { recursive: true });
          patch.posterPath = path.join(folder, randomUUID() + '.png'); fs.writeFileSync(patch.posterPath, image.resize({ width: 500 }).toPNG());
        }
        try {
          if (JSON.stringify(store().get(data.id)) !== data.before) throw new Error('Eser değişti; yeniden önizleyin.');
          const previousPoster = current.posterPath;
          const saved = store().upsert(patch);
          if (patch.posterPath && previousPoster && previousPoster !== patch.posterPath) removeOwnedPoster(previousPoster);
          previews.delete(input.token); return { ok: true, item: visible(saved) };
        } catch (error) { if (patch.posterPath) { try { fs.unlinkSync(patch.posterPath); } catch {} } throw error; }
      }
      case 'season-preview': {
        const current = item(), episodes = await client.season(current, Number(input.season), input.credential);
        return { ok: true, episodes, token: remember(event, { type: 'season', id: current.id, before: JSON.stringify(current), episodes }) };
      }
      case 'season-apply': {
        const data = take(event, input.token, 'season'), current = store().get(data.id);
        if (JSON.stringify(current) !== data.before) throw new Error('Bölümler değişti; yeniden önizleyin.');
        const episodes = [...current.episodes];
        for (const next of data.episodes) {
          const index = episodes.findIndex(ep => ep.season === next.season && ep.number === next.number);
          if (index < 0) episodes.push(next); else episodes[index] = { ...episodes[index],
            airDate: next.airDate || episodes[index].airDate, title: episodes[index].title || next.title };
        }
        store().upsert({ id: current.id, episodes }); previews.delete(input.token); return { ok: true };
      }
      case 'package-export': {
        const result = await dialog.showSaveDialog(owner(), { title: 'Taşınabilir çalışma paketini kaydet', defaultPath: 'whisper-calismam.wbp', filters: [{ name: 'Whisper çalışma paketi', extensions: ['wbp'] }] });
        if (result.canceled || !result.filePath) return { ok: false, canceled: true };
        const report = input.includeVideos === true
          ? await require('./workspace-video-package').exportWithVideos(userData(), result.filePath, input.rendererValues, pythonPath())
          : require('./workspace-package').exportPackage(userData(), result.filePath, input.rendererValues);
        return { ok: true, ...report };
      }
      case 'package-preview': {
        const result = await dialog.showOpenDialog(owner(), { title: 'Çalışma paketini seç', properties: ['openFile'], filters: [{ name: 'Whisper çalışma paketi', extensions: ['wbp'] }] });
        if (result.canceled || !result.filePaths?.[0]) return { ok: false, canceled: true };
        const data = await require('./workspace-video-package').read(result.filePaths[0], pythonPath());
        return { ok: true, token: remember(event, { type: 'package', data }), count: data.files.length, videos: data.videos?.length || 0, created: data.created };
      }
      case 'package-apply': {
        const { data } = take(event, input.token, 'package');
        if (!canRestore()) throw new Error('Çalışan medya işlemini bitirin veya durdurun; ardından yeniden geri yükleyin.');
        const packages = require('./workspace-package');
        const videoPackage = require('./workspace-video-package');
        const videoFolder = await videoPackage.extract(userData(), data, pythonPath());
        if (!canRestore()) { if (videoFolder) videoPackage.clean(userData(), videoFolder); throw new Error('Yeni işlem başladı; geri yükleme iptal edildi.'); }
        let live, storageChanged = false;
        const setStorage = values => owner().webContents.executeJavaScript(`(() => {
          const values = ${JSON.stringify(values)}, previous = {};
          try { for (const [key, value] of Object.entries(values)) { previous[key] = localStorage.getItem(key); if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } }
          catch (error) { for (const [key, value] of Object.entries(previous)) { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } throw error; }
        })()`);
        try {
          live = await owner().webContents.executeJavaScript(`Object.fromEntries(${JSON.stringify(packages.STORAGE_KEYS)}.map(key => [key, localStorage.getItem(key)]))`);
          const backup = path.join(userData(), 'before-restore-complete-' + Date.now() + '.wbp');
          packages.exportPackage(userData(), backup, live);
          const backups = fs.readdirSync(userData()).filter(name => /^before-restore-complete-\d+\.wbp$/.test(name)).sort().reverse();
          for (const name of backups.slice(3)) { try { fs.unlinkSync(path.join(userData(), name)); } catch {} }
          const restored = packages.remapRendererValues(userData(), data, data.videoMappings || []);
          await setStorage(restored);
          storageChanged = true;
          if (!canRestore()) throw new Error('Yeni medya işlemi başladı; geri yükleme iptal edildi.');
          require('./workspace-package').restorePackage(userData(), data, data.videoMappings || []);
        } catch (error) {
          try { if (storageChanged) await setStorage(live); }
          finally { if (videoFolder) videoPackage.clean(userData(), videoFolder); }
          throw error;
        }
        previews.delete(input.token); restart(); return { ok: true };
      }
      case 'extension-cancel': { const row = previews.get(input.token); if (row?.sender === event.sender.id) previews.delete(input.token); return { ok: true }; }
      default: return null;
    }
  };
}
module.exports = { createCatalogExtensions };
