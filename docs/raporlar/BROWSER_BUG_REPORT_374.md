# BROWSER BUG REPORT 374 — Yeni-100 Batch 1: uçtan-uca kullanıcı yolculukları

Tarih: 2026-10-02 · Dal: `devin/1790904289-new100-b1-journeys` · Başlangıç kod: `dc1d1f5` · Bitiş kod: `a4aeffa`

## Madde sonuçları

| # | Yolculuk | Durum | Kanıt |
|---|----------|-------|-------|
| 1 | aç→içe aktar→transkribe→çevir→düzenle→dışa aktar | **YENİ SMOKE** | `tests/electron-journey-full.smoke.js` — tek koşuda: dropZone+diyalog → GERÇEK tiny/CPU faster-whisper (flite konuşma WAV'ı) → süreç-içi OpenAI-uyumlu stub sağlayıcı → `.en.srt`+`.tr.srt` → openPlayer + saveCueEdit (gerçek dosya yazımı) → saveSubtitleCopy dışa aktarım. **PASS** |
| 2 | oynatıcı: video+altyazı→öğrenme→seek/loop→kapat→konum devamı | KAPSALIDIR | `electron-subtitle-output` (video+altyazı+öğrenme modları), `electron-overlay-timing` (seek sonrası overlay senkronu, gerçek Chromium saati), `electron-browser-video-e2e` (VIDEO_E2E_RESTORE oturum geri yükleme), `electron-media-catalog` (konum devamı 1.7–2.6s doğrulandı) |
| 3 | browser: gezinti→yakalama→sayfa çevirisi→sekmeler→oturum | KAPSALIDIR | `electron-page-translation-live` (sayfa çevirisi), `electron-browser-subtitle-gauntlet` (yakalama), `electron-browser-tab-churn/leak/preview` (sekme yaşamı), `electron-a3-acceptance` (oturum paketi içe aktarma + yeniden başlatma) |
| 4 | kuyruk: 3 iş→koştur→ortada iptal→devam→persist | **YENİ SMOKE** | `tests/electron-queue-cancel-mid.smoke.js` — 3 flite WAV, gerçek tiny/CPU; ilk iş 'running' diske yazılana bekle → cancelBtn → 3/3 pending (çalışan geri döner, currentQueueId null) → yeniden başlat → 3/3 done + queue-state.json tutarlı. **PASS** (kill-resume SIGKILL'i, bu smoke kullanıcı iptalini kilitler) |
| 5 | kütüphane: klasör içe aktar→metadata→not→taşı→yeniden bağla | KAPSALIDIR (ince artık) | `electron-media-catalog` (içe aktar→metadata→watchStatus→bölüm "Adresi bağla" relink→konum devamı→tekilleştirme) + `tests/browser-note-store.test.js` (not deposu). İnce artık: fiziksel dosya taşıma→yeniden bağlama UI yolu bölüm-URL bağlama dışında ayrıca kilitli değil — küçük kapsam notu |
| 6 | ayarlar: tüm persist kontroller→restart→doğrula | KAPSALIDIR | R315 teslim kanıtı (12 kayıp kontrol + çok-seçim roundtrip) + `tests/settings-roundtrip.test.js` (export↔import tam-tur sadakat, PERSIST_* tam kapsama) |
| 7 | PDF: aç→sayfa çevir→iptal→devam→dışa aktar | **YENİ SMOKE** | `tests/electron-pdf-cancel-resume.smoke.js` — 5 sayfalık gerçek PDF, 3'lü paket döngüsü; ilk paket sonrası pdfTranslateCancel → 3/5 çeviri KORUNDU + `pdf-translations/*.json` diskte → yeniden "tüm kitabı çevir" → 5/5 + export. **PASS** |
| 8 | manga: aç→OCR bölge→çevir→kaydet | KAPSALIDIR | `electron-a3-acceptance` (manga.png fixture → /chat/completions stub → bölge overlay + stale-edit rollback) + `tests/browser-manga.test.js` (export yolu) |
| 9 | SmartTube: ana→arama→kanal→oynat→oynatıcıya devir | KAPSALIDIR | `electron-smarttube-boot` + `electron-smarttube-usage-matrix` (klavye tetikleri, kart open→probe→oynatıcıya devir, hata+retry, stPlayQueue restart persist) |
| 10 | canlı HLS→yakalama→overlay senkron→seek | KAPSALIDIR | `electron-capture-completeness` (büyüyen playlist, EXT-X-DISCONTINUITY, imza yenileme, 403 parça, iptal/devam — bağımsız orak SRT doğrulaması) + `electron-overlay-timing` (seek sonrası görünen-metin senkronu) |

## Özet

- **3 yeni Electron smoke'u** eklendi — batch'in tek gerçek boşluklarıydı: tek-akış tam yolculuk (item 1), kuyruk ortada-kullanıcı-iptali (item 4), PDF çeviri iptal→devam (item 7). Diğer 7 madde mevcut 60 smoke'un bileşiminde zaten kilitli — per-item kurala uygun olarak tekrar yazılmadı, kanıt tabloda.
- Üç yeni smoke da PASS: journey-full ~40s, queue-cancel-mid (3 gerçek tiny iş + iptal + devam) ~3dk, pdf-cancel-resume ~35s.
- **Doğrulanmış ürün kusuru yok** — her üç yolculuk da sözleşme gereği davrandı (iptal çalışanı pending'e döndürüp kuyruğu durdurur; PDF iptal paket arasında durup tamamlananı korur; dışa aktarım atomik+doğrulamalı).
- Test-altyapı notu: ilk journey koşusu `until()`'in boş diziyi truthy saymasıyla erken döndü (sürücü kusuru, düzeltildi); PDF fixture'da font objesi (`13 0 obj`) 3. sayfa objesiyle çakışıyordu — `F1 7 0 R` → `F1 13 0 R` düzeltildi (fixture kusuru, ürün değil).

## Test kanıtı

```
electron-journey-full.smoke.js    PASS — tam yolculuk (gerçek tiny/CPU + stub LLM)
electron-queue-cancel-mid.smoke.js PASS — 3/3 done + disk tutarlı
electron-pdf-cancel-resume.smoke.js PASS — 3/5 korundu → devam 5/5 + export
node tests/run-electron-smokes.js — 3 yeni dosya listede (otomatik keşif)
```

`npm test` etkilenmedi (smoke'lar paket dışı; birim testlerine dokunulmadı).

## Windows etkisi

Yeni dosyalar yalnız test — ürün kodu değişmedi. Smoke'lar POSIX flite/ffmpeg fixture'ları kullanır; Windows'ta flite yoksa queue-cancel-mid SKIP değil FAIL verir (fixture üretimi execFileSync ile zorunlu) — Windows koşusunda ffmpeg flite filtresi gereksinimi not edilmeli. journey-full/pdf-cancel-resume ek bağımlılık istemez (ffmpeg her koşuda gerekli). Windows'ta denenmedi — yalnız Ubuntu xvfb.
