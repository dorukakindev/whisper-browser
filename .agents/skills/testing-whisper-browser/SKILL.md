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
- Workspace tabs at top-left of the player head: **Oynatıcı** (player) / **Tarayıcı** (browser). Click Oynatıcı for the video stage.
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

## Network reality on this box
- Invidious feed endpoints (home/popular/trending) work → cards populate (thumbnails may be blank — cosmetic).
- Per-video probes FAIL everywhere: Invidious `/api/v1/videos` → 401/403/500 on all instances; yt-dlp → "Sign in to confirm you're not a bot". So `mediaKey=youtube:*` is unreachable in real UI — YouTube-dependent UI paths can't be exercised live; rely on the vm-sandbox tests (`tests/report67-smarttube-wiring.test.js`, run `npx node --test <file>`).

## Fixtures
- Generate test media with ffmpeg: `ffmpeg -y -f lavfi -i "testsrc=duration=20:size=640x360:rate=25" -f lavfi -i "sine=frequency=440:duration=20" -c:v libx264 -pix_fmt yuv420p -c:a aac -shortest /tmp/test-media/alpha.mp4` (use testsrc2/smptebars for visually distinct siblings). Keep them OUTSIDE `/tmp` if you need them across reboots.

## Transcription run + LLM post-process
- Main-view settings column (left, scrollable): **Basic settings** (Model — pick `tiny` for speed; Motor/engine) and **Advanced settings** (Cihaz = device — default CUDA; pick `CPU` on this GPU-less box or faster-whisper may fail) are separate collapsible cards.
- The **"LLM correction (DeepSeek/OpenAI)"** card holds `llmPostprocess` checkbox, `llmApiKey` (password/masked), `llmEndpointPreset` (choose **"Custom…"** to reveal the `llmBaseUrl` field), `llmModel`.
- Input: click the drop-zone → GTK file dialog (accepts audio too, e.g. flac). Output dir defaults to `~/Downloads/Whisper/ÇIKTI/` — the written `.srt` lands there.
- Run: "Generate subtitles" (`startBtn`) → status pill RUNNING; the LLM stage shows as "LLM düzeltiyor: <model>"; Log panel gets `LLM düzeltme BAŞLIYOR … endpoint …` then `✓ LLM düzeltme TAMAMLANDI — N blok işlendi, M blok düzeltildi`. The Live preview swaps from raw whisper text to the corrected text when the pass completes — that's the discriminating pixel check.
- **API key persistence caveat on Linux:** the key goes through Electron `safeStorage`; without a freedesktop Secret Service daemon it cannot persist — log warns "API anahtarları güvenli depo kullanılamadığı için kaydedilemedi" and after restart the key field is EMPTY while all other LLM fields survive. On Windows (DPAPI) it should persist. So re-enter the key each session when testing on this box.
- Type secrets into fields via the computer tool's `${WHISPER_LLM_API_KEY}` placeholder (auto-substituted; password field masks it). Never screenshot or echo the raw value.
- Backend sanity check without the UI: `backend/venv/bin/python backend/transcribe.py --input <file> --model tiny --device cpu --llm-postprocess true --llm-base-url <url> --llm-model <m>` with `WHISPER_LLM_API_KEY` in env.
