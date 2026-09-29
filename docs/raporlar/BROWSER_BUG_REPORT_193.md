# BROWSER_BUG_REPORT_193 — Kullanıcı tur-3 UI paketi (site bazlı reklam koruması + yeni sekme sayfası + 19 oynatıcı/PDF/kuyruk düzeltmesi)

- Tarih: 2026-09-29
- Dal: `fix/browser-ui-round3` (taban `b85c3f9`)
- Kaynak: kullanıcının `whisper-browser-ui-round3.zip` paketi — `patches/0003` + `patches/0004`, `git am -3` ile uygulandı (tur 1–2 zaten #160/#165 ile master'da).
- Paket raporu: `BULGULAR.md` (19 doğrulanmış bug + sağlam bulunan alanlar); bu rapor teslim ve doğrulama kanıtıdır.

## Uygulanan commit'ler

1. `1e15445` feat(browser-ui): site bazlı reklam koruması, yeni sekme sayfası, regresyon testleri
2. `392e123` fix(player,pdf,settings): oynatıcı, PDF okuyucu, kuyruk ve ayarlar (19 düzeltme)
3. `26eb976` test(r3): paket testlerine oturum-uyarlama düzeltmeleri (aşağıda)

## Paket içeriği (özet)

- **Site bazlı reklam koruması** (önceki turda karar bekliyordu — kullanıcı pakette çözdü): site çipi düğmesi artık `siteOverrides`/`updateBrowserSiteProfile` üzerinden yalnız o siteyi etkiliyor; kapatma `adblockEnabled:false`, açma alanı silip geneli devralma. Genel kapalıysa/boş sekmede düğme genel anahtar (etiket değişir). Sekme-bazlı geçersiz kılma varsa kaldırılır; değişiklik sonrası sayfa yenilenir.
- **Yeni sekme sayfası:** hızlı erişim 4 sütunlu kutucuk ızgarası (favicon/alan-adı avatarı), sıralama = yer imleri + frecency geçmişi (saf `BrowserAddressModel.ntpQuickTiles`), × ile gizle + "geri getir" bağlantısı; "İzlemeye devam et" izleme kütüphanesinden ilerleme çubuklu kartlar (`ntpContinueItems`); açık tema token'ları; IME Enter koruması.
- **Oynatıcı (8):** basılı-tutma 2×/boşluk-hızlandırmanın kayda yazmaması, diyalog altında Backspace, K çift-kayıt (reentrancy kilidi), tam-ekran/PiP çıkışı, up-next geri sayımının mod değişiminde iptali, kapanışta düzenleyici/A-B temizliği, bul/değiştir Esc zinciri, kütüphane tıklama yarışı.
- **PDF okuyucu (7):** tarayıcı modunda boş alan, Space/ok/Esc klavye çakışması, çift çeviri kilidi, sayfa sıralı ekleme + zoom sonrası geri kaydırma + çizilmemiş sayfaya atlama, ikinci PDF'te bellek/durum sızıntısı, zoom etiketi sıfırlanması.
- **Kuyruk/ayarlar (4):** iş sürerken yalnız iş seçenekleri kilitlenir (ses/dil/tema/tarayıcı ayarları serbest), özel hız (1.3×) kalıcılığı (enum yerine 0.25–4 aralığı), "Sırada dur" düğme yaşam döngüsü, ayar aramasının doğru çekmeceyi açması, EN'de kalan TR dizgiler.

## Oturumda yapılan test uyarlamaları (paket testi hatası — ürün bug'ı değil)

TESTS-FOR-DEVIN'in izniyle, ürün davranışı doğruyken kırmızı kalan 3 nokta düzeltildi:

1. `tests/browser-ui-regressions-r3.test.js`
   - vm realm'inden dönen diziler `deepStrictEqual`'da prototype farkıyla reddediliyordu → `[...arr]` ile Node realm'ine taşındı (4 satır).
   - Kilitlenmeyen kontroller `syncProcessingControlState`'e hiç sorgulanmadığı için stub oluşmuyordu → `!controls[id]?.disabled` ("dokunulmamış" da doğru sonuç).
2. `tests/audit-tur5.test.js` — `closePlayer`'ın yeni `document.fullscreenElement`/`pictureInPictureElement` çıkış yolu seyrek ctx'te patlıyordu → `document` stub'ı + `classList.remove/toggle` eklendi.
3. `tests/browser-adblock.test.js` — site bazlı mantıkta ortak `control.checked`/`change` yolu artık `toggleBrowserAdblockForSite` gövdesinde; dilim başlangıcı güncellendi.

## Doğrulama kanıtı

- `node --check`: main.js, browser-page-find.js, browser-address-model.js, settings-security.js, renderer.js, renderer-helpers.js, ui-locale.js — temiz.
- `node tests/browser-ui-regressions-r3.test.js` tek başına: **12/12** (paket 11 yazmıştı; dosyada 12 test var).
- **Kırmızı kanıtı:** helpers `bc4ba08~1` (palet düzeltmesi öncesi) ile aynı test → palet + sekme-sırası + sözleşme testleri FAIL (9 geçti); dal sürümüyle 12/12 — kilit gerçekten çalışıyor.
- `npm test` tam paket: ilk koşuda 2 dosya düştü (audit-tur5 document stub, browser-adblock dilim) → ikisi de bu turda düzeltildi, dosyalar tek tek yeşil.
- `npm run audit:ui -- --strict --browser .../google-chrome`: 44 senaryo (dark/light × tr/en × 1400/1100/900px), **0 kontrast hatası**.
- `tests/css-hardcoded-colors` baseline `436` — paketin düşürdüğü sınır testten geçti (npm test içinde).

## Koşulmayan / doğrulanamayan

- `npm run test:electron` ve `test:electron-bridge`: bu başsız kutuda Electron `exit 9` — TESTS-FOR-DEVIN §3 ve §4'teki 28 adımlık elle doğrulama listesi **Windows'ta** koşulmalı (start.bat ile). Kritik maddeler: site-bazlı reklam koruması akışı (1–6), NTP kutucuk/gizle/IME (7–11), oynatıcı hız/kayıt/tam-ekran (12–19), PDF klavye/sayfa belleği (20–24), kuyruk kilidi + "Sırada dur" + ayar araması + EN dizgiler (25–28).
- Electron smoke'lar başsızlıkta koşulamadı; jsdom'da `offsetParent` kısıtı nedeniyle details-menü ok gezintisi birim testte değil Electron smoke'unda doğrulanır (önceki tur notu).

## Windows etkisi

Site profili `siteOverrides` ana süreçte `isSitePaused` mekanizmasıyla zaten okunuyordu — platform bağımsız. Yeni sekme sayfası/oynatıcı/PDF düzeltmeleri renderer katmanında. PDF bellek davranışı (ikinci PDF'te eski dokümanın bırakılması) Windows'ta görev yöneticisiyle doğrulanmalı. `.bat` akışı etkilenmiyor.

## Bilinen açık işler (paketin listelediği — uygulanmadı)

- Sekme önizleme kartının sayfa üstünde kırpması — tasarım turu bekliyor.
- Ctrl+F tek köprü — bu oturumda **zaten çözüldü** (R233/#167): paketin "hâlâ açık" notu eskiydi.
- Avatar harfi alt alan adlı sitelerde (`tr.wikipedia.org` → "T") — istenirse alan adından alınır (küçük, kararsız).

## Dosyalar

- `src/renderer/renderer.js` (+~409), `src/browser-address-model.js` (+47), `src/renderer/index.html`, `src/renderer/ui-locale.js` (+23), `src/settings-security.js`, `src/renderer/browser-chrome.css` (+40)
- `tests/browser-ui-regressions-r3.test.js` (yeni, +280) — oturumda 2 uyarlama düzeltmesi
- `tests/audit-tur5.test.js`, `tests/browser-adblock.test.js` — uyarlama
- `tests/fixtures/css-hardcoded-color-baseline.txt` (444 → 436)
