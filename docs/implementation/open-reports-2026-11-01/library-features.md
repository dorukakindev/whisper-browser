# Open-package library and main integration delivery

2026-11-01. Shared checkout `D:/Whisper Local/tmp/assistant618`, branch `codex/review-reading833`, baseline HEAD `2c1db1416d49b947dfcff8929a4f914a65bf14cd`. No commit/push by this agent. Concurrent edits retained.

## Main boundary matrix

| ID | Status | Change / current evidence |
|---|---|---|
| R833-F04 | Fixed | Manga maps scoped by origin+target. TR→EN→TR retains its own guide; origin change is independent. Persistence reads only requested scope, bounded to20 retained maps/tab. |
| R837-F02 | Fixed | Archive lookup resolves shared default→general→site→path→tab profile precedence before hasPage/findPage. Site EN overrides general TR; path DE and tab FR win correctly. |
| R840-F05 | Fixed | Internal reader A+/A-/width/Close publish through existing isolated trusted bridge. Main-frame sender must belong to active browser tab; payload token, navigation generation and exact page URL must match. Preferences/active broadcast and session saved. Navigation during async open is rejected before reader injection. |

Changed main only at imports, archive restore, manga map functions, trusted bridge helper/listener and reader IPC. Root authorized `reader-state` allowlist addition in **browser-preload.js**; generic preload untouched. Reader controller sends no arbitrary operation payload. Tokens are never broadcast to renderer.

`node --test --test-isolation=none tests/open-package-main-continuity.test.js tests/browser-translation-archive.test.js`: **4/4 PASS, exit0**. Tests include real shadow controls with controlled sender transport; wrong token/URL/generation, foreign sender and subframe callbacks are rejected. Existing archive fixture now injects real shared profile resolver dependencies. No real site/account/native reader acceptance claimed.

## R842 feature matrix and exact scope

| ID | Implemented slice | Evidence / limits |
|---|---|---|
| L842-01 | Work-preserving editions/cuts | Same catalog work ID and original source remain. Optional named local editions have explicit cut description and default selection. Each physical file uses its own existing watch key and subtitle timeline. No automatic title/provider-based merging or quality ranking. |
| L842-02 | Local bonus relations | Trailer/behind-scenes/deleted-scene/interview/commentary/other attach through native file picker. Bonus play uses its own watch source; detach changes only relation, preserving work and media file. Duplicate physical source attachment rejected. |
| L842-03 | Ordered additional parts and correct part resume | Edition base is part1; additional parts have stable IDs, order controls and direct play. Default edition play resumes an incomplete in-progress part or next incomplete part. Missing selected part errors without fallback to part1. Each part retains separate source time. **No seamless part autoplay or concatenated global timeline/aggregate duration implemented.** |
| L842-06 | Selected local NFO readonly preview + selective catalog apply | Native picker, physical file max2MB, UTF8/BOM, bounded5000-node stdlib XML subset. DTD/entities rejected; no network/external resolver. Shows old/new fields and protected fields. Provider identity/type conflicts stop apply. Only chosen unlocked fields reach catalog. NFO/media unchanged. **No automatic neighboring-NFO discovery or NFO export.** |
| L842-07 | Persistent metadata field locks | Fields selectable in title details; survive reopen. Provider apply/complete-missing and import merge preserve locked fields, including deliberately empty fields. NFO respects locks; provider identity replacement requires unlocking. Metadata preview visibly marks protected fields. User's explicit manual edits remain possible. |
| L842-08 | Manual read-only folder comparison | Native-picked physical root, bounded10k entries/depth12, no symlink/junction traversal. Same catalog envelope keeps max10 baseline snapshots. Preview separates added/missing/mtime-size changes/possible moves/unstable files; candidate moves never auto-link. Incomplete scan suppresses missing results and baseline acceptance. Source/media/catalog titles are never moved or deleted. **No background watcher, automatic reconcile or automatic import/delete.** |

Optional catalog fields: `editions`, `extras`, `selectedEditionId`, `fieldLocks`; same version1 envelope additionally preserves `folderSnapshots`. Legacy work/episode IDs and original `source` are retained. Edition/part/extra IDs are stable. Native picker authority remains mandatory; renderer cannot supply arbitrary physical paths via save or attachment actions. Preview tokens are bounded, expire, and belong to sender. Deferred picker/NFO operations recheck work revision.

Portable package source walkers now cover editions/parts/extras: video inclusion, missing-source inventory and imported-source verification. Portable alias validation uses inert absolute roots only during schema validation; runtime catalog readers still reject unresolved aliases. Imported bonus/edition verification replaces only the chosen nested source. Existing original/episode restore regression remains passing.

## Upstream research and licenses

Read pinned **real source files**, not just cards/README: Jellyfin Video.cs and VideoListResolver.cs (alternate versions/additional parts/extras), LibraryMonitor.cs (generation/disposal), Jellyfin-web metadataEditor.js (LockedFields), MediaElch KodiXml.cpp (readonly UTF8 NFO). Read GPLv2 and LGPLv3 LICENSE/COPYING. Independent JS/Python model/behavior adaptation only; no C#/React/Qt/server code or new dependency copied.

Public raw web retrieval returned cache misses; used preserved pinned source cache `D:/Whisper Local/.tmp/research842/library`. All **8/8 canonical LF SHA256 hashes** match R842 source manifest; recorded with pinned GitHub links in `tmp/open-package-library-sources.json`. Data/poster rights are separate; no new external provider fetch in these features.

## Current verification

Windows / Node v24.22.0. Focused combined command:

```powershell
$env:WHISPER_TEST_PYTHON = 'D:/Whisper Local/backend/venv/Scripts/python.exe'
$env:WHISPER_TEST_FFMPEG = 'D:/Whisper Local/backend/bin/ffmpeg.exe'
node --test --test-isolation=none tests/open-package-library.test.js tests/media-catalog-store.test.js tests/media-catalog-service.test.js tests/report815-storage-integrity.test.js tests/report815-video-package.test.js tests/open-package-main-continuity.test.js tests/browser-translation-archive.test.js tests/catalog-metadata-sync.test.js
```

Observed **26 tests /26 PASS /0 FAIL /exit0**. After localized label/error refinement, final new library suite **7/7 PASS /exit0**. Local Python NFO worker and real ZIP extraction run; existing video regression produces a real synthetic FFmpeg clip. Four nested video source ZIP test verifies mapping for original/edition/part/bonus; its media bytes are synthetic copy fixtures, not acoustic/codec validation. Metadata HTTP is controlled Response data; no live API/key.

Initial subprocess runs hit sandbox EPERM; authorized focused run outside that restriction succeeded. Fixed fixture-only restore-folder creation and pre1980 ZIP timestamps. A later localized-helper shadowing bug was caught by regressions and fixed; final7/7 is after the correction. No historical PASS is substituted for current results. Full npm suite and CI not run.

**18 owned JS syntax checks, new NFO Python py_compile, scoped git diff --check: PASS.** No dependency/install/start scripts changed.

## Native Windows visual/interaction verification

Executed installed Electron against isolated **component fixture**, production catalog JS/CSS and production UiLocale, synthetic DTO/API transport. Own fresh profile only; user's running application/profile not touched. Test: `tests/electron-open-package-library.smoke.cjs`, **exit0**. Actual captures inspected; dense NFO fields were corrected to separate readable rows, then captures refreshed. EN1280 and TR540 edition controls have no horizontal overflow. Protected NFO checkbox disabled; valid selected field enabled. Folder preview exposes five separate change categories. No console errors recorded.

Evidence under `.uiprev/open-package-library/`:
- `editions-en-wide.png`, `editions-tr-narrow.png`
- `nfo-en.png`, `folder-diff-en.png`
- `result.json`

This verifies native Windows Chromium rendering of production components, **not** start.bat normal startup, native file-dialog interaction, real long/UNC/reparse stress, real playback/sound, GPU/CUDA/provider output, all5000/10000 capacity cases or full app integration. Folder diffs use size/mtime signatures; possible moves are explicitly unconfirmed. Multipart and watcher limits are stated in the matrix.

## Owned files

Main fixes: `src/main.js` narrow seams, `src/browser-reader.js`, `src/browser-preload.js`, `tests/open-package-main-continuity.test.js`, updated archive test fixture.

Library: new `src/catalog-library-model.js`, `src/catalog-library-service.js`, `src/catalog-folder-diff.js`, `backend/catalog_nfo.py`; existing `src/media-catalog-store.js`, `src/media-catalog-service.js`, `src/catalog-extensions.js`, `src/media-relink-matcher.js`, `src/workspace-package.js`, `src/workspace-video-package.js`, `src/user-data-schema.js`, `src/renderer/media-catalog.js`, `src/renderer/media-catalog.css`; tests `open-package-library.test.js`, `electron-open-package-library.smoke.cjs`.

Other agents own other shared-file edits. No changes to media-home, global styles, generic preload, review/assistant modules, speech_relations.py or transcribe.py by this agent.
