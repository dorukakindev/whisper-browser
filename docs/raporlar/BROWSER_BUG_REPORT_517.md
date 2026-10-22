# 517 — Rapor515/516 doğrulaması ve üç ürün onarımı

2026-10-22, taban `1371bc9316cc134a40084b416f49073d34103e49`.

## Gerçek hatalar

- **B515-01:** Yerel oynatıcıda dublaj eklendikten sonraki ilk telemetri eksikliği özgün sesi geri açıyordu. `tests/player-dub-ui.test.js:37` önce `false !== true` ile başarısızdı. `browser-dub-audio.js` artık yalnız yerel, tam değiştirme oturumunda bu dalda mute'u koruyor. Browser reklam/buffering/bayat telemetri fallback'i ve aralıklı/senkron/arka planlı oturumlar korunuyor. Rapor516'daki altı browser kapısı topluca bug kabul edilmedi: bazıları bilinçli fallback davranışını yanlış beklentiyle sınıflandırıyor.
- **B515-03:** Bütün satırları geçerli olma şartı tek bozuk satırda sağlam notları görünmez yapıyordu. `report480-regressions` 480-01 önce `0 !== 1` ile başarısızdı. Sağlam ana belge, ardından sağlam yedek öncelikli; ikisi de sağlam değilse kimliği ve medya kimliği geçerli satırlar kurtarılıyor. Tamamen bozuk belgeye yazma engeli sürüyor; kimlik uydurulmuyor. Yükleme tek başına bozuk dosyaya yazmıyor.
- **B515-02:** Aynı kaynak bölümün yalnız hedef metni değiştiğinde içerik hash'i yeni arşiv kimliği üretiyordu. Kısmi kayıt kimliği artık kaynak satırlarından hesaplanıyor; hedef revizyonları aynı kaydı yeniliyor, farklı kaynak seçimleri ve tam sayfa ayrı kalıyor. Atomik indeks güncellemesinden sonra indeksten çıkan/superseded dosyalar, yalnız izinli arşiv klasörlerinde ve başka kayıt tarafından kullanılmıyorsa siliniyor. Önceden birikmiş indekssiz dosyalara toplu tarama/silme uygulanmadı.

## Doğrulama

Windows Node üzerinde geçti:

- `node tests/player-dub-ui.test.js`
- `node tests/browser-dub-audio.test.js`
- `node tests/report480-regressions.test.js` (10)
- `node tests/browser-note-store.test.js` (11)
- `node tests/report496-regressions.test.js` (17, sağlam yedek tercih testi dahil)
- `node tests/report-25-28-regressions.test.js`
- `node tests/browser-translation-archive.test.js`
- `node tests/report517-regressions.test.js` (3; not kurtarma+yeniden yükleme, ayrı seçim/tam sayfa koruması, indeks taşması ve kök dışı dosya korunumu)
- Değişen üç ürün JS dosyasında `node --check`, `git diff --check`.

## Sınırlar

Gerçek Electron penceresi, `start.bat`, YouTube, GPU, DRM ve model çağrısı yapılmadı. UI yerleşimi değişmedi; jsdom oynatıcı davranışı gerçek cihaz doğrulaması değildir. Yeni bağımlılık yok. Gece denetimi paketinin `exit(0)` davranışı ürün hatası değildir; kullanıcıya ait commitlenmemiş pakete dokunulmadı. Sayısal 1395 senaryonun tamamı yeniden koşulmadı. CI arka planda, sonucu beklenmiyor.
