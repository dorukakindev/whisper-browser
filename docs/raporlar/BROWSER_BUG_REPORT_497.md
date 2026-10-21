# BROWSER_BUG_REPORT_497 — Ses anlamı, altyazı kimliği ve arşiv kaybı

Tarih: 2026-10-21. Dal: codex/broad-bugs497.
Başlangıç: ba6e0714808c12bf00a16910bdeb0c66184f772e.
Bitiş ürün commit: 728a698e1e6cb7db317eded1209bace2c54ee2d7.
20 ayrı davranış hatası; model kalitesi garantisi değil, kontrollü yeniden üretim.

| No | Doğrulanan hata ve etkisi | Düzeltme |
|---|---|---|
| 497-01 | Kısaltma 50 dolar → 50 euro değişimini güvenli sayıyordu. | Para birimi kanıtı korunur. |
| 497-02 | Kısaltma soruyu düz ifadeye çevirebiliyordu. | Soru işareti sayısı korunur. |
| 497-03 | Cümle başındaki NASA → NATO değişimi geçiyordu. | Büyük harfli kısaltmalar korunur. |
| 497-04 | Ölçümde < 50 → > 50 değişimi kabul ediliyordu. | Karşılaştırma işaretleri korunur. |
| 497-05 | Geçmiş zaman olumsuzu gelmedi → geldi geçiyordu. | Geçmiş zaman olumsuzluk kanıtı korunur. |
| 497-06 | olabilir → doğru dönüşümü belirsizliği kesinliğe çeviriyordu. | Olasılık ve modal fiil kanıtı korunur. |
| 497-07 | Eski düzeltme farklı açık cueId taşıyan aynı zamanlı satıra uygulanıyordu. | Farklı açık kimliğe zaman/metin fallback yapılmaz; kimliksiz dosya fallback kalır. |
| 497-08 | Zaman düzeltmesi tekrar uygulanınca sourceStart/sourceEnd değişmiş zamana kayıyordu. | Var olan kaynak zamanları korunur. |
| 497-09 | Farklı açık cueId taşıyan eşzamanlı aynı metinler normalizasyonda siliniyordu. | Ayrı kimlikler korunur; kimliksiz rolling tekrar temizliği sürer. |
| 497-10 | LRC offset bilgisi yok sayılıp bütün sözler yanlış zamanda görünüyordu. | Global offset uygulanır, başlangıçta kırpılır, tamamen önce biten satır atlanır. |
| 497-11 | Taşınabilir projede mix:null açılışı TypeError ile düşüyordu. | Eksik/bozuk isteğe bağlı mix varsayılanlara döner. |
| 497-12 | Bağlı SRT silinmişse proje kaydı başarı dönüp altyazıyı sessizce dışarıda bırakıyordu. | Eksik bağlı dosya açık hata üretir; yarım proje temizlenir. |
| 497-13 | Aynı sayfadan ikinci bağımsız seçim arşivi ilk seçimi ve dosyalarını siliyordu. | Seçim içerik kimliği bağımsız kayıttır. |
| 497-14 | Kısmi yeniden çeviri tamamlanmış makale arşivini eziyordu. | Kısmi anlık kayıt ayrı tutulur; tam arşiv korunur. |
| 497-15 | Aynı metin farklı bölümde başka anlam taşırken eski çeviri bölüm kontrolü olmadan aktarılıyordu. | İki tarafta bilinen bölüm bağlamı uyuşmalı. |
| 497-16 | %50 ile 50 aynı kelimelere ayrılıp yüzde kaybı kaliteli sayılıyordu; TTS girdisi % simgesini bırakıyordu. | Yüzde açık seslendirilir ve kaybı review olur. |
| 497-17 | Uzun cümleye fazladan 13 eklenmesi yüksek benzerlikle passed olabiliyordu. | Duyulan ek rakamlar beklenen sayı ifadeleriyle tüketilerek karşılaştırılır. |
| 497-18 | 3 km ve 5 kg → 3 kg ve 5 km, aynı sayı/birim sayısıyla passed olabiliyordu. | Sayı ifadesi ilgili birime bağlı karşılaştırılır. |
| 497-19 | SRT x<y>z ifadesindeki <y> genel HTML sanılıp siliniyordu. | Yalnız bilinen biçimlendirme etiketleri kaldırılır. |
| 497-20 | SRT içindeki NUL/BEL kontrol karakterleri ses modeline kadar gidiyordu. | C0/C1 kontrol karakterleri metin aşamasında temizlenir. |

## Kanıt ve doğrulama

- tests/report497-regressions.test.js: 15 Node davranış testi; eski kopyada 15/15 başarısız, yeni kodda 15/15 geçti.
- tests/test_report497_speech.py: 5 Python davranış testi; eski kopyada 5/5 başarısız, yeni kodda 5/5 geçti.
- Yerel eski kod ve çıktıları ignore edilen tmp/report497/before, node-before.txt, python-before.txt içinde; Git'e kişisel veri konmadı.
- İlgili 10 Node dosyası geçti: report497-regressions, dub-text-guard, browser-subtitle-review, browser-subtitles, browser-translation-archive, dub-workspace, browser-dub-audio, report491-audio, report494-regressions, report495-regressions.
- İlgili 9 Python dosyası geçti: test_report497_speech, test_dub_quality, test_dub_finish, test_dub_plan_regressions, test_dub_timing, test_dub_generation_quality, test_report483_dub_edges, test_report495_audio, test_dub_module_paths.
- Değişen JS ve ana main/preload/renderer node --check; değişen Python py_compile ve git diff --check geçti.
- Windows Electron trusted-bridge smoke --disable-gpu: geçti. İlk sandbox pipe erişim engeli nedeniyle aynı kontrol yetkili çalıştırmayla tekrarlandı; ortam engeli ürün hatası sayılmadı.
- LRC offset yönü [FFmpeg lrcdec kaynak koduyla](https://www.ffmpeg.org/doxygen/8.0/lrcdec_8c_source.html) teyit edildi: pozitif offset zamanı öne alır (zaman eksi offset).

## Sınırlar ve uyumluluk

- Yeni bağımlılık yok. JSON/SQLite şema sürümü değişmedi.
- Ses parça kimliği v8'e yükseltildi: eski anlam kontrolüyle üretilen önbellek yeni kontrolleri atlamaz. Eski WAV silinmez; ilk yeniden üretim daha uzun sürebilir.
- Anlam kontrolü muhafazakâr kanıttır; tüm dilsel anlam değişikliklerini çözmez. Geçerli bazı yeniden ifadeler reddedilirse özgün metin korunur. ASR review üretimi silmez veya engellemez.
- Arşiv yeni bağımsız seçim/kısmi kayıt tutar; önceki sürümün sildiği dosyaları geri getirmez. INDEX_LIMIT 5000 olmaya devam eder.
- Kurulum/start.bat değişmedi; gerçek start.bat açılışı, GPU/CUDA/model, YouTube/DRM, canlı sağlayıcı ve kullanıcı oturumu denenmedi. Ekran düzeni değişmedi; tam görsel UI testi yapılmadı.
- Tam npm test çalıştırılmadı; CI kapatılmadı, teslim CI sonucuna bağlanmadı. Bu tur CI başarısı iddia edilmiyor.
- Önceki teslimler korunarak ayrı dal açıldı; origin/master 957bbfe91edee709accb24624e9e945e7a7a2969. Ana checkout güncellenmedi, merge yapılmadı.
