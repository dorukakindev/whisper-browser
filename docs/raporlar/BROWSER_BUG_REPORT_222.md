# BROWSER_BUG_REPORT_222 — R271: yt-dlp canlı ağ doğrulaması + NDJSON yapışma bug'ı

## Kapsam
10'lık plan madde 1: yt-dlp canlı ağ smoke'u (opt-in). Backend `media.py` probe/download/subs zinciri gerçek YouTube'a karşı doğrulandı; doğrulama sırasında **gerçek bir ürün bug'ı** bulundu ve düzeltildi.

## Bulgu 1 (GERÇEK BUG, düzeltildi): `[download]` ilerleme metni NDJSON olayını eziyordu
- **Kanıt:** `backend/venv/bin/python backend/media.py subs --url <youtube>` çıktısında `[download] 100% of 416.00B ...` ilerleme metni `{"type":"subs",...}` olayıyla **aynı stdout satırına** yapışıyordu. `main.js`'in `handleLine` içindeki `JSON.parse(line)` tüm satırı parse ettiği için olay düşüyordu → `media:downloadSubs` altyazı inmesine rağmen "indirilemedi" dönebilirdi.
- **Kök neden:** yt-dlp'nin downloader ilerleme çıktısı `quiet:True`'ya rağmen stdout'a yazılabiliyor (altyazı indirmede görüldü). NDJSON varsayımı "her satır saf JSON" idi.
- **Düzeltme (iki katman):**
  1. **Kaynak:** `media.py` `_ydl_opts` ve `transcribe.py` ydl opts'a `"noprogress": True` — ilerleme çubuğu stdout'a yazılmıyor (progress_hooks etkilenmiyor).
  2. **Savunma:** yeni `parseNdjsonLine` (`src/ndjson-lines.js`) — satır saf JSON değilse ilk `{`–son `}` arasını kurtarır; nesne-olmayan sonuçları (`[]`, `123`, `null`) reddeder. main.js'in 7 tüketici noktası (media, youtube, invidious, live-asr, transcribe, model-benchmark, ytdlp-update) bu çözücüye geçti.
- **invidious.py** `skip_download:True` kullanıyor — ilerleme riski yok, değiştirilmedi.

## Canlı doğrulama (opt-in)
`WHISPER_E2E_YTDLP=1 node tests/ytdlp-live.test.js` — 13 kontrol:
- `probe` "Me at the zoo" (19 sn): başlık/süre/heights/`subtitleLangs` içinde `en` — gerçek sayfa çözümlemesi.
- `download --height 144`: `downloaded` olayı + gerçek mp4 (430 KB) diske yazıldı.
- `subs --sub-lang=en`: gerçek SRT indi, zaman damgası biçimi doğrulandı.
- Hata yolu: var olmayan alan adı → `type:error` olayı döndü.
- URL değişken: `WHISPER_E2E_YTDLP_URL` ile başka video sınanabilir.
- `WHISPER_E2E_YTDLP` yoksa test temiz biçimde atlanır (CI güvenli).

## Regresyon kilitleri
- `tests/ndjson-lines.test.js`: +7 test (temiz parse, ön/son yapışma kurtarma, olmayan satırlar, çift-olay sözleşme notu, 2 statik sözleşme — main.js'te ham `JSON.parse(line)` kalmasın + backend `noprogress`).
- `tests/adversarial-ipc.test.js` + `tests/live-asr-fallback.test.js`: vm sandbox bağlamlarına `parseNdjsonLine` enjekte edildi (yeni bağımlılık).

## Test sonuçları
- `node tests/ndjson-lines.test.js` — 13/13 PASS
- `node tests/ndjson-durability.test.js` — 9022 kontrol PASS
- `node tests/adversarial-ipc.test.js` — 17/17 PASS
- `node tests/live-asr-fallback.test.js` — 6/6 PASS
- `WHISPER_E2E_YTDLP=1 node tests/ytdlp-live.test.js` — 13/13 PASS (gerçek ağ)
- `node --check src/main.js` + `py_compile backend/media.py backend/transcribe.py` — temiz

## Windows etkisi
Olumlu: `noprogress` ve toleranslı parse platformdan bağımsız; yt-dlp'nin Windows'ta `[download]` çıktısını stderr'e yazma olasılığı olsa bile parse katmanı koruyor. `start.bat` akışı etkilenmez. Doğrulanmadı: gerçek Windows'ta canlı indirme (ağ/yt-dlp sürümü ortam farkı olabilir).

## Çalıştırılmayanlar
- Tam `npm test` koşulmadı (hedefli dosyalar + CI'a bırakıldı).
- İki JSON olayının aynı satıra yapışması senaryosu kurtarma kapsamı dışında (gözlenmedi; sözleşme notuyla belgelendi).
