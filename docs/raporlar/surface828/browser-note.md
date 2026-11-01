# R828 browser yüzeyi — uygulama ve native kanıt

Başlangıç: `codex/surface-craft828`, ürün tabanı `12ace3e5`. Kapsam yalnız browser-chrome.css, browser-features.css ve hedefli tools smoke. Commit/global belge yapılmadı. Komşu ajan dosyalarına dokunulmadı.

## Tez ve gözlenen sorun

Operate yüzeyi: önce hangi yan panel bölümünde olduğum, sonra ayarlar/yardımcı eylemler, sonra mevcut videonun araçları. Dört bölümün adı yalnız etkin olanda görünüyordu; diğer hedefler geniş panelde bile yalnız ikondu. Araçlar ekranında ayarlara giden mevcut eylem satırı CSS ile saklanıyordu. İç içe panel çerçevesi araçlara yaklaşık 30px yatay bütçe kaybettiriyor; mini oynatıcı düğmesi tüm işlerden ayrı amber çerçevesiyle yanlış ağırlık alıyordu. ASS düğmeleri metin kırılması yüzünden dengesizdi; yapım adı/yayın sürümü gibi uzun girişler kısa sayısal alanlarla aynı dar kolonu kullanıyordu.

## Uygulama

- Ray modu dışındaki browser yan panelinde dört etiketli hedef eşit genişlikli üst satır; mevcut ayarlar/daraltma/dosya/düzen eylemleri ayrı alt satır. DOM/roving focus/komut sahipleri değişmedi. 370px altında yalnız tekrarlı ikonlar çıkarılır; etiketler kalır.
- Tools modunda mevcut ayar/yardımcı eylem satırı görünür. Dar panelde mevcut Sayfaya dön aynı satırda kalır.
- Araçların ikinci inset kartı kaldırıldı. Tek bf-workspace kaydırıcısı ve dokuz native details grubu korunur. Alan bütçesi doğrudan sidebar'a aittir.
- Mini oynatıcı nötr yardımcı eylem. ASS çiftleri eşit kolon; kapatma eylemi tam genişlik. Grup başı/alan/eylem boşlukları 8/12/16px ritminde. Uzun metin alanları iki kolonu kullanır; sezon/bölüm ve kod/kimlik kısa alanları yan yanadır.
- Durum hapı 32px, API ve davranış aynı. Detay popover'ı browser container genişliğiyle sınırlanır; durum/iyileştirme eylemlerine 8px grup boşluğu ve 12px iç boşluk verildi.
- Ortak palet, font, motion, kaynak/generation, ayarlar ve native view JS değişmedi.

## Önce / sonra görüntüleri

Tümü ayrı test profili, native Windows Electron. Ana capture çocuk video yüzeyini içermez; native-page.png ayrı kanıttır.

Önce: `tmp/surface828/browser-before/chrome-dark.png`, `tools-dark.png`, `tools-light.png`, `tools-narrow.png`, `native-page.png`.
Sonra: `tmp/surface828/browser-after/chrome-dark.png`, `tools-dark.png`, `tools-light.png`, `tools-narrow.png`, `chrome-error-light.png`, `chrome-narrow.png`, `native-page.png`, `fullscreen-native.png`.
Sonuç matrisi: `tmp/surface828/browser-after/result.json`.

İlk before tools-narrow.png mevcut animasyon settle olmadan yakalanan eski test boş karesidir; kanıt olarak kullanılmamalı. Son test 300ms paint bekleyip gerçek bf-workspace viewport bounds'u doğrular. Sonra tools-narrow.png panel takeover, Sayfaya dön ve ayarları gerçekten gösterir. Normal önce/sonra aynı1440×960 CSS viewport ve150% Windows ekran yakalaması.

## Kontroller

- `tests/electron-browser-chrome-design.smoke.js`: geçti. 1440×960 adres232.58px; 1280/1,1440/1.25,1024/1.25 toolbar taşma yok. Menü açılınca native video occluded, kapanınca restore; native bounds x11,y93,w879,h856,900px viewport içinde. Gerçek sentetik video currentTime>0.1; fullscreen gidiş/dönüş geçti.
- `tests/electron-browser-tools-design.smoke.js`: geçti.9 grup, yatay taşma yok, geniş panel araç yüksekliği658.42px; ayarlar görünür ve4hedef etiketi okunur. Klavyeyle details, native select Escape, alan koruma, AI/library/subs geçişleri, dar panel ve yerel oynatıcıya dönüş kontrolleri geçti. Dar bf-workspace898px/scroll898px; paint sonrası viewport içinde.
- Tools smoke'a yalnız görünür ayar/etiket ve settle edilmiş dar panel containment assert'leri eklendi; eşik gevşetilmedi.
- `node --check tests/electron-browser-tools-design.smoke.js`, hedefli `git diff --check` geçti. Impeccable layout detect önce/sonra `[]`.
- Başlangıç sandbox launch'ı ffmpeg child spawn status=null ile durdu. Native ayrı test profili launch'ı escalation ile geçti. Sadece kendi başarısız test PID22188 kapatıldı; kullanıcı uygulaması kapatılmadı.

## Sınırlar

Canlı sağlayıcı/API/site, kişisel profil, DRM/GPU kalitesi, start.bat yeniden açılışı, tüm DPI/ekran okuyucular, performans ve tam npm paketi bu kapsamda doğrulanmadı. Test sentetik yerel video ve kontrollü https protocol fixture kullanır. Native ana capture'daki boş video alanı çalışan çocuk yüzeyin capture sınırlamasıdır; ayrı native-page.png ve playback/bounds assert'leri kanıttır. Mevcut EN/TR metin sahipliği değişmedi; fixture'ın Türkçe kalabilen mevcut yerel açıklamaları yeni yerelleştirme işi sayılmadı.
