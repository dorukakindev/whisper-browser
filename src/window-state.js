'use strict';
/**
 * Pencere durumu kalıcılığı — saf yardımcılar.
 *
 * Tasarım: pozisyon kasıtlı saklanmaz/geri yüklenmez (ekran-dışı pencere
 * riski ve monitör-kopması senaryosu); yalnız boyut ve maximized bayrağı
 * tutulur. Kayıtlı boyut birincil ekran çalışma alanına kelepçelenir —
 * bozuk/devasa window-state.json hiçbir zaman ekran-dışı pencere üretmez.
 */

const MIN_WIDTH = 940;
const MIN_HEIGHT = 680;
const DEFAULT_WIDTH = 1180;
const DEFAULT_HEIGHT = 820;

/**
 * Kayıtlı durumu geçerli pencere boyutuna kelepçeler.
 * @param {object|null} st window-state.json'dan okunan değer (her tip olabilir)
 * @param {{width:number, height:number}} work birincil ekran workAreaSize
 * @returns {{width:number, height:number}}
 */
function clampedWindowSize(st, work) {
  const workW = Math.max(1, Math.floor(Number(work && work.width) || 0));
  const workH = Math.max(1, Math.floor(Number(work && work.height) || 0));
  const savedW = st && typeof st === 'object' ? Number(st.width) : NaN;
  const savedH = st && typeof st === 'object' ? Number(st.height) : NaN;
  return {
    width: Number.isFinite(savedW) && savedW >= MIN_WIDTH
      ? Math.min(Math.floor(savedW), workW)
      : Math.min(DEFAULT_WIDTH, workW),
    height: Number.isFinite(savedH) && savedH >= MIN_HEIGHT
      ? Math.min(Math.floor(savedH), workH)
      : Math.min(DEFAULT_HEIGHT, workH),
  };
}

/** window-state.json'a yazılacak güvenli nesneyi üretir. */
function windowStateForDisk(bounds, maximized) {
  const w = Number(bounds && bounds.width);
  const h = Number(bounds && bounds.height);
  return {
    width: Number.isFinite(w) && w > 0 ? Math.floor(w) : DEFAULT_WIDTH,
    height: Number.isFinite(h) && h > 0 ? Math.floor(h) : DEFAULT_HEIGHT,
    maximized: Boolean(maximized),
  };
}

module.exports = {
  MIN_WIDTH, MIN_HEIGHT, DEFAULT_WIDTH, DEFAULT_HEIGHT,
  clampedWindowSize, windowStateForDisk,
};
