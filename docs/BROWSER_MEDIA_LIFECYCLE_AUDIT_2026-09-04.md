# Tarayıcı medya yaşam döngüsü denetimi

Güncel kaynak üzerinde çoklu medya seçimi, altyazı katmanının kapalı durumu ve son eklenen indirme panelinin hata durumu yeniden incelendi.

## Doğrulanan ve düzeltilenler

1. **Yanlış medya seçimi:** Oynayan daha küçük video, büyük ama duraklatılmış video arkasında kalıyordu. Görünür ve oynayan medya artık önce; oynayan ses öğesi, görünür duraklatılmış medya ve gizli izleyici videolar ayrı önceliklerde değerlendirilir.
2. **Gizli izleyici video:** Bir piksellik oynayan video görünür ana oynatıcıyı artık çalamaz.
3. **Geç medya etkinliği:** DOM değişmeden başka bir mevcut video oynatılırsa overlay seçimi artık kirlenir ve yeniden hesaplanır.
4. **Kapalı overlay yaşam döngüsü:** İlk durum kapalıysa boş overlay DOM'u ve medya taraması oluşturulmaz. Kapatmada seçili medya ve bütün aday medya dinleyicileri bırakılır.
5. **Bayat indirme uyarısı:** Eşzamanlı indirme sınırı uyarısı, bir yuva boşaldıktan sonra panelde kalmaz.

Medya seçimi `src/browser-media-selection.js` içinde tek kurala bağlandı; komut/probe controller'ı ve altyazı overlay'i aynı sıralamayı kullanır.

## Doğrulama

- Çoklu video, 1×1 video ve ses öğesi seçim senaryoları gerçek üretilen sayfa betiği VM'de çalıştırıldı.
- Overlay kapalı başlangıcı DOM oluşturma ve medya tarama sayaçlarıyla çalıştırıldı.
- Overlay aday etkinliği ve cleanup sözleşmesi denetlendi.
- İndirme yaşam döngüsü regresyon testi ve tam `npm test` paketi geçti.

Gerçek sitelerdeki özel oynatıcıların Shadow DOM/DRM davranışı yalnız gerçek Electron oturumunda kesinleştirilebilir; bu rapor onu test edilmiş saymaz.
