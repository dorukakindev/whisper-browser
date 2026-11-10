'use strict';

// Container contracts shared by read-only health checks and portable backups.
// Keep legacy shapes accepted by normal readers; reject unusable JSON roots.
function validateStoreShape(name, value) {
  require('./workspace-library-data').validate(name, value);
  const object = (v) => !!v && typeof v === 'object' && !Array.isArray(v);
  const rows = (v) => Array.isArray(v) && v.every(object);
  let valid = true;
  switch (name) {
    case 'feeds.json': require('./feed-store').validate(value); break;
    case 'media-catalog.json':
      valid = object(value) && value.version === 1 && rows(value.items) && value.items.length <= 10000;
      if (valid) {for (const item of value.items) require('./media-catalog-store').itemOf(item);require('./catalog-folder-diff').normalizeSnapshots(value.folderSnapshots);}
      break;
    case 'watch-library.json':
      valid = rows(value) || (object(value) && rows(value.items)
        && ['overflowItems', 'tombstones', 'overflowTombstones', 'migrationQuarantine']
          .every((key) => value[key] === undefined || Array.isArray(value[key])));
      if (valid) require('./watch-library-store').migrateWatchDocument(value);
      break;
    case 'watch-library-tombstones.json':
    case 'history.json': valid = rows(value); break;
    case 'browser-session.json':
      valid = object(value) && rows(value.tabs)
        && (value.version === undefined || (Number.isInteger(value.version) && value.version >= 1 && value.version <= 8));
      if (valid && value.tabs.length) valid = value.tabs.some((tab) => require('./browser-session-store').normalizeSessionTab(tab));
      break;
    case 'browser-notes.json':
      valid = object(value) && Number(value.version) === 1 && rows(value.annotations)
        && value.annotations.every((row) => typeof row.id === 'string' && !!row.id.trim()
          && typeof (row.mediaId ?? row.media_id) === 'string' && !!(row.mediaId ?? row.media_id).trim()); break;
    case 'assistant-artifacts.json': require('./assistant-artifact-service').validateEnvelope(value); break;
    case 'assistant-conversations.json': require('./assistant-thread-store').validateEnvelope(value); break;
  }
  if (!valid) throw new Error(`Invalid store schema: ${name}`);
  return value;
}

module.exports = { validateStoreShape };
