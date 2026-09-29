# BROWSER_BUG_REPORT_213 — Burn-in ffmpeg uçtan-uca E2E (plan maddesi 10)

**Tarih:** 2026-09-29 · **Dal:** `fix/r261-burnin-e2e` · **Tür:** test kapsamı (ürün bug'ı yok)

## Kapsam

20'lik planın 10. maddesi: altyazı gömme (burn-in) hattının gerçek Electron + gerçek ffmpeg ile uçtan-uca doğrulanması. Windows tırnaklama mantığı (`stageBurninSubtitle` ASCII geçici dosyası + `ffSubtitlesArg`) bu smoke'da ilk kez uçtan uca koşuyor.

## Doğrulanan zincir

1. `window.api.burnInStart(video, srt)` → `burnin:start` IPC → `authorizeMediaFile` + `authorizeSubtitleFile` (onay diyaloğu stub'lı kabul — gerçek kapı yolu koşar).
2. `stageBurninSubtitle`: Türkçe karakterli (`şğü öç İ`) SRT içeriği ASCII adlı geçici dosyaya alınır — libass filtre ayrıştırıcısının yol bozması savunması.
3. `ffprobe` ile süre ölçümü → `-progress pipe:1` ayrıştırması → `burnin:event` `start`/`progress`/`done` akışı (4 olay gözlendi).
4. ffmpeg `-vf subtitles=...` gerçek kodlaması → `kaynak-video.altyazili.mp4` (h264+aac, süre ~2s, ffprobe doğrulandı).
5. Temizlik: `.tmp.*` geçici dosya artığı yok; `burnin:recovery` kaydı başarı sonrası silinmiş.
6. Kapılar: `.txt` uzantı reddi (`Bu işlem yalnızca altyazı dosyaları için kullanılabilir.`), çakışan iş reddi (`Gömme zaten çalışıyor.`).

## Bulgular

**Ürün bug'ı yok** — hat uçtan uca sağlam: onay → hazırlama → ilerleme olayları → çıktı → artık temizliği.

**Harness notları:**
- `.txt` için ret `ext` kontrolünden ÖNCE `authorizeSubtitleFile` içindeki tip kapısından gelir (dosya uzantısı altyazı değilse `inspect` zaten reddeder) — iki yol da Türkçe dost mesaj üretir.
- ffprobe `-select_streams` parametresi `v:a` değil doğrudan stream listeleme ile kullanılır (smoke iç sorgusu, ürün etkilenmez).

## Test

- `xvfb-run -a npx electron tests/electron-burnin-ffmpeg.smoke.js --disable-gpu` → **PASS**
- `node --check tests/electron-burnin-ffmpeg.smoke.js` → temiz
- `--all` glob'u CI'da otomatik koşar (ubuntu+windows).

## Windows etkisi

Smoke platform-bağımsız; CI windows-latest'ta `backend/bin/ffmpeg.exe` yoksa PATH'e düşer (`resolveFfTool` önceliği fixture üretiminde de birebir kullanılır). Gerçek Windows tırnaklama kusuru senaryosu: ASCII geçici dosya sayesinde başlıca risk zaten kapatılmış; Windows'a özgü kalabilecek tek yüzey `.tmp` adlandırması (normalize edilmiş).

## Doğrulanmayan sınırlar

- İptal-orta-iş yolu (`burnin:cancel` sonrası artık temizliği) bu smoke'da yok — kill-resume kalıbı R256'da kuyruk için doğrulandı; burnin için ayrı madde planlanabilir.
- MKV kaynak (`-map 0:s? -c:s copy` dalı) ve WebM→AAC ses dönüşümü (`burninAudioArgs`) bu senaryoda yok.
- Pencere kapanırken süren iş kurtarma UI'ı (`burnin:recovery:*`) birim testlerde kilitli; E2E kurtarma akışı doğrulanmadı.
