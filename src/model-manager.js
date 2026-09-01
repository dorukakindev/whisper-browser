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

function cachedRepositoryNames(root) {
  try {
    return fs.readdirSync(root, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() && entry.name.startsWith('models--'))
      .map((entry) => entry.name.toLowerCase());
  } catch (_) { return []; }
}

function repositoryMatchesModel(repository, model) {
  const normalized = String(model || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  const repo = String(repository || '').toLowerCase().replace(/[^a-z0-9]+/g, '-');
  if (normalized === 'large-v3-turbo') return repo.includes('large-v3-turbo') || repo.includes('whisper-turbo');
  return repo.endsWith(`-${normalized}`) || repo.includes(`faster-whisper-${normalized}`);
}

function scanModelCache(appPath, env = process.env) {
  const roots = modelCacheRoots(appPath, env);
  const repositories = roots.flatMap((root) => cachedRepositoryNames(root).map((name) => ({ root, name })));
  return {
    roots,
    models: KNOWN_MODELS.map((id) => {
      const match = repositories.find((repo) => repositoryMatchesModel(repo.name, id));
      return { id, installed: !!match, repository: match?.name || '' };
    }),
  };
}

module.exports = { KNOWN_MODELS, modelCacheRoots, repositoryMatchesModel, scanModelCache };
