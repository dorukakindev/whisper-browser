# BROWSER_BUG_REPORT_268 — R319: PR #265 Devin Review triage

**Kapsam:** PR #265'in kendi Devin Review koşusu — 4 bug + 2 flag.
Tüm bug'lar doğrulandı ve düzeltildi; flag'ler kod/belge olarak kapatıldı.

## Kod düzeltmeleri

1. **Eski PDF yanıtı yeni okuyucuyu değiştiriyordu.** Aynı PDF yeniden
   açıldığında `pdfHash` aynı kalır; uçuşta kalan `translatePdfPages`
   yanıtı `renderPdfTranslation` üzerinden `player.pdfReader` (yeni
   okuyucu) sayfalarına yazıyordu ve eski iş yeni işin iptal düğmesini
   kapatıyordu. Paket yanıtı uygulanmadan önce `player.pdfReader !==
   reader` kesicisi eklendi; kapanıştaki `pdfTranslateCancel.disabled`
   yalnız okuyucu hâlâ aynıyken kapanır. (`src/renderer/renderer.js`)

2. **İkinci jamo eşleşmesi ilk heceyi vurguluyordu.** `foldSearchIndex`
   `하ᅧ` metnini `하ᅧ` yaparken iki dense birimini de özgün dizinin
   tamamına (`[0,3]`) eşliyordu — yalnız `ᅧ` arandığında vurgu bütün
   diziyi seçiyordu. Artık baştaki birleşmiş heceler (AC00–D7A3)
   tükettikleri aralığa (`[0,2]`), birleşmeyen kalan jamo'lar kendi
   1-birimlik aralıklarına (`[2,1]`) eşlenir.
   (`src/browser-address-model.js`)

3. **Kaydedilmiş geçersiz kapsam çeviriye taşınıyordu.** Önceki turda
   whitelist yalnız arayüz yedeğine uygulanmıştı; `tab.browserPageScope`
   bilinmeyen bir değer taşıdığında doğrulanmadan kazanıyordu. Sekme
   değeri de aynı `scopeValid` kapısından geçer.
   (`src/renderer/renderer.js`)

4. **Dolu iş günlüğüne yeni başlık ekleniyordu.** Aynı saniyede başlayan
   iş aynı dosya adını üretir; dosya 4 MB sınırına ulaşmışsa başlık yine
   ekleniyordu. Artık başlık mevcut içeriğe sığmıyorsa `-2`…`-11`
   sonekli dosya adı denenir; hiçbiri sığmazsa iş günlüksüz başlar.
   (`src/main.js`)

## Flag kapanışları

5. **Gömülü altyazı ipuçları yerelleştirildi.** `unreadCount` dahil üç
   ipucu biçimi `uiText()` üzerinden `UiLocale.t`'ye bağlandı; üç kalıp
   `patterns` tablosuna eklendi (sayı/çoğul duyarlı EN karşılıklar).
   (`src/renderer/renderer.js`, `src/renderer/ui-locale.js`)

6. **Devir notu tamamlandı.** `2026-09-30-1845.md` bitiş kimliği
   `97f97d2` + squash `85f9f14`; rapor 267'deki "12" sayısı 14'e
   düzeltildi.

## Test tarafı

- `tests/review-triage-r318.test.js` — yeni birim test: birleşmeyen jamo
  `[2,1]` aralığı + tam birleşik dizi `[0,3]`; statik kilitler yeni
  sözleşmelere güncellendi (`bytes: initialBytes + headerBytes`,
  `scopeValid(tab.browserPageScope)`, `LOG_MAX_BYTES` kapısı).
- `tests/browser-retry-state.test.js` — manga idle olay sayımı 3→4
  (R318'in kendi düzeltmesinin beklenti güncellemesi).
- `tests/touch-hdpi.test.js` — sideResizer senaryosuna `pointerId`
  geçişleri + yabancı-pointerId negatif kanıtları eklendi.

## Doğrulama

- `node --check` — main.js, renderer.js, browser-address-model.js,
  ui-locale.js: temiz.
- `tests/review-triage-r318.test.js` 12/12, `browser-retry-state`,
  `touch-hdpi`, `log-rotation`, `disk-full`, `omnibox-unicode` (77),
  `browser-page-translate`, `pdf-translate(-depth)`, `ui-locale`,
  `ui-locale-dynamic`, `settings-*`, `browser-page-preview`: PASS.
- Electron smoke'lar bu ortamda çalışmıyor (başsız; master'da da aynı).

## Sınırlar / doğrulanmayanlar

- Gerçek Windows'ta jamo vurgusu ve PDF yeniden-aç senaryosu elle
  doğrulanmadı; davranış birim/statik kilitlerle sabitlendi.
