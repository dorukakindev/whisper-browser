/**
 * Gerçek Git geçmişindeki izleme kütüphanesi aileleri etrafında üretilen corpus.
 * Commitler: 4208d2f, 50faad5, 378514b, 6e52581 ve 90564ae.
 */

const FAMILY_DEFINITIONS = [
  { id: 'legacy-array-4208d2f', commit: '4208d2f', wrapper: 'array' },
  { id: 'browser-identity-50faad5', commit: '50faad5', wrapper: 'browser-array' },
  { id: 'settings-backup-v2-50faad5', commit: '50faad5', wrapper: 'settings-backup' },
  { id: 'atomic-backup-378514b', commit: '378514b', wrapper: 'atomic-backup' },
  { id: 'manual-override-6e52581', commit: '6e52581', wrapper: 'manual-array' },
  { id: 'tombstone-sidecar-90564ae', commit: '90564ae', wrapper: 'tombstone-sidecar' },
];

const VARIANTS = [
  'missing-collections',
  'null-collections',
  'wrong-collections-type',
  'duplicate-collections',
  'missing-sessions',
  'null-sessions',
  'corrupt-session-member',
  'wrong-prefs-type',
  'null-completed',
  'manual-incomplete',
  'manual-complete',
  'string-revision',
  'unknown-future-item-field',
  'duplicate-id',
  'duplicate-session-id',
  'old-file-identity',
  'old-browser-url-identity',
  'corrupt-single-record',
  'invalid-key-record',
  'partial-migration-envelope',
  'future-schema-envelope',
  'long-boundary-fields',
];

function baseItem(familyIndex, variantIndex) {
  const key = `file:C:\\Corpus\\Aile-${familyIndex}\\video-${variantIndex}.mkv`;
  return {
    key,
    type: 'local',
    title: `Corpus ${familyIndex}-${variantIndex}`,
    sourceRef: `C:\\Corpus\\Aile-${familyIndex}\\video-${variantIndex}.mkv`,
    localPath: `C:\\Corpus\\Aile-${familyIndex}\\video-${variantIndex}.mkv`,
    duration: 900,
    position: 123,
    completed: false,
    firstWatched: 1000 + variantIndex,
    lastWatched: 2000 + variantIndex,
    collections: ['Corpus'],
    subtitlePaths: [`C:\\Corpus\\video-${variantIndex}.tr.srt`],
    prefs: { speed: 1.25 },
    sessions: [{ id: `session-${familyIndex}-${variantIndex}`, watchSeconds: 12 }],
    futureSentinel: { familyIndex, variantIndex, keep: true },
  };
}

function applyVariant(items, variant, familyIndex, variantIndex) {
  const item = items[0];
  if (variant === 'missing-collections') delete item.collections;
  else if (variant === 'null-collections') item.collections = null;
  else if (variant === 'wrong-collections-type') item.collections = { bad: true };
  else if (variant === 'duplicate-collections') item.collections = ['Corpus', ' Corpus ', 'Corpus'];
  else if (variant === 'missing-sessions') delete item.sessions;
  else if (variant === 'null-sessions') item.sessions = null;
  else if (variant === 'corrupt-session-member') item.sessions.push(null, 'bozuk');
  else if (variant === 'wrong-prefs-type') item.prefs = 'hızlı';
  else if (variant === 'null-completed') item.completed = null;
  else if (variant === 'manual-incomplete') Object.assign(item, {
    completed: false, automaticCompleted: true, completionOverride: false, revision: 7,
  });
  else if (variant === 'manual-complete') Object.assign(item, {
    completed: true, automaticCompleted: false, completionOverride: true, revision: 8,
  });
  else if (variant === 'string-revision') item.revision = '9';
  else if (variant === 'unknown-future-item-field') item.futureCodecProfile = { mode: 'v9', flags: [1, 2, 3] };
  else if (variant === 'duplicate-id') {
    items.push({ ...item, title: 'Daha yeni kopya', lastWatched: item.lastWatched + 100, revision: 2,
      collections: ['İkinci'], futureDuplicateField: 'koru' });
  } else if (variant === 'duplicate-session-id') {
    item.sessions.push({ id: item.sessions[0].id, watchSeconds: 30, endedAt: 77 });
  } else if (variant === 'old-file-identity') {
    item.key = `file:C:\\CORPUS\\Aile-${familyIndex}\\VIDEO-${variantIndex}.MKV`;
    items.push({ ...item, key: item.key.replace(/\\/g, '/').toLowerCase(), lastWatched: item.lastWatched + 1 });
  } else if (variant === 'old-browser-url-identity') {
    item.type = 'browser';
    item.key = 'browser:https://example.test/watch?id=42&token=secret-a#one';
    item.sourceRef = 'https://example.test/watch?id=42';
    items.push({ ...item, key: 'browser:https://example.test/watch?token=secret-b&id=42#two', lastWatched: item.lastWatched + 1 });
  } else if (variant === 'corrupt-single-record') items.splice(1, 0, null, 42, 'bozuk');
  else if (variant === 'invalid-key-record') items.push({ title: 'Anahtarsız ama karantinada korunmalı', opaque: 17 });
  else if (variant === 'long-boundary-fields') {
    item.title = 'S'.repeat(8192);
    item.futureSentinel.payload = 'P'.repeat(32768);
  }
}

function wrapFamily(definition, items, variant) {
  let input = items;
  let backup = null;
  let primaryRaw = null;
  let tombstones = [];
  if (definition.wrapper === 'browser-array') {
    items[0].type = 'browser';
    items[0].key = `browser:https://example.test/watch?id=${items[0].futureSentinel.variantIndex}&token=historic#cue`;
    items[0].sourceRef = 'https://example.test/watch';
  } else if (definition.wrapper === 'settings-backup') {
    input = { backupVersion: 2, settings: { theme: 'dark' }, browserPlaces: { history: [] }, watchLibrary: items };
  } else if (definition.wrapper === 'atomic-backup') {
    primaryRaw = '{"yarim":';
    backup = items;
  } else if (definition.wrapper === 'manual-array') {
    if (variant !== 'manual-complete') {
      Object.assign(items[0], { automaticCompleted: true, completionOverride: false, completed: false, revision: 4 });
    }
  } else if (definition.wrapper === 'tombstone-sidecar') {
    const deleted = { ...items[0], key: `${items[0].key}:deleted`, title: 'Silinmiş kayıt' };
    items.push(deleted);
    tombstones = [{ key: deleted.key, removedAt: 3000, futureDeleteReason: 'kullanıcı-kararı' }];
  }
  if (variant === 'partial-migration-envelope') {
    const envelope = { items: Array.isArray(input) ? input : items, migrationStep: 'items-written', futureRoot: { keep: true } };
    if (primaryRaw) backup = envelope;
    else input = envelope;
  } else if (variant === 'future-schema-envelope') {
    const envelope = { schemaVersion: 99, items: Array.isArray(input) ? input : items, futureRoot: { keep: true } };
    if (primaryRaw) backup = envelope;
    else input = envelope;
  }
  return { input, backup, primaryRaw, tombstones };
}

function buildCorpus() {
  const fixtures = [];
  FAMILY_DEFINITIONS.forEach((family, familyIndex) => {
    VARIANTS.forEach((variant, variantIndex) => {
      const items = [baseItem(familyIndex, variantIndex)];
      applyVariant(items, variant, familyIndex, variantIndex);
      const wrapped = wrapFamily(family, items, variant);
      fixtures.push({
        name: `${family.id}/${variant}`,
        family,
        variant,
        expectedSentinel: { familyIndex, variantIndex },
        ...wrapped,
      });
    });
  });
  return fixtures;
}

module.exports = { FAMILY_DEFINITIONS, VARIANTS, buildCorpus };
