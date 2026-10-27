# Rapor 665 — Çoklu müzik referansı, açıklamalı sıralama ve geri alınabilir tercihler

Başlangıç master: `d1cbad8d945a39bf74451e84a6484c41c17dc73b`.
Dal: `codex/music-taste665`.
Bitiş ürün commit: `04a372f6dcc48214c628e41053ec4169453835b4`.

## Teslim edilen kullanım

Müzik → Analiz et içinde kaynak/aralık seçip **Bu kesiti ekle** ile en fazla üç referans toplanır. Aynı parçanın farklı kesitleri veya farklı yerel dosyalar eklenebilir. Kaynak değişince karışım korunur; çipteki kaldır düğmesi yalnız o kesiti çıkarır. Karışım boşsa önceki tek referans akışı kullanılır. Karışım bu panel oturumuna aittir; diske ses veya referans listesi yazılmaz.

Arşiv ve internet önizlemelerinde her adayın her referansa ses benzerliği ayrı hesaplanır. Nihai puan bunların eşit ağırlıklı ortalamasıdır. Sonuç satırında referans başlığı, aralığı ve ayrı puanı görünür. Bu puan beğenme olasılığı değildir; gitar, vokal veya duygu ölçümü yapıldığı iddia edilmez.

**Beğenmedim** sonucu gizler. **Gizlenen parçalar** alanında geri alınabilir. Gizleme sağlayıcı + parça ID'sine bağlıdır; aynı sayısal Deezer/yerel ID birbirini etkilemez. Yerel `userData/music-preferences.json` sürüm1 dosyası yalnız provider/id/title saklar. 500 satır ve 300 KB okuma sınırı, atomik yazma kullanılır. Ses, vektör, kişisel dosya yolu ve signed önizleme URL'si saklanmaz. Eksik dosya boş tercih listesidir; bozuk dosya sessizce ezilmez.

Asistanın mevcut müzik aracı `add_reference`, `remove_reference` (isteğe bağlı kesin aralık), `clear_references`, `hide_match` ve `restore_match` eylemlerini sunar. Kaynak ve sonuç kimlikleri doğrulanır; keyfi dosya/URL veya shell yeteneği eklenmez. Durum okuması referansları, gizlenen ilk50 kimliği/toplamı ve gerçek ayrı referans puanlarını verir; yerel dosya URL'leri modele gösterilmez.

## Doğruluk ve sınırlar

- Ana süreç en fazla üç geçerli, kayıtlı referans ve aralık kabul eder; duplicate kesit, bilinmeyen/eski source ID ve hatalı aralık iş açılmadan reddedilir.
- Worker aynı model uzayındaki her referansı ayrı normalize eder. Tüm referansların kendisi/içerik kopyaları sonuçlardan çıkarılır. Aynı sanatçıyı dışlama seçeneği etkinse bütün referans sanatçıları dikkate alınır.
- A/B için adayın en yakın olduğu referans ve ölçülen kesit kullanılır. Bu referans o anda seçili dosyadan farklıysa ayrı gizli audio elemanı doğru yerel dosyayı çalar; iki ses üst üste çalmaz. Nihai ortalama ile A/B için seçilen en yakın referans farklı kavramlardır ve ayrı puanlar gösterilir.
- Karışım değişince eski yerel puanlar temizlenir; internet sonuçları yeniden katalog kanıtına döner, ölçülmüş gibi kalmaz. Durumdaki `referenceMixMatches` mevcut karışımla son işin eşleşmesini belirtir.
- Gizli parçalar ana süreçte arama adaylarından da çıkarılır. Açık listedeki gizleme anında uygulanır; geri alınan parça mevcut listede varsa yeniden görünür, yeni arama gerekiyorsa kullanıcı aramayı tekrar başlatır.
- İnternet hâlâ katalogdan en fazla sekiz erişilebilir, en fazla30 saniyelik önizlemenin CLAP karşılaştırmasıdır. Yeni katalog/abonelik/API anahtarı/ücretli servis eklenmedi. Tam eser veya tüm internet indeksi değildir.

## Kanıtlar

- 21 hedefli Node kontrolü PASS: music-preferences, music-analysis, music-similarity, assistant-music, assistant-capabilities, assistant-app-actions ve music-online.
- `python -m unittest tests/test_music_similarity.py`: 6 PASS. Yeni vektör kontrolü iki referansın ortalamasını, dengeli adayın sıralamasını, tek referans uyumluluğunu, self/kopya/model uzayı ve çoklu sanatçı dışlamasını sınar. 12 JS sözdizimi, Python py_compile ve diff kontrolü PASS.
- Gerçek Windows yerel CLAP: `.uiprev/music665/1793131667997` PASS. İki referans: Vibe Ace 0–10 sn ve Jazz trumpet loop 0–5 sn; adayın puanları0.98517/0.33152, ortalama0.65834. Doğru farklı referans A/B, üç referans sınırı, kesin kesit kaldırma, karışım değişiminde eski puanların reddi, paneli yeniden açıp gizlemeyi geri alma, geniş/dar görünüm geçti. [Temiz JSON](MUSIC_TASTE_2026-10-27/native-local.json).
- Gerçek Windows canlı Deezer + CLAP: `.uiprev/music665-online/1793131859514` PASS. Aynı referansın iki farklı kesitiyle8önizleme ölçüldü; her aday iki ayrı puan taşıdı. A/B, normal dinleme, iptal temizliği, katalog gizle/geri al, kaynak kanıtı ve karışım değişince preview puanlarının kaldırılması geçti. [Temiz JSON](MUSIC_TASTE_2026-10-27/native-online.json).
- Geniş/dar ekranlar görüntülenip incelendi; ham profil/ses/görüntüler Git'e alınmadı. CC-BY Librosa fixture'ları kullanıldı; kişisel ses/anahtar/profil kullanılmadı.
- İlk native düzeneklerde backend tamamlanmasını UI poll tamamlanmasıyla aynı an sanma ve kapanışın Promise callback'ini beklememe yüzünden başarısızlıklar oldu. Testler doğru olay/sınırı bekleyecek şekilde düzeltildi; eşikler gevşetilmedi, ürün başarısı diye sayılmadı.

Önceki1000denetim kapsamı kontrol edildi; müzik alanı bu kayıtta bulunmuyor. R661/R664 temelleri yeni keşif diye sayılmadı, değişen kodun regresyonları olarak kullanıldı.

## Dosyalar ve kaynaklar

| Dosya | Amaç |
|---|---|
| src/music-preferences.js | Sınırlı, atomik, sağlayıcı kimlikli gizleme kaydı |
| src/music-analysis-service.js | Kesin referans/aralık doğrulama ve tercihler IPC eylemleri |
| src/music-similarity.js | Gizli aday filtresi, çoklu referans payload ve güvenilir referans dosya bağlama |
| backend/music_similarity.py | Eşit ağırlıklı çoklu referans skoru ve ölçüm gerekçesi |
| src/renderer/music-analysis-ui.js | Referans çipleri, gizlenenleri geri alma, doğru A/B, eski skor iptali ve asistan eylemleri |
| src/renderer/music-online-ui.js | Gizleme/geri alma, referans puanı açıklamaları, karışım değişince kanıtı sıfırlama |
| src/renderer/music-analysis.css | Mevcut tokenlarla responsive referans ve tercih düzeni |
| src/assistant-capabilities.js | Tipli referans/tercih eylemleri ve EN/TR kartlar |
| tests/music-preferences.test.js ve değişen hedefli testler | Kalıcılık, kimlik, aralık, filtreleme ve sayısal ortalama |
| tests/electron-music665*.smoke.js | Gerçek Windows yerel/canlı internet kabulü |

[Yararlanılan kaynaklar](MUSIC_TASTE_2026-10-27/SOURCES.md). Yeni paket veya model indirilmedi; install/start dosyaları değiştirilmedi. Yeni IPC kanalı yok; mevcut music-analysis kanalına sınırlı eylemler eklendi. Tek yeni veri şeması preferences version1.

## Doğrulanmayanlar

Canlı LLM'nin yeni araçları seçmesi, tüm proposal-card UI, üretim start.bat açılışı, temiz Windows kurulumu, GPU/DRM ve uzun soak bu turda yapılmadı. Kör insan dinleme kıyası yapılmadı; “en iyi/Cyanite'tan iyi” iddiası yok. Mevcut11 before-quit listener uyarısı açık. Tam test ve CI beklenmedi. Duygu/enstrüman/vokal tanıma, öğrenilen kişisel beğeni modeli, çalma listesi öneri/onay akışı ve ek sağlayıcılar sonraki kapsamdır.
