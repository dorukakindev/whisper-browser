# BROWSER BUG REPORT 114 — Gerçek uçtan-uca doğrulama (tiny model E2E + canlı HLS + Windows)

Dal: `codex/r114-real-e2e-1790133270` · Taban: master `0c7533b` · Tarih: 2026-09-23

Bu tur yeni bug avı değil; R110–R113'te hep fixture/mock ile doğrulanan üç kritik yolun **gerçek** koşusudur: gerçek whisper modeliyle transkripsiyon (R114-A), gerçek canlı rolling-playlist HLS (R114-B), gerçek Windows doğrulaması (R114-C). Kanıt paketi: `docs/raporlar/r114-evidence/` (fixture üretici betikler, gerçek çıktılar, CDP ölçüm JSON'ları, Electron ekran görüntüleri).

## Karar tablosu

| Hat | Kapsam | Karar |
|-----|--------|-------|
| R114-A | Gerçek tiny-model E2E transkripsiyon (CPU) — indirme→ffmpeg→motor→SRT→oynatıcı | **PASS** — bug yok |
| R114-B | Canlı HLS rolling-playlist gauntlet — kayan pencere, discontinuity, gecikme, 404-retry, ENDLIST, canlı altyazı yakalama | **PASS** — bug yok; 1 fixture-artefaktı belgelendi |
| R114-C | Gerçek Windows doğrulama (ayrı Windows Devin oturumu) — install/start.bat, cuDNN PATH, taskkill kapanış, Electron açılışı | **PASS + ortam bulguları** — Electron açıldı, gerçek transkripsiyon + kapanış temiz; install.bat preflight kapıları ve bağımlılık notları belgelendi |

---

## R114-A — Gerçek tiny-model uçtan-uca transkripsiyon: PASS

Bugüne kadar transkripsiyon boru hattı hep fixture/mock sağlayıcıyla test edilmişti; gerçek faster-whisper motoru gerçek ses üzerinde hiç koşmamıştı.

**Kurulum:** `backend/venv` (py3.12, faster-whisper 1.2.1, ctranslate2 4.8.2) mevcut; HF cache'te yalnız large-v3-turbo vardı → `tiny` model (~75MB) gerçekten huggingface.co'dan **indirildi** (bu koşu indirme yolunu da kanıtladı). GPU yok → `--device cpu`.

**Fixture:** `gen_clip.py` — ffmpeg `flite` TTS ile 8 adversarial cümle (soru noktalaması, sayı/özel ad, diyalog akışı) + `anullsrc` sessizlik aralıkları → 30.9 sn'lik `clip.mp4` (testsrc2 video + konuşma). Ground truth: `transcript.txt`.

**Çalıştırılan gerçek komut:**
```
backend/venv/bin/python backend/transcribe.py --input clip.mp4 --model tiny --device cpu \
  --output-dir out --split-mode smart --formats srt,json --vad-filter true
```
NDJSON olayları `run1.log`'ta — `download`/`status`/`segment`/`done` zinciri gerçek.

**Doğrulanan davranışlar (hepsi kanıtlı, `out/clip.srt`):**
- Uçtan uca zincir tamam: indirme → ffmpeg WAV çıkarımı → tiny motor → 7 SRT bloğu → JSON.
- Cümle birleşimi: `Wait, are you sure you want to come with me?\nIt costs 2.4 million dollars, Marcus.` — 0.7 sn'lik boşluk merge eşiğinin altında kaldığı için iki cümle tek cue'da, cümle sınırında gerçek `\n` ile sarıldı (wrap_mode=sentence davranışı, tasarım gereği).
- Sayı/özel ad: `2.4 million`, `9.30`, `300`, `Marcus` sayısal/düzgün çıktı.
- Düşük-güven raporu: `clip.dusuk-guven.txt` 3 kelimeyi (Wait, 0.39 / meeting, 0.47 / true., 0.55) konumuyla işaretledi — gerçek confidence yüzeyi çalışıyor.
- `--clip-start/--clip-end` (8→20 sn): çıktı zamanları mutlak eksene geri hizalı (ilk cue 00:00:08,520) — `clip-range-8-20.srt`.
- `--reexport true` (JSON girdi): model yüklemeden VTT/TXT yeniden yazımı — `clip.vtt`.
- `--output-name-suffix _clip` denemesi `Geçersiz aşamalı çıktı kimliği` ile doğru şekilde reddedildi (suffix yalnız `-whisper-*` aşamalı kimliği kabul ediyor — doğrulama davranışı, hata değil).
- Oynatıcı kanıtı (ayrı Electron profili + gerçek GTK dosya seçici): `media/clip.mp4` + kardeş `clip.srt` seçilince SRT otomatik bağlandı ve overlay'de video üzerinde gösterildi — `overlay-t3.png`, `overlay-t10.png`, `dialog2.png` (GTK diyalog otomasyonu kanıtı).

**Küçük model gerçekçiliği notu:** tiny, `It costs two point four million` → `2.4 million` ve cümle sınırlarında küçük sapmalar üretti — bu modelin bilinen kapasitesi; ürün hatası değil. Mock başarı gerçek model kalitesi diye sunulmuyor: tiny, canlı ücretli eşdeğeri değildir.

**Sınır:** hallucination döngüsü/kurtarma yolu bu kısa klipte doğal olarak tetiklenmedi — tekrar-halüsinasyon savunması R111/R112'de birim + corpus testleriyle kapalı.

---

## R114-B — Canlı HLS rolling-playlist gauntlet: PASS

R112'deki T1 hep bitişli VOD ile ölçülmüştü; gerçek canlı davranış (`EXT-X-ENDLIST` yok, kayan media-sequence, segment gecikmesi, discontinuity, hata-retry) ilk kez simüle edildi.

**Fixture:** `b-live-hls/live-server.js` — gerçek HTTPS sunucu (CSP `connect-src https:` gereği; self-signed + `--ignore-certificate-errors`). Davranış: `produced()=min(16, 3+floor(now/1.934))` gerçek zamanlı üretim; media-sequence `max(0,n-4)` ile **4 segmentlik kayan pencere**; `i>=produced()` → 404 (henüz üretilmemiş); DISCONTINUITY seg-008 öncesi; seg-010 +250ms gecikme; seg-012 ilk istekte 404 sonra 200; `--endlist-at=N` ile canlı→VOD geçişi; `/stats` istek sayacı. Segmentler gerçek MPEG-TS (`clip.mp4`'den kesintisiz PTS ile re-encode); altyazılar mutlak-zamanlı VTT per ~1.93s pencere.

**Ölçüm:** `drive-live.mjs` — gerçek Electron (izole profil, CDP 9334) `setPlayerHls(url,...)` ile saniyede bir {t, buffered, readyState, textTracks cues/activeCues, ended} örnekledi; sunucu `/stats` istek sayılarıyla çapraz doğrulandı.

**Doğrulanan davranışlar (`run-clean-samples.json`):**
- **Canlı kenara katılım:** t≈2.57'de oynatma başladı, buffer 8s; kalite seçici `['auto','0']` (tek varyant).
- **Kesintisiz oynatma:** 2.57→31.24 (~28.7 sn medya) **sıfır duraklama** — DISCONTINUITY (seg-008), gecikmeli seg-010 ve geçici-404 seg-012 dahil tüm adversity noktaları sırayla aşıldı.
- **Geçici 404 kurtarma:** seg-012 sunucu sayacı 2 istek → hls.js retry ile 200 aldı, kullanıcıya hata çıkmadı.
- **Kayan altyazı yakalama:** `subs.m3u8` video playlist'le aynı sıklıkta sorgulandı (16/16); textTrack cue sayısı pencere kaydıkça 1→7 büyüdü; activeCues doğru anda doğru cümleyi gösterdi ("The meeting starts at 9.30…" t≈11-13, "300 people showed up…" t≈27-28).
- **Altyazı yüzeyi:** canlı altyazılar **native TextTrack** ile video yüzeyinde render oluyor (`live-a.png` ekran görüntüsünde "And I was like, no way, that can't be true." aktif cue). `player.cues=0` ve `#subtitleOverlay` boş — canlı HLS altyazısı side-file overlay yolundan DEĞİL native izden akıyor (tasarım; side-file senkron/arama yüzeyleri live izde değil).
- **ENDLIST geçişi:** `EXT-X-ENDLIST` oynatma ortasında (wall ~30s) geldi → hls.js VOD semantiğine geçti, içerik sonuna (31.24s) kadar oynatıp temiz `ended` verdi.
- **İstek ekonomisi:** 16/16 segment + 16/16 altyazı parçası tam birer kez (seg-012 hariç 2) çekildi; playlist'ler ~targetduration periyoduyla poll edildi.

**Belgelenen kenarlar (bug değil):**
1. **Frozen-window erken end:** Medya stoğu bitip pencere yalnızca tüketilmiş segmentleri gösterirken ENDLIST henüz yoksa hls.js EOS verip oynatmayı bitiriyor (`run-frozen-window.json`, t≈25.24). Gerçek canlıda segment üretimi sürdüğü için bu durum oluşmaz; playlist'in donması durumunda makul davranış.
2. **`-reset_timestamps 1` fixture artefaktı:** İlk segment seti her TS'i PTS~0'dan başlatıyordu → DISCONTINUITY sınırında ~21 sn stall. Gerçek canlı kodlayıcılar sürekli PTS üretir; `-reset_timestamps 0` ile üretilince aynı sınır sıfır stall ile geçildi. Gelecekteki fixture'lar için not edildi — uygulama kusuru değil.

**Sınır:** hls.js iç akışı (liveSyncPosition hedefi, ABR) tek varyantla ölçüldü; çok-varyant adaptasyon ve CEA-608 in-band altyazı hâlâ kapsam dışı (fixture VTT iziydi).

---

## R114-C — Gerçek Windows doğrulama: PASS + ortam bulguları

Uygulama Windows-hedefli ama hiç gerçek Windows'ta koşmamıştı (Windows CI yalnız birim testleri). Ayrı Windows Devin oturumu (Windows Server 2022, GPU'suz VM, Microsoft Basic Render Driver): https://app.devin.ai/sessions/ed0f551b773b4abfa09883e4d99ec370 — kanıtlar `c-windows/` (Electron pencere görüntüsü, transcribe-smoke.log, npm-test.log).

**PASS kanıtları:**
- **Electron gerçek Windows'ta açıldı** (`electron-app-window.png`): start.bat → cuDNN/cuBLAS PATH adımları klasör yokluğunda sessizce atlandı → `npm start` → UI render oldu.
- **`app:getEnvInfo` GPU yokluğunda doğru davrandı:** venv=true, ffmpeg 8.1.2, yt-dlp 2026.08.19, gpu=null → `gpuDiagnostics.state=fallback`, remoteDesktop=true.
- **Gerçek transkripsiyon iki yolla da çalıştı:** (a) CLI — Windows SAPI ile üretilen 12.2 sn konuşma WAV → `transcribe.py --model tiny --device cpu --compute-type int8` → dil=en 0.997, 2 segment doğru, SRT yazıldı, RTF 9.11x; (b) uygulama içinden CDP `startTranscribe` + medya-yetkilendirme diyaloğu ("İzin ver") → 97.7 sn dosya baştan sona SRT.
- **Kapanış yolu süreç ağacını temizledi (R113'ün Windows tarafı):** 'small' model indirme+transkripsiyon ORTASINDA (electron 7052 → python 1880 → python 4684 canlı) pencere kapatıldı → `tasklist`: 0 electron.exe, 0 python.exe. `taskkill /PID /T /F` (`src/process-lifecycle.js`) ağacı öksüz bırakmadı. Paketlenmiş exe de temiz kapandı.
- **Paketleme:** `npm run package:win` (@electron/packager + Castlabs electron-v43.2.0+wvcus, 137.9MB) → `Whisper Browser.exe` gerçek Windows'ta açıldı, UI render, temiz kapanış. NSIS installer yok (packager yolu bu).
- **node --check** üç dosyada 0; npm test python backend suitleri OK.

**Ortam bulguları (uygulama bug'ı değil, kurulum/ortam gerçekleri):**
1. **install.bat preflight durdu — sürüm kapıları katı:** Node.js 22.13+ şartı (VM'de v20.19.0), Python 3.10/3.11 şartı (sistemde 3.12.8 + venv/pip'siz). `[NODE_VERSION]` hatasıyla erken ve açık mesajla durdu — doğru davranış; odaklı yol (CPython 3.11.9 + venv + `pip install faster-whisper yt-dlp` + `npm install`) ile devam edildi.
2. **ctranslate2 4.8.2 Windows'ta çöküyor:** pin'siz `pip install faster-whisper` ctranslate2 4.8.2 çekti → `WhisperModel` init'te `0xC0000005 access violation`. Repo kilidindeki `ctranslate2==4.4.0` ile çalıştı. (install.bat'ın requirements'ı pin'i zaten içeriyor — çarpışma yalnız pin'siz kurulumda.)
3. **onnxruntime 1.30.0 → `vcruntime140_1.dll` eksik:** vc_redist.x64 kurularak çözüldü; taze Windows'ta VAD'siz kalır — transcribe-smoke.log'ta `Applying the VAD filter requires the onnxruntime package` uyarısı olarak izlendi (transkripsiyon yine de tamamlandı).
4. **start.bat DRM verify-pkg interaktif:** `castlabs_evs` yokken `DRM imzasını onar? [E/H]` choice promptu — dev ortamında interaktif bekler (doğru: gizli 2312400 DRM hatası yerine açıkça soruyor).
5. **UI rozeti GPU'suz ortamda `CUDA · float16` gösteriyor:** `gpuDiagnostics.state=fallback` raporlanırken rozet kayıtlı ayar varsayılanını koruyor — transkripsiyon CPU'da çalışıyor; ortama duyarlı otomatik rozet/fallback yok (ayar varsayılanı, çökme değil — iyileştirme adayı).
6. **npm test'te 5 dosya ortam-bağımlı başarısız:** accessibility (`undici/webidl` Node≥22.13 ister — VM v20.19), browser-alignment (srt), browser-video-analysis (PIL), catalog-roadmap (guessit), test_export_anki (genanki). Windows'a özel kod hatası yok; sürüm/paket önkoşulları.

**Sınır:** GPU'lu Windows'ta cuDNN PATH ve CUDA yolu doğrulanamadı (VM GPU'suz); DRM imzalı Castlabs akışı gerçek hesap gerektirdiği için kapsam dışı.

---

## Değişiklik özeti

Ürün kodu değişmedi (bug bulunmadı). Ekleme: `docs/raporlar/BROWSER_BUG_REPORT_114.md` + `docs/raporlar/r114-evidence/` (üretici betikler + gerçek çıktılar + ölçüm JSON'ları + ekran görüntüleri).
