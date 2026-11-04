'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { randomUUID } = require('node:crypto');
const { atomicWriteFileSync } = require('./fsync-utils');
const { createArtifactStore, makeThreadRef } = require('./assistant-artifact-store');
const { buildComparisonMatrix } = require('./assistant-artifact-builders');

const { fromMessage, editKeys, validateSourcedBody } = require('./assistant-message-artifact');

const FILE = 'assistant-artifacts.json';
const LIMIT = 16 * 1024 * 1024;
const MAX_DOCUMENTS = 200;
const id = value => typeof value === 'string' && /^[\w:-]{1,120}$/.test(value);
const sourceId = value => typeof value === 'string' && value.length > 0 && value.length <= 120 && !value.includes('\0');
const shortText = value => typeof value === 'string' && value.length <= 2000;
const fail = () => { throw Error('Invalid assistant artifact archive.'); };

function validateMatrix(body) {
  if (body?.type !== 'matrix' || !shortText(body.title) ||
      !Array.isArray(body.columns) || body.columns.length !== 2 ||
      !Array.isArray(body.rows) || body.rows.length !== 3 ||
      !Array.isArray(body.cells) || body.cells.length !== 6) fail();
  const axis = entries => {
    if (!entries.every(entry => sourceId(entry?.id) && shortText(entry.label))) fail();
    const ids = new Set(entries.map(entry => entry.id));
    if (ids.size !== entries.length) fail();
    return ids;
  };
  const columns = axis(body.columns), rows = axis(body.rows), keys = new Set();
  for (const cell of body.cells) {
    if (!rows.has(cell?.rowId) || !columns.has(cell.colId) || !shortText(cell.value) ||
        !['known', 'unknown'].includes(cell.status) || cell.spoiler !== 'open' ||
        !Array.isArray(cell.claims) || cell.claims.length !== (cell.value ? 1 : 0) ||
        !cell.claims.every(claim => claim?.sourceId === cell.colId && shortText(claim.quote))) fail();
    keys.add(JSON.stringify([cell.rowId, cell.colId]));
  }
  if (keys.size !== 6) fail();
}

function validateEnvelope(data) {
  if (data?.version !== 1 || !Array.isArray(data.documents) ||
      data.documents.length > MAX_DOCUMENTS || Buffer.byteLength(JSON.stringify(data)) > LIMIT) fail();
  const ids = new Set();
  for (const doc of data.documents) {
    if (!id(doc?.id) || doc.id.length > 80 || ids.has(doc.id) || !['matrix', 'dossier', 'timeline'].includes(doc.kind) ||
        typeof doc.threadId !== 'string' || doc.threadId.length > 100 || !shortText(doc.title) || !Number.isSafeInteger(doc.revision) ||
        doc.revision < 1 || !Array.isArray(doc.versions) || doc.versions.length > 20 ||
        !Array.isArray(doc.history) || doc.history.length > 21) fail();
    ids.add(doc.id);
    for (const version of [doc, ...doc.versions]) {
      if (!Number.isSafeInteger(version?.revision) || version.revision < 1 ||
          version.revision > doc.revision || !version.userEdits ||
          typeof version.userEdits !== 'object' || Array.isArray(version.userEdits)) fail();
      if (doc.kind === 'matrix') validateMatrix(version.modelBody);
      else {
        validateSourcedBody(version.modelBody);
        if (version.modelBody.type !== doc.kind || version.modelBody.origin.threadId !== doc.threadId) fail();
      }
      const edits = Object.entries(version.userEdits);
      if (edits.length > 200 || edits.some(([key, value]) => !/^(cell:[^\0]{1,250}|node:[\w-]{1,100}|passage:p\d+)$/.test(key) || !shortText(value))) fail();
    }
  }
  return data;
}

function registerAssistantArtifacts({ app, ipcMain, authorized, catalogStore }) {
  let queue = Promise.resolve();
  function handle(event, input) {
    if (!authorized(event)) return { ok: false, error: 'Unauthorized artifact request.' };
    const task = queue.then(async () => {
      try {
        const file = path.join(app.getPath('userData'), FILE);
        if (fs.existsSync(file) && fs.statSync(file).size > LIMIT) fail();
        const data = fs.existsSync(file) ? validateEnvelope(JSON.parse(fs.readFileSync(file, 'utf8'))) : { version: 1, documents: [] };
        const lookup = artifactId => data.documents.find(doc => doc.id === artifactId);
        const store = createArtifactStore({
          newId: randomUUID,
          storage: {
            get: lookup,
            set(artifactId, doc) {
              doc.history = doc.history.slice(-21);
              const index = data.documents.findIndex(row => row.id === artifactId);
              if (index < 0) data.documents.push(doc);
              else data.documents[index] = doc;
              atomicWriteFileSync(file, JSON.stringify(validateEnvelope(data)));
            },
          },
        });
        if (input?.action === 'list') {
          return { ok: true, artifacts: data.documents.filter(doc => input.threadId ? doc.threadId === input.threadId : doc.kind === 'matrix').slice().reverse().map(doc => ({
            ...makeThreadRef(doc), columns: doc.modelBody.columns,
          })) };
        }
        if (input?.action === 'get' && id(input.id)) return store.get(input.id);
        if (input?.action === 'restore' && id(input.id)) return await store.restoreVersion(input);
        if (input?.action === 'edit' && id(input.id)) {
          const doc = lookup(input.id);
          if (!doc || !editKeys(doc.modelBody).includes(input.key) || !shortText(input.value)) return { ok: false, code: 'invalid-edit' };
          return await store.userEdit(input);
        }
        if (input?.action === 'from-message') {
          const threadsFile = path.join(app.getPath('userData'), 'assistant-conversations.json');
          if (!fs.existsSync(threadsFile) || fs.statSync(threadsFile).size > 32000000) return { ok: false, code: 'reply-unavailable' };
          const threads = require('./assistant-thread-store').validateEnvelope(JSON.parse(fs.readFileSync(threadsFile, 'utf8'))).threads;
          const thread = threads.find(row => row.id === input.threadId && row.sourceKey === input.sourceKey);
          const message = thread?.messages.find(row => row.id === input.messageId);
          if (!message) return { ok: false, code: 'reply-unavailable' };
          const generated = fromMessage(thread, message, input.kind);
          if (!generated.ok) return generated;
          const existing = data.documents.find(doc => doc.kind === input.kind && doc.threadId === thread.id &&
            doc.modelBody.origin?.messageId === message.id && doc.modelBody.origin.sourceKey === thread.sourceKey);
          if (existing && input.expectedRevision == null) return { ok: true, doc: existing };
          if (existing) return await store.updateModel({ id: existing.id, expectedRevision: input.expectedRevision, body: generated.body });
          if (data.documents.length >= MAX_DOCUMENTS) return { ok: false, code: 'archive-full' };
          return await store.create({ threadId: thread.id, body: generated.body });
        }
        if (input?.action === 'save') {
          const ids = input.ids;
          if (!Array.isArray(ids) || ids.length !== 2 || ids[0] === ids[1] || !ids.every(sourceId)) fail();
          const catalog = new Map(catalogStore().list().map(row => [row.id, row]));
          const selected = ids.map(key => catalog.get(key));
          if (selected.some(row => !row)) return { ok: false, code: 'source-missing' };
          const existing = input.id == null ? null : lookup(input.id);
          if (input.id != null && (!existing || existing.kind !== 'matrix' || existing.modelBody.columns.some((col, i) => col.id !== ids[i]))) {
            return { ok: false, code: 'source-mismatch' };
          }
          if (!existing && data.documents.length >= MAX_DOCUMENTS) return { ok: false, code: 'archive-full' };
          const tr = input.locale === 'tr';
          const fields = [['year', tr ? 'Yıl' : 'Year'], ['runtime', tr ? 'Süre (dk)' : 'Runtime (min)'], ['kind', tr ? 'Tür' : 'Type']];
          const { body } = buildComparisonMatrix({
            title: tr ? 'Karşılaştırma' : 'Comparison',
            columns: selected.map(row => ({ id: row.id, label: row.title })),
            rows: fields.map(([key, label]) => ({ id: key, label })),
            knownSourceIds: new Set(ids),
            cells: selected.flatMap(row => fields.filter(([key]) => row[key]).map(([key]) => ({
              rowId: key, colId: row.id, value: key === 'kind' ? (row.kind === 'series' ? (tr ? 'Dizi' : 'Series') : 'Film') : String(row[key]),
              claims: [{ sourceId: row.id, quote: String(row[key]) }],
            }))),
          });
          return existing
            ? await store.updateModel({ id: existing.id, expectedRevision: input.expectedRevision, body, by: 'catalog' })
            : await store.create({ body, by: 'catalog' });
        }
        return { ok: false, code: 'unsupported-action' };
      } catch {
        return { ok: false, code: 'archive-unavailable' };
      }
    });
    queue = task.catch(() => {});
    return task;
  }
  ipcMain.handle('assistant-artifacts:request', handle);
  return { handle };
}

module.exports = { FILE, validateEnvelope, registerAssistantArtifacts };
