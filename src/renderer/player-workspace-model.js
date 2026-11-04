/* Oynatıcı çalışma alanı köprüsü: salt okunur snapshot + kimlik denetimli TEK komut geçidi.
   İkinci oynatma/ses motoru değildir; komutlar yalnız mevcut renderer işlevlerine (deps.executeExisting) gider.
   Sözleşme: player-workspace.d.ts, UYGULAMA_PLANI §8.1 ve §8.5. Zaman saniyedir. */
(function (root, factory) {
  const api = factory(typeof require === 'function' && typeof module === 'object' ? require('../player-loop-policy.js') : root.PlayerLoopPolicy);
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayerWorkspaceModel = api;
})(globalThis, (LoopPolicy) => {
  'use strict';

  const MIN_AB_SECONDS = LoopPolicy.MIN_AB_SECONDS; // dahil: B-A >= 0.25 kabul (tek sahip: player-loop-policy.js)
  const RATE_MIN = 0.25; const RATE_MAX = 4;
  const OFFSET_LIMIT_SECONDS = 600;
  const TIME_NOTIFY_STEP = 0.25;    // sürekli currentTime her karede yayılmaz
  const TRACK_BOUND = new Set(['seekCue', 'previousCue', 'nextCue', 'replay']);
  const SEEKING = new Set(['seekCue', 'previousCue', 'nextCue', 'replay', 'seek', 'setAB']);

  const fail = (code, message) => ({ ok: false, code, message });
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);
  const sameOwner = (a, b) => !!a && !!b && a.mediaKey === b.mediaKey && a.generation === b.generation;
  const supported = (cap) => !cap || cap.support !== 'no';

  const validateAbRange = LoopPolicy.validateAbRange;

  function createPlayerWorkspaceBridge(deps) {
    if (!deps || typeof deps.readSnapshot !== 'function' || typeof deps.executeExisting !== 'function') {
      throw new TypeError('createPlayerWorkspaceBridge: readSnapshot ve executeExisting gerekli');
    }
    let disposed = false;
    const unsubs = new Set();
    const listeners = new Set();

    const snapshot = () => {
      const s = deps.readSnapshot();
      return s ? Object.freeze({ ...s }) : null;
    };

    function trackMatches(snap, command) {
      // Satırdan gelen komutlar kaynak rolü izine bağlıdır; ofset komutu iki izden birine.
      if (command.type === 'setTrackOffset') {
        const t = [snap.sourceTrack, snap.secondaryTrack].find((x) => x && x.id === command.trackId);
        return !!t && t.revision === command.revision;
      }
      const role = typeof deps.resolveSourceRole === 'function' ? deps.resolveSourceRole() : null;
      return !!role && role.trackId === command.trackId && role.trackRevision === command.trackRevision;
    }

    async function dispatch(command) {
      if (disposed) return fail('stale-source', 'Köprü kapatıldı.');
      if (!command || typeof command.type !== 'string') return fail('unsupported', 'Geçersiz komut.');
      const snap = snapshot();
      if (!snap) return fail('stale-source', 'Etkin oynatıcı kaynağı yok.');
      if (!sameOwner(snap, command)) return fail('stale-source', 'Komut başka bir medyaya/oturum nesline ait.');

      if (SEEKING.has(command.type) && !supported(snap.capabilities && snap.capabilities.seek)) {
        return fail('unsupported', 'Bu kaynakta konum değiştirme desteklenmiyor.');
      }
      if (TRACK_BOUND.has(command.type) || command.type === 'setTrackOffset') {
        if (!trackMatches(snap, command)) return fail('stale-track', 'Altyazı izi veya revizyonu değişti.');
      }
      if (command.type === 'seekCue') {
        const role = deps.resolveSourceRole();
        if (!role || !role.cues.some((c) => c.id === command.cueId)) return fail('unknown-cue', 'Satır bulunamadı.');
      }
      if (command.type === 'seek' && (!isNum(command.time) || command.time < 0
        || (isNum(snap.duration) && command.time > snap.duration))) return fail('invalid-range', 'Geçersiz zaman.');
      if (command.type === 'setAB' && !validateAbRange(command.a, command.b, snap.duration)) {
        return fail('invalid-range', `A–B aralığı en az ${MIN_AB_SECONDS} sn olmalı ve medya içinde kalmalı.`);
      }
      if (command.type === 'setRate' && !(isNum(command.rate) && command.rate >= RATE_MIN && command.rate <= RATE_MAX)) {
        return fail('invalid-range', 'Hız aralık dışı.');
      }
      if (command.type === 'setTrackOffset' && !(isNum(command.offsetSeconds) && Math.abs(command.offsetSeconds) <= OFFSET_LIMIT_SECONDS)) {
        return fail('invalid-range', 'Ofset aralık dışı.');
      }

      let result;
      try { result = await deps.executeExisting(command); } catch (error) {
        return fail('engine-error', String((error && error.message) || error));
      }
      // Geç cevap: kaynak/nesil bu arada değiştiyse sonuç uygulanmış sayılmaz.
      const after = snapshot();
      if (disposed || !sameOwner(after, command)) return fail('stale-source', 'Cevap geldiğinde kaynak değişmişti.');
      if (!result || typeof result.ok !== 'boolean') return fail('engine-error', 'Motor geçersiz sonuç döndürdü.');
      if (!result.ok) return result;
      // applied:true = mevcut motor yolunda kabul; hedefe varıldığı iddiası değildir.
      return { ok: true, applied: true, owner: { mediaKey: command.mediaKey, generation: command.generation } };
    }

    function subscribe(listener) {
      if (typeof listener !== 'function') throw new TypeError('listener fonksiyon olmalı');
      listeners.add(listener);
      let last = null;
      const fingerprint = (s) => (s ? [s.mediaKey, s.generation, s.state, s.paused, s.rate, s.activeCueId,
        s.sourceTrack && s.sourceTrack.revision, s.secondaryTrack && s.secondaryTrack.revision, s.engine].join('|') : 'null');
      const emit = () => {
        if (disposed || !listeners.has(listener)) return;
        const s = snapshot();
        const fp = fingerprint(s);
        const movedEnough = !last || !s || last.time === undefined || Math.abs(num0(s.time) - last.time) >= TIME_NOTIFY_STEP;
        if (last && last.fp === fp && !movedEnough) return;
        last = { fp, time: s ? num0(s.time) : 0 };
        listener(s);
      };
      const off = typeof deps.subscribeExisting === 'function' ? deps.subscribeExisting(emit) : () => {};
      const unsubscribe = () => { listeners.delete(listener); unsubs.delete(unsubscribe); try { off(); } catch (_) { /* yok say */ } };
      unsubs.add(unsubscribe);
      return unsubscribe;
    }
    const num0 = (v) => (isNum(v) ? v : 0);

    function dispose() {
      disposed = true;
      Array.from(unsubs).forEach((u) => u());
      listeners.clear();
    }

    return Object.freeze({ getSnapshot: snapshot, dispatch, subscribe, dispose });
  }

  return Object.freeze({ createPlayerWorkspaceBridge, validateAbRange, MIN_AB_SECONDS, RATE_MIN, RATE_MAX });
});
