# Rapor 674 — Kalıcı müzik analizleri ve Spotify liste tasarımı

Başlangıç master `b6b552b60ae4065a6b5a624232ba9cf6259edc94`; ilk ürün commit `dfc6361f7a7c75445c90b072d8b4ca2a186ead81`, bitiş ürün `8f0ca38c880acfc190a882239bdb88c01226e622`. Dal `codex/music-results674`.

## Doğrulanan sorun ve çözüm

DSP ölçümü içerik adresli geçici önbellekteydi, fakat kaynak yeniden seçilince UI sonuçları sıfırlıyor ve geri yüklemiyordu. Etiket ve sıralamalar yalnız son iş/panel belleğinde duruyordu. Panel kapanınca ses silindiğinden yeni kaynakUUID'si de eski sonuçla eşleşmiyordu.

Yeni `userData/music-workspaces/<ses-SHA256>.json` kaydı, aynı sesin en son **ölçüm, etiket, yerel karşılaştırma ve internet karşılaştırması** sonuçlarını tür bazında ayrı tutar. Kaynak yeniden seçilince ses içeriği doğrulanır; yeni oturum kimliğiyle sonuçlar bağlanır, DSP/CLAP işi başlatılmadan gösterilir. Ölçümler ve Ses etiketleri düğmeleri hesaplama yapmadan görünüm değiştirir. Kaydedildi göstergesi, geri yükleme tarihi ve geçmiş karşılaştırma etiketi vardır. Asistan bağlamı da kayıtlı olma bilgisini taşır.

Kaynak değişmişse eski sonuç açılmaz. İş sırasında dosya değişirse sonuç yeni sese kaydedilmez. Model revizyonu ve kayıt biçimi doğrulanır. Bozuk kayıt güvenle cache-miss olur. Depolama hatası, başarılı ölçümü çöpe atmadan görünür uyarı verir. Önceki panelin temizliği bitmeden yeni kaynak hazırlığı başlamaz.

Sonuçlar atılabilir24öğelik cache değildir: en fazla5000ses/512MiB toplam, kayıt başına4MB sınırı vardır; eski parçalar sessizce silinmez. Sınırda yeni yazım uyarı verir, önceki kayıt korunur. Her ses için her analiz türünün son sonucu saklanır; bütün tarihsel aralıkların sürüm arşivi değildir. Atomik mevcut yazıcı kullanılır. Yeni bağımlılık/IPC kanalı yok; aynı yetkili music-analysis:request kanalının kaynak seçimi yanıtı workspace alanıyla genişletildi.

Dosya yolları, geçici ses/önizleme adresleri ve eski oturum kimlikleri sonuç dosyasına taşınmaz. Yerel sonuç bağlantıları mevcut kitaplık kimliğinden yeniden doğrulanır; Deezer kimlikleri sayısal/provider kurallarıyla geri kurulur, önizleme URL'si gerektiğinde tazelenir. Başka referans karışımına ait saklı puanlar okunabilir kalır; yanlış sesi A/B referansı diye çalmak yerine yeniden karşılaştırma gerekir. Kayıtlı sıralamadan kör deneme için güncel çalışma istenir.

**Eski sürümün hiç kaydetmediği etiketler geri getirilemez; ilk kez yeniden üretilmesi gerekir.** Yeni kaydetme bundan sonraki tamamlanan işler içindir. Çevrimiçi kaynak yeniden açılırken dinlenebilir90sn/30snkesit tekrar hazırlanabilir; ölçüm ve etiket model hesaplaması tekrarlanmaz. Ses dosyası kalıcı snapshot'a dahil değildir, panel kapanınca geçici sesler temizlenir.

## Tasarım

Spotify listeleri kapalı/açık kartlar, parça sayısı, ayrı liste araç çubuğu ve taşma menüsü kullanır. Parçada küçük resim, başlık ve sanatçı birlikte; Beğen ve Analiz ve sonuçlar sağda; dar pencerede işlemler alt sıraya geçer. Büyük sağ-sol boşluğa dağılan sanatçı/sürüm sütunları kaldırıldı. Kapak, incelenmiş YouTube kimliğinden türetilir; yeni bir kayıtla otomatik eşleştirme yapılmaz. Odak halkaları ve azaltılmış hareket korunur. Kişisel liste/başlıklar screenshot fixture'ına alınmadı.

Luna origin/main yeniden fetch edildi: `859b0925ad51d878293377353476e7957eb8bc91`; Music.tsx içindeki çalışma alanı/playlist/appStorage yaklaşımı incelendi. GPLkaynak kopyalanmadı; kendi main-process atomik JSON/izin katmanımız ve mevcut DSP/CLAP motoru kullanıldı. Yeni model, servis veya ücretli API yok.

## Doğrulama

`node --test --test-isolation=none tests/music-results674.test.js tests/music-analysis.test.js tests/music-online.test.js tests/music-remote671.test.js tests/music-workspace672.test.js tests/assistant-music.test.js`: **15 PASS**. Yeni servis örneğinde diskten geri yükleme, yeniUUIDbağlama, model/ölçüm çağrısı yapmama, dosya değişimi/iş sırasında değişim reddi, signed/fileURLtemizliği, bozuk kayıt ve31eski kaydı koruma doğrulandı. 8değişenJS/testgirişi syntax ve diffcheck PASS.

Native Windows `electron tests/electron-music674.smoke.js`, son bütünleşik koşum1793143512567: gerçek90snYouTubeDSP, yaklaşık30snDeezerDSP, gerçekCLAPetiket ve seçilmiş2önizleme sıralaması. Panel kapatılıp aynı kaynak açıldı: ölçüm, etiket ve internet sıralaması geri geldi, **DSPveCLAPyenidençalışmadı**; ölçüm/etiket görünüm geçişi ve hemilk hem yenidenaçılan geçiciWAVtemizliği PASS. [Sonuç](MUSIC_RESULTS_2026-10-28/result.json), [geri yüklenmiş etiketler](MUSIC_RESULTS_2026-10-28/restored-tags.png).

Son görsel kontrol `electron tests/electron-music674.smoke.js --layout-only`,1793143906170: gerçek ana sayfa→Müzik navigasyonu,4satır/uzunTürkçebaşlık/kapak,1440geniş ve800CSSpxdar pencere. [Geniş](MUSIC_RESULTS_2026-10-28/music-list-wide.png), [dar](MUSIC_RESULTS_2026-10-28/music-list-narrow.png), [yerleşim sonucu](MUSIC_RESULTS_2026-10-28/layout-result.json). Üç ek parça yalnız sentetik görsel verisidir; hepsi aynı public kapakla sınandı. Gerçek kullanıcı zevk/kitaplık verisi değildir. Son önbellek doğrulama ve geçmiş-etiketi ekleri hedefli test/syntax ile doğrulandı; bütünleşik ses koşumu ürün commit'inden önceydi.

Tam npm/uzunCI, kişisel start.bat/temizkurulum, GPU/DRM, canlıLLM ve insan kulağıyla kalite tercihi bu turda denenmedi. Kalıcı diskten farklı servis örneğine dönüş test edildi; ayrı Electron uygulamasını kapatıp yeniden başlatma E2E'si koşulmadı. CI açık kalır ve teslim onu beklemez. Kişisel430untracked/INDEX516/OFFLINE-MANIFEST/silinmişstart.sh korunur; açık kişisel uygulama kapatılmaz.
