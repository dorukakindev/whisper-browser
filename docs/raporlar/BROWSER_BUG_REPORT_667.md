# Rapor667 — Ses tarifiyle keşif ve onaylı yerel çalma listesi

Başlangıç master `c5b04477abe3102b13302c0dbbebbf4f345579bb`; dal `codex/music-intent667`; ürün bitiş `e49e6c73797cbf6bfc49d64647cc91a8a93ea8c0`.

## Kullanım

Müzik → Analiz et içinde **Aradığın sesi tarif et** alanı vardır. Daha sakin, akustik gitar, enerjik ritim ve enstrümantal Türkçe hazır seçenekleri modelin İngilizce pozitif açıklamasını doldurur. Özel açıklama İngilizcedir; CLAP'ın Türkçeyi veya karmaşık olumsuz ifadeleri güvenilir anladığı iddia edilmez. Asistan `set_music_intent` ile Türkçe isteği kısa İngilizce ses tarifine dönüştürerek alanı ayarlayabilir; bu turda canlı LLM komut seçimi denenmedi.

Hafif/dengeli/güçlü etki15/35/60yüzde ağırlıklardır. Nihai puan `(1-w)*audioScore + w*intentScore`; yüzdeler beğeni/güven olasılığı değildir. Ses puanı mevcut referans karışımının ortalaması, tarif puanı örneklenen aday kesitlerinin normalize ses–metin cosine ortalamasıdır. Sonuçlarda ayrı bileşenler ve gerçek açıklama görünür. Tarif boşsa önceki ses araması kullanılır. Aynı akış yerel aramada ve en fazla8internet önizlemesinde çalışır.

**Sanatçı çeşitliliği** etkinse normalize edilmiş bilinen sanatçı adı başına en fazla iki parça gösterilir; sanatçısı bilinmeyenler birbirinin kopyası sayılmaz. Bu bir tür/ruh çeşitliliği sınıflandırıcısı değildir.

Yerel sonuçları kutucuklarla seç → **Seçilen listeyi incele** → ad ve sıralamayı gör → **Çalma listesini oluştur**. Arama, seçim veya taslak hazırlama kendiliğinden liste yazmaz. Asistan `select_match` ve `propose_playlist` ile yalnız bu incelemeyi hazırlayabilir. `playlistDraft.status=review` oluşturulmuş liste değildir; kayıt başarılı olunca ID ile `created` olur. Liste mevcut Müzik sayfasında oynatılır. İnternet kayıtları mevcut keşif listesi/önizleme akışını korur; tam şarkı dosyası veya tam internet çalma listesi oluşturulduğu söylenmez.

## Kod ve doğruluk

- backend/music_similarity.py: tüm uygun adaylar metinle yeniden puanlanır; önce20'ye kırpıp iyi bir tarif eşleşmesini kaybetmez. Tek model uzayında sabitlenmiş CLAP metin vektörü; sıfır/NaN/yanlış boyut ve ağırlık reddi. Sanatçı sınırı puanlamadan sonra. Mevcut kendisi/kopya/gizli parça filtresi korunur.
- backend/music_tags.py: pinli yerel tokenizer/text encoder ortak fonksiyona alındı; etiket analizi tek model yüklemesi/batch kullanır. Yeni model, paket veya runtime pip yok. Metin çalıştırılmaz, yalnız tokenize edilir; ses gönderilmez.
- src/music-similarity.js: tarif max300karakter ve ağırlık0–0.6; mevcut job kilidi/iptal. src/renderer/music-analysis-ui.js/CSS: Türkçe preset/özel tarif, ayrı skorlar, seçim ve açık inceleme alanı. Tarif/karışım değişiminde eski sonuçlar temizlenir. Özel açıklama varken preset yanlışlıkla yalnız referans göstermez.
- src/renderer/music-online-ui.js: canlı önizlemede ayrı ses/tarif puanları, güncel açıklama kanıtı. src/assistant-capabilities.js/assistant-music-actions.js: tipli ayar/seçim/taslak eylemleri, gerçek sonuç bağlamı; keyfi dosya/URL/shell yok.
- src/media-shelf-service.js: önceki playlist-save kullanıcı incelemesindeki sırayı yok sayıp kütüphane sırasını kullanıyordu. Artık seçilen sıra korunur, tekrarlar ayıklanır, bilinmeyen ID varsa bütün kayıt reddedilir; kısmi sessiz liste yazılmaz. Başarılı cevap oluşturulan ID'yi döndürür.
- Native testlerde R666'nın yeni etiket düğmesi eski `button:not(.ml-primary)` Durdur seçicisini geçersiz kılmıştı. Durdur için ayrı `.ml-cancel` seçicisi verildi; R664/R665 ve yeni native senaryo doğru düğmeye bağlandı. Bu, ürün Durdur arızası diye sayılmadı.

## Kaynaklar

[LAION hook.py](https://github.com/LAION-AI/CLAP/blob/main/src/laion_clap/hook.py) gerçek text/audio embedding yolu ve [resmî checkpoint](https://huggingface.co/laion/clap-htsat-unfused) yeniden incelendi. Kod CC0, mevcut model Apache2; önceki sabit revizyon korunur. Yeni SDK alınmadı, dış kod kopyalanmadı. Ağırlıklı karışım ve sanatçı sınırı bizim açık ürün kurallarımızdır; upstream'in kalibre öneri modeli gibi sunulmaz. Önceki R659–R666 altyapısı kullanıldı.

## Doğrulama

24 hedefli Node PASS: media-shelf-service, music-playlist667, music-analysis, music-similarity, assistant-music, assistant-capabilities, assistant-app-actions, music-online. İlk sandbox koşusunda Python discovery engellendi; mevcut venv WHISPER_TEST_PYTHON ile açıkça seçilip izinli subprocess ortamında geçti. 10 Python PASS (music_similarity/music_tags): açık skor karışımı, sanatçı sınırı, sıfır/NaN reddi, ilk20öncesi aday koruması. 12 JS syntax, py_compile/diff PASS.

Gerçek Windows yerel native `.uiprev/music667/1793134498873` PASS. Trompet tarifinde adayın ses0.32726/tarif0.64826, toplam0.51986; diğer aday ses0.98517/tarif0.11459, toplam0.46282. Böylece tarifin gerçek vektörle sıralamaya etkisi sınandı; bu bir insan beğenisi kalite ispatı değildir. Liste incelemesi öncesi/sonrası disk boş, yalnız Create düğmesiyle kayıt; gösterilen sıra, gerçek created ID ve dar/geniş ekran geçti. [Temiz yerel kanıt](MUSIC_INTENT_2026-10-27/native-local.json).

Canlı Deezer+CLAP native `.uiprev/music667-online/1793134356015` PASS: iki referans,8önizleme, Calm gentle relaxing music açıklaması ve35yüzde karışımın aritmetiği, A/B, iptal temizliği, gizle/geri al ve karışım değişiminde eski kanıtın kaldırılması. [Temiz internet kanıtı](MUSIC_INTENT_2026-10-27/native-online.json). İlk koşuda eski Durdur seçicisi yanlış düğmeye bastığı için iptal beklemesi başarısızdı; seçici düzeltildi ve tekrar geçti. Sonraki özel preset/puan etiketi kozmetiği ayrıca son yerel native ile kontrol edildi.

Etiket ekranı regresyonu `.uiprev/music666/1793134302649` PASS. İnceleme ve ses tarifi dahil geniş/dar görüntüler incelendi; ham profil/görüntü/sesler Git'e konmadı. Native koşular başlangıç HEAD üzerinde ürün çalışma ağacında, commit öncesinde yapıldı; sonuçlar görülmeden yeşil denmedi.

## Sınırlar

Yeni bağımlılık/kurulum/model indirme/IPC kanalı veya kalıcı şema yok; mevcut playlist kaydının sırası ve cevapID'si güçlendirildi. install.bat/start.bat değişmedi. Üretim start.bat açılışı, temiz kurulum, GPU/DRM, uzun soak, canlı LLM, Türkçe CLAP kalite testi, kör insan dinleme ve tüm internet katalogları denenmedi. İnternet yalnız erişilebilir katalog adaylarının önizlemeleridir. Kişisel zevk eğitimi veya güvenilir göreli sakinlik/negasyon filtresi kurulmadı. Mevcut11listener uyarısı açık; CI beklenmedi. Birinci aşamanın uzman sınıflandırıcı kıyası da hâlâ açıktır.
