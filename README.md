# Whisper Altyazı

RTX 4070 Ti için optimize edilmiş, yüksek kaliteli yerel altyazı çıkarma uygulaması. Electron arayüzü + faster-whisper backend.

## Özellikler

- **Yerel dosya** veya **YouTube linki** desteği (yt-dlp ile indirme)
- **CUDA + float16** ile GPU hızlandırması (4070 Ti için optimize)
- **Seçilebilir motor**: faster-whisper (dengeli), faster-whisper batched (uzun videoda çok daha hızlı), WhisperX (wav2vec2 ile <100ms kelime hizalaması)
- **Silero VAD** ile sessizlik filtreleme — halüsinasyon azaltma
- **Akıllı bölme**: kelime zaman damgalarıyla noktalama bazlı altyazı bölme
- **Profesyonel zamanlama**: okuma hızı (CPS), min/max süre ve altyazılar arası boşluk normalizasyonu (Netflix/BBC tarzı)
- **Kısa parça birleştirme**: flaş eden tek-kelimelik altyazıları komşusuyla birleştirir (okunabilirlik)
- **Düşük güvenli kelime raporu** — Whisper'ın emin olmadığı kelimeler (skor < 0.60) altyazı bloğunun bağlamıyla `<ad>.dusuk-guven.txt` dosyasına yazılır; sık tekrar edenler "sözlük adayı" olarak öne çıkarılır (yanlış duyulmuş özel isimleri bulmanın en hızlı yolu)
- **Kalite uyarıları**: alfabe karışması (İngilizce altyazıda Kiril harfleri gibi) ve şüpheli zaman damgaları (cümle yarıda kesilip dakikalar sonra devam etmesi) tamamlandığında günlükte raporlanır — otomatik silinmez, elle kontrol edilir
- **Noktalama çöküşü onarımı**: Whisper uzun videoların ortasında noktalamayı bırakırsa (küçük harfli, noktasız akış) o bölüm otomatik olarak bağlam sıfırlanarak yeniden çevrilir — yalnızca sonuç gerçekten iyileşirse kullanılır
- **Yarım cümle birleştirme**: belgesel/anlatım tarzı dramatik duraksamalarda parçalanan cümleleri tek blokta toplar; `Mrs.`, `Dr.`, `L.A.`, `2.` gibi kısaltmalar cümle sonu sanılmaz
- **Okuma hızı uyarısı**: önizlemede CPS limitini aşan altyazılar görsel işaretlenir
- **Halüsinasyon temizleme** (`Subtitles by`, `Thanks for watching` vb. otomatik filtre)
- **Canlı önizleme** — segmentler oluştukça gerçek zamanlı görünür
- **Birden çok format**: SRT, VTT, TXT, ASS (stil/renk), JSON (kelime damgaları) veya hepsi
- **25+ dil**, otomatik dil algılama veya İngilizce'ye çeviri
- **Toplu işlem kuyruğu** — birden çok dosyayı sürükleyip (veya diyalogdan çoklu seçip) sırayla işle; hatalı iş tek tıkla yeniden denenir, biten işin klasörü tıklayınca açılır
- **Zaman aralığı (kırpma)** — Kaynak kartındaki iki alanla videonun yalnızca bir bölümünü işle (örn. `1:30`–`5:00` veya saniye olarak `90`); seçili süre anında gösterilir, geçersiz aralık başlamadan uyarır. Zaman damgaları orijinal videoya göre hizalanır — uzun videoda ayar denemek için ideal. YouTube'da iki sınır da verilirse **yalnızca o aralık indirilir** (tüm videoyu indirmez)
- **Önizlemede arama** — canlı önizlemedeki segmentlerde anlık metin filtresi
- **Tek tıkla yt-dlp güncelleme** — YouTube indirme hatalarının başlıca çözümü, uygulama içinden
- **LLM düzeltmede sözlük desteği** — sözlükteki özel isimler LLM'e de iletilir, yanlış duyulmuş yazımlar düzeltilir
- **Hazır ayar profilleri** — ⚡ Hızlı (turbo+batched), ⚖️ Dengeli (turbo), 💎 En iyi kalite (large-v3) tek tıkla; elle değişiklik yapınca "Özel"e döner
- **Ayarlar otomatik kaydedilir** — model, dil, çıktı klasörü, profil ve gelişmiş ayarlar bir sonraki açılışta geri yüklenir
- **Açılış ortam kontrolü** — GPU adı rozette görünür; venv/ffmpeg eksikse günlükte uyarır
- **Dosya adına dil kodu** — isteğe bağlı `video.tr.srt` biçimi (oynatıcılar dil etiketiyle otomatik yükler)
- **Önizlemeyi panoya kopyala** — segmentleri SRT biçiminde kopyala (arama filtresi uygulanır)
- **Önizlemede düzenleme** — segment metnini kaydetmeden önce çift tıkla düzelt; kopyala/JSON yeniden-üret düzeltilmiş metni kullanır
- **JSON'dan yeniden üret** — mevcut JSON çıktısından SRT/VTT/TXT/ASS'yi yeniden transkripsiyon yapmadan saniyeler içinde yaz
- **Zaman kaydırma & videoya gömme** — sonuç ekranından SRT/VTT'yi global olarak kaydır veya altyazıyı videoya göm (ffmpeg burn-in)
- **Kalıcı iş günlükleri** — her iş `%APPDATA%/whisper-altyazi/logs` altına ayrı dosyaya yazılır (ayarlar, aşamalar, kalite raporu, uyarılar, hata izleri); Günlük panelindeki "Kayıtlı günlükler" ile açılır, en yeni 100 dosya tutulur
- **Kuyruk uyarı özeti** — toplu işlem bitince hangi dosyaların elle kontrol istediği (alfabe karışması, şüpheli zaman damgası, noktalama uyarısı) tek listede özetlenir
- **Kuyruk: "sırada dur"** — çalışan işi kesmeden kuyruğu mevcut iş bitince durdur
- **Ayar dışa/içe aktarma** — tüm yapılandırmayı dosyaya kaydet/yükle (içerik türü profilleri)
- **VRAM uyarısı** — seçili model+compute+diarization GPU belleğini aşacaksa rozette önceden uyarır
- **Aşama süreleri** — her işlem aşamasının (model yükleme, transkripsiyon, yazma) süresi ilerleme listesinde görünür
- **Erişilebilirlik** — klavyeyle gezinme (drop-zone, odak halkaları), ekran okuyucu için aria-live bölgeler
- **Klavye kısayolları** — Ctrl+Enter ile başlat, Esc ile iptal
- **Sistem bildirimi** — pencere arka plandayken iş/kuyruk bitince bildirim + pencere vurgusu
- **Görev çubuğu ilerlemesi** — işin yüzdesi Windows görev çubuğu simgesinde görünür
- **Uyku engelleme** — iş çalışırken sistem uykuya geçmez (uzun videolar yarıda kalmaz)
- **Link sürükle-bırak** — tarayıcıdan YouTube linkini doğrudan pencereye bırak
- **BOM'lu SRT/ASS çıktısı** — Windows oynatıcılarında Türkçe karakter sorunu yaşanmaz
- Modern, koyu temalı arayüz

## Kurulum

Gereksinimler:
- Windows 10/11
- Python 3.10 veya 3.11
- Node.js 18+
- NVIDIA CUDA destekli GPU (RTX 4070 Ti önerilen)
- ffmpeg (PATH'de veya `backend/bin/` içinde)

Kurulum için:

```
install.bat
```

Bu script otomatik olarak:
1. Python sanal ortamı oluşturur
2. PyTorch CUDA 12.1 + faster-whisper + yt-dlp yükler
3. Electron'u kurar

## Kullanım

```
start.bat
```

1. Bir dosya seç veya YouTube linki yapıştır
2. Model ve dili seç (varsayılan: `large-v3`, otomatik dil)
3. **Altyazıyı Çıkar** düğmesine bas
4. Çıktı, video ile aynı klasöre kaydedilir (veya seçtiğin klasöre)

## Önerilen Ayarlar (4070 Ti)

| Ayar | Değer | Neden |
|------|-------|-------|
| Model | `large-v3` | En yüksek kalite, 12GB VRAM rahat kaldırır |
| Compute type | `float16` | 5-6× hızlanma, kalite kaybı yok |
| Beam size | 5 | Hız/kalite dengesi |
| VAD filter | Açık | Halüsinasyonları azaltır |
| Akıllı bölme | Açık | Daha okunabilir altyazılar |

Daha hızlı sonuç için `large-v3-turbo` (2-5× hızlı, large-v2 kalitesinde).

## Motor Seçimi

Ayarlar'daki **Motor** menüsünden transkripsiyon arka ucunu seçebilirsin:

| Motor | Ne zaman | Notlar |
|-------|----------|--------|
| **faster-whisper** | Varsayılan, dengeli | Mevcut tüm decoding/VAD ayarları geçerli |
| **faster-whisper · batched** | Uzun videolar, hız önceliği | VAD tabanlı batching ile çok daha hızlı; `Batch boyutu` ayarı geçerli (conditioning kapalı) |
| **WhisperX** | Hassas kelime zaman damgası gereken işler | wav2vec2 zorunlu hizalama ile <100ms kelime hizası. Kurulum: `install-whisperx.bat` |

Notlar:
- **Batch boyutu** yalnızca batched ve WhisperX modlarında etkilidir (VRAM'e göre 8–16 iyi başlangıç).
- **Sözlük / başlangıç ipucu** faster-whisper (sıralı/batched) modlarında uygulanır.
- **Konuşmacı tanıma** her motorda aynı (pyannote) yolla çalışır; `install-diarize.bat` gerekir.
- WhisperX ilk seçimde model + dile özel hizalama modelini indirir; hizalama desteklenmeyen dilde otomatik olarak segment-seviyesine düşer.
