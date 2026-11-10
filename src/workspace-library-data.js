'use strict';

// Portable personal-library stores. Unrelated caches and credentials stay out.
// Do not path-remap these documents: IDs, notes and evidence are owner data.
const STORES = Object.freeze({
  'personal-collection.json': { bytes: 16000000, field: 'rows', max: 10000 },
  'recall-network.json': { bytes: 12000000, field: 'refs', max: 2000 },
  'personal-smart-shelves.json': { bytes: 200000, field: 'shelves', max: 30 },
  'personal-library-groups.json': { bytes: 2000000, field: 'items', max: 60 },
  'personal-pause-notes.json': { bytes: 2000000, field: 'items', max: 10000 },
  'franchise-tracker.json': { bytes: 8000000, field: 'entries', max: 1000 },
  'release-calendar.json': { bytes: 8000000, field: 'calendars', max: 1000 },
  'recommendation-history.json': { bytes: 2000000, field: 'entries', max: 2000 },
  'personal-repeat-sessions.json': { bytes: 4000000, field: 'items', max: 5000 },
  'library-workspace.json': { bytes: 4000000, field: 'sessions', max: 5000 },
  'feed-reading.json': { bytes: 2000000, field: 'items', max: 1000 },
  'adaptation-links.json': { bytes: 2000000, field: 'links', max: 1000 },
});
const NAMES = new Set(Object.keys(STORES));
const object = v => !!v && typeof v === 'object' && !Array.isArray(v);
const text = (v, max, empty = false) => typeof v === 'string' && v.length <= max && !v.includes('\0') && (empty || !!v.length);
function check(ok) { if (!ok) throw Error('Invalid personal library package schema. / Geçersiz kişisel kütüphane paket şeması.'); }
function array(value, max, required = true) {
  if (value === undefined && !required) return [];
  check(Array.isArray(value) && value.length <= max && value.every(object)); return value;
}
function unique(rows, identity = r => r.id) {
  const ids = rows.map(identity); check(ids.every(id => text(id, 1000)) && new Set(ids).size === ids.length);
}
function reference(r) {
  check(object(r) && ['collection','catalog','source'].includes(r.origin) && text(r.id, 500));
  return JSON.stringify([r.origin, r.id]);
}
function validate(name, data) {
  const spec = STORES[name]; if (!spec) return;
  check(object(data) && data.version === 1 && Buffer.byteLength(JSON.stringify(data)) <= spec.bytes);
  if(name==='recommendation-history.json')return require('./recommendation-controls').validate(data);
  if(name==='personal-repeat-sessions.json')return require('./personal-repeat-sessions').validate(data);
  if(name==='library-workspace.json')return require('./library-workspace').validate(data);
  if(name==='feed-reading.json')return require('./feed-reading-workspace').validate(data);
  if(name==='adaptation-links.json')return require('./adaptation-links').validate(data);
  const rows = array(data[spec.field], spec.max);
  unique(rows, name === 'personal-pause-notes.json' ? reference : r => r.id);
  if (name === 'personal-collection.json') {
    for (const r of rows) {
      check(text(r.title, 500) && require('./media-domains').DOMAINS.includes(r.domain));
      if (r.status !== undefined) check(['planned','watching','completed','paused','dropped'].includes(r.status));
      if (r.rating != null && !(typeof r.rating==='string'&&r.rating.trim()==='')) check((typeof r.rating === 'number' || typeof r.rating === 'string') && Number.isFinite(Number(r.rating)) && Number(r.rating) >= 0 && Number(r.rating) <= 10);
      for (const key of ['progress','total','volumes','totalVolumes']) if (r[key] != null) check(Number.isSafeInteger(r[key]) && r[key] >= 0 && r[key] <= 1000000);
      if (r.variants !== undefined) array(r.variants, 12);
      if (r.metadata !== undefined) check(object(r.metadata));
      if (r._fieldVersions !== undefined) check(object(r._fieldVersions) && Object.values(r._fieldVersions).every(n => Number.isSafeInteger(n) && n >= 0));
    }
    // Receipts are preserved verbatim; replay still uses the import owner's checks.
    if (data.imports !== undefined) array(data.imports, 40);
  } else if (name === 'recall-network.json') {
    for (const r of rows) check(object(r.ref) && text(r.ref.kind, 100) && text(r.ref.id, 500) && (r.hidden === undefined || typeof r.hidden === 'boolean'));
    for (const [key, max] of Object.entries({edges:6000,evidence:10000,events:2000,notes:2000,entities:10000,hypotheses:2000,runs:100,views:30})) {
      const entries = array(data[key], max, ['edges','evidence'].includes(key)); unique(entries);
    }
    for (const key of ['reactions','positions','aliases']) if (data[key] !== undefined) check(object(data[key]));
  } else if (name === 'personal-smart-shelves.json') {
    for (const r of rows) { check(text(r.name, 100)); require('./personal-library-views').filterOf(r.filter); }
  } else if (name === 'personal-library-groups.json') {
    for (const r of rows) {
      check(text(r.id, 200) && text(r.name, 100) && text(r.description, 3000, true) && (r.label == null || text(r.label, 100)));
      for (const key of ['members','order']) { const refs = array(r[key], 1000); unique(refs, reference); }
      if (r.coverRef) reference(r.coverRef);
    }
  } else if (name === 'personal-pause-notes.json') {
    for (const r of rows) check(['paused','dropped'].includes(r.context) && text(r.text, 2000, true) && Number.isSafeInteger(r.updatedAt));
  } else if (name === 'franchise-tracker.json') {
    for (const r of rows) {
      check(['anime','manga'].includes(r.domain) && typeof r.following === 'boolean' && object(r.graph));
      array(r.graph.nodes, 10000); array(r.graph.edges, 10000);
      if (r.graphs !== undefined) check(object(r.graphs) && Object.keys(r.graphs).length <= 30);
      if (r.updates !== undefined) array(r.updates, 100);
      if (r.seen !== undefined) check(Array.isArray(r.seen) && r.seen.every(s => text(s, 1000)));
    }
  } else if (name === 'release-calendar.json') {
    for (const r of rows) { check(['anime','manga'].includes(r.domain)); const events = array(r.events, 26); unique(events); }
  }
}
function describe(json) {
  const count = (name, field) => { const rows = json(name)?.[field]; return Array.isArray(rows) ? rows.length : 0; };
  const series = json('franchise-tracker.json')?.entries;
  return {
    personalCollectionItems: count('personal-collection.json','rows'),
    networkReferences: count('recall-network.json','refs'), networkHypotheses: count('recall-network.json','hypotheses'),
    smartShelves: count('personal-smart-shelves.json','shelves'),
    personalCollections: count('personal-library-groups.json','items'),
    pauseNotes: count('personal-pause-notes.json','items'),
    followedSeries: Array.isArray(series) ? series.filter(e => e?.following === true).length : 0,
    releaseCalendars: count('release-calendar.json','calendars'),
    recommendationHistory: count('recommendation-history.json','entries'),
    repeatSessions: count('personal-repeat-sessions.json','items'),
    readingSessions: count('library-workspace.json','sessions'),
    workspacePreferences: json('library-workspace.json')?.preferences ? 1 : 0,
    feedPassages: count('feed-reading.json','items'), feedReadingPlaces: count('feed-reading.json','places'),
    adaptationLinks: count('adaptation-links.json','links'),
  };
}
module.exports = { STORES, NAMES, validate, describe };
