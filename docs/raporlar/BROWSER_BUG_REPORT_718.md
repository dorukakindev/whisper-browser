# Rapor718 — Gerçek GPU iptal ve yeniden başlatma kabulü

Başlangıç `d0f13e2e98a78bb50dcb7285f283d85a137917e1`; test/araç bitişi `e20e7db935d31a27c0d14302b02f30d080410ecb`. Dal codex/gpu-cancel718. Yeni ürün bugı: **0**; mevcut çalışan motor iptal sözleşmesi gerçek donanımla doğrulandı. 100 hedef sayısını doldurmak için test sonucu bug diye sunulmadı.

## Gerçek sınır

`tools/dub-gpu-cancel-check.cjs` açık --run-real-gpu-cancel ister. Gerçek src/dub-engine-worker, production process-lifecycle terminateProcessTreeAndWait, gerçek Python dub_worker/altyazi_oku/nano-vLLM/VoxCPM2, gerçek RTX4070SUPER kullanır. Sentetik SAPI referans+Türkçe paragraf; özel uygulama profili/anahtarı/API/kullanıcı ayarı kullanılmaz. Node aracıdır; gerçek UI Durdur düğmesi veya dub:cancel IPC uçtan uca akışı değildir.

Kaynak onayı, model hazırlığı ve sentez aktivitesi ayrılır. Nihai araç DUB_ACTIVITY synthesis görüldüğünü, işin hâlâ aktif olduğunu ve gerçek çocuk süreçlerinin bulunduğunu şart koşar. Her çağrının kayıtlı tek seed'i önceki testin cache yolunu yanlışlıkla gerçek sentez saymayı önler; iptal ve yeniden başlatma aynı seed/ayarları kullanır. İptal sadece aracın sahibi olduğu process handle/PID üzerinden yapılır. Makine çapında Python/GPU kill yok. Süreç ağacı sorgusu yalnız kendi kökünün çocuk PID'lerini toplar; ad/komut satırı/kullanıcı bilgisi kaydedilmez.

## Donanım kanıtları

[İlk koşu](GPU718_2026-10-28/acceptance-1.json): prototip, gerçek logda synthesis aktif;3child,188msiptal,exit1,nihaiWAVyok; yeni host exit0/45.828s. [Nihai araç koşusu](GPU718_2026-10-28/acceptance-2.json):3child,165msiptal,exit1,nihaiWAVyok; yeni host exit0/42.953s. Her koşuda gözlenen tüm sahipli PID'ler kapalı ve worker.running false. Yeniden açılan motorun DUB_ENGINE reused false olması da doğrulandı.

Bellek snapshotları ilk10873MiB→10873MiB, ikinci10882MiB→10882MiB boş (toplam12282MiB). Bunlar bütün GPU snapshotlarıdır, başka süreç etkisi dışlanmış nedensel VRAM ölçümü değildir; ilk iptalin hemen ardından ayrı bellek ölçümü yapılmadı. Yeni iş bitince sıcak motor ayrıca release edildi, gözlenen çocuklar da kapandı.

Her iki yeniden üretim ready/ASR passed .9677. ASR 'kontrollü' yerine 'kontrolü' yazdı; bu otomatik bütünlük kanıtı, kusursuz telaffuz/insan doğallık kararı değildir. Sesin estetik A/B tercihi kullanıcı dinlemesine bağlı kalır. Ham log/WAV/cache/profil Git'e eklenmedi. Sentetik türetilmiş JSON kanıtları yayımlandı.

## Tekrar çalıştırma

```powershell
node tools/dub-gpu-cancel-check.cjs --run-real-gpu-cancel --engine "C:\Users\K\Desktop\Ses\VoxCPM2" --reference "<sentetik-reference.wav>" --verify-python "D:\Whisper Local\backend\venv\Scripts\python.exe"
```

Motor ve modeller önceden kurulu olmalı. HF_HUB_OFFLINE=1; indirme/ağ/ücretliAPI yok. Araç .uiprev/gpu-cancel altında sonuç/log/WAV üretir. Mevcut motorun kitap_ortak OUTPUT_ROOT önbelleği kullanılır; yalnız sentetik içerik/ayarlara ait cache kayıtları eklenebilir. Kişisel üretim başlatmaz. Başka ağır GPU işini kapatmaz; yeterli boş bellek önkoşuldur. Kullanıcının çalışan uygulaması kapatılmadı.

## Diğer kontroller ve kaynaklar

12Node subtest PASS: dub-engine-worker + report523-worker-ownership (ikinci dosya kendi7kontrolünü de PASS yazdı). Syntax ve diff PASS. Mevcut sözleşmeler yeniden kullanıldı; yeni1000senaryo keşfi sayılmadı. No dependency/ayar/şema/UI değişikliği, yeni screenshot gerektiren değişiklik yok.

[Python multiprocessing](https://docs.python.org/3/library/multiprocessing.html#multiprocessing.Process.terminate) çocukların tek parent terminate ile otomatik kapanmayabileceğini belirtir; [Windows taskkill /T](https://learn.microsoft.com/en-us/windows-server/administration/windows-commands/taskkill) ağaç sonlandırma sözleşmesidir. Mevcut proje taskkill/close bekleme kodu incelendi ve kullanıldı; dış kod/lisanslı kütüphane alınmadı.

P047 **kısmi**: gerçek GPU sentezde ağaç iptali ve fresh restart doğrulandı. UI Durdur, doğrulama/normalizasyon sırasında iptal, işletim sistemi shutdown, OOM, son-parça stall, karışık üretim çakışması tümü hâlâ ayrı kabul gerektirir. P048 tamamlandı sayılmaz. start.bat/install.bat bu Node donanım aracıyla sınanmadı, dosyaları değişmedi. CI/tamtest beklenmedi. Müzik P081–P090 kapsam dışı, diğer90hedef devam eder.
