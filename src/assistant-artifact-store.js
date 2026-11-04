/* V3-T07 — Artifact deposu: gövde AYRI sınırlı belge, thread'de yalnız küçük doğrulanmış referans.
   Revizyon + expectedRevision ile eşzamanlılık; kullanıcı düzenlemesi model gövdesinden AYRI katmanda tutulur
   (geç gelen model akışı elle düzenlenmiş hücreyi ezmez); eski sürümler sınırlı sayıda korunur.
   Kalıcılık enjekte edilir (storage.get/set/list); gerçek profil dosyasına bu modül dokunmaz. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AssistantArtifactStore = api;
})(globalThis, () => {
  'use strict';

  const KINDS = ['matrix', 'timeline', 'dossier', 'route'];
  const fail = (code, extra) => ({ ok: false, code, ...(extra || {}) });
  const bytes = (v) => new TextEncoder().encode(JSON.stringify(v)).length;
  const hash = (s) => { let h = 0x811c9dc5; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 0x01000193) >>> 0; } return h.toString(36); };
  const clone = (v) => JSON.parse(JSON.stringify(v));

  function collectSourceIds(body) {
    const ids = new Set(); const walk = (v) => { if (!v || typeof v !== 'object') return; if (Array.isArray(v)) return v.forEach(walk); if (typeof v.sourceId === 'string') ids.add(v.sourceId); Object.values(v).forEach(walk); };
    walk(body); return ids;
  }
  /** Etkin gövde = model gövdesi + kullanıcı düzenlemeleri (cell:/node:/passage: anahtarları). */
  function effectiveBody(doc) {
    const body = clone(doc.modelBody); const e = doc.userEdits || {};
    if (body.type === 'matrix') body.cells.forEach((c) => { const k = `cell:${c.rowId}:${c.colId}`; if (k in e) { c.value = e[k]; c.status = e[k] ? 'user' : 'unknown'; c.userEdited = true; } });
    if (body.type === 'timeline') body.nodes.forEach((n) => { const k = `node:${n.id}`; if (k in e) { n.label = e[k]; n.userEdited = true; } });
    if (body.type === 'dossier') body.sections.forEach((s) => s.passages.forEach((p) => { const k = `passage:${p.id}`; if (k in e) { p.text = e[k]; p.userEdited = true; } }));
    const spoilers = doc.userSpoilers || {};
    const apply = (entry, key) => { if (Object.hasOwn(spoilers, key)) entry.spoiler = spoilers[key]; };
    if (body.type === 'matrix') body.cells.forEach(c => apply(c, `cell:${c.rowId}:${c.colId}`));
    if (body.type === 'timeline') body.nodes.forEach(n => apply(n, `node:${n.id}`));
    if (body.type === 'dossier') body.sections.forEach(s => s.passages.forEach(p => apply(p, `passage:${p.id}`)));
    return body;
  }

  function createArtifactStore({ storage, now = () => Date.now(), newId, knownSourceIds = () => null, maxBodyBytes = 256 * 1024, maxVersions = 20 }) {
    if (!storage || typeof storage.get !== 'function' || typeof storage.set !== 'function') throw new TypeError('storage gerekli');
    let seq = 0;
    const idFor = typeof newId === 'function' ? newId : () => `art-${now().toString(36)}-${(seq++).toString(36)}`;

    function checkBody(body) {
      if (!body || !KINDS.includes(body.type)) return fail('invalid-body');
      if (bytes(body) > maxBodyBytes) return fail('body-too-large', { maxBodyBytes });
      const known = knownSourceIds();
      if (known) { const unknown = Array.from(collectSourceIds(body)).filter((id) => !known.has(id)); if (unknown.length) return fail('unknown-source-id', { unknown }); }
      return null;
    }
    async function create({ threadId, title, body, by = 'model' }) {
      const bad = checkBody(body); if (bad) return bad;
      const doc = { id: idFor(), threadId: String(threadId || ''), kind: body.type, title: String(title || body.title || '').slice(0, 200), revision: 1, modelBody: clone(body), userEdits: {}, userSpoilers: {}, versions: [], history: [{ revision: 1, at: now(), by, bodyHash: hash(JSON.stringify(body)) }] };
      await storage.set(doc.id, doc); return { ok: true, doc };
    }
    async function load(id) { const d = await storage.get(id); return d ? clone(d) : null; }
    const pushVersion = (doc, by) => {
      doc.versions.push({ revision: doc.revision, at: now(), by, modelBody: clone(doc.modelBody), userEdits: clone(doc.userEdits), userSpoilers: clone(doc.userSpoilers || {}) });
      while (doc.versions.length > maxVersions) doc.versions.shift();
    };
    async function updateModel({ id, expectedRevision, body, by = 'model' }) {
      const doc = await load(id); if (!doc) return fail('not-found');
      if (doc.revision !== expectedRevision) return fail('revision-conflict', { currentRevision: doc.revision });
      if (body && body.type !== doc.kind) return fail('kind-mismatch');
      const bad = checkBody(body); if (bad) return bad;
      pushVersion(doc, by);
      doc.modelBody = clone(body); doc.revision += 1;
      doc.history.push({ revision: doc.revision, at: now(), by, bodyHash: hash(JSON.stringify(body)) });
      await storage.set(id, doc);
      const superseded = Object.keys(doc.userEdits); // kullanıcı düzenlemesi korunur; hangi anahtarlar etkilendi bilgisi
      return { ok: true, doc, userEditsPreserved: superseded };
    }
    async function userEdit({ id, expectedRevision, key, value }) {
      const doc = await load(id); if (!doc) return fail('not-found');
      if (doc.revision !== expectedRevision) return fail('revision-conflict', { currentRevision: doc.revision });
      if (typeof key !== 'string' || !/^(cell|node|passage):/.test(key)) return fail('invalid-key');
      if (String(value == null ? '' : value).length > 2000) return fail('value-too-large');
      pushVersion(doc, 'user');
      doc.userEdits[key] = String(value == null ? '' : value); doc.revision += 1;
      doc.history.push({ revision: doc.revision, at: now(), by: 'user', bodyHash: hash(JSON.stringify(doc.userEdits)) });
      await storage.set(id, doc); return { ok: true, doc };
    }
    async function setSpoiler({ id, expectedRevision, key, value }) {
      const doc = await load(id); if (!doc) return fail('not-found');
      if (doc.revision !== expectedRevision) return fail('revision-conflict', { currentRevision: doc.revision });
      if (typeof key !== 'string' || !/^(cell|node|passage):/.test(key) || !['open', 'closed'].includes(value)) return fail('invalid-key');
      pushVersion(doc, 'user');
      doc.userSpoilers = { ...(doc.userSpoilers || {}), [key]: value };
      doc.revision += 1;
      doc.history.push({ revision: doc.revision, at: now(), by: 'user', bodyHash: hash(JSON.stringify(doc.userSpoilers)) });
      await storage.set(id, doc); return { ok: true, doc };
    }
    async function get(id) { const d = await load(id); return d ? { ok: true, doc: d, body: effectiveBody(d) } : fail('not-found'); }
    async function restoreVersion({ id, expectedRevision, revision }) {
      const doc = await load(id); if (!doc) return fail('not-found');
      if (doc.revision !== expectedRevision) return fail('revision-conflict', { currentRevision: doc.revision });
      const v = doc.versions.find((x) => x.revision === revision); if (!v) return fail('version-unavailable');
      pushVersion(doc, 'user'); doc.modelBody = clone(v.modelBody); doc.userEdits = clone(v.userEdits); doc.userSpoilers = clone(v.userSpoilers || {}); doc.revision += 1;
      doc.history.push({ revision: doc.revision, at: now(), by: 'user', bodyHash: hash(JSON.stringify(doc.modelBody)) });
      await storage.set(id, doc); return { ok: true, doc };
    }
    return Object.freeze({ create, updateModel, userEdit, setSpoiler, get, restoreVersion });
  }

  /** Thread'e yalnız küçük referans yazılır; gövde thread ayarlarına sıkıştırılmaz. */
  function makeThreadRef(doc) { return { artifactId: String(doc.id), revision: doc.revision, kind: doc.kind, title: String(doc.title || '').slice(0, 120) }; }
  function validateThreadRef(ref) {
    return !!ref && typeof ref.artifactId === 'string' && ref.artifactId.length > 0 && ref.artifactId.length <= 80 && Number.isInteger(ref.revision) && ref.revision >= 1 && KINDS.includes(ref.kind)
      && typeof ref.title === 'string' && ref.title.length <= 120 && Object.keys(ref).length === 4;
  }
  return Object.freeze({ createArtifactStore, makeThreadRef, validateThreadRef, effectiveBody, collectSourceIds, KINDS });
});
