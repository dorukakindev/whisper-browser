# R178 — Devin yeniliklerinin Windows yerel kabulü ve eski dal aktarımı

Tarih: 2026-09-28. Repo: `dorukakindev/whisper-browser`.

## İleri yönde bütünleştirme

- Başlangıç yerel `master`: `2c56a253686ca8a2183639c7bff44865fff76d97`.
- Uzak `master`: `7c0a28f911da519aaf07c0fec6f426cebf1adbbc`; 84 yeni erişilebilir commit, 281 dosyalık toplam fark. `git merge --ff-only origin/master` başarılı. Başlangıç hash'i yeni HEAD'in atası; reset/force/temizlik uygulanmadı. Kullanıcının 18 izlenmeyen üst düzey yolu korundu.
- Son yenilikler: renderer yardımcı dosyası ayrımı, altyazı kodlama/dil eşleştirmesi, arama ve katalog hızlandırmaları, RSS abonelik akışı, favicon kalıcılığı, isteğe bağlı DeArrow/RYD, Windows dosya adı/kurulum kontrolleri, kuyruk yarışları ve canlı ASR CPU geri dönüşü. Önceki #64/#65 önizleme/simge düzeltmeleri de master'da.
- GitHub'da 147 PR kaydı ve 137 merge edilmiş dal adı incelendi; açık PR yoktu. Güncel master'ın Windows ve Ubuntu CI sonuçları `success` idi. 68 yerel dal ve 151 uzak ref için ata/`git cherry` envanteri alındı. Squash nedeniyle `+` görünen eski commitler otomatik aktarım adayı sayılmadı.
- `devin/t1`–`t6` serisinin mevcut zamanlama, yakalama, OAuth test kancası, crash-store IO ve Linux kurulum yolları kontrol edildi; eski dosyalar güncel dosyaların üzerine kopyalanmadı. `whard`/`wl` yerel tarihsel dallarının ürün dosyası listeleri alındı; navigasyon, DASH ve filtre yollarından örnekler güncel karşılıklarıyla karşılaştırıldı. Bu envanter bütün tarihsel dalların her satırına yeni bir bug denetimi değildir.
- `codex/r90-deep-bug-hunt` yalnız tarihsel belge; `devin/repo-research-2026-09-25` raporundaki önizleme bulgusu #64'te çözülmüş. `haze/bug-report-2026-09-24` tarihsel rapor/revert içeriyor. Eski `update-skills` merge commitleri ürün değişikliği için taşınmadı.

## Doğrulanmış iki düzeltme

### R178-01 — Hash'in son bloğu eksik toplanıyordu

`origin/codex/bug-catcher-queue-next-moviehash` dalındaki YouTube Sonraki düğmesi onarımı mevcut master'da zaten vardı; aynı dalın hash onarımı yoktu. `src/opensubtitles-hash.js` 64–128 KiB dosyalarda son 64 KiB yerine yalnız örtüşmeyen son kısmı topluyordu. 100000 baytlık bağımsız referans vektörü: eski sonuç `01d017e6b4ff38f4`, beklenen `e09f6020dfa1c6a0`. Yeni regresyon eski kodda kırmızı, üç satırlık ürün değişikliğinden sonra yeşil.

[OpenSubtitles referansı](https://opensubtitles.github.io/oshash/) ilk ve son 64 KiB toplamını tarif eder; aynı sayfa API için minimum 128 KiB şartını da belirtir. Bu düzeltme uygulamanın mevcut küçük-dosya uzantısını tutarlı yapar; sağlayıcının küçük dosyaları kabul ettiğini kanıtlamaz. Mevcut <64 KiB davranışı ve büyük dosya vektörleri korunur. Eski dal bütünüyle cherry-pick edilmedi.

### R178-02 — Başarılı yerleşim testi süreçten çıkmıyordu

`WHISPER_SMOKE_LAYOUT_ONLY=1` koşusu 21 yerleşim kontrolünden sonra `passed` yazmasına rağmen süreç kapanmıyordu. Erken dönüş CDP soketlerini kapatmıyor, dış Electron test sürecinin başarılı yolunda da açık çıkış çağrısı bulunmuyordu. Soket kapatmaları ve başarıdan sonra `process.exit(0)` eklendi. Son aynı koşu yaklaşık 6 saniyede `SMOKE_EXIT=0` verdi. Hata eşiği veya assertion silinmedi.

## Hedefli doğrulama

| Kontrol | Sonuç |
| --- | --- |
| `node --test --test-isolation=none` ile queue-persistence, queue-lifecycle, settings-load-corruption, browser-subtitles, browser-textutil, media-catalog-store, subscription-feed, live-asr-fallback, electron-security, ipc-parity, preload-usage-ratchet, status-copy | 12 dosya geçti |
| Aynı kipte browser-subtitle-search, subtitle-find-replace, subtitle-find-perf | 3 dosya geçti |
| `node tests/install-supply-chain.test.js` | 50 izole kurulum/failure-injection senaryosu geçti |
| `node tests/opensubtitles-hash.test.js` | 4 vektör geçti; yeni vektör eski kodda başarısızdı |
| venv Python `-m unittest backend.test_golden_writers backend.test_writer_roundtrip backend.test_retry_backoff backend.test_ytdlp_update` | 38 unittest + retry modülünün 18 kontrolü geçti |
| `node --check` main/preload/renderer/renderer-helpers/hash/smoke; Python `py_compile` transcribe/update_ytdlp/live_asr/workspace_video_package; `git diff --check` | temiz |
| Ayrı profilli gerçek Windows Electron browser-experience, yalnız layout kipi | 3 boyut × 7 durum = 21; yatay taşma yok, native BrowserView görünürlüğü doğru; son süreç çıkışı 0 |

İlk Electron denemesi sandbox Windows Mojo erişimine takıldı; yetkili sandbox dışı koşu çalıştı. Worktree'de eksik Node paketleri yeniden kurulmadı, mevcut `node_modules` junction ile kullanıldı. İlk çalıştırmalarda test kapanış sorunu ayrı raporlandı; sadece `passed` çıktısı yeterli sayılmadı.

## Sınırlar

Tam `npm test`, uzun soak, canlı/ücretli sağlayıcı, Google hesabı, GPU/DRM ve `start.bat` üzerinden gerçek medya açılışı koşulmadı. `start.bat` ve değişen kurulum betikleri okundu; setlocal/PATH/pause/import akışları ve pinler kontrol edildi. Yerel venv'de ctranslate2 **4.7.2** import başarılı; repo kilidi **4.4.0** istiyor. Bu tur venv'e downgrade/yeniden kurulum uygulanmadı; GPU uyumluluğu yeni kanıtlanmadı. Kullanıcı profili, anahtarlar ve kişisel medya okunmadı/yayımlanmadı. Test logları/sentetik profiller ignore edilen scratch/temp alanında, commit dışında.
