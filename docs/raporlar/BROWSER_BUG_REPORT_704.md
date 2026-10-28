# Rapor704 — PDF zoom ses takip katmanını kaybetmesin

## Doğrulanan ürün hatası

setPdfReaderZoom sayfa article/tuval düğümlerini yeniden kurar. Ses oturumu devam ederken pdf-reader-experience içindeki prose/timeupdate ve PdfSpokenMap hâlâ eski kopuk DOM'a bağlı kalıyordu. Native gerçek3sayfaPDF/fixtureWAV eski kodda **Zoom preserves narrated text spans:0!==1** ile düştü. Bu R689dar-ekran/page-selection kusurunun tekrarı değil; aktif ses sunumunun raster yenilenmesi kapsamıdır.

## Düzeltme

Aktif ses sunumu reader/page/voiceToken ile sahiplenilir. Aynı sayfa yeniden çizildiğinde mevcut narrated-prose düğümleri yeni article'a taşınır; click/keyboard/timeupdate işlevleri ve ses konumu korunur. Eski PDF haritası dispose edilir ve yeni canvas/current scale viewport'una kurulur. Her stop/kaynak/page değişimi spokenView referansını bırakır. Sesi yeniden yükleme, yeniden TTS, tekrar book-listen veya zaman sıfırlama yok. Yeni UI etiketi/dependency/IPC/şema yok.

## Kanıt

-17ilgili Node kontrol PASS: stale render/cancel/audio metadata/dispose/position/boxgeometry sınırları.
- Native final Windows Electron gerçekPDF+fixtureWAV:145%→85%,aynısource/time/page,1spoken-group/27boxkorunur; aktif metin ve özgünPDFvurgusu var.27kututuval sınırlarında. Yeni kutuya tıklayınca aynı ses tekrar oynuyor. Ardından readerasistan/seçilip2–3sayfaseshazırlığı/nextpagepause/dar layout/close ve TXTreader akışı tamamlandı.
- Önceki genişletilmiş harness ses duration'ına metadata hazır olmadan erişip non-finite hata verdi. GerçekreadyState/finite-durationkoşuluyla ayırıldı; ekürünbugı doğrulanmadı, threshold gevşetilmedi. Önceki başarısızlık saklanmadı.
- Syntax/diff PASS. [Kanıt](PDFZOOM704_2026-10-28/native.json), sanitizedzoomJSON ve iki ekran incelendi. Ham kişiselPDF/profil/log/ses yok.

## Kaynak ve sınırlar

[Mozilla PDF.js pdf_page_view.js](https://github.com/mozilla/pdf.js/blob/master/web/pdf_page_view.js) Apache2kaynak gerçekrender/viewport/textlayer reset/retainakışı incelendi. Mevcut uygulamanın PdfSpokenMap/ReaderAudioControl lifecycle'ı kullanıldı; dışkod kopyalanmadı/dependency yok. UI tasarımı korunur, bu işlevsel zoom onarımıdır; kitap tasarımının her yerde tamamlandığı iddiası yok.

GerçekGPU/TTS/liveLLM/DRM/temizstart.bat/install bu turda yok. FixtureWAV doğallık kanıtı değildir.11before-quit warning açık; uzunCI beklenmedi. P068 bu gerçekPDF kabulünde onarıldı-doğrulandı; bütünPDFfont/rotation/language/layout genellenmez. Ürün100 hedefi devam eder.
