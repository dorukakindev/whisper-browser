# BROWSER_BUG_REPORT_384 — 50'lik özellik-tamamlama kuyruğu, batch 1 (madde 1–5)

Tarih: 2026-10-02 · Dal: `devin/1790911615-50q-b1` · Kod commit: `62cd68b`

50'lik yeni kuyruğun ilk batch'i: öncelikli kapanış işleri. 4 madde teslim edildi, 1 madde (Windows ana akış) gerçek ortamda koşmak üzere Windows doğrulama oturumuna devredildi.

## Madde 1 — %92 çeviri kapsamının kalan kısmı: ayrıştırma + kurtarma yüzeyi

**İnceleme sonucu:** Kalan %8 zaten doğru sınıflandırılmış (rapor 362): 58/63 cue kapsama, 5 çevrilmemiş satırın tamamı sahte-Türkçe stub artefaktı ("façade/pounds" kalıbı — stub çeviri çıktısının kaynakla çakışıp demirleyemediği satırlar). Bilinçli kaynak-bırakma (`line_keeps_source` / `is_structural_sdh_cue` / `unchanged` / `precompleted`) kalite kapısında `compute_translation_quality_report` içinde ayrışıyor.

**Kurtarma zinciri (uçtan uca doğrulandı):** `.partial` dosyası + cue-başına `.meta.json` (`status: completed/failed`, `error: untranslated_source|empty_translation|timeline_mismatch|api_failure`) → `--translate-existing <partial>` tamamlananları `precompleted_idx` ile korur, yalnız başarısızları dener → renderer `opts.translateExisting` geçirir (track role='translation' iken), düğme "Eksik çevirileri tamamla (N)" gösterir, `untranslatedOnlyBtn` filtresi mevcut.

**Bulunan kusur (düzeltildi):** Kurtarma yüzeyinde 3 dizgi EN kullanıcısına ham Türkçe görünüyordu — `src/renderer/ui-locale.js`'e 1 literal + 2 pattern eklendi:
- "Kısmi çeviri yüklendi: X/Y cue hazır, Z cue eksik. Eksikleri tamamlayabilirsiniz."
- "Eksik çevirileri tamamla (N)"
- "Başarısız kalan satırları yeniden dener; tamamlanan satırlar önbellekten korunur"

Kanıt: `translate('Eksik çevirileri tamamla (5)')` → "Complete missing translations (5)"; ui-locale-dedupe/dynamic/i18n-coverage PASS.

## Madde 2 — Son 50 görevin arayüz erişilebilirliği: doğrulandı

~18 `feat` commit'i teker teker denetlendi (`git show --stat` + UI temas noktası). UI gerektirenlerin tamamı ulaşılabilir: medya yeniden-bağlama (stale-file dialog → `suggestMediaRelink` → `relinkWatchItem`), katalog filtreleri, yakalama provenance görünümü, stutter paneli, senkron profilleri, paket kapsam önizlemesi, konuşmacı düzeltme, çok-noktalı senkron, diff inceleme, bütünlük denetimi. Altyapı-sessiz özelliklerin (scene-context, adaptive scheduler, manga terminology, PDF reading-order, playback clock) UI'sız olması doğru tasarım. **Ulaşılamayan akış yok.**

## Madde 3 — Uzun film kabul koşusu: harness genişletildi + 23 dk koşu

`tools/release-acceptance.js` artık gerçek "uzun film" üretebiliyor:
- `--minutes N` parametresi → hedef süre
- gTTS tek-istek sınırını aşmak için konuşma metni cümle-sınırlı ~3500 karakter parçalara bölünür, parça mp3'leri `ffmpeg -f concat` ile birleştirilir
- `wordOverlapByRegion`: cue'ları ve konuşma metnini baş/orta/son üçtebirlere ayırıp bölgesel kelime örtüşmesi ölçer (ortalama skorun sonda kalite düşüşünü maskelemesini önler)

**Koşu (`--minutes 20`):** medya 1389.2s (~23 dk) · transkripsiyon 27.4s, tepe 1896 MiB, 286 cue · örtüşme **0.846** (baş 0.825 / orta 0.867 / son 0.870 — bölgesel düşüş yok) · çeviri 2.1s, 678 MiB, 265/286 (%93) · korpus 8/8 · kusur yok.

## Madde 4 — Gerçek Windows ana akışı: oturuma devredildi

Windows doğrulama oturumu `devin-3c20a465` (suspend'deydi) güncel master (`dcfe1ce`) ile uyandırıldı: start.bat → dosya seçimi → transkripsiyon → çeviri → kaydet → yeniden açma + biriken elle-kontrol listesi. Sonuç bu rapora veya sonraki batch'e işlenecek.

## Madde 5 — Yetenek ve bağımlılık ekranı: tamamlandı

"Çalışma ortamı ve bakım" paneli artık 8 bileşeni tek yerde gösteriyor:
- **Mevcut:** Python ortamı, FFmpeg, yt-dlp (+yönetilen rozeti), GPU, Model diski
- **Yeni (madde 5):** Kelime hizalaması (WhisperX), Konuşmacı tanıma (pyannote), OCR motoru (RapidOCR)

`app:getEnvInfo` `optionalDeps` döndürüyor — `importlib.util.find_spec` probu (pyannote'un ~3s torch import'u çekilmez). Eksik bileşen rozette çözüm komutuyla görünür ("Kurulu değil — install-whisperx.bat"), title'da hangi işlemin kapandığı açıklanır; `deps === null` ise "Ölçülemedi" (uyarı). dt etiketleri EN/TR çift dilde.

Electron kanıtı: `electron-runtime-maintenance` smoke'u yeni rozetleri mock'layıp EN/TR etiketleri assert ediyor; ekran görüntüsünde 8 rozet doğru durumda (WhisperX/pyannote "Not installed — install-*.bat", RapidOCR "Ready").

## Doğrulanmamış sınırlar
- Madde 4 Windows kanıtı beklemede (oturum `devin-3c20a465`).
- GPU/WhisperX/pyannote probu bu Ubuntu venv'inde whisperx=false, pyannote=false, rapidocr=true döndürdü — kullanıcının RTX 4070 Ti makinesinde `install-*.bat` sonrası durum gerçek ortamda doğrulanmalı.
