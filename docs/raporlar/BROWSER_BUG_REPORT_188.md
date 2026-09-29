# BROWSER_BUG_REPORT_188 — R229: whisper-browser-ui-fix paketi uygulaması + doğrulaması

Tarih: 2026-09-29 · Dal: `fix/browser-menu-ui-polish` · Taban: `origin/master` (2ed7c86)

## Kapsam

Kullanıcının gönderdiği `whisper-browser-ui-fix.zip` paketi —
`patches/0001-fix-browser-ui-menu-icons-contrast.patch` `git am` ile
uygulandı (commit `b42cf73`), TESTS-FOR-DEVIN.md listesi koşuldu ve
§5'teki 3 birim-test önerisi yazıldı.

## Paketin düzelttiği 12 bulgu (TASARIM-ONERILERI.md)

İkon çakışması (yenile+durdur aynı anda), açık tema koyu çerçeve,
"Aktif işler" 1.25:1 kontrast, adres `https://` 2.76:1, görünüm düzeni
sessizliği, vekil öğelerin sessiz kapanması, menü araması sıfırlanmama,
"Bu anı kaydet" sessizliği, "Videoyu indir" adresi kullanmama, "Öğe
gizle" sessizliği, QR ikonu path hatası, çeviri menüsü checkbox boşluğu.

## Doğrulama sonuçları (TESTS-FOR-DEVIN.md §1–3)

| Adım | Sonuç |
|------|-------|
| `node --check` renderer.js / ui-locale.js | OK |
| `npm test` | TÜM TESTLER GEÇTİ |
| player-ui.test.js | 153 geçti |
| css-hardcoded-colors.test.js | 442/442 (sınır 444→442 güncel) |
| i18n-coverage, browser-parti6, browser-subtitle-menu, player-extras-parti3, player-escape-dialog | geçti |
| `audit:ui --strict` | 0 kontrast hatası (önceki 1.25:1 + 2.76:1 kapanmış) |
| electron-browser-icon-alignment.smoke | GEÇTİ |
| electron-browser-experience-smoke | **master'da da düşüyor** — medya tam-ekranı zaman aşımı; başsız ortam sınırı, patch regresyonu değil |

## Eklenen birim testleri (§5 önerisi)

`tests/browser-menu-proxy.test.js`: `runBrowserProxyAction` (hedef yok /
devre dışı sinyal / görünmeyen summary→fallback / normal tık),
`browserMoreSearch` (zzz boş durum, qr filtre, Enter ilk sonuç,
kapanışta sıfırlama), `prefillYoutubeUrlFromBrowser` (YouTube→doldur,
dışı→değişmez, player modu→dokunmaz, aynı değer→olay yok).

## Windows etkisi / sınırlar

- §4 elle doğrulama listesi Windows `start.bat` üzerinde kullanıcı
  tarafında koşulmalı (ikon çakışması, açık tema çerçevesi, menü
  araması, vekil sinyalleri, öndoldurma, QR ikonu).
- Paketin "yapılmayanlar" önerileri (yeni-sekme sayfası, yıkıcı
  eylemlerin konumu, ⋯ menü uzunluğu vb.) ürün kararı — uygulanmadı.
