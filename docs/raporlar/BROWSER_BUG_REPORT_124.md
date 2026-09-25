# BROWSER_BUG_REPORT_124 — R123 planı Adım 1 (dinamik metin İngilizcesi)

Tarih: 2026-09-25. Dal: `codex/r124-step1-i18n-1790347020`. Başlangıç: `b6c8fdf`; bitiş kod commit'i: `4319cb3`.
Kapsam: [BROWSER_PLAN_R123.md](BROWSER_PLAN_R123.md) §5 Adım 1 — 1.2 dinamik mesaj EN'i, 1.3 "Altyazı · N" çipi EN, 1.4 belge 401/403 metin genelleştirme. Adım 1.1 (sayfada bul "Aranıyor…" asılması) yalnız Windows'ta elle doğrulanabilir — sınır notu aşağıda.

## R124-01 — Main→renderer dinamik hata metinleri yalnız Türkçeydi

- **Kaynak:** `src/main.js` `browserLoadErrorMessage`, `browserCertificateErrorMessage`, `maybeFlagEmptyHttpErrorPage`, did-fail-load, load-retry, tab-crashed yolları ve `src/browser-lifecycle-policy.js` çökme politikası metinleri.
- **Etki:** EN locale'de hata ekranı gövdesi ("Site sunucusu HTTP 502 hatası verdi…" vb.) Türkçe kalıyordu; başlık/kicker sözlükten çevrilirken parametrik gövde çevrilemiyordu.
- **Düzeltme:** Plan §1.2'nin önerdiği sözleşme uygulandı — main artık her hatada `messageKey` (+ `params`) taşır; TR metin fallback olarak kalır. Renderer `BROWSER_ERROR_EN` şablonları EN locale'de metni anahtardan üretir (`browserErrorText`). Kapsanan anahtarlar: `address-not-found`, `internet-offline`, `site-timeout`, `network-access-denied`, `quic-error`, `connection-refused`, `insecure-response`, `http-empty-server`, `http-empty-client`, `certificate-error`, `crash-memory`, `crash-recoverable`, `crash-manual`, `load-retry`. Bilinmeyen/ham mesajlar (`generic`) olduğu gibi gösterilir.

## R124-02 — Teşhis kataloğu tek dildi

- **Kaynak:** `src/browser-playback-diagnostics.js` `DIAGNOSTIC_CATALOG` (27 girdi).
- **Düzeltme:** Her girdiye `labelEn`/`messageEn` eklendi; `makeDiagnostic` alanları kopyalar. Renderer `diagnosticField` locale'e göre seçer — sinyal satırı, teşhis paneli satırları, yetenek özeti (CDM/EME/codec/GPU parçaları, özet ve boş-ipucu metinleri) ve güven rozetleri (HIGH/MEDIUM/LOW) EN'de İngilizce görünür.

## R124-03 — 401/403 metni "Oynatma isteği" diye başlıyordu (belge bağlamında yanıltıcı)

- **Kaynak:** `authentication-required` ve `http-access-denied` katalog girdileri.
- **Düzeltme (plan §1.4):** Metinler `İstek HTTP 401/403 ile karşılandı…` olarak genelleştirildi; etiket `İstek reddedildi`. Sözleşme testi `authentication-required`/`http-access-denied` metninde "Oynatma isteği" öneki olmadığını doğrular. Kodlar (`authentication-required`, `http-access-denied`) ve sınıflama davranışı değişmedi.

## R124-04 — "Altyazı · N" araç çubuğu çipi Türkçeydi

- **Kaynak:** `updateBrowserSubtitleSummary` — etiket ve üç durum başlığı (`title`) doğrudan Türkçe.
- **Düzeltme (plan §1.3):** Etiket `UiLocale.t('Altyazı')` → "Subtitles"; sayaç korunur. Başlıklar EN'de `operation in progress; open details`, `open tracks and translation options`, `No subtitle track yet; open subtitle and translation settings`.

## Doğrulanamayan sınır (Windows gerekli)

- **Plan §1.1:** Sayfada bul "Aranıyor…" asılması Xvfb ortamında kök-nedenlenemedi; savunmacı düzeltme R123'te yapıldı. Windows'ta Ctrl+F ile elle doğrulanmalı — beklenen: sayaç kısa sürede `1 / N` gösterir.
- `notice` kanalındaki diğer parametrik TR mesajlar (ör. "En fazla N sekme açılabilir") bu adımın örnek kapsamı dışında; aynı `messageKey` kalıbıyla sonraki tura aday.

## Testler

- Yeni: `tests/browser-report124-regressions.test.js` — 7/7 (messageKey taşıma noktaları, EN şablon kapsamı, katalog iki dilliliği, 401/403 genel metni, locale seçimi, çip).
- Güncellenen sözleşmeler: `browser-report123` 6/6, `browser-playback-diagnostics` 18/18, `browser-navigation-abort`, `audit-tur5-main`, `browser-controls-behavior`, `browser-lifecycle-policy` — hepsi yeşil.
- `player-ui` 148/148, `ui-locale` 14/14, `browser-report120` 6/6, `electron-browser-chrome-design` Electron smoke temiz.
- `node --check` main/renderer/diagnostics/lifecycle temiz. Tam `npm test` koşulmadı (kullanıcı kuralı: yalnız değişen alanlar); CI koşuyor.

## Windows etkisi

- Davranış değişikliği yalnız metin katmanında; `install.bat`/`start.bat`, yollar, PowerShell, dosya seçici, GPU/CUDA etkilenmedi.
- EN metinlerde Türkçe karakter yok; TR metinler UTF-8 olarak korundu.
- Windows'ta elle görülmesi gereken tek madde: yukarıdaki sayfada-bul doğrulaması.
