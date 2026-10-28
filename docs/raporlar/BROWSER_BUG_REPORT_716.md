# Rapor 716 — PDF görünüm düğmeleri ve okuyucu kontrol düzeni

Başlangıç `0615c6d660408e2367efb96dd90c26c56f518299`; ürün/test bitişi `557d049572908e40cb638dc4f56f444b9a847bdd`. Dal `codex/reader-controls716`. [Önce kanıtı](READER716_2026-10-28/before.json), [son native kabul](READER716_2026-10-28/toolbar-results.json).

## Tasarım yönü — full review, yalnız okuyucu kontrol yüzeyi
Frontend-design ve make-interfaces-feel-better rehberleri kullanıldı. Mevcut tokenlar korunur: grafit `--bg-0 #0a0c0f`, yüzey `--bg-1 #101419`, amber `--accent #d5a35c`, metin `--text #edf1f3`; aktif tema kendi mevcut token karşılıklarını kullanır. Sora başlık, IBM Plex Sans araçlar, Georgia okuma metni. Yeni font/palet/React/animasyon bağımlılığı yok.

Düzen başlık+temel eylemler, altında görünüm/sayfa/zoom ve seyrek araç menüleri; ana alanda kitap metni. Yeni kart, büyük açıklama alanı veya dekoratif giriş animasyonu eklemek yerine mevcut sessiz düzenin tıklama/odak/hedef alanları düzeltildi. Tasarımın vurgu noktası metnin kendisidir. Ön plan tmp/reader716-design.md içinde yazıldı, bu rapor aynı kararı kalıcı kaydeder.

## Bulgular ve uygulanan değişiklikler

| Severity | Location | Before | After | Why |
|---|---|---|---|---|
| HIGH | src/renderer/renderer.js:25338 | `$('[data-pdf-view]')` ID arayan yardımcıya CSS seçicisi veriyordu; false koşul yüzünden dört düğmenin click dinleyicisi hiç bağlanmıyordu | Yanlış ID guard kaldırıldı, gerçek selector listesine dinleyiciler bağlandı | Kullanıcı Okuma/Orijinal/Yan yana/Çeviri düğmelerine tıklayınca görünüm değişmiyordu |
| HIGH | src/renderer/renderer.js:24983, src/renderer/index.html görünüm grubu | role=radio olmasına rağmen4Tab durağı ve ok davranışı yok | Tek seçili Tab durağı, sağ/aşağı sonraki, sol/yukarı önceki, sarma, Home/End; odak ve aria-checked birlikte güncellenir | Radyo grubunun gerçek klavye sözleşmesi ve öngörülebilir odak |
| MEDIUM | src/renderer/pdf-reader.css:34,64 | Görünüm34px, diğer kontroller38px, input36px; hedefler farklı yükseklikte | Mevcut kontrol stilleri40px hedefe hizalandı; düğme, ikon, sayfa/zoom ve summary aynı ölçü ailesinde | Küçük hedeflerde yanlış tıklamayı azaltır; native radyo yükseklikleri40px doğrulandı |
| MEDIUM | src/renderer/renderer.js:25373, pdf-reader-experience.js:621 | İngilizce arayüzde de `%100`; açık okuyucuda dil değişince biçim sabit kalıyordu | Ortak Intl.NumberFormat helper; EN100%,TR%100; açılış, zoom ve locale-change aynı yol | Kullanıcının seçtiği dilin sayı biçimine uyar |
| LOW | src/renderer/pdf-reader.css:177 | Okuyucu kontrol durumları için tek açık kısa geçiş sözleşmesi yoktu | Yalnız color/background-color/border-color140ms; reduced-motion none | Kesilebilir hafif geribildirim; kalıcı yazı/odak görsel ipucu korunur, giriş/parıltı yok |

Kök bug sayısı bir: yanlış selector guard. Klavye erişimi, ölçü, yüzde yerelleştirme ve geçişler ilgili arayüz geliştirmeleridir; beş ayrı kritik bug diye şişirilmedi. İlk klavye eklemesinden sonra da test kırmızıydı; salt okunur CDP listener incelemesinde listener0 ve DOM click sonrası mode=reading görüldü. Bu ara kod tanısı baseline'dan ayrı etiketlendi. Guard onarımından sonra native fare tıklaması ve native klavye gerçekten çalıştı.

## Görsel kanıt
- [Önce geniş](READER716_2026-10-28/before-wide.png)
- [Son klavye odağı](READER716_2026-10-28/toolbar-focus-wide.png)
- [TR koyu800CSSpx/yüzde125](READER716_2026-10-28/toolbar-tr-dark-125.png)
- [EN açık menü/yüzde125](READER716_2026-10-28/toolbar-menu-en-light-125.png)
- [Yüzde10 hızda hover](READER716_2026-10-28/toolbar-hover-slow.png)

Hepsi ayrı profilde oluşturulan3sayfalık sentetik gerçek PDF ve gerçek Windows Electron renderer görüntüsüdür. Kişisel kitap/profil görüntüsü yok. Ekranlar açılıp görsel olarak incelendi. Seçili/focus halkası görülüyor; dar menü ekran sınırlarında, okuma metninin üstüne normal açılır panel olarak geliyor. Kaynak kitap içeriği arayüz çevirisine sokulmaz.

## Considered but Rejected

| Location | Candidate | Rejected because |
|---|---|---|
| PDF üst alanı | Yeni hero/kart ve açıklama başlıkları | Okuma alanını tüketir; kullanıcının sade tema/alan beklentisine ters |
| PDF kök paleti ve fontları | Yeni bir renk/font sistemi | Mevcut Luna esinli ortak tema zaten belirlenmiş; tek yüzeyi ayrı tasarıma çevirmek tutarsızlık yaratır |
| Kontrol girişleri | Stagger/fade/zoom girişleri | Sık kullanılan okuma kontrollerinde dikkat dağıtır; yalnız kullanıcının durum değişimine kısa tepki yeterli |

## Verification
- `tests/electron-pdf-reader-experience.smoke.js --toolbar-only`: yeni kısa opt-in dalı, gerçek reader/main/preload/PDF.js/file picker yolu. Önce nativeRight mode=reading kırmızı; sonraRight→source,End→translation,Home→reading,Leftwrap→translation,Down→reading,Tab dışarı,ShiftTab seçili geri PASS. Native fare original görünümünü açtı. Enter menüyü açtı; Escape kapatıp summary'ye odak döndürdü.
- Aynı kabul1440x1000, ardından1000x950pencere ve webContents1,25→800CSSpx; TRdark ve ENlight. Yatay taşma yok; görünüm hedefleri40px; menü bounds viewport içinde;EN100%/TR%100 PASS.
- [Hareket kanıtı](READER716_2026-10-28/toolbar-motion.json): gerçek background-color140ms animasyonu playbackRate0,1 ile incelendi. no-preference/reduce yalnız bu test hedefinde CDP ile emüle edildi, sistem tercihi değiştirilmedi; reducecomputed0s. Hover/focus/active/open/closed durumları sınandı. Uzun yükleme/hata ve ses üretimi durumları bu kontrol paketinde **Not verified**.
- Node pdf-reader-search-ui/pdf-visible-page689/reader-pdf-lifecycle:7PASS. Değişen JS node--check ve gitdiff--check PASS. Belge indeksi PASS. Default uzun PDF/audio/M4B smoke bu tur tekrarlanmadı; toolbar-only dalı mevcut uzun akışı değiştirmez.
- Test hazırlığında native Enter için char olayı eksikti; doğru keyDown/char/keyUp dizisiyle düzeltildi. updatePlaybackRate hazır olmadan rate1 raporluyordu; animation.ready beklendi ve0,1 kanıtlandı. Bu test düzeneği sorunları ürün bugı sayılmadı. İlk hedefli okumada Pythoncp1254 ok sembolü basamadı; UTF8 ile okuma tamamlandı, ürün encoding sorunu değildi.

## Kaynak ve sınırlar
[W3C radyo grup klavye sözleşmesi](https://www.w3.org/WAI/ARIA/apg/patterns/radio/) incelendi; bu grup nav içinde, role=toolbar içinde değildir, normal radyo grubu modeli uygulanır. [Radix gerçek radio-group.tsx](https://github.com/radix-ui/primitives/blob/main/packages/react/radio-group/src/radio-group.tsx) roving focus/yön tuşu yaklaşımı ve [MIT lisansı](https://github.com/radix-ui/primitives/blob/main/LICENSE) incelendi; React kodu/dependency kopyalanmadı. Mevcut vanillaJS/CSS sistemi ve ortak tokenlar kullanıldı.

Verdict: **Approve — bu dar okuyucu kontrol kapsamı için.** Not verified: ekran okuyucu donanımı/OS, RTL, diğer PDFfont/rotasyonları, uzun yükleme/gerçek sağlayıcı hatası, ses üretimi, start.bat/install/DRM/GPU, tüm uygulama yüzeyleri ve bütün DPI seviyeleri. Mevcut11before-quit listener uyarısı sürüyor; susturulmadı. CI beklenmedi, görülmeyen sonuç yeşil sayılmadı. P061/P094/P095/P096/P098 kanıtı sınırlıdır;90hedefin tamamı bitti değildir. Ana kopya kişisel dosyalar korunarak normal PR/merge ile güncellenir.
