const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { modelCacheRoots, repositoryMatchesModel, scanModelCache } = require('../src/model-manager');

let passed = 0;
function test(name, fn) { fn(); passed += 1; }

test('Hugging Face önbellek yollarını tekrarsız üretir', () => {
  const roots = modelCacheRoots('C:\\app', { HF_HOME: 'C:\\hf', USERPROFILE: 'C:\\user' });
  assert(roots.some((item) => item.endsWith(path.join('hf', 'hub'))));
  assert.equal(new Set(roots).size, roots.length);
});

test('model depo adları güvenli biçimde eşlenir', () => {
  assert(repositoryMatchesModel('models--Systran--faster-whisper-small', 'small'));
  assert(repositoryMatchesModel('models--mobiuslabsgmbh--faster-whisper-large-v3-turbo', 'large-v3-turbo'));
  assert(!repositoryMatchesModel('models--Systran--faster-whisper-base', 'large-v3'));
});

test('önbellekte bulunan model indirilmiş görünür', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'whisper-model-cache-'));
  fs.mkdirSync(path.join(root, 'models--Systran--faster-whisper-small'));
  const result = scanModelCache('', { HUGGINGFACE_HUB_CACHE: root });
  assert.equal(result.models.find((item) => item.id === 'small').installed, true);
  assert.equal(result.models.find((item) => item.id === 'medium').installed, false);
  fs.rmSync(root, { recursive: true, force: true });
});

console.log(`model-manager: ${passed} test`);
