/* Oynatıcı döngü/tekrar/otomatik durma ÖNCELİĞİ ve sahiplik kuralları (saf).  UYGULAMA_PLANI T07 + §8.5.
   Öncelik: açık kullanıcı komutu > A–B > seçili N tekrar/shadowing > cue sonu durma > boşluk politikası.
   Aynı tick'te iki komut üretilmez. Tampon beklemesi cue sonu sayılmaz; sayaç yalnız teyitli seek ile ilerler. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.PlayerLoopPolicy = api;
})(globalThis, () => {
  'use strict';

  const MIN_AB_SECONDS = 0.25;           // dahil
  const PRIORITY = Object.freeze(['user-command', 'ab-loop', 'repeat', 'cue-end-pause', 'gap-policy']);
  const END_EPS = 0.05;
  const isNum = (v) => typeof v === 'number' && Number.isFinite(v);

  function validateAbRange(a, b, duration) {
    if (!isNum(a) || !isNum(b) || a < 0 || b < 0) return false;
    if (b - a < MIN_AB_SECONDS) return false;
    if (isNum(duration) && duration > 0 && b > duration) return false;
    return true;
  }

  /**
   * Tek tick için TEK eylem. Girdi:
   *  userCommand: bool (kullanıcı bu tick'te komut verdi → politika sessiz)
   *  ab: {a,b}|null · repeat: {cueId,heard,total}|null (total=toplam dinleme, N=3 → iki geri seek)
   *  cue: {id,start,end}|null (medya zamanında) · autoPause: bool · buffering/pendingSeek: bool
   */
  function nextLoopAction({ time, userCommand = false, ab = null, repeat = null, cue = null, autoPause = false, buffering = false, pendingSeek = false }) {
    if (userCommand) return { type: 'none', reason: 'user-command' };
    if (buffering) return { type: 'none', reason: 'buffering' };
    if (pendingSeek) return { type: 'none', reason: 'seek-pending' };
    if (ab && isNum(ab.a) && isNum(ab.b)) {
      if (time < ab.a - 0.5 || time > ab.b + 0.5) return { type: 'clear-ab', reason: 'user-seek-outside' };
      if (time >= ab.b - END_EPS) return { type: 'seek', to: ab.a, reason: 'ab-loop', countOnConfirm: false };
      return { type: 'none', reason: 'ab-active' }; // A–B aktifken cue sayacı ilerlemez
    }
    const atEnd = !!cue && time >= cue.end - END_EPS && time < cue.end + 0.5;
    if (repeat && cue && repeat.cueId === cue.id && atEnd && repeat.heard < repeat.total) {
      return { type: 'seek', to: cue.start, reason: 'repeat', countOnConfirm: true };
    }
    if (autoPause && atEnd) return { type: 'pause', reason: 'cue-end' };
    return { type: 'none', reason: 'idle' };
  }

  /** Sayaç yalnız seek gerçekten beklenen aralığa geçtiğinde ilerler; başarısız seek sayılmaz. */
  function confirmRepeatSeek({ repeat, cue, time, tolerance = 0.5 }) {
    if (!repeat || !cue || repeat.cueId !== cue.id) return repeat;
    if (time >= cue.start - 0.05 && time <= cue.start + tolerance) return { ...repeat, heard: repeat.heard + 1 };
    return repeat;
  }
  function startRepeat(cueId, total) {
    const n = [2, 3, 5, 10].includes(total) ? total : 3;
    return { cueId, heard: 1, total: n }; // ilk dinleme oynuyor/oynadı sayılır
  }

  /**
   * Hover/odak ile geçici duraklatma sahipliği (varsayılan kapalı seçenek).
   * Yalnız oynayan oturumda jeton alır; kullanıcı pause/seek/kaynak/politika değiştirirse jeton iptal olur;
   * çıkış, jeton hâlâ bizdeyse ve engel yoksa devam ettirir. Birden çok katman referans sayısıyla kapanır.
   */
  function createHoverPauseOwner({ enabled = () => false, isPlaying, pause, play, canResume = () => true }) {
    const layers = new Set();
    let token = null;
    return {
      enter(layer) {
        layers.add(String(layer));
        if (!token && enabled() && isPlaying()) { pause(); token = { id: Symbol('hover') }; }
      },
      leave(layer) {
        layers.delete(String(layer));
        if (layers.size === 0 && token) {
          const owned = token; token = null;
          if (owned && canResume()) play();
        }
      },
      userIntervened() { token = null; },   // kullanıcı pause/seek/politika: otomatik resume yok
      sourceChanged() { token = null; layers.clear(); },
      get layerCount() { return layers.size; },
      get owns() { return !!token; },
    };
  }

  return Object.freeze({ MIN_AB_SECONDS, PRIORITY, validateAbRange, nextLoopAction, confirmRepeatSeek, startRepeat, createHoverPauseOwner });
});
