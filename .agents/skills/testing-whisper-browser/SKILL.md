---
name: testing-whisper-browser
description: How to launch and drive the whisper-browser Electron app on this Linux machine for visual/end-to-end UI testing (player, SmartTube overlay, playlists, file dialogs).
---

# Testing whisper-browser (Electron) on this machine

## Launch
- Node is NOT on PATH by default. Use the persistent nvm install: `export PATH=/home/ubuntu/.nvm/versions/node/v24.19.0/bin:$PATH`. Do NOT install Node into `/tmp` — it does not survive reboots.
- Launch the real app on the live desktop (no xvfb needed): `cd /home/ubuntu/repos/whisper-browser && DISPLAY=:0 npm start`. The window title is "Whisper Browser"; a separate Devin Chrome also runs on :0 — do not confuse them.
- dbus/gpu `Failed to connect to the bus` / `CreateCommandBuffer` errors in the launch log are non-fatal.
- Maximize before recording: `wmctrl -r "Whisper Browser" -b add,maximized_vert,maximized_horz`.

## Reaching the player
- Main view → **BROWSER** button (top bar) opens `playerLayer` in the *browser* workspace (embedded webview).
- Workspace tabs are "Player"/"Browser" pills in the player head (EN) / Oynatıcı/Tarayıcı (TR). Click the pill CENTER — in the current layout the "Player" pill center is ~x=750,y=65; clicking ~770+ lands in the gap and does nothing.
- Settings drawer: gear icon in the player head (far right of header). It contains the **Kaynak → Local file** tab with **Choose video** (multi-select → playlist = selected files only) and **Choose folder** (playlist = ALL media files in that folder, via `dialog:openFolders`).

## Player transport / playlist model
- `playerPrevMedia`/`playerNextMedia` sit in `.player-controls` inside the stage; disabled = `opacity:.28` (clearly dimmed).
- Playlist = `player.playlist` + `player.playlistIndex`; built from the picked folder's media files. Auto-next (`playerAutoNext` checkbox, default on) advances on `ended`.
- Watch-state resume can land a previously-finished file at its end (0:20/0:20) on reopen — expected, not a bug.
- Controls auto-hide after a few idle seconds (`playerStage.idle`) — move the mouse over the stage before asserting button pixels.

## SmartTube overlay (`smarttubeBrowser`)
- Shows only when `!player.mediaKey` (init / `showHomeWhenNoVideo`). While a YouTube video is loaded it is hidden; there is NO direct in-player "reopen SmartTube" button — the only reliable opener is the settings-drawer YouTube tab → **Source → Invidious** (calls `setSmartTubeVisible(true)` when no media), or close+reopen the player layer with no media.
- Card queue buttons (`+`) are hover-only and hard to hit. Use **right-click on a card** → context menu → *Add to queue* (`Sıraya ekle`) — position-insensitive and reliable. Re-open the menu to confirm: it flips to *Remove from queue* when queued.
- A populated queue renders a "PLAY QUEUE" rail at the top of the HOME grid after a section re-render.
- **COORDINATE SCALE — the tool's screenshot space (1024×768) is NOT the real display (1600×1200); clicks scale ×1.5625.** The SmartTube left sidebar is only **108 CSS px wide → ~69 tool-px**, so click the section/login icons at tool-x≈35 (icon column). Clicking x≈78–95 (where the label text visually sits) maps past the sidebar onto the card grid and silently does nothing. If a sidebar/modal click "does nothing", recompute with ×1.5625, then re-zoom a narrow region to confirm the target before re-clicking.
- **Queue ground truth = renderer localStorage `stPlayQueue`** — readable from Electron's leveldb: `~/.config/whisper-browser/"Local Storage"/leveldb/*.log`. Records are `<key><varint-len><flag-byte><value>`; flag `1`=latin-1/`0`=utf-16le; the JSON array lists `videoId` per item — parse it to count queue items exactly (faint/blank thumbs make pixel-counting unreliable).
- **Ghost-card caveat:** the rail may show cards whose videos are no longer queued (remove path doesn't refresh the rail on PR #9 branch). To tell a live queued card from a ghost: right-click it — queued shows "Sıradan çıkar", ghost shows "Sıraya ekle".
- Main-view **Log panel** ("Günlük" card, `panel-right`) is only reachable when the player layer is hidden — exit via the back button at top-left (~x=20,y=62).

## Network reality on this box
- Invidious feed endpoints (home/popular/trending) work → cards populate (thumbnails may be blank — cosmetic).
- Per-video probes are INTERMITTENT, not always-fail: on 2026-09-21 a SmartTube card probe **succeeded** and played a real YouTube video (52-min stream), which then exercised auto-next (video `ended` → `stQueueAutoNext` → pulled the queue head and played/dequeued it). If a probe fails you'll see "Invidious ile video bilgisi alınıyor" → `Video bilgisi alınamadı` and the overlay reopens (hadAutoOpen path); if it succeeds the video plays. Plan for either.
- **Forcing a feed failure** (to exercise SmartTube empty/error fallbacks): temporarily edit `backend/invidious.py` `DEFAULT_INSTANCES` to `["https://127.0.0.1:9"]` (dead URL). The backend spawns per IPC call, so the change takes effect on the next feed fetch WITHOUT an app restart — the UI's "Tekrar dene"/retry button is enough to re-fire. **BUT killing Invidious alone may NOT blank home** — `_popular_payload`/`_trending_payload`/`feed_home` fall back to yt-dlp (`_ytdlp_tab_videos` on `youtube.com/feed/trending`) which still returns data, so the section may show an error while HOME repopulates. To force the TRUE empty-home `stRenderHomeFallback`, also hide yt_dlp: `mv backend/venv/lib/python3.10/site-packages/yt_dlp yt_dlp.HID` (the code treats `yt_dlp=None` as a legit state → every yt-dlp path raises). REVERT both edits when done; the feed recovers on the next retry, which also proves the retry-success path.
- EN locale toggle is a `TR ▾`/`EN ▾` select at top-right (~x=815,y=60). Under EN the workspace pills read Player/Browser/Media library (~x=742/778/856).

## YouTube login modal (two-option, comprehensive-tour branch)
- Sidebar **"YOUTUBE ▶"** entry (stYtLoginBtn, ~x30,y665) → `openYoutubeLogin` → unconfigured: `ytClientView` form; configured (`hasClient`): `_ytShowAuthChoice` method-choice screen — "Tarayıcıda yetkilendir" (primary, browser PKCE+loopback on `127.0.0.1:<random>` `/oauth2callback`, opens accounts.google.com via `openExternalByPolicy` with `state`+`code_challenge` S256) and "Cihaz kodu üret" (secondary, device-code flow). `youtube:cancel`/`logout` abort the pending browser flow (kills the loopback listener — verify via `ss -tln`).
- A bogus client (e.g. `12345-qa…apps.googleusercontent.com`) drives the whole UI without real creds: browser opens the real `invalid_client` Google error page while the app sits at "onay bekleniyor…" until timeout — **no in-app failure surfaced** (gap). Don't enter real Google creds.
- **Don't confuse with the Invidious account login** — sidebar "OTURUM AÇ" (~y706) opens a separate *server-side* username/password modal ("Invidious hesabına giriş"), not OAuth.
- Device-code + browser flows both need the generated `youtube:authCode`/device IPC to reach Google — real approval is BLOCKED; only verify the UI + loopback/URL construction.
- `Ctrl+R` reloads the renderer and clears `mediaKey` (drops to main view) — a clean way to re-show the SmartTube overlay when media is loaded. Saved OAuth client may not persist on Linux (safeStorage can't decrypt without a Secret Service → "istemci anahtarı güvenli depodan okunamadı" warning).

## Stability soak
- Drive repeated UI cycles via `xdotool` (window `0x…` from `wmctrl -l`): activate + click `openPlayer`(BROWSER ~705,60) → `Oynatıcı`(751,60) → sidebar sections → back(20,62) → occasional `ctrl+r`. Sample `ps -o rss -p $(pgrep -f "user-data-dir=<profile>")` per iter. Blind clicks occasionally open the GTK file dialog — that's fine (still exercises the app); memory stayed ~flat (~430-450MB, 3 procs) over 30+ iters.

## Fixtures
- Generate test media with ffmpeg: `ffmpeg -y -f lavfi -i "testsrc=duration=20:size=640x360:rate=25" -f lavfi -i "sine=frequency=440:duration=20" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest /tmp/test-media/alpha.mp4` (use testsrc2/smptebars for visually distinct siblings). Keep them OUTSIDE `/tmp` if you need them across reboots.

## Transcription run + LLM post-process
- Main-view settings column (left, scrollable): **Basic settings** (Model — pick `tiny` for speed; Motor/engine) and **Advanced settings** (Cihaz = device — default CUDA; pick `CPU` on this GPU-less box or faster-whisper may fail) are separate collapsible cards.
- The **"LLM correction (DeepSeek/OpenAI)"** card holds `llmPostprocess` checkbox, `llmApiKey` (password/masked), `llmEndpointPreset` (choose **"Custom…"** to reveal the `llmBaseUrl` field), `llmModel`.
- Input: click the drop-zone → GTK file dialog (accepts audio too, e.g. flac). Output dir defaults to `~/Downloads/Whisper/ÇIKTI/` — the written `.srt` lands there.
- Run: "Generate subtitles" (`startBtn`) → status pill RUNNING; the LLM stage shows as "LLM düzeltiyor: <model>"; Log panel gets `LLM düzeltme BAŞLIYOR … endpoint …` then `✓ LLM düzeltme TAMAMLANDI — N blok işlendi, M blok düzeltildi`. The Live preview swaps from raw whisper text to the corrected text when the pass completes — that's the discriminating pixel check.
- **API key persistence caveat on Linux:** the key goes through Electron `safeStorage`; without a freedesktop Secret Service daemon it cannot persist — log warns "API anahtarları güvenli depo kullanılamadığı için kaydedilemedi" and after restart the key field is EMPTY while all other LLM fields survive. On Windows (DPAPI) it should persist. So re-enter the key each session when testing on this box. NOTE: this applies to `translateApiKey` too — and a leftover `llmPostprocess` checkbox stays ON with an empty key after restart, so uncheck it (or re-enter the key) before any non-LLM run or validation blocks the start.
- Type secrets into fields via the computer tool's `${WHISPER_LLM_API_KEY}` placeholder (auto-substituted; password field masks it). Never screenshot or echo the raw value.
- Backend sanity check without the UI: `backend/venv/bin/python backend/transcribe.py --input <file> --model tiny --device cpu --llm-postprocess true --llm-base-url <url> --llm-model <m>` with `WHISPER_LLM_API_KEY` in env.

## Translate card (subtitle → target language)
- Separate card from LLM-correction: settings column → **"Translation (translate subtitles)"** → `translate` checkbox, `translateTo` (tr default), `translateApiKey` (password), `translateEndpointPreset` (default "shuaiapi · CF optimize" = `https://api.shuaiapi.com/v1` — shuaiapi's four routes are all presets; "Özel…"=custom reveals `translateBaseUrl`), `translateModel`, `dualSubtitle` (writes `<name>.dual.srt` TR+EN bilingual), `translateRefine` ("Second pass"), `translateProbeBtn` ("Send test request" — real POST to `<endpoint>/chat/completions`; use it to verify key+model before a long run).
- The translate key flows via `WHISPER_TRANSLATE_API_KEY` env (not WHISPER_LLM_API_KEY); `${WHISPER_LLM_API_KEY}` secret value works for both since it's the same shuaiapi key string.
- Stage/progress: status "Çeviriliyor: Türkçe"; `llm_progress` shows "Çevriliyor N% (d/t)"; refine stage "Çeviri gözden geçiriliyor (2. geçiş)". Log ends: "Çeviri tamamlandı — N blok Türkçe diline çevrildi" + "2. geçiş: M blok düzeltildi, K blokta hata".
- Preview renders a "Çeviri"-labeled TR line under each EN segment via `syncPreviewTranslation`. Historical bug (fixed by `devin/fix-translation-refresh-index`, `translation_refresh` now carries `"index"`): refine-pass revisions didn't reach preview segments with duplicated time keys. If you test on a branch without that fix, preview ≠ `.tr.srt` for revised dup-key cues — the file is ground truth.
- Rerunning the SAME video/translate config hits the translation cache (`Çeviri önbelleği: N/M blok hazır` in log) — the pass can finish in seconds and refine still runs. Useful for fast verification loops, but a fully-cached run may not exercise fresh pass-1→pass-2 paths.
- Checkbox hit zones in this card are at x≈58 (row under "…content" text), NOT x≈39; label-text clicks don't always toggle — click the box itself and re-verify visually (some rows' labels aren't wrapped `<label>`s).

## YouTube transcribe path (main view)
- Source card has File/YouTube tabs (`sourceTabYoutube`). Paste URL into `youtubeUrl` → `opts.youtube` → in-app yt-dlp downloads to temp → transcribe. YouTube download DID work on this box (JFK clip 1.67MiB webm in ~1s); if bot-check hits, Log shows the yt-dlp error — fall back to a local file.
- Note: yt-dlp `[download]` progress lines leak raw `download_progress` NDJSON into the Log panel — cosmetic, not a failure.

## SmartTube grid scrolling + CDP DOM measurement (2026-09-22)
- **Mouse-wheel scroll in `.st-grid` may do nothing** (tool scroll AND xdotool): when the grid's `scrollHeight == clientHeight` (feed fits the viewport) there is simply nothing to scroll — verify overflow exists before assuming scroll is broken. Cards have `tabIndex=0`: **Tab** until a card gets the focus ring (focus order: sidebar items → search input → chips → cards, ~10+ Tabs), then **ArrowDown/End** — `stGridNavKeydown` calls `scrollIntoView`, a reliable programmatic scroll for lazy-load checks.
- **Sidebar icon y-positions** (tool coords, x≈38): HOME 114, TRENDING 158, POPULAR 203, SUBSCRIPTIONS 248, MY CHANNELS 296, MUSIC 345, GAMING 390, NEWS 438, LIVE 480, HISTORY 525, MY PLAYLISTS 577, YOUTUBE (OAuth) ~630, SIGN IN (Invidious) ~690.
- **CDP pixel measurement recipe** (what PR authors use to prove layout): launch `DISPLAY=:0 npx electron . --remote-debugging-port=9333`, then `curl localhost:9333/json` → page `webSocketDebuggerUrl`. Connect with python `websocket-client` (`pip install --target /tmp/wslib websocket-client`, `PYTHONPATH=/tmp/wslib`) using **`suppress_origin=True`** (else 403; alternative is `--remote-allow-origins=*`), and call **`Runtime.enable` FIRST** — a bare `Runtime.evaluate` may hang/timeout. Then `Runtime.evaluate` with `returnByValue` gives live `getBoundingClientRect()`s — the reliable way to measure element heights when screenshots are ambiguous (this is how the `.st-card` 57px vs `.st-card-thumb` 172px split was proven).
- **Aspect-ratio card collapse signature:** `.st-card` `grid-template-rows` shows `"0px 80px"` → thumb track is 0px, thumb box overflows and gets clipped by `overflow:hidden` into a ~57px letterbox strip (titles hidden). Outer `#stGrid` implicit row clamps to that collapsed height; verified live that `.st-card{min-height:250px}` or `#stGrid{grid-auto-rows:260px}` restores full cards — the aspect-ratio child does NOT contribute to the outer auto track on Chromium 150. If thumbnails "render" per CDP but cards look squashed/titleless, this is the failure mode.

## SmartTube card click → probe/play behavior (2026-09-22, round 2)
- Card click runs `openYoutubePanelAndProbe(url)`: sets `playerYtUrl`, opens the SOURCE AND PLAYBACK settings drawer, clicks `[data-ptab="yt"]`, then auto-clicks `playerProbe` (`probeWithActiveSource`). On failure: `logLine("Video bilgisi alınamadı: <friendlyYoutubeError>")`, and if the message matches /oturum|tarayıcı/ the drawer scrolls to the `#playerCookieBrowser` section; `pendingAutoOpen` is dropped and `setSmartTubeVisible(true)` reopens the card overlay (user is NOT left on a black stage).
- `playerSource` toggle (`playerSourceSelect` in the drawer's YouTube tab): `'ytdlp'` (DEFAULT) → `api.probeYoutube` → `media:probe` → `backend/media.py probe --url` (direct yt-dlp); `'invidious'` → `api.probeInvidious` → `invidious:probe` → `backend/invidious.py probe`. Check `playerSource` via CDP before diagnosing probe failures — the two paths fail differently.
- Bot-wall signature on this box (datacenter IP): yt-dlp probe → `Sign in to confirm you're not a bot` → UI shows "Video bilgisi alınamadı: YouTube bu video için oturum doğrulaması istedi. YouTube ayarlarından giriş yaptığınız tarayıcıyı seçip yeniden deneyin."; Invidious probe → all instances HTTP 401/403/500 → "Tüm Invidious instance'ları başarısız". Anonymous playback is then unreachable; report as environment-blocked, not a code regression. NOTE: the older note "YouTube download DID work on this box" is stale — verify fresh before relying on it.
- Quirk seen: after card-click the drawer opened but `data-ptab="local"` stayed `.active` (yt tab never visually activated) — probe still ran fine; cosmetic only.

## Transcribe on a GPU-less box — expected behavior (2026-09-22)
- device=cuda + no GPU is NOT a hard failure: `transcribe.py` emits WARN "Cihaz CUDA seçildi fakat CUDA destekli GPU veya sürücü bulunamadı! İşlem CPU'ya düşürülüyor." + "float16 desteklenmez. 'int8' kullanılacak." and continues on CPU/int8. large-v3-turbo ran 16s audio in ~13s (1.25× realtime) on this box; done event lists the CUDA warning under UYARILAR.
- Ground truth for pipeline stages = job log: `~/.config/whisper-browser/logs/<ts>_<input>.log` — every NDJSON event as a line (AŞAMA stages, DİL detection, KALİTE report, dosyalar list, warnings, exit code). Read it instead of guessing from the UI spinner.
- Player "Generate subtitles" (`makeSubsBtn`) requires a loaded media — with no `player.mediaKey` it can't run; the YouTube-input variant (`--youtube`) shares the same yt-dlp bot-wall as probe.
- No speech media on the box? ffmpeg has the `flite` lavfi source built in — generate an intelligible clip offline, e.g. `ffmpeg -f lavfi -i color=c=black:s=640x360:d=30 -f lavfi -i "flite=text='KNOWN SENTENCE':voice=slt" -shortest /tmp/test.mp4`. Known text lets you verify transcription accuracy; flite artifacts produce a few low-confidence words (nice for exercising the `.dusuk-guven.txt` report + the Transcript warning icons).

## R119 E2E gotchas (2026-09-23)
- **Settings `<details>` accordions must be opened via CDP first** — closed `details` children report zero rects and can't receive clicks (`primarySettingsOpen`, `details.advanced` "Glossary / hotwords" panels). `el.open = true` (or click the `<summary>`) before measuring/clicking inside.
- **`modelCacheDelete` needs a *cached* model**: create a stub dir named `models--<org>--<id>` under `backend/models/` — `scanModelCache` marks it `cached` by dir-name match. Enables the real delete → native confirm → `logLine` path without a real download.
- **`browser:research:export` triggers a native GTK save dialog** (active-window title changes) — click it for real; the file lands under `~/Documents/`. Verify via the Log line + file existence.
- **`player.frameDuration` only populates after playback starts** (rVFC): pause the video, then send `,`/`.` via xdotool for exact frame-step checks. `.player-side` scrolls via `SECTION.panel-left`.
