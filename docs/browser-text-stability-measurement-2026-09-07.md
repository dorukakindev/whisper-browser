# Browser metin stabilizasyonu ölçümü — 7 Eylül 2026

## Amaç ve kapsam

`5473cff` (`feat: stabilize browser subtitle publication`) değişikliğinin hemen öncesi ile
hemen sonrasını aynı yerel, sentetik WebVTT sayfasında karşılaştırmak. Ölçülen iki değer:

- gezinme başlangıcından ilk cue'nun oynatıcıda gerçekten yüklenebilir olmasına kadar süre;
- bu ana kadar browser `WebContents` üzerinde yapılan `executeJavaScript` ve
  `executeJavaScriptInIsolatedWorld` çağrıları.

Gerçek kullanıcı verisi, ağ servisi, GPU modeli veya dış site kullanılmadı. Her koşu benzersiz
geçici `userData` diziniyle ve yerel HTTP sunucusuyla yapıldı.

## Karşılaştırılan sürümler

| Durum | Commit |
|---|---|
| Önce | `55085c471bab` |
| Sonra | `5473cff202e8` |

Yeniden üretme aracı: `node benchmarks/browser-text-stability-electron-measure.js <worktree>`.
Araç browser `WebContents` oluşturulduktan sonra iki JavaScript yürütme metodunu sayaçla sarar,
yerel VTT sayfasına gider, bulunan izi yükler ve `player.cues.length > 0` olduğunda süreyi alır.

## Ham sonuçlar

| Sürüm | Koşu | İlk kullanılabilir cue (ms) | `executeJavaScript` | İzole dünya | Toplam |
|---|---:|---:|---:|---:|---:|
| Önce | 1 | 825 | 0 | 7 | 7 |
| Önce | 2 | 824 | 0 | 6 | 6 |
| Önce | 3 | 835 | 0 | 7 | 7 |
| Önce | 4 | 823 | 0 | 6 | 6 |
| Önce | 5 | 840 | 0 | 6 | 6 |
| Sonra | 1 | 966 | 0 | 6 | 6 |
| Sonra | 2 | 855 | 0 | 5 | 5 |
| Sonra | 3 | 824 | 0 | 7 | 7 |
| Sonra | 4 | 862 | 0 | 6 | 6 |
| Sonra | 5 | 855 | 0 | 6 | 6 |

Başarısız bir ek harness koşusu sekme kurulum yarışında sonuç üretmeden durdu; ölçüme dahil
edilmedi. Harness, mevcut Electron smoke testindeki güvenli ikinci `showBrowserWorkspace`
tetiklemesiyle düzeltildi ve sonraki üç koşu tamamlandı.

## Özet

| Metrik | Önce | Sonra | Fark |
|---|---:|---:|---:|
| İlk kullanılabilir cue, medyan | 825 ms | 855 ms | +30 ms (+%3,6) |
| İlk kullanılabilir cue, aralık | 823–840 ms | 824–966 ms | Sonra koşullarında daha değişken |
| Toplam JS çağrısı, medyan | 6 | 6 | 0 (%0) |
| Toplam JS çağrısı, ortalama | 6,4 | 6,0 | -0,4; küçük örneklem/timer fazı |

Bu beşer koşuluk örneklemde stabilizasyonun `executeJavaScript` sayısını düşürdüğüne dair kanıt
yoktur. İlk cue medyanı 30 ms artmıştır; ölçüm tüm edinme/yayın/IPC/dosya yükleme zincirini
içerdiği ve bir 966 ms aykırı koşu bulunduğu için bu fark doğrudan regresyon diye
yorumlanamaz. Ancak hız iyileşmesi de gösterilememiştir.

## `135,897 × F/dk` tabanının doğrulanması

Aktif tarayıcı sekmesindeki üç sabit yedek timer iki committe de aynıdır:

- iz taraması: 6500 ms;
- yakalama kuyruğu: 900 ms;
- medya durumu: 1000 ms.

Bir dakika ve `F` frame için nominal toplam:

`(60000 / 6500 + 60000 / 900 + 60000 / 1000) × F = 135,897 × F çağrı/dk`

`5473cff` bu timer aralıklarını değiştirmediği için sabit polling tabanı öncesi ve sonrasında
aynıdır. Stabilizasyon `storeBrowserTrack` yayın kararına eklenmiştir; polling katmanına değil.

## Hüküm

- Ölçüm maddesi tamamlandı; sonuç negatiftir: bu değişiklik için kanıtlanmış çağrı azalması yok.
- İlk kullanılabilir cue kabul edilebilir bir saniyenin altında kaldı, fakat öncesine göre hızlandı
  denemez.
- Stabilizasyonun doğruluk yararı ayrı testlerle korunabilir; performans yararı diye raporlanmamalı.
- Gerçek, uzun süreli değişken HLS/ASR yayınında yayın sayısı ve CPU profili ayrıca ölçülmeden
  üretim yükü azaldı iddiası kurulamaz.
