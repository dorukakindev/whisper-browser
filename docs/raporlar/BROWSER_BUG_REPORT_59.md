# BROWSER BUG REPORT 59 — Report 58 repair record

**Date:** 2026-09-18

**Repository:** `dorukakindev/whisper-browser`

**Branch:** `master`

**Base commit:** `a9597e937d22a8f1d1fd268a5b711882664109c0`
(report 58 verification record; product code identical to the audited
`0d9dcc771af1e23492c28f5d8fd1c2d4b938f8de`)

**Mode:** repair — every item got a failing regression test first, then the
smallest owning-module change, then targeted and full-suite verification.

## Result summary

All 15 definite findings from `BROWSER_BUG_REPORT_58.md` were reproduced,
fixed and covered by regression tests. No report-58 item was left unfixed;
the evidence distinctions below mark which items still deserve real
Electron / live-site / provider confirmation before being called fully
proven in production.

| Item | Severity | Status | Evidence |
|---|---|---|---|
| R58-01 Live ASR stop discards drain | P1 | fixed | behavioral vm test, `browser-live-audio.test.js` |
| R58-02 Crash leaves Live ASR orphaned | P1 | fixed | behavioral vm test, `browser-lifecycle-policy.test.js` |
| R58-03 Crash keeps paid translation running | P1 | fixed | same test — scheduler `cancelAll` + null |
| R58-04 CEA capture accepts non-2xx bodies | P1 | fixed | 304/4xx/5xx fixtures, `browser-cea-captions.test.js` |
| R58-05 Live playlist matcher not refreshed | P1 | fixed | sliding-window refresh test, same file |
| R58-06 `EXT-X-GAP` counted as required work | P2 | fixed | gap fixture, `browser-cea-full-capture.test.js` |
| R58-07 Generic URL parsing collapses videos | P1 | fixed | 4-service episode matrix, `browser-foundation.test.js` |
| R58-08 Explain actions cannot start | P1 | fixed | real `transcribe:start` handler, `adversarial-ipc.test.js` |
| R58-09 `-whisper-q<id>` suffix + `next.error` | P2 | fixed | shared contract + queue test, `queue-lifecycle.test.js` |
| R58-10 WhisperX ignores `--task translate` | P1 | fixed | fake-model task forwarding, `test_transcribe.py` |
| R58-11 Empty cleaned cue crashes SRT writer | P1 | fixed | composed cleanup→writer regression |
| R58-12 Hallucination averaging deletes real cue | P1 | fixed | mixed-confidence fixture |
| R58-13 Metric at 0.0 s discarded | P2 | fixed | zero-boundary realignment fixture |
| R58-14 Piecewise sync emits reversed output | P1 | fixed | adversarial boundary fixture + invariants |
| R58-15 Keyboard routing priority | P1 | fixed | DOM keyboard tests, `player-ui.test.js` |

## Fixes and root causes

### R58-01 — Live ASR stop discarded drained final segments

`stopBrowserLiveAsr()` set `browserLiveAsr = null` immediately after writing
the `stop` command; `consumeLiveAsrLine()` then rejected every subsequent
line via its ownership check, so Python's final flushed `segment` events
disappeared. The job now stays the accepted drain owner until process
close: `browserLiveAsr` is nulled only in the `close` handler. New chunks
were already rejected by `job.stopping` in `browser:liveAsr:chunk`, and new
starts are rejected while the old job drains.

- Code: `src/main.js` `stopBrowserLiveAsr()`.
- Test: `tests/browser-live-audio.test.js` — extracted real
  `stopBrowserLiveAsr` + `consumeLiveAsrLine`; a `segment` emitted after
  stop but before close is stored; the stop command reaches stdin.

### R58-02 / R58-03 — Renderer crash orphaned ASR and paid translation

The tab `render-process-gone` handler detached/recreated the view but never
ran the `destroyBrowserTab` cleanup contract. It now calls, in the same
order as `destroyBrowserTab`: `stopBrowserManga`, `stopBrowserPageTranslation`,
`tab.translationScheduler?.cancelAll()` + `= null`, and
`stopBrowserLiveAsr()` when `browserLiveAsr?.tab === tab` — before view
teardown. Provider calls for a dead page stop at the source.

- Code: `src/main.js` crash handler.
- Test: `tests/browser-lifecycle-policy.test.js` — the real handler body is
  executed in a vm context; asserts ASR stop, scheduler `cancelAll`,
  scheduler reference cleared, manga/page-translation stopped and view
  released.
- Evidence limit: verified via deterministic vm execution of the real
  handler. A real-Electron `render-process-gone` run with a live model
  process remains worthwhile manual evidence but is not claimed here.

### R58-04 — CDP CEA capture processed HTTP error/304 bodies

`captureBrowserResponse()` fed any response body to the CEA decoder;
304/4xx/5xx payloads decoded to zero cues and were marked fetched,
poisoning the completeness ledger. Non-2xx responses are now rejected
before decode for CEA candidates and are never marked fetched.

- Code: `src/main.js` `captureBrowserResponse()` early status gate.
- Test: `tests/browser-cea-captions.test.js` — 304, 403 and 500 fixtures
  leave the segment unfetched and retryable.

### R58-05 — Live HLS playlist refresh did not update CEA matchers

Media-playlist refreshes carry segments, not the master playlist's
`CLOSED-CAPTIONS` declaration, so `browserHlsCeaSegmentMatchers` stayed
tied to the first sliding window. Manifest handling now rebuilds matchers
via `buildHlsCeaSegmentMatchers()` with track metadata carried forward by
`hlsCeaTracksForVariant()`, registers them via
`registerBrowserHlsCeaMatchers()`, merges refreshed segments with
`mergeCeaCaptureSegments()` and updates the active full-capture job's
segment plan, totals and completeness.

- Code: `src/main.js` manifest handling path.
- Test: `tests/browser-cea-captions.test.js` — master + two successive
  sliding media playlists keep new segments matched.
- Evidence limit: synthetic CDP-level refresh; not verified against a real
  live HLS broadcast with rotating signed URLs.

### R58-06 — `EXT-X-GAP` segments treated as required capture work

`parseHlsSegments()` already records `gap: true`; the full-capture ledger
now excludes gap segments from required/fetchable work while retaining
their duration for timeline accounting, so an unavailable segment can no
longer keep a capture permanently partial or trigger futile retries.

- Code: `src/browser-cea-full-capture.js` + plan path in `src/main.js`.
- Test: `tests/browser-cea-full-capture.test.js` — gap fixture completes
  the ledger without fetching the gap.

### R58-07 — Generic known-site URL parsing collapsed distinct videos

The generic extractor captured the token right after `/video`, `/watch`,
`/lecture` or `/learn`, so `udemy:lecture`, `max:watch`, `discovery:show`
and `raiplay:2024` collapsed whole catalogs into one media identity.
`serviceIdentity()` now walks path segments, finds the **last** route
keyword and uses the remaining tail as the content id (show/episode slugs
stay in the tail); the hex-id fallback is unchanged. Verified matrix:
`udemy:lecture` → `udemy:111` vs `udemy:222`, `max:watch` → distinct
watch tails, `discovery:show-name` → `discovery:show-name/episode-one` vs
`episode-two`, `raiplay:2024` → `raiplay:2024/05/slug` per video.

- Code: `src/browser-media-identity.js` `ROUTE_KEYWORD_RE` + tail logic.
- Test: `tests/browser-foundation.test.js` — four service pairs differ,
  alternate URL for the same episode stays equal.

### R58-08 — Local subtitle "Explain" actions could not start

`askExplain()` sends `player.subPath` as `opts.input`, but
`transcribe:start` routed `options.input` through `authorizeMediaFile`
unless `reexport || translateOnly` — so `.srt/.vtt/.ass` explain jobs were
rejected before Python. `options.explain` is now included in the
subtitle-input branch.

- Code: `src/main.js` input-authorization branch.
- Test: `tests/adversarial-ipc.test.js` — the real `transcribe:start`
  handler is invoked with an explain job; the subtitle authorizer is used,
  the media authorizer is not, and spawn succeeds.

### R58-09 — Queue `-whisper-q<id>` suffix + missing `next.error`

Renderer produced `-whisper-q${id}` (e.g. `-whisper-q2`), which fails the
main validator's ≥4-character rule, so the second same-named queue item
could never start; and the `startTranscribeSafe` rejection path set
`status='error'` without persisting the reason on the item.

- Shared contract: `src/renderer/queue-lifecycle.js` now exports
  `OUTPUT_NAME_SUFFIX_RE`, `isValidOutputNameSuffix()` and
  `queueOutputNameSuffix(id)` (`-whisper-q0002` style). Main.js validates
  with the shared function; renderer builds with the shared builder.
- Regeneration: collision suffix is recomputed by
  `computeQueueCollisionSuffix()` both at add time and at every start in
  `processNextQueueItem()`, so persisted items carrying an invalid legacy
  suffix are repaired at start.
- `next.error = String(r.error || 'İş başlatılamadı.').slice(0, 500)` is
  set on the start-failure path.
- Tests: `tests/queue-lifecycle.test.js` (ids 1–10000 valid, behavioral
  collision extraction, recompute + error contract);
  `tests/main-args.test.js` harness now injects the shared validator.

### R58-10 — WhisperX silently ignored `--task translate`

`run_whisperx()` built `asr_options` without `task` and called
`model.transcribe(audio, batch_size=...)` without it. The task is now
forwarded through the supported API location so a speech-to-English job no
longer returns source-language transcription under translated-output
naming.

- Code: `backend/transcribe.py` `run_whisperx()`; older fake-model fixtures
  gained the `task` field.
- Test: `backend/test_transcribe.py` — a fake WhisperX model receives the
  translate task.
- Evidence limit: fake-model semantics; real WhisperX model output not
  claimed.

### R58-11 — Text cleanup created an empty cue that crashed the SRT writer

`fix_text_artifacts()` could return `''` for `&gt;&gt;`;
`fix_common_errors()` preserved it and `serialize_srt_strict()` raised at
final write. Blocks emptied by cleanup are now dropped before writers.

- Code: `backend/transcribe.py` cleanup path.
- Test: composed cleanup→`fix_common_errors`→`serialize_srt_strict`
  regression in `backend/test_transcribe.py`.

### R58-12 — Repeated-hallucination group averaging deleted a real occurrence

`find_repeated_hallucinations()` averaged word confidence across identical
occurrences; a mixed group (0.95 + three 0.10) produced mean 0.313 and all
four were deleted. Decision is now per occurrence — a high-confidence
occurrence is preserved.

- Code: `backend/transcribe.py` repeated-hallucination drop logic.
- Test: mixed-confidence + legitimate-repetition fixtures.

### R58-13 — A metric starting at 0.0 seconds was discarded

`realign_segment_metrics()` used `m.get("start") or float("nan")`, turning
the valid value `0.0` into NaN. `None` is now distinguished from numeric
zero at both boundaries.

- Code: `backend/transcribe.py`.
- Test: zero-start/zero-end realignment fixture.

### R58-14 — Piecewise subtitle sync emitted reversed, overlapping output

`apply_piecewise()` appended transformed pieces without a global
chronological sort, overlap repair or cross-piece monotonicity check;
spans with `+8`/`-8` offsets produced `(8–18)` then `(2–12)`. Output is
now globally sorted with the repository timing-gap contract applied
across piece boundaries.

- Code: `backend/transcribe.py` `apply_piecewise()`.
- Test: adversarial boundary fixture + per-output-sequence invariants.

### R58-15 — Keyboard routing lacked a consistent priority contract

The player `keydown` handler is reorganized into the contract order:
**(1) layer/modal close** — a merged Escape path closes
downloads/places/subtitle-mode/shortcut-help/settings layers (and exits
fullscreen or closes the player in local mode) regardless of the focused
control, with `player.editing` routing to `closeCueEditor()`;
**(2) editable/interactive target guard** — unchanged tag/contenteditable
protection for non-Escape keys;
**(3) browser shortcuts** — Ctrl/Meta(+Alt) chords in browser mode only;
**(4) player shortcuts** — only when no modifier is held. An unmatched
`Ctrl`/`Meta`/`Alt` combination can no longer fall through to single-letter
actions (`Ctrl+C` no longer triggers `copyCue`; `Alt+letter` fires
nothing). The main-screen Escape handler now skips the job-cancel branch
for editable targets while still closing an open modal.

- Code: `src/renderer/renderer.js` player keydown listener + main-screen
  listener.
- Tests: `tests/player-ui.test.js` — real listener code executed against a
  fake DOM: `Ctrl+C` does not fire `copyCue`, `Alt+C` fires nothing,
  focused `button` + `Escape` closes the settings drawer, plain `c` still
  works, `Escape` in an `input` during a running job does not click
  cancel, and `Escape` on a plain target still cancels.

## Verification performed

- `npm test` — **Tüm testler geçti** (full suite, including 190 backend
  tests; one harness fix was needed in `tests/main-args.test.js` to inject
  the shared validator into the extracted argv block).
- `npm run test:electron-bridge` — passed.
- `node tests/run-electron-smokes.js a3-acceptance` — 7 acceptance paths +
  manga stale-edit rollback; clean exit code 0.
- `backend/venv/Scripts/python.exe backend/test_transcribe.py` — 190/190.
- `node --check` on `src/main.js`, `src/preload.js`,
  `src/renderer/renderer.js`; `python -m py_compile backend/transcribe.py`.
- Targeted suites: `browser-live-audio` 10, `browser-lifecycle-policy`,
  `browser-cea-captions` 15, `browser-cea-full-capture`,
  `browser-foundation` 24, `adversarial-ipc` 15, `queue-lifecycle` 19,
  `player-ui` 145, `main-args` 16.

## Items still deserving non-synthetic evidence

- **R58-02/03:** crash-path cleanup is proven by executing the real handler
  in a harness; a real-Electron `render-process-gone` with a running model
  process would be stronger end-to-end evidence.
- **R58-05:** live-playlist matcher refresh is proven synthetically; a
  real sliding-window live HLS stream was not used.
- **R58-10:** WhisperX `task` forwarding is proven with a fake model; real
  WhisperX model output was not exercised.
- **R58-15:** DOM-level harness tests cover the priority contract; real
  browser focus/IME edge cases (e.g. AltGr layouts, contenteditable rich
  editors) were not exercised.

No provider keys, real profiles, signed URLs, cookies or user data were
read or logged during this work.
