# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

- Player sentence-tools row consolidates its four subtitle actions into a single "Subtitle actions" popup menu; SmartTube autoplay now shows a 5-second "Up next" countdown card with Play now/Cancel; the browser address bar dims the scheme and path and bolds the domain when unfocused; the playback-speed control renders as a themed popup menu while the hidden select stays the single source of truth.
- Browser ⋯ menu gains "Watch in player" on open YouTube pages: hands the video off to the app player, carries over the current playback position (or the watch-history resume point), and pauses the browser tab.
- YouTube TV mode: YouTube's own TV web app (`youtube.com/tv`) in an isolated, sandboxed window with a TV user agent; sign-in uses YouTube's own on-screen code (yt.be/activate) — no OAuth client is embedded. Ctrl+Shift+S hands the playing video to the subtitle/translation tools.
- SmartTube TV layout (default on): dark 10-foot palette, icon rail that expands on focus, scaled focus ring, remote/arrow navigation between rail and grid, F for full screen; larger device code/QR with expiry countdown.

- Address bar: frecency ranking (history keeps visit counts), inline autocomplete ("git" → "github.com"), section headings and site icons; pure logic moved to `src/browser-address-model.js`.
- Translation model scorecard: the backend emits `translation_quality`; settings show each model's invalid-batch rate over its last 10 jobs (TR/EN).
- "Untranslated lines" cue filter with a one-click "Translate missing" banner; retranslate-all now opens an old/new diff where selected lines can be restored (.srt).
- ASS alignment (`\anN`), position (`\pos`) and whole-line italics survive translation into SRT/ASS/VTT output.
- "Open with http" on https connection failures (explicit warning; never for certificate errors); plain `#anchors` kept in the local session; "Save as PNG" converts WebP/AVIF/ICO/BMP in an isolated, network-less window.
- `npm run audit:ui` (headless Chromium contrast audit across theme × locale × width; runs `--strict` in CI) plus ratchet tests for hard-coded CSS colors and EN locale coverage.
- Translation quality corpus (`backend/golden-corpus-tr.json`, 60 cues) with per-category defect metrics and deterministic mock-provider pipeline tests.
- Provider cost counters (`providerRequests`/`cacheHits`/`cacheMisses`) in browser translation telemetry, `browser:translation:snapshot`, diagnostics, and the live-translation signal line.
- Crash-integrity gauntlet: deterministic fs fault injection across every critical store write path (asset store, session store, translation cache/archive, notes, reading list, element rules, series context, CEA checkpoint, secret store) plus a real-Electron damaged-profile restart smoke and a 10k-cue / multi-tab / concurrent-translation performance measurement smoke.
- Linux development install/launch scripts (`install.sh`/`start.sh`) wrapping the same lock-verified orchestrator; honest platform notes in README and INSTALLATION.
- CI now explicitly installs the pinned Castlabs Electron binary and runs the real Electron bridge smoke on Ubuntu (xvfb) and Windows.
- Desktop YouTube sign-in via Google's recommended installed-app flow: "Authorize in browser" opens system browser with PKCE + loopback redirect; device code remains only for "TVs and Limited Input" clients.
- SmartTube section: QR-assisted device-code sign-in using a user-configured OAuth client; account setup and real personalized feeds require live acceptance (#9).
- SmartTube queue rail on the home grid with local continue/most-played rails (#9).
- InnerTube `lockupViewModel` card parsing for signed-in personalized feeds (#11).
- Real-UI screenshot gallery and a short English-captioned product tour.
- Public support routing, a project code of conduct, and private security-report links.
- English, screenshot-led usage guide covering local files, YouTube source mode, browser caption capture, contextual subtitle translation, page/manga/PDF workflows, and review boundaries.
- Current-documentation index and isolated-profile screenshot of separate subtitle and manga provider settings.

### Changed

- Audit/report markdown files moved from the repository root to `docs/raporlar/`.
- `qrcode` is now a devDependency; its CLI dependencies (`yargs@15`, `yargs-parser@18`) no longer ship in the packaged app.
- 57 browser status messages and several split sentences gained English translations; 73 near-token hard-coded colors now use design tokens; 28 further light-theme contrast failures fixed.

- Reorganized public documentation in English.
- Anonymized machine-specific path examples in tracked audit documentation.

### Fixed

- SmartTube sidebar: the bottom sign-in button is now "YouTube giriş" (Google/TV device-code flow) instead of the generic Invidious login; Invidious giriş moved into the nav list. When signed in, the History section now also shows the real YouTube account watch history (`FEhistory`) with local-library fallback — joining Home (`FEwhat_to_watch`) and Subscriptions (`FEsubscriptions`) as personalized feeds.
- Browser/player deep-audit fixes (local patch series landed as R119): the research-notebook export button called an undefined `writeTextAtomic`; the model-cache clear flow called an undefined `addLog` and the glossary add button relied on an undeclared `$()`; the omnibox calculator ranked unary minus above exponentiation (-2^2 evaluated as 4); light-theme player controls and dark-theme metadata lost contrast; several Turkish strings leaked into the English UI and the search empty-state; the new-tab button sat away from the last tab; translation distribution in scripts without spaces now uses `Intl.Segmenter` grapheme segmentation. Player gains frame stepping via `requestVideoFrameCallback` and 0–9 keys seeking to 0–90% of the timeline.
- A persistent provider error surfacing mid-translation (quota, authentication, or model unavailable) now stops the remaining chunks and rescue bundles from opening new API calls; previously every queued chunk cycled all routes and burned requests before failing.
- Translate-only jobs now honor the "Merge continuation sentences" option: spilled-over sentences are merged before translation instead of being silently ignored despite the setting's tooltip (the batch transcribe path already applied it).
- Translation rescue is no longer serialized per chunk: small retry bundles now run on a shared worker-bounded pool, so a chunk with several rejected groups no longer waits minutes for sequential API round-trips (observed: a single chunk's rescue took 233 s).
- Browser/translation/cosmetic audit (2026-09-22, see `docs/raporlar/BROWSER-CEVIRI-KOZMETIK-DENETIM-2026-09-22.md`):
  - Subtitle translation rejects a whole batch when the model returns block ids outside `0..n-1` (1-based replies silently shifted every cue by one line and were cached).
  - Fuzzy translation memory no longer reuses a translation across a negating affix (possible → impossible, legal → illegal).
  - Translate-only output names strip only real language codes and keep qualifiers (`Dune.Part.Two.srt → Dune.Part.Two.tr.srt`, `film.en.forced.srt → film.tr.forced.srt`); two parts no longer overwrite each other. The language chip ignores non-language suffixes.
  - ASS input converts `\h` to a no-break space instead of leaking it into the text.
  - Page translation keeps the original text and the block's active state after its own restore+apply writes; RTL target overlays get `dir`.
  - Browser translation "Retry failed" after a provider circuit trip re-plans the playback window instead of translating the entire track, and resets the consecutive-failure counter.
  - PDF text extraction orders right-to-left lines correctly.
  - Address bar: the typed input is always the default row (Enter no longer opens an old history match or copies a calculator result), stale results are ignored when Enter arrives within the debounce, `word: text` queries search instead of erroring, and LAN/intranet addresses open over http.
  - Search filters (places, omnibox, downloads, cue list, history, diagnostics) fold I/İ/ı consistently.
  - Ctrl+Tab / Ctrl+1..9 follow the on-screen tab order with groups; saved images take their extension from Content-Type (webp/avif/ico); Markdown links escape parentheses; `-2^2` evaluates to -4; per-page settings report the 200-entry limit instead of being silently dropped.
  - Cosmetics: 10 undefined CSS tokens aliased to canonical ones (transparent tab preview/SmartTube surfaces), light-theme omnibox dropdown, player/SmartTube/bilingual list and panel controls fixed for contrast, outline action buttons get their border, find-in-page input styled, reduced-motion loading tab no longer mimics the active tab, missing EN strings in the browser chrome.
- Browser overlay cue scheduling: after seek or playback-rate changes the pending cue-boundary timer is now re-planned on the current timeline, so the overlay can no longer display a stale caption for seconds.
- Browser overlay recovers when `requestVideoFrameCallback` never fires (pages that produce no compositor frames): a 400 ms fallback timer renders the boundary cue directly.
- Browser overlay no longer skips an entire cue interval when a boundary render lands a few milliseconds early — the boundary epsilon and the −12 ms early-fire margin were removed; a render landing before a boundary re-arms it immediately instead of jumping to the next cue.
- Turkish compound-number bypass in the hard translation quality gate: a wrong-value phrase like "kırk beş" no longer satisfies a source "40" (Python gate and its JS mirror).
- Concurrent YouTube feed loads (e.g. the post-sign-in home refresh racing a section click) no longer fail the second request with "already running"; `youtube:browse` calls are serialized with a bounded wait for the in-flight job.
- Reading-list and element-rules index writes no longer leave orphaned `.tmp` files on write/rename failure (F-102-1).
- Restored browser tab loading no longer throws an unhandled rejection when its webContents is destroyed mid-flight (F-102-2).
- `install.bat`/`install.sh` installs no longer leave broken console scripts (`pip`, `yt-dlp`, `evs-vmp`, ct2-*): entry points are regenerated after the venv swap (F-103-1).
- SmartTube search no longer shows a misleading "no results" empty state on network/5xx failures — errors surface as visible status with a retry action (F-104-1).
- SmartTube channels/live sections no longer collapse transient errors into a fake empty/sign-in state, and search "Load more" no longer dies silently after one failed page (F-104-2/3).
- `<dialog>` elements opened from the player layer now close on Escape: the global keydown handler no longer preempts the dialog's native cancel (F-104-4).
- `requirements-ci.txt` resolves on stock Ubuntu 22.04 Python 3.10 via version markers; CI pins on 3.11 unchanged.
- Browser subtitle capture no longer merges separate text tracks into one published stream when players materialize tracks via `data:` `<track>` elements (hls.js); each track now keeps its own stream identity, ending cross-track cue contamination and silent cue loss.
- Browser media tools (intro detection, OCR, semantic search, scene strips) no longer report "not found" on Linux when ffmpeg/python resolve via PATH.
- Startup environment check no longer shows a false "Python venv not found" warning on Linux; backend/bin ffmpeg detection is platform-aware.
- SmartTube subscription empty-state, hint, and device-code error strings now translate to English.
- HLS playback runs the hls.js demuxer in a worker again (CSP worker-src), restoring streaming throughput.
- YouTube client ID is repopulated when returning to the client form after a bounced sign-in (secret never echoed).
- Restored read-only YouTube OAuth scope, removed an unrelated application's embedded OAuth client, and cleared old tokens when changing clients.
- Corrected SmartTube compact view counts and channel identity extraction for lockup cards.
- SmartTube home no longer renders blank on feed errors; a local-rails fallback with sign-in and retry actions is shown instead (#11).
- Queue auto-advance and the Next button now resume a partially watched video from its saved position instead of restarting it (#8).
- HLS CEA full-capture ledger now keys segments by media sequence, so a mid-playlist `EXT-X-DISCONTINUITY` inserted on manifest refresh no longer orphans completed segments — the capture used to refetch and re-decode them, report stale missing counts, and could stay `partial` forever.
- Browser CEA capture progress events keep the `complete` flag in the renderer state (it was dropped by the state normalizer), so UI/diagnostics can distinguish verified-complete captures from honest partials.
- SmartTube overlay re-opens after a failed card probe instead of leaving a black stage (#7).
- Refined translation revisions now reach the preview for blocks sharing the same timestamp (#5).
- The player Next button refreshes correctly on queue toggles and media transitions (#2).
- Repository, privacy, CI runtime, licensing, and security metadata corrections.

## [0.9.0-beta.1] - 2026-09-15

Initial public beta baseline. The older v1.1-browser-hardening tag is a historical checkpoint, not a stable semantic-version release.
