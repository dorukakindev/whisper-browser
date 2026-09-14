'use strict';
const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { canonicalWatchKey } = require('./watch-library-store');

function registerMediaCatalogService({ ipcMain, dialog, owner, authorized, userData, pythonPath,
  inspectMedia, grantMedia, watchItems, nativeImage }) {
  let catalog;
  const previews = new Map();
  const posterCache = new Map();
  const store = () => catalog ||= require('./media-catalog-store').createMediaCatalogStore({ filePath: path.join(userData(), 'media-catalog.json') });
  const sourceKey = source => source ? canonicalWatchKey(source.type === 'local'
    ? 'file:' + source.value : 'browser:' + source.value) : '';
  const progress = (source, history) => {
    const found = history.find(item => canonicalWatchKey(item.key) === sourceKey(source));
    return found ? { position: Number(found.position) || 0, duration: Number(found.duration) || 0, completed: !!found.completed } : null;
  };
  function visible(item, history = watchItems()) {
    if (!item) return null;
    const { posterPath, ...row } = item;
    return { ...row, hasPoster: !!posterPath, progress: progress(row.source, history),
      episodes: (row.episodes || []).map(ep => ({ ...ep, progress: progress(ep.source, history) })) };
  }
  function found(id) {
    const item = store().get(id);
    if (!item) throw new Error('Katalog kaydı bulunamadı.');
    return item;
  }
  async function choose(title, extensions) {
    const result = await dialog.showOpenDialog(owner(), { title, properties: ['openFile'], filters: [{ name: title, extensions }] });
    return result.canceled ? null : result.filePaths?.[0] || null;
  }
  function imageFor(filePath) {
    if (!filePath) return '';
    try {
      const real = fs.realpathSync(filePath), stat = fs.statSync(real);
      if (!stat.isFile() || stat.size > 8 * 1024 * 1024 || !/\.(png|jpe?g|webp)$/i.test(real)) return '';
      const key = `${real}|${stat.mtimeMs}|${stat.size}`;
      if (posterCache.has(key)) return posterCache.get(key);
      const img = nativeImage.createFromPath(real);
      if (img.isEmpty()) return '';
      const image = img.resize({ width: 240, quality: 'good' }).toDataURL();
      if (image.length > 2 * 1024 * 1024) return '';
      posterCache.set(key, image);
      if (posterCache.size > 100) posterCache.delete(posterCache.keys().next().value);
      return image;
    } catch { return ''; }
  }
  function patchSource(id, episodeId, source) {
    const item = found(id);
    if (!episodeId) return store().upsert({ id, source });
    if (!item.episodes.some(ep => ep.id === episodeId)) throw new Error('Bölüm bulunamadı.');
    return store().upsert({ id, episodes: item.episodes.map(ep => ep.id === episodeId ? { ...ep, source } : ep) });
  }
  ipcMain.handle('media-catalog:request', async (event, request) => {
    if (!authorized(event)) return { ok: false, error: 'Yetkisiz istek.' };
    const input = request && typeof request === 'object' ? request : {};
    try {
      switch (input.action) {
        case 'list': {
          const history = watchItems();
          return { ok: true, items: store().list().map(item => visible(item, history)), watchItems: history };
        }
        case 'save': {
          const raw = input.item || input.patch || {};
          const previous = raw.id ? found(raw.id) : null;
          // Native seçici veya kayıtlı içe aktarım dışında renderer dosya yolu veremez.
          const patch = Object.fromEntries(['id', 'kind', 'title', 'year', 'synopsis', 'imdbId', 'tmdbId', 'watchStatus', 'favorite']
            .filter(key => Object.hasOwn(raw, key)).map(key => [key, raw[key]]));
          if (raw.ratings && typeof raw.ratings === 'object') patch.ratings = { ...(previous?.ratings || {}), personal: raw.ratings.personal };
          if (Array.isArray(raw.episodes)) {
            patch.episodes = raw.episodes.map(ep => ({
              id: ep.id, season: ep.season, number: ep.number, title: ep.title, watchStatus: ep.watchStatus,
              source: previous?.episodes?.find(old => old.id === ep.id)?.source || null,
            }));
          }
          return { ok: true, item: visible(store().upsert(patch)) };
        }
        case 'remove': found(input.id); store().remove(input.id); return { ok: true };
        case 'source-file': {
          found(input.id);
          const file = await choose('Oynatılacak video dosyasını seç', ['mp4', 'mkv', 'webm', 'avi', 'mov', 'm4v', 'ts']);
          if (!file) return { ok: false, canceled: true };
          const value = inspectMedia(file);
          return { ok: true, item: visible(patchSource(input.id, input.episodeId, { type: 'local', value, watchKey: sourceKey({ type: 'local', value }) })) };
        }
        case 'source-url': {
          const url = new URL(String(input.url || ''));
          if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Geçerli bir http/https video sayfası adresi girin.');
          const key = sourceKey({ type: 'browser', value: url.href });
          const value = new URL(key.slice(8)); value.hash = url.hash;
          return { ok: true, item: visible(patchSource(input.id, input.episodeId, { type: 'browser', value: value.href, watchKey: key })) };
        }
        case 'poster-file': {
          found(input.id);
          const file = await choose('Afiş seç', ['png', 'jpg', 'jpeg', 'webp']);
          if (!file) return { ok: false, canceled: true };
          const image = imageFor(file);
          if (!image) throw new Error('En fazla 8 MB boyutunda geçerli bir afiş seçin.');
          const folder = path.join(userData(), 'catalog-posters'); fs.mkdirSync(folder, { recursive: true });
          const target = path.join(folder, randomUUID() + '.png');
          fs.writeFileSync(target, nativeImage.createFromDataURL(image).toPNG());
          try { return { ok: true, item: { ...visible(store().upsert({ id: input.id, posterPath: target })), posterImage: image } }; }
          catch (error) { fs.unlinkSync(target); throw error; }
        }
        case 'poster': return { ok: true, image: imageFor(found(input.id).posterPath) };
        case 'play': {
          const item = found(input.id);
          const episode = input.episodeId ? item.episodes.find(ep => ep.id === input.episodeId) : null;
          if (input.episodeId && !episode) throw new Error('Bölüm bulunamadı.');
          const source = episode ? episode.source : item.source;
          if (!source) throw new Error('Önce video dosyası veya browser bağlantısı ekleyin.');
          let value = source.value;
          if (source.type === 'local') { value = inspectMedia(value); if (!grantMedia(value)) throw new Error('Video dosyası açılamadı.'); }
          else {
            const url = new URL(value);
            if (!['http:', 'https:'].includes(url.protocol) || url.username || url.password) throw new Error('Video bağlantısı geçersiz.');
          }
          const key = sourceKey({ ...source, value });
          const existing = watchItems().find(row => canonicalWatchKey(row.key) === key);
          return { ok: true, watchItem: { ...(existing || {}), key, type: source.type,
            title: episode ? `${item.title} · S${episode.season} B${episode.number}` : item.title,
            sourceRef: value, localPath: source.type === 'local' ? value : '', position: existing?.completed ? 0 : Number(existing?.position) || 0 } };
        }
        case 'import-preview': {
          const dbPath = await choose('nMDB arşiv veritabanını seç', ['db', 'sqlite', 'sqlite3']);
          if (!dbPath) return { ok: false, canceled: true };
          const parsed = await require('./nmdb-catalog-import').previewNmdbImport({ dbPath, pythonPath: pythonPath() });
          const plan = store().previewImport(parsed.items);
          const token = randomUUID();
          for (const [id, preview] of previews) if (Date.now() - preview.created > 15 * 60 * 1000) previews.delete(id);
          if (previews.size >= 3) previews.delete(previews.keys().next().value);
          previews.set(token, { created: Date.now(), sender: event.sender.id, items: parsed.items });
          const history = watchItems();
          return { ok: true, token, items: parsed.items.map(item => visible(item, history)), conflicts: plan.conflicts || [],
            warnings: parsed.warnings || [], summary: plan };
        }
        case 'import-apply': {
          const preview = previews.get(input.token);
          if (!preview || preview.sender !== event.sender.id || Date.now() - preview.created > 15 * 60 * 1000) throw new Error('İçe aktarım önizlemesi sona erdi; yeniden dosya seçin.');
          if (!Array.isArray(input.ids) || !input.ids.length) throw new Error('En az bir kayıt seçin.');
          const result = store().mergeImport(preview.items, { selectedIds: input.ids });
          previews.delete(input.token);
          return { ok: true, summary: result };
        }
        case 'import-cancel': previews.delete(input.token); return { ok: true };
        default: throw new Error('Bilinmeyen katalog işlemi.');
      }
    } catch (error) {
      const message = error.code === 'ENOENT' ? 'Dosya bulunamadı. Oynatma kaynağını yeniden bağlayın.'
        : ['EACCES', 'EPERM'].includes(error.code) ? 'Dosyaya erişilemiyor. Dosyanın açık ve erişilebilir olduğunu kontrol edin.'
        : error.code === 'ERR_INVALID_URL' ? 'Geçerli bir http/https video sayfası adresi girin.'
        : error.message || 'Katalog işlemi tamamlanamadı.';
      return { ok: false, error: message };
    }
  });
}
module.exports = { registerMediaCatalogService };
