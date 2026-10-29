# Rapor 795 — Gerçek sahneyle konuşma çevirisi ve dublaj kabulü

Başlangıç: `83c0af514afa0bfb93271dfeaba14dd3ab01fcde`. Ürün bitişi: `aa4d09a24293ca33058eb150a021be5dcd1bfb48`. Dal: `codex/dub-experience795`.

## Doğrulanan ve düzeltilen iki hata

1. Ses sentezi bitse bile grup etkinliği ASR sırasında sentezde kalıyordu. `dub_activity.observe` artık synthesis/verification ve finished olayı üretir. Üç doğrulama yolu izlenir; renderer sadece aynı aşama/denemenin bitişini kaldırır. Geç sentez bitişi yeni ASR bilgisini silemez. İstisna ve iptal yutulmaz. ASR süresi doğrulama kuyruğunda beklemeyi de içerebilir.
2. Konuşmaya uygun çeviri, kabul edilmiş cümle grubunda kelimeleri komşu cue'ya taşıyınca son kapsam denetimi yanlış eksiklik uyarısı veriyordu. Gerçek DeepSeek çıktısında 6. cue'nun devamı 7. cue'daydı. Son advisory artık kabul edilmiş cümle grubunu karşılaştırır. Gerçek ağır kısalma ve farklı cümleler için kontroller korunur; anlam kapıları/eşikler gevşetilmedi.

## Dört çalışma alanının sonucu

### Gerçek DeepSeek karşılaştırması

Kullanıcının önceki videosunun kaynak SRT'sinden ilk 10 cue, 0.16–38.76 saniye kullanıldı. Video oynatılmadı/indirilmedi; bu, özgün ses duygusunu değerlendiren test değildir. Anahtar güvenli broker'dan yalnız bellekte alındı; standart istekler, Flex yok. Kişisel ayarlar değiştirilmedi.

- Normal çeviri: 7 istek; 2/10 cue kalite kapısından geçmedi, kaynak korundu; kabul başarısız.
- Konuşma çevirisi: son koşuda 2 istek, 10/10 tamam, boş/kaynakta kalan/zaman kayması yok; uyarı yok.
- Tek sahne ve stokastik model sonucu evrensel üstünlük değildir. Normal modun daha katı cue sözleşmesi de sonucu etkiler. Normal modun retleri kabul edildi diye gösterilmedi.
- Kapsam uyarısının eski/yeni davranışı aynı ilk çeviri üzerinde ayrıca karşılaştırıldı; sonraki temiz canlı koşu tek başına düzeltme kanıtı sayılmadı.

### Gerçek GPU A/B ses üretimi

Yeni `tools/voxcpm2/compare_scene.py` opt-in araç; mevcut üretim motoru, aynı metin ve sentetik Türkçe referans, 15 adım / CFG1.65 / sıcaklık0.8 / başlangıç seed42 / paralellik2 kullanır. Satır ve akıcı gruplama farklı istek/grup seed dağılımı oluşturur. Kişisel ses kullanılmadı.

| Örnek | Grup | Üretim | Sonuç |
|---|---:|---:|---|
| A, satır | 10 | 61.609 sn | Bir grup review; final ASR 0.9431, tekrar uyarısı |
| B, akıcı | 5 | 44.204 sn | Tüm gruplar ready; final ASR 1.0 passed |

İkisinde de final WAV sonlu, clipping oranı 0. A soğuk/B sıcak motor olduğundan hız kazancı iddiası yok. Araç A nedeniyle exit3 verdi; bu beklenen dürüst kabul sonucudur. ASR benzerliği doğallık/ruh/ses kimliği puanı değildir. İnsan dinleme tercihi alınmadı, otomatik kazanan yok. Mevcut akıcı varsayılan korunur.

`tools/compare-dub-audio.py` tekrar kullanılabilir rapor fonksiyonu ve temaya uygun iki örnekli dinleme odası sağlar. Yerel sayfa `tmp/scene795/grouping-ab/listen/listen.html`; WAV'ları yerel mutlak URI ile açar, taşınabilir paket değildir. Ham çıktılar kişisel metin içerdiğinden Git'e eklenmedi.

### İptal / devam / referans değişimi

Gerçek motorla ilk grup üretildi, ikinci isteğin gerçek generate çağrısından önce kontrollü bekleme kondu ve iptal edildi. Gerçek CUDA kilitlenmesi taklit edildi diye gösterilmez. İptal 1.11 sn; ilk WAV korundu, motor bırakıldı. Devamda ilk WAV SHA değişmedi, yalnız grup2 üretildi. Grup2 review kaldı. Değiştirilmiş referans aynı motorla yeni WAV hash'ine bağlandı ve ready döndü. Bu yaşam döngüsü kabulüdür, bütün sesler kalite geçti iddiası değildir. Önceki R793 stalled/OOM testleri regresyon olarak tekrar geçti; yeni bulgu sayılmadı.

### Stüdyo kullanımı ve tasarım

- Grup başına Ses/Metin denetimi, deneme ve geçen süre; biten etkinlik temizlenir.
- Hazır/inceleme/üretilemedi sayıları, ilk işaretli grubu seçme, sonraki işaretliye döngüsel geçiş.
- Alt bölümden incelemeye gitme; plan yoksa güvenli hazırlayıp seçili grubun metnine gitme. Dinleme/yeniden üretme yolları korunur.
- Paralel aşama sürelerinin duvar saatinden uzun olabileceği açıklanır.
- Grafit/amber token'ları, saran küçük etkinlik etiketleri; gereksiz sürekli animasyon eklenmedi. Diğer stüdyo sayfaları yeniden tasarlanmadı.
- Native Electron ana/preload/renderer: TR koyu1440px100%, EN açık900px125%; 8 eşzamanlı etkinlik, sonuç ve kanıt ekranları toplam6 gerçek PNG. Taşma yok, footer görünür, içerik footer üzerinde kayar. Düzenleme planı başlangıçta yokken etkileşim denendi. Final EN kanıt görüntüsü ayrıca gözle kontrol edildi; ilk TR aktif/EN sonuç da incelendi.
- Yerel dinleme HTML'i Windows Edge ayrı profilde 1200x900 ve 560x1200 görüntülenip gözle kontrol edildi. Dar görünüm tek sütun; metin/audio taşması görülmedi. Bu ölçümler bütün ekranların estetik denetimi değildir.

## Kontroller

- `node --test tests/dub-generator-ui.test.js tests/dub-service.test.js tests/ui-locale.test.js`: 3 dosya geçti (locale14 assertion). İlk locale koşusunda eksik3 sözlük girdisi bulundu ve eklendi; test gevşetilmedi.
- `PYTHONPATH=backend ... -m unittest backend.test_speech_translation`: 28 geçti.
- `... -m unittest tests.test_dub_generation_quality tests.test_dub_activity795`: 27 geçti (activity1 metodunda hata+iptal).
- Değişen Python py_compile, renderer/helper node --check, git diff --check geçti.
- İlk sandbox Node koşusu EPERM; aynı hedefli komut Windows alt süreç yetkisiyle geçti. Birleşik Python komutunda backend test yolu eksikti; PYTHONPATH düzeltilince 28 geçti.
- Native kontrollü IPC testi gerçek GPU testi değildir; ayrı gerçek GPU kanıtı yukarıdadır. Native stderr'deki MaxListenersExceededWarning ve izole ortam fetch hatası gizlenmedi; smoke kabulünü bozmadı, kök nedeni bu tur kapsam dışı.
- Tam npm test / CI beklenmedi. start.bat yeniden açılışı, bütün YouTube akışı, gerçek kaynak duygu aktarımı, kişisel referans, gerçek uzun süreli CUDA timeout koşulmadı. Kullanıcının açık uygulaması kapatılmadı.

## Açık kaynak ve bağımlılık

[OpenBMB/VoxCPM](https://github.com/OpenBMB/VoxCPM) ve resmî yönlendirdiği [nano-vLLM-VoxCPM](https://github.com/a710128/nanovllm-voxcpm) referans/async üretim yaklaşımı tekrar incelendi. Mevcut motor ve referans sözleşmesi kullanıldı; README performans iddiaları yerel ölçüm yerine konmadı. Bu tur dış kod kopyalanmadı, bağımlılık/sürüm/model ağırlığı/kurulum/kalıcı ayar şeması değiştirilmedi. Yeni araç mevcut Python, numpy, soundfile ve ASR ortamını kullanır. OpenBMB sayfasının güncel lisansı Apache2.0; model dağıtımı değişmedi.

## Kanıtlar ve dosya kapsamı

Sanitize özetler: [çeviri](evidence795/translation.json), [gruplama](evidence795/grouping.json), [yaşam döngüsü](evidence795/lifecycle.json), [native UI](evidence795/native-ui.json). Ham model yanıtı/metin/ses/profil/anahtar Git dışında.

Dosyalar: transcribe + speech test grup kapsamını; dub-activity + dub_activity + altyazi_oku aşama sözleşmesini; dub-generator-ui + index + media-experience.css + ui-locale stüdyo gezinmesini; UI/service/activity/native testleri regresyonları; translation-deepseek-live normal/speech karşılaştırmasını; compare_scene ve compare-dub-audio üretim/dinleme karşılaştırmasını sağlar. Kişisel ana kopya değişiklikleri teslim dışıdır.
