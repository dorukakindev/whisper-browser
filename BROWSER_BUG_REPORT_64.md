# BROWSER BUG REPORT 64 — 20-agent coverage sweep (report only)

**Date:** 2026-09-18

**Repository:** `dorukakindev/whisper-browser`

**Branch / audited base:** `master` / `7a14b96` + uncommitted parallel work
(reports 62/63 fixes in flight)

**Mode:** report only — no product code was changed by this audit

## Method and caveats

20 read-only audit agents ran in two waves of 10 with disjoint scopes
(backend modules, translation machinery, output writers, tab/session/
capture/page/translation/subtitle/site/navigation/reader/download
subsystems). A third wave was cancelled per user instruction; the
`main.js` window/session-policy slice remains unaudited by this sweep.

**Concurrent-tree caveat:** a parallel agent is mid-refactor on this tree
(`src/browser-place-url.js`, `src/browser-sensitive-keys.js`,
`src/browser-translation-*.js`, `src/browser-manga.js`,
`src/browser-overlay-controller.js` and others carry uncommitted changes;
`BROWSER_BUG_REPORT_62.md`/`63.md` and `tests/report62-*`/`report63-*`
exist). Every P1/P2 finding below was re-verified against the **current**
tree by the orchestrator; items already fixed by the in-flight work are
listed separately at the end. Line numbers may drift ±a few lines.

**Decision rule** (same as report 58): reachable production path +
concrete source location + deterministic trigger or unavoidable
control-flow consequence + user-visible impact.

## Verification performed by orchestrator

Executed: `sentence_ended("I don't know... maybe he's right.")` → `False`
(confirms R64-08); `is_structural_sdh_cue('♪\n♪')` / `('(♪)')` → `False`
(R64-19); `parse_ass` on a tag-only Dialogue → `(1.0, 2.0, '')` (R64-09);
`parse_srt` interior blank line → `'Hello\n\nworld'` (R64-26);
`node tests/browser-foundation.test.js` → **RED** (R64-04);
`node tests/browser-place-url.test.js` → assertion failure (R64-05).
~25 further findings confirmed by direct source inspection of the cited
lines on the current tree.

---

## P1 — definite, high impact

### R64-01 · Updated yt-dlp never reaches the transcription pipeline

`src/main.js:16095` builds the transcribe env with
`buildSecretEnv(process.env, options)` only; `pythonEnvWithRuntime`
(injects `PYTHONPATH` → updated runtime, `ytdlp-runtime.js:36`) is used
solely for `media.py` (main.js:812) and the updater itself (main.js:16321).
The handler's own comment states the intent that updates affect
transcription. Clicking "yt-dlp'yi güncelle" succeeds, but
`download_youtube()` still imports the stale venv copy — the feature's
primary purpose silently fails. (Also previously listed in
`docs/devir/2026-09-16-1212.md`.)

### R64-02 · Command palette can never execute a command

`browserCommandContextMatches` (`src/browser-command-palette.js:24`)
compares `opened.tabId` with `current.tabId`, but the renderer passes the
raw tab record (`renderer.js:5692-5696`) which uses key `id` — never
`tabId`. Every Enter/click fails with "Sekme veya medya değişti; komut
yeniden seçilmeli." — dead UI on every invocation.

### R64-03 · `browser-place-url.js` throws at script load → `BrowserPlaceUrl` undefined → TypeError cascade

`src/browser-place-url.js:6` calls `require('./browser-sensitive-keys')`
inside `factory()`, which runs **before** the `module.exports` check. The
main window is sandboxed (`nodeIntegration:false, contextIsolation:true`)
→ `require` doesn't exist → the whole script fails at load
(`index.html:2761`), leaving `window.BrowserPlaceUrl` undefined. Every
`browserPlaceKey()` call then TypeErrors: places panel render
(`renderer.js:6533`), bookmark button updates (6580), workspace restore
(5181), navigation bookkeeping (9569), AI-context `sourceRef` (13947).

### R64-04 · `SENSITIVE_PARAM_RE = /./` strips every query param → media-identity collapse

`src/browser-place-url.js:32` exports the stub regex; consumers
`src/browser-media-identity.js:23,148` delete every param. Consequence:
`youtube.com/watch?v=A` loses `v` → falls to `web:url:` identity →
**every YouTube video shares one mediaId** → subtitle selections, watch
profiles, translations and sync records cross-apply to the wrong video;
`mediaChanged` stays false when switching videos.
`tests/browser-foundation.test.js` is currently **red** on this
(asserts `?lang=en` preserved). Mid-refactor state — but a live
regression in the current tree.

### R64-05 · Dark Reader CSS inserted at `cssOrigin:'user'` loses the cascade to author styles

`src/main.js:6421` — cascade order puts `author > user` for normal
declarations; Dark Reader's export preserves original importance and most
rules are non-`!important` (`darkreader.js:9282-9310`). Result: the
site's own light styles win on every styled element — only the dark
canvas/`color-scheme` apply → half-dark, broken-contrast pages. The
feature effectively doesn't work on real sites. Fix: `cssOrigin:'author'`.
(Contrast: `main.js:6453` YouTube CSS is all-`!important`, correctly
`'user'`.)

### R64-06 · Page translation re-ingests its own output as new "source" — original text lost + unbounded re-translation

`src/browser-page-translate.js:609,618-620,642-643,681-688` — when the
page replaces a text node after translation (`innerHTML`/`textContent`
rewrite, `normalize()`, editor sanitizers), the rescan's
`originalValues` miss on the new node → reads live `nodeValue` **= our
translation** → new block id → re-emitted → LLM re-translates
translated text; `ref.originals` now holds the translation so
"Orijinali göster"/restore can never recover the source. Each page
rewrite burns API units; repeats indefinitely on mutation-heavy pages
(only the 1500-block emission cap bounds it).

### R64-07 (conditional) · Cross-origin iframe `media`/`serial` permission check inherits the top-level site's grant

`src/main.js:10284-10286` — the check handler computes the origin from
`details.requestingUrl || wc.getURL()`, both of which describe the
**top-level page** for cross-origin subframe checks on unpatched builds
(Electron GHSA-9pf5-hg6p-4pwp). A stored `allow` on the embedder silently
grants camera/mic to embedded third-party origins. Defense-in-depth fix
regardless of build: use `details.securityOrigin`. Conditional on the
castlabs build's patch level — needs one runtime probe on a protected
host.

---

## P2 — definite defects (verified on current tree)

### Transcription pipeline (backend)

- **R64-08** · `sentence_ended` treats any mid-text `...`/`…` as
  continuation (`backend/sentence_translation.py:12-15`, unanchored
  alternatives; JS mirror `subtitle-sentence-layout.js:38` identical).
  Verified: `"I don't know... maybe he's right."` → `False`. Fuses
  complete sentences into one group and produces systematic
  `erken_cumle_sonu` rejections → blocks keep source text. Mid-text `…`
  is common (Whisper pauses, `fix_text_artifacts` output).
- **R64-09** · `parse_ass` keeps empty-text Dialogues
  (`transcribe.py:7462-7464`) — verified `(1.0,2.0,'')` survives →
  `serialize_srt_strict` raises → **entire sync/translate job dies** on
  one tag-only ASS line (ubiquitous in fansubs).
- **R64-10** · Malformed model `memory` field crashes the chunk —
  `filter_series_memory_candidates` (`transcribe.py:3195-3211`) only
  guards the outer dict; `"terms":[["a","b"]]` → `AttributeError`,
  `"characters":{...}` → `TypeError`. Propagates as `api_failure` → whole
  chunk marked failed, no small-package retry; persistent shape → entire
  translation returns `None`. (Found independently by 2 agents.)
- **R64-11** · Series-memory I/O unguarded — `SeriesMemory.for_input`
  (`transcribe.py:3255`) and `merge()` (`:3558`) can raise (lock timeout,
  `os.replace` PermissionError, corrupt rows) → propagates out of
  `llm_translate` → **total translation loss** from auxiliary metadata.
  TM `lookup`/`store` (`:3420,3907-3918`) equally unguarded — a
  `sqlite3.Error` after all API work succeeds discards the translation.
- **R64-12** · Route fallback defects in `call_api_with`
  (`transcribe.py:3464-3497`): (a) JSON-mode detection narrower than the
  codebase's own `json_mode_unsupported` helper → alternate error
  wordings make every route fail identically; (b) plain-mode retry
  exception escapes the route loop entirely; (c) any `401|403|quota`
  substring aborts all routes and classifies as fatal `authentication`
  (also false-positives on `1403`/`2401`).
- **R64-13** · `OutputTransaction.commit` failure after
  `state="committed"` deletes fully-written new outputs
  (`pipeline_control.py:275-296`): `_persist()`/`journal.unlink` raising
  `OSError` (Windows AV/OneDrive lock class) → `rollback()` unlinks every
  `existed=False` final → mixed-generation output set. The journal on
  disk already says `committed` — recovery semantics say keep finals;
  the code deletes them.
- **R64-14** · `existsSync` pre-flight rejects PATH-resolved tools —
  `browser-media-tools.js:54,74`, `browser-video-analysis.js:34` throw
  "bulunamadı" when `resolveFfTool`/`resolvePython` return a bare command
  name (the documented PATH fallback, `main.js:15066-15069,15711-15733`).
  `scenes`/`ocr-range`/`intro-detect`/`semantic-search` hard-block in a
  configuration the app explicitly supports elsewhere.
- **R64-15** · Orphaned `workspace-videos/<uuid>` extractions never
  deleted — every successful package apply leaves the previous
  extraction (up to 100 GB cap) permanently dead on disk
  (`workspace-video-package.js:58,66-68`; `clean()` only on failure
  paths; no sweep exists). Unbounded silent disk growth.
- **R64-16** · `before-quit` cancel skips `lifecycle.requestCancel()`
  (`main.js:~11812`) → an interrupted job can persist as `error` instead
  of `cancelled` (macOS Cmd+Q path).

### Browser tab/session/capture

- **R64-17** · Second-instance launch rewrites `browser-session.json`
  with `tabs:[]` — `before-quit` persist (`main.js:11817`) is ungated by
  `hasSingleInstanceLock`; the lock-loser writes `{tabs:[],cleanExit:true}`,
  and a valid-but-empty file suppresses `.bak` fallback → silent total
  session loss if the primary dies before its next save.
- **R64-18** · Tab close probe manufactures spurious "protected tab"
  confirmation for hibernated/viewless tabs (`main.js:12019` probe →
  `stateKnown:false` for `!tab.view` → `unknown_state` reason) — every
  close of a restored/hibernated tab shows a reasonless warning;
  additionally the probe is blind to iframe/shadow-DOM media and
  **overwrites** the correct event-derived `mediaPlaying` flag → real
  media-protection silently absent for embedded players. Sticky
  `stateKnown:false` also permanently blocks `browser:tab:unload` after
  one transient probe failure.
- **R64-19** · DASH capture: `presentationTimeOffset` dropped for
  unbounded `$Time$` templates (`browser-subtitles.js:1017`) — live MPDs
  shift every cue forward by `pto/timescale` (minutes/hours on
  epoch-aligned streams) → subtitles never display.
- **R64-20** · Capture dedupe key ignores the URL
  (`browser-network-capture.js:111-119`) — byte-identical bodies at
  different timeline positions (repeated `♪`/held-line segments,
  seek-back refetches) are silently dropped → unrecoverable subtitle
  gaps; in-flight second response inherits the first segment's offset.
- **R64-21** · `manifestRefreshRequested` recursion unbounded
  (`main.js:8708-8723`) — persistent segment-403 + changing live
  fingerprint → manifest+segment request storm for the page's lifetime;
  defeats `maxAttempts=3`/cooldown.
- **R64-22** · `will-navigate` bumps `navigationRequestSeq` and suspends
  instrumentation **before** the policy veto (`main.js:10473-10479`) —
  a denied navigation (mailto/data:/file:) still invalidates in-flight
  `browser:navigate` (→ "Daha yeni gezinme isteği var") and tears down
  Cloudflare/capture state while the page never navigates.
- **R64-23** · LRU subtitle store deletes user-selected files and
  phantoms amplify it (`browser-subtitle-files.js:12-52` +
  `main.js:7166-7171,3876`): UUID-named downloads/encoding-fix outputs
  are evictable; `activePaths` only covers publications, not
  `subtitleSelection` — >64 owned files → next publish deletes the file
  the user selected → permanent "Altyazı dosyası bulunamadı". Phantom
  index entries (files deleted outside the store) additionally skip
  `index.delete` → the LRU wipes **every** unprotected file per publish.
- **R64-24** · OpenSubtitles downloads reject valid non-UTF-8 files —
  `TextDecoder('utf-8',{fatal:true})` (`browser-subtitle-search.js:191`)
  throws on cp1254/cp1252 payloads (a large normal fraction of the
  corpus) → cryptic error + quota consumed; canonical
  `decodeSubtitleBuffer` exists but isn't used here.
- **R64-25** · "Oynatıcıda aç" on a browser download grants no media
  access (`browser-downloads.js:118-123` returns path without
  `mediaFileAccess.grant`) → sibling-subtitle attach, embedded-track
  probe and folder playlist all silently dead for downloaded videos.
- **R64-26** · `parse_srt` preserves interior `\n\n` → strict writer
  crash on sync (`transcribe.py:7428` → `'Hello\n\nworld'` verified);
  non-positive durations (`5.0→2.0`) pass through parsers → SRT crashes
  the job / VTT+ASS emit spec-invalid cues / JSON clamps → reexport
  drops the cue.
- **R64-27** · `browser:page:toggle` never updates `session.view` —
  hidden translations reappear on the next apply batch while progress
  events still report `visible:true` (`main.js:13422-13426,4553,4953`);
  mid-scan navigation lacks the generation re-check the preview path has
  (`main.js:5114-5146` vs 13395) → wrong-page translation + ghost busy
  job; same-normalized-text node replacement leaves zombie refs
  (`browser-page-translate.js:643,551-573,918-931`).
- **R64-28** · Reader mode always extracts `document.body` — candidate
  heuristic is dead code (`browser-reader.js:50-65`: `roots[0]` is
  always body, `native` gate unreachable) → nav/footer/ads flattened
  into "the article"; `copy()` additionally drops `<br>` (text
  concatenates), unwraps tables/math/sub-sup, loses media/lazy images,
  and shows hidden (`display:none`) text (`:69-86`).
- **R64-29** · YouTube appearance CSS and per-site dark CSS leak into
  subsequent navigations (`browser-youtube-style.js` generic `!important`
  selectors; keys only removed on the next renderer call —
  `main.js:6442-6457`, no cleanup in `did-start-navigation`) → wrong
  site renders forced-dark/Roboto/hidden elements until (and unless)
  renderer removes the key.
- **R64-30** · `cleanQuery` no longer strips tracking params
  (`browser-place-url.js:7-10` uses `isSensitiveKey` only;
  `TRACKING_PARAM_RE` unused there) → `?utm_*`/`fbclid` create duplicate
  history/bookmark entries and persist tracker params to disk.
- **R64-31** · Dark Reader export races a fixed 80 ms wait
  (`browser-dark-mode.js:16`) — cross-origin/still-loading stylesheets
  aren't fully processed → exported CSS missing rules → partial theme
  (compounds R64-05).
- **R64-32** · O(cues × ~600) hash recomputation per call —
  `browserTrackSourceIdentity` rebuilds all prefix-hash tables on every
  call with no cache (`renderer.js:8357,9173-9191`); invoked per-cue on
  load/edit/export, per pointermove during timeline drags, per
  timeupdate tick → multi-second stalls on 5k+ cue tracks.
- **R64-33** · `display-capture` is grantable but no
  `setDisplayMediaRequestHandler` exists on `persist:whisper-browser`
  (`browser-site-permissions.js:3`; only `defaultSession` has one,
  `main.js:6961-6977`) → grants can never be honored; user decides a
  capability the app structurally can't provide.

## P3 — confirmed, lower severity (condensed)

- **Updater:** corrupt same-name package dir wedges the updater for that
  version; wheel `filename` regex permits traversal within transaction
  dir; stale-lock pid-reuse/unreadable-lock races; mid-run media job's
  import root can be pruned after 2 updates.
- **Backend:** graceful cancel dumps `PipelineCancelled` traceback as
  error lines; benchmark emits second `ok:false` line if tempdir cleanup
  throws (main.js reads last line); force-kill leaves `.part` debris in
  user media folder; `reexport_from_json`/`sync_subtitles` bypass
  `OutputTransaction`+checkpoints; orphan-journal sweep covers only
  current output dirs; Windows reserved device names (`NUL`/`AUX`)
  pass through `base_name` → commit-time failure; `.en.srt` stem →
  `.tr.srt` dotfile outputs; translate-only writes SDH-stripped text for
  failed blocks; cancel still fires every queued chunk's first HTTP
  request; deterministic 4xx retried across all routes; worker-thread
  `print` interleaves NDJSON (2 agents found this independently).
- **Anki:** spawn lacks `PYTHONIOENCODING` → Turkish errors render as
  mojibake; quotes without translation+note silently skipped (web
  selections can never export); 5000-cap applied before the quote
  filter; `dueOnly` silently injected from reviews view; identical
  `source` texts collide on Anki first-field dedupe.
- **SDH:** pure-decoration cues split by `\n`/`\t` or bracketed
  (`(♪)`, `(...)`) escape the structural gate — verified — and can
  merge into real dialogue via `merge_short_entries`.
- **Catalog/package:** `SxxE00`-style episode (number 0) poisons the
  whole catalog item; `before-restore-<ts>.wbp` backups accumulate
  forever; bzip2/LZMA members expand unboundedly per 1 MB read on
  current CPython; lone-surrogate filename crashes the whole folder
  scan; nMDB 10 001–20 000 work band fails wholesale.
- **Tabs/session:** runtime probe resurrects a view on a hibernated
  neighbor when closing a background tab; closed-tab history drops
  group/keepAwake/compatMode/mangaPosition/recoveryJobs (still absent —
  verified); `browser:session:import` can interleave with the close
  sequence; reset destroys tabs before its abortable step; snapshot
  prefers unsanitized `wc.getURL()` → non-http URLs silently drop tabs.
- **Downloads/acquisition:** acquisition plan can never reach
  `capture_failed` in production (`manual-track` never started,
  `persisted-track` waits forever, non-`parsed` outcomes leave stages
  running) — "Sırada/Aranıyor" forever; persisted-track winner latch
  freezes discovery and misreports provenance; interrupted downloads
  occupy `maxActive` slots permanently; >20k-cue persisted tracks lose
  their first cues.
- **Translation JS:** integrity false "output-gap" after cue-merge
  distribution; archive canonicalization strips generic `?key=` →
  cross-page collisions/record deletion on `?key=`-keyed sites;
  `cancelAll` emits state while still "current" at 3 call sites;
  persistence failure retries every `emitState`; retry-pending counted
  as provider-failure.
- **Site-scoped:** "clear site data"/session reset preserve stored
  permission grants/profiles/terminology (confirm intent).
- **Subtitle output:** ASS export `\{⁠` escaping loses brace content in
  real players (fullwidth intended); configured-folder filename
  collision for same-language re-translations (provider/model not in
  name); phantom "site changed" conflict after sub-ms timing edits.
- **Page features:** preview scans translated text → wrong cost report;
  shared `refs` between context/index → reveal targets wrong element;
  overlay appended inside interactive elements; unbounded full-DOM
  rescans after emission budget spent; index capture lacks the
  `withTimeout` guard; leaked scroll/visibility listeners per reset;
  edit `pre !== current` silently drops user corrections.
- **DRM/permissions:** `mediaKeySystem`/`openExternal` not in the
  supported list → hard-blocked **if** Chromium dispatches them to the
  JS handlers on this build — needs a one-line runtime probe on a
  protected host to settle (conditional P2).
- **Subtitle misc:** sub-ms ASS `.ttc` font attachments filtered out;
  reader `<style>` subject to page CSP on strict sites.

## Corroboration and already-fixed overlap

- Found **independently by 2 agents**: malformed `memory` field crash
  (R64-10); worker-thread `print` interleaving NDJSON.
- **Already fixed by the parallel agent's in-flight work** (verified in
  the current diff, listed so nobody re-reports): manga IPv6 blocklist
  (R63-01 — Teredo/6to4/NAT64/ULA etc. now rejected);
  overlay-controller 128-observer cap → LRU eviction; translation-cache
  flush race (R62). Several other `browser-translation-*` files carry
  uncommitted edits — P3 items there may be partially addressed.
- Explicitly **not** reproduced / not promoted: `plan.next()` dead code;
  `pageMemory`/`persistTranslation` stubs (inert); `io_errors.py` dead
  module; `provenance.epoch`/`cueCount` stale fields (diagnostics only).

## Limits

- Read-only agents could not execute; all triggers are static traces.
  The orchestrator executed the quick probes listed above; DOM/Electron-
  level findings (R64-02/03/05/06/07/28/29) are code-verified but not
  runtime-reproduced — each names the deterministic trigger.
- Conditional items (R64-07, mediaKeySystem) need a real Electron build
  probe; report 63's `_repro/` harness is the natural place.
- The suite is currently red on `browser-foundation.test.js` /
  `browser-place-url.test.js` due to the in-flight refactor (R64-04/30) —
  this is a work-in-progress state, not a shipped regression, but it is
  live in the current tree.
- One audit scope (`main.js` window/session policy slice) was cancelled
  per user instruction — wave 3 did not run.
