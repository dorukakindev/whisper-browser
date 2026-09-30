# BROWSER_BUG_REPORT_254 — R305 codec/kapsayıcı sniffing matrisi

| Öğe | Değer |
|-----|-------|
| Dal | fix/r305-codec-sniffing |
| Yeni test | tests/media-codec-sniffing.test.js (71 kontrol) |

## Gerçek bulgular (2)
1. **Yanlış akış haritalaması (kullanıcı-kenarlı):** eksik/bozuk
   `stream.index` altyazı-göreli sıraya düşüyordu; `-map 0:N` mutlak indeks
   beklediğinden gömülü altyazı çıkarma video/ses akışını hedefleyebilirdi
   (sessiz yanlış içerik veya ffmpeg hatası). Negatif/ondalıklı indeksler
   geçersiz argv üretiyordu. Düzeltme: streamIndex yalnız tam-sayı ≥0;
   aksi halde iz listelenir ama çıkarılamaz (`extractable:false`).
2. **parseSubtitleStreams TypeError:** `streams` dizisinde null/ilkel
   öğelerde filtre çöküyordu — bozuk ffprobe JSON'u prob sonucunu sessizce
   kaybettiriyordu. Nesne-kapılı filtre eklendi.

## Matris kapsamı
mkv/mp4/webm/avi/mov temsili probları · mov_text/webvtt/xsub/pgs codec
ayrımı · mutlak-indeks sözleşmesi · bozuk probe gövdesi · tag/disposition
bozukluğu · argüman güvenliği (-map/-c:s/-y) · label fallback'leri ·
codec-set tutarlılığı.
