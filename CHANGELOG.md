# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Fixed

- R127 — deep module audit fixes: `lastWatched: 0` ("never watched") was rewritten to `Date.now()` in both `watch-index.upsertMedia` and `watch-library-store.upsert`, pushing never-opened items to the top of the recents list; `series_memory._file_lock` POSIX branch now honours `timeout` (a wedged lock holder could hang a transcribe job forever); `download_clip` rejects a missing `--output-file` with a clear error; `download()` validates `audio_lang` before embedding it in the yt-dlp format selector; diagnostic export no longer leaks `pass=` values. `listMedia` ordering is now deterministic (`last_watched DESC, id ASC`).

### Added

- R126 — GitHub bug-report verification + suggestion implementations: 10 confirmed bugs fixed (YouTube multi-account: `_ytDevice` null-race ghost accounts, stable channel-ID account ids merging duplicate/unnamed rows, `accountRemove` now kills the in-flight poll before revoking so the Google grant is actually released, `upsertAccount` dead param/`expiresIn` semantics; session store 7-day media-time cap (long streams preserved, ms-unit bug fixed); empty-subtitle validation rejection; `splitBrowserBounds({})`→null; secret-store no longer overwrites an array mid-path; `invidious._vtt_to_srt` no longer drops cues in blank-line-less VTT). Network capture now records `maxPostDataSize` + request `method`/`postData` (protobuf-POST manifest sites). Subtitle search gains the keyless Stremio OpenSubtitles-v3 ladder + `imdb_id` targeting and a direct-URL download path; ffsubsync gains an audio-reference mode ("Videonun sesiyle senkron bul") aligning subtitles to the reference video's VAD rhythm.
- Browser smoke coverage (R124 step 5): five deterministic Electron smokes — find-in-page bar (Ctrl+F, counter, next/previous, Esc), error surfaces (empty 502 → full error page, bodied 404 renders untouched, DNS/connection-refused surfaces), page background (background-less pages capture pure-white pixels), tab icon persistence across title updates, and the frozen-frame bitmap under open menus.
- Browser chrome Faz C: the side panel now collapses to a 48px icon rail on pages without media (per-site preference kept in localStorage, session fallback for the new-tab page; a rail tab click expands, the collapse button shrinks back), and opens automatically once media is seen unless the user closed it. The new-tab page is now a real NTP — centered search box that navigates the omnibox, up-to-8 quick-access tiles, and a "Continue watching" row fed by media-flagged visits (rememberBrowserVisit now carries a media flag). Slogan/cards only show on first launch.
- Browser CSS consolidation: ~610 browser-chrome rules moved from styles.css into a dedicated browser-chrome.css (brace-depth verified multiset split); :root chrome tokens (--chrome-radius-*, --chrome-h-*, --elev-1/2/3, --motion-*) defined and repeated literals bound; the hardcoded-color ratchet now counts all src/renderer/*.css and the cap dropped 470→459 (--ink-bright token binds the #fff repeats). Light-theme parity: the WCAG contrast scan now also pins 8 browser-chrome + side-panel token pairs (resolved through the var() chain) at ≥4.5:1.
- Fixed: switching to a tab without a URL (new tab) left the stale previous address in the omnibox — it now syncs on tab switch (focused or not), keeping the focus guard for in-place navigation.
- Browser chrome Faz B: browser mode now runs a single 38px title row — the W app menu (player/browser/media-library switching), the tab strip inside the title bar, and one app menu (language, settings, task center, PDF); the unified Whisper button merges subtitle count, translation and caret into one contextual control (hidden without media, "Subtitles · N" with tracks, progress ring while translating, single popover); the signal strip became a 32px floating pill with health/track lists in its popover (`setBrowserSignal` API unchanged); the "More" menu is grouped with in-menu search, a quick row (new tab, reopen closed tab, find, zoom) and Page/Video/Site/Appearance submenus — disabled items collapse away. Acceptance: page content starts at y=88px at 1440x900.
- Browser chrome Faz A polish: toolbar buttons are borderless 32px ghosts (frame only on active/focus/hover); a site chip (lock + host) now sits at the left of the address pill and opens a popover with site security info, the ad-shield toggle moved off the top bar into it, and a shortcut to site permissions; the active tab merges with the toolbar surface (10px top corners, shared background); error pages gain an icon and collapsible technical details.
- Browser error surfaces now localize in English: main-process load errors, empty-HTTP pages, certificate errors, tab crashes and load-retry signals carry a `messageKey` (+`params`) with English renderer templates; the playback diagnostic catalog is bilingual (`labelEn`/`messageEn`), the toolbar "Subtitles · N" chip follows the UI locale, and the 401/403 diagnostic text no longer claims the request was a playback request.
- SmartTube YouTube sign-in now supports multiple Google accounts like SmartTube: the signed-in dialog lists every stored account, lets you switch the active one, remove an account, or add another via device code — personal feeds (home, subscriptions, history) follow the active account.
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

- Find-in-page was permanently stuck on "Searching…" — root cause found: on Electron 43, starting a *fresh* find session with an explicit `findNext: false` makes Chromium silently drop the result (`found-in-page` never fires). New sessions now omit `findNext`; only continuing next/previous calls send `findNext: true`. `refresh()` likewise. The long-standing R123 "verify find-in-page on Windows" boundary is root-caused and fixed, pending real-Windows confirmation.
- Browser R120/R123 fixes (design plan in `docs/raporlar/BROWSER_DESIGN_PLAN_R120.md`, audit in `docs/raporlar/BROWSER_PLAN_R123.md`):
  - Pages that don't paint their own background (plain text, documents, old sites, minimal HTML) were unreadable — black text on the browser's dark base color. The webview background is now white, matching Chrome/Edge/Firefox.
  - Any menu, omnibox suggestion, or panel opening turned the web page fully black (HTML sits under the native view); the active tab's frame is now snapshotted and painted into the page slot while hidden.
  - The two-line subtitle strip no longer steals ~95 px on pages without media; it stays silent until a media/track/cue exists or a ≥warning-priority message arrives.
  - The "More" menu no longer overflows past the bottom of a 900 px window (max-height + in-menu scrolling).
  - Empty-bodies ≥400 responses (e.g. 502) now show a proper "This page isn't working" error screen with Retry instead of a black void; 404 pages with real content still render as the site's own page.
  - Main-document 5xx no longer reports a playback/DRM fault; DNS/offline/timeout network errors get clear page-context messages (-105/-106/-118) instead of raw Chromium text.
  - Tab title updates no longer wipe the favicon — only the label element is rewritten; failed favicons are marked to avoid retry loops. Favicon-less tabs show a host-colored letter avatar, long titles fade instead of cutting hard, the × button shows only on active/hover/focus, and the address bar is pill-shaped.
  - The subtitle panel's empty state now distinguishes "track found on page · N" / "no video on this page" / "video without track", and command-palette + several English-UI strings are translated.
  - Defensive find-in-page changes: the DOM-observer message is sent only after the first real result and redundant `stopFindInPage` calls are removed (root cause of the intermittent "Searching…" hang remains unconfirmed under Xvfb — Windows manual verification queued).
- YouTube device-code sign-in could be silently abandoned: closing the login dialog (Esc/backdrop/X) killed the background poll, so approving at google.com/device never completed the sign-in — the dialog now closes passively while the poll keeps running, and reopening it resyncs the live flow; grants without a refresh token are accepted as temporary sessions instead of erroring, and auth commands run on their own job slot so a long poll no longer starves feed browsing.

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
