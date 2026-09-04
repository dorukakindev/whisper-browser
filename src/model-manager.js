const fs = require('fs');
const path = require('path');

const KNOWN_MODELS = Object.freeze([
  'large-v3', 'large-v3-turbo', 'large-v2', 'medium', 'small', 'base', 'tiny',
]);

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

function scanModelCache(appPath, env = process.env) {
  const roots = modelCacheRoots(appPath, env);
  const repositories = roots.flatMap((root) => cachedRepositories(root).map((repo) => ({ root, ...repo })));
  return {
    roots,
    models: KNOWN_MODELS.map((id) => {
      const match = repositories.find((repo) => repositoryMatchesModel(repo.name, id)
        && repositoryHasUsableSnapshot(repo.path));
      return { id, installed: !!match, repository: match?.name || '' };
    }),
  };
}

module.exports = {
  KNOWN_MODELS,
  hasModelFiles,
  modelCacheRoots,
  repositoryHasUsableSnapshot,
  repositoryMatchesModel,
  scanModelCache,
};
