# Rapor468 — Dublaj metninde ayırıcı ve biçimlendirme hataları

2026-10-18. Kullanıcı yeni hataları bulup düzeltmemizi istedi.
Başlangıç: `df3d34a3314fe323092bd86b430175a059340b54`.
Kod: `27bc2a2a1c78638b20a61f93001cc6ad0e36eade`.
Dal: `codex/browser-whisper-progress-20261014`.

## Doğrulanan ve düzeltilenler

1. **468-01 / Orta:** `tools/voxcpm2/dub_plan.py::parse_srt`, yalnız
   tam boş satırı blok ayırıcısı sayıyordu. Boşluk/tab içeren boş satırda
   ilk cue'nun metnine sonraki cue numarası, zaman kodu ve konuşması da
   giriyordu. İkinci konuşma ayrıca kendi cue'sunda da okunabiliyordu.
   Satır sonları normalize edildikten sonra yatay boşluklu boş satırlar
   gerçek boş satıra dönüştürülür. Zamanlar ve kaynak byte hash değişmez.
2. **468-02 / Orta:** HTML karakter referansları (`&amp;`, `&quot;`,
   `&#351;`) çözülmeden TTS metnine aktarılıyordu. Standart kütüphanenin
   `html.unescape` işlemi markup kaldırıldıktan sonra bir kez uygulanır.
   Böylece `&lt;3` metni `<3` olarak kalır; yeniden etiket sanılıp silinmez.
3. **468-03 / Orta:** Bütün etiketleri boşlukla değiştirmek `Türk<i>çe</i>`
   gibi kelime içi biçimlendirmede `Türk çe` üretiyordu. Satır kırma
   `<br>` etiketleri boşluğa, inline stil/ASS etiketleri boş metne çevrilir.
   Sözcük içi bütünlük ve satırlar arası ayrım korunur.

Ortak okuyucuyu dublaj planı, gerçek ses üreticisi ve arka plan ayırma
planı kullanır. Ses cache anahtarı temizlenmiş konuşma metnini zaten içerir;
etkilenen metnin eski hatalı ses önbelleği yeniden kullanılmaz. Mevcut
üretimler/kişisel dosyalar silinmedi veya yeniden üretilmedi.

## Kanıt ve testler

Yeni `tests/test_report468_regressions.py` düzeltme öncesi üç testte
beş assertion/subtest hatası verdi; düzeltmeden sonra tamamı geçti.
CRLF, boşluk/tab ayırıcıları, Türkçe, sayısal/named entity, tek çözümleme,
kelime içi italik, ASS stil ve HTML satır sonları doğrulandı.

Windows venv Python ile:

- `tests/test_report468_regressions.py`: 3 geçti.
- `tests/test_dub_plan_regressions.py`: 5 geçti.
- `tests/test_report467_regressions.py`: 3 geçti.
- `tests/test_dub_timing.py`: 12 geçti.
- `tests/test_background_cache_regressions.py`: 14 geçti.
- `-m py_compile tools/voxcpm2/dub_plan.py`: geçti.

Node: `dub-service`, `report454-regressions`, `report460-regressions`,
`windows-package-ignore`, `package-integrity` test dosyaları geçti.
`git diff --check` geçti. Değişen ürün dosyası yalnız Python okuyucudur;
UI/CSS, IPC, kurulum ve kalıcı şema değişmedi. Yeni bağımlılık yok.

Tam npm test, normal start.bat arayüzü, gerçek YouTube, GPU/CUDA,
gerçek TTS/model/dinleme ve uzak CI bu tur çalıştırılmadı. Bu hedefli
tarama uygulamanın tamamının hatasız olduğuna dair iddia değildir.
