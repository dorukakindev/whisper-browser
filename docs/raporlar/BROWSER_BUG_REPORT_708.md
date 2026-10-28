# Rapor 708 — Asistan geri alma farkı ve doğru hedef

P073, R707 configure farkının devamı. Başlangıç d7d13c6fb73e99c10cbafe8826f21d591fb5ce4e.

## Doğrulanan hatalar ve düzeltme
- Geri alma, değiştirilmemiş bütün alanları yeniden doğrulayıp yazıyordu. Model değişimi ardından ilgisiz batchSize kontrolü devre dışıysa geri alma `This setting is currently unavailable: batchSize` ile başarısızdı. Artık yalnız gerçekten değişmiş alanların ters farkı tutulur/yazılır; mevcut tam-domain drift koruması sürer.
- Eski undo kartı sadece mevcut değerlere bağlıydı; geri dönülecek değer değişince aynı kart yeni hedefi uygulayabiliyordu. Onay kimliği artık mevcut değerler, canUndo ve undoChanges içerir; hedef değişirse reddedilir.
- Aynı değerleri tekrar istemek gereksiz kayıt/olay ve önceki anlamlı undo kaydını kaybetmeye neden oluyordu. No-op kayıt/olay üretmez; önceki undo korunur.
- Undo kartında gerçek ters fark gösterilir: native Whisper tiny→large-v3, beam3→5; çeviri Açık→Kapalı. Mevcut R707 özetleyici ve UI kullanılır.

## Kanıt
İlk iki regresyon düzeltme öncesinde kırmızı, sonrasında yeşil. `node --test --test-isolation=none tests/assistant-workflow654.test.js tests/assistant-agent-service.test.js`:39 PASS. İki değişen JS syntax ve git diff --check PASS.
Windows `tests/electron-assistant654.smoke.js`:24 kontrollü standard-tier sağlayıcı çağrısı,6 gerçek kart uygulaması, bayat kart reddi, üretim başlamadı. Gerçek renderer→main onay köprüsü, UI ve settings diski kullanıldı. Devre dışı ilgisiz batch kontrolü korunarak undo tamamlandı. [Ekran/JSON](UNDO708_2026-10-28/) fixture verisidir; kişisel veri değildir. İki ekran görsel olarak incelendi.

## Açık kaynak karşılaştırması
[Immer patches.ts](https://github.com/immerjs/immer/blob/main/src/plugins/patches.ts) değişen alanlar için inverse patch üretimi ve no-op elemesi incelendi; [MIT lisansı](https://github.com/immerjs/immer/blob/main/LICENSE) doğrulandı. Desen karşılaştırmasıdır; kütüphane, dış kod, bağımlılık eklenmedi. Mevcut uygulama işlem kayıtları kullanıldı.

## Sınırlar
Gerçek modelin araç seçimi/kalitesi, ücretli API, GPU, canlı site, DRM, install.bat ve start.bat akışı bu turda çalıştırılmadı. Native Electron ayrı test profiliyle koştu; normal launcher doğrulaması sayılmaz. 11 before-quit listener uyarısı hâlâ açık; fixture ağ izolasyonunda reklam filtre isteği başarısızlığı beklenen ve reklam engelleme kanıtı değil. CI beklenmez; görülmeyen sonuç yeşil sayılmaz. Kalıcı şema/IPC/dependency değişmedi; undo oturum belleğindedir.100 maddelik plan tamamlanmadı.
