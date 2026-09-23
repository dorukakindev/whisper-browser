# r114-evidence — R114 gerçek uçtan-uca doğrulama kanıt paketi

`BROWSER_BUG_REPORT_114.md` için üretilen anonim fixture'lar, gerçek çıktılar ve ölçüm dosyaları. Kişisel veri/hesap/anahtar içermez.

## a-real-transcribe/ — R114-A gerçek tiny-model E2E

| Dosya | İçerik |
|-------|--------|
| `gen_clip.py` | Fixture üretici: ffmpeg `flite` TTS ile 8 cümle + `anullsrc` sessizlik → 30.9 sn konuşma-video |
| `clip.mp4` | Üretilen gerçek medya (testsrc2 + flite konuşma) |
| `transcript.txt` | Ground truth metin |
| `run1.log` | Gerçek `transcribe.py` NDJSON çıktısı (model indirme→yükleme→segment→done) |
| `out-clip.srt` | Gerçek tiny-model SRT çıktısı (7 blok) |
| `clip.srt` | Aynı çıktının oynatıcıya yüklenen kopyası |
| `clip-range-8-20.srt` | `--clip-start/--clip-end` çalışması — mutlak zaman geri hizalaması |
| `clip.vtt` | `--reexport true` JSON→VTT çıktısı |
| `clip.json`, `clip.dusuk-guven.txt` | Gerçek JSON + düşük-güven raporu |
| `drive.mjs` | CDP sürücüsü: GTK dosya seçici + medya yetkilendirme + durum örneklemesi |
| `dialog2.png`, `dialog4.png` | Gerçek GTK dosya diyaloğu otomasyon kanıtı |
| `overlay-t3.png`, `overlay-t10.png` | Gerçek Electron oynatıcıda SRT overlay render kanıtı |

## b-live-hls/ — R114-B canlı rolling-playlist gauntlet

| Dosya | İçerik |
|-------|--------|
| `live-server.js` | HTTPS canlı HLS fixture sunucusu: 4-segment kayan pencere, DISCONTINUITY seg-008, +250ms gecikme seg-010, geçici-404 seg-012, `--endlist-at` |
| `drive-live.mjs` | CDP örnekleyici: `setPlayerHls` + saniyelik {t, buffered, textTracks, ended} |
| `run-clean-samples.json` | Kesintisiz koşu: 2.57→31.24, discontinuity/gecikme/404/ENDLIST hepsi temiz, istek sayıları |
| `run-frozen-window.json` | Donan-pencere koşusu: medya stoğu bitince ENDLIST öncesi erken `ended` + reset_timestamps artefaktı notu |
| `live-a.png`, `live-b.png` | Gerçek Electron oynatıcı katmanında canlı altyazı native render kanıtı |
| `segments/` | Örnek gerçek segmentler: seg-000 (başlangıç), seg-008 (discontinuity sonrası), seg-012 (geçici-404), sub-000/sub-008 VTT |

Yeniden üretme: `clip.mp4`'yi `-g 30 -keyint_min 30 -sc_threshold 0 -force_key_frames "expr:gte(t,n_forced*2)" -reset_timestamps 0` ile segmentle, `openssl` self-signed üret (`CN+SAN IP 127.0.0.1`), `node live-server.js --endlist-at=30`, Electron'u `--ignore-certificate-errors --remote-debugging-port=9334` ile aç, `CDP_PORT=9334 LIVE_URL=... node drive-live.mjs`.

## c-windows/ — R114-C gerçek Windows doğrulama (ayrı Devin oturumu)

Kaynak oturum: https://app.devin.ai/sessions/ed0f551b773b4abfa09883e4d99ec370 (Windows Server 2022, GPU'suz VM).

| Dosya | İçerik |
|-------|--------|
| `electron-app-window.png` | start.bat → `npm start` ile açılan gerçek Windows Electron penceresi |
| `ss_6b7cfccd.png`, `ss_8674c13f.png` | Paketlenmiş `Whisper Browser.exe` ve doğrulama ekranları |
| `transcribe-smoke.log` | Windows'ta gerçek tiny/int8 transkripsiyon NDJSON'u (UTF-16, PowerShell redirect) |
| `npm-test.log` | Windows `npm test` tam çıktısı — 5 dosya ortam-bağımlı başarısız, kod hatası yok |
