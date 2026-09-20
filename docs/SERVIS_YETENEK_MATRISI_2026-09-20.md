# Servis Yetenek Matrisi — 2026-09-20 (F04)

Sürekli bakım belgesi. Her hücrenin değeri yalnız şu durumlardan birini alır:

- **✓ Doğrulandı** — tarihli gerçek-site veya gerçek cihaz koşusuyla kanıtlı
  (kanıt sütununda tarih + oturum/commit referansı).
- **Kod var** — adaptör/yol mevcut fakat gerçek sitede doğrulanmadı;
  "destekli" ilanı sayılmaz.
- **—** — bilinçli kapsam dışı (ör. DRM indirme).

Giriş gerektiren servisler "kod var" diye doğrulandı SAYILMAZ. Sürüm
kapısı için bkz. `KABUL_MATRISI_2026-09-20.md`.

## Adaptör kaydı (src/browser-adapter-registry.js)

| Servis | Giriş gerekli | Oynatma | Caption edinimi | İki iz (çift altyazı) | Overlay | Çeviri | Son doğrulama |
| --- | --- | --- | --- | --- | --- | --- | --- |
| YouTube | Hayır | Kod var | Kod var (timedtext/json3) | Kod var | Kod var | Kod var | CI adaptör testleri; gerçek site koşusu bekliyor |
| Netflix | Evet (kullanıcı hesabı) | Kod var | Kod var (manifest/timedtext) | Kod var | Kod var | Kod var | — |
| Disney+ | Evet | Kod var | Kod var (dssott/bamgrid) | Kod var | Kod var | Kod var | — |
| Max | Evet | Kod var | Kod var | Kod var | Kod var | Kod var | — |
| Discovery+ | Evet | Kod var | Kod var (HLS izi) | Kod var | Kod var | Kod var | — |
| Hulu / Hulu JP | Evet | Kod var | Kod var (v6 playlist) | Kod var | Kod var | Kod var | CI adaptör testi (`browser-adapters.test.js`) |
| Prime Video | Evet | Kod var | Kod var | Kod var | Kod var | Kod var | — |
| Crunchyroll | Evet | Kod var | Kod var | Kod var | Kod var | Kod var | — |
| BBC iPlayer | Evet + bölge | Kod var | Kod var | Kod var | Kod var | Kod var | — |
| ARTE | Bölge | Kod var | Kod var | Kod var | Kod var | Kod var | — |
| RaiPlay | Bölge | Kod var | Kod var | Kod var | Kod var | Kod var | — |
| Plex | Yerel sunucu oturumu | Kod var | Kod var | Kod var | Kod var | Kod var | — |
| Stremio Web | Hayır | Kod var | Kod var | Kod var | Kod var | Kod var | — |
| Coursera | Evet | Kod var | Kod var | Kod var | Kod var | Kod var | — |
| Udemy | Evet | Kod var | Kod var | Kod var | Kod var | Kod var | — |
| Vimeo | Hayır | Kod var | Kod var | Kod var | Kod var | Kod var | — |
| Invidious örnekleri | Hayır | Kod var | Kod var (backend/invidious.py) | Kod var | Kod var | Kod var | `test_invidious.py` birim testleri |
| Yerel dosya / URL | — | ✓ CI | Kod var (media:probeTracks) | Kod var | Kod var | Kod var | media IPC + probe testleri |

## Dikey yetenekler (servisten bağımsız)

| Yetenek | Durum | Kanıt |
| --- | --- | --- |
| Edinme merdiveni (hazır iz → ağ → saklanan → Live ASR/OCR) | Kod var | `browser-acquisition.js`, `tests/browser-acquisition*` |
| Gömülü iz ayıklama (metin/bitmap ayrımı, OCR gereksinimi) | Kod var | `media-subtitle-tracks.js`, `media:probeTracks` |
| Live ASR yedeği (kullanıcı tetiklemeli) | Kod var | `backend/live_asr.py`, edinme basamağı |
| Cümle-bazlı çeviri zamanlayıcısı | Kod var | `browser-translation-scheduler.js` |
| İki iz eşzamanlı gösterim | Kod var | dual-track render testleri |
| Overlay pencere | Kod var | overlay lifecycle testleri |
| DRM içerik indirme | — | kapsam dışı karar (F12) |

## Bakım kuralları

- Bir servis gerçek sitede doğrulanınca "Son doğrulama" hücresine
  `YYYY-MM-DD · commit` yazılır; hücre **✓ Doğrulandı** olur.
- Yeni adaptör eklenirken bu satır aynı PR'da eklenir.
- Bölgesel/girişli servisler CI'da doğrulanamaz; gerçek cihaz koşusu
  gerektirir (kabul matrisi S-1..S-3).
