'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { clonePublicOptions, queueSnapshotForDisk, normalizeQueueSnapshot } = require('../src/queue-persistence');
const { canonicalWatchKey } = require('../src/watch-library-store');
const assets = require('../src/browser-asset-store');

test('credential compound names are removed recursively without removing media and token budget options', () => {
  const source = { model: 'small', passwordHash: 'fixture-hash', apiKeyPotpourri: 'fixture-api',
    serverKey: 'fixture-server', nested: { customServerKey: 'fixture-server',
      APIKeyBackup: 'fixture-api', password_hash: 'fixture-hash' },
    providers: [{ api_key_backup: 'fixture-api', model: 'fixture' }],
    mediaKey: 'video', sourceKey: 'source', keyboard: 'layout', maxTokens: 400,
    tokenBudget: 200, tokenCeiling: 300 };
  assert.deepEqual(clonePublicOptions(source), { model: 'small', nested: {}, providers: [{ model: 'fixture' }],
    mediaKey: 'video', sourceKey: 'source', keyboard: 'layout', maxTokens: 400, tokenBudget: 200, tokenCeiling: 300 });
  assert.equal(source.passwordHash, 'fixture-hash', 'sanitization must not mutate caller data');
});

test('credential query names are sanitized too while endpoint path and public parameters survive', () => {
  const result = clonePublicOptions({ customEndpoint:
    'https://example.test/CaseSensitive/v1?apiKeyPotpourri=fixture&serverKey=fixture&passwordHash=fixture&model=small' });
  assert.equal(result.customEndpoint, 'https://example.test/CaseSensitive/v1?model=small');
});

test('queue disk roundtrip removes compound credentials from restored options', () => {
  const disk = queueSnapshotForDisk({ items: [{ id: 1, type: 'file', input: 'D:\\Türkçe.mp4', status: 'pending',
    opts: { model: 'small', passwordHash: 'fixture', serverKey: 'fixture', apiKeyPotpourri: 'fixture' } }] });
  const restored = normalizeQueueSnapshot(JSON.parse(JSON.stringify(disk)));
  assert.equal(restored.items.length, 1);
  assert.deepEqual(restored.items[0].opts, { model: 'small' });
});

test('real browser watch keys canonicalize scheme and host while preserving path case', () => {
  assert.equal(canonicalWatchKey('browser:HTTPS://X.com/a'), canonicalWatchKey('browser:https://x.com/a'));
  assert.notEqual(canonicalWatchKey('browser:https://x.com/A'), canonicalWatchKey('browser:https://x.com/a'));
});

test('asset normalization continues rejecting invalid and zero millisecond subtitle intervals', () => {
  const cues = assets.normalizeCues([{ start: 5, end: 4, text: 'invalid' },
    { start: 5, end: 5, text: 'empty' }, { start: 5, end: 5.0001, text: 'rounded empty' },
    { start: 5, end: 8, text: 'Geçerli' }]);
  assert.deepEqual(cues.map(cue => cue.text), ['Geçerli']);
});
