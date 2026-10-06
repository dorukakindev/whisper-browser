'use strict';
// Canlı Whisper gerçek zaman izleyicisi (2026-10 browser denetimi).
//
// live_asr.py her parça için chunk_done.rtf = işlem süresi / ses süresi
// raporlar. RTF sürekli 1.0'ın üzerindeyse gecikme sınırsız büyür: kuyruk
// 8 parçaya dolar ve ancak o zaman "kuyruk doldu" hatası görülürdü — kullanıcı
// altyazının neden giderek geride kaldığını bilmiyordu. İzleyici art arda yavaş
// parçaları sayar ve TEK bir uyarı üretir; tempo düzelince bir kez "yetişti"
// der. Tek bir yavaş parça (model ısınması, disk gecikmesi) uyarı üretmez.
//
// Ayrıca süzgece takılan halüsinasyon sayısını biriktirir; ilk kez ve sonra
// her 10 parçada bir özet verir (günlük taşmasın).

const MODEL_HINTS = {
  'large-v3': 'large-v3-turbo veya medium',
  'large-v2': 'large-v3-turbo veya medium',
  'large-v3-turbo': 'medium veya small',
  medium: 'small',
  small: 'base',
  base: 'tiny',
};

function createLiveAsrRealtimeMonitor(options = {}) {
  const slowThreshold = Number(options.slowThreshold) > 0 ? Number(options.slowThreshold) : 1.0;
  const recoverThreshold = Number(options.recoverThreshold) > 0 ? Number(options.recoverThreshold) : 0.8;
  const slowStreakNeeded = Math.max(1, Math.trunc(Number(options.slowStreak) || 3));
  const model = String(options.model || '');
  const state = { slowStreak: 0, warned: false, chunks: 0, skipped: 0, skippedReported: 0, lastRtf: null };

  function observe(event) {
    if (!event || typeof event !== 'object') return null;
    state.chunks += 1;
    const skipped = Math.max(0, Math.trunc(Number(event.skipped) || 0));
    state.skipped += skipped;
    const rtf = Number(event.rtf);
    const audio = Number(event.audio_seconds);
    // Çok kısa parçada (<1 sn) sabit model ek yükü oranı şişirir; karar verme.
    if (Number.isFinite(rtf) && rtf >= 0 && (!Number.isFinite(audio) || audio >= 1)) {
      state.lastRtf = rtf;
      if (rtf > slowThreshold) {
        state.slowStreak += 1;
        if (!state.warned && state.slowStreak >= slowStreakNeeded) {
          state.warned = true;
          const hint = MODEL_HINTS[model];
          return {
            level: 'warn',
            message: `Model gerçek zamandan yavaş (RTF ${rtf.toFixed(2)}); canlı altyazı giderek geride kalacak.`
              + (hint ? ` Daha hızlı bir model deneyin: ${hint}.` : ' Daha küçük bir model seçin.'),
          };
        }
      } else if (rtf <= recoverThreshold) {
        state.slowStreak = 0;
        if (state.warned) {
          state.warned = false;
          return { level: 'info', message: `Canlı Whisper yeniden gerçek zamana yetişti (RTF ${rtf.toFixed(2)}).` };
        }
      }
    }
    if (state.skipped > state.skippedReported
        && (state.skippedReported === 0 || state.chunks % 10 === 0)) {
      const fresh = state.skipped - state.skippedReported;
      state.skippedReported = state.skipped;
      return { level: 'info', message: `Halüsinasyon süzgeci ${fresh} şüpheli satırı (ör. "Altyazı M.K.") canlı altyazıya almadı.` };
    }
    return null;
  }

  return { observe, snapshot: () => ({ ...state }) };
}

module.exports = { createLiveAsrRealtimeMonitor };
