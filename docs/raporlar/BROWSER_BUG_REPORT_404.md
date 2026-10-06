# BROWSER_BUG_REPORT_404 — Browser yan paneli tasarım turu + ertelenmiş yeniden deneme

Tarih: 2026-10-06 · Durum: DÜZELTİLDİ (Ubuntu + Xvfb Electron; Windows doğrulanmadı)
Önceki tur: rapor 403 (hatalı cümle döngüsü)

## Yöntem

Gerçek Electron arayüzü Xvfb altında açıldı (`electron-browser-chrome-design`
smoke düzeneği), koyu ve açık temada ekran görüntüsü + hesaplanmış stil ölçümü
alındı. Tasarım kararları `UI-DESIGN-SYSTEM.md` ilkelerine bağlandı (amber yalnız
ana eylem/etkin durum/odak; emoji yok, tek renkli SVG ikon; yoğunluk boşlukla).

## Bulgular ve düzeltmeler

1. **"Araçlar" sekmesi görünmüyordu (kullanılabilirlik bug'ı).** Browser
   modunda yan paneldeki dört sekme sığmıyor; şerit `overflow-x:auto` +
   gizli kaydırma çubuğu olduğu için dördüncü sekme fareyle hiç
   görünmüyordu (yalnız 2 px'lik bir parça). Düzeltme: etkin sekme etiketli,
   diğerleri ikon; etiket görsel olarak gizlenir ama erişilebilir ad olarak
   kalır; Altyazılar/Araçlar sekmelerine `title` eklendi.
2. **Çift ikon.** Altyazılar sekmesinde SVG ikonun yanında eski amber elmas
   (`.side-tab-icon`) da çiziliyordu. Browser modunda gizlendi.
3. **Amber süsleme.** "Altyazı görünüm ayarları" ve "Altyazı tanıları"
   katlanır başlıkları 14px amber metindi (ana eylemle yarışıyordu). Artık
   12px/600 ikincil metin + dönen üçgen; hover/açıkken birincil metin; odakta
   amber halka.
4. **Tipografi tutarsızlığı.** "ARAÇLAR" başlığı büyük harf/aralıklıydı
   ("Transkript" ile uyumsuz) → cümle düzeni. Araç çubuğunda "Sayfayı çevir"
   10px, "Altyazılar" 12px idi → ikisi 12px.
5. **Transkript yoğunluğu.** Tek satırlık replik 47px yer kaplıyordu → 39px
   (dikey dolgu 12→8px, yalnız browser modunda).
6. **Uyarıyla kabul edilen çevirinin görünürlüğü (rapor 403'ün devamı).**
   Gevşek modda veya elle son denemede kabul edilen satırlar artık
   transkriptte uyarı rengiyle küçük bir işaret ve noktalı alt çizgi taşır
   (ipucu: sayıları kontrol edin). "Kalite" süzgeci bu satırları da listeler;
   tamamlanma sinyali "N satır uyarıyla kabul edildi" der. Temiz yeni çeviri
   işareti kaldırır. Kullanıcı hata→yeniden çevir döngüsü yerine satırı
   gözle kontrol eder.
7. **Ertelenmiş yeniden deneme yanlış hata veriyordu.** Devre kesicinin hiç
   denemediği cümleler `retryFailed`'de temizlenip oynatma penceresine göre
   planlanıyor, sayaç 0 dönüyordu; IPC bunu "Yeniden denenecek hatalı cümle
   yok" hatası sayıp düğmeyi eski sayıda bırakıyordu. Artık `ok + deferred`
   döner, sinyal "oynatma konumuna gelince yeniden çevrilecek" der.

## Değişen dosyalar

`src/renderer/browser-chrome.css` (yalnız token; sabit renk eklenmedi),
`src/renderer/index.html` (iki `title`), `src/renderer/renderer.js`,
`src/main.js`, `tests/browser-translation-quality-loop.test.js` (+3 test).

## Testler

- `browser-translation-quality-loop` 12/12.
- Electron smoke: `electron-browser-chrome-design`, `electron-browser-tools-design`,
  `electron-ui-keyboard`, `electron-browser-icon-alignment` — geçti.
- Tüm `tests/*.test.js` temel ağaçla karşılaştırıldı: yeni kırmızı yok
  (`ui-locale`, `dom-innerhtml-ratchet` temelde de aynı iletiyle kırmızı).
- `css-hardcoded-colors`, `report64-contrast`, `design-system`, `accessibility`,
  `i18n-coverage` geçti.

## Sınırlar

- Windows DPI/ölçek ve gerçek video yüzeyi ile görsel doğrulama yapılmadı.
- Yan panel çok daraltıldığında (ray modu) mevcut ikon-ray davranışı korunur.
