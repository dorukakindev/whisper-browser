# Changelog

All notable changes to this project are documented here. The format follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [Unreleased]

### Added

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

- Reorganized public documentation in English.
- Anonymized machine-specific path examples in tracked audit documentation.

### Fixed

- Browser overlay cue scheduling: after seek or playback-rate changes the pending cue-boundary timer is now re-planned on the current timeline, so the overlay can no longer display a stale caption for seconds.
- Browser overlay recovers when `requestVideoFrameCallback` never fires (pages that produce no compositor frames): a 400 ms fallback timer renders the boundary cue directly.
- Browser overlay no longer skips an entire cue interval when a boundary render lands a few milliseconds early — the boundary epsilon and the −12 ms early-fire margin were removed; a render landing before a boundary re-arms it immediately instead of jumping to the next cue.
- Turkish compound-number bypass in the hard translation quality gate: a wrong-value phrase like "kırk beş" no longer satisfies a source "40" (Python gate and its JS mirror).
- Concurrent YouTube feed loads (e.g. the post-sign-in home refresh racing a section click) no longer fail the second request with "already running"; `youtube:browse` calls are serialized with a bounded wait for the in-flight job.
- Reading-list and element-rules index writes no longer leave orphaned `.tmp` files on write/rename failure (F-102-1).
- Restored browser tab loading no longer throws an unhandled rejection when its webContents is destroyed mid-flight (F-102-2).
- `install.bat`/`install.sh` installs no longer leave broken console scripts (`pip`, `yt-dlp`, `evs-vmp`, ct2-*): entry points are regenerated after the venv swap (F-103-1).
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
