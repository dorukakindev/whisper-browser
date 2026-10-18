# Rapor455 — Arka plan sesi önbelleğinin doğrulanması

2026-10-18. Başlangıç: `4d410320a2f4c4445a8058918050f9c6c947b589`.
Bitiş kod commit'i: `69fe7057cf796710c015cbf5025f5b78c6cd5ec6`.
Dal: `codex/browser-whisper-progress-20261014`.

Kullanıcı daha derin inceleme istedi. Bu tur `prepare_background.py` içindeki
indirme seçimi, ayrılmış WAV önbelleği, çıktı yayını ve süre hesapları incelendi.
Yeni test dosyası: `tests/test_background_cache_regressions.py`.

## Doğrulanan düzeltmeler

| No | Kök neden / etkisi | Düzeltme / kanıt |
|---|---|---|
| 455-01 | Sıfır baytlık `.source.webm` varlığı indirmeyi atlatıyordu. yt-dlp de aynı boş final dosyasını varsayılan olarak atlayabiliyordu. | Yalnız dolu normal medya dosyaları seçilir. Geçerli aday yoksa yeniden indirmede `--force-overwrites` kullanılır. İlk regresyon eski kodda "empty cache was treated as a complete download" ile başarısızdı. |
| 455-02 | İndirme sonrası aday filtresinde `.tmp` dışlanmıyordu; süreç başarılı dönüp yalnız geçici dosya bırakırsa o dosya ses kaynağı sayılıyordu. | Önce/sonra aynı medya uzantısı izin listesi, normal dosya ve boyut kontrolü kullanılır. Dizin, symlink ve geçici uzantılar seçilmez. Eski kodda `.tmp` testinde beklenen hata oluşmuyordu; artık çıktı üretilmeden reddedilir. |
| 455-03 | Ayrılmış kanal önbelleğinde yalnız `is_file()` kontrolü vardı; bozuk WAV yeni işe doğrudan kopyalanıyordu. | SoundFile ile WAV/WAVEX/RF64 formatı, pozitif frame ve örnekleme hızı kontrol edilir. Geçersiz önbellek yeniden üretilir. Eski kodda bozuk cache testi hiç çıkarma/ayırma çağrısı olmadığını gösterdi; artık yeniden üretim yapılır. |
| 455-04 | Ayırıcının döndürdüğü dosyada WAV bütünlüğü kontrolü yoktu; bozuk içerik atomik adlandırılmış olsa da hazır sayılıyordu. | Üretilen WAV önbelleğe ve nihai dosyaya kopyalanmadan önce doğrulanır. Bozuk sonuçta mevcut çıktı korunur; main'in mevcut arka plan hatası akışı yalnız dublaj üretimine devam edebilir. Eski kodda koruma testi beklenen hatayı vermiyordu; artık geçer. |
| 455-05 | Varsayılan bitiş `cues[-1].end + 2` idi. İç içe/örtüşen cue'larda son satır önceki satırdan erken bitebilir ve arka plan kesilirdi. | Bütün cue'ların en büyük bitişi kullanılır. 60 saniyede biten ilk cue ve 3 saniyede biten son cue testi ffmpeg'e 62 saniye verildiğini doğrular. |
| 455-06 | CLI'de NaN/Infinity start/end karşılaştırmaları geçip medya çıkarma komutuna taşınabiliyordu. | Sonlu zaman kontrolü dosya çıkarma başlamadan yapılır. NaN başlangıç ve Infinity bitiş testleri reddedilir. |

## Ek olumlu kontroller

- Geçerli WAV önbelleği tekrar ayırma yapmadan aynı içeriği döndürür.
- `.wav` uzantılı FLAC, WAV önbelleği olarak kabul edilmez.
- Gerçek FFmpeg, Türkçe dosya yolundaki kontrollü WAV'ı 4 saniye, 44.1 kHz,
  stereo olarak çıkarır; ikinci turda önbellekten aynı süreyle açılır.
- İndirilmiş kaynak dosyasında yapılan kontrol tam medya decode doğrulaması
  değildir; yalnız normal/dolu dosya ve izin verilen uzantı kontrolüdür.
- WAV kontrolü başlık/format/frame metadata'sını doğrular; her örneğin ses
  kalitesi, konuşmanın korunması veya müziğin başarıyla ayrılması garantisi değildir.

## Kanıt ve sınırlar

İlk dört Python testi ürün düzeltmesinden önce çalıştırıldı ve dördü de
beklenen yanlış davranışla başarısızdı. Son durumda yeni 10 test, mevcut 5
plan testi ve 12 zamanlama testi geçti: toplam 27 Python testi.
Beş hedefli Node dosyası, sözdizimi ve diff kontrolleri de geçti.
Komutlar ve dosya amaçları tarihli devir notunda.

Testler mevcut VoxCPM2 venv'siyle çalıştı. Gerçek ayırma ortamındaki
`soundfile 0.14.0` import'u ayrıca doğrulandı; yeni bağımlılık kurulmadı.
`audio_separator` modeli testlerde fixture'dır. Ağ indirmesi fixture'dır;
gerçek FFmpeg testi ayrı olarak gerçek alt süreci çalıştırır.
Canlı YouTube, gerçek ayırıcı modeli, GPU/CUDA, fiziksel ses ve hesap testleri
yapılmadı. Tam npm test, Electron smoke ve start.bat bu tur çalıştırılmadı;
bu tur ana süreç/renderer veya görünüm değişmedi. Önceki CI incelemesini
bırakma talimatı korundu. Diğer açık rapor maddeleri topluca kapatılmaz.
