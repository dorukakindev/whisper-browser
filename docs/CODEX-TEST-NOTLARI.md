# Codex için test notları · Stremio turları 3–4 (2026-11-11-0003 / 0004)

Taban: master `ded71f4646504f65e5a70ad3fb594c06f010cea1` + `changes.patch` (kümülatif). Bu turu yazan ortamda **yalnız** `tests/stremio-addons.test.js` ve `tests/stremio-ui.test.js` (jsdom 30.0.1) ile 11 ilgili mevcut test koşuldu; tam `npm test`, Electron smoke, Windows, gerçek mpv, canlı Torrentio/Cinemeta, axe **koşulmadı**. Aşağıdaki her madde için "Beklenen" davranış yazıldı; Codex'ten gerçek doğrulama ve kusur düzeltmesi beklenir. Test beklentisini zayıflatarak geçirme; kusur ürün kodundaysa ürünü düzelt.

## Önce çalıştır
1. `node tests/stremio-addons.test.js`, `node tests/stremio-ui.test.js` (jsdom kurulu olmalı).
2. Önceki turdaki 11 test: native-player-{lifecycle,stop762,subtitles,diagnostics}, report815-media-native, ipc-parity, preload-sandbox, csp-policy, adversarial-ipc, preload-usage-ratchet, accessibility. Ardından `npm test` ve taban sürümde de başarısız olanları ayır (öncekinde 31 başarısız, hepsi tabanda da vardı).
3. Yeni test gerekirse mevcut dosyalara ekle (AGENTS.md: gereksiz yeni test dosyası üretme).

## Bu turda eklenen/değişen 36 madde (tasarım ağırlıklı) ve beklenen davranış
Kartlar/poster
1. Poster yedeği: görsel yoksa/yüklenemezse ada göre deterministik renk + baş harfler (`--sx-hue`).
2. Poster görseli yüklenince yumuşak belirir (`.sx-fade.is-in`).
3. Kart sarmalayıcı `.sx-card-wrap`; hover/odakta ♡ (Listeme ekle) görünür, dokunmatikte hep görünür; tıklayınca listeye ekler/çıkarır + bildirim.
4. Dizi kartında "Dizi" rozeti; puan hapı renk kademeli (≥8 yeşil, ≥7 sarı, ≥6 turuncu, altı kırmızı).
5. Raflar yüklenirken iskelet kartlar (`aria-hidden`), boş durumlarda illüstrasyonlu `emptyState`.
Vitrin/ana sayfa
6. Vitrinde arka plan yavaş yakınlaşma (Ken Burns); `prefers-reduced-motion`da kapalı.
7. Vitrinde `logo` varsa başlık yerine logo görseli; yüklenemezse metin başlığa döner.
8. Vitrin döndürme duraklat/sürdür düğmesi (`.sx-dot-pause`).
9. Tür çipleri (ana sayfa) ve başlık sayfası tür çipleri → Keşfet'i o türle açar (`stremio-browse` olayı).
10. "Sürpriz seç" rastgele yüklü yapım açar; kataloglar yüklenmediyse uyarı verir.
11. `/` tuşu arama kutusuna odaklanır (giriş alanındayken/diyalog açıkken değil).
12. Son aramalar çipleri (localStorage `stremio.recent`, en çok 6) + Temizle.
13. Arama sonuçları birden çok türdeyse Tümü/Film/Dizi segmenti.
14. Devam et kartında "N dk kaldı" ve × (kaydı kaldırır, bildirim verir; `progress-clear`).
Keşfet
15. Izgara yoğunluğu (sıkı/orta/geniş, `stremio.density`).
16. Etkin süzgeç çipleri (× ile tek tek kaldırma); süzgeç çubuğu yapışkan.
Başlık sayfası
17. Sezon sayısı 2–8 ise sezon hapları (gizli `<select>` erişilebilirlik için korunur).
18. Bölüm satırında "İzlendi işaretle/✓ İzlendi" (`progress-save completed` / `progress-clear` bölüme özel); işaretleyince Devam et raflarına olay gider.
19. Devam/Sıradaki bölüm rozeti.
20. "Benzer: <tür>" rafı (aynı katalog + `genre` ekstrası; yoksa görünmez).
21. Dizi/film profil rozeti.
Kaynak seçici
22. Çözünürlük renkli rozet (4K altın, 1080p yeşil, 720p mavi).
23. Seeder sağlığı satır kenarlığı (≥100 yeşil, ≥20 açık yeşil, ≥5 sarı, altı kırmızı).
24. Süzgeçler "Çoklu ses", "Altyazılı"; sıralama "En küçük"; süzgeçler hatırlanır (`stremio.streamFilters`).
25. Süzgeç çubuğu diyalogda yapışkan.
26. Eklentiler penceresinde "Hepsini yenile".
Oynatıcı
27. Bildirim (toast) sistemi: kaldığın yerden devam (Baştan başla eylemi), kaynak değişti, altyazı yüklendi/otomatik eklendi, hız.
28. Sıradaki bölüm isteminde geri sayım çubuğu (10 sn animasyon).
29. Panel açılış animasyonu (reduced-motion'da kapalı).
30. Önceki turdan: Oynatma/Dublaj sekmeleri, içerik profilleri, binge, Shift+N/P, native izler/atla, proxyHeaders, VTT→SRT, Listem (davranış değişmedi; yalnız bu not için hatırlatma).
Genel
31. Sayfa/başlık açılışında kısa yükselme animasyonu; seçim rengi; ince kaydırma çubukları.
32. Odak halkaları (kartlar, çipler, segmentler, ♡, toast eylemi).
33. Dar ekran (≤560 px): bölüm eylemleri iki sütun, yoğunluk düğmesi gizli, toast konumu.
34. Hover'da bölüm satırı ve kaynak satırı vurgusu.
35. Servis: `progress-clear` artık isteğe bağlı `season/episode` alır (yalnız o bölümü siler); `library-*` ve `vttToSrt` testli.
36. Yeni UI metinlerinin tamamı EN/TR (`t(en, tr)`).

## Elle/gerçek ortamda bakılacaklar (otomatik testle kanıtlanmadı)
- Gerçek Windows + Torrentio/Cinemeta: katalog, tür çipi→Keşfet, benzer yapımlar, sayfalama (`skip`), poster/arka plan yükleme (CSP `img-src`/`referrerPolicy`).
- Kart ♡ hover davranışı, vitrin dönüşü, Ken Burns (GPU yokken akıcılık), sticky süzgeç çubuğunun `.mh-content` kaydırma kabuğunda doğru yapışması (`top:0` kabuğa göre ayarlanması gerekebilir).
- `sx-toasts` konumu gerçek oynatıcı kontrol çubuğuyla çakışıyor mu (1920×1080 tam ekran ve dar pencere); native mpv alt penceresinin üstünde görünmesi (native child window DOM üstüne çıkamaz; gerekirse toast/panel için `data-pw-occludes-native="true"` kuralı).
- Dublaj sekmesi → stüdyo: `dubPreset*` tıklaması ve `translateRegister` değişimi gerçek uygulamada çalışıyor mu; iki altyazı varken seçilen yol doğru mu.
- Native mpv: `sub` komutu, `chapter-list`, `http-header-fields`; proxyHeaders'lı gerçek bir kaynak.
- Chromium'da `sessionMux` `stremio` yuvası: YouTube yuvasıyla çakışma yok, başlık yalnız eşleşen tam URL'ye ekleniyor.
- axe-core (önceki ortamda zaman aşımına uğradı): ana sayfa, Keşfet, başlık, kaynak seçici, panel (6 sekme). Özellikle `.sx-quick-add` etiketleri, `role=list/listitem` yapısı, renk kontrastı (`--text-dim` / rozetler), `aria-pressed` kullanımı.
- Klavye: Tab sırası (kart → ♡), raf ←/→/Home/End, sekmeli panel ok tuşları, diyalog kapanınca odak iadesi.

## Bilinen sınırlar / dikkat
- `.sx-card` artık `.sx-card-wrap` içinde; dış kodda `.sx-card` doğrudan çocuğuna dayanan seçici varsa kontrol et.
- Stremio dosyaları (`stremio-addons.json`, `stremio-progress.json`, `stremio-library.json`) `.wbp` paketine bilinçli olarak girmez.
- R854 kapsam dışı (kullanıcı kararı); önceki R854 düzeltmeleri korundu, yeniden açılmadı.


---
# TUR 4 (2026-11-11-0004): Oynatıcı Pro, Kütüphane, puanlama, kaynak puanı

Kaynak/ilham: Stremio-web (GPLv2: Board/Discover/MetaDetails akışı, devam et, kütüphane fikri), Plyr (MIT: önizleme küçük resmi, kısayol, PiP tasarımı), mpv özellik adları (`video-zoom`, `panscan`, `audio-delay`…). **Kod bu projelerden kopyalanmadı**; fikirler bizim yapıya göre yazıldı (GPL kod karışımı yok). Yeni bağımlılık yok. Proje özel/yayınlanmayacak (kullanıcı beyanı).

## Yeni/değişen dosyalar
- Yeni: `src/renderer/player-pro.js`, `src/renderer/player-pro.css`, `tests/player-pro.test.js`. `index.html`: css + script kaydı.
- `src/native-player.js`: `vprop` komutu (brightness, contrast, saturation, gamma, hue, video-zoom, panscan, video-pan-x/y, video-rotate, video-aspect-override, audio-delay, sub-delay; değerler sınırlanır; bilinmeyen ad reddedilir).
- `src/stremio-addons.js`: `scoreStream` (0–100 puan + `tags` + `warns`), ses/kanal/10-bit/grup ayrıştırma, `normalizeMeta` zenginleştirme (writer, awards, country, language, released, trailers).
- `src/stremio-service.js`: `history-list` (+istatistik), `rating-get/set/list` (`stremio-ratings.json`), akış satırlarına `score/tags/warns/audio/channels/group`.
- `src/renderer/stremio-ui.js` / `stremio.css`: Kütüphane sekmesi (Geçmiş · Listem · Puanlarım), başlık sayfasında "Benim değerlendirmem" + oyuncu/yönetmen/ödül, sezon ilerlemesi (S1 · 3/10), kaynak puanı halkası + etiket/uyarı rozetleri + "En yüksek puan" sıralaması, karşılaştırmada Puan satırı, Oynatma sekmesinde Pro kısayolları.

## Oynatıcı Pro (her tür medya: yerel dosya, akış, Stremio)
Düğme `#playerProBtn` (⚙ simgesi, `⋯` menüsünün solunda). Kısayollar: **X** panel, **Q** bilgi, **Z** sığdır/doldur/uzat döngüsü (mevcut tuşlarla çakışmıyor: renderer.js'te z/x/q bağlı değil). Sekmeler:
1. Görüntü: hazır görünümler (Varsayılan/Sinema/Canlı/Gece/Yumuşak/Siyah-beyaz), parlaklık, kontrast, doygunluk, ton, gama (SVG `feComponentTransfer`), keskinlik (SVG `feConvolveMatrix`), sığdır/doldur/uzat/16:9/21:9/4:3/1:1, yakınlaştırma, kaydırma, 90° döndürme, aynalama. HTML5'te CSS/SVG; native mpv'de `vprop` komutları (keskinlik ve aynalama yalnız HTML5). İçerik başına `localStorage` (`pp.v.<mediaKey>`, en çok 200) hatırlanır, kapatılabilir.
2. Eşitleme ve hız: altyazı gecikmesi (mevcut `nudgeOffset`), ses gecikmesi (yalnız native; HTML5'te "native'e geç" önerisi), hız hapları 0.5–3×, uyku zamanlayıcı.
3. Bilgi: canlı istatistik (motor, kaynak, dosya, çözünürlük, süre/konum, gösterilen/atlanan kare, ileri tampon, izler, ses), panoya kopyala, zaman kodunu kopyala.

## Codex'in doğrulaması gerekenler (otomatik testle kanıtlanmadı)
- `player-pro.js` gerçek `renderer.js` kabuğunda: `player.mediaKey`/`player.offset`/`nudgeOffset`/`osd` global'lerine bağımlı; `player.workspaceMode==='browser'` iken düğme/kısayol davranışı; panelin native child window'u gizlemesi (`data-pw-occludes-native="true"`) ve kapanınca geri gelmesi; Esc'in eski Esc zincirini bozmaması (capture dinleyicisi `stopImmediatePropagation` ile yalnız panel açıkken Esc'i yutar).
- Native mpv'de `vprop`: her özellik gerçekten uygulanıyor mu, `video-pan-*` ölçeği, `video-aspect-override` -1 ile sıfırlama, `audio-delay` ± yönü; native↔HTML5 geçişinde ayarların yeniden uygulanması (şimdilik `apply()` yalnız panel/medya olaylarında çağrılır; `NativePlayerUI.start/stop` sonrası çağrılmıyor → gerekirse `loadedmetadata`/özel olay bağla).
- SVG filtresi performansı (4K'da `feConvolveMatrix`), `video.style.filter` ile `mix-blend`/ambient (cinema-motion) etkileşimi, `object-fit`'in mevcut `#playerVideo` CSS'iyle çakışması, 90° döndürmede ölçek hesabı (`applyHtml` içi `fitScale`).
- Hız hapları ile mevcut `playerSpeed` menüsü ve Stremio profil hızı (`stremio.speed`) tutarlı mı.
- Stremio: `history-list` istatistikleri (saat = tamamlananların süresi + kısmi konum; gün serisi), Puanlarım süzgeç/sıralama, rating otomatik kayıt gecikmeleri (500/900 ms), not alanı `maxLength` 2000, kaynak puanının gerçek Torrentio çıktılarında anlamlı olup olmadığı (ağırlıklar `scoreStream` içinde; gerekirse ayarla), `trailers` alanı şimdilik yalnız normalize ediliyor (arayüzde gösterilmiyor).
- axe-core: Kütüphane, değerlendirme paneli (radiogroup yıldızlar), Pro paneli (slider etiketleri), kaynak puan halkası (`aria-label`).
- Yeni testler: `tests/player-pro.test.js` (jsdom), `tests/stremio-addons.test.js` (puan, rating, geçmiş, meta), `tests/stremio-ui.test.js` (kütüphane, puanlama). `vprop` için ayrı birim testi yok — native-player testlerine eklenmeli.
