# BROWSER BUG REPORT 58 — Report 54 current-tree verification

**Date:** 2026-09-17

**Repository:** `dorukakindev/whisper-browser`

**Branch / audited commit:** `master` / `0d9dcc771af1e23492c28f5d8fd1c2d4b938f8de`

**Mode:** report only — no product code was changed

## Scope and decision rule

`BROWSER_BUG_REPORT_54.md` contains hundreds of agent-generated claims. Its
own “DOĞRULANDI” labels were not accepted as evidence. A finding is listed as
definite below only when the current tree has all of the following:

1. a reachable production path;
2. a concrete source location;
3. a deterministic synthetic reproduction or an unavoidable control-flow
   consequence;
4. a user-visible impact;
5. a specific reason why the current tests can stay green.

The list is intentionally capped at 15 independent root causes. Reports 55,
56 and 57 are later repair/closure records, not new open-bug inventories.

## Definite current findings

### R58-01 · P1 — Stopping Live ASR discards drained final segments

- **Source:** `src/main.js:6819-6835,6882,6941`.
- **Reachable path:** `stopBrowserLiveAsr()` sets `browserLiveAsr = null`
  before writing the `stop` command. Python may then flush final `segment`
  events, but `consumeLiveAsrLine()` immediately rejects them because
  `browserLiveAsr !== job`.
- **Impact:** the final seconds of speech can disappear whenever Live Whisper
  is stopped normally.
- **Why tests miss it:** current tests cover Python drain and source-level
  lifecycle pieces separately, not the main-process stop-to-stdout sequence.
- **Acceptance:** keep the job as the accepted drain owner until stdout/close,
  reject new chunks while stopping, and test a final segment emitted after
  the stop request but before process close.

### R58-02 · P1 — A browser-tab renderer crash leaves Live ASR orphaned

- **Source:** `src/main.js:10548-10605` versus normal cleanup at
  `src/main.js:10906-10911`.
- **Reachable path:** the tab `render-process-gone` handler detaches and
  recreates the view but never calls `stopBrowserLiveAsr()` for that tab.
- **Impact:** the model process and main-process busy state can remain alive;
  after recovery the UI can try to start a second session and receive “already
  running”.
- **Why tests miss it:** the Electron crash smoke verifies view recovery, not
  model-job ownership after the crash.
- **Acceptance:** a crash must stop/drain the tab-owned ASR job, release the
  model slot, and permit a fresh start after recreation.

### R58-03 · P1 — A browser-tab renderer crash keeps paid translation work running

- **Source:** the same `render-process-gone` handler at
  `src/main.js:10548-10605`; working close/unload paths call
  `translationScheduler.cancelAll()` at `10908` and `12352`.
- **Reachable path:** a tab can crash while a complete-track translation
  scheduler is active; the crash handler increments generation but does not
  cancel the scheduler.
- **Impact:** API requests continue for a dead/recreated page, results are
  discarded by freshness gates, and the job snapshot can remain busy.
- **Why tests miss it:** crash recovery and scheduler cancellation are tested
  independently.
- **Acceptance:** crash handling must cancel and clear the scheduler and all
  translation session fields before view recreation; assert that no further
  provider call starts after the crash event.

### R58-04 · P1 — CDP CEA capture processes HTTP error/304 bodies as segments

- **Source:** `src/main.js:8794-8796` explicitly sends an empty buffer for
  HTTP 304; other non-2xx statuses are not rejected before body processing.
  `captureBrowserHlsCeaSegment()` marks the segment fetched at `7595` after a
  decoder call that may validly return zero cues.
- **Impact:** a 304, 403, 404 or 500 response can poison the completeness
  ledger; the real segment is then skipped as already fetched.
- **Why tests miss it:** the 13 CEA tests cover real TS/fMP4 decoding,
  byte-ranges, 708 identity and ordering, but not HTTP status semantics.
- **Acceptance:** reject non-2xx before decode; handle 304 as a cache/re-fetch
  decision, never as a completed media segment; add 304/403/500 fixtures.

### R58-05 · P1 — Live HLS media-playlist refreshes do not update CEA matchers

- **Source:** CEA setup is entered only when the currently processed manifest
  itself contains `detectHlsCea608()` results (`src/main.js:8485-8492,
  8599-8603`). Media-playlist refreshes normally contain segments, not the
  master's `CLOSED-CAPTIONS` declaration.
- **Impact:** after the initial sliding window, new live segments are absent
  from `browserHlsCeaSegmentMatchers`; embedded captions stop growing or fall
  into the broad, less precise fallback.
- **Why tests miss it:** no master + two successive sliding-media-playlist
  lifecycle test exists.
- **Acceptance:** retain the active master track declaration and refresh
  segment matchers whenever its chosen media playlist changes.

### R58-06 · P2 — `EXT-X-GAP` segments are treated as required capture work

- **Source:** `parseHlsSegments()` records `gap: true` at
  `src/browser-subtitles.js:624`, but `src/browser-cea-full-capture.js` never
  reads that flag. Normalization, completeness and ordered capture all count
  and fetch the gap entry.
- **Impact:** a standards-compliant unavailable segment can keep a capture
  permanently partial and trigger futile retries.
- **Why tests miss it:** parser tests preserve the flag but the full-capture
  ledger has no gap fixture.
- **Acceptance:** exclude gaps from required/fetchable work while retaining
  their duration in timeline/completeness accounting.

### R58-07 · P1 — Generic known-site URL parsing collapses distinct videos

- **Source:** the first generic pathname match in
  `src/browser-media-identity.js:111-120` captures the token immediately after
  `/video`, `/watch`, `/lecture` or `/learn`, even when that token is a route
  keyword/year/show slug rather than the episode id.
- **Deterministic reproduction on current code:**
  - two Udemy lecture URLs → `udemy:lecture`;
  - two Max `/video/watch/...` URLs → `max:watch`;
  - two Discovery episodes in one show → `discovery:show`;
  - two RaiPlay 2024 URLs → `raiplay:2024`.
- **Impact:** subtitle tracks, playback position, notes and preferences can be
  shared between unrelated videos.
- **Why tests miss it:** `browser-foundation` has stream-token stability tests
  but no multi-episode fixture matrix for these services.
- **Acceptance:** add service-specific extractors and prove two episodes differ
  while alternate URLs for the same episode remain equal.

### R58-08 · P1 — The local subtitle “Explain” actions cannot start

- **Source:** renderer `askExplain()` sends the subtitle as `opts.input`
  (`src/renderer/renderer.js:15233-15256`). Main authorizes `options.input` as
  a subtitle only for `reexport || translateOnly`, not for `options.explain`
  (`src/main.js:15747-15751`).
- **Impact:** sentence explanation, word explanation and translation review
  fail before Python starts because `.srt/.vtt/.ass` is sent through the media
  file authorizer.
- **Why tests miss it:** tests cover `explainTranslation` authorization, not
  the primary explain input.
- **Acceptance:** include `options.explain` in the subtitle-input branch and
  invoke the real `transcribe:start` handler with an authorized synthetic SRT.

### R58-09 · P2 — Early same-name queue collisions generate an invalid suffix

- **Source:** `src/renderer/renderer.js:529` creates
  `-whisper-q${id}`; `src/main.js:15812` requires at least four characters
  after `-whisper-`.
- **Deterministic reproduction:** `-whisper-q2` and `-whisper-q12` both fail
  the current regex; only `q123` and longer pass.
- **Additional current defect:** when `startTranscribeSafe()` rejects for a
  non-busy error, `processNextQueueItem()` sets `status='error'` but does not
  assign `next.error` (`src/renderer/renderer.js:775-806`).
- **Impact:** the common second same-named file cannot start and the queue row
  may show no reason.
- **Why tests miss it:** collision tests do not exercise small persisted IDs
  through the real main validator.
- **Acceptance:** use one shared suffix builder/validator, regenerate on retry,
  and persist the returned error message on the item.

### R58-10 · P1 — WhisperX silently ignores `--task translate`

- **Source:** `run_whisperx()` builds `asr_options` without `task` and calls
  `model.transcribe(audio, batch_size=...)` without it
  (`backend/transcribe.py:4038-4066`). The faster-whisper path does pass
  `task=args.task`.
- **Impact:** a WhisperX job requested as speech-to-English can return source-
  language transcription while downstream naming/language assumptions treat
  it as translated output.
- **Why tests miss it:** the WhisperX fake tests cover cleanup and confidence,
  not forwarded task semantics.
- **Acceptance:** prove a fake WhisperX model receives the translate task (in
  the supported API location) and the emitted language/naming matches reality.

### R58-11 · P1 — Text cleanup can create an empty cue that crashes final SRT writing

- **Source:** `fix_text_artifacts()` removes a leading `>>`
  (`backend/transcribe.py:4230-4244`); no final non-empty filter follows before
  strict writing.
- **Deterministic reproduction:** current code returns `''` for `>>`,
  `fix_common_errors([(0,1,'>>')])` preserves the empty entry, and
  `serialize_srt_strict()` raises `RuntimeError` for that cue.
- **Impact:** a long transcription can finish inference and fail at final
  output publication.
- **Why tests miss it:** cleanup and strict-writer tests cover each function
  separately, not their composition.
- **Acceptance:** filter/diagnose empty cleaned entries before every writer and
  add the exact composed regression.

### R58-12 · P1 — Repeated-hallucination group averaging can delete a real occurrence

- **Source:** `find_repeated_hallucinations()` computes one mean word confidence
  for every identical occurrence; `drop_repeated_hallucinations()` deletes all
  indices when that group mean is below 0.4 (`backend/transcribe.py:4426-4530`).
- **Deterministic reproduction:** four identical cues with confidences
  `0.95, 0.10, 0.10, 0.10` produce group confidence `0.313`; current code
  deletes all four, including the 0.95 occurrence.
- **Impact:** legitimate dialogue can be removed together with low-confidence
  hallucinations.
- **Why tests miss it:** the current threshold test uses uniformly low groups;
  it has no mixed-confidence group.
- **Acceptance:** decide/drop per occurrence (or preserve any high-confidence
  occurrence) and add mixed-confidence plus legitimate-repetition fixtures.

### R58-13 · P2 — A metric starting at 0.0 seconds is discarded

- **Source:** `realign_segment_metrics()` uses
  `m.get("start") or float("nan")` (`backend/transcribe.py:4390-4397`), so
  the valid value `0.0` becomes NaN and the row is removed.
- **Deterministic reproduction:** one `(0,1)` cue and one metric with
  `start:0.0,end:1.0` returns `None` instead of the aligned metric.
- **Impact:** the first spoken block can lose confidence/no-speech evidence,
  weakening hallucination and quality decisions.
- **Why tests miss it:** no zero-origin realignment fixture exists.
- **Acceptance:** distinguish `None` from numeric zero and test both start and
  end at zero boundaries.

### R58-14 · P1 — Piecewise subtitle sync can emit reversed, overlapping output

- **Source:** `apply_piecewise()` appends transformed pieces without a final
  chronological sort, overlap repair or cross-piece monotonicity check
  (`backend/transcribe.py:7742-7751`).
- **Deterministic reproduction:** spans `(0–10)` and `(10–20)` with offsets
  `+8` and `-8` produce `(8–18)` followed by `(2–12)`.
- **Impact:** `.synced.srt` can have reversed/overlapping cues at a piece
  boundary even though each piece is internally valid.
- **Why tests miss it:** existing piecewise tests check offset selection/no
  false split, not adversarial boundary output invariants.
- **Acceptance:** enforce global monotonic order and the repository timing-gap
  contract after applying pieces; property-test every output sequence.

### R58-15 · P1 — Keyboard routing lacks a consistent priority contract

- **Source:** player handler at `src/renderer/renderer.js:20628-20745`:
  Ctrl/Meta is used only for browser shortcuts and then unhandled combinations
  fall through to single-letter actions; Alt-only is not a general modifier
  guard. The early target return includes `button/a/summary`, so Escape cannot
  close layers while those controls retain focus. The main-screen Escape
  handler at `4369-4385` has no editable-target guard and can cancel a running
  job while the user is editing an input.
- **Impact:** native shortcuts can trigger player actions, Escape can fail to
  close the visible layer, or an innocent Escape in an input can cancel a long
  job.
- **Why tests miss it:** shortcut helpers are tested, but document-level event
  priority/focus/modifier interactions are not.
- **Acceptance:** define modal/layer → editable target → browser shortcut →
  player shortcut priority; add DOM keyboard tests for Ctrl+C, Alt+letter,
  focused button + Escape, and input + Escape during a job.

## Claims from report 54 that are not current definite bugs

- **CEA-708 `SERVICE<n>` mismatch (C1): stale/fixed.** Current
  `ceaStreamMatchesInstream()` maps `SERVICE1` to `cc708_1`; the real CEA test
  passes this case.
- **Manga stale-edit rollback: stale/fixed.** Report 56 repaired the isolated-
  world mismatch and report 57 strengthened its acceptance evidence.
- **Burn-in concurrent-start window: stale/fixed.** `burninStartPending` is set
  before the asynchronous probe and included in busy gates.
- **Queue persist/cancel TOCTOU (old Q2): stale/fixed.** Current
  `processNextQueueItem()` rechecks `queueRunning`, item status and current id
  immediately after `await persistQueueNow()`.
- **Stream signed-query instability as originally stated: not reproduced.**
  Current `normalizeStreamIdentityUrl()` strips volatile signed query values;
  `browser-foundation` proves refreshed tokens keep one identity and different
  paths do not.
- **Old faster-whisper `hotwords` crash: outside the supported install, not a
  current product defect.** Locks pin 1.2.1, requirements require >=1.1.0, and
  the installed-support test passes. The fallback comment may be misleading,
  but the supported environment is not broken.
- **DRM `mediaKeySystem` permission claim (D1): not promoted.** The local
  permission list does block unknown permission names, but this audit did not
  produce a real Electron/EME request proving Chromium emits that permission
  through these handlers for the claimed configuration. It remains a targeted
  manual/Electron investigation, not a definite fix request.
- **Remaining report-54 claims:** not automatically accepted. They need their
  own reachable reproduction against this exact commit; “agent confirmed” or
  source regex alone is insufficient.

## Verification performed

- `git fetch origin --prune`; local `master` and `origin/master` were both
  `0d9dcc771af1e23492c28f5d8fd1c2d4b938f8de` before this report.
- `node tests/browser-foundation.test.js` — 23 tests passed.
- `node tests/browser-cea-captions.test.js` — 13/13 passed; this also proves
  that green tests do not cover R58-04/05/06.
- `backend/venv/Scripts/python.exe backend/test_transcribe.py` — 185 passed,
  0 failed; the four additional synthetic probes above still reproduced
  R58-11/12/13/14.
- Syntax checks passed for `src/main.js`, `src/renderer/renderer.js` and
  `backend/transcribe.py`.
- No real profile, provider key, subtitle, catalog or external account data was
  read. No API request or live-site/DRM test was made.

## Handoff instruction

Fix these items independently in descending severity. For every item, first
turn the exact reproduction above into a failing regression test; then change
the smallest owning module, run the targeted test and the full project suite,
and record any item that needs real Electron/live-site evidence instead of
claiming it complete.
