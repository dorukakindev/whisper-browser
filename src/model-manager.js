const fs = require('fs');
const path = require('path');

const KNOWN_MODELS = Object.freeze([
  'large-v3', 'large-v3-turbo', 'large-v2', 'medium', 'small', 'base', 'tiny',
]);

// F18: capability registry — faster-whisper'ın bilinen yaklaşık disk ve VRAM
// ihtiyaçları (Systran CT2 paketleri). Kullanıcıya boyut göstermek ve
// silme kararını bilgilendirmek için; indirme akışını değiştirmez.
const MODEL_CATALOG = Object.freeze({
  tiny:            { downloadMb: 75,   vramMb: 1024 },
  base:            { downloadMb: 150,  vramMb: 1024 },
  small:           { downloadMb: 500,  vramMb: 2048 },
  medium:          { downloadMb: 1500, vramMb: 5120 },
  'large-v2':      { downloadMb: 3100, vramMb: 10240 },
  'large-v3':      { downloadMb: 3100, vramMb: 10240 },
  'large-v3-turbo':{ downloadMb: 1600, vramMb: 6144 },
});

function modelCacheRoots(appPath, env = process.env) {
  const values = [
    env.HUGGINGFACE_HUB_CACHE,
    env.HF_HOME ? path.join(env.HF_HOME, 'hub') : '',
    env.TRANSFORMERS_CACHE,
    env.USERPROFILE ? path.join(env.USERPROFILE, '.cache', 'huggingface', 'hub') : '',
    appPath ? path.join(appPath, 'backend', 'models') : '',
  ].filter(Boolean).map((item) => path.resolve(item));
  return [...new Set(values)];
}

function cachedRepositories(root) {
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('models--'))
      .map((entry) => ({ name: entry.name.toLowerCase(), path: path.join(root, entry.name) }));
  } catch (_) { return []; }
}

function hasModelFiles(directory) {
  try {
    if (!fs.statSync(directory).isDirectory()) return false;
    const names = new Set(fs.readdirSync(directory).map((name) => name.toLowerCase()));
    return names.has('config.json') && names.has('model.bin')
      && (names.has('tokenizer.json') || names.has('vocabulary.json') || names.has('vocabulary.txt'));
  } catch (_) { return false; }
}

function repositoryHasUsableSnapshot(repositoryPath) {
  if (hasModelFiles(repositoryPath)) return true;
  const snapshots = path.join(repositoryPath, 'snapshots');
  try {
    return fs.readdirSync(snapshots, { withFileTypes: true })
      .some((entry) => entry.isDirectory() && hasModelFiles(path.join(snapshots, entry.name)));
  } catch (_) { return false; }
}

function repositoryMatchesModel(repository, model) {
  const normalized = String(model || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const repo = String(repository || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (normalized === 'large-v3-turbo') {
    return repo.endsWith('-large-v3-turbo') || repo.endsWith('-whisper-turbo');
  }
  // `large-v3-turbo`, `large-v3` ile başladığı için includes() kullanmak yalnız
  // turbo kurulu bir makinede normal large-v3'ü de kurulu gösteriyordu.
  return repo.endsWith(`-${normalized}`);
}

function directorySizeBytes(directory) {
  let total = 0;
  try {
    for (const entry of fs.readdirSync(directory, { withFileTypes: true })) {
      const full = path.join(directory, entry.name);
      try {
        if (entry.isDirectory() || entry.name === 'snapshots') {
          // HF repo düzeni: snapshots/<hash>/... + blob'lar; hepsini say
          total += entry.isDirectory() ? directorySizeBytes(full)
            : entry.isFile() ? fs.statSync(full).size : 0;
        } else if (entry.isFile() || entry.isSymbolicLink()) {
          total += fs.statSync(full).size;
        }
      } catch (_) { /* kırık bağlantı */ }
    }
  } catch (_) { /* okunamayan kök */ }
  return total;
}

function freeBytesFor(root) {
  try {
    const stats = fs.statfsSync(root);
    return Number(stats.bavail) * Number(stats.bsize);
  } catch (_) { return null; }
}

function findModelRepository(appPath, model, env = process.env) {
  const normalized = String(model || '').toLowerCase();
  if (!KNOWN_MODELS.includes(normalized)) return null;
  for (const root of modelCacheRoots(appPath, env)) {
    const repo = cachedRepositories(root).find((entry) => repositoryMatchesModel(entry.name, normalized)
      && repositoryHasUsableSnapshot(entry.path));
    if (repo) return { root, repo };
  }
  return null;
}

function scanModelCache(appPath, env = process.env) {
  const roots = modelCacheRoots(appPath, env);
  const repositories = roots.flatMap((root) => cachedRepositories(root).map((repo) => ({ root, ...repo })));
  let freeBytes = null;
  for (const root of roots) {
    const free = freeBytesFor(root);
    if (free != null) { freeBytes = Math.min(freeBytes ?? free, free); }
  }
  return {
    roots,
    freeBytes,
    models: KNOWN_MODELS.map((id) => {
      const match = repositories.find((repo) => repositoryMatchesModel(repo.name, id)
        && repositoryHasUsableSnapshot(repo.path));
      return {
        id,
        installed: !!match,
        repository: match?.name || '',
        sizeBytes: match ? directorySizeBytes(match.path) : null,
        ...(MODEL_CATALOG[id] || {}),
      };
    }),
  };
}

// F18: güvenli temizlik — yalnız bilinen modelin, bilinen önbellek kökü
// içindeki, kullanılabilir anlık görüntülü deposu silinir. Yol çevrelenmesi
// zorunlu; model kimliği whitelist dışıysa reddedilir.
function deleteCachedModel(appPath, model, env = process.env) {
  const found = findModelRepository(appPath, model, env);
  if (!found) return { ok: false, error: 'Model önbellekte bulunamadı.' };
  const rootResolved = path.resolve(found.root) + path.sep;
  const repoResolved = path.resolve(found.repo.path);
  if (!repoResolved.startsWith(rootResolved) || repoResolved === path.resolve(found.root)) {
    return { ok: false, error: 'Önbellek yolu doğrulanamadı.' };
  }
  const freedBytes = directorySizeBytes(repoResolved);
  fs.rmSync(repoResolved, { recursive: true, force: true });
  return { ok: true, freedBytes, repository: found.repo.name };
}

module.exports = {
  KNOWN_MODELS,
  MODEL_CATALOG,
  deleteCachedModel,
  directorySizeBytes,
  findModelRepository,
  hasModelFiles,
  modelCacheRoots,
  repositoryHasUsableSnapshot,
  repositoryMatchesModel,
  scanModelCache,
};
