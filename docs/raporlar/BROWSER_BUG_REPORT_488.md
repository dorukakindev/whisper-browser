# BROWSER_BUG_REPORT_488 — Ses/oynatıcı ve proje sınırlarında 10 hata

Repo: https://github.com/dorukakindev/whisper-browser
Dal: codex/broad-bugs488. PR: https://github.com/dorukakindev/whisper-browser/pull/460
Başlangıç özellik kodu:453d304392545e7df1270fc17a6248e934dbce4f.
Bitiş ürün/test kodu:54f80e22d4bddcdd4b284cecf0565cf5827cf3c3.
Tarama browser ortak ses oturumu, player/önizleme, proje IPC, dışa aktarma,
metin koruma ve ASR doğrulamasını kapsar. Chapter/history/çeviri arşivi de okundu;
yalnız doğrulanan aşağıdaki hatalar değiştirildi.10 bulgu aynı hatanın satır sayısı değildir.

| No | Sorun ve kanıt | Düzeltme |
|---|---|---|
| 488-01 | Kaynak olumlu olduğu halde doğal düzenleme yeni “değil” ekleyebiliyordu. `Bu sonuç kesin doğrudur.`→`Bu sonuç doğru değil.` eski guard:true. | Olumsuzluk kanıtları iki yönde ve çokluklarıyla korunur. Yeni guard:false; semantik eşdeğerlik garantisi değildir. |
| 488-02 | Beklenen2, duyulan12 olduğunda `iki` ifadesi `on iki` içinde bulunuyor; uzun cümlede0,9524 benzerlik nedeniyle yanlış passed. | Sayı ifadesi sınırında diğer sayı sözcükleri varsa eşleşme reddedilir; eksik2 ile review:true. |
| 488-03 | `setOutput(null)` veya URL'siz sonuç önceki voice.src'yi bırakıyordu. | Eski medya src kaldırılır/load edilir; önceki kaydetme yolu da temizlenir. Eski UI testi “cleared output must release old media” ile kırmızı. |
| 488-04 | Müzik/ortam katmanı değiştirilince eski bekleyen play reddi yeni oturumu fail/remove yapıyordu. | Katman değişiminde epoch/pending/wanted yenilenir. Eski kodda session:null; düzeltmede yeni katman devam eder. Browser ve player ortak sınıfı. |
| 488-05 | Önizlemede Durdur/kapat sonrası geç tamamlanan play sesi yeniden başlatabiliyordu; eski hata da yeni önizlemeyi durdurabiliyordu. | Önizleme niyet sayacı, geç sonuç ve hata kontrolü. Katman önizlemesi de aynı yaşam döngüsüne bağlı. Eski kodda “late play completion after stop must be paused” kırmızı. |
| 488-06 | İçe aktarılmış/registry'deki projenin mix/layers alanları save/export isteğinde verilmezse sıfırlanıyordu. | Atlanmış alanlar kayıtlı çıktıdan alınır; açıkça boş layers:{} yine temizler. Eski .2 voice→1; yeni .2 ve music korunur; save+export testli. |
| 488-07 | Proje açmada ilk dosyaya grant verilmişken sonraki kayıp/geçersiz dosya açmayı reddediyordu; kısmi dosya yetkisi kalıyordu. | Tüm dosyalar ve iptal durumu doğrulanmadan hiçbir asset grant edilmez. Eski grants dolu, yeni boş. |
| 488-08 | Proje/kalite metadata tavanı16MB, Python export request tavanı4MB idi. Büyük ama geçerli proje export olmuyordu; stat sonrası sınırsız okuma da vardı. | Export gövdesi16MB ile sınırlı read(MAX+1).4,1MB geçerli JSON okunur;16MB+1 reddedilir. |
| 488-09 | Geçerli görünen range süresi zaman haritasının videoDuration'ından farklı olabiliyordu; video yanlış yerde durup mute/rate sınırı bozulabiliyordu. | Proje yüklerken iki süre .05sn toleransla eşleşmek zorunda. Eski3sn map+4sn range kabul, yeni ret. |
| 488-10 | Tekrarlanan cümle anahtarları kabul ediliyor; iki timeline düğmesi aynı key ile seçiliyor ve yanlış parça regenerate edilebiliyordu. | Model.groups anahtarların tekilliğini doğrular; eski yinelenen grup kabul, yeni açık ret. |

## Kanıt ve testler

- Baseline453d3043'ten ignore edilen tmp/report488/before içine ilgili kaynaklar
  alındı. Yeni browser-dub ve dört report488 testi eski kodda5/5 kırmızı,
  düzeltilen kodda5/5 geçti. Eski UI ayrı iki probe'da eski src ve geç play
  hatalarıyla kırmızı; yeni UI geçti. Negation ve sayı örneklerinde eski/yeni
  gerçek fonksiyon çıktıları karşılaştırıldı. Bunlar kontrollü yerel kanıtlardır.
- `node --test tests/report488-regressions.test.js tests/browser-dub-audio.test.js
  tests/dub-workspace.test.js tests/dub-workspace-ui.test.js
  tests/dub-text-guard.test.js tests/ci-determinism-ratchet.test.js`:12 test geçti.
  Ratchet: random0/0,aux11/11,sleep21/21,wallclock13/13; eşik değiştirilmedi.
- `tests/test_dub_finish.py`:5; `tests/test_dub_quality.py`:4;
  `tests/test_dub_generation_quality.py`:4; `backend/test_dub_export.py`:3 geçti.
  Son testler gerçek FFmpeg WAV/MP4/çift kanal ve senkron kontrolünü içerir.
- `npm run test:electron-bridge` izole profilde geçti.
- DeğişenJS, main/preload/renderer syntax; Python py_compile; git diff --check geçti.
- Ayrı geçici Chrome profilinde bir TR/koyu/1400 ses paneli görsel kontrolü:
  0kontrast/0script hatası; sentetik ekran docs/images/report488-dub.png.
- Windows CI **başarılı**,6m1s; run39370099807/job118455795679,
  HEAD54f80e22. Tam test paketi/Windows bridge/syntax geçti.
  https://github.com/dorukakindev/whisper-browser/actions/runs/39370099807/job/118455795679?pr=460
  Ubuntu sonucu ayrıca beklenmedi. Tam yerel npm test tekrar
  edilmedi. Test silme/eşik gevşetme yok; olumlu guard fixture'ı yeni simetrik
  olumsuzluk sözleşmesine uygun, anlamı aynı kalan bir örnekle değiştirildi.

## Sınırlar

Canlı YouTube/reklam/DRM, gerçek sağlayıcı ve yeni GPU/TTS üretimi bu turda
çalıştırılmadı. Önceki GPU başarısı bu yeni değişikliklerin kanıtı sayılmadı.
Native Windows profile/start.bat restart denenmedi; install/start dosyaları,
GPU bağımlılıkları ve kilitler değişmedi. Yeni bağımlılık/indirme yok.
Ana checkout master957bbfe9 ve kullanıcı untracked dosyaları korundu. Önceki
unmerged ses PR'ları bu dalda korunur; master'a birleştirme yapılmadı.
