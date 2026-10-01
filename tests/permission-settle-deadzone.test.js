'use strict';

// R334 ölü-bölge kilidi — settleBrowserPermissionRequest (src/main.js):
// sıfır test referanslı izin-kararı nihayetlendirmesi.
// Sözleşme:
//   - bilinmeyen requestId → hata
//   - pending silinir + timer temizlenir + callback(allowed)
//   - persistDecision 'allow'/'block' → her bileşen iznine ayrı yazılır
//     ('media' → camera+microphone listesi pending.permissions'tan)
//   - red → 'permission-denied' olayı yayınlanır
//   - dönüş: ok/allowed/origin/permission/persisted

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const source = fs.readFileSync(path.join(__dirname, '..', 'src', 'main.js'), 'utf8');

function section(start, end) {
  const from = source.indexOf(start);
  const to = source.indexOf(end, from);
  assert(from >= 0 && to > from);
  return source.slice(from, to);
}

function makeCtx() {
  const places = { sitePermissions: {} };
  const events = [];
  const writes = [];
  const ctx = vm.createContext({
    String, Number, Array, Set, Map, JSON, RegExp, Error, Promise,
    Math, Object, Date, console, process,
    browserPermissionRequests: new Map(),
    readBrowserPlaces: () => places,
    setBrowserPlaces: (p) => Object.assign(places, p),
    withBrowserPermission: (perms, origin, name, decision) => {
      writes.push([origin, name, decision]);
      return { ok: true, sitePermissions: { ...perms, [`${origin}:${name}`]: decision } };
    },
    sendBrowserEvent: (t, p) => events.push(p),
    browserPermissionLabel: (p) => `etiket(${p})`,
    clearTimeout: () => {},
    __events: events, __writes: writes,
  });
  return { ctx, places, events, writes };
}

function evalSettle(ctx) {
  vm.runInContext(
    section('function settleBrowserPermissionRequest(', 'function ensureBrowserView('),
    ctx);
}

function t_unknown_id() {
  const { ctx } = makeCtx();
  evalSettle(ctx);
  const r = vm.runInContext("settleBrowserPermissionRequest('nope', true)", ctx);
  assert.match(r.error, /geçerli değil/);
}

function t_allow_no_persist() {
  const { ctx } = makeCtx();
  evalSettle(ctx);
  const cb = [];
  ctx.browserPermissionRequests.set('r1', {
    id: 'r1', permission: 'notifications', origin: 'https://a.b',
    host: 'a.b', tab: { id: 1 }, timer: {}, callback: (v) => cb.push(v),
  });
  const r = vm.runInContext("settleBrowserPermissionRequest('r1', true, '')", ctx);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.allowed, true);
  assert.strictEqual(r.persisted, false);
  assert.deepStrictEqual(cb, [true], 'callback allowed=true çağrılmadı');
  assert.strictEqual(ctx.browserPermissionRequests.has('r1'), false, 'pending silinmedi');
  // allow'da denied olayı yok
  assert.strictEqual(ctx.__events.length, 0);
  // persist yok → places yazılmaz
  assert.strictEqual(ctx.__writes.length, 0);
}

function t_deny_persist_media() {
  const { ctx, events, writes } = makeCtx();
  evalSettle(ctx);
  const cb = [];
  ctx.browserPermissionRequests.set('r2', {
    id: 'r2', permission: 'media', origin: 'https://cam.x', host: 'cam.x',
    permissions: ['camera', 'microphone'],
    tab: { id: 1 }, timer: {}, callback: (v) => cb.push(v),
  });
  const r = vm.runInContext("settleBrowserPermissionRequest('r2', false, 'block')", ctx);
  assert.strictEqual(r.ok, true);
  assert.strictEqual(r.allowed, false);
  assert.strictEqual(r.persisted, true);
  assert.deepStrictEqual(cb, [false]);
  // media bileşenleri ayrı ayrı persist edilir
  assert.deepStrictEqual(writes, [
    ['https://cam.x', 'camera', 'block'],
    ['https://cam.x', 'microphone', 'block'],
  ]);
  // denied olayı yayınlandı
  assert.strictEqual(events.length, 1);
  assert.strictEqual(events[0].type, 'permission-denied');
  assert.strictEqual(events[0].permission, 'media');
  assert.match(events[0].message, /cam\.x.*etiket\(media\)/);
}

function t_callback_throw_safe() {
  const { ctx } = makeCtx();
  evalSettle(ctx);
  ctx.browserPermissionRequests.set('r3', {
    id: 'r3', permission: 'p', origin: 'o', host: 'h', tab: {},
    timer: {}, callback: () => { throw new Error('cb patladı'); },
  });
  const r = vm.runInContext("settleBrowserPermissionRequest('r3', true)", ctx);
  assert.strictEqual(r.ok, true, 'callback hatası yutulmalı');
}

function main() {
  t_unknown_id();
  t_allow_no_persist();
  t_deny_persist_media();
  t_callback_throw_safe();
  console.log('permission-settle-deadzone: 4 senaryo geçti');
}

main();
