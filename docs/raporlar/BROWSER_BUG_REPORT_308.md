# BROWSER_BUG_REPORT_308 — R409: tests/ derin okuma wave-2 (orta-boy dosyalar)

**Tarih:** 2026-10-01 · **Kapsam:** tests/ içindeki sonraki en büyük 10 test dosyası (~4.650 satır): gauntlet/medya/IPC/crash/soak/manga/queue/supply-chain ailesi
**Sonuç:** **Sıfır doğrulanmış kusur** — dalga-1 (8 büyük dosya, ~7.790 satır, R408) + dalga-2 toplam ~12.400 satır test kodu satır-satır doğrulandı.

## Dalga-2 dosyaları ve kanıt kalitesi

| Dosya | Satır | Yapı | Bulgu |
|---|---|---|---|
| `browser-subtitle-gauntlet.test.js` | 532 | Gerçek HTTP fixture sunucusu üzerinden üretim parser/merge/completeness/scheduler yolları; BYTERANGE/SKIP/GAP/discontinuity/304/reused-URL/CEA varyant matrisi + scheduler reconcile maliyet sayımı + data:-src regresyonu | Temiz |
| `browser-media-controller.test.js` | 483 | Üretilen probe/command scriptleri vm'de sahte-DOM üzerinde koşturulur; docToken staleness, rate-fightback yarışı, shadow-root observer geri alımı, filtre koruma, ad-skip ses geri yükleme | Temiz |
| `adversarial-ipc.test.js` | 451 | 90+ `ipcMain.handle` × 3 yetkisiz gönderici (yabancı pencere/alt frame/null) yan-etkisiz reddedilir; gerçek fs üzerinde yetki/ADS/boyut/backup kilitleri; ngunguarded-handler ratchet'i | Temiz |
| `crash-integrity.test.js` | 449 | `failingFs` sarmalayıcı ile 9 deponun her yazma aşamasına EIO enjeksiyonu (writeFile/rename/copyFile/append); tmp kalıntısı-sayımı + .bak kurtarma + nesil karışması | Temiz |
| `browser-config-deadzone.test.js` | 446 | ~30 dilimlenmiş main.js yardımcısı (yol getter'ları, singleton'lar, config/snapshot/sınır yardımcıları, streamKey/CEA anahtarı) gerçek vm-context'te | Temiz |
| `soak-deadzone.test.js` | 445 | resource-soak ailesi + CEA tam-yakalama başlatma/hazırlık akışları; nested-closure envanteri dürüstçe belgelenmiş | Temiz |
| `browser-manga.test.js` | 445 | Saf export birim testleri (normalize/sample/URL-mime/cacheKey) + üretilen overlay scripti `new vm.Script` derlemesi + important/CSS/halka-ratchet'leri + R51 regresyon serisi | Temiz |
| `queue-ordering-invariants.test.js` | 443 | Gerçek renderer + renderer-helpers gövdeleri dilimlenerek FIFO/dedupe/retry/limit/restore invariant'ları + 300-mutasyon mulberry32 fuzz | Temiz |
| `ipc-payload-fuzz.test.js` | 430 | Her kanal proxy-global vm realm'de; 37 hostile payload × arg konumu; tehlike-sink allowlist'i gerekçeli; prototype-pollution host+vm realm çift denetimi | Temiz |
| `install-supply-chain.test.js` | 429 | FakeDriver+RealDriver üzerinde tüm InstallError kodları + lock yaşam döngüsü + rollback matrisleri + unicode/boşluklu yol + .bat↔orchestratör sözleşmesi | Temiz |

## Ortak gözlem

Tüm dosyalar "gerçek kodu sür" yaklaşımında: kaynak-desen ratchet'leri yalnız üretilen scriptlerin sözleşmesi ve üretim `.bat` satırları gibi metin seviyesinde tanımlanmış kalıplarda kullanılmış (meşru); davranış iddialarının tamamı vm-context/fs-fault-injection/seeded-fuzz ile kanıtlanıyor.

## Kalan yüzey

~380 küçük test dosyası (çoğu <300 satır, kendi batch'lerinde yazılıp yeşillenen). Envanter artık hacim-üst-18'i kapsıyor; küçük dosyaların kalan bölümü düşük öncelik.
