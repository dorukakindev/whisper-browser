# BROWSER_BUG_REPORT_318 — Çok noktalı senkron düzeltmesi (kuyruk-50/6)

Tarih: 2026-10-01 · Dal: devin/1790877700-translation-diff-review
(not: dal adı madde-5'ten kaldı; madde-6 işi aynı dalda — ayrı PR ayrıldı)

## Görev (kuyruk 50, madde 6)
"Kullanıcının videodan seçtiği birkaç eşleşme noktasından ofset ve zamanla
değişen kaymayı hesapla. Kesilmiş veya reklam eklenmiş videolarda güven
düzeyini göster ve uygulamadan önce önizleme sun."

## Mevcut durum denetimi
Var: BrowserSubtitleSync modülü (scale+offset transform, 2-nokta fit,
normalizePoint/Transform kapıları, kayıt kalıcılığı), senkron paneli
(önizleme + dirty + kaydet/sıfırla). Eksik:
- **F-318-01:** En fazla 2 eşleşme noktası — kesilmiş/reklamlı videoda
  drift'i tek çift nokta yanıltıcı yakalar; ek nokta eklenemiyordu.
- **F-318-02:** Uyum kalitesi ölçülmüyordu — yalnız büyük-düzeltme sabit
  uyarısı; nokta uyuşmazlığı veya sapan nokta görünmüyordu.

## Düzeltme
- `calculateMultiPointTransform`: N>=2 noktada least-squares scale+offset;
  residual RMS + maksimum sapma; outlier leave-one-out (tek fit'in RMS'i
  outlier'ı gizleyemez, LOO her noktayı kalanlarla yeniden fit eder);
  düzey exact/high/medium/low; sıkışık-açıklık ve <2 nokta reddi.
- Kayıt şeması points 2→MAX_POINTS=8 (eski 2-noktalı kayıtlar uyumlu).
- renderer: `refitBrowserSyncPoints` ortak fit+uyarı; "Nokta ekle" düğmesi
  (aynı cue tekrar eşleşince güncelleme, kopya üretmez); nokta listesi
  ×-silme; güven satırı (düzey + ortalama sapma + "N. nokta sapıyor");
  düşük güven ve büyük düzeltme uyarıları.

## Kanıt
- `node tests/browser-subtitle-sync.test.js` → PASS (yeni: 3-nokta fit,
  outlier LOO, exact seviye, <2/sıkışık ret, kesinti→düşük güven, 8 nokta
  kayıt sınırı)
- `node tests/browser-subtitle-sync-renderer.test.js` → PASS (3. nokta
  ekleme + refit + güven satırı + outlier işareti + silme + aynı-cue
  güncelleme; DOM stub'ı textContent-children tutarlılığıyla güçlendi)
- `node tests/browser-subtitle-export.test.js` + `browser-subtitle-relocation.test.js` + `player-time-transform.test.js` → PASS

## Windows etkisi
Saf JS/DOM — platform bağımsız; Electron görsel turu el-kontrol listesine.
