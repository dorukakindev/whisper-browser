# Rapor790 — Dış denetimin doğrulanması ve dublaj ölçek onarımları

Başlangıç master 1f95a1696a11bc9a194ce29fce7196bcfcd898ad; dal codex/audit-repairs790. Bitiş ürün/test kodu f706884ef24bcb9144f9bfa2e96f6495f38c1330. Kaynak arşiv whisper-browser-final-reports-2026-10-29.zip, SHA256 `c8a4c5ccdaa66632a9d0735eefe194e462a2c8151e451bec3e61a71dc498a8c1`. Arşivin rapor788 ve789 numaraları bağımsız oturumlara aittir; depodaki mevcut R788'in üzerine yazılmadı. Burada kaynak bulgu ID'leri korunarak sonuçlar eşlenmiştir. Arşivdeki öneriler talimat/kanıt olarak otomatik kabul edilmedi; güncel kod ve çalıştırma ile kontrol edildi.

## Madde bazında karar

| Dış ID | Doğrulama ve sonuç |
|---|---|
| B788-01 | Güncel kodda dört yanlış ret yeniden üretildi. Yüzemem, Bu konuşma cümlesidir, Bu arama, Çok geç olmadan artık kabul edilir. Gerçek olumsuzluk kaybı negatiflerle reddedilir. |
| B788-02 | Windows native örneği zaten geçiyordu; POSIX host path varsayılanlarını simüle eden modül testinde ayrıştırma açığı doğrulandı ve kapatıldı. Gerçek Linux bu turda koşulmadı. |
| D789-01 | pause_ms sabit0 doğrulandı. Geri uyum için korundu; yeni pause_before_ms gerçek önceki ses bitişi ile sonraki ses başlangıcından hesaplanır. İki1sn anlatım fixture'ında yaklaşık220ms; ilk parça0. |
| D789-02 | 3.14 metre ve1.5kg doğru telaffuzları review veriyordu. Açık birim/para/yüzde bağlamında noktalı ondalık normalleştirilir; virgül/nokta ve kesrin basamak/tam sayı okumaları aynı sayısal kanıta bağlanır. Yanlış sayı ve birim hâlâ review. |
| D789-03 | Tam np.zeros/concatenate ve abs kopyasının ölçek riski kodda doğrulandı; raporun önceki kod için gerçek OOM ölçümü yok. Uzun zaman çizelgesi diskten sınırlı dilimlerle işlenir; Windows gerçek2saat/48kHz sabit+uyarlanır kabulü aşağıda. |
| D789-04 | Eksik selected_records fixture'ı nedeniyle NameError yeniden üretildi; tam scope sağlandı,6test geçti. Ürün bug'ı diye sayılmadı. Sabit zamanlama fonksiyonu ayrıca saf modüle çıkarılarak model yüklemeden doğrudan sınanabilir oldu. |
| D789-05 | Ortam sorunu, yeni ürün bug'ı değil. İlgili Node testleri zaten os.tmpdir + mkdtemp kullanıyor. Eksik /tmp üst dizini için ürün kodu veya bütün testler değiştirilmedi. |

## Uygulama

- backend/sentence_translation.py, src/turkish-negation-roots.json: ortak kök listesinden olumsuz çekim deseni; mevcut üç kök JSON'a taşındı. Belirgin isim yapıları ile çıplak olumsuz emir ayrılır; before karşılığındaki -madan/-meden, ayrı gerçek negatif fiilleri silmeden ele alınır. Bu tam Türkçe morfoloji çözümleyicisi değildir; until için kanıtsız genişletme yapılmadı.
- src/media-relink-matcher.js: basename ayrıştırması yolun sözdizimine göre win32/posix seçer. Dosya sistemi kimliği/Unicode politikasının mevcut ayrımları korunur.
- tools/voxcpm2/dub_finish.py: açık sayısal bağlama bağlı ondalık kararı. Belirsiz bare3.14, saat/tarih/sürüm/kimlik ve üç basamaklı 0.500 biçimi önceki ihtiyatlı davranışı korur. SPOKEN_TEXT_VERSION tr-spoken-v8-context-decimal; üretim/cache yeni sözlü metin kuralını paylaşır.
- tools/voxcpm2/dub_quality.py: aynı ondalık kararı özgün numeric_reference ile de kullanılır; recognizedText özgün ASR kanıtını korur, decimalEvidence kararın bağlamını kaydeder. Var olan inceleme arayüzü değiştirilmedi.
- Yeni tools/voxcpm2/dub_timeline_storage.py:64kframe bloklarla geçici rawfloat yazma, küçük8MiB altı çıktılarda normal ndarray, uzun işte dosya dilimleri; bütün dosyayı RAM'e alma/eşleme yok. Yazma/tepe sınırlama bloklu; disk ön kontrolü GPU üretiminden önce. Scratch + PCM16 + normalizasyon geçici çıktısı için alan tahmini yapılır; genişleyen adaptif konuşmanın kesin boyutu önceden bilinmez, dolayısıyla bu garanti değil ön tahmindir. Gerçek disk yazma hataları ayrıca yükseltilir. 4GiB üstü WAV için RF64 seçimi eklendi; bu boyutta gerçek çıktı bu turda yazılmadı.
- tools/voxcpm2/dub_timing.py: sabit, adaptif ve kitap anlatımı aynı bounded storage kullanır. Önceki konuşma örneği dışında tüm sesler listede tutulmaz; sabit yol build_fixed_timeline olarak modelden bağımsızdır.
- tools/voxcpm2/altyazi_oku.py: disk ön kontrolü, ortak yazıcı, saf manifest segmentleri. Eski pause_ms0 kalır, yeni pause_before_ms eklenir; WAV/sync zamanlaması değiştirilmez.
- tests/test_audit790.py:7hedefli regresyon, sayı/isim/olumsuzluk gerçek kaybı kontrolleri, manifest boşluğu, diske yazma ve temizlik, süreç ağacı iptali, hata ve disk ön kontrolü.
- tests/media-relink-unicode646.test.js: native ve POSIX varsayılanlarında serializedWindows/POSIX yolları.
- tests/test_report494_audio.py: eksik fixture scope onarımı. Tüm kaynak kesme testleri yeniden yazıldı iddiası yok.
- Yeni tools/dub-timeline-scale-check.py: model/ağ gerektirmeyen açık ölçek ölçümü; geçici üretimler otomatik silinir.

## Gerçek Windows ölçek kabulü

Komut: `python tools/dub-timeline-scale-check.py --seconds 7200 --directory .uiprev`.

Her mod345600000frame,7200sn,48000Hz; son WAV başı/sonu ses içerir, örnek sayısı korunur. Sabit ve adaptif çıktı, scratch ve test klasörü temizlendi. Ölçülen Windows süreç tepe belleği başlangıç 36220928byte; son 38400000byte; ek tepe 2179072byte (yaklaşık2.1MiB). Her modun süre/peak kaydı Git dışı tmp/790-scale-final.json içindedir. Bu yalnız yerleştirme/yazımın ölçümüdür; işletim sistemi dosya önbelleği, GPU/model RAM'i ve gerçek iki saat konuşma sentezi bu sayıya dahil bir başarı iddiası değildir.

Üç kısa fixture'da eski master ile yeni sabit/adaptif/anlatım yolları karşılaştırıldı: örnekler, timing/sync kayıtları ve üretilen WAV dosyasının hash'i birebir aynı (tmp/790-parity.json).

Windows iptali gerçek taskkill /T /F süreç ağacıyla sınandı; scratch kalmadı. İlk test yalnız venv launcher'ını kill ettiği için alt Python hâlâ kapanmaktaydı; test üretimdeki süreç ağacı davranışına düzeltildi. Ürün iptal eşiği gevşetilmedi.

## Hedefli kontroller

- Backend: test_meaning_loss_eval4, test_translation_loop_breakers4, test_speech_translation26 PASS. test_sentence_distribution.py doğrudan48/48 PASS; unittest discover ile0test çıkması başarı sayılmadı.
- Dublaj: test_audit7907, test_dub_timing15, test_dub_finish23, test_dub_quality12, test_report494_audio6, test_dub_generation_quality23, test_dub_module_paths1, test_dub_regeneration6432, report4915/report4937/report4955/report4975 PASS.
- test_dub_acceptance3kontrollütest PASS; araç çıktısı blocked_gpu, gerçek GPU kabulü yapılmadı diye kaydedildi.
- Node: backend-sentence-translation125 kontrol, dub-text-guard ve üç media-relink test dosyası PASS. Gerçek ad/sayı/olumsuzluk kaybı kapıları kapatılmadı.
- Python py_compile, JS node--check ve git diff--check PASS.
- YeniUI yok; görsel tema/screenshot kabulü gerekmedi. start.bat/install.bat değişmedi ve kullanıcı uygulaması kapatılmadı. Tam npm test/CI, Linuxnative, bu yamayla gerçekGPU model sesi/ASR/YouTube koşulmadı. CI açık ve beklenmiyor.

## Yaklaşım ve sınırlar

Yeni bağımlılık kurulmadı, dış kod kopyalanmadı. [NumPy bellek eşleme açıklaması](https://numpy.org/doc/stable/reference/generated/numpy.memmap.html) ve [Python geçici dosya sözleşmesi](https://docs.python.org/3/library/tempfile.html) incelendi. NumPy'nin yaşam süresi/close sınırları ve tüm eşlenmiş working set'i büyütmemek için nihai uzun yol memory-map yerine bloklu dosya dilimleri kullanır. Windows kapanış davranışı doküman iddiasıyla bırakılmayıp gerçek süreç ağacında sınandı.

Arşivdeki kapsamlı CI profil ayrımı ve bütün source-slicing testlerini topluca yeniden yazma önerileri bu pakete alınmadı: doğrulanmış hataları çözmek için gerekli değiller ve hedef dışı geniş refactor olurdu. Yeni denetim kapsamı uydurulmadı; müzik kapsamı genişletilmedi. Ürün100 kalan90 hedefi aktiftir. Kişisel manifest/INDEX/start.sh silinmiş durumu ve untracked dosyalar ana kopya güncellemesinde korunacaktır.
