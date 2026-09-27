# BROWSER_BUG_REPORT_133 — Son altyazı önizlemesi zorunlu temizlikten sonra bayat kalabiliyordu

Tarih: 2026-09-27. Temel: GitHub `master` `2c56a253686ca8a2183639c7bff44865fff76d97`.

## Kesin bulgu

`backend/transcribe.py` akıştaki `segment` olaylarını son temizleme öncesinde yayımlıyor. Son `preview_refresh` ise yalnız seçili seçeneklerden biri açıksa yayımlanıyordu. `apply_dedupe_policy(..., extended=False)` örtüşen aynı cue'ları seçenekler kapalıyken de birleştirir. `fix_common_errors`, `drop_repeated_hallucinations` ve `snap_to_speech` de son listeyi değiştirebilir. Bu durumda diske yazılan nihai cue listesi ile renderer önizlemesi ayrışır; silinen cue kalır ve sonraki çeviri indeksleri yanlış satıra bağlanabilir. Kaynak bulgu Devin'in `devin/repo-research-2026-09-25` dalındaki R124 statik denetimidir; bu turda güncel `master` kod yolunda ve sahte motorla yeniden doğrulandı.

## Düzeltme ve kanıt

- Akışta yayımlanan `entries` anlık görüntüsü tutuluyor. Noktalama onarımı ara yenileme yayımlarsa karşılaştırma temeli güncelleniyor.
- Son liste mevcut önizlemeden farklıysa `preview_refresh` yayımlanıyor. Boş yere büyük liste yeniden gönderilmiyor.
- `test_preview_refresh_after_mandatory_dedupe_with_optional_processing_off`: iki örtüşen, aynı metinli sahte segment akıyor; tüm ilgili isteğe bağlı temizlik seçenekleri kapalı. İki `segment` olayından sonra tek satırlı nihai `preview_refresh` bekleniyor. Gerçek medya, model, ağ, profil ve anahtar kullanılmıyor.
- Hedefli Python: 2 geçti. Son paketlerin Node regresyonları: 7 + 6 + 9 geçti. Python sözdizimi ve `git diff --check` temiz.

## Dal denetimi

Yerel `master`, `6e3c452` → `2c56a25` fast-forward ile güncellendi; izlenmeyen dosyalara dokunulmadı. Devin'in yeni test becerisi değişikliği `#62` ile zaten `master`da. `codex/paket-v2` dalındaki YouTube zaman sınırı test düzeltmesi de güncel dosyada mevcut. `devin/repo-research-2026-09-25` dalı eski ürün kodu temelli belge/araştırma taşıyor; son 15 `master` commit'iyle aynı kod tabanında geliştirilmemiş. Bu yüzden doğrulanmış R124 bulgusu güncel kod üzerinde ayrı düzeltildi.

## Sınırlar

Windows `start.bat` üzerinden gerçek GPU transkripsiyonu, canlı sağlayıcı ve Electron önizleme ekranı bu turda çalıştırılmadı. `install.bat`/`start.bat`, yollar, GPU/CUDA bağımlılıkları ve çıktı kodlaması değiştirilmedi. Python 3.14 ile sahte motor regresyonu gerçek Windows 3.10/3.11 GPU kurulumunun yerine geçmez. Tam `npm test` kullanıcı isteği gereği çalıştırılmadı.
