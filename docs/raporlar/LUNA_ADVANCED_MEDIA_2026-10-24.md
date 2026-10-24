# Advanced media workflows — implementation and verification

Date: 2026-10-24, Europe/Istanbul. Branch: `codex/luna-media-home532`; PR: https://github.com/dorukakindev/whisper-browser/pull/482 . Starting HEAD `b09603f10c588b6dfdce660a9575f407d66c2861`; ending product code `6baa49de540685c70077ee1c8d90ea065e5b38e2`.

This work implements the user's requested local-media/torrent/native-player workflows and the previously missing Letterboxd review profile. It extends the existing Luna-style home and assistant; it does not claim a complete feature-for-feature clone or a measured superiority over Luna.

## What is available

| Area | Implemented behavior | Practical limit |
| --- | --- | --- |
| Open media | Local video, watched folder, direct HTTP/HTTPS/RTSP URL and torrent entry points | Normal web pages still use Browser; RTSP/HTTP require the optional native engine |
| Local folders | Bounded recursive inventory, local change watcher, rescan, exact file play, stop following | 30 roots; depth 12; 10,000 videos per root; first 100 groups displayed with search |
| Versions | Collapsible groups for similar filenames with common resolution/codec suffixes | A filename heuristic, not content identity; episode/folder identities and playback preferences remain separate |
| Moved files | Review exact unique basename matches, revalidate before applying, preserve history/dub prefs/notes through existing relink service | Ambiguous matches are not applied; a multi-record failure reports how many were already updated |
| Torrents | Inspect magnet or native-picked `.torrent`, select a video, authenticated Range streaming, seek, pause/resume, rate limits, reopen selected files, forget without deleting files | Optional rqbit install; no public swarm/metadata-peer reliability claim from the offline fixture |
| mpv | Optional embedded Windows playback; shared seek/speed/volume/mute/subtitle text/dub attachment; choose trusted executable; return to Chromium | Explicit opt-in; HLS remains on the established HLS player; native subtitle typography is not identical to DOM styling |
| Episodes | Sorted next unwatched episode action, per-episode voice preparation and watched/unwatched action | Existing source linking/scanner remains; no new automatic intro fingerprint detector |
| Navigation | Chapters already in the player, subtitle search/jump, 12 ffmpeg timeline thumbnails | Thumbnails sample regular positions; this is not semantic scene-change detection |
| Diagnostics | Source, engine, position/duration, media error/readiness and torrent transfer status | Not a GPU/HDR/codec-certification dashboard |
| Whisper/dubbing | Existing controls reused; completed torrent file is size/progress/root checked before granting local access | Whisper extraction of a still-incomplete torrent is not enabled; SRT-based voice preparation remains accessible |
| Taste | CSV/ZIP review import, rating histogram, genres/directors with sample counts, decades/months, six editable weights, avoid flags, personal note, reviews | Metadata needs a conservative title/year match; one title is not labeled a settled preference |
| Review AI | User reviews the bounded sample before sending to the existing provider; proposed JSON is reviewed before saving; each insight requires exact quoted source evidence | Quote validation proves provenance, not semantic correctness. No real provider quality measurement was performed |
| Discovery | Strong matched genre ratings seed recommendations with count/average reason; favorites remain fallback | Deterministic recommendations are genre based; saved six-aspect preferences are assistant context, not an independently validated semantic recommendation model |

## User paths

- Home → **Open media / Medya aç** → local video, folder or torrent.
- Home → **Taste profile / Zevk profilim** → import **Letterboxd CSV / ZIP**; then review statistics/preferences and optionally choose **Review sample & analyze with AI**.
- Player → **… → Playback, scenes & sources / Oynatma, sahneler ve kaynaklar** → native engine, audio tracks, existing subtitle/voice controls, search and timeline previews.
- Torrent support downloads only after **Download engine**. Existing mpv is detected or chosen with **Choose mpv.exe**. Source/voice generation is never automatically started by opening a preparation screen.
- Review preview remains accessible through `preview-luna.bat`, which calls the normal `start.bat` with a separate preview profile. The primary checkout/master and normal profile were not changed in this turn.

## Correctness fixes found during implementation

1. mpv initial seek before `file-loaded` returned `error running command`. Startup now waits for real readiness before seeking. Actual Windows mpv seek passes.
2. A native child surface can cover HTML controls. Native mode reserves a separate control strip, hides for dialogs/menus/assistant/browser mode, and freezes the current decoded frame behind modal overlays. DOM geometry and decoded-frame checks pass; full OS composition screenshot was not completed after a computer-use interruption.
3. Owner-window movement could leave native video in its old position. Session-owned move/resize listeners reposition it and are removed on stop; real move assertion passes.
4. Late native startup/stop and stream-open awaits could affect a newer media choice. Request epochs, source/generation checks and startup cleanup now guard these transitions. Volume/mute/speed are explicitly carried across engine switching.
5. Reconnecting a moved catalog source alone loses its watch-key history. Relink now reuses the existing library/history/notes migration and rolls back the current catalog patch on migration failure. Real IPC test preserves position and the saved opaque voice asset.
6. Missing torrent `file_progress` became `NaN` and could bypass a simple comparison. Local-file authorization now requires finite completed progress, exact size and a real path under the selected torrent root.
7. Old local paths could survive opening a stream and point Whisper at a previous video. An explicit empty `localPath` now clears that source; verified torrent completion supplies its own local file.
8. Torrent JSON rate-limit requests initially used the binary metadata content type. JSON and metadata now use their respective types; real rqbit pause/resume/limits/Range tests pass.
9. Review import could discard repeated reviews or overwrite tags/likes with empty ratings rows. Review evidence is kept separately, ZIP merges preserve nonempty fields, and a Python ZIP test proves script text is removed without extracting archive paths.
10. Corrupt torrent indexes must not silently become an empty index. Validation blocks mutation and preserves the original file. Windows device/path aliases, unsafe sizes, response-body growth and stream token counts are bounded.

## Verification evidence

- Node focused tests: taste evidence/defaults/preserved scores; metadata/profile recommendation reasons; conservative import and shared store; version grouping; corrupt index/path rejection; main/preload boundary. All relevant reruns passed.
- Python: `backend/test_media_shelf.py` **7 passed**; `py_compile backend/media_shelf.py` passed.
- Real rqbit 9.0.1 CLI: local synthetic torrent metadata, HTTP Range byte equality, status, pause/resume, JSON rate limits, completed-file authorization, forget-keeps-files passed (`node tests/media-torrents.smoke.js`). No public peers were used.
- Windows Electron: `tests/electron-media-home.smoke.js` with `WHISPER_NATIVE_TEST=1`, `WHISPER_TORRENT_TEST=1`, explicit local engine/ffmpeg/python paths passed. It plays a valid synthetic MP4 through `whisper-media:`, seeks/resumes, switches to real mpv using private auth, captures a decoded frame, preserves dublaj and moved-file state, creates actual ffmpeg thumbnails, rejects forged review quotes, and checks responsive home/profile layouts.
- Latest combined evidence: `.uiprev/media-home-smoke/1792844730843-4928/results.json`, empty consoleErrors. Earlier native/control-strip run also completed: `1792840900525-17044/results.json`.
- `tests/electron-media-discovery.smoke.js`: controlled catalog, Discover scroll/preferences, global assistant and Defuddle isolated reader passed; evidence `.uiprev/media-discovery/1792844767253-22676-fixture`.
- `tests/electron-browser-trusted-bridge.smoke.js --disable-gpu`: passed.
- Changed/new JavaScript syntax and `git diff --check`: passed.
- One Node invocation initially lacked a discoverable Python in its test environment; rerun with the existing venv through `WHISPER_TEST_PYTHON` passed. This was not presented as a product bug or skipped permanently.

Synthetic representative screenshots: [profile](assets/luna-advanced-2026-10-24/taste-profile-tr.png), [media center](assets/luna-advanced-2026-10-24/media-open-tr.png), [narrow profile](assets/luna-advanced-2026-10-24/taste-profile-680-tr.png). Personal images, profiles, downloaded executables and raw logs are not committed.

## Dependencies, compatibility and unverified scope

See [optional engine provenance](../THIRD_PARTY_MEDIA_ENGINES.md) for fixed rqbit URL/digest, mpv and original-adapter scope. No npm lockfile, TTS model, CUDA/PyTorch, Whisper/translation engine defaults, `install.bat` or `start.bat` was changed. The existing launcher was inspected; this turn's automated UI tests launch Electron directly and do not prove a fresh Windows install/start.bat/GPU workflow.

New optional userData files: `torrent-library.json`, `torrent-media/`, `media-engines/rqbit.exe`, `media-folder-watches.json`, `native-player-engine.json`, `native-player-input.conf`; optional `reviews`/`tasteProfile` fields in `media-shelf.json`; optional catalog `directors`. Existing files/fields remain compatible. The portable project exporter was not expanded to include these new caches/indexes; back them up separately with the application closed.

Not run: full `npm test`, long CI wait, public torrent swarm, actual paid AI review analysis, real GPU/CUDA synthesis, HDR/DRM, every codec/multi-monitor/DPI/fullscreen case, Linux native embedding, semantic intro/credits detection. Timeline previews use bounded subprocesses but are not yet cancellable from a dedicated job row. No claim of “all tests green,” semantic taste perfection, or every Luna feature imported is made.
